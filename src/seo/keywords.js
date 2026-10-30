// Phase 06 Module B: the keyword and topic-cluster engine. Pure functions.
//
// Evidence only. Every keyword carries where it came from:
//   search_console  real queries with clicks, impressions, CTR and position (measured by Google)
//   import          a list the business uploaded, with the volume exactly as the source gave it and the source's name
//   site            phrases from the business's own page titles and headings
//   business_facts  the services and areas the business told us
//   manual          typed by a person
//   combination     a service + area pairing suggested by Super Pro (no evidence of demand until it shows in Search Console)
// Search volume is never estimated. Priority is a Super Pro estimate and is labelled as one, with its reasons.

const STOP = new Set('a an and are as at be by for from how i in is it my of on or our the to what when where which who why with your you me near can do does should will best top'.split(' '));
const TRANSACTIONAL = /\b(buy|book|booking|hire|price|prices|pricing|cost|costs|quote|quotes|cheap|affordable|emergency|same day|24 ?7|24 hour|near me|repair|install|installation|replace|replacement|service|services|company|companies|contractor|contractors)\b/;
const COMMERCIAL = /\b(best|top|vs|versus|compare|comparison|review|reviews|alternative|alternatives|recommended)\b/;
const INFORMATIONAL = /^(how|what|why|when|where|who|which|can|should|does|do|is|are|will)\b|\b(guide|tips|diy|meaning|ideas|checklist|examples|signs|causes)\b/;
export const INTENTS = { transactional: 'Ready to buy or book', commercial: 'Comparing options', informational: 'Looking for information', navigational: 'Looking for a specific business', local: 'Looking for someone nearby' };
const EVIDENCE_RANK = { search_console: 5, import: 4, site: 3, business_facts: 3, manual: 2, combination: 1 };

