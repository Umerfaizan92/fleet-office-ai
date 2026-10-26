import {spawn} from 'node:child_process';
import {createHash,createHmac,randomBytes,randomUUID} from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';

const tempRoot=fs.mkdtempSync(path.join(os.tmpdir(),'superpro-platform-'));
const port=42000+Math.floor(Math.random()*6000);
const base='http://127.0.0.1:'+port;
const dbPath=path.join(tempRoot,'platform.sqlite');
const MAIL_SECRET='mail-secret-'+randomBytes(8).toString('hex'),META_SECRET='meta-secret-'+randomBytes(8).toString('hex');
const child=spawn(process.execPath,['src/server.js'],{cwd:process.cwd(),env:{...process.env,PORT:String(port),NODE_ENV:'test',PUBLIC_BASE_URL:base,ALLOWED_ORIGINS:base,DATABASE_PATH:dbPath,UPLOAD_DIR:path.join(tempRoot,'uploads'),SAAS_VERIFICATION_TEST_MODE:'0',INBOUND_EMAIL_WEBHOOK_SECRET:MAIL_SECRET,META_APP_SECRET:META_SECRET,WHATSAPP_VERIFY_TOKEN:'verify-me',GEMINI_API_KEY:'',GOOGLE_AI_API_KEY:'',AI_PROVIDER_API_KEY:'',AI_PROVIDER_BASE_URL:'',OPENAI_API_KEY:'',TELNYX_API_KEY:'',WHATSAPP_ACCESS_TOKEN:'',RESEND_API_KEY:''},stdio:['ignore','pipe','pipe']});
let output='';child.stdout.on('data',b=>{output+=b});child.stderr.on('data',b=>{output+=b});
const delay=ms=>new Promise(r=>setTimeout(r,ms));
async function waitForHealth(){for(let i=0;i<60;i++){if(child.exitCode!==null)throw Error('Server exited: '+output.slice(-2000));try{if((await fetch(base+'/healthz')).status===200)return}catch{}await delay(200)}throw Error('No health: '+output.slice(-2000))}
const call=async(method,url,cookie,body,headers={})=>{const r=await fetch(base+url,{method,headers:{origin:base,...(cookie?{cookie}:{}),...(body!==undefined?{'content-type':'application/json'}:{}),...headers},body:body!==undefined?(typeof body==='string'?body:JSON.stringify(body)):undefined});const text=await r.text();let json=null;try{json=JSON.parse(text)}catch{}return {status:r.status,json,text,headers:r.headers}};
let db=null;
try{
  await waitForHealth();
  db=new Database(dbPath);
  const now=new Date().toISOString(),expires=new Date(Date.now()+3600000).toISOString();
  const A=randomUUID(),B=randomUUID();
  const org=db.prepare('INSERT INTO organisations (id,name,slug,created_at,updated_at) VALUES (?,?,?,?,?)');
  org.run(A,'Platform A','platform-a-'+A,now,now);org.run(B,'Platform B','platform-b-'+B,now,now);
  const cookies={},ids={};
  for(const [key,tenant,role] of [['owner',A,'owner'],['admin',A,'admin'],['manager',A,'manager'],['worker',A,'employee'],['ownerB',B,'owner']]){
    const uid=randomUUID(),token=randomBytes(24).toString('hex');
    db.prepare('INSERT INTO users (id,email,full_name,password_hash,password_salt,created_at,updated_at) VALUES (?,?,?,?,?,?,?)').run(uid,key+'-'+uid+'@example.test',key,'x','x',now,now);
    db.prepare('INSERT INTO memberships (organisation_id,user_id,role,created_at) VALUES (?,?,?,?)').run(tenant,uid,role,now);
    db.prepare('INSERT INTO user_sessions (id,user_id,token_hash,expires_at,created_at,last_seen_at) VALUES (?,?,?,?,?,?)').run(randomUUID(),uid,createHash('sha256').update(token).digest('hex'),expires,now,now);
    cookies[key]='fp_session='+token;ids[key]=uid;
  }

  // 1. envelope
  const me=await call('GET','/api/saas/me',cookies.owner);
  assert.equal(me.status,200);assert.equal(me.json.ok,true);assert.equal(typeof me.json.data,'object');
  const anon=await call('GET','/api/saas/me');
  assert.equal(anon.status,401);assert.equal(anon.json.ok,false);assert.equal(typeof anon.json.error,'string');

  // 2. data portability: owner only, no secrets, tenant-scoped, CSV injection-safe
  const wId=randomUUID();
  db.prepare("INSERT INTO workers (id,organisation_id,full_name,email,status,declared_work_status,created_at,updated_at) VALUES (?,?,?,?,'active','australian_citizen',?,?)").run(wId,A,'=HYPERLINK("x")','w@example.test',now,now);
  db.prepare("INSERT INTO workers (id,organisation_id,full_name,status,created_at,updated_at) VALUES (?,?,?,'active',?,?)").run(randomUUID(),B,'Tenant B Worker',now,now);
  for(const k of ['admin','manager','worker'])assert.equal((await call('GET','/api/saas/data-export',cookies[k])).status,403,k+' must not export');
  assert.equal((await call('GET','/api/saas/data-export')).status,401);
  const exp=await call('GET','/api/saas/data-export',cookies.owner);
  assert.equal(exp.status,200);
  assert.ok(exp.json.data.tables.workers.some(w=>w.id===wId));
  assert.ok(!exp.text.includes('Tenant B Worker'),'cross-tenant leak in export');
  assert.ok(!/password_hash|password_salt|mfa_secret|token_hash/.test(exp.text),'secret column in export');
  assert.equal((await call('GET','/api/saas/data-export?format=csv',cookies.owner)).status,400);
  const csv=await call('GET','/api/saas/data-export?format=csv&table=workers',cookies.owner);
  assert.equal(csv.status,200);assert.match(csv.headers.get('content-type'),/text\/csv/);
  assert.ok(csv.text.includes("'=HYPERLINK"),'formula not neutralised');

  // 3. VEVO result record and the offer gate
  const visa=randomUUID(),visaUser=ids.worker,wo=randomUUID(),offer=randomUUID();
  db.prepare("INSERT INTO workers (id,organisation_id,user_id,full_name,status,declared_work_status,created_at,updated_at) VALUES (?,?,?,?,'active','visa_holder',?,?)").run(visa,A,visaUser,'Visa Worker',now,now);
  db.prepare('INSERT INTO work_orders (id,organisation_id,title,start_at,created_at,updated_at) VALUES (?,?,?,?,?,?)').run(wo,A,'Gate job','2026-12-01T08:00:00+08:00',now,now);
  db.prepare('INSERT INTO job_offers (id,organisation_id,work_order_id,worker_id,offered_at) VALUES (?,?,?,?,?)').run(offer,A,wo,visa,now);
  assert.equal((await call('POST',`/api/saas/job-offers/${offer}/respond`,cookies.worker,{status:'accepted'})).status,409,'visa holder without VEVO must be blocked');
  const vevoBody={status:'verified',checked_on:'2026-10-20',reference:'VEVO-123',work_rights_expiry:'2030-01-01',consent_confirmed:true};
  assert.equal((await call('PUT',`/api/saas/workers/${visa}/vevo`,cookies.worker,vevoBody)).status,403);
  assert.equal((await call('PUT',`/api/saas/workers/${visa}/vevo`,cookies.manager,{...vevoBody,consent_confirmed:false})).status,400);
  assert.equal((await call('PUT',`/api/saas/workers/${visa}/vevo`,cookies.ownerB,vevoBody)).status,404,'cross-tenant VEVO write');
  assert.equal((await call('PUT',`/api/saas/workers/${visa}/vevo`,cookies.manager,vevoBody)).status,200);
  const w=db.prepare('SELECT vevo_status,vevo_consent_id FROM workers WHERE id=?').get(visa);
  assert.equal(w.vevo_status,'verified');
  assert.equal(db.prepare("SELECT record_type FROM privacy_governance WHERE id=?").get(w.vevo_consent_id).record_type,'consent');
  // Recording VEVO re-evaluates eligibility; this fixture has no document requirements, so restore the active state a fully onboarded worker would have.
  db.prepare("UPDATE workers SET status='active' WHERE id=?").run(visa);
  assert.equal((await call('POST',`/api/saas/job-offers/${offer}/respond`,cookies.worker,{status:'accepted'})).status,200);

  // 4. channels, signed webhooks, tenant routing
  assert.equal((await call('PUT','/api/saas/comms/channels/email',cookies.manager,{address:'desk@a.example'})).status,403);
  assert.equal((await call('PUT','/api/saas/comms/channels/email',cookies.owner,{address:'desk@a.example'})).status,202);
  assert.equal((await call('PUT','/api/saas/comms/channels/email',cookies.ownerB,{address:'DESK@a.example'})).status,409,'address squatting');
  const mail=(id,over={})=>{const body=JSON.stringify({message_id:id,from:{address:'cust@x.example',name:'Cust'},to:'desk@a.example',subject:'Quote',text:'Hello',...over});const ts=String(Math.floor(Date.now()/1000));return call('POST','/api/webhooks/inbound-email',null,body,{'x-webhook-timestamp':ts,'x-webhook-signature':createHmac('sha256',MAIL_SECRET).update(`${ts}.${body}`).digest('hex')})};
  assert.equal((await mail('m1')).json.routed,false,'pending channel must not route');
  db.prepare("UPDATE comms_channels SET status='active' WHERE organisation_id=? AND channel='email'").run(A);
  const first=await mail('m2');assert.equal(first.status,202);assert.equal(first.json.routed,true);
  assert.equal((await mail('m2')).json.duplicate,true);
  const badBody=JSON.stringify({from:{address:'a@b.co'},to:'desk@a.example'});
  assert.equal((await call('POST','/api/webhooks/inbound-email',null,badBody,{'x-webhook-timestamp':String(Math.floor(Date.now()/1000)),'x-webhook-signature':'0'.repeat(64)})).status,401);
  const oldTs=String(Math.floor(Date.now()/1000)-3600);
  assert.equal((await call('POST','/api/webhooks/inbound-email',null,badBody,{'x-webhook-timestamp':oldTs,'x-webhook-signature':createHmac('sha256',MAIL_SECRET).update(`${oldTs}.${badBody}`).digest('hex')})).status,401,'replay');
  const threads=await call('GET','/api/saas/comms/threads',cookies.manager);
  assert.equal(threads.json.threads.length,1);
  assert.equal((await call('GET','/api/saas/comms/threads',cookies.worker)).status,403);
  const tid=threads.json.threads[0].id;
  assert.equal((await call('GET','/api/saas/comms/threads/'+tid,cookies.ownerB)).status,404,'cross-tenant thread read');
  assert.equal((await call('GET','/api/saas/comms/threads/'+tid,cookies.manager)).json.messages.length,1);
  // WhatsApp
  assert.equal((await call('GET','/api/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=verify-me&hub.challenge=abc123')).text,'abc123');
  assert.equal((await call('GET','/api/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=abc123')).status,403);
  const wa=JSON.stringify({entry:[{changes:[{value:{metadata:{display_phone_number:'61400000000'},contacts:[{wa_id:'61411111111',profile:{name:'Pat'}}],messages:[{id:'wamid.1',from:'61411111111',type:'text',text:{body:'Hi'}}]}}]}]});
  assert.equal((await call('POST','/api/webhooks/whatsapp',null,wa,{'x-hub-signature-256':'sha256='+'0'.repeat(64)})).status,401);
  assert.equal((await call('POST','/api/webhooks/whatsapp',null,wa,{'x-hub-signature-256':'sha256='+createHmac('sha256',META_SECRET).update(wa).digest('hex')})).status,200);
  // Social channels
  assert.equal((await call('PUT','/api/saas/comms/channels/instagram',cookies.owner,{address:'@Acme.Plumbing'})).status,202);
  assert.equal((await call('PUT','/api/saas/comms/channels/facebook',cookies.manager,{address:'12345'})).status,403);
  db.prepare("UPDATE comms_channels SET status='active' WHERE organisation_id=? AND channel='instagram'").run(A);
  const soc=(id,to)=>{const body=JSON.stringify({message_id:id,to,from:{id:'ig_user_9',name:'Sam'},text:'Hi, can I get a quote?'});const ts=String(Math.floor(Date.now()/1000));return call('POST','/api/webhooks/social/instagram',null,body,{'x-webhook-timestamp':ts,'x-webhook-signature':createHmac('sha256',MAIL_SECRET).update(`${ts}.${body}`).digest('hex')})};
  assert.equal((await soc('s1','acme.plumbing')).json.routed,true);
  assert.equal((await soc('s1','acme.plumbing')).json.duplicate,true);
  assert.equal((await soc('s2','someone.else')).json.routed,false);
  assert.equal((await call('POST','/api/webhooks/social/myspace',null,'{}',{})).status,404);
  assert.equal((await call('POST','/api/webhooks/social/instagram',null,'{}',{'x-webhook-timestamp':String(Math.floor(Date.now()/1000)),'x-webhook-signature':'0'.repeat(64)})).status,401);
  // voice log API
  assert.equal((await call('POST','/api/saas/comms/voice-logs',cookies.worker,{contact_address:'+61422222222'})).status,403);
  assert.equal((await call('POST','/api/saas/comms/voice-logs',cookies.manager,{contact_address:'+61422222222',summary:'Wants a quote',duration_seconds:90,external_id:'call-1'})).status,201);
  assert.equal((await call('POST','/api/saas/comms/voice-logs',cookies.manager,{contact_address:'+61422222222',summary:'Wants a quote',duration_seconds:90,external_id:'call-1'})).status,200,'voice log idempotent');

  // 5. approvals gate
  assert.equal((await call('POST',`/api/saas/comms/threads/${tid}/draft`,cookies.manager,{})).status,503,'draft needs AI configured');
  const intent=await call('POST','/api/saas/ai/intents',cookies.worker,{intent:'send_message',title:'Message all customers'});
  assert.equal(intent.status,202);assert.equal(intent.json.executed,false);
  assert.equal(db.prepare("SELECT status FROM workspace_approvals WHERE id=?").get(intent.json.approval_id).status,'pending');
  assert.equal((await call('POST','/api/saas/ai/intents',cookies.worker,{intent:'totally_new_action',title:'Unknown'})).json.staged,true,'unknown intents fail closed');
  assert.equal((await call('POST','/api/saas/ai/intents',cookies.worker,{intent:'summarise',title:'Summary'})).json.staged,false);
  assert.equal((await call('POST',`/api/saas/approvals/${intent.json.approval_id}/decision`,cookies.worker,{decision:'approve'})).status,403,'worker must not approve');
  // simulate an AI draft awaiting sign-off
  const msg=randomUUID(),appr=randomUUID();
  db.prepare("INSERT INTO comms_messages (id,organisation_id,thread_id,direction,body,provider,status,approval_id,ai_generated,occurred_at,created_at) VALUES (?,?,?,'outbound','Draft text','email','pending_approval',?,1,?,?)").run(msg,A,tid,appr,now,now);
  db.prepare("INSERT INTO workspace_approvals (id,organisation_id,reference_code,approval_type,source_module,title,entity_type,entity_id,risk_level,status,draft_payload_json,required_role,requested_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)").run(appr,A,'SP-APR-T-1','outbound_message','comms','Send reply','comms_message',msg,'high','pending','{}','senior',now,now);
  assert.equal((await call('POST',`/api/saas/comms/messages/${msg}/send`,cookies.manager)).status,409,'cannot send before approval');
  assert.equal((await call('POST',`/api/saas/approvals/${appr}/decision`,cookies.ownerB,{decision:'approve'})).status,404,'cross-tenant approval');
  assert.equal((await call('POST',`/api/saas/approvals/${appr}/decision`,cookies.manager,{decision:'approve',edited_payload:{body:'Edited by human'}})).status,200);
  assert.deepEqual(db.prepare('SELECT status,body FROM comms_messages WHERE id=?').get(msg),{status:'approved',body:'Edited by human'});
  assert.equal((await call('POST',`/api/saas/approvals/${appr}/decision`,cookies.manager,{decision:'approve'})).status,404,'double decision');
  const sent=await call('POST',`/api/saas/comms/messages/${msg}/send`,cookies.manager);
  assert.equal(sent.status,409,'email provider is not configured in test');
  assert.equal(db.prepare('SELECT status FROM comms_messages WHERE id=?').get(msg).status,'approved','failed dispatch must stay approved');

  // 6. privacy requests and statutory erasure
  const held=randomUUID(),free=randomUUID(),past=new Date(Date.now()-86400000).toISOString(),future=new Date(Date.now()+86400000*400).toISOString();
  db.prepare("INSERT INTO workers (id,organisation_id,full_name,email,phone,status,fair_work_retain_until,created_at,updated_at) VALUES (?,?,?,?,?,'active',?,?,?)").run(held,A,'Held Person','h@example.test','+61433333333',future,now,now);
  db.prepare("INSERT INTO workers (id,organisation_id,full_name,email,phone,status,fair_work_retain_until,created_at,updated_at) VALUES (?,?,?,?,?,'inactive',?,?,?)").run(free,A,'Free Person','f@example.test','+61444444444',past,now,now);
  assert.equal((await call('POST','/api/saas/privacy/requests',cookies.manager,{request_type:'deletion',worker_id:held,subject_name:'Held'})).status,403);
  const r1=await call('POST','/api/saas/privacy/requests',cookies.admin,{request_type:'deletion',worker_id:held,subject_name:'Held Person'});
  const r2=await call('POST','/api/saas/privacy/requests',cookies.admin,{request_type:'deletion',worker_id:free,subject_name:'Free Person'});
  assert.equal(r1.status,201);
  assert.equal((await call('POST',`/api/saas/privacy/requests/${r1.json.id}/erase`,cookies.admin)).status,403,'erasure is owner-exclusive');
  assert.equal((await call('POST',`/api/saas/privacy/requests/${r1.json.id}/erase`,cookies.ownerB)).status,404);
  assert.equal((await call('POST',`/api/saas/privacy/requests/${r1.json.id}/erase`,cookies.owner)).json.outcome,'retained_by_law');
  assert.equal(db.prepare('SELECT full_name FROM workers WHERE id=?').get(held).full_name,'Held Person','retained record must be untouched');
  assert.equal((await call('POST',`/api/saas/privacy/requests/${r2.json.id}/erase`,cookies.owner)).json.outcome,'erased');
  const erased=db.prepare('SELECT full_name,email,phone FROM workers WHERE id=?').get(free);
  assert.deepEqual(erased,{full_name:'Erased worker',email:null,phone:null});

  // 6b. migration wizard API: dry run, duplicates, role limits, idempotent commit, tenant isolation
  const people=[{Name:'Alice Import',Mail:'alice.import@example.test',Mobile:'0400 111 222',Type:'Full time'},{Name:'Bob Import',Mail:'',Mobile:'',Type:'casual'},{Name:'Alice Import',Mail:'alice.import@example.test',Mobile:'',Type:'part time'},{Name:'',Mail:'bad',Mobile:'',Type:'martian'},{Name:'Existing Person',Mail:'w@example.test',Mobile:'',Type:'casual'}];
  const wmap={full_name:'Name',email:'Mail',phone:'Mobile',employment_type:'Type'};
  assert.equal((await call('POST','/api/saas/migration/preview',cookies.worker,{entity:'workers',mapping:wmap,rows:people})).status,403);
  assert.equal((await call('POST','/api/saas/migration/preview',cookies.manager,{entity:'finance_entries',mapping:{},rows:[{a:1}]})).status,403,'manager cannot import finance');
  const big=await call('POST','/api/saas/migration/preview',cookies.manager,{entity:'workers',mapping:wmap,rows:Array.from({length:1001},(_,i)=>({Name:'N'+i}))});
  assert.equal(big.status,400,'row cap');
  const pv=await call('POST','/api/saas/migration/preview',cookies.manager,{entity:'workers',mapping:wmap,rows:people});
  assert.equal(pv.status,200);assert.equal(pv.json.dry_run,true);
  assert.deepEqual([pv.json.counts.will_create,pv.json.counts.duplicate_in_file,pv.json.counts.invalid,pv.json.counts.duplicate_existing],[2,1,1,1],'counts: 2 new (Alice, Bob), 1 repeat, 1 invalid, 1 existing (w@example.test)');
  assert.equal(db.prepare("SELECT COUNT(*) n FROM workers WHERE organisation_id=? AND email='alice.import@example.test'").get(A).n,0,'dry run must not write');
  assert.equal((await call('POST','/api/saas/migration/commit',cookies.manager,{entity:'workers',mapping:wmap,rows:people})).status,400,'commit needs confirm');
  const done=await call('POST','/api/saas/migration/commit',cookies.manager,{entity:'workers',mapping:wmap,rows:people,confirm:true});
  assert.equal(done.status,201);assert.equal(done.json.created,2);
  const alice=db.prepare("SELECT id,declared_work_status,status,employment_type FROM workers WHERE organisation_id=? AND email='alice.import@example.test'").get(A);
  assert.equal(alice.declared_work_status,'requires_review','imported work rights are never trusted');
  assert.equal(alice.status,'onboarding');assert.equal(alice.employment_type,'full_time');
  assert.ok(db.prepare('SELECT COUNT(*) n FROM worker_documents WHERE worker_id=?').get(alice.id).n>=3,'compliance documents seeded');
  const again=await call('POST','/api/saas/migration/commit',cookies.manager,{entity:'workers',mapping:wmap,rows:people,confirm:true});
  assert.equal(again.json.created,0,'re-import is idempotent');
  const other=await call('POST','/api/saas/migration/preview',cookies.ownerB,{entity:'workers',mapping:wmap,rows:people.slice(0,2)});
  assert.equal(other.json.counts.will_create,2,'other tenant must not see duplicates from this tenant');
  const fin=await call('POST','/api/saas/migration/preview',cookies.admin,{entity:'finance_entries',mapping:{entry_type:'T',category:'C',amount:'A',occurred_on:'D'},rows:[{T:'Income',C:'Sales',A:'$1,250.50',D:'24/10/2026'},{T:'Cost',C:'Fuel',A:'abc',D:'2026-10-01'}]});
  assert.deepEqual([fin.json.counts.will_create,fin.json.counts.invalid],[1,1]);
  assert.equal(fin.json.preview[0].value.amount_cents,125050);assert.equal(fin.json.preview[0].value.occurred_on,'2026-10-24');

  // 7. everything above was audited with request context
  const audit=db.prepare("SELECT action,ip_address,user_role FROM audit_logs WHERE organisation_id=? AND action IN ('privacy.data_exported','worker.vevo_recorded','privacy.worker_erased','ai.intent_staged','migration.committed')").all(A);
  assert.ok(audit.length>=4);
  assert.ok(audit.every(a=>a.ip_address&&a.user_role),'audit rows need ip and role');
  console.log('SAAS PLATFORM TEST PASSED: envelope, owner-only export, tenant isolation, VEVO gate, signed webhooks, approvals gate, erasure with statutory retention, audit context.');
}finally{
  try{db?.close()}catch{}
  child.kill();
  await Promise.race([new Promise(r=>child.exitCode!==null?r():child.once('exit',r)),delay(2000)]);
  try{fs.rmSync(tempRoot,{recursive:true,force:true,maxRetries:10,retryDelay:200})}catch{/* Windows may still hold a file for a moment; leftover temp files are harmless */};
}
