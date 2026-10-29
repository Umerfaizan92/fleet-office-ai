import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import { randomBytes, randomUUID, createHash } from 'node:crypto';
import Database from 'better-sqlite3';
import { storageConfig, tenantKey, keyBelongsTo, createObjectStorage } from '../src/object-storage.js';
import { sniff, validateFile, scanBuffer, inspectUpload } from '../src/file-safety.js';
import { backupEncryption } from '../src/s3-files.js';
import { startServer } from './test-server.mjs';

const JPEG = Buffer.from('ffd8ffe000104a464946', 'hex');
const PRIMARY = { OBJECT_STORAGE_MODE: 's3', OBJECT_STORAGE_BUCKET: 'sp-primary-test', OBJECT_STORAGE_ACCESS_KEY_ID: 'AKIAPRIMARYTEST', OBJECT_STORAGE_SECRET_ACCESS_KEY: 'primary-secret-test', OBJECT_STORAGE_REGION: 'ap-southeast-2' };

test('primary storage is off by default and never borrows backup settings', () => {
  assert.equal(storageConfig({}).mode, 'disk');
  assert.equal(storageConfig({ OBJECT_STORAGE_MODE: 's3' }).ready, false);
  const sameBucket = storageConfig({ ...PRIMARY, AWS_S3_BUCKET: 'sp-primary-test' });
  assert.equal(sameBucket.ready, false); assert.match(sameBucket.problems.join(' '), /different from the backup bucket/);
  const sharedKey = storageConfig({ ...PRIMARY, AWS_ACCESS_KEY_ID: 'AKIAPRIMARYTEST' });
  assert.equal(sharedKey.ready, false); assert.match(sharedKey.problems.join(' '), /own IAM user/);
  const backupOnly = storageConfig({ OBJECT_STORAGE_MODE: 's3', OBJECT_STORAGE_BUCKET: 'x', AWS_ACCESS_KEY_ID: 'AKIABACKUP', AWS_SECRET_ACCESS_KEY: 'backup' });
  assert.equal(backupOnly.ready, false, 'backup keys must not satisfy primary storage');
  assert.equal(storageConfig(PRIMARY).ready, true);
  assert.equal(storageConfig({ ...PRIMARY, OBJECT_STORAGE_URL_TTL_SECONDS: '99999' }).urlTtlSeconds, 900);
});

test('object keys are per business, carry no file names and cannot be borrowed', () => {
  const cfg = storageConfig(PRIMARY), org = randomUUID(), other = randomUUID();
  const key = tenantKey(cfg, org, 'job-evidence', new Date('2026-10-30T00:00:00Z'));
  assert.match(key, new RegExp(`^tenants/${org}/job-evidence/2026/10/[0-9a-f-]{36}$`));
  assert.equal(keyBelongsTo(cfg, key, org), true);
  assert.equal(keyBelongsTo(cfg, key, other), false);
  assert.equal(keyBelongsTo(cfg, `tenants/${org}/../${other}/x`, org), false);
  assert.throws(() => tenantKey(cfg, '../etc', 'job-evidence'));
  assert.throws(() => tenantKey(cfg, org, 'Job Evidence'));
});

test('stored objects are encrypted, checksummed and audited; links are short-lived and tenant-checked', async () => {
  const sent = [], audits = [];
  const client = { send: async (cmd) => { sent.push(cmd.input); return {}; } };
  const presign = async (_c, cmd, opts) => `https://signed.example/${cmd.input.Key}?ttl=${opts.expiresIn}`;
  const org = randomUUID();
  const aes = createObjectStorage({ env: PRIMARY, client, presign, audit: (e) => audits.push(e) });
  const stored = await aes.put({ organisationId: org, category: 'job-evidence', body: JPEG, contentType: 'image/jpeg', scan: { status: 'clean' } });
  assert.equal(sent[0].ServerSideEncryption, 'AES256');
  assert.equal(sent[0].ChecksumSHA256, createHash('sha256').update(JPEG).digest('base64'));
  assert.equal(sent[0].Metadata.scan, 'clean');
  assert.ok(!sent[0].Key.includes('.jpg'));
  const kms = createObjectStorage({ env: { ...PRIMARY, OBJECT_STORAGE_KMS_KEY_ID: 'arn:aws:kms:ap-southeast-2:111122223333:key/test' }, client, presign });
  await kms.put({ organisationId: org, category: 'job-evidence', body: JPEG, contentType: 'image/jpeg' });
  assert.equal(sent[1].ServerSideEncryption, 'aws:kms');
  const link = await aes.signedUrl({ organisationId: org, key: stored.key, filename: 'a"b<c>.jpg', contentType: 'image/jpeg' });
  assert.equal(link.expiresIn, 120);
  await assert.rejects(aes.signedUrl({ organisationId: randomUUID(), key: stored.key }), (e) => e.status === 404);
  assert.deepEqual(audits.map((a) => a.action), ['storage.object_stored', 'storage.signed_url_issued', 'storage.access_denied']);
});

