// Phase 03 public website: generated pages are current, compressed assets match their sources,
// every public route answers with the right canonical address, and no internal link is broken.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { spawnSync } from 'node:child_process';
import { startServer } from './test-server.mjs';
import { PUBLIC_ROUTES } from '../src/public-site.js';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const DS = path.join(ROOT, 'saas', 'ds');
const SITE = path.join(ROOT, 'saas', 'site');

test('generated site pages match scripts/site (run npm run build:site after editing copy)', () => {
  const r = spawnSync(process.execPath, ['scripts/build-site.mjs', '--check'], { cwd: ROOT, encoding: 'utf8' });
  assert.equal(r.status, 0, r.stdout + r.stderr);
});

test('pre-compressed design-system files match their sources (run npm run build:ds)', () => {
  const sources = fs.readdirSync(DS).filter((f) => /\.(js|css)$/.test(f));
  assert.ok(sources.length >= 7);
  for (const f of sources) {
    const src = fs.readFileSync(path.join(DS, f));
    assert.ok(zlib.brotliDecompressSync(fs.readFileSync(path.join(DS, f + '.br'))).equals(src), `${f}.br is stale`);
    assert.ok(zlib.gunzipSync(fs.readFileSync(path.join(DS, f + '.gz'))).equals(src), `${f}.gz is stale`);
  }
});

test('every route maps to a generated page and every page has a route', () => {
  const files = new Set(fs.readdirSync(SITE).filter((f) => f.endsWith('.html')));
  for (const [, file] of PUBLIC_ROUTES) assert.ok(files.has(file), `missing ${file}`);
  assert.equal(files.size, PUBLIC_ROUTES.length);
});

test('public site served by the real server', async (t) => {
  const s = await startServer();
  t.after(() => s.stop());

  await t.test('routes answer 200 with canonical, title, description and no unreplaced placeholders', async () => {
    for (const [route] of PUBLIC_ROUTES) {
      for (const url of route === '/' ? ['/'] : [route, route + '/']) {
        const r = await s.call('GET', url);
        assert.equal(r.status, 200, url);
        assert.ok(!r.text.includes('__PUBLIC_BASE_URL__'), `${url} placeholder left`);
        assert.match(r.text, new RegExp(`<link rel="canonical" href="${s.base}${route === '/' ? '/' : route}">`), url);
        assert.match(r.text, /<title>[^<]{10,}<\/title>/, url);
        assert.match(r.text, /<meta name="description" content="[^"]{40,}"/, url);
        assert.equal((r.text.match(/<h1[\s>]/g) || []).length, 1, `${url} needs exactly one h1`);
      }
    }
  });

  await t.test('/start keeps a known plan and drops anything else', async () => {
    const ok = await s.call('GET', '/start?plan=operations');
    assert.equal(ok.status, 302);
    const loc = (await fetch(s.base + '/start?plan=scale', { redirect: 'manual' })).headers.get('location');
    assert.equal(loc, '/saas/create-account.html?plan=scale');
    const bad = (await fetch(s.base + '/start?plan=%3Cscript%3E', { redirect: 'manual' })).headers.get('location');
    assert.equal(bad, '/saas/create-account.html');
  });

  await t.test('sitemap lists every public route; robots hides the raw generated folder', async () => {
    const map = (await s.call('GET', '/sitemap.xml')).text;
    for (const [route] of PUBLIC_ROUTES) assert.ok(map.includes(`<loc>${s.base}${route === '/' ? '/' : route}</loc>`), route);
    assert.match((await s.call('GET', '/robots.txt')).text, /Disallow: \/saas\/site\//);
  });

  await t.test('design-system assets are served compressed when the browser accepts it', async () => {
    const br = await fetch(s.base + '/saas/ds/components.css', { headers: { 'accept-encoding': 'br' } });
    assert.equal(br.status, 200);
    assert.equal(br.headers.get('content-encoding'), 'br');
    assert.match(br.headers.get('content-type'), /text\/css/);
    const plain = await fetch(s.base + '/saas/ds/components.css', { headers: { 'accept-encoding': 'identity' } });
    assert.equal(plain.status, 200);
    assert.equal(plain.headers.get('content-encoding'), null);
    const traversal = await fetch(s.base + '/saas/ds/..%2F..%2Fpackage.json');
    assert.notEqual(traversal.status, 200);
  });

  await t.test('no broken internal links, scripts, styles or images on any public page', async () => {
    const seen = new Map();
    for (const [route] of PUBLIC_ROUTES) {
      const html = (await s.call('GET', route)).text;
      const refs = [...html.matchAll(/\s(?:href|src)="([^"#]+)(?:#[^"]*)?"/g)].map((m) => m[1].replace(s.base, ''))
        .filter((u) => u.startsWith('/') && !u.startsWith('//'));
      for (const ref of refs) {
        if (!seen.has(ref)) { const r = await fetch(s.base + ref, { redirect: 'manual' }); seen.set(ref, r.status); }
        assert.ok(seen.get(ref) < 400, `${route} links to ${ref} (${seen.get(ref)})`);
      }
      for (const m of html.matchAll(/href="#([^"]+)"/g)) assert.ok(html.includes(`id="${m[1]}"`), `${route} anchor #${m[1]} has no target`);
    }
    assert.ok(seen.size > 30, `only ${seen.size} links checked`);
  });

  await t.test('icons referenced by pages exist in the sprite', async () => {
    const sprite = fs.readFileSync(path.join(DS, 'icons.svg'), 'utf8');
    for (const f of fs.readdirSync(SITE)) {
      for (const m of fs.readFileSync(path.join(SITE, f), 'utf8').matchAll(/icons\.svg[^"]*#([a-z-]+)/g)) assert.ok(sprite.includes(`id="${m[1]}"`), `${f} uses missing icon ${m[1]}`);
    }
  });
});

test('testimonials file holds only complete, approved entries', () => {
  const list = JSON.parse(fs.readFileSync(path.join(ROOT, 'saas', 'content', 'testimonials.json'), 'utf8'));
  assert.ok(Array.isArray(list));
  for (const q of list) if (q.approved === true) assert.ok(q.quote && q.name && q.business, 'approved testimonial missing quote, name or business');
});
