import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import { analysePage, analyseRobots, scoreOf, installVisibility } from '../src/visibility.js';

const GOOD = `<!doctype html><html lang="en"><head><title>Super Pro AI Office Manager for service businesses</title><meta name="description" content="Run jobs, customers, staff and marketing from one place, with every message and post approved by you before it goes out."><meta name="viewport" content="width=device-width"><link rel="canonical" href="https://x.test/saas/"><meta property="og:title" content="a"><meta property="og:description" content="b"><meta property="og:image" content="c"><meta property="og:url" content="d"><script type="application/ld+json">{"@type":"SoftwareApplication","offers":{"@type":"Offer","price":"49"}}</script></head><body><h1>One office</h1><h2>A</h2><h2>B</h2><p>${'word '.repeat(200)}</p></body></html>`;

test('a well-formed page scores well and a bare page does not', () => {
  const g = analysePage(GOOD, { expectedPrices: [49] });
  assert.equal(g.findings.filter((f) => f.level === 'fix').length, 0);
  const b = analysePage('<html><body><p>hi</p></body></html>');
  assert.ok(b.findings.filter((f) => f.level === 'fix').length >= 4);
  assert.ok(scoreOf(g.findings) > scoreOf(b.findings));
});
test('prices in structured data must match the live plans', () => {
  const r = analysePage(GOOD, { expectedPrices: [59] });
  assert.ok(r.findings.some((f) => f.id === 'prices' && f.level === 'fix'));
});
test('invalid structured data is flagged, not thrown', () => {
  const r = analysePage(GOOD.replace('{"@type"', '{bad'), {});
  assert.ok(r.findings.some((f) => f.id === 'jsonld_valid'));
});
test('robots.txt that blocks AI crawlers is flagged', () => {
  assert.ok(analyseRobots('User-agent: GPTBot\nDisallow: /\n').some((f) => f.id === 'ai_crawlers' && f.level === 'fix'));
  assert.ok(analyseRobots('User-agent: *\nAllow: /\nSitemap: https://x/sitemap.xml').some((f) => f.id === 'ai_crawlers' && f.level === 'good'));
});

function setup(fetchImpl, resolveHost = async () => true) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vis-')); fs.mkdirSync(path.join(root, 'saas')); fs.writeFileSync(path.join(root, 'saas', 'index.html'), GOOD);
  const db = new Database(':memory:'); db.exec(`CREATE TABLE subscription_plans (id TEXT, monthly_fee_cents INTEGER, active INTEGER); INSERT INTO subscription_plans VALUES ('a',4900,1);`);
  const routes = {}; const app = { get: (p, ...h) => (routes['GET ' + p] = h.at(-1)), post: (p, ...h) => (routes['POST ' + p] = h.at(-1)), delete: (p, ...h) => (routes['DELETE ' + p] = h.at(-1)) };
  const v = installVisibility(app, { db, env: { PUBLIC_BASE_URL: 'https://x.test' }, requireAdmin: (q, s, n) => n(), siteRoot: root, generateAiText: async () => { throw new Error('no provider'); }, fetchImpl, resolveHost, timers: false });
  return { db, v, routes };
}
const reply = (status, body) => ({ status, text: async () => body });

test('the weekly run stores a report, falls back to a plain summary, and tracks the trend', async () => {
  const { db, v } = setup(async (u) => reply(200, /robots/.test(u) ? 'User-agent: *\nAllow: /\nSitemap: https://x.test/sitemap.xml' : /sitemap/.test(u) ? '<urlset><url><loc>https://x.test/</loc></url></urlset>' : 'llms'));
  const a = await v.run('manual'); assert.equal(a.summary_source, 'template'); assert.ok(a.score > 50 && a.previous_score === null);
  const b = await v.run('manual'); assert.equal(b.previous_score, a.score);
  assert.equal(db.prepare('SELECT COUNT(*) c FROM visibility_reports').get().c, 2);
});
test('competitor checks stay polite: private hosts, robots.txt and non-https are skipped', async () => {
  const seen = [];
  const { db, v } = setup(async (u) => { seen.push(u); if (/blocked\.test\/robots/.test(u)) return reply(200, 'User-agent: *\nDisallow: /'); if (/ok\.test\/robots/.test(u)) return reply(404, ''); if (/ok\.test/.test(u)) return reply(200, GOOD); return reply(404, ''); }, async (h) => h !== 'internal.test');
  for (const [i, u] of ['https://blocked.test/page', 'https://internal.test/page', 'https://ok.test/page'].entries()) db.prepare('INSERT INTO visibility_competitors VALUES (?,?,?,?)').run('c' + i, u, null, new Date(i).toISOString());
  await v.run('manual');
  const comps = JSON.parse(db.prepare('SELECT competitors_json j FROM visibility_reports').get().j);
  assert.match(comps[0].note, /robots/); assert.match(comps[1].note, /public https/); assert.equal(comps[2].ok, true);
  assert.ok(!seen.some((u) => /blocked\.test\/page|internal\.test/.test(u)), 'blocked and private pages are never requested');
});
test('a big score drop or a fix-level finding reaches the operator attention list', async () => {
  const { db, v } = setup(async () => reply(404, ''));
  await v.run('manual'); const items = v.attentionItems(); assert.equal(items[0].kind, 'search_visibility');
  void db;
});
