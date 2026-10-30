// Phase 06 through the real server: command centre, audits, clusters, studio, Google status, local SEO, the website
// builder with publishing approvals (low-risk rule, claims, scheduling, rollback, preview), scheduled SEO jobs,
// measured-versus-estimated dashboard, reports, the Founder Console and strict separation between accounts.
import test from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { randomUUID, randomBytes, createHash } from 'node:crypto';
import { startServer } from './test-server.mjs';
import { seedOwner } from './visual/session.mjs';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function member(server, org, role) {
  const db = new Database(server.dbPath), now = new Date().toISOString(), uid = randomUUID(), token = randomBytes(24).toString('hex');
  db.prepare('INSERT INTO users (id,email,full_name,password_hash,password_salt,created_at,updated_at) VALUES (?,?,?,?,?,?,?)').run(uid, `${role}-${uid}@example.test`, role, 'x', 'x', now, now);
  db.prepare('INSERT INTO memberships (organisation_id,user_id,role,created_at) VALUES (?,?,?,?)').run(org, uid, role, now);
  db.prepare('INSERT INTO user_sessions (id,user_id,token_hash,expires_at,created_at,last_seen_at) VALUES (?,?,?,?,?,?)').run(randomUUID(), uid, createHash('sha256').update(token).digest('hex'), new Date(Date.now() + 3600000).toISOString(), now, now);
  db.close();
  return 'fp_session=' + token;
}
const sql = (s, q, ...a) => { const db = new Database(s.dbPath); try { return /^\s*select/i.test(q) ? db.prepare(q).all(...a) : db.prepare(q).run(...a); } finally { db.close(); } };

async function setup() {
  const s = await startServer();
  const owner = await seedOwner(s, { business: 'Harbour Plumbing Pty Ltd' });
  const O = (m, u, b) => s.call(m, u, { cookie: owner.cookie, body: b });
  const r = await O('PUT', '/api/saas/seo/profile', { business_name: 'Harbour Plumbing', services: ['Blocked drains', 'Hot water repairs'], areas: ['Fremantle', 'Cottesloe'], phone: '0400 111 222', website_url: '' });
  assert.equal(r.status, 200, r.text);
  const lorem = 'We clear blocked drains and repair hot water systems for homes and small businesses around Fremantle and Cottesloe. You get a written quote before we start, and we leave the site clean. ';
  const content = (title, extra = {}) => ({ title, meta_title: `${title} | Harbour Plumbing`, meta_description: `${title} in Fremantle and Cottesloe from Harbour Plumbing. Written quotes before any work starts.`, blocks: [{ type: 'hero', heading: title, text: lorem, cta_label: 'Get a quote', cta_href: '#contact' }, { type: 'text', heading: 'How it works', text: lorem.repeat(3) }, { type: 'contact', heading: 'Contact', phone: '0400 111 222', email: 'hi@harbour.example.test' }], ...extra });
  return { s, owner, O, lorem, content };
}

