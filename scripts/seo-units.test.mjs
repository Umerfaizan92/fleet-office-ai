// Phase 06: keyword clusters, content claims, Google API clients (against Google's documented response formats),
// local SEO and the website builder, as pure functions.
import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { discoverKeywords, clusterKeywords, buildPlan, intentOf, parseKeywordCsv } from '../src/seo/keywords.js';
import { checkClaims, generateDraft } from '../src/seo/content.js';
import { createGoogleClient, serviceAccountToken } from '../src/seo/google.js';
import { localAudit, reviewReplyDraft, locationPageIdeas } from '../src/seo/local.js';
import { renderPage, prePublishChecks, classifyChange, contrast, themeFrom } from '../src/seo/builder.js';

test('keywords: evidence-only discovery, intent, clusters, cannibalisation and estimated priorities', () => {
  const kws = discoverKeywords({
    services: ['Blocked drains', 'Hot water repairs'], areas: ['Fremantle', 'Cottesloe'], brand: 'Harbour Plumbing',
    pages: [{ url: 'https://h.test/drains', title: 'Blocked drains Fremantle | Harbour', h1: ['Blocked drain clearing'], h2: ['How we clear blocked drains'] }, { url: 'https://h.test/drains-2', title: 'Blocked drain plumber', h1: ['Blocked drains'], h2: [] }],
    gsc: [{ query: 'blocked drain plumber fremantle', page: 'https://h.test/drains', clicks: 12, impressions: 300, position: 7.2 }, { query: 'blocked drain plumber fremantle', page: 'https://h.test/drains-2', clicks: 3, impressions: 120, position: 14 }],
    imports: [{ keyword: 'hot water repairs near me', volume: 880, source_name: 'Keyword Planner export' }], manual: ['how to unblock a drain']
  });
  const by = (k) => kws.find((x) => x.keyword === k);
  assert.equal(by('blocked drain plumber fremantle').evidence.search_console.impressions, 420);
  assert.equal(by('hot water repairs near me').evidence.import.volume, 880);
  assert.equal(by('blocked drains fremantle').best_source, 'site');
  assert.ok(kws.every((k) => k.evidence.import === undefined || k.evidence.import.source_name), 'volume always names its source');
  assert.ok(!by('blocked drains cottesloe').evidence.import && !by('blocked drains cottesloe').evidence.search_console, 'a suggested combination carries no invented demand');
  assert.equal(intentOf('how to unblock a drain').intent, 'informational');
  assert.equal(intentOf('blocked drains fremantle', { areas: ['Fremantle'] }).intent, 'local');
  assert.equal(intentOf('best plumber reviews').intent, 'commercial');
  assert.equal(intentOf('harbour plumbing', { brand: 'Harbour Plumbing' }).intent, 'navigational');
  const clusters = clusterKeywords(kws, { areas: ['Fremantle', 'Cottesloe'] });
  const drains = clusters.find((c) => c.core_terms.includes('drain'));
  assert.ok(drains.keywords.length >= 3, 'drain keywords grouped together');
  assert.equal(drains.primary, 'blocked drain plumber fremantle', 'the measured keyword leads its cluster');
  const plan = buildPlan({ keywords: kws, clusters, pages: [{ url: 'https://h.test/drains', title: 'Blocked drains Fremantle', h1: ['Blocked drain clearing'], h2: [] }], services: ['Blocked drains', 'Hot water repairs'], linkGraph: {} });
  assert.ok(plan.cannibalisation.some((c) => c.basis === 'measured' && c.pages.length === 2), 'two pages sharing impressions is measured cannibalisation');
  assert.ok(plan.gaps.some((g) => /hot water/.test(g.primary)), 'hot water has no page: a content gap');
  assert.ok(plan.priorities.every((p) => p.basis === 'estimate' && p.reasons.length));
  assert.ok(plan.priorities.find((p) => /drain/.test(p.primary)).reasons.some((r) => /measured/.test(r)));
  assert.ok(plan.pillars.some((p) => p.service === 'Blocked drains'));
  assert.match(plan.note, /Search volumes appear only/);
  const csv = parseKeywordCsv('Keyword,Avg. monthly searches\n"drain camera, inspection",1,300\nroot removal,\n', 'Planner');
  assert.equal(csv[0].keyword, 'drain camera, inspection'); assert.equal(csv[1].volume, null, 'a missing volume stays missing');
});

