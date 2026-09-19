# New Render Deployment Checklist

This blueprint is for a NEW Render service. Do not attach it to or replace the existing production service until acceptance testing passes.

## Before creating the service
- Use branch `audit-production-2026-09-19`.
- Confirm GitHub validation is green and quality is 100/100.
- Create a new Render Blueprint/service; keep the old service intact.
- Use Node 22+.
- Keep the persistent disk mounted at `/var/data`.

## Required first-launch values
Set `PUBLIC_BASE_URL` to the new HTTPS service URL and `ALLOWED_ORIGINS` to the permitted HTTPS origin(s). Add the real Gemini/AI, Telnyx, email verification and ABR credentials required for the first smoke test. Never commit those values to GitHub.

The blueprint generates the core session/admin secrets. Store/backup those secret values securely before any later service recreation. `SAAS_VERIFICATION_TEST_MODE` must remain `0` in production.

## Additional integrations
Use `.env.example` as the canonical inventory for WhatsApp/Meta, TikTok, Google/YouTube, Snapchat, X, payments, object storage/KMS, website integration, search visibility and optional alternate AI providers. Add only the integrations being activated; do not put real keys into source control.

## Smoke-test gate
Before switching production traffic, verify: `/healthz`; public Product Guide; Urdu, Punjabi and English text/voice; customer interruption while AI is speaking; account creation and email/mobile verification; sign-in/MFA/recovery; workspace AI; records/audit persistence across a service restart; uploads across a restart; PWA install/update; Telnyx inbound call and protected owner transfer; and each enabled OAuth/payment integration.

Do not retire the previous Render service until the new service passes these tests.
