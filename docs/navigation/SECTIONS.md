# Verified navigation and section order

Source baseline: `3edc118051aac8d3aa18fd76ae1da0bdc0240680`. Local synthetic browser coverage; this is not a production provider readiness claim.

Every page below was opened through its sidebar link at 1440 px and 390 px. Listed section controls were selected and their active state checked at both widths. Functional workflow tests and provider requirements are recorded separately in qa/reports/modules.json and IMPLEMENTATION.md.

## Business

### Today

| Page / sidebar submenu | Route | Top sections in displayed order | Navigation |
|---|---|---|---|
| Home & AI Command | `b01/home` | Business overview → Attention items → Readiness → Workflow guide | PASS, both widths |
| AI Assistant | `b01/assistant` | How AI works → Ask AI → Save an operational task → Saved tasks | PASS, both widths |
| Approvals | `b01/approvals` | Decision overview → Queue & history → Approval policy | PASS, both widths |
| AI Automations | `b01/automations` | Automations → Activity → Suggestions & reports → Rules & safety → Audit report | PASS, both widths |

### Customers & Work

| Page / sidebar submenu | Route | Top sections in displayed order | Navigation |
|---|---|---|---|
| Enquiries | `b02/enquiries` | Single content view; no additional tablist observed | PASS, both widths |
| Customers | `b02/customers` | Single content view; no additional tablist observed | PASS, both widths |
| Quotes | `b02/quotes` | Single content view; no additional tablist observed | PASS, both widths |
| Bookings | `b02/bookings` | Single content view; no additional tablist observed | PASS, both widths |
| Jobs & Dispatch | `b02/jobs` | Create work order → Open work orders | PASS, both widths |
| Stock & Supplies | `b02/stock` | Reorder → Most used → Stock on hand | PASS, both widths |
| Records & Archive | `b02/archive` | Single content view; no additional tablist observed | PASS, both widths |

### People

| Page / sidebar submenu | Route | Top sections in displayed order | Navigation |
|---|---|---|---|
| Workers & Compliance | `b03/workers` | Add worker → People | PASS, both widths |
| Staff Accounts & Roles | `b03/staff` | Business members → Invitation history | PASS, both widths |
| Hiring (owner & admin only) | `b03/hiring` | Roles and adverts → Applicants | PASS, both widths |
| Offshore Staff | `b03/offshore` | Single content view; no additional tablist observed | PASS, both widths |

### Communications

| Page / sidebar submenu | Route | Top sections in displayed order | Navigation |
|---|---|---|---|
| Inbox (all channels) | `b04/inbox` | Single content view; no additional tablist observed | PASS, both widths |
| Unified Inbox | `b04/unified` | Inbox → Sent → Drafts → Scheduled → Archived → Failed → Spam | PASS, both widths |
| Call Handling | `b04/voice` | Section: Your number → Section: Call handling → Section: Recent calls | PASS, both widths |
| Email Centre | `b04/email` | All mail → Received → Drafts & approved → Sent → Scheduled → Marketing → Campaigns → Enquiries → Invoices → Support | PASS, both widths |
| Phone Numbers | `b04/numbers` | Single content view; no additional tablist observed | PASS, both widths |
| Calls & SMS | `b04/calls` | Single content view; no additional tablist observed | PASS, both widths |
| AI Receptionist | `b04/receptionist` | Single content view; no additional tablist observed | PASS, both widths |
| Video Meetings | `b04/meetings` | Single content view; no additional tablist observed | PASS, both widths |
| Team Chat | `b04/team-chat` | Single content view; no additional tablist observed | PASS, both widths |

### Content & Growth

| Page / sidebar submenu | Route | Top sections in displayed order | Navigation |
|---|---|---|---|
| Media Studio | `b05/studio` | Start from anything you already have → AI Render Specification → Platform suggestions → Creative readiness → Saved specifications | PASS, both widths |
| Growth Engine | `b05/growth` | Plan → Calendar → Reuse a post → About you → Activity | PASS, both widths |
| Campaign Drafts | `b05/campaigns` | Single content view; no additional tablist observed | PASS, both widths |
| Campaign Studio | `b05/campaign-studio` | Section: New campaign → Section: Campaigns | PASS, both widths |
| Consent & Unsubscribes | `b05/consent` | Section: Marketing consent → Section: Unsubscribed and suppressed | PASS, both widths |

### Website & Visibility

