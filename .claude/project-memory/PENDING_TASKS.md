# Pending tasks

Ordered: the first task whose status is not COMPLETED is the one to resume. Status values: NOT_STARTED, IN_PROGRESS,
BLOCKED, TESTING, COMPLETED. When a task is verified, move it to COMPLETED_TASKS.md with its evidence.

## T-037 Accessible names that match visible text in the Business OS (P03 follow-up)
- Status: BLOCKED
- Blocked by: owner approval (existing tests and the console page use the current labels; they change together).
- Requirement: "Pin navigation" button labelled "Expand main navigation"; co-pilot button showing "Ask Super Pro"
  labelled "Open Super Pro AI co-pilot"; dashboard tiles' labels do not contain their visible text.
- Acceptance: axe `label-content-name-mismatch` 0 on workspace; tests updated in the same commit.

## T-040 Create enquiries from inbox messages and receptionist calls
- Status: NOT_STARTED
- Added: 2026-10-30
- Requirement: Phase 04 remaining gap (docs/phase-04/VERIFICATION.md)
- Files: not known yet
- Acceptance: Owner approval of scope; tests added; verify:modules clean

## T-041 Customer-facing quote and invoice documents (PDF or email from the record)
- Status: NOT_STARTED
- Added: 2026-10-30
- Requirement: Phase 04 remaining gap (docs/phase-04/VERIFICATION.md)
- Files: not known yet
- Acceptance: Owner approval of scope; tests added; verify:modules clean

## T-042 Attachments on enquiries, quotes and invoices
- Status: NOT_STARTED
- Added: 2026-10-30
- Requirement: Phase 04 remaining gap (docs/phase-04/VERIFICATION.md)
- Files: not known yet
- Acceptance: Owner approval of scope; tests added; verify:modules clean

## T-043 Notifications for pipeline events
- Status: NOT_STARTED
- Added: 2026-10-30
- Requirement: Phase 04 remaining gap (docs/phase-04/VERIFICATION.md)
- Files: not known yet
- Acceptance: Owner approval of scope; tests added; verify:modules clean

## T-044 Pipeline summary on the Today dashboard
- Status: NOT_STARTED
- Added: 2026-10-30
- Requirement: Phase 04 remaining gap (docs/phase-04/VERIFICATION.md)
- Files: not known yet
- Acceptance: Owner approval of scope; tests added; verify:modules clean

## T-045 Store backup restore-drill results for the Storage & backups tab
- Status: NOT_STARTED
- Added: 2026-10-30
- Requirement: Phase 04 remaining gap (docs/phase-04/VERIFICATION.md)
- Files: not known yet
- Acceptance: Owner approval of scope; tests added; verify:modules clean

