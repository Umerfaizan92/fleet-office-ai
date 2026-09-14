# Fleet Office AI — Phase 6 SaaS Foundation

Phase 6 begins the conversion from Fleet Parlour's private Office Manager into a configurable commercial SaaS product for multiple service businesses.

## New test address

After starting the backend, open `http://localhost:3000/saas/`.

The Fleet Parlour system remains at `http://localhost:3000/office/`.

## Functional in this phase

- Self-service business workspace registration.
- Separate organisation records and unique workspace slugs.
- Separate user accounts and owner memberships.
- Password hashing with Node.js `scrypt` and unique salts.
- Server-side hashed session tokens in HttpOnly, SameSite=Strict cookies.
- Sign-in rate limiting and eight-hour session expiry.
- TOTP authenticator MFA enrolment and verification.
- Tenant-scoped business onboarding and custom AI instructions.
- Tenant-scoped AI conversation storage.
- Browser speech-to-text input where the browser supports it.
- Tenant-scoped professional video edit specifications, including 720p/1080p/4K, aspect ratio, clip timing, transitions, captions, music, logo and style instructions.
- Subscription-plan and organisation-subscription database foundation with a 14-day founder trial.
- Commercial landing/sign-in experience and responsive workspace design.
- Tests confirming two business accounts cannot see each other's AI conversations.

## Deliberately not represented as complete

- An AI model is not yet connected. Messages are saved privately, but no model response is fabricated.
- Audio recording/upload and live AI voice calls are not yet connected; browser dictation is available.
- The video studio saves a professional render specification. The FFmpeg worker, previews and finished video export are not yet connected.
- Email verification is flagged as required but the verification-email flow is not yet active.
- Account recovery codes, password reset and administrator invitations are not yet active.
- Billing tables and trials exist, but setup fees, monthly prices, GST invoices and payment processing are not enabled until the owner chooses pricing and a payment processor.
- Social, WhatsApp, Google, email, SMS and advertising connectors still require official apps, HTTPS callbacks and platform approval.

## Commercial-launch blockers

Do not publish this as a paid public product yet. Complete a professional security review, data-retention policy, privacy terms, backups, encrypted secrets, email verification, password recovery, MFA recovery, audit logs, subscription payments, abuse limits, tenant-aware operational records, AI usage metering, connector permissions and Australian legal/compliance review first.

There is no genuinely unlimited AI, video rendering, SMS, phone or storage service: each consumes compute, API usage, telecommunications or storage. Commercial plans must include fair-use limits or metered overages so one customer cannot create uncontrolled cost.
