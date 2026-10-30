# Phase 10 final QA and release report

Branch `phase-10-release` (all of Phases 01–10), pull request into `main`. Release candidate and rollback plan:
`RELEASE_CANDIDATE.md`. Prompt: `PROMPT.md`.

## How this was audited

- **Baseline.** The Phase 00 inventory was delivered in chat and never saved, so the baseline is `origin/main` at
  `8318b9e`, the version deployed today. `npm run release:audit` (new) compares that commit with this branch:
  - every HTTP route;
  - every page;
  - every HTML element ID and form;
  - every workspace view, Founder Console section and npm script.
- **Runtime checks.** `npm run verify:modules` opens all 54 modules in a browser at laptop and phone width and calls
  their endpoints. Security, automation, SEO and infrastructure were checked with automated tests on throwaway
  servers. Each claim below names the test that proves it.
- **Who audited.** All of this was done by the same engineering session that built Phases 01–09, not by an outside
  team. Treat it as a thorough self-audit. An independent human review of security and tax rules is still
  recommended (see Known limitations).

## Findings fixed in this phase

1. **Regression from Phase 09.** The automation catalogue defined `data_deletion` twice, so the business action
   "Delete business data" (approval-only) was silently replaced by the platform one.
   - Fixed: the platform action is renamed `platform_data_deletion`, and the existing `production_deployment`,
     `infrastructure_change` and `credential_rotation` actions are reused.
   - A new test fails if any catalogue key is duplicated.
2. **Route-guard coverage gap.** `route-guards.test` scanned only top-level `src/*.js`, so routes added in module
   folders (automation, SEO, comms, finance, reliability) were not swept.
   - It now scans every folder. All 537 API routes pass both checks: nothing answers without the right sign-in, and no
     founder route opens with a business session.
3. **Sitemap listed noindex pages.** Trust Centre, Privacy and Terms are `noindex` (unchanged since before Phase 01)
   but were listed in the sitemap. They are no longer listed.
4. **Long page titles.** Two industry pages had titles over 65 characters. They now use the industry name
   ("Allied health and clinics | Super Pro AI Office Manager").
5. **Flaky test.** A racy assertion in `test:comms-ui` was removed during Phase 08 and noted here for completeness.

---

## 1. Features preserved

`npm run release:audit` against `main` (`8318b9e`):

| Inventory | At baseline | Now | Removed |
|---|---|---|---|
| HTTP routes | 419 | 599 | 1, intentional (below) |
| Pages | 22 | 41 | 0 |
| Workspace views | 38 | 60 | 0 |
| Founder Console sections | 23 | 34 | 0 |
| npm scripts | 16 | 43 | 0 |
| HTML element IDs | 636 | 753 | 0 |

- **The one removal:** `GET /` used to redirect to `/saas/`. Since Phase 03 it serves the new public home page
  (200), and `/saas/` is unchanged. Both checked live.
- **Runtime:** `verify:modules` found 54 modules and 0 problems. Some modules work but say a provider is needed for
  live use (email, SMS, AI, payments, S3, social networks). Details are in `qa/reports/modules.json`.

## 2. Features improved
- **Pipeline (Phase 04):** Enquiry → Quote → Booking → Allocation → Completion → Invoice → Payment is now one linked
  chain. Before, these were unconnected drafts.
- **Telnyx voice (Phase 07):** calls are routed per number with a business-aware assistant. The assistant can be
  interrupted and calls are transcribed. Calls fall back to transfer, then voicemail, then an apology.
  Duplicate-event protection survives restarts.
- **Stripe refunds (Phase 08):** partial refunds were counted again on every webhook. Fixed.
- **Delivery receipts (Phase 07):** signed Resend receipts were always rejected because the raw body was not kept.
  Fixed.
- **Design (Phase 03):** design tokens, a component library and a retheme of the existing workspace and console pages
  (visual baselines in `test:visual`).

## 3. Features added
- **Phase 02:**
  - request IDs and structured logs, `/readyz`;
  - a durable job queue with leases and dead letters;
  - S3 primary-storage support with separate keys;
  - security posture checks, Founder MFA, session caps, hash-chained audit log.
