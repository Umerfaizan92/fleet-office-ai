// Phase 04 pipeline in a real browser: an owner clicks from a new enquiry to a paid invoice.
// Also checks that failures are shown as failures (never as success), and that the views fit a phone.
//   npm run test:pipeline-ui
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { startServer } from './test-server.mjs';
import { seedOwner, ownerContext } from './visual/session.mjs';

const s = await startServer();
const browser = await chromium.launch();
const errors = [];
let passed = 0;
const check = async (name, fn) => { await fn(); passed += 1; console.log('PASS', name); };

try {
  const owner = await seedOwner(s, { business: 'Clickthrough Plumbing Pty Ltd' });
  const ctx = await ownerContext(browser, s, owner, { viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('dialog', (d) => { errors.push('unexpected browser dialog: ' + d.message()); d.dismiss(); });
  await page.goto(s.base + '/saas/workspace.html');
  await page.locator('#workspace').waitFor({ state: 'visible' });
  await page.evaluate(() => document.querySelectorAll('dialog[open]').forEach((d) => d.close()));
  const go = async (hash) => { await page.evaluate((h) => { location.hash = h; }, hash); await page.locator(`#${{ 'b02/enquiries': 'enquiries', 'b02/quotes': 'quotes', 'b02/bookings': 'bookings', 'b07/invoices': 'businessinvoices' }[hash]}-view .pl-strip`).waitFor(); };
  const status = (view) => page.locator(`#${view}-view [data-pl-status]`);
  const card = (view, title) => page.locator(`#${view}-view .pl-card`, { hasText: title });

  await check('new enquiry with a new customer', async () => {
    await go('b02/enquiries');
    const f = page.locator('#enquiries-view .pl-new');
    await f.locator('[name=title]').fill('Blocked kitchen drain');
    await f.locator('[name=details]').fill('Water backing up in the kitchen sink');
    await f.locator('[name=channel]').selectOption('phone');
    await f.locator('[name=name]').fill('Jordan Lee');
    await f.locator('[name=phone]').fill('0411 111 111');
    await f.locator('[name=address]').fill('9 Ocean St, Fremantle WA');
    await f.getByRole('button', { name: 'Save enquiry' }).click();
    await card('enquiries', 'Blocked kitchen drain').waitFor();
    assert.match(await status('enquiries').textContent(), /Enquiry saved/);
    assert.equal(await status('enquiries').getAttribute('data-tone'), 'good');
    assert.equal(await page.locator('#enquiries-view .pl-stage[data-stage=enquiries] b').textContent(), '1');
  });

  await check('missing customer name is refused without success', async () => {
    const wrap = page.locator('#enquiries-view .pl-newwrap');
    assert.equal(await wrap.evaluate((d) => d.open), false, 'the form folds away once enquiries exist');
    await wrap.locator('summary').click();
    const f = page.locator('#enquiries-view .pl-new');
    await f.locator('[name=title]').fill('No name given');
    await f.getByRole('button', { name: 'Save enquiry' }).click();
    await page.waitForFunction(() => document.querySelector('#enquiries-view [data-pl-status]').dataset.tone === 'bad');
    assert.equal(await card('enquiries', 'No name given').count(), 0);
  });

  await check('quote from the enquiry with GST', async () => {
    const c = card('enquiries', 'Blocked kitchen drain');
    await c.getByRole('button', { name: 'Create quote' }).click();
    await c.locator('.pl-inline [name=amount]').fill('450');
    await c.getByRole('button', { name: 'Save quote draft' }).click();
    await page.waitForFunction(() => /Quote draft saved/.test(document.querySelector('#enquiries-view [data-pl-status]').textContent));
    await go('b02/quotes');
    const q = card('quotes', 'Blocked kitchen drain');
    await q.waitFor();
    assert.match(await q.textContent(), /\$450\.00[\s\S]*\$45\.00[\s\S]*\$495\.00/);
  });

  await check('approve, record acceptance, book the job', async () => {
    let q = card('quotes', 'Blocked kitchen drain');
    await q.getByRole('button', { name: 'Approve quote' }).click();
    await page.waitForFunction(() => /Quote approved/.test(document.querySelector('#quotes-view [data-pl-status]').textContent));
    q = card('quotes', 'Blocked kitchen drain');
    await q.getByRole('button', { name: 'Record customer acceptance' }).click();
    await q.locator('.pl-inline [name=evidence]').fill('Accepted by phone 30 Oct, spoke to Jordan');
    await q.getByRole('button', { name: 'Record acceptance' }).click();
    await page.waitForFunction(() => /Acceptance recorded/.test(document.querySelector('#quotes-view [data-pl-status]').textContent));
    q = card('quotes', 'Blocked kitchen drain');
    await q.getByRole('button', { name: 'Book the job' }).click();
    await q.locator('.pl-inline [name=start_at]').fill('2026-11-05T09:30');
    assert.equal(await q.locator('.pl-inline [name=address]').inputValue(), '9 Ocean St, Fremantle WA', 'address carried from the enquiry');
    await q.getByRole('button', { name: 'Create booking and job' }).click();
    await page.waitForFunction(() => /Booked/.test(document.querySelector('#quotes-view [data-pl-status]').textContent));
  });

  await check('offering with no eligible workers is reported as a problem, not success', async () => {
    await go('b02/bookings');
    const b = card('bookings', 'Blocked kitchen drain');
    await b.waitFor();
    assert.match(await b.textContent(), /Needs workers/);
    await b.getByRole('button', { name: 'Offer to workers' }).click();
    await page.waitForFunction(() => document.querySelector('#bookings-view [data-pl-status]').dataset.tone === 'bad');
    assert.match(await status('bookings').textContent(), /No worker is eligible/);
    const res = await s.call('GET', '/api/saas/work-orders', { cookie: owner.cookie });
    assert.ok(JSON.stringify(res.json).includes('Blocked kitchen drain'), 'the job exists in Jobs');
  });

  await check('a server failure never shows success', async () => {
    await page.route('**/api/saas/pipeline/jobs/*/complete', (r) => r.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ ok: false, error: 'Simulated server failure.' }) }));
    await card('bookings', 'Blocked kitchen drain').getByRole('button', { name: 'Mark job complete' }).click();
    await page.waitForFunction(() => document.querySelector('#bookings-view [data-pl-status]').dataset.tone === 'bad');
    assert.match(await status('bookings').textContent(), /Simulated server failure/);
    assert.ok(!/complete\. You can invoice/.test(await status('bookings').textContent()));
    await page.unroute('**/api/saas/pipeline/jobs/*/complete');
  });

  await check('complete the job and create the invoice', async () => {
    await card('bookings', 'Blocked kitchen drain').getByRole('button', { name: 'Mark job complete' }).click();
    await page.waitForFunction(() => /Job marked complete/.test(document.querySelector('#bookings-view [data-pl-status]').textContent));
    await card('bookings', 'Blocked kitchen drain').getByRole('button', { name: 'Create invoice' }).click();
    await page.waitForFunction(() => /Invoice draft created/.test(document.querySelector('#bookings-view [data-pl-status]').textContent));
  });

  await check('approve, issue and record payment; the invoice shows paid', async () => {
    await go('b07/invoices');
    let i = card('businessinvoices', 'Blocked kitchen drain');
    await i.getByRole('button', { name: 'Approve invoice' }).click();
    await page.waitForFunction(() => /Invoice approved/.test(document.querySelector('#businessinvoices-view [data-pl-status]').textContent));
    await card('businessinvoices', 'Blocked kitchen drain').getByRole('button', { name: 'Issue invoice' }).click();
    await page.waitForFunction(() => /Invoice issued/.test(document.querySelector('#businessinvoices-view [data-pl-status]').textContent));
    i = card('businessinvoices', 'Blocked kitchen drain');
    assert.match(await i.textContent(), /Issued, unpaid/);
    await i.getByRole('button', { name: 'Record a payment' }).click();
    assert.equal(await i.locator('.pl-inline [name=amount]').inputValue(), '495.00', 'owing amount prefilled');
    await i.locator('.pl-inline [name=method]').selectOption('eftpos');
    await i.getByRole('button', { name: 'Record payment' }).click();
    await page.waitForFunction(() => /Payment recorded/.test(document.querySelector('#businessinvoices-view [data-pl-status]').textContent));
    i = card('businessinvoices', 'Blocked kitchen drain');
    assert.match(await i.textContent(), /Paid/);
    assert.match(await i.textContent(), /owing \$0\.00/);
    assert.equal(await page.locator('#businessinvoices-view .pl-stage[data-stage=paid] b').textContent(), '1');
  });

  await check('history shows the whole chain and the payment', async () => {
    await card('businessinvoices', 'Blocked kitchen drain').getByRole('button', { name: 'History' }).click();
    const t = page.locator('#businessinvoices-view .pl-trail');
    await t.locator('.pl-chain').waitFor();
    const text = await t.textContent();
    for (const w of ['Enquiry', 'Quote', 'Booking', 'Invoice', 'Payment', '$495.00']) assert.ok(text.includes(w), w);
  });

  await check('search and status filter', async () => {
    await go('b02/enquiries');
    await page.locator('#enquiries-view .pl-toolbar input[type=search]').fill('jordan');
    assert.equal(await page.locator('#enquiries-view .pl-card').count(), 1);
    await page.locator('#enquiries-view .pl-toolbar input[type=search]').fill('nothing like this');
    assert.equal(await page.locator('#enquiries-view .pl-card').count(), 0);
    await page.locator('#enquiries-view .pl-toolbar input[type=search]').fill('');
  });

  await check('pipeline views fit a phone with no sideways scrolling', async () => {
    const phone = await ownerContext(browser, s, owner, { viewport: { width: 390, height: 844 }, reducedMotion: 'reduce', hasTouch: true, isMobile: true });
    const p = await phone.newPage();
    await p.goto(s.base + '/saas/workspace.html#b07/invoices');
    await p.locator('#businessinvoices-view .pl-card').first().waitFor();
    for (const h of ['b02/enquiries', 'b02/quotes', 'b02/bookings', 'b07/invoices']) {
      await p.evaluate((x) => { location.hash = x; }, h); await p.waitForTimeout(500);
      const w = await p.evaluate(() => ({ scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth }));
      assert.ok(w.scroll <= w.client + 1, `${h} scrolls sideways: ${JSON.stringify(w)}`);
    }
    await phone.close();
  });

  await check('workspace search finds a record and opens it filtered', async () => {
    await page.evaluate(() => { location.hash = 'b01/home'; });
    await page.locator('.search-button').first().click();
    const dlg = page.locator('dialog[open]', { has: page.locator('#page-results') });
    await dlg.locator('input').first().fill('Jordan');
    const rec = dlg.locator('.finder-records button[data-record=quote]');
    await rec.waitFor({ timeout: 8000 });
    assert.match(await rec.textContent(), /Blocked kitchen drain/);
    await rec.click();
    await page.locator('#quotes-view .pl-card').first().waitFor();
    assert.equal(await page.locator('#quotes-view .pl-toolbar input[type=search]').inputValue(), 'Blocked kitchen drain');
    assert.equal(await page.locator('#quotes-view .pl-card').count(), 1);
  });

  await check('offshore staff: add a team member and record the data acknowledgement', async () => {
    await page.evaluate(() => { location.hash = 'b03/offshore'; });
    const v = page.locator('#offshore-view');
    await v.locator('form.pl-new').waitFor();
    await v.locator('[name=full_name]').fill('Maria Santos');
    await v.locator('[name=role_title]').fill('Admin assistant');
    await v.locator('[name=country]').fill('Philippines');
    await v.locator('[name=timezone]').fill('Asia/Manila');
    await v.getByRole('button', { name: 'Add team member' }).click();
    const c = v.locator('.pl-card', { hasText: 'Maria Santos' });
    await c.waitFor();
    assert.match(await c.textContent(), /Data acknowledgement needed/);
    await c.getByRole('button', { name: 'Record data acknowledgement' }).click();
    await c.locator('textarea[name=note]').fill('Signed confidentiality and privacy agreement; view-only access');
    await c.locator('input[name=confirm]').check();
    await c.getByRole('button', { name: 'Save acknowledgement' }).click();
    await page.waitForFunction(() => /Data acknowledgement recorded/.test(document.querySelector('#offshore-view [data-ops-status]').textContent));
    assert.match(await v.locator('.pl-card', { hasText: 'Maria Santos' }).textContent(), /Data safeguards recorded/);
  });

  await check('automation: every automatic behaviour listed; owner toggles customer reminders', async () => {
    await page.evaluate(() => { location.hash = 'b08/automation'; });
    const v = page.locator('#automation-view');
    const c = v.locator('.pl-card[data-key=customer_reminders]');
    await c.waitFor();
    assert.ok(await v.locator('.pl-card').count() >= 7);
    assert.match(await c.textContent(), /Off/);
    await c.getByRole('button', { name: 'Turn on' }).click();
    await page.waitForFunction(() => /reminders to customers: on/.test(document.querySelector('#automation-view [data-ops-status]').textContent));
    assert.match(await v.locator('.pl-card[data-key=customer_reminders]').textContent(), /On/);
  });

  await check('no browser errors', async () => assert.deepEqual(errors, []));
  console.log(`PIPELINE UI CHECKS PASSED: ${passed}`);
} finally {
  await browser.close();
  await s.stop();
}
