# Phase completion matrix

Each phase was checked against its own prompt, not against the fact that the prompt was sent. Prompts saved in the
repository: `docs/phase-04/` to `docs/phase-10/`. The Phase 00 and 01 prompts and reports were given in chat and
never saved; their requirements are recorded in `.claude/project-memory/COMPLETED_TASKS.md` (T-000, T-001).

Status meanings:
- **Complete**: every requirement is built and covered by tests.
- **Complete, live unverified**: built and tested against documented formats or local stand-ins; a real provider has
  not been called.
- **Partial**: a requirement is missing (listed).

## Phases 00–10

| Phase | Requirement (summary) | Status | Evidence | Gaps / follow-up |
|---|---|---|---|---|
| **00** Discovery and preservation | Inventory, feature classification, security and deployment baseline, preservation strategy | **Complete**, but the report is not in the repository | T-000. The preservation checklist was rebuilt from code (`scripts/verify-modules.mjs`, Phase 04) and is now enforced against `main` by `release:audit`. | The original chat report is not saved. If you still have it, add it to `docs/phase-00/`. |
| **01** Competitor analysis and blueprint | Salesforce, HubSpot and monday.com research, capability comparison, three-product blueprint | **Complete** (report in chat) | T-001. The blueprint shaped Phases 03–09. | Report not saved in the repository. |
| **02** Security, database, infrastructure, AWS S3 | Server-side roles, tenant isolation, private encrypted storage with signed URLs and file checks, separate backups, restore drill, job queue, observability, environment plan, CI checks | **Complete, live unverified** (AWS) | `5cf7377`. `object-storage.test`, `s3-files.test`, `restore-drill.test`, `job-queue.test`, `tenant-isolation.test`, `security-policy.test`, CI workflows, `infra/aws/*`, `docs/infrastructure/*` | S3 primary mode is off by default (disk). No AWS account was checked (T-060). |
| **03** Cinematic 3D design and frontend | Design tokens, component library, 19-page public site, retheme of existing pages, visual regression, accessibility and performance, reduced motion | **Complete** | `6b387fd`, `6a5ddc8`. `docs/design/DESIGN_SYSTEM.md`. `test:site-ui`, `test:visual`, `report:a11y-perf` (0 serious issues, 0 pages over budget) | Desktop total blocking time with the 3D hero forced on is about 740 ms, after the largest paint (KNOWN_ISSUES). Tested in Chromium only. |
| **03.5** Autosave, checkpoint and resume | Project memory, checkpoints, recovery snapshots | **Complete** | `project-memory.test`, `npm run memory:*` | — |
| **04** Subscriber Workspace and Founder Console | Every listed module verified, pipeline end to end, Founder Console tabs, no false success messages | **Complete**; some modules need providers | `docs/phase-04/VERIFICATION.md`, `pipeline.test`, `test:pipeline-ui`, `test:console-ui`, `verify:modules` | VEVO checks are manual. Domain purchase is a request only. |
| **05** AI automation and human approvals | 20 capabilities, 4-level policy, approval queue (approve, reject, edit, schedule, clarify), server-side authorisation, schedules, retries, audit, emergency pause | **Complete** | `automation-engine.test`, `automation-governance.test`, `test:automations-ui`, `release-security.test` (policy table) | AI analysis needs an AI provider; built-in rules are used otherwise. |
| **06** Technical SEO, clusters, Google, website automation | 19-area audit, clusters, Google integrations, content studio, builder with approvals, local SEO, analytics, reports | **Complete, live unverified** (Google) | `seo-audit.test`, `seo-units.test`, `seo-platform.test`, `test:seo-ui`, `release-seo-check` | Live Google calls not made (T-053). Image re-encoding (T-051), custom domains (T-052). |
| **07** Email, SMS, WhatsApp, voice, campaigns | Unified inbox with folders and views, 10 AI functions, voice audit and fixes, campaigns with consent, unsubscribe and approval, founder email isolation | **Complete, live unverified** (Telnyx, Resend) | `comms.test` (6), `test:comms-ui` (10) | WhatsApp and social replies are not sent directly. A live call test is pending (T-055). |
| **08** Payments, accounting, GST, Australian compliance | Quotes, estimates, deposits, tax invoices, GST, receipts, links, status, refunds, credit notes, reconciliation, reports, reminders, platform billing, Stripe review, AI with approvals, versioned AU rules | **Complete, live unverified** (Stripe) | `finance.test` (6), `test:finance-ui` (11), `docs/phase-08/*` | A tax agent has not reviewed the rules. Live Stripe pending (T-057). |
| **09** Backups, monitoring, recovery | Audit, automated and encrypted backups in a separate bucket, versioning, retention, integrity checks, restore tests, configuration backup, RPO/RTO, 14 monitors, self-healing, approvals, daily summary | **Complete, live unverified** (AWS) | `reliability.test` (4), `test:reliability-ui` (7), `docs/phase-09/*` | Monthly snapshot copies (T-059). Live bucket check pending (T-060). Consolidation fixed the IAM policy gap; see SECURITY_AUDIT. |
| **10** Testing, QA, release preparation | Functional, security, automation, frontend, SEO and infrastructure audits; release candidate; rollback plan | **Complete** | `docs/phase-10/*`, `release-audit`, `release-security.test`, PR #40 CI green | Self-audit; an independent review is recommended. |

