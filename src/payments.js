// Customer payments. Each business connects its own Stripe / PayPal account (keys encrypted at rest), so money lands in that
// business's account and payouts to its bank follow that provider's payout schedule. Payment status is only ever changed by a
// signed provider webhook, a server-side capture, or a logged action by an owner/admin. Everything is audited per organisation.
import crypto from 'node:crypto';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import QRCode from 'qrcode';
import { appendAuditLog } from './db.js';
import { sendBrandedEmail } from './mailer.js';
import { renderEmail, tenantBrandFor, platformBrand } from './email-templates.js';
import { sendTextMessage } from './notify.js';

const DAY = 86400000;
const iso = (d = new Date()) => d.toISOString();
const money = (c) => '$' + (c / 100).toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const cents = (v) => Math.round(Number(v) * 100);
const safeEqual = (a, b) => { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && crypto.timingSafeEqual(x, y); };
const METHOD_LABEL = { stripe: 'Card or wallet (Stripe)', paypal: 'PayPal', bank: 'Bank transfer', cash: 'Cash', eftpos: 'Card terminal', bank_transfer: 'Bank transfer', card_terminal: 'Card terminal', other: 'Other' };
const SETTING_DEFAULTS = { terms_days: 7, late_fee_enabled: 0, late_fee_percent: 10, late_fee_ack_at: null, customer_reminders: 0, owner_reminders: 1 };

export function verifyStripeSignature(rawBody, header, secret, nowMs = Date.now(), toleranceSeconds = 300) {
  if (!rawBody || !header || !secret) return false;
  const parts = Object.fromEntries(String(header).split(',').map((p) => p.trim().split('=')).filter((p) => p.length === 2).map(([k, v]) => [k, v]));
  const signatures = String(header).split(',').map((p) => p.trim()).filter((p) => p.startsWith('v1=')).map((p) => p.slice(3));
  const t = Number(parts.t);
  if (!Number.isFinite(t) || !signatures.length || Math.abs(nowMs / 1000 - t) > toleranceSeconds) return false;
  const expected = crypto.createHmac('sha256', secret).update(`${t}.`).update(rawBody).digest('hex');
  return signatures.some((s) => safeEqual(s, expected));
}

