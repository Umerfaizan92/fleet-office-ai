# Phase 08 report: finance, payments and compliance automation

Branch `phase-08-finance`, stacked on `phase-07-communications` (PR #37). The prompt is in `PROMPT.md`. See also
`PAYMENT_ARCHITECTURE.md` (the Stripe Billing and Connect evaluation) and `COMPLIANCE_REVIEW.md` (items for the owner
and a tax agent to confirm).

## Most important limitation first

The test machine cannot reach Stripe. Payment links, refunds and webhooks were all tested against a local stand-in, and
the webhooks were signed exactly as Stripe signs them. The Australian rules were taken from ATO, ABR, OAIC and CFR pages
on 2026-10-30. Engineering reviewed them; a registered tax agent has not. They are not tax advice.

## What was built

### Subscriber finance (Money)
- **Quotes & Invoices:** quotations and estimates (numbered QUO- and EST-), deposit invoices, tax invoices (INV-,
  numbered only when issued, with no gaps) and adjustment notes (CN-).
  - Line items can carry GST, GST-free, input-taxed or not-reportable codes.
  - Prices can be entered with or without GST.
  - Estimates turn into quotations, and quotations turn into invoices or deposit invoices once the job is booked.
  - Documents go draft → approve → issue. Any edit after approval sends the document back to draft.
  - Issued invoices are locked and cannot be cancelled. Corrections use an adjustment note.
  - Every invoice is checked against the versioned rules before it is issued, and records the ruleset it passed.
  - Printable or PDF tax invoices and receipts.
- **GST:** calculated and rounded per line. The document title changes depending on whether the business is
  registered for GST. Invoices cannot be issued until the business says whether it is registered.
- **Deposits:** a deposit invoice asks only for the deposit and leaves the job price unchanged. The final invoice
  shows what has been paid to date and what is still owing.
- **Payment links and status:** card (the business's own Stripe), PayPal or bank transfer, from the invoice.
  - Status is Issued, Part paid, Paid or Overdue, worked out from real payments.
  - Receipts come from the existing payment ledger.
- **Refund requests:** Level 3 approval.
  - Card refunds go through the business's Stripe with an idempotency key.
  - Bank and PayPal refunds are approved, paid back by the business, then marked done with a reference.
  - A rejected request closes without moving money.
- **Adjustment notes:** Level 3 approval. On approval the note is numbered, the job balance is reduced, and any
  overpayment shows as "refund due".
- **Reconciliation:**
  - Bank CSV import handles common Australian layouts and skips lines already imported.
  - Super Pro suggests matches (same amount, within 7 days, reference matches). Nothing is matched until a person
    confirms it.
  - Expense categories are suggested and the app learns from confirmed choices. Lines can be ignored or undone.
  - Payments recorded but not yet seen in the bank are listed.
- **Reports:**
  - Profit and loss (GST-exclusive when registered).
  - GST/BAS draft (G1, G3, 1A, 1B, net) on cash or accrual basis.
  - Aged receivables.
  - CSV exports and a written summary of the period.
- **Overdue reminders:** Super Pro suggests follow-ups using days overdue, reminders already sent and the customer's
  usual time to pay. Automatic reminders are unchanged (Payment settings).
- **AI-assisted work (all labelled, all need a person to confirm):**
  - invoice drafts prepared from the job (quotation lines, or hours, rate and materials);
  - checks for mismatches (job paid amount against its payments, invoice against job price, provider amount
    mismatches, possible duplicate payments);
  - transaction categories, follow-ups and summaries;
  - flags for unusual activity (large refunds, many manual payments, overnight changes), which staff resolve or
    dismiss with a note.
- **Finance Settings & Compliance:** GST registration, price entry, basis, BAS period, quote validity, deposit %,
  footer.
  - A compliance review covering ABN, GST, invoices, reconciliation, payments, records, privacy and flags.
  - The ruleset and its sources are listed.
  - Finance audit trail (owners and admins).

### Platform finance (Founder Console > Billing & usage > Plan prices, renewals & revenue)
- **Plans:** plan prices are versioned (`plan_price_history`).
  - Every price change is a Level 3 platform approval.
  - Increases need 30 days' notice, and subscribers are told automatically.
  - A change applies on its date, only if the price has not changed since it was proposed.
- **Subscription changes (Plans & Usage > Change Plan):** upgrades apply now and the rest of the month is charged
  once on the next monthly invoice. Downgrades apply at the next billing month and can be cancelled.
- **Renewals and trials:** next renewal date and total, trials ending within 14 days, and scheduled changes.
- **Payment failures:** a dunning case opens for each failed payment or overdue invoice.
  - Owners are reminded on days 0, 3, 7 and 14, and the case closes itself when paid.
  - After 21 days restriction is suggested, but the decision stays with the operator.
- **Revenue:** MRR, ARR, unpaid invoices, failed payments, and monthly collected amounts (ex GST), GST, amounts
  invoiced, upgrades and downgrades.

### Payment architecture
- Customer payments stay on each business's own provider account. A test sets a platform key and checks it is never
  used.
- No wallet or stored balance.
- Stripe Billing is recommended for platform subscriptions. Stripe Connect is evaluated for customer payments
  (direct charges, connected accounts as merchant of record). Neither has been adopted without the owner's approval.

## Existing bugs fixed
- **Partial refunds were counted again on every webhook.** Stripe's `charge.refunded` reports the running total
  refunded. The handler subtracted that whole total from the job each time, so a second partial refund (or a repeated
  message) took money off twice. Payments now record `refunded_cents`, and only the increase is applied.
- **A route name clashed.** The planned `/api/saas/finance/overview` already existed (the Phase 04 ledger). The new
  overview is `/api/saas/finance/hub`, and the old route is unchanged.

## Tests

| Suite | Result |
|---|---|
| `scripts/finance.test.mjs`: 6 tests (rules; documents, deposits, payment link, receipts; credit notes and refunds; reconciliation; reports, flags, compliance, AI drafts, tenancy; platform billing) | 6/6 |
| `npm run test:finance-ui`: 11 browser checks, including axe and phone/iPad fit, and the Founder Console | 11/11 |
| Full suites | see the PR description |

## New settings
- `STRIPE_API_BASE_URL` (tests only; leave unset in production).

## Follow-ups (owner)
- T-057: live Stripe test-mode check (payment, partial refund, full refund) with a business's test keys.
- COMPLIANCE_REVIEW.md items 1 to 8, especially a tax agent's review of the ruleset and of Super Pro's own platform
  invoice template.
- Decide whether to migrate platform subscriptions to Stripe Billing, and later customer payments to Connect.
