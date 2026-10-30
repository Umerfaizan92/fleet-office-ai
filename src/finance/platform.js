// Phase 08: platform finance for Super Pro's own subscriptions. Plan prices are versioned and every price change is a
// Level 3 platform approval. Subscribers can change plan (upgrades prorated, downgrades at renewal). Renewals, trials,
// payment failures (dunning) and revenue reporting are read from the existing subscription and platform invoice tables.
// None of this touches any business's own customers, invoices or payments.
import crypto from 'node:crypto';
import { appendAuditLog } from '../db.js';

const DAY = 86400000;
const iso = (t = Date.now()) => new Date(t).toISOString();
const money = (c) => (Number(c) / 100).toLocaleString('en-AU', { style: 'currency', currency: 'AUD' });
// Super Pro policy (not a legal rule): existing subscribers get this much notice of a price increase.
export const PRICE_POLICY = Object.freeze({ increase_notice_days: 30, dunning_steps_days: [0, 3, 7, 14], restrict_after_days: 21 });
const monthStart = (t) => { const d = new Date(t); return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1); };
const nextMonthStart = (t) => { const d = new Date(t); return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1); };

export function createPlatformFinance({ db, engineRef = { current: null }, notify = null, lifecycle = null, clock = () => Date.now() }) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS plan_price_changes (id TEXT PRIMARY KEY, plan_id TEXT NOT NULL, from_cents INTEGER NOT NULL, to_cents INTEGER NOT NULL CHECK (to_cents >= 0), effective_from TEXT NOT NULL, reason TEXT NOT NULL, status TEXT NOT NULL, run_id TEXT, requested_by TEXT, approved_by TEXT, notified_at TEXT, applied_at TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS plan_price_history (plan_id TEXT NOT NULL, monthly_fee_cents INTEGER NOT NULL, effective_from TEXT NOT NULL, change_id TEXT, recorded_at TEXT NOT NULL, PRIMARY KEY (plan_id, effective_from));
    CREATE TABLE IF NOT EXISTS subscription_change_requests (id TEXT PRIMARY KEY, organisation_id TEXT NOT NULL, from_plan TEXT NOT NULL, to_plan TEXT NOT NULL, kind TEXT NOT NULL CHECK (kind IN ('upgrade','downgrade','same')), effective_at TEXT NOT NULL, proration_cents INTEGER NOT NULL DEFAULT 0, status TEXT NOT NULL, invoiced_in TEXT, requested_by TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS sub_changes_org ON subscription_change_requests(organisation_id, created_at);
    CREATE TABLE IF NOT EXISTS platform_dunning (id TEXT PRIMARY KEY, organisation_id TEXT NOT NULL, invoice_id TEXT, reason TEXT NOT NULL, opened_at TEXT NOT NULL, step INTEGER NOT NULL DEFAULT 0, next_action_at TEXT, status TEXT NOT NULL DEFAULT 'open', resolved_at TEXT, resolution TEXT, UNIQUE (organisation_id, invoice_id, opened_at));
    CREATE INDEX IF NOT EXISTS platform_dunning_status ON platform_dunning(status, next_action_at);`);
  // Record today's prices once, so history starts from what subscribers already pay.
  for (const p of db.prepare('SELECT id,monthly_fee_cents,created_at FROM subscription_plans').all()) db.prepare('INSERT OR IGNORE INTO plan_price_history (plan_id,monthly_fee_cents,effective_from,change_id,recorded_at) VALUES (?,?,?,NULL,?)').run(p.id, p.monthly_fee_cents, String(p.created_at || iso(clock())).slice(0, 10), iso(clock()));
  const now = () => iso(clock());
  const audit = (org, actor, action, metadata) => appendAuditLog(db, { organisation_id: org, user_id: null, user_name: actor ? `operator:${actor}` : 'Platform billing', user_role: 'operator', action, module: 'billing', entity_type: 'subscription', entity_id: org, metadata });
  const E = (status, error) => ({ ok: false, status, error });

  // ---------------- plans and price changes ----------------
  function plans() {
    return db.prepare('SELECT id,name,monthly_fee_cents,setup_fee_cents,currency,active,(SELECT COUNT(*) FROM organisation_subscriptions s WHERE s.plan_id=p.id AND s.status IN (\'active\',\'trialing\')) subscribers FROM subscription_plans p ORDER BY monthly_fee_cents').all()
      .map((p) => ({ ...p, history: db.prepare('SELECT monthly_fee_cents,effective_from,change_id FROM plan_price_history WHERE plan_id=? ORDER BY effective_from DESC LIMIT 12').all(p.id), pending: db.prepare("SELECT id,to_cents,effective_from,status,reason FROM plan_price_changes WHERE plan_id=? AND status IN ('pending_approval','approved') ORDER BY effective_from").all(p.id) }));
  }
  function proposePrice({ plan_id, to_cents, effective_from, reason }, actor) {
    const p = db.prepare('SELECT * FROM subscription_plans WHERE id=?').get(plan_id); if (!p) return E(404, 'Plan not found.');
    if (to_cents === p.monthly_fee_cents) return E(400, 'That is the current price.');
    const eff = String(effective_from).slice(0, 10), minEff = iso(clock() + PRICE_POLICY.increase_notice_days * DAY).slice(0, 10);
    const subs = db.prepare("SELECT COUNT(*) n FROM organisation_subscriptions WHERE plan_id=? AND status IN ('active','trialing')").get(plan_id).n;
    if (to_cents > p.monthly_fee_cents && subs && eff < minEff) return E(400, `Price increases need ${PRICE_POLICY.increase_notice_days} days' notice to existing subscribers. Choose ${minEff} or later.`);
    if (eff < iso(clock()).slice(0, 10)) return E(400, 'Choose today or a future date.');
    if (db.prepare("SELECT 1 FROM plan_price_changes WHERE plan_id=? AND status IN ('pending_approval','approved')").get(plan_id)) return E(409, 'This plan already has a price change waiting. Cancel or finish it first.');
    const id = crypto.randomUUID();
    db.prepare("INSERT INTO plan_price_changes (id,plan_id,from_cents,to_cents,effective_from,reason,status,requested_by,created_at,updated_at) VALUES (?,?,?,?,?,?,'pending_approval',?,?,?)").run(id, plan_id, p.monthly_fee_cents, to_cents, eff, String(reason).trim().slice(0, 300), actor, now(), now());
    const engine = engineRef.current; if (!engine) return E(503, 'The approval engine is not running.');
    const r = engine.startRun({ id: null, scope: 'platform', organisation_id: null, current_version: 0 }, { trigger: 'manual', key: `price:${id}`, payload: { change_id: id }, definition: { trigger: 'manual', action: 'change_plan_price', conditions: [], params: { change_id: id }, analysis: 'rules', always_approve: true, approval_expires_hours: 168 }, actor: actor ? { id: actor } : null });
    db.prepare('UPDATE plan_price_changes SET run_id=? WHERE id=?').run(r.id, id);
    audit(null, actor, 'billing.price_change_requested', { plan_id, from_cents: p.monthly_fee_cents, to_cents, effective_from: eff });
    return { ok: true, change_id: id, run_id: r.id, promise: r.promise };
  }
  function priceProposal(id) {
    const c = db.prepare('SELECT * FROM plan_price_changes WHERE id=?').get(id); if (!c) return null;
    const p = db.prepare('SELECT name FROM subscription_plans WHERE id=?').get(c.plan_id);
    return { change_id: c.id, plan_id: c.plan_id, plan: p?.name || c.plan_id, from_cents: c.from_cents, to_cents: c.to_cents, effective_from: c.effective_from, subscribers: db.prepare("SELECT COUNT(*) n FROM organisation_subscriptions WHERE plan_id=? AND status IN ('active','trialing')").get(c.plan_id).n, reason: c.reason, notice_days: PRICE_POLICY.increase_notice_days };
  }
  function approvePrice(p, approver) {
    const c = db.prepare('SELECT * FROM plan_price_changes WHERE id=?').get(p.change_id);
    if (!c || c.status !== 'pending_approval') return { ok: false, error: 'This price change is no longer waiting for approval.' };
    const plan = db.prepare('SELECT monthly_fee_cents FROM subscription_plans WHERE id=?').get(c.plan_id);
    if (!plan || plan.monthly_fee_cents !== c.from_cents) return { ok: false, error: 'The plan price changed since this was proposed. Propose it again.' };
    db.prepare("UPDATE plan_price_changes SET status='approved',approved_by=?,updated_at=? WHERE id=?").run(approver, now(), c.id);
    audit(null, approver, 'billing.price_change_approved', { plan_id: c.plan_id, to_cents: c.to_cents, effective_from: c.effective_from });
    return { ok: true };
  }
  function cancelPrice(id, actor) {
    const r = db.prepare("UPDATE plan_price_changes SET status='cancelled',updated_at=? WHERE id=? AND status IN ('pending_approval','approved')").run(now(), id);
    if (!r.changes) return E(409, 'Only a waiting or approved (not yet applied) change can be cancelled.');
    audit(null, actor, 'billing.price_change_cancelled', { change_id: id }); return { ok: true };
  }
  // Daily: tell subscribers about approved changes, then apply each one on its date.
  async function applyDuePrices() {
    const today = iso(clock()).slice(0, 10); let applied = 0, notified = 0;
    for (const c of db.prepare("SELECT c.* FROM plan_price_changes c JOIN automation_runs a ON a.id=c.run_id WHERE c.status='pending_approval' AND a.status IN ('rejected','expired','failed')").all()) db.prepare("UPDATE plan_price_changes SET status='rejected',updated_at=? WHERE id=?").run(now(), c.id);
    for (const c of db.prepare("SELECT * FROM plan_price_changes WHERE status='approved'").all()) {
      if (!c.notified_at) {
        for (const s of db.prepare("SELECT organisation_id FROM organisation_subscriptions WHERE plan_id=? AND status IN ('active','trialing')").all(c.plan_id)) {
          try { await notify?.notifyRoles?.(s.organisation_id, ['owner'], { kind: 'plan_price_change', title: `Your plan price changes on ${c.effective_from}`, body: `Your Super Pro plan moves from ${money(c.from_cents)} to ${money(c.to_cents)} a month (plus GST) for billing periods starting on or after ${c.effective_from}. You can change or cancel your plan before then in Plans & Usage.`, link: '#b09/usage', dedupe: `price:${c.id}` }); } catch { /* best effort */ }
        }
        db.prepare('UPDATE plan_price_changes SET notified_at=?,updated_at=? WHERE id=?').run(now(), now(), c.id); notified++;
      }
      if (c.effective_from <= today) {
        db.transaction(() => {
          const r = db.prepare('UPDATE subscription_plans SET monthly_fee_cents=?,updated_at=? WHERE id=? AND monthly_fee_cents=?').run(c.to_cents, now(), c.plan_id, c.from_cents);
          if (!r.changes) { db.prepare("UPDATE plan_price_changes SET status='superseded',updated_at=? WHERE id=?").run(now(), c.id); return; }
          db.prepare('INSERT OR REPLACE INTO plan_price_history (plan_id,monthly_fee_cents,effective_from,change_id,recorded_at) VALUES (?,?,?,?,?)').run(c.plan_id, c.to_cents, c.effective_from, c.id, now());
          db.prepare("UPDATE plan_price_changes SET status='applied',applied_at=?,updated_at=? WHERE id=?").run(now(), now(), c.id); applied++;
        })();
        audit(null, null, 'billing.price_change_applied', { plan_id: c.plan_id, to_cents: c.to_cents });
      }
    }
    return { applied, notified };
  }

  // ---------------- subscriber plan changes ----------------
  function quoteChange(org, toPlan) {
    const s = db.prepare('SELECT s.*,p.monthly_fee_cents fee,p.name FROM organisation_subscriptions s JOIN subscription_plans p ON p.id=s.plan_id WHERE s.organisation_id=?').get(org); if (!s) return E(404, 'No subscription found.');
    const to = db.prepare("SELECT id,name,monthly_fee_cents FROM subscription_plans WHERE id=? AND active=1").get(toPlan); if (!to) return E(404, 'That plan is not available.');
    if (to.id === s.plan_id) return E(400, 'You are already on that plan.');
    const t = clock(), start = monthStart(t), end = nextMonthStart(t), left = Math.max(0, (end - t) / (end - start));
    const kind = to.monthly_fee_cents > s.fee ? 'upgrade' : 'downgrade';
    // Trials have nothing to prorate. Paying subscribers pay the difference for the rest of this month on an upgrade.
    const proration = s.status === 'active' && kind === 'upgrade' ? Math.round((to.monthly_fee_cents - s.fee) * left) : 0;
    const effective = kind === 'upgrade' || s.status !== 'active' ? iso(t) : iso(end);
    return { ok: true, from: { id: s.plan_id, name: s.name, monthly_fee_cents: s.fee }, to, kind, status: s.status, proration_cents: proration, proration_gst_cents: Math.round(proration * 0.1), effective_at: effective, explanation: kind === 'upgrade' ? (proration ? `You get the new plan now and pay ${money(proration)} plus GST for the rest of this month on your next invoice.` : 'You get the new plan now.') : (s.status === 'active' ? `Your plan changes on ${effective.slice(0, 10)}, the start of your next billing month. Nothing is refunded for the current month.` : 'Your plan changes now.') };
  }
  async function requestChange(org, toPlan, actor) {
    const q = quoteChange(org, toPlan); if (!q.ok) return q;
    if (db.prepare("SELECT 1 FROM subscription_change_requests WHERE organisation_id=? AND status='scheduled'").get(org)) return E(409, 'A plan change is already scheduled. Cancel it first.');
    const id = crypto.randomUUID(), immediate = q.effective_at <= now();
    db.prepare('INSERT INTO subscription_change_requests (id,organisation_id,from_plan,to_plan,kind,effective_at,proration_cents,status,requested_by,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)').run(id, org, q.from.id, q.to.id, q.kind, q.effective_at, q.proration_cents, immediate ? 'applied' : 'scheduled', actor, now(), now());
    if (immediate) await applyChange(org, id, q);
    audit(org, null, immediate ? 'subscription.plan_changed_by_subscriber' : 'subscription.plan_change_scheduled', { from: q.from.id, to: q.to.id, proration_cents: q.proration_cents, effective_at: q.effective_at, by: actor });
    return { ok: true, id, ...q, scheduled: !immediate };
  }
  async function applyChange(org, id, q) {
    db.prepare('UPDATE organisation_subscriptions SET plan_id=?,updated_at=? WHERE organisation_id=?').run(q.to.id, now(), org);
    db.prepare("UPDATE subscription_change_requests SET status='applied',updated_at=? WHERE id=?").run(now(), id);
    try { await lifecycle?.sendPlanChanged?.(org, q.from.name, `${q.to.id}:${id}`); } catch { /* email best effort */ }
  }
  function cancelChange(org, id) { const r = db.prepare("UPDATE subscription_change_requests SET status='cancelled',updated_at=? WHERE id=? AND organisation_id=? AND status='scheduled'").run(now(), id, org); return r.changes ? { ok: true } : E(404, 'No scheduled change to cancel.'); }
  async function applyDueChanges() {
    let n = 0;
    for (const c of db.prepare("SELECT * FROM subscription_change_requests WHERE status='scheduled' AND effective_at<=?").all(now())) { const from = db.prepare('SELECT name FROM subscription_plans WHERE id=?').get(c.from_plan); await applyChange(c.organisation_id, c.id, { to: { id: c.to_plan }, from: { name: from?.name || c.from_plan } }); n++; }
    return n;
  }
  // Billing ops adds these to the next monthly invoice (one line per upgrade), then marks them invoiced.
  function prorationLines(org) { return db.prepare("SELECT id,from_plan,to_plan,proration_cents FROM subscription_change_requests WHERE organisation_id=? AND kind='upgrade' AND status='applied' AND proration_cents>0 AND invoiced_in IS NULL").all(org).map((c) => ({ id: c.id, description: `Upgrade from ${c.from_plan} to ${c.to_plan}, rest of the month`, cents: c.proration_cents })); }
  function markProrationInvoiced(ids, invoiceId) { for (const id of ids) db.prepare('UPDATE subscription_change_requests SET invoiced_in=? WHERE id=? AND invoiced_in IS NULL').run(invoiceId, id); }
  function changesFor(org) { return db.prepare('SELECT * FROM subscription_change_requests WHERE organisation_id=? ORDER BY created_at DESC LIMIT 20').all(org); }

  // ---------------- renewals, trials and payment failures ----------------
  function renewals() {
    const t = clock(), next = iso(nextMonthStart(t)).slice(0, 10);
    const active = db.prepare("SELECT s.organisation_id,COALESCE(o.display_name,o.name) business,p.name plan,p.monthly_fee_cents,s.payment_status FROM organisation_subscriptions s JOIN organisations o ON o.id=s.organisation_id JOIN subscription_plans p ON p.id=s.plan_id WHERE s.status='active' ORDER BY business").all();
    const trials = db.prepare("SELECT s.organisation_id,COALESCE(o.display_name,o.name) business,p.name plan,s.trial_ends_at FROM organisation_subscriptions s JOIN organisations o ON o.id=s.organisation_id JOIN subscription_plans p ON p.id=s.plan_id WHERE s.status='trialing' AND s.trial_ends_at IS NOT NULL AND s.trial_ends_at<=? ORDER BY s.trial_ends_at").all(iso(t + 14 * DAY));
    const scheduled = db.prepare("SELECT c.*,COALESCE(o.display_name,o.name) business FROM subscription_change_requests c JOIN organisations o ON o.id=c.organisation_id WHERE c.status='scheduled' ORDER BY c.effective_at").all();
    return { next_renewal: next, renewing: active.map((a) => ({ ...a, renews_on: next })), renewing_total_cents: active.reduce((s, a) => s + a.monthly_fee_cents, 0), trials_ending: trials.map((x) => ({ ...x, days_left: Math.ceil((Date.parse(x.trial_ends_at) - t) / DAY) })), scheduled_changes: scheduled };
  }
  // Opens a case for each failed subscription payment or overdue platform invoice and steps it through reminders.
  function scanDunning() {
    const t = clock(); let opened = 0;
    const open = (org, invoiceId, reason) => { if (db.prepare("SELECT 1 FROM platform_dunning WHERE organisation_id=? AND COALESCE(invoice_id,'')=COALESCE(?,'') AND status='open'").get(org, invoiceId)) return; db.prepare("INSERT INTO platform_dunning (id,organisation_id,invoice_id,reason,opened_at,step,next_action_at) VALUES (?,?,?,?,?,0,?)").run(crypto.randomUUID(), org, invoiceId, reason, iso(t), iso(t)); opened++; };
    for (const s of db.prepare("SELECT organisation_id FROM organisation_subscriptions WHERE payment_status='failed' AND status IN ('active','trialing','past_due')").all()) open(s.organisation_id, null, 'Subscription payment failed');
    for (const i of db.prepare("SELECT id,organisation_id,number FROM platform_invoices WHERE status='sent' AND due_at<?").all(iso(t))) open(i.organisation_id, i.id, `Invoice ${i.number} is overdue`);
    // Close cases that have been paid.
    for (const c of db.prepare("SELECT d.id,d.organisation_id,d.invoice_id FROM platform_dunning d WHERE d.status='open'").all()) {
      const paid = c.invoice_id ? db.prepare("SELECT status FROM platform_invoices WHERE id=?").get(c.invoice_id)?.status === 'paid' : db.prepare("SELECT payment_status FROM organisation_subscriptions WHERE organisation_id=?").get(c.organisation_id)?.payment_status === 'paid';
      if (paid) db.prepare("UPDATE platform_dunning SET status='resolved',resolved_at=?,resolution='Paid' WHERE id=?").run(iso(t), c.id);
    }
    return opened;
  }
  async function runDunning() {
    scanDunning(); const t = clock(), steps = PRICE_POLICY.dunning_steps_days; let reminded = 0;
    for (const c of db.prepare("SELECT * FROM platform_dunning WHERE status='open' AND next_action_at<=?").all(iso(t))) {
      const step = c.step;
      try { await notify?.notifyRoles?.(c.organisation_id, ['owner'], { kind: 'subscription_payment_problem', title: 'Your Super Pro payment needs attention', body: `${c.reason}. Update your payment details or pay the invoice in Plans & Usage to keep full access.`, link: '#b09/usage', dedupe: `dunning:${c.id}:${step}` }); reminded++; } catch { /* best effort */ }
      const nextStep = step + 1;
      db.prepare('UPDATE platform_dunning SET step=?,next_action_at=? WHERE id=?').run(nextStep, nextStep < steps.length ? iso(Date.parse(c.opened_at) + steps[nextStep] * DAY) : null, c.id);
    }
    return { reminded };
  }
  function dunning() {
    scanDunning();
    return db.prepare("SELECT d.*,COALESCE(o.display_name,o.name) business,i.number invoice_number,i.total_cents FROM platform_dunning d JOIN organisations o ON o.id=d.organisation_id LEFT JOIN platform_invoices i ON i.id=d.invoice_id ORDER BY d.status='open' DESC, d.opened_at DESC LIMIT 200").all()
      .map((d) => ({ ...d, days_open: Math.floor((clock() - Date.parse(d.opened_at)) / DAY), restrict_suggested: d.status === 'open' && clock() - Date.parse(d.opened_at) >= PRICE_POLICY.restrict_after_days * DAY }));
  }
  function resolveDunning(id, actor, resolution) {
    const r = db.prepare("UPDATE platform_dunning SET status='resolved',resolved_at=?,resolution=? WHERE id=? AND status='open'").run(now(), String(resolution).slice(0, 200), id);
    if (!r.changes) return E(404, 'Open case not found.');
    const c = db.prepare('SELECT organisation_id FROM platform_dunning WHERE id=?').get(id); audit(c.organisation_id, actor, 'billing.dunning_resolved', { resolution }); return { ok: true };
  }

  // ---------------- revenue ----------------
  function revenue(months = 6) {
    const t = clock(), out = [];
    for (let i = months - 1; i >= 0; i--) {
      const d = new Date(t), s = Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - i, 1), e = Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - i + 1, 1);
      const paid = db.prepare("SELECT COALESCE(SUM(subtotal_cents),0) ex, COALESCE(SUM(gst_cents),0) gst, COUNT(*) n FROM platform_invoices WHERE status='paid' AND paid_at>=? AND paid_at<?").get(iso(s), iso(e));
      const invoiced = db.prepare("SELECT COALESCE(SUM(total_cents),0) c FROM platform_invoices WHERE status IN ('sent','paid') AND period_start>=? AND period_start<?").get(iso(s), iso(e)).c;
      const ups = db.prepare("SELECT COUNT(*) n FROM subscription_change_requests WHERE kind='upgrade' AND status='applied' AND created_at>=? AND created_at<?").get(iso(s), iso(e)).n;
      const downs = db.prepare("SELECT COUNT(*) n FROM subscription_change_requests WHERE kind='downgrade' AND status='applied' AND updated_at>=? AND updated_at<?").get(iso(s), iso(e)).n;
      const newSubs = db.prepare("SELECT COUNT(*) n FROM audit_logs WHERE action IN ('subscription.payment_received','billing.invoice_paid') AND created_at>=? AND created_at<?").get(iso(s), iso(e)).n;
      out.push({ month: iso(s).slice(0, 7), collected_ex_gst_cents: paid.ex, gst_collected_cents: paid.gst, invoices_paid: paid.n, invoiced_cents: invoiced, upgrades: ups, downgrades: downs, payments_recorded: newSubs });
    }
    const mrr = db.prepare("SELECT COALESCE(SUM(p.monthly_fee_cents),0) c FROM organisation_subscriptions s JOIN subscription_plans p ON p.id=s.plan_id WHERE s.status='active'").get().c;
    const outstanding = db.prepare("SELECT COALESCE(SUM(total_cents),0) c, COUNT(*) n FROM platform_invoices WHERE status='sent'").get();
    const failed = db.prepare("SELECT COUNT(*) n FROM organisation_subscriptions WHERE payment_status='failed'").get().n;
    const cancelled = db.prepare("SELECT COUNT(*) n FROM organisation_subscriptions WHERE status IN ('cancelled','canceled')").get().n;
    return { mrr_cents: mrr, arr_cents: mrr * 12, outstanding_cents: outstanding.c, outstanding_invoices: outstanding.n, failed_payments: failed, cancelled_subscriptions: cancelled, months: out, note: 'From Super Pro platform invoices and subscriptions (before add-ons and complimentary access). Money received by card is confirmed by Stripe; compare with your Stripe reports before relying on it.' };
  }

  async function daily() { const p = await applyDuePrices(); const c = await applyDueChanges(); const d = await runDunning(); return { ...p, changes: c, ...d }; }
  return { plans, proposePrice, priceProposal, approvePrice, cancelPrice, applyDuePrices, quoteChange, requestChange, cancelChange, applyDueChanges, prorationLines, markProrationInvoiced, changesFor, renewals, scanDunning, runDunning, dunning, resolveDunning, revenue, daily, PRICE_POLICY };
}
