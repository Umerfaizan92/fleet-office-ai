# Route and feature inventory

Source commit: `468e366ff4d80f58241b1e5ce7da7a9d924e3fe2`.

Server entry is `src/server.js`. Static files: `express.static` on `/saas` and `/office` with the `html` extension. `GET /`, `GET /saas`, `GET /saas/`, and `GET /saas/index.html` serve the marketing page through the SEO HTML helper. `GET /saas/answers.html` does the same. Everything else under those folders is a file URL.

Client views are not server routes. Workspace views are hashes on `workspace.html`. Office views are `data-view` sections on `office/index.html`.

Full HTTP route list: [API-ROUTES.md](./API-ROUTES.md) (372 method+path rows).

## 1. Machine and public HTTP routes

| URL | Page | Notes |
|---|---|---|
| `/` | redirect 302 | To `/saas/` |
| `/healthz` | JSON | `{ ok: true }`. Render health check |
| `/api/health` | JSON | Legacy service name in the body |
| `/api/health/storage` | JSON | Persistent-disk probe |
| `/robots.txt` | text | |
| `/sitemap.xml` | XML | |
| `/llms.txt` | text | |
| `/indexnow-key.txt` | text | 404 when `INDEXNOW_KEY` is unset |
| `/saas/` | `saas/index.html` | Marketing. Indexed |
| `/saas/answers.html` | `saas/answers.html` | Answer Center. Indexed |
| `/saas/sign-in.html` | sign-in | `noindex`. `#operator` or `?as=operator` opens the operator tab |
| `/saas/create-account.html` | registration | `?plan=` preselects starter, operations, or scale |
| `/saas/verify-account.html` | OTP | Email + SMS codes |
| `/saas/recover-account.html` | recovery | Password or email recovery |
| `/saas/join-team.html` | invitation accept | Token in the query string, handled by `join-team.js` |
| `/saas/workspace.html` | business workspace | `noindex`. Hash selects the view |
| `/saas/worker-onboarding.html` | worker token page | No workspace access. Badge text `LIMITED ACCESS` is asserted by the release check |
| `/saas/apply.html` | public job application | Token in the query string |
| `/saas/pay.html` | customer invoice pay | Also `GET /pay/:token` on the server |
| `/saas/payment-thanks.html` | payment result | Static copy only |
| `/saas/privacy.html` | Privacy Notice | |
| `/saas/terms.html` | Terms | |
| `/saas/trust-center.html` | Trust Center | |
| `/saas/complaints.html` | Complaints procedure | |
| `/saas/policy-center.html` | Policy index | Links into the legal set |
| `/saas/subprocessors.html` | Connected services | |
| `/office/` | `office/index.html` | Operator console. `noindex`. Not a tenant page |

Legal pages share a back link to `/saas/` and a footer set of Trust, Complaints, Privacy, Terms, Policy Center, Connected Services. They have no forms except where noted below. Support widget script `support.js` is on the public and legal pages (`data-support-placement` where set).

## 2. Marketing page (`/saas/`)

Header nav (`data-pane` where the stage script swaps panes):

| Control | Target |
|---|---|
| Overview | `#overview` / pane `overview` |
| Benefits | `#why` |
| Capabilities | `#capabilities` |
| Industries | `#industries` |
| Plans | `#plans` |
| Security | `#security` |
| Install & more | `#more` |
| Answers | `answers.html` |
| Sign in | `sign-in.html` |
| Become a member | `create-account.html` |
| Open menu | `.mobile-nav` |

Hero and guide:

| Id | Control |
|---|---|
| `#talk-to-ai` | Opens the product guide |
| `#experience` | Guide card |
| `#chat-log` | Transcript, `aria-live="polite"` |
| `#quick-prompts` | Three starter questions |
| `#chat-form` | Typed question. Submit sends |
| `#chat-input` | Question field |
| `#voice-input` | Microphone |
| `#voice-output` | Spoken replies on/off |
| `#clear-chat` | Clears the conversation |
| `#voice-status` | Voice state |
| `#voice-capability` | Voice readiness |
| `#satisfied-yes` / `#satisfied-more` | Satisfaction step, section `#satisfaction` |
| `#conversion-panel` | Join, sign in, `#keep-talking` |
| `#final-ask` | Returns to the guide |

