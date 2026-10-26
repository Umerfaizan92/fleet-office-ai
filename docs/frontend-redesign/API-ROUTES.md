# API route catalogue

Extracted from `src/*.js` on commit `468e366ff4d80f58241b1e5ce7da7a9d924e3fe2`. 372 method and path rows. This is the contract the redesign must not change.

Auth tags in brackets were detected only when `requireAdmin`, `requireSaasUser`, `requireSaasRole(...)`, or the operator login limiter appears within 500 characters of the route literal. A blank tag does **not** mean the route is public.

Routes registered inside installers still require a session:

| Module | Gate |
|---|---|
| `src/growth.js` | session + senior. Approve and publish: owner, admin, super_admin |
| `src/seo-cluster.js` | session + senior (read and edit). Admin overview routes use `requireAdmin` |
| `src/hiring.js` | session + owner or admin. Public apply is `/api/public/hiring/:token` only |
| `src/payments.js` | session + finance roles for settings and charges. Pad routes also allow manager, director, and employee |
| `src/team-accounts.js` | owner for list, invite, and remove. `verify-email` and `accept` are the invitation flow (rate limited, no owner session) |
| `src/billing-setup.js` | session. Authorise and withdraw are finance actions |
| `src/saas-platform.js` | per-route senior, admin, or owner gates inside the installer |

A row with no bracket did not have a named middleware beside the path literal. Treat webhook, OAuth, health, newsletter, product-guide, pay, and registration routes as their own cases in [INTERACTION-MAP.md](./INTERACTION-MAP.md). Do not treat a blank row as public, and do not treat it as admin.

## / (1)
GET /

## /api/admin/addons (2)
GET /api/admin/addons [admin]
POST /api/admin/addons/:id/:action [admin]

## /api/admin/ai-quality (2)
POST /api/admin/ai-quality/check [admin]
GET /api/admin/ai-quality/runs [admin]

## /api/admin/approvals (3)
GET /api/admin/approvals [admin]
PATCH /api/admin/approvals/:id [admin]
POST /api/admin/approvals/:id/decision [admin]

## /api/admin/attention (1)
GET /api/admin/attention [admin]

## /api/admin/automation-tasks (1)
GET /api/admin/automation-tasks [admin]

## /api/admin/bookings (3)
GET /api/admin/bookings [admin]
POST /api/admin/bookings [admin]
PATCH /api/admin/bookings/:id [admin]

## /api/admin/campaigns (2)
GET /api/admin/campaigns [admin]
POST /api/admin/campaigns [admin]

## /api/admin/channel-connections (1)
GET /api/admin/channel-connections [admin]

## /api/admin/channel-metrics (3)
GET /api/admin/channel-metrics [admin]
PUT /api/admin/channel-metrics/:channel/performance [admin]
PUT /api/admin/channel-metrics/:channel/reply-policy [admin]

## /api/admin/comms-channels (1)
POST /api/admin/comms-channels/:organisationId/:channel/activate [admin; saas-session; role:...SENIOR]

## /api/admin/content-projects (3)
GET /api/admin/content-projects [admin]
POST /api/admin/content-projects [admin]
POST /api/admin/content-projects/:id/prepare-posts [admin]

## /api/admin/content-templates (1)
GET /api/admin/content-templates [admin]

## /api/admin/conversations (4)
GET /api/admin/conversations [admin]
GET /api/admin/conversations/:id [admin]
POST /api/admin/conversations/:id/draft-reply [admin]
POST /api/admin/conversations/import [admin]

## /api/admin/customers (3)
GET /api/admin/customers [admin]
PATCH /api/admin/customers/:id [admin]
GET /api/admin/customers/:id/history [admin]

## /api/admin/dashboard (1)
GET /api/admin/dashboard [admin]

## /api/admin/date-proposals (1)
POST /api/admin/date-proposals/:id/confirm-booking [admin]

