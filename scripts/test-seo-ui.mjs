// Phase 06 in a real browser: Website & Visibility views for a business owner (command centre, builder with
// publishing approval, audit, clusters, content studio, Google, local SEO, analytics, reports) and the Founder Console
// SEO tab, with accessibility checks and phone and iPad fit.
//   npm run test:seo-ui
import assert from 'node:assert/strict';
import fs from 'node:fs';
import Database from 'better-sqlite3';
import { chromium } from 'playwright';
import { startServer } from './test-server.mjs';
import { seedOwner, ownerContext } from './visual/session.mjs';

const s = await startServer();
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
  await O('PUT', '/api/saas/seo/profile', { business_name: 'Harbour Plumbing', services: ['Blocked drains', 'Hot water repairs'], areas: ['Fremantle', 'Cottesloe'], phone: '0400 111 222', website_url: '' });
  const ctx = await ownerContext(browser, s, owner, { viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('dialog', (d) => { if (/decision note/i.test(d.message())) return d.accept(''); errors.push('unexpected dialog: ' + d.message()); d.dismiss(); });
  await page.goto(s.base + '/saas/workspace.html');
  await page.locator('#workspace').waitFor({ state: 'visible' });
  await page.evaluate(() => document.querySelectorAll('dialog[open]').forEach((d) => d.close()));
  const go = async (hash, id) => { await page.evaluate((h) => { location.hash = h; }, hash); const v = page.locator(`#${id}-view`); await v.waitFor({ state: 'visible' }); await v.locator('[data-sx-body]').waitFor(); await page.waitForFunction((i) => !document.querySelector(`#${i}-view [data-sx-body] > .pl-meta`)?.textContent?.startsWith('Loading'), id); return v; };
  const status = (v) => v.locator('[data-sx-status]');
  const lorem = 'We clear blocked drains and repair hot water systems for homes and small businesses around Fremantle and Cottesloe. You get a written quote before we start and we leave the site tidy. ';

  await check('SEO Command Centre opens from Website & Visibility and turns on the scheduled jobs', async () => {
    const v = await go('b06/seo', 'seocentre');
    assert.match(await v.textContent(), /Technical audit/); assert.match(await v.textContent(), /Not measured/);
    await v.getByRole('button', { name: 'Turn scheduled jobs on' }).click();
    await v.getByRole('button', { name: 'Turn scheduled jobs off' }).waitFor();
    if (shots) await page.screenshot({ path: shots + '/seo-centre.png', fullPage: true });
  });

  await check('Website Builder: create a site and page, edit sections, see the checks, send the first release for approval', async () => {
    const v = await go('b06/builder', 'seobuilder');
    const f = v.locator('form').first();
    await f.getByLabel('Site name').fill('Harbour Plumbing'); await f.getByLabel('Site address').fill('harbour-ui');
    await f.getByRole('button', { name: 'Create site' }).click();
    await v.getByText('harbour-ui', { exact: false }).first().waitFor();
    await v.getByLabel('Page title').fill('Plumbers in Fremantle'); await v.getByLabel('Page address').fill('home'); await v.getByLabel('Template').selectOption('service');
    await v.getByRole('button', { name: 'Add page' }).click();
    const ed = v.locator('.sx-editor'); await ed.waitFor();
    assert.match(await ed.locator('.sx-checks').textContent(), /Must fix/);
    const blocks = ed.locator('.sx-editblock');
    await blocks.nth(0).getByLabel('Intro').fill(lorem);
    await blocks.nth(1).getByLabel('Heading').fill('How we work');
    await blocks.nth(1).getByLabel('Text (blank line between paragraphs)').fill(lorem.repeat(3));
    await blocks.nth(4).getByLabel('Questions and answers').fill('Do you give quotes?\nYes, a written quote before any work starts.\n\nWhich areas?\nFremantle and Cottesloe.');
    await ed.getByLabel('Meta description').fill('Blocked drains and hot water repairs in Fremantle and Cottesloe. Written quotes before any work starts.');
    await ed.getByRole('button', { name: 'Save version' }).click();
    await page.waitForFunction(() => /Saved as a new version/.test(document.querySelector('#seobuilder-view [data-sx-status]')?.textContent || ''));
    await v.locator('.sx-editor').getByText('Draft version 2').waitFor();
    assert.doesNotMatch(await v.locator('.sx-editor .sx-checks').textContent(), /Must fix/);
    if (shots) await page.screenshot({ path: shots + '/builder-editor.png', fullPage: true });
    await v.locator('.sx-editor').getByRole('button', { name: 'Publish', exact: true }).click();
    await page.waitForFunction(() => /Sent for approval/.test(document.querySelector('#seobuilder-view [data-sx-status]')?.textContent || ''));
    assert.match(await status(v).textContent(), /First time this page goes live/);
    const ap = (await O('GET', '/api/saas/approvals')).json.approvals.find((a) => a.source_module === 'automation' && /Publish/.test(a.title));
    await O('POST', `/api/saas/approvals/${ap.id}/decision`, { decision: 'approve' });
    await page.waitForTimeout(500);
    const live = await ctx.newPage(); await live.goto(s.base + '/sites/harbour-ui/');
    assert.equal(await live.locator('h1').textContent(), 'Plumbers in Fremantle');
    assert.equal(await live.locator('details').count(), 2);
    if (shots) await live.screenshot({ path: shots + '/published-site.png', fullPage: true });
    const liveAxe = await axe(live, 'body'); assert.deepEqual(liveAxe, [], 'the published page is accessible');
    await live.setViewportSize({ width: 390, height: 844 }); assert.ok(await live.evaluate(() => document.documentElement.scrollWidth - innerWidth) <= 1, 'published page fits a phone');
    await live.close();
  });

  await check('Technical Audit of the built site shows all 19 areas and the findings', async () => {
    const v = await go('b06/audit', 'seoaudit');
    await v.getByLabel('Website address').fill(s.base + '/sites/harbour-ui/');
    await v.getByRole('button', { name: 'Run audit' }).click();
    await v.locator('.sx-cat').first().waitFor({ timeout: 30000 });
    assert.equal(await v.locator('.sx-cat').count(), 19);
    assert.match(await v.textContent(), /Core Web Vitals/); assert.match(await v.textContent(), /Not measured/);
    await v.locator('.sx-cat', { hasText: 'Meta titles' }).click();
    if (shots) await page.screenshot({ path: shots + '/audit.png', fullPage: true });
  });

  await check('Keyword Clusters: add keywords with a named source, build, then draft a gap in the Content Studio', async () => {
    const v = await go('b06/keywords', 'seoclusters');
    await v.getByLabel('Your own keywords').fill('how to unblock a drain\nhot water system replacement');
    await v.getByRole('textbox', { name: 'Keyword list (CSV)' }).fill('keyword,volume\nhot water repairs fremantle,210');
    await v.getByLabel('Source', { exact: true }).fill('Google Keyword Planner');
    await v.getByRole('button', { name: 'Add keywords' }).click();
    await page.waitForFunction(() => /1 with a volume/.test(document.querySelector('#seoclusters-view [data-sx-status]')?.textContent || ''));
    await v.getByRole('button', { name: /Build clusters|Rebuild clusters/ }).click();
    await v.getByText('Priorities (Super Pro estimates)').waitFor();
    assert.match(await v.textContent(), /Search volumes appear only/);
    if (shots) await page.screenshot({ path: shots + '/clusters.png', fullPage: true });
    await v.locator('section', { hasText: 'Content gaps' }).getByRole('button', { name: 'Draft it' }).first().click();
    const st = page.locator('#seostudio-view'); await st.waitFor({ state: 'visible' });
    await st.getByRole('button', { name: 'Write draft' }).click();
    await st.locator('.sx-draft').waitFor();
    assert.match(await st.locator('.sx-draft').textContent(), /Template from your facts/);
    assert.match(await st.locator('[data-sx-status]').textContent(), /no AI provider connected/);
    if (shots) await page.screenshot({ path: shots + '/studio.png', fullPage: true });
  });

  await check('Google shows six services, none claimed as connected, and a failed check is shown as a failure', async () => {
    const v = await go('b06/google', 'seogoogle');
    assert.equal(await v.locator('[data-google]').count(), 6);
    assert.equal(await v.getByText('Verified', { exact: true }).count(), 0);
    await v.locator('[data-google=search_console]').getByRole('button', { name: 'Check connection' }).click();
    await page.waitForFunction(() => document.querySelector('#seogoogle-view [data-sx-status]')?.dataset.tone === 'bad');
    assert.match(await status(v).textContent(), /Connect Google/);
  });

  await check('Local SEO: checks, and a review reply goes to approval, not straight to Google', async () => {
    const db = new Database(s.dbPath); db.prepare("INSERT INTO seo_reviews(owner_key,review_id,name,reviewer,rating,comment,created_at,fetched_at) VALUES (?,?,?,?,?,?,?,?)").run(owner.org, 'r9', 'accounts/1/locations/2/reviews/r9', 'Kim Park', 5, 'Great job', '2026-10-01T00:00:00Z', new Date().toISOString()); db.close();
    const v = await go('b06/local', 'seolocal');
    const card = v.locator('[data-review=r9]');
    await card.getByRole('button', { name: 'Draft a reply' }).click();
    await page.waitForFunction(() => /Thanks/.test(document.querySelector('#seolocal-view [data-review=r9] textarea')?.value || ''));
    await card.getByRole('button', { name: 'Send for approval' }).click();
    await page.waitForFunction(() => /Sent for approval/.test(document.querySelector('#seolocal-view [data-sx-status]')?.textContent || ''));
    await v.locator('[data-review=r9]', { hasText: 'Reply waiting for approval' }).waitFor();
  });

  await check('SEO Analytics separates measured figures from estimates; reports can be created and read', async () => {
    const v = await go('b06/analytics', 'seoanalytics');
    await v.getByRole('heading', { name: 'Measured', exact: true }).waitFor();
    await v.getByRole('heading', { name: 'Estimates', exact: true }).waitFor();
    assert.match(await v.textContent(), /Not measured: connect and link Search Console/);
    assert.match(await v.textContent(), /Super Pro records/);
    const r = await go('b06/reports', 'seoreports');
    await r.getByRole('button', { name: 'Create monthly report' }).click();
    await r.locator('.sx-report').waitFor();
    assert.match(await r.locator('.sx-report').textContent(), /cannot guarantee indexing or rankings/);
  });

  await check('no serious or critical accessibility problems in the SEO views (axe, WCAG 2.2 AA)', async () => {
    const bad = [];
    for (const [hash, id] of [['b06/seo', 'seocentre'], ['b06/audit', 'seoaudit'], ['b06/keywords', 'seoclusters'], ['b06/google', 'seogoogle'], ['b06/studio', 'seostudio'], ['b06/builder', 'seobuilder'], ['b06/local', 'seolocal'], ['b06/analytics', 'seoanalytics'], ['b06/reports', 'seoreports']]) {
      await go(hash, id); await page.waitForTimeout(300);
      bad.push(...(await axe(page, `#${id}-view`)).map((x) => `${hash}: ${x}`));
    }
    assert.deepEqual(bad, []);
  });

  for (const [w, h, label] of [[390, 844, 'phone'], [820, 1180, 'iPad']]) {
    await check(`SEO views fit a ${label} without sideways scrolling`, async () => {
      await page.setViewportSize({ width: w, height: h });
      for (const [hash, id] of [['b06/seo', 'seocentre'], ['b06/audit', 'seoaudit'], ['b06/keywords', 'seoclusters'], ['b06/google', 'seogoogle'], ['b06/builder', 'seobuilder'], ['b06/analytics', 'seoanalytics']]) {
        await go(hash, id); await page.waitForTimeout(250);
        const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
        assert.ok(over <= 1, `${hash} overflows by ${over}px on ${label}`);
      }
      if (shots) await page.screenshot({ path: `${shots}/seo-${label}.png`, fullPage: true });
    });
  }

  await check('Founder Console: SEO & website for the Super Pro public site', async () => {
    const fctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
    const p = await fctx.newPage(); p.on('pageerror', (e) => errors.push('console: ' + e.message));
    await p.goto(s.base + '/saas/operator-sign-in.html');
    await p.locator('#operator-form input[name=key]').fill(s.adminKey);
    await Promise.all([p.waitForURL(s.base + '/office/'), p.locator('#operator-form button[type=submit]').click()]);
    await p.evaluate(() => { location.hash = 'f06/platform/seo'; });
    const v = p.locator('#console-content');
    await v.getByRole('button', { name: 'Run technical audit' }).waitFor();
    await v.getByRole('button', { name: 'Run technical audit' }).click();
    await v.locator('.sx-cat').first().waitFor({ timeout: 60000 });
    assert.equal(await v.locator('.sx-cat').count(), 19);
    if (shots) await p.screenshot({ path: shots + '/founder-seo.png', fullPage: true });
    await v.getByRole('tab', { name: 'Google' }).click();
    await v.getByText(/service account/).waitFor();
    await fctx.close();
  });
  assert.deepEqual(errors, [], 'no page errors');
  console.log(`\n${passed} checks passed`);
} catch (e) {
  console.error('FAIL', e.message); if (errors.length) console.error('page errors:', errors); process.exitCode = 1;
} finally { await browser.close(); await s.stop(); }
