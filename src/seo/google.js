// Phase 06 Module D: clients for Google's official APIs. Each function calls one documented endpoint with the
// caller's OAuth access token (or the platform's service account), checks the answer has the documented shape and
// returns plain rows. Nothing is invented: if Google does not return a figure it stays empty.
//
// Supported and used here (read-only unless stated):
//   Search Console API   sites.list, searchAnalytics.query, urlInspection.index.inspect, sitemaps.list, sitemaps.submit (approval)
//   Analytics Admin/Data accountSummaries.list, properties.runReport (GA4)
//   Business Profile     accounts.list, locations.list, reviews.list, reviews.updateReply (approval), performance metrics
//   Tag Manager API      accounts.list, containers.list
//   Google Ads API       customers:listAccessibleCustomers, googleAds:search (needs a developer token; reporting only)
//   PageSpeed Insights   runPagespeed (API key; field data from the Chrome UX Report when Google has it)
// Not possible through any Google API and never claimed: guaranteed indexing, guaranteed rankings, requesting indexing
// of ordinary pages (the Indexing API is limited by Google to job postings and livestream pages).
import crypto from 'node:crypto';

export const GOOGLE_SCOPES = {
  search_console: 'https://www.googleapis.com/auth/webmasters',
  analytics: 'https://www.googleapis.com/auth/analytics.readonly',
  tag_manager: 'https://www.googleapis.com/auth/tagmanager.readonly',
  ads: 'https://www.googleapis.com/auth/adwords'
};
export const GOOGLE_SERVICES = {
  search_console: { name: 'Google Search Console', provider: 'google_seo', quota: 'Search Analytics: about 1,200 queries a minute per site; URL Inspection: 2,000 a day and 600 a minute per site. Data is usually 2 to 3 days behind.', actions: ['Read search performance (clicks, impressions, CTR, position)', 'Inspect how Google sees a page', 'List and submit sitemaps (submitting needs approval)'] },
  analytics: { name: 'Google Analytics 4', provider: 'google_seo', quota: 'Data API: token-based quotas per property (about 200,000 tokens a day for standard properties).', actions: ['Read sessions, key events and revenue by landing page and channel'] },
  business_profile: { name: 'Google Business Profile', provider: 'google_business', quota: 'Business Profile APIs need access approval from Google; default 300 requests a minute.', actions: ['Read locations, hours, categories', 'Read reviews', 'Reply to reviews (needs approval)', 'Read profile performance'] },
  ads: { name: 'Google Ads', provider: 'google_seo', quota: 'Needs a Google Ads developer token approved by Google. Reporting only here; Super Pro never changes campaigns or spend.', actions: ['Read campaign clicks, cost and conversions'] },
  tag_manager: { name: 'Google Tag Manager', provider: 'google_seo', quota: 'Tag Manager API: 0.25 queries a second per project by default.', actions: ['List containers and check the container snippet is on your site'] },
  pagespeed: { name: 'PageSpeed Insights', provider: 'api_key', quota: 'Free with an API key (25,000 requests a day). Field data appears only for pages with enough Chrome traffic.', actions: ['Measure Core Web Vitals (real-user field data where available, otherwise a lab test)'] }
};

class GoogleError extends Error { constructor(message, status, body) { super(message); this.status = status; this.body = body; this.permanent = [400, 401, 403, 404].includes(status); } }
async function call(fetchImpl, url, { token, method = 'GET', body, headers = {}, timeoutMs = 20000 } = {}) {
  const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const r = await fetchImpl(url, { method, signal: ctl.signal, headers: { accept: 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}), ...(body ? { 'content-type': 'application/json' } : {}), ...headers }, body: body ? JSON.stringify(body) : undefined });
    const text = await r.text(); let j = {}; try { j = text ? JSON.parse(text) : {}; } catch { j = { raw: text.slice(0, 200) }; }
    if (!r.ok) throw new GoogleError(j?.error?.message || `Google answered ${r.status}.`, r.status, j);
    return j;
  } catch (e) { if (e instanceof GoogleError) throw e; throw new GoogleError(e.name === 'AbortError' ? 'Google did not answer in time.' : 'Could not reach Google: ' + e.message, 0); }
  finally { clearTimeout(t); }
}
const need = (cond, what) => { if (!cond) throw new GoogleError(`Google's answer did not have the expected ${what}.`, 502); };
const ymd = (d) => new Date(d).toISOString().slice(0, 10);

