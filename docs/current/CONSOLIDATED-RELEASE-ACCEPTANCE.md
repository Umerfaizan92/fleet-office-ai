# Consolidated release acceptance contract (15 October 2026)

Status: REQUIREMENTS LOCKED FOR IMPLEMENTATION; NOT PRODUCTION VERIFIED.
Production must not be updated solely because this document exists.

## Non-negotiable acceptance gates
1. Each organisation is a tenant; every business record, file, search, import, export, AI thread, channel credential, webhook and chat message must be tenant-scoped and authorisation checked. Cross-tenant reads and writes return 403/404. Test with at least two tenants and overlapping worker email addresses.
2. Business owners invite staff from Team Directory. Invitations are single-use, expiring and bound to an organisation and role; invitees establish their own credentials/MFA. Staff have distinct memberships; do not share owner credentials. Deactivation revokes sessions and tokens. Worker record and login identity must be linked by immutable membership/worker IDs, not email matching alone.
3. Permission matrix covers owner, administrator, manager, employee, contractor, support, platform owner. Backend authorisation is mandatory on every sensitive endpoint; frontend hiding is supplementary. Audit every privilege change and privileged data access.
4. Office Chat displays authorised active staff and designations. Inactive users are hidden by default but available to authorised administrators. Each user can update only their own availability, optional brief non-sensitive reason and return time; distinguish presence, roster, leave and manual availability. Realtime or polling updates and accessible status colours.
5. Platform-owner console is isolated from tenant dashboards, protected by phishing-resistant MFA, audited support access, least privilege and emergency recovery. Subscription counts, tiers, revenue, billing status and reward eligibility must be reconciled to actual payment events; never expose passwords or secret values.
6. Cancellation has explicit 28-day recovery/export access if contractually adopted, warnings, owner confirmation, reinstatement, and retention/legal-hold rules. Never promise universal deletion at day 28 or indefinite storage. Returning customer recognition only with lawful minimal retained data.
7. Fresh tenant onboarding never copies another tenant's data. Each tenant has logically isolated worker records and object-storage prefixes with signed or authorised access. Verify backup, restore, retention and encryption.
8. Unified inbox ingests authorised email, website enquiries, AI receptionist calls, SMS, WhatsApp and supported social channels into a deduplicated tenant-scoped conversation model; preserve provider message IDs, provenance, timestamps, consent and audit trail. Missing provider credentials must show 'not connected', never 'working'.
9. Import/export/sync: CSV/XLSX contacts, customers, workers, quotes and jobs; mailboxes and prior enquiries; mobile/desktop uploads; cloud drives via OAuth/provider APIs. Preview field mappings, validate, deduplicate, dry-run, checkpoint, rollback, and audit. Scope imports to the active tenant; no silent overwrites or cross-tenant merges. Background sync requires explicit user consent and revocation.
10. End-to-end enquiry → quote → customer approval → job → worker allocation → completion/evidence → invoice → payment → receipt/review. Test happy path, denial, retries, idempotency, concurrent offers, partial payments and cancellations.
11. Production object storage must be proven durable, private, encrypted, backed up and linked to the deployment. A configured bucket name alone does not prove connectivity. No secrets committed to GitHub.
12. Automated tests: syntax, quality, schema migration, integration, smoke, security (IDOR/cross-tenant), role matrix, import/export, cancellation lifecycle, webhook verification, mobile and desktop UI, accessibility, performance and production readiness. CI green plus live acceptance evidence required.
13. Single canonical route/feature implementation; preserve necessary migration scripts and records; no duplicate versioned browser bundles or conflicting middleware.

