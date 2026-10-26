# Frontend redesign — Phase 1 audit

This folder is the coverage record for a visual redesign of the existing Super Pro AI Office Manager. Phase 1 inspects the application and writes the plan. It does not change pages, styles, APIs, or data.

## Verified base

| Item | Value |
|---|---|
| Repository | `Umerfaizan92/fleet-office-ai` |
| Base branch | `main` |
| Base commit | `468e366ff4d80f58241b1e5ce7da7a9d924e3fe2` |
| Commit time | 26 Oct 2026, 4:29 pm Australia/Perth |
| Commit subject | SEO cluster, unified sign-in, Get paid pad, saved cards |
| Package | `super-pro-ai-office-manager` 19.0.0 |
| Deploy | Render blueprint `render.yaml`. Auto-deploy is off. Health check `/healthz`. Persistent disk `/var/data`. |

`origin/HEAD` points at `main`. `main` is the newer tree. The other remote branch, `Business-Virtual-AI-Office` (`23649c3`, 25 Oct 2026, 11:50 am Australia/Perth, “Merge pull request #19”), has no common ancestor with `main` and is missing the files added on `main` (SEO cluster, payments pad, saved cards, hiring, growth, subscriber billing, and the current public pages). It is not the base.

Working tree on `main` was clean before this branch. Nothing was merged, deployed, or force-pushed.

## What lives where

The app is a Node 22 / Express server with static HTML, CSS, and JavaScript. There is no frontend framework.

| Path | Role |
|---|---|
| `saas/` | Customer and business workspace, public marketing, authentication, and tokenised public flows |
| `office/` | Platform-operator console. Separate origin path. Tenant users must not reach it |
| `src/server.js` and `src/*.js` | API contracts, sessions, permissions, payments, integrations |
| `scripts/verify-all.mjs` | `npm test`. Includes a static UI audit |

`GET /` redirects to `/saas/`. Workspace sections are hash routes on `/saas/workspace.html`. Office sections are in-page views on `/office/`, switched by `data-view`, with no hash router.

## Documents

| File | Contents |
|---|---|
| [ROUTE-INVENTORY.md](./ROUTE-INVENTORY.md) | Every page, hash route, office view, form, dialog, and shell control |
| [API-ROUTES.md](./API-ROUTES.md) | Server routes grouped by prefix, with the auth note |
| [INTERACTION-MAP.md](./INTERACTION-MAP.md) | Which screen calls which API, including uploads, permissions, and navigation |
| [DESIGN-PROPOSAL.md](./DESIGN-PROPOSAL.md) | Shared colour, type, spacing, navigation, components, accessibility, and motion |
| [IMPLEMENTATION-CHECKLIST.md](./IMPLEMENTATION-CHECKLIST.md) | Ordered screen list. Leave boxes unchecked until that screen is redesigned and retested |
| [BASELINE-TESTS.md](./BASELINE-TESTS.md) | Results recorded before any visual change |

## Preservation rules for later phases

- Do not change backend logic, schema, stored data, sessions, tenant isolation, role checks, payment logic, integrations, or response shapes.
- Do not migrate frameworks, replace the server, add a database, or upgrade unrelated dependencies.
- Keep element ids, field `name`s, `data-view`, `data-jump`, `data-signin-mode`, `data-pane`, and delegated attributes (`data-worker-compliance`, `data-worker-skill`, `data-approval-decision`, `data-add-job-skill`). `scripts/audit-ui.mjs`, `scripts/quality-check.mjs`, and `scripts/validate-release.mjs` assert many of these strings.
- Keep these session and storage keys: `fp-admin-key` (operator console), `superpro_active_organisation`, `gds-new-email`, `gds-last-operational-view`, `superpro_ai_memory_current`.
- The hidden workspace auth shell (`#welcome`, `#register-form`, `#login-form`) must stay. `saas/app.js` reads it on boot and redirects registration to `create-account.html`. The live sign-in page is `saas/sign-in.html`.
- Operator sign-in is the Platform operator tab on `saas/sign-in.html#operator` (`#operator-form`, fields `key` and `code`). It stores `d.token` as `fp-admin-key` and opens `/office/`.
- Do not replace live controls with placeholders or swap real responses for mock data.
- Do not call production, send real messages, or start real charges while testing. `npm test` already uses a temp database and `SUPERPRO_SKIP_DOTENV=1`.
- Do not put secrets in frontend code. Customer card entry stays on the provider page. The pay page must keep the line that the product never sees the card number.
- Shared stylesheets (`brand.css`, `premium-ui.css`, `experience.css`, `support.css`) load in both portals. A change in one changes the other.
- `saas/sw.js` caches public assets only. It must keep excluding `/api/`, `workspace`, and `/office/`. The release check pins `intro.js?v=29` and cache name `superpro-public-20261026-20`. Bump those together if a cached public file changes.

## How to mark coverage

When a later phase finishes a screen, check its box in `IMPLEMENTATION-CHECKLIST.md` and note the commit. A screen is done only when its controls still call the same endpoints and `npm test` still passes.
