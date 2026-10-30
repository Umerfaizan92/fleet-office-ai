// Phase 05: the automation action catalogue. Every action has a fixed policy level, a strict payload schema, the
// permission an approver needs, a plain-language preview, an executor and a verifier.
//
// Policy levels
//   1 automatic             internal only: classification, summaries, drafts, internal suggestions, health checks
//   2 rule-based automatic  runs on its own only while the owner has switched on the matching rule (and within limits)
//   3 human approval        always waits in the approval queue; some are recorded decisions carried out by a person
//   4 restricted            never run by automation; listed so the engine can refuse them by name
//
// Effects decide what suspicious (possibly injected) content can do: 'output' only writes internal notes, drafts or
// reports; 'internal_write' changes business records; 'external' reaches customers, staff or the public.
// Recipients, amounts and record IDs never come from untrusted text: they come from the business's own records.
import { z } from 'zod';

const DAY = 86400000;
const iso = (t = Date.now()) => new Date(t).toISOString();
const money = (c) => (Number(c || 0) / 100).toLocaleString('en-AU', { style: 'currency', currency: 'AUD' });
const owners = (db, org) => db.prepare("SELECT user_id FROM memberships WHERE organisation_id=? AND role IN ('owner','admin') AND COALESCE(status,'active')='active'").all(org).map((r) => r.user_id);

export const CATEGORIES = ['urgent_repair', 'new_installation', 'maintenance', 'quote_request', 'complaint', 'general'];
const KEYWORDS = {
  complaint: ['complain', 'unhappy', 'disappointed', 'refund', 'not happy', 'poor service', 'rude'],
  urgent_repair: ['urgent', 'emergency', 'leak', 'burst', 'flood', 'no power', 'no hot water', 'broken', 'asap', 'today'],
  new_installation: ['install', 'new ', 'replace', 'upgrade', 'fit out', 'renovation'],
  maintenance: ['service', 'maintenance', 'check', 'inspection', 'clean', 'annual'],
  quote_request: ['quote', 'price', 'cost', 'estimate', 'how much']
};
// Phrases that try to give the AI or the system instructions. Text containing them is treated as suspicious.
const INJECTION = [/ignore (all |any |the )?(previous|prior|above) (instructions|messages)/i, /disregard (the |your )?(rules|instructions|policy)/i, /you are now/i, /system prompt/i, /\bapprove (this|it|the) (payment|transfer|refund)/i, /(transfer|send|wire) (the )?(money|funds|payment)/i, /change (the )?(bank|bsb|account) (details|number)/i, /send (the|all|every) (invoices?|data|records|customer list) to/i, /bypass/i, /\bas (an )?(admin|administrator|the owner)\b/i, /<\/?(script|system|instructions?)>/i];
export const looksInjected = (text) => INJECTION.some((re) => re.test(String(text || '')));

export function classify(text) {
  const t = ` ${String(text || '').toLowerCase()} `;
  let category = 'general', best = 0;
  for (const [cat, words] of Object.entries(KEYWORDS)) { const n = words.filter((w) => t.includes(w)).length; if (n > best) { best = n; category = cat; } }
  const urgent = KEYWORDS.urgent_repair.some((w) => t.includes(w)) || /\b(today|tonight|now)\b/.test(t);
  return { category, urgency: urgent ? 'high' : 'normal', confidence: best ? Math.min(0.95, 0.5 + best * 0.15) : 0.3 };
}
export function extractContact(text) {
  const t = String(text || '');
  const email = (t.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i) || [])[0] || null;
  const phone = (t.match(/(?:\+?61|0)[2-478](?:[ -]?\d){8}/) || [])[0] || null;
  const postcode = (t.match(/\b(?:NSW|VIC|QLD|WA|SA|TAS|ACT|NT)\s?\d{4}\b/i) || [])[0] || null;
  return { email, phone: phone ? phone.replace(/\s+/g, ' ').trim() : null, postcode };
}

// Work days 8am to 4pm, next 10 days, avoiding existing jobs (simple overlap test). Times in the business's zone.
function freeSlots(db, org, hours = 2, count = 3, tz = 'Australia/Perth') {
  const busy = db.prepare("SELECT start_at,COALESCE(estimated_hours,2) h FROM work_orders WHERE organisation_id=? AND start_at>=? AND status<>'cancelled'").all(org, iso()).map((j) => [Date.parse(j.start_at), Date.parse(j.start_at) + j.h * 3600000]);
  const out = [];
  const offset = (d) => { const s = new Date(d).toLocaleString('en-US', { timeZone: tz, hour12: false }); return Date.parse(s) - d; };
  for (let d = 1; d <= 10 && out.length < count; d++) {
    const base = new Date(Date.now() + d * DAY); const local = new Date(base.getTime() + offset(base.getTime()));
    if ([0, 6].includes(local.getUTCDay())) continue;
    for (const hour of [8, 10, 13]) {
      const startLocal = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate(), hour);
      const start = startLocal - offset(startLocal), end = start + hours * 3600000;
      if (!busy.some(([a, b]) => start < b && end > a)) { out.push(iso(start)); break; }
    }
  }
  return out;
}

const output = (ctx, kind, title, body, link = null) => ctx.deps.outputs.add(ctx, { kind, title, body, link });
const outputVerify = (ctx, p, result) => { const o = ctx.db.prepare('SELECT 1 FROM automation_outputs WHERE id=?').get(result?.ref); return o ? { ok: true, detail: 'Recorded in AI suggestions and reports.' } : { ok: false, detail: 'The output was not stored.' }; };
const customerOf = (db, org, id) => (id ? db.prepare('SELECT id,name,email,phone,address FROM tenant_customers WHERE id=? AND organisation_id=?').get(id, org) : null);

