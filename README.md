# Super Pro AI Office Manager

Current release: **18.0.1**

Super Pro AI Office Manager is the current consolidated Fleet Office AI codebase for service-business operations. The repository now uses current descriptive runtime filenames instead of stacked v11–v17 browser patches.


## 18.0.1 production hardening

- Product Guide Auto microphone capture now begins immediately instead of waiting before recording the first utterance.
- Spoken server replies use an unlocked Web Audio playback path first, with HTML audio and browser speech fallbacks.
- Pressing the microphone interrupts current AI audio at pointer-down time.
- Public PWA/cache versions were bumped so deployed browsers receive the voice fix.
- Render production Blueprint uses one paid instance with a persistent `/var/data` disk for SQLite and uploads.
- Production CORS no longer becomes wildcard-permissive when `ALLOWED_ORIGINS` is omitted.
- Gemini-only deployments now report server voice readiness consistently in platform capabilities.
- Session TTL now follows the bounded `SESSION_TTL_DAYS` environment setting.
- The integrity manifest can be checked with `npm run verify:manifest`.

## Current architecture

- One multilingual Product Guide core: `saas/product-guide.js`
- Public product experience: `saas/intro.js`
- Workspace application: `saas/app.js`
- Workspace AI Operations: `saas/ai-operations.js`
- Shared SaaS runtime: `saas/common.js`
- Install/PWA runtime: `saas/install.js`
- Workspace supplemental runtime: `saas/workspace-extras.js`
- Central AI-provider policy: `src/ai-provider-shim.js`
- Backend/API and integrations: `src/server.js`

The old versioned browser wrappers and duplicated guide patches have been removed after their required behavior was consolidated into the current files.

## AI and multilingual behavior

With `FREE_AI_MODE=1`, the application is strict free-first:
- a configured `GEMINI_API_KEY` (or `GOOGLE_AI_API_KEY`) is used for server AI text;
- Gemini is used for server speech transcription and TTS when configured;
- exhausted OpenAI credentials are not called in strict free mode;
- if the server AI provider is unavailable, Product Guide and AI Operations use safe built-in fallbacks;
- browser/device speech recognition and speech synthesis remain fallback options where supported.

Selected reply language takes priority. Auto detection includes native scripts plus common Roman/transliterated Urdu and Punjabi patterns.

## External connections

OAuth/callback foundations exist for supported provider connections, but a connection is live only after its real provider credentials, redirect URI, permissions/app review and customer authorisation succeed. The UI must not represent an unverified connector as live.

## Security

Never commit:
- `.env` or real API/provider secrets;
- access/refresh tokens;
- customer databases or uploads;
- runtime logs containing private information.

Use `.env.example` only as a variable template.

## Validation

After every production change run:

```bash
npm ci
npm run validate:final
npm run quality:check
npm run smoke:test
npm run check:config
npm start
```

Then smoke-test the deployed environment using `docs/current/TEST_CHECKLIST.md`.

## Current documentation

- `docs/current/RELEASE.md`
- `docs/current/DEPLOY.md`
- `docs/current/TEST_CHECKLIST.md`
- `docs/reference/PRODUCTION_SECURITY_CHECKLIST.md`
- `docs/reference/PLATFORM_KEY_CONTROL.md`

Historical version-specific build notes are intentionally not part of the current production tree.
