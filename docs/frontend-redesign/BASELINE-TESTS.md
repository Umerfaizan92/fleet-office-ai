# Baseline test results

Recorded on the verified base before any redesign edit.

| Item | Value |
|---|---|
| Commit | `468e366ff4d80f58241b1e5ce7da7a9d924e3fe2` on `main` |
| Node | v22.23.4 |
| When | 26 Oct 2026, about 5:42 pm Australia/Perth |
| Environment | Local temp database only. `SUPERPRO_SKIP_DOTENV=1`. No production data, messages, or payments |

These are the same commands as `.github/workflows/ci.yml`.

| Command | Result |
|---|---|
| `npm test` (`scripts/verify-all.mjs`) | **73/73 checks passed.** Exit 0 |
| `npm run integration:test` | **Passed.** Encryption, legacy decrypt, refresh, discovery, and revoke. Exit 0 |
| `npm run smoke:test` | **Passed.** Server booted. Public and protected routes returned the expected status codes. Exit 0 |
| `npm audit --omit=dev --audit-level=high` | **0 vulnerabilities.** Exit 0 |

`npm test` covers syntax of every script and inline HTML script, local asset references, `package.json` and `render.yaml` sanity, database bootstrap and self-healing, audit-chain tamper detection, persistent-disk fallback, the contract tests under `scripts/*.test.mjs`, release validation, the quality gate, a live RBAC and pipeline run, and `scripts/audit-ui.mjs`.

The live pipeline checks that were already green, and must stay green after visual work:

- Owner registration, verification, and sign-in
- Work order creation, AI draft held for approval, role and tenant limits on approval
- Ledger, finance automation, private media, customers, stock, staff chat
- Payments, subscriber register, growth engine, plan limits, add-ons
- Operator billing, follow-up email, search visibility, subscriber pay links
- Two-step sign-in, terms acceptance, tap-to-pay receipts, hiring
- UI audit: no dead local links, no id’d control without a handler, no dialog Cancel button that required fields can block
- Audit log chain verifies

## Pre-existing defects

None failed in this run. There is no redesign regression to separate yet, because no screen has been restyled.

Observations that are not test failures, and that the redesign must not “fix” by deleting the control:

- Light-theme gold `#a9782f` on `#f4f6f9` measures **3.58:1**, under the WCAG AA 4.5:1 bar for normal text. Dark-theme gold on ink passes. See the design proposal. This is a contrast gap, not a broken feature.
- `saas/workspace.html` still contains a hidden auth shell whose register submit only redirects to `create-account.html`. That is intentional wiring, not a dead form.
- `office/index.html` still contains a hidden admin-key form. The visible path is `sign-in.html#operator`, which writes `sessionStorage['fp-admin-key']`. The office page redirects there when the key is absent. Keep both.
- Gold values differ across `saas/app.css` (`#d9ad59`), `saas/brand.css` (`#d9ad59` / `#d8ad58` nearby), and `office/office-theme.css` (`#e4bd66`). Unifying them is redesign work, not a functional bug.
- Some module routes (`growth`, `seo`, `hiring`, `payments`) apply `requireSaasUser` inside the installer rather than on the same line as the path. The route catalog’s auth column only prints middleware that sits next to the path literal. Those routes are still authenticated. See `API-ROUTES.md`.

## Blockers for Phase 2

No blocker stops the redesign branch from continuing on this base.

Constraints that will fail CI if a later phase ignores them:

- String assertions in `scripts/quality-check.mjs` and `scripts/validate-release.mjs` (script tags, view ids, API path literals, copy such as `APPROVAL POLICY`, `View history`, `Test connection`, `Send onboarding link`, `Compliance & credentials`, `LIMITED ACCESS`).
- `scripts/audit-ui.mjs` for links, handlers, `data-view` targets, and dialog Cancel buttons.
- Service-worker cache name and the `intro.js?v=29` pin.
- Do not point tests or manual checks at the live Render service.

Manual browser walkthrough of every screen was not part of this phase. The automated UI audit and smoke test are the baseline. Later phases that change a screen should exercise that screen in a browser against the local server only.
