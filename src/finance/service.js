// Phase 08: subscriber finance. Quotations, estimates, deposits, tax invoices, adjustment (credit) notes, receipts,
// payment links and status, refund requests, bank reconciliation, reports, follow-ups and unusual-activity flags.
//
// Money model (unchanged from earlier phases): every payment is a job_payments row on a job (work_orders), taken through
// the business's OWN Stripe or PayPal account, its bank account, or recorded by staff. Super Pro never holds a business's
// money and keeps no stored balance for anyone. Invoices are tenant_documents linked to the job they bill.
//
// Rules: issued documents never change. Corrections are made with an adjustment note. Refunds, credit notes and other
// financial adjustments run through the automation engine as Level 3 actions, so a named person approves each one.
import crypto from 'node:crypto';
import { appendAuditLog } from '../db.js';
import { rulesFor, rulesetById, documentTotals, lineAmounts, checkDocument, title as docTitle, abnValid, formatAbn, basDraft, TAX_CODES } from './rules.js';

const DAY = 86400000;
const iso = (t = Date.now()) => new Date(t).toISOString();
const J = (s, d) => { try { return s ? JSON.parse(s) : d; } catch { return d; } };
const money = (c) => (Number(c) / 100).toLocaleString('en-AU', { style: 'currency', currency: 'AUD' });
const uid = () => crypto.randomUUID();
const SERIES = { quote: 'QUO', estimate: 'EST', invoice: 'INV', deposit: 'INV', credit_note: 'CN' };
export const FIN_KINDS = ['quote', 'estimate', 'invoice', 'deposit', 'credit_note'];

// Expense categories for bank lines. Keyword rules first, then what this business confirmed before (learned).
export const CATEGORIES = ['Materials and supplies', 'Fuel and vehicle', 'Subcontractors', 'Wages and super', 'Rent and utilities', 'Phone and internet', 'Software and subscriptions', 'Insurance', 'Advertising and marketing', 'Bank and payment fees', 'Tax payments (ATO)', 'Owner drawings', 'Loan repayments', 'Equipment and tools', 'Office expenses', 'Travel and meals', 'Other expenses', 'Customer payment', 'Other income', 'Refund to customer', 'Transfer between accounts'];
const KEYWORDS = [
  [/bunnings|reece|tradelink|mitre ?10|total tools|sydney tools|plumbing plus|middys|rexel|hardware/i, 'Materials and supplies'],
  [/caltex|ampol|bp |shell|7-eleven|united petroleum|fuel|rego|vicroads|transport for nsw|tolls?|linkt|e-?tag/i, 'Fuel and vehicle'],
  [/telstra|optus|vodafone|tpg|aussie broadband|internet|mobile plan/i, 'Phone and internet'],
  [/xero|myob|microsoft|google ?(workspace|gsuite)|adobe|dropbox|canva|super ?pro|subscription|saas/i, 'Software and subscriptions'],
  [/insurance|nrma|allianz|qbe|suncorp|aami|cgu|gio/i, 'Insurance'],
  [/facebook ads|meta ads|google ads|adwords|advertis|marketing|hipages|airtasker/i, 'Advertising and marketing'],
  [/stripe fee|paypal fee|merchant fee|account fee|bank fee|square fee|tyro/i, 'Bank and payment fees'],
  [/\bato\b|australian taxation|bas payment|payg/i, 'Tax payments (ATO)'],
  [/wages|payroll|salary|superannuation|super fund|australiansuper|hostplus|rest super/i, 'Wages and super'],
  [/rent|lease|electricity|synergy|agl|origin energy|water corp|sydney water|gas bill/i, 'Rent and utilities'],
  [/subcontract|contractor/i, 'Subcontractors'],
  [/officeworks|stationery|postage|australia post/i, 'Office expenses'],
  [/qantas|virgin|jetstar|uber|hotel|airbnb|restaurant|cafe|mcdonald|meal/i, 'Travel and meals'],
  [/loan|finance repayment|equipment finance/i, 'Loan repayments'],
  [/transfer (to|from)|internal transfer|own account/i, 'Transfer between accounts'],
  [/refund/i, 'Refund to customer']
];

export function categorise(description, amountCents, learned = []) {
  const d = String(description || '').toLowerCase();
  for (const l of learned) if (l.pattern && d.includes(l.pattern)) return { category: l.category, confidence: 0.9, reason: `You filed "${l.pattern}" as ${l.category} before.` };
  if (amountCents > 0) {
    if (/stripe|paypal|square|transfer from|deposit|osko|payid|direct credit/i.test(d)) return { category: 'Customer payment', confidence: 0.7, reason: 'Money in from a payment provider or a transfer.' };
    return { category: 'Other income', confidence: 0.4, reason: 'Money in with no recognised payer.' };
  }
  for (const [re, cat] of KEYWORDS) if (re.test(d)) return { category: cat, confidence: 0.75, reason: `The description matches common ${cat.toLowerCase()} payees.` };
  return { category: 'Other expenses', confidence: 0.2, reason: 'No rule matched. Choose a category.' };
}

// Bank CSV: accepts the common Australian bank export layouts (Date, Description/Narrative, Amount or Debit/Credit).
export function parseBankCsv(text) {
  const rows = [], lines = String(text || '').replace(/^﻿/, '').split(/\r?\n/).filter((l) => l.trim());
  const split = (l) => { const out = []; let cur = '', q = false; for (const ch of l) { if (ch === '"') q = !q; else if (ch === ',' && !q) { out.push(cur); cur = ''; } else cur += ch; } out.push(cur); return out.map((x) => x.trim()); };
  if (!lines.length) return { rows, errors: ['The file is empty.'] };
  let head = split(lines[0]).map((h) => h.toLowerCase());
  const hasHead = head.some((h) => /date|description|amount|narrative|debit|credit/.test(h));
  if (!hasHead) head = ['date', 'amount', 'description'];
  const col = (re) => head.findIndex((h) => re.test(h));
  const ci = { date: col(/date/), desc: col(/description|narrative|details|transaction|memo/), amount: col(/^amount|amount$/), debit: col(/debit|withdrawal/), credit: col(/credit|deposit/), ref: col(/reference|ref/) };
  const errors = [];
  const num = (v) => { const s = String(v || '').replace(/[$,\s]/g, ''); if (!s) return 0; const neg = /^\(.*\)$/.test(s) || s.endsWith('-'); const n = Number(s.replace(/[()\-]/g, '').replace(/^\+/, '')) * (neg || s.startsWith('-') ? -1 : 1); return Number.isFinite(n) ? n : NaN; };
  const date = (v) => { const s = String(v || '').trim(); let m = s.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})$/); if (m) { const y = m[3].length === 2 ? '20' + m[3] : m[3]; return `${y}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`; } m = s.match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? `${m[1]}-${m[2]}-${m[3]}` : null; };
  for (const [i, l] of lines.slice(hasHead ? 1 : 0).entries()) {
    const c = split(l), n = i + (hasHead ? 2 : 1);
    const d = date(c[ci.date]); if (!d) { errors.push(`Row ${n}: the date is not recognised.`); continue; }
    let amt = ci.amount >= 0 ? num(c[ci.amount]) : num(c[ci.credit]) - Math.abs(num(c[ci.debit]));
    if (!Number.isFinite(amt) || amt === 0) { errors.push(`Row ${n}: no amount.`); continue; }
    rows.push({ posted_on: d, description: String(c[ci.desc] ?? c.find((x, k) => k !== ci.date && k !== ci.amount) ?? '').slice(0, 300), amount_cents: Math.round(amt * 100), reference: ci.ref >= 0 ? String(c[ci.ref] || '').slice(0, 80) : '' });
  }
  if (rows.length > 5000) return { rows: [], errors: ['Import at most 5,000 rows at a time.'] };
  return { rows, errors };
}

