// Phase 07 in a real browser: Unified Inbox (folders, AI summary, CRM link, AI reply with approval, send, archive),
// Campaign Studio (draft, audience preview, submit for approval), Consent & Unsubscribes, Call Handling, the website
// builder contact-form option and the Founder Console newsletter tab, with accessibility checks and phone and iPad fit.
// Telnyx and Resend are replaced by a local stand-in because the real providers cannot be reached from the test machine.
//   npm run test:comms-ui
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import crypto from 'node:crypto';
import Database from 'better-sqlite3';
import { chromium } from 'playwright';
import { startServer } from './test-server.mjs';
import { seedOwner, ownerContext } from './visual/session.mjs';

const sent = [];
const mock = http.createServer((req, res) => { let b = ''; req.on('data', (c) => { b += c; }); req.on('end', () => { sent.push({ path: req.url, body: b }); res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify(req.url.startsWith('/resend') ? { id: 'em-' + crypto.randomUUID() } : { data: { id: 'x-' + crypto.randomUUID() } })); }); });
await new Promise((r) => mock.listen(0, '127.0.0.1', r));
const mbase = `http://127.0.0.1:${mock.address().port}`;
const { privateKey, publicKey } = crypto.generateKeyPairSync('ed25519');
const s = await startServer({ TELNYX_API_BASE_URL: mbase + '/telnyx', RESEND_API_BASE_URL: mbase + '/resend', TELNYX_API_KEY: 'test-telnyx-key', TELNYX_PUBLIC_KEY: publicKey.export({ format: 'der', type: 'spki' }).subarray(-32).toString('base64'), TELNYX_FROM_NUMBER: '+61400000000', TELNYX_AI_ASSISTANT_ID: 'assistant-test', RESEND_API_KEY: 're_test_key', SAAS_VERIFY_FROM: 'Super Pro <noreply@example.test>', PLATFORM_MAIL_FROM: 'Super Pro <hello@example.test>', SUPERPRO_POSTAL_ADDRESS: 'PO Box 1, Perth WA 6000' });
const browser = await chromium.launch();
const errors = [];
let passed = 0;
const check = async (name, fn) => { await fn(); passed += 1; console.log('PASS', name); };
const shots = process.env.UI_SHOTS;
const AXE = fs.readFileSync(new URL('../node_modules/axe-core/axe.min.js', import.meta.url), 'utf8');
const axe = (page, sel) => page.evaluate(async ([src, sc]) => { if (!window.axe) (0, eval)(src); const r = await window.axe.run(document.querySelector(sc), { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] }, resultTypes: ['violations'] }); return r.violations.filter((x) => ['serious', 'critical'].includes(x.impact)).map((x) => `${x.id}: ${x.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(', ')}`); }, [AXE, sel]);

