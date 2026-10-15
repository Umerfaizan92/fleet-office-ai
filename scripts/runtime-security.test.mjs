import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtempSync,rmSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import vm from 'node:vm';
import test from 'node:test';
import {createDb} from '../src/db.js';

test('theme initialization runs with multiple controls and no icon',()=>{
 const source=readFileSync(new URL('../saas/app.js',import.meta.url),'utf8');
 const section=source.slice(source.indexOf('function setTheme('),source.indexOf('function closeSidebar('));
 for(const hasIcons of [true,false]){
  const controls=[{addEventListener(){}},{addEventListener(){}}];
  const icons=hasIcons?[{setAttribute(){}},{setAttribute(){}}]:[];
  const context={document:{documentElement:{dataset:{}}},localStorage:{getItem(){return null},setItem(){}},window:{matchMedia(){return {matches:false,addEventListener(){}}}},$(){return null},$$(s){return s.includes('use')?icons:controls}};
  vm.runInNewContext(section,context);
  assert.equal(context.document.documentElement.dataset.theme,'dark');
 }
});

test('runtime tenant boundaries and atomic offer allocation',async()=>{
 const root=mkdtempSync(path.join(tmpdir(),'superpro-security-'));
 const database=path.join(root,'test.sqlite');
 const db=createDb(database);
 const now=new Date().toISOString(),later=new Date(Date.now()+3600000).toISOString();
 const orgA=crypto.randomUUID(),orgB=crypto.randomUUID();
 for(const id of [orgA,orgB])db.prepare('INSERT INTO organisations (id,name,slug,created_at,updated_at) VALUES (?,?,?,?,?)').run(id,id,id,now,now);
 function user(role,org,email){
  const id=crypto.randomUUID(),token=crypto.randomUUID();
  db.prepare('INSERT INTO users (id,email,full_name,password_hash,password_salt,created_at,updated_at) VALUES (?,?,?,?,?,?,?)').run(id,email,role,'unused','unused',now,now);
  db.prepare('INSERT INTO memberships VALUES (?,?,?,?)').run(org,id,role,now);
  db.prepare('INSERT INTO user_sessions (id,user_id,token_hash,expires_at,created_at,last_seen_at) VALUES (?,?,?,?,?,?)').run(crypto.randomUUID(),id,crypto.createHash('sha256').update(token).digest('hex'),later,now,now);
  return {id,token,org,email};
 }
 const owner=user('owner',orgA,'owner@example.invalid'),employee=user('employee',orgA,'staff@example.invalid'),outsider=user('owner',orgB,'outside@example.invalid');
 const job=crypto.randomUUID();
 db.prepare('INSERT INTO work_orders (id,organisation_id,title,start_at,required_workers,created_at,updated_at) VALUES (?,?,?,?,1,?,?)').run(job,orgA,'Test',now,now,now);
 function offer(userId,email){
  const worker=crypto.randomUUID(),id=crypto.randomUUID();
  db.prepare("INSERT INTO workers (id,organisation_id,user_id,full_name,email,status,created_at,updated_at) VALUES (?,?,?,?,?,'active',?,?)").run(worker,orgA,userId,'Test worker',email,now,now);
  db.prepare('INSERT INTO job_offers (id,organisation_id,work_order_id,worker_id,offered_at) VALUES (?,?,?,?,?)').run(id,orgA,job,worker,now);
  return id;
 }
 const own=offer(employee.id,employee.email),sameEmail=offer(null,employee.email),extra=offer(null,'extra@example.invalid');
 const port=13200+Math.floor(Math.random()*1000),base=`http://127.0.0.1:${port}`;
 const child=spawn(process.execPath,['src/server.js'],{env:{...process.env,NODE_ENV:'test',PORT:String(port),DATABASE_PATH:database,UPLOAD_DIR:path.join(root,'uploads'),PUBLIC_BASE_URL:base,ALLOWED_ORIGINS:base},stdio:['ignore','pipe','pipe']});
 let logs='';child.stdout.on('data',b=>logs+=b);child.stderr.on('data',b=>logs+=b);
 const pause=ms=>new Promise(r=>setTimeout(r,ms));
 async function request(actor,route,method='GET',body,org=actor.org){return fetch(base+route,{method,headers:{cookie:`fp_session=${actor.token}`,'X-Organisation-Id':org,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});}
 try{
  let ready=false;
  for(let i=0;i<80;i++){try{if((await fetch(base+'/healthz')).ok){ready=true;break;}}catch{}await pause(100);}
  assert.ok(ready,logs);
  assert.equal((await request(owner,'/api/saas/work-orders')).status,200);
  const foreign=await request(outsider,'/api/saas/work-orders');assert.equal(foreign.status,200);assert.deepEqual((await foreign.json()).jobs,[]);
  assert.ok([401,403,404].includes((await request(outsider,'/api/saas/work-orders','GET',undefined,orgA)).status));
  assert.equal((await request(employee,'/api/saas/work-orders','POST',{})).status,403);
  const respond=(actor,id)=>request(actor,`/api/saas/job-offers/${id}/respond`,'POST',{status:'accepted'});
  assert.equal((await respond(employee,sameEmail)).status,403,'matching email is not identity');
  assert.equal((await respond(outsider,own)).status,404);
  const results=await Promise.all([respond(employee,own),respond(owner,extra)]);
  assert.deepEqual(results.map(r=>r.status).sort(),[200,409]);
  assert.equal(db.prepare("SELECT count(*) n FROM job_offers WHERE work_order_id=? AND status='accepted'").get(job).n,1);
  const accepted=db.prepare("SELECT id FROM job_offers WHERE work_order_id=? AND status='accepted'").get(job);
  assert.equal((await respond(owner,accepted.id)).status,409,'replay cannot allocate twice');
 }finally{
  child.kill();await new Promise(resolve=>child.once('exit',resolve));db.close();rmSync(root,{recursive:true,force:true});
 }
});
