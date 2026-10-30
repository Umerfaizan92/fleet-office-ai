# Known issues and release limits

The Claude source exists and includes Prompt 00 through Prompt 10. Earlier preview deployments omitted 44 phase commits by using a pre-phase baseline. That deployment mistake is distinct from the completeness of the source.

The transferred handover records unfinished work. Preserve these tasks honestly: customer-facing documents/attachments and pipeline notifications/dashboard summaries (T-040–T-045), inbound automation triggers and worker extraction (T-047–T-048), SEO copy/accessibility follow-ups, image re-encoding/custom domains (T-050–T-052), live Google/Telnyx/Resend/Stripe verification (T-053/T-055/T-057), monthly snapshot copies and live reliability checks (T-059/T-060). VEVO remains manual, domain purchase is a request, and WhatsApp/social direct sending is limited.

Baseline validation reproduced one failing SEO fixture caused by the environment proxy responding to unreachable.invalid. Recovery makes that fixture deterministic; no product feature is removed to satisfy it. Local browsers use the available Chromium 153 binary; official GitHub UI checks remain required on the pinned browser.

Historical visual baselines are not included in git or the ZIP. A first local visual run creates a baseline; it verifies layout/overflow but is not proof of pixel equality to Claude's earlier machine. Source/archive hashes provide the independent preservation proof for the transferred frontend.

No production promotion is justified by the older PR #41 tests alone. The corrected source and final recovery commit need their own full matrix, CI, source/branch verification and hosted acceptance. Do not merge stacked phase PRs blindly or delete old branches as part of recovery.

## Added by Claude, 2026-10-31

- **Phone homepage blocking time is borderline.** It measured 214–218 ms against a 200 ms budget on the Claude
  workspace; ChatGPT measured 94 ms. Re-measure on CI or the preview. See TEST_RESULTS.
- **CodeQL reports 5 "insecure randomness" alerts** in `saas/ds/hero-3d.js`, the minified 3D library. It uses
  `Math.random()` for internal object IDs, with no authentication, tokens or secrets involved. These are false
  positives; the owner should dismiss them in GitHub Security (Claude cannot reach that API).
- **Uploaded files are uploaded again after each restart** (since the upload-retry fix). This is safer, because a
  file is never assumed backed up, but it uses more S3 requests on restart.
- **Backup folder root.** Snapshots and configuration backups now go next to the Litestream copy (production:
  `super-pro-v2/`). The IAM and lifecycle templates in `infra/aws/` still say `super-pro/`; replace the root before
  applying them.
- **The AWS IAM repair** for `super-pro-v2/db` was confirmed by the owner through ChatGPT on 2026-10-31. Claude did not
  verify it independently (no AWS or Render access from the Claude workspace).
