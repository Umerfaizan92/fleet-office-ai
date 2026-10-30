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
