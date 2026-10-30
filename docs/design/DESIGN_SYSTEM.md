# Super Pro design system (Phase 03)

One visual language for the public website, the Business OS (`/saas/workspace.html`) and the Founder Console (`/office/`).
Everything lives in `saas/ds/`. There is no framework and no build step for pages; the only bundle is the optional 3D hero.

## Direction

- **Midnight base, gold accent.** Graphite surfaces with glass depth. Gold is the one action colour (buttons, the approval gate, the current selection). Cyan only ever means *live* or *AI working*. Violet is reserved for data series.
- **Cinematic, but calm.** Motion answers a person's action or tells a story once. Nothing loops forever, everything is skipped when the device asks for reduced motion, and work stops when the page is hidden.
- **Same controls, new look.** Existing pages are re-coloured through variables only (`retheme.css`). No sizes, routes, element IDs or behaviour changed.

## Files

| File | What it is |
|---|---|
| `saas/ds/tokens.css` | Colour, type, spacing, radius, depth and motion tokens, dark and light, plus self-hosted fonts |
| `saas/ds/components.css` | Component library (classes prefixed `sp-`) |
| `saas/ds/icons.svg` | 30 original line icons as an SVG sprite: `<svg><use href="/saas/ds/icons.svg#phone"/></svg>` |
| `saas/ds/motion.js` | Motion engine (`window.SPMotion`): reveal once, count up, pointer light, parallax, scroll story, toast, view entrance |
| `saas/ds/site.js`, `site.css` | Public website behaviour and page layouts |
| `saas/ds/src/hero-3d.mjs` → `hero-3d.js` | Three.js hero scene, bundled by `npm run build:ds` |
| `saas/ds/retheme.css` | Bridge from the older stylesheets to the tokens (loaded last on 22 existing pages) |
| `saas/ds/app-motion.js` | Route-change entrance and live-figure ripple for the Business OS and Console |
| `scripts/site/content.mjs` | All website copy, plans, feature areas, industries, FAQ and help articles |
| `scripts/site/templates.mjs` | Page templates with SEO (canonical, Open Graph, JSON-LD, breadcrumbs, FAQ markup) |
| `src/public-site.js` | Clean public routes, `/start` trial redirect and pre-compressed asset serving |

After editing anything in `saas/ds/` run `npm run build:ds` (rebuilds the 3D bundle and the `.br`/`.gz` copies).
After editing website copy or templates run `npm run build:site`. Tests fail if either is forgotten.

## Tokens

### Colour (dark is the default; light applies with `html[data-theme="light"]`)

| Token | Dark | Light | Use |
|---|---|---|---|
| `--sp-midnight` | #070B14 | #F3F5FA | Page canvas |
| `--sp-graphite-1` | #0F1522 | #FFFFFF | Cards and panels |
| `--sp-graphite-2` | #161E2E | #E9EDF5 | Raised surfaces, inputs |
| `--sp-graphite-3` | #1F2940 | #DCE2EE | Highest surfaces |
| `--sp-line` | #26314A | #CDD5E3 | Borders |
| `--sp-fg` | #EDF1F8 | #0C1424 | Main text |
| `--sp-fg-2` | #C9D1DF | #26324A | Secondary text |
| `--sp-fg-muted` | #95A1B6 | #4B566B | Hints, labels |
| `--sp-gold` | #E6B455 | #8A6408 | Actions, approval gate, selection |
| `--sp-on-gold` | #17120A | #FFFFFF | Text on gold |
| `--sp-cyan` | #43D3F0 | #0B6F8C | Live and AI working, only |
| `--sp-violet` | #9C8CFF | #5B48D6 | Data series only |
| `--sp-good` / `--sp-warn` / `--sp-bad` | #4CC38A / #F0A848 / #F2716B | #1E7A4E / #8F5A0E / #B3312B | Status |

### Contrast (WCAG 2.2 AA needs 4.5:1 for text, 3:1 for large text and controls)

| Pair (dark) | Colours | Ratio |
|---|---|---|
| Body text on canvas | #EDF1F8 on #070B14 | 17.37:1 |
| Body text on card | #EDF1F8 on #0F1522 | 16.11:1 |
| Secondary text on card | #C9D1DF on #0F1522 | 11.88:1 |
| Muted text on canvas | #95A1B6 on #070B14 | 7.55:1 |
| Muted text on raised surface | #95A1B6 on #161E2E | 6.39:1 |
| Gold text on canvas | #E6B455 on #070B14 | 10.33:1 |
| Text on gold button | #17120A on #E6B455 | 9.78:1 |
| Cyan on card | #43D3F0 on #0F1522 | 10.27:1 |
| Good / warning / bad on card | #4CC38A, #F0A848, #F2716B on #0F1522 | 8.24 / 9.04 / 6.39:1 |