Sections after the hero: `#why` (six benefit cards, one “ask AI” button, trial CTA), `#capabilities` (six feature cards, each with a `data-question` button), `#industries` (five `data-question` buttons), `#plans` (Starter A$49, Operations A$99, Scale A$149, links to `create-account.html?plan=`), `#security`, journey track, `#install` (`data-install-help` desktop / mobile / security, `#install-superpro`, `#install-readiness`, `#install-detail`, `#install-status`), `#referrals`, `#answers` link, final CTA, `#product-newsletter`.

Newsletter form `#product-newsletter-form`: `full_name`, `organisation_name`, `email`, `consent`. Buttons: submit, `#product-newsletter-unsubscribe`. Message `#product-newsletter-message`.

APIs: `POST /api/product-guide/answer`, speech and transcribe routes, `GET /api/product-guide/status`, `POST /api/newsletter/subscribe`, `POST /api/newsletter/unsubscribe`. Voice can fall back to the browser. See the interaction map.

PWA: `manifest.webmanifest`, `install.js`, `sw.js`.

## 3. Authentication

### Create account — `#register-form`

Fields: `plan_id` (starter, operations, scale), `business_name`, `identifier_type`, `business_identifier`, `state`, `postcode`, `business-address-search`, `address_unit`, `address_street_number`, `address_street_name`, `address_suburb`, `address_formatted`, `address_source`, `referral_code`, `full_name`, `email`, `phone`, `password`, `confirm_password`, `accept_terms`.

Submit `#registration-submit` (starts disabled until the script enables it). Address suggestions call `GET /api/saas/address/search`. Business check calls `POST /api/saas/business/verify` and `POST /api/saas/abn/verify`. Create calls `POST /api/saas/registration/start`, then `verify-account.html`.

`POST /api/saas/register` is a **410**. The UI must keep using the start/verify flow.

### Verify — `#verification-form`

`email_code`, `sms_code`. Resend buttons `data-resend="email"` and `data-resend="sms"`. Status grid `#delivery-status-grid`. Calls `POST /api/saas/registration/verify` and `POST /api/saas/registration/resend`.

### Sign in — two tabs

Tabs: `data-signin-mode="member"` and `data-signin-mode="operator"`.

Member `#login-form`: `email`, `password`, `remember_email`, `mfa_code` inside `#mfa-details`. Pending verification card `#pending-verification`. Message `#auth-message`. Calls `POST /api/saas/login`. Success goes to `workspace.html`.

Operator `#operator-form`: `key` (password), `code`. Label `#operator-code-label` shows when the server returns `code_required`. Message `#operator-message`. Calls `POST /api/operator/login`. On success, `sessionStorage['fp-admin-key'] = d.token` and `location = /office/`.

### Recover

`#recovery-start-form`: `recovery_type` (password | email), `login_identifier`, `channel`, `phone`, `business_identifier_type`, `business_identifier`. Submit `#recovery-start-submit`.

`#recovery-code-form`: `code`.

`#recovery-password-form`: `password`, `confirm_password` (14+ characters).

`#recovered-email-card` / `#recovered-email` when recovering the sign-in email.

Calls `POST /api/saas/recovery/start`, `/verify`, `/reset-password`.

### Join team — `#join-team-form`

`email`, `password`, `email_code`, `mfa_code`, `consent`. `#send-code` asks for a verification code. Status `#join-status`. Calls `POST /api/saas/team-accounts/verify-email` and `POST /api/saas/team-accounts/accept`.

### Hidden workspace auth shell

`workspace.html` `#welcome` contains a second `#register-form` (plan radios, `business_name`, `full_name`, `email`, `password`, `confirm_password`, `accept_terms`) and `#login-form` (`email`, `password`, `mfa_code`). `#register-form` submit only navigates to `create-account.html`. `app.js` requires these nodes. Keep the ids.

