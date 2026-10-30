import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { syncUploads, restoreUploads } from '../src/s3-files.js';

const bucketStore = new Map();
const fakeClient = {
  async send(cmd) {
    const name = cmd.constructor.name, i = cmd.input;
    if (name === 'PutObjectCommand') { bucketStore.set(i.Key, Buffer.from(i.Body)); return {}; }
    if (name === 'ListObjectsV2Command') return { Contents: [...bucketStore.keys()].filter(k => k.startsWith(i.Prefix)).map(Key => ({ Key })), IsTruncated: false };
    if (name === 'GetObjectCommand') { const b = bucketStore.get(i.Key); return { Body: { transformToByteArray: async () => new Uint8Array(b) } }; }
    throw new Error('unexpected ' + name);
  }
};
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'sp-s3-'));
const quiet = () => {};

test('new and changed uploads go to S3 once; unchanged files are not re-sent', async () => {
  bucketStore.clear();
  const dir = tmp(), seen = new Map();
  fs.mkdirSync(path.join(dir, 'job-evidence', 'org1'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'job-evidence', 'org1', 'a.jpg'), 'photo-a');
  let r = await syncUploads({ client: fakeClient, bucket: 'b', prefix: 'p', dir, seen, log: quiet });
  assert.equal(r.uploaded, 1);
  assert.ok(bucketStore.has('p/job-evidence/org1/a.jpg'));
  r = await syncUploads({ client: fakeClient, bucket: 'b', prefix: 'p', dir, seen, log: quiet });
  assert.equal(r.uploaded, 0);
  fs.writeFileSync(path.join(dir, 'job-evidence', 'org1', 'a.jpg'), 'photo-a-edited');
  fs.utimesSync(path.join(dir, 'job-evidence', 'org1', 'a.jpg'), new Date(), new Date(Date.now() + 5000));
  r = await syncUploads({ client: fakeClient, bucket: 'b', prefix: 'p', dir, seen, log: quiet });
  assert.equal(r.uploaded, 1);
});

test('an empty server gets its files back; a server that already has files is left alone', async () => {
  bucketStore.clear();
  bucketStore.set('p/studio/org1/logo.png', Buffer.from('logo'));
  bucketStore.set('p/../../escape.txt', Buffer.from('bad'));
  const dir = tmp();
  const r = await restoreUploads({ client: fakeClient, bucket: 'b', prefix: 'p', dir, log: quiet });
  assert.equal(r.restored, 1);
  assert.equal(fs.readFileSync(path.join(dir, 'studio', 'org1', 'logo.png'), 'utf8'), 'logo');
  assert.equal(fs.existsSync(path.join(dir, '..', 'escape.txt')), false, 'keys can never write outside the upload folder');
  const again = await restoreUploads({ client: fakeClient, bucket: 'b', prefix: 'p', dir, log: quiet });
  assert.equal(again.restored, 0);
});

import { backupBucket } from '../src/backup-env.js';
test('BACKUP_S3_BUCKET takes priority, AWS_S3_BUCKET is Render fallback, and backups can be disabled', () => {
  assert.equal(backupBucket({ BACKUP_S3_BUCKET: 'a', AWS_S3_BUCKET: 'b', RENDER: 'true' }), 'a');
  assert.equal(backupBucket({ BACKUP_S3_BUCKET: 'a', RENDER: 'true' }), 'a');
  assert.equal(backupBucket({ AWS_S3_BUCKET: 'b', RENDER: 'true' }), 'b');
  assert.equal(backupBucket({ AWS_S3_BUCKET: 'b' }), '');
  assert.equal(backupBucket({ AWS_S3_BUCKET: 'b', RENDER: 'true', BACKUP_DISABLED: '1' }), '');
});

import { backupCredentials, applyBackupEnv } from '../src/backup-env.js';
test('AWS keys are found under common alternative names and cleaned of stray spaces', () => {
  const env = { RENDER: 'true', AWS_S3_BUCKET: ' my-bucket\n', AWS_S3_ACCESS_KEY: ' AKIAEXAMPLE ', AWS_S3_SECRET_ACCESS_KEY: '"secretvalue"\n', AWS_REGION: ' ap-southeast-2 ' };
  const c = applyBackupEnv(env);
  assert.equal(env.AWS_ACCESS_KEY_ID, 'AKIAEXAMPLE');
  assert.equal(env.AWS_SECRET_ACCESS_KEY, 'secretvalue');
  assert.equal(env.AWS_REGION, 'ap-southeast-2');
  assert.equal(env.BACKUP_S3_BUCKET, 'my-bucket');
  assert.equal(c.secret.name, 'AWS_S3_SECRET_ACCESS_KEY');
  const fuzzy = backupCredentials({ MY_AWS_ACCESS_KEY_FOR_S3: 'AKIA1', MY_AWS_S3_SECRET_THING: 'sec' });
  assert.equal(fuzzy.id.value, 'AKIA1');
  assert.equal(fuzzy.secret.value, 'sec');
  assert.equal(backupCredentials({ AWS_KMS_KEY_ID: 'kms' }).id, null, 'a KMS key id is never mistaken for an access key');
});

