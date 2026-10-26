// Personal alerts. Each alert belongs to one user in one business. Urgent ones (a job offered to a worker) also go to the
// person's mobile by text; everything else stays in the app bell, so nobody is messaged more than they need to be.
import crypto from 'node:crypto';
import { sendTextMessage } from './notify.js';

export function installNotifications(app, { db, env, requireSaasUser }) {
  const orgName = (org) => db.prepare(`SELECT COALESCE(display_name,name) n FROM organisations WHERE id=?`).get(org)?.n || 'Super Pro';

  async function notifyUser(org, userId, { kind, title, body = '', link = '', urgent = false, dedupe = null }) {
    const id = crypto.randomUUID(), at = new Date().toISOString();
    const ins = db.prepare(`INSERT OR IGNORE INTO user_notifications (id,organisation_id,user_id,kind,title,body,link,urgent,dedupe_key,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)`)
      .run(id, org, userId, kind, String(title).slice(0, 180), String(body).slice(0, 600), link, urgent ? 1 : 0, dedupe, at);
    if (!ins.changes || !urgent) return ins.changes ? { id } : null;
    const phone = db.prepare(`SELECT phone FROM users WHERE id=?`).get(userId)?.phone;
    const r = await sendTextMessage(env, { to: phone, text: `${orgName(org)}: ${title}${body ? '. ' + body : ''}`.slice(0, 300) });
    db.prepare(`UPDATE user_notifications SET sms_status=? WHERE id=?`).run(r.sent ? 'sent' : r.reason, id);
    return { id, sms: r.sent };
  }
  async function notifyRoles(org, roles, opts) {
    const users = db.prepare(`SELECT user_id FROM memberships WHERE organisation_id=? AND status='active' AND role IN (${roles.map(() => '?').join(',')})`).all(org, ...roles);
    for (const u of users) await notifyUser(org, u.user_id, { ...opts, dedupe: opts.dedupe ? `${opts.dedupe}:${u.user_id}` : null });
  }

  app.get('/api/saas/notifications', requireSaasUser, (req, res) => {
    const rows = db.prepare(`SELECT id,kind,title,body,link,urgent,created_at,read_at FROM user_notifications WHERE user_id=? AND organisation_id=? ORDER BY created_at DESC LIMIT 50`).all(req.saas.user_id, req.saas.organisation_id);
    res.json({ ok: true, notifications: rows, unread: rows.filter((r) => !r.read_at).length });
  });
  app.post('/api/saas/notifications/read', requireSaasUser, (req, res) => {
    db.prepare(`UPDATE user_notifications SET read_at=? WHERE user_id=? AND organisation_id=? AND read_at IS NULL`).run(new Date().toISOString(), req.saas.user_id, req.saas.organisation_id);
    res.json({ ok: true });
  });
  return { notifyUser, notifyRoles };
}
