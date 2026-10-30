// New business features use tenant-bound records; legacy global data is never assigned implicitly.
import crypto from "node:crypto";
import { z } from "zod";
const at = () => new Date().toISOString();
export function installBusinessHub(
  app,
  { db, requireSaasUser, requireSaasRole, saasAudit, staffAccess, hooks = {} },
) {
  db.exec(`CREATE TABLE IF NOT EXISTS tenant_documents(id TEXT PRIMARY KEY,organisation_id TEXT NOT NULL REFERENCES organisations(id),kind TEXT NOT NULL,customer_id TEXT,title TEXT NOT NULL,body TEXT NOT NULL DEFAULT '',amount_cents INTEGER NOT NULL DEFAULT 0,status TEXT NOT NULL DEFAULT 'draft',revision INTEGER NOT NULL DEFAULT 1,approved_revision INTEGER,approved_by TEXT,start_at TEXT,acceptance_evidence TEXT,created_by TEXT NOT NULL,created_at TEXT NOT NULL,updated_at TEXT NOT NULL);
 CREATE INDEX IF NOT EXISTS tenant_documents_org ON tenant_documents(organisation_id,kind,created_at);
 CREATE TABLE IF NOT EXISTS tenant_service_requests(id TEXT PRIMARY KEY,organisation_id TEXT NOT NULL REFERENCES organisations(id),service TEXT NOT NULL,brief TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'requested',created_by TEXT NOT NULL,created_at TEXT NOT NULL);
 CREATE INDEX IF NOT EXISTS tenant_service_requests_org ON tenant_service_requests(organisation_id,service,created_at);
 CREATE TABLE IF NOT EXISTS tenant_receptionist_profiles(organisation_id TEXT PRIMARY KEY REFERENCES organisations(id),greeting TEXT NOT NULL,knowledge TEXT NOT NULL,hours TEXT NOT NULL,timezone TEXT NOT NULL,transfer_destination TEXT,revision INTEGER NOT NULL DEFAULT 1,status TEXT NOT NULL DEFAULT 'draft',updated_by TEXT NOT NULL,updated_at TEXT NOT NULL);`);
  const types = {
    enquiry: "customers",
    quote: "customers",
    booking: "jobs",
    invoice: "finance",
    campaign: "growth",
  };
  const guard = (action) => [
    requireSaasUser,
    (req, res, next) => {
      const f = types[req.params.kind];
      if (!f)
        return res
          .status(404)
          .json({ ok: false, error: "Document type not found." });
      if (!staffAccess.can(req, f, action))
        return res
          .status(403)
          .json({
            ok: false,
            error: "This business action is not authorised.",
          });
      next();
    },
  ];
  const get = (req) =>
    db
      .prepare(
        "SELECT * FROM tenant_documents WHERE id=? AND organisation_id=? AND kind=?",
      )
      .get(req.params.id, req.saas.organisation_id, req.params.kind);
  app.get("/api/saas/business-hub/:kind", ...guard("read"), (req, res) =>
    res.json({
      ok: true,
      records: db
        .prepare(
          "SELECT * FROM tenant_documents WHERE organisation_id=? AND kind=? ORDER BY created_at DESC LIMIT 100",
        )
        .all(req.saas.organisation_id, req.params.kind),
    }),
  );
  app.post("/api/saas/business-hub/:kind", ...guard("create"), (req, res) => {
    const p = z
      .object({
        title: z.string().trim().min(2).max(240),
        body: z.string().max(20000).default(""),
        customer_id: z.uuid().nullable().default(null),
        amount_cents: z.number().int().min(0).max(100000000).default(0),
        start_at: z.iso.datetime().nullable().default(null),
      })
      .strict()
      .safeParse(req.body);
    if (!p.success)
      return res
        .status(400)
        .json({
          ok: false,
          error: "Provide title, details, amount in cents and optional date.",
        });
    if (
      p.data.customer_id &&
      !db
        .prepare(
          "SELECT 1 FROM tenant_customers WHERE id=? AND organisation_id=?",
        )
        .get(p.data.customer_id, req.saas.organisation_id)
    )
      return res
        .status(404)
        .json({ ok: false, error: "Customer not found in this business." });
    const id = crypto.randomUUID(),
      now = at();
    db.prepare(
      "INSERT INTO tenant_documents(id,organisation_id,kind,customer_id,title,body,amount_cents,start_at,created_by,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
    ).run(
      id,
      req.saas.organisation_id,
      req.params.kind,
      p.data.customer_id,
      p.data.title,
      p.data.body,
      p.data.amount_cents,
      p.data.start_at,
      req.saas.user_id,
      now,
      now,
    );
    // Phase 04: quotes and invoices carry GST (10%) unless marked GST-free later; enquiries start open.
    if (["quote", "invoice"].includes(req.params.kind) && hooks.gstFor)
      db.prepare(
        "UPDATE tenant_documents SET gst_cents=? WHERE id=? AND organisation_id=?",
      ).run(hooks.gstFor(p.data.amount_cents, true), id, req.saas.organisation_id);
    if (req.params.kind === "enquiry" && hooks.gstFor)
      db.prepare(
        "UPDATE tenant_documents SET status='open' WHERE id=? AND organisation_id=?",
      ).run(id, req.saas.organisation_id);
    saasAudit(req, "business_document.created", req.params.kind, id, {});
    res.status(201).json({ ok: true, id });
  });
  app.post(
    "/api/saas/business-hub/:kind/:id/approve",
    ...guard("edit"),
    (req, res) => {
      const m = get(req);
      if (!m)
        return res.status(404).json({ ok: false, error: "Record not found." });
      if (!staffAccess.can(req, "approvals", "approve"))
        return res
          .status(403)
          .json({ ok: false, error: "Approval permission is required." });
      if (req.body?.revision !== m.revision || m.status !== "draft")
        return res
          .status(409)
          .json({ ok: false, error: "Reload and review the current draft." });
      db.prepare(
        "UPDATE tenant_documents SET status='approved',approved_revision=revision,approved_by=?,updated_at=? WHERE id=? AND organisation_id=? AND revision=? AND status='draft'",
      ).run(req.saas.user_id, at(), m.id, req.saas.organisation_id, m.revision);
      saasAudit(req, "business_document.approved", m.kind, m.id, {
        revision: m.revision,
      });
      if (m.kind === "quote") hooks.emit?.(req.saas.organisation_id, "quote.approved", { quote_id: m.id }, { key: `${m.id}:r${m.revision}` });
      res.json({ ok: true });
    },
  );
  app.post(
    "/api/saas/business-hub/:kind/:id/accept",
    ...guard("edit"),
    (req, res) => {
      const p = z
          .object({
            revision: z.number().int().positive(),
            evidence: z.string().trim().min(12).max(3000),
          })
          .strict()
          .safeParse(req.body),
        m = get(req);
      if (!m)
        return res.status(404).json({ ok: false, error: "Record not found." });
      if (
        !p.success ||
        m.kind !== "quote" ||
        m.status !== "approved" ||
        m.revision !== p.data.revision
      )
        return res
          .status(409)
          .json({
            ok: false,
            error:
              "An approved quote and customer acceptance evidence are required.",
          });
      db.prepare(
        "UPDATE tenant_documents SET status='accepted',acceptance_evidence=?,updated_at=? WHERE id=? AND organisation_id=?",
      ).run(p.data.evidence, at(), m.id, req.saas.organisation_id);
      saasAudit(req, "quote.acceptance_recorded", "quote", m.id, {});
      hooks.emit?.(req.saas.organisation_id, "quote.accepted", { quote_id: m.id }, { key: m.id });
      res.json({ ok: true });
    },
  );
  app.post(
    "/api/saas/business-hub/quote/:id/book",
    requireSaasUser,
    requireSaasRole("owner", "admin", "manager", "director", "super_admin"),
    (req, res) => {
      const p = z
        .object({
          start_at: z.iso.datetime(),
          revision: z.number().int().positive(),
        })
        .strict()
        .safeParse(req.body);
      const m = db
        .prepare(
          "SELECT * FROM tenant_documents WHERE id=? AND organisation_id=? AND kind='quote'",
        )
        .get(req.params.id, req.saas.organisation_id);
      if (!m)
        return res.status(404).json({ ok: false, error: "Quote not found." });
      if (!staffAccess.can(req, "jobs", "create"))
        return res
          .status(403)
          .json({ ok: false, error: "Job creation permission required." });
      if (
        !p.success ||
        m.status !== "accepted" ||
        m.revision !== p.data.revision
      )
        return res
          .status(409)
          .json({
            ok: false,
            error: "Accepted quote and booking date required.",
          });
      const id = crypto.randomUUID(),
        now = at();
      let jobId = null;
      db.transaction(() => {
        db.prepare(
          "INSERT INTO tenant_documents(id,organisation_id,kind,customer_id,title,body,amount_cents,start_at,created_by,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
        ).run(
          id,
          req.saas.organisation_id,
          "booking",
          m.customer_id,
          m.title,
          m.body,
          m.amount_cents,
          p.data.start_at,
          req.saas.user_id,
          now,
          now,
        );
        db.prepare(
          "UPDATE tenant_documents SET status='booked',updated_at=? WHERE id=? AND organisation_id=? AND status='accepted'",
        ).run(now, m.id, req.saas.organisation_id);
        // Phase 04: link the booking to its quote and create the job so it can be allocated to workers.
        if (hooks.createJobForBooking) {
          db.prepare(
            "UPDATE tenant_documents SET source_id=?,gst_applies=?,gst_cents=?,status='booked' WHERE id=? AND organisation_id=?",
          ).run(m.id, m.gst_applies ?? 1, m.gst_cents || 0, id, req.saas.organisation_id);
          jobId = hooks.createJobForBooking(req.saas.organisation_id, req.saas.user_id, m, id, { start_at: p.data.start_at });
        }
        saasAudit(req, "quote.booking_created", "booking", id, { quote: m.id, work_order: jobId || null });
      })();
      if (jobId) hooks.emit?.(req.saas.organisation_id, "job.booked", { booking_id: id, work_order_id: jobId }, { key: id });
      res.status(201).json({ ok: true, id, work_order_id: jobId });
    },
  );
  app.get(
    "/api/saas/business-archive",
    requireSaasUser,
    requireSaasRole("owner", "admin", "manager", "director", "super_admin"),
    (req, res) =>
      res.json({
        ok: true,
        records: db
          .prepare(
            "SELECT id,kind,title,status,created_at FROM tenant_documents WHERE organisation_id=? ORDER BY created_at DESC LIMIT 200",
          )
          .all(req.saas.organisation_id),
      }),
  );
  const services = [
    "phone",
    "calls",
    "meetings",
    "website",
    "searchconsole",
    "backlinks",
    "receptionist",
  ];
  app.get(
    "/api/saas/service-requests/:service",
    requireSaasUser,
    requireSaasRole("owner", "admin", "manager", "super_admin", "director"),
    (req, res) => {
      if (!services.includes(req.params.service))
        return res.status(404).json({ ok: false, error: "Service not found." });
      res.json({
        ok: true,
        activation: "provider_setup_required",
        purchases_enabled: false,
        requests: db
          .prepare(
            "SELECT id,service,brief,status,created_at FROM tenant_service_requests WHERE organisation_id=? AND service=? ORDER BY created_at DESC LIMIT 50",
          )
          .all(req.saas.organisation_id, req.params.service),
      });
    },
  );
  app.post(
    "/api/saas/service-requests/:service",
    requireSaasUser,
    requireSaasRole("owner"),
    (req, res) => {
      const p = z
        .object({ brief: z.string().trim().min(12).max(5000) })
        .strict()
        .safeParse(req.body);
      if (!services.includes(req.params.service) || !p.success)
        return res
          .status(400)
          .json({ ok: false, error: "Describe the service requirements." });
      const id = crypto.randomUUID();
      db.prepare(
        "INSERT INTO tenant_service_requests VALUES (?,?,?,?,?,?,?)",
      ).run(
        id,
        req.saas.organisation_id,
        req.params.service,
        p.data.brief,
        "requested",
        req.saas.user_id,
        at(),
      );
      saasAudit(req, "service.requested", "service", id, {
        service: req.params.service,
      });
      res
        .status(201)
        .json({
          ok: true,
          id,
          status: "requested",
          note: "No purchase, port, publish or live activation has occurred.",
        });
    },
  );
  app.get(
    "/api/saas/receptionist-profile",
    requireSaasUser,
    requireSaasRole("owner"),
    (req, res) => {
      const p = db
        .prepare(
          "SELECT organisation_id,greeting,knowledge,hours,timezone,revision,status,updated_at FROM tenant_receptionist_profiles WHERE organisation_id=?",
        )
        .get(req.saas.organisation_id);
      res.json({ ok: true, profile: p || null, live: false });
    },
  );
  app.put(
    "/api/saas/receptionist-profile",
    requireSaasUser,
    requireSaasRole("owner"),
    (req, res) => {
      const p = z
        .object({
          greeting: z.string().trim().min(4).max(2000),
          knowledge: z.string().max(20000),
          hours: z.string().max(1000),
          timezone: z.string().refine((t) => {
            try {
              new Intl.DateTimeFormat("en", { timeZone: t });
              return true;
            } catch {
              return false;
            }
          }),
          revision: z.number().int().min(0),
        })
        .strict()
        .safeParse(req.body);
      if (!p.success)
        return res
          .status(400)
          .json({
            ok: false,
            error:
              "Provide greeting, knowledge, hours, timezone and current revision.",
          });
      const result = db.transaction(() => {
        const old = db
          .prepare(
            "SELECT revision FROM tenant_receptionist_profiles WHERE organisation_id=?",
          )
          .get(req.saas.organisation_id);
        if ((old?.revision || 0) !== p.data.revision) return false;
        db.prepare(
          `INSERT INTO tenant_receptionist_profiles(organisation_id,greeting,knowledge,hours,timezone,revision,updated_by,updated_at) VALUES (?,?,?,?,?,?,?,?) ON CONFLICT(organisation_id) DO UPDATE SET greeting=excluded.greeting,knowledge=excluded.knowledge,hours=excluded.hours,timezone=excluded.timezone,revision=excluded.revision,status='draft',updated_by=excluded.updated_by,updated_at=excluded.updated_at`,
        ).run(
          req.saas.organisation_id,
          p.data.greeting,
          p.data.knowledge,
          p.data.hours,
          p.data.timezone,
          p.data.revision + 1,
          req.saas.user_id,
          at(),
        );
        saasAudit(
          req,
          "receptionist.draft_saved",
          "receptionist",
          req.saas.organisation_id,
          { revision: p.data.revision + 1 },
        );
        return true;
      })();
      if (!result)
        return res
          .status(409)
          .json({ ok: false, error: "Profile changed. Reload." });
      res.json({ ok: true, status: "draft", live: false });
    },
  );
}
