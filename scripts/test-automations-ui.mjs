// Phase 05 AI Automations in a real browser: build an automation step by step, dry-run it, switch it on, watch it run,
// decide an approval with the new queue actions (clarify, edit, schedule, approve), set a rule, pause and resume,
// read the audit report, and check every view fits a phone.
//   npm run test:automations-ui
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { chromium } from 'playwright';
import { startServer } from './test-server.mjs';
import { seedOwner, ownerContext } from './visual/session.mjs';

const s = await startServer();
const browser = await chromium.launch();
const errors = [];
let passed = 0;
const check = async (name, fn) => { await fn(); passed += 1; console.log('PASS', name); };
const shots = process.env.UI_SHOTS;

try {
  const owner = await seedOwner(s, { business: 'Automation Plumbing Pty Ltd' });
  const O = (m, u, b) => s.call(m, u, { cookie: owner.cookie, body: b });
  const ctx = await ownerContext(browser, s, owner, { viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('dialog', (d) => { if (/decision note/i.test(d.message())) return d.accept(''); errors.push('unexpected browser dialog: ' + d.message()); d.dismiss(); });
  await page.goto(s.base + '/saas/workspace.html');
  await page.locator('#workspace').waitFor({ state: 'visible' });
  await page.evaluate(() => document.querySelectorAll('dialog[open]').forEach((d) => d.close()));
  const view = page.locator('#automations-view');
  const status = view.locator('[data-au-status]');
  const tab = async (name) => { await view.getByRole('tab', { name }).click(); };

  await check('AI Automations opens from the Today menu', async () => {
    await page.evaluate(() => { location.hash = 'b01/automations'; });
    await view.waitFor({ state: 'visible' });
    await view.getByRole('button', { name: 'New automation' }).waitFor();
    assert.match(await view.textContent(), /No automations yet/);
    assert.match(await view.textContent(), /No AI provider is connected/, 'honest about AI');
  });

  await check('build an automation through the seven steps and dry-run it', async () => {
    await O('POST', '/api/saas/pipeline/enquiries', { title: 'Burst pipe', details: 'Urgent leak in the laundry', customer: { name: 'Riley Quinn', email: 'riley@quinn.example.test' } });
    await view.getByRole('button', { name: 'New automation' }).click();
    const f = view.locator('.au-builder');
    assert.equal(await f.locator('.au-step').count(), 7);
    assert.deepEqual(await f.locator('.au-step h3').allTextContents(), ['Proposed action', 'Trigger', 'Conditions', 'Analysis', 'Approval', 'Execution', 'Verification']);
    await f.locator('[name=name]').fill('Quote drafts for urgent work');
    await f.locator('[name=action]').selectOption('draft_quote');
    assert.equal(await f.locator('[name=trigger]').inputValue(), 'enquiry.created');
    await f.locator('[data-price=urgent_repair]').fill('180');
    await f.getByRole('button', { name: 'Add a condition' }).click();
    await f.locator('.au-cond select').first().selectOption('enquiry.urgency');
    await f.locator('.au-cond input').fill('high'); await f.locator('.au-cond input').blur();
    assert.match(await f.locator('.au-levelbox').textContent(), /Level 1 · Automatic/);
    await f.getByRole('button', { name: 'Test with a dry run' }).click();
    await f.locator('[data-result] .au-run').waitFor();
    assert.match(await f.locator('[data-result]').textContent(), /\$180/);
    assert.match(await f.locator('[data-result]').textContent(), /Dry run/);
    if (shots) await page.screenshot({ path: shots + '/builder.png', fullPage: true });
    await f.getByRole('button', { name: 'Save automation' }).click();
    await view.locator('[data-workflow]', { hasText: 'Quote drafts for urgent work' }).waitFor();
    assert.match(await status.textContent(), /Automation saved/);
  });

  await check('switch it on; a new enquiry is handled and appears in Activity', async () => {
    const card = view.locator('[data-workflow]', { hasText: 'Quote drafts' });
    await card.getByRole('button', { name: 'Turn on' }).click();
    await view.locator('[data-workflow]', { hasText: 'Quote drafts' }).getByRole('button', { name: 'Turn off' }).waitFor();
    await O('POST', '/api/saas/pipeline/enquiries', { title: 'Flooded bathroom', details: 'Urgent, water everywhere', customer: { name: 'Sam Lee', email: 'sam@lee.example.test' } });
    await page.waitForTimeout(600);
    await tab('Activity');
    const run = view.locator('.au-runcard').first();
    await run.waitFor();
    assert.match(await run.textContent(), /Done/);
    assert.match(await run.textContent(), /Quote draft waiting for your review/);
    await run.getByRole('button', { name: 'Audit trail' }).click();
    assert.match(await run.locator('.au-trail').textContent(), /run received.*run queued.*run completed/s);
  });

  await check('a Level 2 action waits in Approvals; clarify, edit, schedule and approve there', async () => {
    const r = await O('POST', '/api/saas/automation/workflows', { name: 'Acknowledge', definition: { trigger: 'enquiry.created', action: 'send_acknowledgement' } });
    await O('POST', `/api/saas/automation/workflows/${r.json.workflow.id}/status`, { status: 'active' });
    await O('POST', '/api/saas/pipeline/enquiries', { title: 'Gutters', details: 'Please clean the gutters', customer: { name: 'Ana Ruiz', email: 'ana@ruiz.example.test' } });
    await page.waitForTimeout(500);
    await page.evaluate(() => { location.hash = 'b01/approvals'; });
    const card = page.locator('#approvals-view .approval-card', { hasText: 'Acknowledge Ana Ruiz' });
    await card.waitFor();
    for (const t of ['Requested by', 'AI automation', 'Data involved', 'Expected outcome', 'Estimated cost', 'Expires', 'Level 3']) assert.match(await card.textContent(), new RegExp(t), t);
    if (shots) await page.screenshot({ path: shots + '/approval.png', fullPage: true });
    await card.getByRole('button', { name: 'Request clarification' }).click();
    await card.locator('.approval-inline textarea').fill('Should we mention the weekend rate?');
    await card.locator('.approval-inline').getByRole('button', { name: 'Save' }).click();
    const card2 = page.locator('#approvals-view .approval-card', { hasText: 'Acknowledge Ana Ruiz' });
    await card2.getByRole('button', { name: 'Answer the question' }).click();
    await card2.locator('.approval-inline textarea').fill('No, keep it simple.');
    await card2.locator('.approval-inline').getByRole('button', { name: 'Save' }).click();
    const card3 = page.locator('#approvals-view .approval-card', { hasText: 'Acknowledge Ana Ruiz' });
    await card3.getByText('No, keep it simple.').waitFor();
    await card3.getByRole('button', { name: 'Edit' }).click();
    await card3.locator('.approval-inline [name=subject]').fill('Thanks, Ana: we have your enquiry');
    await card3.locator('.approval-inline').getByRole('button', { name: 'Save' }).click();
    const card4 = page.locator('#approvals-view .approval-card', { hasText: 'Acknowledge Ana Ruiz' });
    await card4.getByText('Edited before approval').waitFor();
    await card4.getByRole('button', { name: 'Approve' }).click();
    await page.locator('#approvals-view .approval-card', { hasText: 'Acknowledge Ana Ruiz' }).waitFor({ state: 'detached' });
    const runs = (await O('GET', '/api/saas/automation/runs?status=completed_warning')).json.runs;
    assert.equal(runs[0]?.proposal?.subject, 'Thanks, Ana: we have your enquiry');
  });

  await check('rules and the emergency pause', async () => {
    await page.evaluate(() => { location.hash = 'b01/automations'; });
    await tab('Rules & safety');
    const rule = view.locator('[data-rule=routine_acknowledgements]');
    await rule.getByRole('button', { name: 'Allow without asking' }).click();
    await view.locator('[data-rule=routine_acknowledgements]', { hasText: 'Runs without asking' }).waitFor();
    await view.locator('.au-stop input').fill('Checking messages');
    await view.getByRole('button', { name: 'Pause all automations' }).click();
    await view.locator('.au-paused').waitFor();
    assert.match(await view.locator('.au-paused').textContent(), /Checking messages/);
    if (shots) await page.screenshot({ path: shots + '/rules.png', fullPage: true });
    await view.getByRole('button', { name: 'Resume automations' }).click();
    await view.locator('.au-paused').waitFor({ state: 'detached' });
    assert.match(await status.textContent(), /resumed/);
  });

  await check('audit report and suggestions render', async () => {
    await tab('Audit report');
    await view.locator('.au-table').waitFor();
    assert.match(await view.locator('.au-log').textContent(), /paused/);
    await tab('Suggestions & reports');
    await view.locator('.pl-grid').waitFor();
  });

  await check('a refused action shows the server error, not success', async () => {
    await tab('Automations');
    await view.getByRole('button', { name: 'New automation' }).click();
    const f = view.locator('.au-builder');
    await f.locator('[name=name]').fill('Price change');
    await f.locator('[name=action]').selectOption('change_job_price');
    await f.getByRole('button', { name: 'Save automation' }).click();
    await page.waitForFunction(() => document.querySelector('#automations-view [data-au-status]')?.dataset.tone === 'bad');
    assert.match(await status.textContent(), /Settings/);
  });

  await check('no serious or critical accessibility problems in the new views (axe, WCAG 2.2 AA)', async () => {
    const AXE = fs.readFileSync(new URL('../node_modules/axe-core/axe.min.js', import.meta.url), 'utf8');
    const bad = [];
    for (const [hash, t] of [['b01/automations', 'Automations'], ['b01/automations', 'Rules & safety'], ['b01/automations', 'Activity'], ['b01/automations', 'Audit report'], ['b01/approvals', null]]) {
      await page.evaluate((x) => { location.hash = x; }, hash);
      if (t) { await view.waitFor({ state: 'visible' }); await tab(t); }
      await page.waitForTimeout(400);
      const scope = hash === 'b01/approvals' ? '#approvals-view' : '#automations-view';
      const v = await page.evaluate(async ([src, sc]) => { if (!window.axe) (0, eval)(src); const r = await window.axe.run(document.querySelector(sc), { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] }, resultTypes: ['violations'] }); return r.violations.filter((x) => ['serious', 'critical'].includes(x.impact)).map((x) => `${x.id}: ${x.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(', ')}`); }, [AXE, scope]);
      bad.push(...v.map((x) => `${hash} ${t || ''}: ${x}`));
    }
    assert.deepEqual(bad, []);
  });

  for (const [w, h, label] of [[390, 844, 'phone'], [820, 1180, 'iPad']]) {
    await check(`fits a ${label} without sideways scrolling`, async () => {
      await page.setViewportSize({ width: w, height: h });
      for (const [hash, sel] of [['b01/automations', '#automations-view'], ['b01/approvals', '#approvals-view']]) {
        await page.evaluate((x) => { location.hash = x; }, hash);
        await page.locator(sel).waitFor({ state: 'visible' });
        await page.waitForTimeout(250);
        const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
        assert.ok(over <= 1, `${hash} overflows by ${over}px on ${label}`);
      }
      await page.evaluate(() => { location.hash = 'b01/automations'; });
      await view.getByRole('tab', { name: 'Automations' }).click();
      await view.getByRole('button', { name: 'New automation' }).click();
      const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      assert.ok(over <= 1, `builder overflows by ${over}px on ${label}`);
      if (shots) await page.screenshot({ path: `${shots}/builder-${label}.png`, fullPage: true });
    });
  }
  await check('Founder Console: add, run and pause platform automations; approve a deployment request', async () => {
    const fctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
    const p = await fctx.newPage();
    p.on('pageerror', (e) => errors.push('console: ' + e.message));
    await p.goto(s.base + '/saas/operator-sign-in.html');
    await p.locator('#operator-form input[name=key]').fill(s.adminKey);
    await Promise.all([p.waitForURL(s.base + '/office/'), p.locator('#operator-form button[type=submit]').click()]);
    await p.evaluate(() => { location.hash = 'f07/platform/automation'; });
    const v = p.locator('#console-content');
    await v.getByText('Emergency pause').waitFor();
    await p.getByRole('tab', { name: 'Platform automations', exact: true }).click();
    await v.locator('.cp-new summary').click();
    await v.locator('.cp-new select').selectOption('monitor_health');
    await v.locator('.cp-new input').fill('Hourly health check');
    await v.locator('.cp-new').getByRole('button', { name: 'Save' }).click();
    await v.getByText('Automation saved').waitFor();
    await v.locator('tr', { hasText: 'Hourly health check' }).getByRole('button', { name: 'Run now' }).click();
    await v.locator("[role=status]", { hasText: /Hourly health check: / }).waitFor();
    await v.locator('.cp-new summary').click();
    await v.locator('.cp-new select').selectOption('production_deployment');
    await v.locator('.cp-new textarea').fill('Deploy the Phase 05 branch head after tests pass');
    await v.locator('.cp-new').getByRole('button', { name: 'Save' }).click();
    await v.getByText('Automation saved').waitFor();
    await v.locator('tr', { hasText: 'Deploy to production' }).getByRole('button', { name: 'Run now' }).click();
    const ap = v.locator('.cp-approval', { hasText: 'Deploy to production' });
    await p.getByRole('tab', { name: 'Waiting for your approval', exact: true }).click();
    await ap.waitFor();
    await ap.getByRole('button', { name: 'Approve' }).click();
    await v.getByText('Approved.').waitFor();
    await p.getByRole('tab', { name: 'Recent runs', exact: true }).click();
    for (let i = 0; i < 20 && !(await v.locator('tr', { hasText: 'Approved: a person must finish it' }).count() || await v.getByRole('button', { name: 'Mark done' }).count()); i++) { await p.waitForTimeout(150); await p.reload(); await p.getByRole('tab', { name: 'Recent runs', exact: true }).click(); }
    await v.getByRole('button', { name: 'Mark done' }).click();
    await v.getByText('Marked done.').waitFor();
    await p.getByRole('tab', { name: 'Emergency pause', exact: true }).click();
    await v.getByRole('button', { name: 'Pause all automations' }).click();
    await v.getByText(/All automations on the platform are paused/).waitFor();
    if (shots) await p.screenshot({ path: shots + '/founder.png', fullPage: true });
    await v.getByRole('button', { name: 'Resume all automations' }).click();
    await v.getByText(/Resumed\./).waitFor();
    await fctx.close();
  });
  assert.deepEqual(errors, [], 'no page errors');
  console.log(`\n${passed} checks passed`);
} catch (e) {
  console.error('FAIL', e.message); if (errors.length) console.error('page errors:', errors); process.exitCode = 1;
} finally { await browser.close(); await s.stop(); }
