# Step 1 — Master Architectural Reset & Conflict Cleanup
Date: 2026-10-24
Scope: **Super Pro AI Office Manager only**. This is a non-destructive architectural baseline and conflict-prevention gate, not a claim that the full product is implemented, deployed, or legally certified.

## Source of truth and release safety
- Source repository: `Umerfaizan92/fleet-office-ai`.
- Audit baseline: `consolidated-improvements-2026`; this work lives on `architecture-reset-step1-20261024`.
- Existing `main`, the live Render service, production databases, credentials, uploads, and the Fleet Parlour public website are **not changed** by Step 1.
- Keep `/office` as a compatibility surface until data and workflow parity are verified; do not delete it or silently reroute users.
- Preserve data, customer histories, existing migrations, and lawful retention/hold obligations. No destructive database resets.

## Observed repository inventory (static source inspection)
| Surface | Current state | Reset decision |
|---|---|---|
| `src/server.js` | ~378 KB single backend; 188 literal GET/POST/PUT/PATCH/DELETE routes, plus middleware | Split gradually into route domains with one shared auth/tenant context; **do not** big-bang rewrite |
| `src/db.js` | 75 distinct CREATE TABLE declarations | Version schema migrations, backfill and rollback tests before changes |
| `/saas/workspace.html` | Main SaaS UI with 14 distinct JS assets; many view modules | Keep canonical shell; consolidate one section per view and explicit Next/Back navigation |
| `/office/` | Legacy operational UI still served | Treat as compatibility adapter; migrate by capability after parity tests |
| `saas/app.js` | ~127 KB workspace controller | Extract view/router, API client, role-aware state, form modules incrementally |
| `saas/approvals.js` | Approval UI runtime | One authoritative approval workflow; do not confuse legacy `approvals` with `workspace_approvals` |
| `src/team-accounts.js` | Owner-created worker invitation and account-linking API | Preserve immutable worker/user/membership linkage; verify revocation and invite expiry |
| `scripts/*security*.test.mjs` | Existing security regression coverage | Expand deny-by-default matrix and live acceptance; tests do not prove production compliance |

**Static conflict scan:** No duplicate literal HTTP method+path registrations in `src/server.js`; no duplicate HTML IDs or duplicate asset references in the three entry HTML files checked; no repeated CREATE TABLE names in `src/db.js`. This does **not** rule out dynamic route collisions, duplicate business logic, CSS specificity conflicts, cross-tenant bugs, or runtime integration failures.

## Canonical architecture (target, not current certification)
1. **Identity / tenancy** — Verified session; active organisation resolved server-side from membership; client-selected organisation ID is a *request*, never trusted authority. Deny-by-default server RBAC and record-level checks; distinguish platform owner from business owner.
2. **Shared business data** — Tenant-scoped customers, contacts, enquiries, timeline, quotes, bookings, work orders, worker allocation, invoices, payments, receipts, and evidence. Stable IDs and idempotent transitions.
3. **Approvals and AI** — One approval policy/queue/audit model for consequential external actions. AI drafts are not executed or represented as delivered until an authorised human approves and provider confirms.
4. **Workforce** — Separate person/worker profile, user identity, organisation membership, eligibility evidence, availability, skills, and job offer. Offshore workers may use an owner-authorised Australian-work-right-check exception **only where the work is genuinely performed outside Australia**; identity checks remain mandatory and applicable local law still applies. Do not use this exception to bypass Australian requirements for work performed in Australia.
5. **Communications** — One tenant-scoped conversation/event model across authorised email, website, phone, SMS, WhatsApp and social providers. Preserve external IDs, provenance, consent, retries, deduplication and connection status.
6. **Finance / billing** — Separate tenant job accounting from platform subscription accounting. Entitlements must derive from verified payment events, not visual trial badges.
7. **Assets / storage** — Authorised uploads, private per-tenant storage paths, durable backups and tested restores; never infer storage is working from configuration alone.
8. **Interface** — One SaaS shell, one visible section at a time, clear Next/Back, keyboard and mobile accessibility, consistent light/dark themes; no invented operational counters or completed AI media.
9. **Governance** — Platform-owner access isolated with strong MFA and audited support; user complaints, logs, retention and lawful disclosure controls.

## Conflicts to resolve in later implementation steps
| ID | Conflict / migration risk | Resolution gate |
|---|---|---|
| ARC-01 | Legacy `/office` and new `/saas` are both active | Map each legacy workflow to canonical SaaS API; parity test before retirement |
| ARC-02 | Legacy `approvals` and SaaS `workspace_approvals` coexist | Explicitly document ownership; migrate records only with reversible mapping and test |
| ARC-03 | Legacy `staff_chat_messages` and `office_staff_chat` coexist | Define source-of-truth per tenant, message ID and permission model before merging |
| ARC-04 | Monolithic server and workspace JS make route/state conflicts difficult to spot | Modularise behind stable routes with contract tests, one domain at a time |
| ARC-05 | Static security tests cannot prove all tenant boundaries | Two-tenant, cross-role, IDOR, import, file, webhook and AI memory runtime tests |
| ARC-06 | Provider configuration may be mistaken for delivery | Require real provider acknowledgement and explicit 'not connected' state |
| ARC-07 | UI claims may outpace implemented backend | Evidence ledger per feature: implemented / tested / blocked / failed |
| ARC-08 | Offshore staff eligibility can conflict with AU-only verification | Owner-only exception with mandatory identity, location evidence, audit and compliance review |
| ARC-09 | Deployment can inadvertently alter production data | Separate dev environment, migrations with backups and restore drill, release approval |

## Step 1 changes in this branch
- Added this architectural inventory, boundaries, conflict ledger and migration gates.
- Added `scripts/architecture-contract.test.mjs`, a zero-dependency static regression test that detects duplicate literal routes, duplicate HTML IDs, duplicate script/style references and repeated SQL table declarations.
- No existing business logic, API endpoints, production settings, credentials, databases or deployment targets changed.

## Acceptance status
- **Static inventory:** performed against the source branch on 2026-10-24.
- **Architecture guard:** added; must pass in GitHub CI before merging.
- **Conflict remediation / modularisation:** **not complete**; tracked above.
- **Live browser, provider delivery, migration and security certification:** **not performed by this step**.
- **Deployment:** **not performed**.

## Next implementation sequence
1. Capture endpoint/data ownership map and RBAC matrix; add failing security contract tests for known gaps.
2. Introduce shared request context and domain route modules with identical observable behaviour.
3. Resolve approvals and chat ownership using reversible migrations; retain legacy compatibility.
4. Complete worker identity and offshore exception policy, inbox, lifecycle, subscriptions and storage behind acceptance tests.
5. Run full CI, authenticated two-tenant browser tests, backup/restore and controlled deployment review.
