# Integration inventory and evidence

| Integration | Implemented source | Evidence and remaining limit |
| --- | --- | --- |
| AWS backup S3/Litestream | src/s3-files.js, scripts/start.mjs, src/reliability/ | Fresh production DB restore passed before recovery: 146 tables, schema and row-content fingerprints matched. Corrected-release scheduled reliability is still a separate hosted acceptance check. |
| Primary object storage | src/object-storage.js | Separate optional bucket/credentials; no backup-key fallback. Not activated by this release or on synthetic preview. |
| Google SEO/GBP/analytics | src/seo/ and integration runtime | Fixture contracts and browser flows; live Google credentials/samples are not certified. |
| Resend/email | src/comms/, mail-centre, message delivery | Draft/approval/receipt contracts. No real-recipient campaign was sent during recovery. |
| Telnyx/voice | src/comms/voice.js and existing voice routes | Mock/provider contracts; live staging-call evidence remains T-055. |
| Stripe/payments | src/payments.js, src/finance/ | Test fixtures and signature/approval boundaries. Live test-mode settlement/refund evidence remains T-057. |
| WhatsApp/social | connection runtime and communication drafts | Draft/approval support; do not claim direct replies or external publishing where not implemented. |
| Render | release configuration and optional reliability connection | Existing hosting preserved. New runtime API integration is not enabled merely by deploying the source. |

No personal Gmail is used. Missing production provider credentials must be configured securely through the owner-controlled environment, never pasted into source, memory or chat. Existing production configuration is preserved by default. Runtime availability is reported from real connection evidence, not from a successful UI test.
