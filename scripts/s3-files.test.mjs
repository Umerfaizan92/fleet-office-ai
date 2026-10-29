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