## /api/admin/enquiries (6)
GET /api/admin/enquiries [admin]
GET /api/admin/enquiries/:id [admin]
PATCH /api/admin/enquiries/:id [admin]
GET /api/admin/enquiries/:id/activities [admin]
POST /api/admin/enquiries/:id/activities [admin]
GET /api/admin/enquiries/:id/photos/:photoId [admin]

## /api/admin/expenses (2)
GET /api/admin/expenses [admin]
POST /api/admin/expenses [admin]

## /api/admin/followups (3)
PATCH /api/admin/followups/:id [admin]
POST /api/admin/followups/:id/discard [admin]
POST /api/admin/followups/:id/send [admin]

## /api/admin/history (2)
GET /api/admin/history [admin]
POST /api/admin/history/import [admin]

## /api/admin/integration-readiness (1)
GET /api/admin/integration-readiness [admin]

## /api/admin/invoices (7)
GET /api/admin/invoices [admin]
POST /api/admin/invoices/:id/:action [admin]
POST /api/admin/invoices/:id/adjust [admin]
POST /api/admin/invoices/:id/approve [admin]
POST /api/admin/invoices/:id/mark-sent [admin]
POST /api/admin/invoices/:id/payments [admin]
POST /api/admin/invoices/prepare [admin]

## /api/admin/jobs (7)
GET /api/admin/jobs/:id [admin]
POST /api/admin/jobs/:id/complete-work [admin]
POST /api/admin/jobs/:id/consents [admin]
POST /api/admin/jobs/:id/media [admin]
POST /api/admin/jobs/:id/request-review [admin]
POST /api/admin/jobs/:id/review-received [admin]
GET /api/admin/jobs/:jobId/media/:mediaId [admin]

## /api/admin/marketing-performance (1)
GET /api/admin/marketing-performance [admin]

## /api/admin/newsletter-subscribers (1)
GET /api/admin/newsletter-subscribers [admin]

## /api/admin/pay-links (1)
POST /api/admin/pay-links/:id [admin]

## /api/admin/performance-centre (1)
GET /api/admin/performance-centre [admin]

## /api/admin/platform-announcements (2)
POST /api/admin/platform-announcements [admin]
POST /api/admin/platform-announcements/:id/resolve [admin]

## /api/admin/platform-pay (3)
GET /api/admin/platform-pay [admin]
PUT /api/admin/platform-pay/:provider [admin]
POST /api/admin/platform-pay/:provider/test [admin]

## /api/admin/platform-pay-order (1)
PUT /api/admin/platform-pay-order [admin]

## /api/admin/profit-summary (1)
GET /api/admin/profit-summary [admin]

## /api/admin/quotes (9)
GET /api/admin/quotes [admin]
POST /api/admin/quotes [admin]
GET /api/admin/quotes/:id [admin]
PATCH /api/admin/quotes/:id [admin]
PUT /api/admin/quotes/:id [admin]
GET /api/admin/quotes/:id/date-proposals [admin]
POST /api/admin/quotes/:id/date-proposals [admin]
POST /api/admin/quotes/:id/request-approval [admin]
POST /api/admin/quotes/:id/verify-acceptance [admin]

## /api/admin/receptionist-settings (2)
GET /api/admin/receptionist-settings [admin]
PUT /api/admin/receptionist-settings [admin]

## /api/admin/records-summary (1)
GET /api/admin/records-summary [admin]

## /api/admin/reminders (2)
POST /api/admin/reminders [admin]
POST /api/admin/reminders/:id/done [admin]

## /api/admin/search-visibility (3)
GET /api/admin/search-visibility [admin]
POST /api/admin/search-visibility/indexnow [admin]
POST /api/admin/search-visibility/snapshot [admin]

## /api/admin/seo-cluster (2)
GET /api/admin/seo-cluster/overview [admin]
POST /api/admin/seo-cluster/run-all [admin]

## /api/admin/services (1)
GET /api/admin/services [admin]