test('website builder: first release needs approval; low-risk edits follow the owner rule; claims and design changes wait; scheduled, rollback, preview', async (t) => {
  const { s, owner, O, content } = await setup(); t.after(() => s.stop());
  let r = await O('POST', '/api/saas/seo/sites', { name: 'Harbour Plumbing', slug: 'harbour-plumbing', brand: { primary_color: '#0b5394' } });
  assert.equal(r.status, 201, r.text); const site = r.json.site;
  assert.equal((await O('POST', '/api/saas/seo/sites', { name: 'Again', slug: 'harbour-plumbing' })).status, 409, 'site addresses are unique across all businesses');
  r = await O('POST', `/api/saas/seo/sites/${site.id}/pages`, { title: 'Home', slug: 'home', template: 'home' });
  assert.equal(r.status, 201, r.text); const page = r.json.page;
  assert.equal(page.checks.blocked, true, 'a fresh template is not ready to publish');
  assert.equal((await O('POST', `/api/saas/seo/pages/${page.id}/publish`, {})).status, 409, 'blocked checks stop publishing');
  r = await O('PUT', `/api/saas/seo/pages/${page.id}`, { content: content('Blocked drains and hot water in Fremantle'), note: 'First copy' });
  assert.equal(r.status, 200, r.text); assert.equal(r.json.page.draft_version, 2); assert.equal(r.json.page.checks.blocked, false, JSON.stringify(r.json.page.checks.checks.filter((c) => c.level === 'block')));
  // Preview link: works, marked noindex, never public.
  const prev = await fetch(r.json.page.preview_url.replace(/^https?:\/\/[^/]+/, s.base));
  assert.equal(prev.status, 200); assert.equal(prev.headers.get('x-robots-tag'), 'noindex, nofollow'); assert.match(await prev.text(), /Preview: not published/);
  assert.equal((await fetch(s.base + '/sites/harbour-plumbing/')).status, 404, 'nothing is live before approval');
  assert.equal((await fetch(s.base + '/sites/harbour-plumbing/home?preview=forged.token')).status, 403);

  r = await O('POST', `/api/saas/seo/pages/${page.id}/publish`, {});
  assert.equal(r.status, 201, r.text); assert.equal(r.json.run.status, 'awaiting_approval'); assert.match(r.json.message, /First time this page goes live/);
  const ap = (await O('GET', '/api/saas/approvals')).json.approvals.find((a) => a.automation_run_id === r.json.run.id);
  assert.ok(ap && ap.policy_level === 3);
  assert.equal((await O('POST', `/api/saas/approvals/${ap.id}/decision`, { decision: 'approve' })).status, 200);
  let run; for (let i = 0; i < 60; i++) { run = (await O('GET', `/api/saas/automation/runs/${r.json.run.id}`)).json.run; if (run.status === 'completed') break; await sleep(50); }
  assert.equal(run.status, 'completed', JSON.stringify(run)); assert.match(run.verification.detail, /Live at \/sites\/harbour-plumbing\//);
  const live = await fetch(s.base + '/sites/harbour-plumbing/');
  assert.equal(live.status, 200); const html = await live.text();
  assert.match(html, /<h1>Blocked drains and hot water in Fremantle<\/h1>/); assert.match(html, /<link rel="canonical"/); assert.ok(!/noindex/.test(html));
  assert.match(live.headers.get('content-security-policy'), /default-src 'none'/, 'published pages run no scripts');
  assert.match(await (await fetch(s.base + '/sites/harbour-plumbing/sitemap.xml')).text(), /<loc>[^<]*\/sites\/harbour-plumbing\/<\/loc>/);

  // Low-risk wording fix: waits while the rule is off, publishes alone when the owner switches it on.
  const fix = content('Blocked drains and hot water in Fremantle'); fix.blocks[1].text = fix.blocks[1].text.replace('leave the site clean', 'leave the site tidy');
  await O('PUT', `/api/saas/seo/pages/${page.id}`, { content: fix, note: 'Wording' });
  r = await O('POST', `/api/saas/seo/pages/${page.id}/publish`, {});
  assert.equal(r.json.run.status, 'awaiting_approval'); assert.match(r.json.message, /rule/i);
  await O('POST', `/api/saas/approvals/${(await O('GET', '/api/saas/approvals')).json.approvals.find((a) => a.automation_run_id === r.json.run.id).id}/decision`, { decision: 'reject' });
  assert.equal((await O('PUT', '/api/saas/automation/rules/low_risk_site_updates', { enabled: true })).status, 200);
  fix.blocks[1].text += ' '; await O('PUT', `/api/saas/seo/pages/${page.id}`, { content: fix, note: 'Wording again' });
  r = await O('POST', `/api/saas/seo/pages/${page.id}/publish`, {});
  assert.equal(r.json.run.status, 'completed', JSON.stringify(r.json.run)); assert.equal(r.json.run.level, 2);
  assert.match(await (await fetch(s.base + '/sites/harbour-plumbing/')).text(), /leave the site tidy/);

  // Even with the rule on: a new public claim, or a design change, waits for approval.
  const claim = structuredClone(fix); claim.blocks[1].text += ' We are the best plumbers in Perth.';
  await O('PUT', `/api/saas/seo/pages/${page.id}`, { content: claim });
  r = await O('POST', `/api/saas/seo/pages/${page.id}/publish`, {});
  assert.equal(r.json.run.status, 'awaiting_approval'); assert.match(r.json.message, /claim/);
  const design = structuredClone(fix); design.blocks.splice(1, 0, { type: 'areas', heading: 'Areas', items: ['Fremantle'] });
  await O('PUT', `/api/saas/seo/pages/${page.id}`, { content: design });
  r = await O('POST', `/api/saas/seo/pages/${page.id}/publish`, {});
  assert.equal(r.json.run.status, 'awaiting_approval'); assert.match(r.json.message, /design change/);

  // Scheduled publishing: approve with a schedule, it goes live at that time.
  const ap2 = (await O('GET', '/api/saas/approvals')).json.approvals.find((a) => a.automation_run_id === r.json.run.id);
  await O('POST', `/api/saas/approvals/${ap2.id}/decision`, { decision: 'approve' });
  r = await O('POST', `/api/saas/sites-check`, {}); // unknown route stays a 404, never a success
  assert.equal(r.status, 404);
  for (let i = 0; i < 60; i++) { run = (await O('GET', `/api/saas/automation/runs/${ap2.automation_run_id}`)).json.run; if (run.status === 'completed') break; await sleep(50); }
  assert.match(await (await fetch(s.base + '/sites/harbour-plumbing/')).text(), /Areas/);
  const sched = structuredClone(design); sched.blocks[0].text += ' Open weekends.';
  await O('PUT', `/api/saas/seo/pages/${page.id}`, { content: sched });
  const at = new Date(Date.now() + 1500).toISOString();
  r = await O('POST', `/api/saas/seo/pages/${page.id}/publish`, { publish_at: at });
  assert.equal(r.json.run.status, 'completed', 'small change, rule on'); assert.match(r.json.run.result.summary, /Scheduled/);
  assert.doesNotMatch(await (await fetch(s.base + '/sites/harbour-plumbing/')).text(), /Open weekends/, 'not before the scheduled time');
  await sleep(1700);
  assert.match(await (await fetch(s.base + '/sites/harbour-plumbing/')).text(), /Open weekends/, 'live after the scheduled time');

  // Rollback restores an older version as a new version and goes through the same approval rules.
  const p = (await O('GET', `/api/saas/seo/pages/${page.id}`)).json.page;
  r = await O('POST', `/api/saas/seo/pages/${page.id}/rollback`, { version: 2 });
  assert.equal(r.status, 201, r.text); assert.match(r.json.message, /Version 2 restored/);
  assert.ok((await O('GET', `/api/saas/seo/pages/${page.id}`)).json.page.draft_version > p.draft_version);
  assert.ok((await O('GET', `/api/saas/seo/pages/${page.id}`)).json.publishing.length >= 5, 'publishing history is kept');

  // Separation: another business cannot read or change this site or page.
  const other = await seedOwner(s, { business: 'Other Co', email: 'other@other.example.test' });
  const X = (m, u, b) => s.call(m, u, { cookie: other.cookie, body: b });
  assert.equal((await X('GET', `/api/saas/seo/pages/${page.id}`)).status, 404);
  assert.equal((await X('PUT', `/api/saas/seo/pages/${page.id}`, { content: fix })).status, 404);
  assert.equal((await X('POST', `/api/saas/seo/sites/${site.id}/pages`, { title: 'Hijack', slug: 'hijack' })).status, 404);
  assert.equal((await X('GET', '/api/saas/seo/sites')).json.sites.length, 0);
  const worker = member(s, owner.org, 'worker');
  assert.equal((await s.call('GET', '/api/saas/seo/command', { cookie: worker })).status, 403, 'field staff cannot manage the website');
  void owner;
});

test('audit, clusters, studio, dashboard and reports on the business site; measured data stays separate from estimates', async (t) => {
  const { s, owner, O, content } = await setup(); t.after(() => s.stop());
  const site = (await O('POST', '/api/saas/seo/sites', { name: 'Harbour', slug: 'harbour-two' })).json.site;
  for (const [slug, title] of [['home', 'Plumbers in Fremantle'], ['blocked-drains', 'Blocked drains Fremantle']]) {
    const pg = (await O('POST', `/api/saas/seo/sites/${site.id}/pages`, { title, slug })).json.page;
    await O('PUT', `/api/saas/seo/pages/${pg.id}`, { content: content(title) });
    const run = (await O('POST', `/api/saas/seo/pages/${pg.id}/publish`, {})).json.run;
    const ap = (await O('GET', '/api/saas/approvals')).json.approvals.find((a) => a.automation_run_id === run.id);
    await O('POST', `/api/saas/approvals/${ap.id}/decision`, { decision: 'approve' });
  }
  await sleep(400);
  let r = await O('POST', '/api/saas/seo/audit', { url: s.base + '/sites/harbour-two/' });
  assert.equal(r.status, 201, r.text);
  assert.ok(r.json.audit.pages.length >= 2); assert.equal(r.json.audit.checks.find((c) => c.category === 'cwv').level, 'not_measured');
  assert.ok(r.json.audit.categories.length === 19);

  assert.equal((await O('POST', '/api/saas/seo/keywords/inputs', { manual: ['how to unblock a drain'], csv: 'keyword,volume\nhot water repairs fremantle,210\nemergency plumber fremantle,', source_name: 'Keyword Planner export' })).json.with_volume, 1);
  sql(s, "INSERT INTO seo_gsc_rows(owner_key,site_url,date,query,page,clicks,impressions,ctr,position,fetched_at) VALUES (?,?,?,?,?,?,?,?,?,?)", owner.org, 'sc-domain:harbour.test', new Date(Date.now() - 5 * 86400000).toISOString().slice(0, 10), 'blocked drains fremantle', s.base + '/sites/harbour-two/blocked-drains', 9, 240, 0.0375, 8.4, new Date().toISOString());
  r = await O('POST', '/api/saas/seo/keywords/plan', {});
  assert.equal(r.status, 201, r.text);
  const plan = r.json.plan;
  assert.ok(plan.clusters.length >= 2); assert.ok(plan.summary.measured_keywords >= 1); assert.equal(plan.summary.with_volume, 1);
  assert.ok(plan.clusters.some((c) => c.page && c.page.endsWith('/blocked-drains')), 'a cluster maps to the existing page');
  assert.ok(plan.gaps.some((g) => /hot water/.test(g.primary)), 'hot water has no page yet');
  assert.ok(plan.priorities.every((p) => p.basis === 'estimate'));
  for (const c of plan.clusters) for (const k of c.keywords) if (k.evidence.import) assert.equal(k.evidence.import.source_name, 'Keyword Planner export');

  r = await O('POST', '/api/saas/seo/studio', { kind: 'service', topic: 'Hot water repairs' });
  assert.equal(r.status, 201, r.text); assert.equal(r.json.draft.method, 'template', 'no AI provider in tests, and the draft says so');
  assert.ok(r.json.draft.blocks.length && r.json.draft.schema.length);
  const draftId = r.json.draft.id;
  r = await O('POST', `/api/saas/seo/sites/${site.id}/pages`, { title: 'Hot water repairs', slug: 'hot-water', from_draft: draftId });
  assert.equal(r.status, 201, r.text); assert.ok(r.json.page.checks.blocked, 'template placeholders must be replaced before publishing');
  assert.equal((await O('GET', '/api/saas/seo/studio')).json.drafts.find((d) => d.id === draftId).status, 'used');
  r = await O('POST', '/api/saas/seo/studio', { kind: 'alt', page_url: s.base + '/sites/harbour-two/' });
  assert.equal(r.status, 201, r.text);

  let d = (await O('GET', '/api/saas/seo/dashboard')).json;
  assert.equal(d.measured.search_console.clicks, 9); assert.equal(d.measured.search_console.source, 'Google Search Console');
  assert.equal(d.measured.analytics, null, 'no GA4 data: shown as missing, not zero');
  assert.equal(d.measured.leads.website_enquiries, 0); assert.match(d.measured.revenue_attribution.source, /not Google/);
  assert.match(d.estimates.source, /estimates/);
  r = await O('POST', '/api/saas/seo/reports', { kind: 'monthly' });
  assert.equal(r.status, 201); assert.ok(r.json.report.recommendations.length); assert.match(r.json.report.note, /cannot guarantee/);
  assert.equal((await O('GET', `/api/saas/seo/reports/${r.json.report.id}`)).status, 200);

  // Scheduled SEO jobs run through the automation engine and leave reports.
  r = await O('POST', '/api/saas/seo/schedules', { enabled: true });
  assert.ok(r.json.schedules.every((x) => x.status === 'active'), JSON.stringify(r.json.schedules));
  const daily = r.json.schedules.find((x) => x.key === 'seo_daily_monitor');
  sql(s, 'UPDATE seo_profiles SET website_url=? WHERE organisation_id=?', s.base + '/sites/harbour-two/', owner.org);
  r = await O('POST', `/api/saas/automation/workflows/${daily.workflow_id}/run`, {});
  assert.equal(r.status, 201, r.text);
  let run; for (let i = 0; i < 100; i++) { run = (await O('GET', `/api/saas/automation/runs/${r.json.run.id}`)).json.run; if (!['queued', 'executing'].includes(run.status)) break; await sleep(80); }
  assert.ok(['completed', 'completed_warning'].includes(run.status), JSON.stringify(run));
  assert.ok(sql(s, "SELECT COUNT(*) n FROM seo_reports WHERE owner_key=? AND kind='daily'", owner.org)[0].n >= 1);
  const cmd = (await O('GET', '/api/saas/seo/command')).json;
  assert.ok(cmd.audit && cmd.keywords && cmd.google.length === 6 && cmd.schedules.length === 3);
});

test('Google Integration Centre and local SEO: honest status, no false success, review replies wait for approval', async (t) => {
  const { s, owner, O } = await setup(); t.after(() => s.stop());
  let r = await O('GET', '/api/saas/seo/google');
  assert.equal(r.status, 200);
  assert.deepEqual(r.json.services.map((x) => x.service).sort(), ['ads', 'analytics', 'business_profile', 'pagespeed', 'search_console', 'tag_manager']);
  assert.ok(r.json.services.every((x) => x.status === 'not_connected'), 'nothing claims to be connected');
  assert.match(r.json.note, /verified only after a live call/);
  r = await O('POST', '/api/saas/seo/google/search_console/verify', {});
  assert.equal(r.status, 409); assert.equal(r.json.ok, false); assert.match(r.json.error, /Connect Google/);
  assert.equal((await O('GET', '/api/saas/seo/google')).json.services.find((x) => x.service === 'search_console').status, 'failing', 'a failed live check is shown as failing');
  r = await O('GET', '/api/saas/integrations/self-service');
  assert.ok(r.json.integrations.some((i) => i.provider === 'google_seo'), 'Google Search Console, Analytics and Tag Manager can be authorised');
  assert.equal((await O('POST', '/api/saas/integrations/self-service/google_seo/authorise', {})).status, 409, 'no Google OAuth client on this deployment: refused, not faked');

  sql(s, "INSERT INTO seo_reviews(owner_key,review_id,name,reviewer,rating,comment,created_at,fetched_at) VALUES (?,?,?,?,?,?,?,?)", owner.org, 'r1', 'accounts/1/locations/9/reviews/r1', 'Sam Lee', 2, 'Late and messy', '2026-10-01T00:00:00Z', new Date().toISOString());
  r = await O('GET', '/api/saas/seo/local');
  assert.ok(r.json.checks.some((c) => c.area === 'profile' && /not connected/.test(c.title)));
  assert.equal(r.json.location_pages.length, 2);
  r = await O('POST', '/api/saas/seo/local/reviews/r1/draft', {});
  assert.match(r.json.reply_draft, /sorry/);
  r = await O('POST', '/api/saas/seo/local/reviews/r1/reply', { comment: r.json.reply_draft });
  assert.equal(r.status, 201); assert.equal(r.json.run.status, 'awaiting_approval'); assert.equal(r.json.run.level, 3);
  const ap = (await O('GET', '/api/saas/approvals')).json.approvals.find((a) => a.automation_run_id === r.json.run.id);
  await O('POST', `/api/saas/approvals/${ap.id}/decision`, { decision: 'approve' });
  let run; for (let i = 0; i < 60; i++) { run = (await O('GET', `/api/saas/automation/runs/${r.json.run.id}`)).json.run; if (['failed', 'completed'].includes(run.status)) break; await sleep(50); }
  assert.equal(run.status, 'failed', 'without a Google connection the reply is not posted, and it says so'); assert.match(run.error, /Connect Google Business Profile/);
  assert.notEqual(sql(s, 'SELECT reply_status FROM seo_reviews WHERE review_id=?', 'r1')[0].reply_status, 'replied');
  assert.equal((await s.call('GET', '/api/saas/seo/local', { cookie: (await seedOwner(s, { business: 'Z', email: 'z@z.example.test' })).cookie })).json.reviews.length, 0, 'reviews are private to the business');
});

test('Founder Console: Super Pro public site audit, clusters and reports, separated from every business', async (t) => {
  const { s, O } = await setup(); t.after(() => s.stop());
  const F = (m, u, b) => s.call(m, u, { headers: { 'x-admin-key': s.adminKey }, body: b });
  let r = await F('POST', '/api/operator/seo/audit', { max_pages: 20 });
  assert.equal(r.status, 201, r.text); assert.ok(r.json.audit.pages.length >= 5); assert.equal(r.json.audit.checks.find((c) => c.id === 'start').level, 'good');
  r = await F('POST', '/api/operator/seo/keywords/plan', {});
  assert.equal(r.status, 201, r.text); assert.ok(r.json.plan.clusters.length >= 1);
  r = await F('GET', '/api/operator/seo/command');
  assert.equal(r.status, 200); assert.equal(r.json.facts.business_name, 'Super Pro AI Office Manager');
  r = await F('POST', '/api/operator/seo/schedules', { enabled: true });
  assert.ok(r.json.schedules.every((x) => x.status === 'active'));
  assert.equal((await O('GET', '/api/saas/seo/audit')).json.audit, null, "a business never sees the platform's audit");
  assert.equal((await s.call('GET', '/api/operator/seo/command')).status, 401);
  assert.equal((await O('GET', '/api/operator/seo/command')).status, 401, 'a business session cannot open the founder routes');
});
