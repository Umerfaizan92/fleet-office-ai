# Production Test Checklist — 18.0.1

Use this against the actual deployed Render URL after every material AI, authentication or integration change.

## Core
- [ ] `/healthz` returns healthy.
- [ ] `/saas/` loads without missing JS/CSS assets.
- [ ] Mobile reload receives the current service worker/cache.
- [ ] Workspace and Office Manager load without console-breaking JavaScript errors.
- [ ] `/api/health/storage` reports persistent storage detected in production.
- [ ] A test record and test upload survive a controlled redeploy.

## Account
- [ ] New account validation works.
- [ ] Email/mobile verification behaves according to configured providers.
- [ ] Sign-in persists correctly.
- [ ] Logout invalidates the session.
- [ ] Recovery flow works.
- [ ] MFA setup and verification work.

## Product Guide
- [ ] English question → English reply.
- [ ] Urdu script question → Urdu reply.
- [ ] Roman Urdu such as “mujhe urdu mein baat karni hai” → Urdu/Roman-Urdu appropriate reply.
- [ ] Short Roman Urdu such as “kya karna hai” is not misclassified as English.
- [ ] Punjabi/Roman Punjabi is not misclassified as English.
- [ ] Explicit language selector overrides auto detection.
- [ ] Provider unavailable → same-language built-in fallback, not a hard English error.
- [ ] Follow-up question uses relevant recent context without exposing an internal conversation ID.

## Voice
- [ ] Microphone permission flow is clear.
- [ ] On the first microphone press, the first spoken words are captured without requiring a second attempt.
- [ ] Auto transcription works with configured Gemini server STT.
- [ ] If server STT is unavailable, supported browsers fall back to device recognition.
- [ ] Spoken reply works through configured server TTS.
- [ ] Server TTS audio actually plays after an async AI reply in Chrome/Edge; text-only success is not counted as a voice pass.
- [ ] Auto / Male / Female preferences are selectable.
- [ ] Urdu is not intentionally sent to an English locale.
- [ ] User microphone start stops current AI speech.
- [ ] Browser/device TTS fallback works where the device exposes a suitable voice.

## Workspace AI
- [ ] Ask Super Pro answers specific questions instead of repeating a generic introduction.
- [ ] Ask Super Pro preserves detected reply language.
- [ ] Global AI Search answers and navigates appropriately.
- [ ] AI Operations saves the user instruction.
- [ ] AI Operations saves a generated answer when provider is available.
- [ ] Provider unavailable → AI Operations saves a safe local operational fallback instead of returning a dead-end 503.

## Free AI policy
- [ ] With `FREE_AI_MODE=1`, Gemini is reported as server provider when key is configured.
- [ ] With `FREE_AI_MODE=1`, an exhausted OpenAI key is not called as fallback.
- [ ] Without Gemini key, UI remains usable through built-in/browser fallbacks and does not claim server AI is connected.

## Connections
For every configured provider:
- [ ] Readiness reflects real environment configuration.
- [ ] Authorise button opens the correct provider.
- [ ] Redirect URI exactly matches provider configuration.
- [ ] Callback completes successfully.
- [ ] Tenant connection is saved.
- [ ] Token/secret is never exposed to browser UI.
- [ ] Disconnect/re-authorise behavior is tested.
- [ ] Provider not configured is not shown as live.

## Governance / data
- [ ] Tenant data remains organisation scoped.
- [ ] Privileged logs remain role restricted.
- [ ] Consequential actions retain human approval boundaries.
- [ ] Production secrets do not appear in repository, browser source or logs.

Record any failed item before declaring the release live.
