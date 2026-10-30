# CLAUDE.md: Super Pro AI Office Manager

Instructions for every Claude Code session in this repository. The repository, not the chat history, holds the
project's durable state. Read this file fully before doing anything else.

## 1. Start of every session (do this before any edit)

1. Read the resume check printed at session start (from `.claude/settings.json`). If it did not appear, run
   `npm run memory:resume`.
2. Read, in this order: `.claude/project-memory/SESSION_HANDOVER.md`, `PROGRESS.md`, `PENDING_TASKS.md`. Read
   `MASTER_PLAN.md` for the phases and standing rules, and `DECISIONS.md` before changing direction.
3. Inspect the repository yourself: `git status`, `git log --oneline -10`, `git branch --show-current`,
   `npm run memory:snapshot -- --list`. Do not trust the notes blindly: compare them with the code.
4. Resolve every WARNING in the resume check first: an interrupted git operation, unexpected changes, a branch
   mismatch, unfinished work saved in a recovery snapshot (`npm run memory:restore -- <ref>`), new commits on main.
5. Identify the latest verified completed task (COMPLETED_TASKS.md) and the first unfinished task (PENDING_TASKS.md).
   Resume from the earliest unfinished requirement. Never redo a task that has evidence in COMPLETED_TASKS.md unless
   the owner asks or the evidence turns out to be wrong (then record why in ERROR_LOG.md).
6. If the last step of the previous session touched something external (database migration, payment, email, deploy,
   third-party API), verify what actually happened before retrying. Never assume a retry is safe.
7. Tell the owner in one or two sentences where you are resuming and why.

## 2. While working

Update memory through the `npm run memory:*` commands. Claude Code treats files under `.claude/` as sensitive and asks
permission for every direct edit (an unattended session cannot edit them at all), so the commands are the reliable path:

| Need | Command |
|---|---|
| New task (ID assigned automatically) | `npm run memory:task -- add --title "..." --requirement "..." --files "..." --acceptance "..."` |
| Change status | `npm run memory:task -- status --task T-0xx --status IN_PROGRESS` (or BLOCKED, TESTING) |
| Verified and done | `npm run memory:task -- complete --task T-0xx --evidence "tests and results, commit"` |
| Decision | `npm run memory:task -- decision --text "..." --why "..."` |
| Error | `npm run memory:task -- error --task T-0xx --text "..." --partial "Yes/No/Unknown" --recovery "..."` |
| Progress line | `npm run memory:task -- progress --text "..."` |
| Checkpoint and handover | `npm run memory:checkpoint -- ...` (below) |

- Give every task an ID and record its requirement, files and acceptance criteria before starting. New phase prompts
  from the owner are recorded in full first (owner-approved hand edit, or `add --requirement`).
- Status values: NOT_STARTED, IN_PROGRESS, BLOCKED, TESTING, COMPLETED. A task is COMPLETED only after its acceptance
  criteria are verified (tests run and passing, page checked); `complete` moves it to `COMPLETED_TASKS.md` with
  evidence and refuses evidence that mentions failures.
- Record decisions and errors (with whether they partially executed and the safe recovery) as they happen.
- Checkpoint with `npm run memory:checkpoint -- --task T-0xx --status IN_PROGRESS --done "..." --todo "..." --next "..."`:
  - before a significant task or a potentially disruptive operation (migration, dependency upgrade, mass edit);
  - after a meaningful implementation step, after changing critical files, after a successful test run;
  - at the end of a phase, and before the session or context is likely to end.
  Add `--snapshot` when there is unfinished work: it saves the working tree under `refs/recovery/...` without touching
  the branch, the staging area or any file. Add `--verified --tests "..." --results "..."` only when tests passed on
  the current commit.
- When the conversation is getting long, stop and write the handover first: checkpoint with the exact next action,
  update PROGRESS.md and PENDING_TASKS.md, commit verified work. Assume the session can end at any moment.

## 3. Git rules

- Commit only verified, logically complete changes, in small atomic commits, with the project memory updates that
  describe them. Never commit broken or unverified code as if it were done; use a recovery snapshot instead.
- Never force-push, rewrite published history, delete branches or tags, or overwrite changes you did not make.
- Never push unless the owner has authorised it and the session has permission. If pushing is not possible, say so,
  record it in the handover, and deliver a bundle plus patch (`git bundle create`, `git format-patch --binary`),
  verified by applying it to a fresh clone.
- Other tools (Codex, Cursor) use their own branches. Check `origin/main` for new commits before starting.
- End commit messages with the attribution lines the session provides.

## 4. Standing rules from the owner (never change without explicit approval)

- No destructive changes, database resets, credential rotation, deploys or infrastructure changes.
- Never claim a feature exists unless verified in the repository or connected environment.
- Never expose credentials or delete production data. Secrets, passwords, tokens and authenticator keys are
  "[stored separately]" and must never be written to this repository or its memory files.
- Preserve the current Render deployment (`render.yaml`) until a tested migration is approved.
- Never trust a client-supplied `workspace_id`. Never assume backup credentials are primary storage credentials.
- Every existing button, menu, link, form, route, API endpoint and element ID keeps working.
- Do not rewrite the frontend just to adopt a library. Avoid copying competitor intellectual property.
- Do not touch the Fleet Parlour website. No invented testimonials.
- Reply to the owner (Faizan) in English. Pages must fit phone, iPad and laptop. No looping animation.

## 5. Verify before calling anything done

`npm test` (must pass; Render's build runs it), plus as relevant `npm run test:ui`, `test:site-ui`, `test:visual`,
`report:a11y-perf`, `smoke:test`, `integration:test`, `security:secrets`, `memory:validate`. After editing
`saas/ds/` run `npm run build:ds`; after editing website copy run `npm run build:site`; before committing run
`npm run manifest:update` and `npm run verify:manifest`.

## 6. Limits of this system

The hooks and scripts only preserve what was written to disk and saved (committed, checkpointed or snapshotted).
Work that existed only in a conversation, or a snapshot that was never pushed from a deleted cloud workspace, cannot
be recovered. Recovery snapshots are local refs; copy them to GitHub only with the owner's permission:
`git push origin "refs/recovery/*:refs/recovery/*"`.
