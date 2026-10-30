# Phase 02 — Enterprise infrastructure and security: what changed

Date: 30 October 2026 (Australia/Perth). Branch: `phase-02-infrastructure-security`. Base: `main` at `8318b9e`.

Production is unchanged until this branch is reviewed, merged and deployed by hand. Every stricter rule is switched on by a setting, so merging alone does not change how the live service signs people in or stores files. The two changes that apply immediately after a deploy are listed under "Active on deploy".

## Active on deploy (no setting needed)

| Change | Why | Risk |
| --- | --- | --- |
| Worker and contractor permission ceiling (`src/staff-access.js`) | A contractor or worker with a stored custom grant could read finance and the customer directory. Workers and contractors are now limited to jobs, their own worker record, staff chat, approvals and personal activity, even if an older grant says more. | An owner who deliberately gave a worker finance access loses it; they can change the person's role to employee or manager. |
| Upload content checks for job photos and videos (`src/file-safety.js`) | Files are accepted by their real first bytes, not the name or browser type. Programs, scripts and web markup are refused. | A genuinely corrupt photo is refused with a clear message. |
| Encrypted backup copies of uploads (`src/s3-files.js`) | Each copy is sent with server-side encryption (AES-256, or KMS when `BACKUP_S3_KMS_KEY_ID` is set). | None for AWS S3; skipped for custom S3-compatible endpoints. |
| Pinned, checksum-verified Litestream download | A tampered archive can no longer become the backup tool. | If GitHub ever served a different file, backups refuse to start (fail closed). |
| Express 4.22.3 and qs 6.17.1 | Clears the two moderate advisories; `npm audit` now reports 0. | Patch releases only. |
| Request IDs on every response; 5xx lines in logs | Trace a customer report to a log line. | Slightly more log output on errors. |
| Background job runner with a daily audit-chain check | Retries, dead letters and visibility for background work. | `JOBS_DISABLED=1` stops it in an emergency. |
| `/readyz`, `/api/operator/jobs`, `/api/operator/system` | Readiness for deploy checks; founder visibility. | Founder routes need the operations permission. |
| Five organisation indexes on event tables | Every tenant table can be filtered by organisation through an index. | Built automatically at start-up; additive only. |
| Removed `https://api.fleetparlour.com.au` from the browser connect policy | No Super Pro page calls it. | None found. |

## Off until switched on

| Setting | Effect | Recommended order |
| --- | --- | --- |
| `OPERATOR_TOTP_SECRET` then `REQUIRE_OPERATOR_MFA=1` | Founder key alone never opens the console; without the secret, founder sign-in fails closed. | 1. Set the secret, sign in once with a code, then turn enforcement on. |
| `SESSION_TTL_DAYS=30` and `SESSION_MAX_AGE_DAYS=90` | Sessions renew for 30 days and end 90 days after sign-in at the latest. | 2. People with sessions older than 90 days sign in again once. |
| `STRICT_PASSWORD_MATCH=1` | Only the exact password (spaces trimmed, Unicode normalised) is accepted. | 3. After telling customers; anyone who relied on a swapped first letter resets their password. |
| `OBJECT_STORAGE_MODE=s3` and its own bucket and keys | New job evidence goes to a private, encrypted bucket; reads use 2-minute signed links. | 4. After `npm run storage:verify -- --write-test` passes in staging. |
| `CLAMAV_HOST` (+ `MALWARE_SCAN_REQUIRED=1`) | Uploads are scanned by ClamAV; with "required", uploads stop when the scanner is down. | 5. When a scanner service is running. |
| `LOG_FORMAT=json` | One structured line per API request. | Any time. |

## Module map

| Area | Files | Tests |
| --- | --- | --- |
| Sign-in and sessions | `src/security-policy.js`, `src/server.js` (`requireAdmin`, `/api/operator/login`, `passwordCandidates`, `requireSaasUser`) | `scripts/security-policy.test.mjs`, `scripts/tenant-isolation.test.mjs` |
| RBAC and tenant isolation | `src/staff-access.js` | `scripts/tenant-isolation.test.mjs`, `scripts/route-guards.test.mjs` |
| Database | `src/db.js` (indexes), `src/job-queue.js` (new table) | `scripts/tenant-indexes.test.mjs`, existing schema tests |
| Primary storage | `src/object-storage.js`, `src/file-safety.js`, job evidence routes in `src/server.js` | `scripts/object-storage.test.mjs` (includes a full upload and signed-link download against a local S3 stand-in) |
| Backups | `src/s3-files.js`, `scripts/install-litestream.mjs`, `scripts/restore-drill.mjs` | `scripts/restore-drill.test.mjs` (replicate, restore, integrity, audit chain, counts) |
| Jobs and observability | `src/job-queue.js`, `src/observability.js` | `scripts/job-queue.test.mjs` |
| Pipeline | `.github/workflows/ci.yml`, `.github/workflows/security.yml`, `.github/dependabot.yml`, `scripts/secret-scan.mjs`, `scripts/post-deploy-check.mjs` | `scripts/secret-scan.test.mjs` |
| Infrastructure | `render.staging.yaml`, `infra/aws/*.json`, `scripts/verify-storage.mjs` | JSON validity in the security workflow |

## Security tests added

- **Route guards:** all 400+ API routes in the source are called on a real server without a session; only 10 reviewed public read-only routes may answer, and none may crash. A business owner's session opens no founder or legacy admin route.
- **Tenant isolation:** two businesses, five roles. Workers see only assigned jobs without prices or customer links; contractors without an accepted offer see none; job media follows the assignment; workers and contractors are refused 16 customer, money, messaging and owner endpoints; another business cannot read or change records by ID; a browser-supplied workspace ID is refused; the ceiling holds both when saving and for grants already stored; employees keep owner-granted access.
- **Sign-in rules:** founder key alone refused under enforcement; sign-in fails closed without an authenticator; sessions past the absolute limit are ended and removed; strict matching refuses a case-swapped password.
- **Storage:** backup keys and bucket can never be used as primary storage; keys are per business and unguessable; encryption and checksums on every object; signed links expire in 120 s and are refused for another business; disguised programs, scripts and markup refused; ClamAV clean, infected and unavailable paths.
- **Mutation check:** run against the previous `staff-access.js`, the isolation test fails on exactly the two ceiling cases, proving it detects the gap it was written for.

## Found and not changed here (needs a decision)

- `GET /api/tiktok/status` and `GET /api/saas/verification-provider/status` are public and reveal connection readiness and token expiry times; no secrets. Restrict them when the screens that call them are reviewed.
- Fleet Parlour wording remains in the receptionist email subject (`src/mailer.js`), the legacy console header and the public newsletter text, and `/api/health` reports `fleet-parlour-enquiries`. These are branding changes for the redesign phase.
- Other upload paths (media library, business documents, support and hiring attachments, logos) still use the disk; they move to private storage with the same module once job evidence has run in staging.