test('content: claims need review, ranking promises are removed, drafts use only verified facts', async () => {
  const c = checkClaims('We are the best plumbers in Perth. Guaranteed first page of Google rankings. Licensed and insured. Call 0400 111 222. Since 1998.', { phone: '0400 111 222' });
  assert.equal(c.find((x) => /best/.test(x.text)).level, 'review');
  assert.equal(c.find((x) => /Google/.test(x.text)).level, 'blocked');
  assert.equal(c.find((x) => /Licensed/.test(x.text)).level, 'review');
  assert.ok(c.find((x) => /1998/.test(x.text)));
  const facts = { business_name: 'Harbour Plumbing', services: ['Blocked drains', 'Hot water'], areas: ['Fremantle'], phone: '0400 111 222', email: 'hi@h.test', prices: [] };
  const d = await generateDraft({ kind: 'service', topic: 'Blocked drains', facts });
  assert.equal(d.method, 'template');
  assert.ok(d.blocks.some((b) => b.type === 'faq')); assert.ok(d.needs_review, 'placeholders mean a person must finish it');
  assert.ok(d.schema.some((s) => s['@type'] === 'LocalBusiness' && s.telephone === '0400 111 222'));
  assert.ok(!JSON.stringify(d).match(/\b(19|20)\d{2}\b.*years|award|★/), 'no invented years, awards or ratings');
  const ai = async () => JSON.stringify({ meta_title: 'Blocked drains Fremantle', meta_description: 'Fast help.', intro: 'We clear drains. Guaranteed number one ranking on Google!', sections: [{ heading: 'How', text: 'Camera and jetter.' }], faqs: [] });
  const d2 = await generateDraft({ kind: 'service', topic: 'Blocked drains', facts, ai });
  assert.equal(d2.method, 'ai');
  assert.ok(!JSON.stringify(d2.blocks).includes('Guaranteed number one ranking'), 'the ranking promise was removed');
});

// Fixtures follow Google's documented response formats (developers.google.com reference pages for each method).
function fakeGoogle() {
  const calls = [];
  const R = (status, body) => ({ ok: status < 400, status, text: async () => JSON.stringify(body), json: async () => body });
  const fetchImpl = async (url, opt = {}) => {
    calls.push({ url, method: opt.method || 'GET', auth: opt.headers?.authorization, body: typeof opt.body === 'string' && opt.body.startsWith('{') ? JSON.parse(opt.body) : null, headers: opt.headers });
    if (url === 'https://searchconsole.googleapis.com/webmasters/v3/sites') return R(200, { siteEntry: [{ siteUrl: 'sc-domain:harbour.test', permissionLevel: 'siteOwner' }, { siteUrl: 'https://old.test/', permissionLevel: 'siteUnverifiedUser' }] });
    if (url.includes('/searchAnalytics/query')) return R(200, { rows: [{ keys: ['2026-10-20', 'blocked drain fremantle', 'https://harbour.test/drains'], clicks: 4, impressions: 90, ctr: 0.0444, position: 6.1 }], responseAggregationType: 'byPage' });
    if (url.includes('urlInspection/index:inspect')) return R(200, { inspectionResult: { inspectionResultLink: 'https://search.google.com/x', indexStatusResult: { verdict: 'NEUTRAL', coverageState: 'Discovered - currently not indexed', robotsTxtState: 'ALLOWED', indexingState: 'INDEXING_ALLOWED', pageFetchState: 'SUCCESSFUL' }, mobileUsabilityResult: { verdict: 'PASS' } } });
    if (url.startsWith('https://analyticsadmin.googleapis.com/v1beta/accountSummaries')) return R(200, { accountSummaries: [{ account: 'accounts/1', displayName: 'Harbour', propertySummaries: [{ property: 'properties/123', displayName: 'harbour.test' }] }] });
    if (url.includes(':runReport')) return R(200, { dimensionHeaders: [{ name: 'date' }, { name: 'landingPage' }, { name: 'sessionDefaultChannelGroup' }], metricHeaders: [{ name: 'sessions', type: 'TYPE_INTEGER' }, { name: 'engagedSessions' }, { name: 'keyEvents' }, { name: 'totalRevenue' }], rows: [{ dimensionValues: [{ value: '20261020' }, { value: '/drains' }, { value: 'Organic Search' }], metricValues: [{ value: '41' }, { value: '30' }, { value: '3' }, { value: '0' }] }], metadata: { currencyCode: 'AUD' } });
    if (url.includes('/v4/') && url.includes('/reviews')) return R(200, { reviews: [{ name: 'accounts/1/locations/9/reviews/r1', reviewId: 'r1', reviewer: { displayName: 'Sam Lee' }, starRating: 'FOUR', comment: 'Quick and tidy', createTime: '2026-10-01T00:00:00Z' }], averageRating: 4.5, totalReviewCount: 12 });
    if (url.includes('pagespeedonline')) return R(200, { loadingExperience: { metrics: { LARGEST_CONTENTFUL_PAINT_MS: { percentile: 2900, category: 'AVERAGE' }, CUMULATIVE_LAYOUT_SHIFT_SCORE: { percentile: 8, category: 'FAST' }, INTERACTION_TO_NEXT_PAINT: { percentile: 180, category: 'FAST' } }, overall_category: 'AVERAGE' }, lighthouseResult: { lighthouseVersion: '12.0.0', categories: { performance: { score: 0.81 } }, audits: { 'largest-contentful-paint': { numericValue: 3100 }, 'cumulative-layout-shift': { numericValue: 0.05 }, 'total-blocking-time': { numericValue: 120 } } } });
    if (url.includes('tagmanager')) return url.endsWith('/accounts') ? R(200, { account: [{ accountId: '5', name: 'Harbour', path: 'accounts/5' }] }) : R(200, { container: [{ containerId: '7', publicId: 'GTM-ABC123', name: 'Site', usageContext: ['web'], path: 'accounts/5/containers/7' }] });
    if (url.includes('googleads')) return R(200, { resourceNames: ['customers/1234567890'] });
    if (url === 'https://oauth2.googleapis.com/token') return R(200, { access_token: 'sa-token', expires_in: 3600, token_type: 'Bearer' });
    return R(404, { error: { code: 404, message: 'Not found', status: 'NOT_FOUND' } });
  };
  return { fetchImpl, calls };
}

