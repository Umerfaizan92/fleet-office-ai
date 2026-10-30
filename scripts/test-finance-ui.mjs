// Phase 08 in a real browser: Finance settings, Quotes & Invoices (create, approve, issue, payment link, AI-prepared
// draft, adjustment note), Payments & Refunds (receipt, refund with approval), Bank Reconciliation (CSV upload, categorise,
// match), Reports & GST, Change Plan and the Founder Console billing tab, with accessibility checks and phone/iPad fit.
// Stripe is replaced by a local stand-in because the test machine cannot reach it.
//   npm run test:finance-ui
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import crypto from 'node:crypto';
import Database from 'better-sqlite3';
import { chromium } from 'playwright';
import { startServer } from './test-server.mjs';
import { seedOwner, ownerContext } from './visual/session.mjs';

const calls = [];
const mock = http.createServer((req, res) => { let b = ''; req.on('data', (c) => { b += c; }); req.on('end', () => { const p = Object.fromEntries(new URLSearchParams(b)); calls.push({ path: req.url, auth: req.headers.authorization, p }); res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify(req.url === '/v1/refunds' ? { id: 're_ui_1', status: 'succeeded', amount: Number(p.amount) } : { id: 'cs_ui_' + crypto.randomUUID().slice(0, 6), url: 'https://checkout.stripe.example/pay/ui' })); }); });
await new Promise((r) => mock.listen(0, '127.0.0.1', r));
// Fake keys built at run time (random, never real) so secret scanners do not mistake them for credentials.
const WHSEC = 'whsec_' + crypto.randomBytes(12).toString('hex'), KEY = ['sk', 'test', ''].join('_') + crypto.randomBytes(12).toString('hex');
const s = await startServer({ STRIPE_API_BASE_URL: `http://127.0.0.1:${mock.address().port}` });
const browser = await chromium.launch();
const errors = [];
let passed = 0;
const check = async (name, fn) => { await fn(); passed += 1; console.log('PASS', name); };
const shots = process.env.UI_SHOTS;
const AXE = fs.readFileSync(new URL('../node_modules/axe-core/axe.min.js', import.meta.url), 'utf8');
const axe = (page, sel) => page.evaluate(async ([src, sc]) => { if (!window.axe) (0, eval)(src); const r = await window.axe.run(document.querySelector(sc), { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] }, resultTypes: ['violations'] }); return r.violations.filter((x) => ['serious', 'critical'].includes(x.impact)).map((x) => `${x.id}: ${x.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(', ')}`); }, [AXE, sel]);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

