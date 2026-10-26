// The platform operator's register of subscribing businesses. It holds business-level facts only: who subscribed, in which
// category, on which plan, trial and payment state. It never exposes a business's staff, workers, customers, jobs or money.
import { z } from 'zod';
import { appendAuditLog } from './db.js';
import { industryByCode } from './industry-registry.js';

const DAY = 86400000;

export function installSubscribers(app, { db, requireAdmin, lifecycle }) {
  const operatorAudit = (org, action, detail) => appendAuditLog(db, { organisation_id: org, user_id: null, user_name: 'Platform operator', user_role: 'operator', action, module: 'subscription', entity_type: 'subscription', entity_id: org, metadata: detail });
  const rows = () => db.prepare(`SELECT o.id,COALESCE(o.display_name,o.name) business,o.state,o.created_at,o.status org_status,s.plan_id,p.name plan_name,p.monthly_fee_cents,s.status,s.payment_status,s.trial_ends_at,s.payment_provider,
      COALESCE(ob.industry_code,'custom') industry_code,
      (SELECT u.full_name FROM memberships m JOIN users u ON u.id=m.user_id WHERE m.organisation_id=o.id AND m.role='owner' ORDER BY m.rowid LIMIT 1) owner_name,
      (SELECT u.email FROM memberships m JOIN users u ON u.id=m.user_id WHERE m.organisation_id=o.id AND m.role='owner' ORDER BY m.rowid LIMIT 1) owner_email,
      (SELECT COUNT(*) FROM memberships m WHERE m.organisation_id=o.id AND m.status='active') logins
    FROM organisations o JOIN organisation_subscriptions s ON s.organisation_id=o.id JOIN subscription_plans p ON p.id=s.plan_id LEFT JOIN onboarding_profiles ob ON ob.organisation_id=o.id ORDER BY o.created_at DESC`).all()
    .map((r) => { const ind = industryByCode(r.industry_code), days = r.trial_ends_at ? Math.ceil((new Date(r.trial_ends_at) - Date.now()) / DAY) : null;
      return { ...r, category: ind?.label || 'Other', category_group: ind?.group || 'Other', trial_days_left: r.status === 'trialing' ? days : null }; });

  app.get('/api/admin/subscribers', requireAdmin, (req, res) => {
    const list = rows(), count = (key) => Object.entries(list.reduce((a, r) => ((a[r[key]] = (a[r[key]] || 0) + 1), a), {})).map(([name, n]) => ({ name, count: n })).sort((a, b) => b.count - a.count);
    const paying = list.filter((r) => r.status === 'active');
    res.json({ ok: true, subscribers: list, totals: { all: list.length, trialing: list.filter((r) => r.status === 'trialing').length, paying: paying.length, monthly_recurring_cents: paying.reduce((t, r) => t + r.monthly_fee_cents, 0), payment_problems: list.filter((r) => r.payment_status === 'failed').length }, by_plan: count('plan_name'), by_status: count('status'), by_category: count('category') });
  });

  app.get('/api/admin/subscription-plans', requireAdmin, (req, res) => res.json({ ok: true, plans: db.prepare(`SELECT id,name,monthly_fee_cents FROM subscription_plans WHERE active=1 ORDER BY monthly_fee_cents`).all() }));

  app.post('/api/admin/subscribers/:id/plan', requireAdmin, async (req, res) => {
    const parsed = z.object({ plan_id: z.string().min(1).max(60), status: z.enum(['trialing', 'active']).optional() }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ ok: false, error: 'Choose a plan.' });
    const cur = db.prepare(`SELECT s.plan_id,p.name FROM organisation_subscriptions s JOIN subscription_plans p ON p.id=s.plan_id WHERE s.organisation_id=?`).get(req.params.id);
    const plan = db.prepare(`SELECT id,name FROM subscription_plans WHERE id=? AND active=1`).get(parsed.data.plan_id);
    if (!cur || !plan) return res.status(404).json({ ok: false, error: 'Subscriber or plan not found.' });
    const status = parsed.data.status || (plan.id === 'founder-trial' ? 'trialing' : 'active'), now = new Date().toISOString();
    db.prepare(`UPDATE organisation_subscriptions SET plan_id=?,status=?,trial_ends_at=CASE WHEN ?='active' THEN NULL ELSE trial_ends_at END,updated_at=? WHERE organisation_id=?`).run(plan.id, status, status, now, req.params.id);
    operatorAudit(req.params.id, 'subscription.plan_changed', { from: cur.plan_id, to: plan.id, status });
    const mail = cur.plan_id === plan.id ? null : await lifecycle.sendPlanChanged(req.params.id, cur.name, `${plan.id}:${now}`);
    res.json({ ok: true, plan: plan.name, status, email: mail ? (mail.sent ? 'sent' : mail.reason) : 'not_needed' });
  });

  app.post('/api/admin/subscribers/:id/payment', requireAdmin, async (req, res) => {
    const parsed = z.object({ result: z.enum(['succeeded', 'failed']), amount_cents: z.number().int().positive().max(100000000).optional(), reason: z.string().trim().max(160).optional(), reference: z.string().trim().min(3).max(60) }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ ok: false, error: 'Enter the result and a payment reference.' });
    const sub = db.prepare(`SELECT s.status,p.monthly_fee_cents FROM organisation_subscriptions s JOIN subscription_plans p ON p.id=s.plan_id WHERE s.organisation_id=?`).get(req.params.id);
    if (!sub) return res.status(404).json({ ok: false, error: 'Subscriber not found.' });
    const d = parsed.data, ok = d.result === 'succeeded', now = new Date().toISOString();
    db.prepare(`UPDATE organisation_subscriptions SET payment_status=?,status=CASE WHEN ? THEN 'active' ELSE status END,trial_ends_at=CASE WHEN ? THEN NULL ELSE trial_ends_at END,updated_at=? WHERE organisation_id=?`).run(ok ? 'paid' : 'failed', ok ? 1 : 0, ok ? 1 : 0, now, req.params.id);
    operatorAudit(req.params.id, ok ? 'subscription.payment_received' : 'subscription.payment_failed', { reference: d.reference, amount_cents: d.amount_cents || null });
    const mail = ok ? await lifecycle.sendPaymentReceipt(req.params.id, { amount_cents: d.amount_cents || sub.monthly_fee_cents, reference: d.reference }) : await lifecycle.sendPaymentFailed(req.params.id, { reason: d.reason, reference: d.reference });
    res.json({ ok: true, email: mail.sent ? 'sent' : mail.reason });
  });
}