## External credentials inventory (do not paste secrets into chats)
- Core: ADMIN_API_KEY, SAAS_SESSION_SECRET, INTEGRATION_ENCRYPTION_KEY, PUBLIC_BASE_URL or ALLOWED_ORIGINS.
- AI: GEMINI_API_KEY (or GOOGLE_AI_API_KEY); optional alternate AI provider keys.
- Email: RESEND_API_KEY or SMTP_HOST/SMTP_USER/SMTP_PASS; notification addresses.
- Phone/SMS: TELNYX_API_KEY, TELNYX_CONNECTION_ID, BUSINESS_PRIMARY_NUMBER, TELNYX_FROM_NUMBER, VOICE_ENQUIRY_NOTIFY_TO, VOICE_ENQUIRY_ALERT_PHONE; optional OWNER_PRIVATE_TRANSFER_NUMBER.
- WhatsApp: WHATSAPP_ACCESS_TOKEN, WHATSAPP_PHONE_NUMBER_ID.
- Meta: META_APP_ID, META_APP_SECRET; provider-approved Facebook/Instagram page tokens/IDs.
- TikTok: TIKTOK_CLIENT_KEY, TIKTOK_CLIENT_SECRET.
- Google/YouTube: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET; optional YOUTUBE_API_KEY/YOUTUBE_CHANNEL_ID.
- Snapchat: SNAPCHAT_CLIENT_ID, SNAPCHAT_CLIENT_SECRET.
- X: X_CLIENT_ID, X_CLIENT_SECRET.
- Payments: STRIPE_SECRET_KEY or PAYPAL_CLIENT_ID/PAYPAL_CLIENT_SECRET or approved bank instructions.
- Storage: OBJECT_STORAGE_BUCKET or AWS_REGION/AWS_S3_BUCKET/AWS_KMS_KEY_ID; actual IAM credentials or workload identity, endpoint and permissions must be separately validated.
- Website: WEBSITE_PUBLIC_URL or WEBSITE_API_BASE_URL/WEBSITE_API_KEY or WEBSITE_WEBHOOK_SECRET.
- ABR: ABR_GUID.
- Deployment: RENDER_API_KEY and RENDER_SERVICE_ID only if automated deployment management is needed.
- Search visibility: INDEXNOW_KEY when supported.

## Release evidence
Each item must be recorded as implemented, tested, blocked by credentials, or failed, with test command, result and commit SHA. Never mark 'complete' on code presence alone. No deployment without explicit go/no-go review.

## Recovered requirements and implementation ledger — 18 October 2026

Earlier conversation requirements were retrieved on 18 October. Assistant completion claims are not acceptance evidence. This ledger consolidates those requirements without creating another versioned application or dropping existing functionality.

The user subsequently explicitly authorised deploying consolidated-improvements-2026 to the existing production URL. That supersedes the earlier production freeze; deployment has NOT happened. Render sign-in was blocked by automatic browser security review. Do not circumvent that block or claim deployment success.

| Requirement group | Current evidence / next acceptance gate |
|---|---|
| Employee accounts and Team Directory | Worker records exist; complete expiring single-use invitations, identity linkage, employee login, revocation and role tests. Worker profiles alone are not accounts. |
| Platform Owner administration | Separate privileged console, strong MFA and audited support access remain unverified; do not treat tenant owner as platform owner. |
| Business switching | Membership-validated listing/selection exists server-side. Current changes add a visible selector, document-bound API context, full reload on switching and per-business/per-user AI memory. Runtime tests check role changes between memberships; browser acceptance still pending deployment. |
| Workforce and allocation | Identity-bound offers and atomic capacity enforcement tested; complete employee-specific workflow and field evidence acceptance. |
| Staff Chat and availability | Existing tenant chat/presence foundation; verify directory, designations, inactive staff, availability and return-time behavior with separate accounts. |
| Unified inbox / Customer 360 | Must prove deduplicated email, website, phone, SMS, WhatsApp and authorised social ingestion and customer linkage. Provider-readiness indicators are insufficient. |
| Imports, exports and sync | Implement preview, mapping, validation, deduplication, dry run, checkpoints and rollback for required CSV/XLSX entities and authorised cloud-drive sources. |
| Cloud storage and backup | Bucket configuration is not proof. Verify private tenant prefixes, access, encryption, upload/download and backup/restore with actual configured provider access. |
| Subscriptions, cancellations and payments | Existing plan/lifecycle UI is not payment reconciliation. Verify billing events, actual entitlements, recovery/export and legal retention rules; resolve contract-vs-current indefinite-preservation behavior before commercial release. |
| Full job lifecycle | Verify enquiry → quote → approval → booking → allocation → evidence → invoice → payment → receipt/review, including retries and cancellation. |
| Finance and profitability | Preserve expenses, revenue, stock/service costs and per-job profit. Verify finance permissions and calculations. |
| Analytics and referrals | Preserve marketing/staff/customer reporting and referral lineage; distinguish real events from illustrative scores, and reward eligibility from actual approved rewards. |
| AI workspace and multilingual voice | Preserve solo/team setup, workspace designer, product guide, Co-pilot and receptionist. Voice cancellation regressions pass; real multilingual speech/transcription and receptionist delivery still need evidence. |
| Maker/Checker and quality gates | Preserve independent checking; prove configured checker behavior rather than equating static quality scores with complete implementation. |
| Content Studio | Keep edit specifications; no fabricated media or render claims. Complete actual tenant media discovery/storage and licensed rendering pipeline. |
| Connections | Preserve official OAuth, consent, refresh and revoke. Test actual configured ABR, email, Telnyx, Meta/WhatsApp, TikTok, Google/YouTube, Snapchat/X, payment and website integrations; report unavailable credentials without exposing secrets. |
| Governance and support | Preserve approvals, Help Desk, protected complaints, audit, security and escalation. Test permissions and execution boundaries. |
| SEO/GEO/AEO and PWA | Preserve canonical/OpenGraph metadata, structured data, sitemap/robots, Answer Center, indexing controls and private noindex/network-only behavior. Validate against the deployed version. |
| UI and accessibility | Every page/button/form; desktop/mobile, light/dark, keyboard navigation and errors. Earlier live tests cover owner navigation only, not all roles or mobile layouts. |
| Cleanup and migration | One canonical implementation; retain legitimate migrations and records. Never delete the repository. Old Render-service removal requires identifying exact obsolete services and respecting deletion confirmation. |
| Live pilot | Fleet Parlour first; a separately isolated real-estate tenant afterwards. Do not copy Fleet Parlour data into that tenant. |

