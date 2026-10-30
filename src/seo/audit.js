// Phase 06 Module A: the technical SEO audit engine.
//
// crawlSite() reads a website the way a polite search crawler does: robots.txt first, then the sitemap(s) and the
// pages reachable by links from the start page, same origin only, a page budget, a timeout per request, redirects
// followed by hand so every hop is recorded. A subscriber's site must be a public host; the platform's own site may be
// read from this server. auditCrawl() turns a crawl into findings. It is pure and deterministic.
//
// Honesty rules: a check that cannot be measured from the HTML says "not measured" (Core Web Vitals without PageSpeed
// field or lab data, external links that could not be reached). Nothing is guessed.
import crypto from 'node:crypto';
import { extractJsonLd, robotsAllows, publicHost } from '../visibility.js';

const UA = 'SuperProSEOAudit/1.0 (+https://superpro.ai/answers.html)';
const strip = (h) => String(h || '').replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<noscript[\s\S]*?<\/noscript>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&#39;|&rsquo;/g, "'").replace(/\s+/g, ' ').trim();
const attr = (tag, name) => { const m = String(tag).match(new RegExp(`\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i')); return m ? (m[1] ?? m[2] ?? m[3]) : undefined; };
const tags = (html, name) => [...String(html).matchAll(new RegExp(`<${name}\\b[^>]*>`, 'gi'))].map((m) => m[0]);
const metaContent = (html, key, val) => { for (const t of tags(html, 'meta')) if (String(attr(t, key) || '').toLowerCase() === val) return attr(t, 'content') ?? ''; return null; };
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex').slice(0, 16);
const LANG = /^(x-default|[a-z]{2,3}(-[A-Za-z]{2,4})?(-[A-Za-z0-9]{2,8})?)$/;

/* ------------------------------------------------------------------ parsing --- */
export function parsePage(html, url) {
  const title = strip((String(html).match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || '');
  const titles = (String(html).match(/<title[^>]*>/gi) || []).length;
  const description = metaContent(html, 'name', 'description');
  const robots = (metaContent(html, 'name', 'robots') || '').toLowerCase();
  const viewport = metaContent(html, 'name', 'viewport');
  const canonicalTag = tags(html, 'link').find((t) => /rel\s*=\s*["']?canonical/i.test(t));
  let canonical = null; if (canonicalTag) { try { canonical = new URL(attr(canonicalTag, 'href') || '', url).href; } catch { canonical = 'invalid'; } }
  const hreflang = tags(html, 'link').filter((t) => /rel\s*=\s*["']?alternate/i.test(t) && attr(t, 'hreflang')).map((t) => { let href = null; try { href = new URL(attr(t, 'href') || '', url).href; } catch { /* invalid */ } return { lang: attr(t, 'hreflang'), href }; });
  const headings = [...String(html).matchAll(/<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1>/gi)].map((m) => ({ level: Number(m[1]), text: strip(m[2]) }));
  const links = [];
  for (const m of String(html).matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)) {
    const href = attr(' ' + m[1], 'href'); if (!href || /^(#|javascript:|mailto:|tel:|sms:|data:)/i.test(href.trim())) continue;
    let abs; try { abs = new URL(href, url); } catch { links.push({ href, abs: null, text: strip(m[2]).slice(0, 120), invalid: true }); continue; }
    abs.hash = '';
    links.push({ href, abs: abs.href, text: strip(m[2]).slice(0, 120) || (attr(' ' + m[1], 'aria-label') || ''), nofollow: /nofollow/i.test(attr(' ' + m[1], 'rel') || '') });
  }
  const images = tags(html, 'img').map((t) => ({ src: attr(t, 'src') || attr(t, 'data-src') || '', alt: attr(t, 'alt'), width: attr(t, 'width'), height: attr(t, 'height'), loading: attr(t, 'loading'), srcset: attr(t, 'srcset') }));
  const ld = extractJsonLd(String(html));
  const text = strip(String(html).replace(/<(nav|footer|header)\b[\s\S]*?<\/\1>/gi, ' '));
  const lang = (String(html).match(/<html\b[^>]*\blang\s*=\s*["']?([A-Za-z-]+)/i) || [])[1] || null;
  const mixed = (String(html).match(/<(img|script|link|iframe|source|video|audio|embed)\b[^>]*\b(?:src|href|srcset)\s*=\s*["']http:\/\//gi) || []).length;
  const words = text ? text.split(' ').length : 0;
  return { url, title, titles, description, robots, viewport, canonical, hreflang, headings, links, images, ld, lang, text, words, mixed_content: mixed, fixed_width: /<meta[^>]+viewport[^>]+width\s*=\s*\d{3,}/i.test(String(html)), text_hash: words > 30 ? sha(text.toLowerCase()) : null };
}

export function parseSitemap(xml) {
  const s = String(xml || '');
  const index = /<sitemapindex\b/i.test(s);
  const locs = [...s.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)].map((m) => m[1].replace(/&amp;/g, '&'));
  const lastmods = [...s.matchAll(/<lastmod>\s*([^<\s]+)\s*<\/lastmod>/gi)].map((m) => m[1]);
  return { index, locs, lastmods, valid: /<(urlset|sitemapindex)\b/i.test(s) };
}

/* ------------------------------------------------------------------ crawling --- */
export async function crawlSite(startUrl, { fetchImpl = globalThis.fetch, resolveHost = publicHost, maxPages = 40, timeoutMs = 8000, ownSite = false, checkExternal = 15, concurrency = 4, scopePath = '/', now = () => Date.now() } = {}) {
  let start; try { start = new URL(startUrl); } catch { return { ok: false, error: 'The website address is not valid.' }; }
  if (!/^https?:$/.test(start.protocol)) return { ok: false, error: 'Only http and https websites can be audited.' };
  if (!ownSite && !(await resolveHost(start.hostname))) return { ok: false, error: 'Only public websites can be audited.' };
  const started = now();
  const allowedTarget = async (value) => {
    let target; try { target = new URL(value); } catch { return false; }
    if (!/^https?:$/.test(target.protocol)) return false;
    if (ownSite && target.origin === start.origin) return true;
    try { return Boolean(await resolveHost(target.hostname)); } catch { return false; }
  };
  async function get(url, { method = 'GET', accept = 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.5' } = {}) {
    const chain = []; let current = url;
    for (let hop = 0; hop < 6; hop++) {
      if (!(await allowedTarget(current))) return { url, status: 0, chain, final_url: current, error: 'Blocked non-public audit target', ms: 0 };
      const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), timeoutMs), t0 = now();
      try {
        const r = await fetchImpl(current, { method, redirect: 'manual', signal: ctl.signal, headers: { 'user-agent': UA, accept } });
        const ms = now() - t0;
        if (r.status >= 300 && r.status < 400 && r.headers.get('location')) {
          let next; try { next = new URL(r.headers.get('location'), current).href; } catch { return { url, status: r.status, chain, final_url: current, error: 'Redirect to an invalid address', ms }; }
          chain.push({ from: current, to: next, status: r.status });
          if (chain.some((c, i) => i < chain.length - 1 && c.from === next)) return { url, status: r.status, chain, final_url: next, error: 'Redirect loop', ms };
          current = next; continue;
        }
        const type = r.headers.get('content-type') || '';
        const body = method === 'HEAD' ? '' : (await r.text()).slice(0, 2_000_000);
        return { url, status: r.status, chain, final_url: current, content_type: type, body, bytes: Number(r.headers.get('content-length')) || body.length, ms, x_robots: (r.headers.get('x-robots-tag') || '').toLowerCase(), hsts: Boolean(r.headers.get('strict-transport-security')) };
      } catch (e) {
        return { url, status: 0, chain, final_url: current, error: e.name === 'AbortError' ? 'Timed out' : 'Could not connect', ms: now() - t0 };
      } finally { clearTimeout(t); }
    }
    return { url, status: 0, chain, final_url: current, error: 'Too many redirects' };
  }

  const origin = start.origin;
  // A site that lives under a path of a shared host (a Website Builder site at /sites/name/) is crawled only inside that path.
  const prefix = scopePath.endsWith('/') ? scopePath : scopePath + '/';
  const inScope = (u) => { try { const x = new URL(u); return x.origin === origin && (prefix === '/' || x.pathname === prefix.slice(0, -1) || x.pathname.startsWith(prefix)); } catch { return false; } };
  const robots = await get(origin + (prefix === '/' ? '/robots.txt' : prefix + 'robots.txt'), { accept: 'text/plain' });
  const robotsText = robots.status === 200 ? robots.body : '';
  const allowed = (u) => !robotsText || robotsAllows(robotsText, new URL(u).pathname);
  const sitemapUrls = [...robotsText.matchAll(/^\s*sitemap\s*:\s*(\S+)/gim)].map((m) => m[1]);
  if (!sitemapUrls.length) sitemapUrls.push(origin + (prefix === '/' ? '/sitemap.xml' : prefix + 'sitemap.xml'));
  const sitemaps = [], sitemapLocs = new Set();
  for (const sm of [...new Set(sitemapUrls)].slice(0, 5)) {
    const r = await get(sm, { accept: 'application/xml,text/xml' });
    const p = r.status === 200 ? parseSitemap(r.body) : { index: false, locs: [], lastmods: [], valid: false };
    sitemaps.push({ url: sm, status: r.status, valid: p.valid, index: p.index, count: p.locs.length, lastmods: p.lastmods.length });
    if (p.index) for (const child of p.locs.slice(0, 5)) { const c = await get(child, { accept: 'application/xml' }); const cp = c.status === 200 ? parseSitemap(c.body) : { locs: [], valid: false }; sitemaps.push({ url: child, status: c.status, valid: cp.valid, index: false, count: cp.locs.length }); cp.locs.forEach((l) => sitemapLocs.add(l)); }
    else p.locs.forEach((l) => sitemapLocs.add(l));
  }

  const queue = [{ url: start.href, depth: 0, from: null }], seen = new Set([start.href]), pages = [], blockedByRobots = [];
  for (const l of sitemapLocs) { try { const u = new URL(l); u.hash = ''; if (inScope(u.href) && !seen.has(u.href)) { seen.add(u.href); queue.push({ url: u.href, depth: 1, from: 'sitemap' }); } } catch { /* ignore invalid */ } }
  async function worker() {
    while (queue.length && pages.length + blockedByRobots.length < maxPages) {
      const item = queue.shift();
      if (!allowed(item.url)) { blockedByRobots.push(item.url); continue; }
      const r = await get(item.url);
      const page = { url: item.url, depth: item.depth, found_from: item.from, in_sitemap: sitemapLocs.has(item.url), status: r.status, error: r.error || null, redirects: r.chain, final_url: r.final_url, content_type: r.content_type || '', bytes: r.bytes || 0, ms: r.ms || 0, x_robots: r.x_robots || '', hsts: r.hsts || false };
      if (r.status === 200 && /html/i.test(r.content_type || '')) {
        const parsed = parsePage(r.body, r.final_url);
        Object.assign(page, { parsed });
        for (const l of parsed.links) {
          if (!l.abs) continue;
          const u = new URL(l.abs);
          if (inScope(u.href) && !seen.has(u.href) && !/\.(pdf|jpe?g|png|gif|webp|svg|zip|mp4|css|js)$/i.test(u.pathname)) { seen.add(u.href); queue.push({ url: u.href, depth: item.depth + 1, from: item.url }); }
        }
      }
      pages.push(page);
    }
  }
  await Promise.all(Array.from({ length: concurrency }, worker));

  // Internal links that point to pages outside the crawl budget are checked with a light request so broken links are found.
  const crawled = new Map(pages.map((p) => [p.url, p]));
  const internalTargets = new Set(), externalTargets = new Map();
  for (const p of pages) for (const l of p.parsed?.links || []) { if (!l.abs) continue; const u = new URL(l.abs); if (inScope(u.href)) internalTargets.add(u.href); else if (u.origin === origin) continue; else if (/^https?:$/.test(u.protocol) && !externalTargets.has(u.href)) externalTargets.set(u.href, p.url); }
  const linkStatus = {};
  for (const t of internalTargets) { if (crawled.has(t)) linkStatus[t] = crawled.get(t).status; }
  const unchecked = [...internalTargets].filter((t) => !(t in linkStatus)).slice(0, 30);
  for (const t of unchecked) { if (!allowed(t)) { linkStatus[t] = 'blocked'; continue; } const r = await get(t, { method: 'HEAD' }); linkStatus[t] = r.status === 405 ? (await get(t)).status : r.status; }
  const external = [];
  for (const [t, from] of [...externalTargets].slice(0, checkExternal)) {
    if (!ownSite && !(await resolveHost(new URL(t).hostname).catch(() => false))) { external.push({ url: t, from, status: null, note: 'Not a public address' }); continue; }
    const r = await get(t, { method: 'HEAD' });
    external.push({ url: t, from, status: r.status || null, note: r.status ? null : 'Could not be reached from the audit (not counted as broken)' });
  }
  return { ok: true, start: start.href, origin, scope_path: prefix, https: start.protocol === 'https:', robots: { status: robots.status, text: robotsText.slice(0, 20000) }, sitemaps, sitemap_urls: [...sitemapLocs], pages, blocked_by_robots: blockedByRobots, link_status: linkStatus, external_links: external, external_total: externalTargets.size, duration_ms: now() - started, budget: maxPages, truncated: queue.length > 0 };
}

/* ------------------------------------------------------------------ auditing --- */
const CATEGORY = {
  crawl: 'Crawlability', index: 'Indexability', robots: 'robots.txt', sitemap: 'XML sitemaps', canonical: 'Canonical URLs', redirects: 'Redirects', broken: 'Broken links', status: 'HTTP status codes',
  duplicate: 'Duplicate content', schema: 'Structured data', titles: 'Meta titles', descriptions: 'Meta descriptions', headings: 'Heading hierarchy', internal: 'Internal linking', images: 'Image optimisation',
  cwv: 'Core Web Vitals', mobile: 'Mobile usability', https: 'HTTPS', i18n: 'Internationalisation'
};
export const AUDIT_CATEGORIES = CATEGORY;
const REQUIRED = { LocalBusiness: ['name', 'address'], Organization: ['name', 'url'], FAQPage: ['mainEntity'], Article: ['headline', 'datePublished'], BlogPosting: ['headline', 'datePublished'], Product: ['name'], BreadcrumbList: ['itemListElement'], Service: ['name'], WebSite: ['name', 'url'] };
const BUSINESS_TYPES = /LocalBusiness|Plumber|Electrician|HomeAndConstructionBusiness|ProfessionalService|Store|AutoRepair|RoofingContractor|HVACBusiness|GeneralContractor|MovingCompany|CleaningService|LegalService|AccountingService|Dentist|MedicalBusiness/;

export function auditCrawl(crawl, { psi = null, now = Date.now() } = {}) {
  const checks = [];
  const add = (category, id, level, title, detail, urls = [], how = '') => checks.push({ category, category_name: CATEGORY[category], id, level, title, detail, urls: [...new Set(urls)].slice(0, 25), count: new Set(urls).size, how });
  if (!crawl?.ok) { add('crawl', 'unreachable', 'fix', 'The website could not be audited', crawl?.error || 'No answer from the website.'); return finish(checks, crawl, psi); }
  const pages = crawl.pages, html = pages.filter((p) => p.parsed), ok = html.filter((p) => p.status === 200);

  // Crawlability
  const startPage = pages[0];
  if (!startPage || startPage.status !== 200) add('crawl', 'start', 'fix', 'The start page did not load', `Status ${startPage?.status || 'no answer'}${startPage?.error ? ` (${startPage.error})` : ''}.`, [crawl.start], 'Make sure the home page answers with status 200.');
  else add('crawl', 'start', 'good', 'The start page loads', `${ok.length} page(s) read from links and the sitemap${crawl.truncated ? ` (stopped at the ${crawl.budget}-page budget)` : ''}.`);
  if (crawl.blocked_by_robots.length) add('crawl', 'robots_blocked', 'improve', 'Some pages are blocked by robots.txt', 'Search engines are asked not to read these. That is fine for private pages; check none of them should appear in search.', crawl.blocked_by_robots);
  const slow = ok.filter((p) => p.ms > 3000);
  if (slow.length) add('crawl', 'slow', 'improve', 'Some pages answer slowly', 'These took more than 3 seconds to answer the audit (server response time, not a Core Web Vitals measurement).', slow.map((p) => p.url), 'Check hosting, caching and server work on these pages.');
  const deep = ok.filter((p) => p.depth > 3 && p.found_from !== 'sitemap');
  if (deep.length) add('crawl', 'depth', 'improve', 'Some pages are more than 3 clicks from the home page', 'Pages buried deep are found less often.', deep.map((p) => p.url), 'Link to them from the home page, menus or hub pages.');

  // Indexability
  const noindex = ok.filter((p) => /noindex/.test(p.parsed.robots) || /noindex/.test(p.x_robots));
  const sitemapNoindex = noindex.filter((p) => p.in_sitemap);
  if (sitemapNoindex.length) add('index', 'sitemap_noindex', 'fix', 'Pages in the sitemap say "noindex"', 'The sitemap asks for these to be indexed while the page asks not to be. Search engines will not index them.', sitemapNoindex.map((p) => p.url), 'Remove noindex, or remove the page from the sitemap.');
  if (noindex.length) add('index', 'noindex', 'improve', 'Pages that ask not to be indexed', 'Check each is meant to stay out of search.', noindex.map((p) => p.url));
  if (startPage?.parsed && /noindex/.test(startPage.parsed.robots + startPage.x_robots)) add('index', 'home_noindex', 'fix', 'The home page asks not to be indexed', 'Search engines will not show the home page.', [startPage.url], 'Remove the noindex robots setting.');
  const indexable = ok.filter((p) => !/noindex/.test(p.parsed.robots + p.x_robots) && (!p.parsed.canonical || p.parsed.canonical === p.final_url));
  add('index', 'indexable', indexable.length ? 'good' : 'fix', `${indexable.length} indexable page(s) found`, 'Status 200, no noindex, and the page is its own canonical. Whether Google actually indexes them is only known from Search Console.');

  // robots.txt
  if (crawl.robots.status !== 200) add('robots', 'missing', 'improve', 'No robots.txt', `robots.txt answered ${crawl.robots.status || 'nothing'}. Without it every page may be crawled, which is usually fine, but it should point to the sitemap.`, [crawl.origin + '/robots.txt'], 'Add a robots.txt with a Sitemap line.');
  else {
    const t = crawl.robots.text;
    if (/^\s*disallow\s*:\s*\/\s*$/im.test(t) && /user-agent\s*:\s*\*/i.test(t)) add('robots', 'blocks_all', 'fix', 'robots.txt blocks the whole site', 'All crawlers are told not to read any page.', [crawl.origin + '/robots.txt'], 'Remove "Disallow: /" for user-agent *.');
    if (!/^\s*sitemap\s*:/im.test(t)) add('robots', 'no_sitemap_line', 'improve', 'robots.txt does not list the sitemap', '', [crawl.origin + '/robots.txt'], 'Add "Sitemap: https://your-site/sitemap.xml".');
    if (!checks.some((c) => c.category === 'robots')) add('robots', 'ok', 'good', 'robots.txt is present and points to the sitemap', '');
  }

  // XML sitemaps
  const validSm = crawl.sitemaps.filter((s) => s.status === 200 && s.valid);
  if (!validSm.length) add('sitemap', 'missing', 'fix', 'No valid XML sitemap', crawl.sitemaps.map((s) => `${s.url}: ${s.status || 'no answer'}${s.status === 200 && !s.valid ? ' (not a valid sitemap)' : ''}`).join('; '), crawl.sitemaps.map((s) => s.url), 'Publish /sitemap.xml listing every page you want found.');
  else {
    add('sitemap', 'present', 'good', `Sitemap lists ${crawl.sitemap_urls.length} address(es)`, '');
    const bad = pages.filter((p) => p.in_sitemap && (p.status !== 200 || p.redirects.length));
    if (bad.length) add('sitemap', 'bad_urls', 'fix', 'The sitemap lists addresses that redirect or fail', 'A sitemap should list only final addresses that answer 200.', bad.map((p) => p.url), 'Replace them with the final address, or remove them.');
    const orphanCandidates = indexable.filter((p) => !p.in_sitemap && p.depth > 0 && !new URL(p.url).search);
    if (orphanCandidates.length) add('sitemap', 'missing_urls', 'improve', 'Indexable pages missing from the sitemap', '', orphanCandidates.map((p) => p.url), 'Add them to the sitemap.');
    const foreign = crawl.sitemap_urls.filter((u) => { try { return new URL(u).origin !== crawl.origin; } catch { return true; } });
    if (foreign.length) add('sitemap', 'foreign', 'fix', 'The sitemap lists addresses on another domain or protocol', '', foreign);
  }

  // Canonical URLs
  const noCanon = ok.filter((p) => !p.parsed.canonical), badCanon = ok.filter((p) => p.parsed.canonical === 'invalid');
  const canonElsewhere = ok.filter((p) => p.parsed.canonical && p.parsed.canonical !== 'invalid' && p.parsed.canonical !== p.final_url);
  const canonBroken = canonElsewhere.filter((p) => { const s = crawl.link_status[p.parsed.canonical]; return s !== undefined && s !== 200; });
  if (badCanon.length) add('canonical', 'invalid', 'fix', 'Invalid canonical link', '', badCanon.map((p) => p.url));
  if (canonBroken.length) add('canonical', 'broken', 'fix', 'Canonical points to a page that does not load', '', canonBroken.map((p) => p.url));
  if (noCanon.length) add('canonical', 'missing', 'improve', 'Pages without a canonical link', 'A self-referencing canonical helps search engines pick the right address.', noCanon.map((p) => p.url), 'Add <link rel="canonical" href="this page\'s address">.');
  if (canonElsewhere.length) add('canonical', 'elsewhere', 'improve', 'Pages that name a different canonical', 'These ask search engines to index another address instead. Check that is intended.', canonElsewhere.map((p) => p.url));
  if (!noCanon.length && !badCanon.length && !canonBroken.length) add('canonical', 'ok', 'good', 'Canonical links are in place', '');

  // Redirects
  const chains = pages.filter((p) => p.redirects.length > 1), temp = pages.filter((p) => p.redirects.some((r) => [302, 303, 307].includes(r.status))), loops = pages.filter((p) => p.error === 'Redirect loop');
  if (loops.length) add('redirects', 'loop', 'fix', 'Redirect loops', '', loops.map((p) => p.url));
  if (chains.length) add('redirects', 'chain', 'improve', 'Redirect chains (more than one hop)', '', chains.map((p) => p.url), 'Redirect straight to the final address.');
  if (temp.length) add('redirects', 'temporary', 'improve', 'Temporary redirects', 'Use 301 or 308 for permanent moves so search engines transfer signals.', temp.map((p) => p.url));
  const toHttp = pages.filter((p) => p.redirects.some((r) => r.to.startsWith('http://')) && crawl.https);
  if (toHttp.length) add('redirects', 'downgrade', 'fix', 'Redirects from https to http', '', toHttp.map((p) => p.url));
  if (!chains.length && !temp.length && !loops.length) add('redirects', 'ok', 'good', 'No redirect chains or loops found', '');

  // Broken links and HTTP status codes
  const brokenTargets = Object.entries(crawl.link_status).filter(([, s]) => typeof s === 'number' && s >= 400).map(([u]) => u);
  const linkedFrom = (t) => html.filter((p) => p.parsed.links.some((l) => l.abs === t)).map((p) => p.url);
  if (brokenTargets.length) add('broken', 'internal', 'fix', `${brokenTargets.length} broken internal link target(s)`, brokenTargets.slice(0, 10).map((t) => `${t} (${crawl.link_status[t]}) linked from ${linkedFrom(t).slice(0, 3).join(', ')}`).join('; '), brokenTargets, 'Fix or remove the links, or redirect the old address.');
  else add('broken', 'internal', 'good', 'No broken internal links found', `${Object.keys(crawl.link_status).length} internal address(es) checked.`);
  const extBroken = crawl.external_links.filter((e) => e.status && e.status >= 400 && ![401, 403, 429].includes(e.status));
  const extUnknown = crawl.external_links.filter((e) => !e.status);
  if (extBroken.length) add('broken', 'external', 'improve', `${extBroken.length} broken external link(s)`, extBroken.map((e) => `${e.url} (${e.status}) on ${e.from}`).join('; '), extBroken.map((e) => e.from));
  if (extUnknown.length) add('broken', 'external_unknown', 'not_measured', `${extUnknown.length} external link(s) could not be checked`, 'The audit could not reach them, so they are not counted as broken.', extUnknown.map((e) => e.url));
  const invalidLinks = html.filter((p) => p.parsed.links.some((l) => l.invalid));
  if (invalidLinks.length) add('broken', 'invalid', 'fix', 'Links with invalid addresses', '', invalidLinks.map((p) => p.url));
  const s4 = pages.filter((p) => p.status >= 400 && p.status < 500), s5 = pages.filter((p) => p.status >= 500), s0 = pages.filter((p) => p.status === 0);
  if (s5.length) add('status', '5xx', 'fix', 'Server errors (5xx)', '', s5.map((p) => p.url));
  if (s4.length) add('status', '4xx', 'fix', 'Pages that answer 4xx', '', s4.map((p) => p.url));
  if (s0.length) add('status', 'no_answer', 'fix', 'Pages with no answer', s0.map((p) => `${p.url}: ${p.error}`).join('; '), s0.map((p) => p.url));
  const soft404 = ok.filter((p) => /(page not found|404|doesn.t exist|could not be found)/i.test(p.parsed.title) && p.parsed.words < 200);
  if (soft404.length) add('status', 'soft404', 'improve', 'Possible "soft 404" pages', 'These say "not found" but answer 200.', soft404.map((p) => p.url), 'Answer 404 or 410 for missing pages.');
  if (!s4.length && !s5.length && !s0.length) add('status', 'ok', 'good', 'Every crawled page answered 200 or a redirect', '');

  // Duplicate content
  const groupBy = (list, key) => { const m = new Map(); for (const p of list) { const k = key(p); if (!k) continue; (m.get(k) || m.set(k, []).get(k)).push(p.url); } return [...m.values()].filter((g) => g.length > 1); };
  const dupBody = groupBy(indexable, (p) => p.parsed.text_hash);
  if (dupBody.length) add('duplicate', 'body', 'fix', 'Pages with identical content', dupBody.map((g) => g.join(' = ')).join('; '), dupBody.flat(), 'Merge them, or point duplicates at one canonical page.');
  const near = nearDuplicates(indexable);
  if (near.length) add('duplicate', 'near', 'improve', 'Pages with very similar content', near.map(([a, b, s]) => `${a} ~ ${b} (${Math.round(s * 100)}% the same)`).join('; '), near.flatMap(([a, b]) => [a, b]));
  const wwwDup = pages.some((p) => /^https?:\/\/www\./.test(p.url)) && pages.some((p) => !/^https?:\/\/www\./.test(p.url));
  if (wwwDup) add('duplicate', 'host', 'improve', 'The site is reachable with and without "www"', '', [], 'Redirect one to the other.');
  if (!dupBody.length && !near.length) add('duplicate', 'ok', 'good', 'No duplicate pages found', '');

  // Structured data
  const ldPages = ok.filter((p) => p.parsed.ld.items.length), invalidLd = ok.filter((p) => p.parsed.ld.invalid);
  if (invalidLd.length) add('schema', 'invalid', 'fix', 'Structured data that is not valid JSON', '', invalidLd.map((p) => p.url), 'Fix the JSON-LD syntax.');
  const missing = [];
  for (const p of ldPages) for (const item of p.parsed.ld.items) { for (const t of [].concat(item?.['@type'] || [])) { const req = REQUIRED[t] || (BUSINESS_TYPES.test(t) ? REQUIRED.LocalBusiness : null); const miss = (req || []).filter((k) => item[k] === undefined || item[k] === ''); if (miss.length) missing.push(`${p.url}: ${t} is missing ${miss.join(', ')}`); } if (!item?.['@context'] && !p.parsed.ld.items.some((x) => x['@graph'])) missing.push(`${p.url}: no @context`); }
  if (missing.length) add('schema', 'incomplete', 'improve', 'Structured data is missing required fields', missing.slice(0, 10).join('; '), missing.map((m) => m.split(': ')[0]));
  const types = [...new Set(ok.flatMap((p) => p.parsed.ld.types))];
  if (!ldPages.length) add('schema', 'none', 'improve', 'No structured data found', 'Structured data helps search engines understand the business, FAQs and articles.', [], 'Add Organization or LocalBusiness JSON-LD to the home page.');
  else if (!invalidLd.length && !missing.length) add('schema', 'ok', 'good', `Structured data found: ${types.slice(0, 8).join(', ')}`, 'Eligibility for rich results is decided by Google.');

  // Meta titles
  const noTitle = ok.filter((p) => !p.parsed.title), longT = ok.filter((p) => p.parsed.title.length > 60), shortT = ok.filter((p) => p.parsed.title && p.parsed.title.length < 20), multiT = ok.filter((p) => p.parsed.titles > 1);
  const dupT = groupBy(indexable, (p) => p.parsed.title.toLowerCase());
  if (noTitle.length) add('titles', 'missing', 'fix', 'Pages without a title', '', noTitle.map((p) => p.url));
  if (dupT.length) add('titles', 'duplicate', 'fix', 'Pages that share the same title', dupT.map((g) => g.join(', ')).join('; '), dupT.flat(), 'Give every page its own title.');
  if (longT.length) add('titles', 'long', 'improve', 'Titles longer than 60 characters', 'Long titles are often cut off in results.', longT.map((p) => p.url));
  if (shortT.length) add('titles', 'short', 'improve', 'Titles shorter than 20 characters', '', shortT.map((p) => p.url));
  if (multiT.length) add('titles', 'multiple', 'fix', 'Pages with more than one title tag', '', multiT.map((p) => p.url));
  if (!noTitle.length && !dupT.length && !longT.length && !shortT.length) add('titles', 'ok', 'good', 'Titles are present, unique and a good length', '');

  // Meta descriptions
  const noD = ok.filter((p) => !p.parsed.description), longD = ok.filter((p) => (p.parsed.description || '').length > 160), shortD = ok.filter((p) => p.parsed.description && p.parsed.description.length < 70);
  const dupD = groupBy(indexable, (p) => (p.parsed.description || '').toLowerCase());
  if (noD.length) add('descriptions', 'missing', 'improve', 'Pages without a meta description', 'Search engines may write their own snippet instead.', noD.map((p) => p.url));
  if (dupD.length) add('descriptions', 'duplicate', 'improve', 'Pages that share a meta description', '', dupD.flat());
  if (longD.length) add('descriptions', 'long', 'improve', 'Descriptions longer than 160 characters', '', longD.map((p) => p.url));
  if (shortD.length) add('descriptions', 'short', 'improve', 'Descriptions shorter than 70 characters', '', shortD.map((p) => p.url));
  if (!noD.length && !dupD.length && !longD.length && !shortD.length) add('descriptions', 'ok', 'good', 'Meta descriptions are present and unique', '');

  // Heading hierarchy
  const noH1 = ok.filter((p) => !p.parsed.headings.some((h) => h.level === 1)), multiH1 = ok.filter((p) => p.parsed.headings.filter((h) => h.level === 1).length > 1);
  const skips = ok.filter((p) => p.parsed.headings.some((h, i, a) => i > 0 && h.level > a[i - 1].level + 1)), emptyH = ok.filter((p) => p.parsed.headings.some((h) => !h.text));
  if (noH1.length) add('headings', 'no_h1', 'fix', 'Pages without a main heading (h1)', '', noH1.map((p) => p.url));
  if (multiH1.length) add('headings', 'multi_h1', 'improve', 'Pages with more than one h1', '', multiH1.map((p) => p.url));
  if (skips.length) add('headings', 'skips', 'improve', 'Heading levels are skipped', 'For example an h2 followed by an h4. This affects screen readers and page structure.', skips.map((p) => p.url));
  if (emptyH.length) add('headings', 'empty', 'improve', 'Empty headings', '', emptyH.map((p) => p.url));
  if (!noH1.length && !multiH1.length && !skips.length) add('headings', 'ok', 'good', 'Every page has one h1 and an ordered heading structure', '');

  // Internal linking
  const inbound = new Map(ok.map((p) => [p.final_url, 0]));
  for (const p of html) for (const l of new Set(p.parsed.links.map((x) => x.abs))) if (inbound.has(l) && l !== p.final_url) inbound.set(l, inbound.get(l) + 1);
  const orphans = ok.filter((p) => p.depth > 0 && inbound.get(p.final_url) === 0);
  if (orphans.length) add('internal', 'orphans', 'improve', 'Orphan pages (no internal links point to them)', 'They were only found in the sitemap.', orphans.map((p) => p.url), 'Link to them from related pages.');
  const vague = html.filter((p) => p.parsed.links.some((l) => /^(click here|here|read more|more|link)$/i.test(l.text.trim())));
  if (vague.length) add('internal', 'anchor', 'improve', 'Links with vague text ("click here", "read more")', 'Descriptive link text helps people and search engines.', vague.map((p) => p.url));
  const dead = ok.filter((p) => !p.parsed.links.some((l) => l.abs && new URL(l.abs).origin === crawl.origin && l.abs !== p.final_url));
  if (dead.length) add('internal', 'dead_end', 'improve', 'Pages that link to no other page on the site', '', dead.map((p) => p.url));
  if (!orphans.length && !vague.length && !dead.length) add('internal', 'ok', 'good', 'Pages are linked together well', '');

  // Image optimisation
  const imgs = ok.flatMap((p) => p.parsed.images.map((i) => ({ ...i, page: p.url })));
  const noAlt = imgs.filter((i) => i.alt === undefined), noDim = imgs.filter((i) => !i.width || !i.height), legacy = imgs.filter((i) => /\.(jpe?g|png|gif|bmp)(\?|$)/i.test(i.src) && !i.srcset), noLazy = ok.filter((p) => p.parsed.images.length > 3 && p.parsed.images.slice(3).some((i) => i.loading !== 'lazy'));
  if (!imgs.length) add('images', 'none', 'good', 'No images to optimise', '');
  else {
    if (noAlt.length) add('images', 'alt', 'fix', `${noAlt.length} image(s) without alt text`, 'Alt text describes images for screen readers and image search. Decorative images use alt="".', noAlt.map((i) => i.page), 'Add alt text; the Content Studio can suggest it.');
    if (noDim.length) add('images', 'dimensions', 'improve', `${noDim.length} image(s) without width and height`, 'Missing dimensions make the layout jump while loading (layout shift).', noDim.map((i) => i.page));
    if (legacy.length) add('images', 'format', 'improve', `${legacy.length} image(s) in JPEG/PNG/GIF without responsive sizes`, 'WebP or AVIF with srcset is usually much smaller.', legacy.map((i) => i.page));
    if (noLazy.length) add('images', 'lazy', 'improve', 'Images further down the page load straight away', '', noLazy.map((p) => p.url), 'Add loading="lazy" to images below the first screen.');
    if (!noAlt.length && !noDim.length && !legacy.length) add('images', 'ok', 'good', `${imgs.length} image(s) have alt text and dimensions`, '');
  }

  // Core Web Vitals: only from PageSpeed Insights (Google's field data from real Chrome users, or lab data).
  if (!psi?.length) add('cwv', 'not_measured', 'not_measured', 'Core Web Vitals not measured', 'Connect PageSpeed Insights in the Google Integration Centre and run it. Super Pro does not estimate these.');
  else for (const r of psi) {
    const field = r.field || {}, lab = r.lab || {};
    const src = field.lcp_ms !== undefined ? 'field' : 'lab';
    const lcp = field.lcp_ms ?? lab.lcp_ms, cls = field.cls ?? lab.cls, inp = field.inp_ms;
    const poor = (lcp > 4000) || (cls > 0.25) || (inp > 500), needs = (lcp > 2500) || (cls > 0.1) || (inp > 200);
    add('cwv', 'psi_' + r.strategy, poor ? 'fix' : needs ? 'improve' : 'good', `${r.strategy === 'mobile' ? 'Mobile' : 'Desktop'} Core Web Vitals (${src === 'field' ? 'real-user field data' : 'lab test, not real users'})`,
      `LCP ${lcp !== undefined ? (lcp / 1000).toFixed(1) + ' s' : 'not reported'}, CLS ${cls !== undefined ? cls : 'not reported'}${src === 'field' ? `, INP ${inp !== undefined ? inp + ' ms' : 'not reported'}` : ''}. Measured by PageSpeed Insights ${new Date(r.fetched_at).toLocaleDateString('en-AU')}.`, [r.url]);
  }

  // Mobile usability (static checks from the HTML; field experience comes from PageSpeed)
  const noVp = ok.filter((p) => !p.parsed.viewport), fixed = ok.filter((p) => p.parsed.fixed_width), noZoom = ok.filter((p) => /user-scalable\s*=\s*(no|0)|maximum-scale\s*=\s*1(\.0)?\b/i.test(p.parsed.viewport || ''));
  if (noVp.length) add('mobile', 'viewport', 'fix', 'Pages without a mobile viewport', '', noVp.map((p) => p.url), 'Add <meta name="viewport" content="width=device-width, initial-scale=1">.');
  if (fixed.length) add('mobile', 'fixed', 'fix', 'Pages with a fixed-width viewport', '', fixed.map((p) => p.url));
  if (noZoom.length) add('mobile', 'zoom', 'improve', 'Pages that stop people zooming', 'This makes text hard to read for some people.', noZoom.map((p) => p.url));
  if (!noVp.length && !fixed.length && !noZoom.length) add('mobile', 'ok', 'good', 'Pages are set up for phones', 'Based on the page code. Real phone experience comes from PageSpeed Insights.');

  // HTTPS
  if (!crawl.https) add('https', 'http', 'fix', 'The site is not served over https', '', [crawl.start], 'Install a certificate and redirect http to https.');
  else {
    const mixed = ok.filter((p) => p.parsed.mixed_content > 0), httpLinks = html.filter((p) => p.parsed.links.some((l) => l.abs?.startsWith('http://' + new URL(crawl.origin).host)));
    if (mixed.length) add('https', 'mixed', 'fix', 'Secure pages load insecure files (mixed content)', '', mixed.map((p) => p.url));
    if (httpLinks.length) add('https', 'http_links', 'improve', 'Internal links still use http://', '', httpLinks.map((p) => p.url));
    if (!startPage?.hsts) add('https', 'hsts', 'improve', 'No HSTS header', 'Strict-Transport-Security tells browsers to always use https.', [crawl.start]);
    if (!mixed.length && !httpLinks.length) add('https', 'ok', 'good', 'Served over https with no mixed content', '');
  }

  // Internationalisation (only where the site declares languages)
  const noLang = ok.filter((p) => !p.parsed.lang), withHreflang = ok.filter((p) => p.parsed.hreflang.length);
  if (noLang.length) add('i18n', 'lang', 'improve', 'Pages without a language attribute', '', noLang.map((p) => p.url), 'Add lang="en-AU" (or the right language) to the html tag.');
  if (!withHreflang.length) add('i18n', 'single', 'info', 'Single-language site', 'No hreflang alternates are declared, which is correct for a site in one language.');
  else {
    const badCode = withHreflang.filter((p) => p.parsed.hreflang.some((h) => !LANG.test(h.lang)));
    const selfMissing = withHreflang.filter((p) => !p.parsed.hreflang.some((h) => h.href === p.final_url));
    const byUrl = new Map(ok.map((p) => [p.final_url, p]));
    const noReturn = withHreflang.filter((p) => p.parsed.hreflang.some((h) => h.href && byUrl.has(h.href) && !byUrl.get(h.href).parsed.hreflang.some((b) => b.href === p.final_url)));
    if (badCode.length) add('i18n', 'codes', 'fix', 'Invalid hreflang language codes', '', badCode.map((p) => p.url));
    if (selfMissing.length) add('i18n', 'self', 'improve', 'hreflang sets that do not include the page itself', '', selfMissing.map((p) => p.url));
    if (noReturn.length) add('i18n', 'return', 'fix', 'hreflang links without a return link', 'Alternates must link to each other.', noReturn.map((p) => p.url));
    if (!badCode.length && !selfMissing.length && !noReturn.length) add('i18n', 'ok', 'good', 'hreflang alternates are consistent', '');
  }
  return finish(checks, crawl, psi, now);
}

function nearDuplicates(pages) {
  const shingles = (t) => { const w = t.toLowerCase().split(' '); const s = new Set(); for (let i = 0; i + 5 <= w.length; i += 2) s.add(w.slice(i, i + 5).join(' ')); return s; };
  const sets = pages.filter((p) => p.parsed.words >= 120).slice(0, 60).map((p) => [p.url, shingles(p.parsed.text)]), out = [];
  for (let i = 0; i < sets.length; i++) for (let j = i + 1; j < sets.length; j++) {
    const [a, A] = sets[i], [b, B] = sets[j]; let inter = 0; for (const x of A) if (B.has(x)) inter++;
    const sim = inter / (A.size + B.size - inter || 1);
    if (sim >= 0.8 && sim < 1) out.push([a, b, sim]);
  }
  return out.slice(0, 20);
}

function finish(checks, crawl, psi, now = Date.now()) {
  const W = { fix: 6, improve: 2 };
  const byCat = {};
  for (const c of checks) (byCat[c.category] ||= []).push(c);
  const categories = Object.keys(CATEGORY).map((k) => {
    const list = byCat[k] || [], fixes = list.filter((c) => c.level === 'fix').length, improves = list.filter((c) => c.level === 'improve').length;
    const measured = list.some((c) => !['not_measured', 'info'].includes(c.level));
    return { id: k, name: CATEGORY[k], status: !measured ? (list.some((c) => c.level === 'info') ? 'info' : 'not_measured') : fixes ? 'fix' : improves ? 'improve' : 'good', fixes, improves };
  });
  const penalty = checks.reduce((s, c) => s + (W[c.level] || 0) * Math.min(3, Math.max(1, Math.ceil((c.count || 1) / 5))), 0);
  const score = crawl?.ok ? Math.max(0, Math.min(100, 100 - penalty)) : 0;
  const pages = (crawl?.pages || []).map((p) => ({ url: p.url, status: p.status, depth: p.depth, in_sitemap: p.in_sitemap, redirects: p.redirects.length, title: p.parsed?.title || '', words: p.parsed?.words || 0, ms: p.ms, error: p.error }));
  return { score, score_note: 'A Super Pro score from the issues found in this audit, not a Google measure.', counts: { fix: checks.filter((c) => c.level === 'fix').length, improve: checks.filter((c) => c.level === 'improve').length, good: checks.filter((c) => c.level === 'good').length, not_measured: checks.filter((c) => c.level === 'not_measured').length, pages: pages.length }, categories, checks, pages, psi_used: Boolean(psi?.length), audited_at: new Date(now).toISOString() };
}
