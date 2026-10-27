# Cinematic interaction update — 28 October 2026

## Design choice

Compared the free Flowstate, Lumora, Ascend and Baseline references on GetLayers. Flowstate is the best fit for the requested direction because it combines a dark SaaS surface with restrained fluid movement. Ascend's large animated planet is less appropriate for an operational application with a strict performance budget. Lumora is a useful secondary reference for restrained transitions; Baseline is oriented toward a sports business.

References: [Flowstate](https://www.getlayers.ai/layer/flowstate), [Lumora](https://www.getlayers.ai/layer/lumora), [Ascend](https://www.getlayers.ai/layer/ascend), [Baseline](https://www.getlayers.ai/layer/baseline), [GetLayers documentation](https://www.getlayers.ai/docs), [Terms](https://www.getlayers.ai/terms-of-use).

GetLayers labels these references free and states that free layers allow commercial projects. Full source-code downloads require its paid Full Stack plan. This implementation uses original CSS and JavaScript informed by the public visual reference; it does not import or redistribute GetLayers source code or its prompt library. No purchase, account creation, external animation dependency, video, WebGL canvas or additional font was added.

## Shared behaviour

- Existing colour tokens and branding are retained across the public site, sign-in, business workspace and founder console.
- SVG and provider icons move gently while visible. A budget of twelve visible animated targets prevents large lists from starting unbounded animation. Off-screen targets stop; background tabs pause CSS motion. Device reduced-motion and Data Saver preferences are respected.
- Motion can be paused using the same control on the main public, access and portal surfaces.
- Fluid hero illumination, short page-heading entrances and interactive card depth use existing palette variables and composited transform/opacity animation.
- Desktop workspace menus open on mouse hover, close after leaving, and accept arrow/Home/End/Escape keys. Touch retains tap-to-open behavior. Long menus support normal touch/wheel scrolling plus pointer-edge scrolling that stops on leave or at the limit.
- Cache versions are advanced so returning browsers request the corrected scripts and shared styles.

## Connector defect

The integration enhancer observed changes inside the cards that it modified itself. Its own markup triggered another API request and another mutation. The list paginator also reset to the first page on any nested child or hidden-state change. Together, these prevented stable access to the page after Snapchat.

The enhancer now watches renderer changes at the list root, coalesces in-flight requests and avoids unrelated route-triggered requests. Pagination resets when actual rows are replaced, while requirements/resource changes inside a row preserve the current page. Expanded setup details get their own grid row rather than overlapping the provider description.

## Validation

The browser regression was first run against the previous integration/pagination scripts: it reproduced the page-two reset to page one. The corrected scripts pass that same regression, including X, Google Business Profile, Website and Email/SMS access and setup help, with no repeated requests while idle.

The browser suite also checks responsive public pages, sign-in, all business and founder navigation, menu hover/tap/keyboard/edge scrolling, motion pause, palette retention, dialog sizing/cancel, reduced motion, founder API responses and JavaScript exceptions. Tests use an isolated local server and throwaway accounts, not production customer records.

The shared CSS/JS and menu script add about 3 KB when gzip-compressed, before transport overhead. This is a payload measurement, not a universal speed or frame-rate guarantee. Actual production devices and external providers still require live verification after deployment.

## Separate queued work

Employee invitations/emails, AI answer and audio lifecycle, owner role authorisation, Business Setup and full light/dark contrast reconciliation are separate requested follow-ups, not part of this change.
