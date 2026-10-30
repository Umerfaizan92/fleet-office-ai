// Request IDs, structured request logs, a readiness check and a founder-only system view.
// Logs never contain query strings, bodies, cookies or header values other than the request ID.
import crypto from 'node:crypto';
import fs from 'node:fs';
import { securityPosture } from './security-policy.js';

const REQUEST_ID = /^[A-Za-z0-9._-]{8,64}$/;
// Long identifiers in paths are replaced so logs show the route, not customer or record IDs.
export const routeShape = (p) => String(p || '').split('?')[0]
  .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, ':id')
  .replace(/\/[A-Za-z0-9_-]{20,}(?=\/|$)/g, '/:token')
  .replace(/\/\d{3,}(?=\/|$)/g, '/:n');

export function requestContext({ env = process.env, write = (line) => process.stdout.write(line + '\n') } = {}) {
  const json = /^json$/i.test(String(env.LOG_FORMAT || ''));
  return (req, res, next) => {
    const incoming = String(req.get('x-request-id') || '');
    req.id = REQUEST_ID.test(incoming) ? incoming : crypto.randomUUID();
    res.setHeader('X-Request-Id', req.id);
    const started = process.hrtime.bigint();
    res.on('finish', () => {
      const ms = Number(process.hrtime.bigint() - started) / 1e6;
      const entry = { t: new Date().toISOString(), level: res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info', msg: 'request', id: req.id, method: req.method, route: routeShape(req.originalUrl), status: res.statusCode, ms: Math.round(ms) };
      if (json && /^\/(api|healthz|readyz)/.test(req.originalUrl || '')) write(JSON.stringify(entry));
      else if (res.statusCode >= 500) write(`[request] ${entry.status} ${entry.method} ${entry.route} id=${entry.id} ${entry.ms}ms`);
    });
    next();
  };
}

export function installObservabilityRoutes(app, { db, queue, platform, storage, databasePath, env = process.env, startedAt = Date.now() }) {
  // Readiness for load balancers and the post-deploy check: database answers and background jobs are not stuck.
  app.get('/readyz', (req, res) => {
    let database = false;
    try { database = db.prepare('SELECT 1 ok').get().ok === 1; } catch { database = false; }
    const jobs = queue.stats();
    const jobsHealthy = jobs.oldest_due_seconds < 900;
    res.set('cache-control', 'no-store').status(database && jobsHealthy ? 200 : 503).json({ ok: database && jobsHealthy, database, jobs: jobsHealthy });
  });
  app.get('/api/operator/system', platform.identity, platform.permit('operations', 'read'), (req, res) => {
    let dbBytes = null; try { dbBytes = fs.statSync(databasePath).size; } catch { /* unknown */ }
    const mem = process.memoryUsage();
    res.json({
      ok: true,
      uptime_seconds: Math.round((Date.now() - startedAt) / 1000),
      node: process.version,
      memory_mb: { rss: Math.round(mem.rss / 1048576), heap_used: Math.round(mem.heapUsed / 1048576) },
      database_mb: dbBytes === null ? null : Math.round(dbBytes / 104857.6) / 10,
      jobs: queue.stats(),
      storage: { primary_mode: storage.config.mode, primary_ready: storage.config.ready, problems: storage.config.problems },
      security: securityPosture(env),
      log_format: /^json$/i.test(String(env.LOG_FORMAT || '')) ? 'json' : 'text'
    });
  });
}
