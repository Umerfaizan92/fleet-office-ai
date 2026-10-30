// Keeps uploaded files (job photos, documents, logos) safe in an S3 bucket so a redeploy never loses them.
// The database is protected separately (Litestream, see scripts/start.mjs). Nothing here ever deletes from the bucket.
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { backupBucket } from './backup-env.js';

export async function makeClient(env = process.env) {
  const { S3Client } = await import('@aws-sdk/client-s3');
  return new S3Client({
    region: env.AWS_REGION || env.AWS_DEFAULT_REGION || env.BACKUP_S3_REGION || 'us-east-1',
    ...(env.BACKUP_S3_ENDPOINT ? { endpoint: env.BACKUP_S3_ENDPOINT, forcePathStyle: true } : {})
  });
}

const RESTORE_MARKER = '.superpro-s3-restore.pending';
const isRestoreInternal = (name) => name === RESTORE_MARKER || /^\.superpro-s3-restore-[0-9a-f-]+\.tmp$/.test(name);

function* walk(dir, base = dir) {
  let entries = [];
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const e of entries) {
    if (isRestoreInternal(e.name)) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) yield* walk(full, base);
    else if (e.isFile()) yield { full, rel: path.relative(base, full).split(path.sep).join('/') };
  }
}
const signature = (file) => { const s = fs.statSync(file); return `${s.size}:${Math.floor(s.mtimeMs)}`; };
const cleanPrefix = (p) => String(p || 'super-pro/uploads').replace(/^\/+|\/+$/g, '') + '/';

// Restore only a fresh folder, or resume our own interrupted restore. Existing
// customer files are never overwritten. Local files are not proof of S3 durability.
export async function restoreUploads({ client, bucket, prefix, dir, seen = new Map(), log = console.log }) {
  const { ListObjectsV2Command, GetObjectCommand } = await import('@aws-sdk/client-s3');
  const pre = cleanPrefix(prefix);
  fs.mkdirSync(dir, { recursive: true });
  const root = fs.realpathSync(dir);
  const marker = path.join(root, RESTORE_MARKER);
  let resuming = false;
  try {
    if (!fs.lstatSync(marker).isFile()) throw new Error('Unsafe S3 restore marker.');
    const pending = JSON.parse(fs.readFileSync(marker, 'utf8'));
    if (pending.version !== 1 || pending.bucket !== bucket || pending.prefix !== pre) throw new Error('Pending S3 restore belongs to a different backup source.');
    resuming = true;
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
  const existing = [...walk(root)];
  if (existing.length && !resuming) return { restored: 0, skipped: existing.length };
  if (!resuming) fs.writeFileSync(marker, JSON.stringify({ version: 1, bucket, prefix: pre }), { flag: 'wx', mode: 0o600 });
  let token, restored = 0, skipped = 0;
  const tokens = new Set();
  do {
    const page = await client.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: pre, ContinuationToken: token }));
    for (const obj of page.Contents || []) {
      if (typeof obj.Key !== 'string' || !obj.Key.startsWith(pre)) continue;
      const rel = obj.Key.slice(pre.length);
      if (!rel || rel.endsWith('/') || rel.split('/').some(isRestoreInternal)) continue;
      const target = path.resolve(root, rel);
      if (!target.startsWith(root + path.sep)) continue;
      // Reject symlinks even inside root: a link could cross tenant directories.
      let parent = root;
      for (const segment of path.relative(root, target).split(path.sep)) {
        parent = path.join(parent, segment);
        try { if (fs.lstatSync(parent).isSymbolicLink()) throw new Error('S3 restore refuses symbolic links.'); }
        catch (error) { if (error.code !== 'ENOENT') throw error; }
      }
      if (fs.existsSync(target)) { skipped += 1; continue; }
      const got = await client.send(new GetObjectCommand({ Bucket: bucket, Key: obj.Key }));
      const bytes = Buffer.from(await got.Body.transformToByteArray());
      fs.mkdirSync(path.dirname(target), { recursive: true });
      const temporary = path.join(path.dirname(target), `.superpro-s3-restore-${randomUUID()}.tmp`);
      try {
        fs.writeFileSync(temporary, bytes, { flag: 'wx', mode: 0o600 });
        // A crash leaves only an ignored temporary file; the final name is atomic.
        // linkSync refuses to overwrite a file created since the check above.
        try { fs.linkSync(temporary, target); }
        catch (error) { if (error.code !== 'EEXIST') throw error; skipped += 1; continue; }
      } finally { try { fs.unlinkSync(temporary); } catch (error) { if (error.code !== 'ENOENT') throw error; } }
      seen.set(obj.Key, signature(target));
      restored += 1;
    }
    token = page.IsTruncated ? page.NextContinuationToken : undefined;
    if (page.IsTruncated && (!token || tokens.has(token))) throw new Error('S3 restore pagination did not advance.');
    if (token) tokens.add(token);
  } while (token);
  fs.unlinkSync(marker);
  log(`[backup] restored ${restored} uploaded file(s) from s3://${bucket}/${pre}`);
  return { restored, skipped };
}

// Upload anything new or changed since the last pass.
export async function syncUploads({ client, bucket, prefix, dir, seen, log = console.log }) {
  const { PutObjectCommand } = await import('@aws-sdk/client-s3');
  const pre = cleanPrefix(prefix);
  let uploaded = 0, failed = 0;
  for (const f of walk(dir)) {
    const key = pre + f.rel;
    let sig; try { sig = signature(f.full); } catch { continue; }
    if (seen.get(key) === sig) continue;
    try {
      await client.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: fs.readFileSync(f.full) }));
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
      const r = await syncUploads({ client, bucket, prefix, dir: uploadRoot, seen, log });
      if (r.uploaded) log(`[backup] saved ${r.uploaded} uploaded file(s) to S3`);
    } catch (err) { log(`[backup] upload sync failed: ${err.message}`); } finally { running = false; }
  };
  // Only files restored by this invocation are known to be in S3. Existing local
  // files must be uploaded again after restart; never mark them durable by assumption.
  (async () => { try { const client = await makeClient(env); await restoreUploads({ client, bucket, prefix, dir: uploadRoot, seen, log }); } catch {} timer = setInterval(pass, intervalMs); timer.unref?.(); setTimeout(pass, 15000).unref?.(); })();
  return { stop: () => clearInterval(timer), pass };
}