## Six earlier design and development prompts

These came before Phase 00. Each was delivered on its own branch. I checked that every commit on each branch is
contained in `consolidated-improvements-2026` (`git rev-list --count consolidated-improvements-2026..origin/<branch>`
returns 0).

| Prompt / branch | Delivered | Contained in release | Notes |
|---|---|---|---|
| Unified design benchmark (`codex/unified-design-20261027`, `cursor/frontend-redesign-audit-a710`) | `docs/frontend-design/BENCHMARK.md` | Yes | Later re-skinned by Phase 03 through variables only. |
| Cinematic navigation (`codex/cinematic-navigation-20261028`) | `docs/frontend-design/CINEMATIC-UPDATE.md` | Yes | Hover menus and bounded icon motion. Reduced motion respected. |
| Compact layouts, sign-in fit and presence (`codex/compact-layouts-20261028`, `codex/compact-signin-20261028`, `codex/portrait-signin-fit-20261028`) | `docs/frontend-design/COMPACT-LAYOUTS-PRESENCE.md` | Yes | — |
| Notifications and recovery (`codex/notifications-recovery-20261028`) | `docs/frontend-design/NOTIFICATIONS-DELIVERY-RECOVERY.md` | Yes | — |
| Team access, AI and theme (`codex/team-ai-theme-20261028`, `codex/individual-staff-access-20261028`) | `docs/frontend-design/TEAM-AI-THEME-UPDATE.md`, `docs/STAFF_ACCESS.md` | Yes | — |
| Master Plan v2: two portals (`codex/superpro-two-portals-v2`, `codex/plugin-assisted-reliability-20261029`) | `docs/restructure/MASTER-V2-STATUS.md`, `docs/PLUGIN_ASSISTED_IMPROVEMENTS.md` | Yes (this is `main` today) | — |

## Branches not consolidated (decision needed)

| Branch | Content | Why it is not merged |
|---|---|---|
| `Business-Virtual-AI-Office` | An older, separate history (no common ancestor; last change 2026-10-25). | It is superseded. Compared route by route, this branch has every feature it had, except a few element IDs and a `validate:final` script that were already removed before `main`. The same functions exist under other names (finance KPIs, MFA verification). Kept as history. |
| `automation/non-invasive-search-monitoring-2026` (PR #22, draft) | A scheduled GitHub Actions SEO and availability monitor (Python), 9 files. | It is a draft "for review before activation". Merging it switches on a scheduled CI workflow, which needs your approval. It does not conflict with the app. |