| Pair (light) | Colours | Ratio |
|---|---|---|
| Body text on canvas | #0C1424 on #F3F5FA | 16.87:1 |
| Body text on card | #0C1424 on #FFFFFF | 18.40:1 |
| Secondary text on card | #26324A on #FFFFFF | 12.82:1 |
| Muted text on canvas | #4B566B on #F3F5FA | 6.77:1 |
| Muted text on raised surface | #4B566B on #E9EDF5 | 6.30:1 |
| Gold text on card / text on gold | #8A6408 and #FFFFFF | 5.37:1 |
| Cyan on card | #0B6F8C on #FFFFFF | 5.73:1 |
| Good / warning / bad on card | #1E7A4E, #8F5A0E, #B3312B on #FFFFFF | 5.32 / 5.77 / 6.19:1 |

### Type

- Display: **Bodoni Moda** 500/600 (headlines only). Interface: **Manrope** variable 200–800. Both self-hosted from `saas/fonts/`.
- Scale (`--sp-fs-*`): 12, 14, 16 (body), 18, 20, 24, 30, 38, 42–60 (fluid), 48–76 (fluid hero).
- Line height: 1.04 for display, 1.25 for headings, 1.6 for body. Measure: 68 characters.

### Space, shape, depth, motion

- Spacing in 4-point steps: `--sp-1` 4 px … `--sp-10` 128 px; page gutter `clamp(16px, …, 32px)`; content width 1240 px.
- Radius follows hierarchy: controls 10 px, cards 16 px, stages 28 px, pills fully rounded.
- Depth: `--sp-shadow-1` (cards), `--sp-shadow-2` (raised panels), `--sp-shadow-gold` (primary action). Glass uses an 18 px blur.
- Motion: durations 120 / 220 / 420 / 700 ms; easing `cubic-bezier(.16,1,.3,1)` for entrances. All durations become 0 with reduced motion.

## Components (`components.css`)

| Component | Classes | Notes |
|---|---|---|
| Page shell | `.sp-site`, `.sp-page`, `.sp-section`, `.sp-split`, `.sp-cols`, `.sp-skip` | Skip link to `#main` on every page |
| Type | `.sp-display`, `.sp-h1`–`.sp-h3`, `.sp-lede`, `.sp-muted` | One `h1` per page (tested) |
| Navigation | `.sp-nav`, `.sp-nav__toggle` | Sticky glass bar; menu button under 900 px; Escape closes |
| Buttons | `.sp-btn` + `--primary` (gold), `--ghost`, `--quiet`, `--lg`, `.is-loading` | Works on `<a>` and `<button>` |
| Status | `.sp-chip` (`--ai` cyan, `--gate` gold, `--good`), `.sp-live` | Live dot ripples once when a value changes |
| Surfaces | `.sp-glass`, `.sp-card`, `.sp-card--lit`, `.sp-stage` | `--lit` adds a light that follows the pointer (not on touch) |
| Data | `.sp-stat` with `data-count-to` | Counts up once when it appears |
| Loading | `.sp-skel`, `.sp-typing`, `.sp-btn.is-loading` | Skeleton shimmer and typing dots stop with reduced motion |
| Forms | `.sp-field`, `.sp-form-status` (`data-tone="good|bad"`) | Status line is a polite live region |
| Disclosure | `.sp-faq` (native `<details>`), `.sp-tabs` (ARIA tabs, arrow keys) | |
| Feedback | `.sp-toast` via `SPMotion.toast()` | Polite live region |
| Showcase | `.sp-device`, `.sp-feed`, `.sp-plans`, `.sp-plan` | Product device frame with message feed states |
| Icons | `.sp-icon` + sprite | `aria-hidden` unless meaningful |
| Footer | `.sp-footer` | |

## Motion rules

1. One orchestrated moment per page: the hero headline rises in once; sections reveal once with at most a 6 × 70 ms stagger.
2. Motion that answers an action is encouraged: approving in the demo, opening the menu, a live figure changing.
3. Nothing loops forever. The 3D hero renders only while visible and stops 45 s after the last interaction.
4. `prefers-reduced-motion: reduce` removes every animation and shows the still SVG hero; all content stays visible.
5. Route changes in the Business OS and Console fade and rise views in (380 ms) using the Web Animations API.

## 3D hero

