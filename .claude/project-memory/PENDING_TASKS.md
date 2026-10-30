# Pending tasks

Ordered: the first task whose status is not COMPLETED is the one to resume. Status values: NOT_STARTED, IN_PROGRESS,
BLOCKED, TESTING, COMPLETED. When a task is verified, move it to COMPLETED_TASKS.md with its evidence.

## T-035 Persistent autosave, checkpoint and resume system (P03.5)
- Status: IN_PROGRESS
- Requirement (owner prompt, 2026-10-30, summarised): persistent project memory in `CLAUDE.md` and
  `.claude/project-memory/` (MASTER_PLAN, PROGRESS, COMPLETED_TASKS, PENDING_TASKS, DECISIONS, ERROR_LOG,
  SESSION_HANDOVER, CHECKPOINTS); task IDs and statuses; checkpoints with timestamp, phase, task, steps, files, tests,
  branch, commit, errors, next action; automatic resume detection that verifies git state instead of trusting notes;
  handover before context runs out; atomic commits, no force-push, no automatic push without permission; failure
  recovery that never blindly retries migrations, payments, emails, deploys or external APIs; Claude Code hooks for
  startup and handover without loops; a recovery drill; no secrets in memory.
- Files: `CLAUDE.md`, `.claude/settings.json`, `.claude/project-memory/*`, `scripts/memory/*`,
  `scripts/project-memory.test.mjs`, `package.json`.
- Acceptance: memory files present and validated; `npm run memory:checkpoint`, `memory:snapshot`, `memory:resume`,
  `memory:validate` work; SessionStart hook prints state; contract test passes inside `npm test`; recovery drill
  (start task → snapshot → lose working tree → new session → resume → finish without repeating) passes.
- Remaining: see SESSION_HANDOVER.md.

## T-036 Fix "Live update" notice sliding under the folded rail on phones (P03 follow-up)
- Status: NOT_STARTED
- Requirement: on 390 px the Business OS "Live update" notice is partly hidden behind the folded navigation rail.
  It must sit fully inside the content area. Existed before P03.
- Files: likely `saas/ds/retheme.css` (no layout changes to other elements).
- Acceptance: notice fully visible at 390 and 768; `test:ui` 33/33; `test:visual` only the expected screens change.

## T-037 Accessible names that match visible text in the Business OS (P03 follow-up)
- Status: NOT_STARTED (needs owner approval: existing tests use the current labels)
- Requirement: "Pin navigation" button labelled "Expand main navigation"; co-pilot button showing "Ask Super Pro"
  labelled "Open Super Pro AI co-pilot"; dashboard tiles' labels do not contain their visible text.
- Acceptance: axe `label-content-name-mismatch` 0 on workspace; tests updated in the same commit.

## T-038 Publish P02/P03 to GitHub (owner action)
- Status: BLOCKED (cloud session cannot push; GitHub account not linked)
- Next: owner runs the PowerShell steps in SESSION_HANDOVER.md, or links GitHub so Claude can push.

## P04 onwards
- Status: NOT_STARTED. Waiting for the owner's next phase prompt (see MASTER_PLAN.md). Record the prompt here
  in full before starting.
