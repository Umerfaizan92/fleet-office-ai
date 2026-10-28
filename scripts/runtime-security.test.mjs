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
  db.prepare('INSERT INTO memberships (organisation_id,user_id,role,created_at) VALUES (?,?,?,?)').run(org,id,role,now);
  db.prepare('INSERT INTO user_sessions (id,user_id,token_hash,expires_at,created_at,last_seen_at) VALUES (?,?,?,?,?,?)').run(crypto.randomUUID(),id,crypto.createHash('sha256').update(token).digest('hex'),later,now,now);
  return {id,token,org,email};
 }
 const owner=user('owner',orgA,'owner@example.invalid'),employee=user('employee',orgA,'staff@example.invalid'),outsider=user('owner',orgB,'outside@example.invalid');
 const job=crypto.randomUUID();
 db.prepare('INSERT INTO work_orders (id,organisation_id,title,start_at,required_workers,created_at,updated_at) VALUES (?,?,?,?,1,?,?)').run(job,orgA,'Test',now,now,now);
 function offer(userId,email){
  const worker=crypto.randomUUID(),id=crypto.randomUUID();
  db.prepare("INSERT INTO workers (id,organisation_id,user_id,full_name,email,status,declared_work_status,created_at,updated_at) VALUES (?,?,?,?,?,'active','australian_citizen',?,?)").run(worker,orgA,userId,'Test worker',email,now,now);
  db.prepare('INSERT INTO job_offers (id,organisation_id,work_order_id,worker_id,offered_at) VALUES (?,?,?,?,?)').run(id,orgA,job,worker,now);
  return id;
 }
 const own=offer(employee.id,employee.email),sameEmail=offer(null,employee.email),extra=offer(owner.id,'extra@example.invalid');
 const port=13200+Math.floor(Math.random()*1000),base=`http://127.0.0.1:${port}`;
 const child=spawn(process.execPath,['src/server.js'],{env:{...process.env,NODE_ENV:'test',SUPERPRO_SKIP_DOTENV:'1',RESEND_API_KEY:'',TELNYX_API_KEY:'',TELNYX_VERIFY_PROFILE_ID:'',PORT:String(port),DATABASE_PATH:database,UPLOAD_DIR:path.join(root,'uploads'),PUBLIC_BASE_URL:base,ALLOWED_ORIGINS:base},stdio:['ignore','pipe','pipe']});
 let logs='';child.stdout.on('data',b=>logs+=b);child.stderr.on('data',b=>logs+=b);
 const pause=ms=>new Promise(r=>setTimeout(r,ms));
 async function request(actor,route,method='GET',body,org=actor.org){return fetch(base+route,{method,headers:{cookie:`fp_session=${actor.token}`,'X-Organisation-Id':org,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});}
 try{
  let ready=false;
  for(let i=0;i<80;i++){try{if((await fetch(base+'/healthz')).ok){ready=true;break;}}catch{}await pause(100);}
  assert.ok(ready,logs);
  const presenceActor=user('employee',orgA,'presence@example.invalid'),viewOne=crypto.randomUUID(),viewTwo=crypto.randomUUID();
  await request(presenceActor,'/api/saas/staff-availability/me','PUT',{status:'available',reason:'Ready',returns_at:null});
  assert.equal((await (await request(owner,'/api/saas/staff-availability')).json()).staff.some(p=>p.id===presenceActor.id),false,'saved availability cannot imply signed-in presence');
  assert.equal((await request(presenceActor,'/api/saas/staff-presence/heartbeat','POST',{view_id:viewOne})).status,200);
  assert.equal((await (await request(owner,'/api/saas/staff-availability')).json()).staff.find(p=>p.id===presenceActor.id).online,true);
  assert.equal((await request(outsider,'/api/saas/staff-presence/heartbeat','POST',{view_id:crypto.randomUUID()},orgA)).status,403);
  db.prepare('UPDATE staff_presence SET last_seen_at=? WHERE user_id=?').run(new Date(Date.now()-120000).toISOString(),presenceActor.id);
  assert.equal((await (await request(owner,'/api/saas/staff-availability')).json()).staff.some(p=>p.id===presenceActor.id),false,'expired heartbeat removes stale online status');
  const offline=(await (await request(owner,'/api/saas/staff-availability?include_inactive=1')).json()).staff.find(p=>p.id===presenceActor.id);assert.equal(offline.online,false);assert.equal(offline.availability,'unavailable');
  const employeeDirectory=await (await request(employee,'/api/saas/staff-availability?include_inactive=1')).json();assert.equal(employeeDirectory.can_view_inactive,false);assert.equal(employeeDirectory.staff.some(p=>p.id===presenceActor.id),false);
  await request(presenceActor,'/api/saas/staff-presence/heartbeat','POST',{view_id:viewOne});await request(presenceActor,'/api/saas/staff-presence/heartbeat','POST',{view_id:viewTwo});
  await request(presenceActor,'/api/saas/staff-presence/leave','POST',{view_id:viewOne});
  assert.equal((await (await request(owner,'/api/saas/staff-availability')).json()).staff.find(p=>p.id===presenceActor.id).online,true,'closing one tab preserves another live tab');
  await request(presenceActor,'/api/saas/logout','POST',{});
  assert.equal(db.prepare('SELECT COUNT(*) n FROM staff_presence WHERE user_id=?').get(presenceActor.id).n,0,'sign-out removes session presence immediately');
  assert.equal((await (await request(owner,'/api/saas/staff-availability')).json()).staff.some(p=>p.id===presenceActor.id),false);
  db.prepare('DELETE FROM users WHERE id=?').run(presenceActor.id);

  assert.equal((await request(owner,'/api/saas/work-orders')).status,200);
  const foreign=await request(outsider,'/api/saas/work-orders');assert.equal(foreign.status,200);assert.deepEqual((await foreign.json()).jobs,[]);
  assert.ok([401,403,404].includes((await request(outsider,'/api/saas/work-orders','GET',undefined,orgA)).status));
  assert.equal((await request(employee,'/api/saas/work-orders','POST',{})).status,403);
  db.prepare('INSERT INTO memberships (organisation_id,user_id,role,created_at) VALUES (?,?,?,?)').run(orgB,owner.id,'employee',now);
  const switched=await request(owner,'/api/saas/me','GET',undefined,orgB);const identity=await switched.json();
  assert.equal(identity.organisation.id,orgB);assert.equal(identity.user.role,'employee');assert.equal(identity.user.email,owner.email);
  assert.equal((await request(owner,'/api/saas/finance','GET',undefined,orgB)).status,403,'owner privilege must not follow user into employee membership');
  const settings={business_type:'Test services',services:[],approval_mode:'everything'};
  assert.equal((await request(employee,'/api/saas/onboarding','PUT',settings)).status,403,'employees cannot change workspace approval policy');
  assert.equal((await request(owner,'/api/saas/onboarding','PUT',settings)).status,200,'owners retain settings access');
  assert.equal((await request(owner,'/api/saas/onboarding','PUT',{...settings,website:'Https:\\broken.example'})).status,400,'malformed website is rejected');
  const respond=(actor,id)=>request(actor,`/api/saas/job-offers/${id}/respond`,'POST',{status:'accepted'});
  assert.equal((await respond(employee,sameEmail)).status,404,'matching email is not identity; unowned offers are hidden (404)');
  assert.equal((await respond(outsider,own)).status,404);
  const results=await Promise.all([respond(employee,own),respond(owner,extra)]);
  assert.deepEqual(results.map(r=>r.status).sort(),[200,409]);
  assert.equal(db.prepare("SELECT count(*) n FROM job_offers WHERE work_order_id=? AND status='accepted'").get(job).n,1);
  const accepted=db.prepare("SELECT id FROM job_offers WHERE work_order_id=? AND status='accepted'").get(job);
  assert.equal((await respond(accepted.id===own?employee:owner,accepted.id)).status,409,'replay cannot allocate twice');
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
  const rolePath=`/api/saas/team-accounts/members/${staff.id}/role`;
  assert.equal((await request(employee,rolePath,'PATCH',{role:'admin'})).status,403);
  assert.equal((await request(outsider,rolePath,'PATCH',{role:'admin'})).status,404);
  assert.equal((await request(owner,rolePath,'PATCH',{role:'owner'})).status,400);
  assert.equal((await request(owner,`/api/saas/team-accounts/members/${owner.id}/role`,'PATCH',{role:'employee'})).status,409);
  assert.equal((await request(owner,rolePath,'PATCH',{role:'manager'})).status,200);
  assert.equal((await (await request(staffActor,'/api/saas/me')).json()).user.role,'manager','existing session reads new authority');
  assert.equal((await request(owner,rolePath,'PATCH',{role:'employee'})).status,200);
  assert.equal((await request(staffActor,'/api/saas/ai/threads')).status,403,'downgrade takes effect immediately');
  assert.equal((await request(owner,`/api/saas/team-accounts/members/${owner.id}`,'DELETE')).status,409);
  assert.equal((await request(owner,`/api/saas/team-accounts/members/${staff.id}`,'DELETE')).status,200);
  assert.ok([401,403].includes((await request(staffActor,'/api/saas/me')).status),'revoked member cannot reuse session in this business');
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
  db.prepare("INSERT INTO memberships (organisation_id,user_id,role,created_at) VALUES (?,?,'owner',?)").run(orgB,staff.id,now);
  const ownerNeedsPhone=await fetch(base+'/api/saas/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:staffEmail,password:staffPassword})});
  assert.equal(ownerNeedsPhone.status,403,'staff invitations cannot bypass owner mobile verification');
  assert.equal((await request(owner,`/api/saas/team-accounts/members/${staff.id}`,'DELETE')).status,200);
  assert.ok(db.prepare('SELECT 1 FROM memberships WHERE organisation_id=? AND user_id=?').get(orgB,staff.id),'revocation preserves other business membership');
  const hiringRole=crypto.randomUUID(),hiringAd=crypto.randomUUID();
  db.prepare("INSERT INTO hiring_roles(id,organisation_id,title,employment_type,public_token,created_at,updated_at) VALUES (?,?,?,'casual',?,?,?)").run(hiringRole,orgA,'Office assistant',crypto.randomUUID(),now,now);
  db.prepare("INSERT INTO hiring_ads(id,organisation_id,role_id,platform,body,status,created_at) VALUES (?,?,?,'email','Invitation to apply','draft',?)").run(hiringAd,orgA,hiringRole,now);
  const sendPath=`/api/saas/hiring/ads/${hiringAd}/send`,sendBody={request_id:crypto.randomUUID(),email:'applicant@example.invalid',phone:'0412345678',message:'Please review the role',follow_up:true};
  assert.equal((await request(employee,sendPath,'POST',sendBody)).status,403);
  assert.equal((await request(outsider,sendPath,'POST',sendBody)).status,404);
  assert.equal((await request(owner,sendPath,'POST',sendBody)).status,409,'drafts require approval');
  db.prepare("UPDATE hiring_ads SET status='approved' WHERE id=?").run(hiringAd);
  const sentInvitation=await request(owner,sendPath,'POST',sendBody);assert.equal(sentInvitation.status,200);const delivery=await sentInvitation.json();assert.equal(delivery.delivery.email.sent,false);assert.equal(delivery.delivery.sms.sent,false,'no false success without providers');
  const deliveryCount=db.prepare('SELECT COUNT(*) n FROM communication_deliveries WHERE organisation_id=?').get(orgA).n;
  assert.equal((await request(owner,sendPath,'POST',sendBody)).status,200);assert.equal(db.prepare('SELECT COUNT(*) n FROM communication_deliveries WHERE organisation_id=?').get(orgA).n,deliveryCount,'repeated send request does not resend');
  assert.equal((await request(owner,sendPath,'POST',{...sendBody,message:'Changed request'})).status,409);
  assert.equal((await request(employee,'/api/saas/message-delivery')).status,403);
  assert.equal((await request(employee,'/api/saas/message-delivery/settings','PUT',{follow_ups:false})).status,403);
  assert.equal((await (await request(outsider,'/api/saas/message-delivery')).json()).deliveries.length,0);
  const recoveryActor=user('employee',orgA,'recovery-test@example.invalid'),challenge=crypto.randomUUID();
  db.prepare('INSERT INTO account_recovery_challenges(id,user_id,recovery_type,channel,destination,code_hash,expires_at,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)').run(challenge,recoveryActor.id,'password','sms','+61412345678',crypto.createHash('sha256').update(challenge+':012345').digest('hex'),later,now,now);
  const recovered=await request(recoveryActor,'/api/saas/recovery/verify','POST',{challenge_id:challenge,code:'۰۱۲ ۳۴۵'});assert.equal(recovered.status,200);const recovery=await recovered.json();assert.ok(recovery.reset_token);
  assert.equal((await request(recoveryActor,'/api/saas/recovery/verify','POST',{challenge_id:challenge,code:'012345'})).status,409,'recovery code is single-use');
  assert.equal((await request(recoveryActor,'/api/saas/recovery/reset-password','POST',{challenge_id:challenge,reset_token:recovery.reset_token,password:'Recovered password 42!',confirm_password:'Recovered password 42!'})).status,200);
  assert.equal((await request(recoveryActor,'/api/saas/me')).status,401,'reset invalidates existing sessions');

 }finally{
  child.kill();await new Promise(resolve=>child.once('exit',resolve));db.close();try{rmSync(root,{recursive:true,force:true,maxRetries:10,retryDelay:200})}catch{}
 }
});
