# Feature inventory (consolidated release)

Branch `consolidated-improvements-2026`. Three surfaces in one repository and one Node service:
1. the public website (`/`);
2. the Subscriber Workspace (`/saas/workspace.html`);
3. the Founder Console (`/office/`).

**How this was checked.**
- `npm run release:audit` compares this branch with `main` (`8318b9e`, the version in production today). It lists
  every route, page, element ID, form, workspace view, console section and npm script. Nothing that existed there
  has been removed. The one exception is intentional: `/` now serves the public home page instead of redirecting to
  `/saas/`.
- `npm run verify:modules` opens every module in a browser at 1440 px and 390 px and calls each module's endpoints.
  It reports `VERIFIED`, or `WORKS, PROVIDER NEEDED FOR LIVE USE` when an outside provider must be connected before the
  module can act in the outside world. Results are in `qa/reports/modules.json`; see TEST_RESULTS.md for the counts.

| Inventory | `main` (production) | This branch |
|---|---|---|
| HTTP routes (API and pages) | 419 | 599 |
| API routes swept by `route-guards.test` | — | 537 |
| HTML pages | 22 | 41 |
| Workspace views | 38 | 60 |
| Founder Console sections | 23 | 34 |
| HTML element IDs | 636 | 753 |
| npm scripts | 16 | 43 |

Status key:
- **V**: verified end to end without an outside service.
- **P**: works inside Super Pro; a provider must be connected for live use (named in the last column).
- **N**: new in Phases 01 to 10.

## Public website
| Page | Status | Notes |
|---|---|---|
| Home, Features (+ feature pages), Industries (5 pages), Pricing, AI Receptionist, Stories, Help, Contact | V N | 19 pages built from `scripts/site/`. Checked by `test:site-ui`, axe, Core Web Vitals and `release-seo-check`. |
| Sign in, Create account, Founder sign-in, Join team, Pay page, Answers, Trust Centre, Privacy, Terms | V | Retheme only; behaviour unchanged. |
| Business websites built in Super Pro (`/sites/<slug>/...`) with contact forms | V N | `seo-platform.test`, `comms.test`. |

## Subscriber Workspace (9 groups)
| Group | Views | Status | Provider for live use |
|---|---|---|---|
| Today | Home dashboard, AI Assistant, Approvals, AI Automations | V / P | AI provider for AI answers (built-in rules otherwise) |
| Customers & Work | Enquiries, Customers, Quotes, Bookings, Jobs, Stock, Records & Archive | V | — |
| People | Workers (compliance), Staff accounts, Hiring, Offshore Staff | V / P | VEVO checks are recorded by hand from the official portal |
| Communications | Inbox (all channels), **Unified Inbox** N, **Call Handling** N, Email Centre, Phone Numbers, Calls & SMS, AI Receptionist, Video Meetings, Team Chat | P | Telnyx (calls and SMS), Resend (email), Meta (WhatsApp and social) |
| Content & Growth | Studio, Growth Engine, Campaigns, **Campaign Studio** N, **Consent & Unsubscribes** N | P | Email or SMS provider for sending; social accounts for posting |
| Website & Visibility | **SEO Command Centre, Technical Audit, Keyword Clusters, Google, Content Studio, Website Builder, Local SEO, SEO Analytics, SEO Reports** N; Website & Domain, Search & AI visibility, Search Console, Backlinks | V / P | Google OAuth, Search Console, GA4, Business Profile and PageSpeed for live data |
| Money | Ledger (job finance), Invoices, **Quotes & Invoices, Payments & Refunds, Bank Reconciliation, Reports & GST, Finance Settings & Compliance** N | V / P | The business's own Stripe or PayPal for card payments and refunds |
| Setup & Trust | Settings, Connections, Import, Print & export, Trust & security, Automation, Help & complaints, Support access, User manual | V / P | Each integration's credentials |
| Plans & Usage | Plans, billing & add-ons, **Change Plan** N | V / P | Stripe for card payments |

The pipeline Enquiry → Quote → Booking → Allocation → Completion → Invoice → Payment is one linked chain (Phase 04).
It is proven by `pipeline.test` and `test:pipeline-ui`.

## Founder Console (9 groups)
| Group | Sections | Status |
|---|---|---|
| Platform overview | Overview, Revenue N, Infrastructure, Storage & backups N, AI usage N | V / P |
| Subscribers | Businesses (administration, organisation management) | V |
| Billing & usage | Subscription invoices, Payment providers, Plans & add-ons, **Plan prices, renewals & revenue** N | V / P |
| Support & success | Email Centre (system email), Tickets, Support access | V / P |
| Super Pro team | Team work | V |
| Super Pro marketing | Prospect CRM, Campaign drafts, Content drafts, Announcement drafts, Website visibility, **SEO & website** N, **Newsletter campaigns** N | P |
| Operations & maintenance | Tasks & releases, Incidents, Operating costs, Provider readiness, **AI automations** N, **Reliability & backups** N | V / P |
| Security & audit | Activity log (hash-chained audit) | V |
| Founder controls | Complimentary grants, Operator staff & roles, Legacy inventory, Compliance N, Feature access & configuration N | V |

## Background and platform features
- **Durable job queue.** Leases, retries, dead letters and idempotency keys (`job-queue.test`).
- **AI automation engine.** Levels 1 to 4, approvals, schedules, retries, emergency pause (`automation-engine.test`,
  `automation-governance.test`).
- **Voice flow.** Telnyx Call Control with an assistant, transcription, transfer and voicemail fallbacks
  (`comms.test`).
- **Backups.** Litestream continuous replication. Daily checked snapshots, a weekly restore test, a configuration
  backup, 14 monitors, alerts and self-healing (`reliability.test`).
- **Security.** Request IDs, `/healthz`, `/readyz`, security headers, rate limits, Founder MFA, session caps
  (`security-policy.test`, `release-security.test`).

## Not available, or limited
See KNOWN_ISSUES.md. In short:
- Live provider calls (Telnyx, Stripe, Resend, Google, AWS, Render API) are not verified from the build environment.
- WhatsApp and social replies are saved and approved but not sent directly.
- VEVO checks are recorded by hand.
- Domain purchase is a request only.
- There are no runtime feature-flag switches; access is set by plans and grants.
