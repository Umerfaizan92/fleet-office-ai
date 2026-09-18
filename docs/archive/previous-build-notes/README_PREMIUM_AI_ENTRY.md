# Super Pro AI Office Manager — Premium AI Entry Build

This build uses **fleet-office-ai-6-production-candidate (1).zip** as its base and adds the enhanced customer journey, secure Australian account creation, first-run onboarding, and AI guidance requested for the product.

## Customer journey

1. Premium product introduction at `/saas/`.
2. Public **GDS Product Guide** with typing, browser voice input and optional spoken replies.
3. Customer can ask about capabilities, industries, AI, calls/messages, CRM, jobs/workforce, Content Studio, integrations, plans, security and setup.
4. After a response, the interface asks **“Did that answer your question?”**.
5. A satisfied visitor can choose **Create verified account** or **Sign in**; otherwise they can keep talking to the guide.
6. Account creation checks Australian business identity first, then sends separate email and mobile verification codes.
7. The workspace is created only after both codes are correct.
8. First successful sign-in starts a guided product walkthrough.
9. Business setup can apply an industry-aware starter template and remains fully editable.
10. Inside the workspace, Global AI Search and the floating GDS Co-pilot support typed and spoken navigation/help.

## Important implementation notes

- Public product guidance works locally without an external LLM and is deliberately limited to verified Super Pro AI Office Manager product knowledge. It does **not** pretend external providers are connected.
- Live generative AI can be connected later through an approved model/provider abstraction.
- Voice input uses the browser Web Speech API. Chrome or Edge gives the best local-test experience and requires microphone permission.
- “Remember my email” stores only the email address. Passwords are never stored in browser local storage.
- Paid billing remains disabled in this pre-launch build.
- Integrations are shown as connected only after their credentials/permissions and connection test succeed.

## Production security dependencies

For a real public Australian registration flow, configure:

- `ABR_GUID` — Australian Business Register / ABN Lookup authentication GUID.
- `RESEND_API_KEY` and `SAAS_VERIFY_FROM` — email OTP delivery.
- `TELNYX_API_KEY` and `TELNYX_FROM_NUMBER` (or `TELNYX_PHONE_NUMBER`) — SMS OTP delivery.
- HTTPS/public deployment, monitoring, backups, final security review and final legal/privacy documents.

Use `SAAS_VERIFICATION_TEST_MODE=1` **only for local development**, never in production.

## Premium Trust & Governance layer

The final upgraded build also includes a platform-wide Help & Complaint Desk, protected/anonymous intake, private case access keys, evidence hashing, conflict-aware routing, senior escalation, a role-aware Trust & Governance workspace, hash-chained audit evidence, industry policy overlays, a public Trust Center and a self-service Connections Hub that keeps developer secrets out of customer-facing forms.

For the full control model and production requirements, read:
- `SECURITY_GOVERNANCE_UPGRADE.md`
- `PRODUCTION_SECURITY_CHECKLIST.md`
- `TEST_GOVERNANCE_BUILD.md`

The included governance/legal content is a pre-launch product framework and must not be presented as a legal certification or substitute for final qualified legal/security review.
