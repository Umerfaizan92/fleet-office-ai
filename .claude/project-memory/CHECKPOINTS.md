# Checkpoints

Append-only log written by `npm run memory:checkpoint`. Each entry records timestamp, phase, task, completed and
incomplete steps, files, tests and results, branch, commit, recovery snapshot, known errors and the exact next action.
Do not edit past entries; add a new checkpoint to correct one.

## CP-001 2026-10-30T12:27:38+08:00 T-035 TESTING
- Phase: P03.5 Persistent autosave, checkpoint and resume
- Task: T-035 (TESTING)
- Completed steps: memory files, scripts, hooks and contract test written; npm test 73/73; committed
- Incomplete steps: live recovery drill with T-036 in a fresh clone and a new Claude Code session; record results
- Files modified (uncommitted at checkpoint): none
- Tests executed: npm test; node --test scripts/project-memory.test.mjs; memory:validate; security:secrets; verify:manifest
- Test results: 73/73; 4/4; valid; pass; pass
- Git branch: phase-03-cinematic-design
- Commit: 83b4365 (Project memory: autosave, checkpoint and resume system (T-035)); branch not on remote
- Recovery snapshot: not requested
- Known errors: none
- Next exact action: start T-036 (Live update notice on phones) as the drill task

## CP-002 2026-10-30T12:28:17+08:00 T-036 IN_PROGRESS
- Phase: P03 follow-up (recovery drill for T-035)
- Task: T-036 (IN_PROGRESS)
- Completed steps: measured: at 390 px notices span 2-368 px, rail covers 0-56 px; at 768 px no overlap; wrote the CSS rule in saas/ds/retheme.css
- Incomplete steps: npm run build:ds; measure notice position at 390 and 768; npm run test:ui; npm run test:visual (re-baseline only if the notice is the only change); npm test; commit; mark T-036 COMPLETED with evidence; then finish T-035 drill notes
- Files modified (uncommitted at checkpoint): saas/ds/retheme.css
- Tests executed: none
- Test results: none
- Git branch: phase-03-cinematic-design
- Commit: 136c3d5 (Checkpoint CP-001: T-035 in testing); branch not on remote
- Recovery snapshot: refs/recovery/phase-03-cinematic-design/20261030T042817Z (eea0472)
- Known errors: none
- Next exact action: restore the snapshot (npm run memory:restore -- --latest), then run npm run build:ds

## CP-003 2026-10-30T12:30:00+08:00 T-036 IN_PROGRESS
- Phase: P03 follow-up (recovery drill for T-035)
- Task: T-036 (IN_PROGRESS)
- Completed steps: restored snapshot; CSS rule now uses --portal-rail
- Incomplete steps: build:ds, geometry check, test:ui, test:visual, npm test, commit
- Files modified (uncommitted at checkpoint): saas/ds/retheme.css; saas/ds/retheme.css.br; saas/ds/retheme.css.gz
- Tests executed: none
- Test results: none
- Git branch: phase-03-cinematic-design
- Commit: 98f6389 (Resume check: the task named in the handover wins while it is open (E-009))
- Recovery snapshot: refs/recovery/phase-03-cinematic-design/20261030T043000Z (eb1fb52)
- Known errors: none
- Next exact action: npm run build:ds then verify toast geometry

## CP-004 2026-10-30T12:39:05+08:00 T-036 TESTING
- Phase: P03 follow-up (recovery drill for T-035)
- Task: T-036 (TESTING)
- Completed steps: rule uses --portal-rail; new test:ui check (fails without rule); build:ds run; test:ui 34/34, test:visual 51 same, npm test 73/73, manifest/secrets/memory validate pass
- Incomplete steps: move T-036 to COMPLETED_TASKS.md, drop it from PENDING_TASKS.md, PROGRESS test:ui 33->34 (edits to .claude/project-memory were refused), then commit
- Files modified (uncommitted at checkpoint): .claude/project-memory/CHECKPOINTS.md; .claude/project-memory/SESSION_HANDOVER.md; SHA256SUMS.txt; saas/ds/retheme.css; saas/ds/retheme.css.br; saas/ds/retheme.css.gz; scripts/test-ui.mjs
- Tests executed: test:ui; test:visual; npm test; verify:manifest; security:secrets; memory:validate
- Test results: 34/34; 51 same; 73/73; pass; pass; pass (uncommitted tree)
- Git branch: phase-03-cinematic-design
- Commit: 98f6389 (Resume check: the task named in the handover wins while it is open (E-009))
- Recovery snapshot: refs/recovery/phase-03-cinematic-design/20261030T043905Z (6c3a5d8)
- Known errors: none
- Next exact action: get permission to edit .claude/project-memory files, make those 3 edits, run manifest:update, commit T-036 (retheme.css/.br/.gz, test-ui.mjs, SHA256SUMS.txt, memory files)

