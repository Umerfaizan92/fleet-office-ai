// How subscribers pay Super Pro. The invoice email carries a private "Pay this invoice" link. That page offers every payment
// method the operator has switched on, in the operator's priority order. If one provider is down or refuses to start a
// payment, the next one is tried automatically, and bank transfer is always shown as the last resort.
// Provider keys are typed once by the operator in the operator app and stored encrypted. They are never shown again.
// An invoice is only marked paid by a signed provider message, a server-side capture, or the operator.
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { verifyStripeSignature } from './payments.js';

const iso = () => new Date().toISOString();
const money = (c) => '$' + (c / 100).toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const safeEqual = (a, b) => { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && crypto.timingSafeEqual(x, y); };
export const PROVIDERS = {
  stripe: { label: 'Card, Apple Pay, Google Pay, direct debit (Stripe)', kind: 'online', fields: ['secret_key', 'webhook_secret'], secret: ['secret_key', 'webhook_secret'] },
  paypal: { label: 'PayPal', kind: 'online', fields: ['client_id', 'client_secret', 'live'], secret: ['client_secret'] },
  square: { label: 'Card (Square)', kind: 'online', fields: ['access_token', 'location_id', 'signature_key', 'live'], secret: ['access_token', 'signature_key'] },
  zeller: { label: 'Card (Zeller payment link)', kind: 'link', fields: ['payment_link_url'], secret: [] },
  bank: { label: 'Bank transfer or PayID', kind: 'manual', fields: ['account_name', 'bsb', 'account_number', 'payid'], secret: [] }
};
const DEFAULT_ORDER = ['stripe', 'zeller', 'paypal', 'square', 'bank'];

