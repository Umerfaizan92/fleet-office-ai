// Emails from Super Pro to its own subscribers: welcome, trial reminders, plan changes, subscription receipts and refusals.
// These are platform emails only. They never touch a business's own customer invoices or receipts (see payments.js).
import { RULES } from './entitlements.js';
import crypto from 'node:crypto';
import { sendBrandedEmail } from './mailer.js';
import { renderEmail, platformBrand, PLATFORM_NAME } from './email-templates.js';

const DAY = 86400000;
const money = (c) => '$' + (c / 100).toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const dateLong = (iso) => new Date(iso).toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Australia/Perth' });
const AI = { core: 'AI assistant for everyday office work', operations: 'AI tools for running operations', higher_limits: 'Higher AI usage limits', metered: 'Metered AI usage' };
const LEVEL = { basic: 'Basic', full: 'Full', standard: 'Standard storage', expanded: 'Expanded storage', high: 'High-capacity storage' };

export function createLifecycle({ db, env, notify }) {
  const base = () => String(env.PUBLIC_BASE_URL || '').replace(/\/$/, '');
  const plans = () => db.prepare(`SELECT * FROM subscription_plans WHERE active=1 AND monthly_fee_cents>0 ORDER BY monthly_fee_cents`).all();
  const owner = (org) => db.prepare(`SELECT u.id,u.email,u.full_name FROM memberships m JOIN users u ON u.id=m.user_id WHERE m.organisation_id=? AND m.role='owner' ORDER BY m.rowid LIMIT 1`).get(org);
  const orgRow = (org) => db.prepare(`SELECT o.id,COALESCE(o.display_name,o.name) name,s.status,s.trial_ends_at,s.plan_id,p.name plan_name,p.monthly_fee_cents,p.limits_json FROM organisations o JOIN organisation_subscriptions s ON s.organisation_id=o.id JOIN subscription_plans p ON p.id=s.plan_id WHERE o.id=?`).get(org);

  function features(limitsJson, planId) {
    const r = RULES[planId] || RULES.starter, n = (v) => (v < 0 ? 'Unlimited' : v.toLocaleString('en-AU'));
    return [`Up to ${n(r.business_users)} team logins and ${n(r.workers)} workers`, `${n(r.customers)} customers and ${n(r.stock_items)} stock items`, `${r.media_mb / 1024} GB storage`, `${n(r.ai)} AI requests a month`, `${r.channels} connected channels, up to ${r.growth_posts_per_day} post${r.growth_posts_per_day === 1 ? '' : 's'} a day${r.growth_auto_publish ? ', auto-posting to Facebook Pages and X' : ''}`];
  }
  const ladder = (fee) => plans().filter((p) => p.monthly_fee_cents > fee).map((p) => `${p.name}: ${money(p.monthly_fee_cents)} a month`);
  const allPlans = () => plans().map((p) => `${p.name}: ${money(p.monthly_fee_cents)} a month`);
  const helpNote = 'Need a hand? Open Support inside the app and our team will help you.';

  // Sends once per (business, dedupe key). A failed send is recorded, not retried silently forever.
  async function send(org, kind, dedupe, compose) {
    let id = crypto.randomUUID();
    const o = owner(org), row = orgRow(org);
    if (!o || !row) return { sent: false, reason: 'no_owner' };
    if (!db.prepare(`INSERT OR IGNORE INTO lifecycle_emails (id,organisation_id,user_id,kind,dedupe_key,recipient,status,created_at) VALUES (?,?,?,?,?,?,'queued',?)`).run(id, org, o.id, kind, dedupe, o.email, new Date().toISOString()).changes) {
      const prior = db.prepare(`SELECT id,status FROM lifecycle_emails WHERE organisation_id=? AND dedupe_key=?`).get(org, dedupe);
      if (prior.status === 'sent') return { sent: false, reason: 'already_sent' };
      id = prior.id; // an earlier attempt did not go out (for example email was not set up yet), so try again
    }
    const first = String(o.full_name || '').split(/\s+/)[0] || 'there', c = compose({ o, row, first });
    const r = await sendBrandedEmail(env, { to: o.email, delivery:{organisationId:org,userId:o.id,category:kind,subject:c.subject}, subject: c.subject, rendered: renderEmail(platformBrand(env), c.frame), kind: 'platform', fromName: `${PLATFORM_NAME}` });
    db.prepare(`UPDATE lifecycle_emails SET status=?,detail=? WHERE id=?`).run(r.sent ? 'sent' : /not_configured/.test(r.reason || '') ? 'not_configured' : 'failed', r.sent ? null : r.reason, id);
    return r;
  }
  const signIn = { label: 'Open your workspace', url: `${base()}/saas/sign-in.html` };
  const trialLine = (row) => row.trial_ends_at ? `ends on ${dateLong(row.trial_ends_at)}` : '';

  const sendWelcome = (org) => send(org, 'welcome', 'welcome', ({ row, first }) => ({
    subject: `Welcome to ${PLATFORM_NAME}`,
    frame: {
      heading: `Welcome, ${first}`,
      paragraphs: [`Your workspace for ${row.name} is ready.`, row.trial_ends_at ? `Your free trial ${trialLine(row)}. Everything on the ${row.plan_name} plan is available until then, and nothing you enter is lost when it ends.` : '', 'To get started:\n1. Finish your business details in Setup.\n2. Add your team and your first customer.\n3. Create a job, then ask for payment.'],
      facts: [['Business', row.name], ['Plan', row.plan_name], row.trial_ends_at ? ['Trial ends', dateLong(row.trial_ends_at)] : null].filter(Boolean),
      button: signIn, notes: [helpNote, allPlans().length ? 'Plans after your trial:\n' + allPlans().join('\n') : '']
    }
  }));
  const sendTrialNotice = (org, days) => send(org, days <= 0 ? 'trial_ended' : 'trial_ending', days <= 0 ? 'trial_ended' : `trial_ending:${days <= 1 ? 1 : 3}`, ({ row, first }) => ({
    subject: days <= 0 ? 'Your free trial has ended' : `Your free trial ends in ${days} day${days === 1 ? '' : 's'}`,
    frame: {
      heading: days <= 0 ? 'Your free trial has ended' : `${first}, your trial ends in ${days} day${days === 1 ? '' : 's'}`,
      paragraphs: [days <= 0 ? `Your data for ${row.name} is kept safe. Choose a plan to carry on where you left off.` : `Choose a plan before ${dateLong(row.trial_ends_at)} to keep working without a break. Everything you have entered stays as it is.`],
      facts: [['Business', row.name], ['Current plan', row.plan_name]], button: { label: 'Choose a plan', url: `${base()}/saas/sign-in.html` }, notes: [allPlans().join('\n'), helpNote]
    }
  })).then(async (r) => { if (r.sent || r.reason === 'email_not_configured') await notify?.notifyRoles(org, ['owner'], { kind: 'trial', title: days <= 0 ? 'Your free trial has ended' : `Your free trial ends in ${days} day${days === 1 ? '' : 's'}`, link: '#billing', dedupe: `trial:${days <= 0 ? 'ended' : days <= 1 ? 1 : 3}` }); return r; });
  const sendPlanChanged = (org, fromName, key) => send(org, 'plan_changed', `plan:${key}`, ({ row, first }) => ({
    subject: `You are now on the ${row.plan_name} plan`,
    frame: {
      heading: `${first}, you are now on ${row.plan_name}`,
      paragraphs: [`${fromName ? `Your plan changed from ${fromName} to ${row.plan_name}. ` : ''}Here is what is included:`, features(row.limits_json, row.plan_id).map((f) => '• ' + f).join('\n')],
      facts: [['Business', row.name], ['Plan', row.plan_name], ['Price', row.monthly_fee_cents ? `${money(row.monthly_fee_cents)} a month` : 'Included']],
      button: signIn, notes: [ladder(row.monthly_fee_cents).length ? 'Want more? Next plans up:\n' + ladder(row.monthly_fee_cents).join('\n') : '', helpNote]
    }
  }));
  const sendAddonActive = (org, a) => send(org, 'addon_active', `addon:${a.id}`, ({ row, first }) => ({
    subject: `${a.name} added to your plan`,
    frame: { heading: `${first}, your add-on is active`, paragraphs: [`${a.name} is now on ${row.name}. Your new limits apply straight away.`], facts: [['Business', row.name], ['Add-on', `${a.quantity} × ${a.unit}`], ['Extra cost', `${money(a.monthly_cents)} a month + GST`]], button: signIn, notes: ['You can remove an add-on at any time under Plans & Billing. Anything you already saved stays.', helpNote] }
  })).then(async (r) => { await notify?.notifyRoles(org, ['owner'], { kind: 'billing', title: `${a.name} is active`, body: `${a.quantity} × ${a.unit} added.`, link: '#billing', dedupe: `addon-live:${a.id}` }); return r; });
  const sendInvoice = (org, i) => send(org, 'invoice', `invoice:${i.id}:${i.reminder || 0}`, ({ row, first }) => ({
    subject: i.reminder ? `Reminder: invoice ${i.number} is overdue` : `Invoice ${i.number} from ${PLATFORM_NAME}`,
    frame: { heading: i.reminder ? `${first}, a friendly reminder` : `${first}, your invoice is ready`, paragraphs: [i.reminder ? `Invoice ${i.number} for ${row.name} was due on ${dateLong(i.due_at)} and we have not received payment yet. If you have already paid, thank you, and please ignore this.` : `Here is your invoice for ${row.name} for ${new Date(i.period_start).toLocaleDateString('en-AU', { month: 'long', year: 'numeric', timeZone: 'Australia/Perth' })}.`, i.lines.map((l) => `• ${l.description}: ${money(l.cents)}`).join('\n')], facts: [['Invoice', i.number], ['Subtotal', money(i.subtotal_cents)], ['GST (10%)', money(i.gst_cents)], ['Total due', money(i.total_cents)], ['Due', dateLong(i.due_at)], i.abn ? ['ABN', i.abn] : null].filter(Boolean), button: i.pay_url ? { label: `Pay ${money(i.total_cents)} now`, url: i.pay_url } : signIn, notes: [i.pay_url ? 'Pay by card or bank transfer on the secure payment page. Please do not forward this email: the link is private to your account.' : '', i.abn ? `${i.legal}, ABN ${i.abn}. This is a tax invoice.` : '', 'Your data is always safe. Questions? Open Support inside the app.'].filter(Boolean) }
  }));
  const sendPaymentReceipt = (org, { amount_cents, reference }) => send(org, 'subscription_receipt', `receipt:${reference}`, ({ row }) => ({
    subject: `Receipt for your ${PLATFORM_NAME} subscription`,
    frame: { heading: 'Payment received. Thank you.', paragraphs: [`We have received your subscription payment for ${row.name}. Keep this email as your receipt.`], facts: [['Amount', money(amount_cents)], ['Plan', row.plan_name], ['Paid on', dateLong(new Date().toISOString())], ['Reference', reference]], notes: [helpNote] }
  }));
  const sendPaymentFailed = (org, { reason, reference }) => send(org, 'subscription_payment_failed', `failed:${reference}`, ({ row, first }) => ({
    subject: 'Your subscription payment was refused',
    frame: { heading: `${first}, your payment was refused`, paragraphs: [`We could not take your subscription payment for ${row.name}.${reason ? ' Reason given: ' + reason + '.' : ''}`, 'Your data is kept safe. Please update your payment method so your plan continues without interruption.'], facts: [['Plan', row.plan_name], ['Reference', reference]], button: signIn, notes: [helpNote] }
  })).then(async (r) => { await notify?.notifyRoles(org, ['owner'], { kind: 'billing', title: 'Your subscription payment was refused', body: 'Update your payment method to keep your plan.', link: '#billing', urgent: true, dedupe: `failed:${reference}` }); return r; });

  async function runDaily(now = Date.now()) {
    let n = 0;
    for (const s of db.prepare(`SELECT organisation_id,trial_ends_at FROM organisation_subscriptions WHERE status='trialing' AND trial_ends_at IS NOT NULL`).all()) {
      const days = Math.ceil((new Date(s.trial_ends_at).getTime() - now) / DAY);
      if (days <= 3) { const r = await sendTrialNotice(s.organisation_id, days); if (r.sent) n++; }
    }
    return n;
  }
  setTimeout(() => runDaily().catch(() => {}), 30 * 1000).unref?.();
  setInterval(() => runDaily().catch((e) => console.error('[lifecycle] daily check failed:', e.message)), 60 * 60 * 1000).unref?.();
  return { sendWelcome, sendTrialNotice, sendAddonActive, sendInvoice, sendPlanChanged, sendPaymentReceipt, sendPaymentFailed, runDaily };
}
