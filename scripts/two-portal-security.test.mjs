import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { randomUUID } from "node:crypto";
import { createDb } from "../src/db.js";
import { createSubscriptionPolicy } from "../src/subscription-policy.js";
import { createEntitlements } from "../src/entitlements.js";
import { createStaffAccess } from "../src/staff-access.js";
import { installMailCentre, portalMailReceipt } from "../src/mail-centre.js";
import { createPlatformIdentity } from "../src/platform-identity.js";
import { installOperatorConsole } from "../src/operator-console.js";
import { installBusinessHub } from "../src/business-hub.js";
import { createBillingOps } from "../src/billing-ops.js";
const at = () => new Date().toISOString();
function setup() {
  const db = createDb(":memory:"),
    ids = {},
    now = at();
  for (const label of ["a", "b"]) {
    const org = randomUUID(),
      user = randomUUID();
    ids[label] = { org, user };
    db.prepare(
      "INSERT INTO organisations(id,name,slug,created_at,updated_at) VALUES (?,?,?,?,?)",
    ).run(org, label, label, now, now);
    db.prepare(
      "INSERT INTO users(id,email,full_name,password_hash,password_salt,created_at,updated_at) VALUES (?,?,?,?,?,?,?)",
    ).run(user, label + "@example.test", label, "hash", "salt", now, now);
    db.prepare(
      "INSERT INTO memberships(organisation_id,user_id,role,created_at) VALUES (?,?,?,?)",
    ).run(org, user, "owner", now);
    db.prepare(
      "INSERT INTO organisation_subscriptions(organisation_id,plan_id,status,payment_status,trial_ends_at,created_at,updated_at) VALUES (?,'starter','trialing','unpaid','2000-01-01T00:00:00.000Z',?,?)",
    ).run(org, now, now);
  }
  const audit = () => {},
    staffAccess = createStaffAccess({ db, audit }),
    policy = createSubscriptionPolicy({ db }),
    entitlements = createEntitlements({ db, policy }),
    app = express();
  app.use(express.json());
  const founderAuthenticate = (req, res, next) =>
    req.get("x-admin-key") === "founder-test-only"
      ? next()
      : res.status(401).json({ ok: false });
  const env = { INTEGRATION_ENCRYPTION_KEY: "e".repeat(64) },
    platform = createPlatformIdentity({
      db,
      env,
      validTotp: (_s, c) => c === "123456",
      founderAuthenticate,
    });
  platform.install(app, { limiter: (_q, _s, n) => n() });
  const requireSaasUser = (req, res, next) => {
    const id = ids[req.get("x-test-user")];
    if (!id) return res.status(401).json({ ok: false });
    const m = db
      .prepare(
        "SELECT role FROM memberships WHERE user_id=? AND organisation_id=? AND status='active'",
      )
      .get(id.user, id.org);
    if (!m) return res.status(401).json({ ok: false });
    req.saas = { organisation_id: id.org, user_id: id.user, role: m.role };
    if (!staffAccess.enforce(req, res)) return;
    next();
  };
  const requireSaasRole =
    (...roles) =>
    (req, res, next) =>
      roles.includes(req.saas.role) || staffAccess.delegated(req)
        ? next()
        : res.status(403).json({ ok: false });
  const sent = [];
  const mail = installMailCentre(app, {
    db,
    env,
    uploadRoot: "/tmp",
    platform,
    requireSaasUser,
    requireSaasRole,
    staffAccess,
    saasAudit: audit,
    generateAiText: async () => ({ text: "Draft only" }),
    timers: false,
    transport: async (m) => {
      sent.push(m.id);
      return "provider-" + m.id;
    },
  });
  createBillingOps({ db, env, lifecycle: {}, entitlements, timers: false });
  installOperatorConsole(app, {
    db,
    env,
    platform,
    policy,
    requireSaasUser,
    requireSaasRole,
    saasAudit: audit,
    entitlements,
  });
  installBusinessHub(app, {
    db,
    requireSaasUser,
    requireSaasRole,
    saasAudit: audit,
    staffAccess,
  });
  return { db, ids, app, mail, sent, policy, entitlements };
}
async function run(t, fn) {
  const f = setup(),
    server = f.app.listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  const base = "http://127.0.0.1:" + server.address().port;
  const call = async (method, path, body, user = "a", extra = {}) => {
    const r = await fetch(base + path, {
      method,
      headers: {
        "content-type": "application/json",
        "x-test-user": user,
        ...extra,
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    return { status: r.status, data: await r.json() };
  };
  try {
    await fn({ ...f, call });
  } finally {
    await new Promise((r) => server.close(r));
    f.db.close();
  }
}
const draft = {
  recipient: "test-recipient@example.test",
  subject: "Private quote",
  body: "Tenant A only",
  category: "enquiry",
};
test("mail isolation, hash-bound approval, concurrent edits and verified receipt ordering", (t) =>
  run(t, async ({ call, db, mail, sent }) => {
    const c = await call("POST", "/api/saas/mail", draft);
    assert.equal(c.status, 201);
    const m = c.data.message;
    assert.equal(
      (await call("GET", "/api/saas/mail/" + m.id, null, "b")).status,
      404,
    );
    assert.equal(
      (await call("GET", "/api/saas/mail", null, "b")).data.messages.length,
      0,
    );
    assert.equal(
      (await call("POST", "/api/saas/mail/" + m.id + "/send", { revision: 1 }))
        .status,
      409,
    );
    assert.equal(
      (
        await call("POST", "/api/saas/mail/" + m.id + "/approve", {
          revision: 1,
        })
      ).status,
      200,
    );
    assert.equal(
      (
        await call("PUT", "/api/saas/mail/" + m.id, {
          ...draft,
          body: "Edited",
          revision: 1,
        })
      ).status,
      200,
    );
    assert.equal(
      (await call("POST", "/api/saas/mail/" + m.id + "/send", { revision: 2 }))
        .status,
      409,
    );
    assert.equal(
      (await call("PUT", "/api/saas/mail/" + m.id, { ...draft, revision: 1 }))
        .status,
      409,
    );
    assert.equal(
      (
        await call("POST", "/api/saas/mail/" + m.id + "/approve", {
          revision: 2,
        })
      ).status,
      200,
    );
    assert.equal(
      (await call("POST", "/api/saas/mail/" + m.id + "/send", { revision: 2 }))
        .status,
      200,
    );
    assert.equal(
      (await call("POST", "/api/saas/mail/" + m.id + "/send", { revision: 2 }))
        .status,
      409,
    );
    assert.equal(sent.length, 1);
    portalMailReceipt("provider-" + m.id, "opened");
    portalMailReceipt("provider-" + m.id, "delivered");
    assert.equal(
      db.prepare("SELECT status FROM portal_mail WHERE id=?").get(m.id).status,
      "opened",
    );
    assert.throws(
      () => db.prepare("DELETE FROM portal_mail_events").run(),
      /Append-only/,
    );
  }));
test("scheduled sender/approver revocation cancels execution before delivery", (t) =>
  run(t, async ({ call, db, ids, mail, sent }) => {
    const date = new Date(Date.now() + 3600000).toISOString(),
      m = (
        await call("POST", "/api/saas/mail", { ...draft, scheduled_at: date })
      ).data.message;
    await call("POST", "/api/saas/mail/" + m.id + "/approve", { revision: 1 });
    assert.equal(
      (await call("POST", "/api/saas/mail/" + m.id + "/send", { revision: 1 }))
        .data.status,
      "scheduled",
    );
    db.prepare("UPDATE memberships SET status='revoked' WHERE user_id=?").run(
      ids.a.user,
    );
    db.prepare(
      "UPDATE portal_mail SET scheduled_at='2000-01-01T00:00:00.000Z' WHERE id=?",
    ).run(m.id);
    await mail.tick();
    assert.equal(sent.length, 0);
    assert.equal(
      db.prepare("SELECT status FROM portal_mail WHERE id=?").get(m.id).status,
      "draft",
    );
  }));
test("ordinary business identity cannot access platform, waivers are per ID and prevent subscription drafts", (t) =>
  run(t, async ({ call, db, ids, policy, entitlements }) => {
    assert.equal((await call("GET", "/api/operator/subscribers")).status, 401);
    assert.equal(
      (
        await call("PUT", "/api/operator/complimentary/" + ids.a.org, {
          revision: 0,
          reason: "Test waiver only",
        })
      ).status,
      401,
    );
    assert.equal(entitlements.planOf(ids.a.org).locked, true);
    const grant = policy.save(
      ids.a.org,
      {
        revision: 0,
        reason: "Internal test waiver only",
        feature_profile: "scale",
      },
      "founder",
    );
    assert.equal(grant.ok, true);
    assert.equal(
      policy.save(
        ids.a.org,
        { revision: 0, reason: "Conflicting update" },
        "founder",
      ).status,
      409,
    );
    assert.equal(entitlements.planOf(ids.a.org).locked, false);
    assert.equal(entitlements.planOf(ids.a.org).plan_name, "Complimentary");
    assert.equal(entitlements.planOf(ids.b.org).locked, true);
    const ops = createBillingOps({
      db,
      env: {},
      lifecycle: {},
      entitlements,
      policy,
      timers: false,
    });
    assert.equal(ops.createDraft(ids.a.org, new Date("2032-01-01")), null);
    assert.equal(policy.revoke(ids.a.org, 1, "founder").ok, true);
    assert.equal(entitlements.planOf(ids.a.org).locked, true);
  }));
test("platform staff permissions are separate, MFA encrypted, revocation ends sessions", (t) =>
  run(t, async ({ call, db }) => {
    const h = { "x-admin-key": "founder-test-only" },
      c = await call(
        "POST",
        "/api/operator/staff",
        {
          email: "support@example.test",
          name: "Support One",
          password: "long-test-passphrase-only",
          role: "support",
          grants: ["support.read", "support.create"],
        },
        "a",
        h,
      );
    assert.equal(c.status, 201);
    const secret = db
      .prepare("SELECT totp_secret FROM platform_users WHERE id=?")
      .get(c.data.id).totp_secret;
    assert.ok(!secret.includes(c.data.totp_secret));
    assert.match(secret, /aes-256-gcm/);
    assert.equal(
      (
        await call(
          "POST",
          "/api/operator/staff",
          {
            email: "bad@example.test",
            name: "Bad User",
            password: "long-test-passphrase-only",
            role: "custom",
            grants: ["founder.read"],
          },
          "a",
          h,
        )
      ).status,
      400,
    );
    db.prepare("INSERT INTO platform_sessions VALUES (?,?,?,?)").run(
      (await import("node:crypto"))
        .createHash("sha256")
        .update("test-platform-token")
        .digest("hex"),
      c.data.id,
      new Date(Date.now() + 3600000).toISOString(),
      at(),
    );
    const token = { "x-platform-session": "test-platform-token" };
    assert.equal(
      (await call("GET", "/api/operator/me", null, "a", token)).status,
      200,
    );
    assert.equal(
      (await call("GET", "/api/operator/complimentary", null, "a", token))
        .status,
      403,
    );
    assert.equal(
      (await call("GET", "/api/operator/subscribers", null, "a", token)).status,
      403,
    );
    assert.equal(
      (
        await call(
          "PUT",
          "/api/operator/staff/" + c.data.id,
          { revision: 1, grants: ["support.read"], status: "suspended" },
          "a",
          h,
        )
      ).status,
      200,
    );
    assert.equal(
      (await call("GET", "/api/operator/me", null, "a", token)).status,
      401,
    );
  }));
test("support requires subscriber approval, has limited scope, expires and revokes", (t) =>
  run(t, async ({ call, db, ids }) => {
    const h = { "x-admin-key": "founder-test-only" },
      r = await call(
        "POST",
        "/api/operator/support-access",
        {
          organisation_id: ids.a.org,
          purpose: "Resolve a customer directory display issue",
          areas: ["customers"],
          hours: 1,
        },
        "a",
        h,
      ),
      id = r.data.id;
    assert.equal(r.status, 201);
    assert.equal(
      (
        await call(
          "GET",
          `/api/operator/support-access/${id}/records/customers`,
          null,
          "a",
          h,
        )
      ).status,
      403,
    );
    assert.equal(
      (
        await call(
          "POST",
          `/api/saas/support-access/${id}/decision`,
          { decision: "approved" },
          "b",
        )
      ).status,
      404,
    );
    assert.equal(
      (
        await call("POST", `/api/saas/support-access/${id}/decision`, {
          decision: "approved",
        })
      ).status,
      200,
    );
    assert.equal(
      (
        await call(
          "GET",
          `/api/operator/support-access/${id}/records/customers`,
          null,
          "a",
          h,
        )
      ).status,
      200,
    );
    assert.equal(
      (
        await call(
          "GET",
          `/api/operator/support-access/${id}/records/jobs`,
          null,
          "a",
          h,
        )
      ).status,
      403,
    );
    await call("POST", `/api/saas/support-access/${id}/decision`, {
      decision: "revoked",
    });
    assert.equal(
      (
        await call(
          "GET",
          `/api/operator/support-access/${id}/records/customers`,
          null,
          "a",
          h,
        )
      ).status,
      403,
    );
    assert.throws(
      () => db.prepare("UPDATE platform_audit SET action='changed'").run(),
      /Append-only/,
    );
  }));
test("business drafts and receptionist settings remain tenant-isolated and no service is activated", (t) =>
  run(t, async ({ call, db, ids }) => {
    const r = await call("POST", "/api/saas/business-hub/quote", {
      title: "Service quote",
      amount_cents: 1000,
    });
    assert.equal(r.status, 201);
    assert.equal(
      (
        await call(
          "POST",
          "/api/saas/business-hub/quote/" + r.data.id + "/approve",
          { revision: 1 },
          "b",
        )
      ).status,
      404,
    );
    assert.equal(
      (await call("GET", "/api/saas/business-hub/quote", null, "b")).data
        .records.length,
      0,
    );
    assert.equal(
      (
        await call("PUT", "/api/saas/receptionist-profile", {
          greeting: "Welcome to Alpha",
          knowledge: "Alpha facts",
          hours: "9 to 5",
          timezone: "Australia/Perth",
          revision: 0,
        })
      ).status,
      200,
    );
    assert.equal(
      (await call("GET", "/api/saas/receptionist-profile", null, "b")).data
        .profile,
      null,
    );
    assert.equal(
      (
        await call("PUT", "/api/saas/receptionist-profile", {
          greeting: "Concurrent",
          knowledge: "",
          hours: "",
          timezone: "Australia/Perth",
          revision: 0,
        })
      ).status,
      409,
    );
    const req = await call("POST", "/api/saas/service-requests/phone", {
      brief: "Request a number quote only",
    });
    assert.equal(req.data.status, "requested");
    assert.equal(
      (await call("GET", "/api/saas/service-requests/phone", null, "b")).data
        .requests.length,
      0,
    );
    assert.equal(
      (await call("GET", "/api/saas/service-requests/phone")).data
        .purchases_enabled,
      false,
    );
  }));
