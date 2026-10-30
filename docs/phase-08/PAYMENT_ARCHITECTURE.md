# Payment architecture review (Phase 08)

This review is about which Stripe products fit which money flow in Super Pro. It was written from Stripe's public
documentation and the current code. It is not legal advice. Before changing how money moves, confirm the regulatory
points with a payments lawyer.

## Two different money flows

| Flow | Who pays whom | Merchant of record | What Super Pro does today |
|---|---|---|---|
| Platform subscriptions | A business pays Super Pro for its plan | Super Pro | Monthly platform invoices (billing-ops). Paid by a Stripe or Square checkout on Super Pro's own account (platform-pay), or recorded by the operator. |
| Customer payments | A business's customer pays that business for a job | The business | Each business connects **its own** Stripe or PayPal account (keys encrypted at rest), or shows its own bank details. Checkout sessions, refunds and webhooks use that business's keys. |

These two flows must never mix. A customer's payment must never land in a Super Pro account and then be passed on.
If it did, Super Pro would be holding other people's money (see "No wallet" below).

## Stripe Billing: platform subscriptions (recommended next step)

Stripe Billing (Products, Prices, Subscriptions, Invoices, Smart Retries, Customer Portal) fits the platform flow:

- Plan prices map to Stripe Prices. A price change creates a new Price, and the old one stays on existing
  subscriptions until they are moved. That matches Phase 08's versioned plan prices (`plan_price_history`).
- Proration on upgrades and "change at period end" on downgrades are built in. Phase 08 computes the same thing
  itself (`subscription_change_requests`) so that the behaviour is already defined.
- Smart Retries and dunning emails cover failed payments. Phase 08's dunning cases (`platform_dunning`) record the
  same states, so they can be driven by Billing webhooks later (`invoice.payment_failed`, `invoice.paid`,
  `customer.subscription.updated`).
- Billing sends tax invoices from Super Pro's own Stripe account. The invoice settings must show Super Pro's ABN and the
  words "Tax invoice", and amounts must be GST-inclusive with GST shown.

**Status:** not migrated. The current monthly platform invoices keep working. A move to Billing is a change to
infrastructure and payments, so it needs the owner's approval and a tested migration plan. That plan needs: a
mapping from each existing plan to a Price; migrating active subscribers at their next period start; and running the
two systems side by side for one billing cycle.

## Stripe Connect: customer payments (evaluate; not adopted yet)

Stripe describes two Connect models ([SaaS platforms and marketplaces](https://docs.stripe.com/connect/saas-platforms-and-marketplaces)):

- **SaaS platform:** the connected account (the business) is the merchant of record and is charged directly
  ("direct charges"). Stripe collects its fees from the business. The platform pays no Connect fees when Stripe sets
  the pricing, and can take an application fee.
- **Marketplace:** the platform is the merchant of record. Funds go through the platform ("destination" or
  "separate charges and transfers"), and the platform is responsible for negative balances.

Super Pro is a SaaS platform. Its businesses sell their own services to their own customers. If Connect is adopted,
the right shape is:

- connected accounts using the **full Stripe Dashboard** (Standard-style), onboarded through Stripe-hosted OAuth or
  onboarding;
- **direct charges** on the connected account;
- Stripe collects its fees from the connected account, and Stripe holds negative-balance liability (Managed Risk);
- no destination charges, separate charges and transfers, or platform-held balances.

What Connect would improve over today:

- Businesses stop pasting secret API keys into Super Pro. Stripe holds the link, and access can be revoked from
  either side.
- Stripe does the business identity checks.
- Super Pro could take an application fee if that were ever wanted (not planned).

What stays the same: money goes straight from the customer to the business's Stripe balance and then to its bank.

**Status:** not adopted. Today's per-business keys already make the business the merchant of record with direct charges
on its own account, so they meet the requirement that "customer payments are not routed through platform-owned
accounts". A move to Connect needs the owner's approval, a Connect platform application with Stripe, and a migration
that lets each business connect at its own pace while its existing keys keep working.

## Routing controls in the code

- `src/payments.js`: every customer-payment call (`checkout/sessions`, `refunds`, saved cards) uses the business's own
  encrypted key from `payment_settings`. Super Pro's own provider keys are entered separately in the Founder Console
  (`platform-pay.js`) and are used only for Super Pro's own invoices. The environment variable `STRIPE_SECRET_KEY` is
  only checked for readiness reporting and is never used to charge a business's customers.
- `scripts/finance.test.mjs` asserts this. It sets a platform key and checks that customer checkouts and refunds use
  the business key and never the platform key.
- Webhooks are per business (`/api/webhooks/payments/stripe/:orgId`) and verified with that business's own signing
  secret.
- Refunds are Level 3 approvals. They are sent only to the business's own Stripe account, each with an idempotency key
  (`sp-refund-<id>`). Bank and PayPal refunds are paid by the business and then recorded.

## No wallet or stored value

Super Pro keeps no balance, credit or prepaid value for any business or customer, and offers no account to top up or
transfer money between users. Holding funds like that can make a business a stored-value or payment service provider
that needs licensing in Australia ([Council of Financial Regulators: stored-value facilities](https://www.cfr.gov.au/publications/policy-statements-and-other-reports/2020/regulation-of-stored-value-facilities-in-australia/pdf/report.pdf)).

- Credit notes reduce what a customer owes on an invoice. They are not a spendable balance.
- An overpayment shows as "refund due". It is not kept on account.
- "Transfers" stay a manual Level 3 action that the business carries out in its own bank. Paying a new payee is a
  restricted action that Super Pro always refuses.
