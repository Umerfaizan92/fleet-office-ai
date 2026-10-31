// Phase 09 in a real browser: Founder Console > Operations > Reliability. Run checks, see every component, take a
// backup and test a restore, back up configuration, acknowledge and resolve an alert, run self-healing, request an
// approval-only action, send the daily summary, with accessibility checks and phone and iPad fit.
//   npm run test:reliability-ui
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import Database from 'better-sqlite3';
import { chromium } from 'playwright';
import { startServer } from './test-server.mjs';
import { seedOwner } from './visual/session.mjs';

const snapDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-ui-snaps-'));
const s = await startServer({ BACKUP_SNAPSHOT_DIR: snapDir });
const browser = await chromium.launch();
const errors = [];
let passed = 0;
const check = async (name, fn) => { await fn(); passed += 1; console.log('PASS', name); };
const shots = process.env.UI_SHOTS;
const AXE = fs.readFileSync(new URL('../node_modules/axe-core/axe.min.js', import.meta.url), 'utf8');
const axe = (page, sel) => page.evaluate(async ([src, sc]) => { if (!window.axe) (0, eval)(src); const r = await window.axe.run(document.querySelector(sc), { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] }, resultTypes: ['violations'] }); return r.violations.filter((x) => ['serious', 'critical'].includes(x.impact)).map((x) => `${x.id}: ${x.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(', ')}`); }, [AXE, sel]);
const sql = (q, ...a) => { const d = new Database(s.dbPath); try { return /^\s*select/i.test(q) ? d.prepare(q).all(...a) : d.prepare(q).run(...a); } finally { d.close(); } };

try {
  await seedOwner(s, { business: 'Harbour Plumbing Pty Ltd' });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => errors.push(e.message));
  p.on('dialog', (d) => { errors.push('unexpected dialog: ' + d.message()); d.dismiss(); });
  await p.goto(s.base + '/saas/operator-sign-in.html');
  await p.locator('#operator-form input[name=key]').fill(s.adminKey);
  await Promise.all([p.waitForURL(s.base + '/office/'), p.locator('#operator-form button[type=submit]').click()]);
  const open = async () => { await p.evaluate(() => { location.hash = 'f07/platform/reliability'; }); await p.locator('#console-content .rl-banner').waitFor(); return p.locator('#console-content'); };
  const said = (re) => p.waitForFunction((src) => new RegExp(src).test(document.querySelector('#console-content [data-rl-status]')?.textContent || ''), re.source);

  await check('Reliability tab: run checks and see all fourteen components', async () => {
    const v = await open();
    await v.getByRole('button', { name: 'Run checks now' }).click();
    await said(/Checks finished/);
    assert.equal(await v.locator('.rl-card').count(), 14);
    for (const t of ['Application availability', 'Payment webhooks', 'Backups', 'Security events', 'Resource usage']) await v.getByText(t, { exact: true }).first().waitFor();
    assert.deepEqual(await axe(p, '#console-content'), [], 'reliability tab is accessible');
  });

  await check('Backups: back up now, test the restore, back up configuration', async () => {
    const v = await open();
    await p.getByRole('tab', {name:'Backups',exact:true}).click();
    await v.getByRole('button', { name: 'Back up now' }).click(); await said(/Snapshot saved/);
    await v.getByRole('button', { name: 'Test a restore' }).click(); await said(/Restore test passed/);
    await v.getByRole('button', { name: 'Back up configuration' }).click(); await said(/Configuration backed up/);
    assert.ok(fs.readdirSync(path.join(snapDir, 'super-pro', 'snapshots'), { recursive: true }).some((f) => String(f).endsWith('.sqlite.gz')));
    await v.getByRole('button', { name: 'Check the backup bucket' }).click(); await said(/Bucket checked/);
    await v.getByText(/local folder/).waitFor();
    if (shots) await p.screenshot({ path: shots + '/reliability.png', fullPage: true });
  });

  await check('Alerts: a failing check opens a critical alert that can be acknowledged and resolved', async () => {
    const now = new Date().toISOString();
    for (let i = 0; i < 10; i++) sql("INSERT INTO background_jobs (id,type,payload_json,status,attempts,max_attempts,run_at,last_error,created_at,updated_at) VALUES (?,'demo.permanent','{}','dead',5,5,?,'Invalid record',?,?)", crypto.randomUUID(), now, now, now);
    let v = await open();
    await v.getByRole('button', { name: 'Run checks now' }).click(); await said(/Checks finished/);
    await p.getByRole('tab', {name:/^Alerts \(/}).click();
    v = p.locator('#console-content');
    const row = v.getByRole('row', { name: /Background jobs: failing/ });
    await row.getByRole('button', { name: 'Acknowledge' }).click(); await said(/Alert acknowledged/);
    await v.getByRole('row', { name: /Background jobs: failing/ }).getByRole('button', { name: 'Resolve' }).click(); await said(/Alert resolved/);
    await p.getByRole('tab', {name:/^Alerts \(/}).locator(':scope[aria-selected=true]').waitFor();
  });

  await check('Self-healing and approval-only actions', async () => {
    const v = await open();
    await p.getByRole('tab', {name:'Self-healing',exact:true}).click();
    await v.getByRole('button', { name: 'Run self-healing now' }).click(); await said(/action\(s\) recorded/);
    await v.getByText('Left for a person').first().waitFor();
    await p.getByRole('tab', {name:/^Needs approval:/}).click();
    await v.getByLabel('Action needing approval').selectOption('production_rollback');
    await v.getByLabel('What should be done and why').fill('Roll back to the deploy before the broken invoice change');
    await v.getByRole('button', { name: 'Request approval' }).click(); await said(/Sent for approval/);
    assert.equal(sql("SELECT COUNT(*) n FROM platform_approvals WHERE action='production_rollback' AND status='pending'")[0].n, 1);
  });

  await check('Daily summary is saved (and emailed when an operator email is set)', async () => {
    const v = await open();
    await p.getByRole('tab', {name:'Daily summaries',exact:true}).click();
    await v.getByRole('button', { name: "Send today's summary now" }).click(); await said(/Summary saved/);
    assert.equal(sql('SELECT COUNT(*) n FROM reliability_summaries')[0].n, 1);
  });

  for (const [w, h, label] of [[390, 844, 'phone'], [820, 1180, 'iPad']]) {
    await check(`Reliability tab fits a ${label}`, async () => {
      await p.setViewportSize({ width: w, height: h }); await open(); await p.waitForTimeout(200);
      const over = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      assert.ok(over <= 1, `overflows by ${over}px on ${label}`);
      if (shots) await p.screenshot({ path: `${shots}/reliability-${label}.png`, fullPage: true });
    });
  }
  assert.deepEqual(errors, [], 'no page errors');
  console.log(`\n${passed} checks passed`);
} catch (e) {
  console.error('FAIL', e.message); if (errors.length) console.error('page errors:', errors); process.exitCode = 1;
} finally { await browser.close(); await s.stop(); fs.rmSync(snapDir, { recursive: true, force: true }); }
