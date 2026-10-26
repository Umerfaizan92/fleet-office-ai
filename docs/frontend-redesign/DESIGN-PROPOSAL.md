# Shared design proposal

One visual system for the public site, the business workspace, and the operator console. The product already presents itself as a black and champagne-gold office. This proposal tightens that system. It does not introduce a second brand, a component framework, or a new font stack that the pages do not already load.

Apply it by editing the existing stylesheets, starting with the shared tokens in `saas/brand.css`, then the portal shells, then each screen in `IMPLEMENTATION-CHECKLIST.md`. Do not restyle by forking a parallel CSS file with a new name. The quality gate rejects obsolete `v11`–`v16` stylesheet names.

## Colour

Canonical tokens. Later phases should delete the duplicate `:root` blocks in `saas/app.css` and `office/office-theme.css` only after every screen reads these names.

| Token | Dark | Light | Use |
|---|---|---|---|
| `--ink` | `#07080b` | `#f4f6f9` | Page background |
| `--panel` | `#11161e` | `#ffffff` | Cards, dialogs, sidebars |
| `--panel-2` | `#171d27` | `#f8f9fb` | Nested wells, table stripes |
| `--line` | `#2a3140` | `#e2e6ec` | Hairline borders, 1px |
| `--text` | `#f6f3ea` | `#141820` | Body and headings |
| `--muted` | `#a39e90` | `#5c6573` | Secondary text. Current dark muted `#858f9f` is 6.03:1 and can stay if this warmer muted is checked the same way |
| `--gold` | `#d9ad59` | `#875f26` | Accents, focus, large labels |
| `--gold-hi` | `#f3d17f` | `#6f4e18` | Hover and highlights |
| `--on-gold` | `#07080b` | `#ffffff` | Text on gold fills |
| `--good` | `#64d7a1` | `#1f7a4d` | Ready, paid, verified |
| `--wait` | `#f1c16e` | `#8a5a10` | Pending, expiring |
| `--bad` | `#ff827a` | `#b42318` | Failed, locked, rejected |
| `--info` | `#9cc4f5` | `#1d4f86` | Links and neutral status |

Measured contrast on the current sheets (WCAG relative luminance):

| Pair | Ratio | Note |
|---|---|---|
| `#f6f3ea` on `#07080b` | 18.05:1 | Body text, dark theme, passes |
| `#d9ad59` on `#07080b` | 9.61:1 | Gold on ink passes, including normal text |
| `#d9ad59` on `#11151c` | 8.77:1 | Gold on panel passes |
| `#07080b` on `#d9ad59` | 9.61:1 | Primary button label passes |
| `#858f9f` on `#090b0f` | 6.03:1 | Current muted passes AA |
| `#a9782f` on `#f4f6f9` | **3.58:1** | Current light-theme `--brand` fails AA for normal text |
| `#875f26` on `#f4f6f9` | 5.25:1 | Proposed light gold passes AA |

Rules:

- Gold is the accent, not the body colour. In light mode, text that is currently `--brand` / `#a9782f` moves to `#875f26` or to `--text`.
- Status is an icon or word plus colour. Do not rely on green/amber/red alone.
- Tenant branding (`branding-primary-color`, `branding-secondary-color`) still overrides the workspace accent after save. The shell chrome (navigation, focus, danger) stays on the product tokens so a tenant colour cannot wipe out focus rings.
- Operator console uses the same tokens and does not get a second palette. The word “Operator” in the sidebar kicker is what separates it.

## Typography

Keep the faces already declared in `saas/brand.css`.

| Role | Family | Size | Weight |
|---|---|---|---|
| Marketing display | Bodoni Moda, then Didot, Playfair, Georgia | `clamp(2.2rem, 4.4vw, 3.6rem)` | 500 |
| App and office headings | Manrope | 1.5rem page, 1.125rem panel | 650 |
| Body | Manrope, then the system UI stack | 1rem / 1.5 line-height | 450 |
| Labels, kickers | Manrope | 0.75rem, tracking 0.06em, uppercase | 650 |
| Tables and meta | Manrope | 0.875rem | 450 |

Do not set a third family on individual pages. `worker-onboarding.html` currently inlines Inter. Move it onto Manrope when that screen is in sequence.

Numerals in money, trial days, and KPIs use `font-variant-numeric: tabular-nums`.

## Spacing and shape

Keep the existing 4px scale: 4, 8, 12, 16, 24, 32, 48.

| Surface | Padding | Radius |
|---|---|---|
| Page content | 24px, 16px under 720px | — |
| Panel | 16px | 12px (`--radius-sm`) |
| Marketing card | 24px | 18px (`--radius`) |
| Control (input, button) | 12px 14px | 10px |
| Dialog | 24px | 18px |
| Icon button | 40×40 hit area | 10px |

The workspace sidebar stays 288px (`#workspace` already sets `--sidebar-w: 288px`). The office sidebar matches it. Content max width on marketing pages stays the current measure. Workspace content uses the full shell so tables do not gain a new centred column.

Gaps inside a form stack are 12px. Gaps between panels are 16px. Page heading to first panel is 24px.

## Navigation

Both portals share the same shell anatomy: mark, name, role, grouped navigation, one primary action, account/lock.

**Public site** (`saas/index.html`) keeps the current pane model. The header links Overview, Benefits, Capabilities, Industries, Plans, Security, Install & more, Answers, Sign in, Become a member. `public-stage.js` shows one pane at a time. Do not turn panes into separate URLs.

**Workspace** keeps the six domains from `saas/workspace-nav.js`. That file is the only place view names are defined. Do not hard-code a second menu.

