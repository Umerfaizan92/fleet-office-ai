# Security review — recovery release

This is source review plus automated regression evidence, not an independent penetration-test certification.

Preserved controls include tenant-scoped sessions/SQL, worker permission ceilings, separate platform identities, encrypted integration tokens/MFA, signed webhooks, private uploads, append-only audit chains, per-action approvals and owner-controlled high-impact actions. New source modules must keep these boundaries.

Recovery-specific corrections:
- Preview guard runs before dotenv/provider/storage imports, blocks backup and primary OBJECT_STORAGE configuration, requires explicit writable /tmp paths and rejects symlink escape. No fallback to other local paths is permitted in preview.
- Existing upload files no longer count as proof of a completed S3 write. Interrupted restores retain a source-bound marker, preserve existing files and use atomic final names. Encryption added in Claude is retained.
- Copied bucket names are normalized without changing primary/backup roles.
- Intentional temporary preview storage is a warning only after preflight validation; real production non-durability still fails.
- SEO crawl destinations are checked on each redirect and sitemap fetch, including off-origin destinations from an own-site crawl. Regression fixtures reject private/metadata destinations before any fetch. DNS validation is not a claim of network-layer egress isolation or complete DNS-rebinding protection.
- The unreachable-host SEO fixture is deterministic and does not depend on a proxy's response for an invalid external hostname.

Secrets scans, full tests and hosted acceptance must be recorded in TEST_RESULTS.md on the final candidate. Do not weaken authentication/MFA, IAM, bucket policies, networking, encryption or approval gates to make a test pass. Production account/session and provider-policy settings require their own deliberate operational review.
