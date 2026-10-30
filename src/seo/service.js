// Phase 06: the SEO platform's data and operations. Every row belongs to one owner: 'platform' (Super Pro's own public
// website, Founder Console only) or one business's organisation id. No function reads across owners.
import crypto from 'node:crypto';
import { crawlSite, auditCrawl, parsePage } from './audit.js';
import { discoverKeywords, clusterKeywords, buildPlan, parseKeywordCsv, tokens } from './keywords.js';
import { generateDraft, CONTENT_KINDS } from './content.js';
import { createGoogleClient, serviceAccountToken, GOOGLE_SCOPES, GOOGLE_SERVICES } from './google.js';
import { localAudit, reviewReplyDraft, locationPageIdeas } from './local.js';
import { renderPage, prePublishChecks, classifyChange, designSuggestions, themeFrom, TEMPLATES } from './builder.js';

const iso = (t = Date.now()) => new Date(t).toISOString();
const DAY = 86400000;
const J = (s, f) => { if (s === null || s === undefined) return f; try { return JSON.parse(s); } catch { return f; } };
const uid = () => crypto.randomUUID();

export function migrateSeo(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS seo_audits (id TEXT PRIMARY KEY, owner_key TEXT NOT NULL, site_url TEXT NOT NULL, trigger TEXT NOT NULL, created_by TEXT, created_at TEXT NOT NULL, status TEXT NOT NULL, score INTEGER, counts_json TEXT, result_json TEXT, error TEXT);
    CREATE INDEX IF NOT EXISTS seo_audits_owner ON seo_audits(owner_key, created_at);
    CREATE TABLE IF NOT EXISTS seo_keywords (owner_key TEXT NOT NULL, keyword TEXT NOT NULL, sources_json TEXT NOT NULL, evidence_json TEXT NOT NULL, intent TEXT, updated_at TEXT NOT NULL, PRIMARY KEY (owner_key, keyword));
    CREATE TABLE IF NOT EXISTS seo_keyword_inputs (id TEXT PRIMARY KEY, owner_key TEXT NOT NULL, kind TEXT NOT NULL, keyword TEXT NOT NULL, volume REAL, source_name TEXT, created_by TEXT, created_at TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS seo_keyword_inputs_owner ON seo_keyword_inputs(owner_key);
    CREATE TABLE IF NOT EXISTS seo_plans (id TEXT PRIMARY KEY, owner_key TEXT NOT NULL, created_at TEXT NOT NULL, plan_json TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS seo_drafts (id TEXT PRIMARY KEY, owner_key TEXT NOT NULL, kind TEXT NOT NULL, topic TEXT, draft_json TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'draft', created_by TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS seo_drafts_owner ON seo_drafts(owner_key, created_at);
    CREATE TABLE IF NOT EXISTS seo_google_links (owner_key TEXT NOT NULL, service TEXT NOT NULL, resource TEXT NOT NULL, label TEXT, linked_by TEXT, linked_at TEXT NOT NULL, PRIMARY KEY (owner_key, service));
    CREATE TABLE IF NOT EXISTS seo_google_checks (id TEXT PRIMARY KEY, owner_key TEXT NOT NULL, service TEXT NOT NULL, ok INTEGER NOT NULL, detail TEXT, sample_json TEXT, checked_by TEXT, checked_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS seo_gsc_rows (owner_key TEXT NOT NULL, site_url TEXT NOT NULL, date TEXT NOT NULL, query TEXT NOT NULL, page TEXT NOT NULL, clicks REAL NOT NULL, impressions REAL NOT NULL, ctr REAL, position REAL, fetched_at TEXT NOT NULL, PRIMARY KEY (owner_key, site_url, date, query, page));
    CREATE TABLE IF NOT EXISTS seo_ga_rows (owner_key TEXT NOT NULL, property TEXT NOT NULL, date TEXT NOT NULL, landing_page TEXT NOT NULL, channel TEXT NOT NULL, sessions REAL, engaged REAL, key_events REAL, revenue REAL, currency TEXT, fetched_at TEXT NOT NULL, PRIMARY KEY (owner_key, property, date, landing_page, channel));
    CREATE TABLE IF NOT EXISTS seo_cwv (id TEXT PRIMARY KEY, owner_key TEXT NOT NULL, url TEXT NOT NULL, strategy TEXT NOT NULL, field_json TEXT, lab_json TEXT, fetched_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS seo_inspections (owner_key TEXT NOT NULL, url TEXT NOT NULL, result_json TEXT NOT NULL, inspected_at TEXT NOT NULL, PRIMARY KEY (owner_key, url));
    CREATE TABLE IF NOT EXISTS seo_gbp (owner_key TEXT PRIMARY KEY, location TEXT, location_json TEXT, performance_json TEXT, review_summary_json TEXT, fetched_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS seo_reviews (owner_key TEXT NOT NULL, review_id TEXT NOT NULL, name TEXT, reviewer TEXT, rating INTEGER, comment TEXT, created_at TEXT, reply TEXT, reply_draft TEXT, reply_status TEXT NOT NULL DEFAULT 'none', fetched_at TEXT NOT NULL, PRIMARY KEY (owner_key, review_id));
    CREATE TABLE IF NOT EXISTS seo_reports (id TEXT PRIMARY KEY, owner_key TEXT NOT NULL, kind TEXT NOT NULL, period_start TEXT, period_end TEXT, created_at TEXT NOT NULL, report_json TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS seo_reports_owner ON seo_reports(owner_key, created_at);
    CREATE TABLE IF NOT EXISTS seo_sites (id TEXT PRIMARY KEY, owner_key TEXT NOT NULL, slug TEXT NOT NULL UNIQUE, name TEXT NOT NULL, lang TEXT NOT NULL DEFAULT 'en-AU', brand_json TEXT NOT NULL DEFAULT '{}', created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS seo_sites_owner ON seo_sites(owner_key);
    CREATE TABLE IF NOT EXISTS seo_site_pages (id TEXT PRIMARY KEY, site_id TEXT NOT NULL REFERENCES seo_sites(id) ON DELETE CASCADE, owner_key TEXT NOT NULL, slug TEXT NOT NULL, title TEXT NOT NULL, template TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'draft', draft_version INTEGER NOT NULL DEFAULT 1, published_version INTEGER, scheduled_at TEXT, scheduled_version INTEGER, published_at TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, UNIQUE (site_id, slug));
    CREATE TABLE IF NOT EXISTS seo_page_versions (id TEXT PRIMARY KEY, page_id TEXT NOT NULL REFERENCES seo_site_pages(id) ON DELETE CASCADE, version INTEGER NOT NULL, content_json TEXT NOT NULL, created_by TEXT, created_at TEXT NOT NULL, note TEXT, UNIQUE (page_id, version));
  `);
}

export function createSeoService({ db, env = {}, fetchImpl = globalThis.fetch, resolveHost, profileOf, connections, ai = null, aiAvailable = () => Boolean(ai), ownBase = () => '', engineRef = { current: null }, log = console }) {
  migrateSeo(db);
  const google = createGoogleClient({ fetchImpl, env });
  const isPlatform = (k) => k === 'platform';

  // ---------------- verified facts ----------------
  function facts(ownerKey) {
    if (isPlatform(ownerKey)) return { business_name: 'Super Pro AI Office Manager', services: ['AI office manager', 'business operations software', 'job management software', 'AI receptionist'], areas: ['Australia'], website_url: env.PUBLIC_BASE_URL || ownBase(), email: env.SUPPORT_EMAIL || '', phone: '', schema_type: 'Organization' };
    const p = profileOf(ownerKey) || {};
    const ob = db.prepare('SELECT email FROM users u JOIN memberships m ON m.user_id=u.id WHERE m.organisation_id=? AND m.role=\'owner\' LIMIT 1').get(ownerKey);
    const prices = (() => { try { return db.prepare("SELECT name, unit_price_cents FROM stock_items WHERE organisation_id=? AND active=1 AND unit_price_cents>0 LIMIT 20").all(ownerKey).map((r) => ({ name: r.name, price: '$' + (r.unit_price_cents / 100).toFixed(2) })); } catch { return []; } })();
    return { business_name: p.business_name, services: p.services || [], areas: p.areas || [], phone: p.phone || '', address: p.address || '', abn: p.abn || '', website_url: p.website_url || '', same_as: p.same_as || [], email: ob?.email || '', prices, hours: [] };
  }

  // ---------------- Google access ----------------
  async function googleToken(ownerKey, provider) {
    if (isPlatform(ownerKey)) {
      const scopes = provider === 'google_business' ? ['https://www.googleapis.com/auth/business.manage'] : [GOOGLE_SCOPES.search_console, GOOGLE_SCOPES.analytics, GOOGLE_SCOPES.tag_manager];
      const t = await serviceAccountToken(env, scopes, { fetchImpl }); if (!t) throw Object.assign(new Error('Add a Google service account (GOOGLE_SERVICE_ACCOUNT_JSON) and give it access to the property.'), { status: 409, permanent: true });
      return t.access_token;
    }
    const c = connections?.load(ownerKey, provider);
    if (!c || c.row.status !== 'connected') throw Object.assign(new Error(provider === 'google_business' ? 'Connect Google Business Profile first.' : 'Connect Google (Search Console and Analytics) first.'), { status: 409, permanent: true });
    const bundle = await connections.fresh(c, provider);
    return bundle.access_token;
  }
  const link = (ownerKey, service) => db.prepare('SELECT * FROM seo_google_links WHERE owner_key=? AND service=?').get(ownerKey, service);
  function setLink(ownerKey, service, resource, label, actor) {
    db.prepare('INSERT INTO seo_google_links(owner_key,service,resource,label,linked_by,linked_at) VALUES (?,?,?,?,?,?) ON CONFLICT(owner_key,service) DO UPDATE SET resource=excluded.resource,label=excluded.label,linked_by=excluded.linked_by,linked_at=excluded.linked_at').run(ownerKey, service, resource, label || resource, actor || null, iso());
  }
  function record(ownerKey, service, ok, detail, sample, actor) {
    db.prepare('INSERT INTO seo_google_checks(id,owner_key,service,ok,detail,sample_json,checked_by,checked_at) VALUES (?,?,?,?,?,?,?,?)').run(uid(), ownerKey, service, ok ? 1 : 0, String(detail || '').slice(0, 500), sample ? JSON.stringify(sample).slice(0, 2000) : null, actor || null, iso());
  }
  // A live call to Google that proves the connection works and the answer has the documented shape.
  async function verifyGoogle(ownerKey, service, actor) {
    try {
      let sample, detail;
      if (service === 'search_console') { const sites = await google.gscSites(await googleToken(ownerKey, 'google_seo')); sample = sites.slice(0, 5); detail = `${sites.length} Search Console propert${sites.length === 1 ? 'y' : 'ies'} visible.`; }
      else if (service === 'analytics') { const p = await google.gaProperties(await googleToken(ownerKey, 'google_seo')); sample = p.slice(0, 5); detail = `${p.length} GA4 propert${p.length === 1 ? 'y' : 'ies'} visible.`; }
      else if (service === 'tag_manager') { const c = await google.gtmContainers(await googleToken(ownerKey, 'google_seo')); sample = c.slice(0, 5); detail = `${c.length} Tag Manager container(s) visible.`; }
      else if (service === 'ads') { const c = await google.adsCustomers(await googleToken(ownerKey, 'google_seo')); sample = c.slice(0, 5); detail = `${c.length} Google Ads account(s) visible.`; }
      else if (service === 'business_profile') { const t = await googleToken(ownerKey, 'google_business'); const a = await google.gbpAccounts(t); const locs = a[0] ? await google.gbpLocations(t, a[0].account) : []; sample = locs.slice(0, 3).map((l) => ({ location: l.location, title: l.title })); detail = `${a.length} account(s), ${locs.length} location(s) visible.`; }
      else if (service === 'pagespeed') { const url = facts(ownerKey).website_url; if (!url) throw Object.assign(new Error('Add your website address first.'), { status: 409 }); const r = await google.pagespeed(url, 'mobile'); sample = { url: r.url, field: Boolean(r.field), lab_score: r.lab.performance_score }; detail = `PageSpeed answered for ${url}${r.field ? ' with real-user field data' : ' with a lab test only (not enough Chrome traffic for field data)'}.`; storeCwv(ownerKey, r); }
      else throw Object.assign(new Error('Unknown Google service.'), { status: 404 });
      record(ownerKey, service, true, detail, sample, actor);
      return { ok: true, live: true, detail, sample };
    } catch (e) { record(ownerKey, service, false, e.message, null, actor); return { ok: false, live: true, error: e.message, status: e.status || 502 }; }
  }
  function googleStatus(ownerKey) {
    const conn = (p) => { if (isPlatform(ownerKey)) return env.GOOGLE_SERVICE_ACCOUNT_JSON ? 'service_account' : 'not_connected'; try { return connections?.load(ownerKey, p)?.row?.status || 'not_connected'; } catch { return 'not_connected'; } };
    return Object.entries(GOOGLE_SERVICES).map(([key, s]) => {
      const last = db.prepare('SELECT ok,detail,checked_at FROM seo_google_checks WHERE owner_key=? AND service=? ORDER BY checked_at DESC LIMIT 1').get(ownerKey, key);
      const lastOk = db.prepare('SELECT checked_at FROM seo_google_checks WHERE owner_key=? AND service=? AND ok=1 ORDER BY checked_at DESC LIMIT 1').get(ownerKey, key);
      const connection = key === 'pagespeed' ? ((env.PAGESPEED_API_KEY || env.GOOGLE_API_KEY) ? 'api_key' : 'no_key') : conn(s.provider);
      const ready = key === 'ads' ? Boolean(env.GOOGLE_ADS_DEVELOPER_TOKEN) : true;
      return { service: key, name: s.name, quota: s.quota, actions: s.actions, connection, ready, linked: link(ownerKey, key) || null, last_check: last ? { ok: Boolean(last.ok), detail: last.detail, at: last.checked_at } : null, verified_at: lastOk?.checked_at || null, status: lastOk && (!last || last.ok) ? 'verified' : last && !last.ok ? 'failing' : ['connected', 'service_account', 'api_key'].includes(connection) ? 'connected_unverified' : 'not_connected' };
    });
  }
  function storeCwv(ownerKey, r) { db.prepare('INSERT INTO seo_cwv(id,owner_key,url,strategy,field_json,lab_json,fetched_at) VALUES (?,?,?,?,?,?,?)').run(uid(), ownerKey, r.url, r.strategy, r.field ? JSON.stringify(r.field) : null, JSON.stringify(r.lab), r.fetched_at); }

  // Pull measured data from Google into Super Pro (Search Console, GA4, PageSpeed, Business Profile).
  async function syncGoogle(ownerKey, { days = 28, actor = null } = {}) {
    const end = Date.now() - 2 * DAY, start = end - days * DAY, out = {};
    const gsc = link(ownerKey, 'search_console');
    if (gsc) { try { const rows = await google.gscQuery(await googleToken(ownerKey, 'google_seo'), gsc.resource, { startDate: start, endDate: end, rowLimit: 25000 }); const ins = db.prepare('INSERT INTO seo_gsc_rows(owner_key,site_url,date,query,page,clicks,impressions,ctr,position,fetched_at) VALUES (?,?,?,?,?,?,?,?,?,?) ON CONFLICT(owner_key,site_url,date,query,page) DO UPDATE SET clicks=excluded.clicks,impressions=excluded.impressions,ctr=excluded.ctr,position=excluded.position,fetched_at=excluded.fetched_at'); db.transaction(() => { for (const r of rows) ins.run(ownerKey, gsc.resource, r.date, r.query || '', r.page || '', r.clicks, r.impressions, r.ctr, r.position, iso()); })(); out.search_console = { ok: true, rows: rows.length }; record(ownerKey, 'search_console', true, `Synced ${rows.length} rows.`, rows.slice(0, 2), actor); } catch (e) { out.search_console = { ok: false, error: e.message }; record(ownerKey, 'search_console', false, e.message, null, actor); } }
    const ga = link(ownerKey, 'analytics');
    if (ga) { try { const rows = await google.gaLandingPages(await googleToken(ownerKey, 'google_seo'), ga.resource, { startDate: start, endDate: end }); const ins = db.prepare('INSERT INTO seo_ga_rows(owner_key,property,date,landing_page,channel,sessions,engaged,key_events,revenue,currency,fetched_at) VALUES (?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(owner_key,property,date,landing_page,channel) DO UPDATE SET sessions=excluded.sessions,engaged=excluded.engaged,key_events=excluded.key_events,revenue=excluded.revenue,fetched_at=excluded.fetched_at'); db.transaction(() => { for (const r of rows) ins.run(ownerKey, ga.resource, r.date, r.landing_page, r.channel, r.sessions, r.engaged_sessions, r.key_events, r.revenue, r.currency, iso()); })(); out.analytics = { ok: true, rows: rows.length }; record(ownerKey, 'analytics', true, `Synced ${rows.length} rows.`, rows.slice(0, 2), actor); } catch (e) { out.analytics = { ok: false, error: e.message }; record(ownerKey, 'analytics', false, e.message, null, actor); } }
    const gbp = link(ownerKey, 'business_profile');
    if (gbp) { try { const t = await googleToken(ownerKey, 'google_business'); const account = gbp.resource.split('/locations/')[0]; const locs = await google.gbpLocations(t, account); const loc = locs.find((l) => l.location === gbp.resource.split('/').slice(-2).join('/') || gbp.resource.endsWith(l.location)) || locs[0];
      const rv = await google.gbpReviews(t, account, loc.location); let perf = null; try { perf = await google.gbpPerformance(t, loc.location, { startDate: start, endDate: end }); } catch (e) { perf = { error: e.message }; }
      db.prepare('INSERT INTO seo_gbp(owner_key,location,location_json,performance_json,review_summary_json,fetched_at) VALUES (?,?,?,?,?,?) ON CONFLICT(owner_key) DO UPDATE SET location=excluded.location,location_json=excluded.location_json,performance_json=excluded.performance_json,review_summary_json=excluded.review_summary_json,fetched_at=excluded.fetched_at').run(ownerKey, loc.location, JSON.stringify(loc), JSON.stringify(perf), JSON.stringify({ average: rv.average, total: rv.total }), iso());
      const ins = db.prepare("INSERT INTO seo_reviews(owner_key,review_id,name,reviewer,rating,comment,created_at,reply,fetched_at) VALUES (?,?,?,?,?,?,?,?,?) ON CONFLICT(owner_key,review_id) DO UPDATE SET reply=excluded.reply,comment=excluded.comment,rating=excluded.rating,fetched_at=excluded.fetched_at,reply_status=CASE WHEN excluded.reply IS NOT NULL THEN 'replied' ELSE seo_reviews.reply_status END");
      db.transaction(() => { for (const r of rv.reviews) ins.run(ownerKey, r.review_id, r.name || `${account}/${loc.location}/reviews/${r.review_id}`, r.reviewer, r.rating, r.comment, r.created_at, r.reply, iso()); })();
      out.business_profile = { ok: true, reviews: rv.reviews.length }; record(ownerKey, 'business_profile', true, `Synced profile and ${rv.reviews.length} review(s).`, { title: loc.title }, actor); } catch (e) { out.business_profile = { ok: false, error: e.message }; record(ownerKey, 'business_profile', false, e.message, null, actor); } }
    const site = facts(ownerKey).website_url;
    if (site && (env.PAGESPEED_API_KEY || env.GOOGLE_API_KEY)) { for (const strategy of ['mobile', 'desktop']) { try { storeCwv(ownerKey, await google.pagespeed(site, strategy)); out['pagespeed_' + strategy] = { ok: true }; } catch (e) { out['pagespeed_' + strategy] = { ok: false, error: e.message }; } } }
    return out;
  }

  // ---------------- technical audits ----------------
  async function runAudit(ownerKey, { url = null, trigger = 'manual', actor = null, maxPages = 40 } = {}) {
    const target = url || (isPlatform(ownerKey) ? (ownBase() + '/') : facts(ownerKey).website_url);
    if (!target) throw Object.assign(new Error('Add your website address in Business facts, or build a site with the Website Builder.'), { status: 409 });
    const own = isPlatform(ownerKey) || isOwnSite(ownerKey, target);
    const id = uid();
    db.prepare("INSERT INTO seo_audits(id,owner_key,site_url,trigger,created_by,created_at,status) VALUES (?,?,?,?,?,?,'running')").run(id, ownerKey, target, trigger, actor, iso());
    try {
      const crawlUrl = own && isOwnSite(ownerKey, target) ? ownBase() + new URL(target, ownBase() || 'http://x').pathname : target;
      const scopePath = /^\/sites\/[a-z0-9-]+\//.test(new URL(crawlUrl).pathname) ? new URL(crawlUrl).pathname.match(/^\/sites\/[a-z0-9-]+\//)[0] : '/';
      const crawl = await crawlSite(crawlUrl, { fetchImpl, resolveHost, ownSite: own, maxPages, checkExternal: own ? 10 : 15, scopePath });
      const psi = db.prepare('SELECT * FROM seo_cwv WHERE owner_key=? AND fetched_at>=? ORDER BY fetched_at DESC').all(ownerKey, iso(Date.now() - 30 * DAY)).filter((r, i, a) => a.findIndex((x) => x.strategy === r.strategy) === i).map((r) => ({ url: r.url, strategy: r.strategy, field: J(r.field_json, null), lab: J(r.lab_json, {}), fetched_at: r.fetched_at }));
      const result = auditCrawl(crawl, { psi });
      const store = { ...result, pages: result.pages.slice(0, 200), robots_status: crawl.robots?.status, sitemaps: crawl.sitemaps, link_graph: crawl.ok ? Object.fromEntries(crawl.pages.filter((p) => p.parsed).map((p) => [p.final_url, [...new Set(p.parsed.links.map((l) => l.abs).filter(Boolean))].slice(0, 200)])) : {}, page_facts: crawl.ok ? crawl.pages.filter((p) => p.parsed && p.status === 200).slice(0, 120).map((p) => ({ url: p.final_url, title: p.parsed.title, description: p.parsed.description, h1: p.parsed.headings.filter((h) => h.level === 1).map((h) => h.text), h2: p.parsed.headings.filter((h) => h.level === 2).map((h) => h.text), words: p.parsed.words, images: p.parsed.images.slice(0, 40), text: p.parsed.text.slice(0, 4000), ld: p.parsed.ld.items.slice(0, 5), phones: [...p.parsed.links.filter((l) => /^tel:/i.test(l.href))].map((l) => l.href.slice(4)) })) : [] };
      db.prepare("UPDATE seo_audits SET status='done',score=?,counts_json=?,result_json=? WHERE id=?").run(result.score, JSON.stringify(result.counts), JSON.stringify(store), id);
      db.prepare('DELETE FROM seo_audits WHERE owner_key=? AND id NOT IN (SELECT id FROM seo_audits WHERE owner_key=? ORDER BY created_at DESC LIMIT 30)').run(ownerKey, ownerKey);
      return { id, ...store, site_url: target };
    } catch (e) { db.prepare("UPDATE seo_audits SET status='failed',error=? WHERE id=?").run(String(e.message).slice(0, 300), id); throw e; }
  }
  const latestAudit = (ownerKey) => { const r = db.prepare("SELECT * FROM seo_audits WHERE owner_key=? AND status='done' ORDER BY created_at DESC LIMIT 1").get(ownerKey); return r ? { id: r.id, site_url: r.site_url, created_at: r.created_at, trigger: r.trigger, ...J(r.result_json, {}) } : null; };
  const previousAudit = (ownerKey) => { const r = db.prepare("SELECT * FROM seo_audits WHERE owner_key=? AND status='done' ORDER BY created_at DESC LIMIT 1 OFFSET 1").get(ownerKey); return r ? { id: r.id, created_at: r.created_at, ...J(r.result_json, {}) } : null; };
  function isOwnSite(ownerKey, url) { try { const u = new URL(url, ownBase() || 'http://localhost'); const base = ownBase() ? new URL(ownBase()) : null; return Boolean(base && u.host === base.host && (isPlatform(ownerKey) || u.pathname.startsWith('/sites/') && db.prepare('SELECT 1 FROM seo_sites WHERE owner_key=? AND slug=?').get(ownerKey, u.pathname.split('/')[2]))); } catch { return false; } }

  // ---------------- keyword clusters ----------------
  function addKeywordInputs(ownerKey, { manual = [], csv = '', source_name = 'Uploaded list' }, actor) {
    const rows = [...manual.map((k) => ({ kind: 'manual', keyword: k })), ...parseKeywordCsv(csv, source_name).map((r) => ({ kind: 'import', ...r }))];
    const ins = db.prepare('INSERT INTO seo_keyword_inputs(id,owner_key,kind,keyword,volume,source_name,created_by,created_at) VALUES (?,?,?,?,?,?,?,?)');
    db.transaction(() => { for (const r of rows.slice(0, 2000)) ins.run(uid(), ownerKey, r.kind, String(r.keyword).slice(0, 120), r.volume ?? null, r.kind === 'import' ? String(r.source_name || source_name).slice(0, 80) : null, actor, iso()); })();
    return { added: rows.length, with_volume: rows.filter((r) => r.volume !== null && r.volume !== undefined).length };
  }
  function buildKeywordPlan(ownerKey) {
    const f = facts(ownerKey), audit = latestAudit(ownerKey);
    const pages = audit?.page_facts || [];
    const gsc = db.prepare('SELECT query, page, SUM(clicks) clicks, SUM(impressions) impressions, AVG(position) position FROM seo_gsc_rows WHERE owner_key=? AND date>=? GROUP BY query, page').all(ownerKey, iso(Date.now() - 90 * DAY).slice(0, 10));
    const inputs = db.prepare('SELECT * FROM seo_keyword_inputs WHERE owner_key=?').all(ownerKey);
    const keywords = discoverKeywords({ services: f.services, areas: f.areas, brand: f.business_name, pages, gsc, imports: inputs.filter((i) => i.kind === 'import').map((i) => ({ keyword: i.keyword, volume: i.volume, source_name: i.source_name })), manual: inputs.filter((i) => i.kind === 'manual').map((i) => i.keyword) });
    const clusters = clusterKeywords(keywords, { areas: f.areas });
    const jobsByTerm = {};
    if (!isPlatform(ownerKey)) for (const j of db.prepare('SELECT title FROM work_orders WHERE organisation_id=? ORDER BY created_at DESC LIMIT 500').all(ownerKey)) for (const t of new Set(tokens(j.title))) jobsByTerm[t] = (jobsByTerm[t] || 0) + 1;
    const plan = buildPlan({ keywords, clusters, pages, linkGraph: audit?.link_graph || {}, services: f.services, jobsByTerm, brand: f.business_name });
    const up = db.prepare('INSERT INTO seo_keywords(owner_key,keyword,sources_json,evidence_json,intent,updated_at) VALUES (?,?,?,?,?,?) ON CONFLICT(owner_key,keyword) DO UPDATE SET sources_json=excluded.sources_json,evidence_json=excluded.evidence_json,intent=excluded.intent,updated_at=excluded.updated_at');
    db.transaction(() => { for (const k of keywords) up.run(ownerKey, k.keyword, JSON.stringify(k.sources), JSON.stringify(k.evidence), k.intent, iso()); })();
    const id = uid(), summary = { keywords: keywords.length, clusters: clusters.length, measured_keywords: keywords.filter((k) => k.evidence.search_console).length, with_volume: keywords.filter((k) => k.evidence.import?.volume !== undefined).length, pages_used: pages.length, audit_at: audit?.created_at || null, gsc_rows: gsc.length };
    const stored = { ...plan, summary, clusters: plan.clusters.map((c) => ({ ...c, keywords: c.keywords.slice(0, 30) })) };
    db.prepare('INSERT INTO seo_plans(id,owner_key,created_at,plan_json) VALUES (?,?,?,?)').run(id, ownerKey, iso(), JSON.stringify(stored));
    db.prepare('DELETE FROM seo_plans WHERE owner_key=? AND id NOT IN (SELECT id FROM seo_plans WHERE owner_key=? ORDER BY created_at DESC LIMIT 12)').run(ownerKey, ownerKey);
    return { id, created_at: iso(), ...stored };
  }
  const latestPlan = (ownerKey) => { const r = db.prepare('SELECT * FROM seo_plans WHERE owner_key=? ORDER BY created_at DESC LIMIT 1').get(ownerKey); return r ? { id: r.id, created_at: r.created_at, ...J(r.plan_json, {}) } : null; };

  // ---------------- content studio ----------------
  async function studio(ownerKey, { kind, topic, page_url = null, keywords = [] }, actor) {
    const f = facts(ownerKey), audit = latestAudit(ownerKey);
    const page = page_url ? (audit?.page_facts || []).find((p) => p.url === page_url) || null : null;
    if (['alt', 'refresh', 'meta'].includes(kind) && page_url && !page) throw Object.assign(new Error('Run a technical audit first so the page can be read.'), { status: 409 });
    const plan = latestPlan(ownerKey);
    const draft = await generateDraft({ kind, topic, facts: f, keywords: keywords.length ? keywords : (plan?.clusters || []).filter((c) => tokens(c.primary).some((t) => tokens(topic || '').includes(t))).flatMap((c) => [c.primary, ...c.secondary]).slice(0, 8), page: page ? { ...page, headings: [...page.h1.map((t) => ({ level: 1, text: t })), ...page.h2.map((t) => ({ level: 2, text: t }))] } : null, internalLinks: plan?.internal_links || [], ai: aiAvailable() ? ai : null });
    const id = uid();
    db.prepare("INSERT INTO seo_drafts(id,owner_key,kind,topic,draft_json,status,created_by,created_at,updated_at) VALUES (?,?,?,?,?,'draft',?,?,?)").run(id, ownerKey, kind, topic || page_url || '', JSON.stringify(draft), actor, iso(), iso());
    return { id, ...draft };
  }

  // ---------------- local SEO ----------------
  function local(ownerKey) {
    const f = facts(ownerKey), audit = latestAudit(ownerKey), home = audit?.page_facts?.[0];
    const g = db.prepare('SELECT * FROM seo_gbp WHERE owner_key=?').get(ownerKey);
    const loc = g ? J(g.location_json, null) : null, summary = g ? J(g.review_summary_json, {}) : null;
    const reviews = db.prepare('SELECT * FROM seo_reviews WHERE owner_key=? ORDER BY created_at DESC LIMIT 100').all(ownerKey);
    const checks = localAudit({ facts: f, site: home ? { html: home.phones.map((p) => `tel:${p}`).join(' '), text: (audit.page_facts || []).map((p) => p.text).join(' '), ld: home.ld, ld_name: home.ld.find((x) => x?.name)?.name, ld_address: (() => { const a = home.ld.find((x) => x?.address)?.address; return typeof a === 'string' ? a : a?.streetAddress || null; })(), phones: home.phones } : null, gbp: loc, reviews: g ? { average: summary.average, total: summary.total, reviews: reviews.map((r) => ({ reply: r.reply })) } : null, photos: null });
    return { checks, gbp: loc, gbp_fetched_at: g?.fetched_at || null, performance: g ? J(g.performance_json, null) : null, reviews: reviews.map((r) => ({ review_id: r.review_id, reviewer: r.reviewer, rating: r.rating, comment: r.comment, created_at: r.created_at, reply: r.reply, reply_draft: r.reply_draft, reply_status: r.reply_status })), location_pages: locationPageIdeas(f, audit?.page_facts || []) };
  }
  function draftReviewReply(ownerKey, reviewId) {
    const r = db.prepare('SELECT * FROM seo_reviews WHERE owner_key=? AND review_id=?').get(ownerKey, reviewId); if (!r) return null;
    const text = reviewReplyDraft(r, facts(ownerKey));
    db.prepare("UPDATE seo_reviews SET reply_draft=?,reply_status=CASE WHEN reply_status='replied' THEN reply_status ELSE 'drafted' END WHERE owner_key=? AND review_id=?").run(text, ownerKey, reviewId);
    return { review_id: reviewId, reply_draft: text };
  }
  async function postReviewReply(ownerKey, reviewId, comment) {
    const r = db.prepare('SELECT * FROM seo_reviews WHERE owner_key=? AND review_id=?').get(ownerKey, reviewId); if (!r) throw Object.assign(new Error('Review not found.'), { permanent: true });
    const t = await googleToken(ownerKey, 'google_business');
    await google.gbpReply(t, r.name, comment);
    db.prepare("UPDATE seo_reviews SET reply=?,reply_status='replied' WHERE owner_key=? AND review_id=?").run(comment, ownerKey, reviewId);
    return { replied: true };
  }

  // ---------------- website builder ----------------
  function sites(ownerKey) { return db.prepare('SELECT * FROM seo_sites WHERE owner_key=? ORDER BY created_at').all(ownerKey).map(siteOut); }
  const siteOut = (s) => ({ id: s.id, slug: s.slug, name: s.name, lang: s.lang, brand: J(s.brand_json, {}), url: `${ownBase()}/sites/${s.slug}/`, created_at: s.created_at, pages: db.prepare('SELECT id,slug,title,template,status,draft_version,published_version,scheduled_at,published_at,updated_at FROM seo_site_pages WHERE site_id=? ORDER BY created_at').all(s.id) });
  function createSite(ownerKey, { name, slug, brand = {} }, actor) {
    if (db.prepare('SELECT 1 FROM seo_sites WHERE slug=?').get(slug)) return { ok: false, status: 409, error: 'That site address is taken. Choose another.' };
    const id = uid(); db.prepare('INSERT INTO seo_sites(id,owner_key,slug,name,brand_json,created_at,updated_at) VALUES (?,?,?,?,?,?,?)').run(id, ownerKey, slug, name, JSON.stringify(brand), iso(), iso());
    return { ok: true, site: siteOut(db.prepare('SELECT * FROM seo_sites WHERE id=?').get(id)) };
  }
  const site = (ownerKey, id) => db.prepare('SELECT * FROM seo_sites WHERE id=? AND owner_key=?').get(id, ownerKey);
  const pageRow = (ownerKey, id) => db.prepare('SELECT * FROM seo_site_pages WHERE id=? AND owner_key=?').get(id, ownerKey);
  const version = (pageId, v) => { const r = db.prepare('SELECT * FROM seo_page_versions WHERE page_id=? AND version=?').get(pageId, v); return r ? { ...J(r.content_json, {}), version: r.version, created_at: r.created_at, note: r.note } : null; };
  function createPage(ownerKey, siteId, { title, slug, template = 'service', content = null, from_draft = null }, actor) {
    const s = site(ownerKey, siteId); if (!s) return { ok: false, status: 404, error: 'Site not found.' };
    if (db.prepare('SELECT 1 FROM seo_site_pages WHERE site_id=? AND slug=?').get(siteId, slug)) return { ok: false, status: 409, error: 'This site already has a page at that address.' };
    let c = content;
    if (from_draft) { const d = db.prepare('SELECT * FROM seo_drafts WHERE id=? AND owner_key=?').get(from_draft, ownerKey); if (!d) return { ok: false, status: 404, error: 'Draft not found.' }; const dj = J(d.draft_json, {}); c = { title: dj.title || title, meta_title: dj.meta_title, meta_description: dj.meta_description, blocks: dj.blocks || [], schema: dj.schema || [] }; db.prepare("UPDATE seo_drafts SET status='used',updated_at=? WHERE id=?").run(iso(), d.id); }
    if (!c) { const f = facts(ownerKey); c = { title, meta_title: title, meta_description: '', blocks: (TEMPLATES[template] || TEMPLATES.service).blocks.map((t) => blankBlock(t, title, f)), schema: [] }; }
    const id = uid();
    db.transaction(() => { db.prepare("INSERT INTO seo_site_pages(id,site_id,owner_key,slug,title,template,status,draft_version,created_at,updated_at) VALUES (?,?,?,?,?,?,'draft',1,?,?)").run(id, siteId, ownerKey, slug, title, template, iso(), iso()); db.prepare('INSERT INTO seo_page_versions(id,page_id,version,content_json,created_by,created_at,note) VALUES (?,?,1,?,?,?,?)').run(uid(), id, JSON.stringify({ ...c, slug, template }), actor, iso(), from_draft ? 'From a Content Studio draft' : 'Created'); })();
    return { ok: true, page: pageOut(ownerKey, id) };
  }
  function blankBlock(type, title, f) {
    switch (type) {
      case 'hero': return { type, heading: title, text: '', cta_label: 'Get a quote', cta_href: '#contact' };
      case 'text': return { type, heading: '', text: '' };
      case 'services': return { type, heading: 'Our services', items: f.services || [] };
      case 'areas': return { type, heading: 'Areas we serve', items: f.areas || [] };
      case 'faq': return { type, heading: 'Questions', items: [] };
      case 'cta': return { type, heading: 'Ready to start?', text: '', label: 'Contact us', href: '#contact' };
      case 'contact': return { type, heading: 'Contact', phone: f.phone || '', email: f.email || '', address: f.address || '' };
      case 'reviews': return { type, heading: 'What customers say', limit: 6 };
      default: return { type };
    }
  }
  function pageOut(ownerKey, id) {
    const p = pageRow(ownerKey, id); if (!p) return null;
    const s = db.prepare('SELECT * FROM seo_sites WHERE id=?').get(p.site_id);
    const draft = version(p.id, p.draft_version), live = p.published_version ? version(p.id, p.published_version) : null;
    const ctx = checkContext(ownerKey, s, p);
    return { ...p, site_slug: s.slug, draft, published: live ? { version: live.version, created_at: live.created_at } : null, versions: db.prepare('SELECT version,created_by,created_at,note FROM seo_page_versions WHERE page_id=? ORDER BY version DESC LIMIT 50').all(p.id), checks: prePublishChecks({ ...draft, id: p.id }, ctx), suggestions: designSuggestions({ ...draft, template: p.template }, { theme: ctx.theme, facts: ctx.facts }), live_url: `${ownBase()}/sites/${s.slug}/${p.slug === 'home' ? '' : p.slug}`, preview_url: `${ownBase()}/sites/${s.slug}/${p.slug}?preview=${previewToken(p.id, p.draft_version)}` };
  }
  function checkContext(ownerKey, s, p) { const brand = J(s.brand_json, {}); return { site: { name: s.name, base_path: `/sites/${s.slug}`, brand }, theme: themeFrom(brand), sitePages: db.prepare('SELECT id,slug,title,status FROM seo_site_pages WHERE site_id=?').all(s.id).map((x) => ({ ...x, meta_title: version(x.id, db.prepare('SELECT draft_version FROM seo_site_pages WHERE id=?').get(x.id).draft_version)?.meta_title })), facts: facts(ownerKey), reviews: approvedReviews(ownerKey) }; }
  function approvedReviews(ownerKey) { return db.prepare("SELECT reviewer,rating,comment FROM seo_reviews WHERE owner_key=? AND rating>=4 AND comment<>'' ORDER BY created_at DESC LIMIT 12").all(ownerKey).map((r) => ({ ...r, source: 'Google review' })); }
  function saveVersion(ownerKey, pageId, content, actor, note) {
    const p = pageRow(ownerKey, pageId); if (!p) return { ok: false, status: 404, error: 'Page not found.' };
    const next = (db.prepare('SELECT MAX(version) v FROM seo_page_versions WHERE page_id=?').get(p.id).v || 0) + 1;
    db.transaction(() => { db.prepare('INSERT INTO seo_page_versions(id,page_id,version,content_json,created_by,created_at,note) VALUES (?,?,?,?,?,?,?)').run(uid(), p.id, next, JSON.stringify({ ...content, slug: content.slug || p.slug, template: p.template }), actor, iso(), note || `Version ${next}`); db.prepare('UPDATE seo_site_pages SET draft_version=?,title=?,slug=?,updated_at=? WHERE id=?').run(next, content.title || p.title, content.slug || p.slug, iso(), p.id); })();
    return { ok: true, page: pageOut(ownerKey, pageId) };
  }
  const SECRET = () => String(env.SESSION_SECRET || env.SAAS_SESSION_SECRET || 'dev-preview-secret');
  function previewToken(pageId, v) { const exp = Date.now() + 7 * DAY; const body = `${pageId}.${v}.${exp}`; return Buffer.from(body).toString('base64url') + '.' + crypto.createHmac('sha256', SECRET()).update(body).digest('base64url').slice(0, 32); }
  function readPreview(token) { try { const [b, sig] = String(token).split('.'); const body = Buffer.from(b, 'base64url').toString(); const good = crypto.createHmac('sha256', SECRET()).update(body).digest('base64url').slice(0, 32); if (sig.length !== good.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(good))) return null; const [pageId, v, exp] = body.split('.'); return Number(exp) > Date.now() ? { pageId, version: Number(v) } : null; } catch { return null; } }
  // Ask to publish: low-risk changes may go live under the owner's rule; everything else waits for approval.
  function requestPublish(ownerKey, pageId, { publish_at = null } = {}, actor) {
    const p = pageRow(ownerKey, pageId); if (!p) return { ok: false, status: 404, error: 'Page not found.' };
    const out = pageOut(ownerKey, pageId);
    if (out.checks.blocked) return { ok: false, status: 409, error: 'Fix the problems marked "must fix" before publishing.', checks: out.checks };
    const engine = engineRef.current; if (!engine) return { ok: false, status: 503, error: 'Publishing approvals are not available.' };
    const r = engine.startRun({ id: null, scope: isPlatform(ownerKey) ? 'platform' : 'business', organisation_id: isPlatform(ownerKey) ? null : ownerKey, current_version: 0 }, { trigger: 'manual', key: `publish:${p.id}:v${p.draft_version}`, payload: { page_id: p.id, version: p.draft_version, publish_at }, definition: { trigger: 'manual', action: 'publish_site_page', conditions: [], params: { page_id: p.id, version: p.draft_version, publish_at: publish_at || null }, analysis: 'rules', always_approve: false, approval_expires_hours: 168 }, actor: actor ? { id: actor } : null });
    return { ok: true, run_id: r.id, duplicate: Boolean(r.duplicate), promise: r.promise };
  }
  // Called by the approved automation run.
  function publishVersion(ownerKey, pageId, v, { publish_at = null } = {}) {
    const p = pageRow(ownerKey, pageId); if (!p) throw Object.assign(new Error('Page not found.'), { permanent: true });
    if (!version(p.id, v)) throw Object.assign(new Error('That version no longer exists.'), { permanent: true });
    if (publish_at && Date.parse(publish_at) > Date.now()) { db.prepare("UPDATE seo_site_pages SET status='scheduled',scheduled_at=?,scheduled_version=?,updated_at=? WHERE id=?").run(publish_at, v, iso(), p.id); return { scheduled_for: publish_at, version: v }; }
    db.prepare("UPDATE seo_site_pages SET status='published',published_version=?,published_at=?,scheduled_at=NULL,scheduled_version=NULL,updated_at=? WHERE id=?").run(v, iso(), iso(), p.id);
    return { published: true, version: v };
  }
  function publishDue() {
    const due = db.prepare("SELECT * FROM seo_site_pages WHERE status='scheduled' AND scheduled_at<=?").all(iso());
    for (const p of due) db.prepare("UPDATE seo_site_pages SET status='published',published_version=scheduled_version,published_at=?,scheduled_at=NULL,scheduled_version=NULL,updated_at=? WHERE id=?").run(iso(), iso(), p.id);
    return due.length;
  }
  function publishProposal(ownerKey, pageId, v, publishAt) {
    const p = pageRow(ownerKey, pageId); if (!p) return null;
    const s = db.prepare('SELECT * FROM seo_sites WHERE id=?').get(p.site_id);
    const after = version(p.id, v), before = p.published_version ? version(p.id, p.published_version) : null;
    const ctx = checkContext(ownerKey, s, p), checks = prePublishChecks({ ...after, id: p.id }, ctx);
    const risk = classifyChange(before, after, { claims: checks.claims, firstRelease: !p.published_version });
    return { page: p, site: s, after, before, checks, risk, url: `/sites/${s.slug}/${p.slug === 'home' ? '' : p.slug}`, publish_at: publishAt };
  }
  function rollback(ownerKey, pageId, v, actor) {
    const p = pageRow(ownerKey, pageId); if (!p) return { ok: false, status: 404, error: 'Page not found.' };
    const old = version(p.id, v); if (!old) return { ok: false, status: 404, error: 'Version not found.' };
    const { version: _v, created_at: _c, note: _n, ...content } = old;
    const saved = saveVersion(ownerKey, pageId, content, actor, `Rolled back to version ${v}`);
    if (!saved.ok) return saved;
    return { ...requestPublish(ownerKey, pageId, {}, actor), rolled_back_to: v };
  }
  function renderPublic(siteSlug, pageSlug, previewTok) {
    publishDue();
    const s = db.prepare('SELECT * FROM seo_sites WHERE slug=?').get(siteSlug); if (!s) return null;
    const p = db.prepare('SELECT * FROM seo_site_pages WHERE site_id=? AND slug=?').get(s.id, pageSlug || 'home'); if (!p) return null;
    let v = p.published_version, preview = false;
    if (previewTok) { const t = readPreview(previewTok); if (!t || t.pageId !== p.id) return { status: 403 }; v = t.version; preview = true; }
    if (!v) return null;
    const c = version(p.id, v), brand = J(s.brand_json, {});
    const nav = db.prepare("SELECT slug,title FROM seo_site_pages WHERE site_id=? AND published_version IS NOT NULL ORDER BY created_at").all(s.id).map((x) => ({ href: `/sites/${s.slug}/${x.slug === 'home' ? '' : x.slug}`, label: x.title, current: x.slug === p.slug }));
    const html = renderPage(c, { site: { name: s.name, lang: s.lang, brand, abn: facts(s.owner_key).abn }, canonical: `${ownBase()}/sites/${s.slug}/${p.slug === 'home' ? '' : p.slug}`, nav, preview, reviews: c.blocks?.some((b) => b.type === 'reviews') ? approvedReviews(s.owner_key) : [] });
    return { status: 200, html, preview };
  }
  function siteSitemap(siteSlug) {
    const s = db.prepare('SELECT * FROM seo_sites WHERE slug=?').get(siteSlug); if (!s) return null;
    const pages = db.prepare('SELECT slug,published_at FROM seo_site_pages WHERE site_id=? AND published_version IS NOT NULL').all(s.id);
    return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${pages.map((p) => `<url><loc>${ownBase()}/sites/${s.slug}/${p.slug === 'home' ? '' : p.slug}</loc><lastmod>${String(p.published_at).slice(0, 10)}</lastmod></url>`).join('')}</urlset>`;
  }
  // Freshness: published pages not changed for six months, and audit pages that look stale.
  function freshness(ownerKey) {
    const old = db.prepare("SELECT p.id,p.title,p.slug,s.slug site,p.published_at FROM seo_site_pages p JOIN seo_sites s ON s.id=p.site_id WHERE p.owner_key=? AND p.published_version IS NOT NULL AND p.published_at<?").all(ownerKey, iso(Date.now() - 182 * DAY));
    return old.map((p) => ({ title: p.title, url: `/sites/${p.site}/${p.slug}`, last_published: p.published_at, note: 'Not updated for more than six months: check prices, services and areas are still right.' }));
  }

  // ---------------- measurement ----------------
  function dashboard(ownerKey, days = 28) {
    const end = iso(Date.now()).slice(0, 10), start = iso(Date.now() - days * DAY).slice(0, 10), pstart = iso(Date.now() - 2 * days * DAY).slice(0, 10);
    const g = (a, b) => db.prepare('SELECT COALESCE(SUM(clicks),0) clicks, COALESCE(SUM(impressions),0) impressions, CASE WHEN SUM(impressions)>0 THEN SUM(position*impressions)/SUM(impressions) END position, COUNT(*) n FROM seo_gsc_rows WHERE owner_key=? AND date>=? AND date<?').get(ownerKey, a, b);
    const cur = g(start, end + 'z'), prev = g(pstart, start);
    const ga = db.prepare("SELECT COALESCE(SUM(sessions),0) sessions, COALESCE(SUM(key_events),0) key_events, COALESCE(SUM(revenue),0) revenue, COUNT(*) n, MAX(currency) currency FROM seo_ga_rows WHERE owner_key=? AND date>=? AND channel='Organic Search'").get(ownerKey, start);
    const topPages = db.prepare('SELECT page, SUM(clicks) clicks, SUM(impressions) impressions, CASE WHEN SUM(impressions)>0 THEN SUM(position*impressions)/SUM(impressions) END position FROM seo_gsc_rows WHERE owner_key=? AND date>=? GROUP BY page ORDER BY clicks DESC LIMIT 15').all(ownerKey, start);
    const landing = db.prepare("SELECT landing_page, SUM(sessions) sessions, SUM(key_events) key_events, SUM(revenue) revenue FROM seo_ga_rows WHERE owner_key=? AND date>=? AND channel='Organic Search' GROUP BY landing_page ORDER BY sessions DESC LIMIT 15").all(ownerKey, start);
    const topQueries = db.prepare('SELECT query, SUM(clicks) clicks, SUM(impressions) impressions, CASE WHEN SUM(impressions)>0 THEN SUM(position*impressions)/SUM(impressions) END position FROM seo_gsc_rows WHERE owner_key=? AND date>=? GROUP BY query ORDER BY impressions DESC LIMIT 15').all(ownerKey, start);
    let leads = null, qualified = null, revenue = null;
    if (!isPlatform(ownerKey)) {
      const since = iso(Date.now() - days * DAY);
      leads = db.prepare("SELECT COUNT(*) n FROM tenant_documents WHERE organisation_id=? AND kind='enquiry' AND channel IN ('website','web','web_form') AND created_at>=?").get(ownerKey, since).n;
      qualified = db.prepare("SELECT COUNT(*) n FROM tenant_documents e WHERE e.organisation_id=? AND e.kind='enquiry' AND e.channel IN ('website','web','web_form') AND e.created_at>=? AND EXISTS (SELECT 1 FROM tenant_documents q WHERE q.organisation_id=e.organisation_id AND q.kind='quote' AND q.source_id=e.id)").get(ownerKey, since).n;
      revenue = db.prepare("SELECT COALESCE(SUM(p.amount_cents),0) c FROM job_payments p WHERE p.organisation_id=? AND p.status='paid' AND p.paid_at>=? AND p.customer_id IN (SELECT customer_id FROM tenant_documents WHERE organisation_id=? AND kind='enquiry' AND channel IN ('website','web','web_form'))").get(ownerKey, since, ownerKey).c;
    }
    const audit = latestAudit(ownerKey), cwv = db.prepare('SELECT * FROM seo_cwv WHERE owner_key=? ORDER BY fetched_at DESC LIMIT 4').all(ownerKey).map((r) => ({ url: r.url, strategy: r.strategy, field: J(r.field_json, null), lab: J(r.lab_json, {}), fetched_at: r.fetched_at }));
    const plan = latestPlan(ownerKey);
    return {
      period: { start, end, days },
      measured: {
        search_console: cur.n ? { clicks: cur.clicks, impressions: cur.impressions, ctr: cur.impressions ? cur.clicks / cur.impressions : 0, position: cur.position, previous: prev.n ? { clicks: prev.clicks, impressions: prev.impressions, ctr: prev.impressions ? prev.clicks / prev.impressions : 0, position: prev.position } : null, source: 'Google Search Console', top_pages: topPages, top_queries: topQueries } : null,
        analytics: ga.n ? { organic_sessions: ga.sessions, organic_key_events: ga.key_events, organic_revenue: ga.revenue, currency: ga.currency, source: 'Google Analytics 4 (channel: Organic Search)', landing_pages: landing } : null,
        leads: leads === null ? null : { website_enquiries: leads, qualified: qualified, source: 'Super Pro records: enquiries with the channel "website"; qualified = a quote was prepared' },
        revenue_attribution: revenue === null ? null : { paid_cents: revenue, source: 'Super Pro records: payments from customers whose enquiry came from the website. This is first-touch attribution by Super Pro, not Google.' },
        technical: audit ? { score: audit.score, fixes: audit.counts.fix, improvements: audit.counts.improve, audited_at: audit.created_at, source: 'Super Pro technical audit' } : null,
        core_web_vitals: cwv.length ? cwv : null
      },
      estimates: plan ? { priorities: (plan.priorities || []).slice(0, 10), source: 'Super Pro estimates from the reasons listed; not Google data', created_at: plan.created_at } : null
    };
  }

  // ---------------- reports and scheduled operations ----------------
  function report(ownerKey, kind = 'monthly') {
    const days = kind === 'daily' ? 1 : kind === 'weekly' ? 7 : 28;
    const d = dashboard(ownerKey, days), audit = latestAudit(ownerKey), prevA = previousAudit(ownerKey), plan = latestPlan(ownerKey);
    const newIssues = audit && prevA ? audit.checks.filter((c) => ['fix', 'improve'].includes(c.level) && !prevA.checks.some((p) => p.category === c.category && p.id === c.id && p.level === c.level)).map((c) => `${c.category_name}: ${c.title}`) : [];
    const fixed = audit && prevA ? prevA.checks.filter((p) => p.level === 'fix' && !audit.checks.some((c) => c.category === p.category && c.id === p.id && c.level === 'fix')).map((c) => `${c.category_name}: ${c.title}`) : [];
    const recs = [];
    if (audit) for (const c of audit.checks.filter((x) => x.level === 'fix').slice(0, 5)) recs.push(`Fix: ${c.title}${c.how ? ' — ' + c.how : ''}`);
    if (plan) for (const p of (plan.priorities || []).slice(0, 3)) recs.push(`${p.action === 'create' ? 'Create a page for' : 'Improve the page for'} "${p.primary}" (estimate: ${p.reasons.slice(0, 2).join('; ')})`);
    if (!d.measured.search_console) recs.push('Connect Google Search Console so clicks, impressions and positions can be measured.');
    const r = { kind, created_at: iso(), period: d.period, measured: d.measured, estimates: d.estimates, technical: audit ? { score: audit.score, counts: audit.counts, new_issues: newIssues, fixed } : null, clusters: kind === 'monthly' && plan ? { count: plan.clusters?.length || 0, gaps: (plan.gaps || []).slice(0, 10), pillars: (plan.pillars || []).slice(0, 6) } : null, freshness: kind !== 'daily' ? freshness(ownerKey) : [], recommendations: recs, note: 'Measured figures come from the named sources. Estimates are marked. Super Pro cannot guarantee indexing or rankings.' };
    const id = uid(); db.prepare('INSERT INTO seo_reports(id,owner_key,kind,period_start,period_end,created_at,report_json) VALUES (?,?,?,?,?,?,?)').run(id, ownerKey, kind, d.period.start, d.period.end, r.created_at, JSON.stringify(r));
    db.prepare('DELETE FROM seo_reports WHERE owner_key=? AND id NOT IN (SELECT id FROM seo_reports WHERE owner_key=? ORDER BY created_at DESC LIMIT 120)').run(ownerKey, ownerKey);
    return { id, ...r };
  }
  // DAILY: critical crawl errors, outages, indexing signals, broken pages.
  async function daily(ownerKey) {
    const target = isPlatform(ownerKey) ? ownBase() + '/' : facts(ownerKey).website_url;
    if (!target) return { skipped: 'No website address yet.' };
    const a = await runAudit(ownerKey, { trigger: 'daily', maxPages: 25 });
    const critical = a.checks.filter((c) => c.level === 'fix' && ['crawl', 'status', 'broken', 'index', 'robots', 'sitemap'].includes(c.category));
    let inspections = [];
    const gsc = link(ownerKey, 'search_console');
    if (gsc) { try { const t = await googleToken(ownerKey, 'google_seo'); for (const u of a.pages.filter((p) => p.status === 200).slice(0, 5).map((p) => p.url)) { const r = await google.gscInspect(t, gsc.resource, u); db.prepare('INSERT INTO seo_inspections(owner_key,url,result_json,inspected_at) VALUES (?,?,?,?) ON CONFLICT(owner_key,url) DO UPDATE SET result_json=excluded.result_json,inspected_at=excluded.inspected_at').run(ownerKey, u, JSON.stringify(r), iso()); inspections.push(r); } } catch (e) { inspections = [{ error: e.message }]; } }
    const notIndexed = inspections.filter((i) => i.verdict && i.verdict !== 'PASS');
    const r = report(ownerKey, 'daily');
    return { audit_id: a.id, score: a.score, critical: critical.map((c) => ({ title: c.title, count: c.count })), outage: a.pages[0]?.status !== 200, not_indexed: notIndexed.map((i) => ({ url: i.url, coverage: i.coverage })), report_id: r.id };
  }
  async function weekly(ownerKey) { const sync = await syncGoogle(ownerKey, { days: 28 }); const target = isPlatform(ownerKey) ? true : facts(ownerKey).website_url; if (target) await runAudit(ownerKey, { trigger: 'weekly' }); const plan = buildKeywordPlan(ownerKey); const r = report(ownerKey, 'weekly'); return { sync, clusters: plan.clusters.length, report_id: r.id }; }
  async function monthly(ownerKey) { const plan = buildKeywordPlan(ownerKey); const r = report(ownerKey, 'monthly'); return { clusters: plan.clusters.length, gaps: plan.gaps.length, report_id: r.id }; }

  return { facts, googleStatus, verifyGoogle, syncGoogle, setLink, link, google, googleToken, runAudit, latestAudit, buildKeywordPlan, latestPlan, addKeywordInputs, studio, local, draftReviewReply, postReviewReply, sites, createSite, site, createPage, pageOut, saveVersion, requestPublish, publishVersion, publishDue, publishProposal, rollback, renderPublic, siteSitemap, freshness, dashboard, report, daily, weekly, monthly, CONTENT_KINDS, siteBase: ownBase };
}