## 4. Tokenised public flows

### Worker onboarding — `/saas/worker-onboarding.html?token`

| Region | Fields / controls |
|---|---|
| `#profile-form` | `full_name`, `email`, `phone`, `declared_work_status`, `visa_subclass`, `visa_expiry`, `work_restrictions`, `accept_terms`, `accept_privacy`, `declaration` |
| `#requirements-card` | `#requirements` rendered list |
| `#documents-card` | `#documents` plus per-document upload built by script |
| `#skill-form` | `skill_name`, `competency`, `evidence_type`, `evidence_reference`, `expiry_date` |
| `#submit-card` | `#submit-onboarding` |

Calls, all under `/api/workforce/onboarding/:token`: GET page, PUT profile, POST document, POST skill, POST submit.

### Job application — `/saas/apply.html`

`#ap-form`: `full_name`, `email`, `phone`, `suburb`, `availability`, `message`, file slots via `#ap-add` / `#ap-files`, honeypot `website`, `consent` (`#ap-consent`). Submit `#ap-send`. Message `#ap-msg`. Job summary `#ap-job`. Calls `GET /api/public/hiring/:token` and `POST /api/public/hiring/:token/apply` (multipart).

### Pay — `/saas/pay.html` and `/pay/:token`

`#pay-card` is filled by `pay.js`. No card fields in this page. Calls `GET /api/pay/:token`, `POST /api/pay/:token/start`, and the PayPal return `GET /api/pay/:token/paypal-return`. Provider buttons are created by the script from the server payload. `#payment-thanks.html` is static.

## 5. Business workspace

URL: `/saas/workspace.html#<domain>/<section>`.

Navigation source: `saas/workspace-nav.js` (`window.SuperProNav`). `showView` in `saas/app.js` shows the matching `<section class="view" id="<view>-view">`.

### Shell controls (every view)

| Id / attribute | Action |
|---|---|
| `#open-sidebar` / `#close-sidebar` / `#sidebar-scrim` | Mobile nav |
| `.workspace-nav` | Rendered domain menus. Buttons are `.nav-item[data-view]` |
| `#business-switcher` | `GET /api/saas/my-organisations`, then switch via `workspace-context.js` (`superpro_active_organisation`, header `X-Organisation-Id`) |
| `#org-name-side` `#org-role-side` `#org-avatar-side` | From `GET /api/saas/me` |
| `#sidebar-trial-days` and `[data-view=billing]` trial card | Opens Plans |
| `#setup-mfa` | Opens `#mfa-dialog` |
| `.search-button` | Workspace search / command |
| `#replay-tour` | Guided tour |
| `#open-digital-manual` | Manual view |
| Notifications button | `platform-notices.js` |
| `.theme-toggle` | `data-theme` light/dark |
| `#logout` | `POST /api/saas/logout`, then `/saas/` |
| `#page-eyebrow` `#page-title` | Set from nav metadata |
| `#notice` | Toast |
| `#flow-prev` `#flow-next` | Previous / next visible view |
| `#smart-tooltip` | Tip bubble |

Overlays that are not views:

| Piece | File | What it does |
|---|---|---|
| Staff chat drawer | `workspace-chat.js` | `GET/POST /api/saas/staff-chat`, availability `GET/PUT /api/saas/staff-availability` |
| Get-paid pad | `workspace-pad.js` | Pad, QR, saved-card charge. See Money |
| Gadgets / command tiles | `workspace-gadgets.js` | `GET /api/saas/command-centre` |
| Legal acceptance gate | `workspace-legal.js` | `GET /api/saas/legal`, `POST /api/saas/legal/accept` |
| Voice bar | `workspace-voicebar.js` + `workspace-ai-runtime.js` | `POST /api/saas/voice/speech`, `speech-stream`, `transcribe` |
| Support drawer | `support.js` | `POST /api/support/cases` and attachments |
| Platform notices | `platform-notices.js` | Announcements and notifications |
| Receipt preview | `workspace-receipt.js` | `GET /api/saas/payments/:id/receipt-data` |

