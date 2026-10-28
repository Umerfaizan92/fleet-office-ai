# Plugin-assisted reliability and operations

## Implemented corrections

- Keep the current voice capture available for cancellation until transcription settles, while releasing microphone tracks immediately after recording stops. Closing AI now aborts an in-flight transcription; starting another recording cancels its predecessor. Cancelled requests return a cancellation result without an error/status callback into the old view. Genuine provider errors still produce an actionable message.
- Home's microphone now uses the same authenticated recording/transcription client as the AI conversation when MediaRecorder is supported. It no longer depends solely on the browser's separate SpeechRecognition API. Recognised text remains editable and requires Send. Navigation and closing cancel late callbacks. Native SpeechRecognition remains a fallback for devices without recording support.
- Reapply the existing shared card icon after renderers replace a card heading. Repair only the nearest card; keep one icon and the existing animation budget. The gold palette, hover/touch treatment and reduced-motion behavior are retained. No animation library or runtime dependency was added.
- Advance the changed script URLs so returning browsers request the corrected code.

## Connected tools used

- GitHub: existing repository, history, isolated change branch and reviewable release.
- Render: inspected the user-selected workspace and matched the active service to this repository. At audit time the manually deployed live commit was `777eff6ba5ed6a15e91dd8a37e0266d98d81e0fe`. Automatic deploy was off. No server_failed/server_restarted events were returned in the default recent window.
- PostHog: verified the Super Pro AI Office Manager organisation/project 325107. The active-error query returned no issues for its default seven-day window. This does not establish collection coverage or prove the absence of errors. No SDK, recording, autocapture, new events, tracking tokens or paid usage were enabled.
- Todoist: created the private project "SuperPro AI — Improvements" with a release task and five outstanding production verification/configuration tasks.
- Notion: release and audit notes can be maintained as a private draft, without publishing or sharing customer data.

Other connected tools are used when their capabilities are relevant. This release does not require new logos, an external CRM copy, a Redis server, a new AI key, payment transactions or Google account access. Installing a ChatGPT plugin does not automatically integrate that provider into the application.

## Deployment observation

The existing Render service has an empty HTTP health-check path, although `render.yaml` already declares `/healthz`. Set the existing service's HTTP health-check path to `/healthz` in Render settings. Do not recreate the service, alter its disk/plan, or enable automatic deploy. The available Render connector exposes no update-service/health-check operation, so this configuration was recorded for manual follow-through.

## Verification

Regression tests cover pending-transcription cancellation, replacement captures, microphone release, genuine provider errors, late Home text suppression, no automatic submission and restored live card icons without idle mutation loops. The full application and browser checks run against isolated accounts and a temporary database. They do not send customer messages or verify production payment, voice, SMS or email providers.

## Outstanding requested live checks

- Per-person permissions, owner-only management, separate businesses, immediate revocation, actual role/designation, sign-out and live presence on the deployed release.
- Provider-authorised email/SMS invitations, recovery codes, webhook delivery evidence, notifications, real replies and follow-up cancellation. SMS delivery and email-open signals must not be presented as guaranteed human read receipts.
- Real-device review of landing/sign-in/subscriptions/dialogs, Today/jobs cards, connectors including TikTok and page two, finance/billing/usage, imports, setup/trust, exports and all founder sections, including light/dark contrast and touch/keyboard behavior.
- Privacy-reviewed, minimal PostHog instrumentation with sensitive inputs excluded and free usage limits enforced before enabling collection. Reference: https://posthog.com/docs/privacy/data-collection

Manual Render deployment remains the user's final release step. Neither Google email account nor Google Drive was accessed for this work.
