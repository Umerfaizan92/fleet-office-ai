// Phase 04 Founder Console tabs in a real browser: each renders from the server, with no browser errors,
// no failing platform calls and no sideways scrolling on laptop or phone.
//   npm run test:console-ui
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { startServer } from './test-server.mjs';
import { seedOwner } from './visual/session.mjs';

const TABS = [['f06/platform/seo', 'Scheduled SEO jobs'], ['f07/platform/automation', 'Emergency pause'], ['f01/platform/revenue', 'Monthly recurring revenue'], ['f01/system', 'Background jobs'], ['f01/platform/backups', 'Database backups'], ['f01/platform/ai-usage', 'AI requests, 30 days'], ['f08/platform/compliance', 'Privacy requests'], ['f09/platform/configuration', 'Feature access']];
const s = await startServer();
const browser = await chromium.launch();
let passed = 0;
try {
  await seedOwner(s);
  for (const [width, height] of [[1440, 900], [390, 844]]) {
    const ctx = await browser.newContext({ viewport: { width, height }, reducedMotion: 'reduce' });
    const p = await ctx.newPage();
    const errors = [];
    p.on('pageerror', (e) => errors.push(e.message));
    p.on('response', (r) => { if (/\/api\/operator\//.test(r.url()) && r.status() >= 400) errors.push(`${r.status()} ${r.url()}`); });
    await p.goto(s.base + '/saas/operator-sign-in.html');
    await p.locator('#operator-form input[name=key]').fill(s.adminKey);
    await Promise.all([p.waitForURL(s.base + '/office/'), p.locator('#operator-form button[type=submit]').click()]);
    for (const [hash, text] of TABS) {
      await p.evaluate((h) => { location.hash = h; }, hash);
      await p.locator('.cp-view').waitFor({ timeout: 8000 });
      assert.ok((await p.locator('#console-content').innerText()).includes(text), `${hash} shows ${text}`);
      assert.ok(!(await p.locator('#console-content').innerText()).includes('[object Object]'), `${hash} prints raw data`);
      const over = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      assert.ok(over <= 1, `${hash} scrolls sideways at ${width}px`);
      passed += 1;
    }
    assert.deepEqual(errors, [], `errors at ${width}px`);
    console.log(`PASS founder platform tabs at ${width}px`);
    await ctx.close();
  }
  console.log(`CONSOLE PLATFORM CHECKS PASSED: ${passed}`);
} finally {
  await browser.close();
  await s.stop();
}