| Domain | Hash | Items |
|---|---|---|
| Today | `#today/home` `#today/assistant` `#today/approvals` | Home, AI Assistant (senior), Approvals |
| Customers & Work | `#customers/list` `#customers/stock` `#customers/inbox` `#customers/jobs` | Customers, Stock, Inbox, Jobs |
| People | `#people/workers` `#people/staff` `#people/hiring` | Workers, Staff (owner), Hiring (owner, admin) |
| Marketing & Channels | `#marketing/studio` `#marketing/growth` `#marketing/search` `#marketing/connections` | Studio, Growth, Search, Connections |
| Money | `#money/ledger` `#money/billing` | Profit (finance roles), Plans (finance roles) |
| Setup & Trust | `#setup/settings` `#setup/import` `#setup/print` `#setup/trust` `#setup/help` `#setup/manual` | Brand, Import, Print (owner), Trust, Help, Manual |

Finance roles: `owner`, `admin`, `super_admin`. Senior roles: those plus `manager`, `director`. Legacy hashes (`#finance`, `#operations/inbox`, and the other aliases in `workspace-nav.js`) must keep resolving.

The top bar keeps search (`⌘K`), tour, user manual, notifications, theme, profile, and sign out. Mobile keeps the existing menu button and scrim. Domain menus stay buttons with `aria-expanded` and Escape-to-close, which the nav script already implements.

**Operator console** keeps all 24 `data-view` buttons and the `show(name)` switch in `office/office.js`. Group them visually into six clusters so the console matches the workspace, without merging the apps or changing view ids:

| Cluster | Views |
|---|---|
| Today | dashboard, inbox, approvals, officeai |
| Customers & work | enquiries, customers, quotes, bookings, jobs |
| Money | expenses, performance, subscribers, subpay |
| Marketing | content, campaigns, connections, searchvisibility, website |
| Records | records, aiquality, receptionist |
| Desk | staffchat, help |

A “← Super Pro workspace” link stays at the top. Lock office still clears `fp-admin-key` and returns to `/saas/sign-in.html#operator`.

## Components

Restyle the existing class names. Do not rename them in the first pass (`primary-button`, `secondary-button`, `panel`, `form-grid`, `table-wrap`, `auth-message`, `nav-item`, `view`).

| Component | Behaviour to keep | Visual rule |
|---|---|---|
| Primary button | `type` and submit handlers unchanged | Gold fill, ink label, 40px min height |
| Secondary button | | Transparent fill, 1px `--line`, text colour |
| Quiet / text button | Sign out, Lock | No fill until hover |
| Text field | `name`, `autocomplete`, `required` unchanged | 40px, `--panel-2` fill, `--line` border, gold focus ring |
| Select and textarea | | Same as text field |
| Table | Server-rendered rows stay as they are | Sticky header, row hover using `--panel-2`, numeric columns right-aligned |
| Dialog | `showModal` / `modal-queue.js` | Existing ids. Cancel on `method="dialog"` forms keeps `formnovalidate` or `type="button"` |
| Toast `#notice` | `aria-live="polite"` | Top of the content column, not a new corner library |
| Badge | Role, trial, channel | Text plus colour. Role badge copy comes from `SuperProNav.setRoleBadge` |
| Empty state | | One sentence and the real action button already on the page |
| Kicker | | Uppercase muted label above the H1. One per view |

Marketing-only pieces (hero, plan cards, product-guide card) may keep the larger radius and the display face. App and office views do not use the marketing tilt or ambient blobs.

## Accessibility

- Target WCAG 2.2 AA for colour, focus, and name/role/value.
- Focus ring: 2px `--gold-hi` offset 2px on every button, link, input, summary, and tab. Replace outline removal that is not paired with a replacement ring.
- Hit targets stay at least 40×40, including the public mobile menu, icon buttons, and the pay-page actions.
- Dialogs opened through `modal-queue.js` keep focus trap and restore. New dialogs use `<dialog>` and that queue.
- Icon-only controls keep an `aria-label` (sidebar close, search, tour, notifications, theme, voice). The public guide’s speaker and clear buttons should gain text labels during the marketing pass. Their ids (`voice-output`, `clear-chat`, `voice-input`) stay.
- Live regions that already exist stay: `#notice`, `#auth-message`, `#join-status`, `#ap-msg`, `#operator-message`, `#voice-status`, `#install-status`, pay card `aria-live`.
- Forms keep associated `<label>` or `aria-label`. Do not switch to placeholder-only labels.
- `lang="en"` stays. The product guide’s language detection is behaviour, not styling.

## Motion

One motion curve: `--ease-out: cubic-bezier(.22, 1, .36, 1)`, 180ms for menus, panels, and dialogs. 80ms for colour and border on controls.

Allowed motion:

- Domain menu open and close (opacity and translate 4px).
- Dialog fade.
- Progress and upload bars.
- A single 8px status dot pulse on “session active” and the marketing availability dot.

Not allowed in the app or office shells:

- Card tilt (`--tilt-max` in `brand.css`). Confine any tilt to the marketing hero, or remove it.
- Hover transforms on navigation rows. `workspace-nav.css` already disables those under reduced motion. Make the default hover a background change for everyone.
- Infinite glow on panels.

Global rule, added once in `brand.css` and not re-implemented per file:

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}
```

The partial reduced-motion blocks in `workspace-nav.css`, `workspace-finance.css`, `workspace-gadgets.css`, and `workspace-growth.css` can remain until this global rule is in place and checked.

## What this proposal does not change

Copy, prices, plan names, role gates, hash paths, field names, and which button calls which endpoint. Tenant-uploaded logos and chosen colours still render. The operator console stays a separate page from the workspace.