- Original scene: incoming cyan signals travel to a glass core, wait at a gold approval ring, then leave gold. It is the product promise ("Your office runs. You approve.") as a picture.
- Loads only after the page has loaded and gone idle, and only on capable devices (4+ cores, WebGL, no data saver, not 2G, motion allowed). Everyone else sees the SVG poster.
- `?force3d=1` forces it on (testing), `?static3d=1` forces it off. Low-quality mode under 760 px or under 4 GB memory.
- Bundle: 544 KB minified, about 140 KB with Brotli, never on the critical path.

## Technology evaluation

| Option | Decision | Reason |
|---|---|---|
| React + TypeScript | Not adopted | The app is a working vanilla-JS monolith; a rewrite would risk every existing button, form and test for no user-visible gain. |
| Tailwind / shadcn | Not adopted | Tokens and `sp-` components give the same consistency without a build step or class-name churn in 22 existing pages. |
| Three.js | **Adopted for the hero only** | Bundled and tree-shaken with esbuild, lazy-loaded, with an SVG fallback. |
| React Three Fiber | Not adopted | Requires React. |
| GSAP / Motion | Not adopted | CSS transitions, the Web Animations API and IntersectionObserver cover every effect used, at zero extra kilobytes. |
| Rive | Not adopted | No designer-made Rive assets yet; worth revisiting for the optional AI avatar. |

## Website

19 pages at clean routes: `/`, `/features` and six feature areas, `/for` and five industries, `/pricing`, `/receptionist`, `/stories`, `/help`, `/contact`. `/start` sends visitors to the existing sign-up page and keeps a chosen plan. The old `/saas/` landing page still works and is re-coloured.

Content rules: every claim matches what the code does today; the receptionist is described as an add-on; testimonials appear only from `saas/content/testimonials.json` entries with `approved: true`, a quote, a name and a business (the file is empty today); example scenarios are labelled as examples.

## Testing

| Command | What it checks |
|---|---|
| `npm run test:unit` (includes `scripts/public-site.test.mjs`) | Generated pages current, compressed assets match, every route 200 with canonical, title, description and one `h1`, `/start` redirect, sitemap, no broken internal links or anchors, icons exist |
| `npm run test:site-ui` | 15 browser checks: AI demo, prompts, approval-gate demo and tabs, newsletter, contact form to support case, receptionist player, help search, phone and desktop menus, plan links, testimonials hidden, reduced motion, reveals, no console errors |
| `npm run test:ui` | The existing 33 Business OS and Console checks |
| `npm run test:visual` | 51 screens (17 pages × 390, 768, 1440) against local baselines, plus sideways-scroll and JavaScript-error checks. `test:visual:update` accepts a new approved look. Baselines are kept out of git (about 14 MB). |
| `npm run report:a11y-perf` | axe-core WCAG 2.2 AA on 16 pages (phone and laptop, dark and light) and throttled mobile Web Vitals; writes `qa/reports/` |

## Results at the end of Phase 03

See `qa/reports/A11Y-PERF.md`, `accessibility.json`, `performance.json`, `visual-regression.json` and the contact sheets `screens-390.jpg`, `screens-768.jpg`, `screens-1440.jpg`.

- Accessibility: the new website, sign-in, sign-up and the Founder Console have **no** axe WCAG A/AA violations, in dark and light themes. No colour-contrast failures remain on any page tested. During this phase light-theme contrast failures went from 22 to 0 on sign-up and from 9 to 0 on the old `/saas/` landing page, and white-on-gold text on website buttons was fixed.
- Remaining items, all in older screens and left unchanged because existing tests and element labels depend on them:
  - Business OS (`label-content-name-mismatch`): the rail button showing "Pin navigation" is labelled "Expand main navigation"; the co-pilot button showing "Ask Super Pro" is labelled "Open Super Pro AI co-pilot"; the five dashboard tiles use a longer summary label than their visible text.
  - Old `/saas/` landing page: the brand link has the same label issue, and on phones the guide chat log is not reachable by keyboard.
- Performance (mobile, 4× CPU slowdown, about 1.6 Mbps, 150 ms latency, best of two cold loads): every new page has LCP 0.7–1.2 s, CLS 0.002 or less and blocking time 34–162 ms, with 92–163 KB transferred (budgets: 2.5 s, 0.1, 200 ms). The old landing page measures LCP 2.6 s, blocking time 509 ms and 360 KB. A laptop with the 3D hero downloads 277 KB in total. These are Playwright lab measurements, not Lighthouse scores or field data.
- Visual: 51 screens (17 pages at 390, 768 and 1440 px) fit their width with no sideways scrolling and no browser errors; repeated runs match pixel for pixel.
