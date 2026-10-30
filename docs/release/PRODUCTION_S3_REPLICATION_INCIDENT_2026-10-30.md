# Production S3 replication incident — 2026-10-30

**Severity:** High — unverified off-site database backups. **Status:** Open; no production changes authorised in this checkpoint.

## Evidence
- Render workspace `tea-dajtb13m8hqs739l6v50`, production service `srv-dan4rdqjnfac73fceor0`.
- Production deployment `dep-dbibh78ae00c73bop78g` is live on `main` commit `8318b9ebdc5935527dfa91897b4e3c3c78406745`.
- Render application logs at 2026-10-30 15:43–15:46 UTC repeatedly report `AccessDenied`, `s3:PutObject`, on `super-pro-v2/db/generations/.../snapshots/....snapshot.lz4`. The AWS error explicitly says **no identity-based policy allows** this action.
- The repository template `infra/aws/backup-iam-policy.json` grants Litestream permissions on `BACKUP_BUCKET/super-pro/db/*`, not `super-pro-v2/db/*`.
- `scripts/start.mjs` reads `BACKUP_S3_DB_PREFIX` and defaults to `super-pro/db`. Thus the live `super-pro-v2/db` path indicates an override or different deployed configuration; verify rather than assume.

## Safe repair plan (requires AWS owner access)
1. In Render, inspect **names only** and nonsecret values for `BACKUP_S3_BUCKET`, `BACKUP_S3_DB_PREFIX`, `AWS_REGION`, and the intended AWS IAM identity; never paste secrets into tickets, chat or logs.
2. Confirm whether `super-pro-v2/db` is the canonical existing production replica path. **Do not switch prefixes without checking restore continuity**, because doing so can strand the prior backup generation.
3. In AWS IAM, inspect policies attached to the actual principal `superpro-app`, permissions boundaries, SCPs, bucket policy and optional KMS permissions.
4. If `super-pro-v2/db` is confirmed canonical, grant the *actual principal* the minimum required `s3:GetObject`, `s3:PutObject`, `s3:DeleteObject` on `arn:aws:s3:::<verified-backup-bucket>/super-pro-v2/db/*`; grant `s3:ListBucket` on that bucket restricted to the `super-pro-v2/db/*` prefix. Preserve other unrelated policy statements and don't grant wildcard bucket access. Litestream may need additional multipart permissions based on actual behavior.
5. If SSE-KMS is configured, ensure key policy and principal permissions allow the required KMS operations for that key only.
6. Confirm `PutObject` succeeds in Render logs and no new replication errors occur. Verify new objects under the correct prefix, then conduct a **read-only restore into a separate temporary file** and SQLite integrity check. Record timestamp and RPO.
7. Only after successful restore evidence, resume release readiness review.

## Guardrails
- No data deletion, database reset, S3 lifecycle change, credential rotation, Render environment mutation, restart, or deploy as part of this incident documentation.
- Do not set `BACKUP_DISABLED` to silence the error.
- Do not assume the live service is protected just because Render reports `live`.
