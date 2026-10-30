import { assertIsolatedPreview } from './preview-preflight.js';
// Synthetic acceptance-test identities only. Never imports or reads production data.
import crypto from "node:crypto";
export function seedIsolatedPreview(db, env) {
  if (env.SUPERPRO_ISOLATED_PREVIEW !== "1") return;
  assertIsolatedPreview(env);
  const at = new Date().toISOString();
  db.transaction(() => {
    for (const [label, name] of [
      ["alpha", "Preview Alpha Services"],
      ["beta", "Preview Beta Services"],
    ]) {
      let org = db
        .prepare("SELECT id FROM organisations WHERE slug=?")
        .get("isolated-preview-" + label)?.id;
      if (!org) {
        org = crypto.randomUUID();
        db.prepare(
          "INSERT INTO organisations(id,name,display_name,slug,created_at,updated_at) VALUES (?,?,?,?,?,?)",
        ).run(org, name, name, "isolated-preview-" + label, at, at);
        db.prepare(
          "INSERT INTO organisation_subscriptions(organisation_id,plan_id,status,payment_status,trial_ends_at,created_at,updated_at) VALUES (?,'scale','trialing','unpaid',?,?,?)",
        ).run(org, new Date(Date.now() + 14 * 86400000).toISOString(), at, at);
      }
      for (const role of label === "alpha"
        ? ["owner", "employee"]
        : ["owner"]) {
        const email = role + "." + label + "@preview.invalid";
        if (db.prepare("SELECT 1 FROM users WHERE email=?").get(email))
          continue;
        const id = crypto.randomUUID(),
          salt = crypto.randomBytes(16).toString("hex"),
          hash = crypto
            .scryptSync(env.PREVIEW_BUSINESS_PASSWORD, salt, 64, {
              N: 16384,
              r: 8,
              p: 1,
            })
            .toString("hex");
        db.prepare(
          "INSERT INTO users(id,email,full_name,password_hash,password_salt,email_verified,phone_verified,created_at,updated_at) VALUES (?,?,?,?,?,1,1,?,?)",
        ).run(id, email, "Preview " + label + " " + role, hash, salt, at, at);
        db.prepare(
          "INSERT INTO memberships(organisation_id,user_id,role,created_at) VALUES (?,?,?,?)",
        ).run(org, id, role, at);
      }
    }
  })();
}
