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
  db.prepare('INSERT INTO memberships VALUES (?,?,?,?)').run(orgB,owner.id,'employee',now);
  const switched=await request(owner,'/api/saas/me','GET',undefined,orgB);const identity=await switched.json();
  assert.equal(identity.organisation.id,orgB);assert.equal(identity.user.role,'employee');assert.equal(identity.user.id,owner.id);
  assert.equal((await request(owner,'/api/saas/finance','GET',undefined,orgB)).status,403,'owner privilege must not follow user into employee membership');
  const settings={business_type:'Test services',services:[],approval_mode:'everything'};
  assert.equal((await request(employee,'/api/saas/onboarding','PUT',settings)).status,403,'employees cannot change workspace approval policy');
  assert.equal((await request(owner,'/api/saas/onboarding','PUT',settings)).status,200,'owners retain settings access');
  assert.equal((await request(owner,'/api/saas/onboarding','PUT',{...settings,website:'Https:\\broken.example'})).status,400,'malformed website is rejected');
  const respond=(actor,id)=>request(actor,`/api/saas/job-offers/${id}/respond`,'POST',{status:'accepted'});
  assert.equal((await respond(employee,sameEmail)).status,403,'matching email is not identity');
  assert.equal((await respond(outsider,own)).status,404);
  const results=await Promise.all([respond(employee,own),respond(owner,extra)]);
  assert.deepEqual(results.map(r=>r.status).sort(),[200,409]);
  assert.equal(db.prepare("SELECT count(*) n FROM job_offers WHERE work_order_id=? AND status='accepted'").get(job).n,1);
  const accepted=db.prepare("SELECT id FROM job_offers WHERE work_order_id=? AND status='accepted'").get(job);
  assert.equal((await respond(owner,accepted.id)).status,409,'replay cannot allocate twice');
  const employeeWorker=db.prepare('SELECT worker_id FROM job_offers WHERE id=?').get(own).worker_id;
  const otherWorker=db.prepare('SELECT worker_id FROM job_offers WHERE id=?').get(sameEmail).worker_id;
  const directory=await (await request(employee,'/api/saas/workers')).json();
  assert.deepEqual(directory.workers.map(w=>w.id),[employeeWorker],'worker identity, not shared email, controls access');
  assert.equal((await (await request(owner,'/api/saas/workers')).json()).workers.length,3);
  for(const resource of ['compliance','skills','documents']){
   assert.equal((await request(employee,`/api/saas/workers/${employeeWorker}/${resource}`)).status,200);
   assert.equal((await request(employee,`/api/saas/workers/${otherWorker}/${resource}`)).status,404);
   assert.equal((await request(owner,`/api/saas/workers/${otherWorker}/${resource}`)).status,200);
   assert.equal((await request(outsider,`/api/saas/workers/${employeeWorker}/${resource}`)).status,404);
  }
  const privateJob=crypto.randomUUID();
  db.prepare('INSERT INTO work_orders (id,organisation_id,title,start_at,required_workers,created_at,updated_at) VALUES (?,?,?,?,1,?,?)').run(privateJob,orgA,'Unassigned private job',now,now,now);
  assert.deepEqual((await (await request(employee,'/api/saas/work-orders')).json()).jobs.map(j=>j.id),[job]);
  assert.equal((await (await request(owner,'/api/saas/work-orders')).json()).jobs.length,2);
  const staffWorker=crypto.randomUUID(),staffEmail='new-staff@example.invalid',staffPassword='Staff test password 42!';
  db.prepare("INSERT INTO workers(id,organisation_id,full_name,status,created_at,updated_at) VALUES (?,?,?,'onboarding',?,?)").run(staffWorker,orgA,'New staff',now,now);
  const invitation={worker_id:staffWorker,email:staffEmail,role:'employee'};
  assert.equal((await request(employee,'/api/saas/team-accounts')).status,403);
  assert.equal((await request(employee,'/api/saas/team-accounts/invitations','POST',invitation)).status,403);
  assert.equal((await request(outsider,'/api/saas/team-accounts/invitations','POST',invitation)).status,404);
  assert.equal((await request(owner,'/api/saas/team-accounts/invitations','POST',{...invitation,role:'owner'})).status,400);
  const invited=await request(owner,'/api/saas/team-accounts/invitations','POST',invitation);assert.equal(invited.status,201);const invite=await invited.json();assert.equal(invite.delivery.sent,false);
  const token=invite.invite_path.split('#')[1],accept={token,email:staffEmail,password:staffPassword,consent:true};
  const storedInvite=db.prepare('SELECT * FROM team_account_invites WHERE id=?').get(invite.id);assert.notEqual(storedInvite.token_hash,token);
  assert.equal((await request(owner,'/api/saas/team-accounts/accept','POST',accept)).status,400,'new user needs mailbox verification');
  db.prepare('INSERT INTO team_invite_verifications(invite_id,code_hash,expires_at,sent_at) VALUES (?,?,?,?)').run(invite.id,crypto.createHash('sha256').update(invite.id+':654321').digest('hex'),later,now);
  assert.equal((await request(owner,'/api/saas/team-accounts/accept','POST',{...accept,email_code:'111111'})).status,400);
  assert.equal((await request(owner,'/api/saas/team-accounts/accept','POST',{...accept,email_code:'654321'})).status,201);
  assert.equal((await request(owner,'/api/saas/team-accounts/accept','POST',{...accept,email_code:'654321'})).status,400,'single use');
  const staff=db.prepare('SELECT * FROM users WHERE email=?').get(staffEmail);assert.notEqual(staff.id,owner.id);assert.equal(staff.email_verified,1);assert.equal(staff.phone_verified,0);
  const linked=db.prepare('SELECT * FROM workers WHERE id=?').get(staffWorker);assert.equal(linked.user_id,staff.id);assert.equal(linked.approved_for_scheduling,0);
  const login=await fetch(base+'/api/saas/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:staffEmail,password:staffPassword})});assert.equal(login.status,200);
  const staffActor={id:staff.id,org:orgA,token:decodeURIComponent(login.headers.get('set-cookie').match(/fp_session=([^;]+)/)[1])};
  assert.equal((await request(staffActor,'/api/saas/me')).status,200);
  assert.equal((await request(staffActor,`/api/saas/workers/${employeeWorker}/documents`)).status,404);
  assert.equal((await request(owner,`/api/saas/team-accounts/members/${owner.id}`,'DELETE')).status,409);
  assert.equal((await request(owner,`/api/saas/team-accounts/members/${staff.id}`,'DELETE')).status,200);
  assert.equal((await request(staffActor,'/api/saas/me')).status,401,'revoked member cannot reuse session in this business');
  assert.equal(db.prepare('SELECT status FROM workers WHERE id=?').get(staffWorker).status,'inactive');
  const reissued=await (await request(owner,'/api/saas/team-accounts/invitations','POST',invitation)).json();const reaccept={...accept,token:reissued.invite_path.split('#')[1]};
  assert.equal((await request(owner,'/api/saas/team-accounts/accept','POST',{...reaccept,password:'incorrect password'})).status,401,'existing password cannot be replaced through invitation');
  db.prepare('UPDATE users SET email_verified=0 WHERE id=?').run(staff.id);
  assert.equal((await request(owner,'/api/saas/team-accounts/accept','POST',reaccept)).status,400,'existing unverified mailbox also needs verification');
  db.prepare('INSERT INTO team_invite_verifications(invite_id,code_hash,expires_at,sent_at) VALUES (?,?,?,?)').run(reissued.id,crypto.createHash('sha256').update(reissued.id+':654321').digest('hex'),later,now);
  assert.equal((await request(owner,'/api/saas/team-accounts/accept','POST',{...reaccept,email_code:'654321'})).status,201);
  assert.equal(db.prepare('SELECT password_hash FROM users WHERE id=?').get(staff.id).password_hash,staff.password_hash);
  assert.equal((await request(owner,`/api/saas/team-accounts/members/${staff.id}`,'DELETE')).status,200);
  const revocable=await (await request(owner,'/api/saas/team-accounts/invitations','POST',invitation)).json();
  assert.equal((await request(outsider,`/api/saas/team-accounts/invitations/${revocable.id}`,'DELETE')).status,404);
  assert.equal((await request(owner,`/api/saas/team-accounts/invitations/${revocable.id}`,'DELETE')).status,200);
  assert.equal((await request(owner,'/api/saas/team-accounts/accept','POST',{...accept,token:revocable.invite_path.split('#')[1]})).status,400);
  const expired=await (await request(owner,'/api/saas/team-accounts/invitations','POST',invitation)).json();
  db.prepare('UPDATE team_account_invites SET expires_at=? WHERE id=?').run('2000-01-01T00:00:00.000Z',expired.id);
  assert.equal((await request(owner,'/api/saas/team-accounts/accept','POST',{...accept,token:expired.invite_path.split('#')[1]})).status,400);
  const mfaInvite=await (await request(owner,'/api/saas/team-accounts/invitations','POST',invitation)).json();
  const mfaAccept={...accept,token:mfaInvite.invite_path.split('#')[1]};
  db.prepare("UPDATE users SET mfa_enabled=1,mfa_secret='JBSWY3DPEHPK3PXP' WHERE id=?").run(staff.id);
  assert.equal((await request(owner,'/api/saas/team-accounts/accept','POST',mfaAccept)).status,401,'invitation must not bypass existing MFA');
  assert.equal((await request(owner,'/api/saas/team-accounts/accept','POST',{...mfaAccept,email:'different@example.invalid'})).status,400);
  db.prepare('UPDATE users SET mfa_enabled=0 WHERE id=?').run(staff.id);
  assert.equal((await request(owner,'/api/saas/team-accounts/accept','POST',mfaAccept)).status,201);
  db.prepare("INSERT INTO memberships VALUES (?,?,'owner',?)").run(orgB,staff.id,now);
  const ownerNeedsPhone=await fetch(base+'/api/saas/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:staffEmail,password:staffPassword})});
  assert.equal(ownerNeedsPhone.status,403,'staff invitations cannot bypass owner mobile verification');
  assert.equal((await request(owner,`/api/saas/team-accounts/members/${staff.id}`,'DELETE')).status,200);
  assert.ok(db.prepare('SELECT 1 FROM memberships WHERE organisation_id=? AND user_id=?').get(orgB,staff.id),'revocation preserves other business membership');
 }finally{
  child.kill();await new Promise(resolve=>child.once('exit',resolve));db.close();rmSync(root,{recursive:true,force:true});
 }
});
