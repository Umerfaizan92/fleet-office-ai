# Interaction map

How the screens in [ROUTE-INVENTORY.md](./ROUTE-INVENTORY.md) talk to the server. Contracts stay as they are. Paths below are the ones the browser calls. The full server catalogue is [API-ROUTES.md](./API-ROUTES.md).

Auth abbreviations:

- **public** — no session.
- **session** — `requireSaasUser` cookie.
- **senior** — session and owner, admin, manager, super_admin, or director.
- **finance** — session and owner, admin, or super_admin.
- **owner** — session and owner.
- **admin** — operator. `office.js` sends the key stored in `sessionStorage['fp-admin-key']` (the token from `POST /api/operator/login`).

Module installers apply the gate even when [API-ROUTES.md](./API-ROUTES.md) leaves the auth column blank: growth and SEO use senior, growth approve/publish uses owner/admin/super_admin, hiring uses owner and admin, payment settings use finance, the pay pad also allows manager, director, and employee.

## Public and auth

| Screen | Action | Call |
|---|---|---|
| Marketing guide | Ask | `POST /api/product-guide/answer` |
| Marketing guide | Status, speech, stream, transcribe | `GET /api/product-guide/status`, `POST /api/product-guide/speech`, `speech-stream`, `transcribe` (multipart audio) |
| Newsletter | Subscribe / unsubscribe | `POST /api/newsletter/subscribe`, `POST /api/newsletter/unsubscribe` |
| Create account | Address suggest | `GET /api/saas/address/search` |
| Create account | ABN / business check | `POST /api/saas/business/verify`, `POST /api/saas/abn/verify` |
| Create account | Start | `POST /api/saas/registration/start` |
| Verify | Confirm / resend | `POST /api/saas/registration/verify`, `POST /api/saas/registration/resend` |
| Sign in | Member | `POST /api/saas/login` → `workspace.html` |
| Sign in | Operator | `POST /api/operator/login` → stores token → `/office/` |
| Recover | Start, verify, reset | `POST /api/saas/recovery/start`, `/verify`, `/reset-password` |
| Join team | Code, accept | `POST /api/saas/team-accounts/verify-email`, `POST /api/saas/team-accounts/accept` |
| Support widget | Case + files | `POST /api/support/cases`, `POST /api/support/cases/:reference/attachments` |
| Apply | Load role, send application | `GET /api/public/hiring/:token`, `POST /api/public/hiring/:token/apply` (multipart, up to 5 files) |
| Worker onboarding | Load, save, upload, skill, submit | `GET/PUT/POST /api/workforce/onboarding/:token…` |
| Pay page | Load, start, PayPal return | `GET /api/pay/:token`, `POST /api/pay/:token/start`, `GET /api/pay/:token/paypal-return` |
| Thanks page | none | Static |

`POST /api/saas/register` is unused by the current forms (410).

Webhooks (`/api/webhooks/*`), OAuth callbacks (`/api/tiktok/*`, `/api/saas/integrations/oauth/:provider/callback`), and `/api/ai-tools/*` are server-to-provider. No page posts to them except the browser redirect for OAuth.

## Workspace shell

| Control | Call | Who |
|---|---|---|
| Boot | `GET /api/saas/me`, `/subscription`, `/mfa`, `/my-organisations`, `/account/lifecycle` | session |
| Sign out | `POST /api/saas/logout` | session |
| Switch business | organisations list, then `X-Organisation-Id` on later calls | session |
| Trial card, Plans hash | `GET /api/saas/subscription`, `/plans`, `/entitlements`, `/platform-invoices`, `/addons` | finance for mutations |
| MFA dialog | `POST /api/saas/mfa/setup`, `/verify`, `/disable` | session |
| Notifications | `GET /api/saas/announcements`, `POST /api/saas/announcements/:id/read`, `GET /api/saas/notifications`, `POST /api/saas/notifications/read`, `GET /api/saas/releases/latest` | session |
| Legal gate | `GET /api/saas/legal`, `POST /api/saas/legal/accept` | session |
| Staff chat | `GET/POST /api/saas/staff-chat`, `GET /api/saas/staff-availability`, `PUT /api/saas/staff-availability/me` | session |
| Live strip | `GET /api/saas/live-activity` | session |
| Search / voice | `POST /api/saas/voice/transcribe`, `/speech`, `/speech-stream` | session |
| Theme toggle | local only | — |
| Tour, manual, flow prev/next | in-page only | — |

## Workspace views

