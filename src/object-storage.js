// Primary private object storage for business files (separate from backups).
//
// Configuration (names only):
//   OBJECT_STORAGE_MODE=s3            switch on; anything else keeps files on the local disk exactly as before
//   OBJECT_STORAGE_BUCKET             the primary bucket (must differ from the backup bucket)
//   OBJECT_STORAGE_REGION             defaults to AWS_REGION
//   OBJECT_STORAGE_ACCESS_KEY_ID / OBJECT_STORAGE_SECRET_ACCESS_KEY   a dedicated IAM user; backup keys are never used
//   OBJECT_STORAGE_KMS_KEY_ID         optional; SSE-KMS with this key, otherwise SSE-S3 (AES-256)
//   OBJECT_STORAGE_PREFIX             optional, default "tenants"
//   OBJECT_STORAGE_URL_TTL_SECONDS    signed link lifetime, 30–900, default 120
//   OBJECT_STORAGE_ENDPOINT           optional S3-compatible endpoint (tests, MinIO)
//
// Keys are tenants/<organisation>/<category>/<yyyy>/<mm>/<random id>. File names never appear in keys.
// Every read goes through a short-lived signed link issued only after the caller's organisation matches the key.
import crypto from 'node:crypto';
import { backupBucket } from './backup-env.js';

const SAFE_SEGMENT = /^[a-z0-9][a-z0-9-]{0,62}$/;
const ORG_ID = /^[a-zA-Z0-9-]{8,64}$/;

export function storageConfig(env = process.env) {
  const mode = String(env.OBJECT_STORAGE_MODE || 'disk').trim().toLowerCase();
  const bucket = String(env.OBJECT_STORAGE_BUCKET || '').trim();
  const accessKeyId = String(env.OBJECT_STORAGE_ACCESS_KEY_ID || '').trim();
  const secretAccessKey = String(env.OBJECT_STORAGE_SECRET_ACCESS_KEY || '').trim();
  const backup = String(backupBucket({ ...env, RENDER: env.RENDER || '1' }) || '').trim();
  const problems = [];
  if (mode === 's3') {
    if (!bucket) problems.push('OBJECT_STORAGE_BUCKET is not set.');
    if (!accessKeyId || !secretAccessKey) problems.push('OBJECT_STORAGE_ACCESS_KEY_ID and OBJECT_STORAGE_SECRET_ACCESS_KEY must be set (backup keys are never used for primary storage).');
    if (bucket && backup && bucket === backup) problems.push('The primary bucket must be different from the backup bucket.');
    if (accessKeyId && accessKeyId === String(env.AWS_ACCESS_KEY_ID || '').trim()) problems.push('Primary storage must use its own IAM user, not the backup access key.');
  }
  const ttl = Math.min(900, Math.max(30, Number(env.OBJECT_STORAGE_URL_TTL_SECONDS || 120)));
  return {
    mode: mode === 's3' ? 's3' : 'disk',
    ready: mode === 's3' && problems.length === 0,
    problems, bucket,
    region: String(env.OBJECT_STORAGE_REGION || env.AWS_REGION || 'ap-southeast-2').trim(),
    endpoint: String(env.OBJECT_STORAGE_ENDPOINT || '').trim(),
    kmsKeyId: String(env.OBJECT_STORAGE_KMS_KEY_ID || '').trim(),
    prefix: String(env.OBJECT_STORAGE_PREFIX || 'tenants').replace(/^\/+|\/+$/g, '') || 'tenants',
    urlTtlSeconds: ttl,
    credentials: accessKeyId && secretAccessKey ? { accessKeyId, secretAccessKey } : null
  };
}

export function tenantKey(cfg, organisationId, category, now = new Date()) {
  if (!ORG_ID.test(String(organisationId || ''))) throw new Error('Invalid organisation for storage.');
  if (!SAFE_SEGMENT.test(String(category || ''))) throw new Error('Invalid storage category.');
  const yyyy = now.getUTCFullYear(), mm = String(now.getUTCMonth() + 1).padStart(2, '0');
  return `${cfg.prefix}/${organisationId}/${category}/${yyyy}/${mm}/${crypto.randomUUID()}`;
}

export function keyBelongsTo(cfg, key, organisationId) {
  const k = String(key || '');
  return ORG_ID.test(String(organisationId || '')) && k.startsWith(`${cfg.prefix}/${organisationId}/`) && !k.includes('..') && !k.includes('//');
}

export function createObjectStorage({ env = process.env, client = null, presign = null, audit = () => {} } = {}) {
  const cfg = storageConfig(env);
  let s3 = client;
  const sdk = async () => import('@aws-sdk/client-s3');
  async function getClient() {
    if (s3) return s3;
    if (!cfg.ready) throw new Error('Primary object storage is not configured: ' + cfg.problems.join(' '));
    const { S3Client } = await sdk();
    s3 = new S3Client({ region: cfg.region, credentials: cfg.credentials, ...(cfg.endpoint ? { endpoint: cfg.endpoint, forcePathStyle: true } : {}) });
    return s3;
  }
  const encryption = () => (cfg.kmsKeyId ? { ServerSideEncryption: 'aws:kms', SSEKMSKeyId: cfg.kmsKeyId } : { ServerSideEncryption: 'AES256' });

  async function put({ organisationId, category, body, contentType, actorId = null, scan = null }) {
    const key = tenantKey(cfg, organisationId, category);
    const sha256 = crypto.createHash('sha256').update(body).digest('hex');
    const { PutObjectCommand } = await sdk();
    await (await getClient()).send(new PutObjectCommand({
      Bucket: cfg.bucket, Key: key, Body: body, ContentType: contentType, ...encryption(),
      ChecksumSHA256: Buffer.from(sha256, 'hex').toString('base64'),
      Metadata: { org: organisationId, sha256, scan: String(scan?.status || 'not_scanned') }
    }));
    audit({ action: 'storage.object_stored', organisationId, actorId, key, size: body.length, sha256, scan: scan?.status || 'not_scanned' });
    return { key, sha256, size: body.length };
  }

  async function signedUrl({ organisationId, key, filename = 'file', contentType, actorId = null }) {
    if (!keyBelongsTo(cfg, key, organisationId)) { audit({ action: 'storage.access_denied', organisationId, actorId, key }); throw Object.assign(new Error('Not found.'), { status: 404 }); }
    const { GetObjectCommand } = await sdk();
    const signer = presign || (await import('@aws-sdk/s3-request-presigner')).getSignedUrl;
    const safeName = String(filename).replace(/[^\w.\- ]+/g, '_').slice(0, 120) || 'file';
    const url = await signer(await getClient(), new GetObjectCommand({
      Bucket: cfg.bucket, Key: key, ResponseContentType: contentType,
      ResponseContentDisposition: `inline; filename="${safeName}"`
    }), { expiresIn: cfg.urlTtlSeconds });
    audit({ action: 'storage.signed_url_issued', organisationId, actorId, key, ttl: cfg.urlTtlSeconds });
    return { url, expiresIn: cfg.urlTtlSeconds };
  }

  return { config: cfg, put, signedUrl, keyBelongsTo: (key, org) => keyBelongsTo(cfg, key, org) };
}
