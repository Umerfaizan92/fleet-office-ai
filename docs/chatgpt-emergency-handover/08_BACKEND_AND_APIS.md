# Backend and APIs

- `src/server.js`: Express monolith, 599 routes (537 API routes swept by `route-guards.test`).
- Domain modules: `src/comms/` (Phase 07), `src/finance/` (08; overview route is `/api/saas/finance/hub`),
  `src/reliability/` (09), the automation engine (05; levels 1–4, `engine.startRun`), SEO modules (06), job queue.
- Workspace APIs live under `/api/saas/...` and use the session's workspace, never the client's workspace_id.
  Founder APIs use the founder session plus MFA; scripts use the header `x-admin-key`.
- Webhooks need rawBody (Stripe, Resend, Telnyx); the regex in server.js lists the paths.
- Test helper: `scripts/test-server.mjs` `startServer(env)`.