## /api/admin/staff-chat (2)
GET /api/admin/staff-chat [admin]
POST /api/admin/staff-chat [admin]

## /api/admin/subscribers (6)
GET /api/admin/subscribers [admin]
GET /api/admin/subscribers/:id/followups [admin]
POST /api/admin/subscribers/:id/followups [admin]
POST /api/admin/subscribers/:id/payment [admin]
POST /api/admin/subscribers/:id/plan [admin]
GET /api/admin/subscribers/:id/profile [admin]

## /api/admin/subscription-plans (1)
GET /api/admin/subscription-plans [admin]

## /api/admin/visibility (4)
GET /api/admin/visibility [admin]
POST /api/admin/visibility/competitors [admin]
DELETE /api/admin/visibility/competitors/:id [admin]
POST /api/admin/visibility/run [admin]

## /api/admin/voice-enquiries (1)
GET /api/admin/voice-enquiries [admin]

## /api/admin/website-status (1)
GET /api/admin/website-status [admin]

## /api/ai-tools/enquiry (1)
POST /api/ai-tools/enquiry

## /api/ai-tools/owner-transfer (1)
POST /api/ai-tools/owner-transfer

## /api/enquiries (1)
POST /api/enquiries

## /api/health (1)
GET /api/health

## /api/health/storage (1)
GET /api/health/storage

## /api/newsletter/subscribe (1)
POST /api/newsletter/subscribe

## /api/newsletter/unsubscribe (1)
POST /api/newsletter/unsubscribe

## /api/operator/login (1)
POST /api/operator/login [operator-login]

## /api/pay/:id (3)
GET /api/pay/:token
GET /api/pay/:token/paypal-return
POST /api/pay/:token/start

## /api/payments/paypal (1)
GET /api/payments/paypal/return

## /api/product-guide/answer (1)
POST /api/product-guide/answer

## /api/product-guide/speech (1)
POST /api/product-guide/speech [saas-session]

## /api/product-guide/speech-stream (1)
POST /api/product-guide/speech-stream [saas-session]

## /api/product-guide/status (1)
GET /api/product-guide/status

## /api/product-guide/transcribe (1)
POST /api/product-guide/transcribe [saas-session]

## /api/public/hiring (2)
GET /api/public/hiring/:token
POST /api/public/hiring/:token/apply

## /api/saas/abn (1)
POST /api/saas/abn/verify

## /api/saas/account (4)
POST /api/saas/account/deletion/cancel [saas-session; role:'owner']
POST /api/saas/account/deletion/confirm [saas-session]
POST /api/saas/account/deletion/start [saas-session]
GET /api/saas/account/lifecycle [saas-session]

## /api/saas/activity (3)
GET /api/saas/activity [saas-session]
GET /api/saas/activity/access [saas-session]
PUT /api/saas/activity/access [saas-session]

## /api/saas/addons (3)
GET /api/saas/addons [saas-session; role:...FINANCE, 'manager', 'director']
POST /api/saas/addons [saas-session; role:...FINANCE]
POST /api/saas/addons/:id/cancel [saas-session; role:...FINANCE]

## /api/saas/address (1)
GET /api/saas/address/search

## /api/saas/ai (4)
POST /api/saas/ai/intents [saas-session]
GET /api/saas/ai/status [saas-session]
GET /api/saas/ai/threads [saas-session; role:'owner','admin','manager','super_admin','director']
POST /api/saas/ai/threads [saas-session; role:'owner','admin','manager','super_admin','director']

## /api/saas/announcements (2)
GET /api/saas/announcements [saas-session]
POST /api/saas/announcements/:id/read [saas-session]

## /api/saas/approvals (6)
GET /api/saas/approvals [saas-session]
POST /api/saas/approvals [saas-session]
PATCH /api/saas/approvals/:id [saas-session]
POST /api/saas/approvals/:id/decision [saas-session]
GET /api/saas/approvals/:id/events [saas-session]
PUT /api/saas/approvals/policy [saas-session; role:'owner','admin','manager','super_admin','director']

