import crypto from 'node:crypto';
import {Resend} from 'resend';
import {z} from 'zod';
let active=null;
export function trackCommunication(context,result){try{return active?.record(context,result)}catch{ return null }}
export function communicationInbound(data){try{active?.inbound(data)}catch{}}
export function installCommunicationTracking(app,{db,env,requireSaasUser,requireSaasRole,notify,verifyTelnyx,sendFollowUp,receiveEmail,timers=true}){
 db.exec(`CREATE TABLE IF NOT EXISTS communication_deliveries(
 id TEXT PRIMARY KEY,organisation_id TEXT NOT NULL,user_id TEXT,channel TEXT NOT NULL,recipient TEXT NOT NULL,provider TEXT NOT NULL,provider_id TEXT,status TEXT NOT NULL,category TEXT NOT NULL,subject TEXT,created_at TEXT NOT NULL,delivered_at TEXT,opened_at TEXT,replied_at TEXT,detail TEXT,follow_up_at TEXT,follow_up_state TEXT,follow_up_json TEXT);
 CREATE UNIQUE INDEX IF NOT EXISTS delivery_provider_id ON communication_deliveries(provider,provider_id) WHERE provider_id IS NOT NULL;
 CREATE INDEX IF NOT EXISTS delivery_org_time ON communication_deliveries(organisation_id,created_at);
 CREATE TABLE IF NOT EXISTS communication_receipt_events(provider TEXT NOT NULL,event_id TEXT NOT NULL,provider_id TEXT,state TEXT,applied INTEGER NOT NULL DEFAULT 0,PRIMARY KEY(provider,event_id));
 CREATE TABLE IF NOT EXISTS communication_settings(organisation_id TEXT PRIMARY KEY,follow_ups INTEGER NOT NULL DEFAULT 1);`);
 const norm=(channel,value)=>channel==='email'?String(value||'').trim().toLowerCase():String(value||'').replace(/[^\d+]/g,'').replace(/^04/,'+614').replace(/^614/,'+614');
 const alert=(org,opts)=>{void notify.notifyRoles(org,['owner','admin'],opts).catch(()=>{})};
 function record(c,r){
  if(!c?.organisationId||!c.recipient)return null;
  const id=crypto.randomUUID(),at=new Date().toISOString(),category=c.category||'message',status=r.sent?'accepted':'failed';
  const follow=c.followUp&&c.channel==='email'&&r.sent?JSON.stringify(c.followUp):null;
  const inserted=db.prepare(`INSERT OR IGNORE INTO communication_deliveries(id,organisation_id,user_id,channel,recipient,provider,provider_id,status,category,subject,created_at,detail,follow_up_at,follow_up_state,follow_up_json) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(id,c.organisationId,c.userId||null,c.channel,norm(c.channel,c.recipient),c.channel==='email'?'resend':'telnyx',r.email_id||r.message_id||null,status,category,String(c.subject||'Business message').slice(0,180),at,r.reason||null,follow?new Date(Date.now()+86400000).toISOString():null,follow?'pending':null,follow).changes;
  if(!inserted)return db.prepare('SELECT id FROM communication_deliveries WHERE provider=? AND provider_id=?').get(c.channel==='email'?'resend':'telnyx',r.email_id||r.message_id||null)?.id||null;
  for(const event of db.prepare('SELECT * FROM communication_receipt_events WHERE provider=? AND provider_id=? AND applied=0').all(c.channel==='email'?'resend':'telnyx',r.email_id||r.message_id||null))receipt(event.provider,event.event_id,event.provider_id,event.state);
  alert(c.organisationId,{kind:'message_delivery',title:r.sent?'Message accepted by provider':'Message could not be sent',body:`${c.channel.toUpperCase()} · ${c.subject||category}${r.sent?' · delivery confirmation pending':'. Check sender/provider settings and the delivery log.'}`,link:'#delivery',dedupe:`delivery:${id}`});return id;
 }
 function receipt(provider,eventId,messageId,state){
  if(!eventId||!messageId||!['sent','delivered','opened','failed'].includes(state))return;
  db.transaction(()=>{
   db.prepare('INSERT OR IGNORE INTO communication_receipt_events(provider,event_id,provider_id,state) VALUES (?,?,?,?)').run(provider,eventId,messageId,state);
   const event=db.prepare('SELECT * FROM communication_receipt_events WHERE provider=? AND event_id=?').get(provider,eventId);if(event.applied)return;
   const row=db.prepare('SELECT * FROM communication_deliveries WHERE provider=? AND provider_id=?').get(provider,messageId);if(!row)return;
   const at=new Date().toISOString(),rank={accepted:0,sent:1,delivered:2,opened:3,failed:4};
   db.prepare('UPDATE communication_receipt_events SET applied=1 WHERE provider=? AND event_id=?').run(provider,eventId);
   if(rank[state]<rank[row.status])return;
   db.prepare('UPDATE communication_deliveries SET status=?,delivered_at=CASE WHEN ? IN (\'delivered\',\'opened\') THEN COALESCE(delivered_at,?) ELSE delivered_at END,opened_at=CASE WHEN ?=\'opened\' THEN COALESCE(opened_at,?) ELSE opened_at END WHERE id=?').run(state,state,at,state,at,row.id);
   if(state==='failed')db.prepare("UPDATE communication_deliveries SET follow_up_state='cancelled_delivery_failure' WHERE id=? AND follow_up_state='pending'").run(row.id);
   alert(row.organisation_id,{kind:'delivery_receipt',title:`${row.channel==='email'&&state==='opened'?'Email opened (tracking signal)':row.channel.toUpperCase()+' '+state}`,body:row.subject,link:'#delivery',dedupe:`receipt:${row.id}:${state}`});
  })();
 }
 function inbound({organisation_id,channel,contact_address,contact_name,id,audience}){
  db.prepare("UPDATE communication_deliveries SET replied_at=COALESCE(replied_at,?),follow_up_state=CASE WHEN follow_up_state='pending' THEN 'cancelled_reply' ELSE follow_up_state END WHERE organisation_id=? AND channel=? AND recipient=?").run(new Date().toISOString(),organisation_id,channel,norm(channel,contact_address));
  void notify.notifyRoles(organisation_id,audience==='hiring'?['owner','admin']:['owner','admin','manager','director','super_admin'],{kind:'inbound_message',title:`New ${channel} message`,body:`${contact_name||'A contact'} sent a message.`,link:'#comms',dedupe:`inbound:${id}`}).catch(()=>{});
 }
 app.get('/api/saas/message-delivery',requireSaasUser,requireSaasRole('owner','admin'),(req,res)=>res.json({ok:true,receipt_configuration:{email:Boolean(env.RESEND_WEBHOOK_SECRET),sms:Boolean(env.TELNYX_PUBLIC_KEY)},deliveries:db.prepare('SELECT id,channel,recipient,status,category,subject,created_at,delivered_at,opened_at,replied_at,detail,follow_up_at,follow_up_state FROM communication_deliveries WHERE organisation_id=? ORDER BY created_at DESC LIMIT 100').all(req.saas.organisation_id),follow_ups:db.prepare('SELECT follow_ups FROM communication_settings WHERE organisation_id=?').get(req.saas.organisation_id)?.follow_ups!==0}));
 app.put('/api/saas/message-delivery/settings',requireSaasUser,requireSaasRole('owner'),(req,res)=>{const p=z.object({follow_ups:z.boolean()}).strict().safeParse(req.body);if(!p.success)return res.status(400).json({ok:false,error:'Choose a valid follow-up setting.'});db.prepare('INSERT INTO communication_settings VALUES (?,?) ON CONFLICT(organisation_id) DO UPDATE SET follow_ups=excluded.follow_ups').run(req.saas.organisation_id,Number(p.data.follow_ups));res.json({ok:true})});
 app.post('/api/webhooks/communications/resend',async(req,res)=>{
  if(!env.RESEND_WEBHOOK_SECRET)return res.status(503).json({ok:false,error:'Receipt signing secret is not configured.'});
  let event;try{event=new Resend('webhook-verification-only').webhooks.verify({payload:req.rawBody.toString('utf8'),headers:{id:req.get('svix-id'),timestamp:req.get('svix-timestamp'),signature:req.get('svix-signature')},webhookSecret:env.RESEND_WEBHOOK_SECRET})}catch{return res.status(401).json({ok:false,error:'Invalid webhook signature.'})}
  if(event.type==='email.received'&&receiveEmail){
   const emailId=event.data?.email_id;if(!emailId)return res.status(400).json({ok:false,error:'Missing email identifier.'});
   const recipients=(event.data?.to||[]).map(to=>String(to).match(/<([^>]+)>/)?.[1]||String(to));
   const organisations=new Set(recipients.flatMap(to=>db.prepare("SELECT organisation_id FROM comms_channels WHERE channel='email' AND lower(address)=? AND status='active'").all(to.toLowerCase()).map(r=>r.organisation_id)));
   if(organisations.size!==1)return res.json({ok:true,routed:false});
   try{const result=await new Resend(env.RESEND_API_KEY).emails.receiving.get(emailId);if(result.error||!result.data)return res.status(503).json({ok:false,error:'Inbound email could not be retrieved. Retry later.'});const mail=result.data,from=String(mail.from||'').match(/<([^>]+)>/)?.[1]||mail.from;receiveEmail({organisation_id:[...organisations][0],channel:'email',contact_address:from,subject:mail.subject||null,body:mail.text||'Email received; open the provider inbox for HTML-only content.',provider:'resend',external_message_id:emailId});return res.json({ok:true,routed:true})}catch{return res.status(503).json({ok:false,error:'Inbound email retrieval is temporarily unavailable.'})}
  }
  const state={'email.sent':'sent','email.delivered':'delivered','email.opened':'opened','email.bounced':'failed','email.failed':'failed','email.complained':'failed','email.suppressed':'failed'}[event.type];
  receipt('resend',req.get('svix-id'),event.data?.email_id,state);res.json({ok:true});
 });
 app.post('/api/webhooks/communications/telnyx',(req,res)=>{
  if(!verifyTelnyx(req))return res.status(401).json({ok:false,error:'Invalid webhook signature.'});
  const event=req.body?.data,p=event?.payload;if(event?.event_type==='message.sent')receipt('telnyx',event.id,p?.id,'sent');if(event?.event_type==='message.finalized')receipt('telnyx',event.id,p?.id,p?.to?.some(t=>t.status==='delivered')?'delivered':'failed');
  res.json({ok:true});
 });
 let ticking=false;
 async function tick(){
  if(ticking)return;ticking=true;
  try{const rows=db.prepare("SELECT d.* FROM communication_deliveries d LEFT JOIN communication_settings s ON s.organisation_id=d.organisation_id WHERE d.follow_up_state='pending' AND d.follow_up_at<=? AND d.replied_at IS NULL AND d.status<>'failed' AND COALESCE(s.follow_ups,1)=1 LIMIT 20").all(new Date().toISOString());
   for(const row of rows){
    if(!db.prepare("UPDATE communication_deliveries SET follow_up_state='sending' WHERE id=? AND follow_up_state='pending' AND replied_at IS NULL").run(row.id).changes)continue;
    try{const payload=JSON.parse(row.follow_up_json);const r=await sendFollowUp(row,payload);db.prepare('UPDATE communication_deliveries SET follow_up_state=? WHERE id=?').run(r.sent?'sent':'failed',row.id)}catch{db.prepare("UPDATE communication_deliveries SET follow_up_state='failed' WHERE id=?").run(row.id)}
   }
  }finally{ticking=false}
 }
 active={record,inbound};const timer=timers?setInterval(()=>void tick(),60000):null;timer?.unref();
 return {record,receipt,inbound,tick,stop(){if(timer)clearInterval(timer)}};
}
