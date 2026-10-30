# Architecture — recovered Claude release

The source baseline is consolidated-improvements-2026 at 24dd8c7, including every Phase 00–10 commit. All 470 files in SUPER_PRO_AI_EMERGENCY_HANDOVER.zip matched that baseline byte for byte. Recovery combines that source with the verified preview/backup fixes from ee6c36e; it does not replace the Claude frontend with the older codex baseline.

The Node 22 Express process serves three separate surfaces: the redesigned public site through src/public-site.js and saas/site/, the authenticated business workspace through saas/workspace.html, and the separately authenticated Founder Console through office/. The Phase 03 design system lives under saas/ds/. Existing legacy routes remain available where intended.

Business authority comes from server-authenticated membership, not a supplied workspace ID. Pipeline/business-ops, automation, SEO, communications and finance modules register their routes using the existing authentication and feature-permission boundaries. Consequential actions retain approval gates. Founder support access remains consent-bound and audited.

SQLite remains on the existing Render disk; additive schema changes are implemented by src/db.js and module installers. Litestream protects the database. Backup uploads and the separate optional primary object store remain distinct: the new object store is off unless explicitly configured with its own bucket/credentials. No PostgreSQL or storage migration is implied by this release.

Preview startup rejects backup and primary object-storage credentials before application imports, requires writable temporary paths and suppresses dotenv. Production persistence failures remain failures; temporary synthetic preview storage is explicitly a warning.

Detailed implementation references: docs/infrastructure/, docs/design/DESIGN_SYSTEM.md, docs/phase-04/ through docs/phase-10/, FEATURE_INVENTORY.md and PHASE_COMPLETION_MATRIX.md.