## /api/saas/billing (4)
POST /api/saas/billing/authorise
GET /api/saas/billing/providers [saas-session; role:'owner','admin','super_admin']
GET /api/saas/billing/setup
POST /api/saas/billing/withdraw

## /api/saas/branding (4)
GET /api/saas/branding
PUT /api/saas/branding [saas-session; role:'owner','admin','super_admin']
POST /api/saas/branding/logo [saas-session; role:'owner','admin','super_admin']
GET /api/saas/branding/logo/:organisationId/:filename [saas-session]

## /api/saas/business (1)
POST /api/saas/business/verify

## /api/saas/command-centre (1)
GET /api/saas/command-centre [saas-session; role:...SENIOR]

## /api/saas/comms (9)
GET /api/saas/comms/channels [saas-session; role:...ADMINS]
PUT /api/saas/comms/channels/:channel [saas-session; role:'owner']
POST /api/saas/comms/messages/:id/send [saas-session; role:...SENIOR]
GET /api/saas/comms/threads [saas-session; role:...SENIOR]
GET /api/saas/comms/threads/:id [saas-session; role:...SENIOR]
PATCH /api/saas/comms/threads/:id [saas-session; role:...SENIOR]
POST /api/saas/comms/threads/:id/customer [saas-session; role:...SENIOR]
POST /api/saas/comms/threads/:id/draft [saas-session; role:...SENIOR]
POST /api/saas/comms/voice-logs [saas-session; role:...SENIOR]

## /api/saas/content (1)
POST /api/saas/content/ai-spec [saas-session; role:'owner','admin','manager','super_admin','director']

## /api/saas/customers (4)
GET /api/saas/customers [saas-session; role:...SENIOR]
POST /api/saas/customers [saas-session; role:...SENIOR]
GET /api/saas/customers/:id [saas-session; role:...SENIOR]
PATCH /api/saas/customers/:id [saas-session; role:...SENIOR]

## /api/saas/dashboard (1)
GET /api/saas/dashboard [saas-session]

## /api/saas/data-export (1)
GET /api/saas/data-export [saas-session; role:'owner']

## /api/saas/entitlements (1)
GET /api/saas/entitlements [saas-session; role:'owner', 'admin', 'manager', 'super_admin', 'director']

## /api/saas/finance (8)
GET /api/saas/finance [saas-session; role:...financeRoles]
POST /api/saas/finance [saas-session; role:...financeRoles]
GET /api/saas/finance/jobs [saas-session; role:...ADMINS]
PUT /api/saas/finance/jobs/:id [saas-session; role:...ADMINS]
GET /api/saas/finance/overheads [saas-session; role:...ADMINS]
POST /api/saas/finance/overheads [saas-session; role:...ADMINS]
DELETE /api/saas/finance/overheads/:id [saas-session; role:...ADMINS]
GET /api/saas/finance/overview [saas-session; role:...ADMINS]

## /api/saas/governance (5)
GET /api/saas/governance/cases [saas-session; role:'owner','admin','super_admin','manager','director','complaints_officer','privacy_officer','security_officer']
POST /api/saas/governance/cases/:id/status [saas-session; role:'owner','admin','super_admin','manager','director','complaints_officer','privacy_officer','security_officer']
POST /api/saas/governance/notifications/:id/read [saas-session; role:'owner','admin','super_admin','manager','director','complaints_officer','privacy_officer','security_officer']
GET /api/saas/governance/overview [saas-session]
POST /api/saas/governance/policies/:id/acknowledge [saas-session]

## /api/saas/growth (9)
GET /api/saas/growth/calendar
PATCH /api/saas/growth/calendar/:id
POST /api/saas/growth/calendar/:id/publish
POST /api/saas/growth/calendar/approve
POST /api/saas/growth/calendar/generate
POST /api/saas/growth/generate
GET /api/saas/growth/overview
PUT /api/saas/growth/profile
POST /api/saas/growth/repurpose

