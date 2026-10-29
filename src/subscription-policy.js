// Software entitlements are independent of provider-funded usage. No identity/name exceptions.
import crypto from "node:crypto";
import { z } from "zod";
export function createSubscriptionPolicy({ db, audit = () => {} }) {
  db.exec(`CREATE TABLE IF NOT EXISTS complimentary_grants(
 organisation_id TEXT PRIMARY KEY REFERENCES organisations(id),feature_profile TEXT NOT NULL,
 starts_at TEXT NOT NULL,ends_at TEXT,reason TEXT NOT NULL,granted_by TEXT NOT NULL,
 revision INTEGER NOT NULL DEFAULT 1,revoked_at TEXT,updated_at TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS complimentary_grant_events(id TEXT PRIMARY KEY,organisation_id TEXT NOT NULL,actor TEXT NOT NULL,revision INTEGER NOT NULL,action TEXT NOT NULL,created_at TEXT NOT NULL);
 CREATE TRIGGER IF NOT EXISTS complimentary_events_no_update BEFORE UPDATE ON complimentary_grant_events BEGIN SELECT RAISE(ABORT,'Append-only grant history'); END;
 CREATE TRIGGER IF NOT EXISTS complimentary_events_no_delete BEFORE DELETE ON complimentary_grant_events BEGIN SELECT RAISE(ABORT,'Append-only grant history'); END;`);
  const active = (org, at = Date.now()) => {
    const g = db
      .prepare("SELECT * FROM complimentary_grants WHERE organisation_id=?")
      .get(org);
    return g &&
      !g.revoked_at &&
      Date.parse(g.starts_at) <= at &&
      (!g.ends_at || Date.parse(g.ends_at) > at)
      ? g
      : null;
  };
  const schema = z
    .object({
      revision: z.number().int().min(0),
      feature_profile: z
        .enum(["starter", "operations", "scale"])
        .default("scale"),
      reason: z.string().trim().min(8).max(500),
      ends_at: z.iso.datetime().nullable().default(null),
    })
    .strict();
  function save(org, body, actor) {
    const p = schema.safeParse(body);
    if (!p.success)
      return {
        status: 400,
        error: "Choose a feature profile, reason, expiry and current revision.",
      };
    if (p.data.ends_at && Date.parse(p.data.ends_at) <= Date.now())
      return { status: 400, error: "Expiry must be in the future." };
    return db.transaction(() => {
      if (!db.prepare("SELECT 1 FROM organisations WHERE id=?").get(org))
        return { status: 404, error: "Organisation not found." };
      const old = db
        .prepare(
          "SELECT revision FROM complimentary_grants WHERE organisation_id=?",
        )
        .get(org);
      if ((old?.revision || 0) !== p.data.revision)
        return { status: 409, error: "Grant changed. Reload and review." };
      const now = new Date().toISOString(),
        rev = p.data.revision + 1;
      db.prepare(
        `INSERT INTO complimentary_grants VALUES (?,?,?,?,?,?,?,NULL,?) ON CONFLICT(organisation_id) DO UPDATE SET feature_profile=excluded.feature_profile,starts_at=excluded.starts_at,ends_at=excluded.ends_at,reason=excluded.reason,granted_by=excluded.granted_by,revision=excluded.revision,revoked_at=NULL,updated_at=excluded.updated_at`,
      ).run(
        org,
        p.data.feature_profile,
        now,
        p.data.ends_at,
        p.data.reason,
        actor,
        rev,
        now,
      );
      db.prepare(
        "INSERT INTO complimentary_grant_events VALUES (?,?,?,?,?,?)",
      ).run(crypto.randomUUID(), org, actor, rev, "granted", now);
      audit(org, "subscription.complimentary_granted", {
        actor,
        revision: rev,
        feature_profile: p.data.feature_profile,
        ends_at: p.data.ends_at,
      });
      return { ok: true, grant: active(org) };
    })();
  }
  function revoke(org, revision, actor) {
    return db.transaction(() => {
      const now = new Date().toISOString(),
        r = db
          .prepare(
            "UPDATE complimentary_grants SET revoked_at=?,revision=revision+1,updated_at=? WHERE organisation_id=? AND revision=? AND revoked_at IS NULL",
          )
          .run(now, now, org, revision);
      if (!r.changes)
        return { status: 409, error: "Grant changed or is already revoked." };
      db.prepare(
        "INSERT INTO complimentary_grant_events VALUES (?,?,?,?,?,?)",
      ).run(crypto.randomUUID(), org, actor, revision + 1, "revoked", now);
      audit(org, "subscription.complimentary_revoked", {
        actor,
        revision: revision + 1,
      });
      return { ok: true };
    })();
  }
  return { active, save, revoke };
}
