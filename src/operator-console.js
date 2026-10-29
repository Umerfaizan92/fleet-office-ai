import crypto from "node:crypto";
import { z } from "zod";
const iso = () => new Date().toISOString();
export function installOperatorConsole(
  app,
  {
    db,
    env,
    platform,
    policy,
    requireSaasUser,
    requireSaasRole,
    saasAudit,
    entitlements,
  },
) {
  db.exec(`CREATE TABLE IF NOT EXISTS platform_records(id TEXT PRIMARY KEY,kind TEXT NOT NULL,title TEXT NOT NULL,body TEXT NOT NULL DEFAULT '',status TEXT NOT NULL DEFAULT 'open',assigned_to TEXT,revision INTEGER NOT NULL DEFAULT 1,created_by TEXT NOT NULL,created_at TEXT NOT NULL,updated_at TEXT NOT NULL);
 CREATE INDEX IF NOT EXISTS platform_records_kind ON platform_records(kind,status,created_at);
 CREATE TABLE IF NOT EXISTS support_access_requests(id TEXT PRIMARY KEY,organisation_id TEXT NOT NULL REFERENCES organisations(id),requested_by TEXT NOT NULL,purpose TEXT NOT NULL,scope_json TEXT NOT NULL,hours INTEGER NOT NULL,status TEXT NOT NULL DEFAULT 'pending',approved_by TEXT,expires_at TEXT,revoked_at TEXT,created_at TEXT NOT NULL);
 CREATE INDEX IF NOT EXISTS support_access_org ON support_access_requests(organisation_id,status);`);
  const guard = (section, action = "read") => [
    platform.identity,
    platform.permit(section, action),
  ];
  app.get("/api/operator/overview", ...guard("overview"), (req, res) => {
    const counts = db
        .prepare(
          "SELECT status,COUNT(*) count FROM organisation_subscriptions GROUP BY status",
        )
        .all(),
      complimentary = db
        .prepare("SELECT organisation_id FROM complimentary_grants")
        .all()
        .filter((g) => policy.active(g.organisation_id)).length;
    res.json({
      ok: true,
      counts,
      complimentary,
      platform_records: db
        .prepare(
          "SELECT kind,status,COUNT(*) count FROM platform_records GROUP BY kind,status",
        )
        .all(),
      provider_readiness: {
        email: Boolean(env.RESEND_API_KEY && env.SAAS_VERIFY_FROM),
        voice: Boolean(env.TELNYX_API_KEY),
        video: false,
        domains: false,
      },
      release: { version: "20.0.0-preview", automatic_deploy: false },
    });
  });
  app.get("/api/operator/subscribers", ...guard("subscribers"), (req, res) => {
    const rows = db
      .prepare(
        `SELECT o.id,COALESCE(o.display_name,o.name) business,o.created_at,s.plan_id,s.status,s.payment_status,s.trial_ends_at FROM organisations o JOIN organisation_subscriptions s ON s.organisation_id=o.id ORDER BY o.created_at DESC LIMIT 300`,
      )
      .all()
      .map((o) => ({ ...o, complimentary: Boolean(policy.active(o.id)) }));
    res.json({ ok: true, subscribers: rows });
  });
  app.get(
    "/api/operator/subscribers/:id",
    ...guard("subscribers"),
    (req, res) => {
      const o = db
        .prepare(
          "SELECT id,COALESCE(display_name,name) business,created_at FROM organisations WHERE id=?",
        )
        .get(req.params.id);
      if (!o)
        return res
          .status(404)
          .json({ ok: false, error: "Subscriber not found." });
      res.json({
        ok: true,
        organisation: o,
        plan: entitlements.planOf(o.id),
        usage: entitlements.usage(o.id),
      });
    },
  );
  app.get("/api/operator/invoices", ...guard("billing"), (req, res) =>
    res.json({
      ok: true,
      invoices: db
        .prepare(
          "SELECT id,organisation_id,number,total_cents,status,due_at,send_at,created_at FROM platform_invoices ORDER BY created_at DESC LIMIT 200",
        )
        .all(),
    }),
  );
  app.get("/api/operator/complimentary", ...guard("founder"), (req, res) =>
    res.json({
      ok: true,
      grants: db
        .prepare("SELECT * FROM complimentary_grants ORDER BY updated_at DESC")
        .all(),
      provider_subsidies:
        "No paid usage is automatically funded by a software waiver.",
    }),
  );
  app.put(
    "/api/operator/complimentary/:id",
    ...guard("founder", "edit"),
    (req, res) => {
      const r = policy.save(req.params.id, req.body, req.platform.id);
      res.status(r.status || 200).json(r);
    },
  );
  app.post(
    "/api/operator/complimentary/:id/revoke",
    ...guard("founder", "edit"),
    (req, res) => {
      if (!Number.isInteger(req.body?.revision))
        return res
          .status(400)
          .json({ ok: false, error: "Current revision required." });
      const r = policy.revoke(
        req.params.id,
        req.body.revision,
        req.platform.id,
      );
      res.status(r.status || 200).json(r);
    },
  );
  // No legacy rows are relabelled as Super Pro prospects, income or customer conversations.
  app.get("/api/operator/legacy-inventory", ...guard("founder"), (req, res) => {
    const tables = [
      "enquiries",
      "customers",
      "quotes",
      "bookings",
      "job_media",
      "invoices",
      "conversations",
      "content_projects",
      "campaigns",
      "expenses",
      "receptionist_settings",
    ];
    const inventory = tables
      .filter((t) =>
        db
          .prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?")
          .get(t),
      )
      .map((t) => ({
        table: t,
        count: db.prepare("SELECT COUNT(*) count FROM " + t).get().count,
      }));
    res.json({
      ok: true,
      mode: "read_only_inventory",
      inventory,
      record_contents_exposed: false,
      migration_performed: false,
    });
  });
  const kinds = {
    ticket: "support",
    task: "operations",
    incident: "operations",
    cost: "operations",
    prospect: "marketing",
    campaign: "marketing",
    content: "marketing",
    hire: "team",
    staff_task: "team",
    announcement_draft: "marketing",
  };
  const recordSchema = z
    .object({
      title: z.string().trim().min(2).max(200),
      body: z.string().max(15000).default(""),
      status: z
        .enum(["open", "draft", "waiting", "approved", "closed"])
        .default("open"),
      revision: z.number().int().positive().optional(),
    })
    .strict();
  app.get(
    "/api/operator/records/:kind",
    platform.identity,
    (req, res, next) => {
      if (!kinds[req.params.kind])
        return res
          .status(404)
          .json({ ok: false, error: "Record type not found." });
      platform.permit(kinds[req.params.kind])(req, res, next);
    },
    (req, res) => {
      const section = kinds[req.params.kind];
      res.json({
        ok: true,
        section,
        records:
          ["founder", "admin"].includes(req.platform.role) ||
          req.params.kind !== "ticket"
            ? db
                .prepare(
                  "SELECT * FROM platform_records WHERE kind=? ORDER BY created_at DESC LIMIT 100",
                )
                .all(req.params.kind)
            : db
                .prepare(
                  "SELECT * FROM platform_records WHERE kind=? AND (assigned_to=? OR created_by=?) ORDER BY created_at DESC LIMIT 100",
                )
                .all(req.params.kind, req.platform.id, req.platform.id),
      });
    },
  );
  for (const method of ["post", "put"])
    app[method](
      "/api/operator/records/:kind" + (method === "put" ? "/:id" : ""),
      platform.identity,
      (req, res, next) => {
        const k = kinds[req.params.kind];
        if (!k)
          return res
            .status(404)
            .json({ ok: false, error: "Record type not found." });
        platform.permit(k, method === "post" ? "create" : "edit")(
          req,
          res,
          next,
        );
      },
      (req, res) => {
        const p = recordSchema.safeParse(req.body);
        if (!p.success)
          return res
            .status(400)
            .json({ ok: false, error: "Provide title, body and status." });
        if (
          p.data.status === "approved" &&
          !platform.can(req, kinds[req.params.kind], "approve")
        )
          return res
            .status(403)
            .json({ ok: false, error: "Approval permission required." });
        const id = req.params.id || crypto.randomUUID(),
          at = iso();
        if (
          method === "put" &&
          req.params.kind === "ticket" &&
          !["founder", "admin"].includes(req.platform.role) &&
          !db
            .prepare(
              "SELECT 1 FROM platform_records WHERE id=? AND kind=? AND (created_by=? OR assigned_to=?)",
            )
            .get(id, "ticket", req.platform.id, req.platform.id)
        )
          return res
            .status(404)
            .json({
              ok: false,
              error: "Ticket not found in your assignment scope.",
            });
        if (method === "put") {
          const r = db
            .prepare(
              "UPDATE platform_records SET title=?,body=?,status=?,revision=revision+1,updated_at=? WHERE id=? AND kind=? AND revision=?",
            )
            .run(
              p.data.title,
              p.data.body,
              p.data.status,
              at,
              id,
              req.params.kind,
              p.data.revision || 0,
            );
          if (!r.changes)
            return res
              .status(409)
              .json({
                ok: false,
                error: "Record changed or not found. Reload.",
              });
        } else
          db.prepare(
            "INSERT INTO platform_records(id,kind,title,body,status,created_by,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)",
          ).run(
            id,
            req.params.kind,
            p.data.title,
            p.data.body,
            p.data.status,
            req.platform.id,
            at,
            at,
          );
        platform.log(
          req.platform.id,
          "record." + (method === "post" ? "created" : "updated"),
          kinds[req.params.kind],
          id,
        );
        res.status(method === "post" ? 201 : 200).json({ ok: true, id });
      },
    );
  app.get("/api/operator/support-access", ...guard("support"), (req, res) =>
    res.json({
      ok: true,
      requests: db
        .prepare(
          "SELECT * FROM support_access_requests WHERE requested_by=? ORDER BY created_at DESC LIMIT 100",
        )
        .all(req.platform.id),
    }),
  );
  app.post(
    "/api/operator/support-access",
    ...guard("support", "create"),
    (req, res) => {
      const p = z
        .object({
          organisation_id: z.uuid(),
          purpose: z.string().trim().min(12).max(500),
          areas: z
            .array(z.enum(["customers", "jobs", "communications"]))
            .min(1)
            .max(3),
          hours: z.number().int().min(1).max(24),
        })
        .strict()
        .safeParse(req.body);
      if (!p.success)
        return res
          .status(400)
          .json({
            ok: false,
            error:
              "Choose organisation, purpose, permitted areas and up to 24 hours.",
          });
      if (
        !db
          .prepare("SELECT 1 FROM organisations WHERE id=?")
          .get(p.data.organisation_id)
      )
        return res
          .status(404)
          .json({ ok: false, error: "Subscriber not found." });
      const id = crypto.randomUUID();
      db.prepare(
        "INSERT INTO support_access_requests(id,organisation_id,requested_by,purpose,scope_json,hours,created_at) VALUES (?,?,?,?,?,?,?)",
      ).run(
        id,
        p.data.organisation_id,
        req.platform.id,
        p.data.purpose,
        JSON.stringify(p.data.areas),
        p.data.hours,
        iso(),
      );
      platform.log(req.platform.id, "support.requested", "support", id);
      res.status(201).json({ ok: true, id, status: "pending" });
    },
  );
  app.get(
    "/api/saas/support-access",
    requireSaasUser,
    requireSaasRole("owner"),
    (req, res) =>
      res.json({
        ok: true,
        requests: db
          .prepare(
            "SELECT id,requested_by,purpose,scope_json,hours,status,expires_at,created_at FROM support_access_requests WHERE organisation_id=? ORDER BY created_at DESC LIMIT 100",
          )
          .all(req.saas.organisation_id),
      }),
  );
  app.post(
    "/api/saas/support-access/:id/decision",
    requireSaasUser,
    requireSaasRole("owner"),
    (req, res) => {
      const p = z
        .object({ decision: z.enum(["approved", "refused", "revoked"]) })
        .strict()
        .safeParse(req.body);
      if (!p.success)
        return res
          .status(400)
          .json({ ok: false, error: "Choose approve, refuse or revoke." });
      const r = db
        .prepare(
          "SELECT * FROM support_access_requests WHERE id=? AND organisation_id=?",
        )
        .get(req.params.id, req.saas.organisation_id);
      if (!r)
        return res.status(404).json({ ok: false, error: "Request not found." });
      if (p.data.decision !== "revoked" && r.status !== "pending")
        return res
          .status(409)
          .json({ ok: false, error: "This request has already been decided." });
      const at = iso(),
        expiry =
          p.data.decision === "approved"
            ? new Date(Date.now() + r.hours * 3600000).toISOString()
            : null;
      db.prepare(
        "UPDATE support_access_requests SET status=?,approved_by=?,expires_at=?,revoked_at=? WHERE id=? AND organisation_id=?",
      ).run(
        p.data.decision,
        req.saas.user_id,
        expiry,
        p.data.decision === "revoked" ? at : null,
        r.id,
        req.saas.organisation_id,
      );
      saasAudit(
        req,
        "support_access." + p.data.decision,
        "support_access",
        r.id,
        {},
      );
      res.json({ ok: true });
    },
  );
  app.get(
    "/api/operator/support-access/:id/records/:area",
    ...guard("support"),
    (req, res) => {
      const r = db
        .prepare(
          "SELECT * FROM support_access_requests WHERE id=? AND requested_by=? AND status='approved' AND revoked_at IS NULL AND expires_at>?",
        )
        .get(req.params.id, req.platform.id, iso());
      if (!r || !JSON.parse(r.scope_json).includes(req.params.area))
        return res
          .status(403)
          .json({
            ok: false,
            error: "Active subscriber approval for this area is required.",
          });
      const queries = {
        customers:
          "SELECT id,name FROM tenant_customers WHERE organisation_id=? LIMIT 50",
        jobs: "SELECT id,title,status FROM work_orders WHERE organisation_id=? LIMIT 50",
        communications:
          "SELECT id,channel,subject,status FROM comms_threads WHERE organisation_id=? LIMIT 50",
      };
      if (!queries[req.params.area])
        return res.status(404).json({ ok: false, error: "Area not found." });
      platform.log(req.platform.id, "support.records_read", "support", r.id);
      res.json({
        ok: true,
        read_only: true,
        expires_at: r.expires_at,
        records: db.prepare(queries[req.params.area]).all(r.organisation_id),
      });
    },
  );
  return {};
}