## /api/saas/health (1)
GET /api/saas/health/diagnostics [admin]

## /api/saas/hiring (15)
PUT /api/saas/hiring/ads/:id
POST /api/saas/hiring/ads/:id/:action(approve|shared)
GET /api/saas/hiring/applicants
DELETE /api/saas/hiring/applicants/:id
GET /api/saas/hiring/applicants/:id
PATCH /api/saas/hiring/applicants/:id
POST /api/saas/hiring/applicants/:id/summarise
GET /api/saas/hiring/documents/:id/download
GET /api/saas/hiring/roles
POST /api/saas/hiring/roles
PUT /api/saas/hiring/roles/:id
POST /api/saas/hiring/roles/:id/:action(open|close)
GET /api/saas/hiring/roles/:id/ads
POST /api/saas/hiring/roles/:id/ads/generate
GET /api/saas/hiring/summary

## /api/saas/industry-registry (1)
GET /api/saas/industry-registry [saas-session]

## /api/saas/integrations (7)
GET /api/saas/integrations/oauth/:provider/callback
GET /api/saas/integrations/self-service [saas-session; role:'owner','admin','manager','super_admin','director']
DELETE /api/saas/integrations/self-service/:provider [saas-session; role:'owner','admin','super_admin']
POST /api/saas/integrations/self-service/:provider/authorise [saas-session; role:'owner','admin','super_admin']
POST /api/saas/integrations/self-service/:provider/prepare [saas-session; role:'owner','admin','manager','super_admin','director']
POST /api/saas/integrations/self-service/:provider/resources [saas-session; role:'owner','admin','manager','super_admin','director']
POST /api/saas/integrations/self-service/:provider/test [saas-session; role:'owner','admin','manager','super_admin','director']

## /api/saas/job-media (2)
DELETE /api/saas/job-media/:id [saas-session; role:...SENIOR_JOB_ROLES]
GET /api/saas/job-media/:id/file [saas-session]

## /api/saas/job-offers (1)
POST /api/saas/job-offers/:id/respond [saas-session]

## /api/saas/legal (2)
GET /api/saas/legal [saas-session]
POST /api/saas/legal/accept [saas-session]

## /api/saas/live-activity (1)
GET /api/saas/live-activity [saas-session]

## /api/saas/login (1)
POST /api/saas/login

## /api/saas/logout (1)
POST /api/saas/logout [saas-session]

## /api/saas/me (1)
GET /api/saas/me [saas-session]

## /api/saas/media (4)
GET /api/saas/media [saas-session; role:...studioRoles]
POST /api/saas/media [saas-session; role:...studioRoles]
DELETE /api/saas/media/:id [saas-session; role:'owner','admin','super_admin']
GET /api/saas/media/:id/file [saas-session; role:...studioRoles]

## /api/saas/mfa (4)
GET /api/saas/mfa [saas-session]
POST /api/saas/mfa/disable [saas-session]
POST /api/saas/mfa/setup [saas-session]
POST /api/saas/mfa/verify [saas-session]

## /api/saas/migration (3)
POST /api/saas/migration/commit [saas-session]
POST /api/saas/migration/preview [saas-session]
GET /api/saas/migration/schema [saas-session; role:...ADMINS, 'manager', 'director']

## /api/saas/my-organisations (1)
GET /api/saas/my-organisations [saas-session]

## /api/saas/notifications (2)
GET /api/saas/notifications [saas-session]
POST /api/saas/notifications/read [saas-session]

## /api/saas/onboarding (3)
GET /api/saas/onboarding [saas-session]
PUT /api/saas/onboarding [saas-session; role:'owner','admin','manager','super_admin','director']
POST /api/saas/onboarding/ai-design [saas-session]