test('Google clients send the documented requests and read the documented answers', async () => {
  const { fetchImpl, calls } = fakeGoogle();
  const g = createGoogleClient({ fetchImpl, env: { PAGESPEED_API_KEY: 'k', GOOGLE_ADS_DEVELOPER_TOKEN: 'dev' } });
  const sites = await g.gscSites('tok');
  assert.deepEqual(sites.map((s) => s.verified), [true, false]); assert.equal(calls[0].auth, 'Bearer tok');
  const rows = await g.gscQuery('tok', 'sc-domain:harbour.test', { startDate: '2026-10-01', endDate: '2026-10-28' });
  assert.deepEqual(rows[0], { clicks: 4, impressions: 90, ctr: 0.0444, position: 6.1, date: '2026-10-20', query: 'blocked drain fremantle', page: 'https://harbour.test/drains' });
  assert.ok(calls[1].url.includes(encodeURIComponent('sc-domain:harbour.test'))); assert.deepEqual(calls[1].body.dimensions, ['date', 'query', 'page']); assert.equal(calls[1].body.dataState, 'final');
  const ins = await g.gscInspect('tok', 'sc-domain:harbour.test', 'https://harbour.test/drains');
  assert.equal(ins.coverage, 'Discovered - currently not indexed'); assert.equal(ins.mobile, 'PASS');
  const props = await g.gaProperties('tok'); assert.equal(props[0].property, 'properties/123');
  const ga = await g.gaLandingPages('tok', 'properties/123', { startDate: '2026-10-01', endDate: '2026-10-28' });
  assert.deepEqual([ga[0].date, ga[0].landing_page, ga[0].channel, ga[0].sessions, ga[0].key_events, ga[0].currency], ['2026-10-20', '/drains', 'Organic Search', 41, 3, 'AUD']);
  await assert.rejects(() => g.gaLandingPages('tok', 'properties/../x'), /property id/);
  const rv = await g.gbpReviews('tok', 'accounts/1', 'locations/9');
  assert.equal(rv.reviews[0].rating, 4); assert.equal(rv.total, 12);
  const psi = await g.pagespeed('https://harbour.test/', 'mobile');
  assert.equal(psi.field.lcp_ms, 2900); assert.equal(psi.field.cls, 0.08, 'CrUX reports CLS multiplied by 100'); assert.equal(psi.lab.performance_score, 81);
  assert.ok(calls.at(-1).url.includes('key=k'));
  const gtm = await g.gtmContainers('tok'); assert.equal(gtm[0].public_id, 'GTM-ABC123');
  const ads = await g.adsCustomers('tok'); assert.equal(ads[0].id, '1234567890'); assert.equal(calls.at(-1).headers['developer-token'], 'dev');
  await assert.rejects(() => createGoogleClient({ fetchImpl, env: {} }).adsCustomers('tok'), /developer token/);
  await assert.rejects(() => g.gscSitemaps('tok', 'https://nope.test/'), (e) => e.status === 404 && e.permanent);
  const bad = createGoogleClient({ fetchImpl: async () => ({ ok: true, status: 200, text: async () => JSON.stringify({ rows: 'nope' }) }) });
  await assert.rejects(() => bad.gscQuery('t', 's', { startDate: '2026-10-01', endDate: '2026-10-02' }), /expected rows/);
  // Service-account token for the platform's own site (JWT signed locally, never sent anywhere but Google's token endpoint).
  const { privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048, privateKeyEncoding: { type: 'pkcs8', format: 'pem' }, publicKeyEncoding: { type: 'spki', format: 'pem' } });
  const t = await serviceAccountToken({ GOOGLE_SERVICE_ACCOUNT_JSON: JSON.stringify({ client_email: 'sp@x.iam.gserviceaccount.com', private_key: privateKey }) }, ['https://www.googleapis.com/auth/webmasters'], { fetchImpl });
  assert.equal(t.access_token, 'sa-token');
  assert.equal(await serviceAccountToken({}, []), null);
});

