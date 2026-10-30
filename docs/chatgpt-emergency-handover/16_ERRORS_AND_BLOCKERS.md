# Errors and blockers

The full log is in `.claude/project-memory/ERROR_LOG.md`. Recent:
- E-018 (fixed): duplicate automation catalogue key `data_deletion` replaced a business action.
- E-019 (fixed): the backup IAM policy and lifecycle rules did not cover snapshots/ and config/, so uploads would have
  been refused in production.

Blockers (need the owner):
- No live credentials in the build environment, so Google, Telnyx, Resend, Stripe, AWS and the Render API are
  unverified live.
- Decisions:
  - Merge PR #40, or the consolidated branch, into main?
  - PR #22: merge or close?
  - Keep or archive the unrelated old branch `Business-Virtual-AI-Office`?
  - Protect main; repository visibility; apply the S3 bucket settings and IAM policy.
- No git errors this session. The push succeeded.
