# Release candidate RC-2026-10-30 (Phases 01–10)

**Status: candidate, not deployed.** Production (Render) still runs `main` at `8318b9e`. Nothing here deploys
anything, and the owner decides when to release.

## What the candidate is

- Branch `phase-10-release`, opened as a pull request into `main`. It holds every commit from Phases 01–10. This is
  the first PR in the chain that targets `main`, so CI runs on it (see AUDIT finding 11).
- The stacked PRs #33 → #39 contain the same commits phase by phase. Merging the Phase 10 PR merges them all. Close
  the stacked PRs afterwards, or merge them in order first; the result is the same tree.
- Version stays `19.0.0` in `package.json`. Tag the merge commit `v20.0.0` when it is deployed.

## Before deploying (owner)

1. **Approval:** request "Deploy to production" in Founder Console > Reliability once the new version is live. For
   this first release, approve it by replying in chat.
2. **CI:** the Phase 10 PR's CI must be green (Secret scan, `npm test`, UI tests, integration, smoke, npm audit).
3. **Backup:** in the Render Shell, run the one-line database backup in `docs/DEPLOY.md` section 1. Then confirm the
   Litestream copy exists: the S3 console shows recent objects under `super-pro/db/`.
4. **Render environment variables.** Add the new optional settings you want:
   - `OPERATOR_ALERT_EMAIL`, so alerts and daily summaries reach you;
   - `PLATFORM_MAIL_FROM` and `SUPERPRO_ABN` or `SUPERPRO_POSTAL_ADDRESS`, for platform newsletters and invoices;
   - `RENDER_API_KEY` and `RENDER_SERVICE_ID`, if you want the deploy status shown.

   No existing variable needs to change.
5. **Schema:** every Phase 01–10 change only adds tables and columns (`CREATE TABLE IF NOT EXISTS`,
   `ALTER TABLE ... ADD COLUMN`). The old version can still read the new database, which makes rollback safe.
6. **Maintenance window:** the disk-backed service restarts on deploy, so expect a few seconds of downtime. Pick a
   quiet time (evening, Perth time).

## Deploying

Merge the Phase 10 PR into `main`, then use Render > Manual Deploy > "Deploy latest commit". The build runs
`npm ci && npm test`, and a failing test stops the deploy before it goes live.

## After deploying (within 30 minutes)

1. Run `npm run deploy:check -- https://<service>` locally, or open `/healthz` and `/readyz` (both must answer
   `ok`).
2. Founder Console > Operations > **Reliability & backups**:
   1. Run checks now.
   2. Check the backup bucket (fix any "fail": versioning, public access, lifecycle).
   3. Back up now.
   4. Test a restore.
3. Founder Console > Operations > AI automations: the emergency pause is off and there are no failed runs.
4. Workspace (a test business): open each Money, Communications and Website screen. Send one test enquiry through
   the website form and confirm it appears in the Unified Inbox.
5. Payments (in Stripe test mode with a test business's keys): one payment link, one partial refund (T-057).
6. Voice: one test call to a staging number (T-055).
7. Record the results in `docs/phase-10/REPORT.md` (Post-deploy evidence).

## Rollback plan

| Situation | Action | Data impact |
|---|---|---|
| Build fails on Render | Nothing to do: the old version keeps running. | None |
| New version live but broken (errors, failing checks) | Request "Roll back production". Render > Events > the previous deploy (`8318b9e`) > **Rollback**. Then check `/readyz` and Reliability. | None. The old code ignores the new tables and columns. |
| New version corrupted data | Roll back as above, then follow RUNBOOKS.md §3 (restore with approval) to a point before the deploy: Litestream within 72 h, or the pre-deploy backup file. | Changes since the restore point are lost; record them. |
| A single new feature misbehaves | Automations: use the emergency pause (Operations > AI automations), which stops every run. Payments, refunds and campaigns already need approval, so leave those requests unapproved. | None |

What makes rollback safe:
- all schema changes add tables and columns and change none;
- `autoDeployTrigger: off`;
- the pre-deploy backup;
- Litestream point-in-time recovery for 72 hours.

Rolling back does **not** undo emails, SMS messages or payments that were already sent. Those always need an approval
first.
