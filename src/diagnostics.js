// Startup sanity checks, non-destructive schema self-healing and the diagnostics report.
// Nothing here drops, rewrites or deletes data. Everything it changes is additive (new columns, indexes, triggers, tables).
import { securityPosture } from './security-policy.js';
import fs from 'node:fs';
import { backupBucket } from './backup-env.js';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { createDb, verifyAuditChain } from './db.js';

const PERSISTENT_ROOT = '/var/data';
const truthy = (v) => /^(1|true|yes|on)$/i.test(String(v ?? '').trim());
const isUnder = (file, root) => { const rel = path.relative(root, file); return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel)); };

/* ------------------------------------------------------------------------------------------------
   1. Storage: can we really write where we are about to keep customer records?
   ------------------------------------------------------------------------------------------------ */

// Create the directory if needed, then prove it is writable by writing and removing a probe file.
export function probeDirectory(dir) {
  const result = { path: dir, exists: false, writable: false, freeBytes: null, totalBytes: null, error: null };
  try {
    fs.mkdirSync(dir, { recursive: true });
    result.exists = true;
    const probe = path.join(dir, `.write-probe-${process.pid}-${crypto.randomBytes(4).toString('hex')}`);
    const fd = fs.openSync(probe, 'wx', 0o600);
    try { fs.writeSync(fd, 'ok'); fs.fsyncSync(fd); } finally { fs.closeSync(fd); fs.unlinkSync(probe); }
    result.writable = true;
    try { const s = fs.statfsSync(dir); result.freeBytes = Number(s.bavail) * Number(s.bsize); result.totalBytes = Number(s.blocks) * Number(s.bsize); } catch { /* statfs is optional */ }
  } catch (error) {
    result.error = error.code || error.message;
  }
  return result;
}

// Decide where the database and uploads live. Replaces the path logic that used to sit at the top of server.js.
// - A configured path wins; otherwise the persistent disk when it is mounted; otherwise ./data for local development.
// - If the chosen folder is not writable the server either stops (REQUIRE_PERSISTENT_DISK=1, used on Render)
//   or falls back to ./data (then os.tmpdir()) and reports itself as degraded so nobody mistakes it for durable storage.
export function prepareStorage({ env = process.env, backendRoot = process.cwd(), persistentRoot = PERSISTENT_ROOT } = {}) {
  const warnings = [];
  const mounted = fs.existsSync(persistentRoot);
  const resolveFrom = (configured, mountedDefault, localDefault) => path.isAbsolute(configured || '')
    ? configured
    : path.resolve(backendRoot, configured || (mounted ? mountedDefault : localDefault));
  const requested = {
    databasePath: resolveFrom(env.DATABASE_PATH, path.join(persistentRoot, 'super-pro.sqlite'), './data/fleet-parlour.sqlite'),
    uploadRoot: resolveFrom(env.UPLOAD_DIR, path.join(persistentRoot, 'uploads'), './data/uploads')
  };
  const requirePersistent = truthy(env.REQUIRE_PERSISTENT_DISK);
  const onRender = truthy(env.RENDER);

  const replicated = Boolean(backupBucket(env) || env.BACKUP_FILE_DIR);
  if (onRender && !mounted && !replicated) warnings.push(`Running on Render but ${persistentRoot} is not mounted. Attach the persistent disk or data will be lost on every deploy.`);
  const dbProbe = probeDirectory(path.dirname(requested.databasePath));
  const uploadProbe = probeDirectory(requested.uploadRoot);
  let databasePath = requested.databasePath, uploadRoot = requested.uploadRoot, fallback = false;

  const broken = [!dbProbe.writable && `database folder ${dbProbe.path} (${dbProbe.error})`, !uploadProbe.writable && `upload folder ${uploadProbe.path} (${uploadProbe.error})`].filter(Boolean);
  if (broken.length || (requirePersistent && onRender && !mounted && !replicated)) {
    const reason = broken.length ? `Cannot write to ${broken.join(' and ')}.` : `${persistentRoot} is not mounted.`;
    if (requirePersistent) throw new Error(`${reason} REQUIRE_PERSISTENT_DISK is on, so the server will not start on non-durable storage. Check the Render disk mount and permissions.`);
    const candidates = [path.resolve(backendRoot, 'data'), path.join(os.tmpdir(), 'super-pro-data')];
    const usable = candidates.find((dir) => probeDirectory(dir).writable);
    if (!usable) throw new Error(`${reason} No fallback folder is writable either.`);
    if (!dbProbe.writable) databasePath = path.join(usable, path.basename(requested.databasePath));
    if (!uploadProbe.writable) uploadRoot = path.join(usable, 'uploads');
    fallback = true;
    warnings.push(`${reason} Falling back to ${usable}. This storage may be erased on restart.`);
  }
  const persistent = (replicated && !fallback) || ([databasePath, uploadRoot].every((p) => isUnder(p, persistentRoot)) && !fallback);
  return { databasePath, uploadRoot, requested, persistent, replicated, fallback, persistentRoot, mounted, probes: { database: dbProbe, uploads: uploadProbe }, warnings };
}

