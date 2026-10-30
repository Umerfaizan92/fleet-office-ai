# Completed tasks

A task appears here only after its acceptance criteria were verified. Each entry: ID, requirement, files, evidence.
Newest last. Never edit evidence after the fact; add a correcting entry instead.

## T-000 Repository discovery and preservation audit (P00)
- Requirement: inventory, feature classification A–I, security/deployment baseline, preservation strategy, 10 outputs; stop after the report.
- Files: none (read-only audit).
- Evidence: report delivered in chat on 2026-10-29. Not stored in the repository.

## T-001 Competitor intelligence and master blueprint (P01)
- Requirement: Salesforce, HubSpot, monday.com research; 50+ capability comparison; blueprint for three products; capability matrix; deliverables 1–8.
- Files: none.
- Evidence: report delivered in chat on 2026-10-29. Not stored in the repository.

## T-002 Enterprise infrastructure and security (P02)
- Requirement: server-side role enforcement, tenant isolation, private encrypted storage with signed URLs and file validation, backup separation and restore drill, job queue, observability, dev/staging/prod plan, CI security checks.
- Files: `src/security-policy.js`, `file-safety.js`, `object-storage.js`, `job-queue.js`, `observability.js`, `staff-access.js`, `db.js`, `s3-files.js`; `scripts/*` (tests and tools listed in PROGRESS.md); `infra/aws/*`; `render.staging.yaml`; `docs/infrastructure/*`; `.github/*`.
- Evidence: commit `5cf7377`; `npm test` passed; delivered as bundle and patch on 2026-10-30.

## T-003 Design tokens and component library (P03)
- Files: `saas/ds/tokens.css`, `components.css`, `icons.svg`, `motion.js`.
- Evidence: commit `6b387fd`; contrast table in `docs/design/DESIGN_SYSTEM.md` (all AA).

## T-004 Public website, 19 pages (P03)
- Files: `scripts/site/content.mjs`, `templates.mjs`, `scripts/build-site.mjs`, `saas/site/*.html`, `src/public-site.js`, `src/server.js` (route, sitemap, robots, llms.txt), `saas/ds/site.js`, `site.css`, `saas/ds/src/hero-3d.mjs`, `scripts/build-ds.mjs`, `saas/content/testimonials.json`.
- Evidence: commits `6b387fd`, `6a5ddc8`; `public-site.test.mjs` (11 checks) and `test:site-ui` 15/15.

## T-005 Retheme existing pages and app motion (P03)
- Files: `saas/ds/retheme.css`, `app-motion.js`, 22 pages listed in `docs/design/DESIGN_SYSTEM.md`, `scripts/test-ui.mjs` (accent assertion).
- Evidence: `test:ui` 33/33 at `6a5ddc8`; visual review at 390/768/1440.

## T-006 Visual regression, accessibility and performance (P03)
- Files: `scripts/test-visual.mjs`, `scripts/report-a11y-perf.mjs`, `scripts/visual/session.mjs`, `qa/reports/*`, `docs/design/DESIGN_SYSTEM.md`.
- Evidence: 51 screens identical on repeat runs; axe 0 issues on new site; LCP 0.7–1.2 s throttled mobile; commit `6a5ddc8`; `npm test` 73/73.
