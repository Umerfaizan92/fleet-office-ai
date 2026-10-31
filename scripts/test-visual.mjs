// Phase 03 visual regression and responsive verification.
// Takes screenshots of the public website, sign-in, Business OS and Founder Console at phone (390), tablet (768)
// and laptop (1440) widths, compares them with the baselines in qa/visual/baseline, and checks that no page
// scrolls sideways. Baselines are kept out of git (about 14 MB of PNG); the first run on a machine creates them from
// the approved build, later runs fail on any visible change. A summary is written to qa/reports/visual-regression.json. Runs against a throwaway local server with synthetic data; never touches production.
//   npm run test:visual            compare against baselines (fails on visible change)
//   npm run test:visual:update     accept the current screens as the new baselines
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';
import { startServer } from './test-server.mjs';
import { seedOwner, ownerContext } from './visual/session.mjs';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const QA = path.join(ROOT, 'qa', 'visual');
const DIRS = { baseline: path.join(QA, 'baseline'), current: path.join(QA, 'current'), diff: path.join(QA, 'diff') };
const UPDATE = process.argv.includes('--update');
const ONLY = process.argv.find((a) => a.startsWith('--only='))?.slice(7);
const WIDTHS = [[390, 844], [768, 1024], [1440, 900]];
const MAX_HEIGHT = 1800;          // the first two screens of each page: layout, colour and type changes show here; keeps baselines small
const TOLERANCE = 0.003;          // up to 0.3% of pixels may differ (font antialiasing between runs)
const FIXED_TIME = new Date('2026-10-28T10:00:00+08:00');

const PAGES = [
  { name: 'home', url: '/' },
  { name: 'features', url: '/features' },
  { name: 'feature-money', url: '/features/money' },
  { name: 'industries', url: '/for' },
  { name: 'industry-trades', url: '/for/trades' },
  { name: 'pricing', url: '/pricing' },
  { name: 'receptionist', url: '/receptionist' },
  { name: 'stories', url: '/stories' },
  { name: 'help', url: '/help' },
  { name: 'contact', url: '/contact' },
  { name: 'legacy-landing', url: '/saas/index.html' },
  { name: 'sign-in', url: '/saas/sign-in.html' },
  { name: 'create-account', url: '/saas/create-account.html' },
  { name: 'workspace-today', url: '/saas/workspace.html', auth: 'owner', ready: '#workspace' },
  { name: 'workspace-customers', url: '/saas/workspace.html#customers', auth: 'owner', ready: '#workspace' },
  { name: 'workspace-money', url: '/saas/workspace.html#money', auth: 'owner', ready: '#workspace' },
  { name: 'founder-console', url: '/office/', auth: 'founder', ready: '#console-main' }
].filter((p) => !ONLY || (ONLY === 'portals' ? !!p.auth : p.name.includes(ONLY)));

// Things that change by themselves (clocks, relative times, live counters) are hidden from the comparison.
const MASK = ['[data-year]', 'time', '.gx-clock', '[data-live-value]', '.sp-typing', '.toast', '.sp-toast', '[data-relative-time]', '#workspace-clock', '.live-clock'];

for (const d of Object.values(DIRS)) fs.mkdirSync(d, { recursive: true });
for (const f of fs.readdirSync(DIRS.diff)) fs.rmSync(path.join(DIRS.diff, f));

const server = await startServer();
const browser = await chromium.launch();
const results = [];
async function contextFor(spec, viewport, owner) {
  const options = { viewport, reducedMotion: 'reduce', colorScheme: 'dark', deviceScaleFactor: 1 };
  if (spec.auth === 'owner') return ownerContext(browser, server, owner, options);
  if (spec.auth === 'founder') {
    const ctx = await browser.newContext(options);
    const page = await ctx.newPage();
    await page.goto(server.base + '/saas/operator-sign-in.html');
    await page.locator('#operator-form input[name=key]').fill(server.adminKey);
    await Promise.all([page.waitForURL(server.base + '/office/'), page.locator('#operator-form button[type=submit]').click()]);
    ctx.signedInPage = page; // the founder session lives in this tab
    return ctx;
  }
  return browser.newContext(options);
}

async function settle(page, spec) {
  await page.goto(server.base + spec.url, { waitUntil: 'load' });
  await page.waitForLoadState('networkidle', { timeout: 4000 }).catch(() => {});
  if (spec.ready) await page.locator(spec.ready).first().waitFor({ state: 'visible', timeout: 15000 });
  await page.evaluate(() => document.fonts?.ready);
  // Dismiss one-time notices so the screen underneath is what gets compared.
  await page.evaluate(() => { for (const d of document.querySelectorAll('dialog[open]')) d.close(); try { for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (/release_seen|tour/.test(k)) localStorage.setItem(k, k.includes('tour') ? 'done' : '1'); } } catch { /* blocked */ } });
  await page.mouse.move(viewportCentre(page).x, viewportCentre(page).y);
  await page.evaluate(() => { document.querySelectorAll('[data-reveal]').forEach((e) => e.classList.add('is-in')); scrollTo(0, 0); });
  await page.waitForTimeout(500);
}
const viewportCentre = (page) => { const v = page.viewportSize(); return { x: Math.round(v.width * 0.75), y: Math.round(v.height / 2) }; };

