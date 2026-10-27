# SuperPro AI design benchmark — 27 October 2026

This is a comparison of ten selected international product references, not a verified global ranking. Public documentation and published product screens were reviewed; private competitor accounts were not tested. The order reflects relevance to SuperPro's daily operating workflows. Linear is the lead visual reference, while Stripe and Shopify are especially relevant to forms and business administration. No claim of outperforming these products has been established through user testing.

| Reference | Evidence and useful pattern | Application to SuperPro | Trade-off |
|---|---|---|---|
| 1. Linear | [2026 interface refresh](https://linear.app/now/behind-the-latest-design-refresh): quieter navigation, predictable headers, task hierarchy | Lower navigation emphasis, clear page titles and grouped founder sections | Dense interfaces need clear labels for first-time users |
| 2. Stripe | [App design guidance](https://docs.stripe.com/stripe-apps/design): consistent components and controlled colour contrast | Shared form, button, focus and dialog treatments | Financial actions need explicit review, beyond visual polish |
| 3. Vercel | [Web interface guidelines](https://vercel.com/design/guidelines): keyboard access, focus, reduced motion and intentional animation | Keyboard-operable sign-in tabs, visible focus, short hover animation | Decorative movement must stay subordinate to work |
| 4. Shopify | [Polaris](https://shopify.dev/docs/api/polaris): one UI framework across app surfaces | One shared presentation layer across business and founder portals | Shared appearance must not imply shared permissions |
| 5. Atlassian | [Design system](https://atlassian.design/): cohesive foundations, tokens, accessibility and AI patterns | Common colour/font tokens and understandable AI entry points | Broad systems can become visually crowded |
| 6. IBM | [Carbon](https://www.carbondesignsystem.com/): enterprise components, patterns, data and AI experiences | Structured operational panels, consistent status and hierarchy | Avoid excessive information density for small businesses |
| 7. monday.com | [Vibe](https://developer.monday.com/apps/docs/vibe-design-system): theming, navigation, feedback, inputs and popovers | Repeatable controls and consistent popup geometry | Too many simultaneous colours compete for attention |
| 8. Notion | [Projects](https://www.notion.com/product/projects): configurable views, filters and granular access | Searchable navigation and contextual work sections | Unlimited configuration can confuse onboarding |
| 9. Asana | [Navigation](https://help.asana.com/s/article/navigating-asana): distinct sidebar, header, top bar, main pane and detail pane | Separate navigation from task content, clear current section | Multiple panes need careful mobile adaptation |
| 10. ClickUp | [Features](https://clickup.com/features): views, themes, contrast options and shortcuts | Consistent appearance, visible labels and discoverable navigation | Feature breadth must not produce crowded screens |

## Chosen direction

Retain SuperPro's existing black and gold identity. Use the existing self-hosted Manrope UI font, restrained gold emphasis, neutral raised surfaces, readable secondary text, consistent controls, bounded dialogs, responsive navigation and optional interaction motion. Founder operations and tenant workspaces retain their independent authentication and authorization.

## Design workspace

[Editable Figma file](https://www.figma.com/design/eF9q9bQvnwkJxYc4m3IYhR)

Three conceptual reference screens: shared access (4:2), business workspace (4:30), founder operations (4:72). Screens use editable text, instances and layout containers, with no flattened UI images. Figma previews describe the shared direction; existing operational content is retained in the implementation. They are not pixel-for-pixel specifications for every existing module.

## Implementation

`saas/unified-ui.css` and `saas/unified-ui.js` are loaded after existing styles on all 18 SaaS HTML pages and the founder entry page. Existing feature-specific styles remain in place. This is a shared-system and interaction correction release, not a complete rewrite of every module. Longer tasks remain scrollable so forms are never clipped.

## Validation scope

- Full existing verification suite: syntax, database/storage, existing contracts, permissions and transaction workflows.
- Browser regression suite (`npm run test:ui`): real local server, isolated test database, throwaway business and founder sessions; responsive sign-in, keyboard tabs, deep links, route visibility, mobile customer-dialog cancel and geometry, founder navigation and JavaScript exceptions.
- Static local-link audit (`node scripts/audit-ui.mjs`). This checks references, not every button's behavior.
- Manual inspection of Figma and generated browser screenshots.

These checks do not certify every possible data-dependent button, every third-party integration or every browser. Production authenticated journeys and external providers require separate live verification after deployment.

## Verified results

- Existing full suite: 73/73 checks passed on Node 22.23.4.
- Browser suite: 11/11 checks passed with local headless Chromium; 22 owner routes and 23 founder sections visited. Founder API responses were checked for HTTP errors, and the founder logo was verified to remain visible.
- Responsive sign-in widths: 390, 768 and 1440 pixels. Customer dialog tested at 390 × 700 pixels.
- Fixed defects: operator hash changes failed to select the correct sign-in mode; founder navigation could extend below its viewport; insights used obsolete session-storage names and produced unauthorized responses despite a valid founder session; the legacy brand initializer removed the new SVG logo after it had been installed.
- Static links and whitespace checks passed. Reduced-motion behavior passed.
- Deployment remains separate: the repository config explicitly disables automatic Render deploys. A GitHub branch/PR is not evidence that production has updated.