try {
  const owner = await seedOwner(s, { business: 'Harbour Plumbing Pty Ltd' });
  const O = (m, u, b) => s.call(m, u, { cookie: owner.cookie, body: b });
  const db = new Database(s.dbPath), now = new Date().toISOString();
  db.prepare("UPDATE organisations SET abn='51824753556', address_formatted='1 Beach Rd, Fremantle WA 6160' WHERE id=?").run(owner.org);
  db.prepare("INSERT INTO comms_channels(organisation_id,channel,address,status,activated_at,created_at) VALUES (?,'sms','+61400000000','active',?,?)").run(owner.org, now, now);
  db.prepare("INSERT INTO tenant_customers(id,organisation_id,name,phone,status,source,created_at,updated_at) VALUES (?,?,?,?,'current','manual',?,?)").run(crypto.randomUUID(), owner.org, 'Riley Quinn', '0412 345 678', now, now);
  db.close();
  const body = JSON.stringify({ data: { id: crypto.randomUUID(), event_type: 'message.received', payload: { from: { phone_number: '+61412345678' }, to: [{ phone_number: '+61400000000' }], text: 'The hot water you fixed is leaking again and I smell gas. Not happy, please call today.', id: 'in-1' } } }), ts = String(Math.floor(Date.now() / 1000));
  const hr = await fetch(s.base + '/api/webhooks/telnyx', { method: 'POST', headers: { 'content-type': 'application/json', 'telnyx-signature-ed25519': crypto.sign(null, Buffer.from(`${ts}|${body}`), privateKey).toString('base64'), 'telnyx-timestamp': ts }, body });
  assert.equal(hr.status, 200, await hr.text());
  const fr = await fetch(`${s.base}/api/public/contact/${owner.slug}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'Sam Lee', email: 'sam@lee.example.test', message: 'Can you quote for a new hot water system in Cottesloe next week?', marketing_consent: true }) });
  assert.equal(fr.status, 201, await fr.text());

  const ctx = await ownerContext(browser, s, owner, { viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('dialog', (d) => { errors.push('unexpected dialog: ' + d.message()); d.dismiss(); });
  await page.goto(s.base + '/saas/workspace.html');
  await page.locator('#workspace').waitFor({ state: 'visible' });
  await page.evaluate(() => document.querySelectorAll('dialog[open]').forEach((d) => d.close()));
  const go = async (hash, id) => { await page.evaluate((h) => { location.hash = h; }, hash); const v = page.locator(`#${id}-view`); await v.waitFor({ state: 'visible' }); await v.locator('[data-cx-body]').waitFor(); await page.waitForFunction((i) => { const b = document.querySelector(`#${i}-view [data-cx-body]`); return b && !b.querySelector(':scope > .pl-meta'); }, id); return v; };
  const statusIs = (id, re) => page.waitForFunction(([i, src]) => new RegExp(src).test(document.querySelector(`#${i}-view [data-cx-status]`)?.textContent || ''), [id, re.source]);

  await check('Unified Inbox lists SMS and website messages, flags the escalation and summarises the conversation', async () => {
    const v = await go('b04/unified', 'unifiedinbox');
    await v.locator('.cx-item').first().waitFor();
    assert.equal(await v.locator('.cx-item').count(), 2);
    assert.match(await v.locator('.cx-suggest').textContent(), /Escalation/);
    assert.match(await v.textContent(), /Urgent/);
    assert.deepEqual(await axe(page, '#unifiedinbox-view'), [], 'inbox list is accessible');
    await v.locator('.cx-item', { hasText: 'Riley Quinn' }).first().click().catch(async () => { await v.locator('.cx-item', { hasText: '+61412345678' }).first().click(); });
    const d = v.locator('.cx-detail'); await d.locator('.cx-msgs').waitFor();
    assert.match(await d.textContent(), /Possible safety issue/);
    assert.match(await d.textContent(), /Complaint/i);
    if (shots) await page.screenshot({ path: shots + '/inbox.png', fullPage: true });
  });

  await check('Inbox links the conversation to the matching customer and drafts an AI reply that waits for approval', async () => {
    const v = page.locator('#unifiedinbox-view'), d = v.locator('.cx-detail');
    const linkBtn = d.getByRole('button', { name: 'Link to Riley Quinn' });
    if (await linkBtn.count()) { await linkBtn.click(); await statusIs('unifiedinbox', /Linked to Riley Quinn/); }
    await d.getByText(/Linked to Riley Quinn/).waitFor();
    await d.getByLabel('Draft with AI from your business details').check();
    await d.getByRole('button', { name: 'Draft reply for approval' }).click();
    await statusIs('unifiedinbox', /waiting for approval/);
    await d.getByText('Waiting for approval').first().waitFor();
    assert.equal(sent.filter((x) => x.path === '/telnyx/messages').length, 0, 'nothing is sent before approval');
    assert.deepEqual(await axe(page, '#unifiedinbox-view'), [], 'conversation view is accessible');
  });

  await check('After approval the reply is sent from the inbox and the conversation can be archived', async () => {
    const ap = (await O('GET', '/api/saas/approvals')).json.approvals.find((a) => a.source_module === 'comms' && /^Reply to/.test(a.title));
    assert.ok(ap, 'an approval request exists');
    const r = await O('POST', `/api/saas/approvals/${ap.id}/decision`, { decision: 'approve' }); assert.equal(r.status, 200, r.text);
    const v = page.locator('#unifiedinbox-view');
    await v.getByRole('button', { name: 'Refresh' }).click();
    const d = v.locator('.cx-detail');
    await d.getByRole('button', { name: 'Send', exact: true }).click();
    await statusIs('unifiedinbox', /^Sent\.$/);
    await page.waitForTimeout(300); assert.equal(sent.filter((x) => x.path === '/telnyx/messages').length, 1, 'one SMS went to the provider: ' + JSON.stringify(sent.map((x) => x.path)));
    await d.getByRole('button', { name: 'Archive' }).click();
    await statusIs('unifiedinbox', /Archived/);
    await v.getByRole('tab', { name: /Archived/ }).click();
    await page.waitForFunction(() => document.querySelector('#unifiedinbox-view .cx-folders [aria-selected=true]')?.textContent.startsWith('Archived'));
    await v.locator('.cx-item').first().waitFor();
    await v.getByRole('tab', { name: /^Sent/ }).click();
    await page.waitForFunction(() => document.querySelector('#unifiedinbox-view .cx-folders [aria-selected=true]')?.textContent.startsWith('Sent'));
    await v.locator('.cx-item').first().waitFor();
  });

  await check('Consent & Unsubscribes records consent and suppressions and lists the website opt-in', async () => {
    const v = await go('b05/consent', 'consent');
    assert.match(await v.textContent(), /sam@lee\.example\.test/);
    const f1 = v.locator('form').nth(0);
    await f1.getByLabel('Email or mobile').fill('alex@example.test'); await f1.getByLabel('How you know').fill('Signed the paper booking form on 2 October');
    await f1.getByRole('button', { name: 'Record consent' }).click(); await statusIs('consent', /Consent recorded/);
    await v.getByText('alex@example.test').first().waitFor();
    const g = v.locator('form').nth(1);
    await g.getByLabel('Email or mobile').fill('alex@example.test'); await g.getByLabel('Reason').fill('Asked by phone not to be contacted');
    await g.getByRole('button', { name: 'Add to do-not-contact list' }).click(); await statusIs('consent', /do-not-contact/);
    assert.deepEqual(await axe(page, '#consent-view'), [], 'consent view is accessible');
  });

  await check('Campaign Studio: draft, consent-only audience preview, compliance checks and submit for approval', async () => {
    const v = await go('b05/campaign-studio', 'campaignstudio');
    const f = v.locator('form').first();
    await f.getByLabel('Campaign name').fill('Spring hot water check');
    await f.getByLabel('Subject').fill('Is your hot water ready for spring?');
    await f.getByLabel('Message').fill('Hi {first_name}, book a hot water check this month and we will test the valve and anode.');
    await f.getByLabel('Link (optional)').fill('https://harbour.example.test/book');
    await f.getByRole('button', { name: 'Preview audience' }).click();
    await v.getByText(/1 of \d+ would receive it/).waitFor();
    { const t = await v.locator('form').first().locator('.sx-source').last().textContent(); assert.match(t, /without consent/, t); }
    await f.getByRole('button', { name: 'Save draft' }).click(); await statusIs('campaignstudio', /Draft saved/);
    await v.getByRole('button', { name: 'Open' }).first().click();
    const box = v.locator('.cx-opened'); await box.waitFor();
    assert.match(await box.textContent(), /All checks pass/);
    assert.deepEqual(await axe(page, '#campaignstudio-view'), [], 'campaign view is accessible');
    if (shots) await page.screenshot({ path: shots + '/campaign.png', fullPage: true });
    await box.getByRole('button', { name: 'Submit for approval' }).click();
    await statusIs('campaignstudio', /Sent for approval/);
    await v.getByText('Waiting for approval').first().waitFor();
    assert.equal(sent.filter((x) => x.path === '/resend/emails').length, 0, 'no campaign email before approval');
  });

  await check('Call Handling saves the mode and transfer number and shows the number masked', async () => {
    const v = await go('b04/voice', 'voiceflow');
    await v.getByLabel('When a call comes in').selectOption('assistant');
    await v.getByLabel('Transfer number').fill('0400 999 888');
    await v.getByLabel(/Tell callers the call is transcribed/).check();
    await v.getByRole('button', { name: 'Save call handling' }).click();
    await statusIs('voiceflow', /Call handling saved/);
    await page.waitForFunction(() => /••• 888/.test(document.querySelector('#voiceflow-view input[type=tel]')?.placeholder || ''));
    assert.deepEqual(await axe(page, '#voiceflow-view'), [], 'call handling is accessible');
  });

  await check('Website Builder contact section offers the contact form option', async () => {
    const site = await O('POST', '/api/saas/seo/sites', { name: 'Harbour', slug: 'harbour-cx' }); assert.equal(site.status, 201, site.text);
    const pg = await O('POST', `/api/saas/seo/sites/${site.json.site.id}/pages`, { title: 'Contact us', slug: 'contact', template: 'contact' }); assert.equal(pg.status, 201, pg.text);
    await page.evaluate(() => { location.hash = 'b06/builder'; });
    const v = page.locator('#seobuilder-view'); await v.waitFor({ state: 'visible' });
    await v.getByRole('button', { name: /Edit|Open/ }).first().click();
    await v.getByLabel(/Show a contact form/).waitFor();
  });

  for (const [w, h, label] of [[390, 844, 'phone'], [820, 1180, 'iPad']]) {
    await check(`Communication views fit a ${label} without sideways scrolling`, async () => {
      await page.setViewportSize({ width: w, height: h });
      for (const [hash, id] of [['b04/unified', 'unifiedinbox'], ['b04/voice', 'voiceflow'], ['b05/campaign-studio', 'campaignstudio'], ['b05/consent', 'consent']]) {
        await go(hash, id); await page.waitForTimeout(250);
        const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
        assert.ok(over <= 1, `${hash} overflows by ${over}px on ${label}`);
      }
      if (shots) await page.screenshot({ path: `${shots}/comms-${label}.png`, fullPage: true });
    });
  }

  await check('Founder Console: newsletter campaigns are email only, go to platform subscribers and show counts only', async () => {
    const fctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
    const p = await fctx.newPage(); p.on('pageerror', (e) => errors.push('console: ' + e.message));
    await p.goto(s.base + '/saas/operator-sign-in.html');
    await p.locator('#operator-form input[name=key]').fill(s.adminKey);
    await Promise.all([p.waitForURL(s.base + '/office/'), p.locator('#operator-form button[type=submit]').click()]);
    await p.evaluate(() => { location.hash = 'f06/platform/campaigns'; });
    const v = p.locator('#console-content');
    await v.getByText('Communications overview').waitFor();
    assert.match(await v.textContent(), /not shown here/);
    assert.doesNotMatch(await v.textContent(), /Riley|sam@lee/, 'no business customer data in the founder view');
    await v.getByLabel('Campaign name').fill('Super Pro product update');
    await v.getByLabel('Subject').fill('What is new in Super Pro this month');
    await v.getByLabel('Message').fill('Hi {first_name}, here is what changed in Super Pro this month.');
    await v.getByRole('button', { name: 'Save draft' }).click();
    await v.getByText('Draft saved.').waitFor();
    assert.equal(await v.getByLabel('Channel').count(), 0, 'no channel choice for the platform');
    if (shots) await p.screenshot({ path: shots + '/founder-campaigns.png', fullPage: true });
    await fctx.close();
  });
  assert.deepEqual(errors, [], 'no page errors');
  console.log(`\n${passed} checks passed`);
} catch (e) {
  console.error('FAIL', e.message); if (errors.length) console.error('page errors:', errors); process.exitCode = 1;
} finally { await browser.close(); await s.stop(); mock.close(); }
