// Durable background jobs in the existing database: retries with back-off, idempotency keys, leases so a crashed
// run is picked up again, a dead-letter state after the last attempt, and counts the Founder Console can show.
// Payloads must never contain secrets or message bodies with personal data beyond what the handler needs.
import crypto from 'node:crypto';

const iso = (ms = Date.now()) => new Date(ms).toISOString();
const STATUSES = ['queued', 'running', 'succeeded', 'failed', 'dead', 'cancelled'];

export function createJobQueue({ db, log = console, workerId = 'w-' + crypto.randomBytes(4).toString('hex'), clock = () => Date.now() } = {}) {
  db.exec(`CREATE TABLE IF NOT EXISTS background_jobs(
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL,
    organisation_id TEXT,
    payload_json TEXT NOT NULL DEFAULT '{}',
    idempotency_key TEXT UNIQUE,
    status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','running','succeeded','failed','dead','cancelled')),
    attempts INTEGER NOT NULL DEFAULT 0,
    max_attempts INTEGER NOT NULL DEFAULT 5 CHECK (max_attempts BETWEEN 1 AND 25),
    run_at TEXT NOT NULL,
    locked_by TEXT,
    locked_until TEXT,
    last_error TEXT,
    result_json TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    finished_at TEXT
  );
  CREATE INDEX IF NOT EXISTS background_jobs_due ON background_jobs(status, run_at);
  CREATE INDEX IF NOT EXISTS background_jobs_org ON background_jobs(organisation_id, created_at);
  CREATE INDEX IF NOT EXISTS background_jobs_type ON background_jobs(type, status);`);

  const handlers = new Map();
  let timer = null, busy = false;

  function register(type, handler, { maxAttempts = 5, timeoutMs = 60000, baseDelayMs = 30000 } = {}) {
    if (!/^[a-z][a-z0-9_.-]{2,80}$/.test(type)) throw new Error('Invalid job type: ' + type);
    handlers.set(type, { handler, maxAttempts, timeoutMs, baseDelayMs });
  }

  function enqueue(type, payload = {}, { organisationId = null, idempotencyKey = null, runAt = null, maxAttempts = null } = {}) {
    const h = handlers.get(type);
    const now = iso(clock()), id = crypto.randomUUID();
    const row = { id, type, organisation_id: organisationId, payload_json: JSON.stringify(payload ?? {}), idempotency_key: idempotencyKey, max_attempts: Math.min(25, Math.max(1, maxAttempts || h?.maxAttempts || 5)), run_at: runAt || now, created_at: now, updated_at: now };
    const inserted = db.prepare(`INSERT INTO background_jobs (id,type,organisation_id,payload_json,idempotency_key,max_attempts,run_at,created_at,updated_at)
      VALUES (@id,@type,@organisation_id,@payload_json,@idempotency_key,@max_attempts,@run_at,@created_at,@updated_at) ON CONFLICT(idempotency_key) DO NOTHING`).run(row);
    if (!inserted.changes) return { duplicate: true, job: db.prepare('SELECT * FROM background_jobs WHERE idempotency_key=?').get(idempotencyKey) };
    return { duplicate: false, job: db.prepare('SELECT * FROM background_jobs WHERE id=?').get(id) };
  }

  // One job is claimed atomically; a "running" job whose lease ran out (the process died) becomes claimable again.
  function claim() {
    const now = iso(clock());
    const types = [...handlers.keys()];
    if (!types.length) return null;
    const marks = types.map(() => '?').join(',');
    return db.transaction(() => {
      const next = db.prepare(`SELECT id,type FROM background_jobs WHERE type IN (${marks}) AND run_at<=? AND (status IN ('queued','failed') OR (status='running' AND locked_until<?)) ORDER BY run_at, created_at LIMIT 1`).get(...types, now, now);
      if (!next) return null;
      const lease = iso(clock() + (handlers.get(next.type).timeoutMs + 30000));
      db.prepare(`UPDATE background_jobs SET status='running',attempts=attempts+1,locked_by=?,locked_until=?,updated_at=? WHERE id=?`).run(workerId, lease, now, next.id);
      return db.prepare('SELECT * FROM background_jobs WHERE id=?').get(next.id);
    })();
  }

  function withTimeout(promise, ms) {
    let t; return Promise.race([promise, new Promise((_, reject) => { t = setTimeout(() => reject(new Error(`timed out after ${ms} ms`)), ms); })]).finally(() => clearTimeout(t));
  }

  async function runOnce() {
    const job = claim();
    if (!job) return null;
    const h = handlers.get(job.type);
    let payload = {}; try { payload = JSON.parse(job.payload_json); } catch { /* treated as empty */ }
    try {
      const result = await withTimeout(Promise.resolve().then(() => h.handler(payload, { job, organisationId: job.organisation_id })), h.timeoutMs);
      const now = iso(clock());
      db.prepare(`UPDATE background_jobs SET status='succeeded',result_json=?,last_error=NULL,locked_by=NULL,locked_until=NULL,finished_at=?,updated_at=? WHERE id=?`).run(JSON.stringify(result ?? null).slice(0, 4000), now, now, job.id);
      return { id: job.id, status: 'succeeded' };
    } catch (err) {
      const now = clock(), message = String(err?.message || err).slice(0, 500);
      const dead = job.attempts >= job.max_attempts;
      // Exponential back-off with a little jitter, capped at six hours.
      const delay = Math.min(6 * 3600000, h.baseDelayMs * 2 ** (job.attempts - 1)) + Math.floor(Math.random() * 1000);
      db.prepare(`UPDATE background_jobs SET status=?,last_error=?,run_at=?,locked_by=NULL,locked_until=NULL,finished_at=?,updated_at=? WHERE id=?`)
        .run(dead ? 'dead' : 'failed', message, dead ? job.run_at : iso(now + delay), dead ? iso(now) : null, iso(now), job.id);
      (dead ? log.error : log.warn).call(log, `[jobs] ${job.type} ${job.id} ${dead ? 'moved to dead letters' : 'will retry'} after attempt ${job.attempts}/${job.max_attempts}: ${message}`);
      return { id: job.id, status: dead ? 'dead' : 'failed', error: message };
    }
  }

  async function drain(limit = 50) { const out = []; for (let i = 0; i < limit; i++) { const r = await runOnce(); if (!r) break; out.push(r); } return out; }

  function start({ intervalMs = 5000 } = {}) {
    if (timer) return;
    timer = setInterval(async () => { if (busy) return; busy = true; try { await drain(20); } catch (e) { log.error('[jobs] runner error:', e.message); } finally { busy = false; } }, intervalMs);
    timer.unref?.();
  }
  function stop() { clearInterval(timer); timer = null; }

  function retry(id) {
    const r = db.prepare(`UPDATE background_jobs SET status='queued',attempts=0,run_at=?,last_error=NULL,finished_at=NULL,updated_at=? WHERE id=? AND status IN ('dead','failed','cancelled')`).run(iso(clock()), iso(clock()), id);
    return r.changes > 0;
  }
  function cancel(id) {
    const r = db.prepare(`UPDATE background_jobs SET status='cancelled',finished_at=?,updated_at=? WHERE id=? AND status IN ('queued','failed')`).run(iso(clock()), iso(clock()), id);
    return r.changes > 0;
  }
  function stats() {
    const counts = Object.fromEntries(STATUSES.map((s) => [s, 0]));
    for (const r of db.prepare('SELECT status,COUNT(*) n FROM background_jobs GROUP BY status').all()) counts[r.status] = r.n;
    const oldest = db.prepare("SELECT MIN(run_at) at FROM background_jobs WHERE status IN ('queued','failed') AND run_at<=?").get(iso(clock())).at;
    return { counts, oldest_due_seconds: oldest ? Math.max(0, Math.round((clock() - Date.parse(oldest)) / 1000)) : 0, registered: [...handlers.keys()].sort(), worker: workerId };
  }
  function list({ status = null, limit = 100 } = {}) {
    const rows = status && STATUSES.includes(status)
      ? db.prepare('SELECT id,type,organisation_id,status,attempts,max_attempts,run_at,last_error,created_at,finished_at FROM background_jobs WHERE status=? ORDER BY updated_at DESC LIMIT ?').all(status, limit)
      : db.prepare('SELECT id,type,organisation_id,status,attempts,max_attempts,run_at,last_error,created_at,finished_at FROM background_jobs ORDER BY updated_at DESC LIMIT ?').all(limit);
    return rows;
  }
  return { register, enqueue, claim, runOnce, drain, start, stop, retry, cancel, stats, list, types: () => [...handlers.keys()] };
}

// Founder Console routes, behind the platform "operations" permission.
export function installJobRoutes(app, { platform, queue, audit = () => {} }) {
  const guard = (action) => [platform.identity, platform.permit('operations', action)];
  app.get('/api/operator/jobs', ...guard('read'), (req, res) => {
    res.json({ ok: true, stats: queue.stats(), jobs: queue.list({ status: String(req.query.status || '') || null, limit: 100 }) });
  });
  app.post('/api/operator/jobs/:id/retry', ...guard('edit'), (req, res) => {
    if (!queue.retry(req.params.id)) return res.status(409).json({ ok: false, error: 'Only failed, dead or cancelled jobs can be retried.' });
    audit(req, 'jobs.retried', req.params.id); res.json({ ok: true });
  });
  app.post('/api/operator/jobs/:id/cancel', ...guard('edit'), (req, res) => {
    if (!queue.cancel(req.params.id)) return res.status(409).json({ ok: false, error: 'Only queued or failed jobs can be cancelled.' });
    audit(req, 'jobs.cancelled', req.params.id); res.json({ ok: true });
  });
}
