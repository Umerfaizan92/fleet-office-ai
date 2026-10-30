# V2 security continuation — 31 October 2026 (Perth)

Production promotion remains on hold. This record continues the complete Library Master Handover of 31 October, starting with draft PR #41.

## Verified remote baseline

- PR #41 head: `1d1b466ee68a1080b343c3062a8425f9a89679be`; draft, open, mergeable. CI run `41099079658` passed all steps: verifier, browser UI, integrations, smoke and high-severity dependency gate.
- Production: `srv-dan4rdqjnfac73fceor0`, branch `main`, automatic deployments off, 10 GB disk at `/var/data`. Live deploy `dep-dbibh78ae00c73bop78g`, commit `8318b9ebdc5935527dfa91897b4e3c3c78406745`. `/healthz` returned `ok: true` at `2026-10-30T17:34:10.595Z`.
- Preview: `srv-dbhldj942hec73cpcs4g`, branch `codex/superpro-two-portals-v2`, automatic deployments off, no disk listed. Latest deploy `dep-dbhm5nijnfac73ac2bn0` failed startup on commit `b5120dd8de6df73f85a0d84bf0d200b991303855`.
- Production Litestream emitted `snapshot written` at `2026-10-30T17:33:58.933Z` (31 October 01:33:58 Perth), generation/index `7e8b0517e93fd11c/00000033:4152`, size 99,299 bytes, elapsed 869 ms. This is affirmative fresh S3 snapshot-write evidence after the reported IAM change. It does not independently verify an object listing, a fresh WAL upload, restore-chain isolation or a post-fix restore.

## Changes in this continuation

- Shared preview preflight executes before application storage imports in `npm start`, before dotenv/integration construction/storage opening in direct server startup, and in synthetic seeding.
- Rejects AWS/S3 configuration including credential aliases and SDK profile/role/container paths, file backups, persistent-disk requirements, provider credentials, SMTP and OAuth secrets.
- Requires explicit database/upload paths under `/tmp`, including normalized paths and existing-parent symlink validation; requires a strong synthetic test password; suppresses dotenv loading.
- Replaces the source-order assertion with runtime tests for hostile configurations, production no-op behavior, symlink escape, safe instrumented startup, real preview health and repeated synthetic seeding. Child environments contain only synthetic fixtures.
- Lockfile patch updates Express 4.22.2 to 4.22.3 and qs 6.16.0 to 6.17.1. npm's lockfile audit reports zero vulnerabilities. No major dependency versions change.

## Validation and limits

The initial local verifier passed 73/73 checks; focused preflight tests, integration runtime and smoke checks passed. After the dependency patch, a clean npm ci, full verifier (73/73), integration runtime, smoke test and production dependency audit all passed; the audit reports zero vulnerabilities. Local Node is 24.22.1; GitHub CI uses the required Node 22 and remains the authoritative supported-runtime gate.

Local Chromium installation failed because the download was truncated. The existing remote baseline UI step passed; browser tests must pass again on the final PR head. The final commit and current CI result are tracked in PR #41 rather than inferred from this baseline.

## Next release gates

1. Verify final-head CI, including browser tests and dependency audit.
2. Inspect or replace preview configuration with a reviewed safe allowlist: explicit ephemeral paths, synthetic password, unique application/authentication/vault secrets, no live providers or S3/backup credentials. The connector exposes replacement but no environment inventory read. Never treat blank values as key deletion; never replace production configuration.
3. Advance only the preview source to the verified commit. The deployment tool deploys the service's configured branch and cannot pin an arbitrary commit. Preserve production `main`, disk and credentials.
4. Deploy only preview, monitor its specific deploy ID, verify health and synthetic tenant/role/operator acceptance. No production promotion is authorised by this record.
5. Run non-destructive fresh S3 restore to a unique scratch destination with integrity/schema/count reconciliation. Preserve all objects and live SQLite files. Investigate the prior preview writes under `super-pro/db` separately from production `super-pro-v2/db`; do not delete either prefix.
6. Reconcile outstanding V2 workflow, billing, messaging/voice and migration acceptance against `MASTER-V2-STATUS.md`. UI/provider request screens are not proof of activated services.

No production data deletion, production environment edit, production deployment, merge to main or backup deletion occurred while establishing this baseline.
