// One place that decides which S3 bucket (if any) the backups use.
// BACKUP_S3_BUCKET always wins. On Render, an existing AWS_S3_BUCKET is used too, so nothing needs renaming.
// BACKUP_DISABLED=1 switches backups off.
export function backupBucket(env = process.env) {
  if (/^(1|true|yes)$/i.test(String(env.BACKUP_DISABLED || ''))) return '';
  return env.BACKUP_S3_BUCKET || (env.RENDER ? env.AWS_S3_BUCKET : '') || '';
}

// Finds the AWS keys even when they were saved under a slightly different name, and trims stray spaces or line breaks
// that often come along when a key is pasted. Only names are ever reported, never values.
const ID_NAMES = ['AWS_ACCESS_KEY_ID', 'AWS_S3_ACCESS_KEY_ID', 'AWS_S3_ACCESS_KEY', 'AWS_ACCESS_KEY', 'S3_ACCESS_KEY_ID', 'S3_ACCESS_KEY', 'BACKUP_S3_ACCESS_KEY_ID'];
const SECRET_NAMES = ['AWS_SECRET_ACCESS_KEY', 'AWS_S3_SECRET_ACCESS_KEY', 'AWS_S3_SECRET_KEY', 'AWS_S3_SECRET', 'AWS_SECRET_KEY', 'AWS_SECRET', 'S3_SECRET_ACCESS_KEY', 'S3_SECRET_KEY', 'S3_SECRET', 'BACKUP_S3_SECRET_ACCESS_KEY'];
const clean = (v) => String(v ?? '').replace(/^[\s"']+|[\s"']+$/g, '');
export function backupCredentials(env = process.env) {
  const pick = (names, fuzzy) => {
    for (const n of names) if (clean(env[n])) return { name: n, value: clean(env[n]) };
    const hits = Object.keys(env).filter((k) => /(AWS|S3)/i.test(k) && !/KMS|BUCKET|REGION|ENDPOINT/i.test(k) && fuzzy.test(k) && clean(env[k]));
    return hits.length === 1 ? { name: hits[0], value: clean(env[hits[0]]) } : null;
  };
  const id = pick(ID_NAMES, /ACCESS/i);
  const secret = pick(SECRET_NAMES, /SECRET/i);
  return { id, secret, region: clean(env.AWS_REGION || env.AWS_DEFAULT_REGION || env.BACKUP_S3_REGION), bucket: clean(backupBucket(env)) };
}
export function awsVariableNames(env = process.env) {
  return Object.keys(env).filter((k) => /(AWS|S3|BACKUP)/i.test(k)).sort();
}
// Writes the cleaned values back so the S3 client and Litestream both see standard names.
export function applyBackupEnv(env = process.env) {
  const c = backupCredentials(env);
  if (c.id) env.AWS_ACCESS_KEY_ID = c.id.value;
  if (c.secret) env.AWS_SECRET_ACCESS_KEY = c.secret.value;
  if (c.region) env.AWS_REGION = c.region;
  if (c.bucket) env.BACKUP_S3_BUCKET = c.bucket;
  return c;
}
