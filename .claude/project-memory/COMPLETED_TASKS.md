# Completed tasks

A task appears here only after its acceptance criteria were verified. Each entry: ID, requirement, files, evidence.
Newest last. Never edit evidence after the fact; add a correcting entry instead.

## T-000 Repository discovery and preservation audit (P00)
- Requirement: inventory, feature classification A–I, security/deployment baseline, preservation strategy, 10 outputs; stop after the report.
- Files: none (read-only audit).
- Evidence: report delivered in chat on 2026-10-29. Not stored in the repository.

## T-001 Competitor intelligence and master blueprint (P01)
- Requirement: Salesforce, HubSpot, monday.com research; 50+ capability comparison; blueprint for three products; capability matrix; deliverables 1–8.
- Files: none.
- Evidence: report delivered in chat on 2026-10-29. Not stored in the repository.

## T-002 Enterprise infrastructure and security (P02)
- Requirement: server-side role enforcement, tenant isolation, private encrypted storage with signed URLs and file validation, backup separation and restore drill, job queue, observability, dev/staging/prod plan, CI security checks.
- Files: `src/security-policy.js`, `file-safety.js`, `object-storage.js`, `job-queue.js`, `observability.js`, `staff-access.js`, `db.js`, `s3-files.js`; `scripts/*` (tests and tools listed in PROGRESS.md); `infra/aws/*`; `render.staging.yaml`; `docs/infrastructure/*`; `.github/*`.
- Evidence: commit `5cf7377`; `npm test` passed; delivered as bundle and patch on 2026-10-30.

## T-003 Design tokens and component library (P03)
- Files: `saas/ds/tokens.css`, `components.css`, `icons.svg`, `motion.js`.
- Evidence: commit `6b387fd`; contrast table in `docs/design/DESIGN_SYSTEM.md` (all AA).

## T-004 Public website, 19 pages (P03)
- Files: `scripts/site/content.mjs`, `templates.mjs`, `scripts/build-site.mjs`, `saas/site/*.html`, `src/public-site.js`, `src/server.js` (route, sitemap, robots, llms.txt), `saas/ds/site.js`, `site.css`, `saas/ds/src/hero-3d.mjs`, `scripts/build-ds.mjs`, `saas/content/testimonials.json`.
- Evidence: commits `6b387fd`, `6a5ddc8`; `public-site.test.mjs` (11 checks) and `test:site-ui` 15/15.

## T-005 Retheme existing pages and app motion (P03)
- Files: `saas/ds/retheme.css`, `app-motion.js`, 22 pages listed in `docs/design/DESIGN_SYSTEM.md`, `scripts/test-ui.mjs` (accent assertion).
- Evidence: `test:ui` 33/33 at `6a5ddc8`; visual review at 390/768/1440.

## T-006 Visual regression, accessibility and performance (P03)
- Files: `scripts/test-visual.mjs`, `scripts/report-a11y-perf.mjs`, `scripts/visual/session.mjs`, `qa/reports/*`, `docs/design/DESIGN_SYSTEM.md`.
- Evidence: 51 screens identical on repeat runs; axe 0 issues on new site; LCP 0.7–1.2 s throttled mobile; commit `6a5ddc8`; `npm test` 73/73.

## T-036 Fix "Live update" notice sliding under the folded rail on phones (P03 follow-up)
- Requirement: on 390 px the Business OS "Live update" notice is partly hidden behind the folded navigation rail.
  It must sit fully inside the content area. Existed before P03.
- Files: likely `saas/ds/retheme.css` (no layout changes to other elements).
- Acceptance: notice fully visible at 390 and 768; `test:ui` 33/33; `test:visual` only the expected screens change.
- Files changed: saas/ds/retheme.css (+ .br/.gz); scripts/test-ui.mjs
- Evidence: test:ui 34/34 incl. new notice-vs-rail check at 390/700/768/1440 (fails without the rule); test:visual 51 same; npm test 73/73; public-site tests 11/11. Fix finished by a fresh Claude Code session in the recovery drill (recorded 2026-10-30 on phase-03-cinematic-design at 98f6389)

