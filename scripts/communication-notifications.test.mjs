import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {createDb} from '../src/db.js';
import {installNotifications} from '../src/notifications.js';
import {installCommunicationTracking} from '../src/message-delivery.js';
import {normalizeRecoveryCode,verifyRecoveryChallenge} from '../src/recovery-verification.js';
const hash=(id,code)=>crypto.createHash('sha256').update(`${id}:${code}`).digest('hex');
test('recovery verifies the persisted issuing provider, including 4-digit SMS and pasted codes',async()=>{
 const row={id:crypto.randomUUID(),destination:'+61412345678',verification_provider:'telnyx_verify',code_hash:hash('unused','999999')};let called=0;
 const verifySms=async(phone,code)=>{called++;assert.equal(phone,row.destination);assert.equal(code,'1234');return {ok:true}};
 assert.equal(normalizeRecoveryCode(' ۱۲-۳۴ '),'1234');
 assert.equal(await verifyRecoveryChallenge(row,normalizeRecoveryCode('١٢٣٤'),{verifySms,hash}),true);assert.equal(called,1);
 row.verification_provider='local';row.code_hash=hash(row.id,'012345');
 assert.equal(await verifyRecoveryChallenge(row,'012345',{verifySms,hash}),true);assert.equal(called,1);
 assert.equal(await verifyRecoveryChallenge(row,'1234',{verifySms,hash}),false);
 assert.equal(await verifyRecoveryChallenge(row,'999999',{verifySms,hash}),false);
});
function fixture(env={}){
 const db=createDb(':memory:'),routes=new Map(),app={get:(p,...handlers)=>routes.set('GET '+p,handlers),post:(p,...handlers)=>routes.set('POST '+p,handlers),put:(p,...handlers)=>routes.set('PUT '+p,handlers)};
 const org=crypto.randomUUID(),other=crypto.randomUUID(),at=new Date().toISOString();
 for(const id of [org,other])db.prepare('INSERT INTO organisations(id,name,slug,created_at,updated_at) VALUES (?,?,?,?,?)').run(id,id,id,at,at);
 function user(o,role){const id=crypto.randomUUID();db.prepare('INSERT INTO users(id,email,full_name,password_hash,password_salt,created_at,updated_at) VALUES (?,?,?,?,?,?,?)').run(id,id+'@example.test',role,'unused','unused',at,at);db.prepare('INSERT INTO memberships(organisation_id,user_id,role,created_at) VALUES (?,?,?,?)').run(o,id,role,at);return id}
 const owner=user(org,'owner'),employee=user(org,'employee'),outsider=user(other,'owner');
 const auth=(_req,_res,next)=>next(),notify=installNotifications(app,{db,env:{},requireSaasUser:auth});let sends=0;
 const tracking=installCommunicationTracking(app,{db,env,requireSaasUser:auth,requireSaasRole:()=>auth,notify,verifyTelnyx:()=>false,sendFollowUp:async()=>{sends++;return {sent:true}},timers:false});
 const request=(method,path,userId,organisationId,body={})=>{let status=200,data;routes.get(method+' '+path).at(-1)({saas:{user_id:userId,organisation_id:organisationId},body},{status(n){status=n;return this},json(value){data=value}});return {status,data}};
 return {db,routes,org,other,owner,employee,outsider,notify,tracking,request,sends:()=>sends};
}
test('notification defaults, role audience, muted preferences, unread count and tenant boundaries',async()=>{
 const f=fixture();try{
  assert.equal(f.request('GET','/api/saas/notification-preferences',f.owner,f.org).data.preferences.muted,false);
  f.request('PUT','/api/saas/notification-preferences',f.employee,f.org,{muted:true,sound:false,browser:false,sms:false});
  assert.equal(f.request('GET','/api/saas/notification-preferences',f.owner,f.org).data.preferences.muted,false);
  assert.equal(f.request('GET','/api/saas/notification-preferences',f.employee,f.org).data.preferences.muted,true);
  await f.notify.notifyRoles(f.org,['owner','employee'],{kind:'staff_chat',title:'New message',excludeUserId:f.employee});
  assert.equal(f.request('GET','/api/saas/notifications',f.employee,f.org).data.unread,0);
  assert.equal(f.request('GET','/api/saas/notifications',f.outsider,f.other).data.unread,0);
  for(let i=0;i<51;i++)await f.notify.notifyUser(f.org,f.owner,{kind:'test',title:'Alert '+i});
  const alerts=f.request('GET','/api/saas/notifications',f.owner,f.org).data;assert.equal(alerts.notifications.length,50);assert.equal(alerts.unread,52);
  f.request('POST','/api/saas/notifications/read',f.outsider,f.other,{ids:alerts.notifications.map(n=>n.id)});assert.equal(f.request('GET','/api/saas/notifications',f.owner,f.org).data.unread,52);
  f.request('POST','/api/saas/notifications/read',f.owner,f.org,{ids:[alerts.notifications[0].id]});assert.equal(f.request('GET','/api/saas/notifications',f.owner,f.org).data.unread,51);
 }finally{f.tracking.stop();f.db.close()}
});
test('provider receipts never invent delivery/read, deduplicate and do not regress; replies cancel 24h follow-ups',async()=>{
 const f=fixture();try{
  const record=(email,id)=>f.tracking.record({organisationId:f.org,userId:f.owner,channel:'email',recipient:email,subject:'Invitation',category:'hiring_invitation',followUp:{subject:'Following up',frame:{heading:'Hello'}}},{sent:true,email_id:id});
  f.tracking.receipt('resend','early-event','early-email','delivered');const early=record('early@example.test','early-email');assert.equal(f.db.prepare('SELECT status FROM communication_deliveries WHERE id=?').get(early).status,'delivered','a receipt arriving before the send response is retained');
  f.tracking.inbound({organisation_id:f.org,channel:'email',contact_address:'early@example.test',id:'early-reply'});
  const id=record('one@example.test','email-one');assert.equal(f.db.prepare('SELECT status FROM communication_deliveries WHERE id=?').get(id).status,'accepted');
  f.tracking.receipt('resend','event-1','email-one','delivered');f.tracking.receipt('resend','event-2','email-one','opened');f.tracking.receipt('resend','event-3','email-one','sent');f.tracking.receipt('resend','event-2','email-one','opened');
  assert.equal(f.db.prepare('SELECT status FROM communication_deliveries WHERE id=?').get(id).status,'opened');
  f.tracking.inbound({organisation_id:f.other,channel:'email',contact_address:'one@example.test',id:'reply-other'});assert.equal(f.db.prepare('SELECT replied_at FROM communication_deliveries WHERE id=?').get(id).replied_at,null);
  f.tracking.inbound({organisation_id:f.org,channel:'email',contact_address:'ONE@example.test',id:'reply-own'});
  const second=record('two@example.test','email-two');
  await f.tracking.tick();assert.equal(f.sends(),0,'no early follow-up');
  f.db.prepare('UPDATE communication_deliveries SET follow_up_at=?').run(new Date(Date.now()-1000).toISOString());
  f.request('PUT','/api/saas/message-delivery/settings',f.owner,f.org,{follow_ups:false});await f.tracking.tick();assert.equal(f.sends(),0,'owner can disable automatic follow-ups');f.request('PUT','/api/saas/message-delivery/settings',f.owner,f.org,{follow_ups:true});
  await Promise.all([f.tracking.tick(),f.tracking.tick()]);await f.tracking.tick();assert.equal(f.sends(),1);
  assert.equal(f.db.prepare('SELECT follow_up_state FROM communication_deliveries WHERE id=?').get(id).follow_up_state,'cancelled_reply');
  assert.equal(f.db.prepare('SELECT follow_up_state FROM communication_deliveries WHERE id=?').get(second).follow_up_state,'sent');
  assert.equal(f.request('GET','/api/saas/message-delivery',f.outsider,f.other).data.deliveries.length,0);
 }finally{f.tracking.stop();f.db.close()}
});

