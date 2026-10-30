// Phase 08 end to end through the real server. Stripe is replaced by a local stand-in (the test machine cannot reach it);
// webhooks are signed exactly as Stripe signs them. Covers tax rules, documents, payment links, receipts, adjustment
// notes and refunds with approval, reconciliation, reports, flags, compliance, audit, tenancy and platform billing.
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import crypto from 'node:crypto';
import Database from 'better-sqlite3';
import { startServer } from './test-server.mjs';
import { seedOwner } from './visual/session.mjs';
import { abnValid, documentTotals, checkDocument, lineAmounts, basDraft, rulesFor, RULESETS } from '../src/finance/rules.js';
import { parseBankCsv, categorise } from '../src/finance/service.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// Fake keys built at run time (random, never real) so secret scanners do not mistake them for credentials.
const fake = (prefix) => prefix + crypto.randomBytes(12).toString('hex');
const BIZ_KEY = fake(['sk', 'test', ''].join('_')), WHSEC = fake('whsec_'), PLATFORM_KEY = fake(['sk', 'test', ''].join('_'));

test('rules: ABN check digit, GST maths, tax invoice and adjustment note checks, versioned with sources', () => {
  assert.equal(abnValid('51 824 753 556'), true); assert.equal(abnValid('51824753557'), false); assert.equal(abnValid('123'), false);
  assert.deepEqual(lineAmounts({ quantity: 1, unit_cents: 11000, tax_code: 'GST' }, { includesGst: true, registered: true }), { ex_cents: 10000, gst_cents: 1000, inc_cents: 11000 });
  assert.deepEqual(lineAmounts({ quantity: 3, unit_cents: 3333, tax_code: 'GST' }, { registered: true }), { ex_cents: 9999, gst_cents: 1000, inc_cents: 10999 });
  assert.equal(lineAmounts({ quantity: 1, unit_cents: 5000, tax_code: 'GST' }, { registered: false }).gst_cents, 0, 'no GST when not registered');
  const t = documentTotals([{ quantity: 1, unit_cents: 11000, tax_code: 'GST' }], { includesGst: true, registered: true }); assert.equal(t.gst_is_one_eleventh, true);
  const seller = { name: 'Harbour Plumbing', abn: '51824753556', gst_registered: true };
  const big = [{ description: 'Hot water system', quantity: 1, unit_cents: 200000, tax_code: 'GST' }];
  assert.match(checkDocument({ kind: 'invoice', seller, buyer: {}, lines: big }).issues.join(' '), /buyer's identity/);
  assert.equal(checkDocument({ kind: 'invoice', seller, buyer: { name: 'Riley' }, lines: big }).ok, true);
  assert.match(checkDocument({ kind: 'invoice', seller: { ...seller, abn: '' }, lines: big, buyer: { name: 'R' } }).issues.join(' '), /ABN/);
  assert.equal(checkDocument({ kind: 'invoice', seller: { ...seller, gst_registered: false, abn: '' }, lines: big, buyer: {} }).title, 'Invoice');
  assert.match(checkDocument({ kind: 'credit_note', seller, lines: big, buyer: { name: 'R' }, reason: '' }).issues.join(' '), /original invoice/);
  const bas = basDraft({ sales: [{ inc_cents: 11000, gst_cents: 1000 }, { inc_cents: 5000, gst_cents: 0 }], purchases: [{ inc_cents: 2200, gst_cents: 200 }] });
  assert.equal(bas.G1_total_sales_cents, 16000); assert.equal(bas['1A_gst_on_sales_cents'], 1000); assert.equal(bas['1B_gst_on_purchases_cents'], 200); assert.equal(bas.G3_gst_free_sales_cents, 5000);
  const r = rulesFor('2026-10-30'); assert.equal(r.gst.rate, 0.1); assert.equal(r.tax_invoice.buyer_identity_from_cents, 100000); assert.equal(r.records.retain_years, 5);
  for (const rs of RULESETS) { assert.ok(Object.isFrozen(rs)); assert.ok(rs.sources.every((s) => /^https:\/\/(www\.)?(ato\.gov\.au|abr\.business\.gov\.au|oaic\.gov\.au|cfr\.gov\.au)\//.test(s.url)), 'every rule source is an official site'); }
  const csv = parseBankCsv('Date,Description,Debit,Credit\n03/10/2026,"OSKO PAYMENT RILEY INV-00001",,"1,100.00"\n04/10/2026,BUNNINGS 123 PERTH,85.50,\nbad,row,,\n');
  assert.equal(csv.rows.length, 2); assert.equal(csv.rows[0].amount_cents, 110000); assert.equal(csv.rows[1].amount_cents, -8550); assert.equal(csv.rows[0].posted_on, '2026-10-03'); assert.equal(csv.errors.length, 1);
  assert.equal(categorise('BUNNINGS 123 PERTH', -8550).category, 'Materials and supplies');
  assert.equal(categorise('Some cafe', -1200, [{ pattern: 'some', category: 'Office expenses' }]).category, 'Office expenses', 'learned categories win');
});

async function mockStripe() {
  const calls = [];
  const server = http.createServer((req, res) => {
    let body = ''; req.on('data', (c) => { body += c; }); req.on('end', () => {
      const params = Object.fromEntries(new URLSearchParams(body));
      calls.push({ path: req.url, auth: req.headers.authorization, idem: req.headers['idempotency-key'], params });
      const send = (o) => { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify(o)); };
      if (req.url === '/v1/checkout/sessions') return send({ id: 'cs_test_' + crypto.randomUUID().slice(0, 8), url: 'https://checkout.stripe.example/pay' });
      if (req.url === '/v1/refunds') return send({ id: 're_' + crypto.createHash('sha1').update(req.headers['idempotency-key'] || '').digest('hex').slice(0, 10), status: 'succeeded', amount: Number(params.amount) });
      res.writeHead(404); res.end('{}');
    });
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  return { base: `http://127.0.0.1:${server.address().port}`, calls, close: () => new Promise((r) => server.close(r)) };
}
async function setup() {
  const stripe = await mockStripe();
  const s = await startServer({ STRIPE_API_BASE_URL: stripe.base, STRIPE_SECRET_KEY: PLATFORM_KEY });
  const owner = await seedOwner(s, { business: 'Harbour Plumbing Pty Ltd' });
  const O = (m, u, b) => s.call(m, u, { cookie: owner.cookie, body: b });
  const F = (m, u, b) => s.call(m, u, { headers: { 'x-admin-key': s.adminKey }, body: b });
  const sql = (q, ...a) => { const d = new Database(s.dbPath); try { return /^\s*select/i.test(q) ? d.prepare(q).all(...a) : d.prepare(q).run(...a); } finally { d.close(); } };
  sql("UPDATE organisations SET abn='51824753556', address_formatted='1 Beach Rd, Fremantle WA 6160' WHERE id=?", owner.org);
  let r = await O('PUT', '/api/saas/payments/settings', { stripe_secret_key: BIZ_KEY, stripe_webhook_secret: WHSEC, bank_account_name: 'Harbour Plumbing', bank_bsb: '066-000', bank_account_number: '12345678', terms_days: 14 });
  assert.equal(r.status, 200, r.text);
  for (const pr of (await O('GET', '/api/saas/billing/setup')).json.providers.filter((x) => ['stripe', 'bank'].includes(x.id))) { const a = await O('POST', '/api/saas/billing/authorise', { provider: pr.id, confirmed: pr.statements.map((x) => x.key || x.id || x[0]) }); assert.equal(a.status, 200, a.text); }
  const cust = crypto.randomUUID(), now = new Date().toISOString();
  sql("INSERT INTO tenant_customers(id,organisation_id,name,email,phone,status,source,created_at,updated_at) VALUES (?,?,?,?,?,'current','manual',?,?)", cust, owner.org, 'Riley Quinn', 'riley@example.test', '0412 345 678', now, now);
  const job = (title, price, customer = cust) => { const id = crypto.randomUUID(); sql("INSERT INTO work_orders(id,organisation_id,title,start_at,required_skills,status,created_at,updated_at,customer_id,price_cents,gst_applies,completed_at,labour_hours,labour_rate_cents,materials_cents) VALUES (?,?,?,?,'[]','completed',?,?,?,?,1,?,3,9000,15000)", id, owner.org, title, now, now, now, customer, price, now); return id; };
  const approve = async (runId) => { await sleep(50); const ap = (await O('GET', '/api/saas/approvals')).json.approvals.find((a) => a.automation_run_id === runId); assert.ok(ap, 'an approval request exists for run ' + runId); const d = await O('POST', `/api/saas/approvals/${ap.id}/decision`, { decision: 'approve' }); assert.equal(d.status, 200, d.text); await sleep(400); return ap; };
  const stripeHook = async (event) => { const body = JSON.stringify(event), t = Math.floor(Date.now() / 1000); const sig = crypto.createHmac('sha256', WHSEC).update(`${t}.${body}`).digest('hex'); const res = await fetch(`${s.base}/api/webhooks/payments/stripe/${owner.org}`, { method: 'POST', headers: { 'content-type': 'application/json', 'stripe-signature': `t=${t},v1=${sig}` }, body }); assert.equal(res.status, 200, await res.text()); return res; };
  return { s, stripe, owner, O, F, sql, cust, job, approve, stripeHook, stop: async () => { await s.stop(); await stripe.close(); } };
}
const L = (description, quantity, unit_price, tax_code = 'GST') => ({ description, quantity, unit_price, tax_code });

test('subscriber finance: estimate to quotation, tax invoice checks and numbering, payment link through the business Stripe, receipt, locked once issued', async (t) => {
  const { stripe, owner, O, sql, cust, job, stripeHook, stop } = await setup(); t.after(stop);
  let r = await O('POST', '/api/saas/finance/documents', { kind: 'estimate', title: 'Hot water replacement', customer_id: cust, lines: [L('250 L hot water system', 1, 1800), L('Installation labour', 4, 95), L('Council permit fee', 1, 120, 'NT')] });
  assert.equal(r.status, 201, r.text); const est = r.json.document;
  assert.match(est.number, /^EST-00001$/); assert.equal(est.status, 'draft');
  r = await O('POST', `/api/saas/finance/documents/${est.id}/convert`, { to: 'quote' }); assert.equal(r.status, 201, r.text);
  const quote = r.json.document; assert.match(quote.number, /^QUO-00001$/); assert.equal(quote.parent_id, est.id);
  assert.equal((await O('GET', `/api/saas/finance/documents/${est.id}`)).json.document.status, 'converted');
  r = await O('POST', `/api/saas/finance/documents/${quote.id}/convert`, { to: 'invoice' }); assert.equal(r.status, 409, 'an invoice needs a booked job');

  const jobId = job('Hot water replacement', 0);
  r = await O('POST', '/api/saas/finance/documents', { kind: 'invoice', title: 'Hot water replacement', work_order_id: jobId, lines: [L('250 L hot water system', 1, 1800), L('Installation labour', 4, 95), L('Council permit fee', 1, 120, 'NT')] });
  assert.equal(r.status, 201, r.text); let inv = r.json.document; assert.equal(inv.customer_id, cust, 'customer taken from the job'); assert.equal(inv.number, null, 'invoice numbers are given at issue');
  // Not registered yet: the business has not said whether it is registered for GST.
  r = await O('POST', `/api/saas/finance/documents/${inv.id}/approve`, { revision: inv.revision }); assert.equal(r.status, 200, r.text);
  r = await O('POST', `/api/saas/finance/documents/${inv.id}/issue`); assert.equal(r.status, 409); assert.match(r.json.error, /registered for GST/);
  r = await O('PUT', '/api/saas/finance/settings', { gst_registered: true, prices_include_gst: false, accounting_basis: 'cash', bas_period: 'quarterly', quote_valid_days: 30, deposit_percent: 30 }); assert.equal(r.status, 200, r.text);
  // Re-pricing after approval sends it back to draft.
  r = await O('PUT', `/api/saas/finance/documents/${inv.id}`, { lines: [L('250 L hot water system', 1, 1800), L('Installation labour', 4, 95), L('Council permit fee', 1, 120, 'NT')] }); assert.equal(r.json.document.status, 'draft');
  inv = r.json.document; assert.equal(inv.ex_cents, 180000 + 38000 + 12000); assert.equal(inv.gst_cents, 21800); assert.equal(inv.total_cents, 251800);
  r = await O('POST', `/api/saas/finance/documents/${inv.id}/approve`, { revision: inv.revision - 1 }); assert.equal(r.status, 409, 'stale approval refused');
  await O('POST', `/api/saas/finance/documents/${inv.id}/approve`, { revision: inv.revision });
  r = await O('POST', `/api/saas/finance/documents/${inv.id}/issue`); assert.equal(r.status, 200, r.text);
  inv = r.json.document; assert.equal(inv.number, 'INV-00001'); assert.equal(inv.status, 'issued'); assert.equal(inv.heading, 'Tax invoice'); assert.equal(inv.ruleset, 'AU-2026.10'); assert.equal(inv.compliance.ok, true);
  assert.equal(sql('SELECT price_cents FROM work_orders WHERE id=?', jobId)[0].price_cents, 251800);
  r = await O('PUT', `/api/saas/finance/documents/${inv.id}`, { title: 'Changed' }); assert.equal(r.status, 409); assert.match(r.json.error, /adjustment note/);
  r = await O('POST', `/api/saas/finance/documents/${inv.id}/cancel`, { reason: 'mistake' }); assert.equal(r.status, 409, 'issued invoices are kept');
  const html = (await O('GET', `/api/saas/finance/documents/${inv.id}/print`)).text;
  for (const must of ['Tax invoice', 'INV-00001', 'ABN 51 824 753 556', 'Riley Quinn', 'GST', '$2,518.00', 'Not reportable']) assert.ok(html.includes(must), 'printed invoice shows ' + must);

  // A tax invoice of $1,000 or more without a buyer is refused.
  const lonely = job('Big job, no customer', 0, null);
  r = await O('POST', '/api/saas/finance/documents', { kind: 'invoice', title: 'Big job', work_order_id: lonely, lines: [L('Works', 1, 2000)] }); const bigDoc = r.json.document;
  await O('POST', `/api/saas/finance/documents/${bigDoc.id}/approve`, { revision: bigDoc.revision });
  r = await O('POST', `/api/saas/finance/documents/${bigDoc.id}/issue`); assert.equal(r.status, 409); assert.match(r.json.error, /buyer's identity/);

  // Payment link: created in the business's own Stripe account, never the platform's.
  r = await O('POST', `/api/saas/finance/documents/${inv.id}/payment-link`, { provider: 'stripe' }); assert.equal(r.status, 201, r.text + ' ' + JSON.stringify(r.json));
  const session = stripe.calls.find((c) => c.path === '/v1/checkout/sessions');
  assert.equal(session.auth, `Bearer ${BIZ_KEY}`, 'charged through the business account');
  assert.ok(!stripe.calls.some((c) => c.auth === `Bearer ${PLATFORM_KEY}`), 'the platform key is never used for customer payments');
  assert.equal(session.params['line_items[0][price_data][unit_amount]'], '251800');
  const pay = sql('SELECT * FROM job_payments WHERE work_order_id=?', jobId)[0];
  await stripeHook({ id: 'evt_paid_1', type: 'checkout.session.completed', data: { object: { id: pay.provider_ref, payment_status: 'paid', amount_total: 251800, currency: 'aud', payment_intent: 'pi_test_1' } } });
  inv = (await O('GET', `/api/saas/finance/documents/${inv.id}`)).json.document;
  assert.equal(inv.status, 'paid'); assert.equal(inv.money.owing_cents, 0);
  const rec = (await O('GET', '/api/saas/finance/receipts')).json.receipts[0];
  assert.match(rec.receipt_no, /^R-\d{4}-0001$/); assert.equal(rec.invoice_number, 'INV-00001'); assert.equal(rec.gst_included_cents, Math.round(251800 / 11));
  assert.match((await O('GET', `/api/saas/finance/receipts/${rec.id}/print`)).text, /Includes GST of/);
  // Deposit: a deposit tax invoice on a booked job asks for the deposit only; the final invoice then shows it as paid.
  const booked = job('Kitchen renovation plumbing', 330000);
  r = await O('POST', '/api/saas/finance/documents', { kind: 'deposit', title: 'Kitchen renovation plumbing', work_order_id: booked, lines: [L('Deposit (30%)', 1, 900)] }); assert.equal(r.status, 201, r.text);
  let dep = r.json.document; assert.equal(dep.total_cents, 99000);
  await O('POST', `/api/saas/finance/documents/${dep.id}/approve`, { revision: dep.revision }); r = await O('POST', `/api/saas/finance/documents/${dep.id}/issue`); assert.equal(r.status, 200, r.text);
  dep = r.json.document; assert.equal(dep.heading, 'Tax invoice (deposit)'); assert.match(dep.number, /^INV-00002$/);
  assert.equal(sql('SELECT price_cents FROM work_orders WHERE id=?', booked)[0].price_cents, 330000, 'a deposit does not change the job price');
  r = await O('POST', `/api/saas/finance/documents/${dep.id}/payment-link`, { provider: 'stripe' }); assert.equal(r.status, 201, r.text);
  const depSession = stripe.calls.filter((c) => c.path === '/v1/checkout/sessions').at(-1); assert.equal(depSession.params['line_items[0][price_data][unit_amount]'], '99000');
  const depPay = sql("SELECT * FROM job_payments WHERE work_order_id=? AND status='pending'", booked)[0];
  await stripeHook({ id: 'evt_dep_1', type: 'checkout.session.completed', data: { object: { id: depPay.provider_ref, payment_status: 'paid', amount_total: 99000, currency: 'aud', payment_intent: 'pi_dep_1' } } });
  assert.equal((await O('GET', `/api/saas/finance/documents/${dep.id}`)).json.document.status, 'paid');
  r = await O('POST', '/api/saas/finance/documents', { kind: 'invoice', title: 'Kitchen renovation plumbing', work_order_id: booked, lines: [L('Kitchen plumbing works', 1, 3000)] }); let fin = r.json.document;
  await O('POST', `/api/saas/finance/documents/${fin.id}/approve`, { revision: fin.revision }); fin = (await O('POST', `/api/saas/finance/documents/${fin.id}/issue`)).json.document;
  assert.equal(fin.money.paid_cents, 99000); assert.equal(fin.money.owing_cents, 330000 - 99000); assert.equal(fin.status, 'part_paid');
  assert.match((await O('GET', `/api/saas/finance/documents/${fin.id}/print`)).text, /Paid to date[\s\S]*\$990\.00[\s\S]*Amount owing[\s\S]*\$2,310\.00/);
  void owner;
});

test('adjustment notes and refunds need approval; refunds go through the business Stripe once; partial refunds counted once; manual refunds', async (t) => {
  const { s, stripe, O, sql, job, approve, stripeHook, stop } = await setup(); t.after(stop);
  await O('PUT', '/api/saas/finance/settings', { gst_registered: true, prices_include_gst: true, accounting_basis: 'accrual', bas_period: 'quarterly', quote_valid_days: 30, deposit_percent: 0 });
  const jobId = job('Blocked drain', 0);
  let r = await O('POST', '/api/saas/finance/documents', { kind: 'invoice', title: 'Blocked drain', work_order_id: jobId, lines: [L('Clear blocked drain', 1, 440)] }); let inv = r.json.document;
  assert.equal(inv.gst_cents, 4000, 'one-eleventh when prices include GST');
  await O('POST', `/api/saas/finance/documents/${inv.id}/approve`, { revision: inv.revision }); await O('POST', `/api/saas/finance/documents/${inv.id}/issue`);
  // Paid by bank transfer, recorded by staff.
  r = await O('POST', '/api/saas/payments/record', { work_order_id: jobId, amount: 440, method: 'bank_transfer' }); assert.equal(r.status, 201, r.text);
  const payId = r.json.payment.id;
  // Credit note: waits for approval, then issues CN-00001 and lowers the job price.
  r = await O('POST', `/api/saas/finance/documents/${inv.id}/credit-note`, { amount: 110, reason: 'Discount agreed for the second visit' }); assert.equal(r.status, 201, r.text);
  const cnId = r.json.credit_note_id;
  assert.equal(sql('SELECT status FROM tenant_documents WHERE id=?', cnId)[0].status, 'pending_approval');
  assert.equal(sql('SELECT price_cents FROM work_orders WHERE id=?', jobId)[0].price_cents, 44000, 'nothing changes before approval');
  r = await O('POST', `/api/saas/finance/documents/${inv.id}/credit-note`, { amount: 400, reason: 'Too much in total' }); assert.equal(r.status, 400, 'credits cannot exceed the invoice');
  await approve(sql('SELECT run_id FROM tenant_documents WHERE id=?', cnId)[0].run_id);
  const cn = (await O('GET', `/api/saas/finance/documents/${cnId}`)).json.document;
  assert.equal(cn.status, 'issued'); assert.equal(cn.number, 'CN-00001'); assert.equal(cn.total_cents, 11000); assert.equal(cn.gst_cents, 1000);
  assert.match((await O('GET', `/api/saas/finance/documents/${cnId}/print`)).text, /Adjustment note[\s\S]*INV-00001[\s\S]*Discount agreed/);
  assert.equal(sql('SELECT price_cents FROM work_orders WHERE id=?', jobId)[0].price_cents, 33000);
  // The customer paid $440 but now owes $330: a $110 refund, by bank, needs approval and is then done by hand.
  r = await O('POST', `/api/saas/finance/payments/${payId}/refund`, { amount: 500, reason: 'Too much' }); assert.equal(r.status, 400);
  r = await O('POST', `/api/saas/finance/payments/${payId}/refund`, { amount: 110, reason: 'Credit for the discount' }); assert.equal(r.status, 201, r.text);
  const manualRefund = r.json.refund_id;
  r = await O('POST', `/api/saas/finance/refunds/${manualRefund}/complete`, { reference: 'NAB 123' }); assert.equal(r.status, 409, 'cannot complete before approval');
  await approve(r.json?.run_id || sql('SELECT run_id FROM fin_refunds WHERE id=?', manualRefund)[0].run_id);
  assert.equal(sql('SELECT status FROM fin_refunds WHERE id=?', manualRefund)[0].status, 'awaiting_manual');
  r = await O('POST', `/api/saas/finance/refunds/${manualRefund}/complete`, { reference: 'NAB 123456' }); assert.equal(r.status, 200, r.text);
  assert.equal(sql('SELECT paid_cents FROM work_orders WHERE id=?', jobId)[0].paid_cents, 33000);
  assert.equal(sql('SELECT refunded_cents FROM job_payments WHERE id=?', payId)[0].refunded_cents, 11000);

  // Card payment refunded through the business's Stripe account with an idempotency key.
  const job2 = job('Tap washer', 0);
  r = await O('POST', '/api/saas/finance/documents', { kind: 'invoice', title: 'Tap washer', work_order_id: job2, lines: [L('Replace washer', 1, 220)] }); const inv2 = r.json.document;
  await O('POST', `/api/saas/finance/documents/${inv2.id}/approve`, { revision: inv2.revision }); await O('POST', `/api/saas/finance/documents/${inv2.id}/issue`);
  await O('POST', `/api/saas/finance/documents/${inv2.id}/payment-link`, { provider: 'stripe' });
  const p2 = sql('SELECT * FROM job_payments WHERE work_order_id=?', job2)[0];
  await stripeHook({ id: 'evt_paid_2', type: 'checkout.session.completed', data: { object: { id: p2.provider_ref, payment_status: 'paid', amount_total: 22000, currency: 'aud', payment_intent: 'pi_test_2' } } });
  r = await O('POST', `/api/saas/finance/payments/${p2.id}/refund`, { amount: 50, reason: 'Partial refund, part not used' }); assert.equal(r.status, 201, r.text);
  assert.equal(stripe.calls.filter((c) => c.path === '/v1/refunds').length, 0, 'no money moves before approval');
  await approve(r.json.run_id);
  const refundCall = stripe.calls.find((c) => c.path === '/v1/refunds');
  assert.equal(refundCall.auth, `Bearer ${BIZ_KEY}`); assert.equal(refundCall.params.payment_intent, 'pi_test_2'); assert.equal(refundCall.params.amount, '5000'); assert.match(refundCall.idem, /^sp-refund-/);
  assert.equal(sql('SELECT paid_cents FROM work_orders WHERE id=?', job2)[0].paid_cents, 17000);
  // Stripe then reports the refund (running total 5000): already applied, so nothing changes. A later 3000 refund adds only 3000.
  await stripeHook({ id: 'evt_ref_1', type: 'charge.refunded', data: { object: { id: 'ch_1', payment_intent: 'pi_test_2', amount_refunded: 5000 } } });
  assert.equal(sql('SELECT paid_cents FROM work_orders WHERE id=?', job2)[0].paid_cents, 17000, 'the same refund is not counted twice');
  await stripeHook({ id: 'evt_ref_2', type: 'charge.refunded', data: { object: { id: 'ch_1', payment_intent: 'pi_test_2', amount_refunded: 8000 } } });
  assert.equal(sql('SELECT paid_cents FROM work_orders WHERE id=?', job2)[0].paid_cents, 14000);
  assert.equal(sql('SELECT refunded_cents FROM job_payments WHERE id=?', p2.id)[0].refunded_cents, 8000);
  // A rejected refund request closes and moves nothing.
  r = await O('POST', `/api/saas/finance/payments/${p2.id}/refund`, { amount: 10, reason: 'Customer asked again' });
  const ap = (await O('GET', '/api/saas/approvals')).json.approvals.find((a) => a.automation_run_id === r.json.run_id);
  await O('POST', `/api/saas/approvals/${ap.id}/decision`, { decision: 'reject' }); await sleep(300);
  assert.equal((await O('GET', '/api/saas/finance/refunds')).json.refunds.find((x) => x.id === r.json.refund_id).status, 'rejected');
  assert.equal(stripe.calls.filter((c) => c.path === '/v1/refunds').length, 1);
  // Audit trail records every step.
  const aud = await O('GET', '/api/saas/finance/audit'); assert.equal(aud.status, 200, aud.text); const ev = aud.json.events.map((e) => e.action);
  for (const a of ['finance.invoice_issued', 'finance.credit_note_requested', 'finance.credit_note_issued', 'finance.refund_requested', 'finance.refund_submitted', 'finance.refund_completed']) assert.ok(ev.includes(a), 'audit has ' + a);
  void s;
});

test('reconciliation: bank import with duplicates ignored, suggested matches, confirm, categorise and learn, undo; recorded payments missing from the bank', async (t) => {
  const { O, sql, job, stop } = await setup(); t.after(stop);
  await O('PUT', '/api/saas/finance/settings', { gst_registered: true, prices_include_gst: false, accounting_basis: 'cash', bas_period: 'quarterly', quote_valid_days: 30, deposit_percent: 0 });
  const j = job('Gutter repair', 0);
  let r = await O('POST', '/api/saas/finance/documents', { kind: 'invoice', title: 'Gutter repair', work_order_id: j, lines: [L('Repair gutters', 1, 1000)] }); const inv = r.json.document;
  await O('POST', `/api/saas/finance/documents/${inv.id}/approve`, { revision: inv.revision }); await O('POST', `/api/saas/finance/documents/${inv.id}/issue`);
  r = await O('POST', '/api/saas/payments/record', { work_order_id: j, amount: 1100, method: 'bank_transfer' }); const payId = r.json.payment.id;
  const d = new Date(), day = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
  const csv = `Date,Amount,Description\n${day},1100.00,OSKO DEPOSIT RILEY QUINN INV-00001\n${day},-85.50,BUNNINGS WAREHOUSE FREMANTLE\n${day},-49.00,TELSTRA MOBILE\n${day},-20.00,BUNNINGS WAREHOUSE FREMANTLE\n${day},-20.00,BUNNINGS WAREHOUSE FREMANTLE\n`;
  r = await O('POST', '/api/saas/finance/bank/import', { filename: 'oct.csv', csv }); assert.equal(r.status, 201, r.text);
  assert.equal(r.json.added, 5, 'two identical lines on the same day are both kept'); assert.equal(r.json.suggested_matches, 1);
  r = await O('POST', '/api/saas/finance/bank/import', { filename: 'oct-again.csv', csv }); assert.equal(r.json.added, 0); assert.equal(r.json.duplicates, 5);
  let rc = (await O('GET', '/api/saas/finance/reconciliation')).json;
  const credit = rc.lines.find((l) => l.amount_cents === 110000);
  assert.equal(credit.suggestion.payments[0].payment_id, payId); assert.ok(credit.suggestion.payments[0].why.includes('Reference matches'));
  assert.equal(credit.status, 'unmatched', 'suggestions are never applied on their own');
  const bunnings = rc.lines.find((l) => l.amount_cents === -8550); assert.equal(bunnings.suggestion.category.category, 'Materials and supplies');
  r = await O('POST', `/api/saas/finance/bank/${credit.id}/match`, { payment_id: payId }); assert.equal(r.status, 200, r.text);
  r = await O('POST', `/api/saas/finance/bank/${bunnings.id}/match`, { payment_id: payId }); assert.equal(r.status, 400, 'amounts must agree');
  r = await O('POST', `/api/saas/finance/bank/${bunnings.id}/match`, { category: 'Materials and supplies' }); assert.equal(r.status, 200, r.text);
  const exp = sql("SELECT * FROM organisation_finance_entries WHERE id=?", r.json.finance_entry_id)[0]; assert.equal(exp.amount_cents, 8550); assert.equal(exp.tax_cents, 777); assert.equal(exp.source, 'bank');
  const telstra = rc.lines.find((l) => l.amount_cents === -4900);
  r = await O('POST', `/api/saas/finance/bank/${telstra.id}/match`, { category: 'Not a category' }); assert.equal(r.status, 400);
  r = await O('POST', `/api/saas/finance/bank/${telstra.id}/match`, { ignore: true, note: 'Personal phone, paid from the business account by mistake' }); assert.equal(r.status, 200);
  r = await O('POST', `/api/saas/finance/bank/${bunnings.id}/undo`); assert.equal(r.status, 200);
  assert.equal(sql("SELECT COUNT(*) n FROM organisation_finance_entries WHERE source='bank'")[0].n, 0, 'undo removes the expense it created');
  rc = (await O('GET', '/api/saas/finance/reconciliation')).json;
  assert.equal(rc.counts.matched, 1); assert.equal(rc.counts.ignored, 1); assert.equal(rc.counts.unmatched, 3);
  // Learned category from the first confirmation is reused on the next import.
  await O('POST', `/api/saas/finance/bank/${bunnings.id}/match`, { category: 'Equipment and tools' });
  r = await O('POST', '/api/saas/finance/bank/import', { csv: `Date,Amount,Description\n${day},-12.00,BUNNINGS KWINANA\n` });
  const learned = (await O('GET', '/api/saas/finance/reconciliation')).json.lines.find((l) => l.description === 'BUNNINGS KWINANA');
  assert.equal(learned.suggestion.category.category, 'Equipment and tools'); assert.match(learned.suggestion.category.reason, /before/);
  r = await O('POST', '/api/saas/finance/bank/import', { csv: 'nothing useful here' }); assert.equal(r.status, 400);
});

test('reports, insights, flags, compliance review, AI-prepared invoice drafts and tenancy', async (t) => {
  const { s, O, sql, job, stop } = await setup(); t.after(stop);
  await O('PUT', '/api/saas/finance/settings', { gst_registered: true, prices_include_gst: false, accounting_basis: 'cash', bas_period: 'quarterly', quote_valid_days: 30, deposit_percent: 0 });
  // AI-prepared draft from the job record (hours, rate and materials).
  const j = job('Bathroom leak', 0);
  let r = await O('POST', `/api/saas/finance/jobs/${j}/draft-invoice`); assert.equal(r.status, 201, r.text);
  const draft = r.json.document; assert.equal(draft.ai_prepared, true); assert.equal(draft.status, 'draft'); assert.ok(r.json.explanation.length);
  assert.equal(draft.ex_cents, 3 * 9000 + 15000);
  r = await O('POST', `/api/saas/finance/jobs/${j}/draft-invoice`); assert.equal(r.status, 409, 'one invoice per job');
  await O('POST', `/api/saas/finance/documents/${draft.id}/approve`, { revision: draft.revision }); await O('POST', `/api/saas/finance/documents/${draft.id}/issue`);
  await O('POST', '/api/saas/payments/record', { work_order_id: j, amount: 200, method: 'cash' });
  // Make it overdue and corrupt a job total so the discrepancy check fires.
  sql("UPDATE tenant_documents SET due_at=? WHERE id=?", new Date(Date.now() - 35 * 86400000).toISOString(), draft.id);
  const j2 = job('Mismatch job', 50000); sql("UPDATE work_orders SET paid_cents=9999 WHERE id=?", j2);
  const ins = (await O('GET', '/api/saas/finance/insights')).json;
  assert.equal(ins.follow_ups[0].document_id, draft.id); assert.ok(ins.follow_ups[0].days_overdue >= 34); assert.match(ins.follow_ups[0].recommendation, /Call/); assert.match(ins.follow_ups[0].basis, /suggestion/);
  assert.ok(ins.discrepancies.some((x) => x.kind === 'job_paid_mismatch' && x.entity_id === j2));
  const flag = ins.flags.find((f) => f.kind === 'job_paid_mismatch'); assert.ok(flag);
  r = await O('POST', `/api/saas/finance/flags/${flag.id}`, { status: 'resolved', note: 'Corrected in the job record' }); assert.equal(r.status, 200);
  assert.match(ins.summary.points.join(' '), /owed to you/); assert.match(ins.summary.basis, /not financial, tax or legal advice/);
  // Reports.
  const pl = (await O('GET', '/api/saas/finance/reports/pl')).json.report; assert.equal(pl.total_income_cents, Math.round(20000 - 20000 / 11));
  const gst = (await O('GET', '/api/saas/finance/reports/gst')).json.report; assert.equal(gst.registered, true); assert.equal(gst.G1_total_sales_cents, 20000); assert.equal(gst['1A_gst_on_sales_cents'], Math.round(20000 / 11)); assert.match(gst.note, /does not give tax advice/);
  const aged = (await O('GET', '/api/saas/finance/reports/aged')).json.report; assert.ok(aged.buckets.d31_60 > 0);
  const csvText = (await O('GET', '/api/saas/finance/reports/aged.csv')).text; assert.match(csvText, /^Invoice,Customer,Due,Days overdue,Owing \(AUD\)/);
  assert.match((await O('GET', '/api/saas/finance/reports/documents.csv')).text, /INV-00001/);
  // Compliance review lists what needs attention, with official sources and a clear disclaimer.
  const cr = (await O('GET', '/api/saas/finance/compliance')).json;
  assert.ok(cr.items.some((i) => i.area === 'ABN' && i.status === 'ok')); assert.ok(cr.items.some((i) => i.area === 'Reconciliation' && i.status === 'review'));
  assert.ok(cr.items.some((i) => i.area === 'Payments' && /never holds/.test(i.text))); assert.match(cr.disclaimer, /not tax or legal advice/); assert.ok(cr.ruleset.sources.length >= 5);
  sql("UPDATE organisations SET abn='12345678901' WHERE id=(SELECT organisation_id FROM tenant_documents WHERE id=?)", draft.id);
  assert.ok((await O('GET', '/api/saas/finance/compliance')).json.items.some((i) => i.area === 'ABN' && i.status === 'action'));
  // Tenancy: another business sees none of it and cannot act on it.
  const other = await seedOwner(s, { business: 'Other Co Pty Ltd', email: 'other@example.test' });
  const X = (m, u, b) => s.call(m, u, { cookie: other.cookie, body: b });
  assert.equal((await X('GET', `/api/saas/finance/documents/${draft.id}`)).status, 404);
  assert.equal((await X('GET', `/api/saas/finance/documents/${draft.id}/print`)).status, 404);
  assert.equal((await X('GET', '/api/saas/finance/documents')).json.documents.length, 0);
  assert.equal((await X('POST', `/api/saas/finance/documents/${draft.id}/credit-note`, { amount: 10, reason: 'Trying another business' })).status, 404);
  assert.equal((await X('POST', '/api/saas/finance/documents', { kind: 'invoice', title: 'Steal', work_order_id: j, lines: [L('x', 1, 1)] })).status, 400, "cannot invoice another business's job");
});

test('platform billing: price changes need approval and notice, subscriber upgrades are prorated on the next invoice, dunning, revenue, access', async (t) => {
  const { s, owner, O, F, sql, stop } = await setup(); t.after(stop);
  let r = await F('GET', '/api/operator/finance/plans'); assert.equal(r.status, 200, r.text);
  const plans = r.json.plans; const starter = plans.find((p) => p.id === 'starter'), ops = plans.find((p) => p.id === 'operations');
  assert.ok(starter && ops); assert.ok(starter.history.length >= 1, 'current price recorded in history');
  assert.equal((await O('GET', '/api/operator/finance/plans')).status === 200, false, 'a business cannot reach platform finance');
  // Make the owner an active, paying starter subscriber.
  sql("UPDATE organisation_subscriptions SET plan_id='starter',status='active',payment_status='paid',trial_ends_at=NULL WHERE organisation_id=?", owner.org);
  const soon = new Date(Date.now() + 5 * 86400000).toISOString().slice(0, 10), later = new Date(Date.now() + 40 * 86400000).toISOString().slice(0, 10);
  r = await F('POST', '/api/operator/finance/plans/starter/price', { monthly_price: (starter.monthly_fee_cents + 1000) / 100, effective_from: soon, reason: 'Higher provider costs' }); assert.equal(r.status, 400); assert.match(r.json.error, /30 days/);
  r = await F('POST', '/api/operator/finance/plans/starter/price', { monthly_price: (starter.monthly_fee_cents + 1000) / 100, effective_from: later, reason: 'Higher provider costs' }); assert.equal(r.status, 201, r.text);
  const changeId = r.json.change_id, runId = r.json.run_id;
  assert.equal(sql("SELECT monthly_fee_cents FROM subscription_plans WHERE id='starter'")[0].monthly_fee_cents, starter.monthly_fee_cents, 'nothing changes before approval');
  const pa = sql('SELECT id FROM platform_approvals WHERE run_id=?', runId)[0]; assert.ok(pa, 'a platform approval exists');
  r = await F('POST', `/api/operator/automation/approvals/${pa.id}/decision`, { decision: 'approve' }); assert.equal(r.status, 200, r.text); await sleep(300);
  assert.equal(sql('SELECT status FROM plan_price_changes WHERE id=?', changeId)[0].status, 'approved');
  r = await F('POST', '/api/operator/finance/run-daily'); assert.equal(r.json.notified, 1); assert.equal(r.json.applied, 0, 'not applied before its date');
  assert.ok(sql("SELECT COUNT(*) n FROM user_notifications WHERE organisation_id=? AND title LIKE 'Your plan price changes%'", owner.org)[0].n >= 1, 'subscribers are told in advance');
  sql('UPDATE plan_price_changes SET effective_from=? WHERE id=?', new Date().toISOString().slice(0, 10), changeId);
  r = await F('POST', '/api/operator/finance/run-daily'); assert.equal(r.json.applied, 1);
  assert.equal(sql("SELECT monthly_fee_cents FROM subscription_plans WHERE id='starter'")[0].monthly_fee_cents, starter.monthly_fee_cents + 1000);
  assert.ok(sql("SELECT COUNT(*) n FROM plan_price_history WHERE plan_id='starter' AND change_id=?", changeId)[0].n === 1);
  // Subscriber upgrades: prorated, charged once on the next monthly invoice.
  r = await O('GET', '/api/saas/finance/plan-change/quote?plan=operations'); assert.equal(r.status, 200, r.text); assert.equal(r.json.kind, 'upgrade'); assert.ok(r.json.proration_cents > 0);
  r = await O('POST', '/api/saas/finance/plan-change', { plan_id: 'operations' }); assert.equal(r.status, 201, r.text); assert.equal(r.json.scheduled, false);
  assert.equal(sql('SELECT plan_id FROM organisation_subscriptions WHERE organisation_id=?', owner.org)[0].plan_id, 'operations');
  r = await F('POST', '/api/admin/invoices/prepare', { organisation_id: owner.org }); assert.equal(r.status, 201, r.text);
  const pinv = sql('SELECT lines_json FROM platform_invoices WHERE organisation_id=? ORDER BY created_at DESC LIMIT 1', owner.org)[0];
  assert.match(pinv.lines_json, /Upgrade from starter to operations/); assert.equal(sql("SELECT COUNT(*) n FROM subscription_change_requests WHERE organisation_id=? AND invoiced_in IS NULL AND proration_cents>0", owner.org)[0].n, 0, 'charged once');
  // Downgrade waits for the next billing month.
  r = await O('POST', '/api/saas/finance/plan-change', { plan_id: 'starter' }); assert.equal(r.json.scheduled, true);
  assert.ok((await F('GET', '/api/operator/finance/renewals')).json.scheduled_changes.some((c) => c.organisation_id === owner.org));
  // Payment failure opens a dunning case; reminders step through; resolving closes it.
  sql("UPDATE organisation_subscriptions SET payment_status='failed' WHERE organisation_id=?", owner.org);
  r = await F('GET', '/api/operator/finance/dunning'); const dcase = r.json.cases.find((c) => c.organisation_id === owner.org && c.status === 'open'); assert.ok(dcase);
  r = await F('POST', '/api/operator/finance/run-daily'); assert.ok(r.json.reminded >= 1);
  assert.equal(sql('SELECT step FROM platform_dunning WHERE id=?', dcase.id)[0].step, 1);
  r = await F('POST', `/api/operator/finance/dunning/${dcase.id}/resolve`, { resolution: 'Card updated, paid by phone' }); assert.equal(r.status, 200);
  const rev = (await F('GET', '/api/operator/finance/revenue')).json; assert.equal(rev.months.length, 6); assert.ok(rev.mrr_cents > 0); assert.equal(rev.arr_cents, rev.mrr_cents * 12); assert.match(rev.note, /Stripe/);
  void s;
});
