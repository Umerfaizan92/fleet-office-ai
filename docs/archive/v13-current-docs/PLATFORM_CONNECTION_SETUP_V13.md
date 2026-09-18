# Platform Connection Setup — v13

## Operator-controlled secrets
Set these once at the platform/server level; never show raw values to customer workspaces.

- Email: `RESEND_API_KEY` or SMTP settings
- Telnyx: `TELNYX_API_KEY`, `TELNYX_CONNECTION_ID`, `TELNYX_PUBLIC_KEY`, `TELNYX_AI_ASSISTANT_ID`, `TELNYX_FROM_NUMBER`
- Meta: `META_APP_ID`, `META_APP_SECRET`
- WhatsApp: `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`
- TikTok: `TIKTOK_CLIENT_KEY`, `TIKTOK_CLIENT_SECRET`
- Google/YouTube: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`
- Snapchat: `SNAPCHAT_CLIENT_ID`, `SNAPCHAT_CLIENT_SECRET`
- X: `X_CLIENT_ID`, `X_CLIENT_SECRET`
- Multilingual AI: `AI_PROVIDER_BASE_URL`, `AI_PROVIDER_API_KEY`, `AI_PROVIDER_MODEL`
- Payments: Stripe / PayPal / bank placeholders in `.env.example`
- AWS: S3/KMS/backup fields in `.env.example`

Run `npm run check:config` after configuration. It prints READY/MISSING only and never prints secret values.

## Fleet Parlour numbers
- `BUSINESS_PRIMARY_NUMBER`: confirmed public business number.
- `BUSINESS_WHATSAPP_NUMBER`: approved WhatsApp Business number.
- `OWNER_PRIVATE_TRANSFER_NUMBER`: private server-side transfer destination only.

Do not publish or return `OWNER_PRIVATE_TRANSFER_NUMBER` through APIs or browser code.
## Deployment and website controls
- Render deployment: `RENDER_API_KEY`, `RENDER_SERVICE_ID`
- Website control: `WEBSITE_PUBLIC_URL`, `WEBSITE_API_BASE_URL`, `WEBSITE_API_KEY`, `WEBSITE_WEBHOOK_SECRET`

These are operator-side settings. Raw values must never be returned to customer workspaces or browser bundles.

