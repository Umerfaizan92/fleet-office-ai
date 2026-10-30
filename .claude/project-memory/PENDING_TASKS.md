# Pending tasks

Ordered: the first task whose status is not COMPLETED is the one to resume. Status values: NOT_STARTED, IN_PROGRESS,
BLOCKED, TESTING, COMPLETED. When a task is verified, move it to COMPLETED_TASKS.md with its evidence.

## T-037 Accessible names that match visible text in the Business OS (P03 follow-up)
- Status: BLOCKED
- Blocked by: owner approval (existing tests and the console page use the current labels; they change together).
- Requirement: "Pin navigation" button labelled "Expand main navigation"; co-pilot button showing "Ask Super Pro"
  labelled "Open Super Pro AI co-pilot"; dashboard tiles' labels do not contain their visible text.
- Acceptance: axe `label-content-name-mismatch` 0 on workspace; tests updated in the same commit.

## T-038 Publish P02/P03 to GitHub
- Status: IN_PROGRESS
- Requirement: get the P02, P03 and P03.5 commits onto GitHub without touching main.
- Acceptance: branch `phase-03-cinematic-design` on GitHub matches the local branch; pull request into main open for the owner's review (no merge, no deploy).

## P04 onwards
- Status: NOT_STARTED. Waiting for the owner's next phase prompt (see MASTER_PLAN.md). Record the prompt here
  in full before starting.