export function createFinance({ db, env = {}, payments = null, pipeline = null, syncJobFinance = () => {}, notify = null, engineRef = { current: null }, clock = () => Date.now() }) {
  const cols = (t) => new Set(db.prepare(`PRAGMA table_info(${t})`).all().map((c) => c.name));
  const add = (t, list) => { const have = cols(t); for (const [n, type] of list) if (!have.has(n)) db.exec(`ALTER TABLE ${t} ADD COLUMN ${n} ${type}`); };
  db.exec(`
    CREATE TABLE IF NOT EXISTS fin_settings (organisation_id TEXT PRIMARY KEY, gst_registered INTEGER, prices_include_gst INTEGER NOT NULL DEFAULT 0, accounting_basis TEXT NOT NULL DEFAULT 'cash' CHECK (accounting_basis IN ('cash','accrual')), bas_period TEXT NOT NULL DEFAULT 'quarterly' CHECK (bas_period IN ('monthly','quarterly','annual')), quote_valid_days INTEGER NOT NULL DEFAULT 30, deposit_percent INTEGER NOT NULL DEFAULT 0, footer_note TEXT, updated_by TEXT, updated_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS fin_sequences (organisation_id TEXT NOT NULL, series TEXT NOT NULL, next INTEGER NOT NULL, PRIMARY KEY (organisation_id, series));
    CREATE TABLE IF NOT EXISTS fin_lines (id TEXT PRIMARY KEY, organisation_id TEXT NOT NULL, document_id TEXT NOT NULL, position INTEGER NOT NULL, description TEXT NOT NULL, quantity REAL NOT NULL, unit_cents INTEGER NOT NULL, discount_cents INTEGER NOT NULL DEFAULT 0, tax_code TEXT NOT NULL DEFAULT 'GST', ex_cents INTEGER NOT NULL, gst_cents INTEGER NOT NULL, inc_cents INTEGER NOT NULL);
    CREATE INDEX IF NOT EXISTS fin_lines_doc ON fin_lines(document_id, position);
    CREATE TABLE IF NOT EXISTS fin_refunds (id TEXT PRIMARY KEY, organisation_id TEXT NOT NULL, payment_id TEXT NOT NULL, work_order_id TEXT NOT NULL, amount_cents INTEGER NOT NULL CHECK (amount_cents > 0), reason TEXT NOT NULL, status TEXT NOT NULL, provider TEXT NOT NULL, provider_ref TEXT, run_id TEXT, credit_note_id TEXT, completed_reference TEXT, error TEXT, requested_by TEXT, completed_by TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS fin_refunds_org ON fin_refunds(organisation_id, created_at);
    CREATE TABLE IF NOT EXISTS fin_imports (id TEXT PRIMARY KEY, organisation_id TEXT NOT NULL, filename TEXT, rows INTEGER NOT NULL, duplicates INTEGER NOT NULL, created_by TEXT, created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS fin_bank_lines (id TEXT PRIMARY KEY, organisation_id TEXT NOT NULL, import_id TEXT NOT NULL, posted_on TEXT NOT NULL, description TEXT NOT NULL, amount_cents INTEGER NOT NULL, reference TEXT, hash TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'unmatched', payment_id TEXT, finance_entry_id TEXT, category TEXT, suggestion_json TEXT, matched_by TEXT, matched_at TEXT, note TEXT, UNIQUE (organisation_id, hash));
    CREATE INDEX IF NOT EXISTS fin_bank_lines_org ON fin_bank_lines(organisation_id, status, posted_on);
    CREATE TABLE IF NOT EXISTS fin_category_memory (organisation_id TEXT NOT NULL, pattern TEXT NOT NULL, category TEXT NOT NULL, updated_at TEXT NOT NULL, PRIMARY KEY (organisation_id, pattern));
    CREATE TABLE IF NOT EXISTS fin_flags (id TEXT PRIMARY KEY, organisation_id TEXT NOT NULL, kind TEXT NOT NULL, severity TEXT NOT NULL, entity_type TEXT, entity_id TEXT, message TEXT NOT NULL, dedupe TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'open', created_at TEXT NOT NULL, resolved_by TEXT, resolved_at TEXT, resolution_note TEXT, UNIQUE (organisation_id, dedupe));`);
  add('tenant_documents', [['number', 'TEXT'], ['parent_id', 'TEXT'], ['ruleset_id', 'TEXT'], ['prices_include_gst', 'INTEGER'], ['valid_until', 'TEXT'], ['reason', 'TEXT'], ['compliance_json', 'TEXT'], ['seller_json', 'TEXT'], ['buyer_json', 'TEXT'], ['run_id', 'TEXT'], ['ai_prepared', 'INTEGER NOT NULL DEFAULT 0']]);
  add('tenant_customers', [['abn', 'TEXT']]);
  add('job_payments', [['refunded_cents', 'INTEGER NOT NULL DEFAULT 0']]);
  db.exec('CREATE UNIQUE INDEX IF NOT EXISTS tenant_documents_number ON tenant_documents(organisation_id, number) WHERE number IS NOT NULL');

  const now = () => iso(clock());
  const audit = (org, actor, action, entityType, entityId, metadata = {}) => appendAuditLog(db, { organisation_id: org, user_id: actor && actor !== 'automation' ? actor : null, user_name: actor === 'automation' || !actor ? 'Finance automation' : undefined, user_role: actor ? undefined : 'system', action, module: 'finance', entity_type: entityType, entity_id: entityId, metadata });
  const E = (status, error, extra = {}) => ({ ok: false, status, error, ...extra });

  // ---------------- settings, seller and buyer ----------------
  function settings(org) { return db.prepare('SELECT * FROM fin_settings WHERE organisation_id=?').get(org) || { organisation_id: org, gst_registered: null, prices_include_gst: 0, accounting_basis: 'cash', bas_period: 'quarterly', quote_valid_days: 30, deposit_percent: 0, footer_note: null }; }
  function saveSettings(org, d, actor) {
    const s = { ...settings(org), ...d, updated_by: actor, updated_at: now() };
    const prev = settings(org);
    db.prepare(`INSERT INTO fin_settings (organisation_id,gst_registered,prices_include_gst,accounting_basis,bas_period,quote_valid_days,deposit_percent,footer_note,updated_by,updated_at) VALUES (@organisation_id,@gst_registered,@prices_include_gst,@accounting_basis,@bas_period,@quote_valid_days,@deposit_percent,@footer_note,@updated_by,@updated_at)
      ON CONFLICT(organisation_id) DO UPDATE SET gst_registered=excluded.gst_registered,prices_include_gst=excluded.prices_include_gst,accounting_basis=excluded.accounting_basis,bas_period=excluded.bas_period,quote_valid_days=excluded.quote_valid_days,deposit_percent=excluded.deposit_percent,footer_note=excluded.footer_note,updated_by=excluded.updated_by,updated_at=excluded.updated_at`).run({ ...s, organisation_id: org });
    audit(org, actor, 'finance.settings_changed', 'fin_settings', org, { changed: Object.keys(d).filter((k) => prev[k] !== d[k]) });
    return settings(org);
  }
  function seller(org) {
    const o = db.prepare("SELECT COALESCE(o.display_name,o.name) name, o.abn, o.address_formatted address, (SELECT u.email FROM memberships m JOIN users u ON u.id=m.user_id WHERE m.organisation_id=o.id AND m.role='owner' AND m.status='active' ORDER BY m.rowid LIMIT 1) email FROM organisations o WHERE o.id=?").get(org) || {};
    const s = settings(org);
    return { name: o.name || '', abn: o.abn ? String(o.abn).replace(/\s/g, '') : '', address: o.address || '', email: o.email || '', phone: '', gst_registered: s.gst_registered === 1, gst_status_set: s.gst_registered !== null && s.gst_registered !== undefined, prices_include_gst: s.prices_include_gst === 1 };
  }
  const buyer = (org, cid) => (cid ? db.prepare('SELECT id,name,email,phone,address,abn FROM tenant_customers WHERE id=? AND organisation_id=?').get(cid, org) || {} : {});
  const job = (org, id) => (id ? db.prepare('SELECT * FROM work_orders WHERE id=? AND organisation_id=?').get(id, org) : null);
  const doc = (org, id) => db.prepare('SELECT * FROM tenant_documents WHERE id=? AND organisation_id=?').get(id, org);

  function nextNumber(org, kind) {
    const series = SERIES[kind];
    return db.transaction(() => {
      db.prepare('INSERT OR IGNORE INTO fin_sequences (organisation_id,series,next) VALUES (?,?,1)').run(org, series);
      for (;;) {
        const n = db.prepare('SELECT next FROM fin_sequences WHERE organisation_id=? AND series=?').get(org, series).next;
        db.prepare('UPDATE fin_sequences SET next=next+1 WHERE organisation_id=? AND series=?').run(org, series);
        const number = `${series}-${String(n).padStart(5, '0')}`;
        if (!db.prepare('SELECT 1 FROM tenant_documents WHERE organisation_id=? AND number=?').get(org, number)) return number;
      }
    })();
  }

  // ---------------- lines ----------------
  function linesOf(d) {
    const rows = db.prepare('SELECT description,quantity,unit_cents,discount_cents,tax_code,ex_cents,gst_cents,inc_cents FROM fin_lines WHERE document_id=? AND organisation_id=? ORDER BY position').all(d.id, d.organisation_id);
    if (rows.length) return rows;
    // Documents created before Phase 08 have one amount; show them as one line so totals and checks still work.
    const code = d.gst_applies === 0 ? 'FRE' : 'GST';
    return [{ description: d.title, quantity: 1, unit_cents: d.amount_cents, discount_cents: 0, tax_code: code, ex_cents: d.amount_cents, gst_cents: d.gst_cents || 0, inc_cents: d.amount_cents + (d.gst_cents || 0) }];
  }
  function writeLines(org, docId, lines, opts) {
    db.prepare('DELETE FROM fin_lines WHERE document_id=? AND organisation_id=?').run(docId, org);
    lines.forEach((l, i) => { const a = lineAmounts(l, opts); db.prepare('INSERT INTO fin_lines (id,organisation_id,document_id,position,description,quantity,unit_cents,discount_cents,tax_code,ex_cents,gst_cents,inc_cents) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)').run(uid(), org, docId, i, String(l.description).trim().slice(0, 300), Number(l.quantity), Math.round(Number(l.unit_cents)), Math.round(Number(l.discount_cents) || 0), l.tax_code || 'GST', a.ex_cents, a.gst_cents, a.inc_cents); });
    const t = documentTotals(lines, opts);
    db.prepare('UPDATE tenant_documents SET amount_cents=?,gst_cents=?,gst_applies=?,updated_at=? WHERE id=? AND organisation_id=?').run(t.ex_cents, t.gst_cents, t.gst_cents > 0 ? 1 : 0, now(), docId, org);
    return t;
  }
  const lineOpts = (org, d = null) => { const s = seller(org); return { registered: s.gst_registered, includesGst: d?.prices_include_gst === null || d?.prices_include_gst === undefined ? s.prices_include_gst : d.prices_include_gst === 1 }; };

  // ---------------- payments on a job ----------------
  const credits = (org, invoiceId) => db.prepare("SELECT COALESCE(SUM(amount_cents+gst_cents),0) n FROM tenant_documents WHERE organisation_id=? AND kind='credit_note' AND parent_id=? AND status='issued'").get(org, invoiceId).n;
  function moneyOn(org, d) {
    const j = job(org, d.work_order_id);
    const total = d.amount_cents + (d.gst_cents || 0);
    if (!j) return { total_cents: total, paid_cents: 0, owing_cents: total, credited_cents: 0, payments: [] };
    const pays = db.prepare("SELECT id,provider,method,status,amount_cents,refunded_cents,receipt_no,reference,checkout_url,paid_at,created_at FROM job_payments WHERE organisation_id=? AND work_order_id=? ORDER BY created_at").all(org, j.id);
    const credited = d.kind === 'invoice' ? credits(org, d.id) : 0;
    const owingJob = Math.max(0, j.price_cents + (j.late_fee_cents || 0) - j.paid_cents);
    const due = d.kind === 'deposit' ? Math.max(0, Math.min(total, owingJob)) : owingJob;
    return { total_cents: total, credited_cents: credited, paid_cents: j.paid_cents, late_fee_cents: j.late_fee_cents || 0, owing_cents: ['issued', 'part_paid', 'paid'].includes(d.status) ? due : total, job_price_cents: j.price_cents, payments: pays };
  }
  function statusOf(org, d) {
    if (!['issued', 'part_paid', 'paid', 'overdue'].includes(d.status) || !['invoice', 'deposit'].includes(d.kind)) return d.status;
    const m = moneyOn(org, d), j = job(org, d.work_order_id);
    if (d.kind === 'deposit') { const depositPaid = (j?.paid_cents || 0) >= m.total_cents; return depositPaid ? 'paid' : (j?.paid_cents || 0) > 0 ? 'part_paid' : d.due_at && d.due_at < now() ? 'overdue' : 'issued'; }
    if (m.owing_cents <= 0) return 'paid';
    if (d.due_at && d.due_at < now()) return 'overdue';
    return m.paid_cents > 0 ? 'part_paid' : 'issued';
  }

  function view(org, d, full = false) {
    const lines = linesOf(d), s = seller(org);
    const out = { id: d.id, kind: d.kind, number: d.number, title: d.title, status: statusOf(org, d), stored_status: d.status, customer_id: d.customer_id, customer: d.customer_id ? buyer(org, d.customer_id).name || null : null, work_order_id: d.work_order_id, parent_id: d.parent_id, revision: d.revision, ex_cents: d.amount_cents, gst_cents: d.gst_cents || 0, total_cents: d.amount_cents + (d.gst_cents || 0), issued_at: d.issued_at, due_at: d.due_at, valid_until: d.valid_until, created_at: d.created_at, ai_prepared: Boolean(d.ai_prepared), reason: d.reason, heading: docTitle(d.kind === 'deposit' ? 'deposit' : d.kind, d.seller_json ? J(d.seller_json, {}).gst_registered : s.gst_registered) };
    if (['invoice', 'deposit'].includes(d.kind)) Object.assign(out, { money: moneyOn(org, d) });
    if (full) Object.assign(out, { lines, body: d.body, prices_include_gst: d.prices_include_gst === null ? s.prices_include_gst : d.prices_include_gst === 1, seller: d.seller_json ? J(d.seller_json, {}) : s, buyer: d.buyer_json ? J(d.buyer_json, {}) : buyer(org, d.customer_id), compliance: d.compliance_json ? J(d.compliance_json, null) : precheck(org, d), ruleset: d.ruleset_id || rulesFor().id, credit_notes: d.kind === 'invoice' ? db.prepare("SELECT id,number,status,amount_cents+gst_cents total_cents,reason,issued_at FROM tenant_documents WHERE organisation_id=? AND kind='credit_note' AND parent_id=? ORDER BY created_at").all(org, d.id) : [], refunds: d.work_order_id ? db.prepare('SELECT id,amount_cents,status,provider,reason,created_at,completed_reference FROM fin_refunds WHERE organisation_id=? AND work_order_id=? ORDER BY created_at').all(org, d.work_order_id) : [], parent: d.parent_id ? (() => { const p = doc(org, d.parent_id); return p ? { id: p.id, number: p.number, kind: p.kind, title: p.title } : null; })() : null });
    return out;
  }
  function precheck(org, d) {
    const kind = d.kind === 'deposit' ? 'invoice' : d.kind;
    const original = d.parent_id ? (() => { const p = doc(org, d.parent_id); return p ? { inc_cents: p.amount_cents + (p.gst_cents || 0) } : null; })() : null;
    return checkDocument({ kind, seller: { ...seller(org), prices_include_gst: lineOpts(org, d).includesGst }, buyer: buyer(org, d.customer_id), lines: linesOf(d), original, reason: d.reason });
  }

  // ---------------- documents ----------------
  function list(org, { kind = null, status = null, q = '' } = {}) {
    const kinds = kind ? [kind] : FIN_KINDS;
    const rows = db.prepare(`SELECT * FROM tenant_documents WHERE organisation_id=? AND kind IN (${kinds.map(() => '?').join(',')}) ORDER BY COALESCE(issued_at,created_at) DESC LIMIT 500`).all(org, ...kinds);
    return rows.map((d) => view(org, d)).filter((d) => (!status || d.status === status) && (!q || `${d.number || ''} ${d.title} ${d.customer || ''}`.toLowerCase().includes(String(q).toLowerCase())));
  }
  function get(org, id) { const d = doc(org, id); return d && FIN_KINDS.includes(d.kind) ? view(org, d, true) : null; }

  function create(org, actor, { kind, customer_id = null, title, lines, work_order_id = null, body = '', valid_until = null, prices_include_gst = null, ai_prepared = false }) {
    if (!['quote', 'estimate', 'invoice', 'deposit'].includes(kind)) return E(400, 'Choose quotation, estimate, invoice or deposit invoice.');
    if (customer_id && !buyer(org, customer_id).id) return E(400, 'That customer is not in this business.');
    if (['invoice', 'deposit'].includes(kind)) {
      const j = job(org, work_order_id); if (!j) return E(400, 'Invoices are raised against a job so payments can be tracked. Choose the job.');
      if (kind === 'invoice' && db.prepare("SELECT 1 FROM tenant_documents WHERE organisation_id=? AND kind='invoice' AND work_order_id=? AND status<>'cancelled'").get(org, j.id)) return E(409, 'This job already has an invoice. Change it with an adjustment note, or cancel the draft first.');
      customer_id ||= j.customer_id || null;
    }
    const id = uid(), at = now(), s = settings(org);
    const valid = ['quote', 'estimate'].includes(kind) ? (valid_until || iso(clock() + (s.quote_valid_days || 30) * DAY).slice(0, 10)) : null;
    const number = ['quote', 'estimate'].includes(kind) ? nextNumber(org, kind) : null;
    db.transaction(() => {
      db.prepare(`INSERT INTO tenant_documents (id,organisation_id,kind,customer_id,title,body,amount_cents,status,created_by,created_at,updated_at,work_order_id,number,valid_until,prices_include_gst,ai_prepared) VALUES (?,?,?,?,?,?,0,'draft',?,?,?,?,?,?,?,?)`)
        .run(id, org, kind, customer_id, String(title).trim().slice(0, 240), String(body || '').slice(0, 4000), actor || 'automation', at, at, work_order_id, number, valid, prices_include_gst === null ? null : prices_include_gst ? 1 : 0, ai_prepared ? 1 : 0);
      writeLines(org, id, lines, lineOpts(org, doc(org, id)));
    })();
    audit(org, actor, `finance.${kind}_created`, kind, id, { number, ai_prepared, total_cents: doc(org, id).amount_cents + doc(org, id).gst_cents });
    return { ok: true, document: get(org, id) };
  }
  function update(org, id, actor, { title, lines, customer_id, body, valid_until, prices_include_gst }) {
    const d = doc(org, id); if (!d || !FIN_KINDS.includes(d.kind)) return E(404, 'Document not found.');
    if (!['draft', 'approved'].includes(d.status)) return E(409, d.kind === 'invoice' || d.kind === 'deposit' ? 'An issued invoice cannot be changed. Issue an adjustment note instead.' : 'Only drafts can be changed.');
    if (customer_id && !buyer(org, customer_id).id) return E(400, 'That customer is not in this business.');
    db.transaction(() => {
      // Any change after approval sends the document back to draft, so the approval always covers what is issued.
      db.prepare(`UPDATE tenant_documents SET title=COALESCE(?,title),body=COALESCE(?,body),customer_id=COALESCE(?,customer_id),valid_until=COALESCE(?,valid_until),prices_include_gst=COALESCE(?,prices_include_gst),status='draft',revision=revision+1,approved_revision=NULL,approved_by=NULL,updated_at=? WHERE id=? AND organisation_id=?`)
        .run(title ?? null, body ?? null, customer_id ?? null, valid_until ?? null, prices_include_gst === undefined || prices_include_gst === null ? null : prices_include_gst ? 1 : 0, now(), id, org);
      if (lines) writeLines(org, id, lines, lineOpts(org, doc(org, id)));
    })();
    audit(org, actor, `finance.${d.kind}_edited`, d.kind, id, { revision: d.revision + 1, was_approved: d.status === 'approved' });
    return { ok: true, document: get(org, id) };
  }
  function approve(org, id, actor, revision) {
    const d = doc(org, id); if (!d || !FIN_KINDS.includes(d.kind)) return E(404, 'Document not found.');
    if (d.status !== 'draft' || d.revision !== revision) return E(409, 'Reload and review the current version before approving.');
    db.prepare("UPDATE tenant_documents SET status='approved',approved_revision=revision,approved_by=?,updated_at=? WHERE id=? AND organisation_id=? AND status='draft' AND revision=?").run(actor, now(), id, org, revision);
    audit(org, actor, `finance.${d.kind}_approved`, d.kind, id, { revision });
    return { ok: true, document: get(org, id) };
  }
  // Issuing locks the document, gives an invoice its number and records the ruleset and the checks it passed.
  function issue(org, id, actor) {
    const d = doc(org, id); if (!d || !['invoice', 'deposit', 'quote', 'estimate'].includes(d.kind)) return E(404, 'Document not found.');
    if (d.status !== 'approved') return E(409, 'Approve the document before issuing it.');
    const s = seller(org);
    if (['invoice', 'deposit'].includes(d.kind) && !s.gst_status_set) return E(409, 'Say whether your business is registered for GST (Money > Finance settings) before issuing invoices.');
    const check = precheck(org, d);
    if (!check.ok) return E(409, 'Fix these before issuing: ' + check.issues.join(' '), { issues: check.issues });
    const j = job(org, d.work_order_id), total = d.amount_cents + (d.gst_cents || 0), at = now();
    if (d.kind === 'invoice' && j && j.paid_cents > total) return E(409, 'More has already been paid on this job than this invoice total. Check the amounts first.');
    const terms = (() => { try { return db.prepare('SELECT terms_days FROM payment_settings WHERE organisation_id=?').get(org)?.terms_days || 7; } catch { return 7; } })();
    const number = d.number || nextNumber(org, d.kind), due = ['invoice', 'deposit'].includes(d.kind) ? iso(clock() + terms * DAY) : null;
    db.transaction(() => {
      db.prepare(`UPDATE tenant_documents SET status=?,number=?,issued_at=?,due_at=?,ruleset_id=?,compliance_json=?,seller_json=?,buyer_json=?,updated_at=? WHERE id=? AND organisation_id=? AND status='approved'`)
        .run(['quote', 'estimate'].includes(d.kind) ? 'sent' : 'issued', number, at, due, check.ruleset, JSON.stringify(check), JSON.stringify({ ...s, prices_include_gst: lineOpts(org, d).includesGst }), JSON.stringify(buyer(org, d.customer_id)), at, id, org);
      if (d.kind === 'invoice' && j) db.prepare('UPDATE work_orders SET price_cents=?,gst_applies=?,invoice_issued_at=COALESCE(invoice_issued_at,?),due_at=COALESCE(due_at,?),updated_at=? WHERE id=? AND organisation_id=?').run(total, d.gst_cents > 0 ? 1 : 0, at, due, at, j.id, org);
      if (d.kind === 'deposit' && j) db.prepare('UPDATE work_orders SET invoice_issued_at=COALESCE(invoice_issued_at,?),due_at=COALESCE(due_at,?),updated_at=? WHERE id=? AND organisation_id=?').run(at, due, at, j.id, org);
    })();
    if (d.kind === 'invoice' && j) syncJobFinance(org, j.id, actor);
    audit(org, actor, `finance.${d.kind}_issued`, d.kind, id, { number, total_cents: total, gst_cents: d.gst_cents || 0, ruleset: check.ruleset });
    return { ok: true, document: get(org, id) };
  }
  function cancel(org, id, actor, reason) {
    const d = doc(org, id); if (!d || !FIN_KINDS.includes(d.kind)) return E(404, 'Document not found.');
    if (['issued', 'part_paid', 'paid', 'overdue'].includes(d.status) && ['invoice', 'deposit', 'credit_note'].includes(d.kind)) return E(409, 'Issued invoices and notes are kept for your records (5 years). Issue an adjustment note to reverse it instead.');
    db.prepare("UPDATE tenant_documents SET status='cancelled',reason=COALESCE(reason,?),updated_at=? WHERE id=? AND organisation_id=?").run(String(reason || '').slice(0, 300) || null, now(), id, org);
    audit(org, actor, `finance.${d.kind}_cancelled`, d.kind, id, { reason });
    return { ok: true };
  }
  // Estimate → quotation; quotation → booked job's invoice (or deposit invoice).
  function convert(org, id, actor, to) {
    const d = doc(org, id); if (!d) return E(404, 'Document not found.');
    const lines = linesOf(d).map(({ description, quantity, unit_cents, discount_cents, tax_code }) => ({ description, quantity, unit_cents, discount_cents, tax_code }));
    if (d.kind === 'estimate' && to === 'quote') { const r = create(org, actor, { kind: 'quote', customer_id: d.customer_id, title: d.title, lines, body: d.body, prices_include_gst: d.prices_include_gst }); if (r.ok) { db.prepare('UPDATE tenant_documents SET parent_id=? WHERE id=?').run(d.id, r.document.id); db.prepare("UPDATE tenant_documents SET status='converted',updated_at=? WHERE id=?").run(now(), d.id); audit(org, actor, 'finance.estimate_converted', 'estimate', d.id, { quote: r.document.id }); } return r.ok ? { ok: true, document: get(org, r.document.id) } : r; }
    if (d.kind === 'quote' && ['invoice', 'deposit'].includes(to)) {
      const booking = db.prepare("SELECT * FROM tenant_documents WHERE organisation_id=? AND kind='booking' AND source_id=? AND work_order_id IS NOT NULL ORDER BY created_at DESC").get(org, d.id);
      const jobId = booking?.work_order_id || d.work_order_id;
      if (!jobId) return E(409, 'Book the job from this quotation first, so the invoice is linked to the job and its payments.');
      const pct = settings(org).deposit_percent || 0;
      const depLines = to === 'deposit' ? [{ description: `Deposit${pct ? ` (${pct}%)` : ''} for ${d.title}${d.number ? ' (quotation ' + d.number + ')' : ''}`, quantity: 1, unit_cents: Math.round(lines.reduce((s, l) => s + lineAmounts(l, lineOpts(org, d)).inc_cents, 0) * (pct || 30) / 100 / (lineOpts(org, d).includesGst || !seller(org).gst_registered ? 1 : 1.1)), tax_code: 'GST' }] : lines;
      const r = create(org, actor, { kind: to, customer_id: d.customer_id, title: d.title, lines: depLines, work_order_id: jobId, body: d.body, prices_include_gst: d.prices_include_gst });
      if (r.ok) db.prepare('UPDATE tenant_documents SET parent_id=? WHERE id=?').run(d.id, r.document.id);
      return r.ok ? { ok: true, document: get(org, r.document.id) } : r;
    }
    return E(400, 'That conversion is not available.');
  }

  // ---------------- payment links ----------------
  async function paymentLink(org, id, actor, provider) {
    const d = doc(org, id); if (!d || !['invoice', 'deposit'].includes(d.kind)) return E(404, 'Invoice not found.');
    if (!['issued', 'part_paid', 'overdue'].includes(statusOf(org, d))) return E(409, statusOf(org, d) === 'paid' ? 'This invoice is paid.' : 'Issue the invoice before asking for payment.');
    if (!payments?.createRequest) return E(503, 'Payments are not available.');
    const m = moneyOn(org, d); if (m.owing_cents < 100) return E(409, 'Nothing is owing on this invoice.');
    try {
      const r = await payments.createRequest(org, { user_id: actor }, { work_order_id: d.work_order_id, provider, amount: m.owing_cents / 100, send_to_customer: false });
      audit(org, actor, 'finance.payment_link_created', d.kind, id, { provider, amount_cents: m.owing_cents });
      return { ok: true, ...r };
    } catch (e) { return E(e.status || 502, e.message); }
  }

  // ---------------- receipts ----------------
  function receipts(org) {
    return db.prepare(`SELECT p.id,p.receipt_no,p.amount_cents,p.refunded_cents,p.provider,p.method,p.paid_at,p.status,w.title job,w.gst_applies,c.name customer,(SELECT number FROM tenant_documents d WHERE d.organisation_id=p.organisation_id AND d.work_order_id=p.work_order_id AND d.kind='invoice' AND d.number IS NOT NULL LIMIT 1) invoice_number FROM job_payments p JOIN work_orders w ON w.id=p.work_order_id LEFT JOIN tenant_customers c ON c.id=p.customer_id WHERE p.organisation_id=? AND p.receipt_no IS NOT NULL ORDER BY p.paid_at DESC LIMIT 500`).all(org)
      .map((r) => ({ ...r, gst_included_cents: r.gst_applies && seller(org).gst_registered ? Math.round(r.amount_cents / 11) : 0 }));
  }

  // ---------------- credit (adjustment) notes: Level 3 ----------------
  function requestCreditNote(org, invoiceId, actor, { amount_cents, reason, lines = null }) {
    const inv = doc(org, invoiceId); if (!inv || inv.kind !== 'invoice') return E(404, 'Invoice not found.');
    if (!['issued', 'part_paid', 'paid', 'overdue'].includes(statusOf(org, inv))) return E(409, 'Only an issued invoice can be adjusted. Change the draft instead.');
    const total = inv.amount_cents + (inv.gst_cents || 0), already = credits(org, inv.id) + db.prepare("SELECT COALESCE(SUM(amount_cents+gst_cents),0) n FROM tenant_documents WHERE organisation_id=? AND kind='credit_note' AND parent_id=? AND status='pending_approval'").get(org, inv.id).n;
    const opts = lineOpts(org, inv), code = (inv.gst_cents || 0) > 0 ? 'GST' : 'FRE';
    const ls = lines || [{ description: `Adjustment to ${inv.number}: ${String(reason).slice(0, 200)}`, quantity: 1, unit_cents: opts.includesGst || !opts.registered || code !== 'GST' ? amount_cents : Math.round(amount_cents / 1.1), tax_code: code }];
    const t = documentTotals(ls, opts);
    if (t.inc_cents <= 0) return E(400, 'Enter the amount to credit.');
    if (t.inc_cents + already > total) return E(400, `Credits cannot exceed the invoice total of ${money(total)} (${money(already)} already credited or waiting).`);
    const id = uid(), at = now();
    db.transaction(() => {
      db.prepare(`INSERT INTO tenant_documents (id,organisation_id,kind,customer_id,title,body,amount_cents,status,created_by,created_at,updated_at,work_order_id,parent_id,reason,prices_include_gst) VALUES (?,?,'credit_note',?,?,'',0,'pending_approval',?,?,?,?,?,?,?)`).run(id, org, inv.customer_id, `Adjustment to ${inv.number}`, actor, at, at, inv.work_order_id, inv.id, String(reason).trim().slice(0, 500), inv.prices_include_gst);
      writeLines(org, id, ls, opts);
    })();
    const check = precheck(org, doc(org, id));
    if (!check.ok) { db.prepare('DELETE FROM fin_lines WHERE document_id=?').run(id); db.prepare('DELETE FROM tenant_documents WHERE id=?').run(id); return E(409, check.issues.join(' '), { issues: check.issues }); }
    const r = startLevel3(org, 'apply_credit_note', `credit:${id}`, { credit_note_id: id }, actor);
    db.prepare('UPDATE tenant_documents SET run_id=? WHERE id=?').run(r.id, id);
    audit(org, actor, 'finance.credit_note_requested', 'credit_note', id, { invoice: inv.number, total_cents: t.inc_cents, gst_cents: t.gst_cents });
    return { ok: true, credit_note_id: id, run_id: r.id, promise: r.promise };
  }
  function creditProposal(org, id) {
    const c = doc(org, id); if (!c || c.kind !== 'credit_note') return null;
    const inv = doc(org, c.parent_id), t = { total_cents: c.amount_cents + (c.gst_cents || 0), gst_cents: c.gst_cents || 0 };
    const m = inv ? moneyOn(org, inv) : { owing_cents: 0 };
    return { credit_note_id: c.id, invoice_id: c.parent_id, invoice_number: inv?.number || '', reason: c.reason || '', total_cents: t.total_cents, gst_cents: t.gst_cents, owing_cents: m.owing_cents, refund_due_cents: Math.max(0, t.total_cents - m.owing_cents) };
  }
  function applyCreditNote(org, p, approver) {
    const c = doc(org, p.credit_note_id); if (!c || c.status !== 'pending_approval') return { applied: false };
    const at = now(), number = nextNumber(org, 'credit_note'), check = precheck(org, c), total = c.amount_cents + (c.gst_cents || 0);
    db.prepare("UPDATE tenant_documents SET status='issued',number=?,issued_at=?,ruleset_id=?,compliance_json=?,seller_json=?,buyer_json=?,approved_by=?,updated_at=? WHERE id=? AND status='pending_approval'").run(number, at, check.ruleset, JSON.stringify(check), JSON.stringify(seller(org)), JSON.stringify(buyer(org, c.customer_id)), approver, at, c.id);
    const j = job(org, c.work_order_id);
    if (j) { db.prepare('UPDATE work_orders SET price_cents=MAX(0,price_cents-?),updated_at=? WHERE id=? AND organisation_id=?').run(total, at, j.id, org); syncJobFinance(org, j.id, approver); }
    audit(org, approver, 'finance.credit_note_issued', 'credit_note', c.id, { number, total_cents: total, invoice: p.invoice_number, refund_due_cents: p.refund_due_cents });
    return { applied: true, number, refund_due_cents: p.refund_due_cents };
  }

  // ---------------- refunds: Level 3 ----------------
  function requestRefund(org, paymentId, actor, { amount_cents, reason }) {
    const p = db.prepare('SELECT * FROM job_payments WHERE id=? AND organisation_id=?').get(paymentId, org); if (!p) return E(404, 'Payment not found.');
    if (p.status !== 'paid') return E(409, 'Only a received payment can be refunded.');
    const waiting = db.prepare("SELECT COALESCE(SUM(amount_cents),0) n FROM fin_refunds WHERE payment_id=? AND status IN ('pending_approval','approved','submitted','awaiting_manual')").get(p.id).n;
    const max = p.amount_cents - (p.refunded_cents || 0) - waiting;
    if (!(amount_cents >= 1 && amount_cents <= max)) return E(400, max > 0 ? `Refund between $0.01 and ${money(max)}.` : 'This payment is already fully refunded or has a refund waiting.');
    const id = uid(), at = now(), provider = p.provider === 'stripe' && p.reference ? 'stripe' : p.provider;
    db.prepare("INSERT INTO fin_refunds (id,organisation_id,payment_id,work_order_id,amount_cents,reason,status,provider,requested_by,created_at,updated_at) VALUES (?,?,?,?,?,?,'pending_approval',?,?,?,?)").run(id, org, p.id, p.work_order_id, amount_cents, String(reason).trim().slice(0, 500), provider, actor, at, at);
    const r = startLevel3(org, 'issue_refund', `refund:${id}`, { refund_id: id }, actor);
    db.prepare('UPDATE fin_refunds SET run_id=? WHERE id=?').run(r.id, id);
    audit(org, actor, 'finance.refund_requested', 'fin_refund', id, { payment: p.id, amount_cents, provider });
    return { ok: true, refund_id: id, run_id: r.id, promise: r.promise };
  }
  function refundProposal(org, id) {
    const r = db.prepare('SELECT * FROM fin_refunds WHERE id=? AND organisation_id=?').get(id, org); if (!r) return null;
    const p = db.prepare('SELECT * FROM job_payments WHERE id=?').get(r.payment_id), j = job(org, r.work_order_id), c = p?.customer_id ? buyer(org, p.customer_id) : {};
    return { refund_id: r.id, payment_id: r.payment_id, amount_cents: r.amount_cents, paid_cents: p?.amount_cents || 0, already_refunded_cents: p?.refunded_cents || 0, provider: r.provider, receipt_no: p?.receipt_no || '', job: j?.title || '', customer: c.name || '', reason: r.reason, how: r.provider === 'stripe' ? 'Refunded through your Stripe account to the card that paid.' : 'Make the refund in your bank or PayPal account, then mark it done here with the reference.' };
  }
  // Records a refund amount against the payment and the job. Safe to call more than once for the same total.
  function applyRefundTotal(org, paymentId, refundedTotal, source) {
    return db.transaction(() => {
      const p = db.prepare('SELECT * FROM job_payments WHERE id=? AND organisation_id=?').get(paymentId, org); if (!p) return 0;
      const total = Math.min(p.amount_cents, Math.max(p.refunded_cents || 0, refundedTotal)), delta = total - (p.refunded_cents || 0);
      if (delta <= 0) return 0;
      db.prepare(`UPDATE job_payments SET refunded_cents=?,status=CASE WHEN ?>=amount_cents THEN 'refunded' ELSE status END,note=?,updated_at=? WHERE id=?`).run(total, total, `${money(total)} refunded (${source})`, now(), p.id);
      db.prepare('UPDATE work_orders SET paid_cents=MAX(0,paid_cents-?),updated_at=? WHERE id=? AND organisation_id=?').run(delta, now(), p.work_order_id, org);
      return delta;
    })();
  }
  async function executeRefund(org, p, approver) {
    const r = db.prepare('SELECT * FROM fin_refunds WHERE id=? AND organisation_id=?').get(p.refund_id, org);
    if (!r) throw Object.assign(new Error('Refund request not found.'), { permanent: true });
    if (['submitted', 'completed', 'awaiting_manual'].includes(r.status)) return { ref: r.id, summary: `Refund already ${r.status.replace('_', ' ')}.` };
    const pay = db.prepare('SELECT * FROM job_payments WHERE id=?').get(r.payment_id);
    if (r.provider === 'stripe') {
      if (!payments?.refundStripe) throw Object.assign(new Error('Stripe refunds are not available.'), { permanent: true });
      const out = await payments.refundStripe(org, pay, r.amount_cents, `sp-refund-${r.id}`);
      db.prepare("UPDATE fin_refunds SET status=?,provider_ref=?,updated_at=? WHERE id=?").run(out.status === 'succeeded' ? 'completed' : 'submitted', out.id, now(), r.id);
      if (out.status === 'succeeded') { applyRefundTotal(org, pay.id, (pay.refunded_cents || 0) + r.amount_cents, 'Stripe'); syncJobFinance(org, r.work_order_id, approver); }
      audit(org, approver, 'finance.refund_submitted', 'fin_refund', r.id, { provider: 'stripe', provider_ref: out.id, status: out.status, amount_cents: r.amount_cents });
      return { ref: out.id, summary: `${money(r.amount_cents)} refund ${out.status === 'succeeded' ? 'completed' : 'submitted'} in Stripe (${out.id}).` };
    }
    db.prepare("UPDATE fin_refunds SET status='awaiting_manual',updated_at=? WHERE id=?").run(now(), r.id);
    audit(org, approver, 'finance.refund_approved_manual', 'fin_refund', r.id, { provider: r.provider, amount_cents: r.amount_cents });
    return { ref: r.id, summary: `Approved. Pay ${money(r.amount_cents)} back from your ${r.provider === 'paypal' ? 'PayPal' : 'bank'} account, then mark the refund done with its reference.`, manual: true };
  }
  function completeManualRefund(org, id, actor, reference) {
    const r = db.prepare('SELECT * FROM fin_refunds WHERE id=? AND organisation_id=?').get(id, org); if (!r) return E(404, 'Refund not found.');
    if (r.status !== 'awaiting_manual') return E(409, r.status === 'pending_approval' ? 'This refund has not been approved yet.' : 'This refund is not waiting to be marked done.');
    db.prepare("UPDATE fin_refunds SET status='completed',completed_reference=?,completed_by=?,updated_at=? WHERE id=?").run(String(reference).slice(0, 80), actor, now(), id);
    applyRefundTotal(org, r.payment_id, (db.prepare('SELECT refunded_cents FROM job_payments WHERE id=?').get(r.payment_id)?.refunded_cents || 0) + r.amount_cents, 'paid back manually');
    syncJobFinance(org, r.work_order_id, actor);
    audit(org, actor, 'finance.refund_completed', 'fin_refund', id, { reference, amount_cents: r.amount_cents });
    return { ok: true };
  }
  function refunds(org) {
    syncRunStates(org);
    return db.prepare('SELECT f.*,p.receipt_no,p.amount_cents paid_cents,w.title job FROM fin_refunds f LEFT JOIN job_payments p ON p.id=f.payment_id LEFT JOIN work_orders w ON w.id=f.work_order_id WHERE f.organisation_id=? ORDER BY f.created_at DESC LIMIT 300').all(org);
  }
  // A rejected or expired approval closes the request it belonged to.
  function syncRunStates(org) {
    for (const r of db.prepare("SELECT f.id,a.status FROM fin_refunds f JOIN automation_runs a ON a.id=f.run_id WHERE f.organisation_id=? AND f.status='pending_approval' AND a.status IN ('rejected','expired','failed')").all(org)) db.prepare("UPDATE fin_refunds SET status=?,updated_at=? WHERE id=?").run(r.status === 'failed' ? 'failed' : 'rejected', now(), r.id);
    for (const c of db.prepare("SELECT d.id,a.status FROM tenant_documents d JOIN automation_runs a ON a.id=d.run_id WHERE d.organisation_id=? AND d.kind='credit_note' AND d.status='pending_approval' AND a.status IN ('rejected','expired','failed')").all(org)) db.prepare("UPDATE tenant_documents SET status='rejected',updated_at=? WHERE id=?").run(now(), c.id);
  }
  function startLevel3(org, action, key, params, actor) {
    const engine = engineRef.current; if (!engine) throw new Error('The approval engine is not running.');
    return engine.startRun({ id: null, scope: 'business', organisation_id: org, current_version: 0 }, { trigger: 'manual', key, payload: params, definition: { trigger: 'manual', action, conditions: [], params, analysis: 'rules', always_approve: true, approval_expires_hours: 168 }, actor: actor ? { id: actor } : null });
  }

  // ---------------- reconciliation ----------------
  function importBank(org, actor, { filename = 'statement.csv', csv }) {
    const { rows, errors } = parseBankCsv(csv);
    if (!rows.length) return E(400, errors[0] || 'No rows found.', { errors });
    const imp = uid(), at = now(); let added = 0, dup = 0;
    const learned = db.prepare('SELECT pattern,category FROM fin_category_memory WHERE organisation_id=?').all(org);
    db.transaction(() => {
      const seen = new Map();
      for (const r of rows) {
        const base = `${r.posted_on}|${r.amount_cents}|${r.description.toLowerCase().replace(/\s+/g, ' ')}|${r.reference}`;
        const k = (seen.get(base) || 0) + 1; seen.set(base, k);
        const hash = crypto.createHash('sha256').update(`${base}|${k}`).digest('hex');
        const s = categorise(r.description, r.amount_cents, learned);
        const ins = db.prepare('INSERT OR IGNORE INTO fin_bank_lines (id,organisation_id,import_id,posted_on,description,amount_cents,reference,hash,suggestion_json) VALUES (?,?,?,?,?,?,?,?,?)').run(uid(), org, imp, r.posted_on, r.description, r.amount_cents, r.reference || null, hash, JSON.stringify({ category: s }));
        if (ins.changes) added++; else dup++;
      }
      db.prepare('INSERT INTO fin_imports (id,organisation_id,filename,rows,duplicates,created_by,created_at) VALUES (?,?,?,?,?,?,?)').run(imp, org, String(filename).slice(0, 120), added, dup, actor, at);
    })();
    const matched = autoMatch(org);
    audit(org, actor, 'finance.bank_imported', 'fin_import', imp, { rows: added, duplicates: dup, rejected_rows: errors.length, suggested_matches: matched });
    return { ok: true, import_id: imp, added, duplicates: dup, errors, suggested_matches: matched };
  }
  // Suggests (never confirms) a match between money in the bank and a recorded payment: same amount, within 7 days,
  // the reference or description naming the invoice, receipt or bank reference counts for more.
  function candidates(org, line) {
    if (line.amount_cents <= 0) return [];
    const from = iso(Date.parse(line.posted_on) - 10 * DAY), to = iso(Date.parse(line.posted_on) + 3 * DAY);
    const used = new Set(db.prepare("SELECT payment_id FROM fin_bank_lines WHERE organisation_id=? AND payment_id IS NOT NULL AND id<>?").all(org, line.id).map((r) => r.payment_id));
    const text = `${line.description} ${line.reference || ''}`.toUpperCase();
    return db.prepare(`SELECT p.*,w.title job,(SELECT number FROM tenant_documents d WHERE d.organisation_id=p.organisation_id AND d.work_order_id=p.work_order_id AND d.kind IN ('invoice','deposit') AND d.number IS NOT NULL ORDER BY d.issued_at DESC LIMIT 1) invoice_number FROM job_payments p JOIN work_orders w ON w.id=p.work_order_id WHERE p.organisation_id=? AND p.status IN ('paid','refunded') AND p.amount_cents=? AND COALESCE(p.paid_at,p.created_at) BETWEEN ? AND ?`).all(org, line.amount_cents, from, to)
      .filter((p) => !used.has(p.id))
      .map((p) => { let score = 0.5; const why = ['Same amount']; if ((p.reference && text.includes(String(p.reference).toUpperCase())) || (p.invoice_number && text.includes(p.invoice_number)) || (p.receipt_no && text.includes(p.receipt_no))) { score += 0.4; why.push('Reference matches'); } const days = Math.abs(Date.parse(line.posted_on) - Date.parse(p.paid_at || p.created_at)) / DAY; if (days <= 3) { score += 0.1; why.push('Within 3 days'); } if (p.provider === 'stripe') { score -= 0.2; why.push('Stripe pays out in batches, so a single payment may not appear on its own'); } return { payment_id: p.id, score: Math.round(score * 100) / 100, why, job: p.job, invoice_number: p.invoice_number, receipt_no: p.receipt_no, paid_at: p.paid_at }; })
      .sort((a, b) => b.score - a.score).slice(0, 5);
  }
  function autoMatch(org) {
    let n = 0;
    for (const l of db.prepare("SELECT * FROM fin_bank_lines WHERE organisation_id=? AND status='unmatched'").all(org)) {
      const s = J(l.suggestion_json, {}); s.payments = candidates(org, l);
      db.prepare('UPDATE fin_bank_lines SET suggestion_json=? WHERE id=?').run(JSON.stringify(s), l.id); if (s.payments.length) n++;
    }
    return n;
  }
  function bankLines(org, { status = null } = {}) {
    return db.prepare(`SELECT * FROM fin_bank_lines WHERE organisation_id=?${status ? ' AND status=?' : ''} ORDER BY posted_on DESC, rowid DESC LIMIT 1000`).all(...[org, status].filter(Boolean)).map((l) => ({ ...l, suggestion: J(l.suggestion_json, {}), suggestion_json: undefined }));
  }
  function confirmMatch(org, lineId, actor, { payment_id = null, category = null, note = null, ignore = false }) {
    const l = db.prepare('SELECT * FROM fin_bank_lines WHERE id=? AND organisation_id=?').get(lineId, org); if (!l) return E(404, 'Bank line not found.');
    if (l.status !== 'unmatched') return E(409, 'This line is already reconciled. Undo it first.');
    const at = now();
    if (ignore) { db.prepare("UPDATE fin_bank_lines SET status='ignored',note=?,matched_by=?,matched_at=? WHERE id=?").run(note || 'Ignored', actor, at, l.id); audit(org, actor, 'finance.bank_line_ignored', 'fin_bank_line', l.id, { note }); return { ok: true }; }
    if (payment_id) {
      const p = db.prepare('SELECT * FROM job_payments WHERE id=? AND organisation_id=?').get(payment_id, org); if (!p) return E(404, 'Payment not found.');
      if (p.amount_cents !== l.amount_cents) return E(400, `The bank shows ${money(l.amount_cents)} but the payment is ${money(p.amount_cents)}. Record the difference instead of forcing a match.`);
      if (db.prepare('SELECT 1 FROM fin_bank_lines WHERE organisation_id=? AND payment_id=?').get(org, p.id)) return E(409, 'That payment is already matched to another bank line.');
      db.prepare("UPDATE fin_bank_lines SET status='matched',payment_id=?,matched_by=?,matched_at=?,note=? WHERE id=?").run(p.id, actor, at, note, l.id);
      audit(org, actor, 'finance.bank_line_matched', 'fin_bank_line', l.id, { payment_id: p.id, amount_cents: l.amount_cents });
      return { ok: true };
    }
    if (category) {
      if (!CATEGORIES.includes(category)) return E(400, 'Choose a category from the list.');
      let entry = null;
      if (l.amount_cents < 0 && !['Transfer between accounts', 'Owner drawings', 'Loan repayments', 'Tax payments (ATO)', 'Refund to customer'].includes(category)) {
        entry = uid();
        const gstGuess = seller(org).gst_registered && !['Wages and super', 'Insurance', 'Bank and payment fees'].includes(category) ? Math.round(-l.amount_cents / 11) : 0;
        db.prepare(`INSERT INTO organisation_finance_entries (id,organisation_id,entry_type,category,description,amount_cents,tax_cents,occurred_on,source,created_by,created_at,updated_at) VALUES (?,?,'expense',?,?,?,?,?,'bank',?,?,?)`).run(entry, org, category, l.description.slice(0, 200), -l.amount_cents, gstGuess, l.posted_on, actor, at, at);
      }
      const pattern = l.description.toLowerCase().replace(/[^a-z ]/g, ' ').split(/\s+/).filter((w) => w.length > 3)[0];
      if (pattern) db.prepare('INSERT INTO fin_category_memory (organisation_id,pattern,category,updated_at) VALUES (?,?,?,?) ON CONFLICT(organisation_id,pattern) DO UPDATE SET category=excluded.category,updated_at=excluded.updated_at').run(org, pattern, category, at);
      db.prepare("UPDATE fin_bank_lines SET status='categorised',category=?,finance_entry_id=?,matched_by=?,matched_at=?,note=? WHERE id=?").run(category, entry, actor, at, note, l.id);
      audit(org, actor, 'finance.bank_line_categorised', 'fin_bank_line', l.id, { category, expense_recorded: Boolean(entry) });
      return { ok: true, finance_entry_id: entry };
    }
    return E(400, 'Choose a payment to match, a category, or ignore the line.');
  }
  function undoMatch(org, lineId, actor) {
    const l = db.prepare('SELECT * FROM fin_bank_lines WHERE id=? AND organisation_id=?').get(lineId, org); if (!l) return E(404, 'Bank line not found.');
    if (l.status === 'unmatched') return E(409, 'This line is not reconciled.');
    db.transaction(() => { if (l.finance_entry_id) db.prepare("DELETE FROM organisation_finance_entries WHERE id=? AND organisation_id=? AND source='bank'").run(l.finance_entry_id, org); db.prepare("UPDATE fin_bank_lines SET status='unmatched',payment_id=NULL,category=NULL,finance_entry_id=NULL,matched_by=NULL,matched_at=NULL,note=NULL WHERE id=?").run(l.id); })();
    audit(org, actor, 'finance.bank_line_unmatched', 'fin_bank_line', l.id, { was: l.status });
    return { ok: true };
  }
  function reconciliation(org) {
    const lines = bankLines(org);
    const counts = lines.reduce((a, l) => ((a[l.status] = (a[l.status] || 0) + 1), a), {});
    const recordedNoBank = db.prepare(`SELECT p.id,p.amount_cents,p.provider,p.method,p.paid_at,p.receipt_no,w.title job FROM job_payments p JOIN work_orders w ON w.id=p.work_order_id WHERE p.organisation_id=? AND p.status='paid' AND p.provider IN ('bank','manual') AND COALESCE(p.method,'') NOT IN ('cash') AND p.paid_at < ? AND NOT EXISTS (SELECT 1 FROM fin_bank_lines b WHERE b.payment_id=p.id) ORDER BY p.paid_at DESC LIMIT 100`).all(org, iso(clock() - 5 * DAY));
    const lastImport = db.prepare('SELECT created_at,rows FROM fin_imports WHERE organisation_id=? ORDER BY created_at DESC LIMIT 1').get(org) || null;
    return { counts: { unmatched: counts.unmatched || 0, matched: counts.matched || 0, categorised: counts.categorised || 0, ignored: counts.ignored || 0 }, lines, recorded_not_in_bank: lastImport ? recordedNoBank : [], last_import: lastImport, categories: CATEGORIES, note: 'Matches are suggestions until you confirm them. Stripe and PayPal pay out in batches, so match those payouts as "Customer payment" and check the payout report in your provider.' };
  }

  // ---------------- discrepancies, follow-ups, flags (Super Pro suggestions) ----------------
  function discrepancies(org) {
    const out = [];
    for (const j of db.prepare("SELECT w.id,w.title,w.paid_cents,w.price_cents,(SELECT COALESCE(SUM(amount_cents-refunded_cents),0) FROM job_payments p WHERE p.work_order_id=w.id AND p.organisation_id=w.organisation_id AND p.status IN ('paid','refunded')) received FROM work_orders w WHERE w.organisation_id=?").all(org)) {
      if (j.received !== j.paid_cents) out.push({ kind: 'job_paid_mismatch', severity: 'high', entity_type: 'job', entity_id: j.id, message: `"${j.title}": the job shows ${money(j.paid_cents)} paid but its payments add up to ${money(j.received)}.` });
      if (j.paid_cents > j.price_cents + 0 && j.price_cents > 0) out.push({ kind: 'overpaid', severity: 'medium', entity_type: 'job', entity_id: j.id, message: `"${j.title}" has been paid ${money(j.paid_cents - j.price_cents)} more than its price. A refund or credit may be due.` });
    }
    for (const d of db.prepare("SELECT * FROM tenant_documents WHERE organisation_id=? AND kind='invoice' AND status IN ('issued','part_paid','paid') AND work_order_id IS NOT NULL").all(org)) {
      const j = job(org, d.work_order_id); if (!j) continue;
      const expect = d.amount_cents + (d.gst_cents || 0) - credits(org, d.id);
      if (j.price_cents !== expect) out.push({ kind: 'invoice_job_mismatch', severity: 'high', entity_type: 'invoice', entity_id: d.id, message: `Invoice ${d.number || d.title} totals ${money(expect)} after credits, but the job price is ${money(j.price_cents)}.` });
    }
    for (const e of db.prepare("SELECT p.id,p.amount_cents,e.outcome FROM payment_events e JOIN job_payments p ON p.provider_ref IS NOT NULL AND p.organisation_id=e.organisation_id WHERE e.organisation_id=? AND e.outcome='amount_mismatch' LIMIT 20").all(org)) out.push({ kind: 'provider_amount_mismatch', severity: 'high', entity_type: 'job_payment', entity_id: e.id, message: 'A payment provider reported a different amount from the one requested. Check the provider before treating the invoice as paid.' });
    const dups = db.prepare("SELECT a.id a_id,b.id b_id,a.amount_cents,w.title FROM job_payments a JOIN job_payments b ON b.work_order_id=a.work_order_id AND b.id>a.id AND b.amount_cents=a.amount_cents AND b.status='paid' AND ABS(julianday(b.paid_at)-julianday(a.paid_at))<2 JOIN work_orders w ON w.id=a.work_order_id WHERE a.organisation_id=? AND a.status='paid' LIMIT 20").all(org);
    for (const x of dups) out.push({ kind: 'possible_duplicate_payment', severity: 'medium', entity_type: 'job_payment', entity_id: x.b_id, message: `Two payments of ${money(x.amount_cents)} for "${x.title}" within two days. Check it was not paid twice.` });
    return out;
  }
  function followUps(org) {
    const rows = db.prepare("SELECT * FROM tenant_documents WHERE organisation_id=? AND kind IN ('invoice','deposit') AND status IN ('issued','part_paid') AND due_at IS NOT NULL").all(org);
    const out = [];
    for (const d of rows) {
      const st = statusOf(org, d); if (st !== 'overdue') continue;
      const m = moneyOn(org, d), days = Math.floor((clock() - Date.parse(d.due_at)) / DAY), c = buyer(org, d.customer_id);
      const reminders = db.prepare("SELECT COUNT(*) n FROM payment_notices WHERE organisation_id=? AND work_order_id=? AND kind LIKE '%reminder%' AND channel<>'in_app'").get(org, d.work_order_id).n;
      const history = db.prepare("SELECT AVG(julianday(p.paid_at)-julianday(w.invoice_issued_at)) d FROM job_payments p JOIN work_orders w ON w.id=p.work_order_id WHERE p.organisation_id=? AND p.customer_id=? AND p.status='paid' AND w.invoice_issued_at IS NOT NULL").get(org, d.customer_id || '')?.d;
      const action = days >= 45 ? 'Call the customer, then send a final notice that names a date. Consider a payment plan or your debt recovery options.' : days >= 21 ? 'Call the customer and agree a date to pay.' : reminders ? 'Send a second, firmer reminder with the payment link.' : 'Send a friendly reminder with the payment link.';
      out.push({ document_id: d.id, number: d.number, customer: c.name || '', owing_cents: m.owing_cents, days_overdue: days, reminders_sent: reminders, usual_days_to_pay: history ? Math.round(history) : null, recommendation: action, basis: 'Super Pro suggestion from your records. You decide what to send.' });
    }
    return out.sort((a, b) => b.days_overdue - a.days_overdue);
  }
  function scanFlags(org) {
    const found = [];
    const big = db.prepare("SELECT f.id,f.amount_cents,f.requested_by FROM fin_refunds f WHERE f.organisation_id=? AND f.created_at>?").all(org, iso(clock() - 30 * DAY));
    const avg = db.prepare("SELECT AVG(amount_cents) a FROM job_payments WHERE organisation_id=? AND status='paid'").get(org).a || 0;
    for (const r of big) if (avg && r.amount_cents > 3 * avg && r.amount_cents >= 50000) found.push({ kind: 'large_refund', severity: 'high', entity_type: 'fin_refund', entity_id: r.id, message: `A refund of ${money(r.amount_cents)} is more than three times your average payment.` });
    const manual = db.prepare("SELECT created_by_user_id u,COUNT(*) n,SUM(amount_cents) s FROM job_payments WHERE organisation_id=? AND provider='manual' AND created_at>? GROUP BY created_by_user_id HAVING n>=10").all(org, iso(clock() - 7 * DAY));
    for (const m of manual) found.push({ kind: 'many_manual_payments', severity: 'medium', entity_type: 'user', entity_id: m.u, message: `${m.n} payments (${money(m.s)}) were recorded by hand by one person this week. Check they match the bank.` });
    const offHours = db.prepare("SELECT COUNT(*) n FROM audit_logs WHERE organisation_id=? AND module='finance' AND action IN ('finance.refund_requested','finance.credit_note_requested','finance.settings_changed') AND created_at>? AND CAST(strftime('%H',created_at,'+8 hours') AS INTEGER) BETWEEN 0 AND 4").get(org, iso(clock() - 7 * DAY)).n;
    if (offHours) found.push({ kind: 'after_hours_changes', severity: 'low', entity_type: 'audit', entity_id: null, message: `${offHours} refund, credit or settings change(s) were made between midnight and 5 am (Perth time) this week.` });
    for (const x of discrepancies(org)) found.push(x);
    for (const f of found) db.prepare("INSERT OR IGNORE INTO fin_flags (id,organisation_id,kind,severity,entity_type,entity_id,message,dedupe,created_at) VALUES (?,?,?,?,?,?,?,?,?)").run(uid(), org, f.kind, f.severity, f.entity_type, f.entity_id, f.message, `${f.kind}:${f.entity_id || ''}:${f.message.length}`, now());
    return db.prepare("SELECT * FROM fin_flags WHERE organisation_id=? ORDER BY status='open' DESC, created_at DESC LIMIT 200").all(org);
  }
  function resolveFlag(org, id, actor, { status, note }) {
    const r = db.prepare("UPDATE fin_flags SET status=?,resolved_by=?,resolved_at=?,resolution_note=? WHERE id=? AND organisation_id=? AND status='open'").run(status, actor, now(), String(note || '').slice(0, 300), id, org);
    if (!r.changes) return E(404, 'Open flag not found.');
    audit(org, actor, 'finance.flag_' + status, 'fin_flag', id, { note }); return { ok: true };
  }

  // ---------------- reports ----------------
  const periodOf = (from, to) => ({ from: String(from).slice(0, 10), to: String(to).slice(0, 10) });
  function profitAndLoss(org, from, to) {
    const p = periodOf(from, to);
    const rows = db.prepare('SELECT entry_type,category,SUM(amount_cents) amount_cents,SUM(tax_cents) tax_cents FROM organisation_finance_entries WHERE organisation_id=? AND occurred_on BETWEEN ? AND ? GROUP BY entry_type,category ORDER BY entry_type DESC, amount_cents DESC').all(org, p.from, p.to);
    const reg = seller(org).gst_registered;
    const ex = (r) => (reg ? r.amount_cents - r.tax_cents : r.amount_cents);
    const income = rows.filter((r) => r.entry_type === 'revenue'), expenses = rows.filter((r) => r.entry_type === 'expense');
    const ti = income.reduce((s, r) => s + ex(r), 0), te = expenses.reduce((s, r) => s + ex(r), 0);
    return { period: p, basis: 'cash', gst_registered: reg, income: income.map((r) => ({ category: r.category, amount_cents: ex(r) })), expenses: expenses.map((r) => ({ category: r.category, amount_cents: ex(r) })), total_income_cents: ti, total_expenses_cents: te, profit_cents: ti - te, note: reg ? 'Amounts exclude GST.' : 'You are not registered for GST, so amounts are as paid.' };
  }
  function gstReport(org, from, to) {
    const p = periodOf(from, to), s = settings(org), reg = seller(org).gst_registered;
    if (!reg) return { period: p, registered: false, note: 'Your business is not registered for GST, so there is no GST to report. Check your GST turnover against the registration threshold.', threshold_cents: rulesFor().gst.registration_turnover_cents };
    let sales;
    if (s.accounting_basis === 'accrual') sales = db.prepare("SELECT amount_cents+gst_cents inc_cents,gst_cents FROM tenant_documents WHERE organisation_id=? AND kind IN ('invoice','deposit') AND issued_at IS NOT NULL AND substr(issued_at,1,10) BETWEEN ? AND ?").all(org, p.from, p.to);
    else sales = db.prepare("SELECT p.amount_cents-p.refunded_cents inc_cents, CASE WHEN w.gst_applies THEN ROUND((p.amount_cents-p.refunded_cents)/11.0) ELSE 0 END gst_cents FROM job_payments p JOIN work_orders w ON w.id=p.work_order_id WHERE p.organisation_id=? AND p.status IN ('paid','refunded') AND substr(p.paid_at,1,10) BETWEEN ? AND ?").all(org, p.from, p.to);
    const adjustments = s.accounting_basis === 'accrual' ? db.prepare("SELECT amount_cents+gst_cents inc_cents,gst_cents FROM tenant_documents WHERE organisation_id=? AND kind='credit_note' AND status='issued' AND substr(issued_at,1,10) BETWEEN ? AND ?").all(org, p.from, p.to) : [];
    const purchases = db.prepare("SELECT amount_cents inc_cents,tax_cents gst_cents FROM organisation_finance_entries WHERE organisation_id=? AND entry_type='expense' AND occurred_on BETWEEN ? AND ?").all(org, p.from, p.to);
    return { period: p, registered: true, basis: s.accounting_basis, ...basDraft({ sales, purchases, adjustments }), counts: { sales: sales.length, purchases: purchases.length, adjustments: adjustments.length }, ruleset: rulesFor(p.to).id };
  }
  function aged(org) {
    const buckets = { current: 0, d1_30: 0, d31_60: 0, d61_90: 0, d90_plus: 0 }, rows = [];
    for (const d of db.prepare("SELECT * FROM tenant_documents WHERE organisation_id=? AND kind IN ('invoice','deposit') AND status IN ('issued','part_paid')").all(org)) {
      const m = moneyOn(org, d); if (m.owing_cents <= 0) continue;
      const days = d.due_at ? Math.floor((clock() - Date.parse(d.due_at)) / DAY) : 0;
      const b = days <= 0 ? 'current' : days <= 30 ? 'd1_30' : days <= 60 ? 'd31_60' : days <= 90 ? 'd61_90' : 'd90_plus';
      buckets[b] += m.owing_cents; rows.push({ id: d.id, number: d.number, customer: buyer(org, d.customer_id).name || '', owing_cents: m.owing_cents, due_at: d.due_at, days_overdue: Math.max(0, days), bucket: b });
    }
    return { buckets, rows: rows.sort((a, b) => b.days_overdue - a.days_overdue), total_cents: Object.values(buckets).reduce((s, v) => s + v, 0) };
  }
  function summary(org, from, to) {
    const pl = profitAndLoss(org, from, to), ag = aged(org), fu = followUps(org), rc = reconciliation(org), fl = db.prepare("SELECT COUNT(*) n FROM fin_flags WHERE organisation_id=? AND status='open'").get(org).n;
    const points = [`Income ${money(pl.total_income_cents)}, expenses ${money(pl.total_expenses_cents)}, ${pl.profit_cents >= 0 ? 'profit' : 'loss'} ${money(Math.abs(pl.profit_cents))} between ${pl.period.from} and ${pl.period.to}.`, `${money(ag.total_cents)} is owed to you${ag.buckets.d31_60 + ag.buckets.d61_90 + ag.buckets.d90_plus ? `, ${money(ag.buckets.d31_60 + ag.buckets.d61_90 + ag.buckets.d90_plus)} of it more than 30 days overdue` : ''}.`];
    if (fu.length) points.push(`${fu.length} invoice(s) are overdue; the oldest is ${fu[0].days_overdue} days past due (${fu[0].customer || fu[0].number}).`);
    if (rc.counts.unmatched) points.push(`${rc.counts.unmatched} bank line(s) still need reconciling.`);
    if (fl) points.push(`${fl} item(s) are flagged for checking.`);
    const top = [...pl.expenses].sort((a, b) => b.amount_cents - a.amount_cents)[0]; if (top) points.push(`Your largest expense category was ${top.category} (${money(top.amount_cents)}).`);
    return { points, generated_at: now(), basis: 'Summary of your Super Pro records, written by Super Pro. It is not financial, tax or legal advice.' };
  }
  function csv(rows, cols) { const esc = (v) => { const s = String(v ?? ''); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; }; return [cols.map(([, h]) => h).join(','), ...rows.map((r) => cols.map(([k, , f]) => esc(f ? f(r[k], r) : r[k])).join(','))].join('\n'); }

  // ---------------- AI-prepared invoice drafts ----------------
  function draftFromJob(org, jobId, actor) {
    const j = job(org, jobId); if (!j) return E(404, 'Job not found.');
    if (!j.completed_at) return E(409, 'Mark the job complete before drafting its invoice.');
    if (db.prepare("SELECT 1 FROM tenant_documents WHERE organisation_id=? AND kind='invoice' AND work_order_id=? AND status<>'cancelled'").get(org, j.id)) return E(409, 'This job already has an invoice.');
    const booking = db.prepare("SELECT * FROM tenant_documents WHERE organisation_id=? AND kind='booking' AND work_order_id=?").get(org, j.id);
    const quote = booking?.source_id ? doc(org, booking.source_id) : null;
    let lines = quote ? linesOf(quote).map(({ description, quantity, unit_cents, discount_cents, tax_code }) => ({ description, quantity, unit_cents, discount_cents, tax_code })) : [];
    const code = j.gst_applies === 0 ? 'FRE' : 'GST', inc = lineOpts(org).includesGst, reg = seller(org).gst_registered;
    const toUnit = (incCents) => (inc || !reg || code !== 'GST' ? incCents : Math.round(incCents / 1.1));
    const why = [];
    if (lines.length) why.push(`Items copied from quotation ${quote.number || quote.title}.`);
    else {
      const labour = Math.round((j.labour_hours || 0) * (j.labour_rate_cents || 0));
      if (labour > 0) { lines.push({ description: `Labour: ${j.labour_hours} hours`, quantity: j.labour_hours, unit_cents: inc || !reg ? j.labour_rate_cents : j.labour_rate_cents, tax_code: code }); why.push('Labour from the hours and rate on the job.'); }
      if (j.materials_cents > 0) { lines.push({ description: 'Materials', quantity: 1, unit_cents: j.materials_cents, tax_code: code }); why.push('Materials cost recorded on the job (check your mark-up).'); }
      if (!lines.length && j.price_cents > 0) { lines.push({ description: j.title, quantity: 1, unit_cents: toUnit(j.price_cents), tax_code: code }); why.push('One line for the agreed job price.'); }
    }
    if (!lines.length) return E(409, 'The job has no price, hours or materials to invoice. Add them first.');
    const r = create(org, actor, { kind: 'invoice', customer_id: j.customer_id, title: j.title, lines, work_order_id: j.id, ai_prepared: true, body: 'Prepared by Super Pro from the job record. Check every line before approving.' });
    return r.ok ? { ...r, explanation: why } : r;
  }

  // ---------------- compliance review ----------------
  function complianceReview(org) {
    const s = seller(org), items = [];
    const add = (status, area, text, fix = null) => items.push({ status, area, text, fix });
    if (!s.abn) add('action', 'ABN', 'No ABN is saved. Tax invoices must show your ABN.', 'Add it in Setup & Trust > Settings.');
    else if (!abnValid(s.abn)) add('action', 'ABN', `The saved ABN (${formatAbn(s.abn)}) fails the ABR check digit test.`, 'Check the number.');
    else add('ok', 'ABN', `ABN ${formatAbn(s.abn)} passes the check digit test. This does not confirm it is active; look it up on ABN Lookup.`);
    if (!s.gst_status_set) add('action', 'GST', 'You have not said whether the business is registered for GST.', 'Set it in Money > Finance settings.');
    else add('ok', 'GST', s.gst_registered ? 'Registered for GST: invoices are tax invoices with GST shown.' : 'Not registered for GST: invoices show no GST. Register if your GST turnover reaches the threshold.');
    const bad = db.prepare("SELECT number,compliance_json FROM tenant_documents WHERE organisation_id=? AND kind IN ('invoice','deposit','credit_note') AND status IN ('issued','part_paid','paid') AND (compliance_json IS NULL)").all(org);
    if (bad.length) add('review', 'Invoices', `${bad.length} invoice(s) were issued before Phase 08 checks existed. Review them against the tax invoice rules.`);
    const missingBuyer = list(org, { kind: 'invoice' }).filter((d) => d.total_cents >= rulesFor().tax_invoice.buyer_identity_from_cents && !d.customer_id && ['draft', 'approved'].includes(d.status));
    if (missingBuyer.length) add('action', 'Invoices', `${missingBuyer.length} draft invoice(s) of $1,000 or more have no customer, so they cannot show the buyer's identity.`);
    const rc = reconciliation(org);
    if (!rc.last_import) add('review', 'Reconciliation', 'No bank statement has been imported yet.', 'Import a CSV from your bank in Money > Reconciliation.');
    else if (rc.counts.unmatched) add('review', 'Reconciliation', `${rc.counts.unmatched} bank line(s) are not reconciled.`);
    else add('ok', 'Reconciliation', 'Every imported bank line is reconciled.');
    const pay = (() => { try { return db.prepare('SELECT stripe_secret_enc IS NOT NULL stripe, paypal_client_id IS NOT NULL paypal, bank_bsb IS NOT NULL bank FROM payment_settings WHERE organisation_id=?').get(org) || {}; } catch { return {}; } })();
    add('ok', 'Payments', `Card payments go straight to your own ${pay.stripe ? 'Stripe' : ''}${pay.stripe && pay.paypal ? ' and ' : ''}${pay.paypal ? 'PayPal' : ''}${!pay.stripe && !pay.paypal ? 'payment provider (none connected yet)' : ''} account. Super Pro never holds your customers' money and keeps no stored balance.`);
    add('ok', 'Records', `Issued invoices, adjustment notes and payment records cannot be deleted here. Keep business records for at least ${rulesFor().records.retain_years} years.`);
    add('review', 'Privacy', "Customer contact details and payment records are personal information. Your privacy policy should say how you collect, use and store them. Card numbers are never stored by Super Pro (Stripe holds them).");
    const open = db.prepare("SELECT COUNT(*) n FROM fin_flags WHERE organisation_id=? AND status='open'").get(org).n;
    if (open) add('review', 'Unusual activity', `${open} flagged item(s) are open.`, 'Review them in Money > Compliance & Audit.');
    return { items, ruleset: rulesFor(), disclaimer: 'Super Pro checks your records against the published rules listed here. It is not tax or legal advice. Confirm anything you are unsure about with the ATO or a registered tax agent.' };
  }
  function auditTrail(org, { limit = 200 } = {}) {
    return db.prepare("SELECT created_at,user_id,user_name,action,entity_type,entity_id,metadata_json metadata FROM audit_logs WHERE organisation_id=? AND (module IN ('finance','payments') OR action LIKE 'payment.%' OR action LIKE 'invoice.%' OR action LIKE 'finance.%') ORDER BY created_at DESC, rowid DESC LIMIT ?").all(org, Math.min(1000, limit)).map((r) => ({ ...r, metadata: J(r.metadata, {}) }));
  }

  // ---------------- printable documents ----------------
  function render(org, id) {
    const d = get(org, id); if (!d) return null;
    const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const s = d.seller, b = d.buyer || {}, reg = s.gst_registered, m = d.money;
    const rows = d.lines.map((l) => `<tr><td>${esc(l.description)}${reg && l.tax_code !== 'GST' ? ` <small>(${esc(TAX_CODES[l.tax_code])})</small>` : ''}</td><td class="n">${esc(l.quantity)}</td><td class="n">${money(l.unit_cents)}</td><td class="n">${money(d.prices_include_gst ? l.inc_cents : l.ex_cents)}</td></tr>`).join('');
    const gstLine = !reg ? '' : d.compliance?.totals?.gst_is_one_eleventh && d.prices_include_gst ? `<tr><td colspan="3">Total price includes GST of</td><td class="n">${money(d.gst_cents)}</td></tr>` : `<tr><td colspan="3">GST</td><td class="n">${money(d.gst_cents)}</td></tr>`;
    const paid = m && m.paid_cents ? `<tr><td colspan="3">Paid to date</td><td class="n">${money(Math.min(m.paid_cents, d.total_cents))}</td></tr><tr class="t"><td colspan="3">Amount owing</td><td class="n">${money(m.owing_cents)}</td></tr>` : '';
    const draft = !['issued', 'part_paid', 'paid', 'overdue', 'sent'].includes(d.status);
    return `<!doctype html><html lang="en-AU"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${esc(d.heading)} ${esc(d.number || '')}</title><style>body{font:15px/1.5 system-ui,sans-serif;color:#1b1f24;max-width:820px;margin:24px auto;padding:0 16px}h1{margin:0 0 4px}table{width:100%;border-collapse:collapse;margin:16px 0}th,td{padding:8px;border-bottom:1px solid #d5d9e0;text-align:left;vertical-align:top}.n{text-align:right;white-space:nowrap}.t td{font-weight:700}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:16px}.draft{border:2px dashed #b42318;color:#b42318;padding:8px 12px;font-weight:700}small{color:#555}@media print{.noprint{display:none}}</style></head><body>
${draft ? '<p class="draft">Draft: not issued. This is not a valid ' + esc(d.heading.toLowerCase()) + ' yet.</p>' : ''}
<h1>${esc(d.heading)}</h1><p>${d.number ? 'Number ' + esc(d.number) + ' · ' : ''}${d.issued_at ? 'Issued ' + esc(new Date(d.issued_at).toLocaleDateString('en-AU')) : ''}${d.due_at ? ' · Due ' + esc(new Date(d.due_at).toLocaleDateString('en-AU')) : ''}${d.valid_until ? ' · Valid until ' + esc(new Date(d.valid_until).toLocaleDateString('en-AU')) : ''}</p>
<div class="grid"><div><b>${esc(s.name)}</b><br>${s.abn ? 'ABN ' + esc(formatAbn(s.abn)) + '<br>' : ''}${esc(s.address)}<br>${esc(s.email)} ${esc(s.phone)}</div><div><b>${d.kind === 'credit_note' ? 'Customer' : 'Bill to'}</b><br>${esc(b.name || '')}${b.abn ? '<br>ABN ' + esc(formatAbn(b.abn)) : ''}<br>${esc(b.address || '')}</div></div>
${d.parent ? `<p>Adjusts ${esc(d.parent.kind === 'invoice' ? 'tax invoice' : d.parent.kind)} ${esc(d.parent.number || d.parent.title)}.${d.reason ? ' Reason: ' + esc(d.reason) : ''}</p>` : ''}
<table><thead><tr><th>Description</th><th class="n">Qty</th><th class="n">Unit price${reg ? (d.prices_include_gst ? ' (inc GST)' : ' (ex GST)') : ''}</th><th class="n">Amount</th></tr></thead><tbody>${rows}</tbody><tfoot>${reg && !d.prices_include_gst ? `<tr><td colspan="3">Subtotal (ex GST)</td><td class="n">${money(d.ex_cents)}</td></tr>` : ''}${gstLine}<tr class="t"><td colspan="3">${d.kind === 'credit_note' ? 'Total credit' : 'Total'}${reg ? ' (inc GST)' : ''}</td><td class="n">${money(d.total_cents)}</td></tr>${paid}</tfoot></table>
${d.body ? `<p>${esc(d.body)}</p>` : ''}${settings(org).footer_note ? `<p>${esc(settings(org).footer_note)}</p>` : ''}
<p><small>Checked against ruleset ${esc(d.ruleset)}.${d.kind === 'estimate' ? ' An estimate is a guide, not a fixed price.' : ''}</small></p><p class="noprint"><button onclick="print()">Print or save as PDF</button></p></body></html>`;
  }
  function renderReceipt(org, paymentId) {
    const r = receipts(org).find((x) => x.id === paymentId); if (!r) return null;
    const s = seller(org), esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    return `<!doctype html><html lang="en-AU"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Receipt ${esc(r.receipt_no)}</title><style>body{font:15px/1.5 system-ui,sans-serif;max-width:640px;margin:24px auto;padding:0 16px;color:#1b1f24}td{padding:6px 8px;border-bottom:1px solid #d5d9e0}@media print{.noprint{display:none}}</style></head><body><h1>Receipt</h1><p><b>${esc(s.name)}</b>${s.abn ? ' · ABN ' + esc(formatAbn(s.abn)) : ''}</p><table><tr><td>Receipt number</td><td>${esc(r.receipt_no)}</td></tr><tr><td>Date paid</td><td>${esc(new Date(r.paid_at).toLocaleDateString('en-AU'))}</td></tr><tr><td>Received from</td><td>${esc(r.customer || '')}</td></tr><tr><td>For</td><td>${esc(r.job)}${r.invoice_number ? ' (invoice ' + esc(r.invoice_number) + ')' : ''}</td></tr><tr><td>Amount</td><td>${money(r.amount_cents)}</td></tr>${r.gst_included_cents ? `<tr><td>Includes GST of</td><td>${money(r.gst_included_cents)}</td></tr>` : ''}${r.refunded_cents ? `<tr><td>Refunded</td><td>${money(r.refunded_cents)}</td></tr>` : ''}<tr><td>Paid by</td><td>${esc(r.method || r.provider)}</td></tr></table><p class="noprint"><button onclick="print()">Print or save as PDF</button></p></body></html>`;
  }

  function overview(org) {
    syncRunStates(org);
    const docs = list(org), by = (k, st) => docs.filter((d) => d.kind === k && (!st || st.includes(d.status)));
    return { settings: settings(org), seller: seller(org), counts: { quotes_open: by('quote', ['draft', 'approved', 'sent']).length, estimates_open: by('estimate', ['draft', 'approved', 'sent']).length, invoices_draft: by('invoice', ['draft', 'approved']).length, invoices_unpaid: by('invoice', ['issued', 'part_paid', 'overdue']).length, overdue: [...by('invoice', ['overdue']), ...by('deposit', ['overdue'])].length, refunds_waiting: db.prepare("SELECT COUNT(*) n FROM fin_refunds WHERE organisation_id=? AND status IN ('pending_approval','awaiting_manual')").get(org).n, credit_notes_waiting: by('credit_note', ['pending_approval']).length, bank_unmatched: db.prepare("SELECT COUNT(*) n FROM fin_bank_lines WHERE organisation_id=? AND status='unmatched'").get(org).n, flags_open: db.prepare("SELECT COUNT(*) n FROM fin_flags WHERE organisation_id=? AND status='open'").get(org).n }, aged: aged(org).buckets, ruleset: rulesFor().id };
  }

  return { settings, saveSettings, seller, list, get, create, update, approve, issue, cancel, convert, paymentLink, receipts, requestCreditNote, creditProposal, applyCreditNote, requestRefund, refundProposal, executeRefund, completeManualRefund, applyRefundTotal, refunds, importBank, bankLines, confirmMatch, undoMatch, reconciliation, discrepancies, followUps, scanFlags, resolveFlag, profitAndLoss, gstReport, aged, summary, csv, draftFromJob, complianceReview, auditTrail, render, renderReceipt, overview, categorise, rulesetById, syncRunStates };
}
