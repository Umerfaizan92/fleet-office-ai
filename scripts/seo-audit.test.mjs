// Phase 06 Module A: the technical audit engine against real HTTP servers (a fixture site with known problems, and the
// Super Pro public site served by the real application).
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { crawlSite, auditCrawl, parsePage, parseSitemap } from '../src/seo/audit.js';
import { startServer } from './test-server.mjs';

function fixtureSite() {
  const page = (title, body, head = '') => `<!doctype html><html lang="en-AU"><head><title>${title}</title><meta name="viewport" content="width=device-width, initial-scale=1">${head}</head><body>${body}</body></html>`;
  const lorem = 'Our plumbers fix burst pipes, blocked drains and hot water systems across Perth with upfront prices and tidy work every time we visit your home or business. '.repeat(8);
  let base = '';
  const routes = {
    '/robots.txt': [200, 'text/plain', () => `User-agent: *\nDisallow: /private/\nSitemap: ${base}/sitemap.xml\n`],
    '/sitemap.xml': [200, 'application/xml', () => `<?xml version="1.0"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>${base}/</loc></url><url><loc>${base}/services</loc></url><url><loc>${base}/old</loc></url><url><loc>${base}/orphan</loc></url><url><loc>${base}/hidden</loc></url><url><loc>${base}/copy</loc></url></urlset>`],
    '/': [200, 'text/html', () => page('Harbour Plumbing | Perth plumbers for burst pipes and drains', `<h1>Perth plumbers</h1><h3>Skipped level</h3><p>${lorem}</p><a href="/services">Our services</a> <a href="/missing">click here</a> <a href="/private/x">Staff</a> <a href="https://unreachable.invalid/x">Partner</a><img src="/a.jpg"><img src="/b.webp" alt="Van" width="10" height="10">`, `<meta name="description" content="Licensed Perth plumbers for burst pipes, blocked drains and hot water. Upfront prices, same-day service across the metro area."><link rel="canonical" href="${base}/"><script type="application/ld+json">{"@context":"https://schema.org","@type":"Plumber","name":"Harbour Plumbing"}</script>`)],
    '/services': [200, 'text/html', () => page('Services', `<h1>Services</h1><h1>Twice</h1><p>${lorem}</p><a href="/">Home</a>`, `<link rel="canonical" href="${base}/services"><script type="application/ld+json">{broken json</script>`)],
    '/copy': [200, 'text/html', () => page('Services', `<h1>Copy</h1><p>${lorem}</p><a href="/">Home</a>`)],
    '/old': [301, null, () => `${base}/old2`],
    '/old2': [302, null, () => `${base}/services`],
    '/orphan': [200, 'text/html', () => page('Orphan page with no links pointing at it', '<h1>Orphan</h1><p>Short</p>')],
    '/hidden': [200, 'text/html', () => page('Hidden page that should not be indexed', '<h1>Hidden</h1>', '<meta name="robots" content="noindex">')],
    '/missing': [404, 'text/html', () => 'Not found']
  };
  const server = http.createServer((req, res) => {
    const r = routes[req.url.split('?')[0]];
    if (!r) { res.writeHead(404, { 'content-type': 'text/html' }); return res.end('nope'); }
    const [status, type, body] = r;
    if (status >= 300 && status < 400) { res.writeHead(status, { location: body() }); return res.end(); }
    res.writeHead(status, { 'content-type': type }); res.end(req.method === 'HEAD' ? '' : body());
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => { base = `http://127.0.0.1:${server.address().port}`; resolve({ base, close: () => new Promise((r) => server.close(r)) }); }));
}
const find = (a, cat, id) => a.checks.find((c) => c.category === cat && c.id === id);

