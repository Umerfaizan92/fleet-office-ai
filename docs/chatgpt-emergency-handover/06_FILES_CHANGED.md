# Files changed in the consolidation (since 9e895b8, Phase 10)

- `infra/aws/backup-iam-policy.json`: read bucket safety settings; get and put on snapshots/, config/, monthly/; delete only under db/.
- `infra/aws/backup-lifecycle.json`: daily snapshots 35 days, monthly 400 days, config 90 days.
- `src/reliability/backup.js`: reachability check uses ListObjectsV2 (prefix super-pro/); clearer AccessDenied message.
- `scripts/release-security.test.mjs`: test that the IAM policy and lifecycle rules cover every prefix the app writes.
- `scripts/verify-modules.mjs`: Phase 07–09 subscriber and founder modules added.
- `docs/phase-09/BACKUP_AND_RECOVERY.md`: points to the infra files.
- `docs/release/FEATURE_INVENTORY.md`, `docs/release/PHASE_COMPLETION_MATRIX.md`: new.
- `.claude/project-memory/*`: checkpoint, error E-019, task T-062.

For each phase's file list, run `git show --stat <commit>` (commits in 03).
