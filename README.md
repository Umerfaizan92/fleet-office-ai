# Super Pro AI Office Manager — Unified Final Release

This release is the single consolidated production candidate created from the latest Super Pro / Fleet Office AI branch ZIPs on 18 September 2026.

It keeps the complete protected v14/v15 capability set and merges the later cleanup, registration, persistent-session, public-guide and live-test work into one organised tree. No v14 or v15 final-candidate file path is missing from this release.

Key retained and merged areas include:
- secure Australian business registration and duplicate-account/workspace protection;
- persistent signed-in sessions and account recovery;
- multilingual AI Product Guide and AI Copilot with language-aware voice input/output;
- Auto / Female / Male voice preference where supported;
- AI receptionist, staff chat, Customer 360, enquiries, jobs, bookings, finance and referrals;
- Content Studio, marketing/performance tools, Connections and provider authorisation;
- governance, approval controls, maker/checker quality controls and audit trails;
- PWA install experience, service worker protections, SEO/GEO/AEO and answer-centre support;
- AWS/S3/KMS configuration placeholders without embedding real secrets.

Start with `READ_ME_FIRST.txt`, then `docs/current/FINAL_MERGE_AUDIT_2026-09-18.txt`.

Security rule: never commit `.env`, provider secrets, local databases, uploads or runtime logs.