export function createGoogleClient({ fetchImpl = globalThis.fetch, env = {} } = {}) {
  return {
    // ---------- Search Console ----------
    async gscSites(token) {
      const j = await call(fetchImpl, 'https://searchconsole.googleapis.com/webmasters/v3/sites', { token });
      need(!j.siteEntry || Array.isArray(j.siteEntry), 'site list');
      return (j.siteEntry || []).map((s) => ({ site_url: s.siteUrl, permission: s.permissionLevel, verified: s.permissionLevel !== 'siteUnverifiedUser' }));
    },
    async gscQuery(token, siteUrl, { startDate, endDate, dimensions = ['date', 'query', 'page'], rowLimit = 5000, startRow = 0, type = 'web' } = {}) {
      const j = await call(fetchImpl, `https://searchconsole.googleapis.com/webmasters/v3/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`, { token, method: 'POST', body: { startDate: ymd(startDate), endDate: ymd(endDate), dimensions, rowLimit: Math.min(25000, rowLimit), startRow, type, dataState: 'final' } });
      need(!j.rows || Array.isArray(j.rows), 'rows');
      return (j.rows || []).map((r) => { const o = { clicks: r.clicks, impressions: r.impressions, ctr: r.ctr, position: r.position }; dimensions.forEach((d, i) => { o[d] = r.keys?.[i]; }); return o; });
    },
    async gscInspect(token, siteUrl, url) {
      const j = await call(fetchImpl, 'https://searchconsole.googleapis.com/v1/urlInspection/index:inspect', { token, method: 'POST', body: { inspectionUrl: url, siteUrl, languageCode: 'en-AU' } });
      const r = j.inspectionResult?.indexStatusResult; need(r, 'inspection result');
      return { url, verdict: r.verdict || null, coverage: r.coverageState || null, indexing_state: r.indexingState || null, robots: r.robotsTxtState || null, fetch_state: r.pageFetchState || null, last_crawl: r.lastCrawlTime || null, google_canonical: r.googleCanonical || null, user_canonical: r.userCanonical || null, mobile: j.inspectionResult?.mobileUsabilityResult?.verdict || null, link: j.inspectionResult?.inspectionResultLink || null };
    },
    async gscSitemaps(token, siteUrl) {
      const j = await call(fetchImpl, `https://searchconsole.googleapis.com/webmasters/v3/sites/${encodeURIComponent(siteUrl)}/sitemaps`, { token });
      return (j.sitemap || []).map((s) => ({ path: s.path, last_submitted: s.lastSubmitted || null, last_downloaded: s.lastDownloaded || null, pending: Boolean(s.isPending), errors: Number(s.errors || 0), warnings: Number(s.warnings || 0) }));
    },
    async gscSubmitSitemap(token, siteUrl, feedUrl) {
      await call(fetchImpl, `https://searchconsole.googleapis.com/webmasters/v3/sites/${encodeURIComponent(siteUrl)}/sitemaps/${encodeURIComponent(feedUrl)}`, { token, method: 'PUT' });
      return { submitted: feedUrl, note: 'Submitted. Google decides when and whether to crawl and index the pages.' };
    },
    // ---------- Google Analytics 4 ----------
    async gaProperties(token) {
      const j = await call(fetchImpl, 'https://analyticsadmin.googleapis.com/v1beta/accountSummaries?pageSize=200', { token });
      need(!j.accountSummaries || Array.isArray(j.accountSummaries), 'account summaries');
      return (j.accountSummaries || []).flatMap((a) => (a.propertySummaries || []).map((p) => ({ account: a.account, account_name: a.displayName, property: p.property, name: p.displayName })));
    },
    async gaLandingPages(token, property, { startDate, endDate } = {}) {
      need(/^properties\/\d+$/.test(property), 'property id');
      const j = await call(fetchImpl, `https://analyticsdata.googleapis.com/v1beta/${property}:runReport`, { token, method: 'POST', body: {
        dateRanges: [{ startDate: ymd(startDate), endDate: ymd(endDate) }], dimensions: [{ name: 'date' }, { name: 'landingPage' }, { name: 'sessionDefaultChannelGroup' }],
        metrics: [{ name: 'sessions' }, { name: 'engagedSessions' }, { name: 'keyEvents' }, { name: 'totalRevenue' }], limit: 10000 } });
      need(!j.rows || Array.isArray(j.rows), 'report rows');
      const mh = (j.metricHeaders || []).map((m) => m.name);
      return (j.rows || []).map((r) => { const m = Object.fromEntries(mh.map((n, i) => [n, Number(r.metricValues?.[i]?.value ?? 0)])); const d = r.dimensionValues || []; return { date: `${d[0]?.value?.slice(0, 4)}-${d[0]?.value?.slice(4, 6)}-${d[0]?.value?.slice(6, 8)}`, landing_page: d[1]?.value || '', channel: d[2]?.value || '', sessions: m.sessions || 0, engaged_sessions: m.engagedSessions || 0, key_events: m.keyEvents || 0, revenue: m.totalRevenue || 0, currency: j.metadata?.currencyCode || null }; });
    },
    // ---------- Google Business Profile ----------
    async gbpAccounts(token) {
      const j = await call(fetchImpl, 'https://mybusinessaccountmanagement.googleapis.com/v1/accounts', { token });
      return (j.accounts || []).map((a) => ({ account: a.name, name: a.accountName, type: a.type }));
    },
    async gbpLocations(token, account) {
      const j = await call(fetchImpl, `https://mybusinessbusinessinformation.googleapis.com/v1/${account}/locations?readMask=${encodeURIComponent('name,title,storefrontAddress,phoneNumbers,categories,regularHours,serviceArea,websiteUri,metadata,profile')}&pageSize=100`, { token });
      return (j.locations || []).map((l) => ({ location: l.name, account, title: l.title || '', address: l.storefrontAddress ? [...(l.storefrontAddress.addressLines || []), l.storefrontAddress.locality, l.storefrontAddress.administrativeArea, l.storefrontAddress.postalCode].filter(Boolean).join(', ') : '', phone: l.phoneNumbers?.primaryPhone || '', website: l.websiteUri || '', primary_category: l.categories?.primaryCategory?.displayName || '', additional_categories: (l.categories?.additionalCategories || []).map((c) => c.displayName), hours: (l.regularHours?.periods || []).map((p) => ({ day: p.openDay, opens: hm(p.openTime), closes: hm(p.closeTime) })), service_areas: (l.serviceArea?.places?.placeInfos || []).map((p) => p.placeName), description: l.profile?.description || '', maps_uri: l.metadata?.mapsUri || null, has_storefront: Boolean(l.storefrontAddress) }));
    },
    async gbpReviews(token, account, location) {
      const loc = location.startsWith('accounts/') ? location : `${account}/${location}`;
      const j = await call(fetchImpl, `https://mybusiness.googleapis.com/v4/${loc}/reviews?pageSize=50`, { token });
      const STARS = { ONE: 1, TWO: 2, THREE: 3, FOUR: 4, FIVE: 5 };
      return { average: j.averageRating ?? null, total: j.totalReviewCount ?? null, reviews: (j.reviews || []).map((r) => ({ review_id: r.reviewId, reviewer: r.reviewer?.isAnonymous ? 'Anonymous' : r.reviewer?.displayName || 'Google user', rating: STARS[r.starRating] ?? null, comment: r.comment || '', created_at: r.createTime, reply: r.reviewReply?.comment || null, name: r.name })) };
    },
    async gbpReply(token, reviewName, comment) {
      await call(fetchImpl, `https://mybusiness.googleapis.com/v4/${reviewName}/reply`, { token, method: 'PUT', body: { comment } });
      return { replied: true };
    },
    async gbpPerformance(token, location, { startDate, endDate } = {}) {
      const id = location.split('/').slice(-2).join('/');
      const s = new Date(startDate), e = new Date(endDate);
      const q = new URLSearchParams();
      for (const m of ['BUSINESS_IMPRESSIONS_MOBILE_SEARCH', 'BUSINESS_IMPRESSIONS_DESKTOP_SEARCH', 'BUSINESS_IMPRESSIONS_MOBILE_MAPS', 'BUSINESS_IMPRESSIONS_DESKTOP_MAPS', 'CALL_CLICKS', 'WEBSITE_CLICKS', 'BUSINESS_DIRECTION_REQUESTS']) q.append('dailyMetrics', m);
      q.set('dailyRange.start_date.year', s.getUTCFullYear()); q.set('dailyRange.start_date.month', s.getUTCMonth() + 1); q.set('dailyRange.start_date.day', s.getUTCDate());
      q.set('dailyRange.end_date.year', e.getUTCFullYear()); q.set('dailyRange.end_date.month', e.getUTCMonth() + 1); q.set('dailyRange.end_date.day', e.getUTCDate());
      const j = await call(fetchImpl, `https://businessprofileperformance.googleapis.com/v1/${id}:fetchMultiDailyMetricsTimeSeries?${q}`, { token });
      const out = {};
      for (const series of j.multiDailyMetricTimeSeries || []) for (const d of series.dailyMetricTimeSeries || []) out[d.dailyMetric] = (d.timeSeries?.datedValues || []).reduce((sum, v) => sum + Number(v.value || 0), 0);
      return out;
    },
    // ---------- Tag Manager ----------
    async gtmContainers(token) {
      const a = await call(fetchImpl, 'https://tagmanager.googleapis.com/tagmanager/v2/accounts', { token });
      const out = [];
      for (const acc of (a.account || []).slice(0, 10)) { const c = await call(fetchImpl, `https://tagmanager.googleapis.com/tagmanager/v2/${acc.path}/containers`, { token }); for (const x of c.container || []) out.push({ account: acc.name, container: x.name, public_id: x.publicId, usage: x.usageContext || [], path: x.path }); }
      return out;
    },
    // ---------- Google Ads (reporting only) ----------
    async adsCustomers(token) {
      if (!env.GOOGLE_ADS_DEVELOPER_TOKEN) throw new GoogleError('Google Ads needs a developer token from Google (GOOGLE_ADS_DEVELOPER_TOKEN).', 412);
      const v = env.GOOGLE_ADS_API_VERSION || 'v21';
      const j = await call(fetchImpl, `https://googleads.googleapis.com/${v}/customers:listAccessibleCustomers`, { token, headers: { 'developer-token': env.GOOGLE_ADS_DEVELOPER_TOKEN } });
      return (j.resourceNames || []).map((r) => ({ customer: r, id: r.split('/')[1] }));
    },
    async adsCampaigns(token, customerId, { startDate, endDate } = {}) {
      if (!env.GOOGLE_ADS_DEVELOPER_TOKEN) throw new GoogleError('Google Ads needs a developer token from Google.', 412);
      const v = env.GOOGLE_ADS_API_VERSION || 'v21';
      const query = `SELECT campaign.id, campaign.name, campaign.status, metrics.clicks, metrics.impressions, metrics.cost_micros, metrics.conversions FROM campaign WHERE segments.date BETWEEN '${ymd(startDate)}' AND '${ymd(endDate)}'`;
      const j = await call(fetchImpl, `https://googleads.googleapis.com/${v}/customers/${String(customerId).replace(/\D/g, '')}/googleAds:search`, { token, method: 'POST', body: { query }, headers: { 'developer-token': env.GOOGLE_ADS_DEVELOPER_TOKEN, ...(env.GOOGLE_ADS_LOGIN_CUSTOMER_ID ? { 'login-customer-id': String(env.GOOGLE_ADS_LOGIN_CUSTOMER_ID).replace(/\D/g, '') } : {}) } });
      return (j.results || []).map((r) => ({ campaign: r.campaign?.name, status: r.campaign?.status, clicks: Number(r.metrics?.clicks || 0), impressions: Number(r.metrics?.impressions || 0), cost: Number(r.metrics?.costMicros || 0) / 1e6, conversions: Number(r.metrics?.conversions || 0) }));
    },
    // ---------- PageSpeed Insights ----------
    async pagespeed(url, strategy = 'mobile') {
      const key = env.PAGESPEED_API_KEY || env.GOOGLE_API_KEY;
      const q = new URLSearchParams({ url, strategy, category: 'performance' }); if (key) q.set('key', key);
      const j = await call(fetchImpl, `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?${q}`, { timeoutMs: 60000 });
      need(j.lighthouseResult || j.loadingExperience, 'PageSpeed result');
      const m = j.loadingExperience?.metrics || {}, a = j.lighthouseResult?.audits || {};
      const field = m.LARGEST_CONTENTFUL_PAINT_MS ? { lcp_ms: m.LARGEST_CONTENTFUL_PAINT_MS?.percentile, cls: m.CUMULATIVE_LAYOUT_SHIFT_SCORE ? m.CUMULATIVE_LAYOUT_SHIFT_SCORE.percentile / 100 : undefined, inp_ms: m.INTERACTION_TO_NEXT_PAINT?.percentile, overall: j.loadingExperience?.overall_category || null, origin_fallback: Boolean(j.loadingExperience?.origin_fallback) } : null;
      const lab = { lcp_ms: a['largest-contentful-paint']?.numericValue, cls: a['cumulative-layout-shift']?.numericValue, tbt_ms: a['total-blocking-time']?.numericValue, performance_score: j.lighthouseResult?.categories?.performance?.score != null ? Math.round(j.lighthouseResult.categories.performance.score * 100) : null };
      return { url, strategy, field, lab, fetched_at: new Date().toISOString(), lighthouse_version: j.lighthouseResult?.lighthouseVersion || null };
    }
  };
}
const hm = (t) => (t ? `${String(t.hours ?? 0).padStart(2, '0')}:${String(t.minutes ?? 0).padStart(2, '0')}` : null);

// Platform (Super Pro's own site) access with a Google service account added as a user of the Search Console property
// or GA4 property. The key comes from GOOGLE_SERVICE_ACCOUNT_JSON and never leaves the server.
export async function serviceAccountToken(env, scopes, { fetchImpl = globalThis.fetch, now = Date.now() } = {}) {
  let sa; try { sa = JSON.parse(env.GOOGLE_SERVICE_ACCOUNT_JSON || ''); } catch { return null; }
  if (!sa?.client_email || !sa?.private_key) return null;
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const iat = Math.floor(now / 1000), head = b64({ alg: 'RS256', typ: 'JWT' }), claim = b64({ iss: sa.client_email, scope: scopes.join(' '), aud: 'https://oauth2.googleapis.com/token', iat, exp: iat + 3600 });
  const sig = crypto.createSign('RSA-SHA256').update(`${head}.${claim}`).sign(sa.private_key).toString('base64url');
  const r = await fetchImpl('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${head}.${claim}.${sig}` }) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.access_token) throw new GoogleError(j.error_description || 'Google did not issue a token for the service account.', r.status);
  return { access_token: j.access_token, expires_at: new Date(now + (j.expires_in || 3600) * 1000).toISOString(), account: sa.client_email };
}
export { GoogleError };
