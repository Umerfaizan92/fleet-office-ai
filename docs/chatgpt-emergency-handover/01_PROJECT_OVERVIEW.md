# Project overview

Super Pro AI Office Manager is a multi-tenant "AI office manager" SaaS for Australian small businesses. One Node 22
Express service (`src/server.js`) serves three surfaces:
1. the public website (`/`, built from `scripts/site/`);
2. the Subscriber Workspace (`/saas/workspace.html`), for each business;
3. the Founder Console (`/office/`), for the platform owner, Faizan.

The database is SQLite (better-sqlite3) on the Render disk `/var/data`. Litestream replicates it to an S3 backup
bucket. The frontend is plain JavaScript with no build step. Tests use Node's test runner plus Playwright and axe.
See `docs/release/FEATURE_INVENTORY.md` for every module.
