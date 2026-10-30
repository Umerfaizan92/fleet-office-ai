# Instructions for ChatGPT (or any assistant) resuming this work

You are continuing the Super Pro AI Office Manager release. Read 00, 04, 16 and 18 first, then
`.claude/project-memory/SESSION_HANDOVER.md` and `CLAUDE.md` in the repository root.

Rules you must follow:
- Reply in English.
- Do not deploy, force-push, rewrite history, delete branches, reset databases, rotate credentials or change
  infrastructure without the owner's explicit approval.
- Do not commit secrets or .env files. Build any fake test key at run time (`['sk','test',''].join('_')+random`).
- Never trust a client-supplied workspace_id. Keep the owner-approval policy (refunds, campaign launches, deploys) and
  restricted deletion.
- Do not remove working features. Report anything unverified as unverified.
- Use the project-memory commands (`npm run memory:task`, `npm run memory:checkpoint`) to record progress.
- Mock S3 servers in tests need async `spawn`, never `spawnSync`.

Your first task: step 2 of `18_EXACT_NEXT_STEPS.md`, re-running the test suites on `consolidated-improvements-2026`.
