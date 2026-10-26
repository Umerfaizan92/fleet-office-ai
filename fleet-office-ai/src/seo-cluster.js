// Modern SEO Cluster for every subscribing business: SEO, AEO, GEO, AIO and SXO, five checks each, re-run automatically every week.
// Everything is scoped to one organisation. A business's website is read politely (public https only, robots.txt honoured, no
// logged-in pages). Things that cannot be measured from outside (AI citations, search analytics) are logged by the business itself
// and are never invented. AI drafts are saved as drafts: nothing is published without a person.
import crypto from 'node:crypto';
import { z } from 'zod';
import { appendAuditLog } from './db.js';
import { analysePage, analyseRobots, extractJsonLd, robotsAllows, publicHost } from './visibility.js';

const DAY = 86400000;
const iso = (d = new Date()) => d.toISOString();
const SENIOR = ['owner', 'admin', 'manager', 'super_admin', 'director'];
const EDITORS = ['owner', 'admin', 'manager', 'super_admin', 'director'];
const clip = (s, n) => String(s ?? '').trim().slice(0, n);
const json = (s, f) => { try { return JSON.parse(s); } catch { return f; } };
const UA = 'SuperProVisibilityCheck/1.0';

export const PILLARS = {
  seo: { name: 'SEO', long: 'Search engine optimisation', checks: [['technical', 'Technical SEO'], ['onpage', 'On-Page SEO'], ['topical', 'Topical Authority'], ['entity', 'Entity & Semantic SEO'], ['offpage', 'Off-Page SEO']] },
  aeo: { name: 'AEO', long: 'Answer engine optimisation', checks: [['snippets', 'Featured Snippets'], ['questions', 'Question-Based Content'], ['voice', 'Voice Search SEO'], ['faq', 'FAQ Optimization'], ['overview', 'AI Overview Optimization']] },
  geo: { name: 'GEO', long: 'Generative engine optimisation', checks: [['citations', 'AI Citations'], ['llm', 'LLM Visibility'], ['mentions', 'Brand Mentions'], ['signals', 'Entity Signals'], ['recommend', 'AI Recommendations']] },
  aio: { name: 'AIO', long: 'AI optimisation', checks: [['visibility', 'AI Search Visibility'], ['content', 'AI Content Optimization'], ['trust', 'AI Overview'], ['mode', 'AI Mode Optimization'], ['analytics', 'AI Search Analytics']] },
  sxo: { name: 'SXO', long: 'Search experience optimisation', checks: [['intent', 'Search Intent'], ['ux', 'UX & Page Experience'], ['cro', 'CRO'], ['readability', 'Content Experience'], ['engagement', 'Engagement & Retention']] }
};
const PENALTY = { fix: 20, improve: 8, setup: 8, good: 0 };
export const pillarScore = (checks) => Math.max(0, 100 - checks.reduce((s, c) => s + (PENALTY[c.level] ?? 0), 0));

/* ---------------------------------------------------------------- text helpers --- */
const strip = (h) => String(h || '').replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<nav[\s\S]*?<\/nav>|<footer[\s\S]*?<\/footer>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
const words = (t) => String(t || '').split(/\s+/).filter(Boolean);
const keywords = (s) => [...new Set(String(s || '').toLowerCase().match(/[a-z]{4,}/g) || [])].filter((w) => !['with', 'that', 'this', 'from', 'your', 'services', 'service', 'and', 'the'].includes(w));
const QUESTION = /^(who|what|when|where|why|how|can|could|does|do|is|are|will|should|which|how much|how long)\b/i;
const headings = (html, tags = 'h2|h3') => [...String(html).matchAll(new RegExp(`<(${tags})\\b[^>]*>([\\s\\S]*?)<\\/\\1>`, 'gi'))].map((m) => ({ tag: m[1].toLowerCase(), text: strip(m[2]), index: m.index, end: m.index + m[0].length }));
const paragraphAfter = (html, end) => { const m = String(html).slice(end, end + 2500).match(/<p\b[^>]*>([\s\S]*?)<\/p>/i); return m ? strip(m[1]) : ''; };
const level = (cond, worse = 'improve') => (cond === true ? 'good' : cond === false ? worse : cond);

