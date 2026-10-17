# Live browser test — 16 October 2026

Status: NOT RELEASE READY. Production code was not deployed or merged. Tests used the existing signed-in owner session on the supplied Render URL. No business records or outbound messages were created. Browser-local theme/language controls and two AI guidance questions were exercised.

## Passed observations
- Landing page and authenticated dashboard loaded; refresh retained sign-in and the AI Operations route.
- All 13 primary navigation destinations opened. This is navigation coverage, not complete workflow coverage.
- Business setup displayed 33 profiles; searching metal polishing returned one matching profile.
- Workforce directory and existing work order rendered; skill suggestions appeared.
- Approval history loaded the existing rejected QA request; policy controls rendered.
- Governance loaded the correct owner role, industry profile and policies.
- Office chat opened, loaded its empty state and closed; no message sent.
- Global search returned an Approvals navigation result after its debounce/request delay.
- English and Urdu AI answers returned. Actual audio output, microphone capture and acoustic barge-in were not independently verified.
- Provider setup requirements expanded.

## Confirmed failures / concerns
1. AI guidance invented an Invite / Assign Login action absent from the live workforce screen. Employee login activation remains unverified.
2. Turning voice off showed Voice off briefly, then Speaking naturally returned. Send stayed disabled during the subsequent check; reload restored it. Source inspection shows AI Operations stopSpeech does not stop the shared SuperProAIClient runtime and the composer awaits speech completion.
3. Light theme attribute changed to light, but the approval page remained visually dark. Dark mode was restored.
4. Manual showed role user and location Command centre despite owner session and other active routes; its map omits Finance and Approvals. The location ribbon also showed Command centre on Approvals.
5. Job skill suggestions include the malformed fragment & quoting.
6. Content Studio presents four assets including Previous transformation reel. Source inspection confirms seeded local sample records and a Find previous workspace media button that fabricates local records, not a provider media index. These are not verified uploaded assets.
7. Billing shows preserved status and 0 trial days while the footer still says 14-day trial active.
8. AI search prose describes approval execution more broadly than the approval screen, which states external execution is separate.

## Integration blockers
Meta, WhatsApp, TikTok, YouTube, Snapchat, X, Google Business Profile and Website display provider configuration required. Email/SMS shows a historical test dated 9 October, not a current delivery verification. Stripe, PayPal and bank instructions display not configured.

## Limits and next gates
Desktop viewport approximately 1363 px. No supported mobile viewport/emulation control was exposed in this Cloud Browser API; mobile layout remains unverified. No production workflow mutation tests, employee/manager account tests, live cross-tenant attempts, payment tests, real outbound messages, imports, storage restore or live credential validation were performed. These need an isolated development deployment and suitable test accounts/configuration.

The preceding development fixes are saved at b94495e6deeae8f0041a2123c39fe34b31b28145. Both GitHub Actions workflows passed for that commit. Those fixes were not deployed, and the new issues above are not yet fixed.
