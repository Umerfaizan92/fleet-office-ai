// Phase 03 public website in a real browser: every demo, form and menu does what its label says.
// Run with: npm run test:site-ui
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { startServer } from './test-server.mjs';

const s = await startServer();
const browser = await chromium.launch();
const errors = [];
let passed = 0;
const check = async (name, fn) => { await fn(); passed += 1; console.log('PASS', name); };

async function open(route, { width = 1440, height = 900, reducedMotion = 'reduce' } = {}) {
  const ctx = await browser.newContext({ viewport: { width, height }, reducedMotion });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`${route}: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(`${route}: ${m.text()}`); });
  await page.goto(s.base + route, { waitUntil: 'networkidle' });
  return { page, ctx };
}

try {
  await check('AI demo answers a typed question and returns to Ready', async () => {
    const { page, ctx } = await open('/');
    await page.fill('#ai-q', 'How do approvals work?');
    await page.click('[data-ai-form] button[type="submit"]');
    await page.waitForFunction(() => document.querySelector('[data-ai-state]')?.textContent === 'Ready' && document.querySelectorAll('[data-ai-log] > *').length >= 2, null, { timeout: 15000 });
    const last = await page.locator('[data-ai-log] > *').last().innerText();
    assert.ok(last.trim().length > 20, 'answer is empty');
    await ctx.close();
  });

  await check('suggested prompts in the AI demo ask that question', async () => {
    const { page, ctx } = await open('/');
    const before = await page.locator('[data-ai-log] > *').count();
    await page.locator('[data-ai-prompts] button').first().click();
    await page.waitForFunction((n) => document.querySelectorAll('[data-ai-log] > *').length >= n + 2, before, { timeout: 15000 });
    await ctx.close();
  });

  await check('approval-gate demo stops at the gate and finishes only after Approve', async () => {
    const { page, ctx } = await open('/');
    const panel = page.locator('[data-flow-panel]:not([hidden])').first();
    await panel.scrollIntoViewIfNeeded();
    await page.waitForFunction(() => { const p = document.querySelector('[data-flow-panel]:not([hidden])'); return p && /approval/i.test(p.querySelector('[data-flow-status]').textContent); }, null, { timeout: 10000 });
    assert.match(await panel.locator('[data-flow-status]').innerText(), /approval/i);
    await panel.locator('[data-flow-approve]').click();
    assert.ok(await panel.locator('[data-flow-approve]').isDisabled());
    const waiting = await panel.locator('[data-waiting]').count();
    assert.equal(waiting, 0);
    await ctx.close();
  });

  await check('approval-gate tabs switch panels by click and arrow keys', async () => {
    const { page, ctx } = await open('/');
    await page.click('#flow-tab-quote');
    assert.equal(await page.getAttribute('#flow-tab-quote', 'aria-selected'), 'true');
    assert.ok(await page.locator('#flow-panel-quote').isVisible());
    await page.keyboard.press('ArrowRight');
    assert.equal(await page.getAttribute('#flow-tab-finished', 'aria-selected'), 'true');
    await ctx.close();
  });

  await check('newsletter rejects a bad address and accepts a good one', async () => {
    const { page, ctx } = await open('/');
    const form = page.locator('[data-newsletter]');
    await form.locator('input[type="email"]').fill('not-an-email');
    await form.locator('button[type="submit"]').click();
    assert.ok((await form.locator('[data-status]').innerText()).length > 5, 'no message for a bad address');
    await form.locator('input[type="email"]').fill(`site-test-${Date.now()}@example.test`);
    const res = page.waitForResponse((r) => r.url().endsWith('/api/newsletter/subscribe'));
    await form.locator('button[type="submit"]').click();
    assert.ok((await res).status() < 500);
    await page.waitForFunction(() => document.querySelector('[data-newsletter] [data-status]')?.dataset.tone);
    await ctx.close();
  });

  await check('contact form validates, submits a support case and shows its reference', async () => {
    const { page, ctx } = await open('/contact');
    const form = page.locator('[data-contact]');
    await form.locator('button[type="submit"]').click();
    assert.ok((await form.locator('[data-status]').innerText()).length > 5, 'empty form gave no message');
    await page.fill('#c-name', 'Site Test');
    await page.fill('#c-email', 'site-test@example.test');
    await page.fill('#c-msg', 'Testing the website contact form end to end.');
    const res = page.waitForResponse((r) => r.url().endsWith('/api/support/cases'));
    await form.locator('button[type="submit"]').click();
    const r = await res;
    assert.ok(r.status() < 300, `support case returned ${r.status()}`);
    await page.waitForFunction(() => document.querySelector('[data-contact] [data-status]')?.dataset.tone === 'good', null, { timeout: 8000 });
    assert.match(await form.locator('[data-status]').innerText(), /[A-Z0-9]{4,}/, 'no reference shown');
    await ctx.close();
  });

  await check('receptionist call plays, pauses and shows the full transcript', async () => {
    const { page, ctx } = await open('/receptionist');
    const play = page.locator('[data-call-play]');
    await play.click();
    assert.equal(await play.getAttribute('aria-pressed'), 'true');
    await play.click();
    assert.equal(await play.getAttribute('aria-pressed'), 'false');
    await page.click('[data-call-all]');
    assert.equal(await page.locator('[data-line][hidden]').count(), 0);
    await ctx.close();
  });

  await check('help search filters articles and reports when nothing matches', async () => {
    const { page, ctx } = await open('/help');
    const total = await page.locator('.sp-help .sp-faq:visible').count();
    await page.fill('#help-q', 'GST');
    const some = await page.locator('.sp-help .sp-faq:visible').count();
    assert.ok(some > 0 && some < total, `GST filter showed ${some} of ${total}`);
    await page.fill('#help-q', 'zzqqxx');
    assert.equal(await page.locator('.sp-help .sp-faq:visible').count(), 0);
    assert.ok(await page.locator('[data-help-empty]').isVisible());
    await ctx.close();
  });

  await check('phone menu opens, links work and Escape closes it', async () => {
    const { page, ctx } = await open('/', { width: 390, height: 844 });
    const toggle = page.locator('[data-nav-toggle]');
    assert.ok(await toggle.isVisible());
    await toggle.click();
    assert.equal(await toggle.getAttribute('aria-expanded'), 'true');
    assert.ok(await page.locator('#sp-nav-links a[href="/pricing"]').isVisible());
    await page.keyboard.press('Escape');
    assert.equal(await toggle.getAttribute('aria-expanded'), 'false');
    await toggle.click();
    await Promise.all([page.waitForURL('**/pricing'), page.locator('#sp-nav-links a[href="/pricing"]').click()]);
    await ctx.close();
  });

  await check('desktop hides the menu button and shows the links', async () => {
    const { page, ctx } = await open('/pricing');
    assert.ok(!(await page.locator('[data-nav-toggle]').isVisible()));
    assert.ok(await page.locator('#sp-nav-links a[href="/features"]').isVisible());
    await ctx.close();
  });

  await check('pricing buttons start the trial on the sign-up page with the plan', async () => {
    const { page, ctx } = await open('/pricing');
    for (const plan of ['starter', 'operations', 'scale']) assert.equal(await page.locator(`a[href="/saas/create-account.html?plan=${plan}"]`).count(), 1, plan);
    await Promise.all([page.waitForURL('**/saas/create-account.html?plan=operations'), page.locator('a[href$="plan=operations"]').click()]);
    assert.ok(await page.locator('form').first().isVisible(), 'sign-up form not shown');
    await page.goto(s.base + '/pricing');
    await Promise.all([page.waitForURL('**/saas/create-account.html'), page.locator('main a[href="/start"]').first().click()]);
    await ctx.close();
  });

  await check('no testimonials are shown while none are approved', async () => {
    const { page, ctx } = await open('/stories');
    await page.waitForTimeout(300);
    const t = page.locator('[data-testimonials]');
    if (await t.count()) assert.equal(await t.locator('blockquote').count(), 0);
    await ctx.close();
  });

  await check('reduced motion shows the still hero picture and never loads WebGL', async () => {
    const { page, ctx } = await open('/');
    const loaded = await page.evaluate(() => performance.getEntriesByType('resource').some((e) => e.name.includes('hero-3d.js')));
    assert.equal(loaded, false);
    assert.equal(await page.locator('[data-hero3d] canvas').count(), 0);
    await ctx.close();
  });

  await check('phone uses the still hero even when motion is allowed', async () => {
    const { page, ctx } = await open('/', { width: 390, height: 844, reducedMotion: 'no-preference' });
    await page.waitForTimeout(2800);
    assert.equal(await page.evaluate(() => performance.getEntriesByType('resource').some((e) => e.name.includes('hero-3d.js'))), false);
    assert.equal(await page.locator('[data-hero3d] canvas').count(), 0);
    await ctx.close();
  });

  await check('with motion allowed, content reveals and nothing stays hidden after scrolling', async () => {
    const { page, ctx } = await open('/', { reducedMotion: 'no-preference' });
    await page.evaluate(async () => { for (let y = 0; y < document.body.scrollHeight; y += 500) { scrollTo(0, y); await new Promise((r) => setTimeout(r, 60)); } });
    await page.waitForTimeout(900);
    const hidden = await page.evaluate(() => [...document.querySelectorAll('[data-reveal]')].filter((e) => !e.classList.contains('is-in')).length);
    assert.equal(hidden, 0);
    await ctx.close();
  });

  await check('no browser errors on any public page', async () => {
    for (const route of ['/features', '/features/money', '/for', '/for/trades', '/stories']) { const { ctx } = await open(route); await ctx.close(); }
    assert.deepEqual(errors, []);
  });
  console.log(`SITE UI CHECKS PASSED: ${passed}`);
} finally {
  await browser.close();
  await s.stop();
}
