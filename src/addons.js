// Extra storage, AI requests and team logins that a business can add on top of its plan.
// A member asks for an add-on; it counts toward their limits once the operator confirms it (until a payment
// provider is connected there is nothing to charge automatically). Cancelling only lowers the limit for NEW items.
import crypto from 'node:crypto';
import { z } from 'zod';
import { appendAuditLog } from './db.js';

// Pay for what you use: small packs you can stack. Prices are AUD a month, excluding GST (list price).
export const ADDONS = {
  storage_1gb: { name: 'Extra storage', unit: '1 GB', limit_key: 'media', per_unit: 1024, price_cents: 100, note: 'Photos, video and documents. Add as many GB as you need.', max: 500 },
  storage_10gb: { name: 'Extra storage (10 GB pack)', unit: '10 GB', limit_key: 'media', per_unit: 10240, price_cents: 500, note: 'Better value if you need a lot of room.', max: 50 },
  ai_100: { name: 'Extra AI requests', unit: '100 requests a month', limit_key: 'ai', per_unit: 100, price_cents: 300, note: 'Content, replies and reports written by AI.', max: 100 },
  ai_500: { name: 'Extra AI requests (500 pack)', unit: '500 requests a month', limit_key: 'ai', per_unit: 500, price_cents: 1200, note: 'Better value for busy months.', max: 40 },
  login_1: { name: 'Extra team login', unit: '1 login', limit_key: 'business_users', per_unit: 1, price_cents: 1200, note: 'Another person who can sign in.', max: 50 }
};
// Add-on discount by plan (percent off the list price). Starter pays list price.
export const PLAN_DISCOUNT = { starter: 0, operations: 25, scale: 50 };
const PLAN_ALIAS = { 'founder-trial': 'operations' };
export const discounted = (listCents, pct) => Math.max(0, Math.round(listCents * (100 - pct) / 100));
const FINANCE = ['owner', 'admin', 'super_admin'];
const iso = () => new Date().toISOString();

