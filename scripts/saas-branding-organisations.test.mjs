import {spawn} from 'node:child_process';
import {createHash, randomBytes, randomUUID} from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';

const root=fs.mkdtempSync(path.join(os.tmpdir(),'superpro-brand-org-'));
const port=35000+Math.floor(Math.random()*9000);
const base='http://127.0.0.1:'+port;
const dbPath=path.join(root,'test.sqlite');
const child=spawn(process.execPath,['src/server.js'],{
  cwd:process.cwd(),
  env:{...process.env,PORT:String(port),NODE_ENV:'test',PUBLIC_BASE_URL:base,
    ALLOWED_ORIGINS:base,DATABASE_PATH:dbPath,UPLOAD_DIR:path.join(root,'uploads'),
    SAAS_VERIFICATION_TEST_MODE:'0'},
  stdio:['ignore','pipe','pipe']
});
let output='';
child.stdout.on('data',part=>output+=part.toString());
child.stderr.on('data',part=>output+=part.toString());
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function health(){
  for(let i=0;i<60;i++){
    if(child.exitCode!==null)throw Error('Server exited: '+output.slice(-3000));
    try{const response=await fetch(base+'/healthz');if(response.status===200)return}catch{}
    await sleep(250);
  }
  throw Error('Server did not become ready: '+output.slice(-3000));
}
let db=null;
try{
  await health();
  db=new Database(dbPath);
  const now=new Date().toISOString(),expires=new Date(Date.now()+3600000).toISOString();
  const orgA=randomUUID(),orgB=randomUUID(),orgC=randomUUID();
  const membershipUser=randomUUID(),outsideUser=randomUUID();
  const insertOrg=db.prepare('INSERT INTO organisations (id,name,slug,created_at,updated_at) VALUES (?,?,?,?,?)');
  insertOrg.run(orgA,'Alpha Business','alpha-'+orgA,now,now);
  insertOrg.run(orgB,'Beta Business','beta-'+orgB,now,now);
  insertOrg.run(orgC,'Private Third Business','private-'+orgC,now,now);
  db.prepare('UPDATE organisations SET display_name=?,brand_logo_url=?,brand_theme=? WHERE id=?')
    .run('Alpha Brand','/uploads/alpha-logo.png','dark',orgA);
  db.prepare('UPDATE organisations SET display_name=?,brand_logo_url=?,brand_theme=? WHERE id=?')
    .run('Beta Brand','/uploads/beta-logo.png','light',orgB);
  db.prepare('INSERT INTO onboarding_profiles (organisation_id,brand_voice,updated_at) VALUES (?,?,?)')
    .run(orgA,'warm',now);
  const addUser=db.prepare('INSERT INTO users (id,email,full_name,password_hash,password_salt,created_at,updated_at) VALUES (?,?,?,?,?,?,?)');
  addUser.run(membershipUser,'member-'+membershipUser+'@example.test','Membership Tester','hash','salt',now,now);
  addUser.run(outsideUser,'outside-'+outsideUser+'@example.test','Outside Tester','hash','salt',now,now);
  const addMembership=db.prepare('INSERT INTO memberships (organisation_id,user_id,role,created_at) VALUES (?,?,?,?)');
  addMembership.run(orgA,membershipUser,'owner',now);
  // The first membership is the default workspace; a later membership tests switching.
  addMembership.run(orgB,membershipUser,'worker',new Date(Date.parse(now)+1000).toISOString());
  addMembership.run(orgC,outsideUser,'owner',now);
  function session(userId){
    const token=randomBytes(24).toString('hex');
    db.prepare('INSERT INTO user_sessions (id,user_id,token_hash,expires_at,created_at,last_seen_at) VALUES (?,?,?,?,?,?)')
      .run(randomUUID(),userId,createHash('sha256').update(token).digest('hex'),expires,now,now);
    return 'fp_session='+token;
  }
  const memberCookie=session(membershipUser),outsideCookie=session(outsideUser);
  async function api(route,{cookie,org}={}){
    const headers={};
    if(cookie)headers.Cookie=cookie;
    if(org)headers['X-Organisation-Id']=org;
    const response=await fetch(base+route,{headers});
    return {status:response.status,body:await response.json().catch(()=>null)};
  }
  let response=await api('/api/saas/branding');
  assert.equal(response.status,200);
  assert.equal(response.body?.branding?.display_name,'Super Pro AI Office Manager');
  assert.equal(response.body?.branding?.theme,'system');
  response=await api('/api/saas/branding?organisation_id='+orgC);
  assert.equal(response.status,200);
  assert.equal(response.body?.branding?.brand_name,'Super Pro AI Office Manager','public query cannot reveal tenant brand');
  response=await api('/api/saas/my-organisations');
  assert.equal(response.status,401);
  response=await api('/api/saas/my-organisations',{cookie:memberCookie});
  assert.equal(response.status,200);
  assert.equal(response.body?.organisations?.length,2);
  assert.ok(response.body.organisations.every(o=>o.id===o.organisation_id));
  assert.ok(response.body.organisations.some(o=>o.organisation_id===orgA&&o.role==='owner'));
  assert.ok(response.body.organisations.some(o=>o.organisation_id===orgB&&o.role==='worker'));
  assert.ok(response.body.organisations.every(o=>o.organisation_id!==orgC));
  assert.equal(response.body.active_organisation_id,orgA);
  response=await api('/api/saas/branding',{cookie:memberCookie});
  assert.equal(response.status,200);
  assert.equal(response.body.branding.display_name,'Alpha Brand');
  assert.equal(response.body.branding.logo_url,'/uploads/alpha-logo.png');
  assert.equal(response.body.branding.theme,'dark');
  assert.equal(response.body.branding.brand_voice,'warm');
  response=await api('/api/saas/branding',{cookie:memberCookie,org:orgB});
  assert.equal(response.status,200);
  assert.equal(response.body.branding.display_name,'Beta Brand');
  assert.equal(response.body.branding.theme,'light');
  response=await api('/api/saas/branding?organisation_id='+orgB,{cookie:memberCookie});
  assert.equal(response.status,200);
  assert.equal(response.body.branding.display_name,'Beta Brand');
  response=await api('/api/saas/my-organisations',{cookie:memberCookie,org:orgB});
  assert.equal(response.status,200);
  assert.equal(response.body.active_organisation_id,orgB);
  response=await api('/api/saas/me',{cookie:memberCookie,org:orgB});
  assert.equal(response.status,200);
  assert.equal(response.body.organisation.id,orgB,'switcher must resolve selected membership');
  assert.equal(response.body.user.role,'worker','role must switch with membership');
  response=await api('/api/saas/my-organisations',{cookie:memberCookie,org:orgC});
  assert.equal(response.status,403,'cross-tenant header must be denied');
  response=await api('/api/saas/branding',{cookie:memberCookie,org:orgC});
  assert.equal(response.status,403,'cross-tenant branding must be denied');
  response=await api('/api/saas/branding?organisation_id='+orgC,{cookie:memberCookie});
  assert.equal(response.status,403,'cross-tenant query must be denied');
  response=await api('/api/saas/branding',{cookie:outsideCookie,org:orgA});
  assert.equal(response.status,403);
  console.log('SAAS BRANDING/ORGANISATION RUNTIME TEST PASSED: public defaults, member-only tenant branding, multi-membership switching, role binding, cross-tenant rejection.');
}catch(error){
  console.error('SAAS BRANDING/ORGANISATION RUNTIME TEST FAILED',error?.stack||error);
  if(output)console.error('--- Server output ---\\n'+output.slice(-9000));
  process.exitCode=1;
}finally{
  if(db)db.close();
  if(child.exitCode===null)child.kill('SIGTERM');
  await Promise.race([new Promise(resolve=>child.once('exit',resolve)),sleep(1500)]).catch(()=>{});
  if(child.exitCode===null)child.kill('SIGKILL');
  try{fs.rmSync(root,{recursive:true,force:true,maxRetries:10,retryDelay:200})}catch{/* Windows may still hold a file for a moment; leftover temp files are harmless */};
}
