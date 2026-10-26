# Implementation checklist

Work top to bottom. Each box is one screen or one shared layer. Check it only after that screen uses the proposal in [DESIGN-PROPOSAL.md](./DESIGN-PROPOSAL.md), still calls the endpoints in [INTERACTION-MAP.md](./INTERACTION-MAP.md), and `npm test` passes.

Do not start a screen by rewriting its script. Change CSS and, where the proposal needs it, wrapper markup. Keep ids, names, and `data-*` bindings listed in [ROUTE-INVENTORY.md](./ROUTE-INVENTORY.md).

Base: `468e366ff4d80f58241b1e5ce7da7a9d924e3fe2`.

## 0. Shared layer

- [x] Tokens in `saas/brand.css` match the proposal (dark and light, accent text at or above 4.5:1)
- [x] `saas/app.css` and `office/office-theme.css` read those tokens instead of a second gold
- [x] Global `prefers-reduced-motion` rule
- [x] Focus ring on buttons, links, inputs, summaries, tabs
- [x] Primary, secondary, and quiet buttons
- [x] Fields, selects, textareas
- [x] Panels, tables, dialogs, toasts, badges
- [x] `premium-ui.css` follows the same tokens (it loads on both portals)

## 1. Public marketing — `/saas/`

- [x] Header, mobile menu, pane switch (`overview`, `why`, `capabilities`, `industries`, `plans`, `security`, `more`)
- [x] Hero and product guide (`#chat-form`, voice controls, satisfaction, conversion)
- [x] Benefits, capabilities, industries
- [x] Plans and plan links (`?plan=`)
- [x] Security and journey
- [x] Install (`#install-superpro` and the three help states)
- [x] Referrals, answer preview, final CTA
- [x] Newsletter form
- [x] Footer
- [x] Answer Center `/saas/answers.html`

## 2. Legal pages

- [x] Privacy
- [x] Terms
- [x] Trust Center
- [x] Complaints
- [x] Policy Center
- [x] Connected services (subprocessors)
- [x] Support widget on these pages

## 3. Authentication

- [x] Create account (all fields, address suggestions, plan radios, disabled-until-ready submit)
- [x] Verify account (email code, SMS code, both resend buttons, delivery status)
- [x] Sign in, member tab (remember email, MFA details, pending verification)
- [x] Sign in, operator tab (`#operator`, fields `key` and `code`, `code_required` label)
- [x] Recover account (three forms and the revealed-email card)
- [x] Join team
- [x] Hidden workspace `#welcome` shell still redirects to the real create-account page

## 4. Tokenised public flows

- [x] Worker onboarding (profile, requirements, documents, skills, submit). Keep `LIMITED ACCESS`
- [x] Job application
- [x] Pay invoice (no card fields added)
- [x] Payment thanks

## 5. Workspace shell — `/saas/workspace.html`

- [x] Sidebar, six domain menus, role hiding, badges, mobile scrim
- [x] Business switcher and trial card
- [x] Top bar: search, tour, manual, notifications, theme, profile, sign out
- [x] Flow previous / next
- [x] Staff chat drawer
- [x] MFA dialog
- [x] Legal acceptance gate
- [x] Voice bar
- [x] Support drawer
- [x] Notice toast and platform notices

## 6. Workspace views

Today:

- [x] Home & AI Command `#today/home`
- [x] AI Assistant `#today/assistant`
- [x] Approvals `#today/approvals` (queue, history, policy, new request)

Customers & work:

- [x] Customers `#customers/list` and `#cust-dialog`
- [x] Stock `#customers/stock` and both stock dialogs
- [x] Inbox `#customers/inbox` including draft, save customer, close
- [x] Jobs `#customers/jobs`, job form, offers, `#jobmedia-dialog`

People:

- [x] Workers `#people/workers` (profile form, compliance, documents, skills, invite)
- [x] Staff accounts `#people/staff` and `#team-invite-dialog`
- [x] Hiring `#people/hiring`

Marketing:

- [x] Content studio `#marketing/studio` (spec form, library, trends)
- [x] Growth `#marketing/growth`
- [x] Search `#marketing/search`
- [x] Connections `#marketing/connections` (`#integration-self-service` still once)

Money:

- [x] Profit & payments `#money/ledger` (overheads, entries, CSV, payment requests, receipts)
- [x] Get-paid pad and saved cards
- [x] Plans & billing `#money/billing` (trial, add-ons, authorise, withdraw)

Setup & trust:

- [x] Brand & settings `#setup/settings` (all eight settings sections, logo upload, colours, regulatory check, AI design)
- [x] Import `#setup/import` (preview and commit)
- [x] Print & export `#setup/print`
- [x] Trust `#setup/trust` (policies, cases, privacy, account deletion)
- [x] Help `#setup/help`
- [x] User manual `#setup/manual`

Legacy hashes still resolve after the shell change (spot-check `#finance`, `#operations/inbox`, `#dashboard`).

## 7. Operator console — `/office/`

- [x] Sign-in redirect and hidden key form still work
- [x] Sidebar grouped visually, all 23 `data-view` values unchanged
- [x] Top shortcuts: copilot, staff chat, help, refresh, lock
- [x] Overview
- [x] Unified Inbox and conversation detail
- [x] Approvals
- [x] Enquiries and `#detail`
- [x] Customers and history detail
- [x] Quotes, editor, date proposals
- [x] Bookings
- [x] Job completion and `#job-detail`
- [x] Expenses & profit
- [x] Performance centre
- [x] Content studio
- [x] Campaigns
- [x] Connections and channel metrics
- [x] Records & archive, including history import
- [x] Office AI co-pilot panel
- [x] AI quality loop
- [x] Subscribers (plan, payment, follow-up rows)
- [x] Get paid (provider settings)
- [x] Staff chat
- [x] Help & governance
- [x] AI receptionist settings
- [x] Website status and newsletter list
- [x] SEO · GEO · AEO (do not fire IndexNow against production)

## 8. Close-out

- [x] `npm test` passes on the redesign branch
- [x] `npm run integration:test` and `npm run smoke:test` pass
- [x] `scripts/audit-ui.mjs` still reports no dead controls
- [x] Light and dark checked on marketing, workspace shell, and office shell
- [x] Keyboard spot check: Tab on sign-in shows a 2px focus ring; Escape closes the customer dialog
- [x] Reduced-motion control sets `data-motion="reduce"` on marketing and the workspace
- [x] No production host, message, or payment was used

Checked after the shared skin was on these screens, the sampled workspace calls were the existing finance, billing, approvals and customer endpoints, and `npm test` passed 73/73. The operator console has 23 `data-view` values; an earlier “24” was a miscount of this list.

Browser checks that are still limited are written up in the verification summary: spoken playback had no installed voices, UI file upload was not clicked, browser zoom was a narrow viewport rather than a browser zoom command, and the product-update dialog is the existing release note.
