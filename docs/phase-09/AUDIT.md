# Phase 09 audit: Render, database, AWS S3 and GitHub (2026-10-30)

## How this audit was done

I read the repository (`render.yaml`, `render.staging.yaml`, `scripts/start.mjs`, `src/s3-files.js`,
`src/backup-env.js`, `src/object-storage.js` and the CI workflows) and queried the GitHub API with the session's
access. I could not see the live Render dashboard or environment values, or the AWS account: there are no Render or
AWS credentials in this session, and none should be given to it. Where the live setting matters, the
**Owner to confirm** column says what to look at. The new Founder Console > Reliability tab checks most of these
items live once deployed ("Check the backup bucket", "Deployment health").

## Production data stores

| Data | Where it lives | Existing protection |
|---|---|---|
| Application database (businesses, customers, jobs, invoices, payments, audit log) | SQLite file `/var/data/super-pro.sqlite` on the Render persistent disk (`super-pro-data`, 10 GB) | Litestream (in `scripts/start.mjs`) streams changes to `s3://BACKUP_S3_BUCKET/super-pro/db`: 5 s sync, hourly snapshot, **72 h retention**. Render disk snapshots: daily, kept 7 days ([Render docs](https://render.com/docs/disks)). |
| Uploaded files (job photos, documents, logos) | `/var/data/uploads` on the same disk, or the primary S3 bucket when `OBJECT_STORAGE_MODE=s3` | Copied to `s3://BACKUP_S3_BUCKET/super-pro/uploads` every 2 minutes with SSE (AES-256 or KMS). Nothing is ever deleted from the bucket. |
| Configuration and secrets | Render environment variables | Not backed up before this phase. Phase 09 backs up setting **names** and safe values only. |
| Code and history | GitHub `Umerfaizan92/fleet-office-ai` | Hosted by GitHub. Recovery refs (`refs/recovery/*`) are local to each session. |
| Data held by providers | Stripe and PayPal (businesses' own accounts), Resend, Telnyx, Google, Meta | Held by each provider. Super Pro keeps its own records of what was sent and paid. |

## Findings

| # | Area | Finding | Risk | Phase 09 change | Owner to confirm |
|---|---|---|---|---|---|
| 1 | Backups | Point-in-time recovery covers only 72 hours (Litestream) and 7 days (Render disk). A problem noticed later, such as a bad import found after two weeks, cannot be undone. | High | Daily checked snapshots, kept 35 days then monthly for 12 months through bucket lifecycle rules. | Add the lifecycle rules in BACKUP_AND_RECOVERY.md. |
| 2 | Backups | `npm run backup:restore-drill` exists but nothing runs it. There was no proof a backup restores. | High | Weekly automatic restore test: checksum, `integrity_check`, audit chain and row counts. | Run one Litestream drill by hand after deploying. |
| 3 | S3 | Bucket versioning, default encryption, public-access block and lifecycle rules are not visible from the code. | High | Checked live in Reliability > "Check the backup bucket". | Turn on versioning, block public access, add lifecycle rules. |
| 4 | S3 | Primary and backup storage can use different buckets and keys; the code refuses the same bucket or key. | OK | Shown as "Separate backup bucket". | Primary S3 storage is off by default (disk). |
| 5 | Render | One instance, a persistent disk and `autoDeployTrigger: off`. Deploys are manual and cause a few seconds of downtime (disk services cannot do zero-downtime deploys). | Medium | Deployment health tracks restarts and, with `RENDER_API_KEY` and `RENDER_SERVICE_ID`, the latest deploy status. | Keep deploys manual; consider a maintenance message. |
| 6 | Render | `healthCheckPath: /healthz` only shows the process is up. `/readyz` also checks the database and the job queue. | Low | Availability check combines both. | Optional: point Render's health check at `/readyz`. |
| 7 | Render | The build runs `npm test`, so a failing test stops the deploy. Good. | OK | — | — |
| 8 | Monitoring | No alerts and no daily report. Failures were only in logs. | High | 14 component checks every 5 minutes, alerts, critical-alert email, daily summary. | Set `OPERATOR_ALERT_EMAIL`. |
| 9 | GitHub | The repository is **public**. | High (business decision) | None. Code changes nothing here. | Decide whether it should be private. Secrets are not in it (secret scanning and push protection are on). |
| 10 | GitHub | `main` has no branch protection and no rulesets. Anyone with write access can push or force-push to it. | High | None (infrastructure change). | Protect `main`: require PRs and the CI check, block force-pushes. |
| 11 | GitHub | CI runs only on pushes and PRs to `main`. The stacked phase PRs (#33 to #38) target other branches, so CI has not run on them. Every phase's tests were run locally. | Medium | None. | After merging #33, retarget each next PR to `main` so CI runs; or widen the `pull_request` branches filter. |
| 12 | GitHub | Secret scanning, push protection and Dependabot security updates are on. Push protection caught a test-shaped key in Phase 08. | OK | — | — |
| 13 | Secrets | Credentials live only in Render environment variables. There is no record of which are set. | Medium | Configuration backup lists setting names, each marked `[set]` or `[empty]`, never values. | Keep a password-manager copy of the secrets themselves (Super Pro never stores them). |
| 14 | Database | SQLite in WAL mode on one disk; writes stop if the disk fills. | Medium | Storage and database checks warn at 15% free disk and fail at 5%. | Watch disk use; raise `sizeGB` if needed (requires approval). |