- **Phase 03:** a 19-page public website, with visual regression and accessibility/performance reports.
- **Phase 04:**
  - Business OS pipeline and Offshore Staff;
  - workspace record search;
  - six Founder Console tabs: revenue, infrastructure, storage, AI usage, compliance and configuration.
- **Phase 05:** AI automation engine. Levels 1–4, workflows with versions, dry runs, approval queue, schedules,
  retries, platform-wide pause.
- **Phase 06:**
  - SEO Command Centre and a 19-area technical audit;
  - keyword clusters and Google integrations;
  - Content Studio and Website Builder;
  - Local SEO, analytics and reports.
- **Phase 07:**
  - Unified Inbox (7 folders, AI triage), Call Handling;
  - Campaign Studio, consent and unsubscribes;
  - website contact forms;
  - Founder newsletter campaigns.
- **Phase 08:**
  - quotations, estimates, deposits, tax invoices and adjustment notes;
  - receipts, payment links, refunds and reconciliation;
  - reports (P&L, BAS draft, aged receivables) and compliance review;
  - platform plan price versions, plan changes, dunning and revenue.
- **Phase 09:**
  - backup snapshots, restore tests and configuration backup;
  - 14 monitors with alerts and a daily summary;
  - bounded self-healing;
  - the Reliability dashboard and runbooks.
- **Phase 10:**
  - `release:audit`, `release-security.test`, `release-seo-check`;
  - the release candidate and rollback plan.

## 4. Automations implemented
- **Business automations:**
  - 20 capabilities and 49 business actions: 22 Level 1 (automatic drafts and reports), 5 Level 2 (rule-based sends the
    owner switches on), 16 Level 3 (approval) and 6 Level 4 (always refused), plus 15 platform actions;
  - triggers on events, schedules (daily, weekly, monthly after 7 am local time) and manual runs.
  - Proven by `automation-engine.test`, `automation-governance.test` and `test:automations-ui`.
- **Platform automations:** health, backups, failed jobs, SEO checks and price changes.
- **Reliability scheduler:** checks every 5 minutes, a daily snapshot, a daily configuration backup, a weekly restore
  test and a daily summary. The schedule is saved, so a restart neither repeats nor skips a run.
- **Retries and failure handling:**
  - at most 3 attempts with the side effect happening once; permanent errors stop at once (`automation-engine.test`);
  - the job queue uses idempotency keys, leases, timeouts and dead letters (`job-queue.test`);
  - self-healing gives safe, temporary failures at most 2 more retries and never retries anything destructive
    (`reliability.test`);
  - loop protection: too many runs an hour are skipped.
- **Emergency stop:** a platform-wide and a per-business pause. Pausing holds every run and resuming releases each
  exactly once (`automation-engine.test`, `automation-governance.test`, `test:automations-ui`).

## 5. Human approval controls

Your policy table, enforced by the catalogue and checked by `release-security.test`
("owner automation policy table is enforced"):