## CP-005 2026-10-30T12:45:25+08:00 T-035
- Phase: P03.5 completed; waiting for the owner's next phase prompt
- Task: T-035
- Completed steps: T-035 verified and committed (0af91f5)
- Incomplete steps: owner publishes the branch to GitHub (T-038); owner decides on T-037
- Files modified (uncommitted at checkpoint): .claude/project-memory/COMPLETED_TASKS.md; .claude/project-memory/PENDING_TASKS.md; .claude/project-memory/PROGRESS.md
- Tests executed: npm test; test:unit; memory:validate; security:secrets; verify:manifest; smoke:test
- Test results: 73/73; 132/132; valid; pass; pass; pass
- Git branch: phase-03-cinematic-design
- Commit: 0af91f5 (Project memory: memory:task command, recovery drill write-up (T-035)); branch not on remote
- Recovery snapshot: not requested
- Known errors: none
- Next exact action: wait for the owner's next phase prompt (P04 or other); record it in PENDING_TASKS.md with npm run memory:task -- add before starting

## CP-006 2026-10-30T12:45:58+08:00 T-035
- Phase: P03.5 completed; waiting for the owner's next phase prompt
- Task: T-035
- Completed steps: resume check lists only snapshots newer than the last checkpoint and says when every open task is blocked; T-037 marked BLOCKED pending owner approval
- Incomplete steps: none
- Files modified (uncommitted at checkpoint): .claude/project-memory/PENDING_TASKS.md; SHA256SUMS.txt; scripts/memory/resume.mjs
- Tests executed: project-memory tests; memory:validate; verify:manifest
- Test results: 5/5; valid; pass
- Git branch: phase-03-cinematic-design
- Commit: 15b1374 (Checkpoint: T-035 completed with evidence); branch not on remote
- Recovery snapshot: not requested
- Known errors: none
- Next exact action: wait for the owner's next phase prompt (P04 or other); record it with npm run memory:task -- add before starting

## CP-007 2026-10-30T12:45:59+08:00 T-035
- Phase: P03.5 completed; waiting for the owner's next phase prompt
- Task: T-035
- Completed steps: committed 885f3cc; npm test pending re-run
- Incomplete steps: none
- Files modified (uncommitted at checkpoint): none
- Tests executed: project-memory tests
- Test results: 5/5
- Git branch: phase-03-cinematic-design
- Commit: 885f3cc (Resume check: only new snapshots, clear message when all open tasks are blocked; T-037 waits for approval); branch not on remote
- Recovery snapshot: not requested
- Known errors: none
- Next exact action: wait for the owner's next phase prompt; record it with npm run memory:task -- add before starting

## CP-008 2026-10-30T12:47:11+08:00 T-035
- Phase: P03.5 completed; waiting for the owner's next phase prompt
- Task: T-035
- Completed steps: final verification on 885f3cc: npm test 73/73
- Incomplete steps: none
- Files modified (uncommitted at checkpoint): .claude/project-memory/CHECKPOINTS.md; .claude/project-memory/SESSION_HANDOVER.md
- Tests executed: npm test; project-memory tests; memory:validate; verify:manifest
- Test results: 73/73; 5/5; valid; pass
- Git branch: phase-03-cinematic-design
- Commit: 885f3cc (Resume check: only new snapshots, clear message when all open tasks are blocked; T-037 waits for approval); branch not on remote
- Recovery snapshot: not requested
- Known errors: none
- Next exact action: wait for the owner's next phase prompt (P04 or other); record it with npm run memory:task -- add before starting