// Pure: turns what we know about one business into five scored pillars. `site` may be null when no website is saved.
export function analyseCluster({ profile = {}, site = null, content = [], channels = [], aiLog = [], metrics = [], signals = {}, now = Date.now() } = {}) {
  const out = {}; const c = (pillar, id, lvl, text, how) => { (out[pillar] ||= []).push({ id, name: Object.fromEntries(PILLARS[pillar].checks)[id], level: lvl, text, how: how || '' }); };
  const services = (profile.services || []).filter(Boolean), areas = (profile.areas || []).filter(Boolean);
  const pages = site?.pages || [], home = pages[0], html = pages.map((p) => p.html).join('\n'), text = strip(html), lowerText = text.toLowerCase();
  const ld = pages.flatMap((p) => extractJsonLd(p.html).items), ldTypes = ld.flatMap((x) => [].concat(x?.['@type'] || []));
  const homeA = home ? analysePage(home.html, { url: home.url }) : null;
  const fa = (id) => homeA?.findings.find((f) => f.id === id);
  const noSite = !site?.reachable;
  const needSite = (pillar, id, name) => c(pillar, id, 'setup', 'Add your website address in Business facts so this can be checked.', 'Open Business facts, enter your website, then run the check.');
  const faqItems = content.filter((x) => x.kind === 'faq'), contentCount = content.length;
  const recentAi = aiLog.filter((x) => now - Date.parse(x.checked_at) < 45 * DAY);
  const isLocal = ld.some((x) => [].concat(x?.['@type'] || []).some((t) => /LocalBusiness|Organization|ProfessionalService|HomeAndConstructionBusiness|Plumber|Electrician|Store/i.test(t)));

  /* ---- SEO ---- */
  if (noSite) needSite('seo', 'technical'); else {
    const bad = []; const soft = [];
    if (!site.https) bad.push('The site is not on https.'); if (!fa('viewport') || fa('viewport').level === 'fix') bad.push('No mobile viewport setting.');
    if (site.noindex) bad.push('The page tells search engines not to index it.');
    if (!fa('canonical') || fa('canonical').level !== 'good') soft.push('No canonical link.'); if (!site.sitemap) soft.push('No sitemap.xml found.'); if (!site.robots) soft.push('No robots.txt found.');
    c('seo', 'technical', bad.length ? 'fix' : soft.length ? 'improve' : 'good', bad.length || soft.length ? [...bad, ...soft].join(' ') : 'Secure, mobile-ready, indexable, with a sitemap and robots.txt.', 'Use https, add a viewport tag, a canonical link and publish /sitemap.xml and /robots.txt.');
  }
  if (noSite) needSite('seo', 'onpage'); else {
    const f = ['title', 'description', 'h1'].map(fa).filter(Boolean), worst = f.some((x) => x.level === 'fix') ? 'fix' : f.some((x) => x.level === 'improve') ? 'improve' : 'good';
    c('seo', 'onpage', worst, worst === 'good' ? 'Title, description and main heading are all in good shape.' : f.filter((x) => x.level !== 'good').map((x) => x.text).join(' '), 'One clear h1, a 25-65 character title and a 70-170 character description that name what you do and where.');
  }
  if (!services.length) c('seo', 'topical', 'setup', 'List your main services so we can check you cover each one.', 'Add services in Business facts.');
  else { const covered = services.filter((s) => { const k = keywords(s); return k.length && k.some((w) => lowerText.includes(w) || content.some((x) => (x.title + ' ' + x.body).toLowerCase().includes(w))); }); const r = covered.length / services.length; c('seo', 'topical', r >= 0.8 ? 'good' : r >= 0.4 ? 'improve' : 'fix', `${covered.length} of ${services.length} services have a page or content item. ${services.filter((s) => !covered.includes(s)).slice(0, 3).map((s) => `Missing: ${s}.`).join(' ')}`.trim(), 'Give each service its own page or post with specific, useful detail.'); }
  if (noSite) needSite('seo', 'entity'); else {
    const item = ld.find((x) => [].concat(x?.['@type'] || []).some((t) => /LocalBusiness|Organization|ProfessionalService|Plumber|Electrician|Store/i.test(t)));
    if (!item) c('seo', 'entity', 'fix', 'No Organisation or LocalBusiness structured data on your site.', 'Copy the generated structured data from the Schema & files section into your site header.');
    else { const miss = ['name', 'telephone', 'address', 'sameAs'].filter((k) => !item[k]); c('seo', 'entity', miss.length ? 'improve' : 'good', miss.length ? `Structured data is missing: ${miss.join(', ')}.` : 'Your business is described clearly to search engines (name, phone, address, profiles).', 'Fill every field in the generated structured data.'); }
  }
  { const profiles = new Set([...(profile.same_as || []), ...channels.filter((x) => x.status === 'connected').map((x) => x.provider)]); const reviews = content.filter((x) => x.kind === 'review').length;
    c('seo', 'offpage', profiles.size >= 3 && reviews >= 3 ? 'good' : profiles.size || reviews ? 'improve' : 'setup', `${profiles.size} business profile${profiles.size === 1 ? '' : 's'} linked and ${reviews} review${reviews === 1 ? '' : 's'} saved. Backlinks cannot be measured here, so this counts the profiles and reviews you give us.`, 'Connect your social channels, add your Google Business Profile link and save your best reviews.'); }

  /* ---- AEO ---- */
  if (noSite) { for (const id of ['snippets', 'faq', 'overview']) needSite('aeo', id); } else {
    const hs = pages.flatMap((p) => headings(p.html).map((h) => ({ ...h, p }))); const snippets = hs.filter((h) => { const n = words(paragraphAfter(h.p.html, h.end)).length; return n >= 20 && n <= 60; }).length;
    c('aeo', 'snippets', snippets >= 3 ? 'good' : snippets ? 'improve' : 'fix', `${snippets} section${snippets === 1 ? '' : 's'} open with a short, direct answer (20 to 60 words).`, 'Put a one or two sentence answer straight under each heading, then the detail.');
  }
  { const qh = noSite ? 0 : pages.flatMap((p) => headings(p.html, 'h1|h2|h3|h4')).filter((h) => QUESTION.test(h.text) || /\?$/.test(h.text)).length; const n = qh + faqItems.length;
    c('aeo', 'questions', n >= 5 ? 'good' : n >= 2 ? 'improve' : (noSite && !n) ? 'setup' : 'fix', `${n} question-style heading${n === 1 ? '' : 's'} or FAQ item${n === 1 ? '' : 's'} (${qh} on your site, ${faqItems.length} in your library).`, 'Write down the questions customers really ask and answer each in plain words.'); }
  { const hasTel = /href=["']tel:/i.test(html), local = ld.some((x) => x?.telephone && (x?.areaServed || x?.address || x?.openingHoursSpecification));
    if (noSite) c('aeo', 'voice', 'setup', 'Add your website address so this can be checked.', ''); else c('aeo', 'voice', hasTel && local ? 'good' : hasTel || local ? 'improve' : 'fix', hasTel && local ? 'Phone link and local details are ready for voice assistants.' : `${hasTel ? '' : 'No tap-to-call phone link. '}${local ? '' : 'Structured data does not give phone plus area or address.'}`.trim(), 'Add a tel: link and put phone, address, area served and opening hours in your structured data.'); }
  if (!noSite) { const faqLd = ld.find((x) => [].concat(x?.['@type'] || []).includes('FAQPage')), n = [].concat(faqLd?.mainEntity || []).length; c('aeo', 'faq', n >= 3 ? 'good' : faqLd ? 'improve' : 'fix', faqLd ? `FAQ structured data lists ${n} question${n === 1 ? '' : 's'}.` : 'No FAQ structured data on your site.', 'Use the generated FAQ structured data (from your FAQ library) on your questions page.'); }
  if (!noSite) { const first = home && words(paragraphAfter(home.html, (headings(home.html, 'h1')[0] || { end: 0 }).end)).length, lists = (html.match(/<(ul|ol|table)\b/gi) || []).length; c('aeo', 'overview', first >= 15 && first <= 70 && lists >= 1 ? 'good' : first >= 15 || lists >= 1 ? 'improve' : 'fix', `${first >= 15 && first <= 70 ? 'The page opens with a short summary.' : 'The page does not open with a short summary under the main heading.'} ${lists ? `${lists} list or table found.` : 'No lists or tables found.'}`, 'Open with a two-sentence summary, then use lists and tables for steps, prices and comparisons.'); }

  /* ---- GEO ---- */
  { const cited = recentAi.filter((x) => x.mentioned).length; c('geo', 'citations', !recentAi.length ? 'setup' : cited ? 'good' : 'improve', !recentAi.length ? 'No AI answer checks logged in the last 45 days. Ask ChatGPT, Gemini, Perplexity or Copilot a customer question and log what they say.' : `${cited} of ${recentAi.length} logged AI answers named your business.`, 'Use AI answer log to record each check. We never guess at AI citations.'); }
  if (noSite) needSite('geo', 'llm'); else { const rb = site.robotsText ? analyseRobots(site.robotsText) : [], blocked = rb.find((x) => x.id === 'ai_crawlers' && x.level === 'fix'); c('geo', 'llm', blocked ? 'fix' : !site.llms ? 'improve' : 'good', blocked ? blocked.text : !site.llms ? 'AI crawlers are allowed. A short llms.txt would help AI tools understand your site.' : 'AI crawlers are allowed and llms.txt is published.', 'Do not block AI crawlers in robots.txt. Publish the generated llms.txt.'); }
  { const mentions = content.filter((x) => ['press', 'review', 'post'].includes(x.kind)).length, ch = channels.filter((x) => x.status === 'connected').length; c('geo', 'mentions', ch + mentions >= 6 ? 'good' : ch + mentions ? 'improve' : 'setup', `${ch} connected channel${ch === 1 ? '' : 's'} and ${mentions} saved mention${mentions === 1 ? '' : 's'} (posts, reviews, press).`, 'Connect your channels and save press, reviews and posts that name your business.'); }
  if (noSite) needSite('geo', 'signals'); else { const digits = String(profile.phone || '').replace(/\D/g, '').slice(-8), checks = [['name', profile.business_name && lowerText.includes(String(profile.business_name).toLowerCase().slice(0, 18))], ['phone', digits && text.replace(/\D/g, '').includes(digits)], ['profiles', ld.some((x) => [].concat(x?.sameAs || []).length >= 2)], ['abn', !profile.abn || text.replace(/\s/g, '').includes(String(profile.abn).replace(/\s/g, ''))]].filter(([, ok]) => !ok).map(([k]) => k); c('geo', 'signals', !checks.length ? 'good' : checks.length > 2 ? 'fix' : 'improve', checks.length ? `Your site does not clearly repeat your ${checks.join(', ')} the same way as your profile.` : 'Business name, phone, ABN and profile links match across your site and profile.', 'Use the same name, phone and address everywhere and link your profiles from your site.'); }
  { const recs = recentAi.filter((x) => x.kind === 'recommendation'); const ok = recs.filter((x) => x.mentioned).length; c('geo', 'recommend', !recs.length ? 'setup' : ok ? 'good' : 'improve', !recs.length ? 'Log a few "best [service] near [suburb]" questions to see whether AI recommends you.' : `${ok} of ${recs.length} recommendation checks named your business.`, 'Ask AI tools for the best provider of your service in your area and log the answer.'); }

  /* ---- AIO ---- */
  if (noSite) needSite('aio', 'visibility'); else { const rb = site.robotsText ? analyseRobots(site.robotsText) : [], blocked = rb.some((x) => x.id === 'ai_crawlers' && x.level === 'fix'); c('aio', 'visibility', blocked || site.noindex ? 'fix' : !site.sitemap ? 'improve' : 'good', blocked ? 'AI crawlers are blocked.' : site.noindex ? 'Your page asks not to be indexed.' : !site.sitemap ? 'No sitemap for AI and search crawlers.' : 'AI and search crawlers can find and read your pages.', 'Allow AI crawlers, publish a sitemap and avoid noindex on public pages.'); }
  { const wc = words(text).length, h2n = (html.match(/<h2\b/gi) || []).length, lists = (html.match(/<(ul|ol)\b/gi) || []).length, fresh = content.some((x) => now - Date.parse(x.created_at) < 60 * DAY) || ld.some((x) => x?.dateModified && now - Date.parse(x.dateModified) < 120 * DAY);
    if (noSite && !contentCount) c('aio', 'content', 'setup', 'Add your website or a few content items to check structure and freshness.', ''); else c('aio', 'content', (noSite || (wc >= 300 && h2n >= 3 && lists >= 1)) && fresh ? 'good' : (wc >= 150 || contentCount) ? 'improve' : 'fix', `${noSite ? '' : `${wc} words, ${h2n} section headings, ${lists} lists. `}${fresh ? 'Fresh content added in the last 60 days.' : 'Nothing new added in the last 60 days.'}`, 'Add or update a useful page or post at least every month, with headings and lists.'); }
  if (noSite) needSite('aio', 'trust'); else { const links = (id) => new RegExp(`href=["'][^"']*${id}`, 'i').test(html), t = ['about', 'contact', 'privacy', 'terms'].filter(links); c('aio', 'trust', t.length >= 3 && (profile.abn || ld.length) ? 'good' : t.length >= 2 ? 'improve' : 'fix', `Trust pages found: ${t.join(', ') || 'none'}. ${profile.abn ? 'ABN on file.' : 'No ABN on file.'}`, 'Link About, Contact, Privacy and Terms from every page, show your ABN and who is behind the business.'); }
  { const covered = areas.filter((a) => lowerText.includes(a.toLowerCase()) || content.some((x) => (x.title + ' ' + x.body).toLowerCase().includes(a.toLowerCase()))); c('aio', 'mode', !areas.length ? 'setup' : covered.length / areas.length >= 0.7 ? 'good' : covered.length ? 'improve' : 'fix', !areas.length ? 'Add the suburbs or areas you serve so we can check you answer local, conversational questions.' : `${covered.length} of ${areas.length} service areas are named on your site or in your content.`, 'Write short local answers such as "Do you service Fremantle?" for each area.'); }
  { const m = metrics.filter((x) => now - Date.parse(x.captured_at) < 21 * DAY); c('aio', 'analytics', m.length ? 'good' : 'setup', m.length ? `${m.length} search or AI traffic figure${m.length === 1 ? '' : 's'} logged in the last 3 weeks.` : 'No search or AI-referral figures logged lately. Add clicks, impressions or AI referrals from Google Search Console or Bing Webmaster Tools.', 'Log your weekly Search Console / Bing numbers under AI search analytics.'); }

  /* ---- SXO ---- */
  if (noSite) needSite('sxo', 'intent'); else { const title = (homeA?.facts.title || '') + ' ' + (homeA?.facts.h1.join(' ') || ''), t = title.toLowerCase(), hasService = services.length ? services.some((s) => keywords(s).some((w) => t.includes(w))) : true, hasPlace = areas.length ? areas.some((a) => t.includes(a.toLowerCase().split(/[ ,]/)[0])) : true, cta = /(call|book|quote|enquire|contact|get started|request)/i.test(strip(String(home?.html || '').slice(0, 6000))); c('sxo', 'intent', hasService && hasPlace && cta ? 'good' : (hasService || hasPlace) && cta ? 'improve' : 'fix', `${hasService ? 'Your title and heading name a service.' : 'Your title and heading do not name a service.'} ${hasPlace ? '' : 'They do not name where you work. '}${cta ? 'A clear next step is near the top.' : 'No clear next step near the top.'}`, 'Say what you do and where in the title and main heading, and give one clear button.'); }
  if (noSite) needSite('sxo', 'ux'); else { const imgs = [...html.matchAll(/<img\b[^>]*>/gi)].map((m) => m[0]), noAlt = imgs.filter((t) => !/\balt=/i.test(t)).length, noDim = imgs.filter((t) => !/\bwidth=/i.test(t) || !/\bheight=/i.test(t)).length, big = (home?.html.length || 0) > 600000, vp = fa('viewport')?.level !== 'fix'; const issues = [!vp && 'no mobile viewport', noAlt && `${noAlt} images without alt text`, noDim > 2 && `${noDim} images without width and height`, big && 'the page is very heavy'].filter(Boolean); c('sxo', 'ux', !vp ? 'fix' : issues.length ? 'improve' : 'good', issues.length ? `Fix: ${issues.join(', ')}.` : 'Mobile-ready, images described and sized, page is light.', 'Compress images, give each an alt text and width and height, and test on a phone.'); }
  if (noSite) needSite('sxo', 'cro'); else { const sig = [/href=["']tel:/i.test(html) && 'tap-to-call', /href=["']mailto:/i.test(html) && 'email link', /<form\b/i.test(html) && 'form', /(book|quote|schedule)[^<]{0,30}<\/a>|href=["'][^"']*(book|quote|contact)/i.test(html) && 'booking or quote link'].filter(Boolean); c('sxo', 'cro', sig.length >= 2 ? 'good' : sig.length ? 'improve' : 'fix', sig.length ? `Ways to act: ${sig.join(', ')}.` : 'No phone link, form or booking link found.', 'Offer at least a tap-to-call button and a short enquiry or quote form.'); }
  if (noSite) needSite('sxo', 'readability'); else { const sentences = text.split(/[.!?]+\s/).filter((s) => s.length > 20), avg = sentences.length ? words(text).length / sentences.length : 0, media = (html.match(/<(img|video|picture)\b/gi) || []).length; c('sxo', 'readability', avg && avg <= 22 && media >= 2 ? 'good' : avg <= 28 ? 'improve' : 'fix', `Average sentence is ${Math.round(avg)} words. ${media} image or video item${media === 1 ? '' : 's'}.`, 'Keep sentences short, add photos or video of your real work, and break text up with headings.'); }
  { const s = signals; const parts = [s.posts30 >= 4 && 'regular posting', s.followups && 'customer reminders on', s.channels >= 2 && 'two or more channels'].filter(Boolean); c('sxo', 'engagement', parts.length >= 2 ? 'good' : parts.length ? 'improve' : 'setup', `${s.posts30 || 0} posts in the last 30 days, ${s.channels || 0} connected channel${s.channels === 1 ? '' : 's'}, customer reminders ${s.followups ? 'on' : 'off'}.`, 'Post weekly, connect at least two channels and switch on friendly customer reminders in Money.'); }

  const pillars = Object.fromEntries(Object.keys(PILLARS).map((k) => [k, { score: pillarScore(out[k] || []), checks: out[k] || [] }]));
  const all = Object.values(pillars), score = Math.round(all.reduce((s, p) => s + p.score, 0) / all.length);
  return { score, pillars };
}

// The to-do list: fixes first, then setup, then improvements. Short, specific, in order.
export function buildActions(pillars, max = 8) {
  const rank = { fix: 0, setup: 1, improve: 2 }, rows = [];
  for (const [key, p] of Object.entries(pillars)) for (const c of p.checks) if (c.level !== 'good') rows.push({ pillar: key, pillar_name: PILLARS[key].name, check: c.name, level: c.level, text: c.text, how: c.how });
  return rows.sort((a, b) => rank[a.level] - rank[b.level]).slice(0, max);
}

export function buildSchema(profile, faq = []) {
  const same = [...new Set(profile.same_as || [])].filter((u) => /^https:\/\//.test(u));
  const biz = { '@context': 'https://schema.org', '@type': 'LocalBusiness', name: profile.business_name || '', url: profile.website_url || undefined, telephone: profile.phone || undefined, address: profile.address ? { '@type': 'PostalAddress', streetAddress: profile.address, addressCountry: 'AU' } : undefined, areaServed: (profile.areas || []).map((a) => ({ '@type': 'Place', name: a })), makesOffer: (profile.services || []).map((s) => ({ '@type': 'Offer', itemOffered: { '@type': 'Service', name: s } })), sameAs: same.length ? same : undefined, taxID: profile.abn ? `ABN ${profile.abn}` : undefined };
  const faqLd = faq.length ? { '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: faq.slice(0, 20).map((q) => ({ '@type': 'Question', name: q.title, acceptedAnswer: { '@type': 'Answer', text: q.body } })) } : null;
  const llms = [`# ${profile.business_name || 'Business'}`, '', `> ${(profile.services || []).slice(0, 5).join(', ') || 'Local services'}${(profile.areas || []).length ? ` in ${(profile.areas || []).slice(0, 5).join(', ')}` : ''}.`, '', profile.website_url ? `- Website: ${profile.website_url}` : '', profile.phone ? `- Phone: ${profile.phone}` : '', ...(profile.services || []).map((s) => `- Service: ${s}`)].filter((x) => x !== '').join('\n');
  return { business_json_ld: JSON.stringify(biz, null, 2), faq_json_ld: faqLd ? JSON.stringify(faqLd, null, 2) : '', llms_txt: llms };
}

/* ---------------------------------------------------------------- install --- */
export function installSeoCluster(app, { db, env = {}, requireSaasUser, requireSaasRole, requireAdmin, saasAudit, generateAiText, notify, entitlements, fetchImpl = globalThis.fetch, resolveHost = publicHost, timers = true }) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS seo_profiles (organisation_id TEXT PRIMARY KEY, website_url TEXT, business_name TEXT, services_json TEXT NOT NULL DEFAULT '[]', areas_json TEXT NOT NULL DEFAULT '[]', phone TEXT, address TEXT, abn TEXT, same_as_json TEXT NOT NULL DEFAULT '[]', weekly INTEGER NOT NULL DEFAULT 1, updated_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS seo_content (id TEXT PRIMARY KEY, organisation_id TEXT NOT NULL, kind TEXT NOT NULL, title TEXT NOT NULL, url TEXT, body TEXT NOT NULL DEFAULT '', channel TEXT, source TEXT NOT NULL DEFAULT 'member', created_by TEXT, created_at TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS idx_seo_content_org ON seo_content(organisation_id, created_at);
    CREATE TABLE IF NOT EXISTS seo_ai_log (id TEXT PRIMARY KEY, organisation_id TEXT NOT NULL, platform TEXT NOT NULL, kind TEXT NOT NULL DEFAULT 'citation', prompt_text TEXT NOT NULL, mentioned INTEGER NOT NULL DEFAULT 0, note TEXT, checked_at TEXT NOT NULL, checked_by TEXT);
    CREATE INDEX IF NOT EXISTS idx_seo_ai_log_org ON seo_ai_log(organisation_id, checked_at);
    CREATE TABLE IF NOT EXISTS seo_metrics (id TEXT PRIMARY KEY, organisation_id TEXT NOT NULL, source TEXT NOT NULL, metric_key TEXT NOT NULL, metric_value REAL NOT NULL, captured_at TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS idx_seo_metrics_org ON seo_metrics(organisation_id, captured_at);
    CREATE TABLE IF NOT EXISTS seo_cluster_reports (id TEXT PRIMARY KEY, organisation_id TEXT NOT NULL, created_at TEXT NOT NULL, trigger TEXT NOT NULL, score INTEGER NOT NULL, previous_score INTEGER, pillars_json TEXT NOT NULL, actions_json TEXT NOT NULL, summary TEXT NOT NULL, site_json TEXT NOT NULL DEFAULT '{}');
    CREATE INDEX IF NOT EXISTS idx_seo_reports_org ON seo_cluster_reports(organisation_id, created_at);
  `);
  const readGate = [requireSaasUser, requireSaasRole(...SENIOR)], writeGate = [requireSaasUser, requireSaasRole(...EDITORS)];
  const org = (req) => req.saas.organisation_id;
  const audit = (req, action, id, meta = {}) => { try { saasAudit(req, action, 'seo_cluster', id, meta); } catch { /* audit is best effort here */ } };

  function profileOf(o) {
    const r = db.prepare(`SELECT * FROM seo_profiles WHERE organisation_id=?`).get(o), ob = db.prepare(`SELECT phone,website,service_area,services FROM onboarding_profiles WHERE organisation_id=?`).get(o) || {}, org_ = db.prepare(`SELECT COALESCE(display_name,name) name, abn FROM organisations WHERE id=?`).get(o) || {};
    const obServices = json(ob.services, []), obAreas = String(ob.service_area || '').split(/[,;\n]/).map((s) => s.trim()).filter(Boolean);
    return { website_url: r?.website_url || ob.website || '', business_name: r?.business_name || org_.name || '', services: r ? json(r.services_json, []) : (Array.isArray(obServices) ? obServices : []), areas: r ? json(r.areas_json, []) : obAreas, phone: r?.phone || ob.phone || '', address: r?.address || '', abn: r?.abn || org_.abn || '', same_as: r ? json(r.same_as_json, []) : [], weekly: r ? Boolean(r.weekly) : true, saved: Boolean(r) };
  }

  /* ---- reading the business's own website (public https only, politely) ---- */
  async function fetchText(url, ms = 8000) {
    const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), ms);
    try { const r = await fetchImpl(url, { signal: ctl.signal, redirect: 'manual', headers: { 'user-agent': UA, accept: 'text/html,text/plain,application/xml' } }); const body = (await r.text()).slice(0, 500000); return { ok: r.status >= 200 && r.status < 300, status: r.status, body, location: r.headers?.get?.('location') || '' }; }
    catch { return { ok: false, status: 0, body: '' }; } finally { clearTimeout(t); }
  }
  async function readSite(rawUrl) {
    let u; try { u = new URL(rawUrl); } catch { return { reachable: false, note: 'The website address is not valid.' }; }
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return { reachable: false, note: 'Only http or https addresses can be checked.' };
    if (!(await resolveHost(u.hostname))) return { reachable: false, note: 'Only public websites can be checked.' };
    const rb = await fetchText(`${u.origin}/robots.txt`, 5000);
    if (rb.ok && !robotsAllows(rb.body, u.pathname || '/')) return { reachable: false, note: 'Your robots.txt asks automated tools not to read this page, so it was skipped.' };
    let first = await fetchText(u.href), hops = 0;
    while (first.status >= 300 && first.status < 400 && first.location && hops++ < 3) { let nx; try { nx = new URL(first.location, u.href); } catch { break; } if (nx.host !== u.host && nx.host !== 'www.' + u.host && 'www.' + nx.host !== u.host) return { reachable: false, note: 'The website redirects to a different site. Use the final address.' }; if (!(await resolveHost(nx.hostname))) break; u = nx; first = await fetchText(u.href); }
    if (!first.ok) return { reachable: false, note: `The website could not be read (${first.status || 'no answer'}).` };
    const sm = await fetchText(`${u.origin}/sitemap.xml`, 5000), ll = await fetchText(`${u.origin}/llms.txt`, 5000);
    const pages = [{ url: u.href, html: first.body }];
    const locs = sm.ok ? [...sm.body.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]).filter((x) => { try { const p = new URL(x); return p.origin === u.origin && p.href !== u.href; } catch { return false; } }).slice(0, 3) : [];
    for (const l of locs) { const r = await fetchText(l, 6000); if (r.ok) pages.push({ url: l, html: r.body }); }
    return { reachable: true, https: u.protocol === 'https:', final_url: u.href, noindex: /<meta[^>]+name=["']robots["'][^>]+noindex/i.test(first.body), robots: rb.ok, robotsText: rb.ok ? rb.body : '', sitemap: sm.ok && /<loc>/.test(sm.body), llms: ll.ok && ll.body.trim().length > 20, pages };
  }

  const signalsOf = (o) => {
    const n = (sql, ...a) => { try { return db.prepare(sql).get(...a)?.c || 0; } catch { return 0; } };
    return { posts30: n(`SELECT COUNT(*) c FROM growth_calendar WHERE organisation_id=? AND status='published' AND published_at>=?`, o, iso(new Date(Date.now() - 30 * DAY))), channels: n(`SELECT COUNT(*) c FROM organisation_integrations WHERE organisation_id=? AND status='connected' AND provider NOT IN ('website','email_sms')`, o), followups: Boolean(n(`SELECT customer_reminders c FROM payment_settings WHERE organisation_id=?`, o)) };
  };

  function summary(r, prev) {
    const names = Object.entries(r.pillars).sort((a, b) => a[1].score - b[1].score), weakest = names[0], best = names[names.length - 1];
    const fixes = Object.values(r.pillars).reduce((n, p) => n + p.checks.filter((c) => c.level === 'fix').length, 0), setups = Object.values(r.pillars).reduce((n, p) => n + p.checks.filter((c) => c.level === 'setup').length, 0);
    const delta = prev == null ? '' : r.score === prev ? ' Same as last week.' : r.score > prev ? ` Up ${r.score - prev} from last week.` : ` Down ${prev - r.score} from last week.`;
    return `Your search and AI visibility score is ${r.score} out of 100.${delta} Strongest: ${PILLARS[best[0]].name} (${best[1].score}). Needs most work: ${PILLARS[weakest[0]].name} (${weakest[1].score}). ${fixes ? `${fixes} thing${fixes === 1 ? '' : 's'} to fix` : 'Nothing urgent to fix'}${setups ? ` and ${setups} item${setups === 1 ? '' : 's'} waiting for information from you` : ''}.`;
  }

  async function runFor(o, trigger = 'manual') {
    const profile = profileOf(o);
    const site = profile.website_url ? await readSite(profile.website_url) : null;
    const content = db.prepare(`SELECT * FROM seo_content WHERE organisation_id=? ORDER BY created_at DESC LIMIT 300`).all(o), aiLog = db.prepare(`SELECT * FROM seo_ai_log WHERE organisation_id=? ORDER BY checked_at DESC LIMIT 200`).all(o), metrics = db.prepare(`SELECT * FROM seo_metrics WHERE organisation_id=? ORDER BY captured_at DESC LIMIT 200`).all(o);
    const channels = db.prepare(`SELECT provider,status FROM organisation_integrations WHERE organisation_id=?`).all(o);
    const r = analyseCluster({ profile, site, content, channels, aiLog, metrics, signals: signalsOf(o) });
    const prev = db.prepare(`SELECT score FROM seo_cluster_reports WHERE organisation_id=? ORDER BY created_at DESC LIMIT 1`).get(o)?.score ?? null;
    const actions = buildActions(r.pillars), text = summary(r, prev), id = crypto.randomUUID();
    const siteInfo = site ? { reachable: site.reachable, note: site.note || null, https: site.https ?? null, sitemap: site.sitemap ?? null, llms: site.llms ?? null, pages_read: site.pages?.length || 0 } : { reachable: false, note: 'No website address saved yet.' };
    db.prepare(`INSERT INTO seo_cluster_reports (id,organisation_id,created_at,trigger,score,previous_score,pillars_json,actions_json,summary,site_json) VALUES (?,?,?,?,?,?,?,?,?,?)`).run(id, o, iso(), trigger, r.score, prev, JSON.stringify(r.pillars), JSON.stringify(actions), text, JSON.stringify(siteInfo));
    db.prepare(`DELETE FROM seo_cluster_reports WHERE organisation_id=? AND id NOT IN (SELECT id FROM seo_cluster_reports WHERE organisation_id=? ORDER BY created_at DESC LIMIT 52)`).run(o, o);
    if (trigger === 'weekly') {
      try { appendAuditLog(db, { organisation_id: o, user_id: null, user_name: 'Weekly visibility check', user_role: 'system', action: 'seo.weekly_check', module: 'seo', entity_type: 'seo_cluster', entity_id: id, metadata: { score: r.score } }); } catch { /* optional */ }
      const drop = prev != null && prev - r.score >= 5, fixes = actions.filter((a) => a.level === 'fix').length;
      if (drop || fixes) await notify?.notifyRoles?.(o, ['owner', 'admin'], { kind: 'seo', title: `Search and AI visibility: ${r.score}/100`, body: text, link: '#visibility', dedupe: `seo:${o}:${id.slice(0, 8)}` });
    }
    return { id, score: r.score, previous_score: prev, summary: text, pillars: r.pillars, actions, site: siteInfo };
  }

  const shape = (r) => r && { id: r.id, created_at: r.created_at, trigger: r.trigger, score: r.score, previous_score: r.previous_score, summary: r.summary, pillars: json(r.pillars_json, {}), actions: json(r.actions_json, []), site: json(r.site_json, {}) };
  const nextRun = (o) => { const last = db.prepare(`SELECT created_at FROM seo_cluster_reports WHERE organisation_id=? ORDER BY created_at DESC LIMIT 1`).get(o); return last ? iso(new Date(Date.parse(last.created_at) + 6.5 * DAY)) : null; };

  app.get('/api/saas/seo/overview', readGate, (req, res) => {
    const o = org(req), profile = profileOf(o);
    res.json({ ok: true, profile, pillars_meta: Object.fromEntries(Object.entries(PILLARS).map(([k, v]) => [k, { name: v.name, long: v.long, checks: v.checks.map(([id, name]) => ({ id, name })) }])),
      latest: shape(db.prepare(`SELECT * FROM seo_cluster_reports WHERE organisation_id=? ORDER BY created_at DESC LIMIT 1`).get(o)),
      history: db.prepare(`SELECT id,created_at,score FROM seo_cluster_reports WHERE organisation_id=? ORDER BY created_at DESC LIMIT 26`).all(o).reverse(),
      content: db.prepare(`SELECT id,kind,title,url,body,channel,source,created_at FROM seo_content WHERE organisation_id=? ORDER BY created_at DESC LIMIT 100`).all(o),
      ai_log: db.prepare(`SELECT id,platform,kind,prompt_text,mentioned,note,checked_at FROM seo_ai_log WHERE organisation_id=? ORDER BY checked_at DESC LIMIT 50`).all(o),
      metrics: db.prepare(`SELECT id,source,metric_key,metric_value,captured_at FROM seo_metrics WHERE organisation_id=? ORDER BY captured_at DESC LIMIT 30`).all(o),
      channels: db.prepare(`SELECT provider,display_name,status,account_label FROM organisation_integrations WHERE organisation_id=? ORDER BY provider`).all(o),
      next_run: profile.weekly ? nextRun(o) : null, weekly: Boolean(timers && profile.weekly), can_edit: EDITORS.includes(req.saas.role),
      honest_limits: 'This checks what your own website and saved content say and how readable they are to search engines and AI tools. It cannot see rankings, backlinks or AI answers by itself, so those are only counted from what you log. Nothing here guarantees ranking or citation.' });
  });
  const profileShape = z.object({ website_url: z.string().trim().max(300).optional().or(z.literal('')), business_name: z.string().trim().max(120).optional(), services: z.array(z.string().trim().min(2).max(80)).max(30).optional(), areas: z.array(z.string().trim().min(2).max(80)).max(40).optional(), phone: z.string().trim().max(40).optional(), address: z.string().trim().max(200).optional(), abn: z.string().trim().max(20).optional(), same_as: z.array(z.string().trim().url().max(300)).max(20).optional(), weekly: z.boolean().optional() });
  app.put('/api/saas/seo/profile', writeGate, (req, res) => {
    const p = profileShape.safeParse(req.body); if (!p.success) return res.status(400).json({ ok: false, error: 'Check the business facts. Website and profile links need a full address starting with https://.' });
    const d = p.data; if (d.website_url && !/^https?:\/\//i.test(d.website_url)) return res.status(400).json({ ok: false, error: 'The website address must start with https://.' });
    if (d.same_as?.some((u) => !/^https:\/\//i.test(u))) return res.status(400).json({ ok: false, error: 'Profile links must start with https://.' });
    const o = org(req), cur = profileOf(o), m = { ...cur, ...d };
    db.prepare(`INSERT INTO seo_profiles (organisation_id,website_url,business_name,services_json,areas_json,phone,address,abn,same_as_json,weekly,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(organisation_id) DO UPDATE SET website_url=excluded.website_url,business_name=excluded.business_name,services_json=excluded.services_json,areas_json=excluded.areas_json,phone=excluded.phone,address=excluded.address,abn=excluded.abn,same_as_json=excluded.same_as_json,weekly=excluded.weekly,updated_at=excluded.updated_at`)
      .run(o, clip(m.website_url, 300), clip(m.business_name, 120), JSON.stringify(m.services || []), JSON.stringify(m.areas || []), clip(m.phone, 40), clip(m.address, 200), clip(m.abn, 20), JSON.stringify(m.same_as || []), m.weekly ? 1 : 0, iso());
    audit(req, 'seo.profile_saved', o); res.json({ ok: true, profile: profileOf(o) });
  });
  const lastRun = new Map();
  app.post('/api/saas/seo/run', writeGate, async (req, res) => {
    const o = org(req), at = lastRun.get(o) || 0; if (Date.now() - at < 60000) return res.status(429).json({ ok: false, error: 'A check just ran. Wait a minute and try again.' });
    lastRun.set(o, Date.now());
    try { const r = await runFor(o, 'manual'); audit(req, 'seo.check_run', r.id, { score: r.score }); res.status(201).json({ ok: true, ...r }); } catch (e) { console.error('[seo] run failed:', e.message); res.status(500).json({ ok: false, error: 'The check could not finish. Try again shortly.' }); }
  });
  const contentShape = z.object({ kind: z.enum(['page', 'post', 'faq', 'video', 'review', 'press']), title: z.string().trim().min(2).max(200), url: z.string().trim().url().max(400).optional().or(z.literal('')), body: z.string().trim().max(4000).optional(), channel: z.string().trim().max(40).optional() });
  app.post('/api/saas/seo/content', writeGate, (req, res) => {
    const p = contentShape.safeParse(req.body); if (!p.success) return res.status(400).json({ ok: false, error: 'Add a title. Links must be full addresses.' });
    const o = org(req); if (db.prepare(`SELECT COUNT(*) c FROM seo_content WHERE organisation_id=?`).get(o).c >= 500) return res.status(409).json({ ok: false, error: 'Your content library is full. Remove older items first.' });
    const id = crypto.randomUUID(); db.prepare(`INSERT INTO seo_content (id,organisation_id,kind,title,url,body,channel,source,created_by,created_at) VALUES (?,?,?,?,?,?,?,'member',?,?)`).run(id, o, p.data.kind, p.data.title, p.data.url || null, p.data.body || '', p.data.channel || null, req.saas.user_id, iso());
    audit(req, 'seo.content_added', id, { kind: p.data.kind }); res.status(201).json({ ok: true, id });
  });
  app.delete('/api/saas/seo/content/:id', writeGate, (req, res) => { const r = db.prepare(`DELETE FROM seo_content WHERE id=? AND organisation_id=?`).run(String(req.params.id), org(req)); audit(req, 'seo.content_removed', String(req.params.id)); res.json({ ok: true, removed: r.changes }); });
  app.post('/api/saas/seo/ai-check', writeGate, (req, res) => {
    const p = z.object({ platform: z.enum(['chatgpt', 'gemini', 'perplexity', 'copilot', 'google_ai', 'claude', 'other']), kind: z.enum(['citation', 'recommendation']).default('citation'), prompt_text: z.string().trim().min(5).max(300), mentioned: z.boolean(), note: z.string().trim().max(400).optional() }).safeParse(req.body);
    if (!p.success) return res.status(400).json({ ok: false, error: 'Enter the question you asked and whether your business was named.' });
    const id = crypto.randomUUID(); db.prepare(`INSERT INTO seo_ai_log (id,organisation_id,platform,kind,prompt_text,mentioned,note,checked_at,checked_by) VALUES (?,?,?,?,?,?,?,?,?)`).run(id, org(req), p.data.platform, p.data.kind, p.data.prompt_text, p.data.mentioned ? 1 : 0, p.data.note || null, iso(), req.saas.user_id);
    audit(req, 'seo.ai_check_logged', id); res.status(201).json({ ok: true, id });
  });
  app.delete('/api/saas/seo/ai-check/:id', writeGate, (req, res) => { db.prepare(`DELETE FROM seo_ai_log WHERE id=? AND organisation_id=?`).run(String(req.params.id), org(req)); res.json({ ok: true }); });
  app.post('/api/saas/seo/metrics', writeGate, (req, res) => {
    const p = z.object({ source: z.enum(['google_search_console', 'bing_webmaster', 'ai_referrals', 'analytics', 'other']), metric_key: z.enum(['clicks', 'impressions', 'ai_referrals', 'calls', 'enquiries']), metric_value: z.coerce.number().min(0).max(1e9) }).safeParse(req.body);
    if (!p.success) return res.status(400).json({ ok: false, error: 'Choose where the number came from and enter it.' });
    db.prepare(`INSERT INTO seo_metrics (id,organisation_id,source,metric_key,metric_value,captured_at) VALUES (?,?,?,?,?,?)`).run(crypto.randomUUID(), org(req), p.data.source, p.data.metric_key, p.data.metric_value, iso()); res.status(201).json({ ok: true });
  });
  app.get('/api/saas/seo/schema', readGate, (req, res) => { const o = org(req); res.json({ ok: true, ...buildSchema(profileOf(o), db.prepare(`SELECT title,body FROM seo_content WHERE organisation_id=? AND kind='faq' AND body<>'' ORDER BY created_at DESC LIMIT 20`).all(o)) }); });
  // AI drafts are saved as drafts in the library. Nothing is published, and the person decides what to use.
  app.post('/api/saas/seo/draft', writeGate, async (req, res) => {
    const p = z.object({ kind: z.enum(['faq', 'answer_post', 'meta']), topic: z.string().trim().min(3).max(160) }).safeParse(req.body); if (!p.success) return res.status(400).json({ ok: false, error: 'Say what the draft should be about.' });
    const o = org(req), pr = profileOf(o), ask = { faq: `Write one customer question and a 40 to 60 word answer about: ${p.data.topic}.`, answer_post: `Write a 150 to 220 word answer-first post about: ${p.data.topic}. Start with a two-sentence direct answer, then 3 short bullet points.`, meta: `Write a page title (under 60 characters) and a meta description (under 160 characters) for a page about: ${p.data.topic}.` }[p.data.kind];
    let text = '', source = 'template';
    try { const ai = await generateAiText({ remember_conversation: false, thinking_level: 'minimal', max_output_tokens: 500, system: `You write plain, honest website copy for a small Australian business called ${pr.business_name || 'the business'} serving ${(pr.areas || []).slice(0, 4).join(', ') || 'its local area'}. Never invent prices, awards, statistics, reviews or guarantees. Use simple words. Output only the copy.`, prompt: ask }); const t = String(ai.text || '').trim(); if (t.length > 20) { text = t.slice(0, 3000); source = 'ai'; } } catch { /* template below */ }
    if (!text) text = p.data.kind === 'faq' ? `Question: ${p.data.topic}?\nAnswer: Write two short sentences here that answer this directly, name the service and the area you cover, and say how to book.` : p.data.kind === 'meta' ? `Title: ${p.data.topic} | ${pr.business_name}\nDescription: ${pr.business_name} provides ${p.data.topic.toLowerCase()}${(pr.areas || [])[0] ? ` in ${pr.areas[0]}` : ''}. Call or request a quote today.` : `${p.data.topic}\n\nWrite a two-sentence direct answer first. Then add three short bullet points with the most useful facts, and end with how to contact you.`;
    const id = crypto.randomUUID(); db.prepare(`INSERT INTO seo_content (id,organisation_id,kind,title,url,body,channel,source,created_by,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)`).run(id, o, p.data.kind === 'faq' ? 'faq' : 'page', `Draft: ${p.data.topic}`.slice(0, 200), null, text, null, source === 'ai' ? 'ai_draft' : 'template_draft', req.saas.user_id, iso());
    audit(req, 'seo.draft_created', id, { kind: p.data.kind, source }); res.status(201).json({ ok: true, id, source, text, note: 'Saved as a draft in your content library. Read it, edit it and only then use it.' });
  });

  // Operator view: scores and counts only, never a member's content.
  if (requireAdmin) {
    app.get('/api/admin/seo-cluster/overview', requireAdmin, (req, res) => {
      const rows = db.prepare(`SELECT o.id, COALESCE(o.display_name,o.name) name, r.score, r.previous_score, r.created_at, r.pillars_json FROM organisations o LEFT JOIN seo_cluster_reports r ON r.id=(SELECT id FROM seo_cluster_reports WHERE organisation_id=o.id ORDER BY created_at DESC LIMIT 1) ORDER BY r.score IS NULL, r.score ASC LIMIT 500`).all();
      const scored = rows.filter((r) => r.score != null), avg = (k) => scored.length ? Math.round(scored.reduce((s, r) => s + (json(r.pillars_json, {})[k]?.score || 0), 0) / scored.length) : null;
      res.json({ ok: true, members: rows.length, checked: scored.length, average: scored.length ? Math.round(scored.reduce((s, r) => s + r.score, 0) / scored.length) : null, pillar_average: Object.fromEntries(Object.keys(PILLARS).map((k) => [k, avg(k)])), lowest: scored.slice(0, 10).map((r) => ({ name: r.name, score: r.score, checked_at: r.created_at })), never_checked: rows.length - scored.length });
    });
    app.post('/api/admin/seo-cluster/run-all', requireAdmin, async (req, res) => { const n = await tick(true); res.json({ ok: true, ran: n }); });
  }

  // Weekly for every subscriber: any business whose last report is over 6.5 days old (or who has none) is re-checked.
  // A few per hour keeps the work spread out; a restart never skips a week. Locked (ended-trial) businesses are skipped.
  async function tick(force = false) {
    const due = db.prepare(`SELECT o.id FROM organisations o LEFT JOIN seo_profiles p ON p.organisation_id=o.id WHERE COALESCE(p.weekly,1)=1 AND COALESCE((SELECT created_at FROM seo_cluster_reports WHERE organisation_id=o.id ORDER BY created_at DESC LIMIT 1),'') < ? ORDER BY o.created_at LIMIT ?`).all(iso(new Date(Date.now() - 6.5 * DAY)), force ? 50 : 5);
    let ran = 0;
    for (const { id } of due) { try { if (entitlements?.planOf?.(id)?.locked) continue; await runFor(id, 'weekly'); ran += 1; } catch (e) { console.warn('[seo] weekly check failed for one business:', e.message); } }
    return ran;
  }
  if (timers) { setTimeout(() => tick().catch(() => {}), 120000).unref?.(); setInterval(() => tick().catch(() => {}), 3600000).unref?.(); }
  return { runFor, tick, profileOf };
}
