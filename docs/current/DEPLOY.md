# Deploy — Super Pro AI Office Manager 18.0.1

## 1. Render source

Deploy the repository's `main` branch. The Node runtime must be Node 22 or newer.

Recommended commands:

```text
Build: npm ci && npm run validate:final && npm run quality:check && npm run smoke:test
Start: npm start
```

## 2. Core environment

At minimum configure a strong production session secret and the correct public URL. Do not paste real values into source code.

For strict free-first AI:

```text
FREE_AI_MODE=1
GEMINI_API_KEY=<private Gemini API key>
GEMINI_MODEL=gemini-2.5-flash
GEMINI_STT_MODEL=gemini-2.5-flash
GEMINI_TTS_MODEL=gemini-2.5-flash-preview-tts
GEMINI_TTS_AUTO_VOICE=Kore
GEMINI_TTS_MALE_VOICE=Puck
GEMINI_TTS_FEMALE_VOICE=Aoede
```

If `FREE_AI_MODE=1` and there is no valid Gemini key, the application intentionally does not fall through to paid OpenAI. Built-in text guidance and browser voice fallbacks remain available where possible.

## 3. Provider connections

For each external provider:
1. configure its app/client credentials in Render;
2. configure the exact live HTTPS callback URL in the provider developer console;
3. request only required scopes;
4. complete any required provider app review;
5. authorise a test tenant/account;
6. verify the saved connection status and perform a real read/test action before calling it live.

## 4. Persistent data

The supplied production Blueprint uses one paid Render web-service instance and a persistent disk:

```text
Mount: /var/data
DATABASE_PATH=/var/data/super-pro.sqlite
UPLOAD_DIR=/var/data/uploads
```

Do not downgrade this production service to Render Free while SQLite/uploads are authoritative customer storage. Keep `numInstances: 1` while SQLite is in use. For multi-instance scale, migrate the relational datastore to managed PostgreSQL and move durable uploads to object storage.

Set `PUBLIC_BASE_URL` and `ALLOWED_ORIGINS` to the real HTTPS origin before browser testing. Production CORS intentionally rejects unlisted browser origins.

## 5. Validate before deploy

```bash
npm ci
npm run validate:final
npm run quality:check
npm run smoke:test
npm run check:config
```

## 6. Validate after deploy

Run the full `TEST_CHECKLIST.md`. In particular confirm:
- health endpoint and public page load;
- registration/login/session/recovery;
- English, Urdu, Roman Urdu, Punjabi and Hindi replies;
- Auto/Male/Female voice;
- interruption while AI is speaking;
- AI Operations result + fallback;
- Ask Super Pro and Global AI Search;
- provider connection status and OAuth callbacks;
- PWA/cache update on mobile.

Do not treat a static PASS as proof that an external provider account is operational.
