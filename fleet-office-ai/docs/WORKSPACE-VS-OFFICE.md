# Member workspace (/saas) vs operator office (/office)

- **/office/** is the platform operator console (admin key, owner only): subscribers, invoicing, Get paid (Stripe/PayPal/Square/Zeller/bank + failover), connections readiness, follow-up emails, SEO/AI-search check, audit.
- **/saas/workspace.html** is the tenant workspace for each subscribing business (sign-in, roles, MFA, legal acceptance): customers, jobs, workers, money, stock, comms, growth, approvals.
- Kept separate on purpose: tenant users must never reach operator functions. Operator data is never exposed in the workspace, and tenant routes are isolated by organisation_id.
- Legacy admin-key features not copied into the tenant workspace (quotes, bookings, expenses/profit, performance): the workspace already has Jobs, Money (profit per job, costs & overheads) and Customers equivalents. Anything still missing is a feature request, not a broken link.
- Human approval: AI drafts (follow-ups, invoices, replies) wait in an approval queue; nothing is sent without a person approving.