/* ------------------------------------------------------------------------------------------------
   2. Schema drift: compare the live database with what a fresh install would create, then patch additively.
   The reference schema is built once in memory from the real bootstrap code in db.js, so there is no second copy to maintain.
   ------------------------------------------------------------------------------------------------ */

let referenceCache = null;
export function referenceSchema() {
  if (referenceCache) return referenceCache;
  const ref = createDb(':memory:');
  try {
    const objects = ref.prepare(`SELECT type,name,tbl_name,sql FROM sqlite_master WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%'`).all();
    const tables = {};
    for (const t of objects.filter((o) => o.type === 'table' && !/^CREATE VIRTUAL/i.test(o.sql))) {
      tables[t.name] = { sql: t.sql, columns: ref.prepare(`PRAGMA table_info("${t.name}")`).all() };
    }
    referenceCache = { tables, indexes: objects.filter((o) => o.type === 'index'), triggers: objects.filter((o) => o.type === 'trigger') };
  } finally { ref.close(); }
  return referenceCache;
}

const NUMERIC = /INT|REAL|NUM|DEC|FLOA|DOUB|BOOL/i;
function columnDefinition(c) {
  const type = c.type || '';
  let def = c.dflt_value;
  if (def === null && c.notnull) def = NUMERIC.test(type) ? '0' : "''"; // SQLite needs a default to add a NOT NULL column to a table that already has rows.
  return `${type}${c.notnull ? ' NOT NULL' : ''}${def === null ? '' : ` DEFAULT ${def}`}`.trim();
}

// apply=false only reports. apply=true patches inside one transaction; any statement that fails is reported and skipped.
export function checkSchema(db, { apply = false } = {}) {
  const ref = referenceSchema();
  const have = new Set(db.prepare(`SELECT name FROM sqlite_master WHERE type='table'`).all().map((r) => r.name));
  const missing = { tables: [], columns: [], indexes: [], triggers: [] };
  const patched = [], failed = [];
  const attempt = (kind, label, sql) => {
    if (!apply) return;
    try { db.exec(sql); patched.push({ kind, name: label }); } catch (error) { failed.push({ kind, name: label, error: error.message }); }
  };
  const run = () => {
    for (const [name, t] of Object.entries(ref.tables)) {
      if (!have.has(name)) { missing.tables.push(name); attempt('table', name, t.sql); continue; }
      const live = new Set(db.prepare(`PRAGMA table_info("${name}")`).all().map((c) => c.name));
      for (const c of t.columns.filter((col) => !live.has(col.name))) {
        missing.columns.push(`${name}.${c.name}`);
        if (c.pk) { failed.push({ kind: 'column', name: `${name}.${c.name}`, error: 'primary key columns cannot be added in place' }); continue; }
        attempt('column', `${name}.${c.name}`, `ALTER TABLE "${name}" ADD COLUMN "${c.name}" ${columnDefinition(c)}`);
      }
    }
    const liveIdx = new Set(db.prepare(`SELECT name FROM sqlite_master WHERE type='index'`).all().map((r) => r.name));
    for (const i of ref.indexes.filter((x) => !liveIdx.has(x.name))) {
      missing.indexes.push(i.name);
      attempt('index', i.name, i.sql.replace(/^CREATE (UNIQUE )?INDEX (?!IF NOT EXISTS)/i, 'CREATE $1INDEX IF NOT EXISTS '));
    }
    const liveTrg = new Set(db.prepare(`SELECT name FROM sqlite_master WHERE type='trigger'`).all().map((r) => r.name));
    for (const t of ref.triggers.filter((x) => !liveTrg.has(x.name))) {
      missing.triggers.push(t.name);
      attempt('trigger', t.name, t.sql.replace(/^CREATE TRIGGER (?!IF NOT EXISTS)/i, 'CREATE TRIGGER IF NOT EXISTS '));
    }
  };
  if (apply) db.transaction(run)(); else run();
  const total = missing.tables.length + missing.columns.length + missing.indexes.length + missing.triggers.length;
  return { ok: total === 0 || (apply && failed.length === 0), expectedTables: Object.keys(ref.tables).length, missing, patched, failed };
}

