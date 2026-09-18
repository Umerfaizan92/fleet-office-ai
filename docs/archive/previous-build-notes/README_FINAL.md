# Super Pro AI Office Manager — v12 Final Candidate

**Start here:** this build consolidates the latest test feedback. Read `CHANGELOG_V12_FINAL.md`, then use `FINAL_V12_TEST_CHECKLIST.md` before adding production provider keys.

# Super Pro AI Office Manager — Premium AI Office v11 Final Test Build

This is the consolidated v11 test candidate built on the latest adaptive governance release. It preserves the previous premium onboarding, governance, Help Desk, complaints, policy, audit, integrations, Content Studio and digital manual work, and adds the final Office AI/business-communications upgrades requested during testing.

## What is new in v11

- Australian business identity selector: ABN, ACN, or another identifier/manual review path.
- Premium `Join AI Office` / `Join Workspace` language instead of generic workspace creation language.
- Multilingual Product Guide and Co-pilot foundation with automatic language detection and same-language replies. A platform-owned AI provider can be connected later; local guidance remains available without exposing provider keys to customers.
- Context-aware AI help on onboarding sections such as Business Profile, Services & Brand, Approvals and AI Preferences.
- Fixed onboarding side navigation so each item moves to and highlights the corresponding section.
- Live in-app status notifications for important save/update/activity events.
- Tenant-scoped internal Staff Chat in the customer workspace and a separate protected Office Staff Chat for the Fleet Parlour admin office.
- Dedicated Help & Complaints workspace view. The Help Desk no longer has to cover the persistent Co-pilot on the signed-in workspace.
- Global premium gold hover/focus treatment and responsive desktop/laptop/tablet/mobile refinements.
- Exact trial countdown plus staged unpaid lifecycle metadata: trial -> 30-day read-only restriction -> retained archive -> final restore window -> deletion due for authorised review. This build does not silently auto-delete customer data.
- Payment-provider readiness foundations for Stripe, PayPal and bank instructions; no payment provider is falsely shown as connected before credentials/authority exist.
- Premium Fleet Parlour AI Office/Admin refresh: upgraded cards/navigation, Office AI Co-pilot, contextual assistance, Staff Chat, Help & Governance and business-only receptionist controls.
- Business communications are business-only. Personal/family/friend routing has been removed from the Office UI and receptionist workflow.
- One confirmed public business number can later be configured once through `BUSINESS_PRIMARY_NUMBER` and used with the business communications stack. Business WhatsApp can be configured separately through `BUSINESS_WHATSAPP_NUMBER`/provider authorisation.
- The owner's private transfer destination is kept server-side only in `OWNER_PRIVATE_TRANSFER_NUMBER`; it is never displayed to a customer or caller.
- Root admin-key generator: `npm run generate:admin-key`.
- Expanded configuration checker that reports READY/MISSING only and never prints secret values.

## Important: no phone number was guessed or hard-coded

The business landline mentioned during testing was not confirmed, so v11 intentionally leaves these blank:

```env
BUSINESS_PRIMARY_NUMBER=
BUSINESS_WHATSAPP_NUMBER=
OWNER_PRIVATE_TRANSFER_NUMBER=
```

Enter only confirmed numbers later. Keep `OWNER_PRIVATE_TRANSFER_NUMBER` private and server-side.

## Quick local test

1. Copy the environment template:

```bat
copy .env.example .env
```

2. Generate an admin key:

```bat
npm run generate:admin-key
```

Copy the generated value into `ADMIN_API_KEY=` in `.env`. Do not share the key.

3. For local testing only, set:

```env
PORT=3000
NODE_ENV=development
PUBLIC_BASE_URL=http://localhost:3000
SAAS_VERIFICATION_TEST_MODE=1
```

4. Install and validate:

```bat
npm install
npm run validate:final
npm run check:config
```

5. Start:

```bat
npm start
```

Open:
- Customer SaaS: `http://localhost:3000/saas/`
- Fleet Parlour AI Office/Admin: `http://localhost:3000/office/`

## Production boundary

This is a production-oriented test candidate, not a claim that external providers are already live. ABR, AI model, email, Telnyx, Meta/WhatsApp, TikTok, Google/YouTube, Snapchat, X, payments, production database/object storage and KMS still require operator-owned credentials, permissions and production security configuration. Customers should connect their accounts through authorised connection flows; they should never receive platform master secrets.

The legal/policy material remains a pre-launch governance draft and requires qualified legal/privacy/security review before commercial reliance.