### Views

Roles below are the nav gates. The API may be stricter. Finance = owner, admin, super_admin. Senior = finance + manager + director.

| View | Hash | Role gate | Section id | Primary controls |
|---|---|---|---|---|
| Home & AI Command | `#today/home` | all | `#dashboard-view` | KPIs `#m-workers` `#m-ready` `#m-attention` `#m-jobs` `#m-expiring`, `#briefing`, `#first-name`, jumps `data-jump="jobs"` and `data-jump="assistant"` |
| AI Assistant | `#today/assistant` | senior | `#assistant-view` | `#assistant-form`: `title`, `task_type`, `message`. Threads and voice through AI runtime |
| Approvals | `#today/approvals` | all (decide is senior) | `#approvals-view` | `#new-approval-request`. Queue, history, and policy rendered by `approvals.js`. `data-approval-decision` |
| Customers | `#customers/list` | senior | `#customers-view` | `#cust-new`, dialog `#cust-dialog` / `#cust-form` (`name`, `email`, `phone`, `address`, `status`, `notes`, `#cust-save`) |
| Stock | `#customers/stock` | senior | `#stock-view` | `#stock-new`, `#stock-item-dialog` / `#stock-item-form` (`name`, `sku`, `unit`, `cost`, `reorder_level`, `reorder_qty`, `supplier`), `#stock-move-dialog` / `#stock-move-form` (`kind`, `qty`, `unit_cost`, `work_order_id`, `note`) |
| Inbox | `#customers/inbox` | senior | `#comms-view` | Thread list, `#comms-draft-form` / `#comms-draft-instruction` / `#comms-draft-button`, `#comms-save-customer`, `#comms-close-thread` |
| Jobs | `#customers/jobs` | all; create is senior | `#jobs-view` | `#job-form`: `customer_id` `#job-customer`, `title`, `address`, `start_at`, `estimated_hours`, `required_workers`, `required_level`, `required_skills`. Offers and media dialog `#jobmedia-dialog` (`#jm-close`, `#jm-body`) |
| Workers | `#people/workers` | all; writes are senior | `#workforce-view` | `#worker-form`: `full_name`, `email`, `phone`, `role_title`, `employment_type`, `worker_level`, `work_status`. Compliance, skills, documents, invite rendered in the worker panel. `data-worker-compliance`, `data-worker-skill`, `data-add-job-skill` |
| Staff accounts | `#people/staff` | owner | `#team-view` | `#team-open-invite`, dialog `#team-invite-dialog`, `#team-invite-form` (`worker_id`, `email`, `role`), `#team-close-invite`, `#team-members`, `#team-invitations`, `#team-status` |
| Hiring | `#people/hiring` | owner, admin | `#hiring-view` | `#hire-new-role` and panels from `workspace-hiring.js` (roles, ads, applicants, document download) |
| Content studio | `#marketing/studio` | senior | `#video-view` | `#video-form` (platform `#content-platform`, goal, quality, aspect, `media_id`, in/out, transition, pacing, hook, caption style, `style_prompt`, captions, music, logo, reframe, highlights, cta). `#generate-ai-spec`, `#organize-library`, `#add-demo-assets`, `#refresh-trends` |
| Growth | `#marketing/growth` | senior | `#growth-view` | Profile, plan, calendar, approve, publish. Activity access for the owner |
| Search | `#marketing/search` | senior | `#visibility-view` | SEO profile, run, draft, content, AI check, metrics, schema |
| Connections | `#marketing/connections` | senior | `#integrations-view` | `#integration-self-service` exactly once. Test, save selection, disconnect |
| Profit | `#money/ledger` | finance | `#finance-view` | `#fin-overhead-form` (`name`, `amount`, `period`), `#finance-form` (`entry_type`, `category`, `amount`, `tax`, `occurred_on`, `work_order_id` `#finance-work-order`, `description`, `source`), `#fin-csv`. Payments UI from `workspace-payments.js` and the pad |
| Plans | `#money/billing` | finance | `#billing-view` | Trial, entitlements, add-ons, platform invoices, billing authorise / withdraw |
| Brand & settings | `#setup/settings` | senior for save | `#onboarding-view` | `#onboarding-form` settings nav: Business profile, Contact, Address, Workspace design, Appearance, Services & area, Approvals, AI preferences. Fields listed below. `#choose-custom-industry`, `#check-regulatory-sources`, `#ai-design-business`, `#upload-workspace-logo`, `#save-workspace-branding` |
| Import | `#setup/import` | senior | `#migration-view` | File picker, `#migration-preview`, `#migration-commit` |
| Print & export | `#setup/print` | owner | `#exports-view` | `#export-backup` |
| Trust | `#setup/trust` | all; some cases are officers | `#governance-view` | Policies, cases, privacy, account deletion |
| Help | `#setup/help` | all | `#support-view` | `#open-help-desk`, `#support-open-case` |
| Manual | `#setup/manual` | all | `#manual-view` | Map, `#manual-help-desk` |

