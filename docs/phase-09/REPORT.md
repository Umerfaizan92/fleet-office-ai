# Phase 09 report: automated backup and reliability engine

Branch `phase-09-reliability`, stacked on `phase-08-finance` (PR #38). The prompt is in `PROMPT.md`. See also:
- `AUDIT.md`: Render, database, S3 and GitHub audit, with the data stores and findings
- `BACKUP_AND_RECOVERY.md`: RPO and RTO, layers, bucket settings, lifecycle JSON, IAM, restore steps
- `RUNBOOKS.md`: ten incident runbooks

## Most important limitation first

This session has no access to the live Render or AWS accounts, and should not have any. The S3 backup, verify and
bucket-check code was tested against a local S3 stand-in that speaks the S3 REST protocol through the real AWS SDK.
The Render deploy check was not tested against the live Render API. Once deployed, press "Check the backup bucket"
and "Run checks now" in Reliability to see the real state. The audit items for the owner are in `AUDIT.md`. The most
urgent are:
- protect `main`;
- decide whether the repository should stay public;
- turn on bucket versioning;
- add the lifecycle rules.

## What was built

**Backups** (`src/reliability/backup.js`)
- Daily consistent snapshots made with SQLite's online backup. Each one is checked (`integrity_check` and the audit
  hash chain), gzipped, given a SHA-256 manifest and uploaded with server-side encryption to the separate backup
  bucket.
- A weekly restore test downloads the snapshot, checks the SHA-256, decompresses it, re-checks integrity and the
  audit chain, and compares row counts with the manifest and the live database. It never touches the live database.
- A daily configuration backup lists setting names and safe values. Secrets appear only as `[set]` or `[empty]`.
- Bucket checks cover reachability, separation from primary storage, versioning, default encryption, lifecycle
  rules, the public-access block and Litestream freshness.
- Inventory: the snapshot count, and how many of the last 7 days have one.
- No code deletes backups. Retention is enforced by S3 lifecycle rules, and the documented IAM policy has no delete
  permission.
- Litestream continuous replication stays as it was (point-in-time recovery for 72 hours). `scripts/start.mjs` now
  marks the process so the monitor can report it.

**Monitoring and alerting** (`src/reliability/monitor.js`)
- 14 checks every 5 minutes: availability, API failures, authentication errors, database performance, storage, queue,
  AI, voice, email, payment webhooks, backups, deployment, resources and security.
- Inputs come from the app's own records:
  - request counts per route group (paths only);
  - jobs, delivery records, calls, payment events and backups;
  - an AI outcome hook (no prompt text);
  - the upload sync status;
  - the latest Render deploy, when `RENDER_API_KEY` and `RENDER_SERVICE_ID` are set.
- Alerts open and close themselves.
  - A failing check opens a critical alert straight away and emails `OPERATOR_ALERT_EMAIL`.
  - A warning becomes an alert only after three checks in a row.
  - Alerts can be acknowledged and resolved with a note.
- Daily health summary: every component, the alerts, backup status and recovery readiness (RPO and RTO). It is saved
  and emailed each morning (Perth time).

**Self-healing** (`src/reliability/heal.js`), bounded:
- Jobs that failed on a temporary error, and whose type is safe to repeat, get 2 more attempts, at most twice per job.
  After that a person decides.
- Never retried automatically: job types that delete, restore, roll back, migrate, change credentials or move money,
  and automation steps that are not read-only.
- Stuck jobs and stuck automation runs are reported, not restarted.
- Expired public caches and old temporary backup files are cleared. Monitoring telemetry is kept for 14 to 30 days.
- A failed backup-bucket connection is rebuilt once and re-checked.

**Actions that always need approval**: production rollback, database restore, infrastructure migration, credential
change, data deletion and major configuration change.
- Each is a Level 3 manual platform action. It runs zero automatic attempts, and a person carries it out after a
  named approver says yes.
- `npm run backup:restore` needs an approved restore request and uses that approval once. It restores only to a new
  file and checks the SHA-256, integrity and audit chain.

**Dashboard**: Founder Console > Operations & maintenance > Reliability & backups. It shows the components, alerts,
readiness, backups and restore tests, self-healing, approval requests and daily summaries, and fits phone and iPad.

## Small changes elsewhere
- `src/ai-provider-shim.js`: `generateAiText` is wrapped to report success or failure to the monitor (same behaviour
  otherwise).
- `src/job-queue.js`: exposes `types()`.
- `src/s3-files.js`: upload sync records its last success or failure. Encryption headers are now also sent to custom
  S3 endpoints when `BACKUP_S3_SSE` is set explicitly; the default is unchanged.
- `src/automation/catalogue.js`: the six approval-only actions.

## Tests

| Suite | Result |
|---|---|
| `scripts/reliability.test.mjs`: backups and tamper detection, monitoring and alerts, self-healing bounds, approval-only restore | 4/4 |
| `npm run test:reliability-ui`: 7 browser checks, including axe and phone/iPad fit | 7/7 |
| Full suites | see the PR description |

## New settings
- `OPERATOR_ALERT_EMAIL` (recommended)
- `RENDER_API_KEY` and `RENDER_SERVICE_ID` (optional, read-only use)
- `BACKUP_S3_KMS_KEY_ID` (optional)
- `RELIABILITY_MEMORY_LIMIT_MB` (optional)
- `BACKUP_SNAPSHOT_DIR` (development only)

## Follow-ups
- T-059: copy the first snapshot of each month into `super-pro/monthly/` (S3 Batch Operations, or a scheduled copy
  with put-only rights).
- T-060: live check after deploy. Run the bucket check, take a snapshot, run a restore test, run one Litestream
  restore drill (`npm run backup:restore-drill`), and record the results.
- The `AUDIT.md` owner items (GitHub protection, repository visibility, bucket settings).
