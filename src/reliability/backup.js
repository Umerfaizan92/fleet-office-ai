// Phase 09: scheduled database snapshots, restore verification, configuration backup and backup-bucket checks.
//
// Layers of database protection:
//   1. Litestream (scripts/start.mjs) streams every change to the backup bucket within seconds and keeps 72 hours of
//      history: point-in-time recovery for the last 3 days.
//   2. This module takes a consistent snapshot (SQLite online backup) every day, checks it (integrity_check and the
//      audit hash chain), compresses it, records its SHA-256 and uploads it with server-side encryption next to a
//      manifest. A restore test regularly downloads the latest snapshot, verifies the checksum, opens it and compares
//      it with the live database. Nothing here deletes backups: S3 lifecycle rules (docs/phase-09/BACKUP_AND_RECOVERY.md)
//      expire old copies, so retention is enforced by the bucket, not by code that could be misused.
//   3. Configuration (names and settings, never secret values) is backed up the same way.
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import Database from 'better-sqlite3';
import { backupBucket, backupCredentials } from '../backup-env.js';
import { backupEncryption } from '../s3-files.js';
import { verifyAuditChain } from '../db.js';

const iso = (t = Date.now()) => new Date(t).toISOString();
const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex');
const HOUR = 3600000, DAY = 24 * HOUR;
// Policy (also in BACKUP_AND_RECOVERY.md). Retention is applied by bucket lifecycle rules.
export const BACKUP_POLICY = Object.freeze({
  snapshot_every_hours: 24, restore_test_every_hours: 24 * 7, config_every_hours: 24,
  snapshot_max_age_hours: 26, restore_test_max_age_hours: 24 * 8, litestream_max_lag_minutes: 10,
  rpo: { continuous: '1 minute (Litestream, last 72 hours)', snapshot: '24 hours (daily snapshot, kept 35 days, then monthly for 12 months)' },
  rto: { database: '1 hour', full_service: '4 hours' },
  retention: { litestream_hours: 72, daily_snapshots_days: 35, monthly_snapshots_months: 12, config_days: 90 }
});

// The folder all backup objects share, taken from the Litestream path (default super-pro/db -> super-pro).
export function backupRoot(env = process.env) {
  const db = String(env.BACKUP_S3_DB_PREFIX || 'super-pro/db').replace(/^\/+|\/+$/g, '');
  const parts = db.split('/');
  return parts.length > 1 ? parts.slice(0, -1).join('/') : 'super-pro';
}

