# v11 Final Test Checklist

## 1. One-time local setup

```bat
copy .env.example .env
npm run generate:admin-key
notepad .env
```

In `.env` paste the generated admin key and use these local values:

```env
PORT=3000
NODE_ENV=development
PUBLIC_BASE_URL=http://localhost:3000
SAAS_VERIFICATION_TEST_MODE=1
```

Do not paste fake provider secrets. Leave unconfigured services blank.

Then run:

```bat
npm install
npm run validate:final
npm run check:config
npm start
```

## 2. Customer entrance and onboarding

- Open `http://localhost:3000/saas/`.
- Test Product Guide by typing and microphone.
- Ask in English and another supported language; confirm the guide follows the language where the provider/local fallback supports it.
- Confirm premium Join AI Office / Join Workspace wording.
- Create an account using ABN or ACN test mode; verify email/mobile code flow.
- Check that changing the identifier invalidates the previous verification result.

## 3. Workspace usability

- Confirm Business Profile / Services & area / Approvals / AI preferences side navigation scrolls to the correct section.
- Use the contextual AI help buttons in each onboarding section.
- Confirm gold hover/focus treatments are consistent.
- Confirm the Co-pilot remains available throughout the workspace.
- Open the dedicated Help & Complaints view; ensure it does not cover the Co-pilot.
- Open Staff Chat and send a message.
- Confirm live status toasts appear after meaningful updates.
- Open Digital User Manual and confirm `You are here` / application map navigation.

## 4. Responsive test

Test at desktop, laptop, tablet and narrow mobile widths. Verify:
- no overlapping Co-pilot/Help controls;
- side navigation remains usable;
- forms remain readable/tappable;
- cards stack cleanly;
- chat panels and dialogs stay within the viewport.

## 5. Trial and billing

- Check exact trial expiry date/time and live countdown.
- Check billing provider readiness cards.
- Do not expect Stripe/PayPal/bank collection until those providers are configured.
- The lifecycle should be trial -> read-only restriction -> retained archive -> final restore window -> deletion due; no automatic destructive deletion should occur in this test build.

## 6. Fleet Parlour AI Office/Admin

Open `http://localhost:3000/office/` and sign in with the generated admin key.

Check:
- premium Office dashboard/cards/navigation;
- Office AI Co-pilot and voice input;
- Staff Chat;
- Help & Governance;
- contextual Ask AI controls;
- AI Receptionist shows business-only workflow;
- no customer-facing personal/mobile routing option exists;
- no private owner transfer number is visible.

## 7. Business telephone configuration — later

Do not guess the business landline. After confirming the number, configure:

```env
BUSINESS_PRIMARY_NUMBER=
BUSINESS_WHATSAPP_NUMBER=
OWNER_PRIVATE_TRANSFER_NUMBER=
```

`OWNER_PRIVATE_TRANSFER_NUMBER` must remain private/server-side. It exists only to transfer a genuine business caller to the owner when authorised.

## 8. Before production

Keep `SAAS_VERIFICATION_TEST_MODE=0` in production. Connect managed database/object storage/KMS/secrets, provider OAuth/apps, email/SMS/voice, payment processors, monitoring/backups, legal documents and final privacy/retention policies before public commercial launch.
