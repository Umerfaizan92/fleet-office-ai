// One workflow, two ownership domains. No browser-supplied tenant IDs, sender IDs or receipt claims.
import crypto from "node:crypto";
import { z } from "zod";
import { trackCommunication } from "./message-delivery.js";
let receiptHandler = null,
  inboundHandler = null;
export const portalMailReceipt = (...args) => receiptHandler?.(...args);
export const portalMailInbound = (...args) => inboundHandler?.(...args);
import {
  renderEmail,
  platformBrand,
  tenantBrandFor,
} from "./email-templates.js";
const now = () => new Date().toISOString();
const digest = (m) =>
  crypto
    .createHash("sha256")
    .update(
      JSON.stringify([
        m.recipient,
        m.subject,
        m.body,
        m.category,
        m.scheduled_at,
        m.revision,
      ]),
    )
    .digest("hex");
export function installMailCentre(
  app,
  {
    db,
    env,
    uploadRoot,
    platform,
    requireSaasUser,
    requireSaasRole,
    staffAccess,
    saasAudit,
    generateAiText,
    entitlements,
    timers = true,
    transport,
  },
) {
  db.exec(`CREATE TABLE IF NOT EXISTS portal_mail(id TEXT PRIMARY KEY,scope TEXT NOT NULL CHECK(scope IN ('business','platform')),owner_id TEXT NOT NULL,direction TEXT NOT NULL DEFAULT 'outbound',recipient TEXT NOT NULL,subject TEXT NOT NULL,body TEXT NOT NULL,category TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'draft',revision INTEGER NOT NULL DEFAULT 1,created_by TEXT NOT NULL,approved_by TEXT,approval_hash TEXT,scheduled_at TEXT,scheduled_by TEXT,provider_id TEXT,read_at TEXT,created_at TEXT NOT NULL,updated_at TEXT NOT NULL);
 CREATE INDEX IF NOT EXISTS portal_mail_owner ON portal_mail(scope,owner_id,status,created_at);
 CREATE INDEX IF NOT EXISTS portal_mail_due ON portal_mail(status,scheduled_at) WHERE status='scheduled';
 CREATE UNIQUE INDEX IF NOT EXISTS portal_mail_provider ON portal_mail(provider_id) WHERE provider_id IS NOT NULL;
 CREATE TABLE IF NOT EXISTS portal_mail_events(id INTEGER PRIMARY KEY,mail_id TEXT NOT NULL,scope TEXT NOT NULL,owner_id TEXT NOT NULL,actor TEXT NOT NULL,action TEXT NOT NULL,revision INTEGER NOT NULL,created_at TEXT NOT NULL);
 CREATE TRIGGER IF NOT EXISTS portal_mail_events_no_update BEFORE UPDATE ON portal_mail_events BEGIN SELECT RAISE(ABORT,'Append-only mail events'); END;
 CREATE TRIGGER IF NOT EXISTS portal_mail_events_no_delete BEFORE DELETE ON portal_mail_events BEGIN SELECT RAISE(ABORT,'Append-only mail events'); END;`);
  if (
    !db
      .prepare("PRAGMA table_info(portal_mail)")
      .all()
      .some((c) => c.name === "scheduled_by")
  )
    db.exec("ALTER TABLE portal_mail ADD COLUMN scheduled_by TEXT");
  const ctx = (req) =>
    req.platform
      ? { scope: "platform", owner: "superpro", actor: req.platform.id }
      : {
          scope: "business",
          owner: req.saas.organisation_id,
          actor: req.saas.user_id,
        };
  const event = (c, m, action) => {
    db.prepare(
      "INSERT INTO portal_mail_events(mail_id,scope,owner_id,actor,action,revision,created_at) VALUES (?,?,?,?,?,?,?)",
    ).run(m.id, c.scope, c.owner, c.actor, action, m.revision, now());
    if (c.scope === "platform")
      platform.log(c.actor, "mail." + action, "support", m.id);
  };
  const row = (req, id) => {
    const c = ctx(req),
      m = db
        .prepare(
          "SELECT * FROM portal_mail WHERE id=? AND scope=? AND owner_id=?",
        )
        .get(id, c.scope, c.owner);
    if (
      c.scope === "platform" &&
      !["founder", "admin"].includes(req.platform.role) &&
      m?.created_by !== c.actor
    )
      return null;
    return m;
  };
  const fail = (res, status, error) =>
    res.status(status).json({ ok: false, error });
  const clean = (m) => {
    if (!m) return m;
    const { approval_hash, ...safe } = m;
    return safe;
  };
  const bodySchema = z
    .object({
      recipient: z.email().max(254),
      subject: z.string().trim().min(1).max(240),
      body: z.string().trim().min(1).max(30000),
      category: z
        .enum([
          "general",
          "support",
          "enquiry",
          "invoice",
          "marketing",
          "campaign",
        ])
        .default("general"),
      scheduled_at: z.iso.datetime().nullable().default(null),
      revision: z.number().int().min(1).optional(),
    })
    .strict();
  // Dedicated action gates keep send and approve separate, including default roles.
  const businessGate = (action) => [
    requireSaasUser,
    (req, res, next) => {
      if (!staffAccess.can(req, "mail", action))
        return fail(
          res,
          403,
          "Your owner has not authorised this email action.",
        );
      next();
    },
  ];
  const platformGate = (action) => [
    platform.identity,
    platform.permit("support", action),
  ];
  const audit = (req, m, action) => {
    event(ctx(req), m, action);
    if (req.saas)
      saasAudit(req, "mail." + action, "email", m.id, {
        revision: m.revision,
        category: m.category,
      });
  };
  for (const [base, gates] of [
    ["/api/saas/mail", businessGate],
    ["/api/operator/mail", platformGate],
  ]) {
    app.get(base, ...gates("read"), (req, res) => {
      const c = ctx(req),
        folder = String(req.query.folder || "all"),
        q = String(req.query.q || "").slice(0, 100);
      let clause = "";
      const args = [c.scope, c.owner];
      if (folder === "received") clause = " AND direction='inbound'";
      else if (folder === "sent")
        clause = " AND status IN ('accepted','sent','delivered','opened')";
      else if (folder === "scheduled") clause = " AND status='scheduled'";
      else if (folder === "drafts")
        clause = " AND status IN ('draft','approved')";
      else if (
        ["marketing", "campaign", "enquiry", "invoice", "support"].includes(
          folder,
        )
      ) {
        clause = " AND category=?";
        args.push(folder);
      }
      if (q) {
        clause += " AND (subject LIKE ? OR recipient LIKE ?)";
        args.push("%" + q + "%", "%" + q + "%");
      }
      if (
        c.scope === "platform" &&
        !["founder", "admin"].includes(req.platform.role)
      ) {
        clause += " AND created_by=?";
        args.push(c.actor);
      }
      const messages = db
        .prepare(
          "SELECT * FROM portal_mail WHERE scope=? AND owner_id=?" +
            clause +
            " ORDER BY created_at DESC LIMIT 100",
        )
        .all(...args)
        .map(clean);
      const received =
        c.scope === "business" && ["all", "received"].includes(folder)
          ? db
              .prepare(
                "SELECT m.id,t.contact_address recipient,t.subject,m.body,m.status,m.created_at,'received' category FROM comms_messages m JOIN comms_threads t ON t.id=m.thread_id AND t.organisation_id=m.organisation_id WHERE m.organisation_id=? AND m.direction='inbound' AND t.channel='email' ORDER BY m.created_at DESC LIMIT 100",
              )
              .all(c.owner)
              .filter(
                (m) =>
                  !q ||
                  ((m.subject || "") + " " + m.recipient)
                    .toLowerCase()
                    .includes(q.toLowerCase()),
              )
          : [];
      res.json({
        ok: true,
        messages,
        received,
        provider_ready: Boolean(
          env.RESEND_API_KEY &&
          (env.PLATFORM_NOTICE_FROM || env.SAAS_VERIFY_FROM),
        ),
        receipts_note:
          "Accepted is not delivered. Email opens are tracking signals, not proof a person read it.",
      });
    });
    app.get(base + "/:id", ...gates("read"), (req, res) => {
      const m = row(req, req.params.id);
      if (!m) return fail(res, 404, "Email not found.");
      const c = ctx(req);
      audit(req, m, "viewed");
      res.json({
        ok: true,
        message: clean(m),
        events: db
          .prepare(
            "SELECT actor,action,revision,created_at FROM portal_mail_events WHERE mail_id=? AND scope=? AND owner_id=? ORDER BY id",
          )
          .all(m.id, c.scope, c.owner),
      });
    });
    const save = (req, res) => {
      const p = bodySchema.safeParse(req.body);
      if (!p.success)
        return fail(
          res,
          400,
          "Provide recipient, subject, text, category and a valid schedule.",
        );
      if (p.data.scheduled_at && Date.parse(p.data.scheduled_at) <= Date.now())
        return fail(res, 400, "Scheduled time must be in the future.");
      const c = ctx(req),
        old = req.params.id ? row(req, req.params.id) : null;
      if (req.params.id && !old) return fail(res, 404, "Email not found.");
      if (
        old &&
        (!["draft", "approved", "scheduled"].includes(old.status) ||
          old.revision !== p.data.revision)
      )
        return fail(
          res,
          409,
          "Email changed or has already been sent. Reload it.",
        );
      const id = old?.id || crypto.randomUUID(),
        at = now(),
        rev = (old?.revision || 0) + 1;
      db.transaction(() => {
        if (old) {
          const r = db
            .prepare(
              "UPDATE portal_mail SET recipient=?,subject=?,body=?,category=?,scheduled_at=?,revision=?,status='draft',approved_by=NULL,approval_hash=NULL,updated_at=? WHERE id=? AND scope=? AND owner_id=? AND revision=?",
            )
            .run(
              p.data.recipient,
              p.data.subject,
              p.data.body,
              p.data.category,
              p.data.scheduled_at,
              rev,
              at,
              id,
              c.scope,
              c.owner,
              old.revision,
            );
          if (!r.changes) throw Error("Concurrent email update");
        } else
          db.prepare(
            "INSERT INTO portal_mail(id,scope,owner_id,recipient,subject,body,category,scheduled_at,created_by,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
          ).run(
            id,
            c.scope,
            c.owner,
            p.data.recipient,
            p.data.subject,
            p.data.body,
            p.data.category,
            p.data.scheduled_at,
            c.actor,
            at,
            at,
          );
        audit(
          req,
          { id, revision: rev, category: p.data.category },
          old ? "edited_approval_reset" : "draft_created",
        );
      })();
      res
        .status(old ? 200 : 201)
        .json({ ok: true, message: clean(row(req, id)) });
    };
    app.post(base, ...gates("create"), save);
    app.put(base + "/:id", ...gates("edit"), save);
    app.post(base + "/:id/approve", ...gates("approve"), (req, res) => {
      const m = row(req, req.params.id);
      if (!m) return fail(res, 404, "Email not found.");
      if (m.status !== "draft" || req.body?.revision !== m.revision)
        return fail(
          res,
          409,
          "Reload and review the current draft before approving.",
        );
      const c = ctx(req);
      db.prepare(
        "UPDATE portal_mail SET status='approved',approved_by=?,approval_hash=?,updated_at=? WHERE id=? AND revision=? AND status='draft'",
      ).run(c.actor, digest(m), now(), m.id, m.revision);
      audit(req, m, "approved");
      res.json({ ok: true, message: clean(row(req, m.id)) });
    });
    app.post(base + "/:id/send", ...gates("send"), async (req, res) => {
      const m = row(req, req.params.id);
      if (!m) return fail(res, 404, "Email not found.");
      if (
        req.body?.revision !== m.revision ||
        m.status !== "approved" ||
        m.approval_hash !== digest(m)
      )
        return fail(
          res,
          409,
          "Current content must be reviewed and approved first.",
        );
      if (["marketing", "campaign"].includes(m.category))
        return fail(
          res,
          409,
          "Bulk/marketing delivery requires a verified audience, opt-out enforcement and configured campaign transport. This draft is retained.",
        );
      if (m.scheduled_at) {
        db.prepare(
          "UPDATE portal_mail SET status='scheduled',scheduled_by=?,updated_at=? WHERE id=? AND status='approved'",
        ).run(ctx(req).actor, now(), m.id);
        audit(req, m, "scheduled");
        return res.json({ ok: true, status: "scheduled" });
      }
      const r = await dispatch(m, ctx(req));
      res.status(r.ok ? 200 : 409).json(r);
    });
    app.post(base + "/:id/cancel", ...gates("edit"), (req, res) => {
      const m = row(req, req.params.id);
      if (!m) return fail(res, 404, "Email not found.");
      if (
        req.body?.revision !== m.revision ||
        !["draft", "approved", "scheduled"].includes(m.status)
      )
        return fail(res, 409, "Email changed or delivery already started.");
      db.prepare(
        "UPDATE portal_mail SET status='cancelled',approval_hash=NULL,updated_at=? WHERE id=?",
      ).run(now(), m.id);
      audit(req, m, "cancelled");
      res.json({ ok: true });
    });
    app.post(base + "/ai/draft", ...gates("create"), async (req, res) => {
      const p = z
        .object({
          brief: z.string().trim().min(8).max(5000),
          category: z
            .enum([
              "general",
              "support",
              "enquiry",
              "invoice",
              "marketing",
              "campaign",
            ])
            .default("general"),
        })
        .strict()
        .safeParse(req.body);
      if (!p.success) return fail(res, 400, "Describe the draft you need.");
      const c = ctx(req);
      if (c.scope === "business" && entitlements) {
        const gate = entitlements.check(c.owner, "ai");
        if (!gate.ok) return fail(res, 403, gate.error);
        db.prepare(
          "INSERT INTO usage_events(id,organisation_id,kind,created_at) VALUES (?,?,?,?)",
        ).run(crypto.randomUUID(), c.owner, "ai", now());
      }
      try {
        const answer = await generateAiText({
            system:
              "Draft professional email text for " +
              (c.scope === "platform"
                ? "Super Pro AI"
                : "one isolated business") +
              ". Use only supplied facts. Never send or invent facts. Return a draft for review.",
            messages: [{ role: "user", content: p.data.brief }],
            conversation_id:
              c.scope + ":" + c.owner + ":mail:" + crypto.randomUUID(),
            remember_conversation: false,
          }),
          text = typeof answer === "string" ? answer : answer.text;
        event(c, { id: "ai-draft", revision: 1 }, "ai_draft_requested");
        res.json({ ok: true, draft: text, requires_approval: true });
      } catch {
        return fail(
          res,
          503,
          "AI drafting is unavailable. You can write a draft manually.",
        );
      }
    });
  }
  function authorised(m, action, user) {
    if (m.scope === "platform") {
      if (user === "founder") return true;
      const u = db
        .prepare(
          "SELECT grants_json FROM platform_users WHERE id=? AND status='active'",
        )
        .get(user);
      if (!u) return false;
      const g = JSON.parse(u.grants_json);
      return g.includes("support.read") && g.includes("support." + action);
    }
    const member = db
      .prepare(
        "SELECT role FROM memberships m JOIN users u ON u.id=m.user_id WHERE m.organisation_id=? AND m.user_id=? AND m.status='active' AND u.status='active'",
      )
      .get(m.owner_id, user);
    if (!member) return false;
    const g = staffAccess.policy(m.owner_id, user, member.role);
    return (
      member.role === "owner" ||
      (g.grants.includes("mail.read") && g.grants.includes("mail." + action))
    );
  }
  async function dispatch(m, c) {
    if (
      !authorised(m, "approve", m.approved_by) ||
      !authorised(m, "send", c.actor)
    ) {
      db.prepare(
        "UPDATE portal_mail SET status='draft',approval_hash=NULL,approved_by=NULL,updated_at=? WHERE id=?",
      ).run(now(), m.id);
      event(c, m, "authorisation_revoked");
      return {
        ok: false,
        error: "Sender or approver access was revoked. Review again.",
      };
    }
    const from =
      m.scope === "platform"
        ? env.PLATFORM_NOTICE_FROM || env.SAAS_VERIFY_FROM
        : env.SAAS_VERIFY_FROM;
    if (!transport && (!env.RESEND_API_KEY || !from))
      return {
        ok: false,
        error:
          "Verified sender and email provider must be configured before delivery.",
      };
    if (
      !db
        .prepare(
          "UPDATE portal_mail SET status='sending',updated_at=? WHERE id=? AND status IN ('approved','scheduled') AND approval_hash=?",
        )
        .run(now(), m.id, digest(m)).changes
    )
      return {
        ok: false,
        error: "Delivery already started or approval changed.",
      };
    event(c, m, "sending");
    try {
      const brand =
          m.scope === "platform"
            ? platformBrand(env)
            : tenantBrandFor(db, uploadRoot, m.owner_id),
        rendered = renderEmail(brand, {
          heading: m.subject,
          paragraphs: [m.body],
        }),
        replyTo =
          m.scope === "business"
            ? db
                .prepare(
                  "SELECT address FROM comms_channels WHERE organisation_id=? AND channel='email' AND status='active'",
                )
                .get(m.owner_id)?.address
            : env.SUPERPRO_SUPPORT_EMAIL;
      let providerId;
      if (transport) providerId = await transport(m);
      else {
        const r = await fetch("https://api.resend.com/emails", {
          method: "POST",
          signal: AbortSignal.timeout(20000),
          headers: {
            authorization: "Bearer " + env.RESEND_API_KEY,
            "content-type": "application/json",
            "Idempotency-Key": "sp-mail-" + m.id + "-" + m.revision,
          },
          body: JSON.stringify({
            from,
            to: [m.recipient],
            subject: m.subject,
            html: rendered.html,
            text: rendered.text,
            ...(replyTo ? { reply_to: replyTo } : {}),
            ...(brand.attachments?.length
              ? { attachments: brand.attachments }
              : {}),
          }),
        });
        if (!r.ok) {
          db.prepare(
            "UPDATE portal_mail SET status='failed',updated_at=? WHERE id=?",
          ).run(now(), m.id);
          event(c, m, "provider_rejected");
          return {
            ok: false,
            error:
              "Provider rejected delivery. No delivered status has been recorded.",
          };
        }
        providerId = (await r.json()).id;
      }
      if (!providerId) throw Error("Missing provider acknowledgement");
      db.prepare(
        "UPDATE portal_mail SET status='accepted',provider_id=?,updated_at=? WHERE id=?",
      ).run(providerId, now(), m.id);
      event(c, m, "provider_accepted");
      if (m.scope === "business")
        trackCommunication(
          {
            organisationId: m.owner_id,
            userId: c.actor,
            channel: "email",
            recipient: m.recipient,
            category: m.category,
            subject: m.subject,
            followUp:
              m.category === "enquiry"
                ? {
                    subject: "Following up: " + m.subject,
                    brand: {
                      name: brand.name,
                      color: brand.color,
                      footer: brand.footer,
                      links: brand.links,
                      logoSrc: "",
                    },
                    replyTo,
                    frame: {
                      heading: "A quick follow-up",
                      paragraphs: [
                        brand.name +
                          " is following up on the message sent yesterday. Please reply if you would like assistance.",
                      ],
                    },
                  }
                : null,
          },
          { sent: true, email_id: providerId },
        );
      return { ok: true, status: "accepted" };
    } catch {
      db.prepare(
        "UPDATE portal_mail SET status='delivery_unknown',updated_at=? WHERE id=?",
      ).run(now(), m.id);
      event(c, m, "delivery_unknown");
      return {
        ok: false,
        error:
          "Delivery outcome is unknown. Reconcile with the provider before retrying.",
      };
    }
  }
  async function tick() {
    for (const m of db
      .prepare(
        "SELECT * FROM portal_mail WHERE status='scheduled' AND scheduled_at<=? ORDER BY scheduled_at LIMIT 20",
      )
      .all(now()))
      await dispatch(m, {
        scope: m.scope,
        owner: m.owner_id,
        actor: m.scheduled_by || m.created_by,
      });
  }
  if (timers) {
    const t = setInterval(() => {
      tick().catch(() => {});
    }, 60000);
    t.unref?.();
  }
  receiptHandler = (providerId, state) => {
    if (
      !providerId ||
      !["sent", "delivered", "opened", "failed"].includes(state)
    )
      return;
    const m = db
      .prepare("SELECT * FROM portal_mail WHERE provider_id=?")
      .get(providerId);
    if (!m) return;
    const rank = { accepted: 0, sent: 1, delivered: 2, opened: 3, failed: 4 };
    if ((rank[m.status] ?? -1) >= rank[state]) return;
    db.prepare("UPDATE portal_mail SET status=?,updated_at=? WHERE id=?").run(
      state,
      now(),
      m.id,
    );
    event(
      { scope: m.scope, owner: m.owner_id, actor: "verified_provider" },
      m,
      "receipt_" + state,
    );
  };
  inboundHandler = (mail) => {
    if (!mail.provider_id || !mail.owner_id) return;
    const id = crypto.randomUUID(),
      at = now();
    db.prepare(
      "INSERT OR IGNORE INTO portal_mail(id,scope,owner_id,direction,recipient,subject,body,category,status,created_by,provider_id,created_at,updated_at) VALUES (?,?,?,'inbound',?,?,?,'general','received','verified_provider',?,?,?)",
    ).run(
      id,
      mail.scope,
      mail.owner_id,
      mail.from,
      mail.subject || "Received email",
      mail.body || "",
      mail.provider_id,
      at,
      at,
    );
  };
  return { tick, dispatch };
}