export function createBackups({ db, env = process.env, databasePath, clientFactory = null, clock = () => Date.now(), log = console }) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS reliability_backups (id TEXT PRIMARY KEY, kind TEXT NOT NULL CHECK (kind IN ('snapshot','config')), started_at TEXT NOT NULL, finished_at TEXT, status TEXT NOT NULL, target TEXT, key TEXT, bytes INTEGER, sha256 TEXT, tables INTEGER, integrity TEXT, audit_ok INTEGER, error TEXT, trigger TEXT NOT NULL DEFAULT 'schedule');
    CREATE INDEX IF NOT EXISTS reliability_backups_kind ON reliability_backups(kind, started_at);
    CREATE TABLE IF NOT EXISTS reliability_restore_tests (id TEXT PRIMARY KEY, started_at TEXT NOT NULL, finished_at TEXT, status TEXT NOT NULL, backup_key TEXT, seconds REAL, checksum_ok INTEGER, integrity TEXT, audit_ok INTEGER, tables INTEGER, gaps_json TEXT, error TEXT, trigger TEXT NOT NULL DEFAULT 'schedule');`);
  const now = () => iso(clock());
  const bucket = () => backupBucket(env);
  // Backups live next to the Litestream copy: with BACKUP_S3_DB_PREFIX=super-pro-v2/db, snapshots default to
  // super-pro-v2/snapshots, so one IAM grant on the root covers everything. Explicit prefixes still win.
  const root = () => backupRoot(env);
  const prefix = (k) => String(env[`BACKUP_S3_${k.toUpperCase()}_PREFIX`] || `${root()}/${k}`).replace(/^\/+|\/+$/g, '');
  const localDir = () => String(env.BACKUP_SNAPSHOT_DIR || '').trim();
  const target = () => (bucket() ? `s3://${bucket()}` : localDir() ? `file://${localDir()}` : null);

  let client = null;
  async function s3() {
    if (client) return client;
    if (clientFactory) return (client = await clientFactory());
    const { S3Client } = await import('@aws-sdk/client-s3');
    client = new S3Client({ region: env.AWS_REGION || env.AWS_DEFAULT_REGION || env.BACKUP_S3_REGION || 'us-east-1', ...(env.BACKUP_S3_ENDPOINT ? { endpoint: env.BACKUP_S3_ENDPOINT, forcePathStyle: true } : {}), requestChecksumCalculation: 'WHEN_REQUIRED', responseChecksumValidation: 'WHEN_REQUIRED', maxAttempts: 3 });
    return client;
  }
  // A failed client is dropped so the next call builds a fresh connection (recoverable connection failures).
  const resetClient = () => { client = null; };
  async function put(key, body, contentType) {
    if (bucket()) {
      const { PutObjectCommand } = await import('@aws-sdk/client-s3');
      try { await (await s3()).send(new PutObjectCommand({ Bucket: bucket(), Key: key, Body: body, ContentType: contentType, ...backupEncryption(env) })); }
      catch (e) { resetClient(); throw e; }
      return `s3://${bucket()}/${key}`;
    }
    const file = path.join(localDir(), key); fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, body); return `file://${file}`;
  }
  async function get(key) {
    if (bucket()) {
      const { GetObjectCommand } = await import('@aws-sdk/client-s3');
      try { const r = await (await s3()).send(new GetObjectCommand({ Bucket: bucket(), Key: key })); return Buffer.from(await r.Body.transformToByteArray()); }
      catch (e) { resetClient(); throw e; }
    }
    return fs.readFileSync(path.join(localDir(), key));
  }
  async function list(pre) {
    if (bucket()) {
      const { ListObjectsV2Command } = await import('@aws-sdk/client-s3');
      const out = []; let token;
      do { const p = await (await s3()).send(new ListObjectsV2Command({ Bucket: bucket(), Prefix: pre + '/', ContinuationToken: token })); for (const o of p.Contents || []) out.push({ key: o.Key, size: o.Size, modified: o.LastModified ? new Date(o.LastModified).toISOString() : null }); token = p.IsTruncated ? p.NextContinuationToken : undefined; } while (token && out.length < 20000);
      return out;
    }
    const base = path.join(localDir(), pre), out = [];
    const walk = (d) => { let e = []; try { e = fs.readdirSync(d, { withFileTypes: true }); } catch { return; } for (const x of e) { const f = path.join(d, x.name); if (x.isDirectory()) walk(f); else { const st = fs.statSync(f); out.push({ key: path.relative(localDir(), f).split(path.sep).join('/'), size: st.size, modified: st.mtime.toISOString() }); } } };
    walk(base); return out;
  }

  // ---------------- snapshot ----------------
  let running = false;
  async function snapshot({ trigger = 'schedule' } = {}) {
    if (!target()) return { ok: false, status: 'not_configured', error: 'No backup bucket (BACKUP_S3_BUCKET) or snapshot folder (BACKUP_SNAPSHOT_DIR) is set.' };
    if (running) return { ok: false, status: 'busy', error: 'A backup is already running.' };
    running = true;
    const id = crypto.randomUUID(), started = now(), t0 = clock();
    db.prepare("INSERT INTO reliability_backups (id,kind,started_at,status,target,trigger) VALUES (?, 'snapshot', ?, 'running', ?, ?)").run(id, started, target(), trigger);
    const work = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-snap-'));
    try {
      const file = path.join(work, 'snapshot.sqlite');
      await db.backup(file); // SQLite online backup: a consistent copy while the app keeps running
      const copy = new Database(file, { readonly: true });
      const integrity = copy.pragma('integrity_check', { simple: true });
      const audit = verifyAuditChain(copy);
      const tables = copy.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all().map((r) => r.name);
      const counts = Object.fromEntries(tables.map((t) => { try { return [t, copy.prepare(`SELECT COUNT(*) n FROM "${t}"`).get().n]; } catch { return [t, null]; } }));
      copy.close();
      if (integrity !== 'ok') throw new Error('The snapshot failed SQLite integrity_check: ' + String(integrity).slice(0, 200));
      const raw = fs.readFileSync(file), gz = zlib.gzipSync(raw, { level: 6 }), hash = sha256(gz), d = new Date(started);
      const key = `${prefix('snapshots')}/${d.getUTCFullYear()}/${String(d.getUTCMonth() + 1).padStart(2, '0')}/${String(d.getUTCDate()).padStart(2, '0')}/${started.replace(/[:.]/g, '-')}.sqlite.gz`;
      const manifest = { format: 1, kind: 'sqlite-snapshot', created_at: started, key, sha256: hash, bytes: gz.length, raw_bytes: raw.length, sqlite_integrity: integrity, audit_chain: { ok: audit.ok, checked: audit.checked }, tables: counts, app_commit: env.RENDER_GIT_COMMIT || null, encryption: backupEncryption(env).ServerSideEncryption || (bucket() ? 'none' : 'local-file') };
      const where = await put(key, gz, 'application/gzip');
      await put(key.replace(/\.sqlite\.gz$/, '.manifest.json'), Buffer.from(JSON.stringify(manifest, null, 2)), 'application/json');
      db.prepare("UPDATE reliability_backups SET status='ok',finished_at=?,key=?,bytes=?,sha256=?,tables=?,integrity=?,audit_ok=? WHERE id=?").run(now(), key, gz.length, hash, tables.length, integrity, audit.ok ? 1 : 0, id);
      log.log?.(`[backup] snapshot saved to ${where} (${Math.round(gz.length / 1024)} KB, ${((clock() - t0) / 1000).toFixed(1)}s)`);
      return { ok: true, id, key, bytes: gz.length, sha256: hash, tables: tables.length, audit_ok: audit.ok, where };
    } catch (e) {
      db.prepare("UPDATE reliability_backups SET status='failed',finished_at=?,error=? WHERE id=?").run(now(), String(e.message).slice(0, 500), id);
      log.error?.('[backup] snapshot failed:', e.message);
      return { ok: false, id, status: 'failed', error: e.message };
    } finally { running = false; fs.rmSync(work, { recursive: true, force: true }); }
  }

  // ---------------- restore verification (never touches the live database) ----------------
  async function latestSnapshotKey() {
    const ok = db.prepare("SELECT key FROM reliability_backups WHERE kind='snapshot' AND status='ok' ORDER BY started_at DESC LIMIT 1").get();
    if (ok) return ok.key;
    const all = (await list(prefix('snapshots'))).filter((o) => o.key.endsWith('.sqlite.gz')).sort((a, b) => a.key.localeCompare(b.key));
    return all.at(-1)?.key || null;
  }
  async function verify({ key = null, trigger = 'schedule' } = {}) {
    if (!target()) return { ok: false, status: 'not_configured', error: 'No backup target is configured.' };
    const id = crypto.randomUUID(), t0 = clock();
    db.prepare("INSERT INTO reliability_restore_tests (id,started_at,status,trigger) VALUES (?,?,'running',?)").run(id, now(), trigger);
    const work = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-verify-'));
    const fail = (msg, extra = {}) => { db.prepare("UPDATE reliability_restore_tests SET status='failed',finished_at=?,error=?,seconds=?,backup_key=COALESCE(?,backup_key),checksum_ok=?,integrity=?,audit_ok=? WHERE id=?").run(now(), String(msg).slice(0, 500), (clock() - t0) / 1000, extra.key || null, extra.checksum_ok ?? null, extra.integrity ?? null, extra.audit_ok ?? null, id); return { ok: false, id, status: 'failed', error: msg, ...extra }; };
    try {
      key ||= await latestSnapshotKey();
      if (!key) return fail('No snapshot found to test. Run a backup first.');
      if (!key.startsWith(prefix('snapshots') + '/') || key.includes('..')) return fail('That is not a snapshot key.');
      const manifest = JSON.parse((await get(key.replace(/\.sqlite\.gz$/, '.manifest.json'))).toString('utf8'));
      const gz = await get(key);
      const checksum_ok = sha256(gz) === manifest.sha256;
      if (!checksum_ok) return fail('The downloaded snapshot does not match its recorded SHA-256. It may be damaged or altered.', { key, checksum_ok: 0 });
      const file = path.join(work, 'restored.sqlite'); fs.writeFileSync(file, zlib.gunzipSync(gz));
      const r = new Database(file, { readonly: true });
      const integrity = r.pragma('integrity_check', { simple: true }), audit = verifyAuditChain(r);
      const tables = r.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all().map((x) => x.name);
      const gaps = [];
      for (const t of tables) {
        let a = null, b = null; try { b = r.prepare(`SELECT COUNT(*) n FROM "${t}"`).get().n; } catch { /* skip */ }
        try { a = db.prepare(`SELECT COUNT(*) n FROM "${t}"`).get().n; } catch { /* table gone from live */ }
        const expected = manifest.tables?.[t];
        if (expected !== undefined && expected !== null && b !== expected) gaps.push({ table: t, problem: `snapshot has ${b} rows, manifest says ${expected}` });
        // Live data grows after the snapshot; far fewer rows live than in the snapshot points at data loss since.
        if (a !== null && b !== null && a < b * 0.5 && b > 20) gaps.push({ table: t, problem: `live has ${a} rows, snapshot had ${b}` });
      }
      r.close();
      const ok = integrity === 'ok' && audit.ok && !gaps.length;
      db.prepare(`UPDATE reliability_restore_tests SET status=?,finished_at=?,backup_key=?,seconds=?,checksum_ok=1,integrity=?,audit_ok=?,tables=?,gaps_json=?,error=? WHERE id=?`).run(ok ? 'passed' : 'failed', now(), key, (clock() - t0) / 1000, integrity, audit.ok ? 1 : 0, tables.length, JSON.stringify(gaps), ok ? null : (integrity !== 'ok' ? 'integrity_check failed' : !audit.ok ? 'audit chain broken' : 'row counts differ'), id);
      return { ok, id, key, checksum_ok: true, integrity, audit_ok: audit.ok, tables: tables.length, gaps, seconds: (clock() - t0) / 1000 };
    } catch (e) { resetClient(); return fail(e.message); } finally { fs.rmSync(work, { recursive: true, force: true }); }
  }

  // ---------------- configuration backup (no secret values, ever) ----------------
  const SECRETISH = /(KEY|SECRET|TOKEN|PASS|PASSWORD|PRIVATE|CREDENTIAL|DSN|WEBHOOK_ID|GUID|SALT|CERT)/i;
  function configSnapshot() {
    const envNames = Object.keys(env).filter((k) => /^[A-Z][A-Z0-9_]+$/.test(k) && !/^(npm_|PATH$|HOME$|PWD$|SHLVL$|HOSTNAME$|TERM)/.test(k)).sort();
    const settings = Object.fromEntries(envNames.map((k) => [k, SECRETISH.test(k) ? (String(env[k] || '').trim() ? '[set]' : '[empty]') : String(env[k] ?? '').slice(0, 200)]));
    const q = (sql) => { try { return db.prepare(sql).all(); } catch { return null; } };
    return {
      format: 1, created_at: now(), app_commit: env.RENDER_GIT_COMMIT || null, node: process.version,
      environment: settings, note: 'Secret values are never included; only whether each one is set.',
      plans: q('SELECT id,name,monthly_fee_cents,setup_fee_cents,currency,active,limits_json FROM subscription_plans'),
      plan_price_history: q('SELECT * FROM plan_price_history'),
      automation_workflows: q("SELECT w.id,w.scope,w.organisation_id,w.name,w.status,w.current_version,v.definition_json FROM automation_workflows w LEFT JOIN automation_workflow_versions v ON v.workflow_id=w.id AND v.version=w.current_version WHERE w.scope='platform'"),
      automation_rules: q('SELECT organisation_id,rule_key,enabled FROM automation_rules'),
      platform_pay_order: q("SELECT provider,enabled,position FROM platform_pay_providers")
    };
  }
  async function configBackup({ trigger = 'schedule' } = {}) {
    if (!target()) return { ok: false, status: 'not_configured', error: 'No backup target is configured.' };
    const id = crypto.randomUUID(), started = now();
    db.prepare("INSERT INTO reliability_backups (id,kind,started_at,status,target,trigger) VALUES (?,'config',?,'running',?,?)").run(id, started, target(), trigger);
    try {
      const body = Buffer.from(JSON.stringify(configSnapshot(), null, 2));
      const key = `${prefix('config')}/${started.slice(0, 10)}/${started.replace(/[:.]/g, '-')}.json`;
      await put(key, body, 'application/json');
      db.prepare("UPDATE reliability_backups SET status='ok',finished_at=?,key=?,bytes=?,sha256=? WHERE id=?").run(now(), key, body.length, sha256(body), id);
      return { ok: true, id, key, bytes: body.length };
    } catch (e) { db.prepare("UPDATE reliability_backups SET status='failed',finished_at=?,error=? WHERE id=?").run(now(), String(e.message).slice(0, 500), id); return { ok: false, id, error: e.message }; }
  }

  // ---------------- bucket checks ----------------
  async function storageChecks() {
    const out = { target: target(), bucket: bucket() || null, checks: [] };
    const add = (name, status, detail) => out.checks.push({ name, status, detail });
    if (!target()) { add('Backup target', 'fail', 'No backup bucket is set. Set BACKUP_S3_BUCKET (and AWS keys) in Render.'); return out; }
    if (!bucket()) { add('Off-site copy', 'warn', `Snapshots go to a local folder (${localDir()}) only. Set BACKUP_S3_BUCKET for an off-site copy.`); return out; }
    const primary = String(env.OBJECT_STORAGE_BUCKET || '').trim();
    add('Separate backup bucket', primary && primary === bucket() ? 'fail' : 'ok', primary ? (primary === bucket() ? 'The backup bucket is the same as primary file storage. Use a separate bucket.' : `Backups (${bucket()}) are separate from primary storage (${primary}).`) : 'Primary files are on the server disk; backups are in their own bucket.');
    const creds = backupCredentials(env);
    if (!creds.id || !creds.secret) { add('AWS keys', 'fail', 'AWS access keys for the backup bucket were not found.'); return out; }
    const S = await import('@aws-sdk/client-s3');
    const call = async (name, cmd, judge) => { try { const r = await (await s3()).send(cmd); const [status, detail] = judge(r); add(name, status, detail); } catch (e) { const code = e.name || e.Code || 'Error'; if (/NoSuch(Lifecycle|ServerSideEncryption|BucketPolicy)|ServerSideEncryptionConfigurationNotFound/i.test(code)) { const [status, detail] = judge(null); add(name, status, detail); } else if (/AccessDenied/i.test(code)) add(name, 'warn', `Cannot check (${code}). Apply infra/aws/backup-iam-policy.json to the backup keys, or check it in the AWS console.`); else { resetClient(); add(name, 'fail', `${code}: ${String(e.message).slice(0, 160)}`); } } };
    // A prefix-scoped list works with the least-privilege policy in infra/aws/backup-iam-policy.json (HeadBucket would not).
    await call('Bucket reachable', new S.ListObjectsV2Command({ Bucket: bucket(), Prefix: `${root()}/`, MaxKeys: 1 }), () => ['ok', `Reached s3://${bucket()}.`]);
    if (out.checks.at(-1).status === 'fail') return out;
    await call('Versioning', new S.GetBucketVersioningCommand({ Bucket: bucket() }), (r) => (r?.Status === 'Enabled' ? ['ok', 'Bucket versioning is on, so overwritten or deleted backups can be recovered.'] : ['fail', `Bucket versioning is ${r?.Status || 'off'}. Turn it on (S3 > bucket > Properties > Bucket Versioning).`]));
    await call('Encryption', new S.GetBucketEncryptionCommand({ Bucket: bucket() }), (r) => { const rule = r?.ServerSideEncryptionConfiguration?.Rules?.[0]?.ApplyServerSideEncryptionByDefault; return rule ? ['ok', `Default encryption ${rule.SSEAlgorithm}${rule.KMSMasterKeyID ? ' with a KMS key' : ''}. Every backup is also uploaded with ${backupEncryption(env).ServerSideEncryption || 'no'} encryption.`] : ['warn', 'No default bucket encryption is set; Super Pro still encrypts each backup it uploads.']; });
    await call('Retention rules', new S.GetBucketLifecycleConfigurationCommand({ Bucket: bucket() }), (r) => { const rules = (r?.Rules || []).filter((x) => x.Status === 'Enabled'); const snap = rules.some((x) => String(x.Filter?.Prefix ?? x.Prefix ?? '').startsWith(prefix('snapshots')) || String(x.Filter?.Prefix ?? x.Prefix ?? '') === ''); return snap ? ['ok', `${rules.length} lifecycle rule(s) enabled, covering snapshots.`] : ['warn', 'No lifecycle rule expires old snapshots. Add the rules in BACKUP_AND_RECOVERY.md so storage does not grow forever.']; });
    await call('Public access blocked', new S.GetPublicAccessBlockCommand({ Bucket: bucket() }), (r) => { const c = r?.PublicAccessBlockConfiguration; return c && c.BlockPublicAcls && c.BlockPublicPolicy && c.IgnorePublicAcls && c.RestrictPublicBuckets ? ['ok', 'All public access is blocked.'] : ['fail', 'Public access is not fully blocked on the backup bucket. Turn on "Block all public access".']; });
    // Litestream: the newest object under the database prefix shows whether continuous replication is running.
    try { const objs = await list(String(env.BACKUP_S3_DB_PREFIX || 'super-pro/db')); const last = objs.map((o) => o.modified).filter(Boolean).sort().at(-1); const lag = last ? (clock() - Date.parse(last)) / 60000 : null; add('Continuous replication (Litestream)', last && lag <= BACKUP_POLICY.litestream_max_lag_minutes ? 'ok' : env.SUPER_PRO_LITESTREAM === '1' ? 'warn' : 'fail', last ? `Last change copied ${Math.round(lag)} minute(s) ago.` : 'No Litestream copy found in the bucket.'); }
    catch (e) { add('Continuous replication (Litestream)', 'fail', e.message); }
    return out;
  }

  async function inventory() {
    if (!target()) return { snapshots: [], configs: [] };
    try {
      const snaps = (await list(prefix('snapshots'))).filter((o) => o.key.endsWith('.sqlite.gz')).sort((a, b) => b.key.localeCompare(a.key));
      const configs = (await list(prefix('config'))).sort((a, b) => b.key.localeCompare(a.key));
      const days = new Set(snaps.map((s) => s.key.split('/').slice(-4, -1).join('-')));
      const last7 = Array.from({ length: 7 }, (_, i) => iso(clock() - i * DAY).slice(0, 10));
      return { snapshots: snaps.slice(0, 60), snapshot_count: snaps.length, configs: configs.slice(0, 20), days_with_snapshot_last_7: last7.filter((d) => days.has(d)).length, oldest: snaps.at(-1)?.key || null };
    } catch (e) { resetClient(); return { error: e.message, snapshots: [], configs: [] }; }
  }

  function status() {
    const last = (kind, st = null) => db.prepare(`SELECT * FROM reliability_backups WHERE kind=?${st ? ' AND status=?' : ''} ORDER BY started_at DESC LIMIT 1`).get(...[kind, st].filter(Boolean)) || null;
    const lastTest = db.prepare('SELECT * FROM reliability_restore_tests ORDER BY started_at DESC LIMIT 1').get() || null;
    const lastPass = db.prepare("SELECT * FROM reliability_restore_tests WHERE status='passed' ORDER BY started_at DESC LIMIT 1").get() || null;
    const okSnap = last('snapshot', 'ok'), age = okSnap ? (clock() - Date.parse(okSnap.started_at)) / HOUR : null;
    return { target: target(), configured: Boolean(target()), offsite: Boolean(bucket()), litestream: env.SUPER_PRO_LITESTREAM === '1', last_snapshot: last('snapshot'), last_good_snapshot: okSnap, snapshot_age_hours: age, last_config: last('config'), last_restore_test: lastTest, last_passed_restore_test: lastPass, restore_test_age_hours: lastPass ? (clock() - Date.parse(lastPass.started_at)) / HOUR : null, history: db.prepare('SELECT id,kind,started_at,finished_at,status,key,bytes,tables,integrity,audit_ok,error,trigger FROM reliability_backups ORDER BY started_at DESC LIMIT 30').all(), tests: db.prepare('SELECT * FROM reliability_restore_tests ORDER BY started_at DESC LIMIT 20').all(), policy: BACKUP_POLICY };
  }

  return { snapshot, verify, configBackup, configSnapshot, storageChecks, inventory, status, latestSnapshotKey, get, resetClient, policy: BACKUP_POLICY };
}
