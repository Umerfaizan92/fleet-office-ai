# Rollback and preservation

Before any production promotion, record the currently live deploy ID/commit from Render and capture a current non-destructive backup. Do not rely on an old ID if the owner manually redeployed meanwhile. At recovery start the production source remained main/8318b9e; source and deploy ID must be checked again at action time.

Review every schema change from that source to the candidate. Claude's design is additive, but this must be verified from the final diff and reconciliation tests; do not assume compatibility from documentation alone. A code rollback never restores deleted data or reverses emails, payments, refunds, publications or other external writes.

If a build fails, preserve the existing live deployment and diagnose the first failing stage. If a verified release becomes unhealthy after traffic switches, use a known compatible prior build and verify health/core routes. Do not restore a database over the live file as an automatic rollback action.

S3 upload restore now uses .superpro-s3-restore.pending and source-bound metadata. Check that no interrupted restore is pending before falling back to old code that does not understand that marker. Preserve all snapshot/WAL/upload prefixes. Any data restore needs a separate plan with a temporary restore, integrity/schema/count/content checks, a recovery-point decision and explicit authorisation.

Preview contains synthetic temporary data only and can be redeployed from a known verified source. Never attach the production disk or clone production backups into it for convenience.
