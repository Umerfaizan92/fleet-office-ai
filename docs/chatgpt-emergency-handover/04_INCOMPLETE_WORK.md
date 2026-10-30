# Incomplete work

## Consolidation task (T-062): stopped here
1. Seven release docs are not written: ARCHITECTURE, INTEGRATIONS, SECURITY_AUDIT, TEST_RESULTS, KNOWN_ISSUES,
   DEPLOYMENT_PLAN, ROLLBACK_PLAN. Their content can be built from 07–17 here and docs/phase-10/.
2. **The full test suite was not re-run after the consolidation changes.** Only `npm test` passed. Not yet re-run:
   test:unit, all UI suites, test:visual, report:a11y-perf, verify:modules (with the new modules), smoke, integration,
   check:config, validate, quality:check, check:site, release:audit, release-seo-check, npm audit. All of these
   passed on PR #40 before the consolidation changes.
3. Optionally open a PR from `consolidated-improvements-2026` into `main` so CI runs.
4. Update the MASTER_PLAN.md phase table (rows after P03 are provisional).

## Feature follow-ups (`.claude/project-memory/PENDING_TASKS.md`)
T-037, T-040–T-045, T-047, T-048, T-050–T-053, T-055, T-057, T-059, T-060.

The main gaps:
- Live provider checks: Google (T-053), Telnyx and Resend (T-055), Stripe (T-057), AWS (T-060).
- Monthly snapshot copies (T-059).
- Image re-encoding (T-051) and custom domains (T-052).

## Not built / limited
- WhatsApp and social replies are drafted and approved but not sent directly.
- VEVO checks are manual. Domain purchase is a request only.
- No runtime feature flags. No type checker (plain JavaScript).
