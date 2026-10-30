# Phase 09 prompt (verbatim, received 2026-10-30 22:01 AWST)

SUPER PRO AI — PHASE 09
AUTOMATED BACKUP AND RELIABILITY ENGINE
Build a comprehensive reliability and disaster recovery system.
FIRST: Audit current Render, database, AWS S3 and GitHub configurations.
Identify all production data stores and existing backup arrangements.
BACKUP STRATEGY:
• Automated database backups
• Point-in-time recovery where supported
• Encrypted backup storage
• Separate backup bucket
• Backup versioning
• Retention policies
• Backup integrity checks
• Scheduled restore tests
• Configuration backup
• Recovery documentation
Define and document recovery point and recovery time objectives.
MONITORING:
Monitor:
• Application availability
• API failures
• Authentication errors
• Database performance
• Storage availability
• Queue failures
• AI service failures
• Voice service failures
• Email delivery failures
• Payment webhook failures
• Backup failures
• Deployment health
• Resource usage
• Security events
SELF-HEALING:
Allow safe automated recovery for:
• Retryable background jobs
• Temporary network errors
• Expired non-sensitive caches
• Recoverable service connection failures
• Stuck tasks with bounded retry policies
Require approval for:
• Production rollback
• Database restoration
• Infrastructure migration
• Credential changes
• Data deletion
• Major configuration changes
Never allow an AI agent to repeatedly retry destructive operations.
REPORTING:
Provide daily health summaries, critical alerts, backup status and recovery readiness.
DELIVER: Operational dashboards, tested backup jobs, restore verification, monitoring, alerting and incident runbooks.
