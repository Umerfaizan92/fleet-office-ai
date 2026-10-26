// A per-business record of everything done on or through each connected platform (Facebook, X, YouTube, WhatsApp...).
// Only the owner and the people the owner names can read it. Tokens and secrets are never written to this log.
import { z } from 'zod';
import { appendAuditLog } from './db.js';

const LABELS = { meta: 'Facebook & Instagram', facebook: 'Facebook', instagram: 'Instagram', whatsapp: 'WhatsApp', tiktok: 'TikTok', youtube: 'YouTube', snapchat: 'Snapchat', x: 'X', google_business: 'Google Business Profile', website: 'Website', email_sms: 'Email & SMS' };
const SHOW = ['platform', 'count', 'ok', 'error', 'external_id', 'kind', 'resource_count', 'refreshed', 'type'];
const OWNER_ROLES = ['owner', 'super_admin'];
const human = (a) => { const s = String(a).split('.').slice(1).join(' ').replaceAll('_', ' ') || String(a); return s.charAt(0).toUpperCase() + s.slice(1); };

export function installActivity(app, { db, requireSaasUser }) {
  db.exec(`CREATE TABLE IF NOT EXISTS activity_access (organisation_id TEXT NOT NULL, user_id TEXT NOT NULL, granted_by TEXT, created_at TEXT NOT NULL, PRIMARY KEY(organisation_id,user_id));`);
  const canSee = (req) => OWNER_ROLES.includes(req.saas.role) || Boolean(db.prepare(`SELECT 1 FROM activity_access WHERE organisation_id=? AND user_id=?`).get(req.saas.organisation_id, req.saas.user_id));
  const deny = (res) => res.status(403).json({ ok: false, error: 'Only the owner, or people the owner has allowed, can see platform activity.' });
  const audit = (req, action, metadata) => appendAuditLog(db, { organisation_id: req.saas.organisation_id, user_id: req.saas.user_id, user_name: req.saas.full_name || null, user_role: req.saas.role, action, module: 'activity', entity_type: 'activity', metadata });
  const platformOf = (row, meta) => {
    if (row.action.startsWith('integration.') && LABELS[row.entity_id]) return row.entity_id;
    if (LABELS[meta.platform]) return meta.platform;
    if (LABELS[meta.channel]) return meta.channel;
    return null;
  };

  app.get('/api/saas/activity', requireSaasUser, (req, res) => {
    if (!canSee(req)) return deny(res);
    const q = z.object({ platform: z.string().max(30).optional(), limit: z.coerce.number().int().min(1).max(300).default(100) }).safeParse(req.query);
    const org = req.saas.organisation_id, limit = q.success ? q.data.limit : 100;
    const rows = db.prepare(`SELECT id,user_name,user_role,action,entity_id,metadata_json,created_at FROM audit_logs WHERE organisation_id=? AND (action LIKE 'integration.%' OR action LIKE 'growth.%' OR action LIKE 'comms.%' OR action LIKE 'content.%' OR action LIKE 'media.%') ORDER BY created_at DESC, rowid DESC LIMIT 1500`).all(org);
    const events = [];
    const since = Date.now() - 30 * 86400000, stats = {};
    for (const r of rows) {
      let meta = {}; try { meta = JSON.parse(r.metadata_json || '{}'); } catch { /* ignore */ }
      const platform = platformOf(r, meta);
      if (platform) {
        const s = (stats[platform] ||= { events_30d: 0, published_30d: 0, failed_30d: 0, last_activity: r.created_at });
        if (Date.parse(r.created_at) >= since) { s.events_30d++; if (r.action === 'growth.post_published') s.published_30d++; if (r.action === 'growth.post_failed' || meta.ok === false) s.failed_30d++; }
      }
      if (q.success && q.data.platform && platform !== q.data.platform) continue;
      if (events.length < limit) events.push({ id: r.id, at: r.created_at, who: r.user_name || (r.user_role ? r.user_role : 'Automatic'), action: human(r.action), platform, platform_label: platform ? LABELS[platform] : null, detail: Object.fromEntries(Object.entries(meta).filter(([k, v]) => SHOW.includes(k) && typeof v !== 'object').map(([k, v]) => [k, String(v).slice(0, 200)])) });
    }
    const conns = db.prepare(`SELECT provider,status,account_label FROM organisation_integrations WHERE organisation_id=?`).all(org);
    const summary = conns.filter((c) => LABELS[c.provider]).map((c) => ({ platform: c.provider, label: LABELS[c.provider], connected: c.status === 'connected', account: c.account_label || null, events_30d: 0, published_30d: 0, failed_30d: 0, last_activity: null, ...(stats[c.provider] || {}) }));
    audit(req, 'activity.viewed', { count: events.length });
    res.json({ ok: true, summary, events, can_manage: OWNER_ROLES.includes(req.saas.role) });
  });

  app.get('/api/saas/activity/access', requireSaasUser, (req, res) => {
    if (!OWNER_ROLES.includes(req.saas.role)) return deny(res);
    const org = req.saas.organisation_id;
    const people = db.prepare(`SELECT u.id,u.full_name,u.email,m.role,CASE WHEN a.user_id IS NULL THEN 0 ELSE 1 END allowed FROM memberships m JOIN users u ON u.id=m.user_id LEFT JOIN activity_access a ON a.organisation_id=m.organisation_id AND a.user_id=u.id WHERE m.organisation_id=? AND m.status='active' AND m.role NOT IN ('owner','super_admin') ORDER BY u.full_name`).all(org);
    res.json({ ok: true, people: people.map((p) => ({ ...p, allowed: Boolean(p.allowed) })) });
  });
  app.put('/api/saas/activity/access', requireSaasUser, (req, res) => {
    if (!OWNER_ROLES.includes(req.saas.role)) return deny(res);
    const p = z.object({ user_id: z.string().uuid(), allowed: z.boolean() }).safeParse(req.body);
    if (!p.success) return res.status(400).json({ ok: false, error: 'Choose a person.' });
    const org = req.saas.organisation_id;
    if (!db.prepare(`SELECT 1 FROM memberships WHERE organisation_id=? AND user_id=? AND status='active'`).get(org, p.data.user_id)) return res.status(404).json({ ok: false, error: 'That person is not in your business.' });
    if (p.data.allowed) db.prepare(`INSERT OR IGNORE INTO activity_access (organisation_id,user_id,granted_by,created_at) VALUES (?,?,?,?)`).run(org, p.data.user_id, req.saas.user_id, new Date().toISOString());
    else db.prepare(`DELETE FROM activity_access WHERE organisation_id=? AND user_id=?`).run(org, p.data.user_id);
    audit(req, p.data.allowed ? 'activity.access_granted' : 'activity.access_revoked', { kind: 'user', count: 1 });
    res.json({ ok: true });
  });
}