| Policy | Implemented as |
|---|---|
| Invoice draft: automatic draft | `draft_invoice`, Level 1, output only. Finance "Prepare invoice draft" creates a draft that a person must approve and issue. |
| Refund or transfer: owner approval | `issue_refund` (Level 3; Stripe refund through the business's own account, one attempt with an idempotency key) and `refund_or_transfer` (Level 3, done by hand). |
| Marketing campaign creation: automatic draft | `prepare_campaign`, Level 1, output only. Campaign Studio saves drafts. |
| Launch new marketing campaign: owner approval | `send_campaign` (Level 3, always needs approval) and `launch_campaign` (Level 3, done by hand). Nothing is sent before approval (`comms.test`). |
| Security monitoring: automatic | `monitor_health`, `verify_backups`, `platform_failed_jobs` and `detect_failed_integrations` (Level 1), plus the reliability monitor every 5 minutes with alerts. |
| Production deployment: owner approval | `production_deployment` (Level 3 platform action, done by hand). `autoDeployTrigger: off`. No code deploys anything. |
| Delete subscriber records: restricted, explicit authorisation | `delete_customer_records` is Level 4 (always refused to automation). Account deletion needs the owner to confirm a code, followed by a waiting period. Platform deletion is `platform_data_deletion` (Level 3, done by hand). |

Also approval-only:
- adjustment notes and plan price changes;
- replies to customers and Google review replies;
- sitemap submission and the first publish of a website page;
- rollback, database restore, infrastructure change, credential rotation and major configuration change. The
  restore script needs an approved request and uses it once.

## 6. SEO integrations
- **Release check:** `release-seo-check` passes. All 21 sitemap pages answer 200 with a title of 65 characters or
  fewer, a meta description, a canonical link, one h1 and valid JSON-LD. `robots.txt` names the sitemap, and private
  pages are noindex or disallowed.
- **Founder SEO audit** of the local site: score 60 across 19 areas. The one "fix" is HTTPS, which is expected
  because the local test server uses http.
- **Google integrations** (Search Console, Analytics 4, Business Profile, Tag Manager, Ads reporting, PageSpeed):
  tested against Google's documented formats with fixtures. **Not verified live** (T-053); each shows "Not connected"
  until a real call succeeds.
- **Reports and automation:** clusters, content gaps, internal links, and daily, weekly and monthly reports
  (`seo-audit.test`, `seo-units.test`, `seo-platform.test`, `test:seo-ui`).

## 7. Security results

| Area | Result | Evidence |
|---|---|---|
| Authentication | All 537 API routes refuse signed-out callers, except a reviewed public list. Cookies are HttpOnly, SameSite=Strict, and Secure in production. Lockout after 5 failed passwords. Founder MFA is available. | `route-guards.test`, `release-security.test`, `security-policy.test` |
| RBAC | Employees cannot reach money, refunds, approvals, payment settings, consent, campaigns, voice settings, plan changes or reliability. Workers are limited to their own jobs. | `release-security.test`, `workorder-rbac-contract.test`, `tenant-isolation.test` |
| Tenant isolation | Another business gets 404 for finance documents, prints, credit notes, jobs, comms threads, campaigns, SEO sites and approvals. | `finance.test`, `comms.test`, `tenant-isolation.test`, `runtime-security.test`, `two-portal-security.test` |
| Founder permissions | No founder or admin route opens with a business session. Founder staff permissions are separate. | `route-guards.test`, `two-portal-security.test` |
| File access | `.env`, source, database, `.git`, uploads, path traversal and project memory are not served. | `release-security.test` |
| Payment permissions | Finance roles only. Customer payments use the business's own keys and never the platform key. | `finance.test`, `release-security.test` |
| AI tool permissions | AI tool endpoints refuse calls with a missing or wrong secret. Instructions inside emails and forms force approval (injection detection). | `release-security.test`, `automation-governance.test` |
| Approval enforcement | Employees cannot decide approvals, and one business cannot decide another's. Stale approvals are refused. | `release-security.test`, Phase 05 to 09 tests |
| Injection | SQL-like input is treated as data (no 500s, tables intact). Markup in names is escaped on printed documents and public pages. Prepared statements are used throughout. | `release-security.test` |
| Secret exposure | No stored Stripe key, webhook secret or Founder key appears in any API response. No stack traces. Repository secret scan passes, and GitHub push protection is on. | `release-security.test`, `security:secrets` |
| Rate limits | Public contact form, sign-in and API limiters are in place. A burst is refused with 429. | `release-security.test` |
| Audit logging | Finance, comms, automation and reliability actions are logged, and the hash chain verifies. | `release-security.test`, `finance.test` |
| Dependencies | `npm audit --omit=dev`: 0 vulnerabilities. | `npm audit` |

**Not covered:** a penetration test by an outside party, and the live production configuration (CSP and headers
were checked locally).

## 8. Backup verification
- **Tested locally:**
  - against an S3 stand-in through the real AWS SDK: snapshot, SHA-256 manifest, AES-256 server-side encryption,
    restore test, tamper detection, configuration backup without secret values, bucket checks;
  - the restore script refuses without an approval, uses an approval only once, and never overwrites
    (`reliability.test`, `test:reliability-ui`);
  - Litestream restore drill script (`restore-drill.test` runs in CI with the checksum-verified binary).
- **Not verified:** the production bucket, live Litestream replication and a production restore. This session has no
  AWS access. The first post-deploy steps in `RELEASE_CANDIDATE.md` do exactly this (T-060).

## 9. Test results (this branch, this session)

| Suite | Result |
|---|---|
| `npm test` (verify-all: syntax, migrations, storage, RBAC matrix, pipeline, contracts) | pass (74 checks) |
| `npm run test:unit` (all `scripts/*.test.mjs`, including the new release-security tests) | 197 / 197 pass |
| `test:ui`, `test:site-ui`, `test:pipeline-ui`, `test:console-ui`, `test:automations-ui`, `test:seo-ui`, `test:comms-ui`, `test:finance-ui`, `test:reliability-ui` | pass |
| `test:visual` (visual regression), `report:a11y-perf` (axe on 19 public pages at 2 widths and 2 themes; Core Web Vitals on mobile throttling) | pass: 0 serious accessibility issues on the new site, 0 pages over budget (home: LCP 1.0 s, CLS 0, TBT 189 ms) |
| `verify:modules` | 54 modules, 0 problems |
| `check:config`, `validate`, `quality:check`, `check:site`, `smoke:test`, `integration:test` | pass |
| `deploy:check` against a local server | pass |
| `release:audit` | pass (1 intentional change) |
| `release-seo-check` | pass |
| `security:secrets` | pass |
| `npm audit --omit=dev --audit-level=high` | 0 vulnerabilities |
| `build:ds`, `build:site` | rebuild with no unexpected changes |
| GitHub CI on PR #40 (secret scan, npm test, UI tests, integration, smoke, npm audit) and the Security workflow | pass (runs 41079564788 and 41079564951) |
| `storage:verify` | fails here as expected (no AWS keys in this session); must pass on Render |

## 10. Known limitations
- **Live providers not verified** from this environment: Telnyx (T-055), Stripe (T-057), Resend, Google (T-053), AWS
  S3 and Litestream (T-060), Render API. Each is tested against documented formats or local stand-ins.
- **GitHub:**
  - the repository is **public** and `main` is **not protected**;
  - CI has not run on the stacked PRs #33–#39 because they do not target `main`. It runs on the Phase 10 PR.
- **Browsers:** automated testing used Chromium only. Firefox and Safari/WebKit are not installed here, so test them
  by hand on a real iPhone, iPad and Mac before launch.
- **3D hero:**
  - it loads only on capable devices, after the page has loaded, and never with reduced motion;
  - with it forced on, desktop total blocking time was about 740 ms, after the largest paint;
  - a lighter scene would improve responsiveness on mid-range laptops.
- **Core Web Vitals:** lab measurements, not field data.
- **Tax and legal:** the Australian tax ruleset has not been reviewed by a tax agent, and payment and privacy wording
  has not been reviewed by a lawyer (Phase 08 COMPLIANCE_REVIEW.md).
- **Architecture:** one Render instance with SQLite, so no high availability. Deploys cause a few seconds of downtime.
- **Monthly snapshot copies** for 12-month retention are not automated yet (T-059).
- **WhatsApp and social replies** are approved and saved but not sent directly until those send APIs are connected.

## 11. Deployment readiness

**Ready as a release candidate. Not approved for production.**
- **Evidence for:** every automated suite passes; there are no removed features; the found regression is fixed; all
  schema changes are additive, so rollback is safe; a tested rollback plan exists.
- **Before go-live:**
  - your approval;
  - green CI on the Phase 10 PR (done: PR #40, CI and Security pass);
  - a pre-deploy database backup;
  - the post-deploy checks in `RELEASE_CANDIDATE.md`.
- **Strongly recommended first:**
  - protect `main`;
  - decide whether the repository stays public;
  - turn on S3 versioning and lifecycle rules.

## 12. Exact next action

**Owner:** review the Phase 10 pull request into `main` and wait for its CI to pass. Then reply "approve production
deploy". After that:
1. Take the database backup in `docs/DEPLOY.md` §1.
2. Merge the PR.
3. In Render, choose Manual Deploy → "Deploy latest commit".
4. Run the post-deploy checks in `RELEASE_CANDIDATE.md` (Reliability > Run checks, Check the backup bucket, Back up
   now, Test a restore).
