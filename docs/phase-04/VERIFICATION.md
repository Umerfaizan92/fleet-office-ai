# Phase 04 verification report: Business Operating System integration

Branch `phase-04-business-os` (based on Phase 03, PR #33). Everything below was run against a throwaway local server
with synthetic data. Production and Render were not touched and nothing was deployed. Prompt: [PROMPT.md](PROMPT.md).

## Summary

- **Pipeline connected end to end.** Before Phase 04, Enquiries, Quotes, Bookings and Invoices in the subscriber
  workspace were free-text drafts with no links between them. A booking never became a job, and an invoice never knew
  it was paid. Now Enquiry → Quote → Booking → Allocation → Completion → Invoice → Payment runs as one chain, and each
  step updates the records linked to it.
- **All 47 listed modules (32 subscriber, 15 founder) checked.** Each was opened in a browser at laptop (1440 px) and
  phone (390 px) width and had its server endpoints called. Result: no failing calls, no browser errors, no sideways
  scrolling (`npm run verify:modules`, details in `qa/reports/modules.json`).
- **Built in this phase:** the pipeline, Offshore Staff, an Automation screen, record search in the workspace search
  box, and six Founder Console tabs (revenue, infrastructure, storage and backups, AI usage, compliance, feature access
  and configuration).
- **Honest status:** 27 modules are fully verified with no outside service needed (19 subscriber, 8 founder).
  The other 20 work inside Super Pro but need a provider (email, SMS, AI, payments, domain, social networks or S3)
  before they act in the outside world, or carry a stated limit such as AI cost not being recorded. Remaining gaps are
  listed at the end.

The Phase 00 inventory was delivered in chat and was never saved in the repository, so the preservation checklist was
rebuilt from the code: 398 API routes, 40 workspace routes and 9 console sections. It now lives in
`scripts/verify-modules.mjs` (module → screens → endpoints → tests → provider) and runs on demand.

## The pipeline

| Step | What happens | Propagates to | Proven by |
|---|---|---|---|
| Enquiry | Recorded with a new or existing customer and the channel it came in by. A new customer is created as a lead. | Customers | `pipeline.test`, `test:pipeline-ui` |
| Quote | Created from the enquiry. Price excludes GST; GST is 10% unless marked GST-free. Approve, then record the customer's acceptance with evidence. | Enquiry → quoted | same |
| Booking | Only an accepted quote can be booked. Booking creates the job with customer, address, date and price including GST. | Quote → booked; enquiry → booked; Jobs; Money | same |
| Allocation | "Offer to workers" uses the existing offer engine (eligibility, skills, compliance). When workers accept, the job becomes allocated. Offering with no eligible worker shows an error, never success. | Booking shows accepted workers | same + `workorder-runtime-auth.test` |
| Completion | Marking the job complete sets the completion time and updates Job Finance (materials and labour costs). | Booking → completed; Money | same |
| Invoice | Created only from a completed job, one per job, with the quote's amounts. Approve, then issue (sets the due date from payment terms). | Booking → invoiced; job invoice and due dates | same |
| Payment | Recorded or requested through the existing payments module. The invoice follows the job's real payments: issued → part paid → paid. Overpayment is refused. | Invoice; Money stage "paid"; receipts | same |

Each record has a **History** view showing the whole chain, its payments and the activity log. A pipeline summary
(counts and values per stage) sits on all four screens. Other businesses get "not found" for every record in the chain,
workers cannot invoice or see quotes, and the older booking button now also creates the job.

## Subscriber workspace (32 modules)

Legend: **Verified** = screen and endpoints checked, actions covered by automated tests. **Works; provider for live
use** = works inside Super Pro, but sending, calling, publishing or charging needs an outside provider configured.

| Module | Screen | Status | Evidence | Remaining blocker |
|---|---|---|---|---|
| Dashboard | Today > Home | Verified | `test:ui`, `test:visual`, harness | Pipeline summary is on the pipeline screens, not yet on the dashboard |
| Business setup | Setup & Trust > Settings | Verified | `test:ui`, harness | |
| CRM and customers | Customers & Work > Customers | Verified | `test:ui`, `pipeline.test`, harness | |
| Enquiries | Customers & Work > Enquiries | Verified (rebuilt) | `pipeline.test`, `test:pipeline-ui` | Not created automatically from inbox messages or calls |
| Quotations | Customers & Work > Quotes | Verified (rebuilt) | same | No PDF or emailed quote yet; send through the Email Centre |
| Bookings | Customers & Work > Bookings | Verified (rebuilt) | same | |
| Jobs | Customers & Work > Jobs & Dispatch | Verified | `test:ui`, `workorder-*` tests, `pipeline.test` | |
| Work orders | Jobs & Dispatch | Verified | `workorder-rbac-contract.test`, `workorder-runtime-auth.test` | |
| Worker allocation | Jobs, Bookings | Verified | `workorder-runtime-auth.test`, `pipeline.test` | |
| Workforce compliance | People > Workers | Works; provider for live use | `saas-platform.test`, `test:ui` | VEVO checks are entered from the official portal; there is no government API |
| Offshore staff | People > Offshore Staff | Verified (new) | `business-ops.test`, `test:pipeline-ui` | Offshore people also appear in the Workers list with work rights "not applicable offshore" |
| AI receptionist | Communications > AI Receptionist | Works; provider for live use | `test:ui`, harness | Telnyx number, routing, pricing and spend caps |
| Unified inbox | Communications > Inbox | Works; provider for live use | `test:ui`, contract tests | Telnyx, Meta and email webhooks for live channels |
| Email and messaging | Communications > Email Centre, Calls & SMS | Works; provider for live use | `test:ui`, harness | Resend to send email; Telnyx for SMS |
| Invoices | Money > Invoices | Verified (rebuilt) | `pipeline.test`, `test:pipeline-ui` | No customer-facing invoice PDF yet (receipts exist) |
| Payments | Money > Profit & Payments | Works; provider for live use | payments contract tests, `pipeline.test` | Stripe or PayPal per business for card links; bank and manual payments work now |
| Accounting and GST | Money > Profit & Payments | Verified | contract tests, `pipeline.test` | |
| Marketing | Content & Growth > Growth | Works; provider for live use | `test:ui`, harness | Social accounts to publish |
| Campaigns | Content & Growth > Campaigns | Works; provider for live use | `test:ui`, harness | Still simple drafts; bulk sending needs email provider and opt-outs |
| Social media | Growth, Connections | Works; provider for live use | `test:ui` | Each network's app approval |
| Content studio | Content & Growth > Studio | Works; provider for live use | `test:ui`, harness | AI provider for scripts and voice |
| Website management | Website & Visibility > Website & Domain | Works; provider for live use | harness | Requests only; no registrar or hosting connected |
| SEO | Website & Visibility > Search, Search Console, Backlinks | Works; provider for live use | `test:ui`, harness | Google Search Console or Bing for live data |
| AI approvals | Today > Approvals | Verified | contract tests, `test:ui` | |
| Files and documents | Studio, Print & export, Records & Archive | Verified | file-safety tests, harness | No attachments on enquiries, quotes or invoices |
| Reports | Setup & Trust > Print & export, Money | Verified | `test:ui`, harness | |
| Analytics | Dashboard, Money, Search | Verified | `test:ui`, harness | |
| Branding | Setup & Trust > Settings | Verified | `test:ui`, harness | |
| Notifications | Bell, preferences | Works; provider for live use | `test:ui`, contract tests | Pipeline steps do not create notifications yet; push and email delivery need providers |
| Help and support | Setup & Trust > Help, Support Access | Verified | `test:ui`, contract tests | |
| Integrations | Setup & Trust > Connections | Works; provider for live use | `integration:test`, `test:ui` | Each provider's credentials |
| Automation settings | Setup & Trust > Automation | Verified (new) | `business-ops.test`, `test:pipeline-ui` | Inbox AI drafts need an AI provider; customer reminders need email or SMS |

## Founder Console (15 modules)

| Module | Where | Status | Evidence | Remaining blocker |
|---|---|---|---|---|
| Subscriber administration | Subscribers | Verified | `test:ui` (founder), harness | |
| Organisation management | Subscribers | Verified | same | |
| Subscription plans | Billing > Plans & add-ons; Founder controls > Feature access | Verified | `platform-health.test`, harness | |
| Platform billing | Billing > Subscription invoices, Payment providers | Works; provider for live use | contract tests, harness | Stripe for platform card payments |
| Revenue analytics | Platform overview > Revenue (new) | Works; reconcile with Stripe | `platform-health.test`, `test:console-ui` | Figures are Super Pro records, not Stripe payouts |
| Infrastructure status | Platform overview > Infrastructure (new screen over Phase 02 data) | Verified | `platform-health.test`, `test:console-ui` | |
| Storage and backups | Platform overview > Storage & backups (new) | Works; provider for live use | `platform-health.test`, `storage:verify` | Needs S3 buckets and keys; restore drill results are not stored in the app |
| AI usage and costs | Platform overview > AI usage (new) | Works; cost not recorded | `platform-health.test` | Request counts only; provider cost is not recorded by Super Pro |
| Platform marketing | Super Pro marketing | Works; provider for live use | `test:ui` (founder), harness | Records and drafts; publishing needs providers |
| System email | Support & success > Email Centre | Works; provider for live use | `platform-health.test` (separation), harness | Resend to send |
| Support tickets | Support & success > Tickets, Support access | Verified | `test:ui` (founder), harness | |
| Security and audit logs | Security & audit > Activity log | Verified | `test:ui` (founder), audit-chain tests | |
| Feature flags | Founder controls > Feature access & configuration (new) | Works as plan and grant access | `platform-health.test` | No runtime on/off switches; features follow the plan and complimentary grants |
| Compliance | Security & audit > Compliance (new) | Verified | `platform-health.test`, `test:console-ui` | |
| Platform configuration | Founder controls > Feature access & configuration (new) | Verified | `platform-health.test` | Read-only; settings are changed in Render environment variables |

**Communications stay separate.** A business owner's session cannot open the platform mailbox
(`/api/operator/mail`), and the founder key cannot open a business mailbox (`/api/saas/mail`). Each side opens only its
own (`platform-health.test`).

## Unified experience

| Item | Status | Evidence |
|---|---|---|
| Navigation | Nine sections with top tabs. All 40 owner routes open exactly one view; Offshore Staff and Automation added. | `test:ui` |
| Search | The workspace search now finds customers, enquiries, quotes, bookings, invoices, jobs and team members (new), as well as sections and AI answers. Results are filtered by permission, business and literal text. Choosing a pipeline record opens its screen filtered to it. | `business-ops.test`, `test:pipeline-ui` |
| Filters | Search and status filters on the four pipeline screens; existing filters on Customers, Jobs, Approvals and Email. | `test:pipeline-ui`, `test:ui` |
| Notifications | Bell, preferences, job-offer notifications. Pipeline steps do not notify yet. | `test:ui` |
| Activity history | History on every pipeline record (chain, payments, audit events); tamper-evident audit log; founder activity log. | `pipeline.test` |
| AI assistance | Copilot, AI Assistant, inbox drafts and workspace search answers. All AI output waits for approval; live answers need an AI provider. | `test:ui`, contract tests |
| File attachments | Job photos and videos, worker documents, support case evidence, content media. Not on enquiries, quotes or invoices yet. | file-safety and contract tests |
| User permissions | Every new route goes through the same permission layer as existing routes (customers, jobs, finance, workforce, settings). Workers cannot reach quotes, invoices, search results for customers, or offshore staff. | `pipeline.test`, `business-ops.test` |
| Mobile | New screens tested at 390 px with no sideways scrolling; 51-screen visual comparison unchanged. | `test:pipeline-ui`, `test:console-ui`, `test:visual`, harness |

## "Never show success for an action that did not succeed"

- Every new screen shows only the server's answer. Refusals and failures appear as errors, and buttons stay disabled
  while a request is in progress.
- Browser tests force a server failure (simulated HTTP 500) and an "offer to workers" with nobody eligible. Both show
  errors, never success.
- A static scan of every frontend file found no request whose failure is silently swallowed next to a success message,
  and no success message shown before the server answered. The direct requests (logo upload, newsletter, hiring
  application, founder sign-in) all check the response first. Limit: a static scan cannot prove every path, so the
  forced-failure tests cover the pipeline screens directly.

## Accessibility

axe-core (WCAG 2.0/2.1/2.2 A and AA) found no violations on Enquiries, Quotes, Bookings, Invoices, Offshore Staff or
Automation in dark and light themes with real data, or on the six new founder tabs.

## Test results (final run)

| Suite | Result |
|---|---|
| `npm test` (also Render's build check) | 73/73 |
| `npm run test:unit` (contract tests, incl. new `pipeline`, `business-ops`, `platform-health`) | 139/139 |
| `npm run test:ui` | 34/34 (40 routes) |
| `npm run test:pipeline-ui` (new) | 15/15 |
| `npm run test:console-ui` (new) | 12/12 |
| `npm run test:site-ui` | 15/15 |
| `npm run test:visual` | 51 screens unchanged |
| `npm run verify:modules` (new) | 47 modules, 0 problems |
| Smoke, integration, secret scan, site freshness, manifest | pass |

## Remaining gaps (proposed next tasks)

1. Create enquiries from inbox messages and receptionist calls (the channel is recorded, but entry is manual).
2. Customer-facing quote and invoice documents (PDF or email from the record), using the Email Centre approval flow.
3. Attachments on enquiries, quotes and invoices (photos, plans, signed acceptance).
4. Notifications for pipeline events (new enquiry, quote accepted, invoice overdue).
5. Pipeline summary on the Today dashboard.
6. Runtime feature switches, if wanted beyond plan and grant access.
7. Store backup restore-drill results so the Storage & backups tab can show the last successful drill.
8. T-037 (from Phase 03): screen-reader labels that match visible text; needs the owner's approval because tests use them.

Live use of the provider-dependent modules needs the owner's accounts and keys. Those are configuration steps and
need no code changes.
