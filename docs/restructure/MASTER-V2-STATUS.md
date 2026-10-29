# Master Plan v2: implementation and release status

Date: 29 October 2026 (Australia/Perth). Base: baa55d246024eacfa458c1d1cc28204d110b2c73.
Branch: codex/superpro-two-portals-v2. Production promotion: **ON HOLD**.

This is an isolated, functional review release. It is not a claim that every proposed provider service or migration in the master plan is complete. Existing production and the separate Fleet Parlour website/repository have not been changed. No production records, credentials, emails, payments or external domains were copied into development.

## Source review and corrections

The uploaded merged Master Plan v2 was read in full, including its Business Workspace, Founder Console, move/split map, billing, new services, migration and acceptance sections. Its two-portal decision is the implementation target. The 101-page blueprint remains the detailed preservation baseline.

- The quick pad is the existing **Get Paid** pad, not a personal notes feature. It is preserved.
- v2 says X is absent from the connection runtime. The checked source has `testX` and `provider==='x'` in `src/integration-runtime.js`, as well as OAuth/readiness paths and existing browser regression coverage. These are retained; real provider authorisation remains a separate acceptance step.
- The global receptionist configuration is legacy, not a usable tenant add-on. A new, organisation-bound draft profile does not make the old voice transport tenant-isolated. Live multi-business receptionist activation remains blocked.
- A shared design system does not merge business sessions, platform identities, data, keys, audiences, billing or approvals.

## What this branch implements

### Business Workspace

The 22 existing views are retained. Navigation now has B01-B09 and 38 owner-visible destinations. Main sections appear in an expandable icon rail; pages for only the selected section appear in the top tab strip. Existing canonical hashes and common bare-group links remain aliases. Existing business permissions still decide which routes are available.

New working surfaces include:

- Email centre: folders for Received, Drafts/Approved, Sent, Scheduled, Support, Enquiries, Invoices, Marketing and Campaigns; recipient/subject search; compose and edit; AI-assisted draft when configured; version-specific human approval; separate send permission; schedule/cancel; message activity.
- New tenant-bound enquiry, quote, booking, invoice and campaign draft registers; quote approval, recorded acceptance evidence and conversion into a booking draft. These are **not** the complete legacy revision/acceptance/completion/invoice/payment pipeline migration.
- Business archive for new documents, and preservation of existing customer, job, finance, hiring, import/export and Get Paid tools.
- Owner review/approval/refusal/revocation of time-limited platform support requests.
- Owner-only, revision-checked receptionist draft settings: greeting, verified knowledge, hours and timezone. No live number is activated.
- Private service request registers for numbers, calls/SMS, receptionist, meetings, websites/domains, Search Console and backlink assistance. The UI says provider setup is required. Saving a request does not purchase, publish, port, place a call or create a video room.

### Founder Console

`/office/` now opens the new F01-F09 console. The existing founder sign-in remains available; business owners do not acquire operator authority. Platform staff have separate email/password/MFA identities, database-backed expiring sessions, individually enumerated section/action grants and immediate session revocation. Authenticator secrets are encrypted using the integration vault. Founder sessions issued through sign-in are revocable on logout. The environment admin key remains an emergency credential; rotating it is a separate operation.

Working platform surfaces:

- Account-level subscriber register, profile and plan/usage summaries.
- Subscription invoice list; existing founder payment/provider, subscriber/add-on and visibility/readiness maintenance tools remain reachable through explicit links.
- Platform-only email centre; non-admin platform staff see their own created mail, not the founder's whole correspondence. The founder/admin mailbox is separately scoped from all tenant mail.
- Platform-only task, incident, cost, ticket, prospect, campaign/content draft, hiring request and announcement draft registers. These are **registers**, not complete replacements for hiring, publishing, campaign execution or accounting workflows.
- Temporary support-access requests, with subscriber owner approval, scoped read-only views (customer names, job summaries or communication thread summaries), max 24-hour expiry, revocation and audit. No automatic tenant session is created.
- Individual operator creation, grant changes, suspension/restoration and ending sessions.
- Append-only hash-linked platform audit and per-person notification read state.
- Founder-only Complimentary grant/revocation with current-revision checks, organisation ID, feature profile, reason and optional expiry.
- Read-only legacy row counts. No legacy customer content is reassigned, deleted or shown on the new overview.

`office/legacy.html` preserves existing frontend maintenance tools and source. Its normal navigation exposes only the retained platform tools. The legacy `/api/admin/*` founder-key APIs are still available for compatibility and recovery. This is **not yet a complete API retirement or quarantine enforcement**; ordinary platform staff tokens cannot use them.

### Subscription waiver

`src/subscription-policy.js` supplies one organisation-level policy. The underlying public plan and payment truth are preserved; the waiver does not create fake paid history. Valid grants unlock the selected standard feature profile without trial expiry, skip new subscription invoice drafts, scheduled subscription invoices, overdue reminders and trial/payment-failure dunning. Existing online subscription payment links cannot start a new charge while the waiver is active. Revocation restores normal subscription rules. Provider settlement facts and prior invoices are not erased.

