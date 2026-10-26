// Weekly SEO and AI-search (GEO) check of Super Pro's own public pages, with an optional, polite competitor comparison.
// Own pages are read from disk. Competitor pages are fetched only when the operator lists them, over https, honouring robots.txt.
// No scraping of logged-in or private pages, and nothing here touches any subscriber's data.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import dns from 'node:dns/promises';
import net from 'node:net';
import { z } from 'zod';

const iso = () => new Date().toISOString();
const DAY = 86400000;
const UA = 'SuperProVisibilityCheck/1.0';
export const AI_CRAWLERS = ['GPTBot', 'ClaudeBot', 'PerplexityBot', 'Google-Extended', 'OAI-SearchBot'];
const strip = (h) => String(h || '').replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/&nbsp;|&amp;/g, ' ').replace(/\s+/g, ' ').trim();
const attr = (tag, name) => (tag.match(new RegExp(`${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, 'i')) || []).slice(1).find((x) => x !== undefined);
const metas = (html) => [...html.matchAll(/<meta\b[^>]*>/gi)].map((m) => m[0]);
const metaBy = (html, key, val) => { for (const m of metas(html)) if (String(attr(m, key) || '').toLowerCase() === val) return attr(m, 'content') || ''; return null; };

export function extractJsonLd(html) {
  const out = []; let bad = 0;
  for (const m of html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try { const j = JSON.parse(m[1]); (Array.isArray(j) ? j : j['@graph'] || [j]).forEach((x) => out.push(x)); } catch { bad += 1; }
  }
  return { items: out, invalid: bad, types: out.flatMap((x) => [].concat(x?.['@type'] || [])) };
}

// Returns { facts, findings[] } for one page of HTML. Each finding: {id, level: 'fix'|'improve'|'good', text}.
export function analysePage(html, { url = '', expectedPrices = [] } = {}) {
  const f = []; const add = (id, level, text) => f.push({ id, level, text });
  const title = (html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1]?.trim() || '';
  const desc = metaBy(html, 'name', 'description');
  const h1 = [...html.matchAll(/<h1\b[^>]*>([\s\S]*?)<\/h1>/gi)].map((m) => strip(m[1]));
  const h2 = [...html.matchAll(/<h2\b[^>]*>([\s\S]*?)<\/h2>/gi)].map((m) => strip(m[1]));
  const canonical = (html.match(/<link\b[^>]*rel=["']canonical["'][^>]*>/i) || [])[0];
  const lang = /<html\b[^>]*\blang=["'][a-z-]+["']/i.test(html), viewport = metaBy(html, 'name', 'viewport') !== null;
  const og = ['og:title', 'og:description', 'og:image', 'og:url'].filter((k) => metaBy(html, 'property', k) === null);
  const imgs = [...html.matchAll(/<img\b[^>]*>/gi)].map((m) => m[0]), noAlt = imgs.filter((t) => attr(t, 'alt') === undefined).length;
  const ld = extractJsonLd(html), text = strip(html), words = text.split(' ').filter(Boolean).length;
  if (!title) add('title', 'fix', 'The page has no title.'); else if (title.length < 25 || title.length > 65) add('title', 'improve', `The title is ${title.length} characters. Aim for 25 to 65 so it is not cut off.`); else add('title', 'good', 'The title is a good length.');
  if (desc === null) add('description', 'fix', 'There is no meta description.'); else if (desc.length < 70 || desc.length > 170) add('description', 'improve', `The description is ${desc.length} characters. Aim for 70 to 170.`); else add('description', 'good', 'The description is a good length.');
  if (!canonical) add('canonical', 'improve', 'There is no canonical link, so search engines may split the page across addresses.'); else add('canonical', 'good', 'A canonical link is set.');
  if (h1.length !== 1) add('h1', h1.length ? 'improve' : 'fix', h1.length ? `The page has ${h1.length} main headings. Use exactly one.` : 'The page has no main heading (h1).'); else add('h1', 'good', 'There is one clear main heading.');
  if (h2.length < 2 && words > 300) add('headings', 'improve', 'Add more section headings. AI answers quote well-labelled sections.'); 
  if (!lang) add('lang', 'improve', 'Set the page language on the html tag.'); if (!viewport) add('viewport', 'fix', 'There is no mobile viewport setting.');
  if (og.length) add('open_graph', 'improve', `Missing share tags: ${og.join(', ')}.`); else add('open_graph', 'good', 'Share previews are fully set.');
  if (noAlt) add('alt', 'improve', `${noAlt} image${noAlt === 1 ? ' has' : 's have'} no alt text.`);
  if (ld.invalid) add('jsonld_valid', 'fix', `${ld.invalid} structured-data block${ld.invalid === 1 ? ' is' : 's are'} not valid JSON.`);
  if (!ld.items.length) add('jsonld', 'improve', 'Add structured data (Organization, SoftwareApplication, FAQ) so AI search can identify the business and product.'); else add('jsonld', 'good', `Structured data found: ${[...new Set(ld.types)].join(', ')}.`);
  if (/answers/i.test(url) && !ld.types.includes('FAQPage')) add('faq', 'improve', 'The answers page has no FAQ structured data.');
  if (words < 150) add('content', 'improve', `Only about ${words} words of text. Pages with clear, specific answers are cited more often.`);
  // Prices stated in structured data must match the live plans.
  const offers = ld.items.flatMap((x) => [].concat(x?.offers || [])).flatMap((o) => (o?.offers ? [].concat(o.offers) : [o])).map((o) => Number(o?.price)).filter(Number.isFinite);
  if (offers.length && expectedPrices.length) { const miss = offers.filter((p) => !expectedPrices.includes(p)); miss.length ? add('prices', 'fix', `Structured data lists price ${miss.join(', ')} that does not match your current plans (${expectedPrices.join(', ')}).`) : add('prices', 'good', 'Prices in structured data match your plans.'); }
  const mentions = [...text.matchAll(/\$\s?(\d{2,4})(?:\.\d\d)?/g)].map((m) => Number(m[1])).filter((n) => n >= 10 && n <= 999);
  return { facts: { title, description: desc, h1, h2count: h2.length, words, images: imgs.length, schema_types: [...new Set(ld.types)], prices_on_page: [...new Set(mentions)] }, findings: f };
}

export function analyseRobots(text, base = '') {
  const t = String(text || ''); const f = [];
  if (!t.trim()) return [{ id: 'robots', level: 'fix', text: 'robots.txt is missing or empty.' }];
  const groups = []; let cur = null;
  for (const raw of t.split(/\r?\n/)) { const l = raw.replace(/#.*/, '').trim(); const m = l.match(/^([A-Za-z-]+)\s*:\s*(.*)$/); if (!m) continue; const k = m[1].toLowerCase(); if (k === 'user-agent') { if (!cur || cur.rules.length) { cur = { agents: [], rules: [] }; groups.push(cur); } cur.agents.push(m[2].toLowerCase()); } else if (cur && (k === 'allow' || k === 'disallow')) cur.rules.push([k, m[2]]); }
  const blocked = AI_CRAWLERS.filter((bot) => { const g = groups.find((x) => x.agents.includes(bot.toLowerCase())) || groups.find((x) => x.agents.includes('*')); return g?.rules.some(([k, v]) => k === 'disallow' && v === '/'); });
  blocked.length ? f.push({ id: 'ai_crawlers', level: 'fix', text: `These AI search crawlers are blocked from the whole site: ${blocked.join(', ')}.` }) : f.push({ id: 'ai_crawlers', level: 'good', text: 'AI search crawlers can read your public pages.' });
  /sitemap:/i.test(t) ? f.push({ id: 'robots_sitemap', level: 'good', text: 'robots.txt points to the sitemap.' }) : f.push({ id: 'robots_sitemap', level: 'improve', text: 'robots.txt does not point to the sitemap.' });
  return f;
}

export function scoreOf(findings) { const w = { fix: 12, improve: 4, good: 0 }; return Math.max(0, 100 - findings.reduce((s, x) => s + (w[x.level] || 0), 0)); }

export function robotsAllows(robotsTxt, pathname) {
  const lines = String(robotsTxt || '').split(/\r?\n/); let applies = false, best = null; const rules = [];
  for (const raw of lines) { const m = raw.replace(/#.*/, '').trim().match(/^([A-Za-z-]+)\s*:\s*(.*)$/); if (!m) continue; const k = m[1].toLowerCase(); if (k === 'user-agent') { applies = m[2] === '*' || /supersprovisibility/i.test(m[2]); } else if (applies && (k === 'allow' || k === 'disallow') && m[2]) rules.push([k, m[2]]); }
  for (const [k, v] of rules) if (pathname.startsWith(v) && (!best || v.length >= best[1].length)) best = [k, v];
  return !best || best[0] === 'allow';
}

export async function publicHost(host) {
  if (net.isIP(host)) return !isPrivateIp(host);
  try { const a = await dns.lookup(host, { all: true }); return a.length > 0 && a.every((x) => !isPrivateIp(x.address)); } catch { return false; }
}
function isPrivateIp(ip) { return /^(10\.|127\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|0\.|::1$|fc|fd|fe80)/i.test(ip) || ip === '::'; }

export function installVisibility(app, { db, env, requireAdmin, siteRoot, generateAiText, fetchImpl = fetch, resolveHost = publicHost, timers = true }) {
  db.exec(`CREATE TABLE IF NOT EXISTS visibility_competitors (id TEXT PRIMARY KEY, url TEXT NOT NULL UNIQUE, label TEXT, created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS visibility_reports (id TEXT PRIMARY KEY, created_at TEXT NOT NULL, trigger TEXT NOT NULL, score INTEGER NOT NULL, previous_score INTEGER, pages_json TEXT NOT NULL, site_json TEXT NOT NULL, competitors_json TEXT NOT NULL, summary TEXT, summary_source TEXT, seen_at TEXT);
    CREATE INDEX IF NOT EXISTS idx_visibility_reports ON visibility_reports(created_at);`);
  const base = () => String(env.PUBLIC_BASE_URL || '').replace(/\/$/, '');
  const PAGES = ['index.html', 'answers.html', 'trust-center.html', 'terms.html', 'privacy.html', 'create-account.html'];

  async function fetchText(url, ms = 8000) {
    const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), ms);
    try { const r = await fetchImpl(url, { signal: ctl.signal, redirect: 'manual', headers: { 'user-agent': UA, accept: 'text/html,text/plain' } }); const body = (await r.text()).slice(0, 400000); return { ok: r.status >= 200 && r.status < 300, status: r.status, body }; }
    catch (e) { return { ok: false, status: 0, body: '', error: e.name === 'AbortError' ? 'timed out' : 'unreachable' }; } finally { clearTimeout(t); }
  }

  function expectedPrices() { try { const rows = db.prepare(`SELECT monthly_fee_cents c,active a FROM subscription_plans WHERE monthly_fee_cents>0`).all(); const live = rows.filter((r) => r.a); return (live.length ? live : rows).map((r) => r.c / 100); } catch { return []; } }

  async function checkSite() {
    const out = { findings: [], files: {} }, add = (x) => out.findings.push(x), prices = expectedPrices();
    const root = base();
    if (!/^https:\/\//.test(root)) add({ id: 'base_url', level: 'fix', text: 'PUBLIC_BASE_URL is not your live https address, so links, canonical tags and the sitemap cannot be checked.' });
    else {
      const [rb, sm, ll] = await Promise.all(['/robots.txt', '/sitemap.xml', '/llms.txt'].map((p) => fetchText(root + p)));
      out.files = { robots: rb.status, sitemap: sm.status, llms: ll.status };
      if (rb.ok) analyseRobots(rb.body, root).forEach(add); else add({ id: 'robots', level: 'fix', text: 'robots.txt could not be read from your live site.' });
      if (sm.ok) { const locs = [...sm.body.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]); locs.length ? add({ id: 'sitemap', level: 'good', text: `The sitemap lists ${locs.length} pages.` }) : add({ id: 'sitemap', level: 'fix', text: 'The sitemap is empty.' }); } else add({ id: 'sitemap', level: 'fix', text: 'sitemap.xml could not be read from your live site.' });
      ll.ok ? add({ id: 'llms', level: 'good', text: 'llms.txt is published for AI tools.' }) : add({ id: 'llms', level: 'improve', text: 'llms.txt is not available.' });
    }
    if (!String(env.INDEXNOW_KEY || '').trim()) add({ id: 'indexnow', level: 'improve', text: 'IndexNow is not set up, so Bing and others learn about changes more slowly.' });
    return out;
  }

  function checkPages() {
    const pages = [], prices = expectedPrices();
    for (const name of PAGES) {
      let html; try { html = fs.readFileSync(path.join(siteRoot, 'saas', name), 'utf8').replaceAll('__PUBLIC_BASE_URL__', base() || 'https://example.invalid').replaceAll('__ABN_LD__', ''); } catch { continue; }
      const noindex = /<meta[^>]+name=["']robots["'][^>]+noindex/i.test(html);
      const a = analysePage(html, { url: name, expectedPrices: prices });
      if (name === 'index.html' && a.facts.prices_on_page.length && prices.length) { const stray = a.facts.prices_on_page.filter((p) => ![...prices, ...[5, 12, 15]].includes(p)); if (stray.length) a.findings.push({ id: 'page_prices', level: 'improve', text: `The page mentions $${stray.join(', $')}, which is not one of your plan or add-on prices.` }); }
      pages.push({ page: '/saas/' + (name === 'index.html' ? '' : name), noindex, score: scoreOf(a.findings), ...a });
    }
    return pages;
  }

  async function checkCompetitor(c, mine) {
    const res = { url: c.url, label: c.label || new URL(c.url).hostname, ok: false };
    let u; try { u = new URL(c.url); } catch { return { ...res, note: 'Not a valid address.' }; }
    if (u.protocol !== 'https:' || !(await resolveHost(u.hostname))) return { ...res, note: 'Skipped: only public https sites can be checked.' };
    const rb = await fetchText(`${u.origin}/robots.txt`, 5000);
    if (rb.ok && !robotsAllows(rb.body, u.pathname || '/')) return { ...res, note: 'Skipped: their robots.txt asks automated tools not to read this page.' };
    const pg = await fetchText(u.href);
    if (!pg.ok) return { ...res, note: pg.status >= 300 && pg.status < 400 ? 'The page redirects. Use the final address.' : `Could not read the page (${pg.error || 'status ' + pg.status}).` };
    const a = analysePage(pg.body, { url: c.url });
    const tokens = (s) => new Set(String(s).toLowerCase().match(/[a-z]{4,}/g) || []);
    const mineWords = tokens(mine.facts.title + ' ' + mine.facts.description + ' ' + mine.facts.h1.join(' ')), theirs = tokens(a.facts.title + ' ' + a.facts.description + ' ' + a.facts.h1.join(' '));
    const gaps = [...theirs].filter((w) => !mineWords.has(w)).slice(0, 12);
    const better = []; if (a.facts.schema_types.some((t) => !mine.facts.schema_types.includes(t))) better.push(`They use structured data types you do not: ${a.facts.schema_types.filter((t) => !mine.facts.schema_types.includes(t)).join(', ')}.`);
    if (a.facts.words > mine.facts.words * 1.5) better.push('Their page has noticeably more written content.');
    return { ...res, ok: true, score: scoreOf(a.findings), title: a.facts.title, description: a.facts.description, h1: a.facts.h1[0] || '', schema_types: a.facts.schema_types, prices_seen: a.facts.prices_on_page, words: a.facts.words, words_they_use_that_you_do_not: gaps, where_they_are_ahead: better };
  }

  function templateSummary(r) {
    const fixes = r.pages.flatMap((p) => p.findings.filter((x) => x.level === 'fix').map((x) => `${p.page}: ${x.text}`)).concat(r.site.findings.filter((x) => x.level === 'fix').map((x) => x.text));
    const delta = r.previous_score == null ? '' : r.score === r.previous_score ? ' Same as last week.' : r.score > r.previous_score ? ` Up ${r.score - r.previous_score} from last week.` : ` Down ${r.previous_score - r.score} from last week.`;
    return `Your search visibility score is ${r.score} out of 100.${delta} ${fixes.length ? `${fixes.length} thing${fixes.length === 1 ? '' : 's'} should be fixed first: ${fixes.slice(0, 4).join(' ')}` : 'Nothing needs urgent fixing.'}`;
  }

  async function run(trigger = 'manual') {
    const [site, pages] = [await checkSite(), checkPages()];
    const home = pages.find((p) => p.page === '/saas/') || pages[0];
    const comps = db.prepare(`SELECT * FROM visibility_competitors ORDER BY created_at LIMIT 5`).all(); const competitors = [];
    for (const c of comps) competitors.push(await checkCompetitor(c, home || { facts: { title: '', description: '', h1: [], schema_types: [], words: 0 } }));
    const all = pages.flatMap((p) => p.findings).concat(site.findings);
    const score = pages.length ? Math.round((pages.reduce((s, p) => s + p.score, 0) / pages.length) * 0.7 + scoreOf(site.findings) * 0.3) : scoreOf(all);
    const prev = db.prepare(`SELECT score FROM visibility_reports ORDER BY created_at DESC LIMIT 1`).get()?.score ?? null;
    const draft = { score, previous_score: prev, pages, site, competitors };
    let summary = templateSummary(draft), source = 'template';
    try {
      const ai = await generateAiText({ remember_conversation: false, thinking_level: 'minimal', max_output_tokens: 500, system: 'You are an SEO and AI-search advisor for a small software company. Using only the findings given, write a plain-English summary under 120 words: the score and trend, the three most valuable fixes in order, and one note on competitors if any. No invented numbers, no jargon.', messages: [{ role: 'user', content: JSON.stringify({ score, previous_score: prev, fixes: all.filter((x) => x.level === 'fix').map((x) => x.text).slice(0, 10), improvements: all.filter((x) => x.level === 'improve').map((x) => x.text).slice(0, 10), competitors: competitors.filter((c) => c.ok).map((c) => ({ name: c.label, score: c.score, ahead: c.where_they_are_ahead })) }) }] });
      const t = String(ai.text || '').trim(); if (t.length > 60 && t.length < 1800) { summary = t; source = 'ai'; }
    } catch { /* template summary stays */ }
    const id = crypto.randomUUID();
    db.prepare(`INSERT INTO visibility_reports (id,created_at,trigger,score,previous_score,pages_json,site_json,competitors_json,summary,summary_source) VALUES (?,?,?,?,?,?,?,?,?,?)`).run(id, iso(), trigger, score, prev, JSON.stringify(pages), JSON.stringify(site), JSON.stringify(competitors), summary, source);
    db.prepare(`DELETE FROM visibility_reports WHERE id NOT IN (SELECT id FROM visibility_reports ORDER BY created_at DESC LIMIT 52)`).run();
    return { id, score, previous_score: prev, summary, summary_source: source };
  }

  const shape = (r) => r && { id: r.id, created_at: r.created_at, trigger: r.trigger, score: r.score, previous_score: r.previous_score, summary: r.summary, summary_source: r.summary_source, pages: JSON.parse(r.pages_json), site: JSON.parse(r.site_json), competitors: JSON.parse(r.competitors_json) };
  // For the operator's "needs attention" list.
  function attentionItems() {
    try {
      const r = db.prepare(`SELECT * FROM visibility_reports ORDER BY created_at DESC LIMIT 1`).get(); if (!r) return [];
      const fixes = JSON.parse(r.pages_json).reduce((n, p) => n + p.findings.filter((x) => x.level === 'fix').length, 0) + JSON.parse(r.site_json).findings.filter((x) => x.level === 'fix').length;
      const drop = r.previous_score != null && r.previous_score - r.score >= 5;
      if (!fixes && !drop) return [];
      return [{ kind: 'search_visibility', level: drop || fixes > 2 ? 'action' : 'info', text: `Search visibility is ${r.score}/100${drop ? `, down ${r.previous_score - r.score} from last week` : ''}. ${fixes} item${fixes === 1 ? '' : 's'} to fix.`, when: r.created_at }];
    } catch { return []; }
  }

  app.get('/api/admin/visibility', requireAdmin, (req, res) => {
    const latest = shape(db.prepare(`SELECT * FROM visibility_reports ORDER BY created_at DESC LIMIT 1`).get());
    const history = db.prepare(`SELECT id,created_at,score FROM visibility_reports ORDER BY created_at DESC LIMIT 26`).all().reverse();
    res.json({ ok: true, latest, history, competitors: db.prepare(`SELECT id,url,label FROM visibility_competitors ORDER BY created_at`).all(), weekly: timers, honest_limits: 'This checks what your pages say and how readable they are to search engines and AI tools. It does not show your ranking or whether an AI assistant mentions you. Connect Search Console or Bing Webmaster for real ranking data.' });
  });
  app.post('/api/admin/visibility/run', requireAdmin, async (req, res) => { try { res.status(201).json({ ok: true, ...(await run('manual')) }); } catch (e) { res.status(500).json({ ok: false, error: 'The check could not finish. Try again.' }); } });
  app.post('/api/admin/visibility/competitors', requireAdmin, (req, res) => {
    const p = z.object({ url: z.string().trim().url().max(300), label: z.string().trim().max(60).optional() }).safeParse(req.body);
    if (!p.success || !/^https:\/\//i.test(p.data.url)) return res.status(400).json({ ok: false, error: 'Enter a full https:// address for the page to compare.' });
    if (db.prepare(`SELECT COUNT(*) c FROM visibility_competitors`).get().c >= 5) return res.status(409).json({ ok: false, error: 'You can compare up to 5 pages. Remove one first.' });
    if (!db.prepare(`INSERT OR IGNORE INTO visibility_competitors (id,url,label,created_at) VALUES (?,?,?,?)`).run(crypto.randomUUID(), p.data.url, p.data.label || null, iso()).changes) return res.status(409).json({ ok: false, error: 'That page is already on the list.' });
    res.status(201).json({ ok: true });
  });
  app.delete('/api/admin/visibility/competitors/:id', requireAdmin, (req, res) => { db.prepare(`DELETE FROM visibility_competitors WHERE id=?`).run(req.params.id); res.json({ ok: true }); });

  // Weekly: runs when the last report is over 6.5 days old. Checked hourly so a restart never skips a week.
  async function tick() { const last = db.prepare(`SELECT created_at FROM visibility_reports ORDER BY created_at DESC LIMIT 1`).get(); if (!last || Date.now() - Date.parse(last.created_at) > 6.5 * DAY) await run('weekly'); }
  if (timers) { setTimeout(() => tick().catch((e) => console.warn('[visibility]', e.message)), 90000).unref?.(); setInterval(() => tick().catch((e) => console.warn('[visibility]', e.message)), 3600000).unref?.(); }
  return { run, attentionItems, tick };
}