async function overflow(page) {
  return page.evaluate(() => {
    const w = document.documentElement.clientWidth;
    const scroll = document.documentElement.scrollWidth;
    const culprits = [];
    if (scroll > w + 1) {
      for (const el of document.querySelectorAll('body *')) {
        const r = el.getBoundingClientRect(), cs = getComputedStyle(el);
        if (r.width && r.right > w + 1 && cs.position !== 'fixed' && !el.closest('[aria-hidden="true"],.sr-only,.sp-sr')) {
          culprits.push(`${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''}${el.classList.length ? '.' + [...el.classList].slice(0, 2).join('.') : ''} right=${Math.round(r.right)}`);
          if (culprits.length >= 5) break;
        }
      }
    }
    return { scroll, width: w, culprits };
  });
}

function compare(name, buffer) {
  const basePath = path.join(DIRS.baseline, name + '.png');
  fs.writeFileSync(path.join(DIRS.current, name + '.png'), buffer);
  if (UPDATE || !fs.existsSync(basePath)) { fs.writeFileSync(basePath, buffer); return { status: UPDATE ? 'updated' : 'new', ratio: 0 }; }
  const a = PNG.sync.read(fs.readFileSync(basePath)), b = PNG.sync.read(buffer);
  if (a.width !== b.width || a.height !== b.height) return { status: 'changed', ratio: 1, note: `size ${a.width}x${a.height} → ${b.width}x${b.height}` };
  const diff = new PNG({ width: a.width, height: a.height });
  const pixels = pixelmatch(a.data, b.data, diff.data, a.width, a.height, { threshold: 0.12, includeAA: false });
  const ratio = pixels / (a.width * a.height);
  if (ratio > TOLERANCE) { fs.writeFileSync(path.join(DIRS.diff, name + '.png'), PNG.sync.write(diff)); return { status: 'changed', ratio }; }
  return { status: 'same', ratio };
}

try {
  const owner = await seedOwner(server);
  for (const spec of PAGES) {
    for (const [width, height] of WIDTHS) {
      const name = `${spec.name}-${width}`;
      const errors = [];
      let ctx;
      try {
        ctx = await contextFor(spec, { width, height }, owner);
        await ctx.clock?.setFixedTime(FIXED_TIME);
        const page = ctx.signedInPage || await ctx.newPage();
        page.on('pageerror', (e) => errors.push(e.message));
        await settle(page, spec);
        const of = await overflow(page);
        const full = await page.evaluate(() => document.documentElement.scrollHeight);
        const buffer = await page.screenshot({ fullPage: true, clip: { x: 0, y: 0, width, height: Math.min(full, MAX_HEIGHT) }, animations: 'disabled', caret: 'hide', mask: MASK.map((s) => page.locator(s)), maskColor: '#2A3550' });
        const cmp = compare(name, buffer);
        results.push({ name, page: spec.url, width, ...cmp, sidewaysScroll: of.scroll > of.width + 1, overflow: of.culprits, errors });
      } catch (e) {
        results.push({ name, page: spec.url, width, status: 'error', ratio: 1, note: e.message.split('\n')[0], sidewaysScroll: false, overflow: [], errors });
      }
      await ctx?.close();
    }
  }
} finally {
  await browser.close();
  await server.stop();
}

const failed = results.filter((r) => r.status === 'changed' || r.status === 'error' || r.sidewaysScroll || r.errors.length);
fs.mkdirSync(path.join(ROOT, 'qa', 'reports'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'qa', 'reports', ONLY === 'portals' ? 'visual-regression-portals.json' : 'visual-regression.json'), JSON.stringify({ widths: WIDTHS.map(([w]) => w), tolerance: TOLERANCE, results }, null, 2) + '\n');
for (const r of results) {
  const flag = r.status === 'error' ? 'ERROR' : r.sidewaysScroll ? 'OVERFLOW' : r.errors.length ? 'JS-ERROR' : r.status.toUpperCase();
  console.log(`${flag.padEnd(9)} ${r.name.padEnd(28)} ${(r.ratio * 100).toFixed(3)}%${r.note ? '  ' + r.note : ''}${r.overflow.length ? '  ' + r.overflow.join(', ') : ''}${r.errors.length ? '  ' + r.errors.join(' | ') : ''}`);
}
console.log(`${results.length} screens, ${failed.length} problem(s). Diffs (if any) in qa/visual/diff/.`);
process.exit(failed.length ? 1 : 0);
