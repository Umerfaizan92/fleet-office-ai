// Phase 06: HTTP routes for the SEO platform. The same routes serve a business workspace (/api/saas/seo/...) and the
// Founder Console for Super Pro's own website (/api/operator/seo/...). The owner always comes from the signed-in
// session: a business only ever reaches its own rows, and only the Founder Console reaches the platform's.
import crypto from 'node:crypto';
import { z } from 'zod';
import rateLimit from 'express-rate-limit';
import { CONTENT_KINDS } from './content.js';
import { TEMPLATES, BLOCK_TYPES } from './builder.js';
import { GOOGLE_SERVICES } from './google.js';
import { AUDIT_CATEGORIES } from './audit.js';

const SENIOR = ['owner', 'admin', 'manager', 'super_admin', 'director'];
const OWNERS = ['owner', 'admin', 'super_admin', 'director'];
const slug = z.string().trim().toLowerCase().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'Use lowercase letters, numbers and dashes only.').min(2).max(60);
const block = z.object({ type: z.enum(BLOCK_TYPES) }).passthrough().refine((b) => JSON.stringify(b).length < 20000, 'A section is too large.');
const content = z.object({ title: z.string().trim().min(2).max(160), slug: slug.optional(), meta_title: z.string().trim().max(120).optional().default(''), meta_description: z.string().trim().max(320).optional().default(''), blocks: z.array(block).max(40), schema: z.array(z.record(z.string(), z.any())).max(10).optional().default([]) }).strict();
const OPS = ['seo_daily_monitor', 'seo_weekly_analysis', 'seo_monthly_report'];