const P = z.object({}).strict();
export const ACTIONS = {
  // ---------------- Level 1: automatic ----------------
  summarise_events: { label: 'Daily summary of business events', capability: 1, level: 1, effect: 'output', feature: 'dashboard', triggers: ['schedule.daily', 'manual'], params: P,
    analyse(ctx) {
      const since = iso(Date.now() - DAY);
      const byModule = ctx.db.prepare('SELECT module,COUNT(*) n FROM audit_logs WHERE organisation_id=? AND created_at>=? GROUP BY module ORDER BY n DESC LIMIT 8').all(ctx.org, since);
      const docs = ctx.db.prepare('SELECT kind,COUNT(*) n FROM tenant_documents WHERE organisation_id=? AND created_at>=? GROUP BY kind').all(ctx.org, since);
      const lines = [...docs.map((d) => `${d.n} new ${d.kind}${d.n === 1 ? '' : 's'}`), ...byModule.map((m) => `${m.n} recorded ${m.module} actions`)];
      return { title: 'Yesterday in your business', lines: lines.length ? lines : ['No recorded activity in the last 24 hours.'] };
    },
    schema: z.object({ title: z.string().max(120), lines: z.array(z.string().max(200)).max(20) }),
    preview: (ctx, p) => ({ description: 'Write a summary of the last 24 hours', data_involved: ['Activity counts (no customer details)'], expected_outcome: p.lines.join('; ').slice(0, 300) }),
    execute: (ctx, p) => output(ctx, 'summary', p.title, p.lines.map((l) => '• ' + l).join('\n')), verify: outputVerify },

  classify_enquiry: { label: 'Classify new enquiries', capability: 2, level: 1, effect: 'output', feature: 'customers', triggers: ['enquiry.created'], params: P, ai: { fields: ['category', 'urgency'], instruction: `Classify the enquiry. category is one of ${CATEGORIES.join(', ')}; urgency is high or normal.` },
    analyse: (ctx) => classify(`${ctx.facts.enquiry.title} ${ctx.untrusted}`),
    schema: z.object({ category: z.enum(CATEGORIES), urgency: z.enum(['high', 'normal']), confidence: z.number().min(0).max(1).optional() }),
    preview: (ctx, p) => ({ description: `Label enquiry "${ctx.facts.enquiry.title}"`, data_involved: ['Enquiry title and details'], expected_outcome: `${p.category.replace(/_/g, ' ')}, ${p.urgency} urgency` }),
    execute(ctx, p) { ctx.db.prepare('UPDATE tenant_documents SET ai_category=?,ai_urgency=?,updated_at=? WHERE id=? AND organisation_id=? AND kind=\'enquiry\'').run(p.category, p.urgency, iso(), ctx.facts.enquiry.id, ctx.org); return { ref: ctx.facts.enquiry.id, summary: `Classified as ${p.category.replace(/_/g, ' ')} (${p.urgency})` }; },
    verify(ctx, p) { const d = ctx.db.prepare('SELECT ai_category,ai_urgency FROM tenant_documents WHERE id=? AND organisation_id=?').get(ctx.facts.enquiry.id, ctx.org); return d?.ai_category === p.category && d?.ai_urgency === p.urgency ? { ok: true, detail: 'Label saved on the enquiry.' } : { ok: false, detail: 'Label not found on the enquiry.' }; } },

  extract_customer_info: { label: 'Fill in missing customer details from the enquiry', capability: 3, level: 1, effect: 'internal_write', feature: 'customers', triggers: ['enquiry.created'], params: P,
    analyse(ctx) {
      const c = ctx.facts.customer || {}, found = extractContact(ctx.untrusted), fill = {};
      if (!c.email && found.email) fill.email = found.email;
      if (!c.phone && found.phone) fill.phone = found.phone;
      return Object.keys(fill).length ? { customer_id: c.id, fill } : null;
    },
    schema: z.object({ customer_id: z.string().uuid(), fill: z.object({ email: z.string().email().max(254).optional(), phone: z.string().max(40).optional() }).strict() }),
    preview: (ctx, p) => ({ description: `Add ${Object.keys(p.fill).join(' and ')} to ${ctx.facts.customer?.name || 'the customer'}`, data_involved: ['Customer contact details found in the enquiry text'], expected_outcome: Object.entries(p.fill).map(([k, v]) => `${k}: ${v}`).join(', ') + ' (only empty fields are filled)' }),
    execute(ctx, p) {
      const c = customerOf(ctx.db, ctx.org, p.customer_id); if (!c) throw new Error('Customer not found.');
      const sets = Object.entries(p.fill).filter(([k]) => !c[k]);
      for (const [k, v] of sets) ctx.db.prepare(`UPDATE tenant_customers SET ${k === 'email' ? 'email' : 'phone'}=?,updated_at=? WHERE id=? AND organisation_id=? AND (${k === 'email' ? 'email' : 'phone'} IS NULL OR ${k === 'email' ? 'email' : 'phone'}='')`).run(v, iso(), c.id, ctx.org);
      return { ref: c.id, summary: sets.length ? `Filled ${sets.map(([k]) => k).join(', ')}` : 'Nothing to fill (fields already set).' };
    },
    verify(ctx, p) { const c = customerOf(ctx.db, ctx.org, p.customer_id); return c && Object.keys(p.fill).every((k) => c[k]) ? { ok: true, detail: 'Customer record has the details.' } : { ok: false, detail: 'Customer details were not saved.' }; } },

  draft_quote: { label: 'Prepare a quote draft from the enquiry', capability: 4, level: 1, effect: 'output', feature: 'customers', triggers: ['enquiry.created'],
    params: z.object({ prices: z.partialRecord(z.enum(CATEGORIES), z.number().positive().max(1000000)).default({}), default_amount: z.number().positive().max(1000000).optional(), gst_applies: z.boolean().default(true) }).strict(),
    analyse(ctx) { const { category } = classify(`${ctx.facts.enquiry.title} ${ctx.untrusted}`); const amount = ctx.params.prices?.[category] ?? ctx.params.default_amount; return amount ? { enquiry_id: ctx.facts.enquiry.id, amount, gst_applies: ctx.params.gst_applies !== false, category } : null; },
    schema: z.object({ enquiry_id: z.string().uuid(), amount: z.number().positive().max(1000000), gst_applies: z.boolean(), category: z.enum(CATEGORIES) }),
    preview: (ctx, p) => ({ description: `Quote draft for "${ctx.facts.enquiry.title}"`, data_involved: ['Enquiry', 'Your price list in this automation'], expected_outcome: `Draft quote ${money(p.amount * 100)} ex GST (${p.category.replace(/_/g, ' ')}). Nothing is sent: you approve and send it.`, cost_cents: null }),
    execute(ctx, p) { const r = ctx.deps.pipeline.createQuoteFromEnquiry(ctx.org, 'automation', p.enquiry_id, { amount: p.amount, gst_applies: p.gst_applies }); if (!r.ok) throw Object.assign(new Error(r.error), { permanent: true }); return { ref: r.id, summary: `Quote draft ${money(r.total_cents)} incl. GST`, link: '#b02/quotes' }; },
    verify(ctx, p, r) { const q = ctx.db.prepare("SELECT status FROM tenant_documents WHERE id=? AND organisation_id=? AND kind='quote'").get(r.ref, ctx.org); return q?.status === 'draft' ? { ok: true, detail: 'Quote draft waiting for your review in Quotes.' } : { ok: false, detail: 'Quote draft not found.' }; } },

  suggest_appointment_times: { label: 'Suggest appointment times', capability: 5, level: 1, effect: 'output', feature: 'jobs', triggers: ['quote.accepted', 'manual'], params: z.object({ hours: z.number().positive().max(12).default(2), timezone: z.string().max(64).default('Australia/Perth') }).strict(),
    analyse: (ctx) => ({ title: ctx.facts.quote?.title || 'New work', slots: freeSlots(ctx.db, ctx.org, ctx.params.hours || 2, 3, ctx.params.timezone || 'Australia/Perth') }),
    schema: z.object({ title: z.string().max(240), slots: z.array(z.string()).max(5) }),
    preview: (ctx, p) => ({ description: `Find free times for "${p.title}"`, data_involved: ['Your job calendar'], expected_outcome: p.slots.length ? p.slots.map((s) => new Date(s).toLocaleString('en-AU', { dateStyle: 'medium', timeStyle: 'short', timeZone: ctx.params.timezone || 'Australia/Perth' })).join(' · ') : 'No free time found in the next 10 work days.' }),
    execute: (ctx, p) => output(ctx, 'suggestion', `Free times for ${p.title}`, p.slots.length ? p.slots.map((s) => '• ' + new Date(s).toLocaleString('en-AU', { dateStyle: 'full', timeStyle: 'short', timeZone: ctx.params.timezone || 'Australia/Perth' })).join('\n') : 'No free time found in the next 10 work days.', '#b02/quotes'), verify: outputVerify },

  draft_customer_message: { label: 'Draft a reply to the customer', capability: 6, level: 1, effect: 'output', feature: 'mail', triggers: ['enquiry.created'], params: z.object({ sign_off: z.string().max(120).default('') }).strict(), ai: { fields: ['body'], instruction: 'Write a short, friendly reply acknowledging the enquiry and saying the business will be in touch. Do not promise prices, dates or anything not in the enquiry. Plain text, under 120 words.' },
    analyse(ctx) { const c = ctx.facts.customer; if (!c?.email) return null; return { to: c.email, subject: `Re: ${ctx.facts.enquiry.title}`.slice(0, 200), body: `Hi ${c.name.split(' ')[0]},\n\nThanks for getting in touch about "${ctx.facts.enquiry.title}". We have your enquiry and will be in touch shortly.\n\n${ctx.params.sign_off || ctx.facts.business}` }; },
    schema: z.object({ to: z.string().email(), subject: z.string().min(2).max(200), body: z.string().min(10).max(4000) }),
    preview: (ctx, p) => ({ description: `Draft a reply to ${ctx.facts.customer?.name}`, data_involved: ['Customer name and email', 'Enquiry title'], expected_outcome: 'An email draft in the Email Centre. It is not sent until someone approves and sends it.' }),
    execute(ctx, p) { const id = ctx.deps.mail.createDraft({ ownerId: ctx.org, recipient: p.to, subject: p.subject, body: p.body, category: 'enquiries', createdBy: 'automation' }); return { ref: id, summary: 'Reply draft in the Email Centre', link: '#b04/email' }; },
    verify(ctx, p, r) { const m = ctx.deps.mail.mailStatus(r.ref, ctx.org); return m?.status === 'draft' ? { ok: true, detail: 'Draft waiting in the Email Centre.' } : { ok: false, detail: 'Draft not found.' }; } },

  propose_work_order: { label: 'Propose booking the job', capability: 7, level: 1, effect: 'output', feature: 'jobs', triggers: ['quote.accepted'], params: P,
    analyse: (ctx) => ({ quote_id: ctx.facts.quote.id, title: ctx.facts.quote.title, slot: freeSlots(ctx.db, ctx.org, 2, 1)[0] || null }),
    schema: z.object({ quote_id: z.string().uuid(), title: z.string().max(240), slot: z.string().nullable() }),
    preview: (ctx, p) => ({ description: `Suggest booking "${p.title}"`, data_involved: ['Accepted quote', 'Your job calendar'], expected_outcome: `A suggestion to book${p.slot ? ' for ' + new Date(p.slot).toLocaleString('en-AU', { dateStyle: 'medium', timeStyle: 'short' }) : ''}. Booking stays your decision.` }),
    execute: (ctx, p) => output(ctx, 'suggestion', `Book "${p.title}"`, `${ctx.facts.customer?.name || 'The customer'} accepted the quote.${p.slot ? ' First free time: ' + new Date(p.slot).toLocaleString('en-AU', { dateStyle: 'full', timeStyle: 'short' }) + '.' : ''} Open Quotes and choose "Book the job".`, '#b02/quotes'), verify: outputVerify },

  recommend_staff: { label: 'Recommend workers for a booked job', capability: 8, level: 1, effect: 'output', feature: 'jobs', triggers: ['job.booked'], params: P,
    analyse(ctx) { const r = ctx.deps.offers.evaluate(ctx.org, ctx.facts.job); return { work_order_id: ctx.facts.job.id, eligible: r.eligible.map((w) => w.full_name).slice(0, 10), not_ready: r.evaluated.filter((x) => !x.eligible).length }; },
    schema: z.object({ work_order_id: z.string().uuid(), eligible: z.array(z.string()).max(10), not_ready: z.number().int().min(0) }),
    preview: (ctx, p) => ({ description: `Check who can do "${ctx.facts.job.title}"`, data_involved: ['Worker skills, availability and compliance status'], expected_outcome: p.eligible.length ? `Eligible: ${p.eligible.join(', ')}` : 'Nobody is eligible yet.' }),
    execute: (ctx, p) => output(ctx, 'suggestion', `Workers for ${ctx.facts.job.title}`, p.eligible.length ? `Eligible now: ${p.eligible.join(', ')}.${p.not_ready ? ` ${p.not_ready} other worker(s) are missing skills or compliance.` : ''} Use "Offer to workers" in Bookings.` : 'No worker is eligible yet. Check availability, skills and compliance in People > Workers.', '#b02/bookings'), verify: outputVerify },

  draft_invoice: { label: 'Prepare the invoice when a job is completed', capability: 9, level: 1, effect: 'output', feature: 'finance', triggers: ['job.completed'], params: P,
    analyse: (ctx) => (ctx.facts.invoiced ? null : { work_order_id: ctx.facts.job.id }),
    schema: z.object({ work_order_id: z.string().uuid() }),
    preview: (ctx) => ({ description: `Invoice draft for "${ctx.facts.job.title}"`, data_involved: ['Job price and GST from the booking'], expected_outcome: 'An invoice draft. You approve and issue it; nothing goes to the customer automatically.' }),
    execute(ctx, p) {
      // Someone may have invoiced the job by hand in the meantime: never create a second invoice.
      const existing = ctx.db.prepare("SELECT id FROM tenant_documents WHERE organisation_id=? AND kind='invoice' AND work_order_id=? AND status<>'cancelled'").get(ctx.org, p.work_order_id);
      if (existing) return { ref: existing.id, existing: true, summary: 'The job already has an invoice; nothing new was created.', link: '#b07/invoices' };
      const r = ctx.deps.pipeline.createInvoiceFromJob(ctx.org, 'automation', p.work_order_id); if (!r.ok) throw Object.assign(new Error(r.error), { permanent: true }); return { ref: r.id, summary: `Invoice draft ${money(r.total_cents)} incl. GST`, link: '#b07/invoices' };
    },
    verify(ctx, p, r) { const i = ctx.db.prepare("SELECT status FROM tenant_documents WHERE id=? AND organisation_id=? AND kind='invoice'").get(r.ref, ctx.org); if (r.existing) return i ? { ok: true, detail: 'An invoice already existed for this job.' } : { ok: false, detail: 'Invoice not found.' }; return i?.status === 'draft' ? { ok: true, detail: 'Invoice draft waiting in Invoices.' } : { ok: false, detail: 'Invoice draft not found.' }; } },

  reconcile_payment: { label: 'Reconcile payments with invoices', capability: 10, level: 1, effect: 'output', feature: 'finance', triggers: ['payment.received'], params: P,
    analyse(ctx) { const j = ctx.facts.job; const inv = ctx.db.prepare("SELECT * FROM tenant_documents WHERE organisation_id=? AND kind='invoice' AND work_order_id=? AND status<>'cancelled'").get(ctx.org, j.id); return { work_order_id: j.id, invoice_id: inv?.id || null, paid_cents: j.paid_cents, total_cents: inv ? inv.amount_cents + inv.gst_cents : null }; },
    schema: z.object({ work_order_id: z.string().uuid(), invoice_id: z.string().uuid().nullable(), paid_cents: z.number().int(), total_cents: z.number().int().nullable() }),
    preview: (ctx, p) => ({ description: `Match the payment on "${ctx.facts.job.title}"`, data_involved: ['Payments and invoice totals'], expected_outcome: p.invoice_id ? `Paid ${money(p.paid_cents)} of ${money(p.total_cents)}` : 'No invoice for this job yet: flagged for you.' }),
    execute(ctx, p) {
      if (p.invoice_id) { const inv = ctx.db.prepare('SELECT * FROM tenant_documents WHERE id=? AND organisation_id=?').get(p.invoice_id, ctx.org); ctx.deps.pipeline.refreshInvoice(ctx.org, inv); }
      const problem = !p.invoice_id ? 'A payment arrived for a job with no invoice.' : p.paid_cents > p.total_cents ? `Overpaid by ${money(p.paid_cents - p.total_cents)}.` : null;
      if (problem) return output(ctx, 'alert', `Payment check: ${ctx.facts.job.title}`, problem + ' Review it in Money.', '#b07/ledger');
      return { ref: p.invoice_id, summary: 'Invoice matches the payments received.' };
    },
    verify(ctx, p, r) { if (!p.invoice_id || r.summary !== 'Invoice matches the payments received.') return outputVerify(ctx, p, r); const i = ctx.db.prepare('SELECT status FROM tenant_documents WHERE id=?').get(p.invoice_id); const want = p.paid_cents >= p.total_cents ? 'paid' : p.paid_cents > 0 ? 'part_paid' : null; return !want || i?.status === want || i?.status === 'draft' || i?.status === 'approved' ? { ok: true, detail: `Invoice status: ${i?.status}.` } : { ok: false, detail: `Invoice shows ${i?.status}, expected ${want}.` }; } },

  generate_report: { label: 'Weekly business report', capability: 11, level: 1, effect: 'output', feature: 'finance', triggers: ['schedule.weekly', 'manual'], params: P,
    analyse(ctx) {
      const since = iso(Date.now() - 7 * DAY), q = (sql, ...a) => ctx.db.prepare(sql).get(...a);
      const paid = q("SELECT COALESCE(SUM(amount_cents),0) c FROM job_payments WHERE organisation_id=? AND status='paid' AND paid_at>=?", ctx.org, since).c;
      const owing = q("SELECT COALESCE(SUM(price_cents+late_fee_cents-paid_cents),0) c FROM work_orders WHERE organisation_id=? AND invoice_issued_at IS NOT NULL AND paid_cents<price_cents", ctx.org).c;
      const enq = q("SELECT COUNT(*) n FROM tenant_documents WHERE organisation_id=? AND kind='enquiry' AND created_at>=?", ctx.org, since).n;
      const won = q("SELECT COUNT(*) n FROM tenant_documents WHERE organisation_id=? AND kind='booking' AND created_at>=?", ctx.org, since).n;
      const done = q('SELECT COUNT(*) n FROM work_orders WHERE organisation_id=? AND completed_at>=?', ctx.org, since).n;
      return { lines: [`Payments received: ${money(paid)}`, `Still owing on issued invoices: ${money(owing)}`, `New enquiries: ${enq}`, `New bookings: ${won}`, `Jobs completed: ${done}`] };
    },
    schema: z.object({ lines: z.array(z.string().max(200)).max(20) }),
    preview: (ctx, p) => ({ description: 'Weekly report for the last 7 days', data_involved: ['Payments, invoices, enquiries, bookings and jobs (totals only)'], expected_outcome: p.lines.join('; ') }),
    execute: (ctx, p) => output(ctx, 'report', `Weekly report to ${new Date().toLocaleDateString('en-AU', { dateStyle: 'medium' })}`, p.lines.map((l) => '• ' + l).join('\n'), '#b07/ledger'), verify: outputVerify },

  detect_overdue: { label: 'Find overdue work and payments', capability: 12, level: 1, effect: 'output', feature: 'dashboard', triggers: ['schedule.daily', 'manual'], params: z.object({ enquiry_days: z.number().int().min(1).max(30).default(2), quote_days: z.number().int().min(1).max(60).default(7) }).strict(),
    analyse(ctx) {
      const now = iso(), all = (sql, ...a) => ctx.db.prepare(sql).all(...a);
      const items = [
        ...all("SELECT title FROM tenant_documents WHERE organisation_id=? AND kind='invoice' AND status IN ('issued','part_paid') AND due_at<?", ctx.org, now).map((r) => `Invoice overdue: ${r.title}`),
        ...all("SELECT title FROM tenant_documents WHERE organisation_id=? AND kind='enquiry' AND status IN ('open','draft') AND created_at<?", ctx.org, iso(Date.now() - (ctx.params.enquiry_days || 2) * DAY)).map((r) => `Enquiry waiting for a quote: ${r.title}`),
        ...all("SELECT title FROM tenant_documents WHERE organisation_id=? AND kind='quote' AND status='approved' AND updated_at<?", ctx.org, iso(Date.now() - (ctx.params.quote_days || 7) * DAY)).map((r) => `Quote not yet accepted: ${r.title}`),
        ...all("SELECT title FROM work_orders WHERE organisation_id=? AND status IN ('awaiting_allocation','offered') AND completed_at IS NULL AND start_at BETWEEN ? AND ?", ctx.org, now, iso(Date.now() + 2 * DAY)).map((r) => `Job in the next 2 days without workers: ${r.title}`),
        ...all("SELECT title FROM workspace_approvals WHERE organisation_id=? AND status='pending' AND requested_at<?", ctx.org, iso(Date.now() - 2 * DAY)).map((r) => `Approval waiting more than 2 days: ${r.title}`)
      ];
      return items.length ? { items: items.slice(0, 30) } : null;
    },
    schema: z.object({ items: z.array(z.string().max(300)).min(1).max(30) }),
    preview: (ctx, p) => ({ description: `${p.items.length} item(s) need attention`, data_involved: ['Titles of invoices, enquiries, quotes, jobs and approvals'], expected_outcome: 'A list in AI suggestions and a notification to owners and admins.' }),
    execute(ctx, p) { const r = output(ctx, 'alert', `${p.items.length} item(s) need attention`, p.items.map((i) => '• ' + i).join('\n'), '#b01/home'); ctx.deps.notify(ctx.org, { kind: 'automation_alert', title: `${p.items.length} item(s) need attention`, body: p.items.slice(0, 3).join('; '), link: '#b01/automations', dedupe: `overdue:${ctx.org}:${iso().slice(0, 10)}` }); return r; }, verify: outputVerify },

  prepare_campaign: { label: 'Prepare a marketing campaign draft', capability: 13, level: 1, effect: 'output', feature: 'growth', triggers: ['schedule.monthly', 'manual'], params: P, ai: { fields: ['body'], instruction: 'Write a short campaign idea (under 120 words) for a local service business based on the facts given. No customer names. No prices unless given.' },
    analyse(ctx) { const top = ctx.db.prepare("SELECT COALESCE(ai_category,'general') c,COUNT(*) n FROM tenant_documents WHERE organisation_id=? AND kind='enquiry' AND created_at>=? GROUP BY c ORDER BY n DESC LIMIT 1").get(ctx.org, iso(Date.now() - 60 * DAY)); const month = new Date().toLocaleString('en-AU', { month: 'long' }); const theme = (top?.c || 'general').replace(/_/g, ' '); return { title: `${month} campaign: ${theme}`, body: `Idea: remind past customers about ${theme} before the busy season. Offer a simple next step (book a check or ask for a quote). Use one photo of recent work, with the customer's permission.` }; },
    schema: z.object({ title: z.string().max(200), body: z.string().max(4000) }),
    preview: (ctx, p) => ({ description: `Campaign draft "${p.title}"`, data_involved: ['Enquiry categories from the last 60 days (no customer details)'], expected_outcome: 'A campaign draft in Campaigns. Launching it needs your approval.' }),
    execute(ctx, p) { const id = ctx.deps.docs.create(ctx.org, 'campaign', p.title, p.body); return { ref: id, summary: 'Campaign draft created', link: '#b05/campaigns' }; },
    verify(ctx, p, r) { return ctx.db.prepare("SELECT 1 FROM tenant_documents WHERE id=? AND organisation_id=? AND kind='campaign' AND status='draft'").get(r.ref, ctx.org) ? { ok: true, detail: 'Draft waiting in Campaigns.' } : { ok: false, detail: 'Campaign draft not found.' }; } },

  social_content: { label: 'Draft a social post about completed work', capability: 14, level: 1, effect: 'output', feature: 'content', triggers: ['job.completed'], params: P, ai: { fields: ['body'], instruction: 'Write a short social media post (under 60 words) about a completed job of this type. Never include the customer\'s name or address.' },
    analyse: (ctx) => ({ title: `Social post: ${ctx.facts.job.title}`, body: `Another job done: ${ctx.facts.job.title.toLowerCase()}. Thanks for trusting us with your property. Need something similar? Get in touch for a quote.` }),
    schema: z.object({ title: z.string().max(240), body: z.string().max(1000) }),
    preview: (ctx, p) => ({ description: p.title, data_involved: ['Job title only (no customer name or address)'], expected_outcome: 'A post draft in AI suggestions. Publishing is your choice.' }),
    execute: (ctx, p) => output(ctx, 'draft', p.title, p.body, '#b05/growth'), verify: outputVerify },

  analyse_seo: { label: 'Analyse search performance', capability: 15, level: 1, effect: 'output', feature: 'visibility', triggers: ['schedule.weekly', 'manual'], params: P,
    analyse(ctx) {
      const rows = ctx.db.prepare('SELECT metric_key,metric_value,captured_at FROM seo_metrics WHERE organisation_id=? ORDER BY captured_at DESC LIMIT 200').all(ctx.org);
      if (!rows.length) return { lines: ['No search numbers recorded yet. Add them in Website & Visibility > Search, or connect Search Console.'] };
      const by = {}; for (const r of rows) (by[r.metric_key] ||= []).push(r.metric_value);
      return { lines: Object.entries(by).slice(0, 8).map(([k, v]) => `${k.replace(/_/g, ' ')}: ${v[0]}${v[1] !== undefined ? ` (previous ${v[1]}, ${v[0] >= v[1] ? 'up' : 'down'})` : ''}`) };
    },
    schema: z.object({ lines: z.array(z.string().max(200)).max(20) }),
    preview: (ctx, p) => ({ description: 'Search performance review', data_involved: ['Search numbers you recorded'], expected_outcome: p.lines.join('; ') }),
    execute: (ctx, p) => output(ctx, 'report', 'Search performance', p.lines.map((l) => '• ' + l).join('\n'), '#b06/search'), verify: outputVerify },

  prepare_website_update: { label: 'Prepare website content updates', capability: 16, level: 1, effect: 'output', feature: 'settings', triggers: ['schedule.monthly', 'manual'], params: P, ai: { fields: ['body'], instruction: 'Suggest a short services section (under 150 words) for the business website based on the job types given. No customer details.' },
    analyse(ctx) { const kinds = ctx.db.prepare("SELECT title FROM work_orders WHERE organisation_id=? AND completed_at IS NOT NULL ORDER BY completed_at DESC LIMIT 10").all(ctx.org).map((r) => r.title); return { title: 'Website update: services you do most', body: kinds.length ? `Suggested "Our recent work" section:\n${[...new Set(kinds)].slice(0, 6).map((k) => '• ' + k).join('\n')}` : 'Complete a few jobs first; the suggestion is built from your recent work.' }; },
    schema: z.object({ title: z.string().max(200), body: z.string().max(4000) }),
    preview: (ctx, p) => ({ description: p.title, data_involved: ['Titles of recently completed jobs'], expected_outcome: 'A content draft in AI suggestions. Publishing to a website is not connected yet.' }),
    execute: (ctx, p) => output(ctx, 'draft', p.title, p.body, '#b06/website'), verify: outputVerify },

  detect_failed_integrations: { label: 'Detect failed connections', capability: 18, level: 1, effect: 'output', feature: 'integrations', triggers: ['schedule.hourly', 'schedule.daily', 'manual'], params: P,
    analyse(ctx) {
      const items = [];
      try { for (const r of ctx.db.prepare("SELECT display_name,status FROM organisation_integrations WHERE organisation_id=? AND status IN ('error','failed','expired','revoked','needs_reconnect')").all(ctx.org)) items.push(`${r.display_name}: ${r.status.replace(/_/g, ' ')}`); } catch { /* table optional */ }
      try { const n = ctx.db.prepare("SELECT COUNT(*) n FROM portal_mail WHERE owner_id=? AND scope='business' AND status='failed' AND updated_at>=?").get(ctx.org, iso(Date.now() - DAY)).n; if (n) items.push(`${n} email(s) failed to send in the last 24 hours`); } catch { /* optional */ }
      try { const n = ctx.db.prepare("SELECT COUNT(*) n FROM background_jobs WHERE organisation_id=? AND status='dead' AND updated_at>=?").get(ctx.org, iso(Date.now() - DAY)).n; if (n) items.push(`${n} background task(s) failed permanently in the last 24 hours`); } catch { /* optional */ }
      return items.length ? { items } : null;
    },
    schema: z.object({ items: z.array(z.string().max(300)).min(1).max(20) }),
    preview: (ctx, p) => ({ description: `${p.items.length} connection problem(s)`, data_involved: ['Connection and delivery status'], expected_outcome: p.items.join('; ') }),
    execute(ctx, p) { const r = output(ctx, 'alert', 'Connection problems', p.items.map((i) => '• ' + i).join('\n'), '#b08/connections'); ctx.deps.notify(ctx.org, { kind: 'automation_alert', title: 'A connection needs attention', body: p.items[0], link: '#b08/connections', dedupe: `integrations:${ctx.org}:${iso().slice(0, 13)}` }); return r; }, verify: outputVerify },

  prepare_follow_up: { label: 'Draft follow-ups for quotes waiting on the customer', capability: 19, level: 1, effect: 'output', feature: 'mail', triggers: ['schedule.daily', 'manual'], params: z.object({ after_days: z.number().int().min(1).max(60).default(3) }).strict(),
    analyse(ctx) { const qs = followUpCandidates(ctx); return qs.length ? { quotes: qs } : null; },
    schema: z.object({ quotes: z.array(z.object({ id: z.string().uuid(), to: z.string().email(), name: z.string(), title: z.string() })).min(1).max(10) }),
    preview: (ctx, p) => ({ description: `Follow-up drafts for ${p.quotes.length} quote(s)`, data_involved: ['Customer names and emails', 'Quote titles'], expected_outcome: 'Email drafts in the Email Centre, not sent.' }),
    execute(ctx, p) { const ids = p.quotes.map((q) => ctx.deps.mail.createDraft({ ownerId: ctx.org, recipient: q.to, subject: `Following up: ${q.title}`.slice(0, 200), body: followUpBody(ctx, q), category: 'general', createdBy: 'automation' })); markFollowedUp(ctx, p.quotes); return { ref: ids.join(','), summary: `${ids.length} follow-up draft(s)`, link: '#b04/email' }; },
    verify(ctx, p, r) { const ids = String(r.ref || '').split(',').filter(Boolean); return ids.length && ids.every((id) => ctx.deps.mail.mailStatus(id, ctx.org)?.status === 'draft') ? { ok: true, detail: `${ids.length} draft(s) in the Email Centre.` } : { ok: false, detail: 'Follow-up drafts not found.' }; } },

  recommend_improvements: { label: 'Recommend business improvements', capability: 20, level: 1, effect: 'output', feature: 'dashboard', triggers: ['schedule.weekly', 'manual'], params: P,
    analyse(ctx) {
      const since = iso(Date.now() - 90 * DAY), n = (sql, ...a) => ctx.db.prepare(sql).get(...a).n;
      const enq = n("SELECT COUNT(*) n FROM tenant_documents WHERE organisation_id=? AND kind='enquiry' AND created_at>=?", ctx.org, since);
      const quoted = n("SELECT COUNT(*) n FROM tenant_documents WHERE organisation_id=? AND kind='quote' AND created_at>=?", ctx.org, since);
      const booked = n("SELECT COUNT(*) n FROM tenant_documents WHERE organisation_id=? AND kind='booking' AND created_at>=?", ctx.org, since);
      const overdue = n("SELECT COUNT(*) n FROM tenant_documents WHERE organisation_id=? AND kind='invoice' AND status IN ('issued','part_paid') AND due_at<?", ctx.org, iso());
      const tips = [];
      if (enq >= 3 && quoted / enq < 0.6) tips.push(`Only ${Math.round((quoted / enq) * 100)}% of enquiries got a quote in 90 days. A quote-draft automation with your usual prices could help.`);
      if (quoted >= 3 && booked / quoted < 0.4) tips.push(`${Math.round((booked / quoted) * 100)}% of quotes became bookings. Follow-up drafts after 3 days often lift this.`);
      if (overdue) tips.push(`${overdue} invoice(s) are overdue. Consider turning on customer reminders in Automation settings.`);
      if (!tips.length) tips.push(enq ? 'Your enquiry-to-booking flow looks healthy for the last 90 days.' : 'Not enough activity yet for recommendations.');
      return { tips };
    },
    schema: z.object({ tips: z.array(z.string().max(400)).max(10) }),
    preview: (ctx, p) => ({ description: 'Improvement recommendations', data_involved: ['Counts of enquiries, quotes, bookings and overdue invoices'], expected_outcome: p.tips.join(' ') }),
    execute: (ctx, p) => output(ctx, 'report', 'Recommendations', p.tips.map((t) => '• ' + t).join('\n'), '#b01/automations'), verify: outputVerify },

  // ---------------- Level 2: rule-based automatic ----------------
  send_acknowledgement: { label: 'Send a routine acknowledgement to new enquiries', capability: 6, level: 2, rule: 'routine_acknowledgements', effect: 'external', feature: 'mail', triggers: ['enquiry.created'], params: P,
    analyse(ctx) { const c = ctx.facts.customer; if (!c?.email) return null; return { to: c.email, subject: `We received your enquiry: ${ctx.facts.enquiry.title}`.slice(0, 200), body: `Hi ${c.name.split(' ')[0]},\n\nThanks for contacting ${ctx.facts.business}. We have received your enquiry about "${ctx.facts.enquiry.title}" and will reply soon.\n\n${ctx.facts.business}` }; },
    schema: z.object({ to: z.string().email(), subject: z.string().min(2).max(200), body: z.string().min(10).max(2000) }),
    preview: (ctx, p) => ({ description: `Acknowledge ${ctx.facts.customer?.name}'s enquiry`, data_involved: ['Customer name and email'], expected_outcome: `Email to ${p.to}: "${p.subject}"` }),
    execute: (ctx, p) => sendMail(ctx, p, 'enquiries'), verify: verifyMail },

  send_appointment_reminder: { label: 'Send appointment reminders', capability: 5, level: 2, rule: 'appointment_reminders', effect: 'external', feature: 'mail', triggers: ['schedule.daily', 'manual'], params: P,
    analyse(ctx) {
      const from = iso(Date.now() + DAY - 12 * 3600000), to = iso(Date.now() + 2 * DAY);
      const rows = ctx.db.prepare("SELECT w.id,w.title,w.start_at,w.address,c.name,c.email FROM work_orders w JOIN tenant_customers c ON c.id=w.customer_id AND c.organisation_id=w.organisation_id WHERE w.organisation_id=? AND w.start_at BETWEEN ? AND ? AND w.completed_at IS NULL AND w.status<>'cancelled' AND c.email IS NOT NULL AND c.email<>'' AND NOT EXISTS (SELECT 1 FROM automation_marks m WHERE m.organisation_id=w.organisation_id AND m.mark='reminded' AND m.ref=w.id)").all(ctx.org, from, to);
      return rows.length ? { reminders: rows.slice(0, 20).map((r) => ({ id: r.id, to: r.email, name: r.name, title: r.title, start_at: r.start_at, address: r.address || '' })) } : null;
    },
    schema: z.object({ reminders: z.array(z.object({ id: z.string().uuid(), to: z.string().email(), name: z.string(), title: z.string(), start_at: z.string(), address: z.string() })).min(1).max(20) }),
    preview: (ctx, p) => ({ description: `Remind ${p.reminders.length} customer(s) about tomorrow's appointments`, data_involved: ['Customer names and emails', 'Job titles, times and addresses'], expected_outcome: p.reminders.map((r) => `${r.name}: ${r.title}`).join('; ') }),
    execute(ctx, p) {
      const ids = []; for (const r of p.reminders) { ids.push(sendMail(ctx, { to: r.to, subject: `Reminder: ${r.title}`.slice(0, 200), body: `Hi ${r.name.split(' ')[0]},\n\nA reminder that we are booked for "${r.title}" on ${new Date(r.start_at).toLocaleString('en-AU', { dateStyle: 'full', timeStyle: 'short' })}${r.address ? ' at ' + r.address : ''}.\n\nReply to this email if you need to change it.\n\n${ctx.facts.business}` }, 'general').ref); ctx.deps.mark(ctx.org, 'reminded', r.id); }
      return { ref: ids.join(','), summary: `${ids.length} reminder(s) queued`, link: '#b04/email' };
    },
    verify: verifyMail },

  send_follow_up: { label: 'Send approved follow-ups for quotes', capability: 19, level: 2, rule: 'approved_follow_ups', effect: 'external', feature: 'mail', triggers: ['schedule.daily', 'manual'], params: z.object({ after_days: z.number().int().min(1).max(60).default(3) }).strict(),
    analyse(ctx) { const qs = followUpCandidates(ctx, ctx.rule?.limits?.max_per_day || 10); return qs.length ? { quotes: qs } : null; },
    schema: z.object({ quotes: z.array(z.object({ id: z.string().uuid(), to: z.string().email(), name: z.string(), title: z.string() })).min(1).max(20) }),
    preview: (ctx, p) => ({ description: `Follow up ${p.quotes.length} quote(s)`, data_involved: ['Customer names and emails', 'Quote titles'], expected_outcome: p.quotes.map((q) => `${q.name}: ${q.title}`).join('; ') }),
    execute(ctx, p) { const ids = p.quotes.map((q) => sendMail(ctx, { to: q.to, subject: `Following up: ${q.title}`.slice(0, 200), body: followUpBody(ctx, q) }, 'general').ref); markFollowedUp(ctx, p.quotes); return { ref: ids.join(','), summary: `${ids.length} follow-up(s) queued`, link: '#b04/email' }; },
    verify: verifyMail },

  auto_offer_job: { label: 'Offer booked jobs to eligible workers', capability: 8, level: 2, rule: 'internal_transitions', effect: 'internal_write', feature: 'jobs', triggers: ['job.booked'], params: P,
    analyse: (ctx) => ({ work_order_id: ctx.facts.job.id }),
    schema: z.object({ work_order_id: z.string().uuid() }),
    preview: (ctx) => ({ description: `Offer "${ctx.facts.job.title}" to eligible workers`, data_involved: ['Worker eligibility'], expected_outcome: 'Eligible workers are notified and can accept. Nobody is offered if nobody is eligible.' }),
    execute(ctx, p) { const j = ctx.db.prepare('SELECT * FROM work_orders WHERE id=? AND organisation_id=?').get(p.work_order_id, ctx.org); if (!j) throw Object.assign(new Error('Job not found.'), { permanent: true }); const r = ctx.deps.offers.offer(ctx.org, ctx.rule?.configured_by || 'automation', j); return { ref: j.id, summary: r.eligible.length ? `Offered to ${r.eligible.length} worker(s)` : 'No worker was eligible; nobody was offered.' }; },
    verify(ctx, p) { const j = ctx.db.prepare('SELECT status FROM work_orders WHERE id=?').get(p.work_order_id); return j ? { ok: true, detail: `Job status: ${j.status.replace(/_/g, ' ')}.` } : { ok: false, detail: 'Job not found.' }; } },

  // ---------------- Level 3: human approval ----------------
  send_quote_to_customer: { label: 'Send the quote to the customer', capability: 4, level: 3, effect: 'external', feature: 'mail', triggers: ['quote.approved'], params: P,
    analyse(ctx) { const c = ctx.facts.customer, q = ctx.facts.quote; if (!c?.email) return null; return { quote_id: q.id, to: c.email, subject: `Your quote: ${q.title}`.slice(0, 200), body: `Hi ${c.name.split(' ')[0]},\n\nHere is our quote for "${q.title}".\n\nPrice: ${money(q.amount_cents)}\nGST: ${money(q.gst_cents)}\nTotal: ${money(q.amount_cents + q.gst_cents)}\n\n${q.body ? q.body + '\n\n' : ''}Reply to accept, or call us with any questions.\n\n${ctx.facts.business}` }; },
    schema: z.object({ quote_id: z.string().uuid(), to: z.string().email(), subject: z.string().min(2).max(200), body: z.string().min(10).max(8000) }),
    preview: (ctx, p) => ({ description: `Email the quote "${ctx.facts.quote.title}" to ${ctx.facts.customer?.name}`, data_involved: ['Customer name and email', 'Quote amounts and details'], expected_outcome: `Email to ${p.to} with the quote total`, cost_cents: null }),
    execute: (ctx, p) => sendMail(ctx, p, 'general'), verify: verifyMail },

  sensitive_message: { label: 'Reply to a sensitive message (complaint)', capability: 6, level: 3, effect: 'external', feature: 'mail', triggers: ['enquiry.created'], params: P,
    analyse(ctx) { const c = ctx.facts.customer; if (!c?.email || classify(`${ctx.facts.enquiry.title} ${ctx.untrusted}`).category !== 'complaint') return null; return { to: c.email, subject: `Re: ${ctx.facts.enquiry.title}`.slice(0, 200), body: `Hi ${c.name.split(' ')[0]},\n\nThank you for letting us know. We are sorry to hear about your experience and will call you to sort it out.\n\n${ctx.facts.business}` }; },
    schema: z.object({ to: z.string().email(), subject: z.string().min(2).max(200), body: z.string().min(10).max(4000) }),
    preview: (ctx, p) => ({ description: `Reply to ${ctx.facts.customer?.name}'s complaint`, data_involved: ['Customer name and email', 'Complaint text'], expected_outcome: `Email to ${p.to}` }),
    execute: (ctx, p) => sendMail(ctx, p, 'support'), verify: verifyMail },

  change_job_price: { label: 'Change a job price', capability: 9, level: 3, effect: 'internal_write', feature: 'finance', triggers: ['manual'], params: z.object({ work_order_id: z.string().uuid(), new_price: z.number().min(0).max(10000000) }).strict(),
    analyse(ctx) { const j = ctx.db.prepare('SELECT id,title,price_cents FROM work_orders WHERE id=? AND organisation_id=?').get(ctx.params.work_order_id, ctx.org); return j ? { work_order_id: j.id, old_price_cents: j.price_cents, new_price_cents: Math.round(ctx.params.new_price * 100) } : null; },
    schema: z.object({ work_order_id: z.string().uuid(), old_price_cents: z.number().int(), new_price_cents: z.number().int().min(0) }),
    preview: (ctx, p) => ({ description: 'Change a job price', data_involved: ['Job price'], expected_outcome: `${money(p.old_price_cents)} → ${money(p.new_price_cents)}`, cost_cents: p.new_price_cents - p.old_price_cents }),
    execute(ctx, p) { const r = ctx.db.prepare('UPDATE work_orders SET price_cents=?,updated_at=? WHERE id=? AND organisation_id=? AND price_cents=?').run(p.new_price_cents, iso(), p.work_order_id, ctx.org, p.old_price_cents); if (!r.changes) throw Object.assign(new Error('The price changed since this was proposed. Propose it again.'), { permanent: true }); ctx.deps.syncJobFinance?.(ctx.org, p.work_order_id, ctx.actor); return { ref: p.work_order_id, summary: `Price set to ${money(p.new_price_cents)}` }; },
    verify(ctx, p) { const j = ctx.db.prepare('SELECT price_cents FROM work_orders WHERE id=?').get(p.work_order_id); return j?.price_cents === p.new_price_cents ? { ok: true, detail: 'Job shows the new price.' } : { ok: false, detail: 'Price not updated.' }; } },

  ...manual('refund_or_transfer', 'Refund or transfer money', 'finance', 'Make the refund or transfer in your bank or payment provider, then mark it done.'),
  ...manual('launch_campaign', 'Launch a new or changed marketing campaign', 'growth', 'Launch from your email or social tools; bulk sending is not automated.'),
  ...manual('publish_website', 'Publish website changes', 'settings', 'Publish through your website host; no website is connected for automatic publishing.'),
  ...manual('staff_permission_change', 'Change a staff member’s permissions', 'team', 'Change the permissions in People > Staff accounts.'),
  ...manual('compliance_submission', 'Make a legal or compliance submission', 'governance', 'Lodge it with the authority yourself and keep the receipt.'),
  ...manual('subscription_change', 'Change the subscription plan', 'billing', 'Change it in Plans & Usage.'),
  ...manual('data_export', 'Export business data', 'governance', 'Run the export from Setup & Trust > Print & export.'),
  ...manual('data_deletion', 'Delete business data', 'governance', 'Delete it yourself from the relevant screen after checking backups and retention rules.'),

  // ---------------- Platform (Founder Console) ----------------
  monitor_health: { scope: 'platform', label: 'Monitor platform health', capability: 17, level: 1, effect: 'output', feature: 'operations', triggers: ['schedule.hourly', 'manual'], params: P,
    analyse(ctx) { const h = ctx.deps.health(); return { ok: h.problems.length === 0, problems: h.problems, facts: h.facts }; },
    schema: z.object({ ok: z.boolean(), problems: z.array(z.string()).max(30), facts: z.array(z.string()).max(30) }),
    preview: (ctx, p) => ({ description: 'Platform health check', data_involved: ['Database, background jobs and storage status'], expected_outcome: p.ok ? 'Healthy.' : p.problems.join('; ') }),
    execute: (ctx, p) => output(ctx, p.ok ? 'report' : 'alert', p.ok ? 'Platform healthy' : `Platform: ${p.problems.length} problem(s)`, [...p.problems.map((x) => '• ' + x), ...p.facts.map((x) => '· ' + x)].join('\n')), verify: outputVerify },
  verify_backups: { scope: 'platform', label: 'Verify backups are configured', capability: 17, level: 1, effect: 'output', feature: 'operations', triggers: ['schedule.daily', 'manual'], params: P,
    analyse(ctx) { const b = ctx.deps.backups(); return { ok: b.problems.length === 0, problems: b.problems, facts: b.facts }; },
    schema: z.object({ ok: z.boolean(), problems: z.array(z.string()).max(30), facts: z.array(z.string()).max(30) }),
    preview: (ctx, p) => ({ description: 'Backup configuration check', data_involved: ['Backup settings (names and yes/no only)'], expected_outcome: p.ok ? 'Backups configured.' : p.problems.join('; ') }),
    execute: (ctx, p) => output(ctx, p.ok ? 'report' : 'alert', p.ok ? 'Backups configured' : 'Backup problem', [...p.problems.map((x) => '• ' + x), ...p.facts.map((x) => '· ' + x)].join('\n')), verify: outputVerify },
  platform_failed_jobs: { scope: 'platform', label: 'Detect failed background work and integrations', capability: 18, level: 1, effect: 'output', feature: 'operations', triggers: ['schedule.hourly', 'manual'], params: P,
    analyse(ctx) { const rows = ctx.db.prepare("SELECT type,COUNT(*) n FROM background_jobs WHERE status='dead' AND updated_at>=? GROUP BY type").all(iso(Date.now() - DAY)); return rows.length ? { items: rows.map((r) => `${r.type}: ${r.n} failed permanently in 24 hours`) } : null; },
    schema: z.object({ items: z.array(z.string()).min(1).max(30) }),
    preview: (ctx, p) => ({ description: 'Failed background work', data_involved: ['Job types and counts'], expected_outcome: p.items.join('; ') }),
    execute: (ctx, p) => output(ctx, 'alert', 'Failed background work', p.items.map((x) => '• ' + x).join('\n')), verify: outputVerify },
  ...manual('production_deployment', 'Deploy to production', 'founder', 'Deploy from Render yourself after the tests pass. Automation never deploys.', 'platform'),
  ...manual('infrastructure_change', 'Change infrastructure', 'founder', 'Make the change in Render or AWS yourself.', 'platform'),
  ...manual('credential_rotation', 'Rotate credentials', 'founder', 'Rotate the key with the provider, update Render, then mark it done. Never paste keys here.', 'platform'),
  ...manual('security_policy_change', 'Change a security policy', 'founder', 'Change the setting yourself and record why.', 'platform'),

  // ---------------- Phase 06: website publishing, reviews, sitemaps and scheduled SEO operations ----------------
  publish_site_page: { label: 'Publish a website page', capability: 16, level: 2, rule: 'low_risk_site_updates', effect: 'external', feature: 'settings', triggers: ['manual'], params: z.object({ page_id: z.string().uuid(), version: z.number().int().positive(), publish_at: z.string().nullable().default(null) }).strict(),
    analyse(ctx) { const owner = ctx.org || 'platform'; const pr = ctx.deps.seo.publishProposal(owner, ctx.params.page_id, ctx.params.version, ctx.params.publish_at); if (!pr) return null; return { page_id: pr.page.id, version: ctx.params.version, url: pr.url, title: pr.after.title, publish_at: ctx.params.publish_at || null, low_risk: pr.risk.low_risk, risk_reasons: pr.risk.reasons, blocked: pr.checks.blocked, claims: pr.checks.claims.filter((c) => c.level === 'review').map((c) => c.text).slice(0, 10) }; },
    escalate: (ctx, p) => (p && !p.low_risk ? p.risk_reasons.map((r) => 'Needs approval: ' + r) : []),
    schema: z.object({ page_id: z.string().uuid(), version: z.number().int(), url: z.string(), title: z.string().max(240), publish_at: z.string().nullable(), low_risk: z.boolean(), risk_reasons: z.array(z.string()), blocked: z.boolean(), claims: z.array(z.string()) }),
    preview: (ctx, p) => ({ description: `Publish "${p.title}" (version ${p.version})`, data_involved: ['Page content', ...(p.claims.length ? ['Public claims to check'] : [])], expected_outcome: `${p.publish_at ? 'Goes live at ' + new Date(p.publish_at).toLocaleString('en-AU', { dateStyle: 'medium', timeStyle: 'short' }) : 'Goes live now'} at ${p.url}.${p.claims.length ? ' Claims to confirm: ' + p.claims.join(' | ') : ''}${p.risk_reasons.length ? ' Why it needs approval: ' + p.risk_reasons.join(' ') : ' Low-risk change.'}` }),
    execute(ctx, p) { if (p.blocked) throw Object.assign(new Error('The page has problems that must be fixed before publishing.'), { permanent: true }); const r = ctx.deps.seo.publishVersion(ctx.org || 'platform', p.page_id, p.version, { publish_at: p.publish_at }); return { ref: p.page_id, summary: r.scheduled_for ? `Scheduled to go live ${new Date(r.scheduled_for).toLocaleString('en-AU')}` : `Published at ${p.url}`, link: '#b06/builder', scheduled: Boolean(r.scheduled_for) }; },
    verify(ctx, p, r) { const row = ctx.db.prepare('SELECT status,published_version,scheduled_version FROM seo_site_pages WHERE id=?').get(p.page_id); if (r.scheduled) return row?.status === 'scheduled' && row.scheduled_version === p.version ? { ok: true, detail: 'Scheduled; it goes live automatically at the set time.' } : { ok: false, detail: 'The schedule was not saved.' }; if (row?.published_version !== p.version) return { ok: false, detail: 'The page is not showing the approved version.' }; const slug = p.url.split('/'); const live = ctx.deps.seo.renderPublic(slug[2], slug[3] || 'home'); return live?.status === 200 ? { ok: true, detail: `Live at ${p.url}.` } : { ok: false, detail: 'The published page did not render.' }; } },
  reply_to_review: { label: 'Post a reply to a Google review', capability: 6, level: 3, effect: 'external', feature: 'visibility', triggers: ['manual'], params: z.object({ review_id: z.string().min(1).max(200), comment: z.string().trim().min(2).max(4000) }).strict(),
    analyse(ctx) { const r = ctx.db.prepare('SELECT reviewer,rating,comment FROM seo_reviews WHERE owner_key=? AND review_id=?').get(ctx.org || 'platform', ctx.params.review_id); return r ? { review_id: ctx.params.review_id, reviewer: r.reviewer, rating: r.rating, comment: ctx.params.comment } : null; },
    schema: z.object({ review_id: z.string(), reviewer: z.string().nullable(), rating: z.number().nullable(), comment: z.string().min(2).max(4000) }),
    preview: (ctx, p) => ({ description: `Reply publicly to ${p.reviewer}'s ${p.rating}-star Google review`, data_involved: ['The review', 'Your reply (public)'], expected_outcome: `Posted on Google: "${p.comment.slice(0, 200)}"` }),
    async_execute: true, async executeAsync(ctx, p) { await ctx.deps.seo.postReviewReply(ctx.org || 'platform', p.review_id, p.comment); return { ref: p.review_id, summary: 'Reply posted on Google.' }; },
    verify(ctx, p) { const r = ctx.db.prepare('SELECT reply_status FROM seo_reviews WHERE owner_key=? AND review_id=?').get(ctx.org || 'platform', p.review_id); return r?.reply_status === 'replied' ? { ok: true, detail: 'Google accepted the reply.' } : { ok: false, detail: 'The reply was not recorded.' }; } },
  submit_sitemap: { label: 'Submit the sitemap to Google Search Console', capability: 17, level: 3, effect: 'external', feature: 'visibility', triggers: ['manual'], params: z.object({ sitemap_url: z.string().url().max(500) }).strict(),
    analyse: (ctx) => ({ sitemap_url: ctx.params.sitemap_url }), schema: z.object({ sitemap_url: z.string().url() }),
    preview: (ctx, p) => ({ description: 'Submit the sitemap to Google', data_involved: ['Sitemap address'], expected_outcome: `${p.sitemap_url} is submitted. Google decides when and whether to crawl and index the pages.` }),
    async_execute: true, async executeAsync(ctx, p) { const owner = ctx.org || 'platform', l = ctx.deps.seo.link(owner, 'search_console'); if (!l) throw Object.assign(new Error('Link a Search Console property first.'), { permanent: true }); const r = await ctx.deps.seo.google.gscSubmitSitemap(await ctx.deps.seo.googleToken(owner, 'google_seo'), l.resource, p.sitemap_url); return { ref: p.sitemap_url, summary: r.note }; },
    verify: (ctx, p, r) => ({ ok: true, detail: r.summary }) },
  // ---------------- Phase 07: bulk campaigns always need a person ----------------
  send_campaign: { label: 'Send a marketing campaign', capability: 13, level: 3, effect: 'external', feature: 'growth', triggers: ['manual'], params: z.object({ campaign_id: z.string().uuid(), revision: z.number().int().positive() }).strict(),
    analyse: (ctx) => ctx.deps.comms.campaignProposal(ctx.org || 'platform', ctx.params.campaign_id, ctx.params.revision),
    schema: z.object({ campaign_id: z.string().uuid(), revision: z.number().int(), current_revision: z.number().int(), name: z.string(), channel: z.enum(['email', 'sms', 'social']), recipients: z.number().int(), excluded: z.object({ no_consent: z.number(), suppressed: z.number(), no_address: z.number() }), sample: z.array(z.string()), send_at: z.string().nullable(), subject: z.string().nullable(), body: z.string(), estimated_cost_cents: z.number().nullable(), social_targets: z.array(z.any()) }),
    preview: (ctx, p) => ({ description: `Send the ${p.channel} campaign "${p.name}"`, data_involved: [p.channel === 'social' ? 'Social posts' : `${p.recipients} recipient(s) who agreed to marketing`, 'Message content'], expected_outcome: p.channel === 'social' ? `Scheduled on ${p.social_targets.map((t) => t.platform || t).join(', ')}${p.send_at ? ' for ' + new Date(p.send_at).toLocaleString('en-AU') : ''}.` : `${p.recipients} ${p.channel === 'sms' ? 'text message' : 'email'}(s)${p.send_at ? ' at ' + new Date(p.send_at).toLocaleString('en-AU', { dateStyle: 'medium', timeStyle: 'short' }) : ' straight after approval'}. Left out: ${p.excluded.no_consent} without consent, ${p.excluded.suppressed} unsubscribed or suppressed, ${p.excluded.no_address} without an address. Sample: ${p.sample.join(', ')}`, cost_cents: p.estimated_cost_cents }),
    execute(ctx, p) { const owner = ctx.org || 'platform'; const r = ctx.deps.comms.approveCampaign(owner, p, ctx.run.approver_id); if (p.channel !== 'social') ctx.deps.comms.enqueueSend(owner, p.campaign_id, r.send_at); return { ref: p.campaign_id, summary: p.channel === 'social' ? `${r.calendar_items} post(s) added to the content calendar` : `${r.queued} message(s) queued${r.send_at ? ' for ' + new Date(r.send_at).toLocaleString('en-AU') : ''}`, link: '#b05/campaigns' }; },
    verify(ctx, p, r) { const c = ctx.db.prepare('SELECT status,approved_revision,revision FROM comms_campaigns WHERE id=?').get(p.campaign_id); return c && c.approved_revision === c.revision ? { ok: true, detail: p.channel === 'social' ? 'Posts are in the content calendar.' : `Campaign ${c.status.replace(/_/g, ' ')}; sending progress shows in Campaigns.` } : { ok: false, detail: 'The campaign was not approved for sending.' }; } },
  // ---------------- Phase 08: money adjustments always need a person ----------------
  apply_credit_note: { label: 'Issue an adjustment (credit) note', capability: 9, level: 3, effect: 'internal_write', feature: 'finance', triggers: ['manual'], params: z.object({ credit_note_id: z.string().uuid() }).strict(),
    analyse: (ctx) => ctx.deps.finance.creditProposal(ctx.org, ctx.params.credit_note_id),
    schema: z.object({ credit_note_id: z.string().uuid(), invoice_id: z.string(), invoice_number: z.string(), reason: z.string(), total_cents: z.number().int(), gst_cents: z.number().int(), owing_cents: z.number().int(), refund_due_cents: z.number().int() }),
    preview: (ctx, p) => ({ description: `Credit ${money(p.total_cents)} against invoice ${p.invoice_number}`, data_involved: ['Invoice and job balance', 'GST adjustment'], expected_outcome: `An adjustment note is issued for ${money(p.total_cents)} (GST ${money(p.gst_cents)}). Reason: ${p.reason}.${p.refund_due_cents ? ` ${money(p.refund_due_cents)} more than is owing has been paid, so request a refund afterwards.` : ''}`, cost_cents: p.total_cents }),
    execute(ctx, p) { const r = ctx.deps.finance.applyCreditNote(ctx.org, p, ctx.run.approver_id || ctx.actor); if (!r.applied) throw Object.assign(new Error('This credit note is no longer waiting for approval.'), { permanent: true }); return { ref: p.credit_note_id, summary: `Adjustment note ${r.number} issued for ${money(p.total_cents)}`, link: '#b07/fin-invoices' }; },
    verify(ctx, p) { const d = ctx.db.prepare('SELECT status,number FROM tenant_documents WHERE id=?').get(p.credit_note_id); return d?.status === 'issued' ? { ok: true, detail: `Adjustment note ${d.number} is issued.` } : { ok: false, detail: 'The adjustment note was not issued.' }; } },
  issue_refund: { label: 'Refund a customer payment', capability: 10, level: 3, effect: 'external', feature: 'finance', triggers: ['manual'], params: z.object({ refund_id: z.string().uuid() }).strict(),
    analyse: (ctx) => ctx.deps.finance.refundProposal(ctx.org, ctx.params.refund_id),
    schema: z.object({ refund_id: z.string().uuid(), payment_id: z.string(), amount_cents: z.number().int().positive(), paid_cents: z.number().int(), already_refunded_cents: z.number().int(), provider: z.string(), receipt_no: z.string(), job: z.string(), customer: z.string(), reason: z.string(), how: z.string() }),
    preview: (ctx, p) => ({ description: `Refund ${money(p.amount_cents)} to ${p.customer || 'the customer'}`, data_involved: [`Payment ${p.receipt_no || p.payment_id} of ${money(p.paid_cents)}`, p.provider === 'stripe' ? 'Your Stripe account' : 'Your bank or PayPal account'], expected_outcome: `${p.how} Reason: ${p.reason}.${p.already_refunded_cents ? ` ${money(p.already_refunded_cents)} was already refunded.` : ''}`, cost_cents: p.amount_cents }),
    async_execute: true, async executeAsync(ctx, p) { return ctx.deps.finance.executeRefund(ctx.org, p, ctx.run.approver_id || ctx.actor); },
    verify(ctx, p) { const r = ctx.db.prepare('SELECT status FROM fin_refunds WHERE id=?').get(p.refund_id); return r && ['submitted', 'completed'].includes(r.status) ? { ok: true, detail: `Refund ${r.status}.` } : r?.status === 'awaiting_manual' ? { ok: false, pending: true, detail: 'Waiting for a person to pay it back and mark it done.' } : { ok: false, detail: 'The refund did not go through.' }; } },
  change_plan_price: { scope: 'platform', label: 'Change a subscription plan price', capability: 9, level: 3, effect: 'internal_write', feature: 'billing', triggers: ['manual'], params: z.object({ change_id: z.string().uuid() }).strict(),
    analyse: (ctx) => ctx.deps.platformFinance.priceProposal(ctx.params.change_id),
    schema: z.object({ change_id: z.string().uuid(), plan_id: z.string(), plan: z.string(), from_cents: z.number().int(), to_cents: z.number().int(), effective_from: z.string(), subscribers: z.number().int(), reason: z.string(), notice_days: z.number().int() }),
    preview: (ctx, p) => ({ description: `Change the ${p.plan} plan from ${money(p.from_cents)} to ${money(p.to_cents)} a month`, data_involved: [`${p.subscribers} subscriber(s) on this plan`, 'Future monthly invoices'], expected_outcome: `New price applies to invoices for periods starting on or after ${p.effective_from}. Subscribers are told ${p.notice_days} days ahead. Reason: ${p.reason}.`, cost_cents: (p.to_cents - p.from_cents) * p.subscribers }),
    execute(ctx, p) { const r = ctx.deps.platformFinance.approvePrice(p, ctx.run.approver_id || ctx.actor); if (!r.ok) throw Object.assign(new Error(r.error), { permanent: true }); return { ref: p.change_id, summary: `Price change approved for ${p.plan}, effective ${p.effective_from}` }; },
    verify(ctx, p) { const r = ctx.db.prepare('SELECT status FROM plan_price_changes WHERE id=?').get(p.change_id); return r && ['approved', 'applied'].includes(r.status) ? { ok: true, detail: `Price change ${r.status}.` } : { ok: false, detail: 'The price change was not approved.' }; } },
  ...seoOps('seo_daily_monitor', 'Daily SEO check: crawl errors, outages, indexing and broken pages', 'schedule.daily', 'daily'),
  ...seoOps('seo_weekly_analysis', 'Weekly SEO analysis: search performance, opportunities and technical issues', 'schedule.weekly', 'weekly'),
  ...seoOps('seo_monthly_report', 'Monthly SEO report: performance, clusters and recommendations', 'schedule.monthly', 'monthly'),

  // ---------------- Phase 09: reliability actions that always need a named approver and are done by a person ----------------
  // Manual actions run zero automatic attempts, so nothing destructive is ever retried by an agent.
  ...manual('production_rollback', 'Roll back production to an earlier deploy', 'operations', 'Roll back in Render (Events > last good deploy > Rollback), then check /healthz and Reliability.', 'platform'),
  ...manual('restore_database', 'Restore the production database from a backup', 'operations', 'Restore to a new file with npm run backup:restore and this approval reference, check it, then switch over in a maintenance window (RUNBOOKS.md).', 'platform'),
  ...manual('infrastructure_migration', 'Migrate infrastructure (hosting, database, storage)', 'operations', 'Follow the tested migration plan; keep the current Render deployment until the new one passes its checks.', 'platform'),
  ...manual('credential_change', 'Change or rotate a credential', 'operations', 'Create the new key at the provider, update Render, redeploy, check, then revoke the old key.', 'platform'),
  ...manual('data_deletion', 'Delete data permanently', 'operations', 'Check legal hold and retention first; delete only what was approved and record it.', 'platform'),
  ...manual('major_config_change', 'Make a major configuration change', 'operations', 'Change one setting at a time in Render, redeploy, and watch Reliability for 30 minutes.', 'platform'),

  // ---------------- Level 4: restricted (always refused) ----------------
  ...restricted('delete_customer_records', 'Delete customer records in bulk'),
  ...restricted('change_bank_details', 'Change bank or payout details'),
  ...restricted('transfer_to_new_payee', 'Send money to a new payee'),
  ...restricted('disable_audit_or_approvals', 'Turn off audit logging or approvals'),
  ...restricted('mass_message_without_opt_out', 'Message customers in bulk without opt-outs'),
  ...restricted('follow_embedded_instructions', 'Act on instructions found inside emails, documents or websites')
};

