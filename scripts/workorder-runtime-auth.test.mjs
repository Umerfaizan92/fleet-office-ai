import {spawn} from 'node:child_process';
import {createHash,randomBytes,randomUUID} from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';

const tempRoot=fs.mkdtempSync(path.join(os.tmpdir(),'superpro-workorder-auth-'));
const port=34000+Math.floor(Math.random()*8000);
const base='http://127.0.0.1:'+port;
const dbPath=path.join(tempRoot,'permissions.sqlite');
const child=spawn(process.execPath,['src/server.js'],{
  cwd:process.cwd(),
  env:{...process.env,PORT:String(port),NODE_ENV:'test',PUBLIC_BASE_URL:base,
    ALLOWED_ORIGINS:base,DATABASE_PATH:dbPath,UPLOAD_DIR:path.join(tempRoot,'uploads'),
    SAAS_VERIFICATION_TEST_MODE:'0'},
  stdio:['ignore','pipe','pipe']
});
let output='';
child.stdout.on('data',b=>{output+=b.toString()});
child.stderr.on('data',b=>{output+=b.toString()});
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function waitForHealth(){
  for(let i=0;i<60;i++){
    if(child.exitCode!==null)throw Error('Server exited before test: '+output.slice(-3000));
    try{const r=await fetch(base+'/healthz');if(r.status===200)return}catch{}
    await delay(200);
  }
  throw Error('Server did not become healthy: '+output.slice(-3000));
}
let db=null;
try{
  await waitForHealth();
  db=new Database(dbPath);
  const now=new Date().toISOString(), expires=new Date(Date.now()+3600000).toISOString();
  const a=randomUUID(),b=randomUUID();
  const org=db.prepare('INSERT INTO organisations (id,name,slug,created_at,updated_at) VALUES (?,?,?,?,?)');
  org.run(a,'RBAC Test A','rbac-test-a-'+a,now,now);
  org.run(b,'RBAC Test B','rbac-test-b-'+b,now,now);
  const insertUser=db.prepare('INSERT INTO users (id,email,full_name,password_hash,password_salt,created_at,updated_at) VALUES (?,?,?,?,?,?,?)');
  const insertMembership=db.prepare('INSERT INTO memberships (organisation_id,user_id,role,created_at) VALUES (?,?,?,?)');
  const insertSession=db.prepare('INSERT INTO user_sessions (id,user_id,token_hash,expires_at,created_at,last_seen_at) VALUES (?,?,?,?,?,?)');
  const cookies={}; const userIds={};
  for(const role of ['worker','director','manager','owner','admin','super_admin','other_owner']){
    const userId=randomUUID(), tenant=role==='other_owner'?b:a, memberRole=role==='other_owner'?'owner':role;
    const token=randomBytes(24).toString('hex');
    insertUser.run(userId,role+'-'+userId+'@example.test',role,'not-used','not-used',now,now);
    insertMembership.run(tenant,userId,memberRole,now);
    insertSession.run(randomUUID(),userId,createHash('sha256').update(token).digest('hex'),expires,now,now);
    cookies[role]='fp_session='+token;userIds[role]=userId;
  }
  const workerId=randomUUID();
  db.prepare('INSERT INTO workers (id,organisation_id,user_id,full_name,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?)')
    .run(workerId,a,userIds.worker,'Assigned Worker','active',now,now);
  const workOrder=db.prepare('INSERT INTO work_orders (id,organisation_id,title,start_at,created_at,updated_at) VALUES (?,?,?,?,?,?)');
  const assigned=randomUUID(), hidden=randomUUID(), otherTenant=randomUUID();
  workOrder.run(assigned,a,'Assigned order','2026-11-01T08:00:00+08:00',now,now);
  workOrder.run(hidden,a,'Unassigned order','2026-11-02T08:00:00+08:00',now,now);
  workOrder.run(otherTenant,b,'Other tenant order','2026-11-03T08:00:00+08:00',now,now);
  const ownOffer=randomUUID();
  db.prepare('INSERT INTO job_offers (id,organisation_id,work_order_id,worker_id,offered_at) VALUES (?,?,?,?,?)')
    .run(ownOffer,a,assigned,workerId,now);

  async function request(route,role=null,method='GET',body=undefined){
    const headers={};
    if(role)headers.Cookie=cookies[role];
    if(body!==undefined)headers['Content-Type']='application/json';
    const response=await fetch(base+route,{method,headers,body:body===undefined?undefined:JSON.stringify(body)});
    const result=await response.json().catch(()=>null);
    return {status:response.status,body:result};
  }
  async function check(route,role,method,body,status){
    const response=await request(route,role,method,body);
    assert.equal(response.status,status,method+' '+route+' ('+role+'): '+JSON.stringify(response.body));
    return response.body;
  }
  const payload={title:'New work order',start_at:'2026-11-04T08:00:00+08:00',required_workers:1,required_level:1,required_skills:[]};
  await check('/api/saas/work-orders',null,'POST',payload,401);
  await check('/api/saas/finance',null,'GET',undefined,401);
  for(const role of ['worker','director']){
    await check('/api/saas/work-orders',role,'POST',payload,403);
    await check('/api/saas/work-orders/'+assigned+'/offer',role,'POST',{},403);
  }
  for(const role of ['owner','admin','manager','super_admin']){
    await check('/api/saas/work-orders',role,'POST',payload,201);
    await check('/api/saas/work-orders/'+hidden+'/offer',role,'POST',{},200);
  }
  for(const role of ['worker','director','manager']){
    await check('/api/saas/finance',role,'GET',undefined,403);
    await check('/api/saas/finance',role,'POST',
      {entry_type:'expense',category:'Test',amount:2,occurred_on:'2026-10-24'},403);
  }
  for(const role of ['owner','admin','super_admin']){
    await check('/api/saas/finance',role,'GET',undefined,200);
    await check('/api/saas/finance',role,'POST',
      {entry_type:'expense',category:'Test',amount:2,occurred_on:'2026-10-24'},201);
  }
  const own=await check('/api/saas/work-orders','worker','GET',undefined,200);
  assert.deepEqual(own.jobs.map(x=>x.id),[assigned],'workers must only see explicitly offered orders');
  const manager=await check('/api/saas/work-orders','manager','GET',undefined,200);
  assert.ok(manager.jobs.some(x=>x.id===hidden),'managers may view their workspace orders');
  assert.ok(manager.jobs.every(x=>x.organisation_id===a),'manager cannot see another workspace');
  await check('/api/saas/job-offers/'+ownOffer+'/respond','manager','POST',{status:'accepted'},404);
  await check('/api/saas/job-offers/'+ownOffer+'/respond','other_owner','POST',{status:'accepted'},404);
  await check('/api/saas/job-offers/'+ownOffer+'/respond','worker','POST',{status:'accepted'},200);
  await check('/api/saas/job-offers/'+ownOffer+'/respond','worker','POST',{status:'declined'},409);
  await check('/api/saas/work-orders/'+assigned+'/offer','other_owner','POST',{},404);
  await check('/api/saas/finance','other_owner','POST',
    {entry_type:'revenue',category:'Cross tenant',amount:2,occurred_on:'2026-10-24',work_order_id:assigned},400);
  const other=await check('/api/saas/work-orders','other_owner','GET',undefined,200);
  assert.ok(other.jobs.every(x=>x.organisation_id===b),'other workspace must be isolated');
  console.log('WORK ORDER RUNTIME RBAC PASSED: 7 roles, tenant isolation, assigned visibility, offer ownership, finance restrictions.');
}catch(e){
  console.error('WORK ORDER RUNTIME RBAC FAILED:',e?.stack||e);
  if(output)console.error('--- Server output ---\\n'+output.slice(-9000));
  process.exitCode=1;
}finally{
  if(db)db.close();
  if(child.exitCode===null)child.kill('SIGTERM');
  await Promise.race([new Promise(resolve=>child.once('exit',resolve)),delay(1500)]).catch(()=>{});
  if(child.exitCode===null)child.kill('SIGKILL');
  fs.rmSync(tempRoot,{recursive:true,force:true});
}