test('local SEO: details that disagree are flagged, replies are drafts, location pages are honest', () => {
  const checks = localAudit({ facts: { business_name: 'Harbour Plumbing', phone: '0400 111 222', address: '1 Beach Rd, Fremantle', areas: ['Fremantle', 'Cottesloe'], services: ['Blocked drains'] }, site: { html: '<a href="tel:0400111222">', text: 'we serve fremantle', ld: [] , ld_name: 'Harbour Plumbing', phones: ['0400111222'] }, gbp: { title: 'Harbour Plumbing', phone: '(08) 9999 0000', address: '1 Beach Rd, Fremantle', primary_category: 'Plumber', additional_categories: [], hours: [], service_areas: ['Fremantle'], description: '', has_storefront: true }, reviews: { average: 4.5, total: 2, reviews: [{ reply: null }, { reply: 'Thanks' }] } });
  const t = (s) => checks.find((c) => c.title.startsWith(s));
  assert.equal(t('Phone number is different').level, 'fix');
  assert.equal(t('Business name matches').level, 'good');
  assert.equal(t('No opening hours').level, 'fix');
  assert.equal(t('Areas you serve that are not on your Google profile').detail, 'Cottesloe');
  assert.match(t('2 Google review').detail, /1 without a reply/);
  assert.equal(t('No LocalBusiness').level, 'fix');
  assert.match(reviewReplyDraft({ reviewer: 'Sam Lee', rating: 2 }, { phone: '0400 111 222' }), /sorry.*0400 111 222/);
  assert.doesNotMatch(reviewReplyDraft({ reviewer: 'Sam', rating: 5 }, {}), /discount|voucher|free/i, 'no incentives');
  const ideas = locationPageIdeas({ areas: ['Fremantle', 'Cottesloe'], address: '1 Beach Rd, Fremantle' });
  assert.equal(ideas[0].type, 'location'); assert.equal(ideas[1].type, 'service_area'); assert.match(ideas[1].note, /must not suggest an office/);
});

test('builder: safe rendering, accessibility and SEO checks, and change risk', () => {
  const page = { title: 'Drains <script>alert(1)</script>', meta_title: 'Blocked drains Fremantle | Harbour', meta_description: 'Drain clearing in Fremantle.', slug: 'drains', blocks: [{ type: 'hero', heading: 'Blocked drains', text: 'We clear drains', cta_label: 'Get a quote', cta_href: 'javascript:alert(1)' }, { type: 'image', src: 'https://cdn.test/van.jpg' }, { type: 'text', heading: 'Also', text: 'Second' }] };
  const html = renderPage(page, { site: { name: 'Harbour & Co' } });
  assert.ok(!html.includes('<script>alert'), 'text is escaped'); assert.ok(!html.includes('javascript:'), 'unsafe links are dropped');
  assert.equal((html.match(/<h1>/g) || []).length, 1, 'exactly one h1'); assert.ok(html.includes('loading="lazy"'));
  const c = prePublishChecks(page, { site: { base_path: '/sites/h' }, sitePages: [] });
  assert.ok(c.blocked); assert.ok(c.checks.some((x) => x.group === 'a11y' && /alt text/.test(x.text))); assert.ok(c.checks.some((x) => x.group === 'links' && /not a safe address/.test(x.text)));
  assert.ok(contrast('#ffffff', '#000000') === 21); assert.equal(themeFrom({ primary_color: '#ffee00' }).on_primary, '#111827', 'light brand colours get dark button text');
  const v1 = { title: 'Drains', blocks: [{ type: 'hero', heading: 'Blocked drains', text: 'We clear blocked drains across Fremantle and nearby suburbs quickly and tidily for homes and businesses.' }] };
  assert.equal(classifyChange(v1, { ...v1, blocks: [{ ...v1.blocks[0], text: v1.blocks[0].text.replace('quickly', 'promptly') }] }).low_risk, true, 'a small wording fix is low risk');
  assert.equal(classifyChange(v1, { ...v1, blocks: [...v1.blocks, { type: 'faq', items: [] }] }).low_risk, false, 'adding a section is a design change');
  assert.equal(classifyChange(null, v1, { firstRelease: true }).low_risk, false, 'first release always needs approval');
});