try {
  const owner = await seedOwner(s, { business: 'Harbour Plumbing Pty Ltd' });
  const O = (m, u, b) => s.call(m, u, { cookie: owner.cookie, body: b });
  const sql = (q, ...a) => { const d = new Database(s.dbPath); try { return /^\s*select/i.test(q) ? d.prepare(q).all(...a) : d.prepare(q).run(...a); } finally { d.close(); } };
  sql("UPDATE organisations SET abn='51824753556', address_formatted='1 Beach Rd, Fremantle WA 6160' WHERE id=?", owner.org);
  sql("UPDATE organisation_subscriptions SET plan_id='starter',status='active',payment_status='paid' WHERE organisation_id=?", owner.org);
  assert.equal((await O('PUT', '/api/saas/payments/settings', { stripe_secret_key: KEY, stripe_webhook_secret: WHSEC, bank_account_name: 'Harbour Plumbing', bank_bsb: '066-000', bank_account_number: '12345678' })).status, 200);
  for (const pr of (await O('GET', '/api/saas/billing/setup')).json.providers.filter((x) => ['stripe', 'bank'].includes(x.id))) await O('POST', '/api/saas/billing/authorise', { provider: pr.id, confirmed: pr.statements.map((x) => x.key) });
  const now = new Date().toISOString(), cust = crypto.randomUUID();
  sql("INSERT INTO tenant_customers(id,organisation_id,name,email,status,source,created_at,updated_at) VALUES (?,?,?,?,'current','manual',?,?)", cust, owner.org, 'Riley Quinn', 'riley@example.test', now, now);
  const job = (title) => { const id = crypto.randomUUID(); sql("INSERT INTO work_orders(id,organisation_id,title,start_at,required_skills,status,created_at,updated_at,customer_id,price_cents,gst_applies,completed_at,labour_hours,labour_rate_cents,materials_cents) VALUES (?,?,?,?,'[]','completed',?,?,?,0,1,?,2,9000,5000)", id, owner.org, title, now, now, now, cust, now); return id; };
  job('Hot water service'); job('Leaking tap');

  const ctx = await ownerContext(browser, s, owner, { viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('dialog', (d) => { errors.push('unexpected dialog: ' + d.message()); d.dismiss(); });
  await page.goto(s.base + '/saas/workspace.html');
  await page.locator('#workspace').waitFor({ state: 'visible' });
  await page.evaluate(() => document.querySelectorAll('dialog[open]').forEach((d) => d.close()));
  const go = async (hash, id) => { await page.evaluate(() => { location.hash = 'b01/home'; }); await page.waitForTimeout(100); await page.evaluate((h) => { location.hash = h; }, hash); const v = page.locator(`#${id}-view`); await v.waitFor({ state: 'visible' }); await page.waitForFunction((i) => { const b = document.querySelector(`#${i}-view [data-fx-body]`); return b && !b.querySelector(':scope > .pl-meta'); }, id); return v; };
  const statusIs = (id, re) => page.waitForFunction(([i, src]) => new RegExp(src).test(document.querySelector(`#${i}-view [data-fx-status]`)?.textContent || ''), [id, re.source]);

  await check('Finance settings: GST registration saved, compliance review and rule sources shown', async () => {
    const v = await go('b07/compliance', 'fincompliance');
    assert.match(await v.textContent(), /Action needed/);
    await v.getByLabel('Registered for GST?').selectOption('1');
    await v.getByRole('button', { name: 'Save finance settings' }).click();
    await statusIs('fincompliance', /Finance settings saved/);
    await v.getByText('Rules used (ruleset AU-2026.10', { exact: false }).waitFor();
    assert.deepEqual(await axe(page, '#fincompliance-view'), [], 'settings and compliance are accessible');
  });

  await check('Quotes & Invoices: create a tax invoice for a job, approve, issue, and create a card payment link', async () => {
    const v = await go('b07/sales', 'finsales');
    await v.getByText('New quotation, estimate or invoice').click();
    const f = v.locator('details.fx-panel form');
    await f.getByLabel('Job').selectOption({ label: 'Hot water service' });
    await f.getByLabel('Item description').first().fill('Replace hot water valve');
    await f.getByLabel('Quantity').first().fill('1'); await f.getByLabel('Unit price').first().fill('300');
    await f.getByRole('button', { name: 'Add item' }).click();
    await f.getByLabel('Item description').nth(1).fill('Call-out fee'); await f.getByLabel('Unit price').nth(1).fill('80');
    await f.getByRole('button', { name: 'Save draft' }).click();
    await statusIs('finsales', /Invoice saved as a draft/);
    const d = v.locator('.fx-detail'); await d.getByText('Tax invoice checks pass').waitFor();
    assert.match(await d.textContent(), /Total \$418\.00/);
    if (shots) await page.screenshot({ path: shots + '/fin-invoice-draft.png', fullPage: true });
    await d.getByRole('button', { name: 'Approve' }).click(); await statusIs('finsales', /Approved/);
    await v.locator('.fx-detail').getByRole('button', { name: 'Issue' }).click(); await statusIs('finsales', /Issued/);
    await v.locator('.fx-detail').getByText(/Tax invoice INV-00001/).waitFor();
    await v.locator('.fx-detail').getByRole('button', { name: 'Card payment link' }).click();
    await v.locator('.fx-detail').getByRole('link', { name: /checkout\.stripe\.example/ }).waitFor();
    assert.equal(calls.find((c) => c.path === '/v1/checkout/sessions').auth, `Bearer ${KEY}`, 'charged through the business account');
    assert.deepEqual(await axe(page, '#finsales-view'), [], 'invoice view is accessible');
  });

  await check('Quotes & Invoices: Super Pro prepares a draft from a completed job', async () => {
    const v = await go('b07/sales', 'finsales');
    await v.getByRole('button', { name: 'Prepare invoice draft' }).click();
    await statusIs('finsales', /Draft invoice prepared/);
    await v.locator('.fx-detail').getByText(/prepared by Super Pro/).waitFor();
    assert.match(await v.locator('.fx-detail').textContent(), /Labour: 2 hours/);
  });

  await check('Payments & Refunds: receipt after the signed Stripe payment, refund only after approval', async () => {
    const pay = sql("SELECT * FROM job_payments WHERE provider='stripe' AND status='pending'")[0];
    const body = JSON.stringify({ id: 'evt_ui_1', type: 'checkout.session.completed', data: { object: { id: pay.provider_ref, payment_status: 'paid', amount_total: pay.amount_cents, currency: 'aud', payment_intent: 'pi_ui_1' } } }), t = Math.floor(Date.now() / 1000);
    const r = await fetch(`${s.base}/api/webhooks/payments/stripe/${owner.org}`, { method: 'POST', headers: { 'content-type': 'application/json', 'stripe-signature': `t=${t},v1=${crypto.createHmac('sha256', WHSEC).update(`${t}.${body}`).digest('hex')}` }, body });
    assert.equal(r.status, 200);
    const v = await go('b07/payments-refunds', 'finpayments');
    await v.getByText(/R-\d{4}-0001/).waitFor();
    await v.getByText('Refund', { exact: true }).click();
    await v.getByLabel('Refund amount').fill('20'); await v.getByLabel('Reason for the refund').fill('Valve was cheaper than quoted');
    await v.getByRole('button', { name: 'Request refund' }).click();
    await statusIs('finpayments', /sent for approval/);
    assert.equal(calls.filter((c) => c.path === '/v1/refunds').length, 0, 'no refund before approval');
    const ap = (await O('GET', '/api/saas/approvals')).json.approvals.find((a) => /Refund/.test(a.title));
    assert.equal((await O('POST', `/api/saas/approvals/${ap.id}/decision`, { decision: 'approve' })).status, 200); await sleep(400);
    await go('b07/payments-refunds', 'finpayments');
    await page.locator('#finpayments-view').getByText('Refunded').first().waitFor();
    assert.equal(calls.filter((c) => c.path === '/v1/refunds').length, 1);
    assert.deepEqual(await axe(page, '#finpayments-view'), [], 'payments view is accessible');
  });

  await check('Quotes & Invoices: an adjustment note is sent for approval', async () => {
    const v = await go('b07/sales', 'finsales');
    await v.getByRole('row', { name: /INV-00001/ }).getByRole('button', { name: 'Open' }).click();
    const d = v.locator('.fx-detail'); await d.getByText('Credit or correct this invoice (adjustment note)').click();
    await d.getByLabel('Amount to credit (inc GST)').fill('11'); await d.getByLabel('Reason').fill('Goodwill discount for the delay');
    await d.getByRole('button', { name: 'Send for approval' }).click();
    await statusIs('finsales', /Sent for approval/);
    await v.locator('.fx-detail').getByText('Waiting for approval').first().waitFor();
  });

  await check('Bank Reconciliation: upload a CSV, see suggestions, categorise and match', async () => {
    const v = await go('b07/reconcile', 'finreconcile');
    const d = new Date(), dd = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
    await v.getByLabel('Bank statement (CSV)').setInputFiles({ name: 'october.csv', mimeType: 'text/csv', buffer: Buffer.from(`Date,Amount,Description\n${dd},-85.50,BUNNINGS WAREHOUSE FREMANTLE\n${dd},-49.00,TELSTRA MOBILE\n`) });
    await v.getByRole('button', { name: 'Import statement' }).click();
    await statusIs('finreconcile', /Imported 2 line/);
    const row = v.getByRole('row', { name: /BUNNINGS/ });
    assert.equal(await row.getByRole('combobox').inputValue(), 'Materials and supplies', 'Super Pro suggested the category');
    await row.getByRole('button', { name: 'Save category' }).click(); await statusIs('finreconcile', /recorded as an expense/);
    await v.getByRole('row', { name: /TELSTRA/ }).getByRole('button', { name: 'Ignore' }).click(); await statusIs('finreconcile', /Ignored/);
    assert.deepEqual(await axe(page, '#finreconcile-view'), [], 'reconciliation is accessible');
    if (shots) await page.screenshot({ path: shots + '/fin-reconcile.png', fullPage: true });
  });

  await check('Reports & GST: profit and loss, BAS draft, money owed and summary', async () => {
    const v = await go('b07/reports', 'finreports');
    for (const t of ['Profit and loss', 'GST (BAS draft)', '1A GST on sales', 'Owed to you', 'not financial, tax or legal advice']) await v.getByText(t, { exact: false }).first().waitFor();
    assert.deepEqual(await axe(page, '#finreports-view'), [], 'reports are accessible');
  });

  await check('Change Plan: shows the prorated upgrade before anything changes', async () => {
    const v = await go('b09/change-plan', 'finplan');
    await v.getByLabel('Plan').selectOption({ index: 1 });
    await v.getByText(/rest of this month|changes on|new plan now/).waitFor();
    assert.deepEqual(await axe(page, '#finplan-view'), [], 'plan change is accessible');
  });

  for (const [w, h, label] of [[390, 844, 'phone'], [820, 1180, 'iPad']]) {
    await check(`Money views fit a ${label} without sideways scrolling`, async () => {
      await page.setViewportSize({ width: w, height: h });
      for (const [hash, id] of [['b07/sales', 'finsales'], ['b07/payments-refunds', 'finpayments'], ['b07/reconcile', 'finreconcile'], ['b07/reports', 'finreports'], ['b07/compliance', 'fincompliance'], ['b09/change-plan', 'finplan']]) {
        await go(hash, id); await page.waitForTimeout(200);
        const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
        assert.ok(over <= 1, `${hash} overflows by ${over}px on ${label}`);
      }
      if (shots) await page.screenshot({ path: `${shots}/fin-${label}.png`, fullPage: true });
    });
  }

  await check('Founder Console: plan prices need approval; renewals, payment problems and revenue shown', async () => {
    const fctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
    const p = await fctx.newPage(); p.on('pageerror', (e) => errors.push('console: ' + e.message));
    await p.goto(s.base + '/saas/operator-sign-in.html');
    await p.locator('#operator-form input[name=key]').fill(s.adminKey);
    await Promise.all([p.waitForURL(s.base + '/office/'), p.locator('#operator-form button[type=submit]').click()]);
    await p.evaluate(() => { location.hash = 'f03/platform/finance'; });
    const v = p.locator('#console-content');
    await v.getByText('Monthly recurring').waitFor();
    for (const t of ['Plans and prices', 'Renewals and trials', 'Payment problems']) await v.getByText(t).first().waitFor();
    const row = v.getByRole('row', { name: /Starter/ }); await row.getByText('Change price').click();
    const later = new Date(Date.now() + 45 * 86400000).toISOString().slice(0, 10);
    await row.getByLabel(/New monthly price/).fill('59'); await row.getByLabel(/Effective date/).fill(later); await row.getByLabel(/Reason for changing/).fill('Provider costs went up');
    await row.getByRole('button', { name: 'Send for approval' }).click();
    await v.getByText(/Price change sent for approval/).waitFor();
    assert.equal(sql("SELECT monthly_fee_cents FROM subscription_plans WHERE id='starter'")[0].monthly_fee_cents, 4900, 'price unchanged until approved');
    if (shots) await p.screenshot({ path: shots + '/founder-finance.png', fullPage: true });
    await fctx.close();
  });
  assert.deepEqual(errors, [], 'no page errors');
  console.log(`\n${passed} checks passed`);
} catch (e) {
  console.error('FAIL', e.message); if (errors.length) console.error('page errors:', errors); process.exitCode = 1;
} finally { await browser.close(); await s.stop(); mock.close(); }