No row is declared fully complete merely because code exists. Missing credentials, missing implementation and missing live evidence are separate blockers.

## 2026-10-18 recovery checkpoint

Restored the saved development branch after workspace pruning. Unpublished staff-account invitation work was not recoverable from the older saved archives and remains outstanding.

- Restricted worker lists, compliance, documents and skills to the authenticated employee's immutable worker identity; management roles retain tenant-scoped access. Matching email addresses do not grant access.
- Restricted employee work-order lists to jobs offered to their linked worker identity.
- Restored compact business setup with one visible section, keyboard navigation and automatic display of invalid fields. Replaced misleading autosave wording with explicit save guidance.
- Verification: all 15 Node tests passed, including real-server permission checks; final validation, static quality checks, controlled integration tests and runtime smoke tests passed on Node 24.19. CI on the declared Node 22.22 runtime must also pass.
- No new live deployment or browser acceptance is claimed. Previously reported deployment authentication review blockage remains unresolved. Actual provider delivery, mobile layouts, all-role acceptance and the other open requirements above remain unverified.

## Deployment verification — 2026-10-18

Commit ba58621 passed both GitHub workflows and a fresh local run of all 15 tests, final validation, controlled integration tests and server smoke tests. Cloud Browser opened all 13 owner navigation pages on the existing production version. This is navigation coverage, not form, role or external provider acceptance. The production interface still shows the older build.

The historical checksum manifest failed against current development files. Regenerated it from tracked repository files (excluding the manifest itself) and enabled manifest verification on every consolidated development check. This records file integrity, not feature completeness. Deployment remains blocked by the previously rejected Render authentication action; no deployment or merge to production has been performed.

## Staff-account implementation and tests — 2026-10-18

Rebuilt the unpublished staff-account implementation as a dedicated owner-only Staff accounts page and compact invitation dialog. Owners create 48-hour, hashed, single-use invitations for admin, manager, employee or contractor roles. Owner and Platform Owner roles cannot be assigned through this route. The invitation is a private shareable link; the UI explicitly states that no invitation email was sent.

New accounts and existing accounts without verified email must verify the invited mailbox. Existing users must authenticate with their current password and MFA when enabled; invitations cannot replace their password. Verification delivery fails honestly if the provider is unavailable. New staff passwords require 14 characters. Owner-invited non-owner accounts may sign in with verified email; owner mobile verification requirements are preserved. No phone-verification or compliance/scheduling approval is fabricated.

Revocation removes only the selected business membership, disables worker scheduling and invalidates pending invitations for that worker. Existing sessions cannot regain access to the revoked business. Other business memberships and historical worker records remain intact.

Automated real-server assertions cover owner-only access, cross-tenant rejection, disallowed roles, hashed tokens, required/wrong email codes, acceptance, replay, expiry, existing password and MFA protection, actual staff login, immediate session access revocation and preservation of other business memberships. Codes are seeded in an isolated test database; these tests do not prove real email delivery. All 15 test cases pass with the expanded assertions. Validation, quality, controlled integration and smoke checks also pass.

This increment is development-only until deployed. The new UI, actual mailbox delivery and full employee acceptance require live testing. Earlier production checks confirmed all 13 owner pages and four compact setup tabs for commit 0a3630e; they do not cover this increment. Other requirement groups remain open.