export function createPlatformPay({ db, env, runtime, settle, policy = null, fetchImpl = globalThis.fetch }) {
  try { db.exec(`ALTER TABLE platform_invoices ADD COLUMN pay_token TEXT`); } catch { /* already there */ }
  db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS uq_platform_invoice_pay_token ON platform_invoices(pay_token) WHERE pay_token IS NOT NULL;
    CREATE TABLE IF NOT EXISTS platform_pay_providers (provider TEXT PRIMARY KEY, enabled INTEGER NOT NULL DEFAULT 0, config_enc TEXT, hint TEXT, position INTEGER NOT NULL DEFAULT 99, updated_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS platform_pay_attempts (id TEXT PRIMARY KEY, invoice_id TEXT NOT NULL, provider TEXT NOT NULL, external_id TEXT, status TEXT NOT NULL, error TEXT, created_at TEXT NOT NULL, FOREIGN KEY(invoice_id) REFERENCES platform_invoices(id) ON DELETE CASCADE);
    CREATE INDEX IF NOT EXISTS idx_pay_attempt_ext ON platform_pay_attempts(provider, external_id);`);
  const base = () => String(env.PUBLIC_BASE_URL || '').replace(/\/$/, '');
  const seal = (o) => JSON.stringify(runtime.encryptBundle({ v: o }));
  const unseal = (blob) => { try { return blob ? runtime.decryptBundle(blob).v || {} : {}; } catch { return {}; } };
  const row = (p) => db.prepare(`SELECT * FROM platform_pay_providers WHERE provider=?`).get(p);
  const config = (p) => unseal(row(p)?.config_enc);
  const complete = (p) => { const c = config(p); const need = { stripe: ['secret_key', 'webhook_secret'], paypal: ['client_id', 'client_secret'], square: ['access_token', 'location_id', 'signature_key'], zeller: ['payment_link_url'], bank: ['account_name', 'bsb', 'account_number'] }[p]; return need.every((k) => String(c[k] || '').trim()); };
  const order = () => { const rows = db.prepare(`SELECT provider FROM platform_pay_providers ORDER BY position, provider`).all().map((r) => r.provider); return [...rows, ...DEFAULT_ORDER.filter((p) => !rows.includes(p))]; };
  const usable = (p) => { const r = row(p); return Boolean(r?.enabled) && complete(p); };

  async function call(url, init, label) {
    let r; try { r = await fetchImpl(url, { ...init, signal: AbortSignal.timeout(15000) }); } catch { throw new Error(`${label} could not be reached.`); }
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(`${label}: ${String(d?.error?.message || d?.message || d?.error_description || d?.errors?.[0]?.detail || `HTTP ${r.status}`).slice(0, 200)}`);
    return d;
  }
  const form = (obj) => { const p = new URLSearchParams(); const walk = (o, pre) => { for (const [k, v] of Object.entries(o)) { const key = pre ? `${pre}[${k}]` : k; if (v && typeof v === 'object') walk(v, key); else if (v !== undefined && v !== null && v !== '') p.append(key, String(v)); } }; walk(obj, ''); return p.toString(); };
  const paypalBase = (c) => (c.live ? 'https://api-m.paypal.com' : 'https://api-m.sandbox.paypal.com');
  const paypalToken = async (c) => (await call(`${paypalBase(c)}/v1/oauth2/token`, { method: 'POST', headers: { authorization: 'Basic ' + Buffer.from(`${c.client_id}:${c.client_secret}`).toString('base64'), 'content-type': 'application/x-www-form-urlencoded' }, body: 'grant_type=client_credentials' }, 'PayPal')).access_token;
  const squareBase = (c) => (c.live ? 'https://connect.squareup.com' : 'https://connect.squareupsandbox.com');

  const invoiceFor = (token) => token && /^[A-Za-z0-9_-]{30,80}$/.test(token) ? db.prepare(`SELECT i.*,COALESCE(o.display_name,o.name) business FROM platform_invoices i JOIN organisations o ON o.id=i.organisation_id WHERE i.pay_token=?`).get(token) : null;
  function payUrl(inv) {
    let t = db.prepare(`SELECT pay_token FROM platform_invoices WHERE id=?`).get(inv.id)?.pay_token;
    if (!t) { t = crypto.randomBytes(32).toString('base64url'); db.prepare(`UPDATE platform_invoices SET pay_token=? WHERE id=? AND pay_token IS NULL`).run(t, inv.id); t = db.prepare(`SELECT pay_token FROM platform_invoices WHERE id=?`).get(inv.id).pay_token; }
    return `${base()}/pay/${t}`;
  }
  const attempt = (invoice, provider, status, external = null, error = null) => { const id = crypto.randomUUID(); db.prepare(`INSERT INTO platform_pay_attempts (id,invoice_id,provider,external_id,status,error,created_at) VALUES (?,?,?,?,?,?,?)`).run(id, invoice, provider, external, status, error, iso()); return id; };

  // Each creator returns { url, external_id }. They only ask the provider to collect the exact invoice total in AUD.
  const creators = {
    async stripe(inv, token) {
      const c = config('stripe');
      const make = (methods) => call('https://api.stripe.com/v1/checkout/sessions', { method: 'POST', headers: { authorization: `Bearer ${c.secret_key}`, 'content-type': 'application/x-www-form-urlencoded', 'idempotency-key': `inv-${inv.id}-${Date.now() >> 14}` }, body: form({ mode: 'payment', client_reference_id: inv.id, customer_email: db.prepare(`SELECT u.email FROM memberships m JOIN users u ON u.id=m.user_id WHERE m.organisation_id=? AND m.role='owner' ORDER BY m.rowid LIMIT 1`).get(inv.organisation_id)?.email, success_url: `${base()}/pay/${token}?paid=1`, cancel_url: `${base()}/pay/${token}`, payment_method_types: methods, metadata: { invoice_id: inv.id, invoice_number: inv.number }, line_items: [{ quantity: 1, price_data: { currency: 'aud', unit_amount: inv.total_cents, product_data: { name: `Super Pro AI Office Manager, invoice ${inv.number}` } } }] }) }, 'Stripe');
      let d; try { d = await make(['card', 'au_becs_debit']); } catch (e) { if (!/payment method|becs|capabilit/i.test(e.message)) throw e; d = await make(['card']); }
      if (!d.url) throw new Error('Stripe did not return a payment page.'); return { url: d.url, external_id: d.id };
    },
    async paypal(inv, token) {
      const c = config('paypal'), at = await paypalToken(c);
      const d = await call(`${paypalBase(c)}/v2/checkout/orders`, { method: 'POST', headers: { authorization: `Bearer ${at}`, 'content-type': 'application/json', 'paypal-request-id': `inv-${inv.id}-${Date.now() >> 14}` }, body: JSON.stringify({ intent: 'CAPTURE', purchase_units: [{ reference_id: inv.number, custom_id: inv.id, description: `Super Pro invoice ${inv.number}`, amount: { currency_code: 'AUD', value: (inv.total_cents / 100).toFixed(2) } }], payment_source: { paypal: { experience_context: { brand_name: 'Super Pro AI Office Manager', user_action: 'PAY_NOW', return_url: `${base()}/api/pay/${token}/paypal-return`, cancel_url: `${base()}/pay/${token}` } } } }) }, 'PayPal');
      const link = (d.links || []).find((l) => ['payer-action', 'approve'].includes(l.rel))?.href; if (!link) throw new Error('PayPal did not return a payment link.'); return { url: link, external_id: d.id };
    },
    async square(inv, token) {
      const c = config('square');
      const d = await call(`${squareBase(c)}/v2/online-checkout/payment-links`, { method: 'POST', headers: { authorization: `Bearer ${c.access_token}`, 'content-type': 'application/json', 'square-version': '2024-10-17' }, body: JSON.stringify({ idempotency_key: crypto.randomUUID(), quick_pay: { name: `Super Pro invoice ${inv.number}`, price_money: { amount: inv.total_cents, currency: 'AUD' }, location_id: c.location_id }, checkout_options: { redirect_url: `${base()}/pay/${token}?paid=1` }, payment_note: inv.number }) }, 'Square');
      const l = d.payment_link; if (!l?.url) throw new Error('Square did not return a payment link.'); return { url: l.url, external_id: l.order_id || l.id };
    },
    async zeller(inv) { const u = String(config('zeller').payment_link_url || ''); if (!/^https:\/\//i.test(u)) throw new Error('The Zeller link is not set.'); return { url: u, external_id: null }; }
  };

  function methodsFor(inv) {
    const out = order().filter((p) => usable(p)).map((p) => ({ id: p, label: PROVIDERS[p].label, kind: PROVIDERS[p].kind }));
    if (!out.some((m) => m.id === 'bank') && complete('bank') && row('bank')?.enabled !== 0) out.push({ id: 'bank', label: PROVIDERS.bank.label, kind: 'manual' });
    return out;
  }
  const bankDetails = (inv) => { const c = config('bank'); return complete('bank') ? { account_name: c.account_name, bsb: c.bsb, account_number: c.account_number, payid: c.payid || null, reference: inv.number } : null; };

  async function start(inv, token, wanted) {
    const tried = [];
    const list = (wanted && wanted !== 'auto' ? [wanted] : order()).filter((p) => creators[p] && usable(p));
    for (const p of list) {
      try { const r = await creators[p](inv, token); attempt(inv.id, p, 'created', r.external_id); return { ok: true, provider: p, url: r.url, tried }; }
      catch (e) { attempt(inv.id, p, 'failed', null, e.message); tried.push({ provider: p, error: e.message }); }
    }
    return { ok: false, tried, bank: bankDetails(inv) };
  }

  const settleOnce = (inv, reference, via) => { if (!['sent', 'approved'].includes(inv.status)) return false; return settle(inv.id, { reference, via }); };

  function install(app, { requireAdmin, requireSaasUser, requireSaasRole }) {
    const limiter = rateLimit({ windowMs: 60 * 1000, limit: 40, standardHeaders: true, legacyHeaders: false, message: { ok: false, error: 'Too many requests. Please wait a minute.' } });
    // ----- the page the invoice email links to -----
    app.get('/pay/:token', (req, res) => { res.set('X-Robots-Tag', 'noindex, nofollow'); res.set('Cache-Control', 'no-store'); res.sendFile('pay.html', { root: fileURLToPath(new URL('../saas/', import.meta.url)) }); });
    app.get('/api/pay/:token', limiter, (req, res) => {
      const inv = invoiceFor(req.params.token); res.set('Cache-Control', 'no-store');
      if (!inv || inv.status === 'void' || inv.status === 'draft') return res.status(404).json({ ok: false, error: 'This payment link is not valid. Please use the link in your latest invoice email.' });
      res.json({ ok: true, invoice: { number: inv.number, business: inv.business, total_cents: inv.total_cents, gst_cents: inv.gst_cents, due_at: inv.due_at, status: inv.status, lines: JSON.parse(inv.lines_json) }, methods: inv.status === 'paid' ? [] : methodsFor(inv), bank: inv.status === 'paid' ? null : bankDetails(inv), payee: { name: String(env.PLATFORM_LEGAL_NAME || 'Super Pro AI Office Manager'), abn: String(env.PLATFORM_ABN || '') || null } });
    });
    app.post('/api/pay/:token/start', limiter, async (req, res) => {
      const inv = invoiceFor(req.params.token), p = z.object({ method: z.string().max(20).optional() }).safeParse(req.body || {});
      if (!inv || policy?.active(inv.organisation_id) || !p.success || !['sent', 'approved'].includes(inv.status)) return res.status(409).json({ ok: false, error: 'This invoice cannot be paid online right now.' });
      const r = await start(inv, req.params.token, p.data.method);
      if (r.ok) return res.json({ ok: true, url: r.url, provider: r.provider, switched: r.tried.length > 0 });
      res.status(502).json({ ok: false, error: 'We could not open an online payment page just now. You can pay by bank transfer below, or try again in a few minutes.', bank: r.bank });
    });
    app.get('/api/pay/:token/paypal-return', limiter, async (req, res) => {
      const inv = invoiceFor(req.params.token), orderId = String(req.query.token || '');
      const back = (q) => res.redirect(303, `/pay/${req.params.token}${q}`);
      if (!inv || !/^[A-Za-z0-9-]{8,40}$/.test(orderId) || !db.prepare(`SELECT 1 FROM platform_pay_attempts WHERE invoice_id=? AND provider='paypal' AND external_id=?`).get(inv.id, orderId)) return back('?error=1');
      try {
        const c = config('paypal'), at = await paypalToken(c);
        const d = await call(`${paypalBase(c)}/v2/checkout/orders/${orderId}/capture`, { method: 'POST', headers: { authorization: `Bearer ${at}`, 'content-type': 'application/json', 'paypal-request-id': `cap-${orderId}` }, body: '{}' }, 'PayPal');
        const cap = d.purchase_units?.[0]?.payments?.captures?.[0];
        if (d.status === 'COMPLETED' && cap?.status === 'COMPLETED' && cap.amount?.currency_code === 'AUD' && Math.round(Number(cap.amount.value) * 100) === inv.total_cents) { await settleOnce(inv, `PayPal ${cap.id}`, 'paypal'); db.prepare(`UPDATE platform_pay_attempts SET status='paid' WHERE invoice_id=? AND external_id=?`).run(inv.id, orderId); return back('?paid=1'); }
        return back('?pending=1');
      } catch (e) { attempt(inv.id, 'paypal', 'failed', orderId, e.message); return back('?error=1'); }
    });
    // ----- signed messages from providers -----
    app.post('/api/webhooks/payments/platform-stripe', async (req, res) => {
      const secret = config('stripe').webhook_secret;
      if (!secret || !verifyStripeSignature(req.rawBody, req.get('stripe-signature'), secret)) return res.status(400).json({ ok: false });
      const ev = req.body || {}, s = ev.data?.object || {};
      if (['checkout.session.completed', 'checkout.session.async_payment_succeeded'].includes(ev.type) && s.payment_status === 'paid') {
        const inv = db.prepare(`SELECT * FROM platform_invoices WHERE id=?`).get(String(s.client_reference_id || s.metadata?.invoice_id || ''));
        if (inv && s.currency === 'aud' && Number(s.amount_total) === inv.total_cents) { await settleOnce(inv, `Stripe ${String(s.payment_intent || s.id).slice(0, 40)}`, 'stripe'); db.prepare(`UPDATE platform_pay_attempts SET status='paid' WHERE invoice_id=? AND external_id=?`).run(inv.id, s.id); }
      }
      if (ev.type === 'checkout.session.async_payment_failed') { const inv = db.prepare(`SELECT id FROM platform_invoices WHERE id=?`).get(String(s.client_reference_id || '')); if (inv) attempt(inv.id, 'stripe', 'failed', s.id, 'Direct debit was refused'); }
      res.json({ ok: true });
    });
    app.post('/api/webhooks/payments/platform-square', async (req, res) => {
      const c = config('square'), sig = req.get('x-square-hmacsha256-signature');
      const url = `${base()}/api/webhooks/payments/platform-square`;
      const expected = c.signature_key ? crypto.createHmac('sha256', c.signature_key).update(url + (req.rawBody || '')).digest('base64') : '';
      if (!sig || !expected || !safeEqual(sig, expected)) return res.status(400).json({ ok: false });
      const pay = req.body?.data?.object?.payment;
      if (pay?.status === 'COMPLETED' && pay.order_id) {
        const a = db.prepare(`SELECT invoice_id FROM platform_pay_attempts WHERE provider='square' AND external_id=?`).get(pay.order_id);
        const inv = a && db.prepare(`SELECT * FROM platform_invoices WHERE id=?`).get(a.invoice_id);
        if (inv && pay.amount_money?.currency === 'AUD' && Number(pay.amount_money.amount) === inv.total_cents) { await settleOnce(inv, `Square ${String(pay.id).slice(0, 40)}`, 'square'); db.prepare(`UPDATE platform_pay_attempts SET status='paid' WHERE invoice_id=? AND external_id=?`).run(inv.id, pay.order_id); }
      }
      res.json({ ok: true });
    });

    // ----- the subscriber's own invoices (owner and admin only, their own business only) -----
    if (requireSaasUser) app.get('/api/saas/platform-invoices', requireSaasUser, requireSaasRole('owner', 'admin', 'super_admin'), (req, res) => {
      const rows = db.prepare(`SELECT * FROM platform_invoices WHERE organisation_id=? AND status IN ('approved','sent','paid') ORDER BY period_start DESC LIMIT 12`).all(req.saas.organisation_id);
      res.json({ ok: true, invoices: rows.map((r) => ({ number: r.number, period_start: r.period_start, total_cents: r.total_cents, status: r.status === 'approved' ? 'sent' : r.status, due_at: r.due_at, paid_at: r.paid_at, pay_url: r.status === 'paid' ? null : payUrl(r) })) });
    });

    // ----- operator controls -----
    const hintOf = (p) => { const c = config(p); return Object.fromEntries(PROVIDERS[p].fields.map((f) => [f, PROVIDERS[p].secret.includes(f) ? (c[f] ? '••••' + String(c[f]).slice(-4) : '') : (typeof c[f] === 'boolean' ? c[f] : c[f] || '')])); };
    app.get('/api/admin/platform-pay', requireAdmin, (req, res) => {
      const items = order().map((p) => ({ provider: p, label: PROVIDERS[p].label, kind: PROVIDERS[p].kind, fields: PROVIDERS[p].fields, secret_fields: PROVIDERS[p].secret, enabled: Boolean(row(p)?.enabled), complete: complete(p), live: usable(p), values: hintOf(p), webhook_url: p === 'stripe' ? `${base()}/api/webhooks/payments/platform-stripe` : p === 'square' ? `${base()}/api/webhooks/payments/platform-square` : null }));
      const recent = db.prepare(`SELECT a.provider,a.status,a.error,a.created_at,i.number FROM platform_pay_attempts a JOIN platform_invoices i ON i.id=a.invoice_id ORDER BY a.created_at DESC LIMIT 15`).all();
      res.json({ ok: true, providers: items, recent, base_url_ok: /^https:\/\//.test(base()), live_count: items.filter((x) => x.live).length });
    });
    app.put('/api/admin/platform-pay/:provider', requireAdmin, (req, res) => {
      const p = req.params.provider; if (!PROVIDERS[p]) return res.status(404).json({ ok: false, error: 'Unknown payment method.' });
      const body = z.object({ enabled: z.boolean().optional(), values: z.record(z.string(), z.union([z.string().max(300), z.boolean()])).optional() }).safeParse(req.body);
      if (!body.success) return res.status(400).json({ ok: false, error: 'Check what you entered.' });
      const cur = config(p), next = { ...cur };
      for (const [k, v] of Object.entries(body.data.values || {})) { if (!PROVIDERS[p].fields.includes(k)) continue; if (typeof v === 'string') { if (v.trim() === '' && PROVIDERS[p].secret.includes(k)) continue; next[k] = v.trim(); } else next[k] = v; }
      const checks = { stripe: [['secret_key', /^(sk|rk)_(test|live)_[A-Za-z0-9]{16,}$/, 'A Stripe secret key starts with sk_ or rk_.'], ['webhook_secret', /^whsec_[A-Za-z0-9]{16,}$/, 'A Stripe signing secret starts with whsec_.']], zeller: [['payment_link_url', /^https:\/\/[^\s]+$/i, 'The Zeller link must start with https://.']], bank: [['bsb', /^\d{3}-?\d{3}$/, 'A BSB has 6 digits.'], ['account_number', /^\d{5,10}$/, 'An account number has 5 to 10 digits.']] }[p] || [];
      for (const [k, re, msg] of checks) if (next[k] && !re.test(next[k])) return res.status(400).json({ ok: false, error: msg });
      const wantsOn = body.data.enabled ?? Boolean(row(p)?.enabled);
      db.prepare(`INSERT INTO platform_pay_providers (provider,enabled,config_enc,hint,position,updated_at) VALUES (?,?,?,?,COALESCE((SELECT position FROM platform_pay_providers WHERE provider=?),?),?) ON CONFLICT(provider) DO UPDATE SET enabled=excluded.enabled,config_enc=excluded.config_enc,hint=excluded.hint,updated_at=excluded.updated_at`).run(p, wantsOn ? 1 : 0, seal(next), null, p, Math.max(0, DEFAULT_ORDER.indexOf(p)), iso());
      const ok = complete(p);
      if (wantsOn && !ok) db.prepare(`UPDATE platform_pay_providers SET enabled=0 WHERE provider=?`).run(p);
      res.json({ ok: true, enabled: wantsOn && ok, complete: ok, message: wantsOn && !ok ? 'Saved, but it stays off until every field is filled in.' : 'Saved.' });
    });
    app.put('/api/admin/platform-pay-order', requireAdmin, (req, res) => {
      const body = z.object({ order: z.array(z.enum(Object.keys(PROVIDERS))).min(1).max(5) }).safeParse(req.body);
      if (!body.success) return res.status(400).json({ ok: false, error: 'Send the methods in the order you want.' });
      const ordered = [...new Set([...body.data.order, ...DEFAULT_ORDER])];
      ordered.forEach((p, i) => db.prepare(`INSERT INTO platform_pay_providers (provider,enabled,position,updated_at) VALUES (?,0,?,?) ON CONFLICT(provider) DO UPDATE SET position=excluded.position`).run(p, i, iso()));
      res.json({ ok: true });
    });
    app.post('/api/admin/platform-pay/:provider/test', requireAdmin, async (req, res) => {
      const p = req.params.provider, c = config(p);
      try {
        if (!PROVIDERS[p]) return res.status(404).json({ ok: false, error: 'Unknown payment method.' });
        if (!complete(p)) return res.status(409).json({ ok: false, error: 'Fill in every field first.' });
        if (p === 'stripe') await call('https://api.stripe.com/v1/balance', { headers: { authorization: `Bearer ${c.secret_key}` } }, 'Stripe');
        else if (p === 'paypal') await paypalToken(c);
        else if (p === 'square') await call(`${squareBase(c)}/v2/locations/${encodeURIComponent(c.location_id)}`, { headers: { authorization: `Bearer ${c.access_token}`, 'square-version': '2024-10-17' } }, 'Square');
        else if (p === 'zeller') { const r = await fetchImpl(c.payment_link_url, { method: 'GET', redirect: 'manual', signal: AbortSignal.timeout(10000) }); if (r.status >= 500 || r.status === 404) throw new Error(`The link answered with status ${r.status}.`); }
        res.json({ ok: true, message: p === 'bank' ? 'Bank details are saved. Nothing to test: they are shown to the payer.' : 'The provider accepted your details.' });
      } catch (e) { res.status(502).json({ ok: false, error: e.message }); }
    });
    app.post('/api/admin/pay-links/:id', requireAdmin, (req, res) => {
      const inv = db.prepare(`SELECT * FROM platform_invoices WHERE id=? AND status IN ('approved','sent')`).get(req.params.id);
      inv ? res.json({ ok: true, url: payUrl(inv) }) : res.status(409).json({ ok: false, error: 'Only an approved or sent invoice has a payment link.' });
    });
  }
  return { install, payUrl, start, methodsFor, order, usable };
}
