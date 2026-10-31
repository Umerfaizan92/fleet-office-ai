import assert from 'node:assert/strict';
import fs from 'node:fs';
import { chromium } from 'playwright';
import { startServer } from './test-server.mjs';
import { seedOwner, ownerContext } from './visual/session.mjs';
import Database from 'better-sqlite3';
const mapping = JSON.parse(fs.readFileSync(new URL('../docs/navigation/MAPPING.json', import.meta.url)));
// Expected top sections per route, in displayed order, from the reviewed SECTIONS.md. Every one must be checked at both
// widths: a page whose sections render late must not silently shrink the coverage.
const expected = {};
for (const line of fs.readFileSync(new URL('../docs/navigation/SECTIONS.md', import.meta.url), 'utf8').split('\n')) {
  const m = line.match(/^\| [^|]+ \| `([^`]+)` \| ([^|]+) \|/); if (!m || !m[2].includes(' → ')) continue;
  expected[m[1]] = m[2].split(' → ').map(x => x.trim());
}
const s = await startServer();
let browser;
const coverage = [], errors = [];
const axeSource = fs.readFileSync(new URL('../node_modules/axe-core/axe.min.js', import.meta.url), 'utf8');
fs.mkdirSync('qa/visual/navigation', { recursive: true });
const checked = (portal, route, section, width, detail = 'Screen navigation and rendered panel passed; business writes untested') => coverage.push({ portal, route, section, width, result: 'PASS', detail });
const settle = async p => { await p.waitForFunction(() => ![...document.querySelectorAll('.view:not([hidden]) p,#console-content p')].some(e => e.getClientRects().length && /^Loading/.test(e.textContent.trim()))); };
async function navigationAccessibility(p, portal, width) {
  for (const theme of ['dark', 'light']) {
    await p.evaluate(theme => document.documentElement.dataset.theme = theme, theme);
    const violations = await p.evaluate(async source => {
      if (!window.axe) (0, eval)(source);
      const result = await window.axe.run({include: ['.nested-rail', '.context-section-tabs', '.navigation-breadcrumb']}, {runOnly: {type:'tag', values:['wcag2a','wcag2aa','wcag21a','wcag21aa','wcag22aa']}});
      return result.violations.filter(v => ['serious','critical'].includes(v.impact)).map(v => ({id:v.id, targets:v.nodes.map(n=>n.target)}));
    }, axeSource);
    assert.deepEqual(violations, [], `${portal} ${theme} navigation accessibility at ${width}`);
    checked(portal, 'navigation', `${theme} WCAG A/AA navigation checks`, width);
  }
  await p.evaluate(() => document.documentElement.dataset.theme = 'dark');
}
async function indexLinks(p, root, portal, route, width, parent = '') {
  for (const link of await root.locator('[data-section-link]').all()) {
    if (!await link.isVisible()) continue;
    const name = (await link.textContent()).trim(), panel = await link.getAttribute('aria-controls');
    await link.click(); await p.locator('#' + panel).waitFor({state:'visible'});
    assert.equal(await link.getAttribute('aria-current'),'location');
    checked(portal, route, (parent ? parent + ' / ' : '') + 'Section: ' + name, width);
  }
}
async function sections(p, root, portal, route, width) {
  if (expected[route]) await p.waitForFunction(names => { const scope = [...document.querySelectorAll('.view:not([hidden]),#console-content,#console-tabs')]; const seen = new Set(scope.flatMap(r => [...r.querySelectorAll('[role=tab],[data-section-link]')]).filter(e => e.getClientRects().length).map(e => (e.matches('[data-section-link]') ? 'Section: ' : '') + e.textContent.trim())); return names.every(n => seen.has(n)); }, expected[route], { timeout: 15000 }).catch(() => {});
  const descendants = root.locator('[role=tablist]');
  const lists = (await root.getAttribute('role') === 'tablist' ? [root] : []).concat(await descendants.all());
  for (const list of lists) {
    if (!await list.isVisible()) continue;
    const names = await list.locator('[role=tab]').allTextContents();
    for (const name of names) {
      const tab = list.getByRole('tab', { name, exact: true }); if (!await tab.isVisible() || await tab.isDisabled()) continue;
      await tab.click(); await settle(p);
      if (await list.getAttribute('aria-label') === 'Email folders') { await root.locator('.portal-mail-list').waitFor(); assert.equal(await p.evaluate(() => document.activeElement?.closest('[aria-label="Email folders"]') ? document.activeElement.textContent.trim() : null), name.trim(), `${route} keeps focus on the selected email folder`); }
      await p.waitForFunction(({ name }) => [...document.querySelectorAll('[role=tab][aria-selected=true]')].some(e => e.textContent.trim() === name.trim()), { name });
      const panel = await tab.getAttribute('aria-controls');
      if (panel) await p.locator('#' + panel).waitFor({state:'visible'});
      const nested = (expected[route] || []).filter(n => n.startsWith(name.trim() + ' / ')).map(n => n.slice(name.trim().length + 3));
      if (nested.length) await p.waitForFunction(names => { const seen = new Set([...document.querySelectorAll('[data-section-link]')].filter(e => e.getClientRects().length).map(e => 'Section: ' + e.textContent.trim())); return names.every(n => seen.has(n)); }, nested, { timeout: 15000 }).catch(() => {});
      checked(portal, route, name, width);
      await indexLinks(p, root, portal, route, width, name.trim());
    }
  }
  if (!lists.length) await indexLinks(p, root, portal, route, width);
}
try {
  browser = await chromium.launch({ headless: true, ...(process.env.UI_CHROMIUM_PATH ? {executablePath:process.env.UI_CHROMIUM_PATH,args:['--no-sandbox','--disable-dev-shm-usage','--disable-gpu']} : {}) });
  const owner = await seedOwner(s);
  for (const width of [1440, 390]) {
    const ctx = await ownerContext(browser, s, owner, { viewport: { width, height: 900 }, reducedMotion: 'reduce', ...(width === 390 ? { hasTouch: true, isMobile: true } : {}) });
    const p = await ctx.newPage(); p.setDefaultTimeout(10000); p.on('pageerror', e => errors.push(e.message));
    p.on('response', r => { if (r.url().includes('/api/') && r.status() >= 500) errors.push(`${r.status()} ${new URL(r.url()).pathname}`); });
    await p.goto(s.base + '/saas/workspace.html'); await p.locator('#business-navigation .navigation-page').first().waitFor({ state: 'attached' });
    assert.equal(await p.locator('#business-navigation .navigation-page').count(), 60);
    assert.equal(await p.locator('.portal-subtabs [data-jump]').count(), 0);
    for (const g of mapping.business) {
      for (const item of g.items) {
        if (width === 390) await p.getByRole('button', { name: '☰ Menu', exact: true }).click();
        const group = p.locator(`[data-nav-group="${g.id}"]`);
        if (await group.getAttribute('aria-expanded') !== 'true') await group.click();
        const link = p.locator(`#business-navigation [data-nav-page="${item.view}"]`); await link.click();
        await p.locator('#' + item.view + '-view').waitFor({ state: 'visible' }); await settle(p);
        assert.equal(await link.getAttribute('aria-current'), 'page', item.path);
        assert.equal(await group.getAttribute('aria-expanded'), 'true');
        if (width === 390) assert.equal(await p.locator('#business-navigation').getAttribute('data-drawer'), 'false');
        assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${item.path} overflows at ${width}`);
        checked('Business', item.path, '', width);
        await sections(p, p.locator('#' + item.view + '-view'), 'Business', item.path, width);
      }
    }
    await p.goto(s.base + '/saas/workspace.html#b07/ledger?section=reports'); await p.locator('#finance-view').waitFor({ state: 'visible' });
    await p.locator('[data-fin-tab=reports][aria-selected=true]').waitFor();
    await p.getByRole('tab', { name: 'Costs & overheads', exact: true }).click();
    await p.locator('#fin-overhead-form [name=name]').fill('Unsaved synthetic overhead');
    await p.getByRole('tab', { name: 'Overview', exact: true }).click(); await p.getByRole('tab', { name: 'Costs & overheads', exact: true }).click();
    assert.equal(await p.locator('#fin-overhead-form [name=name]').inputValue(), 'Unsaved synthetic overhead');
    await p.goBack(); await p.locator('[data-fin-tab=overview][aria-selected=true]').waitFor(); await p.goForward(); await p.locator('[data-fin-tab=costs][aria-selected=true]').waitFor();
    await p.locator('#fin-overhead-form').evaluate(f => f.reset());
    await p.reload(); await p.locator('[data-fin-tab=costs][aria-selected=true]').waitFor();
    await navigationAccessibility(p, 'Business', width);
    if (width === 390) {
      await p.getByRole('button', {name:'☰ Menu',exact:true}).click();
      assert.equal(await p.locator('.app-main').evaluate(e=>e.inert), true);
      await p.keyboard.press('Escape');
      assert.equal(await p.locator('.app-main').evaluate(e=>e.inert), false);
      assert.equal(await p.getByRole('button', {name:'☰ Menu',exact:true}).evaluate(e=>e===document.activeElement), true);
    } else {
      await p.getByRole('button', {name:'Collapse navigation',exact:true}).click();
      await p.reload(); await p.locator('#business-navigation[data-compact=true]').waitFor();
      await p.setViewportSize({width:390,height:900});
      await p.getByRole('button', {name:'☰ Menu',exact:true}).click();
      assert.equal(await p.locator('#business-navigation .navigation-label').first().isVisible(), true, 'mobile restores labels with a saved compact preference');
      await p.keyboard.press('Escape'); await p.setViewportSize({width,height:900});
      await p.getByRole('button', {name:'Expand navigation',exact:true}).click();
    }
    const costs = p.locator('[data-fin-tab=costs]'); await costs.focus(); await p.keyboard.press('Home');
    await p.locator('[data-fin-tab=overview][aria-selected=true]').waitFor();
    await p.keyboard.press('End'); await p.locator('[data-fin-tab=reports][aria-selected=true]').waitFor();
    await costs.click();
    checked('Business', 'navigation', 'Keyboard sections, drawer focus and saved rail preference', width);
    await p.screenshot({ path: `qa/visual/navigation/business-${width}.png`, fullPage: true });
    checked('Business', 'b07/ledger', 'Deep link, history, reload and unsaved field preservation', width);
    await ctx.close();
  }
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' }); const p = await ctx.newPage();
  await p.goto(s.base + '/saas/operator-sign-in.html'); await p.locator('input[name=key]').fill(s.adminKey); await p.locator('#operator-form button[type=submit]').click(); await p.waitForURL(s.base + '/office/');
  p.on('pageerror', e => errors.push(e.message));
  for (const width of [1440, 390]) {
    await p.setViewportSize({ width, height: 900 });
    for (const g of mapping.founder) for (const item of g[4]) {
      if (width === 390) await p.getByRole('button', { name: '☰ Menu', exact: true }).click();
      const group = p.locator(`[data-nav-group="${g[0]}"]`); if (await group.getAttribute('aria-expanded') !== 'true') await group.click();
      const id = g[0] + '/' + item[0], link = p.locator(`[data-nav-page="${id}"]`); await link.click();
      await link.locator(':scope[aria-current=page]').waitFor({state:'attached'});
      await p.waitForFunction(hash => location.hash.split('?')[0] === '#' + hash, id); await settle(p);
      await p.locator('#console-content > p.portal-note').filter({hasText:/^Loading/}).waitFor({ state: 'hidden' });
      assert.equal(await p.locator('#console-content').getByText('Action unavailable', { exact: true }).count(), 0, id);
      assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${id} overflows at ${width}`);
      checked('Founder', id, '', width);
      await sections(p, p.locator('#console-content'), 'Founder', id, width);
      await sections(p, p.locator('#console-tabs'), 'Founder', id, width);
    }
    await p.screenshot({ path: `qa/visual/navigation/founder-${width}.png`, fullPage: true });
    await navigationAccessibility(p, 'Founder', width);
  }
  await ctx.close();
  const restricted = await seedOwner(s, { name: 'Restricted Worker', email: 'restricted@example.test' }); const db = new Database(s.dbPath); db.prepare("UPDATE memberships SET role='employee' WHERE user_id=?").run(restricted.uid); db.close();
  const workerContext = await ownerContext(browser, s, restricted); const worker = await workerContext.newPage(); await worker.goto(s.base + '/saas/workspace.html'); await worker.locator('#business-navigation').waitFor();
  assert.equal(await worker.locator('[data-nav-page=finance]').count(), 0); assert.equal(await worker.locator('[data-nav-page=team]').count(), 0); assert.equal(await worker.locator('#workspace-operator-link').isVisible(), false);
  const denied = await s.call('GET', '/api/saas/finance/hub', { cookie: restricted.cookie }); assert.equal(denied.status, 403);
  checked('Business', 'restricted employee', 'Finance/staff/founder isolation', 1440);
  // Unsaved-change warning follows the real save: failed saves keep it, successful saves clear it, later edits restore it.
  let saveStatus = 500; await worker.route('**/__nav-save-test', r => r.fulfill({ status: saveStatus, contentType: 'application/json', body: '{}' }));
  assert.ok(await worker.evaluate(() => { const host = document.querySelector('.view:not([hidden])'); if (!host) return false; const f = document.createElement('form'); f.id = 'nav-save-test'; f.innerHTML = '<input name="note" aria-label="Note"><button>Save</button>'; f.addEventListener('submit', async e => { e.preventDefault(); await fetch('/__nav-save-test', { method: 'POST', body: '{}' }).catch(() => {}); }); host.append(f); return true; }), 'a visible view hosts the synthetic form');
  const note = worker.locator('#nav-save-test input'), edits = () => worker.evaluate(() => window.SuperProNavigation.hasEdits());
  await note.click(); await note.fill('draft'); assert.equal(await edits(), true, 'typed edit is unsaved');
  await worker.locator('#nav-save-test button').click(); await worker.waitForTimeout(1800); assert.equal(await edits(), true, 'failed save keeps the warning');
  saveStatus = 200; await worker.locator('#nav-save-test button').click(); await worker.waitForTimeout(1800); assert.equal(await edits(), false, 'successful save clears the warning');
  await note.fill('draft 2'); assert.equal(await edits(), true, 'edits after a save are unsaved again');
  checked('Business', 'unsaved changes', 'Save acknowledgement: failure keeps warning, success clears it, later edits warn', 1440);
  await workerContext.close();
  const missing = Object.entries(expected).flatMap(([route, names]) => [1440, 390].flatMap(width => names.filter(n => !coverage.some(c => c.route === route && c.width === width && c.section === n)).map(n => `${route} ${width}px: ${n}`)));
  assert.deepEqual(missing, [], 'every reviewed section is checked at both widths');
  assert.deepEqual(errors, []);
  fs.mkdirSync('qa/reports', { recursive: true }); fs.writeFileSync('qa/reports/navigation-coverage.json', JSON.stringify({ baseline: mapping.baseline, coverage, errors, writes: 'Synthetic form input only; no external service actions' }, null, 2) + '\n');
  console.log(`PASS navigation: ${coverage.length} route/section checks; 60 business and 34 founder pages at mobile and desktop; restricted-role and state tests`);
} finally { await browser?.close(); await s.stop(); }
