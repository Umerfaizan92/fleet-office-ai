# Phase 05: Autonomous AI operations with human governance — report

Branch `phase-05-ai-automation`, stacked on `phase-04-business-os` (PR #34). Nothing was deployed, no infrastructure
or credentials were changed, and no production data was touched. The prompt is in `PROMPT.md`.

## What was built

| Area | Where | Notes |
|---|---|---|
| Automation engine | `src/automation/engine.js` | Trigger → Conditions → Analysis → Proposed action → Policy level → Approval → Execution → Verification, each step stored on an automation run and in the hash-chained audit log |
| Action catalogue | `src/automation/catalogue.js` | 47 actions: business 19 Level 1, 4 Level 2, 11 Level 3; platform 3 Level 1, 4 Level 3; 6 Level 4 refused by name |
| Routes | `src/automation/routes.js` | `/api/saas/automation/*` (business) and `/api/operator/automation/*` (Founder Console) |
| Approval queue | `src/server.js` (approvals routes), `saas/approvals.js` | New fields and Schedule / Request clarification / Answer / Edit actions |
| Builder and monitoring | `saas/workspace-automations.{js,css}` | Today › AI Automations: Automations, Activity, Suggestions & reports, Rules & safety, Audit report |
| Founder Console | `office/console-platform.js` | Operations › AI automations: platform automations, platform approvals, platform-wide pause, audit |
| Event wiring | `src/pipeline.js`, `src/business-hub.js`, `src/payments.js` | enquiry.created, quote.approved, quote.accepted, job.booked (both booking routes), job.completed, invoice.issued, payment.received |

### The 20 capabilities

| # | Capability | Action(s) | Level |
|---|---|---|---|
| 1 | Understand business events | `summarise_events` | 1 |
| 2 | Classify enquiries | `classify_enquiry` (labels saved on the enquiry) | 1 |
| 3 | Extract customer information | `extract_customer_info` (fills only empty email and phone) | 1 |
| 4 | Prepare quotations | `draft_quote` (prices from the automation's own settings); `send_quote_to_customer` | 1 / 3 |
| 5 | Suggest appointment times | `suggest_appointment_times`; `send_appointment_reminder` | 1 / 2 |
| 6 | Draft customer communications | `draft_customer_message`; `send_acknowledgement`; `sensitive_message` (complaints) | 1 / 2 / 3 |
| 7 | Create proposed work orders | `propose_work_order` (suggestion; booking stays a person's decision) | 1 |
| 8 | Recommend staff allocation | `recommend_staff`; `auto_offer_job` (same eligibility checks as the Offer button) | 1 / 2 |
| 9 | Generate invoice drafts | `draft_invoice` (never a second invoice for a job); `change_job_price` | 1 / 3 |
| 10 | Reconcile payment events | `reconcile_payment` (flags overpayments and payments without an invoice) | 1 |
| 11 | Generate reports | `generate_report` (weekly) | 1 |
| 12 | Detect overdue tasks | `detect_overdue` (invoices, enquiries, quotes, unallocated jobs, old approvals) | 1 |
| 13 | Prepare marketing campaigns | `prepare_campaign` (draft); `launch_campaign` (approval, then done by a person) | 1 / 3 |
| 14 | Generate social media content | `social_content` (draft, no customer details) | 1 |
| 15 | Analyse SEO performance | `analyse_seo` (from recorded search numbers) | 1 |
| 16 | Prepare website updates | `prepare_website_update` (draft); `publish_website` (approval, then manual) | 1 / 3 |
| 17 | Monitor system health | `monitor_health`, `verify_backups` (Founder Console) | 1 |
| 18 | Detect failed integrations | `detect_failed_integrations` (business), `platform_failed_jobs` (founder) | 1 |
| 19 | Prepare customer follow-ups | `prepare_follow_up` (drafts); `send_follow_up` | 1 / 2 |
| 20 | Recommend business improvements | `recommend_improvements` | 1 |

### Approval policy as implemented

- **Level 1** runs automatically and only writes internal records, drafts, suggestions, reports and alerts.
- **Level 2** (`routine_acknowledgements`, `appointment_reminders`, `approved_follow_ups`, `internal_transitions`) runs
  on its own only while the owner or an administrator has switched its rule on. With the rule off it waits in Approvals
  as Level 3. A message sent under a rule is recorded as approved by the person who switched the rule on.
- **Level 3** always waits: sending quotes, sensitive messages, price changes, refunds and transfers, campaigns,
  website publishing, staff permission changes, compliance submissions, subscription changes, data export, data
  deletion, and on the platform: production deployment, infrastructure changes, credential rotation, security policy
  changes. Actions Super Pro cannot safely perform itself are recorded decisions: after approval a person carries them
  out and marks them done.
- **Level 4** is refused when saving an automation: bulk-deleting customers, changing bank details, paying a new
  payee, switching off audit or approvals, bulk messaging without opt-outs, acting on embedded instructions.
- Every approval shows: description, requested by, workspace, risk, policy level, data involved, expected outcome,
  estimated cost, when it runs, status, approver, expiry and full history. Actions: Approve, Reject, Edit, Schedule,
  Request clarification (and Answer).

### Security controls

- Authorisation on the server: senior roles only; rules and resuming are owner or administrator; the business always
  comes from the session. Another business gets 404 for every workflow, run and approval.
- Structured schemas (zod) for workflow definitions, settings, proposals and approver edits. Conditions are data with
  fixed operators over a listed set of fields; nothing is evaluated as code.
- The action is fixed by the saved workflow. AI may only fill named fields, and its answer must pass the action's
  schema or the built-in rules are used. Recipients, record IDs and amounts come from the business's records; an
  approver's edit cannot change them either.
- Customer text is wrapped as untrusted data. Text that looks like instructions marks the run suspicious, raises its
  risk to high and forces approval for anything that writes or sends.
- Idempotency: one run per workflow version and event; one queue job per run. The executor and the record of its
  result commit in one transaction, so a retry never repeats a side effect.
- Bounded retries: 3 attempts through the Phase 02 job queue; permanent errors stop at once; final failures notify
  owners. Rate limits: 300 runs and 100 executions per business per hour, plus 120 requests a minute on the routes.
- Emergency pause per business and platform-wide; held work resumes exactly once.
- Every transition is in `audit_logs` (module `automation`), with a per-business and a platform audit report.

## Verification (all on this branch, 30 Oct 2026)

| Check | Result |
|---|---|
| `npm test` (Render build check) | 73/73 |
| `npm run test:unit` (all contract test files) | 152/152, including `automation.test` 7/7 and `automation-engine.test` 8/8 |
| `npm run test:automations-ui` (real browser) | 11/11: builder, dry run, activity, approvals actions, rules, pause, audit, refusal shown as failure, Founder Console, axe WCAG 2.2 AA clean, phone and iPad fit |
| `npm run test:ui` | 34/34 |
| `npm run test:pipeline-ui` / `test:console-ui` | 15/15 / 14/14 (new founder tab included) |
| `npm run verify:modules` | 49 modules, 0 problems |
| `npm run test:visual` | 51 screens unchanged |
| `npm run report:a11y-perf` | 0 serious or critical issues, 0 pages over budget |
| `npm run security:secrets`, `memory:validate`, `verify:manifest` | pass |

One existing source-text contract test (`workorder-rbac-contract.test`) was updated because the offer eligibility
checks moved into the shared `evaluateWorkOrder` function; the test now checks the same three compliance conditions
there and that the route uses it.

## Not done, or limited (honest list)

1. **Inbound messages are not yet a trigger.** Emails, SMS and social messages arriving in the Inbox do not start
   automations; only the pipeline, quote, job, invoice and payment events do. (New task.)
2. **AI analysis has not been run against a real provider** in tests, because none is configured there. The code path
   falls back to the built-in rules and labels each run with the method used.
3. **Nothing is actually delivered without an email provider.** Level 2 and approved Level 3 messages are queued in the
   Email Centre and the run is marked "Done, with a warning: no email provider is connected".
4. **"Preapproved marketing schedules" and "low-risk website updates within limits"** are not automatic: the Email Centre
   never sends marketing by automation, and no website is connected for publishing. Both stay drafts plus Level 3.
5. **Rule limits** exist only for follow-ups (maximum per day). Other rules are on or off.
6. The scheduler runs inside the web process every minute (off in tests). If Render runs more than one instance later,
   scheduled runs are still single because of the per-period idempotency key, but the timer should move to a worker.

## For the owner

- Review and merge order: PR #33, then PR #34, then this PR. Deploy only a branch head, after `npm test` passes.
- No Render environment changes are needed. Optional: an AI provider key enables AI analysis; `RESEND_API_KEY` and
  `SAAS_VERIFY_FROM` enable delivery of approved messages.