// Scheduled SEO operations exist for each business and for the platform's own site. They read sites and Google data and
// write audits, reports and alerts; they never change a website.
function seoOps(key, label, trigger, period) {
  const def = (scope) => ({ scope, label, capability: 15, level: 1, effect: 'output', feature: 'visibility', triggers: [trigger, 'manual'], params: z.object({}).strict(), async_execute: true,
    analyse: () => ({ period }), schema: z.object({ period: z.enum(['daily', 'weekly', 'monthly']) }),
    preview: () => ({ description: label, data_involved: ['Your website', 'Connected Google data'], expected_outcome: period === 'daily' ? 'An audit and an alert if anything critical is broken.' : period === 'weekly' ? 'Google data synced, audit re-run, clusters refreshed and a weekly report.' : 'A monthly report with clusters and recommendations.' }),
    async executeAsync(ctx) {
      const owner = ctx.org || 'platform', r = await ctx.deps.seo[period](owner);
      if (period === 'daily' && (r.critical?.length || r.outage || r.not_indexed?.length)) {
        const lines = [...(r.outage ? ['The home page did not load.'] : []), ...r.critical.map((c) => `${c.title} (${c.count})`), ...r.not_indexed.map((n) => `Google: ${n.url} is ${n.coverage || 'not indexed'}`)];
        ctx.deps.outputs.add(ctx, { kind: 'alert', title: 'SEO: critical problems found today', body: lines.map((l) => '• ' + l).join('\n'), link: '#b06/seo' });
        if (ctx.org) ctx.deps.notify(ctx.org, { kind: 'seo_alert', title: 'Website problems found', body: lines.slice(0, 3).join('; '), link: '#b06/seo', dedupe: `seo-daily:${ctx.org}:${new Date().toISOString().slice(0, 10)}` });
      }
      return { ref: r.report_id || r.audit_id || null, summary: r.skipped || (period === 'daily' ? `Audit score ${r.score}; ${r.critical.length} critical problem(s).` : period === 'weekly' ? `${r.clusters} topic clusters; weekly report ready.` : `Monthly report ready; ${r.gaps} content gap(s).`), link: '#b06/reports' };
    },
    verify(ctx, p, r) { if (!r.ref) return { ok: true, warning: true, detail: r.summary }; const ok = ctx.db.prepare('SELECT 1 FROM seo_reports WHERE id=? UNION SELECT 1 FROM seo_audits WHERE id=?').get(r.ref, r.ref); return ok ? { ok: true, detail: 'Report saved in Website & Visibility > Reports.' } : { ok: false, detail: 'The report was not saved.' }; } });
  return { [key]: def('business'), ['platform_' + key]: def('platform') };
}
function manual(key, label, feature, how, scope = 'business') {
  return { [key]: { scope, label, capability: null, level: 3, manual: true, effect: 'external', feature, triggers: ['manual'], params: z.object({ details: z.string().trim().min(5).max(2000) }).strict(),
    analyse: (ctx) => ({ details: ctx.params.details }), schema: z.object({ details: z.string().min(5).max(2000) }),
    preview: (ctx, p) => ({ description: label, data_involved: ['What you describe below'], expected_outcome: `Approval is recorded. A person carries it out: ${how}` }),
    execute: (ctx, p) => ({ ref: null, summary: `Approved. Carry it out manually: ${how}`, manual: true }),
    verify: (ctx, p, r) => (r?.done ? { ok: true, detail: `Marked done${r.done_note ? ': ' + r.done_note : ''}.` } : { ok: false, pending: true, detail: 'Waiting for a person to mark it done.' }) } };
}
function restricted(key, label) { return { [key]: { label, level: 4, restricted: true, effect: 'external', feature: 'governance', triggers: [], params: P } }; }

