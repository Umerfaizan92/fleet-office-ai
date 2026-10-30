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