## T-035 Persistent autosave, checkpoint and resume system (P03.5)
- Requirement (owner prompt, 2026-10-30, summarised): persistent project memory in `CLAUDE.md` and
  `.claude/project-memory/` (MASTER_PLAN, PROGRESS, COMPLETED_TASKS, PENDING_TASKS, DECISIONS, ERROR_LOG,
  SESSION_HANDOVER, CHECKPOINTS); task IDs and statuses; checkpoints with timestamp, phase, task, steps, files, tests,
  branch, commit, errors, next action; automatic resume detection that verifies git state instead of trusting notes;
  handover before context runs out; atomic commits, no force-push, no automatic push without permission; failure
  recovery that never blindly retries migrations, payments, emails, deploys or external APIs; Claude Code hooks for
  startup and handover without loops; a recovery drill; no secrets in memory.
- Files: `CLAUDE.md`, `.claude/settings.json`, `.claude/project-memory/*`, `scripts/memory/*` (incl. `task.mjs`), `docs/process/PROJECT_MEMORY.md`,
  `scripts/project-memory.test.mjs`, `package.json`.
- Acceptance: memory files present and validated; `npm run memory:checkpoint`, `memory:snapshot`, `memory:resume`,
  `memory:validate` work; SessionStart hook prints state; contract test passes inside `npm test`; recovery drill
  (start task → snapshot → lose working tree → new session → resume → finish without repeating) passes.
