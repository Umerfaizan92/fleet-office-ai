// Phase 05: HTTP routes for the automation engine (business workspace and Founder Console).
// Every route authorises on the server: the business comes from the signed-in session, never from the request body.
import crypto from 'node:crypto';
import { z } from 'zod';
import rateLimit from 'express-rate-limit';
import { ACTIONS, RULES, TRIGGERS, publicCatalogue } from './catalogue.js';
import { CONDITION_FIELDS, LIMITS } from './engine.js';

const SENIOR = ['owner', 'admin', 'manager', 'super_admin', 'director'];
const iso = () => new Date().toISOString();
const safe = (j, f) => { try { return j ? JSON.parse(j) : f; } catch { return f; } };

export function installAutomationRoutes(app, { db, engine, requireSaasUser, requireSaasRole, staffAccess, platform, aiConfigured = () => false }) {
  const limiter = rateLimit({ windowMs: 60000, limit: 120, standardHeaders: true, legacyHeaders: false, keyGenerator: (req) => req.saas?.organisation_id || req.platform?.id || req.ip, message: { ok: false, error: 'Too many automation requests. Wait a minute and try again.' } });
  const senior = [requireSaasUser, requireSaasRole(...SENIOR)];
  const ownerish = [requireSaasUser, requireSaasRole('owner', 'admin', 'super_admin', 'director')];
  const actor = (req) => ({ id: req.saas.user_id, name: req.saas.full_name, role: req.saas.role });
  const org = (req) => req.saas.organisation_id;
  const wfPublic = (w) => {
    const versions = db.prepare('SELECT version,created_by,created_at,note FROM automation_workflow_versions WHERE workflow_id=? ORDER BY version DESC LIMIT 50').all(w.id);
    const def = w.definition || safe(db.prepare('SELECT definition_json FROM automation_workflow_versions WHERE workflow_id=? AND version=?').get(w.id, w.current_version)?.definition_json, {});
    const a = ACTIONS[w.action];
    return { id: w.id, name: w.name, status: w.status, action: w.action, action_label: a?.label || w.action, level: a?.level, rule: a?.rule || null, trigger: w.trigger_type, trigger_label: TRIGGERS[w.trigger_type], current_version: w.current_version, definition: def, versions, last_run_at: w.last_run_at, last_status: w.last_status, created_at: w.created_at, updated_at: w.updated_at };
  };
  const runsQuery = (scope, orgId, q) => {
    const where = ['scope=?', 'organisation_id IS ?'], args = [scope, orgId];
    if (q.workflow_id) { where.push('workflow_id=?'); args.push(String(q.workflow_id)); }
    if (q.status) { where.push('status=?'); args.push(String(q.status)); }
    return db.prepare(`SELECT * FROM automation_runs WHERE ${where.join(' AND ')} ORDER BY created_at DESC LIMIT ?`).all(...args, Math.min(200, Number(q.limit) || 50)).map(engine.publicRun);
  };
  const bodyOf = z.object({ name: z.string().trim().min(3).max(120), definition: z.record(z.string(), z.any()), note: z.string().trim().max(200).optional() }).strict();

  // ---------------- business workspace ----------------
  app.get('/api/saas/automation/engine', ...senior, (req, res) => {
    const o = org(req);
    res.json({
      ok: true, catalogue: publicCatalogue('business'), triggers: TRIGGERS, condition_fields: CONDITION_FIELDS, limits: LIMITS, ai_configured: aiConfigured(),
      rules: Object.entries(RULES).map(([key, r]) => { const s = engine.rule(o, key); return { key, label: r.label, detail: r.detail, enabled: s.enabled, limits: s.limits, configured_at: s.configured_at || null }; }),
      pause: engine.pauseState(o),
      counts: Object.fromEntries(db.prepare("SELECT status,COUNT(*) n FROM automation_runs WHERE organisation_id=? AND dry_run=0 AND created_at>=? GROUP BY status").all(o, new Date(Date.now() - 7 * 86400000).toISOString()).map((r) => [r.status, r.n])),
      open_outputs: db.prepare("SELECT COUNT(*) n FROM automation_outputs WHERE organisation_id=? AND status='open'").get(o).n
    });
  });
  app.get('/api/saas/automation/workflows', ...senior, (req, res) => {
    res.json({ ok: true, workflows: db.prepare("SELECT * FROM automation_workflows WHERE scope='business' AND organisation_id=? AND status<>'archived' ORDER BY created_at DESC").all(org(req)).map(wfPublic) });
  });
  app.post('/api/saas/automation/workflows', limiter, ...senior, (req, res) => {
    const p = bodyOf.safeParse(req.body); if (!p.success) return res.status(400).json({ ok: false, error: 'Give the automation a name and steps.' });
    const r = engine.createWorkflow({ scope: 'business', org: org(req), name: p.data.name, definition: p.data.definition, actor: actor(req), note: p.data.note });
    if (!r.ok) return res.status(r.status).json(r);
    res.status(201).json({ ok: true, workflow: wfPublic(engine.workflow(r.id, 'business', org(req))) });
  });
  const loadWf = (req, res) => { const w = engine.workflow(req.params.id, 'business', org(req)); if (!w) res.status(404).json({ ok: false, error: 'Automation not found.' }); return w; };
  app.get('/api/saas/automation/workflows/:id', ...senior, (req, res) => { const w = loadWf(req, res); if (w) res.json({ ok: true, workflow: wfPublic(w) }); });
  app.put('/api/saas/automation/workflows/:id', limiter, ...senior, (req, res) => {
    const w = loadWf(req, res); if (!w) return;
    const p = bodyOf.safeParse(req.body); if (!p.success) return res.status(400).json({ ok: false, error: 'Give the automation a name and steps.' });
    if (p.data.name !== w.name) db.prepare('UPDATE automation_workflows SET name=?,updated_at=? WHERE id=?').run(p.data.name, iso(), w.id);
    const r = engine.saveVersion(w, p.data.definition, actor(req), p.data.note);
    if (!r.ok) return res.status(r.status).json(r);
    res.json({ ok: true, workflow: wfPublic(engine.workflow(w.id, 'business', org(req))) });
  });
  app.post('/api/saas/automation/workflows/:id/restore', limiter, ...senior, (req, res) => {
    const w = loadWf(req, res); if (!w) return;
    const r = engine.restoreVersion(w, Number(req.body?.version), actor(req));
    if (!r.ok) return res.status(r.status).json(r);
    res.json({ ok: true, workflow: wfPublic(engine.workflow(w.id, 'business', org(req))) });
  });
  app.post('/api/saas/automation/workflows/:id/status', limiter, ...senior, (req, res) => {
    const w = loadWf(req, res); if (!w) return;
    const p = z.object({ status: z.enum(['active', 'paused', 'archived', 'draft']) }).strict().safeParse(req.body);
    if (!p.success) return res.status(400).json({ ok: false, error: 'Choose active, paused or archived.' });
    engine.setWorkflowStatus(w, p.data.status, actor(req));
    res.json({ ok: true, status: p.data.status });
  });
  // Run now (manual or scheduled triggers) or test it with a dry run. A dry run never changes anything.
  app.post('/api/saas/automation/workflows/:id/run', limiter, ...senior, async (req, res) => {
    const w = loadWf(req, res); if (!w) return;
    const p = z.object({ dry_run: z.boolean().default(false), record_id: z.string().uuid().optional() }).strict().safeParse(req.body || {});
    if (!p.success) return res.status(400).json({ ok: false, error: 'Check the run request.' });
    const trigger = w.definition.trigger;
    const payload = sample(db, org(req), trigger, p.data.record_id);
    if (payload === null) return res.status(409).json({ ok: false, error: 'There is no record yet to test this trigger with. Create one first, or choose a record.' });
    if (!p.data.dry_run && w.status !== 'active' && !['manual', 'schedule.hourly', 'schedule.daily', 'schedule.weekly', 'schedule.monthly'].includes(trigger)) return res.status(409).json({ ok: false, error: 'Switch the automation on before running it for real, or use a dry run.' });
    const r = engine.startRun(w, { trigger, payload, key: 'manual:' + crypto.randomUUID(), dryRun: p.data.dry_run, actor: actor(req) });
    await r.promise;
    res.status(201).json({ ok: true, run: engine.publicRun(engine.runRow(r.id)) });
  });
  // Dry run of unsaved steps from the builder.
  app.post('/api/saas/automation/dry-run', limiter, ...senior, async (req, res) => {
    const v = engine.validateDefinition(req.body?.definition, 'business');
    if (!v.ok) return res.status(400).json(v);
    const payload = sample(db, org(req), v.definition.trigger, req.body?.record_id);
    if (payload === null) return res.status(409).json({ ok: false, error: 'There is no record yet to test this trigger with.' });
    const r = engine.startRun({ id: null, scope: 'business', organisation_id: org(req), current_version: 0 }, { trigger: v.definition.trigger, payload, key: 'dry', dryRun: true, definition: v.definition, actor: actor(req) });
    await r.promise;
    res.json({ ok: true, run: engine.publicRun(engine.runRow(r.id)) });
  });
  app.get('/api/saas/automation/runs', ...senior, (req, res) => res.json({ ok: true, runs: runsQuery('business', org(req), req.query) }));
  const loadRun = (req, res) => { const r = db.prepare("SELECT * FROM automation_runs WHERE id=? AND scope='business' AND organisation_id=?").get(req.params.id, org(req)); if (!r) res.status(404).json({ ok: false, error: 'Run not found.' }); return r; };
  app.get('/api/saas/automation/runs/:id', ...senior, (req, res) => { const r = loadRun(req, res); if (r) res.json({ ok: true, run: engine.publicRun(r), audit: db.prepare("SELECT action,user_name,metadata_json,created_at FROM audit_logs WHERE organisation_id=? AND module='automation' AND entity_id=? ORDER BY created_at, rowid").all(org(req), r.id).map((e) => ({ ...e, metadata: safe(e.metadata_json, {}), metadata_json: undefined })) }); });
  app.post('/api/saas/automation/runs/:id/retry', limiter, ...senior, (req, res) => { const r = loadRun(req, res); if (!r) return; const out = engine.retryRun(r, actor(req)); res.status(out.ok ? 200 : out.status).json(out); });
  app.post('/api/saas/automation/runs/:id/manual-done', limiter, ...senior, (req, res) => {
    const r = loadRun(req, res); if (!r) return;
    const a = ACTIONS[r.action]; if (a && !staffAccess.can(req, a.feature, 'read')) return res.status(403).json({ ok: false, error: 'You do not have access to this area.' });
    const out = engine.manualDone(r, String(req.body?.note || '').slice(0, 500), actor(req)); res.status(out.ok ? 200 : out.status).json(out);
  });
  app.get('/api/saas/automation/outputs', ...senior, (req, res) => {
    const status = ['open', 'done', 'dismissed'].includes(req.query.status) ? req.query.status : 'open';
    res.json({ ok: true, outputs: db.prepare("SELECT id,run_id,kind,title,body,link,status,created_at FROM automation_outputs WHERE scope='business' AND organisation_id=? AND status=? ORDER BY created_at DESC LIMIT 100").all(org(req), status) });
  });
  app.post('/api/saas/automation/outputs/:id', limiter, ...senior, (req, res) => {
    const p = z.object({ status: z.enum(['done', 'dismissed', 'open']) }).strict().safeParse(req.body);
    if (!p.success) return res.status(400).json({ ok: false, error: 'Choose done or dismissed.' });
    const r = db.prepare("UPDATE automation_outputs SET status=?,updated_at=? WHERE id=? AND scope='business' AND organisation_id=?").run(p.data.status, iso(), req.params.id, org(req));
    if (!r.changes) return res.status(404).json({ ok: false, error: 'Not found.' });
    res.json({ ok: true });
  });
  // Level 2 rules: only owners and administrators decide what runs without asking.
  app.put('/api/saas/automation/rules/:key', limiter, ...ownerish, (req, res) => {
    const p = z.object({ enabled: z.boolean(), limits: z.record(z.string(), z.any()).optional() }).strict().safeParse(req.body);
    if (!p.success) return res.status(400).json({ ok: false, error: 'Choose on or off.' });
    const r = engine.setRule(org(req), req.params.key, p.data.enabled, p.data.limits, actor(req));
    res.status(r.ok ? 200 : r.status).json(r);
  });
  // Emergency pause: any senior person can stop everything at once; resuming is owner or administrator only.
  app.post('/api/saas/automation/pause', limiter, ...senior, (req, res) => {
    const p = z.object({ paused: z.boolean(), reason: z.string().trim().max(300).optional() }).strict().safeParse(req.body);
    if (!p.success) return res.status(400).json({ ok: false, error: 'Choose pause or resume.' });
    if (!p.data.paused && !['owner', 'admin', 'super_admin', 'director'].includes(String(req.saas.role).toLowerCase())) return res.status(403).json({ ok: false, error: 'Only the owner or an administrator can resume automations.' });
    const r = engine.setPause(org(req), p.data.paused, p.data.reason, actor(req));
    res.json({ ok: true, pause: engine.pauseState(org(req)), ...r });
  });
  app.get('/api/saas/automation/audit', ...senior, (req, res) => res.json({ ok: true, report: engine.auditReport(org(req), Number(req.query.days) || 30) }));

  // ---------------- Founder Console ----------------
  if (!platform) return;
  const op = (action) => [platform.identity, platform.permit('operations', action)];
  const pActor = (req) => ({ id: req.platform.id, name: req.platform.name || 'Founder', role: req.platform.role || 'operator' });
  app.get('/api/operator/automation', ...op('read'), (req, res) => {
    res.json({
      ok: true, catalogue: publicCatalogue('platform'), triggers: TRIGGERS, pause: engine.pauseState(null), summary: engine.platformSummary(),
      workflows: db.prepare("SELECT * FROM automation_workflows WHERE scope='platform' AND status<>'archived' ORDER BY created_at DESC").all().map(wfPublic),
      approvals: db.prepare("SELECT * FROM platform_approvals ORDER BY CASE WHEN status IN ('pending','clarification_requested') THEN 0 ELSE 1 END, requested_at DESC LIMIT 100").all().map(platformApproval),
      outputs: db.prepare("SELECT id,run_id,kind,title,body,status,created_at FROM automation_outputs WHERE scope='platform' AND status='open' ORDER BY created_at DESC LIMIT 50").all(),
      runs: runsQuery('platform', null, { limit: 30 })
    });
  });
  app.post('/api/operator/automation/workflows', limiter, ...op('edit'), (req, res) => {
    const p = bodyOf.safeParse(req.body); if (!p.success) return res.status(400).json({ ok: false, error: 'Give the automation a name and steps.' });
    const r = engine.createWorkflow({ scope: 'platform', org: null, name: p.data.name, definition: p.data.definition, actor: pActor(req), note: p.data.note });
    if (!r.ok) return res.status(r.status).json(r);
    platform.log(req.platform.id, 'automation.workflow_created', 'operations', r.id);
    res.status(201).json({ ok: true, id: r.id });
  });
  app.post('/api/operator/automation/workflows/:id/status', limiter, ...op('edit'), (req, res) => {
    const w = engine.workflow(req.params.id, 'platform', null); if (!w) return res.status(404).json({ ok: false, error: 'Automation not found.' });
    const p = z.object({ status: z.enum(['active', 'paused', 'archived', 'draft']) }).strict().safeParse(req.body);
    if (!p.success) return res.status(400).json({ ok: false, error: 'Choose a status.' });
    engine.setWorkflowStatus(w, p.data.status, pActor(req));
    res.json({ ok: true });
  });
  app.post('/api/operator/automation/workflows/:id/run', limiter, ...op('edit'), async (req, res) => {
    const w = engine.workflow(req.params.id, 'platform', null); if (!w) return res.status(404).json({ ok: false, error: 'Automation not found.' });
    const r = engine.startRun(w, { trigger: w.definition.trigger, payload: {}, key: 'manual:' + crypto.randomUUID(), dryRun: Boolean(req.body?.dry_run), actor: pActor(req) });
    await r.promise;
    res.status(201).json({ ok: true, run: engine.publicRun(engine.runRow(r.id)) });
  });
  app.post('/api/operator/automation/runs/:id/manual-done', limiter, ...op('approve'), (req, res) => {
    const r = db.prepare("SELECT * FROM automation_runs WHERE id=? AND scope='platform'").get(req.params.id); if (!r) return res.status(404).json({ ok: false, error: 'Run not found.' });
    const out = engine.manualDone(r, String(req.body?.note || '').slice(0, 500), pActor(req)); res.status(out.ok ? 200 : out.status).json(out);
  });
  // Platform-wide emergency pause: holds every business's automations as well as the platform's own.
  app.post('/api/operator/automation/pause', limiter, ...op('edit'), (req, res) => {
    const p = z.object({ paused: z.boolean(), reason: z.string().trim().max(300).optional() }).strict().safeParse(req.body);
    if (!p.success) return res.status(400).json({ ok: false, error: 'Choose pause or resume.' });
    const r = engine.setPause('platform', p.data.paused, p.data.reason, pActor(req));
    platform.log(req.platform.id, p.data.paused ? 'automation.paused_all' : 'automation.resumed_all', 'operations', '');
    res.json({ ok: true, pause: engine.pauseState(null), ...r });
  });
  const loadPa = (req, res, statuses = ['pending', 'clarification_requested']) => { const a = db.prepare('SELECT * FROM platform_approvals WHERE id=?').get(req.params.id); if (!a || !statuses.includes(a.status)) { res.status(404).json({ ok: false, error: 'Waiting approval not found.' }); return null; } return a; };
  const paEvent = (id, req, type, detail = {}) => db.prepare('INSERT INTO platform_approval_events(id,approval_id,actor,event_type,detail_json,created_at) VALUES (?,?,?,?,?,?)').run(crypto.randomUUID(), id, req.platform.id, type, JSON.stringify(detail), iso());
  app.post('/api/operator/automation/approvals/:id/decision', limiter, ...op('approve'), (req, res) => {
    const a = loadPa(req, res); if (!a) return;
    const p = z.object({ decision: z.enum(['approve', 'reject']), note: z.string().trim().max(2000).optional(), edited_payload: z.record(z.string(), z.any()).optional() }).strict().safeParse(req.body);
    if (!p.success) return res.status(400).json({ ok: false, error: 'Choose approve or reject.' });
    if (a.expires_at && Date.parse(a.expires_at) < Date.now()) { db.prepare("UPDATE platform_approvals SET status='expired',updated_at=? WHERE id=?").run(iso(), a.id); engine.onDecision(a, { status: 'expired' }); return res.status(409).json({ ok: false, error: 'This approval has expired.' }); }
    let edited = null;
    if (p.data.edited_payload) { const v = engine.validateEdit(a, p.data.edited_payload); if (!v.ok) return res.status(400).json(v); edited = v.data; }
    const status = p.data.decision === 'approve' ? 'approved' : 'rejected';
    const changed = db.prepare("UPDATE platform_approvals SET status=?,edited_payload_json=COALESCE(?,edited_payload_json),decided_by=?,decided_at=?,decision_note=?,updated_at=? WHERE id=? AND status IN ('pending','clarification_requested')").run(status, edited ? JSON.stringify(edited) : null, req.platform.id, iso(), p.data.note || null, iso(), a.id).changes;
    if (!changed) return res.status(409).json({ ok: false, error: 'This approval was already decided.' });
    paEvent(a.id, req, status, { note: p.data.note || '' });
    platform.log(req.platform.id, 'automation.approval_' + status, 'operations', a.id);
    const r = engine.onDecision(a, { status, edited, actor: pActor(req), executeAfter: a.execute_after });
    res.json({ ok: true, status, ...r });
  });
  app.post('/api/operator/automation/approvals/:id/schedule', limiter, ...op('approve'), (req, res) => {
    const a = loadPa(req, res); if (!a) return;
    const p = z.object({ execute_after: z.iso.datetime() }).strict().safeParse(req.body);
    if (!p.success || Date.parse(p.data.execute_after) < Date.now()) return res.status(400).json({ ok: false, error: 'Choose a future date and time.' });
    db.prepare('UPDATE platform_approvals SET execute_after=?,updated_at=? WHERE id=?').run(p.data.execute_after, iso(), a.id);
    paEvent(a.id, req, 'scheduled', { execute_after: p.data.execute_after });
    res.json({ ok: true });
  });
  app.post('/api/operator/automation/approvals/:id/clarify', limiter, ...op('approve'), (req, res) => {
    const a = loadPa(req, res, ['pending']); if (!a) return;
    const q = String(req.body?.question || '').trim(); if (q.length < 5) return res.status(400).json({ ok: false, error: 'Write the question.' });
    db.prepare("UPDATE platform_approvals SET status='clarification_requested',clarification_question=?,updated_at=? WHERE id=?").run(q.slice(0, 1000), iso(), a.id);
    paEvent(a.id, req, 'clarification_requested', { question: q.slice(0, 1000) });
    res.json({ ok: true });
  });
  app.post('/api/operator/automation/approvals/:id/clarification', limiter, ...op('edit'), (req, res) => {
    const a = loadPa(req, res, ['clarification_requested']); if (!a) return;
    const answer = String(req.body?.answer || '').trim(); if (answer.length < 2) return res.status(400).json({ ok: false, error: 'Write the answer.' });
    db.prepare("UPDATE platform_approvals SET status='pending',clarification_answer=?,updated_at=? WHERE id=?").run(answer.slice(0, 2000), iso(), a.id);
    paEvent(a.id, req, 'clarified', { answer: answer.slice(0, 2000) });
    res.json({ ok: true });
  });
  app.get('/api/operator/automation/approvals/:id/events', ...op('read'), (req, res) => res.json({ ok: true, events: db.prepare('SELECT actor,event_type,detail_json,created_at FROM platform_approval_events WHERE approval_id=? ORDER BY created_at').all(req.params.id).map((e) => ({ ...e, detail: safe(e.detail_json, {}) })) }));
  app.get('/api/operator/automation/audit', ...op('read'), (req, res) => res.json({ ok: true, report: engine.auditReport(null, Number(req.query.days) || 30, 'platform'), summary: engine.platformSummary() }));
}

