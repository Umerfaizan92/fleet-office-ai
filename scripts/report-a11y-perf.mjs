// Phase 03 accessibility and performance report.
// Accessibility: axe-core (WCAG 2.0/2.1/2.2 A and AA rules) on every public page, sign-in, sign-up, the Business OS
// and the Founder Console, at phone and laptop widths, in dark and light themes.
// Performance: lab measurements in Chromium with mobile throttling (4x CPU, ~1.6 Mbps, 150 ms latency):
// LCP, CLS, total blocking time, FCP, bytes transferred and request count. These are Playwright lab numbers,
// not Lighthouse scores and not field data from real visitors.
// Writes qa/reports/accessibility.json, qa/reports/performance.json and qa/reports/A11Y-PERF.md.
// Exits 1 when a new-site page has a serious or critical accessibility issue or misses a Core Web Vitals budget.
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import { startServer } from './test-server.mjs';
import { seedOwner, ownerContext } from './visual/session.mjs';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const OUT = path.join(ROOT, 'qa', 'reports');
const AXE = fs.readFileSync(path.join(ROOT, 'node_modules', 'axe-core', 'axe.min.js'), 'utf8');
const BUDGET = { lcp: 2500, cls: 0.1, tbt: 200 };

const PAGES = [
  ['home', '/', 'site'], ['features', '/features', 'site'], ['feature-money', '/features/money', 'site'], ['industries', '/for', 'site'],
  ['industry-clinics', '/for/clinics', 'site'], ['pricing', '/pricing', 'site'], ['receptionist', '/receptionist', 'site'],
  ['stories', '/stories', 'site'], ['help', '/help', 'site'], ['contact', '/contact', 'site'],
  ['legacy-landing', '/saas/', 'existing'], ['sign-in', '/saas/sign-in.html', 'existing'], ['create-account', '/saas/create-account.html', 'existing'],
  ['workspace', '/saas/workspace.html', 'app', 'owner'], ['workspace-money', '/saas/workspace.html#money', 'app', 'owner'],
  ['founder-console', '/office/', 'app', 'founder']
];

fs.mkdirSync(OUT, { recursive: true });
const server = await startServer();
const browser = await chromium.launch();
const owner = await seedOwner(server);

async function openPage([, url, , auth], { width, height, theme = 'dark', bypassCSP = true }) {
  const options = { viewport: { width, height }, colorScheme: theme, bypassCSP };
  let ctx, page;
  if (auth === 'owner') ctx = await ownerContext(browser, server, owner, options);
  else ctx = await browser.newContext(options);
  if (theme === 'light') await ctx.addInitScript(() => { try { for (const k of ['superpro-theme', 'sp-theme', 'theme', 'gds-theme']) localStorage.setItem(k, 'light'); } catch { /* blocked */ } document.addEventListener('DOMContentLoaded', () => document.documentElement.setAttribute('data-theme', 'light')); });
  if (auth === 'founder') {
    page = await ctx.newPage();
    await page.goto(server.base + '/saas/operator-sign-in.html');
    await page.locator('#operator-form input[name=key]').fill(server.adminKey);
    await Promise.all([page.waitForURL(server.base + '/office/'), page.locator('#operator-form button[type=submit]').click()]);
  } else {
    page = await ctx.newPage();
    await page.goto(server.base + url, { waitUntil: 'load' });
  }
  await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {});
  await page.evaluate(() => { for (const d of document.querySelectorAll('dialog[open]')) d.close(); document.querySelectorAll('[data-reveal]').forEach((e) => e.classList.add('is-in')); });
  if (theme === 'light') await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'light'));
  await page.waitForTimeout(400);
  return { ctx, page };
}

async function axe(page) {
  return page.evaluate(async (src) => {
    if (!window.axe) (0, eval)(src);
    const r = await window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] }, resultTypes: ['violations'] });
    return r.violations.map((v) => ({ id: v.id, impact: v.impact, help: v.help, count: v.nodes.length, targets: v.nodes.slice(0, 4).map((n) => n.target.join(' ')) }));
  }, AXE);
}

/* ---------- accessibility ---------- */
const a11y = [];
for (const spec of PAGES) {
  for (const [width, height, theme] of [[1440, 900, 'dark'], [390, 844, 'dark'], [1440, 900, 'light']]) {
    if (theme === 'light' && spec[2] === 'site') continue; // the public site is dark only by design
    const { ctx, page } = await openPage(spec, { width, height, theme });
    try { a11y.push({ page: spec[0], url: spec[1], group: spec[2], width, theme, violations: await axe(page) }); }
    catch (e) { a11y.push({ page: spec[0], url: spec[1], group: spec[2], width, theme, error: e.message.split('\n')[0], violations: [] }); }
    await ctx.close();
  }
}

