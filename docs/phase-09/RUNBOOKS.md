# Incident runbooks (Phase 09)

Start every incident in **Founder Console > Operations > Reliability & backups**. It shows which component is failing,
the open alerts, the backup status and recent self-healing. Acknowledge the alert so you know someone is on it, and
note what you did when you resolve it.

**Rules for every runbook**

- Production rollback, database restore, infrastructure migration, credential changes, permanent data deletion and
  major configuration changes need an approval first (Reliability > "Needs approval").
- A person carries these out. Nothing is retried automatically.
- If a destructive step fails, stop and work out why before trying again. Do not repeat it.
- Change one thing at a time and watch Reliability for 30 minutes before the next change.
- Never paste secrets into chats, tickets or this repository.

## 1. Site down or very slow
1. Check `/healthz` (process up) and `/readyz` (database and job queue).
   - Render > service > Logs: look for `[request] 5xx` lines and start-up errors such as `[backup]` and
     `[DIAGNOSTICS]`.
2. **Out of memory or restarting** (Deployment health: restarts; Resources: memory): restart the service once from
   Render. If it repeats, roll back (runbook 3) or raise the plan (needs approval).
3. **Disk full** (Storage check fails below 5% free): see runbook 7.
4. **Start-up refused with a `[backup]` message**: the server will not start without its backups. Fix the AWS keys or
   bucket named in the message. Only as an approved emergency, set `BACKUP_DISABLED=1`, then restore protection the
   same day.

## 2. Failed or bad deploy
1. Render > Events: find the failed deploy. A build that fails `npm test` never goes live, so nothing needs doing
   beyond fixing the change.
2. If a live deploy misbehaves, request approval for **Roll back production**. After approval, use Render > Events >
   the last good deploy > Rollback.
3. Check `/readyz` and run the checks in Reliability. Mark the approval done.

## 3. Database restore (corruption, bad import, mistaken change)
1. Stop the damage: if a bad import or automation is running, use the automation emergency pause
   (Operations > AI automations).
2. Choose the restore point:
   - within 72 hours: Litestream (any second);
   - up to 35 days: a daily snapshot (Reliability > Backups lists them; "Check the backup bucket" shows the
     inventory).
3. Request approval for **Restore the production database**, saying which restore point and why.
4. After approval, in the Render shell:
   `npm run backup:restore -- --approval <REF> --out /var/data/restore-candidate.sqlite [--snapshot <key>]`.
   - For Litestream, use `bin/litestream restore -timestamp <time> -o /var/data/restore-candidate.sqlite s3://<bucket>/super-pro/db`.
5. Check the candidate: the script reports the integrity and audit-chain checks. Open it read-only and check the
   records that mattered.
6. Maintenance window:
   1. Suspend the service in Render.
   2. Copy `/var/data/super-pro.sqlite` (and its `-wal`/`-shm` files) to `/var/data/pre-restore-<date>.sqlite`.
   3. Move the candidate to `/var/data/super-pro.sqlite`.
   4. Resume the service.
   5. Check `/readyz`, run Reliability checks, and take a fresh snapshot ("Back up now").
7. Mark the approval done. Record the incident (Operations > Incidents) with the restore point and the data lost
   between it and the incident.

## 4. Backup failing
- **Snapshot failed**: read the error in Reliability > Backups.
  - "AccessDenied" or "NoSuchBucket": check the bucket name and keys in Render; the keys need `s3:PutObject`.
  - "integrity_check failed": the live database itself may be damaged. Treat it as runbook 3 and do not overwrite
    anything.
- **Restore test failed with a checksum mismatch**: the stored copy is damaged or was altered. Take a new snapshot
  now, check versioning is on, and look at the S3 access logs.
- **Continuous replication not running**: Litestream starts with the server. Check the start-up logs for `[backup]`
  and that `BACKUP_S3_BUCKET` is set. The newest Litestream object age shows in "Check the backup bucket".
- **Bucket checks failing** (versioning, public access, lifecycle): fix them in the AWS console as described in
  BACKUP_AND_RECOVERY.md. This is a configuration change, so record who did it.

## 5. Payment webhooks failing
1. The Payment webhooks check shows refused (bad signature or unknown business) and errored messages.
2. **Refused**: the business's webhook signing secret does not match. Ask the business to reconnect Stripe or PayPal
   in Payment settings. Payment status is changed only by verified messages, so nothing was marked paid wrongly.
3. **Errors (5xx)**: Stripe retries for up to 3 days. Fix the error, then check the provider's event log. Super Pro
   de-duplicates events, so a replay is safe.
4. **Amount mismatch or unmatched**: check the payment in the business's provider account before marking anything
   paid.

## 6. Email, voice or AI provider outage
- **Email** (failed or bounced deliveries): check Resend status and domain verification. Customer messages that need
  approval stay saved. Resend them once the provider is back.
- **Voice** (calls with failed steps, Telnyx webhooks refused): check Telnyx status, the number's connection and
  `TELNYX_PUBLIC_KEY`. Calls fall back to transfer, voicemail or an apology automatically.
- **AI** (failure rate over 20%): check the provider status and key. AI features say they are unavailable rather than
  guessing. Switching provider is a configuration change (needs approval).

## 7. Disk nearly full
1. Storage check: free space under 15% is a warning, under 5% a failure.
2. Look at `/var/data`: the database, write-ahead log (WAL) and uploads. A large WAL normally shrinks after a
   checkpoint. Restarting once is safe.
3. Do not delete data to make room. Request approval for **Major configuration change** to raise the disk size
   (`sizeGB` in render.yaml or the dashboard), or **Delete data permanently** for a specific, reviewed clean-up.

## 8. Suspected credential leak or security incident
1. Security events: many refused Founder Console requests, audit chain check failed, or a provider warning.
2. Request approval for **Change or rotate a credential**. Then:
   1. Create the new key at the provider.
   2. Update it in Render and redeploy.
   3. Check the integration.
   4. Revoke the old key.
3. For the Founder key: rotate `ADMIN_API_KEY` and `OPERATOR_TOTP_SECRET` the same way. Every Founder session is
   then signed out.
4. Record the incident. If personal information may have been accessed, assess it under the Notifiable Data Breaches
   scheme ([OAIC](https://www.oaic.gov.au/privacy/notifiable-data-breaches)) within 30 days.

## 9. Background jobs stuck or failing
1. Background jobs check: dead jobs and lag.
2. Self-healing has already retried temporary failures of safe job types, at most twice per job. Reliability >
   Self-healing shows what it did and what it left for a person.
3. For anything left: read the error in Operations > Background jobs, fix the cause, then press Retry. Do not retry
   jobs that move money or delete data until you know why they failed.

## 10. Full region or provider loss (Render)
1. Request approval for **Migrate infrastructure**.
2. Create a new Render service (or another host) from `render.yaml` with the same environment variables (the
   configuration backup lists which ones were set).
3. On first start with an empty disk, `scripts/start.mjs` restores the database from Litestream and the uploads from
   the bucket.
4. Point the domain at the new service. Check `/readyz`, payment webhooks (update the URLs at providers if the
   domain changed) and Reliability.
