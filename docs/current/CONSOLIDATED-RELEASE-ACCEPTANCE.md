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