function followUpCandidates(ctx, limit = 10) {
  const before = iso(Date.now() - (ctx.params.after_days || 3) * DAY);
  return ctx.db.prepare("SELECT d.id,d.title,c.name,c.email FROM tenant_documents d JOIN tenant_customers c ON c.id=d.customer_id AND c.organisation_id=d.organisation_id WHERE d.organisation_id=? AND d.kind='quote' AND d.status='approved' AND d.updated_at<? AND c.email IS NOT NULL AND c.email<>'' AND NOT EXISTS (SELECT 1 FROM automation_marks m WHERE m.organisation_id=d.organisation_id AND m.mark='followed_up' AND m.ref=d.id) ORDER BY d.updated_at LIMIT ?").all(ctx.org, before, limit)
    .map((r) => ({ id: r.id, to: r.email, name: r.name, title: r.title }));
}
const followUpBody = (ctx, q) => `Hi ${q.name.split(' ')[0]},\n\nJust checking in on our quote for "${q.title}". Happy to answer any questions or adjust it if needed.\n\n${ctx.facts.business}`;
function markFollowedUp(ctx, quotes) { for (const q of quotes) ctx.deps.mark(ctx.org, 'followed_up', q.id); }
// Sending: through the Email Centre's approved-and-scheduled path, approved by the accountable person (the approver,
// or for rule-based actions the owner who switched the rule on). Delivery needs an email provider.
function sendMail(ctx, p, category) {
  if (!ctx.accountable) throw Object.assign(new Error('No accountable approver for this message.'), { permanent: true });
  const id = ctx.deps.mail.queueApproved({ ownerId: ctx.org, recipient: p.to, subject: p.subject, body: p.body, category, approvedBy: ctx.accountable });
  return { ref: id, summary: ctx.deps.mail.providerReady() ? 'Queued for sending' : 'Queued; sends once an email provider is connected', link: '#b04/email' };
}
function verifyMail(ctx, p, r) {
  const ids = String(r?.ref || '').split(',').filter(Boolean), rows = ids.map((id) => ctx.deps.mail.mailStatus(id, ctx.org));
  if (!ids.length || rows.some((m) => !m)) return { ok: false, detail: 'Message not found in the Email Centre.' };
  if (rows.some((m) => m.status === 'failed')) return { ok: false, detail: 'Delivery failed. See the Email Centre.' };
  if (!ctx.deps.mail.providerReady()) return { ok: true, warning: true, detail: 'Queued, but no email provider is connected, so it has not been sent.' };
  return { ok: true, detail: `${ids.length} message(s) ${rows.every((m) => ['sent', 'delivered', 'opened'].includes(m.status)) ? 'sent' : 'queued for sending'}.` };
}

