# Isolated Render review service

> **31 October safety hold:** The last hosted deployment failed after contacting shared production S3 before the old seed check. The storage description below is the intended configuration, not verified current isolation. Do not redeploy until PR #41 passes on its final commit and preview credentials/storage are replaced or inspected. See [security continuation](SECURITY-CONTINUATION-2026-10-31.md).

This service is for testing the restructuring branch. It is not the production release of the complete master plan.

- Pull request: https://github.com/Umerfaizan92/fleet-office-ai/pull/32
- Branch: `codex/superpro-two-portals-v2`
- Preview: https://superpro-ai-v2-preview-20261029.onrender.com
- Render service: https://dashboard.render.com/web/srv-dbhldj942hec73cpcs4g
- Compute: Free; auto-deploy off; Singapore.
- Storage: separate ephemeral SQLite and uploads, no production disk, S3 bucket or provider credentials.

## Sign in

Business: open `/saas/sign-in.html` on the preview. Use `owner.alpha@preview.invalid`, `employee.alpha@preview.invalid` or `owner.beta@preview.invalid`. The synthetic test password is stored only in this new service's Render **Environment** as `PREVIEW_BUSINESS_PASSWORD`. Retrieve it there; it is not committed or published in a document.

Founder: open `/saas/operator-sign-in.html` on the preview. The new preview's founder key is its Render **Environment** value `ADMIN_API_KEY`. It is independent of the live service's founder key. Platform staff accounts can then be created under F09 with their own passwords, authenticators and action grants.

The preview refuses public registration, customer intake and external webhook writes. It refuses to seed against production persistent paths or backups, and refuses live message/payment/AI keys. The Alpha and Beta businesses are synthetic isolation-test accounts.

## Review sequence

1. Check B01-B09 rail, top subtabs, theme and sign-out at phone/tablet/desktop widths.
2. In Alpha, save email and quote drafts. In Beta, confirm Alpha records are absent.
3. Verify that email edits invalidate approval, and send stays unavailable without configuration. No test here should contact a real recipient.
4. In F09, grant Alpha Complimentary; confirm its status, feature profile and trial/billing exemption. Beta must remain unchanged.
5. Create a platform staff identity, grant only selected sections/actions, configure its authenticator, and test the separate staff sign-in disclosure.
6. Request support access for Alpha. Alpha's business owner must approve it before the permitted read-only summaries are accessible. Revoke it and verify denial.
7. Inspect new email and platform audit events. Check blocked actions as well as successful actions.
8. Read `MASTER-V2-STATUS.md` before interpreting provider-request screens or draft registers as complete services.

## Deployment and data limits

Render automatically starts an initial deploy when a new service is created, even with later auto-deploys off. The first preview build exposed the runtime preview flags to the verification fixtures and stopped on a contract-test failure. `scripts/verify-all.mjs` now removes those runtime-only flags before launching test fixtures. The contract suite passes with the preview flags present in its parent environment.

Subsequent deployments of this review service are manual. Do not change the original service's branch, environment or disk. A Free service's SQLite/uploads can disappear on spin-down, restart or redeploy; only synthetic records belong here. No original subscriber data was imported. Included Render build/bandwidth quotas still apply.

Before production: complete the phase gates and missing workflows listed in `MASTER-V2-STATUS.md`, prove backup/restore and migration reconciliation, configure an isolated durable staging store, pass the exact-head CI and provider tests, and then perform the separately authorised manual production deployment.
