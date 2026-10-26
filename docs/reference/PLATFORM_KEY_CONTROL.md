# Platform Key Control — Operator-Owned, Customer-Safe

## Objective

The Super Pro AI Office Manager operator keeps control of important provider/application credentials. Customers should not copy API keys, client secrets or master credentials into their workspace.

## Final model

**Platform layer**
- GDS operator configures each provider application's credential once.
- Credentials remain server-side.
- The browser receives readiness booleans only, never secret values.
- `GET /api/saas/platform-capabilities` reports whether a capability is configured without returning the credential.
- `npm run check:config` performs an operator-side readiness check and never prints values.

**Customer/tenant layer**
- A customer opens Connections.
- They choose Facebook/Instagram, TikTok, YouTube/Google, Snapchat, X, WhatsApp, email/SMS, website, etc.
- They identify their business account and complete the provider-authorised login/consent flow when that connector is enabled.
- Their customer-specific tokens/permissions must be tenant-scoped and encrypted in production.
- They do not see or control the GDS platform application's master/client secret.

## Development

For local development, the root `.env` can contain provider variables. Enter them once and restart the server.

## Production

Recommended architecture:
1. Put app/provider credentials in a managed secret store owned by the GDS operator account.
2. Grant only the backend runtime identity permission to read the exact secrets it needs.
3. Use KMS-backed encryption and key rotation policies.
4. Never send secrets to frontend JavaScript, logs, support tickets or tenant databases.
5. Keep customer OAuth tokens separate from platform app secrets and tenant-scope every token.
6. Audit privileged secret/configuration changes.

## Readiness commands

```bat
npm run check:config
```

The output is intentionally limited to `READY` / `MISSING`.

## Current build limitation

Some connectors are still readiness/self-service foundations until the provider-specific OAuth callback, permissions, app review and production account are configured. The UI must not claim a connector is live merely because a card exists.
