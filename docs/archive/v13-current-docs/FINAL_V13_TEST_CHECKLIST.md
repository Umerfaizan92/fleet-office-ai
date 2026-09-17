# v13 Final Test Checklist

## 1. Install and validate
```bat
copy .env.example .env
npm install
npm run validate:final
npm run generate:admin-key
```
Put the generated key into `ADMIN_API_KEY` in `.env`.

For local account-verification testing only:
```env
PORT=3000
NODE_ENV=development
PUBLIC_BASE_URL=http://localhost:3000
SAAS_VERIFICATION_TEST_MODE=1
```
Then run:
```bat
npm start
```

## 2. Public Product Guide
- Open `/saas/`.
- Confirm Explore the platform scrolls to the capabilities section.
- Confirm Voice enabled card does not cover Send.
- Test English text + audio.
- Select Urdu, ask in Urdu, and confirm the reply is Urdu. Audio should use an Urdu-compatible voice or explicitly say no compatible voice is installed; it must not read Urdu with an English voice.
- Test Voice: Auto / Female / Male.

## 3. Session persistence
- Sign in.
- Click the Super Pro AI Office Manager brand in the top-left workspace.
- Confirm you remain signed in and return to Command Centre.
- Navigate Business Setup, Workforce, Jobs, AI Operations, Content Studio, Connections, Trust & Governance, Help, Manual, Billing.
- Confirm only the explicit Sign out button signs out.

## 4. Staff Chat
- Open floating Office Chat in SaaS workspace.
- Confirm Minimise, Close and Escape all work.
- Confirm textarea and Send button are fully visible at desktop, tablet and mobile widths.
- In Fleet Parlour Office Manager open Staff Chat; test Minimise, Close and Escape.

## 5. Office Manager header
- Confirm Ask Office AI, Staff Chat, Help, Super Pro workspace and Refresh remain fully visible and wrap cleanly at smaller widths.

## 6. Fleet Parlour AI Receptionist
- Confirm UI states mobile/on-site service only and no customer workshop/drop-off.
- Configure `OWNER_PRIVATE_TRANSFER_NUMBER` privately in `.env` only if transfer testing is required.
- Routine enquiry: should save/forward without transfer.
- Explicit request for Faiz/Faz/Faizan/owner: may request protected transfer when configured.
- Critical active-job safety/security case: may escalate immediately.
- Confirm AI never reveals the private transfer destination.
- Confirm saved voice enquiries remain after server restart once database persistence is tested.

## 7. Notification routing
Configure only when ready:
```env
VOICE_ENQUIRY_NOTIFY_TO=
VOICE_ENQUIRY_ALERT_PHONE=
RESEND_API_KEY=
TELNYX_API_KEY=
TELNYX_FROM_NUMBER=
```
Normal saved enquiries can email the configured inbox. Urgent/owner-attention cases can additionally SMS.

## 8. AWS readiness
Do not paste AWS keys into customer fields. For production prefer IAM roles.
```env
AWS_REGION=
AWS_S3_BUCKET=
AWS_KMS_KEY_ID=
AWS_BACKUP_VAULT_NAME=
```
No AWS certification badge should appear unless it has been verified for the actual deployed environment/organisation.

## 9. Final browser sweep
- Chrome desktop
- Edge desktop
- Tablet width
- Mobile width
- No overlapping floating windows
- No accidental sign-out
- No 429 during normal navigation
- No broken local links/assets