export function installSeoRoutes(app, { db, service, engine, requireSaasUser, requireSaasRole, platform, saasAudit = () => {} }) {
  const limiter = rateLimit({ windowMs: 60000, limit: 60, standardHeaders: true, legacyHeaders: false, keyGenerator: (req) => req.saas?.organisation_id || req.platform?.id || req.ip, message: { ok: false, error: 'Too many requests. Wait a minute and try again.' } });
  const heavy = rateLimit({ windowMs: 10 * 60000, limit: 10, standardHeaders: true, legacyHeaders: false, keyGenerator: (req) => req.saas?.organisation_id || req.platform?.id || req.ip, message: { ok: false, error: 'Audits and Google syncs are limited to 10 every 10 minutes.' } });
  const fail = (res, e) => res.status(e.status || (e.permanent ? 400 : 500)).json({ ok: false, error: e.status || e.permanent ? e.message : 'Something went wrong: ' + e.message });
  const wrap = (fn) => async (req, res) => { try { await fn(req, res); } catch (e) { if (!e.status && !e.permanent) console.warn('[seo]', e.message); fail(res, e); } };
  const P = (schema, body) => { const r = schema.safeParse(body ?? {}); if (!r.success) throw Object.assign(new Error(r.error.issues.map((i) => `${i.path.join('.') || 'request'}: ${i.message}`).join('; ')), { status: 400 }); return r.data; };

  function mount(prefix, { read, write, admin, owner, actor, scope, audit }) {
    // ---------- SEO Command Centre ----------
    app.get(`${prefix}/command`, ...read, wrap((req, res) => {
      const o = owner(req), a = service.latestAudit(o), plan = service.latestPlan(o), d = service.dashboard(o, 28);
      const alerts = db.prepare(`SELECT id,title,body,created_at FROM automation_outputs WHERE scope=? AND organisation_id IS ? AND status='open' AND kind='alert' AND (link LIKE '#b06/%' OR title LIKE 'SEO%') ORDER BY created_at DESC LIMIT 10`).all(scope, scope === 'platform' ? null : o);
      const reports = db.prepare('SELECT id,kind,created_at FROM seo_reports WHERE owner_key=? ORDER BY created_at DESC LIMIT 5').all(o);
      res.json({ ok: true, facts: service.facts(o), audit: a ? { id: a.id, score: a.score, score_note: a.score_note, counts: a.counts, categories: a.categories, created_at: a.created_at, site_url: a.site_url, top: a.checks.filter((c) => c.level === 'fix').slice(0, 6) } : null, keywords: plan ? { created_at: plan.created_at, summary: plan.summary, top: (plan.priorities || []).slice(0, 5), gaps: (plan.gaps || []).length, cannibalisation: (plan.cannibalisation || []).length } : null, google: service.googleStatus(o), measured: d.measured, alerts, reports, schedules: schedules(req), sites: service.sites(o).map((s) => ({ id: s.id, name: s.name, url: s.url, pages: s.pages.length, live: s.pages.filter((p) => p.published_version).length })), categories: AUDIT_CATEGORIES });
    }));
    // ---------- Technical Audit Engine ----------
    app.post(`${prefix}/audit`, heavy, ...write, wrap(async (req, res) => { const b = P(z.object({ url: z.string().url().max(500).optional(), max_pages: z.number().int().min(5).max(100).optional() }).strict(), req.body); const r = await service.runAudit(owner(req), { url: b.url, actor: actor(req).id, maxPages: b.max_pages || 40 }); audit(req, 'seo.audit_run', r.id, { score: r.score }); res.status(201).json({ ok: true, audit: slim(r) }); }));
    app.get(`${prefix}/audit`, ...read, wrap((req, res) => { const a = service.latestAudit(owner(req)); res.json({ ok: true, audit: a ? slim(a) : null, history: db.prepare('SELECT id,site_url,trigger,created_at,status,score,counts_json,error FROM seo_audits WHERE owner_key=? ORDER BY created_at DESC LIMIT 30').all(owner(req)).map((r) => ({ ...r, counts: JSON.parse(r.counts_json || 'null'), counts_json: undefined })) }); }));
    // ---------- Keyword Cluster Engine ----------
    app.post(`${prefix}/keywords/inputs`, limiter, ...write, wrap((req, res) => { const b = P(z.object({ manual: z.array(z.string().trim().min(2).max(120)).max(200).default([]), csv: z.string().max(500000).default(''), source_name: z.string().trim().max(80).default('Uploaded list') }).strict(), req.body); res.status(201).json({ ok: true, ...service.addKeywordInputs(owner(req), b, actor(req).id) }); }));
    app.post(`${prefix}/keywords/plan`, heavy, ...write, wrap((req, res) => { const plan = service.buildKeywordPlan(owner(req)); audit(req, 'seo.keyword_plan', plan.id, plan.summary); res.status(201).json({ ok: true, plan }); }));
    app.get(`${prefix}/keywords`, ...read, wrap((req, res) => res.json({ ok: true, plan: service.latestPlan(owner(req)), inputs: db.prepare('SELECT kind,keyword,volume,source_name,created_at FROM seo_keyword_inputs WHERE owner_key=? ORDER BY created_at DESC LIMIT 500').all(owner(req)) })));
    // ---------- AI Content Studio ----------
    app.post(`${prefix}/studio`, limiter, ...write, wrap(async (req, res) => { const b = P(z.object({ kind: z.enum(Object.keys(CONTENT_KINDS)), topic: z.string().trim().max(160).optional(), page_url: z.string().url().max(500).optional(), keywords: z.array(z.string().max(120)).max(20).default([]) }).strict(), req.body); const d = await service.studio(owner(req), b, actor(req).id); audit(req, 'seo.draft_created', d.id, { kind: b.kind, method: d.method }); res.status(201).json({ ok: true, draft: d }); }));
    app.get(`${prefix}/studio`, ...read, wrap((req, res) => res.json({ ok: true, kinds: CONTENT_KINDS, drafts: db.prepare("SELECT id,kind,topic,status,created_at,draft_json FROM seo_drafts WHERE owner_key=? AND status<>'archived' ORDER BY created_at DESC LIMIT 100").all(owner(req)).map((d) => ({ ...d, draft: JSON.parse(d.draft_json), draft_json: undefined })) })));
    app.patch(`${prefix}/studio/:id`, limiter, ...write, wrap((req, res) => { const b = P(z.object({ status: z.enum(['draft', 'archived']) }).strict(), req.body); const r = db.prepare('UPDATE seo_drafts SET status=?,updated_at=? WHERE id=? AND owner_key=?').run(b.status, new Date().toISOString(), req.params.id, owner(req)); if (!r.changes) return res.status(404).json({ ok: false, error: 'Draft not found.' }); res.json({ ok: true }); }));
    // ---------- Google Integration Centre ----------
    app.get(`${prefix}/google`, ...read, wrap((req, res) => res.json({ ok: true, services: service.googleStatus(owner(req)), note: 'A service shows as verified only after a live call to Google succeeded. Google decides indexing and rankings; nothing here can guarantee them.' })));
    app.post(`${prefix}/google/:service/verify`, heavy, ...admin, wrap(async (req, res) => { if (!GOOGLE_SERVICES[req.params.service]) return res.status(404).json({ ok: false, error: 'Unknown Google service.' }); const r = await service.verifyGoogle(owner(req), req.params.service, actor(req).id); audit(req, 'seo.google_verified', req.params.service, { ok: r.ok }); res.status(r.ok ? 200 : r.status).json(r.ok ? { ok: true, ...r } : { ok: false, error: r.error, live: true }); }));
    app.get(`${prefix}/google/:service/resources`, ...admin, wrap(async (req, res) => {
      const o = owner(req), s = req.params.service, g = service.google;
      let list;
      if (s === 'search_console') list = (await g.gscSites(await service.googleToken(o, 'google_seo'))).map((x) => ({ resource: x.site_url, label: `${x.site_url} (${x.permission})`, usable: x.verified }));
      else if (s === 'analytics') list = (await g.gaProperties(await service.googleToken(o, 'google_seo'))).map((x) => ({ resource: x.property, label: `${x.name} (${x.account_name})`, usable: true }));
      else if (s === 'business_profile') { const t = await service.googleToken(o, 'google_business'); const accts = await g.gbpAccounts(t); list = []; for (const a of accts.slice(0, 5)) for (const l of await g.gbpLocations(t, a.account)) list.push({ resource: `${a.account}/${l.location}`, label: `${l.title}${l.address ? ' · ' + l.address : ''}`, usable: true }); }
      else if (s === 'tag_manager') list = (await g.gtmContainers(await service.googleToken(o, 'google_seo'))).map((x) => ({ resource: x.public_id, label: `${x.container} (${x.public_id})`, usable: true }));
      else if (s === 'ads') list = (await g.adsCustomers(await service.googleToken(o, 'google_seo'))).map((x) => ({ resource: x.id, label: `Customer ${x.id}`, usable: true }));
      else return res.status(404).json({ ok: false, error: 'This service has nothing to link.' });
      res.json({ ok: true, resources: list });
    }));
    app.put(`${prefix}/google/:service/link`, limiter, ...admin, wrap((req, res) => { if (!GOOGLE_SERVICES[req.params.service] || req.params.service === 'pagespeed') return res.status(404).json({ ok: false, error: 'Unknown Google service.' }); const b = P(z.object({ resource: z.string().trim().min(3).max(300), label: z.string().trim().max(200).optional() }).strict(), req.body); service.setLink(owner(req), req.params.service, b.resource, b.label, actor(req).id); audit(req, 'seo.google_linked', req.params.service, { resource: b.resource }); res.json({ ok: true }); }));
    app.post(`${prefix}/google/sync`, heavy, ...write, wrap(async (req, res) => { const r = await service.syncGoogle(owner(req), { actor: actor(req).id }); res.json({ ok: true, results: r }); }));
    app.post(`${prefix}/google/sitemap`, limiter, ...admin, wrap(async (req, res) => { const b = P(z.object({ sitemap_url: z.string().url().max(500) }).strict(), req.body); const r = await startAction(req, 'submit_sitemap', b, `sitemap:${b.sitemap_url}:${Date.now()}`); res.status(201).json({ ok: true, run: r }); }));
    // ---------- Local SEO ----------
    app.get(`${prefix}/local`, ...read, wrap((req, res) => res.json({ ok: true, ...service.local(owner(req)) })));
    app.post(`${prefix}/local/reviews/:id/draft`, limiter, ...write, wrap((req, res) => { const r = service.draftReviewReply(owner(req), req.params.id); if (!r) return res.status(404).json({ ok: false, error: 'Review not found.' }); res.json({ ok: true, ...r }); }));
    app.post(`${prefix}/local/reviews/:id/reply`, limiter, ...write, wrap(async (req, res) => { const b = P(z.object({ comment: z.string().trim().min(2).max(4000) }).strict(), req.body); if (!db.prepare('SELECT 1 FROM seo_reviews WHERE owner_key=? AND review_id=?').get(owner(req), req.params.id)) return res.status(404).json({ ok: false, error: 'Review not found.' }); const r = await startAction(req, 'reply_to_review', { review_id: req.params.id, comment: b.comment }, `reply:${req.params.id}:${crypto.createHash('sha256').update(b.comment).digest('hex').slice(0, 12)}`); db.prepare("UPDATE seo_reviews SET reply_draft=?,reply_status='awaiting_approval' WHERE owner_key=? AND review_id=?").run(b.comment, owner(req), req.params.id); res.status(201).json({ ok: true, run: r, message: 'Sent for approval. The reply is posted on Google only after it is approved.' }); }));
    // ---------- Website Builder ----------
    app.get(`${prefix}/sites`, ...read, wrap((req, res) => res.json({ ok: true, sites: service.sites(owner(req)), templates: Object.fromEntries(Object.entries(TEMPLATES).map(([k, t]) => [k, t.name])), block_types: BLOCK_TYPES })));
    app.post(`${prefix}/sites`, limiter, ...admin, wrap((req, res) => { const b = P(z.object({ name: z.string().trim().min(2).max(120), slug, brand: z.object({ primary_color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(), font: z.string().max(120).optional() }).strict().default({}) }).strict(), req.body); const r = service.createSite(owner(req), b, actor(req).id); if (!r.ok) return res.status(r.status).json(r); audit(req, 'seo.site_created', r.site.id, { slug: b.slug }); res.status(201).json(r); }));
    app.post(`${prefix}/sites/:id/pages`, limiter, ...write, wrap((req, res) => { const b = P(z.object({ title: z.string().trim().min(2).max(160), slug, template: z.enum(Object.keys(TEMPLATES)).default('service'), from_draft: z.string().uuid().optional() }).strict(), req.body); const r = service.createPage(owner(req), req.params.id, b, actor(req).id); if (!r.ok) return res.status(r.status).json(r); res.status(201).json(r); }));
    app.get(`${prefix}/pages/:id`, ...read, wrap((req, res) => { const p = service.pageOut(owner(req), req.params.id); if (!p) return res.status(404).json({ ok: false, error: 'Page not found.' }); res.json({ ok: true, page: p, publishing: publishRuns(req, p.id) }); }));
    app.put(`${prefix}/pages/:id`, limiter, ...write, wrap((req, res) => { const b = P(z.object({ content, note: z.string().trim().max(200).optional() }).strict(), req.body); const r = service.saveVersion(owner(req), req.params.id, b.content, actor(req).id, b.note); if (!r.ok) return res.status(r.status).json(r); res.json(r); }));
    app.post(`${prefix}/pages/:id/publish`, limiter, ...write, wrap(async (req, res) => { const b = P(z.object({ publish_at: z.iso.datetime().nullable().optional() }).strict(), req.body); const r = service.requestPublish(owner(req), req.params.id, { publish_at: b.publish_at || null }, actor(req).id); if (!r.ok) return res.status(r.status).json(r); await r.promise; await settle(r.run_id); const run = engine.publicRun(engine.runRow(r.run_id)); audit(req, 'seo.publish_requested', req.params.id, { run: r.run_id, status: run.status }); res.status(201).json({ ok: true, run, message: publishMessage(run) }); }));
    app.post(`${prefix}/pages/:id/rollback`, limiter, ...write, wrap(async (req, res) => { const b = P(z.object({ version: z.number().int().positive() }).strict(), req.body); const r = service.rollback(owner(req), req.params.id, b.version, actor(req).id); if (!r.ok) return res.status(r.status).json(r); await r.promise; await settle(r.run_id); const run = engine.publicRun(engine.runRow(r.run_id)); res.status(201).json({ ok: true, run, message: `Version ${b.version} restored as a new version. ${publishMessage(run)}` }); }));
    // ---------- Analytics Dashboard and Automated Reporting ----------
    app.get(`${prefix}/dashboard`, ...read, wrap((req, res) => res.json({ ok: true, ...service.dashboard(owner(req), Math.min(365, Math.max(7, Number(req.query.days) || 28))) })));
    app.get(`${prefix}/reports`, ...read, wrap((req, res) => res.json({ ok: true, reports: db.prepare('SELECT id,kind,period_start,period_end,created_at FROM seo_reports WHERE owner_key=? ORDER BY created_at DESC LIMIT 60').all(owner(req)) })));
    app.get(`${prefix}/reports/:id`, ...read, wrap((req, res) => { const r = db.prepare('SELECT * FROM seo_reports WHERE id=? AND owner_key=?').get(req.params.id, owner(req)); if (!r) return res.status(404).json({ ok: false, error: 'Report not found.' }); res.json({ ok: true, report: { id: r.id, ...JSON.parse(r.report_json) } }); }));
    app.post(`${prefix}/reports`, heavy, ...write, wrap((req, res) => { const b = P(z.object({ kind: z.enum(['daily', 'weekly', 'monthly']) }).strict(), req.body); const r = service.report(owner(req), b.kind); res.status(201).json({ ok: true, report: r }); }));
    // ---------- Scheduled SEO jobs (run through the automation engine) ----------
    app.get(`${prefix}/schedules`, ...read, wrap((req, res) => res.json({ ok: true, schedules: schedules(req) })));
    app.post(`${prefix}/schedules`, limiter, ...admin, wrap((req, res) => {
      const b = P(z.object({ enabled: z.boolean() }).strict(), req.body), out = [];
      for (const key of OPS) {
        const action = scope === 'platform' ? 'platform_' + key : key;
        let w = db.prepare("SELECT id FROM automation_workflows WHERE scope=? AND organisation_id IS ? AND action=? AND status<>'archived'").get(scope, scope === 'platform' ? null : owner(req), action);
        if (!w && b.enabled) { const r = engine.createWorkflow({ scope, org: scope === 'platform' ? null : owner(req), name: engineLabel(action), definition: { trigger: key === 'seo_daily_monitor' ? 'schedule.daily' : key === 'seo_weekly_analysis' ? 'schedule.weekly' : 'schedule.monthly', action }, actor: actor(req) }); if (!r.ok) throw Object.assign(new Error(r.error), { status: r.status }); w = { id: r.id }; }
        if (w) { engine.setWorkflowStatus(engine.workflow(w.id, scope, scope === 'platform' ? null : owner(req)), b.enabled ? 'active' : 'paused', actor(req)); out.push(w.id); }
      }
      res.json({ ok: true, schedules: schedules(req) });
    }));

    function schedules(req) {
      return OPS.map((key) => { const action = scope === 'platform' ? 'platform_' + key : key; const w = db.prepare("SELECT id,name,status,last_run_at,last_status,trigger_type FROM automation_workflows WHERE scope=? AND organisation_id IS ? AND action=? AND status<>'archived'").get(scope, scope === 'platform' ? null : owner(req), action); return { key, label: engineLabel(action), frequency: key.includes('daily') ? 'Daily (7am)' : key.includes('weekly') ? 'Weekly (Monday 7am)' : 'Monthly (1st, 7am)', workflow_id: w?.id || null, status: w?.status || 'not_set_up', last_run_at: w?.last_run_at || null, last_status: w?.last_status || null }; });
    }
    async function startAction(req, action, params, key) {
      const r = engine.startRun({ id: null, scope, organisation_id: scope === 'platform' ? null : owner(req), current_version: 0 }, { trigger: 'manual', key, payload: params, definition: { trigger: 'manual', action, conditions: [], params, analysis: 'rules', always_approve: false, approval_expires_hours: 168 }, actor: actor(req) });
      await r.promise; await settle(r.id);
      return engine.publicRun(engine.runRow(r.id));
    }
    function publishRuns(req, pageId) { return db.prepare("SELECT * FROM automation_runs WHERE scope=? AND organisation_id IS ? AND action='publish_site_page' AND event_json LIKE ? ORDER BY created_at DESC LIMIT 20").all(scope, scope === 'platform' ? null : owner(req), `%"page_id":"${pageId}"%`).map(engine.publicRun); }
  }
  const engineLabel = (action) => engine.catalogue(action.startsWith('platform_') ? 'platform' : 'business').find((a) => a.key === action)?.label || action;
  async function settle(runId) { for (let i = 0; i < 60; i++) { const r = engine.runRow(runId); if (r && !['received', 'queued', 'executing'].includes(r.status)) return; await new Promise((x) => setTimeout(x, 25)); } }
  const publishMessage = (run) => run.status === 'awaiting_approval' ? `Sent for approval: ${(run.policy?.reasons || []).filter((x) => /^Needs approval|rule/.test(x)).map((x) => x.replace(/^Needs approval: /, '')).join(' ') || 'publishing needs a person to approve it.'}` : ['completed', 'completed_warning'].includes(run.status) ? (run.result?.summary || 'Published.') : run.status === 'held' ? 'Automations are paused, so this is held until they are resumed.' : `${run.status.replace(/_/g, ' ')}${run.error ? ': ' + run.error : ''}`;
  const slim = (a) => ({ id: a.id, site_url: a.site_url, created_at: a.created_at, score: a.score, score_note: a.score_note, counts: a.counts, categories: a.categories, checks: a.checks, pages: a.pages, sitemaps: a.sitemaps, robots_status: a.robots_status, psi_used: a.psi_used });

  mount('/api/saas/seo', {
    read: [requireSaasUser, requireSaasRole(...SENIOR)], write: [requireSaasUser, requireSaasRole(...SENIOR)], admin: [requireSaasUser, requireSaasRole(...OWNERS)],
    owner: (req) => req.saas.organisation_id, actor: (req) => ({ id: req.saas.user_id, name: req.saas.full_name, role: req.saas.role }), scope: 'business',
    audit: (req, action, id, meta) => { try { saasAudit(req, action, 'seo', id, meta); } catch { /* best effort */ } }
  });
  if (platform) mount('/api/operator/seo', {
    read: [platform.identity, platform.permit('marketing', 'read')], write: [platform.identity, platform.permit('marketing', 'edit')], admin: [platform.identity, platform.permit('marketing', 'approve')],
    owner: () => 'platform', actor: (req) => ({ id: req.platform.id, name: req.platform.name || 'Founder', role: req.platform.role || 'operator' }), scope: 'platform',
    audit: (req, action, id) => { try { platform.log(req.platform.id, action, 'marketing', String(id || '')); } catch { /* best effort */ } }
  });

  // ---------- published websites built with the Website Builder ----------
  const send = (res, r) => { if (!r) return res.status(404).type('html').send('<!doctype html><title>Not found</title><h1>Page not found</h1>'); if (r.status === 403) return res.status(403).type('text').send('This preview link is not valid or has expired.'); res.set('Cache-Control', r.preview ? 'no-store' : 'public, max-age=300'); if (r.preview) res.set('X-Robots-Tag', 'noindex, nofollow'); res.set('Content-Security-Policy', "default-src 'none'; img-src https: data:; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'self'"); res.type('html').send(r.html); };
  app.get('/sites/:site/robots.txt', (req, res) => res.type('text/plain').send(`User-agent: *\nAllow: /sites/${req.params.site}/\nSitemap: ${service.siteBase()}/sites/${req.params.site}/sitemap.xml\n`));
  app.get('/sites/:site/sitemap.xml', (req, res) => { const x = service.siteSitemap(req.params.site); if (!x) return res.status(404).end(); res.type('application/xml').send(x); });
  app.get('/sites/:site', (req, res) => { if (!req.originalUrl.split('?')[0].endsWith('/')) return res.redirect(301, `/sites/${encodeURIComponent(req.params.site)}/`); send(res, service.renderPublic(req.params.site, 'home', req.query.preview)); });
  app.get('/sites/:site/:page', (req, res) => send(res, service.renderPublic(req.params.site, req.params.page, req.query.preview)));
}
