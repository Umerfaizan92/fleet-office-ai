# Known issues and release limits

The Claude source exists and includes Prompt 00 through Prompt 10. Earlier preview deployments omitted 44 phase commits by using a pre-phase baseline. That deployment mistake is distinct from the completeness of the source.

The transferred handover records unfinished work. Preserve these tasks honestly: customer-facing documents/attachments and pipeline notifications/dashboard summaries (T-040–T-045), inbound automation triggers and worker extraction (T-047–T-048), SEO copy/accessibility follow-ups, image re-encoding/custom domains (T-050–T-052), live Google/Telnyx/Resend/Stripe verification (T-053/T-055/T-057), monthly snapshot copies and live reliability checks (T-059/T-060). VEVO remains manual, domain purchase is a request, and WhatsApp/social direct sending is limited.

Baseline validation reproduced one failing SEO fixture caused by the environment proxy responding to unreachable.invalid. Recovery makes that fixture deterministic; no product feature is removed to satisfy it. Local browsers use the available Chromium 153 binary; official GitHub UI checks remain required on the pinned browser.

Historical visual baselines are not included in git or the ZIP. A first local visual run creates a baseline; it verifies layout/overflow but is not proof of pixel equality to Claude's earlier machine. Source/archive hashes provide the independent preservation proof for the transferred frontend.

No production promotion is justified by the older PR #41 tests alone. The corrected source and final recovery commit need their own full matrix, CI, source/branch verification and hosted acceptance. Do not merge stacked phase PRs blindly or delete old branches as part of recovery.
