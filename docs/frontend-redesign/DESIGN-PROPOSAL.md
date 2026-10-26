# Shared design proposal

One visual system for the public site, the business workspace, and the operator console. The product look is deep navy and charcoal, with a restrained steel accent and a readable light theme. It does not introduce a second brand, a component framework, or a new font stack.

Apply it in the existing stylesheets. `saas/brand.css` holds the tokens. `saas/premium-ui.css` loads last on every HTML page and carries the shared skin, including the operator console. Do not add a parallel CSS file. The quality gate rejects obsolete `v11`–`v16` stylesheet names.

## Colour

`--gold` and `--gold-hi` stay as legacy names. They alias `--brand` and `--brand-2`, so a saved tenant colour still recolours accents. The product default is steel in the dark theme and navy in the light theme. Focus rings use `--sp-focus`, which a tenant colour does not replace.

| Token | Dark | Light | Use |
|---|---|---|---|
| `--bg` / `--ink` | `#0e141c` | `#f4f6f8` | Page background |
| `--panel` | `#17202b` | `#ffffff` | Cards, dialogs, sidebars |
| `--panel-2` | `#1c2733` | `#f7f9fb` | Nested wells, table headers |
| `--line` | `#2c3a4a` | `#d5dee8` | Hairline borders, 1px |
| `--text` | `#f4f7fb` | `#15202b` | Body and headings |
| `--muted` | `#b7c2ce` | `#4e6072` | Secondary text |
| `--brand` | `#9ec0db` | `#1e4f78` | Accent, primary buttons, active navigation |
| `--on-brand` | `#0e141c` | `#ffffff` | Text on a primary button |
| `--sp-focus` | `#d5e6f3` | `#1e4f78` | Keyboard focus ring |
| `--green` | `#8ee0b8` | `#0f6b45` | Ready, paid, verified |
| `--amber` | `#f0d59a` | `#8a5a10` | Pending, expiring |
| `--red` | `#ffb4ae` | `#b42318` | Failed, locked, rejected |
| `--blue` | `#9ec0db` | `#1a4f86` | Links and neutral status |

Measured contrast for the pairs above is at least 4.5:1 for normal text, including light-theme navy `#1e4f78` on `#f4f6f8` and muted `#4e6072` on white. The previous light gold `#a9782f` on `#f4f6f9` was 3.58:1 and is no longer the accent.

Rules:

- The accent is for actions, focus, and status, not for large areas of body text.
- Status is a word plus colour. Do not rely on green, amber, or red alone.
- Tenant branding (`branding-primary-color`) still overrides `--brand` after a real change. The untouched colour picker is not saved. `--on-brand` is chosen from the relative luminance of that colour so the label stays readable. Focus rings stay on `--sp-focus`.
- The operator console uses the same tokens. Its sidebar label is what separates it from the business workspace. `PLATFORM_DEFAULT_PRIMARY` stays `#f59e0b` so an untouched workspace is not stored as a custom colour.

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
| Primary button | `type` and submit handlers unchanged | `--brand` fill, `--on-brand` label, 40px min height |
| Secondary button | | Transparent fill, 1px `--line`, text colour |
| Quiet / text button | Sign out, Lock | No fill until hover |
| Text field | `name`, `autocomplete`, `required` unchanged | 40px, `--panel-2` fill, `--line` border, `--sp-focus` ring |
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
- Focus ring: 2px `--sp-focus` offset 2px on every button, link, input, summary, and tab. Replace outline removal that is not paired with a replacement ring.
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

Global rule, added in `brand.css` and repeated for the operator console in `premium-ui.css`. The same declarations also apply when `html[data-motion="reduce"]` is set:

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

A “Reduce motion” control next to the theme switch stores that choice in `localStorage` key `foai-motion`. Card tilt is off. The logo orbit moves only while speech synthesis is actually speaking (`superpro:speaking`). Listening and speaking styles use the existing `.is-listening`, `.listening`, and `data-state` hooks. They do not pretend a capability exists.

Marketing carousels keep manual previous, next, and dot controls, plus arrow keys. Plan cards are not a carousel, so prices and join actions stay in the page. There is no autoplay.

The partial reduced-motion blocks in `workspace-nav.css`, `workspace-finance.css`, `workspace-gadgets.css`, and `workspace-growth.css` can remain. The global rule covers them.

## What this proposal does not change

Copy, prices, plan names, role gates, hash paths, field names, and which button calls which endpoint. Tenant-uploaded logos and chosen colours still render. The operator console stays a separate page from the workspace.