test('restart never marks an unconfirmed local upload as durable; failed uploads retry', async () => {
  bucketStore.clear();
  const dir = tmp(), seen = new Map();
  try {
    fs.writeFileSync(path.join(dir, 'pending.jpg'), 'not-yet-backed-up');
    await restoreUploads({ client: fakeClient, bucket: 'b', prefix: 'p', dir, seen, log: quiet });
    assert.equal(seen.size, 0, 'local presence is not proof of a completed S3 write');
    const failing = { send: async () => { throw new Error('synthetic outage'); } };
    assert.equal((await syncUploads({ client: failing, bucket: 'b', prefix: 'p', dir, seen, log: quiet })).failed, 1);
    assert.equal(seen.size, 0);
    assert.equal((await syncUploads({ client: fakeClient, bucket: 'b', prefix: 'p', dir, seen, log: quiet })).uploaded, 1);
    assert.equal(bucketStore.get('p/pending.jpg').toString(), 'not-yet-backed-up');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('an interrupted restore resumes missing files without overwriting existing customer files', async () => {
  bucketStore.clear();
  bucketStore.set('p/first.jpg', Buffer.from('first'));
  bucketStore.set('p/second.jpg', Buffer.from('second'));
  const dir = tmp();
  let fail = true;
  const interrupted = { send: async (cmd) => {
    if (fail && cmd.constructor.name === 'GetObjectCommand' && cmd.input.Key === 'p/second.jpg') throw new Error('synthetic interruption');
    return fakeClient.send(cmd);
  } };
  try {
    await assert.rejects(restoreUploads({ client: interrupted, bucket: 'b', prefix: 'p', dir, log: quiet }), /synthetic interruption/);
    assert.equal(fs.readFileSync(path.join(dir, 'first.jpg'), 'utf8'), 'first');
    assert.ok(fs.existsSync(path.join(dir, '.superpro-s3-restore.pending')));
    // A customer edit must survive retry, and restore metadata must never be uploaded.
    fs.writeFileSync(path.join(dir, 'first.jpg'), 'customer edit');
    fail = false;
    const r = await restoreUploads({ client: interrupted, bucket: 'b', prefix: 'p', dir, log: quiet });
    assert.equal(r.restored, 1); assert.equal(r.skipped, 1);
    assert.equal(fs.readFileSync(path.join(dir, 'first.jpg'), 'utf8'), 'customer edit');
    assert.equal(fs.readFileSync(path.join(dir, 'second.jpg'), 'utf8'), 'second');
    assert.equal(fs.existsSync(path.join(dir, '.superpro-s3-restore.pending')), false);
    fs.writeFileSync(path.join(dir, '.superpro-s3-restore-1234.tmp'), 'incomplete download');
    await syncUploads({ client: fakeClient, bucket: 'b', prefix: 'p', dir, seen: new Map(), log: quiet });
    assert.ok(![...bucketStore.keys()].some(k => k.includes('.superpro-s3-restore')));
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('restore cannot follow symlink files or directories outside its root', async () => {
  for (const directory of [false, true]) {
    bucketStore.clear();
    const dir = tmp(), outside = tmp();
    try {
      fs.writeFileSync(path.join(outside, 'protected'), 'unchanged');
      fs.symlinkSync(directory ? outside : path.join(outside, 'protected'), path.join(dir, 'link'));
      bucketStore.set(directory ? 'p/link/protected' : 'p/link', Buffer.from('overwrite attempt'));
      await assert.rejects(restoreUploads({ client: fakeClient, bucket: 'b', prefix: 'p', dir, log: quiet }), /symbolic links/);
      assert.equal(fs.readFileSync(path.join(outside, 'protected'), 'utf8'), 'unchanged');
    } finally { fs.rmSync(dir, { recursive: true, force: true }); fs.rmSync(outside, { recursive: true, force: true }); }
  }
});

test('pending restore cannot silently switch backup sources and invalid pagination fails closed', async () => {
  const dir = tmp();
  try {
    const client = { send: async () => ({ Contents: [], IsTruncated: true, NextContinuationToken: 'repeated' }) };
    await assert.rejects(restoreUploads({ client, bucket: 'b', prefix: 'p', dir, log: quiet }), /pagination did not advance/);
    await assert.rejects(restoreUploads({ client: fakeClient, bucket: 'different', prefix: 'p', dir, log: quiet }), /different backup source/);
    assert.ok(fs.existsSync(path.join(dir, '.superpro-s3-restore.pending')));
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('backup bucket selection normalizes copied values before any startup storage call', () => {
  assert.equal(backupBucket({ BACKUP_S3_BUCKET: ' "primary"\n', RENDER: 'true' }), 'primary');
  assert.equal(backupBucket({ BACKUP_S3_BUCKET: '   ', AWS_S3_BUCKET: ' fallback\n', RENDER: 'true' }), 'fallback');
  for (const flag of ['1', 'true', 'yes', 'on', ' TRUE ']) assert.equal(backupBucket({ BACKUP_S3_BUCKET: 'production', BACKUP_DISABLED: flag }), '');
});