function platformApproval(a) { return { ...a, draft_payload: safe(a.draft_payload_json, {}), edited_payload: safe(a.edited_payload_json, null), data_involved: safe(a.data_involved_json, []), action_label: ACTIONS[a.action]?.label || a.action }; }

// The newest matching record, used to run or dry-run an automation by hand.
function sample(db, org, trigger, recordId) {
  const one = (sql, ...a) => db.prepare(sql).get(...a);
  const pick = (kind) => (recordId ? one('SELECT id FROM tenant_documents WHERE id=? AND organisation_id=? AND kind=?', recordId, org, kind) : one('SELECT id FROM tenant_documents WHERE organisation_id=? AND kind=? ORDER BY created_at DESC LIMIT 1', org, kind));
  const job = (extra = '') => (recordId ? one('SELECT id FROM work_orders WHERE id=? AND organisation_id=?', recordId, org) : one(`SELECT id FROM work_orders WHERE organisation_id=? ${extra} ORDER BY created_at DESC LIMIT 1`, org));
  switch (trigger) {
    case 'enquiry.created': { const r = pick('enquiry'); return r ? { enquiry_id: r.id } : null; }
    case 'quote.approved': case 'quote.accepted': { const r = pick('quote'); return r ? { quote_id: r.id } : null; }
    case 'job.booked': { const r = job(); return r ? { work_order_id: r.id } : null; }
    case 'job.completed': { const r = job('AND completed_at IS NOT NULL'); return r ? { work_order_id: r.id } : null; }
    case 'invoice.issued': { const r = pick('invoice'); return r ? { invoice_id: r.id } : null; }
    case 'payment.received': { const r = recordId ? one('SELECT id,work_order_id FROM job_payments WHERE id=? AND organisation_id=?', recordId, org) : one("SELECT id,work_order_id FROM job_payments WHERE organisation_id=? AND status='paid' ORDER BY paid_at DESC LIMIT 1", org); return r ? { payment_id: r.id, work_order_id: r.work_order_id } : null; }
    default: return {};
  }
}