export const RULES = {
  routine_acknowledgements: { label: 'Routine acknowledgements', detail: 'Reply to new enquiries with a fixed "we received it" email.', limits: z.object({}).strict() },
  appointment_reminders: { label: 'Appointment reminders', detail: 'Email customers the day before a booked job.', limits: z.object({}).strict() },
  approved_follow_ups: { label: 'Quote follow-ups', detail: 'Email customers whose approved quote has had no answer for a few days.', limits: z.object({ max_per_day: z.number().int().min(1).max(20).default(10) }).strict() },
  low_risk_site_updates: { label: 'Low-risk website updates', detail: 'Publish small wording fixes to pages that are already live, with no new claims, design, image or address changes. Everything else waits for approval.', limits: z.object({}).strict() },
  internal_transitions: { label: 'Offer booked jobs to workers', detail: 'Offer each new booking to eligible workers straight away.', limits: z.object({}).strict() }
};

export const TRIGGERS = {
  'enquiry.created': 'A new enquiry arrives', 'quote.approved': 'A quote is approved', 'quote.accepted': 'A customer accepts a quote',
  'job.booked': 'A job is booked', 'job.completed': 'A job is marked complete', 'invoice.issued': 'An invoice is issued', 'payment.received': 'A payment is received',
  'schedule.hourly': 'Every hour', 'schedule.daily': 'Every day (7am)', 'schedule.weekly': 'Every Monday (7am)', 'schedule.monthly': 'First day of each month', manual: 'Only when run by hand'
};

export function publicCatalogue(scope = 'business') {
  return Object.entries(ACTIONS).filter(([, a]) => (a.scope || 'business') === scope).map(([key, a]) => ({ key, label: a.label, capability: a.capability, level: a.level, rule: a.rule || null, manual: Boolean(a.manual), restricted: Boolean(a.restricted), effect: a.effect, triggers: a.triggers, has_ai: Boolean(a.ai), feature: a.feature, params: Object.keys(a.params?.shape || {}), scope: a.scope || 'business' }));
}
