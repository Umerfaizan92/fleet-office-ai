# Decisions

Each decision: ID, date, what, why. Reverse one only with a new entry that says so.

| ID | Date | Decision | Why |
|---|---|---|---|
| D-001 | 2026-10-29 | Keep Node 22, Express 4.22.3, SQLite (better-sqlite3), Litestream to S3, Render. Managed PostgreSQL only through a tested, approved migration (plan in `docs/infrastructure/DATABASE_MIGRATION_PLAN.md`). | Working production system; owner rule to preserve the Render deployment. |
| D-002 | 2026-10-29 | Tenancy and role checks are enforced on the server from the session; client `workspace_id` is never trusted. | Owner rule; P02 security model. |
| D-003 | 2026-10-29 | Backup storage credentials are separate from primary file storage credentials. | Owner rule; limits blast radius. |
| D-004 | 2026-10-30 | Palette "Midnight base, gold accent": graphite surfaces, gold only for actions and the approval gate, cyan only for live/AI, violet only for data. | Owner choice. |
| D-005 | 2026-10-30 | Motion "cinematic everywhere" but one-time: nothing loops forever, reduced motion removes all animation, work stops when hidden. | Owner choice plus his dislike of looping animation. |
| D-006 | 2026-10-30 | No React/Tailwind/GSAP rewrite. Plain HTML/CSS/JS; Three.js bundled with esbuild only for the hero, lazy-loaded with an SVG fallback. | Owner rule against rewrites; performance. |
| D-007 | 2026-10-30 | New public website as separate clean-URL pages; old `/saas/` landing kept working and re-coloured. | The old page is tightly coupled to other code. |
| D-008 | 2026-10-30 | Existing pages re-coloured only through variables in `saas/ds/retheme.css` (no size, ID or behaviour changes). | Every control must keep working. |
| D-009 | 2026-10-30 | Visual-regression baselines (~14 MB) are kept out of git and made locally with `npm run test:visual:update`. | Repository is 2.3 MB; baselines would multiply it. |
| D-010 | 2026-10-30 | Work is delivered as a git bundle plus binary patch while the session cannot push to GitHub. | GitHub account not linked to the cloud session. |
| D-011 | 2026-10-30 | Project memory lives in the repository (`CLAUDE.md`, `.claude/project-memory/`), not in chat history. Unfinished work is preserved as recovery snapshots under `refs/recovery/*`, never as normal commits on the branch. | Owner's P03.5 prompt; survives session loss without polluting history. |
| D-012 | 2026-10-30 | Memory tests in `npm test` run in a temporary git repository and never read the real repository's history. | Render's build runs `npm test`; its checkout may be shallow. |
| D-013 | 2026-10-30 | All project-memory updates go through npm run memory:* commands; project settings also allow memory edits (effective only once the folder is trusted in Claude Code, untested here) | Direct edits under .claude/ need per-edit approval and fail in unattended sessions |