| View | Calls | Who | Uploads |
|---|---|---|---|
| Home | `GET /api/saas/dashboard`, `GET /api/saas/command-centre`, `GET /api/saas/approvals?status=pending` | dashboard metrics hide counts for non-senior | — |
| Assistant | `GET/POST /api/saas/ai/threads`, `GET /api/saas/ai/status`, `POST /api/saas/ai/intents` | senior | — |
| Approvals | `GET/POST /api/saas/approvals`, `GET …/:id/events`, `PATCH …/:id`, `POST …/:id/decision`, `PUT /api/saas/approvals/policy` | decide and policy: senior | — |
| Customers | `GET/POST /api/saas/customers`, `GET/PATCH /api/saas/customers/:id` | senior | — |
| Stock | `GET /api/saas/stock`, `/choices`, `POST/PATCH/DELETE /api/saas/stock/items`, `POST …/move`, `GET …/moves` | senior; delete is owner/admin/super_admin | — |
| Inbox | `GET /api/saas/comms/threads`, `GET/PATCH …/:id`, `POST …/draft`, `POST …/customer`, `POST /api/saas/comms/messages/:id/send`, `GET/PUT /api/saas/comms/channels` | senior; channel put is owner | — |
| Jobs | `GET/POST /api/saas/work-orders`, `GET …/skill-suggestions`, `POST …/:id/offer`, `PUT …/:id/customer`, `GET/POST …/:id/media`, `POST …/:id/media-reason`, `POST /api/saas/job-offers/:id/respond`, `GET/DELETE /api/saas/job-media/:id` | create/offer: owner, admin, manager, super_admin | job media multipart |
| Workers | `GET/POST /api/saas/workers`, compliance GET/PATCH, documents GET/PATCH, `POST …/documents/:id/upload`, skills GET/POST, `POST …/invite`, `PUT …/vevo` | writes: senior | evidence multipart |
| Staff | `GET /api/saas/team-accounts`, `POST/DELETE …/invitations`, `DELETE …/members/:id` | owner | — |
| Hiring | `GET/POST/PUT /api/saas/hiring/roles`, open/close, ads generate/approve/shared, applicants list/get/patch/delete/summarise, `GET …/documents/:id/download` | owner, admin | applicant files arrive from the public apply page |
| Studio | `GET/POST/DELETE /api/saas/media`, `GET …/:id/file`, `POST /api/saas/content/ai-spec`, `GET/POST /api/saas/video-renders` | senior; media delete is owner/admin/super_admin | media multipart |
| Growth | `GET/PUT /api/saas/growth/profile`, generate, calendar GET/PATCH/generate/approve/publish, repurpose; `GET/PUT /api/saas/activity` | senior; approve is owner/admin/super_admin | — |
| Search | `GET /api/saas/seo/overview`, `/schema`, `PUT /profile`, `POST /run`, `/draft`, `/content`, `/ai-check`, `/metrics`, deletes | senior | — |
| Connections | `GET /api/saas/integrations/self-service`, prepare, resources, test, authorise, `DELETE` | senior read/test; authorise and delete: owner/admin/super_admin. OAuth returns to the callback URL | no customer secrets typed into the page (`customer_secret_entry: false`) |
| Profit | `GET/POST /api/saas/finance`, jobs GET/PUT, overheads GET/POST/DELETE, overview; payments overview, settings GET/PUT, test, record, requests, run-cycle, cancel, receipt, notices | finance | — |
| Pay pad | `GET /api/saas/payments/pad`, `POST …/pad/request`, `GET …/pad/status/:id`, `POST …/pad/:id/receipt`, `GET /api/saas/payments/qr`, saved cards GET/DELETE/`POST …/charge` | pad roles include employee; card charge is finance-scoped on the server | card number is collected by Stripe, not this app |
| Plans | `GET /api/saas/billing/setup`, `POST /api/saas/billing/authorise`, `POST /api/saas/billing/withdraw`, `GET /api/saas/billing/providers`, add-on POST and cancel | finance | — |
| Settings | `GET/PUT /api/saas/onboarding`, `POST /api/saas/onboarding/ai-design`, `GET /api/saas/industry-registry`, `GET/POST /api/saas/regulatory/sources` and `/check`, `GET/PUT /api/saas/branding`, `POST /api/saas/branding/logo` | onboarding write and branding: senior / owner, admin, super_admin | logo multipart |
| Import | `GET /api/saas/migration/schema`, `POST /api/saas/migration/preview`, `POST /api/saas/migration/commit` | senior | CSV/JSON file |
| Export | `GET /api/saas/data-export`, `GET /api/saas/finance` | owner | download only |
| Trust | `GET /api/saas/governance/overview`, cases GET and status POST, policy acknowledge, notification read; privacy requests GET/POST and erase; account deletion start/confirm/cancel | cases: owner, admin, super_admin, manager, director, complaints_officer, privacy_officer, security_officer. Erase and deletion cancel: owner | — |
| Help | support case APIs, manual is in-page | session | support attachments |
| Manual | reads nav metadata; optional integrations status | session | — |

Home jumps (`data-jump`) and the manual’s buttons call `showView`. They do not fetch by themselves.

## Operator console

