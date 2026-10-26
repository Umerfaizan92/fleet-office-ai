// One place that decides which S3 bucket (if any) the backups use.
// BACKUP_S3_BUCKET always wins. On Render, an existing AWS_S3_BUCKET is used too, so nothing needs renaming.
// BACKUP_DISABLED=1 switches backups off.
export function backupBucket(env = process.env) {
  if (/^(1|true|yes)$/i.test(String(env.BACKUP_DISABLED || ''))) return '';
  return env.BACKUP_S3_BUCKET || (env.RENDER ? env.AWS_S3_BUCKET : '') || '';
}