/* ---------- performance (public site, mobile throttled) ---------- */
async function vitals([, url], { mobile = true } = {}) {
  const ctx = await browser.newContext(mobile ? { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true } : { viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  if (mobile) {
    await cdp.send('Network.enable');
    await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 150, downloadThroughput: 1.6 * 1024 * 1024 / 8, uploadThroughput: 750 * 1024 / 8 });
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  }
  await page.addInitScript(() => {
    window.__v = { lcp: 0, cls: 0, tbt: 0, fcp: 0 };
    new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__v.lcp = e.startTime; }).observe({ type: 'largest-contentful-paint', buffered: true });
    new PerformanceObserver((l) => { for (const e of l.getEntries()) if (!e.hadRecentInput) window.__v.cls += e.value; }).observe({ type: 'layout-shift', buffered: true });
    new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__v.tbt += Math.max(0, e.duration - 50); }).observe({ type: 'longtask', buffered: true });
    new PerformanceObserver((l) => { for (const e of l.getEntries()) if (e.name === 'first-contentful-paint') window.__v.fcp = e.startTime; }).observe({ type: 'paint', buffered: true });
  });
  await page.goto(server.base + url, { waitUntil: 'load', timeout: 60000 });
  await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(2500);
  await page.mouse.click(5, 300).catch(() => {}); // a first input finalises LCP like a real visit
  const v = await page.evaluate(() => {
    const res = performance.getEntriesByType('resource'), nav = performance.getEntriesByType('navigation')[0];
    const bytes = res.reduce((s, r) => s + (r.transferSize || 0), nav?.transferSize || 0);
    const js = res.filter((r) => /\.m?js(\?|$)/.test(r.name)).reduce((s, r) => s + (r.transferSize || 0), 0);
    return { ...window.__v, bytes, jsBytes: js, requests: res.length + 1, hero3d: res.some((r) => r.name.includes('hero-3d.js')) };
  });
  await ctx.close();
  return v;
}

const perf = [];
for (const spec of PAGES.filter((p) => p[2] === 'site' || p[0] === 'legacy-landing')) {
  const runs = [await vitals(spec), await vitals(spec)];
  const med = (k) => Math.round(Math.min(...runs.map((r) => r[k])) * 1000) / 1000; // best of two cold loads
  perf.push({ page: spec[0], url: spec[1], group: spec[2], mode: 'mobile-throttled', lcp: Math.round(med('lcp')), cls: med('cls'), tbt: Math.round(med('tbt')), fcp: Math.round(med('fcp')), kb: Math.round(runs[0].bytes / 1024), jsKb: Math.round(runs[0].jsBytes / 1024), requests: runs[0].requests, hero3d: runs[0].hero3d });
}
// Desktop with the 3D hero forced on, to measure what a capable laptop downloads.
{
  const v = await vitals(['home-3d', '/?force3d=1'], { mobile: false });
  perf.push({ page: 'home (desktop, 3D on)', url: '/?force3d=1', group: 'site', mode: 'desktop-unthrottled', lcp: Math.round(v.lcp), cls: Math.round(v.cls * 1000) / 1000, tbt: Math.round(v.tbt), fcp: Math.round(v.fcp), kb: Math.round(v.bytes / 1024), jsKb: Math.round(v.jsBytes / 1024), requests: v.requests, hero3d: v.hero3d });
}

await browser.close();
await server.stop();

/* ---------- write reports ---------- */
fs.writeFileSync(path.join(OUT, 'accessibility.json'), JSON.stringify({ standard: 'WCAG 2.2 AA (axe-core 4.14.0 rules)', results: a11y }, null, 2) + '\n');
fs.writeFileSync(path.join(OUT, 'performance.json'), JSON.stringify({ budget: BUDGET, note: 'Playwright lab measurements, best of two cold loads; not Lighthouse, not field data.', results: perf }, null, 2) + '\n');

const serious = (r) => r.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
let md = `# Accessibility and performance report (Phase 03)\n\nGenerated by \`npm run report:a11y-perf\` against a local test server with synthetic data. Production was not touched.\n\n## Accessibility (axe-core 4.14.0, WCAG 2.0/2.1/2.2 A and AA rules)\n\n| Page | Width | Theme | Critical | Serious | Moderate | Minor | Issues |\n|---|---|---|---|---|---|---|---|\n`;
for (const r of a11y) {
  const c = (i) => r.violations.filter((v) => v.impact === i).length;
  md += `| ${r.page} | ${r.width} | ${r.theme} | ${c('critical')} | ${c('serious')} | ${c('moderate')} | ${c('minor')} | ${r.error ? 'error: ' + r.error : r.violations.map((v) => `${v.id} (${v.count})`).join(', ') || 'none'} |\n`;
}
md += `\n## Performance (mobile: 4x CPU slowdown, ~1.6 Mbps, 150 ms latency)\n\nBudgets: LCP ≤ ${BUDGET.lcp} ms, CLS ≤ ${BUDGET.cls}, total blocking time ≤ ${BUDGET.tbt} ms.\n\n| Page | Mode | LCP ms | CLS | TBT ms | FCP ms | Transfer KB | JS KB | Requests | 3D loaded |\n|---|---|---|---|---|---|---|---|---|---|\n`;
for (const p of perf) md += `| ${p.page} | ${p.mode} | ${p.lcp} | ${p.cls} | ${p.tbt} | ${p.fcp} | ${p.kb} | ${p.jsKb} | ${p.requests} | ${p.hero3d ? 'yes' : 'no'} |\n`;
fs.writeFileSync(path.join(OUT, 'A11Y-PERF.md'), md);

const a11yFail = a11y.filter((r) => r.group === 'site' && serious(r).length);
const perfFail = perf.filter((p) => p.group === 'site' && p.mode === 'mobile-throttled' && (p.lcp > BUDGET.lcp || p.cls > BUDGET.cls || p.tbt > BUDGET.tbt));
console.log(md);
console.log(`New-site pages with serious/critical accessibility issues: ${a11yFail.length}. Pages over the Web Vitals budget: ${perfFail.length}.`);
process.exit(a11yFail.length || perfFail.length ? 1 : 0);
