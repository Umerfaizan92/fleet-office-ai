# Test results — actual Claude release recovery

Source baseline: consolidated-improvements-2026 at 24dd8c7. The source ZIP contained 470 files (512 entries including directories); every file matched the baseline SHA-256 content, with none missing or different. This identifies the actual transferred source independently of a deployment label.

Baseline Node 22.23.4 results: npm ci passed; npm test was 72/73 because one SEO fixture relied on an unreachable external hostname. Unit runner reported 198 tests: 196 passed, one failed, one skipped. All other baseline verifier stages passed. These are baseline results, not a final release pass.

Recovery targeted tests: preview/storage/S3/SEO cases passed after combining safety fixes; new primary-object-storage preview restrictions and private-redirect/sitemap rejection have explicit regressions. Recovered-source local matrix:
- Public website: 16 checks passed, including phone static-hero regression.
- Workspace/founder: 34; pipeline: 15; console platform: 16; automation: 11; SEO: 10; communications: 11; finance: 7; reliability: 11. All passed.
- Module inventory: 66 modules, zero problems.
- Responsive visual runner: 51 screens, zero layout problems; first-run baselines, not historical pixel comparisons.
- Release preservation audit: passed; 419→599 routes, 22→41 pages, 38→60 views. The only intentional route change is the redesigned homepage at /.
- Smoke, integrations, config validation, release validation, quality gates, release SEO and secret scan: passed.
- Lockfile dependency audit (production dependencies, moderate threshold): zero vulnerabilities.
- Public page generator check: 19 pages current.

The first accessibility/performance run found zero serious/critical issues on the new site, but the phone homepage loaded Three.js and exceeded the 200 ms blocking-time budget (294 ms). Recovery keeps the existing static fallback below 760 px, respects reduced motion even with force3d, and retains capable desktop 3D. The final core verifier passed 73/73 checks, including all 45 contract-test files, on the corrected recovery source. The final performance rerun passed: zero serious/critical accessibility issues on the new public site and zero new-site pages over the unchanged Web Vitals lab budgets. See qa/reports/A11Y-PERF.md for the complete results, including existing-surface findings. Desktop 3D remains active; phone 3D is not loaded.

Runtime: Node 22.23.4. Local browser: Chromium 153, temporary test-only executable override after the normal download failed. CI must verify the project's pinned browser as well. Visual baseline generation is explicitly separate from historical visual-regression evidence.

Current and final commit, CI run, test results and deployment ID are recorded in the recovery PR and project-memory checkpoint. No real mail/SMS/payment provider was contacted, and production data/credentials were not copied into these test fixtures.

## Claude final matrix: 2026-10-31, commit fca5a84 (= 49c08eb plus the backup-root fix)

Run on Node 22 in the Claude cloud workspace with the lockfile installed by `npm ci`. Every step ran one after another
on a clean working tree.

| Check | Result |
|---|---|
| `npm test` (core verifier) | pass (181 s) |
| `test:unit` | pass |
| `test:ui`, `test:site-ui`, `test:pipeline-ui`, `test:console-ui` (16), `test:automations-ui`, `test:seo-ui`, `test:comms-ui`, `test:finance-ui`, `test:reliability-ui` (7) | all pass |
| `test:visual` (responsive layout) | pass |
| `verify:modules` | pass: 66 modules, 0 problems |
| `smoke:test`, `integration:test`, `check:config`, `validate`, `quality:check`, `check:site`, `release:audit` | all pass |
| `security:secrets` | pass |
| `release-security.test` (13 tests: policy table, roles, tenant files, secrets, rate limits, headers, audit chain, IAM coverage) | pass |
| `reliability.test` (including the new backup-root test), `preview-preflight.test`, `s3-files.test` | pass |
| `release-seo-check` | pass |
| `npm audit --omit=dev --audit-level=high` | 0 vulnerabilities |
| `report:a11y-perf` | **fail on one budget**: 0 serious accessibility issues, but the phone homepage blocking time is 214–218 ms against a 200 ms budget (two runs). |

About the performance result: ChatGPT measured the same frontend code at 94 ms. Every page in this run was 2–5× slower,
and WebGL was not available, so desktop 3D did not load. This points to the workspace machine rather than a code
regression, but it is not proven. Re-measure on the CI runner or the hosted preview before calling it fixed. The
committed `qa/reports/` files are kept from ChatGPT's run.
