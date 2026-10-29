# Database evaluation and migration plan

Decision: **stay on SQLite now, prepare PostgreSQL, migrate when a trigger below is hit.** No data is moved in Phase 02.

## Evaluation of the current database

| Question | Finding |
| --- | --- |
| Engine | SQLite (`better-sqlite3` 12.4.1), write-ahead log, one file on the Render disk |
| Size of schema | 144 tables from `createDb`, plus module tables; 82 carry `organisation_id` |
| Integrity | `quick_check` and foreign-key check at every start; append-only, hash-chained audit log with triggers that block edits |
| Migrations | Additive self-healing at start-up (`src/diagnostics.js`): missing tables, columns, indexes and triggers are created; nothing is renamed or dropped |
| Tenant scoping | Every business query takes the organisation from the signed-in membership; tested on a real server (`scripts/tenant-isolation.test.mjs`); every tenant table now has an organisation index (`scripts/tenant-indexes.test.mjs`) |
| Transactions | Multi-row writes use `db.transaction` (approvals, payments, media, grants, jobs) |
| Durability | Litestream to S3 every 5 s, hourly snapshots; restore proven by `scripts/restore-drill.test.mjs` |
| Limits | One server process only; writes are serialised; no row-level security in the engine; 0.5 CPU / 512 MB plan |

SQLite is a sound choice for the current scale: a single instance, low write volume, simple operations and very fast reads. The weak points are horizontal scale, in-engine isolation and point-in-time recovery beyond 72 hours.

## When PostgreSQL becomes justified (any one)

1. A second application instance is needed (traffic, zero-downtime deploys, or a separate worker process).
2. About 500 active businesses or sustained write latency above 50 ms at the 95th percentile.
3. A customer or regulator requires managed point-in-time recovery, in-engine encryption controls or Australian-region managed database hosting.
4. Background jobs need their own process that writes concurrently with the web server.

## Target design

- Managed PostgreSQL 16 in Sydney (`ap-southeast-2`): AWS RDS or Aurora, or another provider with an Australian region. Automated backups, 35-day point-in-time recovery, encryption at rest with KMS, private networking.
- One schema; every tenant table keeps `organisation_id NOT NULL` with a foreign key, plus **row-level security**: `ALTER TABLE … ENABLE ROW LEVEL SECURITY` and a policy `organisation_id = current_setting('app.organisation_id')::uuid`. The app sets `SET LOCAL app.organisation_id` inside each request's transaction from the membership, never from the request body.
- Platform tables (platform users, platform audit, subscriber billing) in a separate schema with no tenant policy and no grants to the tenant role.
- Two database roles: `app_tenant` (row-level security enforced) and `app_platform` (founder console). Neither owns tables; an `app_owner` role runs migrations only.
- Audit log: same hash chain; `REVOKE UPDATE, DELETE` plus a trigger.
- Migrations: versioned SQL files (`migrations/NNNN_name.sql`) run by a small runner that records applied versions and wraps each file in a transaction. Expand-then-contract only: add, backfill, switch reads, then remove in a later release.

## Migration steps

| Step | What happens | Exit check | Rollback |
| --- | --- | --- | --- |
| 1. Data-access layer | Wrap SQL in a thin repository per module so queries run on SQLite or PostgreSQL. Start with the busiest tables (sessions, audit, work orders, customers, payments). | All existing tests pass on SQLite | Revert the commit |
| 2. Schema translation | Generate PostgreSQL DDL from the SQLite reference schema; map `TEXT` dates to `timestamptz`, JSON text to `jsonb`, booleans to `boolean`, add `NOT NULL` and foreign keys that SQLite left implicit. | Schema diff test: every SQLite column has a PostgreSQL column | Nothing is live yet |
| 3. Test both engines | Run the full suite against SQLite and against a disposable PostgreSQL in CI. Add tenant tests that prove row-level security blocks a missing `app.organisation_id`. | Both suites green | Nothing is live yet |
| 4. Staging copy | Restore the latest production backup into a private staging service, load it into staging PostgreSQL, run reconciliation: row counts per table, per-organisation counts, checksums of money columns, audit-chain verification. | Reconciliation exact | Drop staging database |
| 5. Dual-write in production | Writes go to SQLite (source of truth) and PostgreSQL; a nightly job compares. | 14 days with zero differences | Turn dual-write off |
| 6. Switch reads | Reads move to PostgreSQL behind a setting, SQLite still written. | 7 days stable, error rate unchanged | Flip the setting back |
| 7. Cut-over | Short maintenance window: stop writes, final sync, verify, switch writes. SQLite file and Litestream copies kept read-only for 90 days. | Post-deploy check and reconciliation pass | Switch back to SQLite (still current to the cut-over moment) |

Every step needs the founder's approval before it touches production. No production data is deleted at any step.

## Rules that apply now (SQLite) and later (PostgreSQL)

- Never take `organisation_id` or a workspace ID from the request body or headers as authority; the membership decides.
- Every new business table has `organisation_id`, an index starting with it, and a tenant test.
- Every write that spans rows runs in one transaction.
- Every migration is additive in the release that introduces it.