test('file checks use real content, not names or declared types', () => {
  assert.equal(sniff(JPEG), 'jpeg');
  assert.equal(sniff(Buffer.from('000000186674797068656963', 'hex')), 'isobmff');
  assert.equal(validateFile(JPEG, { declaredType: 'image/jpeg' }).ok, true);
  assert.equal(validateFile(Buffer.from('4d5a90000300', 'hex'), { declaredType: 'image/jpeg' }).reason, 'dangerous_content');
  assert.equal(validateFile(Buffer.from('#!/bin/sh\nrm -rf /'), { declaredType: 'text/plain' }).reason, 'dangerous_content');
  assert.equal(validateFile(Buffer.from('name,notes\n"x","<script>alert(1)</script>"'), { declaredType: 'text/csv' }).reason, 'dangerous_content');
  assert.equal(validateFile(Buffer.from('%PDF-1.7'), { declaredType: 'image/png' }).reason, 'type_mismatch');
  assert.equal(validateFile(JPEG, { declaredType: 'image/svg+xml' }).reason, 'type_not_allowed');
  assert.equal(validateFile(JPEG, { declaredType: 'image/jpeg', maxBytes: 4 }).reason, 'too_large');
});

function fakeClamd(reply) {
  return new Promise((resolve) => {
    const server = net.createServer((sock) => { let got = Buffer.alloc(0); sock.on('data', (d) => { got = Buffer.concat([got, d]); if (got.subarray(-4).equals(Buffer.alloc(4))) sock.end(reply(got)); }); });
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

test('malware scanning: clean, infected, and a missing scanner when scanning is required', async () => {
  const clean = await fakeClamd(() => 'stream: OK\0'), bad = await fakeClamd(() => 'stream: Eicar-Test-Signature FOUND\0');
  try {
    const cfg = (srv) => ({ enabled: true, host: '127.0.0.1', port: srv.address().port, timeoutMs: 3000 });
    assert.equal((await scanBuffer(JPEG, cfg(clean))).status, 'clean');
    assert.equal((await scanBuffer(JPEG, cfg(bad))).status, 'infected');
    const blocked = await inspectUpload(JPEG, { declaredType: 'image/jpeg', env: { CLAMAV_HOST: '127.0.0.1', CLAMAV_PORT: String(bad.address().port) } });
    assert.equal(blocked.reason, 'malware');
    const closed = await inspectUpload(JPEG, { declaredType: 'image/jpeg', env: { CLAMAV_HOST: '127.0.0.1', CLAMAV_PORT: '1', MALWARE_SCAN_REQUIRED: '1', CLAMAV_TIMEOUT_MS: '1000' } });
    assert.equal(closed.reason, 'scanner_unavailable');
    const open = await inspectUpload(JPEG, { declaredType: 'image/jpeg', env: {} });
    assert.equal(open.ok, true); assert.equal(open.scan.status, 'not_scanned');
  } finally { clean.close(); bad.close(); }
});

test('backup copies are encrypted unless a custom endpoint is used', () => {
  assert.deepEqual(backupEncryption({}), { ServerSideEncryption: 'AES256' });
  assert.equal(backupEncryption({ BACKUP_S3_KMS_KEY_ID: 'k' }).ServerSideEncryption, 'aws:kms');
  assert.deepEqual(backupEncryption({ BACKUP_S3_ENDPOINT: 'http://minio:9000' }), {});
});

// A minimal path-style S3 stand-in: stores PUTs, serves GETs, records the encryption header.
function fakeS3() {
  const objects = new Map(), puts = [];
  const server = http.createServer((req, res) => {
    const chunks = []; req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      const key = decodeURIComponent(new URL(req.url, 'http://x').pathname);
      if (req.method === 'PUT') { objects.set(key, Buffer.concat(chunks)); puts.push({ key, sse: req.headers['x-amz-server-side-encryption'] }); res.setHeader('ETag', '"etag"'); return res.end(); }
      if (req.method === 'GET' && objects.has(key)) { res.setHeader('content-type', 'image/jpeg'); return res.end(objects.get(key)); }
      res.statusCode = 404; res.end('<Error><Code>NoSuchKey</Code></Error>');
    });
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve({ server, objects, puts, url: `http://127.0.0.1:${server.address().port}` })));
}

test('end to end: job evidence goes to private storage and comes back only through a signed link', async () => {
  const s3 = await fakeS3();
  const s = await startServer({ ...PRIMARY, OBJECT_STORAGE_ENDPOINT: s3.url });
  try {
    const db = new Database(s.dbPath), now = new Date().toISOString(), cookies = {}, orgs = {};
    for (const label of ['a', 'b']) {
      const org = randomUUID(), uid = randomUUID(), token = randomBytes(24).toString('hex'); orgs[label] = org;
      db.prepare('INSERT INTO organisations (id,name,slug,created_at,updated_at) VALUES (?,?,?,?,?)').run(org, label, 's3-' + label + org.slice(0, 6), now, now);
      db.prepare("INSERT INTO organisation_subscriptions (organisation_id,plan_id,status,payment_status,trial_ends_at,created_at,updated_at) VALUES (?,'scale','trialing','unpaid',?,?,?)").run(org, new Date(Date.now() + 86400000).toISOString(), now, now);
      db.prepare('INSERT INTO users (id,email,full_name,password_hash,password_salt,created_at,updated_at) VALUES (?,?,?,?,?,?,?)').run(uid, label + '@s3.example.test', label, 'x', 'x', now, now);
      db.prepare('INSERT INTO memberships (organisation_id,user_id,role,created_at) VALUES (?,?,?,?)').run(org, uid, 'owner', now);
      db.prepare('INSERT INTO user_sessions (id,user_id,token_hash,expires_at,created_at,last_seen_at) VALUES (?,?,?,?,?,?)').run(randomUUID(), uid, createHash('sha256').update(token).digest('hex'), new Date(Date.now() + 3600000).toISOString(), now, now);
      cookies[label] = 'fp_session=' + token;
    }
    const jobId = randomUUID();
    db.prepare('INSERT INTO work_orders (id,organisation_id,title,start_at,created_at,updated_at) VALUES (?,?,?,?,?,?)').run(jobId, orgs.a, 'Storage job', '2026-12-01T08:00:00+08:00', now, now);
    db.close();
    const upload = (bytes, type, name) => { const fd = new FormData(); fd.append('stage', 'before'); fd.append('files', new Blob([bytes], { type }), name); return fetch(`${s.base}/api/saas/work-orders/${jobId}/media`, { method: 'POST', headers: { origin: s.base, cookie: cookies.a }, body: fd }); };

    const disguised = await upload(Buffer.from('4d5a900003000000', 'hex'), 'image/jpeg', 'photo.jpg');
    assert.equal(disguised.status, 400, 'a program renamed as a photo is refused');
    assert.equal(s3.puts.length, 0);

    const ok = await upload(JPEG, 'image/jpeg', 'before.jpg');
    assert.equal(ok.status, 201, await ok.text());
    assert.equal(s3.puts.length, 1);
    assert.match(s3.puts[0].key, new RegExp(`^/sp-primary-test/tenants/${orgs.a}/job-evidence/\\d{4}/\\d{2}/[0-9a-f-]{36}$`));
    assert.equal(s3.puts[0].sse, 'AES256');
    assert.ok(!localFilesExist(s.temp, 'uploads/job-evidence', orgs.a), 'no local copy kept once stored in S3');

    const list = await s.call('GET', `/api/saas/work-orders/${jobId}/media`, { cookie: cookies.a });
    const mediaId = list.json.media[0].id;
    const r = await fetch(`${s.base}/api/saas/job-media/${mediaId}/file`, { redirect: 'manual', headers: { origin: s.base, cookie: cookies.a } });
    assert.equal(r.status, 302);
    const location = r.headers.get('location');
    assert.match(location, /X-Amz-Expires=120/); assert.match(location, /X-Amz-Signature=/);
    const got = Buffer.from(await (await fetch(location)).arrayBuffer());
    assert.ok(got.equals(JPEG), 'the signed link returns the stored file');

    const other = await fetch(`${s.base}/api/saas/job-media/${mediaId}/file`, { redirect: 'manual', headers: { origin: s.base, cookie: cookies.b } });
    assert.equal(other.status, 404, 'another business gets no link');

    const audit = new Database(s.dbPath, { readonly: true });
    const actions = audit.prepare("SELECT action FROM audit_logs WHERE module='storage' ORDER BY created_at").all().map((x) => x.action);
    audit.close();
    assert.ok(actions.includes('storage.object_stored') && actions.includes('storage.signed_url_issued'), actions.join(','));
  } finally { await s.stop(); s3.server.close(); }
});

function localFilesExist(root, rel, org) {
  const dir = path.join(root, rel, org);
  return fs.existsSync(dir) && fs.readdirSync(dir).length > 0;
}
