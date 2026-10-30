# Security and permissions

- Roles are enforced on the server. Tenant isolation is tested (`tenant-isolation.test`). The Founder Console is
  separate from the workspace (founder session plus MFA).
- Approvals (Phase 05 policy): invoice drafts and campaign drafts are automatic; refunds and transfers, campaign
  launches and production deployment need owner approval; deleting subscriber records is restricted.
  `APPROVAL_ONLY` in `src/reliability/heal.js` has 7 actions. Proven by `release-security.test`.
- Hash-chained audit log; security headers; rate limits; session caps; secret scan `npm run security:secrets` (passing).
- npm audit: 0 vulnerabilities (last run in Phase 10).
- Fixed in Phase 10: a duplicate catalogue key (E-018). Fixed in consolidation: the IAM and lifecycle gap (E-019).
- Details: `docs/phase-10/REPORT.md`.
