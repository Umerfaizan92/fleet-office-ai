// Phase 09: wires backups, monitoring, alerting, self-healing and the daily summary together, schedules them, and
// exposes the Founder Console routes (/api/operator/reliability/...). Every schedule is stored in reliability_state,
// so a restart neither repeats nor skips work.
import { z } from 'zod';
import rateLimit from 'express-rate-limit';
import { createBackups, BACKUP_POLICY } from './backup.js';
import { createMonitor } from './monitor.js';
import { createHealer, APPROVAL_ONLY, HEAL_POLICY } from './heal.js';

const HOUR = 3600000;
const perthHour = (t) => Number(new Date(t).toLocaleString('en-AU', { hour: '2-digit', hour12: false, timeZone: 'Australia/Perth' })) % 24;

export function createReliability({ db, env = process.env, queue, storage, databasePath, uploadRoot, mail, engineRef = { current: null }, isSafeAutomationRun, cacheFiles = [], clock = () => Date.now(), fetchImpl, log = console }) {
  const backups = createBackups({ db, env, databasePath, clock, log });
  const monitor = createMonitor({ db, env, queue, backups, storage, databasePath, uploadRoot, mail, clock, fetchImpl, log });
  const healer = createHealer({ db, queue, backups, monitor, isSafeAutomationRun, cacheFiles, clock, log });
  const state = (k) => db.prepare('SELECT value FROM reliability_state WHERE key=?').get(k)?.value || null;
  const setState = (k, v) => db.prepare('INSERT INTO reliability_state (key,value,updated_at) VALUES (?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at').run(k, v, new Date(clock()).toISOString(), );
  const ageH = (k) => { const v = state(k); return v ? (clock() - Date.parse(v)) / HOUR : Infinity; };

  let ticking = false;
  async function tick() {
    if (ticking) return { skipped: true }; ticking = true;
    const done = [];
    try {
      const t = clock(), h = perthHour(t);
      await monitor.runChecks(); done.push('checks');
      await healer.run(); done.push('heal');
      // Daily snapshot in the quiet hours (1 to 5 am Perth), or whenever the last one is over 30 hours old.
      if ((ageH('snapshot_at') >= 20 && h >= 1 && h <= 5) || ageH('snapshot_at') >= 30) { const r = await backups.snapshot(); setState('snapshot_at', new Date(t).toISOString()); done.push('snapshot:' + (r.ok ? 'ok' : r.status)); }
      if (ageH('config_at') >= BACKUP_POLICY.config_every_hours) { const r = await backups.configBackup(); setState('config_at', new Date(t).toISOString()); done.push('config:' + (r.ok ? 'ok' : r.status || 'failed')); }
      if (ageH('restore_test_at') >= BACKUP_POLICY.restore_test_every_hours && ageH('snapshot_at') < 24) { const r = await backups.verify(); setState('restore_test_at', new Date(t).toISOString()); done.push('restore_test:' + (r.ok ? 'passed' : r.status || 'failed')); }
      if (h >= 7 && ageH('summary_at') >= 20) { await monitor.dailySummary(); setState('summary_at', new Date(t).toISOString()); done.push('summary'); }
    } catch (e) { log.error?.('[reliability] tick failed:', e.message); done.push('error:' + e.message); } finally { ticking = false; }
    return { done };
  }
  let timer = null;
  function start({ intervalMs = 5 * 60000 } = {}) { if (timer) return; timer = setInterval(() => { tick().catch(() => {}); }, intervalMs); timer.unref?.(); setTimeout(() => tick().catch(() => {}), 90000).unref?.(); }

  // ---------------- approval-only actions ----------------
  function requestApproval(action, details, actor) {
    if (!APPROVAL_ONLY.some(([k]) => k === action)) return { ok: false, status: 400, error: 'Unknown action.' };
    const engine = engineRef.current; if (!engine) return { ok: false, status: 503, error: 'The approval engine is not running.' };
    const r = engine.startRun({ id: null, scope: 'platform', organisation_id: null, current_version: 0 }, { trigger: 'manual', key: `reliability:${action}:${Date.now()}`, payload: { details }, definition: { trigger: 'manual', action, conditions: [], params: { details }, analysis: 'rules', always_approve: true, approval_expires_hours: 72 }, actor: actor ? { id: actor } : null });
    return { ok: true, run_id: r.id, promise: r.promise };
  }

  function dashboard() {
    const b = backups.status();
    return { health: monitor.latest(), backups: { ...b, history: b.history.slice(0, 15), tests: b.tests.slice(0, 10) }, readiness: monitor.recoveryReadiness(), heal: { policy: { ...HEAL_POLICY, transient: String(HEAL_POLICY.transient), never: String(HEAL_POLICY.never) }, recent: healer.history(30) }, approval_only: APPROVAL_ONLY.map(([key, label, how]) => ({ key, label, how })), requests: db.prepare(`SELECT r.id,r.action,r.status,r.created_at,a.reference_code,a.status approval_status FROM automation_runs r LEFT JOIN platform_approvals a ON a.run_id=r.id WHERE r.scope='platform' AND r.action IN (${APPROVAL_ONLY.map(() => '?').join(',')}) ORDER BY r.created_at DESC LIMIT 20`).all(...APPROVAL_ONLY.map(([k]) => k)), summaries: db.prepare('SELECT day,overall,emailed_to,email_result,created_at FROM reliability_summaries ORDER BY day DESC LIMIT 14').all(), schedule: { snapshot_at: state('snapshot_at'), config_at: state('config_at'), restore_test_at: state('restore_test_at'), summary_at: state('summary_at') } };
  }

  function installRoutes(app, { platform }) {
    if (!platform) return;
    const limiter = rateLimit({ windowMs: 60000, limit: 30, standardHeaders: true, legacyHeaders: false, keyGenerator: (req) => req.platform?.id || req.ip, message: { ok: false, error: 'Too many requests. Wait a minute.' } });
    const op = (a) => [platform.identity, platform.permit('operations', a)];
    const who = (req) => req.platform?.id || 'founder';
    const P = (schema, body) => { const r = schema.safeParse(body ?? {}); if (!r.success) throw Object.assign(new Error(r.error.issues.map((i) => i.message).join('; ')), { status: 400 }); return r.data; };
    const wrap = (fn) => async (req, res) => { try { await fn(req, res); } catch (e) { res.status(e.status || 500).json({ ok: false, error: e.status ? e.message : 'Something went wrong: ' + e.message }); } };
    const audit = (req, action, meta) => { try { platform.log(req.platform.id, action, 'operations', null, meta); } catch { /* best effort */ } };
    app.get('/api/operator/reliability', ...op('read'), wrap(async (req, res) => res.json({ ok: true, ...dashboard() })));
    app.post('/api/operator/reliability/checks', limiter, ...op('read'), wrap(async (req, res) => res.json({ ok: true, ...(await monitor.runChecks({ trigger: 'manual' })) })));
    app.get('/api/operator/reliability/storage', ...op('read'), wrap(async (req, res) => res.json({ ok: true, ...(await backups.storageChecks()), inventory: await backups.inventory() })));
    app.post('/api/operator/reliability/backups/snapshot', limiter, ...op('edit'), wrap(async (req, res) => { const r = await backups.snapshot({ trigger: 'manual' }); if (r.ok) setState('snapshot_at', new Date(clock()).toISOString()); audit(req, 'reliability.snapshot_manual', { ok: r.ok }); res.status(r.ok ? 201 : r.status === 'busy' ? 409 : r.status === 'not_configured' ? 409 : 502).json(r); }));
    app.post('/api/operator/reliability/backups/config', limiter, ...op('edit'), wrap(async (req, res) => { const r = await backups.configBackup({ trigger: 'manual' }); if (r.ok) setState('config_at', new Date(clock()).toISOString()); res.status(r.ok ? 201 : 409).json(r); }));
    app.post('/api/operator/reliability/backups/verify', limiter, ...op('edit'), wrap(async (req, res) => { const b = P(z.object({ key: z.string().max(400).optional() }).strict(), req.body); const r = await backups.verify({ key: b.key || null, trigger: 'manual' }); if (r.ok) setState('restore_test_at', new Date(clock()).toISOString()); audit(req, 'reliability.restore_test_manual', { ok: r.ok }); res.status(r.ok ? 200 : 409).json(r); }));
    app.post('/api/operator/reliability/heal', limiter, ...op('edit'), wrap(async (req, res) => res.json({ ok: true, ...(await healer.run()) })));
    app.post('/api/operator/reliability/summary', limiter, ...op('edit'), wrap(async (req, res) => { const b = P(z.object({ send: z.boolean().default(false) }).strict(), req.body); res.json({ ok: true, summary: await monitor.dailySummary({ send: b.send }) }); }));
    app.post('/api/operator/reliability/alerts/:id/:act(acknowledge|resolve)', limiter, ...op('edit'), wrap((req, res) => { const b = P(z.object({ note: z.string().trim().max(300).optional() }).strict(), req.body); const r = req.params.act === 'acknowledge' ? monitor.acknowledge(req.params.id, who(req), b.note) : monitor.resolve(req.params.id, who(req), b.note); audit(req, 'reliability.alert_' + req.params.act, { id: req.params.id }); res.status(r.ok ? 200 : r.status).json(r); }));
    app.post('/api/operator/reliability/requests', limiter, ...op('edit'), wrap(async (req, res) => { const b = P(z.object({ action: z.enum(APPROVAL_ONLY.map(([k]) => k)), details: z.string().trim().min(10, 'Describe what should be done and why (at least 10 characters).').max(2000) }).strict(), req.body); const r = requestApproval(b.action, b.details, who(req)); if (!r.ok) return res.status(r.status).json(r); await r.promise; audit(req, 'reliability.approval_requested', { action: b.action }); res.status(201).json({ ok: true, run_id: r.run_id, message: 'Sent for approval. Nothing is done automatically: once approved, a person carries it out and marks it done.' }); }));
  }

  return { backups, monitor, healer, tick, start, dashboard, installRoutes, requestApproval };
}
