# AI and automation

- Automation engine (Phase 05): 20 capabilities. Level 1 automatic, 2 rule-based, 3 approval, 4 restricted.
  Approval queue (approve, reject, edit, schedule, clarify), schedules, retries, audit and an emergency pause.
  Report: `docs/phase-05/REPORT.md`.
- AI calls go through `ai-provider-shim.js`, which has outcome hooks. Without an AI provider, built-in rules are used.
- Communications AI (10 functions) is in `src/comms/ai.js`. Finance AI actions go through approvals.
- Follow-ups: T-047 (Inbox triggers) and T-048 (move the scheduler to a worker).