## CP-009 2026-10-30T12:56:24+08:00 T-038
- Phase: P03.5 completed; PR #33 awaiting owner review
- Task: T-038
- Completed steps: branch pushed; PR #33 opened
- Incomplete steps: none
- Files modified (uncommitted at checkpoint): .claude/project-memory/COMPLETED_TASKS.md; .claude/project-memory/PENDING_TASKS.md; .claude/project-memory/PROGRESS.md; .claude/project-memory/SESSION_HANDOVER.md
- Tests executed: verify:manifest; memory:validate
- Test results: pass; valid
- Git branch: phase-03-cinematic-design
- Commit: 4d2c1c3 (Project memory: branch published to GitHub (T-038 in progress, D-014))
- Recovery snapshot: not requested
- Known errors: none
- Next exact action: wait for the owner: review/merge PR #33, decide T-037, send the next phase prompt

## CP-010 2026-10-30T12:57:12+08:00 T-039
- Phase: P04 Business OS integration
- Task: T-039
- Completed steps: branch phase-04-business-os created from phase-03-cinematic-design
- Incomplete steps: save prompt; build feature inventory from code; map pipeline; test end to end
- Files modified (uncommitted at checkpoint): .claude/project-memory/PENDING_TASKS.md
- Tests executed: none
- Test results: none
- Git branch: phase-04-business-os
- Commit: c5d9d90 (Project memory: PR #33 opened (T-038 completed)); branch not on remote
- Recovery snapshot: not requested
- Known errors: none
- Next exact action: save prompt to docs/phase-04/PROMPT.md, then inventory routes and UI modules

## CP-011 2026-10-30T13:06:47+08:00 T-039
- Phase: P04 Business OS integration
- Task: T-039
- Completed steps: pipeline server layer + end-to-end test committed (4d3a739)
- Incomplete steps: pipeline UI in workspace; dashboard pipeline strip; inbox/receptionist to enquiry; module-by-module verification of all subscriber and founder modules; false-success audit; verification report
- Files modified (uncommitted at checkpoint): none
- Tests executed: pipeline.test.mjs; npm test
- Test results: 2/2; 73/73
- Git branch: phase-04-business-os
- Commit: 4d3a739 (Phase 04: connect the subscriber pipeline end to end (server)); branch not on remote
- Recovery snapshot: not requested
- Known errors: none
- Next exact action: build saas/workspace-pipeline.js replacing the generic enquiry/quote/booking/invoice views

## CP-012 2026-10-30T13:16:36+08:00 T-039
- Phase: P04 Business OS integration
- Task: T-039
- Completed steps: pipeline screens committed (e221942)
- Incomplete steps: dashboard pipeline card; inbox/receptionist to enquiry; jobs view shows linked booking; module-by-module verification (subscriber 32, founder 15, unified 9); false-success audit across frontend; verification report
- Files modified (uncommitted at checkpoint): none
- Tests executed: pipeline.test.mjs; test-pipeline-ui.mjs; test:ui; npm test
- Test results: 2/2; 12/12; 34/34; 73/73
- Git branch: phase-04-business-os
- Commit: e221942 (Phase 04: connected pipeline screens for Enquiries, Quotes, Bookings and Invoices); 1 commit(s) not on origin/phase-04-business-os
- Recovery snapshot: not requested
- Known errors: none
- Next exact action: write the module verification harness (scripts/verify-modules.mjs) driving every workspace and console route

## CP-013 2026-10-30T13:29:20+08:00 T-039
- Phase: P04 Business OS integration
- Task: T-039
- Completed steps: founder console tabs committed (e689d94)
- Incomplete steps: verification harness over all 32 subscriber + 15 founder + 9 unified items; false-success audit of frontend; dashboard pipeline card; inbox to enquiry; verification report
- Files modified (uncommitted at checkpoint): none
- Tests executed: platform-health.test; test:console-ui; test:ui; npm test
- Test results: 2/2; 12/12; 34/34; 73/73
- Git branch: phase-04-business-os
- Commit: e689d94 (Phase 04: Founder Console revenue, infrastructure, backups, AI usage, compliance, configuration); 1 commit(s) not on origin/phase-04-business-os
- Recovery snapshot: not requested
- Known errors: none
- Next exact action: write scripts/verify-modules.mjs and docs/phase-04/VERIFICATION.md

## CP-014 2026-10-30T13:42:32+08:00 T-039
- Phase: P04 Business OS integration
- Task: T-039
- Completed steps: offshore staff, automation, module harness committed (a7f632c); 47/47 modules clean
- Incomplete steps: unified experience review (navigation, search, filters, notifications, activity, AI, attachments, permissions, mobile); write docs/phase-04/VERIFICATION.md; final full test run; PR
- Files modified (uncommitted at checkpoint): none
- Tests executed: business-ops.test; test:pipeline-ui; test:ui; verify:modules; npm test
- Test results: 2/2; 14/14; 34/34; 47/47; 73/73
- Git branch: phase-04-business-os
- Commit: a7f632c (Phase 04: Offshore Staff, Automation overview, module inventory and harness); 1 commit(s) not on origin/phase-04-business-os
- Recovery snapshot: not requested
- Known errors: none
- Next exact action: review unified experience items and write docs/phase-04/VERIFICATION.md

## CP-015 2026-10-30T13:56:09+08:00 T-039
- Phase: P04 completed; waiting for the owner's review of PR and next prompt
- Task: T-039
- Completed steps: Phase 04 verified and committed (55d009e)
- Incomplete steps: none
- Files modified (uncommitted at checkpoint): .claude/project-memory/COMPLETED_TASKS.md; .claude/project-memory/PENDING_TASKS.md; .claude/project-memory/PROGRESS.md
- Tests executed: npm test; test:unit; test:ui; test:pipeline-ui; test:console-ui; verify:modules
- Test results: 73/73; 139/139; 34/34; 15/15; 12/12; 47/47
- Git branch: phase-04-business-os
- Commit: 55d009e (Phase 04: record search in the workspace, verification report); 1 commit(s) not on origin/phase-04-business-os
- Recovery snapshot: not requested
- Known errors: none
- Next exact action: wait for the owner: review PR for phase-04-business-os; choose which remaining gap (T-040..T-045) to do next

## CP-016 2026-10-30T13:56:52+08:00 T-039
- Phase: P04 completed; waiting for the owner's review of PR and next prompt
- Task: T-039
- Completed steps: manifest fix committed (69d11c0)
- Incomplete steps: none
- Files modified (uncommitted at checkpoint): none
- Tests executed: none
- Test results: none
- Git branch: phase-04-business-os
- Commit: 69d11c0 (Manifest: exclude project memory and generated reports (E-012)); 3 commit(s) not on origin/phase-04-business-os
- Recovery snapshot: not requested
- Known errors: none
- Next exact action: wait for the owner: review the Phase 04 pull request; choose which remaining gap (T-040..T-045) to do next

## CP-017 2026-10-30T13:58:49+08:00 T-039
- Phase: P04 completed; waiting for the owner's review of PR and next prompt
- Task: T-039
- Completed steps: PR #34 opened
- Incomplete steps: none
- Files modified (uncommitted at checkpoint): .claude/project-memory/PROGRESS.md
- Tests executed: none
- Test results: none
- Git branch: phase-04-business-os
- Commit: 113eea1 (Checkpoint: manifest fix verified)
- Recovery snapshot: not requested
- Known errors: none
- Next exact action: wait for the owner: merge #33 then #34; choose the next task (T-040..T-045) or send the next phase prompt

## CP-018 2026-10-30T14:09:22+08:00 T-046 IN_PROGRESS
- Phase: P04 completed; waiting for the owner's review of PR and next prompt
- Task: T-046 (IN_PROGRESS)
- Completed steps: Refactors in pipeline/server/mail-centre; src/automation/catalogue.js written
- Incomplete steps: engine.js, routes.js, server wiring, approvals extension, UI, tests, report
- Files modified (uncommitted at checkpoint): .claude/project-memory/PENDING_TASKS.md; src/mail-centre.js; src/pipeline.js; src/server.js; docs/phase-05/PROMPT.md; src/automation/catalogue.js
- Tests executed: none
- Test results: none
- Git branch: phase-05-ai-automation
- Commit: af72660 (Checkpoint: PR #34 opened); branch not on remote
- Recovery snapshot: refs/recovery/phase-05-ai-automation/20261030T060922Z (cbe7462)
- Known errors: none
- Next exact action: Write src/automation/engine.js

## CP-019 2026-10-30T16:15:35+08:00 T-046 IN_PROGRESS
- Phase: P04 completed; waiting for the owner's review of PR and next prompt
- Task: T-046 (IN_PROGRESS)
- Completed steps: engine.js, routes.js, server wiring (events from pipeline, business hub, payments), approval queue Schedule/Clarify and automation decision hook; scripts/automation.test.mjs 6/6 pass
- Incomplete steps: sweep test of every action, in-process retry/idempotency tests, builder UI, approvals UI, founder tab, full suites, report, commit, PR
- Files modified (uncommitted at checkpoint): .claude/project-memory/CHECKPOINTS.md; .claude/project-memory/PENDING_TASKS.md; .claude/project-memory/SESSION_HANDOVER.md; scripts/automation.test.mjs; src/business-hub.js; src/mail-centre.js; src/payments.js; src/pipeline.js; src/server.js; docs/phase-05/PROMPT.md; src/automation/catalogue.js; src/automation/engine.js; src/automation/routes.js
- Tests executed: none
- Test results: none
- Git branch: phase-05-ai-automation
- Commit: af72660 (Checkpoint: PR #34 opened); branch not on remote
- Recovery snapshot: refs/recovery/phase-05-ai-automation/20261030T081535Z (2cd6e9d)
- Known errors: none
- Next exact action: Write the every-action sweep test and engine unit tests

## CP-020 2026-10-30T16:17:32+08:00 T-046 IN_PROGRESS
- Phase: P04 completed; waiting for the owner's review of PR and next prompt
- Task: T-046 (IN_PROGRESS)
- Completed steps: Backend complete: automation.test 7/7 (incl. every-action sweep), automation-engine.test 8/8
- Incomplete steps: UI: builder b01/automations, approvals fields+schedule/clarify, b08 link, founder tab; full suites; report; commit; PR
- Files modified (uncommitted at checkpoint): .claude/project-memory/CHECKPOINTS.md; .claude/project-memory/PENDING_TASKS.md; .claude/project-memory/SESSION_HANDOVER.md; scripts/automation.test.mjs; src/business-hub.js; src/mail-centre.js; src/payments.js; src/pipeline.js; src/server.js; docs/phase-05/PROMPT.md; scripts/automation-engine.test.mjs; src/automation/catalogue.js; src/automation/engine.js; src/automation/routes.js
- Tests executed: none
- Test results: none
- Git branch: phase-05-ai-automation
- Commit: af72660 (Checkpoint: PR #34 opened); branch not on remote
- Recovery snapshot: refs/recovery/phase-05-ai-automation/20261030T081732Z (d77dfc7)
- Known errors: none
- Next exact action: Build saas/workspace-automations.js

## CP-021 2026-10-30T16:25:36+08:00 T-046 TESTING
- Phase: P04 completed; waiting for the owner's review of PR and next prompt
- Task: T-046 (TESTING)
- Completed steps: UI: b01/automations builder/activity/suggestions/rules/audit, approvals card fields + Edit/Schedule/Clarify/Answer, b08 link, founder tab f07/platform/automation; test:automations-ui 10/10
- Incomplete steps: full suites, verify:modules, report, commit, PR
- Files modified (uncommitted at checkpoint): .claude/project-memory/CHECKPOINTS.md; .claude/project-memory/PENDING_TASKS.md; .claude/project-memory/SESSION_HANDOVER.md; office/console-platform.js; office/console.js; package.json; saas/approvals.js; saas/workspace-nav.js; saas/workspace-ops.js; saas/workspace.html; scripts/automation.test.mjs; scripts/test-console-platform.mjs; src/business-hub.js; src/mail-centre.js; src/payments.js; src/pipeline.js; src/server.js; docs/phase-05/PROMPT.md; saas/workspace-automations.css; saas/workspace-automations.js; scripts/automation-engine.test.mjs; scripts/test-automations-ui.mjs; src/automation/catalogue.js; src/automation/engine.js; src/automation/routes.js
- Tests executed: none
- Test results: none
- Git branch: phase-05-ai-automation
- Commit: af72660 (Checkpoint: PR #34 opened); branch not on remote
- Recovery snapshot: refs/recovery/phase-05-ai-automation/20261030T082536Z (80683ff)
- Known errors: none
- Next exact action: Run npm test and all UI suites
