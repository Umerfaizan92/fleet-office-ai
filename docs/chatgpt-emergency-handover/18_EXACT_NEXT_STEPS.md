# Exact next steps

1. `git fetch && git checkout consolidated-improvements-2026` (expect HEAD = the handover commit on top of 13c2515).
2. `npm ci`, then run the suites that were not re-run: `npm run test:unit`, each `test:*-ui`, `test:visual`,
   `report:a11y-perf`, `verify:modules`, `smoke:test`, `integration:test`, `check:config`, `validate`, `quality:check`,
   `check:site`, `release:audit`, `node scripts/release-seo-check.mjs`, `npm audit --omit=dev`.
   Fix any failure. verify:modules is the most likely to need a tweak, since it now covers the Phase 07–09 modules.
3. Write the 7 missing `docs/release/` files: ARCHITECTURE, INTEGRATIONS, SECURITY_AUDIT, TEST_RESULTS,
   KNOWN_ISSUES, DEPLOYMENT_PLAN, ROLLBACK_PLAN. Use handover files 07–17 and docs/phase-10/.
4. Before each commit: `npm run manifest:update && npm run verify:manifest && npm run memory:validate && npm run security:secrets`.
   Mark T-062 complete (`npm run memory:task -- complete T-062 ...`).
5. Push (no force). Open a PR `consolidated-improvements-2026` → `main` for CI.
6. Report to Faizan and **stop: ask for deployment approval.**
