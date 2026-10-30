# Finance and payments

Phase 08 (`src/finance/`):
- Quotes, deposits and tax invoices; GST and adjustment notes; ABN; BAS reports (ruleset AU-2026.10, versioned in
  `rules.js`).
- Stripe payments and refunds; partial-refund fix; credit notes; bank reconciliation; reminders.
- Platform plan prices and proration.

Docs: `docs/phase-08/{REPORT,PAYMENT_ARCHITECTURE,COMPLIANCE_REVIEW}.md`. Tests: finance.test (6), test:finance-ui (11).

A tax agent has not reviewed the rules. A live Stripe test-mode check is pending (T-057). Fake test keys must be built
at run time, or GitHub push protection blocks the push.