The waiver does not automatically subsidise AI, calls, SMS, storage, domains or video. A versioned provider usage ledger, subsidy budgets, reconciliation, paid-service activations and spend-cap enforcement remain to be implemented before those services can be sold.

### Email safety and records

Business and platform mail use separate scope/owner keys on every new query. Tenant IDs come from authenticated membership, not compose fields. Changing a draft resets approval; the approval hash binds recipient, subject, body, category, schedule and revision. The scheduled sender and approver are re-authorised before dispatch. Revoked identities cannot run queued mail.

Provider dispatch uses a stable idempotency key. A claimed message cannot be concurrently dispatched twice. A timeout/unknown outcome is recorded as `delivery_unknown` and is not automatically resent. Verified receipt events can advance accepted/sent/delivered/opened/failed states. Open tracking is labelled a signal, never proof that a person read a message. Existing verified inbound business email is visible read-only in Received; new platform inbound email requires an explicitly configured, unambiguous Super Pro support mailbox. Signed webhooks are required.

Existing delivery and reply-driven follow-up tracking is retained. New business enquiry mail enters that tracking path. Bulk/marketing sends stay blocked until a verified audience, opt-out enforcement and campaign transport are implemented; category labels alone never authorise a campaign send. OTPs and private invitations are not automatically followed up. A full legacy/platform correspondence backfill and complete platform scheduled follow-up integration are still pending.

## Ownership, storage and preservation

- New business records carry `organisation_id`; new mail carries `(scope, owner_id)`. New platform tables are not tenant tables.
- New identity, mail, grant and document tables are additive. Existing legacy rows and identifiers are not changed by a migration.
- Existing SQLite/S3/Litestream production configuration is preserved. This branch does not read or restore the production backup.
- Existing tenant file upload/download checks remain. New mail has no arbitrary attachment-upload path. A universal folder migration has not been performed.
- Business exports now include the new business mail/activity, document and service-request records; platform identities, tokens, credentials, platform mail and unrelated tenants are excluded.
- No use of the prohibited Gmail account or its Drive. No Google account was accessed for this work.

## Phase gates

| Phase | Status in this branch | Remaining gate |
|---|---|---|
| P0 Baseline/restore | Source baseline recorded; disposable fixtures tested | A fresh production backup and isolated restore/reconciliation drill; no production access performed |
| P1 Authority | Separate staff identity, per-action grants, support approval and audit implemented | Complete platform role/record assignment matrix, every legacy route retirement and independent review |
| P2 Neutral product | Neutral first-run seeds, sender defaults, product prompts and active console identity | Inventory every legacy saved setting/credential; approve data disposition; complete remaining source/content audit |
| P3 Feature parity | All existing workspace views retained; new console and draft registers usable | Full enquiry/quote revision/acceptance/booking/completion/invoicing migration, all 45-view behaviour reconciliation |
| P4 Billing | Central Complimentary software waiver and billing skips implemented/tested | Usage ledger/rate versions/subsidies/caps and comprehensive provider settlement scenarios |
| P5 Services | Isolated settings and service requests only | Quoted providers, signed number routing, purchase/port approvals, video room integration, website/domain control, Search Console authorisation |
| P6 Interface | Shared rail/subtabs/cards/dialogs; existing UI regression suite adapted | Final human phone/tablet review, complete public email/portal parity and accessibility/performance field measurements |
| P7 Production | Not promoted or merged | All 17 master-plan acceptance gates, migration/restore proof, exact-head CI, user manual production deployment |

## Acceptance evidence and limitations

Local checks use throwaway SQLite databases, synthetic users and test recipients, with real provider secrets excluded. The test suite covers foreign-tenant denial, approval invalidation, schedule revocation, separate platform identity, encrypted MFA, founder-only grants, skipped invoice creation, support approval/revocation, per-tenant drafts/profiles and no accidental service activation. Existing application, integration and browser tests provide regression evidence, not proof of live delivery or all external workflows.

See the pull request for exact final test results and commit. Do not claim any externally delivered email, successful payment, number port, meeting, domain purchase, indexing, website publication or production restore based on these tests.

## Render review setup

The original service stays on `main`, with auto-deploy off; no existing disk or backup is mounted by a review service. If a separate Free review service is created, it must use **only synthetic data**, independent generated keys, `SUPERPRO_ISOLATED_PREVIEW=1`, `REQUIRE_PERSISTENT_DISK=0`, no provider keys and no S3 settings. Synthetic owner/employee identities are seeded only in that explicit mode. Test data may disappear on restart/redeploy/spin-down. Free instances consume included build/bandwidth quotas and must never hold real subscriber records.

For durable staging, create a separate service and separate persistent disk/store after reviewing its cost; do not attach or clone the production disk automatically. Health check: `/healthz`. Auto-deploy: off. Never switch the existing production service to this branch as a shortcut.

References checked: https://render.com/docs/free ; https://render.com/docs/web-services ; https://render.com/docs/compute-plans ; https://render.com/docs/health-checks ; https://render.com/docs/deploys .
