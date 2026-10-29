// Keeps uploaded files (job photos, documents, logos) safe in an S3 bucket so a redeploy never loses them.
// The database is protected separately (Litestream, see scripts/start.mjs). Nothing here ever deletes from the bucket.
import fs from 'node:fs';
import path from 'node:path';
import { backupBucket } from './backup-env.js';

export async function makeClient(env = process.env) {
  const { S3Client } = await import('@aws-sdk/client-s3');
  return new S3Client({
    region: env.AWS_REGION || env.AWS_DEFAULT_REGION || env.BACKUP_S3_REGION || 'us-east-1',
    ...(env.BACKUP_S3_ENDPOINT ? { endpoint: env.BACKUP_S3_ENDPOINT, forcePathStyle: true } : {})
  });
}

function* walk(dir, base = dir) {
  let entries = [];
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) yield* walk(full, base);
    else if (e.isFile()) yield { full, rel: path.relative(base, full).split(path.sep).join('/') };
  }
}
const signature = (file) => { const s = fs.statSync(file); return `${s.size}:${Math.floor(s.mtimeMs)}`; };
const cleanPrefix = (p) => String(p || 'super-pro/uploads').replace(/^\/+|\/+$/g, '') + '/';

// Pull every file back into an empty upload folder (a fresh server). A folder that already has files is left alone.
export async function restoreUploads({ client, bucket, prefix, dir, seen = new Map(), log = console.log }) {
  const { ListObjectsV2Command, GetObjectCommand } = await import('@aws-sdk/client-s3');
  const pre = cleanPrefix(prefix);
  fs.mkdirSync(dir, { recursive: true });
  const existing = [...walk(dir)];
  if (existing.length) { for (const f of existing) seen.set(pre + f.rel, signature(f.full)); return { restored: 0, skipped: existing.length }; }
  let token, restored = 0;
  do {
    const page = await client.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: pre, ContinuationToken: token }));
    for (const obj of page.Contents || []) {
      const rel = obj.Key.slice(pre.length);
      if (!rel || rel.endsWith('/')) continue;
      const target = path.resolve(dir, rel);
      if (!target.startsWith(path.resolve(dir) + path.sep)) continue; // never write outside the upload folder
      const got = await client.send(new GetObjectCommand({ Bucket: bucket, Key: obj.Key }));
      const bytes = Buffer.from(await got.Body.transformToByteArray());
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, bytes);
      seen.set(obj.Key, signature(target));
      restored += 1;
    }
    token = page.IsTruncated ? page.NextContinuationToken : undefined;
  } while (token);
  log(`[backup] restored ${restored} uploaded file(s) from s3://${bucket}/${pre}`);
  return { restored, skipped: 0 };
}

// Upload anything new or changed since the last pass.
// Server-side encryption for backup copies: SSE-KMS with BACKUP_S3_KMS_KEY_ID, otherwise AES-256.
// Skipped for custom S3-compatible endpoints (BACKUP_S3_ENDPOINT), which may not accept the header, and with BACKUP_S3_SSE=none.
export function backupEncryption(env = process.env) {
  if (env.BACKUP_S3_ENDPOINT || /^none$/i.test(String(env.BACKUP_S3_SSE || ''))) return {};
  const kms = String(env.BACKUP_S3_KMS_KEY_ID || '').trim();
  return kms ? { ServerSideEncryption: 'aws:kms', SSEKMSKeyId: kms } : { ServerSideEncryption: 'AES256' };
}

export async function syncUploads({ client, bucket, prefix, dir, seen, log = console.log, encryption = {} }) {
  const { PutObjectCommand } = await import('@aws-sdk/client-s3');
  const pre = cleanPrefix(prefix);
  let uploaded = 0, failed = 0;
  for (const f of walk(dir)) {
    const key = pre + f.rel;
    let sig; try { sig = signature(f.full); } catch { continue; }
    if (seen.get(key) === sig) continue;
    try {
      await client.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: fs.readFileSync(f.full), ...encryption }));
      seen.set(key, sig); uploaded += 1;
    } catch (err) { failed += 1; log(`[backup] could not upload ${f.rel}: ${err.message}`); }
  }
  return { uploaded, failed };
}

export function startUploadSync({ env = process.env, uploadRoot, log = console.log, intervalMs = 120000 }) {
  const bucket = backupBucket(env);
  if (!bucket || env.NODE_ENV === 'test') return null;
  const prefix = env.BACKUP_S3_UPLOADS_PREFIX || 'super-pro/uploads';
  const seen = new Map();
  let running = false, timer;
  const pass = async () => {
    if (running) return; running = true;
    try {
      const client = await makeClient(env);
      const r = await syncUploads({ client, bucket, prefix, dir: uploadRoot, seen, log, encryption: backupEncryption(env) });
      if (r.uploaded) log(`[backup] saved ${r.uploaded} uploaded file(s) to S3`);
    } catch (err) { log(`[backup] upload sync failed: ${err.message}`); } finally { running = false; }
  };
  // Files that were just restored are already in the bucket; this primes the "seen" list without re-uploading them.
  (async () => { try { const client = await makeClient(env); await restoreUploads({ client, bucket, prefix, dir: uploadRoot, seen, log }); } catch {} timer = setInterval(pass, intervalMs); timer.unref?.(); setTimeout(pass, 15000).unref?.(); })();
  return { stop: () => clearInterval(timer), pass };
}
