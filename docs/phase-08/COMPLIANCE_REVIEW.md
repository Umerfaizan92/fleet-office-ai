# Compliance review items (Phase 08)

These are the points the owner (and ideally a registered tax agent or lawyer) should confirm before relying on Super
Pro's finance features. They are not legal or tax advice. Super Pro applies the published rules in `src/finance/rules.js`
(ruleset `AU-2026.10`, reviewed 2026-10-30 by engineering, not by a tax agent).

## Built and tested

| Area | What Super Pro does | Source |
|---|---|---|
| Tax invoices | Before an invoice can be issued, it is checked for: the words "Tax invoice", the seller's name and ABN, the date, a description, quantity and price for each item, the GST amount (or "Total price includes GST" when GST is exactly 1/11), and which items are taxable. Sales of $1,000 or more (GST-inclusive) must show the buyer's identity or ABN. | [ATO: tax invoices](https://www.ato.gov.au/businesses-and-organisations/gst-excise-and-indirect-taxes/gst/tax-invoices) |
| Not registered for GST | The document says "Invoice" (not "Tax invoice") and shows no GST. Invoices cannot be issued until the owner states whether the business is registered. | [ATO: registering for GST](https://www.ato.gov.au/businesses-and-organisations/gst-excise-and-indirect-taxes/gst/registering-for-gst) ($75,000 business / $150,000 non-profit) |
| ABN | Checked with the ABR check-digit method. A valid check digit does not prove the ABN is active; owners should use ABN Lookup. | [ABR: ABN format](https://abr.business.gov.au/Help/AbnFormat) |
| Adjustment notes | Issued invoices cannot be changed or deleted; they can only be corrected with an adjustment (credit) note. The note refers to the original invoice, gives a reason and shows the GST effect. It needs Level 3 approval. The app notes the $75 GST threshold below which a note is not required. | [ATO: adjustment notes](https://www.ato.gov.au/businesses-and-organisations/gst-excise-and-indirect-taxes/gst/completing-your-bas-for-gst/making-adjustments-on-your-activity-statements/adjustment-notes), GSTR 2013/2 |
| GST maths | Calculated per line and rounded to the nearest cent. GST-free, input-taxed and not-reportable codes are supported. Prices can be entered with or without GST. | ATO tax invoice page |
| BAS draft | G1, G3, 1A, 1B and net GST, on a cash or accrual basis, marked as a draft to check and lodge through the ATO or a BAS agent. | — |
| Records | Issued invoices, notes and payments cannot be deleted in the app. Every finance action is written to the hash-chained audit log. Owners are told to keep records for at least 5 years. | [ATO: record keeping](https://www.ato.gov.au/businesses-and-organisations/preparing-lodging-and-paying/record-keeping-for-business/overview-of-record-keeping-rules-for-business/records-to-keep-longer-than-five-years) |
| Refunds and adjustments | Refunds, credit notes and plan price changes are Level 3 approvals that name the person who approved them. Bank and payout changes, and paying new payees, are refused. | — |
| Payments | Customer money goes to the business's own provider account. Super Pro stores no card numbers (Stripe holds them) and no balances. | PAYMENT_ARCHITECTURE.md |
| Privacy | Finance data is scoped to the signed-in organisation; tests show one business cannot read or act on another's documents. Bank details are only shown to finance roles. | [OAIC: small business](https://www.oaic.gov.au/privacy/privacy-for-organisations/small-business) |
| AI | AI-prepared invoices, categories, follow-ups, summaries and flags are labelled as Super Pro suggestions and need a person to confirm them. No AI output changes a tax rule or issues a document by itself. | — |

## Review items for the owner

1. **Tax agent review of the ruleset.** Have a registered tax agent review `AU-2026.10`, in particular the invoice
   fields, the $1,000 and $82.50 thresholds, the adjustment note contents and the BAS draft labels. Record the review
   as a new ruleset version (`reviewed_by`), not by editing the existing one.
2. **Super Pro's own tax invoices.** Platform invoices come from `billing-ops.js` and add 10% GST. Confirm Super Pro is
   registered for GST and that its ABN (`SUPERPRO_ABN`) appears on those invoices. The current platform invoice
   template predates Phase 08 and should be checked against the same rules.
3. **Price increase notice.** Phase 08 requires 30 days' notice to existing subscribers before a price increase
   (`PRICE_POLICY`). That is a Super Pro policy, not a legal threshold. Check the subscriber terms (and the unfair
   contract terms rules) for the notice actually promised.
4. **Privacy Act coverage.** Decide whether Super Pro is covered by the Privacy Act (turnover above $3 million, or an
   exception applies) and make sure the privacy policy covers finance data, including bank statements imported for
   reconciliation.
5. **Bank statement retention.** Imported bank lines are kept so the reconciliation can be audited. Decide how long to
   keep them and add that to the retention policy.
6. **Late fees and debt recovery.** Late fees already exist (Phase 04) and need the owner's acknowledgement. The
   follow-up suggestions mention debt recovery options only in general terms. Check any wording before it is sent to a
   customer.
7. **Live provider evidence.** Stripe was tested against a local stand-in, not the live API. Run one real test-mode
   payment, one partial refund and one full refund with a business's test keys before relying on them (task T-057).
8. **Stripe Billing and Connect decisions.** See PAYMENT_ARCHITECTURE.md. Neither has been adopted, and each needs the
   owner's approval and a tested migration.
