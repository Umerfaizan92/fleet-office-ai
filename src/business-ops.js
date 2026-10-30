// Phase 04: Offshore staff and the Automation overview for the subscriber workspace.
// Offshore staff are team members who work from outside Australia (for example admin, inbox or content support).
// They are recorded as workers with work_location='offshore', are never offered on-site jobs, and the business records
// its acknowledgement of Australian Privacy Principle 8 (cross-border disclosure of personal information) for each one.
import crypto from 'node:crypto';
import { z } from 'zod';

const iso = () => new Date().toISOString();
const ADMINS = ['owner', 'admin', 'super_admin', 'director', 'manager'];

export function installBusinessOps(app, { db, env, requireSaasUser, requireSaasRole, saasAudit, staffAccess, aiConfigured }) {
  const cols = new Set(db.prepare('PRAGMA table_info(workers)').all().map((c) => c.name));
  for (const [name, type] of [['work_location', "TEXT NOT NULL DEFAULT 'onshore'"], ['country', 'TEXT'], ['timezone', 'TEXT'], ['engagement', 'TEXT'], ['data_ack_at', 'TEXT'], ['data_ack_by', 'TEXT'], ['data_ack_note', 'TEXT']]) {
    if (!cols.has(name)) db.exec(`ALTER TABLE workers ADD COLUMN ${name} ${type}`);
  }
  const fail = (res, status, error) => res.status(status).json({ ok: false, error });
  const can = (feature, action) => (req, res, next) => (staffAccess.can(req, feature, action) ? next() : fail(res, 403, 'This action is not authorised for your account.'));
  const view = (w) => ({ id: w.id, full_name: w.full_name, email: w.email, role_title: w.role_title, country: w.country, timezone: w.timezone, engagement: w.engagement, status: w.status, data_acknowledged: Boolean(w.data_ack_at), data_ack_at: w.data_ack_at, data_ack_note: w.data_ack_note, has_login: Boolean(w.user_id), created_at: w.created_at });

  // ---------- offshore staff ----------
  app.get('/api/saas/workers/offshore', requireSaasUser, requireSaasRole(...ADMINS), can('workforce', 'read'), (req, res) => {
    const rows = db.prepare(`SELECT * FROM workers WHERE organisation_id=? AND work_location='offshore' ORDER BY full_name COLLATE NOCASE`).all(req.saas.organisation_id);
    res.json({ ok: true, staff: rows.map(view) });
  });
  const tz = z.string().trim().max(64).refine((v) => { try { new Intl.DateTimeFormat('en-AU', { timeZone: v }); return true; } catch { return false; } }, 'Choose a valid time zone, for example Asia/Manila.');
  const offshoreSchema = z.object({
    full_name: z.string().trim().min(2).max(160), email: z.string().trim().email().max(254).optional().or(z.literal('')),
    role_title: z.string().trim().min(2).max(120), country: z.string().trim().min(2).max(80), timezone: tz,
    engagement: z.enum(['contractor', 'agency', 'employee'])
  }).strict();
  app.post('/api/saas/workers/offshore', requireSaasUser, requireSaasRole(...ADMINS), can('workforce', 'create'), (req, res) => {
    const p = offshoreSchema.safeParse(req.body);
    if (!p.success) return fail(res, 400, p.error.issues.find((i) => i.path[0] === 'timezone')?.message || 'Add the name, role, country, time zone and how they are engaged.');
    const id = crypto.randomUUID(), now = iso(), d = p.data;
    db.prepare(`INSERT INTO workers (id,organisation_id,full_name,email,role_title,employment_type,status,availability_status,work_rights_status,approved_for_scheduling,work_location,country,timezone,engagement,created_at,updated_at) VALUES (?,?,?,?,?,?,'active','available','not_applicable_offshore',0,'offshore',?,?,?,?,?)`)
      .run(id, req.saas.organisation_id, d.full_name, d.email || null, d.role_title, d.engagement === 'employee' ? 'full_time' : 'contractor', d.country, d.timezone, d.engagement, now, now);
    saasAudit(req, 'worker.offshore_added', 'worker', id, { country: d.country, engagement: d.engagement });
    res.status(201).json({ ok: true, id });
  });
  app.post('/api/saas/workers/offshore/:id/data-acknowledgement', requireSaasUser, requireSaasRole('owner', 'admin', 'super_admin', 'director'), can('workforce', 'edit'), (req, res) => {
    const p = z.object({ confirm: z.literal(true), note: z.string().trim().min(10).max(1000) }).strict().safeParse(req.body);
    if (!p.success) return fail(res, 400, 'Confirm the acknowledgement and describe the safeguards in place (10 characters or more).');
    const w = db.prepare(`SELECT * FROM workers WHERE id=? AND organisation_id=? AND work_location='offshore'`).get(req.params.id, req.saas.organisation_id);
    if (!w) return fail(res, 404, 'Offshore team member not found.');
    const now = iso();
    db.prepare('UPDATE workers SET data_ack_at=?,data_ack_by=?,data_ack_note=?,updated_at=? WHERE id=? AND organisation_id=?').run(now, req.saas.user_id, p.data.note, now, w.id, req.saas.organisation_id);
    saasAudit(req, 'worker.offshore_data_acknowledged', 'worker', w.id, {});
    res.json({ ok: true, data_ack_at: now });
  });

  // ---------- automation overview ----------
  // Every automatic behaviour in one place, read from where it is actually configured.
  app.get('/api/saas/automation', requireSaasUser, requireSaasRole(...ADMINS), can('settings', 'read'), (req, res) => {
    const org = req.saas.organisation_id;
    const profile = (() => { try { return db.prepare('SELECT approval_mode,approval_rules_json FROM onboarding_profiles WHERE organisation_id=?').get(org); } catch { return null; } })();
    let rules = {}; try { rules = JSON.parse(profile?.approval_rules_json || '{}'); } catch { rules = {}; }
    const pay = (() => { try { return db.prepare('SELECT terms_days,late_fee_enabled,late_fee_percent,customer_reminders,owner_reminders FROM payment_settings WHERE organisation_id=?').get(org); } catch { return null; } })() || { terms_days: 7, late_fee_enabled: 0, late_fee_percent: 10, customer_reminders: 0, owner_reminders: 1 };
    const prefs = (() => { try { return db.prepare('SELECT muted,browser,sms FROM notification_preferences WHERE organisation_id=? AND user_id=?').get(org, req.saas.user_id); } catch { return null; } })();
    const ai = typeof aiConfigured === 'function' ? Boolean(aiConfigured()) : false;
    res.json({
      ok: true,
      automations: [
        { key: 'approvals', title: 'Approval policy', on: true, detail: profile?.approval_mode ? `Mode: ${profile.approval_mode.replace(/_/g, ' ')}. ${Object.entries(rules).filter(([, v]) => v).map(([k]) => k.replace(/_/g, ' ')).join(', ') || 'No extra rules'} need approval.` : 'Default: anything that leaves the business waits for approval.', change: '#b01/approvals' },
        { key: 'inbox_drafts', title: 'AI reply drafts in the inbox', on: ai && String(env.INBOX_AUTO_DRAFT || '1') !== '0', detail: ai ? 'New customer messages get an AI draft reply. Every draft waits for approval before it is sent.' : 'Needs an AI provider. Nothing is drafted until one is connected.', change: '#b04/inbox' },
        { key: 'owner_reminders', title: 'Overdue invoice reminders to you', on: Boolean(pay.owner_reminders), detail: 'You are told when a job invoice passes its due date.', toggle: 'owner_reminders' },
        { key: 'customer_reminders', title: 'Overdue invoice reminders to customers', on: Boolean(pay.customer_reminders), detail: 'Customers receive a reminder after the due date. Needs email or SMS connected to send.', toggle: 'customer_reminders' },
        { key: 'late_fees', title: 'Late fees', on: Boolean(pay.late_fee_enabled), detail: `${pay.late_fee_percent}% after ${pay.terms_days} days, only when you have enabled and acknowledged it in payment settings.`, change: '#b07/ledger' },
        { key: 'payment_terms', title: 'Invoice due date', on: true, detail: `Issued invoices are due ${pay.terms_days} days later.`, change: '#b07/ledger' },
        { key: 'notifications', title: 'Your notifications', on: !prefs?.muted, detail: prefs ? `${prefs.muted ? 'Muted' : 'On'} · browser alerts ${prefs.browser ? 'on' : 'off'} · SMS ${prefs.sms ? 'on' : 'off'}` : 'Default settings.', change: null }
      ]
    });
  });
  // Turn a reminder automation on or off (owners only, like the payment settings it lives in).
  app.put('/api/saas/automation/reminders', requireSaasUser, requireSaasRole('owner'), (req, res) => {
    const p = z.object({ key: z.enum(['owner_reminders', 'customer_reminders']), on: z.boolean() }).strict().safeParse(req.body);
    if (!p.success) return fail(res, 400, 'Choose a reminder and on or off.');
    const org = req.saas.organisation_id, now = iso();
    db.prepare(`INSERT INTO payment_settings (organisation_id,${p.data.key},updated_by_user_id,updated_at) VALUES (?,?,?,?) ON CONFLICT(organisation_id) DO UPDATE SET ${p.data.key}=excluded.${p.data.key},updated_by_user_id=excluded.updated_by_user_id,updated_at=excluded.updated_at`).run(org, p.data.on ? 1 : 0, req.saas.user_id, now);
    saasAudit(req, 'automation.reminder_changed', 'payment_settings', org, { key: p.data.key, on: p.data.on });
    res.json({ ok: true, key: p.data.key, on: p.data.on });
  });
}
