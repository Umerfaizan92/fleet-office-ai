# Super Pro AI Office Manager — Production Security Checklist

Do not use the local development configuration for public paid customers.

## Before public launch
- [ ] Final Australian lawyer review of Terms, Privacy, complaints, workforce and whistleblower materials.
- [ ] Determine whether the operating entity is an APP entity and document Privacy Act / APP applicability.
- [ ] Data-flow inventory and Record of Processing Activities / equivalent internal register.
- [ ] Final production subprocessor register and data-location disclosure.
- [ ] Managed PostgreSQL with encryption, private networking, automated backups and point-in-time recovery.
- [ ] Encrypted object storage with private-by-default access and signed/authorised retrieval.
- [ ] Separate immutable evidence/audit bucket with documented retention periods; do not WORM-lock ordinary personal data without a justified retention rule.
- [ ] KMS/customer-managed key strategy and key-access review.
- [ ] Secrets manager; remove production secrets from `.env`, source code and CI logs.
- [ ] MFA/passkeys required for privileged roles.
- [ ] Session revocation, device/session review and re-authentication for sensitive actions.
- [ ] Granular RBAC/ABAC permission matrix approved by product/security owner.
- [ ] Independent complaint-officer route configured before offering protected owner-related reporting.
- [ ] Resend/Telnyx escalation contacts tested with non-production scenarios.
- [ ] OAuth callbacks and minimum scopes reviewed for every social/business connector.
- [ ] Marketing-consent evidence and unsubscribe/suppression-list workflow tested.
- [ ] Data-subject access/correction/export/deletion/de-identification workflows tested.
- [ ] Retention schedule and legal-hold procedure approved.
- [ ] Notifiable Data Breach response playbook and regulator/customer notification decision process approved.
- [ ] WAF, DDoS protection, bot controls, rate limits and dependency scanning enabled.
- [ ] Security headers/CSP reviewed against real production domains.
- [ ] SAST/dependency audit, penetration test and tenant-isolation tests completed.
- [ ] Audit logs exported to an independent protected destination with integrity validation.
- [ ] Backup restoration and disaster-recovery drill passed.
- [ ] Central monitoring for authentication abuse, privileged changes, large exports and integration changes.
- [ ] Incident-response contact roster and 24/7 critical escalation path confirmed.
- [ ] Production privacy policy updated for any significant automated decisions that trigger applicable transparency obligations.

## Never do
- Never store raw passwords.
- Never ask customers to paste platform developer secrets into normal forms.
- Never put personal customer information on a public blockchain.
- Never give every manager unrestricted access to complaints/security logs.
- Never silently alter or delete audit evidence.
- Never retain personal information indefinitely merely because storage is cheap.
- Never label every complaint a legally protected whistleblower disclosure.
- Never promise that AI is the final decision-maker for legal, safety, employment, privacy, disciplinary or serious complaint outcomes.