## /api/saas/payments (20)
GET /api/saas/payments
POST /api/saas/payments/:id/cancel
POST /api/saas/payments/:id/receipt
GET /api/saas/payments/:id/receipt-data
POST /api/saas/payments/notices/read
GET /api/saas/payments/overview
GET /api/saas/payments/pad
POST /api/saas/payments/pad/:id/receipt
POST /api/saas/payments/pad/request
GET /api/saas/payments/pad/status/:id
GET /api/saas/payments/qr
POST /api/saas/payments/record
POST /api/saas/payments/requests
POST /api/saas/payments/run-cycle
GET /api/saas/payments/saved-cards
DELETE /api/saas/payments/saved-cards/:id
POST /api/saas/payments/saved-cards/:id/charge
GET /api/saas/payments/settings
PUT /api/saas/payments/settings
POST /api/saas/payments/settings/test

## /api/saas/plans (1)
GET /api/saas/plans [saas-session]

## /api/saas/platform-capabilities (1)
GET /api/saas/platform-capabilities [saas-session; role:'owner','admin','manager','super_admin','director']

## /api/saas/platform-invoices (1)
GET /api/saas/platform-invoices [saas-session; role:'owner', 'admin', 'super_admin']

## /api/saas/privacy (3)
GET /api/saas/privacy/requests [saas-session; role:...ADMINS]
POST /api/saas/privacy/requests [saas-session; role:...ADMINS]
POST /api/saas/privacy/requests/:id/erase [saas-session; role:'owner']

## /api/saas/recovery (3)
POST /api/saas/recovery/reset-password
POST /api/saas/recovery/start
POST /api/saas/recovery/verify

## /api/saas/referrals (1)
GET /api/saas/referrals [saas-session; role:'owner','admin','super_admin']

## /api/saas/register (1)
POST /api/saas/register

## /api/saas/registration (3)
POST /api/saas/registration/resend
POST /api/saas/registration/start
POST /api/saas/registration/verify

## /api/saas/regulatory (2)
POST /api/saas/regulatory/check [saas-session]
GET /api/saas/regulatory/sources [saas-session]

## /api/saas/releases (1)
GET /api/saas/releases/latest [saas-session]

## /api/saas/seo (10)
POST /api/saas/seo/ai-check
DELETE /api/saas/seo/ai-check/:id
POST /api/saas/seo/content
DELETE /api/saas/seo/content/:id
POST /api/saas/seo/draft
POST /api/saas/seo/metrics
GET /api/saas/seo/overview
PUT /api/saas/seo/profile
POST /api/saas/seo/run
GET /api/saas/seo/schema

## /api/saas/staff-availability (2)
GET /api/saas/staff-availability [saas-session]
PUT /api/saas/staff-availability/me [saas-session]

## /api/saas/staff-chat (2)
GET /api/saas/staff-chat [saas-session]
POST /api/saas/staff-chat [saas-session]

## /api/saas/stock (7)
GET /api/saas/stock [saas-session; role:...SENIOR]
GET /api/saas/stock/choices [saas-session; role:...SENIOR]
POST /api/saas/stock/items [saas-session; role:...SENIOR]
DELETE /api/saas/stock/items/:id [saas-session; role:...ADMINS]
PATCH /api/saas/stock/items/:id [saas-session; role:...SENIOR]
POST /api/saas/stock/items/:id/move [saas-session]
GET /api/saas/stock/items/:id/moves [saas-session; role:...SENIOR]

## /api/saas/subscription (1)
GET /api/saas/subscription [saas-session]

## /api/saas/team-accounts (6)
GET /api/saas/team-accounts
POST /api/saas/team-accounts/accept
POST /api/saas/team-accounts/invitations
DELETE /api/saas/team-accounts/invitations/:id
DELETE /api/saas/team-accounts/members/:id
POST /api/saas/team-accounts/verify-email

## /api/saas/verification-provider (1)
GET /api/saas/verification-provider/status

