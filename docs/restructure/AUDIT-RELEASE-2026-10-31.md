# V2 audit and deployment readiness — 31 October 2026, Perth

This is a focused security/data-protection review plus the complete automated regression suite. It does not certify unfinished product modules or replace a production restore drill. The latest remote deployment/CI result is maintained in PR #41.

## Confirmed defects corrected

| Finding | Resulting failure | Correction and regression evidence |
| --- | --- | --- |
| Existing uploads treated as backed up on restart | Files whose prior S3 upload failed could be skipped indefinitely | Local files no longer populate the successful-upload cache; regression simulates outage and successful retry after restart |
| Interrupted restore treated as a populated folder | A failed second object download could leave later objects missing on the next boot | Persistent pending-restore marker resumes missing objects; marker binds bucket and prefix; existing customer files remain untouched |
| Restore followed existing symlinks | A backup object could overwrite a path outside uploads or across tenant folders | Refuse symlink components; atomic no-overwrite final-file creation; external file/directory regression tests |
| Backup bucket copied with whitespace or quotes | Startup could pass an invalid raw bucket name to S3/Litestream even after credential normalization | Normalize bucket selection centrally; preserve BACKUP_S3_BUCKET precedence and Render fallback; test whitespace, quotes and disable flags |
| Malformed S3 pagination | Restore could silently stop early or loop on a repeated token | Fail closed when a truncated page lacks a new continuation token; keep the pending marker for recovery |

Restore metadata and partial-download temporary files are excluded from uploaded content. No live database, S3 object or production credential was changed while testing these fixes. A successful fresh snapshot remains affirmative evidence of replication, not proof that every historical object or restore chain is valid.

## Audit coverage

- Startup ordering and preview fail-closed behavior, including direct server import before dotenv dependencies.
- Database bootstrap, migrations, schema repair, integrity and append-only audit chain.
- Tenant-scoped workflow, staff permissions, owner finance restrictions, operator separation, MFA/session flows, approval gates and private uploads, using existing runtime suites.
- S3 upload/retry/restore, path boundaries, credential-name handling and normalized bucket precedence.
- Responsive browser navigation, business/founder surfaces, staff permissions and presence, AI response/audio cancellation, email review, notification controls, finance and connectors.
- Integration encryption/refresh/revoke, smoke routes, dependency audit, source credential-pattern scan and PR review-thread inventory.

## Verification

The reviewed code passed the full verifier (73/73), integration and smoke checks, plus 33 browser checks on Node 24.22.1. A clean supported-runtime run on Node 22.23.4 with the same lockfile also passed: full verifier 73/73, browser checks 33/33, integration runtime, smoke tests and dependency audit (zero vulnerabilities). Nine focused S3 contract tests cover the backup corrections. The credential-pattern scan found no matching live AWS, OpenAI, Stripe, GitHub or private-key patterns in tracked files; this is a bounded scan, not proof of the absence of every possible secret.

Local browser testing uses a temporary Chromium 153 binary after the normal CDN download failed. GitHub CI uses the project's pinned Playwright browser; its final-head result remains an independent release gate. No test account contacted a real mail/SMS/payment provider.

## Deployment state and remaining gates

Production remains on main/8318b9e with its disk and credentials preserved. No production promotion is authorised by a passing local test alone.

The prior preview variable replacement saved an allowlist with no S3/provider credentials and independent synthetic secrets. It automatically triggered an old-source deployment, which failed its build tests before runtime. The source branch was then advanced to af5999f with automatic deployments off. Review PR #41 for subsequent commits and branch updates.

Before preview deployment: final commit CI must pass; verify the preview points to that commit with its isolated environment. Monitor the specific deploy until live, then verify health, preview mode, synthetic tenant boundaries and founder/staff acceptance. Do not interpret saved environment variables as proof about a running instance.

Before production deployment: finish hosted preview acceptance, fresh non-destructive S3 restore/integrity/schema/count verification, prefix-isolation review, rollback compatibility and outstanding V2 product acceptance. The available Render connector provides neither a remote shell nor a general bucket object reader, and local runtime contains no production AWS/Render API credentials. Plugin discovery found no connected general S3 backup-access capability. No credentials should be pasted into chat to bypass this limit.
