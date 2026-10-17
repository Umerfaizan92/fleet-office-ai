# Audit fixes — 17 October 2026 UTC

Development-only changes; no production deployment or business-record changes.

## Fixed in this revision

- Mute forwards cancellation to the shared speech runtime. Pending buffered and device playback settle even without an ended event; buffered requests abort; stale responses cannot restart speech. Text submission no longer waits for playback. Persisted voice preference is reflected in the control.
- Manual includes Expenses & profit and Approvals with consistent numbering. Navigation changes the URL before announcing the new view, so listeners read current context.
- Later hardcoded dark surfaces have explicit light-theme rules. Visual acceptance still needs development-browser testing.
- Subscription footer reflects the returned lifecycle instead of claiming an active 14-day trial. Preserved accounts explicitly show read-only access and indefinite retention.
- Content Studio no longer seeds fake assets or fabricates recovered files. Existing local storage is left untouched, but unverified device records are not presented as tenant media. The missing tenant media-store connection is explicit; edit specifications remain available.
- Skill suggestions strip orphaned conjunctions after removing enquiry/coordination terms.
- Provider guidance explicitly distinguishes worker profiles from login accounts, approval decisions from executed actions, and edit specifications from rendered videos.

## Verification

Local Node 24.19: all 11 node tests pass, including four new speech-cancellation regressions and a service-skill regression. Release validation, integration-runtime tests, server smoke test and quality checks pass. Integration-runtime tests are controlled tests, not proof of provider delivery. GitHub CI uses Node 22.22.

## Live test status and remaining gates

The Cloud Browser reached the live public page and sign-in page. No authenticated session was available in this pass; no credentials were entered. Earlier live evidence is recorded in LIVE-BROWSER-TEST-2026-10-16.md. These changes have not been deployed or visually verified live.

A development deployment and authenticated owner/employee test access are needed for full browser workflow and permission acceptance. Mobile layout, real integrations, rendered media, employee account provisioning, platform-owner administration, membership switching, imports, cloud storage, subscriptions and unified communications are not certified complete by this revision. Do not release based on static quality scores alone. Actual configured credentials and provider permissions must be verified without exposing secrets.