| Page / sidebar submenu | Route | Top sections in displayed order | Navigation |
|---|---|---|---|
| SEO Command Centre | `b06/seo` | Section: Google → Section: Scheduled SEO jobs → Section: Your sites | PASS, both widths |
| Technical Audit | `b06/audit` | Single content view; no additional tablist observed | PASS, both widths |
| Keyword Clusters | `b06/keywords` | Single content view; no additional tablist observed | PASS, both widths |
| Google | `b06/google` | Single content view; no additional tablist observed | PASS, both widths |
| Website Content Studio | `b06/studio` | Single content view; no additional tablist observed | PASS, both widths |
| Website Builder | `b06/builder` | Single content view; no additional tablist observed | PASS, both widths |
| Local SEO | `b06/local` | Section: Checks → Section: Reviews → Section: Service-area and location pages | PASS, both widths |
| SEO Analytics | `b06/analytics` | Single content view; no additional tablist observed | PASS, both widths |
| SEO Reports | `b06/reports` | Single content view; no additional tablist observed | PASS, both widths |
| Website & Domain | `b06/website` | Single content view; no additional tablist observed | PASS, both widths |
| Search & AI Visibility | `b06/search` | Score → Business facts → Content library → AI answers → Schema & files | PASS, both widths |
| Search Connection Request | `b06/search-console` | Single content view; no additional tablist observed | PASS, both widths |
| Backlink Suggestions | `b06/backlinks` | Single content view; no additional tablist observed | PASS, both widths |

### Money

| Page / sidebar submenu | Route | Top sections in displayed order | Navigation |
|---|---|---|---|
| Profit & Payments | `b07/ledger` | Overview → Jobs & payments → Get paid → Costs & overheads → Reports | PASS, both widths |
| Invoices | `b07/invoices` | Single content view; no additional tablist observed | PASS, both widths |
| Quotes & Invoices | `b07/sales` | Section: New quotation, estimate or invoice → Section: Documents | PASS, both widths |
| Payments & Refunds | `b07/payments-refunds` | Section: Receipts → Section: Refunds | PASS, both widths |
| Bank Reconciliation | `b07/reconcile` | Section: Import → Section: Bank lines | PASS, both widths |
| Reports & GST | `b07/reports` | Section: Summary → Section: Profit and loss → Section: GST (BAS draft) → Section: Owed to you → Section: Overdue: suggested follow-ups | PASS, both widths |
| Finance Settings & Compliance | `b07/compliance` | Section: Finance settings → Section: Compliance review → Section: Flagged for checking → Section: Audit trail | PASS, both widths |

### Setup & Trust

| Page / sidebar submenu | Route | Top sections in displayed order | Navigation |
|---|---|---|---|
| Brand & Settings | `b08/settings` | Business profile → Contact details → Address → Workspace design → Appearance → Services & area → Approvals → AI preferences | PASS, both widths |
| Connections (social, WhatsApp, website) | `b08/connections` | Secure connection policy → Your business connections | PASS, both widths |
| Import Your Data | `b08/import` | Single content view; no additional tablist observed | PASS, both widths |
| Print & Export Hub | `b08/print` | Activity log → Worker master sheet → Financial summary → Full workspace backup | PASS, both widths |
| Trust & Security | `b08/trust` | Owner control centre → Governance follows the business profile → AI routes. Authorised people decide. → Policies relevant to your role → Protected case management → Owner & senior notifications → Audit & governance ledger | PASS, both widths |
| Automation Settings | `b08/automation` | Single content view; no additional tablist observed | PASS, both widths |
| Help & Complaints | `b08/help` | Get contextual help → Policies and escalation | PASS, both widths |
| Support Access | `b08/support-access` | Single content view; no additional tablist observed | PASS, both widths |
| User Manual | `b08/manual` | Workspace map → Current area → Your role → Next steps → Connections guide → Help | PASS, both widths |

### Plans & Usage

| Page / sidebar submenu | Route | Top sections in displayed order | Navigation |
|---|---|---|---|
| Plans, Billing & Add-ons | `b09/usage` | Current access → Compare plans → Payment connections → Usage & add-ons → Billing safeguards → Plan features | PASS, both widths |
| Change Plan | `b09/change-plan` | Section: Choose a plan → Section: Plan changes | PASS, both widths |

## Founder

### Platform overview

| Page / sidebar submenu | Route | Top sections in displayed order | Navigation |
|---|---|---|---|
| Overview | `f01/overview` | Section: Provider readiness → Section: Operations boundaries | PASS, both widths |
| Revenue | `f01/platform/revenue` | By plan → Platform invoices | PASS, both widths |
| Infrastructure | `f01/system` | File storage → Background jobs → Security posture | PASS, both widths |
| Storage & backups | `f01/platform/backups` | Database backups → Customer files → Restore drill | PASS, both widths |
| AI usage | `f01/platform/ai-usage` | Busiest businesses → All recorded usage | PASS, both widths |

### Subscribers

| Page / sidebar submenu | Route | Top sections in displayed order | Navigation |
|---|---|---|---|
| Businesses | `f02/subscribers` | Single content view; no additional tablist observed | PASS, both widths |

### Billing & usage