## T-047 Phase 05 follow-up: inbound Inbox messages as automation triggers
- Status: NOT_STARTED
- Added: 2026-10-30
- Requirement: Emails, SMS and social messages recorded by recordInbound should emit an inbox.message event (untrusted text) so automations can classify and draft replies
- Files: src/saas-platform.js, src/automation/*
- Acceptance: Contract test: inbound email starts an automation, text treated as untrusted, injection forces approval

## T-048 Phase 05 follow-up: move the automation scheduler to a worker process
- Status: NOT_STARTED
- Added: 2026-10-30
- Requirement: The per-minute automation scheduler runs in the web process; move it to a worker before running more than one instance
- Files: src/automation/engine.js, render.yaml (needs owner approval)
- Acceptance: Owner-approved plan; schedules still run once per period

## T-050 Phase 06 follow-up: fix the public-site SEO findings
- Status: NOT_STARTED
- Added: 2026-10-30
- Requirement: Owner decision: legal pages noindex vs sitemap; shorten 7 long titles; add 3 meta descriptions; trim 3 long descriptions; responsive images; complete structured data; permanent redirect for /start (see docs/phase-06/REPORT.md)
- Files: site/, src/server.js sitemap
- Acceptance: Platform audit shows none of these findings; test:visual and site tests pass

## T-051 Phase 06 follow-up: image re-encoding for the Website Builder
- Status: NOT_STARTED
- Added: 2026-10-30
- Requirement: Add an image library (sharp) to convert uploads to WebP/AVIF with sizes; needs owner approval for the new dependency on Render
- Files: package.json, src/seo/*
- Acceptance: Uploaded JPEG becomes WebP with srcset; Render build passes

## T-052 Phase 06 follow-up: custom domains for builder sites
- Status: NOT_STARTED
- Added: 2026-10-30
- Requirement: Serve a business site on its own domain: DNS verification and certificates on Render (infrastructure change, owner approval)
- Files: render.yaml, src/seo/routes.js
- Acceptance: Owner-approved plan; domain ownership verified before serving

## T-053 Phase 06: record live Google evidence after deploy
- Status: NOT_STARTED
- Added: 2026-10-30
- Requirement: After deploy with Google credentials: run Check connection for each Google service and Sync; confirm seo_google_checks rows show ok=1 with real samples
- Files: none (operational)
- Acceptance: Each connected service shows Verified in the Google Integration Centre

## T-055 Live Telnyx and Resend verification for Phase 07
- Status: NOT_STARTED
- Added: 2026-10-30
- Requirement: Place a staging test call (assistant, transcript, transfer, voicemail) and send a test campaign; confirm Resend receipts reach /api/webhooks/communications/resend
- Files: src/comms/voice.js, src/comms/service.js
- Acceptance: Live call and email evidence recorded in docs/phase-07/REPORT.md

## T-057 Live Stripe test-mode check for Phase 08
- Status: NOT_STARTED
- Added: 2026-10-30
- Requirement: With a business's Stripe test keys: create a payment link, pay it, request and approve a partial and a full refund; confirm webhooks and job balances
- Files: src/payments.js, src/finance/service.js
- Acceptance: Evidence recorded in docs/phase-08/REPORT.md

## T-059 Monthly snapshot copies for long-term retention
- Status: NOT_STARTED
- Added: 2026-10-30
- Requirement: Copy the first daily snapshot of each month to super-pro/monthly/ (S3 Batch Operations or a put-only scheduled copy)
- Files: src/reliability/backup.js, docs/phase-09/BACKUP_AND_RECOVERY.md
- Acceptance: Monthly copies present and covered by the 400-day lifecycle rule

## T-060 Live reliability check after deploy (Phase 09)
- Status: NOT_STARTED
- Added: 2026-10-30
- Requirement: On production: Check the backup bucket, Back up now, Test a restore, run npm run backup:restore-drill, set OPERATOR_ALERT_EMAIL, record results
- Files: docs/phase-09/REPORT.md
- Acceptance: Results recorded; all bucket checks OK

## T-062 Final consolidation on consolidated-improvements-2026
- Status: IN_PROGRESS
- Added: 2026-10-30
- Requirement: Owner prompt 2026-10-30 23:25 (attachment): recover history, verify Phases 00-10 and the six earlier design/development prompts, preserve every feature, consolidate on branch consolidated-improvements-2026, run all checks, write docs/release/* (9 files), commit, push, record SHA, stop before deploy
- Files: docs/release/*
- Acceptance: Branch pushed with exact SHA; 9 release docs with evidence; all suites pass; no deploy

## T-063 Recover the Claude eleven-prompt release and reconcile security fixes
- Status: TESTING
- Added: 2026-10-30
- Requirement: Owner completed Prompt 00 through Prompt 10 in Claude and transferred SUPER_PRO_AI_EMERGENCY_HANDOVER.zip. The previous preview deployed the older baseline. Preserve consolidated-improvements-2026 and all 470 matching archive files; verify and release the actual implementation with the tested storage/isolation fixes.
- Files: src; saas; office; scripts; docs/release
- Acceptance: Correct source proved by archive hashes; release tests and preview acceptance pass; production data and credentials preserved

## Roadmap correction
The eleven prompts 00–10 were received and implemented in Claude. The former "P04 onwards not received" placeholder was stale. Phase completion evidence is in MASTER_PLAN.md; the concrete unfinished tasks above remain open.

T-062 historical stop-before-deploy instruction is superseded operationally by the owner's later explicit requests to push to Render. Its consolidation evidence is carried forward in T-063; neither task is marked complete before the correct-source CI and hosted acceptance pass.