export function createAddons({ db }) {
  db.exec(`CREATE TABLE IF NOT EXISTS organisation_addons (
    id TEXT PRIMARY KEY, organisation_id TEXT NOT NULL, addon_id TEXT NOT NULL, quantity INTEGER NOT NULL DEFAULT 1,
    status TEXT NOT NULL DEFAULT 'requested' CHECK(status IN ('requested','active','cancelled','declined')),
    price_cents INTEGER NOT NULL, requested_by TEXT, requested_at TEXT NOT NULL, activated_at TEXT, cancelled_at TEXT,
    FOREIGN KEY(organisation_id) REFERENCES organisations(id) ON DELETE CASCADE);
    CREATE INDEX IF NOT EXISTS idx_org_addons ON organisation_addons(organisation_id, status);`);
  for (const col of ['list_price_cents INTEGER', 'discount_pct INTEGER NOT NULL DEFAULT 0']) { try { db.exec(`ALTER TABLE organisation_addons ADD COLUMN ${col}`); } catch { /* already there */ } }
  function planKey(org) {
    const r = db.prepare(`SELECT plan_id FROM organisation_subscriptions WHERE organisation_id=?`).get(org);
    const id = PLAN_ALIAS[r?.plan_id] || r?.plan_id;
    return PLAN_DISCOUNT[id] !== undefined ? id : 'starter';
  }

  // Extra room per limit key from confirmed add-ons only.
  function extras(org) {
    const out = {};
    for (const r of db.prepare(`SELECT addon_id,quantity FROM organisation_addons WHERE organisation_id=? AND status='active'`).all(org)) {
      const a = ADDONS[r.addon_id]; if (a) out[a.limit_key] = (out[a.limit_key] || 0) + a.per_unit * r.quantity;
    }
    return out;
  }
  const mine = (org) => db.prepare(`SELECT * FROM organisation_addons WHERE organisation_id=? AND status IN ('requested','active') ORDER BY requested_at DESC`).all(org).map((r) => ({ id: r.id, addon_id: r.addon_id, name: ADDONS[r.addon_id]?.name, unit: ADDONS[r.addon_id]?.unit, quantity: r.quantity, status: r.status, monthly_cents: r.price_cents * r.quantity, discount_pct: r.discount_pct || 0, requested_at: r.requested_at, activated_at: r.activated_at }));

  function install(app, { requireSaasUser, requireSaasRole, requireAdmin, saasAudit, notify, lifecycle }) {
    app.get('/api/saas/addons', requireSaasUser, requireSaasRole(...FINANCE, 'manager', 'director'), (req, res) => {
      const plan = planKey(req.saas.organisation_id), pct = PLAN_DISCOUNT[plan];
      res.json({ ok: true, plan, discount_pct: pct, discount_tiers: PLAN_DISCOUNT, catalog: Object.entries(ADDONS).map(([id, a]) => ({ id, name: a.name, unit: a.unit, list_price_cents: a.price_cents, price_cents: discounted(a.price_cents, pct), max: a.max, note: a.note })), mine: mine(req.saas.organisation_id), prices_exclude_gst: true });
    });
    app.post('/api/saas/addons', requireSaasUser, requireSaasRole(...FINANCE), (req, res) => {
      const p = z.object({ addon_id: z.enum(Object.keys(ADDONS)), quantity: z.number().int().min(1).max(500).default(1) }).safeParse(req.body);
      if (!p.success) return res.status(400).json({ ok: false, error: 'Choose an add-on and a whole quantity.' });
      const org = req.saas.organisation_id;
      if (p.data.quantity > ADDONS[p.data.addon_id].max) return res.status(400).json({ ok: false, error: `You can request up to ${ADDONS[p.data.addon_id].max} at a time. Contact support for more.` });
      if (db.prepare(`SELECT COUNT(*) c FROM organisation_addons WHERE organisation_id=? AND status='requested'`).get(org).c >= 10) return res.status(429).json({ ok: false, error: 'You already have several requests waiting. We will confirm them shortly.' });
      const id = crypto.randomUUID(), a = ADDONS[p.data.addon_id];
      const pct = PLAN_DISCOUNT[planKey(org)], unit = discounted(a.price_cents, pct);
      db.prepare(`INSERT INTO organisation_addons (id,organisation_id,addon_id,quantity,price_cents,list_price_cents,discount_pct,requested_by,requested_at) VALUES (?,?,?,?,?,?,?,?,?)`).run(id, org, p.data.addon_id, p.data.quantity, unit, a.price_cents, pct, req.saas.user_id, iso());
      saasAudit(req, 'billing.addon_requested', 'addon', id, { kind: p.data.addon_id, count: p.data.quantity, discount_pct: pct });
      res.status(201).json({ ok: true, id, monthly_cents: unit * p.data.quantity, discount_pct: pct, message: `Requested${pct ? ` with your ${pct}% plan discount` : ''}. We will confirm it shortly and email you the details.` });
    });
    app.post('/api/saas/addons/:id/cancel', requireSaasUser, requireSaasRole(...FINANCE), (req, res) => {
      const r = db.prepare(`SELECT * FROM organisation_addons WHERE id=? AND organisation_id=? AND status IN ('requested','active')`).get(req.params.id, req.saas.organisation_id);
      if (!r) return res.status(404).json({ ok: false, error: 'Add-on not found.' });
      db.prepare(`UPDATE organisation_addons SET status='cancelled',cancelled_at=? WHERE id=?`).run(iso(), r.id);
      saasAudit(req, 'billing.addon_cancelled', 'addon', r.id, { kind: r.addon_id });
      res.json({ ok: true, note: 'Cancelled. Everything you already saved stays. New items follow your plan limits.' });
    });

    // Operator side: business name and request only.
    app.get('/api/admin/addons', requireAdmin, (req, res) => {
      const rows = db.prepare(`SELECT a.*,COALESCE(o.display_name,o.name) business FROM organisation_addons a JOIN organisations o ON o.id=a.organisation_id WHERE a.status IN ('requested','active') ORDER BY (a.status='requested') DESC, a.requested_at DESC LIMIT 300`).all();
      res.json({ ok: true, addons: rows.map((r) => ({ id: r.id, business: r.business, name: ADDONS[r.addon_id]?.name, unit: ADDONS[r.addon_id]?.unit, quantity: r.quantity, status: r.status, monthly_cents: r.price_cents * r.quantity, requested_at: r.requested_at, activated_at: r.activated_at })), monthly_cents: rows.filter((r) => r.status === 'active').reduce((n, r) => n + r.price_cents * r.quantity, 0) });
    });
    app.post('/api/admin/addons/:id/:action', requireAdmin, async (req, res) => {
      if (!['activate', 'decline', 'cancel'].includes(req.params.action)) return res.status(404).json({ ok: false, error: 'Unknown action.' });
      const r = db.prepare(`SELECT * FROM organisation_addons WHERE id=?`).get(req.params.id);
      if (!r) return res.status(404).json({ ok: false, error: 'Add-on not found.' });
      const next = { activate: 'active', decline: 'declined', cancel: 'cancelled' }[req.params.action];
      if (next === 'active' && r.status !== 'requested') return res.status(409).json({ ok: false, error: 'Only a waiting request can be activated.' });
      db.prepare(`UPDATE organisation_addons SET status=?,activated_at=CASE WHEN ?='active' THEN ? ELSE activated_at END,cancelled_at=CASE WHEN ?='active' THEN cancelled_at ELSE ? END WHERE id=?`).run(next, next, iso(), next, iso(), r.id);
      appendAuditLog(db, { organisation_id: r.organisation_id, action: `billing.addon_${next}`, module: 'billing', entity_type: 'addon', entity_id: r.id, metadata: { kind: r.addon_id, count: r.quantity } });
      const a = ADDONS[r.addon_id];
      let email = 'not_needed';
      if (next === 'active') { const m = await lifecycle?.sendAddonActive?.(r.organisation_id, { id: r.id, name: a.name, unit: a.unit, quantity: r.quantity, monthly_cents: r.price_cents * r.quantity }); email = m?.sent ? 'sent' : (m?.reason || 'queued'); }
      if (next !== 'active') notify?.notifyRoles?.(r.organisation_id, ['owner', 'admin'], { kind: 'billing', title: next === 'declined' ? 'Add-on request not approved' : 'Add-on cancelled', body: `${a.name} (${r.quantity} × ${a.unit}). Contact support if you have questions.`, link: '#billing', dedupe: `addon:${r.id}:${next}` })?.catch?.(() => {});
      res.json({ ok: true, status: next, email });
    });
  }
  return { extras, mine, install };
}