## /api/saas/video-renders (2)
GET /api/saas/video-renders [saas-session; role:'owner','admin','manager','super_admin','director']
POST /api/saas/video-renders [saas-session; role:'owner','admin','manager','super_admin','director']

## /api/saas/voice (3)
POST /api/saas/voice/speech [saas-session]
POST /api/saas/voice/speech-stream [saas-session]
POST /api/saas/voice/transcribe [saas-session]

## /api/saas/work-orders (8)
GET /api/saas/work-orders [saas-session]
POST /api/saas/work-orders [saas-session; role:'owner', 'admin', 'manager', 'super_admin']
PUT /api/saas/work-orders/:id/customer [saas-session; role:...SENIOR]
GET /api/saas/work-orders/:id/media [saas-session]
POST /api/saas/work-orders/:id/media [saas-session]
POST /api/saas/work-orders/:id/media-reason [saas-session]
POST /api/saas/work-orders/:id/offer [saas-session; role:'owner', 'admin', 'manager', 'super_admin']
GET /api/saas/work-orders/skill-suggestions [saas-session]

## /api/saas/workers (11)
GET /api/saas/workers [saas-session]
POST /api/saas/workers [saas-session; role:...workforceSeniorRoles]
GET /api/saas/workers/:id/compliance [saas-session]
PATCH /api/saas/workers/:id/compliance/:requirementId [saas-session; role:...workforceSeniorRoles]
GET /api/saas/workers/:id/documents [saas-session]
PATCH /api/saas/workers/:id/documents/:documentId [saas-session; role:...workforceSeniorRoles]
POST /api/saas/workers/:id/documents/:documentId/upload [saas-session; role:...workforceSeniorRoles]
POST /api/saas/workers/:id/invite [saas-session; role:...workforceSeniorRoles]
GET /api/saas/workers/:id/skills [saas-session]
POST /api/saas/workers/:id/skills [saas-session; role:...workforceSeniorRoles]
PUT /api/saas/workers/:id/vevo [saas-session; role:...SENIOR]

## /api/social-stats (1)
GET /api/social-stats

## /api/support/cases (3)
POST /api/support/cases
GET /api/support/cases/:reference
POST /api/support/cases/:reference/attachments

## /api/tiktok/callback (1)
GET /api/tiktok/callback

## /api/tiktok/login (1)
GET /api/tiktok/login

## /api/tiktok/status (1)
GET /api/tiktok/status

## /api/webhooks/inbound-email (1)
POST /api/webhooks/inbound-email

## /api/webhooks/meta-messaging (2)
GET /api/webhooks/meta-messaging
POST /api/webhooks/meta-messaging

## /api/webhooks/payments (4)
POST /api/webhooks/payments/paypal/:orgId
POST /api/webhooks/payments/platform-square
POST /api/webhooks/payments/platform-stripe
POST /api/webhooks/payments/stripe/:orgId

## /api/webhooks/social (1)
POST /api/webhooks/social/:channel

## /api/webhooks/telnyx (1)
POST /api/webhooks/telnyx

## /api/webhooks/whatsapp (2)
GET /api/webhooks/whatsapp
POST /api/webhooks/whatsapp

## /api/workforce/onboarding (5)
GET /api/workforce/onboarding/:token
POST /api/workforce/onboarding/:token/documents/:documentId
PUT /api/workforce/onboarding/:token/profile
POST /api/workforce/onboarding/:token/skills
POST /api/workforce/onboarding/:token/submit

## /healthz (1)
GET /healthz

## /indexnow-key.txt (1)
GET /indexnow-key.txt

## /llms.txt (1)
GET /llms.txt

## /pay/:id (1)
GET /pay/:token

## /robots.txt (1)
GET /robots.txt

## /saas (1)
GET /saas

## /saas/ (1)
GET /saas/

## /saas/answers.html (1)
GET /saas/answers.html

## /saas/index.html (1)
GET /saas/index.html

## /sitemap.xml (1)
GET /sitemap.xml
