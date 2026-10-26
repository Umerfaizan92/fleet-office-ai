# Deploying to Render

This is the only deployment guide. Older release notes and checklists were archived by `scripts/purge-legacy.*`.

## 1. Before you deploy

1. **Back up the live database.** Render dashboard → your service → **Shell** tab, then run this one line (a plain file copy can miss recent changes because the database uses a write-ahead log, so this uses SQLite's own backup):
   ```bash
   node -e "const D=require('better-sqlite3');new D('/var/data/super-pro.sqlite').backup('/var/data/backup-'+new Date().toISOString().slice(0,10)+'.sqlite').then(()=>console.log('backup done'))"
   ```
   It prints `backup done`. Releases 19.x change the database schema. The changes only add things, but a backup costs nothing.
2. Run the whole verification suite on your machine:
   ```bash
   npm ci
   npm test
   ```
   `npm test` runs `scripts/verify-all.mjs`: syntax of every file, database migrations, the persistent-storage fallback, the role permission matrix (worker 403 / owner 200), and the full pipeline (inbound message → work order → AI draft → human approval → ledger → audit log). It also runs automatically as part of the Render build, so a failing build never goes live.
3. Make sure no `.env` file is committed (`git status` must not list it).

## 2. Render service

The blueprint `render.yaml` creates one web service on Node 22 with a persistent disk:

| Setting | Value |
|---|---|
| Build | `npm ci && npm test` |
| Start | `npm start` |
| Health check | `/healthz` |
| Disk | `super-pro-data` mounted at `/var/data` |
| Database | `DATABASE_PATH=/var/data/super-pro.sqlite` |
| Uploads | `UPLOAD_DIR=/var/data/uploads` |
| Safety | `REQUIRE_PERSISTENT_DISK=1` (the server refuses to start on non-durable storage) |

Keep `numInstances: 1` while SQLite is the datastore, and keep a paid plan (free instances cannot attach a disk). Auto-deploy is off on purpose: deploy manually after checking the build.

## 3. Environment variables

Render generates the session secrets and admin key (`generateValue: true`). Back them up after the first deploy; changing them signs everyone out and makes saved integration tokens unreadable (`INTEGRATION_ENCRYPTION_KEY`).

You must fill in (`sync: false`, so Render asks for them):

- `PUBLIC_BASE_URL`, `ALLOWED_ORIGINS`: the real `https://` address. Production CORS rejects anything not listed.
- `BUSINESS_ABN`: shown in public structured data once the business is registered.
- `INBOUND_EMAIL_WEBHOOK_SECRET`, `WHATSAPP_VERIFY_TOKEN`: make up long random values and paste the **same** value into your email-forwarding provider / Meta webhook settings.
- AI: `GEMINI_API_KEY` (strict free-first mode when `FREE_AI_MODE=1`), or `AI_PROVIDER_*` for another provider.
- Only the integrations you are switching on: Telnyx, Resend/SMTP, Meta/WhatsApp, TikTok, Google, Stripe/PayPal, and so on. `.env.example` lists every name.

`SAAS_VERIFICATION_TEST_MODE` must stay `0` in production.

## 4. After the deploy

1. Open `https://<your-service>/healthz` (should return `{"ok":true}`).
2. Check the full diagnostics (needs your admin key, which is the `ADMIN_API_KEY` value in Render):
   ```bash
   curl -H "x-admin-key: <ADMIN_API_KEY>" https://<your-service>/api/saas/health/diagnostics
   ```
   Expect `"status":"ok"`. `degraded` lists the warnings (for example a missing optional integration). `fail` returns HTTP 503 and says which check failed (database integrity, audit chain, schema, storage).
3. Register a test business, sign in, open each section of the workspace, and send one test enquiry through each channel you have connected.
4. Redeploy once and confirm the test business is still there. That proves the disk is working.
5. A connection to an outside provider is only live after its credentials, callback URL, permissions and customer authorisation are all in place and a real test action has succeeded.

## 5. Self-healing at startup

On every start the server proves the data folder is writable, opens the database, compares it with the expected schema, adds anything missing (columns, indexes, triggers, tables; never deletes or rewrites data) and logs a `[DIAGNOSTICS]` summary. If the disk is missing or unwritable and `REQUIRE_PERSISTENT_DISK` is not set, it falls back to local storage and reports itself as `degraded`, because that storage may be erased on restart.

## 6. Rollback

Render → Deploys → pick the last good deploy → Rollback. The database is additive-only, so earlier code keeps working against it. To restore data, stop the service and copy the backup file from step 1 over `super-pro.sqlite` (delete any `super-pro.sqlite-wal` and `-shm` files next to it first).

## Permanent storage on AWS S3 (no Render disk needed)

The database and uploaded files are saved to your own S3 bucket, and restored automatically on a fresh start or redeploy.

1. In AWS, create a private S3 bucket (Block all public access ON), for example `superpro-backups-yourname`, in the region you want.
2. Create an IAM user for the app with this policy only (replace the bucket name), then create an access key for it:

```json
{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Action":["s3:ListBucket","s3:GetBucketLocation"],"Resource":"arn:aws:s3:::BUCKET"},{"Effect":"Allow","Action":["s3:GetObject","s3:PutObject","s3:DeleteObject"],"Resource":"arn:aws:s3:::BUCKET/super-pro/*"}]}
```

3. In Render, open the service, go to Environment and add `AWS_S3_BUCKET` (or `BACKUP_S3_BUCKET`), `AWS_REGION`, `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY`.
4. Choose Manual Deploy, then Clear build cache & deploy. The log should show Litestream installing and `Data is backed up to S3`.
5. Test once: sign up a test business, then Manual Deploy again. After the deploy, sign in with the same details. If it works, backups are proven.

The database is copied every 5 seconds, so a crash can lose at most a few seconds of changes. Uploads are copied every 2 minutes. Nothing is ever deleted from the bucket by the app. Turn on bucket versioning for extra safety.
