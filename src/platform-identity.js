// Platform staff never authenticate via business memberships or the legacy founder key.
import crypto from "node:crypto";
import { z } from "zod";
import { createIntegrationRuntime } from "./integration-runtime.js";
export const PLATFORM_SECTIONS = [
  "overview",
  "subscribers",
  "billing",
  "support",
  "team",
  "marketing",
  "operations",
  "security",
  "founder",
];
export const PLATFORM_ACTIONS = [
  "read",
  "create",
  "edit",
  "approve",
  "send",
  "publish",
  "delete",
  "export",
];
export const PLATFORM_ROLES = {
  admin: [
    "overview",
    "subscribers",
    "billing",
    "support",
    "team",
    "marketing",
    "operations",
    "security",
  ],
  billing: ["overview", "subscribers", "billing"],
  support: ["overview", "support"],
  marketing: ["marketing"],
  maintenance: ["overview", "operations"],
};
const sha = (s) => crypto.createHash("sha256").update(s).digest("hex");
export function createPlatformIdentity({
  db,
  env,
  validTotp,
  founderAuthenticate,
  audit,
  onFounderLogout = () => {},
}) {
  const vault = createIntegrationRuntime({ env });
  db.exec(`CREATE TABLE IF NOT EXISTS platform_users(id TEXT PRIMARY KEY,email TEXT NOT NULL UNIQUE,name TEXT NOT NULL,password_hash TEXT NOT NULL,salt TEXT NOT NULL,totp_secret TEXT NOT NULL,role TEXT NOT NULL,grants_json TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'active',revision INTEGER NOT NULL DEFAULT 1,created_at TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS platform_notification_reads(user_id TEXT NOT NULL,event_id INTEGER NOT NULL,read_at TEXT NOT NULL,PRIMARY KEY(user_id,event_id));
 CREATE TABLE IF NOT EXISTS platform_sessions(token_hash TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES platform_users(id),expires_at TEXT NOT NULL,created_at TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS platform_audit(id INTEGER PRIMARY KEY,actor TEXT NOT NULL,action TEXT NOT NULL,section TEXT NOT NULL,entity_id TEXT,created_at TEXT NOT NULL,previous_hash TEXT NOT NULL,hash TEXT NOT NULL);
 CREATE TRIGGER IF NOT EXISTS platform_audit_no_update BEFORE UPDATE ON platform_audit BEGIN SELECT RAISE(ABORT,'Append-only platform audit'); END;
 CREATE TRIGGER IF NOT EXISTS platform_audit_no_delete BEFORE DELETE ON platform_audit BEGIN SELECT RAISE(ABORT,'Append-only platform audit'); END;`);
  const hashPassword = (p, s) => crypto.scryptSync(p, s, 64).toString("hex");
  function log(actor, action, section, entity = "") {
    db.transaction(() => {
      const prev =
          db
            .prepare("SELECT hash FROM platform_audit ORDER BY id DESC LIMIT 1")
            .get()?.hash || "",
        at = new Date().toISOString(),
        h = sha(JSON.stringify([prev, actor, action, section, entity, at]));
      db.prepare(
        "INSERT INTO platform_audit(actor,action,section,entity_id,created_at,previous_hash,hash) VALUES (?,?,?,?,?,?,?)",
      ).run(actor, action, section, entity, at, prev, h);
    })();
    audit?.(actor, action, section, entity);
  }
  function readToken(req) {
    const h = req.get("x-platform-session");
    if (h) return h;
    const c = String(req.headers.cookie || "")
      .split(";")
      .map((x) => x.trim())
      .find((x) => x.startsWith("sp_operator="));
    return c ? c.slice(12) : "";
  }
  function identity(req, res, next) {
    res.set("Cache-Control", "no-store");
    if (req.get("x-admin-key"))
      return founderAuthenticate(req, res, () => {
        req.platform = {
          id: "founder",
          name: "Founder",
          role: "founder",
          grants: ["*"],
        };
        next();
      });
    const token = readToken(req),
      u =
        token &&
        db
          .prepare(
            `SELECT u.id,u.email,u.name,u.role,u.grants_json,u.revision FROM platform_sessions s JOIN platform_users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>? AND u.status='active'`,
          )
          .get(sha(token), new Date().toISOString());
    if (!u)
      return res
        .status(401)
        .json({ ok: false, error: "Platform sign-in required." });
    let grants = [];
    try {
      grants = JSON.parse(u.grants_json);
    } catch {}
    req.platform = { ...u, grants };
    next();
  }
  const can = (req, section, action = "read") =>
    req.platform?.role === "founder" ||
    (section !== "founder" &&
      req.platform?.grants?.includes(section + ".read") &&
      req.platform.grants.includes(section + "." + action));
  const permit =
    (section, action = "read") =>
    (req, res, next) => {
      if (!can(req, section, action)) {
        log(req.platform.id, "access.denied", section);
        return res
          .status(403)
          .json({
            ok: false,
            error: "This platform action has not been granted to you.",
          });
      }
      log(req.platform.id, "access." + action, section);
      next();
    };
  const founder = permit("founder");
  function install(app, { limiter }) {
    // Cookie-authenticated mutations require a same-origin browser request. Header credentials remain usable by API clients.
    app.use("/api/operator", (req, res, next) => {
      if (
        !["GET", "HEAD", "OPTIONS"].includes(req.method) &&
        readToken(req) &&
        !req.get("x-platform-session")
      ) {
        let same = false;
        try {
          same =
            new URL(req.get("origin")).origin ===
            new URL(
              env.PUBLIC_BASE_URL || `${req.protocol}://${req.get("host")}`,
            ).origin;
        } catch {}
        if (!same)
          return res
            .status(403)
            .json({ ok: false, error: "Same-origin request required." });
      }
      next();
    });
    app.post("/api/operator/staff/login", limiter, (req, res) => {
      const p = z
        .object({
          email: z.email(),
          password: z.string().max(200),
          code: z.string().regex(/^\d{6}$/),
        })
        .strict()
        .safeParse(req.body);
      if (!p.success)
        return res
          .status(400)
          .json({
            ok: false,
            error: "Enter email, password and authenticator code.",
          });
      const u = db
          .prepare(
            "SELECT * FROM platform_users WHERE email=? AND status='active'",
          )
          .get(p.data.email.toLowerCase()),
        salt = u?.salt || "missing-user-placeholder",
        candidate = hashPassword(p.data.password, salt),
        expected = u?.password_hash || "0".repeat(128);
      if (
        !u ||
        !crypto.timingSafeEqual(
          Buffer.from(candidate),
          Buffer.from(expected),
        ) ||
        !validTotp(vault.decryptBundle(u.totp_secret).secret, p.data.code)
      )
        return res
          .status(401)
          .json({
            ok: false,
            error: "Platform credentials could not be verified.",
          });
      const token = crypto.randomBytes(32).toString("base64url"),
        at = new Date().toISOString();
      db.prepare("DELETE FROM platform_sessions WHERE expires_at<=?").run(at);
      db.prepare("INSERT INTO platform_sessions VALUES (?,?,?,?)").run(
        sha(token),
        u.id,
        new Date(Date.now() + 8 * 3600000).toISOString(),
        at,
      );
      res.cookie("sp_operator", token, {
        httpOnly: true,
        secure: env.NODE_ENV === "production",
        sameSite: "strict",
        path: "/api/operator",
        maxAge: 8 * 3600000,
      });
      log(u.id, "session.started", "security");
      res.json({ ok: true });
    });
    app.get("/api/operator/me", identity, (req, res) =>
      res.json({
        ok: true,
        user: {
          id: req.platform.id,
          name: req.platform.name,
          role: req.platform.role,
          grants: req.platform.grants,
        },
      }),
    );
    app.post("/api/operator/logout", identity, (req, res) => {
      db.prepare("DELETE FROM platform_sessions WHERE token_hash=?").run(
        sha(readToken(req)),
      );
      if (req.platform.role === "founder") onFounderLogout(req);
      res.clearCookie("sp_operator", { path: "/api/operator" });
      log(req.platform.id, "session.ended", "security");
      res.json({ ok: true });
    });
    app.get("/api/operator/staff", identity, founder, (req, res) =>
      res.json({
        ok: true,
        roles: PLATFORM_ROLES,
        sections: PLATFORM_SECTIONS,
        actions: PLATFORM_ACTIONS,
        users: db
          .prepare(
            "SELECT id,email,name,role,status,revision,grants_json,created_at FROM platform_users ORDER BY created_at DESC",
          )
          .all(),
      }),
    );
    const grantSchema = z
      .array(
        z
          .string()
          .refine((s) =>
            PLATFORM_SECTIONS.filter((x) => x !== "founder").some((x) =>
              PLATFORM_ACTIONS.some((a) => s === x + "." + a),
            ),
          ),
      )
      .max(64)
      .refine((g) =>
        g.every(
          (s) => s.endsWith(".read") || g.includes(s.split(".")[0] + ".read"),
        ),
      );
    app.post("/api/operator/staff", identity, founder, (req, res) => {
      const p = z
        .object({
          email: z.email(),
          name: z.string().trim().min(2).max(120),
          password: z.string().min(14).max(200),
          role: z.enum([
            "admin",
            "billing",
            "support",
            "marketing",
            "maintenance",
            "custom",
          ]),
          grants: grantSchema,
        })
        .strict()
        .safeParse(req.body);
      if (!p.success)
        return res
          .status(400)
          .json({
            ok: false,
            error:
              "Provide individual credentials and valid grants; every action needs view access.",
          });
      if (
        db
          .prepare("SELECT 1 FROM platform_users WHERE email=?")
          .get(p.data.email.toLowerCase())
      )
        return res
          .status(409)
          .json({
            ok: false,
            error: "A platform identity already uses this email.",
          });
      const id = crypto.randomUUID(),
        salt = crypto.randomBytes(16).toString("hex"),
        alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567",
        totpSecret = Array.from(
          crypto.randomBytes(32),
          (b) => alphabet[b % 32],
        ).join("");
      db.prepare(
        "INSERT INTO platform_users(id,email,name,password_hash,salt,totp_secret,role,grants_json,created_at) VALUES (?,?,?,?,?,?,?,?,?)",
      ).run(
        id,
        p.data.email.toLowerCase(),
        p.data.name,
        hashPassword(p.data.password, salt),
        salt,
        JSON.stringify(vault.encryptBundle({ secret: totpSecret })),
        p.data.role,
        JSON.stringify(p.data.grants),
        new Date().toISOString(),
      );
      log(req.platform.id, "staff.created", "founder", id);
      res
        .status(201)
        .json({
          ok: true,
          id,
          totp_secret: totpSecret,
          note: "Shown once. Transfer credentials privately and configure the staff authenticator before sign-in.",
        });
    });
    app.put("/api/operator/staff/:id", identity, founder, (req, res) => {
      const p = z
        .object({
          revision: z.number().int().positive(),
          grants: grantSchema,
          status: z.enum(["active", "suspended"]),
        })
        .strict()
        .safeParse(req.body);
      if (!p.success)
        return res
          .status(400)
          .json({
            ok: false,
            error: "Provide revision, status and valid grants.",
          });
      const r = db.transaction(() => {
        const r = db
          .prepare(
            "UPDATE platform_users SET grants_json=?,status=?,revision=revision+1 WHERE id=? AND revision=?",
          )
          .run(
            JSON.stringify(p.data.grants),
            p.data.status,
            req.params.id,
            p.data.revision,
          );
        if (r.changes) {
          db.prepare("DELETE FROM platform_sessions WHERE user_id=?").run(
            req.params.id,
          );
          log(
            req.platform.id,
            "staff.access_changed",
            "founder",
            req.params.id,
          );
        }
        return r;
      })();
      if (!r.changes)
        return res
          .status(409)
          .json({ ok: false, error: "Staff access changed. Reload." });
      res.json({ ok: true });
    });
    app.get("/api/operator/notifications", identity, (req, res) => {
      const events = db
        .prepare(
          "SELECT a.id,a.action,a.section,a.created_at,r.read_at FROM platform_audit a LEFT JOIN platform_notification_reads r ON r.event_id=a.id AND r.user_id=? ORDER BY a.id DESC LIMIT 200",
        )
        .all(req.platform.id)
        .filter((e) => can(req, e.section))
        .slice(0, 50);
      res.json({ ok: true, events });
    });
    app.post("/api/operator/notifications/read", identity, (req, res) => {
      const p = z
        .object({ ids: z.array(z.number().int().positive()).max(50) })
        .strict()
        .safeParse(req.body);
      if (!p.success)
        return res
          .status(400)
          .json({ ok: false, error: "Choose valid notifications." });
      const put = db.prepare(
        "INSERT OR IGNORE INTO platform_notification_reads VALUES (?,?,?)",
      );
      db.transaction(() => {
        for (const id of p.data.ids) {
          const event = db
            .prepare("SELECT section FROM platform_audit WHERE id=?")
            .get(id);
          if (event && can(req, event.section))
            put.run(req.platform.id, id, new Date().toISOString());
        }
      })();
      res.json({ ok: true });
    });
    app.get("/api/operator/audit", identity, permit("security"), (req, res) =>
      res.json({
        ok: true,
        events: db
          .prepare("SELECT * FROM platform_audit ORDER BY id DESC LIMIT 200")
          .all(),
      }),
    );
  }
  return { identity, permit, can, log, install };
}