Onboarding form fields: `industry-search`, `industry_code`, `business_type`, `business_structure`, `team_mode`, `ai_setup_mode`, `phone`, `website`, `service_area`, `workspace-address-search`, address parts (`address_formatted`, `address_unit`, `address_street_number`, `address_street_name`, `address_suburb`, `address_state`, `address_postcode`, `address_source`), `business-description`, `custom_sections`, `branding-display-name`, `branding-logo-file`, `branding-logo-url`, `branding-primary-color`, `branding-secondary-color`, `branding-theme`, `services`, `brand_voice`, `approval_mode`, `ai_instructions`, `complete`.

Account deletion controls are rendered into Trust from `app.js`: start, confirm (code + confirm text), cancel. Ids include `start-account-deletion` in script, not as a static tag.

MFA dialog `#mfa-dialog` / `#mfa-body`. Status copy `#mfa-status-side`.

Legacy hashes that must still open a view: `operations/command`, `operations/receptionist`, `operations/inbox`, `operations/dispatch`, `customers`, `stock`, `workforce/compliance`, `workforce/staff`, `hiring`, `workforce/growth`, `seo`, `visibility`, `workforce/connections`, `finance`, `finance/ledger`, `finance/billing`, `governance/settings`, `governance/migration`, `governance/exports`, `governance/trust`, `governance/approvals`, `governance/help`, `governance/manual`, plus the bare domain ids (`today`, `customers`, `people`, `marketing`, `money`, `setup`).

## 6. Operator console

URL: `/office/`. View switch: `show(name)` in `office/office.js`. Buttons: `.nav[data-view]`. Active section: `#<view>-view`.

Entry: if `sessionStorage['fp-admin-key']` is missing, redirect to `/saas/sign-in.html#operator`. Hidden fallback form `#login-form` with `#admin-key`, `#toggle-admin-key`, `#login-error` remains bound.

Shell: `#logout` (Lock), `#refresh`, `#office-copilot-top`, `#office-chat-top`, `#office-help-top`, `#page-title`. Copilot panel is injected as `#office-copilot` by `office-extras.js` (launch, mic, textarea, close). It calls the in-browser product guide, not a tenant AI thread.