test('fixture site: every Module A category is reported, with the planted problems found', async (t) => {
  const site = await fixtureSite(); t.after(site.close);
  const fixtureFetch = (url, options) => new URL(url).hostname === 'unreachable.invalid'
    ? Promise.reject(new TypeError('Fixture external host cannot be reached'))
    : globalThis.fetch(url, options);
  const crawl = await crawlSite(site.base + '/', { fetchImpl: fixtureFetch, ownSite: true, maxPages: 20, checkExternal: 5 });
  assert.equal(crawl.ok, true);
  const a = auditCrawl(crawl);
  const cats = a.categories.map((c) => c.id);
  for (const c of ['crawl', 'index', 'robots', 'sitemap', 'canonical', 'redirects', 'broken', 'status', 'duplicate', 'schema', 'titles', 'descriptions', 'headings', 'internal', 'images', 'cwv', 'mobile', 'https', 'i18n']) assert.ok(cats.includes(c), c);
  assert.equal(find(a, 'crawl', 'robots_blocked').level, 'improve'); assert.ok(find(a, 'crawl', 'robots_blocked').urls.some((u) => u.endsWith('/private/x')), 'robots.txt honoured: private page not fetched');
  assert.equal(find(a, 'index', 'sitemap_noindex').level, 'fix');
  assert.equal(find(a, 'sitemap', 'bad_urls').level, 'fix', 'sitemap lists a redirecting address');
  assert.equal(find(a, 'redirects', 'chain').level, 'improve'); assert.equal(find(a, 'redirects', 'temporary').level, 'improve');
  assert.equal(find(a, 'broken', 'internal').level, 'fix'); assert.match(find(a, 'broken', 'internal').detail, /\/missing \(404\)/);
  assert.equal(find(a, 'broken', 'external_unknown').level, 'not_measured', 'unreachable external links are not called broken');
  assert.equal(find(a, 'duplicate', 'body').level, 'fix', '/services and /copy have the same text');
  assert.equal(find(a, 'titles', 'duplicate').level, 'fix');
  assert.equal(find(a, 'schema', 'invalid').level, 'fix');
  assert.equal(find(a, 'headings', 'multi_h1').level, 'improve'); assert.equal(find(a, 'headings', 'skips').level, 'improve');
  assert.equal(find(a, 'internal', 'orphans').level, 'improve'); assert.ok(find(a, 'internal', 'orphans').urls.some((u) => u.endsWith('/orphan')));
  assert.equal(find(a, 'internal', 'anchor').level, 'improve');
  assert.equal(find(a, 'images', 'alt').level, 'fix'); assert.equal(find(a, 'images', 'dimensions').level, 'improve');
  assert.equal(find(a, 'cwv', 'not_measured').level, 'not_measured', 'Core Web Vitals are never guessed');
  assert.equal(find(a, 'https', 'http').level, 'fix');
  assert.equal(find(a, 'i18n', 'single').level, 'info');
  assert.equal(find(a, 'descriptions', 'missing').level, 'improve');
  assert.ok(a.score < 70, 'many problems lower the score');
  assert.match(a.score_note, /not a Google measure/);
});

test('PageSpeed data, when present, is reported as field or lab and judged against Google thresholds', () => {
  const crawl = { ok: true, start: 'https://x.test/', origin: 'https://x.test', https: true, robots: { status: 200, text: 'Sitemap: https://x.test/sitemap.xml' }, sitemaps: [], sitemap_urls: [], pages: [], blocked_by_robots: [], link_status: {}, external_links: [], budget: 10 };
  const a = auditCrawl(crawl, { psi: [{ url: 'https://x.test/', strategy: 'mobile', field: { lcp_ms: 4500, cls: 0.05, inp_ms: 150 }, fetched_at: '2026-10-30T00:00:00Z' }, { url: 'https://x.test/', strategy: 'desktop', lab: { lcp_ms: 1800, cls: 0.02 }, fetched_at: '2026-10-30T00:00:00Z' }] });
  assert.equal(find(a, 'cwv', 'psi_mobile').level, 'fix'); assert.match(find(a, 'cwv', 'psi_mobile').title, /real-user field data/);
  assert.equal(find(a, 'cwv', 'psi_desktop').level, 'good'); assert.match(find(a, 'cwv', 'psi_desktop').title, /lab test, not real users/);
});

