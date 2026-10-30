# Database and storage

- SQLite through better-sqlite3 at `/var/data` on Render. The schema is created and migrated in code at startup.
- Files: object storage mode `disk` (default) or S3 primary (`s3-files.js`, signed URLs, private).
- Backups: see `docs/phase-09/BACKUP_AND_RECOVERY.md`.
  - Litestream continuous replication to `BACKUP_S3_BUCKET/super-pro/db`.
  - Daily checked snapshots, a weekly restore test and a daily config backup.
  - Restore with `npm run backup:restore` (needs an approval).
- AWS files: `infra/aws/backup-iam-policy.json`, `infra/aws/backup-lifecycle.json`. They have not been applied to a
  real AWS account from this environment.
