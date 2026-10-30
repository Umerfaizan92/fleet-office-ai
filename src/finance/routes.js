// Phase 08: HTTP routes for subscriber finance (/api/saas/finance/...), subscriber plan changes, and platform finance in
// the Founder Console (/api/operator/finance/...). The organisation always comes from the signed-in session.
import { z } from 'zod';
import rateLimit from 'express-rate-limit';
import { RULESETS, rulesFor, TAX_CODES } from './rules.js';
import { CATEGORIES } from './service.js';

const FINANCE = ['owner', 'admin', 'super_admin'];
const READ = ['owner', 'admin', 'super_admin', 'manager', 'director'];
const cents = (v) => Math.round(Number(v) * 100);
const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a date like 2026-07-01.');

export function installFinanceRoutes(app, { db, finance, platformFinance, requireSaasUser, requireSaasRole, platform }) {
  const limiter = rateLimit({ windowMs: 60000, limit: 120, standardHeaders: true, legacyHeaders: false, keyGenerator: (req) => req.saas?.organisation_id || req.platform?.id || req.ip, message: { ok: false, error: 'Too many requests. Wait a minute and try again.' } });
  const money = [requireSaasUser, requireSaasRole(...FINANCE)], read = [requireSaasUser, requireSaasRole(...READ)];
  const org = (req) => req.saas.organisation_id, me = (req) => req.saas.user_id;
  const P = (schema, body) => { const r = schema.safeParse(body ?? {}); if (!r.success) throw Object.assign(new Error(r.error.issues.map((i) => `${i.path.join('.') || 'request'}: ${i.message}`).join('; ')), { status: 400 }); return r.data; };
  const wrap = (fn) => async (req, res) => { try { await fn(req, res); } catch (e) { if (!e.status) console.warn('[finance]', e.message); res.status(e.status || 500).json({ ok: false, error: e.status ? e.message : 'Something went wrong: ' + e.message }); } };
  const send = (res, r, ok = 200) => (r.ok ? res.status(ok).json(r) : res.status(r.status || 400).json(r));
  const range = (req) => { const t = new Date(), y = t.getUTCFullYear(), m = t.getUTCMonth(); const from = /^\d{4}-\d{2}-\d{2}$/.test(req.query.from || '') ? req.query.from : new Date(Date.UTC(m >= 6 ? y : y - 1, 6, 1)).toISOString().slice(0, 10); const to = /^\d{4}-\d{2}-\d{2}$/.test(req.query.to || '') ? req.query.to : t.toISOString().slice(0, 10); return [from, to]; };

  const line = z.object({ description: z.string().trim().min(1).max(300), quantity: z.number().positive().max(100000), unit_price: z.number().min(0).max(1000000), discount: z.number().min(0).max(1000000).optional(), tax_code: z.enum(Object.keys(TAX_CODES)).default('GST') }).strict();
  const toLines = (ls) => ls.map((l) => ({ description: l.description, quantity: l.quantity, unit_cents: cents(l.unit_price), discount_cents: l.discount ? cents(l.discount) : 0, tax_code: l.tax_code }));
  const docBody = z.object({ kind: z.enum(['quote', 'estimate', 'invoice', 'deposit']), title: z.string().trim().min(2).max(240), customer_id: z.string().uuid().nullable().optional(), work_order_id: z.string().uuid().nullable().optional(), lines: z.array(line).min(1).max(100), body: z.string().max(4000).optional(), valid_until: dateStr.nullable().optional(), prices_include_gst: z.boolean().nullable().optional() }).strict();

  // ---------------- overview, settings, rules ----------------
  app.get('/api/saas/finance/hub', ...read, wrap((req, res) => {
    const o = org(req);
    res.json({ ok: true, ...finance.overview(o), jobs: db.prepare("SELECT w.id,w.title,w.price_cents,w.paid_cents,w.completed_at,w.customer_id,(SELECT 1 FROM tenant_documents d WHERE d.organisation_id=w.organisation_id AND d.work_order_id=w.id AND d.kind='invoice' AND d.status<>'cancelled') has_invoice FROM work_orders w WHERE w.organisation_id=? ORDER BY w.created_at DESC LIMIT 200").all(o), customers: db.prepare('SELECT id,name,abn FROM tenant_customers WHERE organisation_id=? ORDER BY name LIMIT 500').all(o), tax_codes: TAX_CODES });
  }));
  app.get('/api/saas/finance/settings', ...read, wrap((req, res) => res.json({ ok: true, settings: finance.settings(org(req)), seller: finance.seller(org(req)) })));
  app.put('/api/saas/finance/settings', limiter, ...money, wrap((req, res) => {
    const b = P(z.object({ gst_registered: z.boolean(), prices_include_gst: z.boolean(), accounting_basis: z.enum(['cash', 'accrual']), bas_period: z.enum(['monthly', 'quarterly', 'annual']), quote_valid_days: z.number().int().min(1).max(365), deposit_percent: z.number().int().min(0).max(100), footer_note: z.string().max(600).nullable().optional() }).strict(), req.body);
    res.json({ ok: true, settings: finance.saveSettings(org(req), { ...b, gst_registered: b.gst_registered ? 1 : 0, prices_include_gst: b.prices_include_gst ? 1 : 0, footer_note: b.footer_note || null }, me(req)) });
  }));
  app.get('/api/saas/finance/rules', ...read, wrap((req, res) => res.json({ ok: true, current: rulesFor(), all: RULESETS.map((r) => ({ id: r.id, effective_from: r.effective_from, reviewed_at: r.reviewed_at })) })));

  // ---------------- documents ----------------
  app.get('/api/saas/finance/documents', ...read, wrap((req, res) => res.json({ ok: true, documents: finance.list(org(req), { kind: ['quote', 'estimate', 'invoice', 'deposit', 'credit_note'].includes(req.query.kind) ? req.query.kind : null, status: req.query.status ? String(req.query.status).slice(0, 30) : null, q: String(req.query.q || '').slice(0, 80) }) })));
  app.post('/api/saas/finance/documents', limiter, ...money, wrap((req, res) => { const b = P(docBody, req.body); send(res, finance.create(org(req), me(req), { ...b, lines: toLines(b.lines) }), 201); }));
  app.get('/api/saas/finance/documents/:id', ...read, wrap((req, res) => { const d = finance.get(org(req), req.params.id); d ? res.json({ ok: true, document: d }) : res.status(404).json({ ok: false, error: 'Document not found.' }); }));
  app.put('/api/saas/finance/documents/:id', limiter, ...money, wrap((req, res) => { const b = P(docBody.omit({ kind: true, work_order_id: true }).partial(), req.body); send(res, finance.update(org(req), req.params.id, me(req), { ...b, lines: b.lines ? toLines(b.lines) : undefined })); }));
  app.post('/api/saas/finance/documents/:id/approve', limiter, ...money, wrap((req, res) => send(res, finance.approve(org(req), req.params.id, me(req), P(z.object({ revision: z.number().int().positive() }).strict(), req.body).revision))));
  app.post('/api/saas/finance/documents/:id/issue', limiter, ...money, wrap((req, res) => send(res, finance.issue(org(req), req.params.id, me(req)))));
  app.post('/api/saas/finance/documents/:id/cancel', limiter, ...money, wrap((req, res) => send(res, finance.cancel(org(req), req.params.id, me(req), P(z.object({ reason: z.string().trim().min(3).max(300) }).strict(), req.body).reason))));
  app.post('/api/saas/finance/documents/:id/convert', limiter, ...money, wrap((req, res) => send(res, finance.convert(org(req), req.params.id, me(req), P(z.object({ to: z.enum(['quote', 'invoice', 'deposit']) }).strict(), req.body).to), 201)));
  app.post('/api/saas/finance/documents/:id/payment-link', limiter, ...money, wrap(async (req, res) => send(res, await finance.paymentLink(org(req), req.params.id, me(req), P(z.object({ provider: z.enum(['stripe', 'paypal', 'bank']) }).strict(), req.body).provider), 201)));
  app.post('/api/saas/finance/documents/:id/credit-note', limiter, ...money, wrap(async (req, res) => {
    const b = P(z.object({ amount: z.number().positive().max(1000000), reason: z.string().trim().min(5).max(500) }).strict(), req.body);
    const r = finance.requestCreditNote(org(req), req.params.id, me(req), { amount_cents: cents(b.amount), reason: b.reason });
    if (!r.ok) return send(res, r); await r.promise;
    res.status(201).json({ ok: true, credit_note_id: r.credit_note_id, run_id: r.run_id, message: 'Sent for approval. The adjustment note is issued only when an authorised person approves it.' });
  }));
  app.get('/api/saas/finance/documents/:id/print', ...read, wrap((req, res) => { const h = finance.render(org(req), req.params.id); res.set('Cache-Control', 'no-store'); h ? res.type('html').send(h) : res.status(404).type('text').send('Document not found.'); }));
  app.post('/api/saas/finance/jobs/:id/draft-invoice', limiter, ...money, wrap((req, res) => send(res, finance.draftFromJob(org(req), req.params.id, me(req)), 201)));

  // ---------------- receipts and refunds ----------------
  app.get('/api/saas/finance/receipts', ...read, wrap((req, res) => res.json({ ok: true, receipts: finance.receipts(org(req)) })));
  app.get('/api/saas/finance/receipts/:id/print', ...read, wrap((req, res) => { const h = finance.renderReceipt(org(req), req.params.id); res.set('Cache-Control', 'no-store'); h ? res.type('html').send(h) : res.status(404).type('text').send('Receipt not found.'); }));
  app.get('/api/saas/finance/refunds', ...read, wrap((req, res) => res.json({ ok: true, refunds: finance.refunds(org(req)) })));
  app.post('/api/saas/finance/payments/:id/refund', limiter, ...money, wrap(async (req, res) => {
    const b = P(z.object({ amount: z.number().positive().max(1000000), reason: z.string().trim().min(5).max(500) }).strict(), req.body);
    const r = finance.requestRefund(org(req), req.params.id, me(req), { amount_cents: cents(b.amount), reason: b.reason });
    if (!r.ok) return send(res, r); await r.promise;
    res.status(201).json({ ok: true, refund_id: r.refund_id, run_id: r.run_id, message: 'Refund request sent for approval. No money moves until an authorised person approves it.' });
  }));
  app.post('/api/saas/finance/refunds/:id/complete', limiter, ...money, wrap((req, res) => send(res, finance.completeManualRefund(org(req), req.params.id, me(req), P(z.object({ reference: z.string().trim().min(3).max(80) }).strict(), req.body).reference))));

  // ---------------- reconciliation ----------------
  app.get('/api/saas/finance/reconciliation', ...read, wrap((req, res) => res.json({ ok: true, ...finance.reconciliation(org(req)) })));
  app.post('/api/saas/finance/bank/import', limiter, ...money, wrap((req, res) => { const b = P(z.object({ filename: z.string().max(120).optional(), csv: z.string().min(5).max(900000) }).strict(), req.body); send(res, finance.importBank(org(req), me(req), b), 201); }));
  app.post('/api/saas/finance/bank/:id/match', limiter, ...money, wrap((req, res) => send(res, finance.confirmMatch(org(req), req.params.id, me(req), P(z.object({ payment_id: z.string().uuid().optional(), category: z.enum(CATEGORIES).optional(), ignore: z.boolean().optional(), note: z.string().max(200).optional() }).strict(), req.body)))));
  app.post('/api/saas/finance/bank/:id/undo', limiter, ...money, wrap((req, res) => send(res, finance.undoMatch(org(req), req.params.id, me(req)))));

  // ---------------- insights, flags, reports, compliance, audit ----------------
  app.get('/api/saas/finance/insights', ...read, wrap((req, res) => { const [from, to] = range(req); res.json({ ok: true, follow_ups: finance.followUps(org(req)), discrepancies: finance.discrepancies(org(req)), flags: finance.scanFlags(org(req)), summary: finance.summary(org(req), from, to) }); }));
  app.post('/api/saas/finance/flags/:id', limiter, ...money, wrap((req, res) => send(res, finance.resolveFlag(org(req), req.params.id, me(req), P(z.object({ status: z.enum(['resolved', 'dismissed']), note: z.string().trim().min(3).max(300) }).strict(), req.body)))));
  app.get('/api/saas/finance/reports/:name', ...read, wrap((req, res) => {
    const [from, to] = range(req), o = org(req), name = req.params.name;
    const fmt = (c) => (Number(c || 0) / 100).toFixed(2);
    if (name === 'pl') return res.json({ ok: true, report: finance.profitAndLoss(o, from, to) });
    if (name === 'gst') return res.json({ ok: true, report: finance.gstReport(o, from, to) });
    if (name === 'aged') return res.json({ ok: true, report: finance.aged(o) });
    if (name === 'pl.csv') { const r = finance.profitAndLoss(o, from, to); res.type('text/csv').attachment(`profit-and-loss-${from}-to-${to}.csv`); return res.send(finance.csv([...r.income.map((x) => ({ ...x, type: 'Income' })), ...r.expenses.map((x) => ({ ...x, type: 'Expense' }))], [['type', 'Type'], ['category', 'Category'], ['amount_cents', 'Amount (AUD)', fmt]])); }
    if (name === 'aged.csv') { res.type('text/csv').attachment('aged-receivables.csv'); return res.send(finance.csv(finance.aged(o).rows, [['number', 'Invoice'], ['customer', 'Customer'], ['due_at', 'Due', (v) => String(v || '').slice(0, 10)], ['days_overdue', 'Days overdue'], ['owing_cents', 'Owing (AUD)', fmt]])); }
    if (name === 'documents.csv') { res.type('text/csv').attachment('documents.csv'); return res.send(finance.csv(finance.list(o), [['number', 'Number'], ['kind', 'Type'], ['title', 'Title'], ['customer', 'Customer'], ['status', 'Status'], ['issued_at', 'Issued', (v) => String(v || '').slice(0, 10)], ['ex_cents', 'Ex GST (AUD)', fmt], ['gst_cents', 'GST (AUD)', fmt], ['total_cents', 'Total (AUD)', fmt]])); }
    res.status(404).json({ ok: false, error: 'Report not found.' });
  }));
  app.get('/api/saas/finance/compliance', ...read, wrap((req, res) => res.json({ ok: true, ...finance.complianceReview(org(req)) })));
  app.get('/api/saas/finance/audit', ...money, wrap((req, res) => res.json({ ok: true, events: finance.auditTrail(org(req), { limit: Number(req.query.limit) || 200 }) })));

  // ---------------- subscriber plan changes ----------------
  const owners = [requireSaasUser, requireSaasRole('owner', 'admin', 'super_admin')];
  app.get('/api/saas/finance/plan-change/quote', ...owners, wrap((req, res) => send(res, platformFinance.quoteChange(org(req), String(req.query.plan || '').slice(0, 60)))));
  app.get('/api/saas/finance/plan-changes', ...owners, wrap((req, res) => res.json({ ok: true, changes: platformFinance.changesFor(org(req)), plans: db.prepare("SELECT id,name,monthly_fee_cents FROM subscription_plans WHERE active=1 ORDER BY monthly_fee_cents").all() })));
  app.post('/api/saas/finance/plan-change', limiter, ...owners, wrap(async (req, res) => send(res, await platformFinance.requestChange(org(req), P(z.object({ plan_id: z.string().min(1).max(60) }).strict(), req.body).plan_id, me(req)), 201)));
  app.post('/api/saas/finance/plan-change/:id/cancel', limiter, ...owners, wrap((req, res) => send(res, platformFinance.cancelChange(org(req), req.params.id))));

  // ---------------- platform finance (Founder Console) ----------------
  if (platform) {
    const op = (a) => [platform.identity, platform.permit('billing', a)];
    const who = (req) => req.platform?.id || 'founder';
    app.get('/api/operator/finance/plans', ...op('read'), wrap((req, res) => res.json({ ok: true, plans: platformFinance.plans(), policy: platformFinance.PRICE_POLICY })));
    app.post('/api/operator/finance/plans/:id/price', limiter, ...op('edit'), wrap(async (req, res) => {
      const b = P(z.object({ monthly_price: z.number().min(0).max(100000), effective_from: dateStr, reason: z.string().trim().min(5).max(300) }).strict(), req.body);
      const r = platformFinance.proposePrice({ plan_id: req.params.id, to_cents: cents(b.monthly_price), effective_from: b.effective_from, reason: b.reason }, who(req));
      if (!r.ok) return send(res, r); await r.promise;
      res.status(201).json({ ok: true, change_id: r.change_id, run_id: r.run_id, message: 'Price change sent for approval. Nothing changes until it is approved, and then only from the date you chose.' });
    }));
    app.post('/api/operator/finance/price-changes/:id/cancel', limiter, ...op('edit'), wrap((req, res) => send(res, platformFinance.cancelPrice(req.params.id, who(req)))));
    app.get('/api/operator/finance/renewals', ...op('read'), wrap((req, res) => res.json({ ok: true, ...platformFinance.renewals() })));
    app.get('/api/operator/finance/dunning', ...op('read'), wrap((req, res) => res.json({ ok: true, cases: platformFinance.dunning(), policy: platformFinance.PRICE_POLICY })));
    app.post('/api/operator/finance/dunning/:id/resolve', limiter, ...op('edit'), wrap((req, res) => send(res, platformFinance.resolveDunning(req.params.id, who(req), P(z.object({ resolution: z.string().trim().min(3).max(200) }).strict(), req.body).resolution))));
    app.get('/api/operator/finance/revenue', ...op('read'), wrap((req, res) => res.json({ ok: true, ...platformFinance.revenue(Math.min(24, Math.max(1, Number(req.query.months) || 6))) })));
    app.post('/api/operator/finance/run-daily', limiter, ...op('edit'), wrap(async (req, res) => res.json({ ok: true, ...(await platformFinance.daily()) })));
    app.get('/api/operator/finance/rules', ...op('read'), wrap((req, res) => res.json({ ok: true, current: rulesFor() })));
  }
}