export const normalise = (k) => String(k || '').toLowerCase().replace(/[’']/g, '').replace(/[^a-z0-9 &+-]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120);
const stem = (w) => (w.length > 4 && w.endsWith('ies') ? w.slice(0, -3) + 'y' : w.length > 3 && w.endsWith('s') && !w.endsWith('ss') ? w.slice(0, -1) : w);
export const tokens = (k) => normalise(k).split(' ').filter((w) => w && !STOP.has(w)).map(stem);

export function intentOf(keyword, { areas = [], brand = '' } = {}) {
  const k = normalise(keyword);
  const local = /\bnear me\b/.test(k) || areas.some((a) => a && k.includes(normalise(a)));
  if (brand && k.includes(normalise(brand)) && !TRANSACTIONAL.test(k)) return { intent: 'navigational', local };
  if (INFORMATIONAL.test(k)) return { intent: 'informational', local };
  if (COMMERCIAL.test(k)) return { intent: 'commercial', local };
  if (local) return { intent: 'local', local };
  if (TRANSACTIONAL.test(k)) return { intent: 'transactional', local };
  return { intent: k.split(' ').length <= 2 ? 'commercial' : 'informational', local };
}

// Collect keywords from every evidence source and merge duplicates (keeping every source).
export function discoverKeywords({ services = [], areas = [], brand = '', pages = [], gsc = [], imports = [], manual = [] } = {}) {
  const map = new Map();
  const put = (raw, source, extra = {}) => {
    const k = normalise(raw); if (!k || k.length < 3 || k.split(' ').length > 10) return;
    const cur = map.get(k) || { keyword: k, sources: [], evidence: {} };
    if (!cur.sources.includes(source)) cur.sources.push(source);
    if (source === 'search_console') { const e = (cur.evidence.search_console ||= { clicks: 0, impressions: 0, pages: {} }); e.clicks += extra.clicks || 0; e.impressions += extra.impressions || 0; e.position_weighted = (e.position_weighted || 0) + (extra.position || 0) * (extra.impressions || 0); if (extra.page) e.pages[extra.page] = (e.pages[extra.page] || 0) + (extra.impressions || 0); }
    if (source === 'import' && extra.volume !== undefined && extra.volume !== null && extra.volume !== '') cur.evidence.import = { volume: Number(extra.volume), source_name: extra.source_name || 'Uploaded list' };
    if (source === 'site' && extra.page) (cur.evidence.site ||= []).push(extra.page);
    map.set(k, cur);
  };
  for (const s of services) put(s, 'business_facts');
  for (const s of services) for (const a of areas.slice(0, 15)) put(`${s} ${a}`, 'combination');
  for (const s of services) put(`${s} near me`, 'combination');
  // Page titles and headings count only when they are about something the business says it does.
  const topical = new Set(services.flatMap((x) => tokens(x)).filter((t) => t.length > 2));
  for (const p of pages) { for (const h of [p.title, ...(p.h1 || []), ...(p.h2 || []).slice(0, 6)]) { const phrase = String(h || '').split(/[|–—:·?]/)[0].replace(/^\s*\d+[.)]?\s+/, ''); const t = tokens(phrase); if (t.length >= 2 && t.length <= 6 && t.some((x) => topical.has(x))) put(phrase, 'site', { page: p.url }); } }
  for (const r of gsc) put(r.query, 'search_console', r);
  for (const r of imports) put(r.keyword, 'import', r);
  for (const m of manual) put(m, 'manual');
  return [...map.values()].map((k) => {
    const e = k.evidence.search_console;
    if (e) { e.ctr = e.impressions ? e.clicks / e.impressions : 0; e.position = e.impressions ? +(e.position_weighted / e.impressions).toFixed(1) : null; delete e.position_weighted; }
    return { ...k, ...intentOf(k.keyword, { areas, brand }), best_source: [...k.sources].sort((a, b) => EVIDENCE_RANK[b] - EVIDENCE_RANK[a])[0] };
  });
}

// Group keywords into topics by their core words (area names and intent modifiers removed).
export function clusterKeywords(list, { areas = [], threshold = 0.5 } = {}) {
  const areaTokens = new Set(areas.flatMap((a) => tokens(a)));
  const MOD = new Set(['me', 'cheap', 'affordable', 'emergency', 'same', 'day', 'price', 'cost', 'quote', 'service', 'company', 'local', 'perth', 'sydney', 'melbourne', 'brisbane', 'adelaide', 'hobart', 'darwin', 'canberra', 'australia', 'wa', 'nsw', 'vic', 'qld']);
  const core = (k) => new Set(tokens(k.keyword).filter((t) => !areaTokens.has(t) && !MOD.has(t)));
  const clusters = [];
  const sorted = [...list].sort((a, b) => strength(b) - strength(a));
  for (const k of sorted) {
    const c = core(k); if (!c.size) continue;
    let best = null, bestSim = 0;
    for (const cl of clusters) { const sim = jaccard(c, cl.core); if (sim > bestSim) { bestSim = sim; best = cl; } }
    if (best && bestSim >= threshold) { best.keywords.push(k); for (const t of c) best.counts[t] = (best.counts[t] || 0) + 1; }
    else clusters.push({ core: c, keywords: [k], counts: Object.fromEntries([...c].map((t) => [t, 1])) });
  }
  return clusters.map((cl, i) => {
    const kws = cl.keywords.sort((a, b) => strength(b) - strength(a));
    const intents = {}; for (const k of kws) intents[k.intent] = (intents[k.intent] || 0) + 1;
    const intent = Object.entries(intents).sort((a, b) => b[1] - a[1])[0][0];
    return { id: 'c' + (i + 1), name: kws[0].keyword, intent, intent_label: INTENTS[intent], local: kws.some((k) => k.local), primary: kws[0].keyword, secondary: kws.slice(1, 8).map((k) => k.keyword), keywords: kws, core_terms: Object.entries(cl.counts).sort((a, b) => b[1] - a[1]).map(([t]) => t).slice(0, 5) };
  });
}
function strength(k) {
  const e = k.evidence || {};
  return (e.search_console ? 1e6 + e.search_console.impressions : 0) + (e.import?.volume ? 1e5 + Math.min(e.import.volume, 99999) : 0) + EVIDENCE_RANK[k.best_source] * 1000 - k.keyword.length;
}
const jaccard = (a, b) => { let i = 0; for (const x of a) if (b.has(x)) i++; return i / (a.size + b.size - i || 1); };

// Which existing page best matches each cluster (title, h1, address and headings count most).
export function mapClustersToPages(clusters, pages) {
  return clusters.map((c) => {
    const terms = new Set(c.core_terms);
    const scored = pages.map((p) => {
      const t = (s, w) => tokens(s).filter((x) => terms.has(x)).length * w;
      const score = t(p.title, 3) + (p.h1 || []).reduce((s, h) => s + t(h, 3), 0) + t(decodeURIComponent(new URL(p.url).pathname).replace(/[/-]/g, ' '), 2) + (p.h2 || []).reduce((s, h) => s + t(h, 1), 0);
      return { url: p.url, score };
    }).filter((x) => x.score >= Math.max(3, terms.size * 2)).sort((a, b) => b.score - a.score);
    return { ...c, page: scored[0]?.url || null, page_score: scored[0]?.score || 0, competing_pages: scored.slice(1, 4).filter((x) => x.score >= scored[0].score * 0.8).map((x) => x.url) };
  });
}

// Cannibalisation: measured when Search Console shows two or more of the business's pages sharing impressions for the
// same query; possible when two pages target the same topic in their titles and headings.
export function findCannibalisation(mapped, keywords) {
  const out = [];
  for (const k of keywords) {
    const pages = k.evidence?.search_console?.pages; if (!pages) continue;
    const total = Object.values(pages).reduce((a, b) => a + b, 0), share = Object.entries(pages).filter(([, v]) => total && v / total >= 0.15);
    if (share.length >= 2 && total >= 20) out.push({ keyword: k.keyword, basis: 'measured', pages: share.map(([u, v]) => ({ url: u, impressions: v })), note: 'Search Console shows these pages competing for the same search.' });
  }
  for (const c of mapped) if (c.page && c.competing_pages.length && !out.some((o) => c.keywords.some((k) => k.keyword === o.keyword))) out.push({ keyword: c.primary, basis: 'possible', pages: [c.page, ...c.competing_pages].map((url) => ({ url })), note: 'These pages target the same topic in their titles and headings. Search Console data would confirm whether they compete.' });
  return out;
}

// Pillars (one per service, or per large topic), supporting clusters, gaps, links and priorities.
export function buildPlan({ keywords, clusters, pages = [], linkGraph = {}, services = [], jobsByTerm = {}, brand = '' }) {
  const mapped = mapClustersToPages(clusters, pages);
  const serviceTokens = services.map((s) => ({ service: s, t: new Set(tokens(s)) }));
  const serviceOf = (c) => { let best = null, sim = 0; for (const s of serviceTokens) { const j = jaccard(new Set(c.core_terms), s.t); if (j > sim) { sim = j; best = s.service; } } return sim >= 0.3 ? best : null; };
  const withService = mapped.map((c) => ({ ...c, service: serviceOf(c) }));
  const pillars = [];
  for (const s of services) {
    const members = withService.filter((c) => c.service === s); if (!members.length) continue;
    const head = members.find((c) => ['transactional', 'local', 'commercial'].includes(c.intent)) || members[0];
    pillars.push({ service: s, title: `${s}: complete guide and service page`, pillar_cluster: head.id, pillar_page: head.page, recommendation: head.page ? `Make ${head.page} the main page for "${s}" and link every supporting page to it.` : `Create a main page for "${s}" that answers what, cost, process and areas, then link supporting pages to it.`, supporting: members.filter((c) => c.id !== head.id).map((c) => c.id) });
  }
  const unassigned = withService.filter((c) => !c.service && c.keywords.length >= 3);
  for (const c of unassigned.slice(0, 5)) pillars.push({ service: null, title: `${c.name}`, pillar_cluster: c.id, pillar_page: c.page, recommendation: c.page ? `Grow ${c.page} into a hub for this topic.` : 'Consider a hub page for this topic if it fits your business.', supporting: [] });
  const gaps = withService.filter((c) => !c.page).map((c) => ({ cluster: c.id, primary: c.primary, intent: c.intent, suggested_page: c.intent === 'informational' ? 'Blog article or FAQ' : c.local ? 'Service-area page (only for areas you really serve)' : 'Service page', reason: c.keywords.some((k) => k.evidence?.search_console) ? 'People already find you for these searches but no page is focused on them.' : 'No page on your site covers this topic yet.' }));
  const links = [];
  for (const p of pillars) {
    const pillarPage = p.pillar_page; if (!pillarPage) continue;
    for (const id of p.supporting) { const c = withService.find((x) => x.id === id); if (!c?.page || c.page === pillarPage) continue;
      const has = (from, to) => (linkGraph[from] || []).includes(to);
      if (!has(c.page, pillarPage)) links.push({ from: c.page, to: pillarPage, anchor: p.service || withService.find((x) => x.id === p.pillar_cluster)?.primary, why: 'Supporting page should link up to its main page.' });
      if (!has(pillarPage, c.page)) links.push({ from: pillarPage, to: c.page, anchor: c.primary, why: 'Main page should link down to this supporting topic.' });
    }
  }
  const cannibalisation = findCannibalisation(withService, keywords);
  const priorities = withService.map((c) => {
    const reasons = [], sc = c.keywords.map((k) => k.evidence?.search_console).filter(Boolean);
    const imp = sc.reduce((s, e) => s + e.impressions, 0), clicks = sc.reduce((s, e) => s + e.clicks, 0);
    const pos = sc.length ? sc.reduce((s, e) => s + (e.position || 0) * e.impressions, 0) / (imp || 1) : null;
    let score = 0;
    if (imp) { score += Math.min(40, Math.log10(imp + 1) * 12); reasons.push(`${imp} impressions and ${clicks} clicks in Search Console (measured)`); }
    if (pos !== null && pos >= 4 && pos <= 20) { score += 15; reasons.push(`average position ${pos.toFixed(1)}: close to page one (measured)`); }
    const vol = c.keywords.map((k) => k.evidence?.import).filter(Boolean);
    if (vol.length) { const v = vol.reduce((s, e) => s + (e.volume || 0), 0); score += Math.min(20, Math.log10(v + 1) * 6); reasons.push(`volume ${v} as given by ${[...new Set(vol.map((x) => x.source_name))].join(', ')}`); }
    if (c.service) { score += 15; reasons.push(`matches your service "${c.service}"`); }
    const jobs = c.core_terms.reduce((s, t) => s + (jobsByTerm[t] || 0), 0);
    if (jobs) { score += Math.min(15, jobs * 3); reasons.push(`${jobs} of your past jobs relate to this topic`); }
    if (['transactional', 'local'].includes(c.intent)) { score += 10; reasons.push('people searching this are ready to book'); }
    if (!c.page) reasons.push('needs a new page'); else reasons.push(`improve the existing page ${c.page}`);
    if (!imp && !vol.length) reasons.push('no measured demand yet: treat as a hypothesis');
    return { cluster: c.id, primary: c.primary, score: Math.round(Math.min(100, score)), basis: 'estimate', reasons, action: c.page ? 'optimise' : 'create' };
  }).sort((a, b) => b.score - a.score);
  return { clusters: withService, pillars, gaps, internal_links: links.slice(0, 60), cannibalisation, priorities, note: 'Search volumes appear only when your uploaded list or Search Console provides them. Priority scores are Super Pro estimates from the reasons shown.', brand };
}

// Parse an uploaded keyword list (CSV: keyword[,volume]) without inventing anything missing.
export function parseKeywordCsv(text, sourceName = 'Uploaded list') {
  const rows = String(text || '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (!rows.length) return [];
  const split = (l) => l.match(/("([^"]|"")*"|[^,\t;]+)/g)?.map((c) => c.replace(/^"|"$/g, '').replace(/""/g, '"').trim()) || [];
  const head = split(rows[0]).map((h) => h.toLowerCase());
  const ki = head.findIndex((h) => /keyword|query|search term/.test(h)), vi = head.findIndex((h) => /volume|searches/.test(h));
  const hasHead = ki >= 0;
  return rows.slice(hasHead ? 1 : 0).slice(0, 2000).map((l) => { const c = split(l); const kw = c[hasHead ? ki : 0]; const vol = vi >= 0 ? c[vi] : (hasHead ? undefined : c[1]); const n = vol !== undefined && /^[\d,.\s]+$/.test(vol) ? Number(String(vol).replace(/[,\s]/g, '')) : null; return kw ? { keyword: kw, volume: Number.isFinite(n) ? n : null, source_name: sourceName } : null; }).filter(Boolean);
}
