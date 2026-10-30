// Phase 04: the subscriber business pipeline, Enquiry → Quote → Booking → Allocation → Completion → Invoice → Payment.
// It connects the tenant business documents (tenant_documents: enquiry, quote, booking, invoice) to the existing jobs
// (work_orders: worker offers and allocation, completion, job price, invoice dates, payments). Every query is scoped to
// the signed-in organisation; nothing here trusts an organisation id from the client.
import crypto from 'node:crypto';
import { z } from 'zod';

const iso = () => new Date().toISOString();
const DAY = 86400000;
const GST_RATE = 0.1;

export function gstFor(exCents, applies) { return applies ? Math.round(exCents * GST_RATE) : 0; }

export function installPipeline(app, { db, requireSaasUser, saasAudit, staffAccess, syncJobFinance }) {
  const cols = new Set(db.prepare('PRAGMA table_info(tenant_documents)').all().map((c) => c.name));
  for (const [name, type] of [['source_id', 'TEXT'], ['work_order_id', 'TEXT'], ['gst_applies', 'INTEGER NOT NULL DEFAULT 1'], ['gst_cents', 'INTEGER NOT NULL DEFAULT 0'], ['issued_at', 'TEXT'], ['due_at', 'TEXT'], ['paid_at', 'TEXT'], ['channel', 'TEXT']]) {
    if (!cols.has(name)) db.exec(`ALTER TABLE tenant_documents ADD COLUMN ${name} ${type}`);
  }
  db.exec('CREATE INDEX IF NOT EXISTS tenant_documents_source ON tenant_documents(organisation_id,source_id)');
  db.exec('CREATE INDEX IF NOT EXISTS tenant_documents_job ON tenant_documents(organisation_id,work_order_id)');

  const fail = (res, status, error) => res.status(status).json({ ok: false, error });
  const can = (feature, action) => (req, res, next) => (staffAccess.can(req, feature, action) ? next() : fail(res, 403, 'This business action is not authorised for your account.'));
  const doc = (org, id, kind) => db.prepare('SELECT * FROM tenant_documents WHERE id=? AND organisation_id=?' + (kind ? ' AND kind=?' : '')).get(...[id, org, kind].filter(Boolean));
  const job = (org, id) => (id ? db.prepare('SELECT * FROM work_orders WHERE id=? AND organisation_id=?').get(id, org) : null);
  const customer = (org, id) => (id ? db.prepare('SELECT id,name,email,phone,address FROM tenant_customers WHERE id=? AND organisation_id=?').get(id, org) : null);
  const termsDays = (org) => { try { return db.prepare('SELECT terms_days FROM payment_settings WHERE organisation_id=?').get(org)?.terms_days || 7; } catch { return 7; } };
  const total = (d) => d.amount_cents + (d.gst_cents || 0);
  const setStatus = (org, id, status) => db.prepare('UPDATE tenant_documents SET status=?,updated_at=? WHERE id=? AND organisation_id=?').run(status, iso(), id, org);

  /** Creates the job (work order) for a booking so it can be offered to workers. Used by both booking routes. */
  function createJobForBooking(org, userId, quote, bookingId, { start_at, address, estimated_hours, required_workers } = {}) {
    const cust = customer(org, quote.customer_id);
    const id = crypto.randomUUID(), now = iso();
    db.prepare(`INSERT INTO work_orders (id,organisation_id,title,address,start_at,estimated_hours,required_workers,required_level,required_skills,customer_id,price_cents,gst_applies,created_at,updated_at) VALUES (?,?,?,?,?,?,?,1,'[]',?,?,?,?,?)`)
      .run(id, org, quote.title, address || cust?.address || null, start_at, estimated_hours || null, required_workers || 1, cust?.id || null, total(quote), quote.gst_applies === 0 ? 0 : 1, now, now);
    db.prepare('UPDATE tenant_documents SET work_order_id=?,updated_at=? WHERE id=? AND organisation_id=?').run(id, now, bookingId, org);
    // The enquiry the quote came from is now booked work.
    if (quote.source_id) db.prepare(`UPDATE tenant_documents SET status='booked',updated_at=? WHERE id=? AND organisation_id=? AND kind='enquiry' AND status IN ('open','draft','quoted')`).run(now, quote.source_id, org);
    return id;
  }

  /** Brings an invoice's status in line with the job's real payments (paid, part paid). Payments themselves never change here. */
  function refreshInvoice(org, inv) {
    if (inv.kind !== 'invoice' || !inv.work_order_id || !['issued', 'part_paid', 'paid'].includes(inv.status)) return inv;
    const j = job(org, inv.work_order_id); if (!j) return inv;
    const due = total(inv), paid = j.paid_cents || 0;
    const status = paid >= due && due > 0 ? 'paid' : paid > 0 ? 'part_paid' : 'issued';
    if (status !== inv.status) {
      db.prepare('UPDATE tenant_documents SET status=?,paid_at=?,updated_at=? WHERE id=? AND organisation_id=?').run(status, status === 'paid' ? (j.paid_at || iso()) : null, iso(), inv.id, org);
      return { ...inv, status, paid_at: status === 'paid' ? (j.paid_at || iso()) : null };
    }
    return inv;
  }

  function view(org, d) {
    const j = job(org, d.work_order_id);
    const offers = j ? db.prepare(`SELECT status,COUNT(*) n FROM job_offers WHERE work_order_id=? AND organisation_id=? GROUP BY status`).all(j.id, org) : [];
    return {
      id: d.id, kind: d.kind, title: d.title, body: d.body, status: d.status, revision: d.revision, channel: d.channel || null,
      customer: customer(org, d.customer_id), source_id: d.source_id || null, work_order_id: d.work_order_id || null,
      amount_cents: d.amount_cents, gst_applies: d.gst_applies !== 0, gst_cents: d.gst_cents || 0, total_cents: total(d),
      start_at: d.start_at, issued_at: d.issued_at || null, due_at: d.due_at || null, paid_at: d.paid_at || null,
      acceptance_evidence: d.acceptance_evidence || null, created_at: d.created_at, updated_at: d.updated_at,
      job: j ? { id: j.id, title: j.title, status: j.status, start_at: j.start_at, address: j.address, completed_at: j.completed_at, price_cents: j.price_cents, paid_cents: j.paid_cents, owing_cents: Math.max(0, j.price_cents + (j.late_fee_cents || 0) - j.paid_cents), invoice_issued_at: j.invoice_issued_at, due_at: j.due_at, offers: Object.fromEntries(offers.map((o) => [o.status, o.n])) } : null
    };
  }

  // ---------- read ----------
  app.get('/api/saas/pipeline/:kind(enquiry|quote|booking|invoice)', requireSaasUser, (req, res, next) => can({ enquiry: 'customers', quote: 'customers', booking: 'jobs', invoice: 'finance' }[req.params.kind], 'read')(req, res, next), (req, res) => {
    const org = req.saas.organisation_id;
    const rows = db.prepare('SELECT * FROM tenant_documents WHERE organisation_id=? AND kind=? ORDER BY created_at DESC LIMIT 200').all(org, req.params.kind);
    res.json({ ok: true, records: rows.map((r) => view(org, refreshInvoice(org, r))) });
  });

  // The whole chain a record belongs to, from enquiry to payments, in order. Also the record's activity history.
  app.get('/api/saas/pipeline/trail/:id', requireSaasUser, can('customers', 'read'), (req, res) => {
    const org = req.saas.organisation_id;
    let d = doc(org, req.params.id);
    if (!d) return fail(res, 404, 'Record not found.');
    while (d.source_id) { const up = doc(org, d.source_id); if (!up) break; d = up; }
    const chain = [];
    const walk = (x) => { chain.push(view(org, refreshInvoice(org, x))); for (const c of db.prepare('SELECT * FROM tenant_documents WHERE organisation_id=? AND source_id=? ORDER BY created_at').all(org, x.id)) walk(c); };
    walk(d);
    const ids = chain.map((c) => c.id), jobs = [...new Set(chain.map((c) => c.work_order_id).filter(Boolean))];
    const payments = jobs.length ? db.prepare(`SELECT id,work_order_id,provider,method,status,amount_cents,receipt_no,paid_at,created_at FROM job_payments WHERE organisation_id=? AND work_order_id IN (${jobs.map(() => '?').join(',')}) ORDER BY created_at`).all(org, ...jobs) : [];
    const events = db.prepare(`SELECT action,entity_type,entity_id,user_name,created_at FROM audit_logs WHERE organisation_id=? AND entity_id IN (${[...ids, ...jobs].map(() => '?').join(',')}) ORDER BY created_at LIMIT 200`).all(org, ...ids, ...jobs);
    res.json({ ok: true, chain, payments, events });
  });

  // Where every piece of work stands: one row per stage with counts and the oldest items.
  app.get('/api/saas/pipeline/overview', requireSaasUser, can('customers', 'read'), (req, res) => {
    const org = req.saas.organisation_id;
    const all = db.prepare('SELECT * FROM tenant_documents WHERE organisation_id=? AND kind IN (\'enquiry\',\'quote\',\'booking\',\'invoice\') ORDER BY created_at').all(org).map((r) => refreshInvoice(org, r));
    const pick = (f) => all.filter(f).map((r) => ({ id: r.id, kind: r.kind, title: r.title, status: r.status, total_cents: total(r) }));
    const bookingJobs = all.filter((r) => r.kind === 'booking' && r.work_order_id).map((r) => ({ r, j: job(org, r.work_order_id) })).filter((x) => x.j);
    const invoicedJobs = new Set(all.filter((r) => r.kind === 'invoice' && r.status !== 'cancelled').map((r) => r.work_order_id));
    const stages = [
      ['enquiries', 'New enquiries', pick((r) => r.kind === 'enquiry' && ['open', 'draft'].includes(r.status))],
      ['quotes', 'Quotes waiting', pick((r) => r.kind === 'quote' && ['draft', 'approved'].includes(r.status))],
      ['bookings', 'Booked, awaiting workers', bookingJobs.filter((x) => ['awaiting_allocation', 'offered'].includes(x.j.status) && !x.j.completed_at).map((x) => ({ id: x.r.id, kind: 'booking', title: x.r.title, status: x.j.status, total_cents: total(x.r) }))],
      ['allocated', 'Allocated, in progress', bookingJobs.filter((x) => x.j.status === 'allocated' && !x.j.completed_at).map((x) => ({ id: x.r.id, kind: 'booking', title: x.r.title, status: 'allocated', total_cents: total(x.r) }))],
      ['to_invoice', 'Completed, not invoiced', bookingJobs.filter((x) => x.j.completed_at && !invoicedJobs.has(x.j.id)).map((x) => ({ id: x.r.id, kind: 'booking', title: x.r.title, status: 'completed', total_cents: total(x.r) }))],
      ['unpaid', 'Invoices waiting for payment', pick((r) => r.kind === 'invoice' && ['draft', 'approved', 'issued', 'part_paid'].includes(r.status))],
      ['paid', 'Paid', pick((r) => r.kind === 'invoice' && r.status === 'paid')]
    ].map(([key, label, items]) => ({ key, label, count: items.length, total_cents: items.reduce((s, i) => s + i.total_cents, 0), items: items.slice(0, 5) }));
    res.json({ ok: true, stages });
  });

  // ---------- 1. enquiry (with a new or existing customer) ----------
  const enquirySchema = z.object({
    title: z.string().trim().min(2).max(240), details: z.string().trim().max(20000).default(''),
    channel: z.enum(['phone', 'email', 'website', 'walk_in', 'sms', 'social', 'receptionist', 'referral', 'other']).default('other'),
    customer_id: z.string().uuid().optional(),
    customer: z.object({ name: z.string().trim().min(2).max(160), email: z.string().trim().email().max(254).optional().or(z.literal('')), phone: z.string().trim().max(40).optional(), address: z.string().trim().max(300).optional() }).optional()
  }).strict().refine((d) => d.customer_id || d.customer, { message: 'Choose a customer or add a new one.' });
  app.post('/api/saas/pipeline/enquiries', requireSaasUser, can('customers', 'create'), (req, res) => {
    const p = enquirySchema.safeParse(req.body);
    if (!p.success) return fail(res, 400, p.error.issues[0]?.message === 'Choose a customer or add a new one.' ? p.error.issues[0].message : 'Add a short title and the customer.');
    const org = req.saas.organisation_id, d = p.data, now = iso();
    let customerId = d.customer_id;
    if (customerId && !customer(org, customerId)) return fail(res, 400, 'That customer does not belong to this workspace.');
    const id = crypto.randomUUID();
    db.transaction(() => {
      if (!customerId) {
        customerId = crypto.randomUUID();
        db.prepare(`INSERT INTO tenant_customers (id,organisation_id,name,email,phone,address,status,source,created_by_user_id,created_at,updated_at) VALUES (?,?,?,?,?,?,'lead','enquiry',?,?,?)`)
          .run(customerId, org, d.customer.name, d.customer.email || null, d.customer.phone || null, d.customer.address || null, req.saas.user_id, now, now);
      }
      db.prepare(`INSERT INTO tenant_documents (id,organisation_id,kind,customer_id,title,body,status,channel,created_by,created_at,updated_at) VALUES (?,?,'enquiry',?,?,?,'open',?,?,?,?)`)
        .run(id, org, customerId, d.title, d.details, d.channel, req.saas.user_id, now, now);
    })();
    saasAudit(req, 'enquiry.created', 'enquiry', id, { channel: d.channel, new_customer: !d.customer_id });
    res.status(201).json({ ok: true, id, customer_id: customerId });
  });
  app.post('/api/saas/pipeline/enquiries/:id/close', requireSaasUser, can('customers', 'edit'), (req, res) => {
    const org = req.saas.organisation_id, e = doc(org, req.params.id, 'enquiry');
    if (!e) return fail(res, 404, 'Enquiry not found.');
    if (!['open', 'draft', 'quoted'].includes(e.status)) return fail(res, 409, 'This enquiry is already closed or booked.');
    setStatus(org, e.id, 'lost');
    saasAudit(req, 'enquiry.closed', 'enquiry', e.id, {});
    res.json({ ok: true });
  });

  // ---------- 2. quote from an enquiry ----------
  const quoteSchema = z.object({ amount: z.number().positive().max(10000000), gst_applies: z.boolean().default(true), details: z.string().trim().max(20000).optional(), title: z.string().trim().min(2).max(240).optional() }).strict();
  app.post('/api/saas/pipeline/enquiries/:id/quote', requireSaasUser, can('customers', 'create'), (req, res) => {
    const p = quoteSchema.safeParse(req.body);
    if (!p.success) return fail(res, 400, 'Enter the quote amount in dollars, excluding GST.');
    const org = req.saas.organisation_id, e = doc(org, req.params.id, 'enquiry');
    if (!e) return fail(res, 404, 'Enquiry not found.');
    if (!['open', 'quoted', 'draft'].includes(e.status)) return fail(res, 409, 'This enquiry is closed.');
    const id = crypto.randomUUID(), now = iso(), ex = Math.round(p.data.amount * 100), gst = gstFor(ex, p.data.gst_applies);
    db.transaction(() => {
      db.prepare(`INSERT INTO tenant_documents (id,organisation_id,kind,customer_id,title,body,amount_cents,gst_applies,gst_cents,source_id,status,created_by,created_at,updated_at) VALUES (?,?,'quote',?,?,?,?,?,?,?,'draft',?,?,?)`)
        .run(id, org, e.customer_id, p.data.title || e.title, p.data.details ?? e.body, ex, p.data.gst_applies ? 1 : 0, gst, e.id, req.saas.user_id, now, now);
      setStatus(org, e.id, 'quoted');
    })();
    saasAudit(req, 'quote.created_from_enquiry', 'quote', id, { enquiry: e.id, amount_cents: ex, gst_cents: gst });
    res.status(201).json({ ok: true, id, amount_cents: ex, gst_cents: gst, total_cents: ex + gst });
  });

  // ---------- 3. booking from an accepted quote → job ready for allocation ----------
  const bookSchema = z.object({ start_at: z.iso.datetime({ offset: true }), revision: z.number().int().positive(), address: z.string().trim().max(300).optional(), estimated_hours: z.number().positive().max(1000).optional(), required_workers: z.number().int().min(1).max(50).optional() }).strict();
  app.post('/api/saas/pipeline/quotes/:id/book', requireSaasUser, can('jobs', 'create'), (req, res) => {
    const p = bookSchema.safeParse(req.body);
    if (!p.success) return fail(res, 400, 'Choose the booking date and time.');
    const org = req.saas.organisation_id, q = doc(org, req.params.id, 'quote');
    if (!q) return fail(res, 404, 'Quote not found.');
    if (q.status !== 'accepted' || q.revision !== p.data.revision) return fail(res, 409, 'Only an accepted quote can be booked. Record the customer acceptance first.');
    const id = crypto.randomUUID(), now = iso();
    let jobId;
    db.transaction(() => {
      db.prepare(`INSERT INTO tenant_documents (id,organisation_id,kind,customer_id,title,body,amount_cents,gst_applies,gst_cents,start_at,source_id,status,created_by,created_at,updated_at) VALUES (?,?,'booking',?,?,?,?,?,?,?,?,'booked',?,?,?)`)
        .run(id, org, q.customer_id, q.title, q.body, q.amount_cents, q.gst_applies, q.gst_cents, new Date(p.data.start_at).toISOString(), q.id, req.saas.user_id, now, now);
      db.prepare(`UPDATE tenant_documents SET status='booked',updated_at=? WHERE id=? AND organisation_id=? AND status='accepted'`).run(now, q.id, org);
      jobId = createJobForBooking(org, req.saas.user_id, q, id, { ...p.data, start_at: new Date(p.data.start_at).toISOString() });
    })();
    saasAudit(req, 'quote.booking_created', 'booking', id, { quote: q.id, work_order: jobId });
    res.status(201).json({ ok: true, id, work_order_id: jobId });
  });

  // ---------- 5. completion ----------
  app.post('/api/saas/pipeline/jobs/:id/complete', requireSaasUser, can('jobs', 'edit'), (req, res) => {
    const org = req.saas.organisation_id, j = job(org, req.params.id);
    if (!j) return fail(res, 404, 'Job not found.');
    if (j.completed_at) return fail(res, 409, 'This job is already marked complete.');
    if (j.status === 'cancelled') return fail(res, 409, 'A cancelled job cannot be completed.');
    const now = iso();
    db.prepare('UPDATE work_orders SET completed_at=?,updated_at=? WHERE id=? AND organisation_id=? AND completed_at IS NULL').run(now, now, j.id, org);
    db.prepare(`UPDATE tenant_documents SET status='completed',updated_at=? WHERE organisation_id=? AND kind='booking' AND work_order_id=?`).run(now, org, j.id);
    syncJobFinance?.(org, j.id, req.saas.user_id);
    saasAudit(req, 'work_order.completed', 'work_order', j.id, {});
    res.json({ ok: true, completed_at: now });
  });

  // ---------- 6. invoice from a completed job ----------
  app.post('/api/saas/pipeline/jobs/:id/invoice', requireSaasUser, can('finance', 'create'), (req, res) => {
    const org = req.saas.organisation_id, j = job(org, req.params.id);
    if (!j) return fail(res, 404, 'Job not found.');
    if (!j.completed_at) return fail(res, 409, 'Mark the job complete before invoicing it.');
    if (db.prepare(`SELECT 1 FROM tenant_documents WHERE organisation_id=? AND kind='invoice' AND work_order_id=? AND status<>'cancelled'`).get(org, j.id)) return fail(res, 409, 'This job already has an invoice.');
    const booking = db.prepare(`SELECT * FROM tenant_documents WHERE organisation_id=? AND kind='booking' AND work_order_id=?`).get(org, j.id);
    const gstApplies = booking ? booking.gst_applies !== 0 : j.gst_applies !== 0;
    // Amount from the booking (agreed quote); a job created directly falls back to its price, which includes GST.
    const ex = booking ? booking.amount_cents : gstApplies ? Math.round(j.price_cents / (1 + GST_RATE)) : j.price_cents;
    if (ex <= 0) return fail(res, 409, 'Set the job price in Money before invoicing it.');
    const gst = booking ? booking.gst_cents : j.price_cents - ex;
    const id = crypto.randomUUID(), now = iso();
    db.prepare(`INSERT INTO tenant_documents (id,organisation_id,kind,customer_id,title,body,amount_cents,gst_applies,gst_cents,source_id,work_order_id,status,created_by,created_at,updated_at) VALUES (?,?,'invoice',?,?,?,?,?,?,?,?,'draft',?,?,?)`)
      .run(id, org, booking?.customer_id || j.customer_id, j.title, booking?.body || '', ex, gstApplies ? 1 : 0, gst, booking?.id || null, j.id, req.saas.user_id, now, now);
    if (booking) setStatus(org, booking.id, 'invoiced');
    saasAudit(req, 'invoice.created_from_job', 'invoice', id, { work_order: j.id, amount_cents: ex, gst_cents: gst });
    res.status(201).json({ ok: true, id, amount_cents: ex, gst_cents: gst, total_cents: ex + gst });
  });

  // An approved invoice is issued: it gets its due date and the job's invoice dates, so payments and reminders apply.
  app.post('/api/saas/pipeline/invoices/:id/issue', requireSaasUser, can('finance', 'edit'), (req, res) => {
    const org = req.saas.organisation_id, inv = doc(org, req.params.id, 'invoice');
    if (!inv) return fail(res, 404, 'Invoice not found.');
    if (inv.status !== 'approved') return fail(res, 409, 'Approve the invoice before issuing it.');
    const j = job(org, inv.work_order_id);
    if (!j) return fail(res, 409, 'This invoice is not linked to a job, so payments cannot be tracked. Create invoices from a completed job.');
    const now = iso(), due = new Date(Date.now() + termsDays(org) * DAY).toISOString(), totalCents = total(inv);
    if (j.paid_cents > totalCents) return fail(res, 409, 'More has already been paid on this job than the invoice total. Check the amounts in Money.');
    db.transaction(() => {
      db.prepare(`UPDATE tenant_documents SET status='issued',issued_at=?,due_at=?,updated_at=? WHERE id=? AND organisation_id=? AND status='approved'`).run(now, due, now, inv.id, org);
      db.prepare('UPDATE work_orders SET price_cents=?,gst_applies=?,invoice_issued_at=COALESCE(invoice_issued_at,?),due_at=COALESCE(due_at,?),updated_at=? WHERE id=? AND organisation_id=?').run(totalCents, inv.gst_applies === 0 ? 0 : 1, now, due, now, j.id, org);
    })();
    syncJobFinance?.(org, j.id, req.saas.user_id);
    saasAudit(req, 'invoice.issued', 'invoice', inv.id, { work_order: j.id, total_cents: totalCents });
    res.json({ ok: true, issued_at: now, due_at: due, total_cents: totalCents });
  });

  return { createJobForBooking, refreshInvoice, gstFor };
}
