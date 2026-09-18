# Super Pro AI Office Manager — Current Release

**Version:** 18.0.0  
**Release line:** current consolidated production test build  
**Updated:** 19 September 2026

## What this release consolidates

The browser/runtime layer has been reduced to one current implementation per responsibility. Previous guide wrappers, hotfix layers, version-number runtime files and duplicate style layers were removed only after their active behavior was migrated.

### Current AI flow

1. Browser sends the user's real question plus a separate conversation identifier.
2. Selected language wins; Auto mode uses native-script and transliterated-language detection.
3. The central provider resolver applies one provider policy across Product Guide, AI Operations, onboarding AI and AI quality checks.
4. In strict free mode, Gemini is the only server AI provider. There is no hidden OpenAI paid fallback.
5. When a live AI provider is unavailable, the application returns safe built-in guidance instead of pretending an external AI action succeeded.

### Current voice flow

- Server STT: Gemini when free mode + Gemini key are configured.
- Server TTS: Gemini when free mode + Gemini key are configured.
- Voice styles: Auto / Male / Female where the selected server/device voice supports them.
- Browser recognition and browser speech remain fallbacks where supported.
- Starting microphone input stops current spoken playback so the user can interrupt the assistant.

### Current connections flow

Provider authorisation uses server-side app credentials and tenant-scoped connection state. Supported provider callbacks are implemented for the configured connector set, but every provider still requires its real developer configuration and successful live authorisation before it is considered connected.

## Important deployment limitation

Static/source validation cannot prove that third-party providers are live. Gemini, Telnyx, email, Google, Meta, TikTok, X, Snapchat, payments and other external services must be tested against the actual Render environment and provider accounts.

## Removed legacy runtime families

The current tree no longer depends on the old SaaS guide v16/v17 patches, old v11/v14/v15 SaaS browser runtimes, old version-number SaaS style layers, or old version-number Office Manager enhancement layers. Their retained behavior now lives in descriptively named current files.
