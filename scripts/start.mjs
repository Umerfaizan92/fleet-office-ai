// Starts the server. With BACKUP_S3_BUCKET set it first restores the database and uploads from S3 (empty server only),
// then runs the server under Litestream, which copies every database change to S3 within seconds.
// With no backup settings it simply starts the server, exactly as before.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { assertIsolatedPreview } from '../src/preview-preflight.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
process.chdir(root);
const env = process.env;
assertIsolatedPreview(env);
const { prepareStorage } = await import('../src/diagnostics.js');
const { makeClient, restoreUploads } = await import('../src/s3-files.js');
const { backupBucket, applyBackupEnv, awsVariableNames } = await import('../src/backup-env.js');
const bucket = backupBucket(env), fileDir = env.BACKUP_FILE_DIR;
const creds = applyBackupEnv(env); // trims stray spaces, finds keys saved under another name, and gives every part the standard names
if (bucket && (!creds.id || !creds.secret)) {
  console.error(`[backup] The bucket is set but the AWS ${!creds.id ? 'access key ID' : 'secret access key'} was not found. Variables seen (names only): ${awsVariableNames(env).join(', ') || 'none'}. Add AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY, or set BACKUP_DISABLED=1 to run without backups.`);
  process.exit(1);
}
if (bucket) console.log(`[backup] Using bucket "${creds.bucket}" in ${creds.region || 'us-east-1'}; keys read from ${creds.id.name} and ${creds.secret.name}.`);

if (!bucket && !fileDir) {
  await import('../src/server.js');
} else {
  const bin = env.LITESTREAM_BIN || path.join(root, 'bin', 'litestream');
  if (!fs.existsSync(bin)) {
    console.error('[backup] Backups are switched on but the Litestream tool is missing, so the server will not start without a safety net. Redeploy with "Clear build cache & deploy", or remove BACKUP_S3_BUCKET to run without backups.');
    process.exit(1);
  }
  const plan = prepareStorage({ env, backendRoot: root });
  env.DATABASE_PATH = plan.databasePath;
  env.UPLOAD_DIR = plan.uploadRoot;
  fs.mkdirSync(path.dirname(plan.databasePath), { recursive: true });
  const replica = bucket
    ? `      - type: s3\n        bucket: ${JSON.stringify(bucket)}\n        path: ${JSON.stringify(env.BACKUP_S3_DB_PREFIX || 'super-pro/db')}\n        region: ${JSON.stringify(env.AWS_REGION || env.AWS_DEFAULT_REGION || env.BACKUP_S3_REGION || 'us-east-1')}\n${env.BACKUP_S3_ENDPOINT ? `        endpoint: ${JSON.stringify(env.BACKUP_S3_ENDPOINT)}\n        force-path-style: true\n` : ''}        sync-interval: 5s\n        snapshot-interval: 1h\n        retention: 72h\n`
    : `      - type: file\n        path: ${JSON.stringify(fileDir)}\n        sync-interval: 1s\n`;
  const cfg = path.join(os.tmpdir(), 'super-pro-litestream.yml');
  fs.writeFileSync(cfg, `dbs:\n  - path: ${JSON.stringify(plan.databasePath)}\n    replicas:\n${replica}`);
  if (bucket) {
    try { await restoreUploads({ client: await makeClient(env), bucket, prefix: env.BACKUP_S3_UPLOADS_PREFIX || 'super-pro/uploads', dir: plan.uploadRoot }); }
    catch (err) { console.error(`[backup] Could not read uploads from S3: ${err.name || 'Error'}: ${err.message}. Check the bucket name, region and keys. The keys need s3:ListBucket on the bucket and s3:GetObject/PutObject on super-pro/*.`); process.exit(1); }
  }
  const r = spawnSync(bin, ['restore', '-config', cfg, '-if-db-not-exists', '-if-replica-exists', plan.databasePath], { stdio: 'inherit' });
  if (r.status !== 0) { console.error('[backup] Could not restore the database from the backup. Not starting, so nothing is overwritten.'); process.exit(r.status || 1); }
  const child = spawn(bin, ['replicate', '-config', cfg, '-exec', `${process.execPath} src/server.js`], { stdio: 'inherit', env });
  for (const sig of ['SIGTERM', 'SIGINT']) process.on(sig, () => child.kill(sig));
  child.on('exit', (code, signal) => process.exit(code ?? (signal ? 1 : 0)));
}