export function installPayments(app, { db, env, runtime, requireSaasUser, requireSaasRole, saasAudit, financeRoles, syncJobFinance, uploadRoot, notify, isAuthorised, fetchImpl = globalThis.fetch }) {
  const limiter = rateLimit({ windowMs: 60 * 1000, limit: 120, standardHeaders: true, legacyHeaders: false, message: { ok: false, error: 'Too many requests.' } });
  const money_roles = [requireSaasUser, requireSaasRole(...financeRoles)];
  const base = () => String(env.PUBLIC_BASE_URL || '').replace(/\/$/, '');

  db.exec(`CREATE TABLE IF NOT EXISTS saved_cards (
      id TEXT PRIMARY KEY, organisation_id TEXT NOT NULL, customer_id TEXT NOT NULL, stripe_customer_id TEXT NOT NULL, stripe_payment_method_id TEXT NOT NULL,
      brand TEXT, last4 TEXT, exp_month INTEGER, exp_year INTEGER, funding TEXT, cvc_check TEXT, postal_check TEXT, address_check TEXT, three_d_secure TEXT,
      authorised_at TEXT, created_at TEXT NOT NULL, removed_at TEXT,
      FOREIGN KEY(organisation_id) REFERENCES organisations(id) ON DELETE CASCADE);
    CREATE UNIQUE INDEX IF NOT EXISTS uq_saved_cards_pm ON saved_cards(organisation_id, stripe_payment_method_id);
    CREATE TABLE IF NOT EXISTS saved_card_customers (organisation_id TEXT NOT NULL, customer_id TEXT NOT NULL, stripe_customer_id TEXT NOT NULL, created_at TEXT NOT NULL, PRIMARY KEY(organisation_id, customer_id));
    CREATE INDEX IF NOT EXISTS idx_saved_cards_org ON saved_cards(organisation_id, customer_id);`);
  // Card numbers never touch this server: the customer types them on Stripe's own page. We keep only Stripe's references and the
  // safe summary Stripe returns (brand, last four digits, expiry and the bank's check results).
  const PAD_ROLES = ['owner', 'admin', 'super_admin', 'manager', 'director', 'employee'];
  const pad_roles = [requireSaasUser, requireSaasRole(...PAD_ROLES)];

  // ---------- settings and secrets ----------
  const sealed = (value) => JSON.stringify(runtime.encryptBundle({ v: value }));
  const unsealed = (blob) => (blob ? runtime.decryptBundle(blob).v : null);
  const settingsRow = (org) => db.prepare(`SELECT * FROM payment_settings WHERE organisation_id=?`).get(org);
  const settingsFor = (org) => ({ ...SETTING_DEFAULTS, ...(settingsRow(org) || {}) });
  const business = (org) => { const o = db.prepare(`SELECT COALESCE(display_name,name) name, abn FROM organisations WHERE id=?`).get(org); return { name: o?.name || 'Your business', abn: o?.abn || '' }; };
  const owingOf = (j) => Math.max(0, j.price_cents + (j.late_fee_cents || 0) - j.paid_cents);
  const audit = (org, action, entityId, metadata = {}) => appendAuditLog(db, { organisation_id: org, user_id: null, user_name: 'Payments automation', user_role: 'system', action, module: 'payments', entity_type: 'job_payment', entity_id: entityId, metadata });

  // ---------- provider calls ----------
  async function providerJson(url, init, label) {
    let r; try { r = await fetchImpl(url, { ...init, signal: AbortSignal.timeout(15000) }); } catch (err) { throw Object.assign(new Error(`${label} could not be reached. Try again shortly.`), { status: 502 }); }
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw Object.assign(new Error(`${label}: ${String(data?.error?.message || data?.message || data?.error_description || `HTTP ${r.status}`).slice(0, 200)}`), { status: 502 });
    return data;
  }
  const form = (obj) => { const p = new URLSearchParams(); const walk = (o, pre) => { for (const [k, v] of Object.entries(o)) { const key = pre ? `${pre}[${k}]` : k; if (v && typeof v === 'object') walk(v, key); else if (v !== undefined && v !== null && v !== '') p.append(key, String(v)); } }; walk(obj, ''); return p; };
  const stripeCall = (s, method, path, body, idem) => providerJson(`https://api.stripe.com/v1/${path}`, { method, headers: { authorization: `Bearer ${unsealed(s.stripe_secret_enc)}`, ...(body ? { 'content-type': 'application/x-www-form-urlencoded' } : {}), ...(idem ? { 'idempotency-key': idem } : {}) }, body: body ? form(body).toString() : undefined }, 'Stripe');
  const paypalBase = (s) => (s.paypal_live ? 'https://api-m.paypal.com' : 'https://api-m.sandbox.paypal.com');
  async function paypalToken(s) {
    const basic = Buffer.from(`${s.paypal_client_id}:${unsealed(s.paypal_secret_enc)}`).toString('base64');
    return (await providerJson(`${paypalBase(s)}/v1/oauth2/token`, { method: 'POST', headers: { authorization: `Basic ${basic}`, 'content-type': 'application/x-www-form-urlencoded' }, body: 'grant_type=client_credentials' }, 'PayPal')).access_token;
  }
  const paypalCall = async (s, method, path, body, idem) => providerJson(`${paypalBase(s)}${path}`, { method, headers: { authorization: `Bearer ${await paypalToken(s)}`, 'content-type': 'application/json', ...(idem ? { 'paypal-request-id': idem } : {}) }, body: body ? JSON.stringify(body) : undefined }, 'PayPal');

  // ---------- notices (idempotent per dedupe key and channel; an in-app copy is always kept) ----------
  function contactOf(job) {
    const c = job.customer_id ? db.prepare(`SELECT name,email,phone FROM tenant_customers WHERE id=? AND organisation_id=?`).get(job.customer_id, job.organisation_id) : null;
    return { name: c?.name || '', email: c?.email || '', phone: c?.phone || '' };
  }
  const ownerContact = (org) => db.prepare(`SELECT u.email,u.phone,u.full_name FROM memberships m JOIN users u ON u.id=m.user_id WHERE m.organisation_id=? AND m.role='owner' AND m.status='active' ORDER BY m.rowid LIMIT 1`).get(org) || {};
  // Messages to customers use the business's own name, colour and logo. Messages to the owner about their business use the platform's.
  const INTERNAL_KINDS = new Set(['owner_reminder', 'payment_received', 'payment_review']);
  async function sendEmailNotice(org, { recipient, subject, body, internal, category }) {
    const brand = internal ? platformBrand(env) : tenantBrandFor(db, uploadRoot, org);
    const link = body.match(/https?:\/\/\S+/)?.[0];
    const rendered = renderEmail(brand, { heading: subject, paragraphs: body.split('\n\n'), button: link && !internal ? { label: 'Pay securely online', url: link } : null });
    return sendBrandedEmail(env, { to: recipient, delivery:{organisationId:org,category,subject}, subject, rendered, kind: internal ? 'platform' : 'tenant', fromName: internal ? undefined : brand.name, attachments: brand.attachments || [] });
  }
  async function notice(org, { job, payment, kind, channel, recipient, subject, body, dedupe }) {
    const id = crypto.randomUUID();
    const ins = db.prepare(`INSERT OR IGNORE INTO payment_notices (id,organisation_id,work_order_id,payment_id,kind,channel,recipient,subject,body,status,dedupe_key,created_at) VALUES (?,?,?,?,?,?,?,?,?,'recorded',?,?)`)
      .run(id, org, job?.id || null, payment?.id || null, kind, channel, recipient || null, subject || null, body, dedupe || null, iso());
    if (!ins.changes) return null;
    if (channel === 'in_app') return { id, status: 'recorded' };
    const res = channel === 'email' ? await sendEmailNotice(org, { recipient, subject, body, category:kind, internal: INTERNAL_KINDS.has(kind) }) : await sendTextMessage(env, { to: recipient, text: body,delivery:{organisationId:org,category:kind,subject} }, fetchImpl);
    const status = res.sent ? 'sent' : /not_configured/.test(res.reason || '') ? 'not_configured' : 'failed';
    db.prepare(`UPDATE payment_notices SET status=?,detail=? WHERE id=?`).run(status, res.sent ? null : res.reason, id);
    return { id, status, reason: res.reason };
  }
  // Sends to every channel the contact has. Returns what happened per channel so the owner can see it.
  async function toCustomer(org, job, payment, kind, subject, body, dedupe) {
    const c = contactOf(job), out = [];
    if (c.email) out.push({ channel: 'email', ...(await notice(org, { job, payment, kind, channel: 'email', recipient: c.email, subject, body, dedupe }) || { status: 'already_sent' }) });
    if (c.phone) out.push({ channel: 'sms', ...(await notice(org, { job, payment, kind, channel: 'sms', recipient: c.phone, subject, body: body.length > 450 ? body.slice(0, 447) + '...' : body, dedupe }) || { status: 'already_sent' }) });
    if (!out.length) out.push({ channel: 'none', status: 'no_contact', reason: 'This customer has no email or mobile number saved.' });
    return out;
  }
  const toOwner = async (org, job, payment, kind, subject, body, dedupe) => {
    await notice(org, { job, payment, kind, channel: 'in_app', subject, body, dedupe });
    await notify?.notifyRoles(org, ['owner'], { kind, title: subject, body, link: '#finance', dedupe });
    if (!settingsFor(org).owner_reminders) return;
    const o = ownerContact(org);
    if (o.email) await notice(org, { job, payment, kind, channel: 'email', recipient: o.email, subject, body, dedupe });
    if (o.phone) await notice(org, { job, payment, kind, channel: 'sms', recipient: o.phone, subject, body: body.length > 300 ? body.slice(0, 297) + '...' : body, dedupe });
  };

  // ---------- the one place a payment becomes "paid" ----------
  function nextReceiptNo(org, at) {
    const n = Number(db.prepare(`SELECT COUNT(*) c FROM job_payments WHERE organisation_id=? AND receipt_no IS NOT NULL`).get(org).c) + 1;
    return `R-${at.slice(0, 4)}-${String(n).padStart(4, '0')}`;
  }
  async function markPaid(paymentId, { providerRef = null, reference = null } = {}) {
    const at = iso();
    const result = db.transaction(() => {
      const p = db.prepare(`SELECT * FROM job_payments WHERE id=?`).get(paymentId);
      if (!p || p.status === 'paid' || p.status === 'refunded') return { changed: false, payment: p };
      const receipt = nextReceiptNo(p.organisation_id, at);
      db.prepare(`UPDATE job_payments SET status='paid',paid_at=?,receipt_no=?,provider_ref=COALESCE(provider_ref,?),reference=COALESCE(?,reference),failure_reason=NULL,updated_at=? WHERE id=?`).run(at, receipt, providerRef, reference, at, paymentId);
      const w = db.prepare(`SELECT paid_at FROM work_orders WHERE id=? AND organisation_id=?`).get(p.work_order_id, p.organisation_id);
      db.prepare(`UPDATE work_orders SET paid_cents=paid_cents+?,paid_at=COALESCE(?,?),updated_at=? WHERE id=? AND organisation_id=?`).run(p.amount_cents, w?.paid_at || null, at, at, p.work_order_id, p.organisation_id);
      // Anything else still waiting on this job is no longer needed once it is fully paid.
      const j = db.prepare(`SELECT price_cents,paid_cents,late_fee_cents FROM work_orders WHERE id=?`).get(p.work_order_id);
      if (j.paid_cents >= j.price_cents + j.late_fee_cents) db.prepare(`UPDATE job_payments SET status='cancelled',updated_at=? WHERE work_order_id=? AND status='pending' AND id<>?`).run(at, p.work_order_id, paymentId);
      return { changed: true, payment: { ...p, status: 'paid', receipt_no: receipt, paid_at: at } };
    })();
    if (!result.changed) return result;
    const p = result.payment;
    syncJobFinance(p.organisation_id, p.work_order_id, null);
    audit(p.organisation_id, 'payment.received', p.id, { work_order_id: p.work_order_id, provider: p.provider, amount_cents: p.amount_cents, receipt_no: p.receipt_no });
    const job = db.prepare(`SELECT * FROM work_orders WHERE id=?`).get(p.work_order_id);
    await sendReceipt(job, p);
    await toOwner(p.organisation_id, job, p, 'payment_received', `Payment received: ${money(p.amount_cents)}`, `${money(p.amount_cents)} received for "${job.title}" (${METHOD_LABEL[p.method || p.provider] || p.provider}). Receipt ${p.receipt_no}. ${owingOf(job) ? `Still owing: ${money(owingOf(job))}.` : 'This job is now paid in full.'}`, `paid:${p.id}`);
    return result;
  }
  async function sendReceipt(job, p, force = false) {
    const biz = business(job.organisation_id), left = owingOf(job);
    const gst = job.gst_applies ? `\nIncludes GST of ${money(Math.round(p.amount_cents / 11))}.` : '';
    const body = [`Receipt ${p.receipt_no} from ${biz.name}${biz.abn ? ` (ABN ${biz.abn})` : ''}`, '', `Paid ${money(p.amount_cents)} for "${job.title}" on ${p.paid_at.slice(0, 10)} by ${METHOD_LABEL[p.method || p.provider] || p.provider}.${gst}`, left ? `Balance still owing: ${money(left)}.` : 'This job is paid in full. Thank you.', '', 'Please keep this receipt for your records.'].join('\n');
    return toCustomer(job.organisation_id, job, p, 'receipt', `Receipt ${p.receipt_no} from ${biz.name}`, body, force ? `receipt:${p.id}:${Date.now()}` : `receipt:${p.id}`);
  }

  // ---------- creating payment requests ----------
  function ensureInvoice(job, s) {
    if (job.invoice_issued_at) return job;
    const at = iso(), due = iso(new Date(Date.now() + s.terms_days * DAY));
    db.prepare(`UPDATE work_orders SET invoice_issued_at=?,due_at=?,updated_at=? WHERE id=? AND organisation_id=?`).run(at, due, at, job.id, job.organisation_id);
    return { ...job, invoice_issued_at: at, due_at: due };
  }
  const bankDetails = (s) => (s.bank_bsb && s.bank_account_number ? [`Bank transfer: ${s.bank_account_name || ''}`.trim(), `BSB ${s.bank_bsb}, account ${s.bank_account_number}`, s.payid ? `PayID: ${s.payid}` : ''].filter(Boolean).join('\n') : '');
  async function ensureStripeCustomer(org, raw, customerId, contact) {
    const known = db.prepare(`SELECT stripe_customer_id FROM saved_card_customers WHERE organisation_id=? AND customer_id=?`).get(org, customerId);
    if (known) return known.stripe_customer_id;
    const c = await stripeCall(raw, 'POST', 'customers', { name: contact.name || undefined, email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact.email) ? contact.email : undefined, phone: contact.phone || undefined, metadata: { organisation_id: org, customer_id: customerId } }, `sp-cus-${org}-${customerId}`);
    db.prepare(`INSERT OR IGNORE INTO saved_card_customers (organisation_id,customer_id,stripe_customer_id,created_at) VALUES (?,?,?,?)`).run(org, customerId, c.id, iso());
    return c.id;
  }
  // After a paid checkout: if the customer ticked Stripe's "save my card" box, Stripe attaches the card to the Stripe customer and marks
  // it reusable. Only then do we keep a reference. Nothing is saved without that tick.
  async function captureSavedCard(org, payment, session) {
    if (!session.customer || !session.payment_intent) return null;
    const raw = settingsRow(org); if (!raw?.stripe_secret_enc) return null;
    const link = db.prepare(`SELECT customer_id FROM saved_card_customers WHERE organisation_id=? AND stripe_customer_id=?`).get(org, String(session.customer));
    if (!link) return null;
    const pi = await stripeCall(raw, 'GET', `payment_intents/${encodeURIComponent(session.payment_intent)}?expand[]=payment_method&expand[]=latest_charge`);
    const pm = pi.payment_method; if (!pm || typeof pm !== 'object' || pm.type !== 'card' || pm.customer !== session.customer || pm.allow_redisplay !== 'always') return null;
    const card = pm.card || {}, charge = typeof pi.latest_charge === 'object' ? pi.latest_charge : null, chk = card.checks || {};
    const tds = charge?.payment_method_details?.card?.three_d_secure?.result || (card.three_d_secure_usage?.supported ? 'supported' : null);
    const id = crypto.randomUUID();
    const r = db.prepare(`INSERT OR IGNORE INTO saved_cards (id,organisation_id,customer_id,stripe_customer_id,stripe_payment_method_id,brand,last4,exp_month,exp_year,funding,cvc_check,postal_check,address_check,three_d_secure,authorised_at,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
      .run(id, org, link.customer_id, String(session.customer), pm.id, card.brand || null, card.last4 || null, card.exp_month || null, card.exp_year || null, card.funding || null, chk.cvc_check || null, chk.address_postal_code_check || null, chk.address_line1_check || null, tds, charge?.outcome?.type === 'authorized' ? iso() : null, iso());
    if (r.changes) audit(org, 'card.saved', id, { customer_id: link.customer_id, brand: card.brand, last4: card.last4 });
    return r.changes ? id : null;
  }
  async function createRequest(org, user, input) {
    const s = settingsFor(org), raw = settingsRow(org);
    const job = db.prepare(`SELECT * FROM work_orders WHERE id=? AND organisation_id=?`).get(input.work_order_id, org);
    if (!job) throw Object.assign(new Error('Job not found.'), { status: 404 });
    if (job.price_cents <= 0) throw Object.assign(new Error('Set the job price first, then ask for payment.'), { status: 400 });
    const owing = owingOf(job);
    if (owing <= 0) throw Object.assign(new Error('This job is already paid in full.'), { status: 409 });
    const amount = input.amount === undefined ? owing : cents(input.amount);
    if (!(amount >= 100 && amount <= owing)) throw Object.assign(new Error(`Choose an amount between $1.00 and ${money(owing)}.`), { status: 400 });
    if (input.provider === 'stripe' && !(raw?.stripe_secret_enc)) throw Object.assign(new Error('Connect Stripe in payment settings first.'), { status: 409 });
    if (input.provider === 'paypal' && !(raw?.paypal_client_id && raw?.paypal_secret_enc)) throw Object.assign(new Error('Connect PayPal in payment settings first.'), { status: 409 });
    if (input.provider === 'bank' && !bankDetails(s)) throw Object.assign(new Error('Add your bank details in payment settings first.'), { status: 409 });
    if (isAuthorised && !isAuthorised(org, input.provider)) throw Object.assign(new Error('Confirm your authorisation for this payment method first (Plans & Billing, Payment connections).'), { status: 409 });
    const j = ensureInvoice(job, s), biz = business(org), contact = contactOf(j), at = iso();
    const recent = db.prepare(`SELECT * FROM job_payments WHERE organisation_id=? AND work_order_id=? AND provider=? AND status='pending' AND amount_cents=? AND created_at>?`).get(org, j.id, input.provider, amount, iso(new Date(Date.now() - 20 * 3600000)));
    let p = recent;
    if (!p) {
      const id = crypto.randomUUID();
      db.prepare(`INSERT INTO job_payments (id,organisation_id,work_order_id,customer_id,provider,method,status,amount_cents,currency,reference,created_by_user_id,created_at,updated_at) VALUES (?,?,?,?,?,?,'pending',?,'aud',?,?,?,?)`)
        .run(id, org, j.id, j.customer_id || null, input.provider, input.provider === 'bank' ? 'bank_transfer' : 'card', amount, input.provider === 'bank' ? `SP-${id.slice(0, 6).toUpperCase()}` : null, user?.user_id || null, at, at);
      try {
        if (input.provider === 'stripe') {
          const title = `${biz.name} - ${j.title}`.slice(0, 120);
          const offerSave = Boolean(input.save_card && j.customer_id);
          const stripeCustomer = offerSave ? await ensureStripeCustomer(org, raw, j.customer_id, contact) : null;
          const session = await stripeCall(raw, 'POST', 'checkout/sessions', {
            mode: 'payment', client_reference_id: id, expires_at: Math.floor(Date.now() / 1000) + 23 * 3600,
            success_url: `${base()}/saas/payment-thanks.html?status=success`, cancel_url: `${base()}/saas/payment-thanks.html?status=cancelled`,
            ...(stripeCustomer ? { customer: stripeCustomer, saved_payment_method_options: { payment_method_save: 'enabled' } } : { customer_email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact.email) ? contact.email : undefined }),
            line_items: { 0: { quantity: 1, price_data: { currency: 'aud', unit_amount: amount, product_data: { name: title } } } },
            metadata: { payment_id: id, organisation_id: org, work_order_id: j.id }, payment_intent_data: { description: title, metadata: { payment_id: id, organisation_id: org } }
          }, `sp-${id}`);
          db.prepare(`UPDATE job_payments SET provider_ref=?,checkout_url=?,updated_at=? WHERE id=?`).run(session.id, session.url, iso(), id);
        } else if (input.provider === 'paypal') {
          const order = await paypalCall(raw, 'POST', '/v2/checkout/orders', {
            intent: 'CAPTURE', purchase_units: [{ reference_id: id, custom_id: id, description: `${biz.name} - ${j.title}`.slice(0, 120), amount: { currency_code: 'AUD', value: (amount / 100).toFixed(2) } }],
            payment_source: { paypal: { experience_context: { brand_name: biz.name.slice(0, 120), user_action: 'PAY_NOW', return_url: `${base()}/api/payments/paypal/return?payment=${id}`, cancel_url: `${base()}/saas/payment-thanks.html?status=cancelled` } } }
          }, `sp-${id}`);
          const link = (order.links || []).find((l) => ['payer-action', 'approve'].includes(l.rel))?.href;
          if (!link) throw Object.assign(new Error('PayPal did not return a payment link.'), { status: 502 });
          db.prepare(`UPDATE job_payments SET provider_ref=?,checkout_url=?,updated_at=? WHERE id=?`).run(order.id, link, iso(), id);
        }
      } catch (err) { db.prepare(`UPDATE job_payments SET status='failed',failure_reason=?,updated_at=? WHERE id=?`).run(String(err.message).slice(0, 200), iso(), id); throw err; }
      p = db.prepare(`SELECT * FROM job_payments WHERE id=?`).get(id);
    }
    let sent = [];
    if (input.send_to_customer) {
      const due = (j.due_at || '').slice(0, 10);
      const how = p.checkout_url ? `Pay securely online: ${p.checkout_url}` : `${bankDetails(s)}\nReference: ${p.reference}`;
      const fee = s.late_fee_enabled && s.late_fee_ack_at ? `\nPlease pay by ${due}. A late fee of ${s.late_fee_percent}% of the job total applies if payment is not received within ${s.terms_days} days.` : due ? `\nPlease pay by ${due}.` : '';
      sent = await toCustomer(org, j, p, 'payment_request', `Payment request from ${biz.name}`, `${biz.name}${biz.abn ? ` (ABN ${biz.abn})` : ''}\nPayment request: ${money(p.amount_cents)} for "${j.title}".\n${how}${fee}`, `request:${p.id}`);
    }
    audit(org, 'payment.requested', p.id, { work_order_id: j.id, provider: p.provider, amount_cents: p.amount_cents, by: user?.user_id || null, sent_to_customer: Boolean(input.send_to_customer) });
    return { payment: publicPayment(p), bank: p.provider === 'bank' ? { details: bankDetails(s), reference: p.reference } : undefined, sent };
  }
  const publicPayment = (p) => ({ id: p.id, work_order_id: p.work_order_id, provider: p.provider, method: p.method, status: p.status, amount_cents: p.amount_cents, checkout_url: p.checkout_url, receipt_no: p.receipt_no, reference: p.reference, note: p.note, failure_reason: p.failure_reason, created_at: p.created_at, paid_at: p.paid_at });

  // ---------- reminders, late fee, expiry ----------
  async function runCycle(onlyOrg = null, nowDate = new Date()) {
    const summary = { checked: 0, fees_applied: 0, notices: 0, expired: 0 };
    const at = iso(nowDate);
    summary.expired = db.prepare(`UPDATE job_payments SET status='expired',updated_at=? WHERE status='pending' AND provider IN ('stripe','paypal') AND created_at<?${onlyOrg ? ' AND organisation_id=?' : ''}`).run(...[at, iso(new Date(nowDate - DAY)), ...(onlyOrg ? [onlyOrg] : [])]).changes;
    const jobs = db.prepare(`SELECT * FROM work_orders WHERE price_cents>0 AND invoice_issued_at IS NOT NULL AND price_cents+late_fee_cents-paid_cents>0${onlyOrg ? ' AND organisation_id=?' : ''}`).all(...(onlyOrg ? [onlyOrg] : []));
    for (let job of jobs) {
      summary.checked++;
      const org = job.organisation_id, s = settingsFor(org), biz = business(org);
      const issued = new Date(job.invoice_issued_at), due = new Date(job.due_at || new Date(issued.getTime() + s.terms_days * DAY));
      const overdue = nowDate > due;
      if (overdue && s.late_fee_enabled && s.late_fee_ack_at && !job.late_fee_applied_at) {
        const fee = Math.round(job.price_cents * s.late_fee_percent / 100);
        if (fee > 0) {
          db.prepare(`UPDATE work_orders SET late_fee_cents=?,late_fee_applied_at=?,updated_at=? WHERE id=? AND late_fee_applied_at IS NULL`).run(fee, at, at, job.id);
          job = db.prepare(`SELECT * FROM work_orders WHERE id=?`).get(job.id);
          summary.fees_applied++;
          audit(org, 'payment.late_fee_applied', job.id, { work_order_id: job.id, percent: s.late_fee_percent, fee_cents: fee, terms_days: s.terms_days });
        }
      }
      const owing = owingOf(job), daysOver = Math.floor((nowDate - due) / DAY), age = (nowDate - issued) / DAY;
      const link = db.prepare(`SELECT checkout_url,reference,provider FROM job_payments WHERE work_order_id=? AND status='pending' AND checkout_url IS NOT NULL ORDER BY created_at DESC LIMIT 1`).get(job.id);
      const how = link ? `Pay securely online: ${link.checkout_url}` : bankDetails(s) ? `${bankDetails(s)}\nReference: ${job.title}` : `Please contact ${biz.name} to arrange payment.`;
      const stages = [];
      if (age >= 1) stages.push('d1');
      if (overdue) stages.push('due');
      if (job.late_fee_applied_at) stages.push('fee');
      for (let w = 1; w <= Math.min(Math.floor(daysOver / 7), 8); w++) stages.push(`w${w}`);
      const who = contactOf(job).name || 'the customer';
      for (const st of stages) {
        const text = { d1: `Payment pending: ${who} owes ${money(owing)} for "${job.title}". Due ${due.toISOString().slice(0, 10)}.`, due: `Overdue: ${who} has not paid ${money(owing)} for "${job.title}" (due ${due.toISOString().slice(0, 10)}).`, fee: `A ${s.late_fee_percent}% late fee (${money(job.late_fee_cents)}) was added to "${job.title}". Total now owing ${money(owing)}.` }[st] || `Still unpaid ${daysOver} days overdue: ${who} owes ${money(owing)} for "${job.title}".`;
        const before = db.prepare(`SELECT COUNT(*) c FROM payment_notices WHERE organisation_id=?`).get(org).c;
        await toOwner(org, job, null, 'owner_reminder', 'Payment reminder', text, `owner:${job.id}:${st}`);
        summary.notices += db.prepare(`SELECT COUNT(*) c FROM payment_notices WHERE organisation_id=?`).get(org).c - before;
      }
      if (s.customer_reminders) {
        const custStages = [];
        if (age >= 3 && !overdue) custStages.push('d3');
        if (overdue) custStages.push('due');
        for (let w = 1; w <= Math.min(Math.floor(daysOver / 7), 4); w++) custStages.push(`w${w}`);
        for (const st of custStages) {
          const feeLine = job.late_fee_applied_at ? `\nA late fee of ${money(job.late_fee_cents)} (${s.late_fee_percent}% of the job total) has been added as per our payment terms.` : '';
          const body = st === 'd3' ? `Hi ${who}, a friendly reminder from ${biz.name}: ${money(owing)} is due on ${due.toISOString().slice(0, 10)} for "${job.title}".\n${how}` : `Hi ${who}, ${biz.name} has not yet received ${money(owing)} for "${job.title}" (due ${due.toISOString().slice(0, 10)}).${feeLine}\n${how}`;
          const sent = await toCustomer(org, job, null, 'customer_reminder', `Payment reminder from ${biz.name}`, body, `cust:${job.id}:${st}`);
          summary.notices += sent.filter((x) => x.id).length;
        }
      }
    }
    return summary;
  }
  setInterval(() => runCycle().catch((err) => console.error('[payments] reminder cycle failed:', err.message)), 60 * 60 * 1000).unref?.();

  // ---------- routes: settings ----------
  const maskedSettings = (org) => {
    const r = settingsRow(org), s = settingsFor(org);
    return {
      stripe: { connected: Boolean(r?.stripe_secret_enc), hint: r?.stripe_hint || '', webhook_set: Boolean(r?.stripe_webhook_enc), webhook_url: `${base()}/api/webhooks/payments/stripe/${org}` },
      paypal: { connected: Boolean(r?.paypal_client_id && r?.paypal_secret_enc), client_id_hint: r?.paypal_client_id ? `••••${r.paypal_client_id.slice(-4)}` : '', live: Boolean(r?.paypal_live), webhook_set: Boolean(r?.paypal_webhook_id), webhook_url: `${base()}/api/webhooks/payments/paypal/${org}` },
      bank: { account_name: r?.bank_account_name || '', bsb: r?.bank_bsb || '', account_number: r?.bank_account_number || '', payid: r?.payid || '' },
      terms_days: s.terms_days, late_fee_enabled: Boolean(s.late_fee_enabled), late_fee_percent: s.late_fee_percent, late_fee_acknowledged: Boolean(s.late_fee_ack_at),
      customer_reminders: Boolean(s.customer_reminders), owner_reminders: Boolean(s.owner_reminders),
      channels: { email: Boolean(env.RESEND_API_KEY && !/^(YOUR_|REPLACE_|CHANGE)/i.test(env.RESEND_API_KEY)), sms: Boolean(env.TELNYX_API_KEY && (env.TELNYX_FROM_NUMBER || env.TELNYX_PHONE_NUMBER)) }
    };
  };
  app.get('/api/saas/payments/settings', money_roles, (req, res) => res.json({ ok: true, settings: maskedSettings(req.saas.organisation_id) }));
  const settingsSchema = z.object({
    stripe_secret_key: z.string().trim().regex(/^(sk|rk)_(test|live)_[A-Za-z0-9]{16,}$/, 'That does not look like a Stripe secret or restricted key.').optional().or(z.literal('')),
    stripe_webhook_secret: z.string().trim().regex(/^whsec_[A-Za-z0-9]{16,}$/, 'Stripe signing secrets start with whsec_.').optional().or(z.literal('')),
    paypal_client_id: z.string().trim().regex(/^[A-Za-z0-9_-]{20,}$/, 'That does not look like a PayPal client ID.').optional().or(z.literal('')),
    paypal_client_secret: z.string().trim().regex(/^[A-Za-z0-9_-]{20,}$/, 'That does not look like a PayPal secret.').optional().or(z.literal('')),
    paypal_webhook_id: z.string().trim().regex(/^[A-Z0-9]{10,}$/, 'PayPal webhook IDs are letters and numbers.').optional().or(z.literal('')),
    paypal_live: z.boolean().optional(), disconnect: z.enum(['stripe', 'paypal']).optional(),
    bank_account_name: z.string().trim().max(80).optional(), bank_bsb: z.string().trim().regex(/^(\d{3}-?\d{3})?$/, 'BSB is six digits.').optional(),
    bank_account_number: z.string().trim().regex(/^(\d{5,9})?$/, 'Account number is 5 to 9 digits.').optional(), payid: z.string().trim().max(80).optional(),
    terms_days: z.number().int().min(1).max(90).optional(), late_fee_enabled: z.boolean().optional(), late_fee_percent: z.number().min(0).max(25).optional(),
    late_fee_terms_acknowledged: z.boolean().optional(), customer_reminders: z.boolean().optional(), owner_reminders: z.boolean().optional()
  }).strict();
  app.put('/api/saas/payments/settings', money_roles, (req, res) => {
    const parsed = settingsSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ ok: false, error: parsed.error.issues[0]?.message || 'Check the payment settings.' });
    const d = parsed.data, org = req.saas.organisation_id, cur = settingsRow(org), now = iso(), changed = [];
    const feeOn = d.late_fee_enabled ?? Boolean(cur?.late_fee_enabled);
    if (feeOn && !(cur?.late_fee_ack_at || d.late_fee_terms_acknowledged)) return res.status(400).json({ ok: false, error: 'Tick the box to confirm your customers are told about the late fee in your quote or terms before turning it on.' });
    const next = { ...SETTING_DEFAULTS, ...(cur || {}) };
    const set = (k, v) => { if (v !== undefined) { next[k] = v; changed.push(k); } };
    if (d.stripe_secret_key) { set('stripe_secret_enc', sealed(d.stripe_secret_key)); set('stripe_hint', `${d.stripe_secret_key.includes('_live_') ? 'live' : 'test'} ••••${d.stripe_secret_key.slice(-4)}`); }
    if (d.stripe_webhook_secret) set('stripe_webhook_enc', sealed(d.stripe_webhook_secret));
    if (d.paypal_client_id) set('paypal_client_id', d.paypal_client_id);
    if (d.paypal_client_secret) set('paypal_secret_enc', sealed(d.paypal_client_secret));
    if (d.paypal_webhook_id) set('paypal_webhook_id', d.paypal_webhook_id);
    if (d.paypal_live !== undefined) set('paypal_live', d.paypal_live ? 1 : 0);
    if (d.disconnect === 'stripe') { next.stripe_secret_enc = null; next.stripe_webhook_enc = null; next.stripe_hint = null; changed.push('stripe_disconnected'); }
    if (d.disconnect === 'paypal') { next.paypal_client_id = null; next.paypal_secret_enc = null; next.paypal_webhook_id = null; changed.push('paypal_disconnected'); }
    for (const k of ['bank_account_name', 'bank_bsb', 'bank_account_number', 'payid']) set(k, d[k]);
    set('terms_days', d.terms_days); set('late_fee_percent', d.late_fee_percent);
    if (d.late_fee_enabled !== undefined) set('late_fee_enabled', d.late_fee_enabled ? 1 : 0);
    if (d.customer_reminders !== undefined) set('customer_reminders', d.customer_reminders ? 1 : 0);
    if (d.owner_reminders !== undefined) set('owner_reminders', d.owner_reminders ? 1 : 0);
    if (feeOn && d.late_fee_terms_acknowledged && !cur?.late_fee_ack_at) { next.late_fee_ack_at = now; next.late_fee_ack_by = req.saas.user_id; changed.push('late_fee_acknowledged'); }
    db.prepare(`INSERT INTO payment_settings (organisation_id,stripe_secret_enc,stripe_webhook_enc,stripe_hint,paypal_client_id,paypal_secret_enc,paypal_webhook_id,paypal_live,bank_account_name,bank_bsb,bank_account_number,payid,terms_days,late_fee_enabled,late_fee_percent,late_fee_ack_at,late_fee_ack_by,customer_reminders,owner_reminders,updated_by_user_id,updated_at)
      VALUES (@organisation_id,@stripe_secret_enc,@stripe_webhook_enc,@stripe_hint,@paypal_client_id,@paypal_secret_enc,@paypal_webhook_id,@paypal_live,@bank_account_name,@bank_bsb,@bank_account_number,@payid,@terms_days,@late_fee_enabled,@late_fee_percent,@late_fee_ack_at,@late_fee_ack_by,@customer_reminders,@owner_reminders,@updated_by_user_id,@updated_at)
      ON CONFLICT(organisation_id) DO UPDATE SET stripe_secret_enc=excluded.stripe_secret_enc,stripe_webhook_enc=excluded.stripe_webhook_enc,stripe_hint=excluded.stripe_hint,paypal_client_id=excluded.paypal_client_id,paypal_secret_enc=excluded.paypal_secret_enc,paypal_webhook_id=excluded.paypal_webhook_id,paypal_live=excluded.paypal_live,bank_account_name=excluded.bank_account_name,bank_bsb=excluded.bank_bsb,bank_account_number=excluded.bank_account_number,payid=excluded.payid,terms_days=excluded.terms_days,late_fee_enabled=excluded.late_fee_enabled,late_fee_percent=excluded.late_fee_percent,late_fee_ack_at=excluded.late_fee_ack_at,late_fee_ack_by=excluded.late_fee_ack_by,customer_reminders=excluded.customer_reminders,owner_reminders=excluded.owner_reminders,updated_by_user_id=excluded.updated_by_user_id,updated_at=excluded.updated_at`)
      .run({ stripe_secret_enc: null, stripe_webhook_enc: null, stripe_hint: null, paypal_client_id: null, paypal_secret_enc: null, paypal_webhook_id: null, paypal_live: 0, bank_account_name: null, bank_bsb: null, bank_account_number: null, payid: null, late_fee_ack_by: null, ...next, organisation_id: org, updated_by_user_id: req.saas.user_id, updated_at: now });
    saasAudit(req, 'payment.settings_updated', 'payment_settings', org, { changed }); // names only, never the secrets
    res.json({ ok: true, settings: maskedSettings(org) });
  });
  app.post('/api/saas/payments/settings/test', money_roles, async (req, res) => {
    const provider = req.body?.provider, org = req.saas.organisation_id, raw = settingsRow(org);
    try {
      if (provider === 'stripe' && raw?.stripe_secret_enc) { await stripeCall(raw, 'GET', 'balance'); return res.json({ ok: true, message: 'Stripe accepted your key.' }); }
      if (provider === 'paypal' && raw?.paypal_client_id) { await paypalToken(raw); return res.json({ ok: true, message: 'PayPal accepted your credentials.' }); }
      res.status(409).json({ ok: false, error: 'Save the keys for that provider first.' });
    } catch (err) { res.status(err.status || 502).json({ ok: false, error: err.message }); }
  });

  // ---------- routes: requests, manual records, lists ----------
  const requestSchema = z.object({ work_order_id: z.string().min(1).max(64), provider: z.enum(['stripe', 'paypal', 'bank']), amount: z.number().positive().max(1000000).optional(), send_to_customer: z.boolean().optional(), save_card: z.boolean().optional() }).strict();
  app.post('/api/saas/payments/requests', money_roles, limiter, async (req, res) => {
    const parsed = requestSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ ok: false, error: 'Choose a job and a way to be paid.' });
    try { res.status(201).json({ ok: true, ...(await createRequest(req.saas.organisation_id, req.saas, parsed.data)) }); }
    catch (err) { res.status(err.status || 500).json({ ok: false, error: err.status ? err.message : 'The payment request could not be created.' }); }
  });
  const recordSchema = z.object({ work_order_id: z.string().min(1).max(64), amount: z.number().positive().max(1000000), method: z.enum(['cash', 'eftpos', 'bank_transfer', 'card_terminal', 'other']), note: z.string().trim().max(200).optional(), payment_id: z.string().max(64).optional() }).strict();
  app.post('/api/saas/payments/record', money_roles, async (req, res) => {
    const parsed = recordSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ ok: false, error: 'Enter the job, amount and how it was paid.' });
    const org = req.saas.organisation_id, d = parsed.data, job = db.prepare(`SELECT * FROM work_orders WHERE id=? AND organisation_id=?`).get(d.work_order_id, org);
    if (!job) return res.status(404).json({ ok: false, error: 'Job not found.' });
    const amount = cents(d.amount), owing = owingOf(job);
    if (owing <= 0) return res.status(409).json({ ok: false, error: 'This job is already paid in full.' });
    if (amount > owing) return res.status(400).json({ ok: false, error: `That is more than the ${money(owing)} still owing.` });
    let id = d.payment_id;
    if (id) {
      const p = db.prepare(`SELECT * FROM job_payments WHERE id=? AND organisation_id=? AND work_order_id=?`).get(id, org, job.id);
      if (!p || p.provider !== 'bank' || p.status !== 'pending') return res.status(404).json({ ok: false, error: 'That bank transfer is not waiting for payment.' });
      if (p.amount_cents !== amount) return res.status(400).json({ ok: false, error: `That transfer was requested for ${money(p.amount_cents)}.` });
      db.prepare(`UPDATE job_payments SET note=?,updated_at=? WHERE id=?`).run(d.note || null, iso(), id);
    } else {
      id = crypto.randomUUID(); const at = iso();
      db.prepare(`INSERT INTO job_payments (id,organisation_id,work_order_id,customer_id,provider,method,status,amount_cents,currency,note,created_by_user_id,created_at,updated_at) VALUES (?,?,?,?,'manual',?,'pending',?,'aud',?,?,?,?)`).run(id, org, job.id, job.customer_id || null, d.method, amount, d.note || null, req.saas.user_id, at, at);
    }
    ensureInvoice(job, settingsFor(org));
    const r = await markPaid(id);
    saasAudit(req, 'payment.recorded_manually', 'job_payment', id, { work_order_id: job.id, amount_cents: amount, method: d.method });
    res.status(201).json({ ok: true, payment: publicPayment(r.payment) });
  });
  app.post('/api/saas/payments/:id/cancel', money_roles, (req, res) => {
    const r = db.prepare(`UPDATE job_payments SET status='cancelled',updated_at=? WHERE id=? AND organisation_id=? AND status='pending'`).run(iso(), req.params.id, req.saas.organisation_id);
    if (!r.changes) return res.status(404).json({ ok: false, error: 'Only a payment that is still waiting can be cancelled.' });
    saasAudit(req, 'payment.cancelled', 'job_payment', req.params.id, {}); res.json({ ok: true });
  });
  // Data for a printed or on-screen receipt. Only this business's own paid payments.
  app.get('/api/saas/payments/:id/receipt-data', pad_roles, (req, res) => {
    const p = db.prepare(`SELECT p.*,w.title job_title,c.name customer_name FROM job_payments p JOIN work_orders w ON w.id=p.work_order_id LEFT JOIN tenant_customers c ON c.id=p.customer_id AND c.organisation_id=p.organisation_id WHERE p.id=? AND p.organisation_id=? AND p.status='paid'`).get(req.params.id, req.saas.organisation_id);
    if (!p || !mayUsePayment(req.saas.organisation_id, req.saas, p)) return res.status(404).json({ ok: false, error: 'Only a paid payment has a receipt.' });
    const biz = business(p.organisation_id);
    res.json({ ok: true, receipt: { business: biz.name, abn: biz.abn || null, receipt_no: p.receipt_no, job: p.job_title, customer: p.customer_name || '', amount_cents: p.amount_cents, method: METHOD_LABEL[p.method || p.provider] || 'Payment', paid_at: p.paid_at, reference: p.reference || null } });
  });
  // A scannable code for a payment link, so a customer can pay by pointing their phone camera at the screen.
  app.get('/api/saas/payments/qr', pad_roles, limiter, async (req, res) => {
    const text = String(req.query.text || '');
    if (!/^https:\/\/[^\s]{4,600}$/i.test(text)) return res.status(400).json({ ok: false, error: 'A secure payment link is needed.' });
    res.json({ ok: true, svg: await QRCode.toString(text, { type: 'svg', margin: 1, width: 240 }) });
  });
  app.post('/api/saas/payments/:id/receipt', money_roles, limiter, async (req, res) => {
    const p = db.prepare(`SELECT * FROM job_payments WHERE id=? AND organisation_id=? AND status='paid'`).get(req.params.id, req.saas.organisation_id);
    if (!p) return res.status(404).json({ ok: false, error: 'Only a paid payment has a receipt.' });
    const job = db.prepare(`SELECT * FROM work_orders WHERE id=?`).get(p.work_order_id);
    const sent = await sendReceipt(job, p, true);
    saasAudit(req, 'payment.receipt_sent', 'job_payment', p.id, { channels: sent.map((x) => `${x.channel}:${x.status}`) });
    res.json({ ok: true, sent });
  });
  app.get('/api/saas/payments', money_roles, (req, res) => {
    const org = req.saas.organisation_id, jobId = req.query.work_order_id ? String(req.query.work_order_id) : null;
    const rows = db.prepare(`SELECT p.*,w.title job_title,c.name customer_name FROM job_payments p JOIN work_orders w ON w.id=p.work_order_id LEFT JOIN tenant_customers c ON c.id=p.customer_id AND c.organisation_id=p.organisation_id WHERE p.organisation_id=?${jobId ? ' AND p.work_order_id=?' : ''} ORDER BY p.created_at DESC LIMIT 200`).all(...(jobId ? [org, jobId] : [org]));
    res.json({ ok: true, payments: rows.map((p) => ({ ...publicPayment(p), job_title: p.job_title, customer_name: p.customer_name || '' })) });
  });
  app.get('/api/saas/payments/overview', money_roles, (req, res) => {
    const org = req.saas.organisation_id, now = iso(), s = settingsFor(org);
    const unpaid = db.prepare(`SELECT w.id,w.title,w.price_cents,w.paid_cents,w.late_fee_cents,w.late_fee_applied_at,w.invoice_issued_at,w.due_at,c.name customer_name,c.email customer_email,c.phone customer_phone,
      (SELECT COUNT(*) FROM job_payments p WHERE p.work_order_id=w.id AND p.status='pending') pending_requests FROM work_orders w LEFT JOIN tenant_customers c ON c.id=w.customer_id AND c.organisation_id=w.organisation_id
      WHERE w.organisation_id=? AND w.price_cents>0 AND w.price_cents+w.late_fee_cents-w.paid_cents>0 ORDER BY COALESCE(w.due_at,'9999') LIMIT 200`).all(org)
      .map((j) => ({ ...j, owing_cents: owingOf(j), overdue: Boolean(j.due_at && j.due_at < now), days_overdue: j.due_at && j.due_at < now ? Math.floor((Date.now() - new Date(j.due_at)) / DAY) : 0 }));
    const sum = (a) => a.reduce((t, j) => t + j.owing_cents, 0), overdue = unpaid.filter((j) => j.overdue);
    const paid30 = db.prepare(`SELECT COALESCE(SUM(amount_cents),0) c FROM job_payments WHERE organisation_id=? AND status='paid' AND paid_at>?`).get(org, iso(new Date(Date.now() - 30 * DAY))).c;
    const notices = db.prepare(`SELECT id,work_order_id,kind,channel,recipient,subject,body,status,detail,created_at,read_at FROM payment_notices WHERE organisation_id=? ORDER BY created_at DESC LIMIT 40`).all(org);
    res.json({ ok: true, unpaid, totals: { unpaid_cents: sum(unpaid), unpaid_count: unpaid.length, overdue_cents: sum(overdue), overdue_count: overdue.length, paid_30d_cents: paid30, late_fees_cents: unpaid.reduce((t, j) => t + (j.late_fee_cents || 0), 0) }, notices, unread_notices: notices.filter((n) => n.channel === 'in_app' && !n.read_at).length, terms: { days: s.terms_days, late_fee_enabled: Boolean(s.late_fee_enabled && s.late_fee_ack_at), late_fee_percent: s.late_fee_percent } });
  });
  app.post('/api/saas/payments/notices/read', money_roles, (req, res) => { db.prepare(`UPDATE payment_notices SET read_at=? WHERE organisation_id=? AND channel='in_app' AND read_at IS NULL`).run(iso(), req.saas.organisation_id); res.json({ ok: true }); });
  app.post('/api/saas/payments/run-cycle', money_roles, limiter, async (req, res) => {
    const summary = await runCycle(req.saas.organisation_id); saasAudit(req, 'payment.reminders_run', 'payment_settings', req.saas.organisation_id, summary); res.json({ ok: true, summary });
  });


  // ---------- the payment pad: every signed-in team member can ask a customer to pay; only jobs they are on, unless they run the business ----------
  const SENIOR_PAD = new Set(['owner', 'admin', 'super_admin', 'manager', 'director']);
  const padJobs = (org, user) => {
    const own = SENIOR_PAD.has(user.role) ? '' : ` AND EXISTS (SELECT 1 FROM job_offers o JOIN workers wk ON wk.id=o.worker_id AND wk.organisation_id=w.organisation_id WHERE o.work_order_id=w.id AND o.organisation_id=w.organisation_id AND o.status='accepted' AND wk.user_id=?)`;
    return db.prepare(`SELECT w.id,w.title,w.price_cents,w.paid_cents,w.late_fee_cents,w.customer_id,c.name customer_name,c.email customer_email,c.phone customer_phone FROM work_orders w LEFT JOIN tenant_customers c ON c.id=w.customer_id AND c.organisation_id=w.organisation_id WHERE w.organisation_id=? AND w.price_cents>0 AND w.price_cents+w.late_fee_cents-w.paid_cents>0${own} ORDER BY w.updated_at DESC LIMIT 60`).all(...(SENIOR_PAD.has(user.role) ? [org] : [org, user.user_id]))
      .map((j) => ({ id: j.id, title: j.title, customer_id: j.customer_id, customer_name: j.customer_name || '', owing_cents: owingOf(j), can_message: Boolean(j.customer_email || j.customer_phone) }));
  };
  const publicCard = (c) => ({ id: c.id, customer_id: c.customer_id, brand: c.brand, last4: c.last4, exp_month: c.exp_month, exp_year: c.exp_year, funding: c.funding, cvc_check: c.cvc_check, postal_check: c.postal_check, three_d_secure: c.three_d_secure, authorised_at: c.authorised_at, created_at: c.created_at,
    verified: Boolean(c.authorised_at && c.cvc_check !== 'fail' && c.postal_check !== 'fail'), expired: Boolean(c.exp_year && (c.exp_year < new Date().getFullYear() || (c.exp_year === new Date().getFullYear() && c.exp_month < new Date().getMonth() + 1))) });
  app.get('/api/saas/payments/pad', pad_roles, (req, res) => {
    const org = req.saas.organisation_id, jobs = padJobs(org, req.saas), r = settingsRow(org), s = settingsFor(org);
    const ok = (p) => !isAuthorised || isAuthorised(org, p);
    const ways = [];
    if (r?.stripe_secret_enc && ok('stripe')) ways.push({ id: 'stripe', label: 'Card, Apple Pay or Google Pay' });
    if (r?.paypal_client_id && r?.paypal_secret_enc && ok('paypal')) ways.push({ id: 'paypal', label: 'PayPal' });
    if (bankDetails(s) && ok('bank')) ways.push({ id: 'bank', label: 'Bank transfer' });
    const cards = db.prepare(`SELECT * FROM saved_cards WHERE organisation_id=? AND removed_at IS NULL`).all(org).map(publicCard);
    const senior = SENIOR_PAD.has(req.saas.role);
    res.json({ ok: true, ways, jobs: jobs.map((j) => ({ ...j, saved_cards: cards.filter((c) => c.customer_id === j.customer_id) })), can_charge_saved: ['owner', 'admin', 'super_admin'].includes(req.saas.role), senior, scope: senior ? 'all_jobs' : 'my_jobs',
      note: ways.length ? '' : 'Your business has not switched on a payment method yet. Ask the owner to connect Stripe, PayPal or bank details and confirm authorisation in Plans & Billing.' });
  });
  app.post('/api/saas/payments/pad/request', pad_roles, limiter, async (req, res) => {
    const parsed = requestSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ ok: false, error: 'Choose a job and a way to be paid.' });
    const org = req.saas.organisation_id;
    if (!padJobs(org, req.saas).some((j) => j.id === parsed.data.work_order_id)) return res.status(403).json({ ok: false, error: 'You can only take payment for jobs you are on.' });
    try { const r = await createRequest(org, req.saas, parsed.data); saasAudit(req, 'payment.pad_request', 'job_payment', r.payment.id, { provider: r.payment.provider, amount_cents: r.payment.amount_cents }); res.status(201).json({ ok: true, ...r }); }
    catch (err) { res.status(err.status || 500).json({ ok: false, error: err.status ? err.message : 'The payment request could not be created.' }); }
  });
  // Is it paid yet, and did the receipt reach the customer? Only for payments on jobs this person may see.
  const isMyJob = (org, user, jobId) => Boolean(db.prepare(`SELECT 1 FROM job_offers o JOIN workers wk ON wk.id=o.worker_id AND wk.organisation_id=o.organisation_id WHERE o.work_order_id=? AND o.organisation_id=? AND o.status='accepted' AND wk.user_id=?`).get(jobId, org, user.user_id));
  const mayUsePayment = (org, user, p) => Boolean(p) && (SENIOR_PAD.has(user.role) || p.created_by_user_id === user.user_id || isMyJob(org, user, p.work_order_id));
  // Is it paid yet, and did the receipt reach the customer? Only for payments this person started or jobs they are on.
  app.get('/api/saas/payments/pad/status/:id', pad_roles, (req, res) => {
    const org = req.saas.organisation_id, p = db.prepare(`SELECT * FROM job_payments WHERE id=? AND organisation_id=?`).get(req.params.id, org);
    if (!mayUsePayment(org, req.saas, p)) return res.status(404).json({ ok: false, error: 'Payment not found.' });
    const receipts = db.prepare(`SELECT channel,status,detail,created_at FROM payment_notices WHERE organisation_id=? AND payment_id=? AND kind='receipt' AND channel IN ('email','sms') ORDER BY created_at DESC LIMIT 6`).all(org, p.id);
    res.json({ ok: true, payment: { id: p.id, status: p.status, amount_cents: p.amount_cents, receipt_no: p.receipt_no, paid_at: p.paid_at, failure_reason: p.failure_reason }, receipts });
  });
  app.post('/api/saas/payments/pad/:id/receipt', pad_roles, limiter, async (req, res) => {
    const org = req.saas.organisation_id, p = db.prepare(`SELECT * FROM job_payments WHERE id=? AND organisation_id=? AND status='paid'`).get(req.params.id, org);
    if (!mayUsePayment(org, req.saas, p)) return res.status(404).json({ ok: false, error: 'Only a paid payment has a receipt.' });
    const sent = await sendReceipt(db.prepare(`SELECT * FROM work_orders WHERE id=?`).get(p.work_order_id), p, true);
    saasAudit(req, 'payment.receipt_sent', 'job_payment', p.id, { channels: sent.map((x) => `${x.channel}:${x.status}`), via: 'pad' });
    res.json({ ok: true, sent });
  });

  // ---------- saved cards (owner and admin manage them; they only ever belong to this business and this customer) ----------
  const card_roles = [requireSaasUser, requireSaasRole('owner', 'admin', 'super_admin')];
  app.get('/api/saas/payments/saved-cards', card_roles, (req, res) => {
    const org = req.saas.organisation_id, cust = req.query.customer_id ? String(req.query.customer_id) : null;
    res.json({ ok: true, cards: db.prepare(`SELECT s.*,c.name customer_name FROM saved_cards s LEFT JOIN tenant_customers c ON c.id=s.customer_id AND c.organisation_id=s.organisation_id WHERE s.organisation_id=? AND s.removed_at IS NULL${cust ? ' AND s.customer_id=?' : ''} ORDER BY s.created_at DESC LIMIT 200`).all(...(cust ? [org, cust] : [org])).map((c) => ({ ...publicCard(c), customer_name: c.customer_name || '' })) });
  });
  app.delete('/api/saas/payments/saved-cards/:id', card_roles, async (req, res) => {
    const org = req.saas.organisation_id, c = db.prepare(`SELECT * FROM saved_cards WHERE id=? AND organisation_id=? AND removed_at IS NULL`).get(req.params.id, org);
    if (!c) return res.status(404).json({ ok: false, error: 'Saved card not found.' });
    try { const raw = settingsRow(org); if (raw?.stripe_secret_enc) await stripeCall(raw, 'POST', `payment_methods/${encodeURIComponent(c.stripe_payment_method_id)}/detach`, {}, `sp-detach-${c.id}`); } catch (e) { if (!/No such PaymentMethod|not attached/i.test(e.message)) return res.status(502).json({ ok: false, error: 'Stripe could not remove the card just now. Try again shortly.' }); }
    db.prepare(`UPDATE saved_cards SET removed_at=? WHERE id=?`).run(iso(), c.id); saasAudit(req, 'card.removed', 'saved_card', c.id, { customer_id: c.customer_id }); res.json({ ok: true });
  });
  app.post('/api/saas/payments/saved-cards/:id/charge', card_roles, limiter, async (req, res) => {
    const parsed = z.object({ work_order_id: z.string().min(1).max(64), amount: z.number().positive().max(1000000).optional() }).strict().safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ ok: false, error: 'Choose a job.' });
    const org = req.saas.organisation_id, c = db.prepare(`SELECT * FROM saved_cards WHERE id=? AND organisation_id=? AND removed_at IS NULL`).get(req.params.id, org), raw = settingsRow(org);
    const job = db.prepare(`SELECT * FROM work_orders WHERE id=? AND organisation_id=?`).get(parsed.data.work_order_id, org);
    if (!c || !job || !raw?.stripe_secret_enc) return res.status(404).json({ ok: false, error: 'Saved card or job not found.' });
    if (job.customer_id !== c.customer_id) return res.status(403).json({ ok: false, error: 'That card belongs to a different customer.' });
    if (isAuthorised && !isAuthorised(org, 'stripe')) return res.status(409).json({ ok: false, error: 'Confirm your authorisation for card payments first (Plans & Billing, Payment connections).' });
    const owing = owingOf(job), amount = parsed.data.amount === undefined ? owing : cents(parsed.data.amount);
    if (owing <= 0) return res.status(409).json({ ok: false, error: 'This job is already paid in full.' });
    if (!(amount >= 100 && amount <= owing)) return res.status(400).json({ ok: false, error: `Choose an amount between $1.00 and ${money(owing)}.` });
    if (c.exp_year && (c.exp_year < new Date().getFullYear() || (c.exp_year === new Date().getFullYear() && c.exp_month < new Date().getMonth() + 1))) return res.status(409).json({ ok: false, error: 'This card has expired. Ask the customer to pay with a new link.' });
    const id = crypto.randomUUID(), at = iso(), j = ensureInvoice(job, settingsFor(org));
    db.prepare(`INSERT INTO job_payments (id,organisation_id,work_order_id,customer_id,provider,method,status,amount_cents,currency,note,created_by_user_id,created_at,updated_at) VALUES (?,?,?,?,'stripe','card','pending',?,'aud',?,?,?,?)`).run(id, org, j.id, j.customer_id || null, amount, `Saved card •••• ${c.last4}`, req.saas.user_id, at, at);
    try {
      const pi = await stripeCall(raw, 'POST', 'payment_intents', { amount, currency: 'aud', customer: c.stripe_customer_id, payment_method: c.stripe_payment_method_id, off_session: true, confirm: true, description: `${business(org).name} - ${j.title}`.slice(0, 120), metadata: { payment_id: id, organisation_id: org, work_order_id: j.id } }, `sp-saved-${id}`);
      if (pi.status !== 'succeeded' || pi.amount_received !== amount || String(pi.currency).toLowerCase() !== 'aud') throw Object.assign(new Error('The bank needs the customer to approve this payment. Send them a payment link instead.'), { status: 402 });
      db.prepare(`UPDATE job_payments SET provider_ref=?,reference=? WHERE id=?`).run(pi.id, pi.id, id);
      const r = await markPaid(id, { providerRef: pi.id, reference: pi.id });
      saasAudit(req, 'payment.saved_card_charged', 'job_payment', id, { work_order_id: j.id, amount_cents: amount, card_id: c.id });
      return res.status(201).json({ ok: true, payment: publicPayment(r.payment) });
    } catch (err) {
      db.prepare(`UPDATE job_payments SET status='failed',failure_reason=?,updated_at=? WHERE id=? AND status='pending'`).run(String(err.message).slice(0, 200), iso(), id);
      return res.status(err.status === 402 ? 402 : 502).json({ ok: false, error: /declin|insufficient|expired|authenticat/i.test(err.message) ? `The card was not accepted: ${err.message}` : err.message });
    }
  });

  // ---------- webhooks (signed; the only way a card payment becomes paid) ----------
  const bad = (res) => res.status(400).json({ ok: false });
  const findPayment = (org, provider, ref) => db.prepare(`SELECT * FROM job_payments WHERE organisation_id=? AND provider=? AND provider_ref=?`).get(org, provider, ref);
  const flag = async (org, p, text) => { audit(org, 'payment.needs_review', p?.id || null, { reason: text }); const job = p ? db.prepare(`SELECT * FROM work_orders WHERE id=?`).get(p.work_order_id) : null; await toOwner(org, job, p, 'payment_review', 'Payment needs your attention', text, p ? `review:${p.id}:${text.slice(0, 20)}` : null); };
  app.post('/api/webhooks/payments/stripe/:orgId', limiter, async (req, res) => {
    const org = String(req.params.orgId), raw = settingsRow(org);
    if (!raw?.stripe_webhook_enc || !verifyStripeSignature(req.rawBody, req.get('stripe-signature'), unsealed(raw.stripe_webhook_enc))) return bad(res);
    const ev = req.body || {}, obj = ev.data?.object || {};
    if (!ev.id || db.prepare(`INSERT OR IGNORE INTO payment_events (provider,event_id,organisation_id,event_type,received_at) VALUES ('stripe',?,?,?,?)`).run(String(ev.id), org, String(ev.type || ''), iso()).changes === 0) return res.json({ ok: true, duplicate: true });
    let outcome = 'ignored';
    try {
      if (['checkout.session.completed', 'checkout.session.async_payment_succeeded'].includes(ev.type)) {
        const p = findPayment(org, 'stripe', obj.id);
        if (!p) outcome = 'unmatched';
        else if (obj.payment_status !== 'paid') outcome = 'awaiting_funds';
        else if (obj.amount_total !== p.amount_cents || String(obj.currency).toLowerCase() !== p.currency) { outcome = 'amount_mismatch'; await flag(org, p, `Stripe reported ${money(obj.amount_total || 0)} but ${money(p.amount_cents)} was requested. Check Stripe before treating this job as paid.`); }
        else { await markPaid(p.id, { providerRef: obj.id, reference: typeof obj.payment_intent === 'string' ? obj.payment_intent : null }); outcome = 'paid'; try { if (await captureSavedCard(org, p, obj)) outcome = 'paid_card_saved'; } catch (e) { console.warn('[payments] saving the card reference failed:', e.message); } }
      } else if (ev.type === 'checkout.session.async_payment_failed') {
        const p = findPayment(org, 'stripe', obj.id);
        if (p && p.status === 'pending') { db.prepare(`UPDATE job_payments SET status='failed',failure_reason='Payment was declined or failed',updated_at=? WHERE id=?`).run(iso(), p.id); await flag(org, p, `A payment of ${money(p.amount_cents)} failed. The customer can try again with a new link.`); outcome = 'failed'; }
      } else if (ev.type === 'checkout.session.expired') {
        const p = findPayment(org, 'stripe', obj.id); if (p && p.status === 'pending') { db.prepare(`UPDATE job_payments SET status='expired',updated_at=? WHERE id=?`).run(iso(), p.id); outcome = 'expired'; }
      } else if (ev.type === 'charge.refunded' && obj.payment_intent) {
        const p = db.prepare(`SELECT * FROM job_payments WHERE organisation_id=? AND provider='stripe' AND reference=?`).get(org, obj.payment_intent);
        if (p && p.status === 'paid') {
          const refunded = Math.min(p.amount_cents, Number(obj.amount_refunded) || 0), full = refunded >= p.amount_cents, at = iso();
          db.transaction(() => { db.prepare(`UPDATE job_payments SET status=?,note=?,updated_at=? WHERE id=?`).run(full ? 'refunded' : 'paid', full ? 'Refunded in Stripe' : `${money(refunded)} refunded in Stripe`, at, p.id); db.prepare(`UPDATE work_orders SET paid_cents=MAX(0,paid_cents-?),updated_at=? WHERE id=?`).run(refunded, at, p.work_order_id); })();
          syncJobFinance(org, p.work_order_id, null); audit(org, 'payment.refunded', p.id, { refunded_cents: refunded, full }); await flag(org, p, `${money(refunded)} was refunded in Stripe. The job balance has been updated.`); outcome = 'refunded';
        }
      }
    } catch (err) { db.prepare(`DELETE FROM payment_events WHERE provider='stripe' AND event_id=?`).run(String(ev.id)); console.error('[payments] stripe webhook failed:', err.message); return res.status(500).json({ ok: false }); }
    db.prepare(`UPDATE payment_events SET outcome=? WHERE provider='stripe' AND event_id=?`).run(outcome, String(ev.id));
    res.json({ ok: true, outcome });
  });
  async function capturePaypal(org, p) {
    const raw = settingsRow(org);
    const cap = await paypalCall(raw, 'POST', `/v2/checkout/orders/${encodeURIComponent(p.provider_ref)}/capture`, undefined, `sp-capture-${p.id}`);
    const unit = cap.purchase_units?.[0]?.payments?.captures?.[0];
    if (cap.status !== 'COMPLETED' || !unit || unit.status !== 'COMPLETED') return 'awaiting_funds';
    if (cents(unit.amount?.value) !== p.amount_cents || unit.amount?.currency_code !== 'AUD') { await flag(org, p, `PayPal reported ${unit.amount?.value} ${unit.amount?.currency_code} but ${money(p.amount_cents)} was requested. Check PayPal before treating this job as paid.`); return 'amount_mismatch'; }
    await markPaid(p.id, { providerRef: p.provider_ref, reference: unit.id }); return 'paid';
  }
  app.post('/api/webhooks/payments/paypal/:orgId', limiter, async (req, res) => {
    const org = String(req.params.orgId), raw = settingsRow(org), ev = req.body || {};
    if (!raw?.paypal_webhook_id || !raw.paypal_secret_enc || !ev.id) return bad(res);
    try {
      const v = await paypalCall(raw, 'POST', '/v1/notifications/verify-webhook-signature', { auth_algo: req.get('paypal-auth-algo'), cert_url: req.get('paypal-cert-url'), transmission_id: req.get('paypal-transmission-id'), transmission_sig: req.get('paypal-transmission-sig'), transmission_time: req.get('paypal-transmission-time'), webhook_id: raw.paypal_webhook_id, webhook_event: ev });
      if (v.verification_status !== 'SUCCESS') return bad(res);
    } catch { return bad(res); }
    if (db.prepare(`INSERT OR IGNORE INTO payment_events (provider,event_id,organisation_id,event_type,received_at) VALUES ('paypal',?,?,?,?)`).run(String(ev.id), org, String(ev.event_type || ''), iso()).changes === 0) return res.json({ ok: true, duplicate: true });
    let outcome = 'ignored';
    try {
      const r = ev.resource || {};
      if (ev.event_type === 'CHECKOUT.ORDER.APPROVED') { const p = findPayment(org, 'paypal', r.id); if (p && p.status !== 'paid') outcome = await capturePaypal(org, p); else outcome = p ? 'already_paid' : 'unmatched'; }
      else if (ev.event_type === 'PAYMENT.CAPTURE.COMPLETED') {
        const p = r.custom_id ? db.prepare(`SELECT * FROM job_payments WHERE id=? AND organisation_id=? AND provider='paypal'`).get(String(r.custom_id), org) : null;
        if (!p) outcome = 'unmatched';
        else if (cents(r.amount?.value) !== p.amount_cents || r.amount?.currency_code !== 'AUD') { outcome = 'amount_mismatch'; await flag(org, p, `PayPal reported ${r.amount?.value} but ${money(p.amount_cents)} was requested. Check PayPal before treating this job as paid.`); }
        else { await markPaid(p.id, { providerRef: p.provider_ref, reference: r.id }); outcome = 'paid'; }
      } else if (['PAYMENT.CAPTURE.DENIED', 'PAYMENT.CAPTURE.DECLINED'].includes(ev.event_type) && r.custom_id) {
        const p = db.prepare(`SELECT * FROM job_payments WHERE id=? AND organisation_id=? AND status='pending'`).get(String(r.custom_id), org);
        if (p) { db.prepare(`UPDATE job_payments SET status='failed',failure_reason='PayPal declined the payment',updated_at=? WHERE id=?`).run(iso(), p.id); await flag(org, p, `A PayPal payment of ${money(p.amount_cents)} was declined.`); outcome = 'failed'; }
      }
    } catch (err) { db.prepare(`DELETE FROM payment_events WHERE provider='paypal' AND event_id=?`).run(String(ev.id)); console.error('[payments] paypal webhook failed:', err.message); return res.status(500).json({ ok: false }); }
    db.prepare(`UPDATE payment_events SET outcome=? WHERE provider='paypal' AND event_id=?`).run(outcome, String(ev.id));
    res.json({ ok: true, outcome });
  });
  // Customer comes back from PayPal: capture server-side. Only an order we created, for the exact payment id, can be captured.
  app.get('/api/payments/paypal/return', limiter, async (req, res) => {
    const id = String(req.query.payment || ''), token = String(req.query.token || '');
    const p = id && token ? db.prepare(`SELECT * FROM job_payments WHERE id=? AND provider='paypal' AND provider_ref=?`).get(id, token) : null;
    let status = 'pending';
    try { if (p && p.status === 'paid') status = 'success'; else if (p) status = (await capturePaypal(p.organisation_id, p)) === 'paid' ? 'success' : 'pending'; } catch { status = 'pending'; }
    res.redirect(302, `/saas/payment-thanks.html?status=${status}`);
  });

  return { runCycle, markPaid };
}