test('signed email receipt webhooks reject forged events and accept replay-safe provider evidence',async()=>{
 const key=Buffer.from('a sufficiently long test webhook signing secret'),f=fixture({RESEND_WEBHOOK_SECRET:'whsec_'+key.toString('base64')});
 try{
  const id=f.tracking.record({organisationId:f.org,channel:'email',recipient:'recipient@example.test',subject:'Quote'},{sent:true,email_id:'provider-quote'});
  const body=JSON.stringify({type:'email.delivered',data:{email_id:'provider-quote'}}),eventId='msg_test',timestamp=String(Math.floor(Date.now()/1000));
  const signature='v1,'+crypto.createHmac('sha256',key).update(`${eventId}.${timestamp}.${body}`).digest('base64');
  const invoke=async signature=>{let status=200;await f.routes.get('POST /api/webhooks/communications/resend').at(-1)({rawBody:Buffer.from(body),get:k=>({'svix-id':eventId,'svix-timestamp':timestamp,'svix-signature':signature}[k])},{status(n){status=n;return this},json(){}});return status};
  assert.equal(await invoke('v1,forged'),401);assert.equal(f.db.prepare('SELECT status FROM communication_deliveries WHERE id=?').get(id).status,'accepted');
  assert.equal(await invoke(signature),200);assert.equal(await invoke(signature),200);assert.equal(f.db.prepare('SELECT status FROM communication_deliveries WHERE id=?').get(id).status,'delivered');
  assert.equal(f.db.prepare('SELECT COUNT(*) n FROM communication_receipt_events').get().n,1);
 }finally{f.tracking.stop();f.db.close()}
});