test('hreflang: invalid codes and missing return links are found', () => {
  const page = (url, links) => ({ url, final_url: url, status: 200, depth: 0, redirects: [], in_sitemap: false, x_robots: '', parsed: parsePage(`<html lang="en"><head><title>A title long enough here</title>${links}</head><body><h1>x</h1><a href="/b">b</a></body></html>`, url) });
  const pages = [page('https://x.test/', '<link rel="alternate" hreflang="en-AU" href="https://x.test/"><link rel="alternate" hreflang="english" href="https://x.test/fr">'), page('https://x.test/fr', '<link rel="alternate" hreflang="fr" href="https://x.test/fr">')];
  const a = auditCrawl({ ok: true, start: 'https://x.test/', origin: 'https://x.test', https: true, robots: { status: 200, text: '' }, sitemaps: [], sitemap_urls: [], pages, blocked_by_robots: [], link_status: {}, external_links: [], budget: 10 });
  assert.equal(find(a, 'i18n', 'codes').level, 'fix');
  assert.equal(find(a, 'i18n', 'return').level, 'fix');
});

test('parsers: sitemap index and page facts', () => {
  const sm = parseSitemap('<sitemapindex><sitemap><loc>https://x.test/a.xml</loc></sitemap></sitemapindex>');
  assert.equal(sm.index, true); assert.deepEqual(sm.locs, ['https://x.test/a.xml']);
  const p = parsePage('<html lang="en-AU"><head><title>T</title><meta name="robots" content="NOINDEX"><link rel="canonical" href="/c"></head><body><img src="http://cdn.test/a.png"><a href="tel:1">call</a><a href="/x#y">x</a></body></html>', 'https://x.test/p');
  assert.equal(p.robots, 'noindex'); assert.equal(p.canonical, 'https://x.test/c'); assert.equal(p.mixed_content, 1); assert.deepEqual(p.links.map((l) => l.abs), ['https://x.test/x']);
});

test('the real Super Pro public site, served by the application, audits without crawl errors', async (t) => {
  const s = await startServer(); t.after(() => s.stop());
  const crawl = await crawlSite(s.base + '/', { ownSite: true, maxPages: 25, checkExternal: 0 });
  assert.equal(crawl.ok, true);
  const a = auditCrawl(crawl);
  assert.equal(find(a, 'crawl', 'start').level, 'good');
  assert.ok(a.counts.pages >= 5, `read ${a.counts.pages} pages`);
  assert.ok(crawl.robots.status === 200 && /Sitemap:/.test(crawl.robots.text));
  assert.ok(crawl.sitemaps.some((x) => x.valid), 'the sitemap is valid');
  assert.ok(!crawl.pages.some((p) => p.url.includes('/office/') || p.url.includes('/api/')), 'robots.txt keeps the audit out of private areas');
  const s5 = find(a, 'status', '5xx'); assert.ok(!s5, 'no server errors on the public site');
});

test('crawler refuses private redirect and sitemap targets before fetching them', async () => {
  const fetched=[];
  const fetchImpl=async(url)=>{
    fetched.push(url);
    if(url.endsWith('/robots.txt'))return new Response('User-agent: *\nSitemap: http://169.254.169.254/metadata\n');
    if(url==='https://public.example/')return new Response('',{status:302,headers:{location:'http://127.0.0.1/private'}});
    throw new Error('Blocked target must never be fetched');
  };
  const crawl=await crawlSite('https://public.example/',{fetchImpl,resolveHost:async host=>host==='public.example',maxPages:1,checkExternal:0});
  assert.equal(crawl.ok,true);
  assert.deepEqual(fetched,['https://public.example/robots.txt','https://public.example/']);
  assert.match(crawl.pages[0].error,/Blocked non-public/);
  assert.equal(crawl.sitemaps[0].status,0);
});

test('own-site permission does not extend to another origin in a redirect', async()=>{
  const fetched=[];
  const fetchImpl=async url=>{fetched.push(url);if(url.endsWith('/robots.txt'))return new Response('');if(url.endsWith('/sitemap.xml'))return new Response('<urlset></urlset>');return new Response('',{status:302,headers:{location:'http://169.254.169.254/metadata'}});};
  const crawl=await crawlSite('http://127.0.0.1:12345/',{ownSite:true,fetchImpl,resolveHost:async()=>false,maxPages:1,checkExternal:0});
  assert.equal(crawl.ok,true);assert.ok(fetched.every(url=>url.startsWith('http://127.0.0.1:12345/')));assert.match(crawl.pages[0].error,/Blocked non-public/);
});
