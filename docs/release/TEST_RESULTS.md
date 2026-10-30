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