| View | Label | Main controls |
|---|---|---|
| `dashboard` | Overview | `#stats`, `#recent-table` |
| `inbox` | Unified Inbox | `#import-form` (`channel`, `full_name`, `phone`, `email`, `subject`, `transcript`), conversation detail, draft form |
| `approvals` | Approvals | `#approval-status-filter`, `#approvals-list` |
| `enquiries` | Enquiries | `#enquiry-search`, `#status-filter`, `#enquiries-table`, `#detail` (status update form built in script) |
| `customers` | Customers | `#customer-search`, `#customers-table`, `#customer-history-detail` |
| `quotes` | Quotes | `#quote-form` (`customer_id`, `valid_until`, `quantity`, `description`, `unit_price`, `notes`), quote editor and date proposals built in script |
| `bookings` | Bookings | `#booking-form` (`customer_id`, `title`, `start_at`, `end_at`, `address`, `notes`), `#bookings-table` |
| `jobs` | Job Completion | `#jobs-table`, `#job-detail` (consent, media upload, complete, invoice, review) |
| `expenses` | Expenses & Profit | `#expense-form` (`category`, `subcategory`, `vendor`, `amount`, `gst`, `expense_date`, `description`, `booking_id`, `customer_id`, `receipt_reference`), `#profit-refresh` |
| `performance` | Performance Centre | `#performance-refresh`, `#staff-performance-table`, `#customer-performance-table` |
| `content` | Content Studio | `#content-form` (`title`, `format`, `aspect_ratio`, `target_duration_seconds`, `hook`, `caption`, `cta`, `editing_prompt`, `platforms` checkboxes). Suggest / platform ideas / save |
| `campaigns` | Campaigns | `#campaign-form` (`name`, `campaign_type`, `channel`, `audience_rule`, `scheduled_at`, `offer`, `message`), `#marketing-performance-refresh` |
| `connections` | Connections | `#connection-readiness`, `#connections-table`, `#channel-metrics-grid` |
| `records` | Records & Archive | `#records-refresh`, `#history-type-filter`, `#history-search`, `#history-import-form` (`record_type`, `source_channel`, `full_name`, `phone`, `email`, `occurred_at`, `reference_code`, `import_source`, `title`, `summary`) |
| `officeai` | Office AI Co-pilot | Same copilot as the shell. `#open-office-ai` |
| `aiquality` | AI Quality Loop | `#ai-quality-form` (`task_type`, `threshold`, `hypothesis`, `maker_output`) |
| `subscribers` | Subscribers | Table and per-row manage panel from `office-subscribers.js` (plan, payment, follow-up, profile) |
| `subpay` | Get paid | Provider settings from `office-pay.js` |
| `staffchat` | Staff Chat | `#office-staff-chat-form` (`sender_name`, `message`) |
| `help` | Help & Governance | Help content plus support widget |
| `receptionist` | AI Receptionist | `#receptionist-form`: `business_name`, `business_public_number`, `whatsapp_business_number`, `owner_transfer_enabled`, `voice_preference`, `voice_locale`, `greeting`, `recording_notice`, `required_questions`, `direct_owner_transfer_rules`, `service_area`, `business_hours`, `escalation_rules` |
| `website` | Website | `#website-status-card`, `#refresh-newsletter` |
| `searchvisibility` | SEO · GEO · AEO | `#search-refresh`, `#indexnow-submit`, `#search-visibility-summary`, link to `/saas/answers.html` |

Detail panes that open inside a view (not separate routes): enquiry `#detail`, conversation `#conversation-detail`, quote `#quote-detail`, job `#job-detail`, customer history `#customer-history-detail`.

## 7. Stylesheets in play

Shared or public: `saas/brand.css`, `app.css`, `adaptive.css`, `experience.css`, `premium-ui.css`, `support.css`, `public-design.css`, `public-polish.css`, `public-sections.css`, `public-stage.css`, `public-voice-install.css`, `intro.css`, `journey.css`, `auth.css`, `manual.css`, `governance.css`.

Workspace: `workspace-nav.css`, `workspace-views.css`, `workspace-theme.css`, `focused-workspace.css`, `workspace-seo.css`, `workspace-pad.css`, `workspace-gadgets.css`, `workspace-finance.css`, `workspace-customers.css`, `workspace-chat.css`, `workspace-payments.css`, `workspace-growth.css`, `workspace-hiring.css`, `team-accounts.css`, `apply.css`, `pay.css`.

Office: `office.css`, `office-theme.css`, `office-records.css`, `office-layout.css`, `office-insights.css`, plus shared `support.css`, `experience.css`, `premium-ui.css`.

`worker-onboarding.html` also has a large inline `<style>` block.

37 CSS files. Later phases edit these. They do not add a new framework stylesheet.
