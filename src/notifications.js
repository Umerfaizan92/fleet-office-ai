// Personal alerts. Each alert belongs to one user in one business. Urgent ones (a job offered to a worker) also go to the
// person's mobile by text; everything else stays in the app bell, so nobody is messaged more than they need to be.
import crypto from 'node:crypto';
import {z} from 'zod';
import { sendTextMessage } from './notify.js';

export function installNotifications(app, { db, env, requireSaasUser }) {
  db.exec(`CREATE TABLE IF NOT EXISTS notification_preferences(organisation_id TEXT NOT NULL,user_id TEXT NOT NULL,muted INTEGER NOT NULL DEFAULT 0,sound INTEGER NOT NULL DEFAULT 1,browser INTEGER NOT NULL DEFAULT 0,sms INTEGER NOT NULL DEFAULT 1,PRIMARY KEY(organisation_id,user_id));`);
  const preferences=(org,user)=>{const row=db.prepare('SELECT muted,sound,browser,sms FROM notification_preferences WHERE organisation_id=? AND user_id=?').get(org,user)||{muted:0,sound:1,browser:0,sms:1};return Object.fromEntries(Object.entries(row).map(([k,v])=>[k,Boolean(v)]))};
  app.get('/api/saas/notification-preferences',requireSaasUser,(req,res)=>res.json({ok:true,preferences:preferences(req.saas.organisation_id,req.saas.user_id)}));
  app.put('/api/saas/notification-preferences',requireSaasUser,(req,res)=>{
    const p=z.object({muted:z.boolean(),sound:z.boolean(),browser:z.boolean(),sms:z.boolean()}).strict().safeParse(req.body);
    if(!p.success)return res.status(400).json({ok:false,error:'Choose valid notification preferences.'});
    db.prepare('INSERT INTO notification_preferences(organisation_id,user_id,muted,sound,browser,sms) VALUES (?,?,?,?,?,?) ON CONFLICT(organisation_id,user_id) DO UPDATE SET muted=excluded.muted,sound=excluded.sound,browser=excluded.browser,sms=excluded.sms').run(req.saas.organisation_id,req.saas.user_id,...['muted','sound','browser','sms'].map(k=>Number(p.data[k])));
    res.json({ok:true,preferences:p.data});
  });
  const orgName = (org) => db.prepare(`SELECT COALESCE(display_name,name) n FROM organisations WHERE id=?`).get(org)?.n || 'Super Pro';

  async function notifyUser(org, userId, { kind, title, body = '', link = '', urgent = false, dedupe = null }) {
    if(!db.prepare("SELECT 1 FROM memberships WHERE organisation_id=? AND user_id=? AND status='active'").get(org,userId))return null;
    const id = crypto.randomUUID(), at = new Date().toISOString();
    const ins = db.prepare(`INSERT OR IGNORE INTO user_notifications (id,organisation_id,user_id,kind,title,body,link,urgent,dedupe_key,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)`)
      .run(id, org, userId, kind, String(title).slice(0, 180), String(body).slice(0, 600), link, urgent ? 1 : 0, dedupe, at);
    if (!ins.changes || !urgent || !preferences(org,userId).sms) return ins.changes ? { id } : null;
    const phone = db.prepare(`SELECT phone FROM users WHERE id=?`).get(userId)?.phone;
    const r = await sendTextMessage(env, { to: phone,delivery:{organisationId:org,userId,category:kind,subject:title}, text: `${orgName(org)}: ${title}${body ? '. ' + body : ''}`.slice(0, 300) });
    db.prepare(`UPDATE user_notifications SET sms_status=? WHERE id=?`).run(r.sent ? 'sent' : r.reason, id);
    return { id, sms: r.sent };
  }
  async function notifyRoles(org, roles, opts) {
    const users = db.prepare(`SELECT user_id FROM memberships WHERE organisation_id=? AND status='active' AND role IN (${roles.map(() => '?').join(',')})`).all(org, ...roles);
    for (const u of users){if(u.user_id===opts.excludeUserId)continue;await notifyUser(org, u.user_id, { ...opts, dedupe: opts.dedupe ? `${opts.dedupe}:${u.user_id}` : null });}
  }

  app.get('/api/saas/notifications', requireSaasUser, (req, res) => {
    const rows = db.prepare(`SELECT id,kind,title,body,link,urgent,created_at,read_at FROM user_notifications WHERE user_id=? AND organisation_id=? ORDER BY created_at DESC LIMIT 50`).all(req.saas.user_id, req.saas.organisation_id);
    res.json({ ok: true, notifications: rows, unread: db.prepare('SELECT COUNT(*) n FROM user_notifications WHERE user_id=? AND organisation_id=? AND read_at IS NULL').get(req.saas.user_id,req.saas.organisation_id).n,preferences:preferences(req.saas.organisation_id,req.saas.user_id) });
  });
  app.post('/api/saas/notifications/read', requireSaasUser, (req, res) => {
    const p=z.object({ids:z.array(z.string().uuid()).max(50).optional()}).safeParse(req.body||{});
    if(!p.success)return res.status(400).json({ok:false,error:'Choose valid notifications.'});
    const ids=p.data.ids;
    if(!ids||ids.length)db.prepare(`UPDATE user_notifications SET read_at=? WHERE user_id=? AND organisation_id=? AND read_at IS NULL${ids?' AND id IN ('+ids.map(()=>'?').join(',')+')':''}`).run(new Date().toISOString(),req.saas.user_id,req.saas.organisation_id,...(ids||[]));
    res.json({ ok: true });
  });
  function auditEvent(req,event,entityId,auditId){
    const map={
      'worker.created':['Employee / worker added','#workforce'],
      'team.invitation_created':['Staff invitation created','#team'],
      'team.invitation_accepted':['Employee joined the business','#team'],
      'team.role_authorised':['Staff authorisation updated','#team'],
      'worker.document_uploaded':['Worker document uploaded','#workforce'],
      'worker.onboarding_invited':['Workforce onboarding invitation created','#workforce'],
      'customer.created':['Customer added','#customers'],
      'staff_chat.message':['New staff message','#staff-chat']
    };
    const match=map[event];if(!match)return;
    const roles=event==='staff_chat.message'?['owner','admin','manager','super_admin','director','employee','contractor']:['owner','admin'];
    const actor=req.saas.full_name||db.prepare('SELECT full_name FROM users WHERE id=?').get(req.saas.user_id)?.full_name||'A team member';
    void notifyRoles(req.saas.organisation_id,roles,{kind:event.replaceAll('.','_'),title:event==='staff_chat.message'?`New message from ${actor}`:match[0],body:event==='staff_chat.message'?'Open Office chat to read and reply.':`${actor} updated the business. Open the relevant section to review.`,link:match[1],excludeUserId:event==='staff_chat.message'?req.saas.user_id:null,dedupe:`audit:${auditId}`}).catch(()=>{});
  }
  return { notifyUser, notifyRoles, auditEvent };
}