| Page / sidebar submenu | Route | Top sections in displayed order | Navigation |
|---|---|---|---|
| Subscription invoices | `f03/invoices` | Single content view; no additional tablist observed | PASS, both widths |
| Payment providers | `f03/legacy:subpay` | Single content view; no additional tablist observed | PASS, both widths |
| Plans & add-ons | `f03/legacy:subscribers` | Single content view; no additional tablist observed | PASS, both widths |
| Plan prices, renewals & revenue | `f03/platform/finance` | Section: Revenue → Section: Plans and prices → Section: Renewals and trials → Section: Payment problems | PASS, both widths |

### Support & success

| Page / sidebar submenu | Route | Top sections in displayed order | Navigation |
|---|---|---|---|
| Email Centre | `f04/mail` | All mail → Received → Drafts & approved → Sent → Scheduled → Marketing → Campaigns → Enquiries → Invoices → Support | PASS, both widths |
| Tickets | `f04/records:ticket` | Single content view; no additional tablist observed | PASS, both widths |
| Support access | `f04/support-access` | Single content view; no additional tablist observed | PASS, both widths |

### Super Pro team

| Page / sidebar submenu | Route | Top sections in displayed order | Navigation |
|---|---|---|---|
| Team work | `f05/records:staff_task` | Single content view; no additional tablist observed | PASS, both widths |
| Hiring requests | `f05/records:hire` | Single content view; no additional tablist observed | PASS, both widths |

### Super Pro marketing

| Page / sidebar submenu | Route | Top sections in displayed order | Navigation |
|---|---|---|---|
| Prospect CRM | `f06/records:prospect` | Single content view; no additional tablist observed | PASS, both widths |
| Campaign drafts | `f06/records:campaign` | Single content view; no additional tablist observed | PASS, both widths |
| Content drafts | `f06/records:content` | Single content view; no additional tablist observed | PASS, both widths |
| Announcement drafts | `f06/records:announcement_draft` | Single content view; no additional tablist observed | PASS, both widths |
| Website visibility | `f06/legacy:searchvisibility` | Single content view; no additional tablist observed | PASS, both widths |
| SEO & website | `f06/platform/seo` | Command Centre → Command Centre / Section: Google → Command Centre / Section: Scheduled SEO jobs → Technical Audit → Keyword Clusters → Google → Content Studio → Website Builder → Analytics → Reports | PASS, both widths |
| Newsletter campaigns | `f06/platform/campaigns` | Section: Communications overview → Section: New campaign → Section: Super Pro newsletter campaigns | PASS, both widths |

### Operations & maintenance

| Page / sidebar submenu | Route | Top sections in displayed order | Navigation |
|---|---|---|---|
| Tasks & releases | `f07/records:task` | Single content view; no additional tablist observed | PASS, both widths |
| Incidents | `f07/records:incident` | Single content view; no additional tablist observed | PASS, both widths |
| Operating costs | `f07/records:cost` | Single content view; no additional tablist observed | PASS, both widths |
| Provider readiness | `f07/legacy:connections` | Single content view; no additional tablist observed | PASS, both widths |
| AI automations | `f07/platform/automation` | Emergency pause → Waiting for your approval → Platform automations → Recent runs → Reports and alerts → Platform automation audit, last 30 days | PASS, both widths |
| Reliability & backups | `f07/platform/reliability` | Components → Alerts (0 open) → Recovery readiness → Backups → Self-healing → Needs approval: deploy, rollback, restore, infrastructure, credentials, deletion, major changes → Daily summaries | PASS, both widths |

### Security & audit

| Page / sidebar submenu | Route | Top sections in displayed order | Navigation |
|---|---|---|---|
| Activity log | `f08/audit` | Single content view; no additional tablist observed | PASS, both widths |
| Compliance | `f08/platform/compliance` | Privacy requests → Support cases and complaints → Account deletion requests | PASS, both widths |

### Founder controls

| Page / sidebar submenu | Route | Top sections in displayed order | Navigation |
|---|---|---|---|
| Complimentary grants | `f09/complimentary` | Single content view; no additional tablist observed | PASS, both widths |
| Operator staff & roles | `f09/staff` | Single content view; no additional tablist observed | PASS, both widths |
| Legacy inventory | `f09/legacy-inventory` | Single content view; no additional tablist observed | PASS, both widths |
| Feature access & configuration | `f09/platform/configuration` | Environment → Providers connected → Feature access | PASS, both widths |

## Shared checks

Section deep links, history, reload, original unsaved form values, restricted employee isolation, keyboard section selection, drawer focus restoration, saved rail preference and serious/critical WCAG A/AA navigation checks in light and dark themes passed.

Scope limit: route/section coverage confirms navigation and rendered selection. Record writes, external integrations and operational readiness require their dedicated workflow tests and production checks. Disabled sections are not represented as working features.
