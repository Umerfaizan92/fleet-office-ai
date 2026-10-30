# Backup and recovery (Phase 09)

## Objectives

| Objective | Target | How it is met |
|---|---|---|
| **RPO**, normal operation | **1 minute** (last 72 hours) | Litestream copies every database change to the backup bucket within about 5 seconds. Any point in the last 72 hours can be restored. |
| **RPO**, older problems | **24 hours** | A checked snapshot is taken daily, kept 35 days, then one a month for 12 months. |
| **RPO**, uploaded files | **2 minutes** | Upload sync to the backup bucket. Files are never deleted there, and bucket versioning keeps overwritten copies. |
| **RTO**, database | **1 hour** | Restore to a new file, check it, swap it in (runbook below). Restore tests record how long the download and check take. |
| **RTO**, full service | **4 hours** | New Render service from `render.yaml`, environment variables re-entered, database and uploads restored automatically on the first start (`scripts/start.mjs`). |

These targets assume the owner can reach Render and AWS. A restore always needs an approval: a person decides, and
nothing restores itself.

## Layers

1. **Continuous replication** (Litestream, running since Phase 02). `s3://BACKUP_S3_BUCKET/super-pro/db`: 5 s sync,
   hourly Litestream snapshots, 72 h retention. On an empty server, `scripts/start.mjs` restores from it before
   starting. The server refuses to start if the backup tool is missing.
2. **Daily snapshot** (new). A consistent copy made with SQLite's online backup while the app runs.
   - Each copy must pass `integrity_check` and the audit hash-chain check before upload.
   - It is gzipped and stored at `super-pro/snapshots/YYYY/MM/DD/<time>.sqlite.gz` next to a manifest holding its
     SHA-256, table row counts and the app commit.
   - It is uploaded with server-side encryption (AES-256, or KMS when `BACKUP_S3_KMS_KEY_ID` is set).
3. **Restore test** (new, weekly). Downloads the newest snapshot, checks its SHA-256 against the manifest, decompresses
   it to a temporary file and runs `integrity_check` and the audit chain check. It compares row counts with the
   manifest and the live database. It never touches the live database. The result shows on the dashboard.
4. **Configuration backup** (new, daily). Setting names, with secrets shown only as `[set]` or `[empty]`, plus plans,
   price history, platform automations and rules, under `super-pro/config/`.
5. **Render disk snapshots**: daily, kept 7 days, managed by Render ([docs](https://render.com/docs/disks)). Render
   warns that restoring a disk under a running database can corrupt it. Use layers 1 or 2 first.

Schedule: snapshots run between 1 and 5 am Perth time (or whenever the last one is over 30 hours old). The
configuration backup runs daily, the restore test weekly and the health summary each morning. Times are stored in the
database, so a restart neither repeats nor skips work.

## Bucket settings (owner, in the AWS console)

Use a bucket only for backups. It must be different from primary file storage; the app checks this.

1. **Block all public access**: on.
2. **Bucket Versioning**: enabled. Overwritten or deleted backups stay recoverable.
3. **Default encryption**: SSE-S3 or SSE-KMS.
4. **Lifecycle rules.** Retention is enforced by the bucket, not by app code, so the app never deletes a backup.
   Apply [`infra/aws/backup-lifecycle.json`](../../infra/aws/backup-lifecycle.json) (the single source of truth,
   extended in the consolidation release). It keeps:
   - old database versions for 35 days and upload copies for 90 days;
   - daily snapshots for 35 days and monthly copies for about 13 months;
   - configuration backups for 90 days.
   Litestream manages its own 72 h retention under `super-pro/db/`.
   Monthly copies: copy the first snapshot of each month to `super-pro/monthly/` (follow-up T-059).
5. **IAM.** Apply [`infra/aws/backup-iam-policy.json`](../../infra/aws/backup-iam-policy.json) to the backup user.
   - It allows delete **only** under `super-pro/db/`, where Litestream needs it to manage its own retention.
   - Snapshots, configuration and upload copies are get and put only, with no delete.
   - It adds read-only access to the bucket's versioning, encryption, lifecycle and public-access settings for the
     bucket check.

   Versioning plus no delete permission on the snapshot prefixes means a leaked backup key cannot erase snapshots.
6. Optional: **S3 Object Lock** (governance mode, 7 days) on the snapshots prefix for protection against ransomware.

## Settings

| Variable | Purpose |
|---|---|
| `BACKUP_S3_BUCKET`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION` | Backup bucket and keys (already used by Litestream). |
| `BACKUP_S3_KMS_KEY_ID` | Optional KMS key for every backup object. |
| `BACKUP_S3_SNAPSHOTS_PREFIX`, `BACKUP_S3_CONFIG_PREFIX` | Optional, default `super-pro/snapshots`, `super-pro/config`. |
| `BACKUP_SNAPSHOT_DIR` | Local folder for snapshots when there is no bucket (development only; not off-site). |
| `OPERATOR_ALERT_EMAIL` | Where critical alerts and the daily summary go (falls back to `OPERATOR_EMAIL`). |
| `RENDER_API_KEY`, `RENDER_SERVICE_ID` | Optional; lets Deployment health read the latest Render deploy. Read-only use. |
| `RELIABILITY_MEMORY_LIMIT_MB` | Memory limit used by the resource check (default 512, the current plan). |

## Restoring

See RUNBOOKS.md, "Database restore". In short:
1. Request approval in Founder Console > Reliability ("Restore the production database").
2. After approval, run `npm run backup:restore -- --approval <REF> --out /var/data/restore-candidate.sqlite` in the
   Render shell. It refuses to overwrite anything, checks the SHA-256, integrity and audit chain, and uses the approval
   up: a second attempt needs a new approval.
3. In a maintenance window: stop the service, keep the current file, move the restored file into place, start the
   service, check `/readyz` and Reliability, and mark the approval done.

For a point in time within the last 72 hours, use Litestream: `litestream restore -timestamp <RFC3339> -o
<new file> s3://BUCKET/super-pro/db`, then follow the same switch-over steps.