Every `/api/admin/*` call is **admin**. The page does not send a tenant session for these.

| View | Calls | Uploads / side effects |
|---|---|---|
| Overview | `GET /api/admin/dashboard`, attention and records where the extras script asks | — |
| Inbox | `GET/POST /api/admin/conversations`, `GET …/:id`, `POST …/:id/draft-reply`, `POST …/import` | import form is JSON, not a file |
| Approvals | `GET /api/admin/approvals`, `PATCH …/:id`, `POST …/:id/decision` | sending still requires the decision |
| Enquiries | `GET /api/admin/enquiries`, `GET/PATCH …/:id`, activities GET/POST, photo GET | photo is download |
| Customers | `GET /api/admin/customers`, `PATCH …/:id`, `GET …/:id/history` | — |
| Quotes | `GET/POST /api/admin/quotes`, `GET/PATCH/PUT …/:id`, date proposals GET/POST, `POST …/request-approval`, `POST …/verify-acceptance`, `POST /api/admin/date-proposals/:id/confirm-booking` | — |
| Bookings | `GET/POST /api/admin/bookings`, `PATCH …/:id` | — |
| Jobs | `GET /api/admin/jobs/:id`, complete-work, consents, media, request-review, review-received, media file GET | job media multipart. Marketing use still needs the consent record |
| Expenses | `GET/POST /api/admin/expenses`, `GET /api/admin/profit-summary` | — |
| Performance | `GET /api/admin/performance-centre` | display only |
| Content | `GET/POST /api/admin/content-projects`, `POST …/:id/prepare-posts`, `GET /api/admin/content-templates` | — |
| Campaigns | `GET/POST /api/admin/campaigns`, `GET /api/admin/marketing-performance` | drafts wait for approval |
| Connections | `GET /api/admin/channel-connections`, `GET /api/admin/integration-readiness`, `GET /api/admin/channel-metrics`, PUT performance and reply-policy | credentials stay in server env |
| Records | `GET /api/admin/records-summary`, `GET/POST /api/admin/history` | history import is JSON |
| AI quality | `POST /api/admin/ai-quality/check`, `GET /api/admin/ai-quality/runs` | — |
| Subscribers | `GET /api/admin/subscribers`, profile, plan POST, payment POST, follow-ups GET/POST, `PATCH/POST /api/admin/followups/:id` (discard, send), invoices prepare/approve/adjust/mark-sent/payments | follow-up send and invoice actions are real side effects. Do not exercise them against production |
| Get paid | `GET/PUT /api/admin/platform-pay/:provider`, `POST …/test`, `PUT /api/admin/platform-pay-order`, `POST /api/admin/pay-links/:id` | provider test must stay on the local server |
| Staff chat | `GET/POST /api/admin/staff-chat` | operator room, not the tenant room |
| Receptionist | `GET/PUT /api/admin/receptionist-settings` | — |
| Website | `GET /api/admin/website-status`, `GET /api/admin/newsletter-subscribers` | — |
| SEO | `GET /api/admin/search-visibility`, `POST …/indexnow`, `POST …/snapshot`, `GET /api/admin/visibility`, `POST /api/admin/visibility/run`, competitor POST/DELETE, `GET/POST /api/admin/seo-cluster/overview` and `run-all` | IndexNow notifies external search engines. Do not press it against production during redesign testing |
| Help | support widget plus in-page copy | — |
| Copilot | browser product guide (`GDSProductGuide`), no tenant thread | — |

Also admin-only and used from these screens or their detail panes: `POST /api/admin/invoices/:id/:action`, reminders, services list, voice enquiries, add-ons `GET/POST /api/admin/addons`, platform announcements, `POST /api/admin/comms-channels/:organisationId/:channel/activate`.

## Navigation destinations

| From | To |
|---|---|
| `/` | `/saas/` |
| Marketing CTAs | `create-account.html`, `sign-in.html`, `answers.html`, in-page panes |
| Create account success | `verify-account.html` |
| Verify success | `sign-in.html` |
| Member sign-in | `/saas/workspace.html` (hash `today/home` or legacy `#dashboard`) |
| Operator sign-in | `/office/` |
| Office lock | `/saas/sign-in.html#operator` |
| Office “← Super Pro workspace” | `/saas/workspace.html#dashboard` |
| Workspace sign-out | `/saas/` |
| Workspace trial card and manual buttons | hash views via `data-view` / `data-jump` |
| Hiring “share” | public `/saas/apply.html?…` for applicants |
| Payment request | `/pay/:token` or `/saas/pay.html` for the customer |
| Worker invite | `/saas/worker-onboarding.html?…` |
| Staff invite | `/saas/join-team.html?…` |
| SEO office link | `/saas/answers.html` (new tab) |

Hash changes inside the workspace use `history.pushState` to `#<domain>/<section>`. Office view changes do not change the URL.
