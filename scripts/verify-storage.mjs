#!/usr/bin/env node
// Read-only check of the S3 set-up. Prints names and ready/missing states only, never keys or secret values.
//   npm run storage:verify                 settings of the backup bucket and (if configured) the primary bucket
//   npm run storage:verify -- --write-test also stores and reads back one tiny object under _healthcheck/ in the primary bucket
// Run it in the Render shell (staging first). It never deletes anything.
import { storageConfig, createObjectStorage } from '../src/object-storage.js';
import { backupCredentials } from '../src/backup-env.js';

const env = process.env;
const writeTest = process.argv.includes('--write-test');
const results = [];
const report = (bucketRole, check, ok, detail) => results.push({ bucketRole, check, status: ok === null ? 'SKIP' : ok ? 'PASS' : 'FAIL', detail });

async function inspectBucket(role, bucket, clientConfig, { expectVersioning = true } = {}) {
  const s3 = await import('@aws-sdk/client-s3');
  const client = new s3.S3Client(clientConfig);
  const tryCall = async (cmd) => { try { return { ok: true, value: await client.send(cmd) }; } catch (e) { return { ok: false, error: e.name || 'Error' }; } };
  const loc = await tryCall(new s3.GetBucketLocationCommand({ Bucket: bucket }));
  report(role, 'reachable', loc.ok, loc.ok ? `region ${loc.value.LocationConstraint || 'us-east-1'}` : loc.error);
  if (!loc.ok) return client;
  report(role, 'australian_region', (loc.value.LocationConstraint || '') === 'ap-southeast-2', 'Sydney (ap-southeast-2) keeps copies onshore');
  const enc = await tryCall(new s3.GetBucketEncryptionCommand({ Bucket: bucket }));
  const algo = enc.ok ? enc.value.ServerSideEncryptionConfiguration?.Rules?.[0]?.ApplyServerSideEncryptionByDefault?.SSEAlgorithm : null;
  report(role, 'default_encryption', Boolean(algo), algo || enc.error);
  const ver = await tryCall(new s3.GetBucketVersioningCommand({ Bucket: bucket }));
  report(role, 'versioning', expectVersioning ? ver.ok && ver.value.Status === 'Enabled' : null, ver.ok ? ver.value.Status || 'Off' : ver.error);
  const pab = await tryCall(new s3.GetPublicAccessBlockCommand({ Bucket: bucket }));
  const c = pab.ok ? pab.value.PublicAccessBlockConfiguration : null;
  report(role, 'public_access_blocked', Boolean(c && c.BlockPublicAcls && c.IgnorePublicAcls && c.BlockPublicPolicy && c.RestrictPublicBuckets), pab.ok ? 'all four settings' : pab.error);
  const life = await tryCall(new s3.GetBucketLifecycleConfigurationCommand({ Bucket: bucket }));
  report(role, 'lifecycle_rules', life.ok && (life.value.Rules || []).length > 0, life.ok ? `${life.value.Rules.length} rule(s)` : life.error);
  return client;
}

const backup = backupCredentials({ ...env, RENDER: env.RENDER || '1' });
if (backup.bucket && backup.id && backup.secret) {
  await inspectBucket('backup', backup.bucket, { region: backup.region || 'us-east-1', credentials: { accessKeyId: backup.id.value, secretAccessKey: backup.secret.value } });
} else report('backup', 'configured', false, 'BACKUP_S3_BUCKET / AWS_S3_BUCKET and AWS keys are not all set');

const primary = storageConfig(env);
if (primary.mode !== 's3') report('primary', 'configured', null, 'OBJECT_STORAGE_MODE is not s3, so files stay on the server disk');
else if (!primary.ready) report('primary', 'configured', false, primary.problems.join(' '));
else {
  report('primary', 'separate_from_backup', primary.bucket !== backup.bucket, 'primary and backup buckets differ');
  await inspectBucket('primary', primary.bucket, { region: primary.region, credentials: primary.credentials, ...(primary.endpoint ? { endpoint: primary.endpoint, forcePathStyle: true } : {}) });
  if (writeTest) {
    try {
      const store = createObjectStorage({ env: { ...env, OBJECT_STORAGE_PREFIX: '_healthcheck' } });
      const body = Buffer.from('superpro-storage-check ' + new Date().toISOString());
      const put = await store.put({ organisationId: 'healthcheck-0000', category: 'probe', body, contentType: 'text/plain' });
      const { url } = await store.signedUrl({ organisationId: 'healthcheck-0000', key: put.key, contentType: 'text/plain' });
      const back = Buffer.from(await (await fetch(url)).arrayBuffer());
      report('primary', 'write_and_signed_read', back.equals(body), 'object stored encrypted and read back through a signed link');
    } catch (e) { report('primary', 'write_and_signed_read', false, e.name || 'Error'); }
  }
}

for (const r of results) console.log(`${r.status.padEnd(4)} ${r.bucketRole.padEnd(7)} ${r.check.padEnd(22)} ${r.detail || ''}`);
const failed = results.filter((r) => r.status === 'FAIL').length;
console.log(failed ? `\n${failed} storage check(s) need attention. No secret values were printed.` : '\nStorage checks passed. No secret values were printed.');
process.exit(failed ? 1 : 0);
