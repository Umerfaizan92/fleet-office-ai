// Phase 09: backups, restore verification, configuration backup, bucket checks, monitoring and alerts, bounded
// self-healing, approval-only recovery actions and the restore script. AWS S3 is replaced by a local stand-in that
// speaks the S3 REST protocol, because the test machine cannot reach AWS.
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import zlib from 'node:zlib';
import { spawn } from 'node:child_process';
import Database from 'better-sqlite3';
import { startServer } from './test-server.mjs';
import { seedOwner } from './visual/session.mjs';
import { createJobQueue } from '../src/job-queue.js';
import { createHealer, HEAL_POLICY } from '../src/reliability/heal.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function mockS3() {
  const objects = new Map(), puts = [];
  const cfg = { versioning: 'Enabled', encryption: true, lifecycle: true, publicBlock: true };
  const xml = (res, body, status = 200) => { res.writeHead(status, { 'content-type': 'application/xml' }); res.end(`<?xml version="1.0" encoding="UTF-8"?>${body}`); };
  const server = http.createServer((req, res) => {
    const chunks = []; req.on('data', (c) => chunks.push(c)); req.on('end', () => {
      const u = new URL(req.url, 'http://x'), [, bucket, ...rest] = decodeURIComponent(u.pathname).split('/'), key = rest.join('/');
      const q = u.searchParams;
      if (req.method === 'HEAD' && !key) { res.writeHead(200); return res.end(); }
      if (req.method === 'GET' && !key) {
        if (q.has('versioning')) return xml(res, `<VersioningConfiguration xmlns="http://s3.amazonaws.com/doc/2006-03-01/">${cfg.versioning ? `<Status>${cfg.versioning}</Status>` : ''}</VersioningConfiguration>`);
        if (q.has('encryption')) return cfg.encryption ? xml(res, '<ServerSideEncryptionConfiguration><Rule><ApplyServerSideEncryptionByDefault><SSEAlgorithm>AES256</SSEAlgorithm></ApplyServerSideEncryptionByDefault></Rule></ServerSideEncryptionConfiguration>') : xml(res, '<Error><Code>ServerSideEncryptionConfigurationNotFoundError</Code><Message>none</Message></Error>', 404);
        if (q.has('lifecycle')) return cfg.lifecycle ? xml(res, '<LifecycleConfiguration><Rule><ID>snapshots</ID><Filter><Prefix>super-pro/snapshots/</Prefix></Filter><Status>Enabled</Status><Expiration><Days>35</Days></Expiration></Rule></LifecycleConfiguration>') : xml(res, '<Error><Code>NoSuchLifecycleConfiguration</Code><Message>none</Message></Error>', 404);
        if (q.has('publicAccessBlock')) return xml(res, `<PublicAccessBlockConfiguration><BlockPublicAcls>${cfg.publicBlock}</BlockPublicAcls><IgnorePublicAcls>${cfg.publicBlock}</IgnorePublicAcls><BlockPublicPolicy>${cfg.publicBlock}</BlockPublicPolicy><RestrictPublicBuckets>${cfg.publicBlock}</RestrictPublicBuckets></PublicAccessBlockConfiguration>`);
        const prefix = q.get('prefix') || '';
        const items = [...objects.entries()].filter(([k]) => k.startsWith(`${bucket}/${prefix}`)).map(([k, v]) => `<Contents><Key>${k.slice(bucket.length + 1)}</Key><Size>${v.body.length}</Size><LastModified>${v.at}</LastModified></Contents>`).join('');
        return xml(res, `<ListBucketResult><Name>${bucket}</Name><Prefix>${prefix}</Prefix><IsTruncated>false</IsTruncated>${items}</ListBucketResult>`);
      }
      if (req.method === 'PUT') { const body = Buffer.concat(chunks); objects.set(`${bucket}/${key}`, { body, at: new Date().toISOString(), sse: req.headers['x-amz-server-side-encryption'] || null }); puts.push({ key, sse: req.headers['x-amz-server-side-encryption'] || null }); res.writeHead(200, { etag: '"' + crypto.createHash('md5').update(body).digest('hex') + '"' }); return res.end(); }
      if (req.method === 'GET') { const o = objects.get(`${bucket}/${key}`); if (!o) return xml(res, '<Error><Code>NoSuchKey</Code><Message>missing</Message></Error>', 404); res.writeHead(200, { 'content-type': 'application/octet-stream', 'content-length': o.body.length }); return res.end(o.body); }
      res.writeHead(400); res.end();
    });
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  return { endpoint: `http://127.0.0.1:${server.address().port}`, objects, puts, cfg, close: () => new Promise((r) => server.close(r)) };
}
async function setup(extra = {}) {
  const s3 = await mockS3();
  const s = await startServer({ BACKUP_S3_BUCKET: 'sp-backups', BACKUP_S3_ENDPOINT: s3.endpoint, AWS_ACCESS_KEY_ID: 'test-access-id', AWS_SECRET_ACCESS_KEY: 'test-secret-value-not-real', AWS_REGION: 'ap-southeast-2', BACKUP_S3_SSE: 'AES256', RESEND_API_KEY: 'mock-resend-value', ...extra });
  const F = (m, u, b) => s.call(m, u, { headers: { 'x-admin-key': s.adminKey }, body: b });
  const sql = (q, ...a) => { const d = new Database(s.dbPath); try { return /^\s*select/i.test(q) ? d.prepare(q).all(...a) : d.prepare(q).run(...a); } finally { d.close(); } };
  return { s, s3, F, sql, stop: async () => { await s.stop(); await s3.close(); } };
}

test('backups: encrypted snapshot with manifest, restore verification, tamper detection, config backup without secrets, bucket checks', async (t) => {
  const { s, s3, F, sql, stop } = await setup(); t.after(stop);
  await seedOwner(s, { business: 'Harbour Plumbing Pty Ltd' });
  let r = await F('POST', '/api/operator/reliability/backups/snapshot'); assert.equal(r.status, 201, r.text);
  const key = r.json.key; assert.match(key, /^super-pro\/snapshots\/\d{4}\/\d{2}\/\d{2}\/.+\.sqlite\.gz$/);
  const snap = s3.objects.get('sp-backups/' + key), man = s3.objects.get('sp-backups/' + key.replace('.sqlite.gz', '.manifest.json'));
  assert.ok(snap && man, 'snapshot and manifest uploaded');
  assert.equal(snap.sse, 'AES256', 'uploaded with server-side encryption');
  const manifest = JSON.parse(man.body.toString());
  assert.equal(manifest.sha256, crypto.createHash('sha256').update(snap.body).digest('hex')); assert.equal(manifest.sqlite_integrity, 'ok'); assert.equal(manifest.audit_chain.ok, true);
  const tmpFile = path.join(s.temp, 'check.sqlite'); fs.writeFileSync(tmpFile, zlib.gunzipSync(snap.body)); const restored = new Database(tmpFile, { readonly: true }); assert.ok(restored.prepare('SELECT COUNT(*) n FROM organisations').get().n >= 1); restored.close();
  r = await F('POST', '/api/operator/reliability/backups/verify', {}); assert.equal(r.status, 200, r.text);
  assert.equal(r.json.ok, true); assert.equal(r.json.checksum_ok, true); assert.equal(r.json.integrity, 'ok');
  // Tampering with the stored copy is detected.
  snap.body = Buffer.concat([snap.body.subarray(0, snap.body.length - 4), Buffer.from('oops')]);
  r = await F('POST', '/api/operator/reliability/backups/verify', { key }); assert.equal(r.status, 409); assert.match(r.json.error, /SHA-256/);
  r = await F('POST', '/api/operator/reliability/backups/verify', { key: '../etc/passwd' }); assert.equal(r.status, 409); assert.match(r.json.error, /not a snapshot/);
  // Configuration backup: setting names and safe values only.
  r = await F('POST', '/api/operator/reliability/backups/config'); assert.equal(r.status, 201, r.text);
  const cfg = s3.objects.get('sp-backups/' + r.json.key).body.toString();
  assert.match(cfg, /"RESEND_API_KEY": "\[set\]"/); assert.match(cfg, /"AWS_SECRET_ACCESS_KEY": "\[set\]"/);
  for (const secret of ['mock-resend-value', 'test-secret-value-not-real', s.adminKey]) assert.ok(!cfg.includes(secret), 'no secret value in the configuration backup');
  assert.match(cfg, /"plans"/);
  // Bucket checks.
  r = await F('GET', '/api/operator/reliability/storage'); assert.equal(r.status, 200, r.text);
  const by = Object.fromEntries(r.json.checks.map((c) => [c.name, c.status]));
  assert.equal(by['Bucket reachable'], 'ok'); assert.equal(by.Versioning, 'ok'); assert.equal(by.Encryption, 'ok'); assert.equal(by['Retention rules'], 'ok'); assert.equal(by['Public access blocked'], 'ok'); assert.equal(by['Separate backup bucket'], 'ok');
  assert.equal(by['Continuous replication (Litestream)'], 'fail', 'no Litestream copy in the bucket in tests');
  assert.ok(r.json.inventory.snapshot_count >= 1); assert.equal(r.json.inventory.days_with_snapshot_last_7, 1);
  s3.cfg.versioning = 'Suspended'; s3.cfg.lifecycle = false; s3.cfg.publicBlock = false;
  r = await F('GET', '/api/operator/reliability/storage');
  const by2 = Object.fromEntries(r.json.checks.map((c) => [c.name, c.status]));
  assert.equal(by2.Versioning, 'fail'); assert.equal(by2['Retention rules'], 'warn'); assert.equal(by2['Public access blocked'], 'fail');
  // History is recorded; nothing in the code deletes backups.
  const hist = sql("SELECT kind,status FROM reliability_backups ORDER BY started_at");
  assert.deepEqual(hist.map((h) => `${h.kind}:${h.status}`), ['snapshot:ok', 'config:ok']);
  assert.equal(sql("SELECT COUNT(*) n FROM reliability_restore_tests WHERE status='passed'")[0].n, 1);
  assert.equal(sql("SELECT COUNT(*) n FROM reliability_restore_tests WHERE status='failed'")[0].n, 2);
});

test('monitoring: all components checked, failures open alerts, recovery closes them, acknowledgement, daily summary and readiness, access', async (t) => {
  const { s, F, sql, stop } = await setup(); t.after(stop);
  const owner = await seedOwner(s, { business: 'Harbour Plumbing Pty Ltd' });
  assert.notEqual((await s.call('GET', '/api/operator/reliability', { cookie: owner.cookie })).status, 200, 'a business cannot see platform reliability');
  // A refused payment webhook (bad signature) is counted.
  for (let i = 0; i < 6; i++) await fetch(`${s.base}/api/webhooks/payments/stripe/${owner.org}`, { method: 'POST', headers: { 'content-type': 'application/json', 'stripe-signature': 't=1,v1=bad' }, body: '{}' });
  let r = await F('POST', '/api/operator/reliability/checks'); assert.equal(r.status, 200, r.text);
  const names = r.json.components.map((c) => c.component);
  for (const k of ['availability', 'api', 'auth', 'database', 'storage', 'queue', 'ai', 'voice', 'email', 'payments', 'backups', 'deployment', 'resources', 'security']) assert.ok(names.includes(k), 'checks ' + k);
  const pay = r.json.components.find((c) => c.component === 'payments'); assert.equal(pay.status, 'warn'); assert.ok(pay.metrics.refused_24h >= 6, JSON.stringify(pay.metrics));
  assert.equal(r.json.components.find((c) => c.component === 'availability').status, 'ok');
  assert.equal(sql("SELECT COUNT(*) n FROM reliability_alerts WHERE component='payments'")[0].n, 0, 'one warning does not raise an alert');
  assert.equal(r.json.components.find((c) => c.component === 'backups').status, 'warn', 'no snapshot yet');
  // Ten jobs that failed permanently make the queue check fail and open a critical alert.
  const now = new Date().toISOString();
  for (let i = 0; i < 10; i++) sql("INSERT INTO background_jobs (id,type,payload_json,status,attempts,max_attempts,run_at,last_error,created_at,updated_at) VALUES (?,?,?,'dead',5,5,?,?,?,?)", crypto.randomUUID(), 'demo.permanent', '{}', now, 'Invalid record', now, now);
  sql("INSERT INTO reliability_metrics (minute,grp,status_class,count,ms_total,ms_max) VALUES (?,?,?,?,?,?) ON CONFLICT(minute,grp,status_class) DO UPDATE SET count=count+excluded.count", now.slice(0, 16), 'api', '5xx', 30, 3000, 400);
  sql("INSERT INTO reliability_metrics (minute,grp,status_class,count,ms_total,ms_max) VALUES (?,?,?,?,?,?) ON CONFLICT(minute,grp,status_class) DO UPDATE SET count=count+excluded.count", now.slice(0, 16), 'api', '2xx', 100, 5000, 200);
  r = await F('POST', '/api/operator/reliability/checks');
  assert.equal(r.json.components.find((c) => c.component === 'queue').status, 'fail');
  assert.equal(r.json.components.find((c) => c.component === 'api').status, 'fail');
  let alerts = (await F('GET', '/api/operator/reliability')).json.health.alerts;
  const qa = alerts.find((a) => a.component === 'queue' && a.status === 'open'); assert.ok(qa); assert.equal(qa.severity, 'critical'); assert.equal(qa.notify_result, 'no_operator_email');
  r = await F('POST', `/api/operator/reliability/alerts/${qa.id}/acknowledge`, { note: 'Looking into the dead jobs' }); assert.equal(r.status, 200);
  // Fix the cause: the next check passes and the alert closes itself.
  sql("DELETE FROM background_jobs WHERE type='demo.permanent'"); sql("DELETE FROM reliability_metrics WHERE grp='api'");
  r = await F('POST', '/api/operator/reliability/checks'); assert.equal(r.json.components.find((c) => c.component === 'queue').status, 'ok');
  alerts = (await F('GET', '/api/operator/reliability')).json.health.alerts;
  const closed = alerts.find((a) => a.id === qa.id); assert.equal(closed.status, 'resolved'); assert.match(closed.resolved_by, /automatic/);
  const apiAlert = alerts.find((a) => a.component === 'api'); r = await F('POST', `/api/operator/reliability/alerts/${apiAlert.id}/resolve`, {}); assert.equal(r.status, 409, 'already closed automatically');
  // Warnings only alert after three checks in a row.
  assert.equal(sql("SELECT severity FROM reliability_alerts WHERE component='payments'")[0]?.severity, 'warning');
  // AI failures recorded through the hook are reported.
  for (let i = 0; i < 4; i++) sql("INSERT INTO reliability_events (service,ok,ms,detail,at) VALUES ('ai',0,100,'timeout',?)", new Date().toISOString());
  r = await F('POST', '/api/operator/reliability/checks');
  const ai = r.json.components.find((c) => c.component === 'ai'); assert.ok(['fail', 'warn'].includes(ai.status)); assert.ok(ai.metrics.configured === false || ai.metrics.failed_1h === 4);
  // Daily summary and recovery readiness.
  r = await F('POST', '/api/operator/reliability/summary', { send: false }); assert.equal(r.status, 200, r.text);
  assert.equal(r.json.summary.components.length, 14); assert.equal(r.json.summary.readiness.ready, false);
  assert.ok(r.json.summary.readiness.items.some((i) => /restore test/.test(i.text))); assert.equal(r.json.summary.readiness.rto.database, '1 hour');
  assert.equal(sql('SELECT COUNT(*) n FROM reliability_summaries')[0].n, 1);
});

test('self-healing: temporary failures of safe jobs are retried twice at most; destructive or permanent ones are never retried; caches cleared', () => {
  const db = new Database(':memory:'); createJobQueue({ db });
  db.exec("CREATE TABLE automation_runs (id TEXT PRIMARY KEY, action TEXT, status TEXT, updated_at TEXT)");
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-heal-')), cache = path.join(tmp, 'social-stats-cache.json');
  fs.writeFileSync(cache, '{}'); fs.utimesSync(cache, new Date(Date.now() - 3 * 86400000), new Date(Date.now() - 3 * 86400000));
  const healer = createHealer({ db, isSafeAutomationRun: (id) => id === 'safe-run', cacheFiles: [{ file: cache, maxAgeMs: 86400000 }] });
  const now = new Date().toISOString();
  const job = (type, err, payload = {}) => { const id = crypto.randomUUID(); db.prepare("INSERT INTO background_jobs (id,type,payload_json,status,attempts,max_attempts,run_at,last_error,created_at,updated_at) VALUES (?,?,?,'dead',5,5,?,?,?,?)").run(id, type, JSON.stringify(payload), now, err, now, now); return id; };
  const temp = job('audit.verify_chain', 'connect ETIMEDOUT 10.0.0.1:443');
  const perm = job('audit.verify_chain', 'Invalid organisation id');
  const destructive = job('tenant.delete_data', 'socket hang up');
  const unknown = job('report.build', 'HTTP 503');
  const riskyRun = job('automation.execute', 'HTTP 502 from provider', { run_id: 'refund-run' });
  const safeRun = job('automation.execute', 'HTTP 502 from provider', { run_id: 'safe-run' });
  let out = healer.retryJobs();
  const st = (id) => db.prepare('SELECT status,attempts FROM background_jobs WHERE id=?').get(id);
  assert.deepEqual(st(temp), { status: 'queued', attempts: 3 }); assert.equal(st(safeRun).status, 'queued');
  for (const id of [perm, destructive, unknown, riskyRun]) assert.equal(st(id).status, 'dead', 'left alone');
  assert.match(out.find((o) => o.target === destructive).detail, /never repeated/); assert.match(out.find((o) => o.target === perm).detail, /does not look temporary/);
  // It fails again: one more heal, then it gives up for good.
  const kill = (id) => db.prepare("UPDATE background_jobs SET status='dead',attempts=5,updated_at=? WHERE id=?").run(new Date().toISOString(), id);
  kill(temp); healer.retryJobs(); assert.equal(st(temp).status, 'queued');
  kill(temp); out = healer.retryJobs(); assert.equal(st(temp).status, 'dead'); assert.ok(out.some((o) => o.target === temp && o.outcome === 'gave_up'));
  kill(temp); assert.equal(healer.retryJobs().filter((o) => o.target === temp).length, 0, 'gives up once, quietly after that');
  assert.equal(db.prepare("SELECT COUNT(*) n FROM reliability_heal_log WHERE target=? AND outcome='requeued'").get(temp).n, HEAL_POLICY.max_heals_per_job);
  // Expired non-sensitive cache removed; stuck automation runs reported, not restarted.
  db.prepare("INSERT INTO automation_runs VALUES ('r1','issue_refund','executing',?)").run(new Date(Date.now() - 3600000).toISOString());
  assert.ok(healer.clearCaches().out.some((o) => o.kind === 'cache')); assert.equal(fs.existsSync(cache), false);
  const stuck = healer.stuckTasks(); assert.ok(stuck.some((o) => o.kind === 'stuck_run' && /not restarted/.test(o.detail)));
  assert.equal(db.prepare("SELECT status FROM automation_runs WHERE id='r1'").get().status, 'executing');
  fs.rmSync(tmp, { recursive: true, force: true });
});

test('approval-only recovery: requests need a named approver, nothing runs automatically, the restore script needs an approval, uses it once and never overwrites', async (t) => {
  const { s, s3, F, sql, stop } = await setup(); t.after(stop);
  await seedOwner(s, { business: 'Harbour Plumbing Pty Ltd' });
  let r = await F('POST', '/api/operator/reliability/backups/snapshot'); assert.equal(r.status, 201, r.text);
  r = await F('POST', '/api/operator/reliability/requests', { action: 'restore_database', details: 'short' }); assert.equal(r.status, 400);
  r = await F('POST', '/api/operator/reliability/requests', { action: 'drop_everything', details: 'Delete the whole database please' }); assert.equal(r.status, 400);
  r = await F('POST', '/api/operator/reliability/requests', { action: 'restore_database', details: 'Restore yesterday\'s snapshot after the bad import' }); assert.equal(r.status, 201, r.text);
  const pa = sql('SELECT id,reference_code,status FROM platform_approvals WHERE run_id=?', r.json.run_id)[0]; assert.equal(pa.status, 'pending');
  const out = path.join(s.temp, 'restore-candidate.sqlite'), args = ['--approval', pa.reference_code, '--out', out];
  const env = { ...process.env, DATABASE_PATH: s.dbPath, BACKUP_S3_BUCKET: 'sp-backups', BACKUP_S3_ENDPOINT: s3.endpoint, AWS_ACCESS_KEY_ID: 'test-access-id', AWS_SECRET_ACCESS_KEY: 'test-secret-value-not-real', AWS_REGION: 'ap-southeast-2' };
  // Run asynchronously: the S3 stand-in lives in this process and must keep answering.
  const go = (a) => new Promise((resolve) => { const c = spawn(process.execPath, ['scripts/restore-database.mjs', ...a], { env }); let stdout = '', stderr = ''; c.stdout.on('data', (b) => { stdout += b; }); c.stderr.on('data', (b) => { stderr += b; }); c.on('close', (status) => resolve({ status, stdout, stderr })); });
  let p = await go(args); assert.notEqual(p.status, 0); assert.match(p.stderr, /pending, not approved/);
  r = await F('POST', `/api/operator/automation/approvals/${pa.id}/decision`, { decision: 'approve' }); assert.equal(r.status, 200, r.text); await sleep(300);
  assert.equal(sql("SELECT COUNT(*) n FROM reliability_backups WHERE kind='snapshot'")[0].n, 1, 'approving runs nothing by itself');
  p = await go(['--approval', pa.reference_code, '--out', s.dbPath]); assert.notEqual(p.status, 0); assert.match(p.stderr, /must not be the live database/);
  p = await go(args); assert.equal(p.status, 0, p.stderr + p.stdout); assert.match(p.stdout, /RESTORED/);
  const restored = new Database(out, { readonly: true }); assert.ok(restored.prepare('SELECT COUNT(*) n FROM organisations').get().n >= 1); restored.close();
  p = await go(['--approval', pa.reference_code, '--out', out + '.2']); assert.notEqual(p.status, 0); assert.match(p.stderr, /already been used/);
  p = await go(['--approval', pa.reference_code, '--out', out]); assert.notEqual(p.status, 0); assert.match(p.stderr, /already exists|already been used/);
  const dash = (await F('GET', '/api/operator/reliability')).json;
  assert.equal(dash.approval_only.length, 7); assert.ok(dash.requests.some((x) => x.action === 'restore_database'));
});
