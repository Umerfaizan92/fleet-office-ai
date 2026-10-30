# Project memory, checkpoints and resume (P03.5)

How Super Pro AI development survives usage limits, context exhaustion, disconnections, closed browsers, restarts and
new conversations. The repository holds the durable state; chat history is never relied on.

## What is where

| Path | Purpose |
|---|---|
| `CLAUDE.md` | Rules every Claude Code session reads first: startup procedure, how to record work, git rules, owner rules |
| `.claude/project-memory/MASTER_PLAN.md` | Product, phases P00–P14 with status and dependencies, standing rules, owner preferences |
| `PROGRESS.md` | What exists, phase by phase; test-suite results; log |
| `PENDING_TASKS.md` | Open tasks in order, each with ID, status, requirement, files, acceptance criteria |
| `COMPLETED_TASKS.md` | Verified tasks with evidence (tests, results, commit) |
| `DECISIONS.md`, `ERROR_LOG.md` | Why things are the way they are; what failed, whether it partially executed, safe recovery |
| `SESSION_HANDOVER.md` | The 13-field handover (generated block) plus notes |
| `CHECKPOINTS.md` | Append-only checkpoint log |
| `.claude/settings.json` | Hooks: SessionStart runs the resume check (startup, resume, clear and after compaction); PreCompact saves a recovery snapshot |
| `scripts/memory/*.mjs` | The commands below (no dependencies) |
| `refs/recovery/<branch>/<UTC time>` | Recovery snapshots of unfinished work (local git refs) |

Nothing in memory may contain passwords, keys, tokens, authenticator secrets or customer data; every command and
`memory:validate` refuse text that looks like a secret.

## Commands

| Command | What it does |
|---|---|
| `npm run memory:resume` | Compares the handover with the real repository (branch, verified commit, commits since, uncommitted files, interrupted merge/rebase, unrestored snapshots, new commits on main) and names the task to resume. Read-only, no network, always exits 0. |
| `npm run memory:checkpoint -- --task T-0xx --status S --done "..." --todo "..." --tests "..." --results "..." --next "..." [--snapshot] [--verified]` | Appends a checkpoint (timestamp, phase, task, steps, files, tests, results, branch, commit, snapshot, errors, next action), regenerates the handover, updates the task status. COMPLETED needs `--verified` with passing results. |
| `npm run memory:snapshot [-- --label "..."]` / `-- --list` | Saves the working tree (changes and new files) as a commit object under `refs/recovery/...` without touching the branch, staging area or files. |
| `npm run memory:restore -- <ref>` / `-- --latest` | Applies a snapshot back to the working tree, unstaged. Refuses if there are uncommitted changes or a git operation in progress. |
| `npm run memory:task -- add | status | complete | decision | error | progress` | Task and note updates without hand-editing `.claude/` (see CLAUDE.md). `complete` requires evidence and refuses failures. |
| `npm run memory:validate` | Files present, 13 handover fields, valid unique task IDs and statuses, evidence for every completed task, checkpoint numbering, no secrets. |

## Resume procedure (new session, new machine or after compaction)

1. The SessionStart hook prints the resume check (or run `npm run memory:resume`).
2. Read SESSION_HANDOVER.md, PROGRESS.md and PENDING_TASKS.md; inspect `git status` and `git log`.
3. Clear every WARNING: restore a listed snapshot, finish or abort an interrupted git operation, explain unexpected
   changes, check new commits on main.
4. Resume the task the check names. Do not redo tasks with evidence in COMPLETED_TASKS.md.
5. If the last step touched anything external (migration, payment, email, deploy, third-party API), verify what
   happened before retrying.

## Recovery drill (2026-10-30)

| Step | What happened | Result |
|---|---|---|
| 1. Start a small task | T-036 (live-update notices under the folded rail on phones): measured the overlap (notices 2–368 px, rail 0–56 px at 390 px) and wrote a first CSS rule. | Unfinished, untested |
| 2. Save a checkpoint | `memory:checkpoint --status IN_PROGRESS --snapshot` (CP-002); only the memory files were committed. | Snapshot `eea0472`; branch untouched |
| 3. End the session | Fresh clone of the repository with only commits, recovery refs and local screenshot baselines; the unfinished CSS was absent. | As intended |
| 4. Open a new session | A new, non-interactive Claude Code session (`claude -p`) started in the clone with a generic prompt ("continue from where the previous session stopped; follow CLAUDE.md"); no mention of T-036, the snapshot or the CSS. Push, web and deploy tools disabled. | SessionStart hook ran |
| 5. Load memory | The session read the handover, pending tasks, progress and error log. | Named T-036 as the task to resume |
| 6. Verify git and files | It inspected the snapshot with `git diff` before restoring, then ran `memory:restore --latest`. | Draft fix restored |
| 7. Resume the task | It found the draft rule assumed a 56 px rail although the rail is 68 px between 701 and 760 px, switched to the rail's own variable, added a test that it proved fails without the fix, rebuilt assets and ran test:ui 34/34, test:visual 51 same, npm test 73/73, manifest, secrets and memory validation. | Fix verified |
| 8. No repeated work | It left T-035, T-037 and T-038 alone and did not redo the 7 completed tasks. | Confirmed |

Two problems found and fixed:

- **Wrong task named in the dry run.** The resume check first picked T-035 because it was listed first. The task named
  in the handover now wins while it is open (E-009), and a test covers it.
- **Memory edits refused.** The new session could not hand-edit files under `.claude/` (Claude Code asks permission for
  them), so it stopped before committing and recorded exactly what was left (CP-004). `npm run memory:task` now covers
  every memory update (E-010, D-013). The verified work came back here through the snapshot system itself (snapshot in
  the clone, fetch, `memory:restore`), was re-tested (test:ui 34/34) and committed as T-036.

Automated coverage: `scripts/project-memory.test.mjs` (in `npm test`) repeats the cycle in a throwaway repository:
checkpoint, snapshot, lost working tree, resume report, restore, refusal to overwrite, COMPLETED only with passing
evidence, handover-task priority, branch mismatch, interrupted merge, missing files, secret refusal and every
`memory:task` command.

## Limits

- Only what was written to disk and saved survives. Work that existed only in a conversation is lost.
- Recovery snapshots are local git refs. A cloud workspace that is deleted takes its snapshots with it unless they were
  pushed (`git push origin "refs/recovery/*:refs/recovery/*"`, owner permission required) or bundled.
- The hooks run only in Claude Code with this folder trusted. Other tools (Codex, Cursor) do not run them; they can
  still use the npm commands.
- The project settings also allow direct memory edits, but Claude Code ignores those rules until the folder is
  trusted, and this was not tested on a trusted folder. The npm commands work either way.