- Remaining: see SESSION_HANDOVER.md.
- Files changed: CLAUDE.md; .claude/settings.json; .claude/project-memory/*; scripts/memory/*; scripts/project-memory.test.mjs; docs/process/PROJECT_MEMORY.md; package.json
- Evidence: commit 0af91f5; npm test 73/73; test:unit 132/132 incl. 5 project-memory tests; memory:validate, security:secrets, verify:manifest, smoke:test pass; recovery drill passed: fresh Claude Code session resumed and finished T-036 without repeating completed work (docs/process/PROJECT_MEMORY.md) (recorded 2026-10-30 on phase-03-cinematic-design at 0af91f5)

## T-038 Publish P02/P03 to GitHub
- Requirement: get the P02, P03 and P03.5 commits onto GitHub without touching main.
- Acceptance: branch `phase-03-cinematic-design` on GitHub matches the local branch; pull request into main open for the owner's review (no merge, no deploy).
- Evidence: branch phase-03-cinematic-design pushed to GitHub at 4d2c1c3 (matches local); pull request #33 into main opened for owner review; main untouched at 8318b9e; nothing merged or deployed (recorded 2026-10-30 on phase-03-cinematic-design at 4d2c1c3)

## T-039 Phase 04: complete Business Operating System integration
- Added: 2026-10-30
- Requirement: Owner prompt 2026-10-30 (full text in docs/phase-04/PROMPT.md). Use the Phase 00 inventory as mandatory preservation checklist; improve every existing module; complete broken or disconnected workflows. Subscriber workspace: dashboard, business setup, CRM/customers, enquiries, quotations, bookings, jobs, work orders, worker allocation, workforce compliance, offshore staff, AI receptionist, unified inbox, email and messaging, invoices, payments, accounting and GST, marketing, campaigns, social media, content studio, website management, SEO, AI approvals, files and documents, reports, analytics, branding, notifications, help and support, integrations, automation settings. Preserve pipeline Enquiry > Quote > Booking > Allocation > Completion > Invoice > Payment with correct propagation. Founder console: subscriber admin, organisation management, plans, platform billing, revenue analytics, infrastructure status, storage and backups, AI usage and costs, platform marketing, system email, support tickets, security and audit logs, feature flags, compliance, platform configuration; keep subscriber business comms separate from founder platform comms. Unified navigation, search, filters, notifications, activity history, AI assistance, file attachments, permissions, mobile. Never show success for a backend action that did not succeed. Every existing feature verified working or documented with blockers.
- Files: src/*, saas/*, office/*, scripts/*
- Acceptance: Feature inventory saved; pipeline end-to-end test passes; every module verified or blocker documented in docs/phase-04/VERIFICATION.md; no false success messages (tested); npm test and UI suites pass
- Files changed: src/pipeline.js, src/platform-health.js, src/business-ops.js, src/business-hub.js, src/staff-access.js, src/server.js, saas/workspace-pipeline.*, saas/workspace-ops.js, saas/workspace-nav.js, office/console-platform.*, office/console.js, scripts/*.test.mjs, scripts/test-pipeline-ui.mjs, scripts/test-console-platform.mjs, scripts/verify-modules.mjs, docs/phase-04/*
- Evidence: commit 55d009e; npm test 73/73; test:unit 139/139; test:ui 34/34; test:pipeline-ui 15/15; test:console-ui 12/12; verify:modules 47/47 with 0 problems; test:visual 51 unchanged; axe clean on new screens; report docs/phase-04/VERIFICATION.md (recorded 2026-10-30 on phase-04-business-os at 55d009e)

## T-046 Phase 05: autonomous AI operations with human governance
- Added: 2026-10-30
- Requirement: Owner prompt 2026-10-30 (full text in docs/phase-05/PROMPT.md). Central AI automation engine with 20 capabilities; 4-level approval policy (automatic, rule-based automatic, human approval, restricted); approval queue with full metadata and Approve/Reject/Edit/Schedule/Request clarification; server-side authorisation, structured tool schemas, idempotency keys, bounded retries, rate limits, complete audit; AI never follows instructions in untrusted content; no-code builder Trigger > Conditions > AI Analysis > Proposed Action > Approval > Execution > Verification with dry-run, versions, error recovery, emergency pause.
- Files: src/automation/*, saas/*, office/*, scripts/*
- Acceptance: Engine, policies, builder, queue and audit report working; level rules enforced and tested; injection and permission tests; npm test and UI suites pass; docs/phase-05/REPORT.md
- Evidence: Commits 2863893 and c6bc352: npm test 73/73, test:unit 155/155 (automation-governance 7, automation-engine 8), test:automations-ui 11/11 incl. axe and phone/iPad, test:ui 34/34, pipeline-ui 15/15, console-ui 14/14, verify:modules 49 modules 0 problems, visual 51 unchanged, a11y-perf clean; report docs/phase-05/REPORT.md (recorded 2026-10-30 on phase-05-ai-automation at c6bc352)

## T-049 Phase 06: autonomous SEO, Google and website intelligence platform
- Added: 2026-10-30
- Requirement: docs/phase-06/PROMPT.md (verbatim): modules A-H, deliverables 1-10, strict account separation, no fabricated search data, no ranking guarantees, human approval for public claims and production releases
- Files: src/seo/*, src/server.js, saas/workspace-seo-*.js, office/console-platform.js, scripts/*seo*.test.mjs, docs/phase-06/*
- Acceptance: Contract and browser tests for every module; real crawler/audit tested against the running server; Google clients tested against documented response formats and a live self-test recorded when credentials and network exist; report lists anything not verified
- Evidence: Commit 426b472: npm test 73/73, test:unit 169/169 (seo-audit 5, seo-units 5, seo-platform 4), test:seo-ui 11/11 with axe and phone/iPad, test:ui 34/34, pipeline-ui 15/15, console-ui 16/16, automations-ui 11/11, verify:modules 54/0, visual 51 unchanged, a11y-perf clean; live Google evidence tracked as T-053; report docs/phase-06/REPORT.md (recorded 2026-10-30 on phase-06-seo-platform at 426b472)

## T-054 Phase 07: unified communication and campaign automation
- Added: 2026-10-30
- Requirement: docs/phase-07/PROMPT.md (verbatim): channels, unified inbox folders and views, 10 AI functions, Telnyx voice audit and improvements, campaigns (email/SMS/social, calendar, scheduling, segments, tracking, AI recommendations, approvals), consent/unsubscribe/suppression, founder email isolation
- Files: src/comms/*, src/server.js, saas/workspace-comms-*.js, office/console-platform.js, scripts/*comms*.test.mjs, docs/phase-07/*
- Acceptance: End-to-end tests for inbox, AI functions, voice webhook flow against a mock Telnyx API, campaigns with approval and compliance, founder separation; report lists anything not verified live
- Evidence: comms.test 6/6, test:comms-ui 10/10, npm test, test:unit, test:ui, test:site-ui, test:pipeline-ui, test:console-ui, test:automations-ui, test:seo-ui, test:visual, security:secrets all pass; report:a11y-perf passes (home TBT lab variance, unchanged page) (recorded 2026-10-30 on phase-07-communications at 56086ac)

## T-056 Phase 08: finance, payments and compliance automation
- Added: 2026-10-30
- Requirement: docs/phase-08/PROMPT.md (verbatim)
- Files: src/finance/*, saas/workspace-finance-platform.*, office/console-platform.js, scripts/finance*.test.mjs, docs/phase-08/*
- Acceptance: Tested subscriber finance workflows (quotes, estimates, deposits, tax invoices, GST, receipts, payment links/status, refunds and credit notes with approval, reconciliation, reports, overdue reminders), platform billing (plans, trials, renewals, failures, changes with approval, revenue), payment architecture review, AI assists with approvals, versioned AU rules with sources, audit log, compliance review list; all suites pass
- Evidence: finance.test 6/6, test:finance-ui 11/11, npm test, test:unit 181/181, test:ui, test:site-ui, test:pipeline-ui, test:console-ui, test:automations-ui, test:seo-ui, test:comms-ui (re-run 10/10 after removing a racy assertion), test:visual, report:a11y-perf, security:secrets all pass (recorded 2026-10-30 on phase-08-finance at ed9de92)

## T-058 Phase 09: automated backup and reliability engine
- Added: 2026-10-30
- Requirement: docs/phase-09/PROMPT.md (verbatim)
- Files: src/reliability/*, office/console-platform.js, scripts/reliability*.test.mjs, docs/phase-09/*
- Acceptance: Audit of Render/DB/S3/GitHub; snapshot backups (encrypted, separate bucket, integrity, manifest), restore verification, config backup, retention via lifecycle, RPO/RTO doc; monitors for all listed components with alerts and daily summary; bounded self-healing; approval-only destructive actions; Founder dashboard; runbooks; tests pass
- Evidence: reliability.test 4/4, test:reliability-ui 7/7, npm test, test:unit 185/185, test:ui, test:site-ui, test:pipeline-ui, test:console-ui, test:automations-ui, test:seo-ui, test:comms-ui, test:finance-ui, test:visual, report:a11y-perf, security:secrets all pass (recorded 2026-10-30 on phase-09-reliability at e5c8c8c)

## T-061 Phase 10: final QA, security audit and release candidate
- Added: 2026-10-30
- Requirement: docs/phase-10/PROMPT.md (verbatim), including the automation policy table
- Files: scripts/release-audit.mjs, scripts/release-security.test.mjs, docs/phase-10/*
- Acceptance: Functional inventory diff vs main shows no removed routes/IDs (or each explained); security, automation, frontend, SEO and infrastructure audits evidenced by tests; verified failures fixed; all suites pass; release candidate, rollback plan and final report; pushed; not deployed
- Evidence: test:unit 197/197, npm test 74 checks, all UI suites, test:visual, report:a11y-perf (0 over budget), verify:modules 54/0, smoke, integration, deploy:check, release:audit, release-seo-check, security:secrets, npm audit 0 all pass (recorded 2026-10-30 on phase-10-release at 96bf844)

## T-064 Navigation prompts 1-6: nested sidebar and contextual sections
- Added: 2026-10-31
- Requirement: Owner authorises all six navigation prompts in this conversation: verify current live baseline; nested sidebar in both portals; contextual top section tabs; clarify overlap and readiness; responsive accessibility; complete regression matrix and release candidate. Preserve all routes permissions records and functions. Save checkpoints for resumption. No production deployment.
- Files: saas/portal-shell.*; saas/focused-workspace.*; saas/workspace-nav.js; office/console.*; scripts; docs/navigation
- Acceptance: All 60 business entries and 34 founder tabs mapped; nested sidebar and contextual sections work across roles and sizes; tests and repository checks pass; changes committed and saved; deployment remains separate
- Evidence: Implementation commit c10b382587ec87e9001f7c741f6f8616ee06c581; full npm test 45 contract files and 73/73 checks; committed-tree test:fast 69/69; navigation browser 575; reviewed visual 12; main UI 34 pipeline 15 automation 11 founder 16 SEO 11 comms 10 finance 11 reliability 7; module checks 66 with zero problems; quality smoke integration secrets manifest memory passed. Production unchanged. (recorded 2026-10-31 on codex/navigation-hierarchy-20261031 at c10b382)
