// The operator's side of subscriptions: monthly invoice drafts you approve one by one and schedule, reminders set in
// advance, a "needs your attention" list, and a profile page for each subscriber. Everything here is account-level.
// Platform invoices belong to Super Pro and its subscribers only. They share nothing with a business's own customer invoices.
import crypto from 'node:crypto';
import { z } from 'zod';
import { appendAuditLog } from './db.js';
import { ADDONS } from './addons.js';
import { sendBrandedEmail } from './mailer.js';
import { renderEmail, platformBrand, PLATFORM_NAME } from './email-templates.js';

const DAY = 86400000, HOUR = 3600000;
const iso = (d = new Date()) => d.toISOString();
const money = (c) => '$' + (c / 100).toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const gstOf = (subtotal) => Math.round(subtotal * 0.1);
const monthStart = (y, m) => new Date(Date.UTC(y, m, 1, 0, 0, 0)); // 1st of the month, UTC
const TIMELINE = ['account.', 'subscription.', 'billing.', 'team.invitation_created', 'integration.connected', 'integration.disconnected'];

export function createBillingOps({ db, env, lifecycle, entitlements, audit = (e) => appendAuditLog(db, e), timers = true, policy = null, extraAttention = () => [], payUrl = () => null }) {
  db.exec(`CREATE TABLE IF NOT EXISTS platform_invoices (
      id TEXT PRIMARY KEY, organisation_id TEXT NOT NULL, number TEXT NOT NULL UNIQUE, period_start TEXT NOT NULL, period_end TEXT NOT NULL,
      lines_json TEXT NOT NULL, subtotal_cents INTEGER NOT NULL, gst_cents INTEGER NOT NULL, total_cents INTEGER NOT NULL, note TEXT,
      status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','approved','sent','paid','void')),
      due_at TEXT NOT NULL, send_at TEXT, approved_at TEXT, sent_at TEXT, paid_at TEXT, payment_ref TEXT, last_error TEXT, created_at TEXT NOT NULL,
      UNIQUE(organisation_id, period_start), FOREIGN KEY(organisation_id) REFERENCES organisations(id) ON DELETE CASCADE);
    CREATE INDEX IF NOT EXISTS idx_platform_invoices_status ON platform_invoices(status, send_at);
    CREATE TABLE IF NOT EXISTS operator_reminders (id TEXT PRIMARY KEY, organisation_id TEXT, title TEXT NOT NULL, due_at TEXT NOT NULL, done_at TEXT, created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS operator_digest_log (day TEXT PRIMARY KEY, sent_at TEXT NOT NULL);`);

  const leadDays = () => Math.max(1, Math.min(20, Number(env.INVOICE_LEAD_DAYS) || 5));
  const auditFor = (org, action, metadata) => audit({ organisation_id: org, user_id: null, user_name: 'Platform operator', user_role: 'operator', action, module: 'billing', entity_type: 'invoice', entity_id: org, metadata });
  const nextNumber = () => { const y = new Date().getUTCFullYear(), n = db.prepare(`SELECT COUNT(*) c FROM platform_invoices WHERE number LIKE ?`).get(`SP-${y}-%`).c + 1; return `SP-${y}-${String(n).padStart(4, '0')}`; };

  // ----- drafts -----
  function linesFor(org) {
    const sub = db.prepare(`SELECT p.name,p.monthly_fee_cents FROM organisation_subscriptions s JOIN subscription_plans p ON p.id=s.plan_id WHERE s.organisation_id=?`).get(org);
    const lines = [{ description: `${sub.name} plan, 1 month`, cents: sub.monthly_fee_cents }];
    for (const a of db.prepare(`SELECT addon_id,quantity,price_cents FROM organisation_addons WHERE organisation_id=? AND status='active'`).all(org)) lines.push({ description: `${a.quantity} × ${ADDONS[a.addon_id]?.name || 'Add-on'} (${ADDONS[a.addon_id]?.unit || ''})`, cents: a.price_cents * a.quantity });
    return lines;
  }
  function createDraft(org, periodStart, { note = '' } = {}) {
    if(policy?.active(org))return null;
    const start = new Date(periodStart), end = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1) - 1000);
    if (db.prepare(`SELECT 1 FROM platform_invoices WHERE organisation_id=? AND period_start=?`).get(org, iso(start))) return null;
    const lines = linesFor(org), subtotal = lines.reduce((n, l) => n + l.cents, 0);
    if (subtotal <= 0) return null;
    const id = crypto.randomUUID();
    db.prepare(`INSERT INTO platform_invoices (id,organisation_id,number,period_start,period_end,lines_json,subtotal_cents,gst_cents,total_cents,note,due_at,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`)
      .run(id, org, nextNumber(), iso(start), iso(end), JSON.stringify(lines), subtotal, gstOf(subtotal), subtotal + gstOf(subtotal), note, iso(new Date(start.getTime() + 7 * DAY)), iso());
    return id;
  }
  // Drafts for the next month are prepared `leadDays` before it starts, for paying subscribers only.
  function prepareDrafts(now = new Date()) {
    const next = monthStart(now.getUTCFullYear(), now.getUTCMonth() + 1);
    if (next.getTime() - now.getTime() > leadDays() * DAY) return 0;
    let n = 0;
    for (const s of db.prepare(`SELECT organisation_id FROM organisation_subscriptions WHERE status='active'`).all()) if (createDraft(s.organisation_id, next)) n++;
    return n;
  }


  // Marks an invoice paid (once), reactivates the subscription and emails the receipt. Used by the operator and by verified provider messages.
  async function settle(invoiceId, { reference, via = 'operator' }) {
    const inv = db.prepare(`SELECT * FROM platform_invoices WHERE id=?`).get(invoiceId);
    if (!inv || !['sent', 'approved'].includes(inv.status)) return null;
    const now = iso();
    const changed = db.transaction(() => {
      const r = db.prepare(`UPDATE platform_invoices SET status='paid',paid_at=?,payment_ref=? WHERE id=? AND status IN ('sent','approved')`).run(now, String(reference).slice(0, 80), inv.id);
      if (r.changes) db.prepare(`UPDATE organisation_subscriptions SET payment_status='paid',status='active',trial_ends_at=NULL,updated_at=? WHERE organisation_id=?`).run(now, inv.organisation_id);
      return r.changes;
    })();
    if (!changed) return null;
    auditFor(inv.organisation_id, 'billing.invoice_paid', { kind: inv.number, via });
    return lifecycle.sendPaymentReceipt(inv.organisation_id, { amount_cents: inv.total_cents, reference: `${inv.number}:${reference}` });
  }

  // ----- sending and reminders -----
  const invoiceFrame = (inv, org) => {
    const lines = JSON.parse(inv.lines_json), abn = String(env.PLATFORM_ABN || '').trim();
    return { org, lines, abn, legal: String(env.PLATFORM_LEGAL_NAME || PLATFORM_NAME) };
  };
  async function sendInvoiceEmail(inv, { reminder = false } = {}) {
    const f = invoiceFrame(inv), r = await lifecycle.sendInvoice(inv.organisation_id, { id: inv.id, number: inv.number, lines: f.lines, subtotal_cents: inv.subtotal_cents, gst_cents: inv.gst_cents, total_cents: inv.total_cents, due_at: inv.due_at, period_start: inv.period_start, abn: f.abn, legal: f.legal, reminder, pay_url: payUrl(inv) });
    return r;
  }
  async function sendDue(now = new Date()) {
    let n = 0;
    for (const inv of db.prepare(`SELECT * FROM platform_invoices WHERE status='approved' AND send_at<=? ORDER BY send_at LIMIT 50`).all(iso(now))) {
      if(policy?.active(inv.organisation_id))continue;
      const r = await sendInvoiceEmail(inv);
      if (r.sent || r.reason === 'already_sent') { db.prepare(`UPDATE platform_invoices SET status='sent',sent_at=?,last_error=NULL WHERE id=?`).run(iso(), inv.id); auditFor(inv.organisation_id, 'billing.invoice_sent', { kind: inv.number }); n++; }
      else db.prepare(`UPDATE platform_invoices SET last_error=? WHERE id=?`).run(String(r.reason || 'email not sent').slice(0, 200), inv.id);
    }
    return n;
  }
  // Gentle reminders after the due date. They never restrict an account.
  async function remindOverdue(now = new Date()) {
    let n = 0;
    for (const inv of db.prepare(`SELECT * FROM platform_invoices WHERE status='sent' AND due_at<?`).all(iso(now))) {
      if(policy?.active(inv.organisation_id))continue;
      const late = Math.floor((now.getTime() - Date.parse(inv.due_at)) / DAY), step = late >= 7 ? 7 : late >= 3 ? 3 : 0;
      if (!step) continue;
      const r = await sendInvoiceEmail({ ...inv }, { reminder: step });
      if (r.sent) n++;
    }
    return n;
  }

  // ----- what needs the operator -----
  function attention(now = new Date()) {
    const t = now.getTime(), soon = iso(new Date(t + 7 * DAY)), items = [];
    const biz = (id) => db.prepare(`SELECT COALESCE(display_name,name) n FROM organisations WHERE id=?`).get(id)?.n || 'A business';
    for (const i of db.prepare(`SELECT * FROM platform_invoices WHERE status='draft' ORDER BY period_start`).all()) items.push({ kind: 'invoice_draft', level: 'action', org: i.organisation_id, invoice_id: i.id, text: `${biz(i.organisation_id)}: invoice ${i.number} for ${money(i.total_cents)} is ready to approve`, when: i.period_start });
    for (const i of db.prepare(`SELECT * FROM platform_invoices WHERE status='approved' AND send_at<=? ORDER BY send_at`).all(soon)) items.push({ kind: 'invoice_scheduled', level: 'info', org: i.organisation_id, invoice_id: i.id, text: `${biz(i.organisation_id)}: invoice ${i.number} sends ${new Date(i.send_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}${i.last_error ? ' (last try failed: ' + i.last_error + ')' : ''}`, when: i.send_at });
    for (const i of db.prepare(`SELECT * FROM platform_invoices WHERE status='sent' AND due_at<? ORDER BY due_at`).all(iso(now))) items.push({ kind: 'invoice_overdue', level: 'action', org: i.organisation_id, invoice_id: i.id, text: `${biz(i.organisation_id)}: invoice ${i.number} is overdue (${money(i.total_cents)})`, when: i.due_at });
    for (const s of db.prepare(`SELECT organisation_id,trial_ends_at FROM organisation_subscriptions WHERE status='trialing' AND trial_ends_at IS NOT NULL AND trial_ends_at BETWEEN ? AND ?`).all(iso(now), iso(new Date(t + 3 * DAY)))) items.push({ kind: 'trial_ending', level: 'action', org: s.organisation_id, text: `${biz(s.organisation_id)}: trial ends ${new Date(s.trial_ends_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}. A good time to check in.`, when: s.trial_ends_at });
    for (const a of db.prepare(`SELECT organisation_id,addon_id,requested_at FROM organisation_addons WHERE status='requested'`).all()) items.push({ kind: 'addon_request', level: 'action', org: a.organisation_id, text: `${biz(a.organisation_id)}: asked for ${ADDONS[a.addon_id]?.name || 'an add-on'}`, when: a.requested_at });
    for (const r of db.prepare(`SELECT * FROM operator_reminders WHERE done_at IS NULL AND due_at<=? ORDER BY due_at`).all(soon)) items.push({ kind: 'reminder', level: Date.parse(r.due_at) <= t ? 'action' : 'info', org: r.organisation_id, reminder_id: r.id, text: r.title, when: r.due_at });
    try { items.push(...extraAttention()); } catch { /* optional source */ }
    return items.sort((a, b) => (a.level === b.level ? 0 : a.level === 'action' ? -1 : 1) || String(a.when).localeCompare(String(b.when)));
  }

  async function sendDigest(now = new Date()) {
    const to = String(env.OPERATOR_EMAIL || '').trim();
    if (!to) return { sent: false, reason: 'no_operator_email' };
    const hourPerth = (now.getUTCHours() + 8) % 24, day = new Date(now.getTime() + 8 * HOUR).toISOString().slice(0, 10);
    if (hourPerth < 8 || db.prepare(`SELECT 1 FROM operator_digest_log WHERE day=?`).get(day)) return { sent: false, reason: 'not_due' };
    const items = attention(now).filter((i) => i.level === 'action');
    if (!items.length) { db.prepare(`INSERT OR IGNORE INTO operator_digest_log (day,sent_at) VALUES (?,?)`).run(day, iso()); return { sent: false, reason: 'nothing_to_report' }; }
    const base = String(env.PUBLIC_BASE_URL || '').replace(/\/$/, '');
    const r = await sendBrandedEmail(env, { to, subject: `${items.length} thing${items.length === 1 ? '' : 's'} need your attention`, rendered: renderEmail(platformBrand(env), { heading: 'Your daily summary', paragraphs: ['These need you today:', items.slice(0, 15).map((i) => '• ' + i.text).join('\n')], button: { label: 'Open the operator app', url: `${base}/office/` }, notes: [] }), kind: 'platform', fromName: PLATFORM_NAME });
    if (r.sent) db.prepare(`INSERT OR IGNORE INTO operator_digest_log (day,sent_at) VALUES (?,?)`).run(day, iso());
    return r;
  }

  async function tick() { const now = new Date(); prepareDrafts(now); await sendDue(now); await remindOverdue(now); await sendDigest(now); }
  if (timers) {
    setTimeout(() => tick().catch(() => {}), 45 * 1000).unref?.();
    setInterval(() => tick().catch((e) => console.warn('[billing-ops]', e.message)), HOUR).unref?.();
  }

  // ----- profile -----
  function profile(org) {
    const o = db.prepare(`SELECT o.id,COALESCE(o.display_name,o.name) business,o.legal_name,o.abn,o.state,o.created_at,s.plan_id,p.name plan_name,p.monthly_fee_cents,s.status,s.payment_status,s.trial_ends_at,COALESCE(ob.industry_code,'custom') industry_code FROM organisations o JOIN organisation_subscriptions s ON s.organisation_id=o.id JOIN subscription_plans p ON p.id=s.plan_id LEFT JOIN onboarding_profiles ob ON ob.organisation_id=o.id WHERE o.id=?`).get(org);
    if (!o) return null;
    const owner = db.prepare(`SELECT u.full_name,u.email,u.phone,u.last_login_at,u.created_at FROM memberships m JOIN users u ON u.id=m.user_id WHERE m.organisation_id=? AND m.role='owner' ORDER BY m.rowid LIMIT 1`).get(org) || {};
    const usage = entitlements.usage(org).map((u) => ({ label: u.label, used: u.used, limit: u.limit, percent: u.percent, unit: u.unit }));
    const channels = db.prepare(`SELECT provider FROM organisation_integrations WHERE organisation_id=? AND status='connected'`).all(org).map((r) => r.provider);
    const invoices = db.prepare(`SELECT id,number,period_start,total_cents,status,send_at,sent_at,paid_at,due_at FROM platform_invoices WHERE organisation_id=? ORDER BY period_start DESC LIMIT 24`).all(org);
    const emails = db.prepare(`SELECT kind,status,created_at FROM lifecycle_emails WHERE organisation_id=? ORDER BY created_at DESC LIMIT 30`).all(org);
    const addons = db.prepare(`SELECT addon_id,quantity,status,price_cents FROM organisation_addons WHERE organisation_id=? AND status IN ('requested','active')`).all(org).map((a) => ({ name: ADDONS[a.addon_id]?.name, unit: ADDONS[a.addon_id]?.unit, quantity: a.quantity, status: a.status, monthly_cents: a.price_cents * a.quantity }));
    const rows = db.prepare(`SELECT action,user_role,created_at FROM audit_logs WHERE organisation_id=? ORDER BY created_at DESC LIMIT 400`).all(org).filter((r) => TIMELINE.some((p) => r.action.startsWith(p))).slice(0, 40).map((r) => ({ at: r.created_at, action: r.action.split('.').slice(1).join(' ').replaceAll('_', ' ') || r.action, role: r.user_role }));
    const reminders = db.prepare(`SELECT id,title,due_at FROM operator_reminders WHERE organisation_id=? AND done_at IS NULL ORDER BY due_at`).all(org);
    // Health: simple, explainable rules on account-level facts only.
    let score = 100; const suggestions = [], why = [];
    const days = o.trial_ends_at ? Math.ceil((Date.parse(o.trial_ends_at) - Date.now()) / DAY) : null, idle = owner.last_login_at ? Math.floor((Date.now() - Date.parse(owner.last_login_at)) / DAY) : null;
    if (o.payment_status === 'failed') { score -= 30; why.push('A payment was refused'); suggestions.push({ title: 'Follow up on the refused payment', detail: 'Email the owner and offer to help update the payment method.' }); }
    if (o.status === 'trialing' && days !== null && days <= 3) { score -= 10; why.push(days > 0 ? `Trial ends in ${days} day${days === 1 ? '' : 's'}` : 'Trial has ended'); suggestions.push({ title: 'Check in before the trial ends', detail: 'Ask what they still want to try and recommend the plan that fits their usage.' }); }
    if (idle !== null && idle >= 14) { score -= 20; why.push(`Owner last signed in ${idle} days ago`); suggestions.push({ title: 'Re-engage the owner', detail: 'Send a short helpful email: one quick win to try this week.' }); }
    if (!channels.length && Date.now() - Date.parse(o.created_at) > 7 * DAY) { score -= 10; why.push('No platforms connected yet'); suggestions.push({ title: 'Help them connect a channel', detail: 'Connected channels unlock posting, replies and reporting.' }); }
    for (const u of usage) if (u.limit > 0 && u.percent >= 80) suggestions.push({ title: `Offer more ${u.label}`, detail: `${u.percent}% of the limit is used. An add-on or the next plan fits.` });
    return { business: o, owner: { name: owner.full_name || null, email: owner.email || null, phone: owner.phone || null, last_login_at: owner.last_login_at || null }, usage, channels, invoices, addons, emails, timeline: rows, reminders, health: { score: Math.max(0, score), reasons: why }, suggestions };
  }

  function install(app, { requireAdmin }) {
    app.get('/api/admin/attention', requireAdmin, (req, res) => res.json({ ok: true, items: attention(), digest_email_set: Boolean(String(env.OPERATOR_EMAIL || '').trim()), tax_invoice_ready: Boolean(String(env.PLATFORM_ABN || '').trim()) }));
    app.get('/api/admin/subscribers/:id/profile', requireAdmin, (req, res) => { const p = profile(req.params.id); p ? res.json({ ok: true, ...p }) : res.status(404).json({ ok: false, error: 'Subscriber not found.' }); });
    app.get('/api/admin/invoices', requireAdmin, (req, res) => {
      const rows = db.prepare(`SELECT i.*,COALESCE(o.display_name,o.name) business FROM platform_invoices i JOIN organisations o ON o.id=i.organisation_id ORDER BY i.period_start DESC, i.created_at DESC LIMIT 300`).all();
      res.json({ ok: true, invoices: rows.map((r) => ({ id: r.id, organisation_id: r.organisation_id, business: r.business, number: r.number, period_start: r.period_start, lines: JSON.parse(r.lines_json), subtotal_cents: r.subtotal_cents, gst_cents: r.gst_cents, total_cents: r.total_cents, note: r.note, status: r.status, send_at: r.send_at, due_at: r.due_at, sent_at: r.sent_at, paid_at: r.paid_at, last_error: r.last_error })) });
    });
    app.post('/api/admin/invoices/prepare', requireAdmin, (req, res) => {
      const p = z.object({ organisation_id: z.string().uuid().optional(), period: z.string().regex(/^\d{4}-\d{2}$/).optional() }).safeParse(req.body || {});
      if (!p.success) return res.status(400).json({ ok: false, error: 'Check the month.' });
      if (p.data.organisation_id) {
        const [y, m] = (p.data.period || iso().slice(0, 7)).split('-').map(Number), id = createDraft(p.data.organisation_id, monthStart(y, m - 1));
        return id ? res.status(201).json({ ok: true, id }) : res.status(409).json({ ok: false, error: 'There is already an invoice for that month, or the plan has no charge.' });
      }
      const now = new Date(), next = monthStart(now.getUTCFullYear(), now.getUTCMonth() + 1); let n = 0;
      for (const s of db.prepare(`SELECT organisation_id FROM organisation_subscriptions WHERE status='active'`).all()) if (createDraft(s.organisation_id, next)) n++;
      res.json({ ok: true, created: n });
    });
    app.post('/api/admin/invoices/:id/adjust', requireAdmin, (req, res) => {
      const p = z.object({ adjustment_cents: z.number().int().min(-10000000).max(10000000), description: z.string().trim().min(2).max(120) }).safeParse(req.body);
      const inv = db.prepare(`SELECT * FROM platform_invoices WHERE id=? AND status='draft'`).get(req.params.id);
      if (!p.success || !inv) return res.status(400).json({ ok: false, error: 'Only a draft can be changed. Enter a description and an amount.' });
      const lines = [...JSON.parse(inv.lines_json), { description: p.data.description, cents: p.data.adjustment_cents }], sub = lines.reduce((n, l) => n + l.cents, 0);
      if (sub <= 0) return res.status(400).json({ ok: false, error: 'The invoice total must stay above zero. Void it instead.' });
      db.prepare(`UPDATE platform_invoices SET lines_json=?,subtotal_cents=?,gst_cents=?,total_cents=? WHERE id=?`).run(JSON.stringify(lines), sub, gstOf(sub), sub + gstOf(sub), inv.id);
      auditFor(inv.organisation_id, 'billing.invoice_adjusted', { kind: inv.number });
      res.json({ ok: true });
    });
    app.post('/api/admin/invoices/:id/approve', requireAdmin, async (req, res) => {
      const p = z.object({ send_at: z.string().datetime().optional() }).safeParse(req.body || {});
      const inv = db.prepare(`SELECT * FROM platform_invoices WHERE id=? AND status='draft'`).get(req.params.id);
      if (!p.success || !inv) return res.status(409).json({ ok: false, error: 'Only a draft can be approved.' });
      const at = p.data.send_at || (Date.parse(inv.period_start) > Date.now() ? inv.period_start : iso());
      db.prepare(`UPDATE platform_invoices SET status='approved',approved_at=?,send_at=? WHERE id=?`).run(iso(), at, inv.id);
      auditFor(inv.organisation_id, 'billing.invoice_approved', { kind: inv.number });
      const sent = Date.parse(at) <= Date.now() ? await sendDue() : 0;
      res.json({ ok: true, send_at: at, sent_now: sent > 0 });
    });
    app.post('/api/admin/invoices/:id/:action', requireAdmin, async (req, res) => {
      const inv = db.prepare(`SELECT * FROM platform_invoices WHERE id=?`).get(req.params.id);
      if (!inv) return res.status(404).json({ ok: false, error: 'Invoice not found.' });
      if (req.params.action === 'void') {
        if (['paid', 'void'].includes(inv.status)) return res.status(409).json({ ok: false, error: 'This invoice is already closed.' });
        db.prepare(`UPDATE platform_invoices SET status='void' WHERE id=?`).run(inv.id); auditFor(inv.organisation_id, 'billing.invoice_void', { kind: inv.number }); return res.json({ ok: true });
      }
      if (req.params.action === 'paid') {
        const p = z.object({ reference: z.string().trim().min(3).max(60) }).safeParse(req.body);
        if (!p.success || !['sent', 'approved'].includes(inv.status)) return res.status(400).json({ ok: false, error: 'Enter the payment reference. Only a sent invoice can be marked paid.' });
        const mail = await settle(inv.id, { reference: p.data.reference, via: 'operator' });
        return res.json({ ok: true, email: mail?.sent ? 'sent' : mail?.reason });
      }
      res.status(404).json({ ok: false, error: 'Unknown action.' });
    });
    app.post('/api/admin/reminders', requireAdmin, (req, res) => {
      const p = z.object({ title: z.string().trim().min(2).max(160), due_at: z.string().datetime(), organisation_id: z.string().uuid().optional() }).safeParse(req.body);
      if (!p.success) return res.status(400).json({ ok: false, error: 'Add a short title and a date.' });
      const id = crypto.randomUUID(); db.prepare(`INSERT INTO operator_reminders (id,organisation_id,title,due_at,created_at) VALUES (?,?,?,?,?)`).run(id, p.data.organisation_id || null, p.data.title, p.data.due_at, iso());
      res.status(201).json({ ok: true, id });
    });
    app.post('/api/admin/reminders/:id/done', requireAdmin, (req, res) => { db.prepare(`UPDATE operator_reminders SET done_at=? WHERE id=?`).run(iso(), req.params.id); res.json({ ok: true }); });
  }
  return { install, settle, prepareDrafts, sendDue, remindOverdue, attention, sendDigest, profile, createDraft };
}
