# Storage: backups and primary file storage

## What the existing S3 settings are for

Determined from every reference in the code (30 Oct 2026):

| Setting | Used by | Purpose |
| --- | --- | --- |
| `BACKUP_S3_BUCKET` (preferred) or `AWS_S3_BUCKET` (Render fallback) | `src/backup-env.js`, `scripts/start.mjs`, `src/s3-files.js` | **Backup only.** Litestream copies the database to `super-pro/db/` every 5 s; uploads are copied to `super-pro/uploads/` every 2 min; both are restored automatically on an empty server. |
| `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` | the same | The **backup** IAM user. |
| `OBJECT_STORAGE_BUCKET` | only listed in `scripts/check-config.mjs` before Phase 02 | Declared for primary storage but never implemented. Phase 02 implements it. |
| `KMS_KEY_ID`, `AWS_KMS_KEY_ID` | readiness check only | Not used by any code. Use `OBJECT_STORAGE_KMS_KEY_ID` and `BACKUP_S3_KMS_KEY_ID` instead. |

Conclusion: the configured bucket is a **backup** bucket. The backup keys are never used for primary storage; `src/object-storage.js` refuses to start primary storage if its bucket equals the backup bucket or its access key equals the backup key.

## Target layout

| | Backup bucket (exists) | Primary bucket (new) |
| --- | --- | --- |
| Example name | `superpro-backups-<account>` | `superpro-files-<account>` |
| Region | Sydney `ap-southeast-2` recommended (move if it is elsewhere) | Sydney `ap-southeast-2` |
| Contents | `super-pro/db/` Litestream generations, `super-pro/uploads/` copies | `tenants/<organisation>/<category>/<yyyy>/<mm>/<random id>` |
| IAM user | backup user: `infra/aws/backup-iam-policy.json` (deletes only under `super-pro/db/`, where Litestream manages retention) | storage user: `infra/aws/primary-storage-iam-policy.json` (put and get only; no delete, no list) |
| Encryption | Default bucket encryption (SSE-S3 or SSE-KMS); upload copies also send the header | SSE-KMS with `OBJECT_STORAGE_KMS_KEY_ID`, or SSE-S3; bucket policy refuses unencrypted uploads |
| Versioning | On | On |
| Public access | All four "block public access" settings on | All four on |
| Lifecycle | `infra/aws/backup-lifecycle.json`: database versions 35 days, upload copies 90 days, Infrequent Access after 30 days | `infra/aws/primary-lifecycle.json`: old versions 90 days, Infrequent Access after 90 days, health-check objects 1 day |
| Bucket policy | TLS only (add `DenyInsecureTransport` from the primary policy) | `infra/aws/primary-bucket-policy.json`: TLS only, encryption required, deletes only by a storage-admin role |
| Access from browsers | Never | Only through signed links, 30–900 s (default 120 s), issued after the organisation and job checks |

Replace `PRIMARY_BUCKET`, `BACKUP_BUCKET`, `ACCOUNT_ID` and the KMS key IDs in the JSON files before applying them.

## Setting up primary storage (staging first)

1. Create the bucket in `ap-southeast-2` with Block Public Access on, versioning on and default encryption on.
2. Create a KMS key for it (optional but recommended) and note its ARN.
3. Create the IAM user with `primary-storage-iam-policy.json` and an access key. Do not reuse the backup user.
4. Apply `primary-bucket-policy.json` and `primary-lifecycle.json`.
5. In the staging Render service, set `OBJECT_STORAGE_MODE=s3`, `OBJECT_STORAGE_BUCKET`, `OBJECT_STORAGE_REGION=ap-southeast-2`, `OBJECT_STORAGE_ACCESS_KEY_ID`, `OBJECT_STORAGE_SECRET_ACCESS_KEY`, `OBJECT_STORAGE_KMS_KEY_ID`.
6. In the Render shell: `npm run storage:verify -- --write-test`. Every line must say PASS.
7. Upload a before/after photo to a test job, open it, and confirm the address is a short-lived `amazonaws.com` link.
8. Only then repeat steps 1–7 for production.

Existing photos stay on the disk and keep working; only new uploads go to S3. A one-off copy of old job evidence into the primary bucket is a separate, approved step (it reads from the disk and writes new keys; nothing is deleted).

## Checking and hardening the backup bucket

1. `npm run storage:verify` in the production Render shell (read-only). Fix any FAIL: versioning, encryption, public access block, lifecycle, region.
2. Narrow the backup IAM user to `backup-iam-policy.json`.
3. Optional: `BACKUP_S3_KMS_KEY_ID` so upload copies use your KMS key.

## Malware scanning

Run a ClamAV daemon (for example a private Render service from the official `clamav/clamav` image on port 3310) and set `CLAMAV_HOST` (and `CLAMAV_PORT`). Without it, files are still checked by content and marked "not scanned" in the object metadata and audit log. Set `MALWARE_SCAN_REQUIRED=1` once the scanner has run reliably for a week; uploads then stop, rather than skip the scan, when it is down.

## Restore testing

- Automatic in CI: `scripts/restore-drill.test.mjs` replicates a database with Litestream, restores it and checks integrity, the audit chain and counts.
- Weekly in staging, monthly in production (Render shell): `npm run backup:restore-drill -- --compare /var/data/super-pro.sqlite`. It restores the latest S3 copy into a temporary file, never touches the live database, and prints PASSED or what failed.
- Record each drill (date, duration, result) as a task in Founder Console F07.

## Audit

Every stored object and every signed link writes `storage.object_stored` or `storage.signed_url_issued` to the hash-chained audit log with size, SHA-256 and scan result; a refused cross-business link writes `storage.access_denied`. Turn on S3 server access logging or CloudTrail data events on the primary bucket for an independent record.
