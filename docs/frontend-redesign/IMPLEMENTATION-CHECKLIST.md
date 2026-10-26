# Implementation checklist

Work top to bottom. Each box is one screen or one shared layer. Check it only after that screen uses the proposal in [DESIGN-PROPOSAL.md](./DESIGN-PROPOSAL.md), still calls the endpoints in [INTERACTION-MAP.md](./INTERACTION-MAP.md), and `npm test` passes.

Do not start a screen by rewriting its script. Change CSS and, where the proposal needs it, wrapper markup. Keep ids, names, and `data-*` bindings listed in [ROUTE-INVENTORY.md](./ROUTE-INVENTORY.md).

Base: `468e366ff4d80f58241b1e5ce7da7a9d924e3fe2`.

## 0. Shared layer

- [ ] Tokens in `saas/brand.css` match the proposal (dark and light, including light gold at or above 4.5:1)
- [ ] `saas/app.css` and `office/office-theme.css` read those tokens instead of a second gold
- [ ] Global `prefers-reduced-motion` rule
- [ ] Focus ring on buttons, links, inputs, summaries, tabs
- [ ] Primary, secondary, and quiet buttons
- [ ] Fields, selects, textareas
- [ ] Panels, tables, dialogs, toasts, badges
- [ ] `premium-ui.css` follows the same tokens (it loads on both portals)

## 1. Public marketing — `/saas/`

- [ ] Header, mobile menu, pane switch (`overview`, `why`, `capabilities`, `industries`, `plans`, `security`, `more`)
- [ ] Hero and product guide (`#chat-form`, voice controls, satisfaction, conversion)
- [ ] Benefits, capabilities, industries
- [ ] Plans and plan links (`?plan=`)
- [ ] Security and journey
- [ ] Install (`#install-superpro` and the three help states)
- [ ] Referrals, answer preview, final CTA
- [ ] Newsletter form
- [ ] Footer
- [ ] Answer Center `/saas/answers.html`

## 2. Legal pages

- [ ] Privacy
- [ ] Terms
- [ ] Trust Center
- [ ] Complaints
- [ ] Policy Center
- [ ] Connected services (subprocessors)
- [ ] Support widget on these pages

## 3. Authentication

- [ ] Create account (all fields, address suggestions, plan radios, disabled-until-ready submit)
- [ ] Verify account (email code, SMS code, both resend buttons, delivery status)
- [ ] Sign in, member tab (remember email, MFA details, pending verification)
- [ ] Sign in, operator tab (`#operator`, fields `key` and `code`, `code_required` label)
- [ ] Recover account (three forms and the revealed-email card)
- [ ] Join team
- [ ] Hidden workspace `#welcome` shell still redirects to the real create-account page

## 4. Tokenised public flows

- [ ] Worker onboarding (profile, requirements, documents, skills, submit). Keep `LIMITED ACCESS`
- [ ] Job application
- [ ] Pay invoice (no card fields added)
- [ ] Payment thanks

## 5. Workspace shell — `/saas/workspace.html`

- [ ] Sidebar, six domain menus, role hiding, badges, mobile scrim
- [ ] Business switcher and trial card
- [ ] Top bar: search, tour, manual, notifications, theme, profile, sign out
- [ ] Flow previous / next
- [ ] Staff chat drawer
- [ ] MFA dialog
- [ ] Legal acceptance gate
- [ ] Voice bar
- [ ] Support drawer
- [ ] Notice toast and platform notices

## 6. Workspace views

Today:

- [ ] Home & AI Command `#today/home`
- [ ] AI Assistant `#today/assistant`
- [ ] Approvals `#today/approvals` (queue, history, policy, new request)

Customers & work:

- [ ] Customers `#customers/list` and `#cust-dialog`
- [ ] Stock `#customers/stock` and both stock dialogs
- [ ] Inbox `#customers/inbox` including draft, save customer, close
- [ ] Jobs `#customers/jobs`, job form, offers, `#jobmedia-dialog`

People:

- [ ] Workers `#people/workers` (profile form, compliance, documents, skills, invite)
- [ ] Staff accounts `#people/staff` and `#team-invite-dialog`
- [ ] Hiring `#people/hiring`

Marketing:

- [ ] Content studio `#marketing/studio` (spec form, library, trends)
- [ ] Growth `#marketing/growth`
- [ ] Search `#marketing/search`
- [ ] Connections `#marketing/connections` (`#integration-self-service` still once)

Money:

- [ ] Profit & payments `#money/ledger` (overheads, entries, CSV, payment requests, receipts)
- [ ] Get-paid pad and saved cards
- [ ] Plans & billing `#money/billing` (trial, add-ons, authorise, withdraw)

Setup & trust:

- [ ] Brand & settings `#setup/settings` (all eight settings sections, logo upload, colours, regulatory check, AI design)
- [ ] Import `#setup/import` (preview and commit)
- [ ] Print & export `#setup/print`
- [ ] Trust `#setup/trust` (policies, cases, privacy, account deletion)
- [ ] Help `#setup/help`
- [ ] User manual `#setup/manual`

Legacy hashes still resolve after the shell change (spot-check `#finance`, `#operations/inbox`, `#dashboard`).

## 7. Operator console — `/office/`

- [ ] Sign-in redirect and hidden key form still work
- [ ] Sidebar grouped visually, all 24 `data-view` values unchanged
- [ ] Top shortcuts: copilot, staff chat, help, refresh, lock
- [ ] Overview
- [ ] Unified Inbox and conversation detail
- [ ] Approvals
- [ ] Enquiries and `#detail`
- [ ] Customers and history detail
- [ ] Quotes, editor, date proposals
- [ ] Bookings
- [ ] Job completion and `#job-detail`
- [ ] Expenses & profit
- [ ] Performance centre
- [ ] Content studio
- [ ] Campaigns
- [ ] Connections and channel metrics
- [ ] Records & archive, including history import
- [ ] Office AI co-pilot panel
- [ ] AI quality loop
- [ ] Subscribers (plan, payment, follow-up rows)
- [ ] Get paid (provider settings)
- [ ] Staff chat
- [ ] Help & governance
- [ ] AI receptionist settings
- [ ] Website status and newsletter list
- [ ] SEO · GEO · AEO (do not fire IndexNow against production)

## 8. Close-out

- [ ] `npm test` passes on the redesign branch
- [ ] `npm run integration:test` and `npm run smoke:test` pass
- [ ] `scripts/audit-ui.mjs` still reports no dead controls
- [ ] Light and dark checked on marketing, workspace shell, and office shell
- [ ] A keyboard pass: tab order, focus ring, Escape closes menus and dialogs
- [ ] Reduced-motion pass on the workspace menu and marketing hero
- [ ] No production host, message, or payment was used

Unchecked boxes are not started. Phase 1 leaves every box unchecked on purpose.