/* ------------------------------------------------------------------------------------------------
   3. The diagnostics report (used at startup and by GET /api/saas/health/diagnostics)
   ------------------------------------------------------------------------------------------------ */

const REQUIRED_SECRETS = ['SESSION_SECRET', 'SAAS_SESSION_SECRET', 'ADMIN_SESSION_SECRET', 'ADMIN_API_KEY', 'INTEGRATION_ENCRYPTION_KEY'];
const MIN_FREE_BYTES = 200 * 1024 * 1024;

export function runDiagnostics({ db, env = process.env, storage, startedAt = Date.now() - process.uptime() * 1000, repair = false } = {}) {
  const checks = [];
  const add = (id, status, detail, extra = {}) => checks.push({ id, status, detail, ...extra });
  const production = env.NODE_ENV === 'production';

  // Storage
  if (storage) {
    add('storage.writable', storage.fallback ? 'warn' : 'pass', storage.fallback ? 'Using fallback storage because the configured folder is not writable.' : 'Database and upload folders are writable.');
    add('storage.persistent', storage.persistent ? 'pass' : (production ? 'fail' : 'warn'), storage.persistent ? (storage.replicated ? 'Data is backed up to S3 and restored automatically after a restart.' : `Data is stored on the persistent disk (${storage.persistentRoot}).`) : `Data is not on ${storage.persistentRoot}. It may be erased on restart.`);
    const free = storage.probes?.database?.freeBytes ?? probeDirectory(path.dirname(storage.databasePath)).freeBytes;
    if (free !== null && free !== undefined) add('storage.free_space', free < MIN_FREE_BYTES ? 'warn' : 'pass', `${Math.round(free / 1048576)} MB free.`, { freeBytes: free });
    for (const w of storage.warnings || []) add('storage.warning', 'warn', w);
  }

  // Database
  try {
    const quick = db.pragma('quick_check', { simple: true });
    add('database.integrity', quick === 'ok' ? 'pass' : 'fail', quick === 'ok' ? 'SQLite quick_check passed.' : `quick_check reported: ${quick}`);
    const fkViolations = db.pragma('foreign_key_check').length;
    add('database.foreign_keys', fkViolations ? 'warn' : 'pass', fkViolations ? `${fkViolations} rows reference missing parents.` : 'No foreign key violations.');
    add('database.journal_mode', 'pass', `journal_mode=${db.pragma('journal_mode', { simple: true })}`);
    const schema = checkSchema(db, { apply: repair });
    const driftCount = Object.values(schema.missing).reduce((n, list) => n + list.length, 0);
    const state = schema.failed.length ? 'fail' : driftCount ? (repair ? 'warn' : 'warn') : 'pass';
    add('database.schema', state, driftCount
      ? `${driftCount} schema items were missing${repair ? `; ${schema.patched.length} patched, ${schema.failed.length} could not be patched` : ' (run with repair to patch)'}.`
      : `All ${schema.expectedTables} tables have every expected column, index and trigger.`, { missing: schema.missing, patched: schema.patched, failed: schema.failed });
    const audit = verifyAuditChain(db);
    add('audit.chain', audit.ok ? 'pass' : 'fail', audit.ok ? `${audit.checked} audit rows verified${audit.legacy ? ` (${audit.legacy} written before the rebuild, checked against their original hash formula)` : ''}${audit.truncated ? ', first 100000 only' : ''}.` : `${audit.broken.length} audit rows failed verification.`, { checked: audit.checked, broken: audit.broken });
    const guarded = db.prepare(`SELECT COUNT(*) n FROM sqlite_master WHERE type='trigger' AND name IN ('audit_logs_no_update','audit_logs_no_delete')`).get().n === 2;
    add('audit.append_only', guarded ? 'pass' : 'fail', guarded ? 'Audit log is protected from edits and early deletion.' : 'Audit log protection triggers are missing.');
  } catch (error) {
    add('database.error', 'fail', `Database check failed: ${error.message}`);
  }

  // Configuration (names only, never values)
  const missingSecrets = REQUIRED_SECRETS.filter((k) => String(env[k] || '').trim().length < 16);
  add('config.secrets', missingSecrets.length ? (production ? 'fail' : 'warn') : 'pass', missingSecrets.length ? `Missing or too short: ${missingSecrets.join(', ')}.` : 'All required secrets are set.');
  for (const c of securityPosture(env)) add(c.id, c.status, c.detail);
  const has = (...keys) => keys.some((k) => String(env[k] || '').trim() && !/^(your_|changeme|todo)/i.test(String(env[k]).trim()));
  const integrations = {
    ai: has('GEMINI_API_KEY', 'GOOGLE_AI_API_KEY', 'AI_PROVIDER_API_KEY', 'OPENAI_API_KEY'),
    email_out: has('RESEND_API_KEY', 'SMTP_HOST'),
    email_in_webhook: has('INBOUND_EMAIL_WEBHOOK_SECRET'),
    telnyx: has('TELNYX_API_KEY'),
    whatsapp: has('WHATSAPP_ACCESS_TOKEN') && has('META_APP_SECRET'),
    business_abn: has('BUSINESS_ABN')
  };
  add('config.integrations', 'pass', `${Object.values(integrations).filter(Boolean).length} of ${Object.keys(integrations).length} optional integrations are configured.`, { integrations });
  if (!integrations.email_in_webhook) add('config.inbound_email', 'warn', 'INBOUND_EMAIL_WEBHOOK_SECRET is not set, so inbound email is switched off.');
  add('runtime.node', 'pass', `Node ${process.version}`, { node: process.version });

  const rank = { pass: 0, warn: 1, fail: 2 };
  const worst = checks.reduce((w, c) => Math.max(w, rank[c.status]), 0);
  return {
    status: ['ok', 'degraded', 'fail'][worst], ok: worst < 2,
    generated_at: new Date().toISOString(), uptime_seconds: Math.round((Date.now() - startedAt) / 1000),
    memory_mb: Math.round(process.memoryUsage().rss / 1048576), checks
  };
}

// One call from server.js after the database opens: log a short summary and patch drift.
export function runStartupDiagnostics({ db, env, storage, log = console }) {
  const report = runDiagnostics({ db, env, storage, repair: true });
  for (const c of report.checks.filter((x) => x.status !== 'pass')) (c.status === 'fail' ? log.error : log.warn)(`[DIAGNOSTICS] ${c.status.toUpperCase()} ${c.id}: ${c.detail}`);
  log.log(`[DIAGNOSTICS] startup ${report.status}: ${report.checks.filter((c) => c.status === 'pass').length}/${report.checks.length} checks passed.`);
  return report;
}

// GET /api/saas/health/diagnostics. Platform-level information, so it needs the operator key (x-admin-key), not a tenant login.
export function installDiagnosticsRoute(app, { db, env, storage, requireAdmin, startedAt = Date.now() }) {
  app.get('/api/saas/health/diagnostics', requireAdmin, (req, res) => {
    const report = runDiagnostics({ db, env, storage, startedAt, repair: false });
    res.status(report.ok ? 200 : 503).json(report);
  });
}
