// Step 4 platform layer: unified response envelope, data portability, statutory erasure,
// VEVO result records, tenant-scoped omnichannel inbox, AI drafting and the approvals gate.
// Registered once from server.js via installSaasPlatform(app, deps).
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import rateLimit from 'express-rate-limit';

const SENIOR = ['owner', 'admin', 'manager', 'super_admin', 'director'];
const ADMINS = ['owner', 'admin', 'super_admin'];
const DAY = 24 * 60 * 60 * 1000;

// Intents an AI may propose. Anything in HIGH is always staged for a human; it is never executed here.
export const HIGH_CONSEQUENCE_INTENTS = new Set([
  'send_message', 'send_quote', 'issue_invoice', 'issue_refund', 'schedule_worker', 'change_pricing',
  'delete_data', 'share_customer_data', 'publish_social_post', 'make_payment'
]);
export const LOW_CONSEQUENCE_INTENTS = new Set(['summarise', 'draft_internal_note', 'search', 'classify']);

// ---------------------------------------------------------------------------------------------
// Unified response envelope. Existing fields stay at the top level so the current workspace keeps working;
// every successful /api/saas response also carries them under `data`. Errors are always { ok:false, error }.
// ---------------------------------------------------------------------------------------------
export function responseEnvelope(req, res, next) {
  const original = res.json.bind(res);
  res.json = (body) => {
    if (body && typeof body === 'object' && !Array.isArray(body) && typeof body.ok === 'boolean') {
      if (body.ok === false) {
        if (typeof body.error !== 'string') body = { ...body, error: String(body.error?.message || 'Request failed.') };
      } else if (!('data' in body)) {
        const { ok, ...rest } = body;
        body = { ok, ...rest, data: rest };
      }
    }
    return original(body);
  };
  next();
}

const sanitizeKey = /(password|salt|secret|token|code_hash|storage_path|file_path|private_media_path|mfa)/i;
const keepKey = /^(event_hash|prev_hash|content_hash|payload_hash)$/;
function clean(row) {
  const out = {};
  for (const [k, v] of Object.entries(row)) if (keepKey.test(k) || !sanitizeKey.test(k)) out[k] = v;
  return out;
}
function csvCell(v) {
  if (v === null || v === undefined) return '';
  let s = typeof v === 'object' ? JSON.stringify(v) : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; // neutralise spreadsheet formula injection
  return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}
function toCsv(rows) {
  if (!rows.length) return '';
  const cols = Object.keys(rows[0]);
  return [cols.join(','), ...rows.map((r) => cols.map((c) => csvCell(r[c])).join(','))].join('\r\n') + '\r\n';
}
const hmacHex = (secret, data) => crypto.createHmac('sha256', secret).update(data).digest('hex');
function safeEqual(a, b) {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}
const isoNow = () => new Date().toISOString();
const normaliseAddress = (channel, value) => {
  const v = String(value || '').trim();
  return channel === 'email' ? v.toLowerCase() : v.replace(/[^\d+]/g, '');
};

// ---------------------------------------------------------------------------------------------
// Inbox core (shared by the API, the provider webhooks and the Telnyx hook)
// ---------------------------------------------------------------------------------------------
export function recordInbound(db, { organisation_id, channel, contact_address, contact_name = null, subject = null, body = '', summary = null, kind = 'message', provider, external_message_id = null, duration_seconds = null, occurred_at = null }) {
  const now = isoNow();
  const address = normaliseAddress(channel, contact_address);
  if (!address) throw new Error('Missing contact address.');
  return db.transaction(() => {
    if (external_message_id) {
      const dup = db.prepare(`SELECT id,thread_id FROM comms_messages WHERE organisation_id=? AND provider=? AND external_message_id=?`).get(organisation_id, provider, external_message_id);
      if (dup) return { id: dup.id, thread_id: dup.thread_id, duplicate: true };
    }
    let thread = db.prepare(`SELECT id FROM comms_threads WHERE organisation_id=? AND channel=? AND contact_address=?`).get(organisation_id, channel, address);
    if (!thread) {
      thread = { id: crypto.randomUUID() };
      db.prepare(`INSERT INTO comms_threads (id,organisation_id,channel,contact_address,contact_name,subject,status,last_message_at,created_at,updated_at) VALUES (?,?,?,?,?,?,'needs_reply',?,?,?)`)
        .run(thread.id, organisation_id, channel, address, contact_name, subject, now, now, now);
    } else {
      db.prepare(`UPDATE comms_threads SET status=CASE WHEN status='closed' THEN 'needs_reply' ELSE 'needs_reply' END,last_message_at=?,updated_at=?,contact_name=COALESCE(contact_name,?),subject=COALESCE(?,subject) WHERE id=? AND organisation_id=?`)
        .run(now, now, contact_name, subject, thread.id, organisation_id);
    }
    const id = crypto.randomUUID();
    db.prepare(`INSERT INTO comms_messages (id,organisation_id,thread_id,direction,kind,body,summary,provider,external_message_id,duration_seconds,status,occurred_at,created_at) VALUES (?,?,?,'inbound',?,?,?,?,?,?,'received',?,?)`)
      .run(id, organisation_id, thread.id, kind, String(body).slice(0, 20000), summary ? String(summary).slice(0, 4000) : null, provider, external_message_id, duration_seconds, occurred_at || now, now);
    return { id, thread_id: thread.id, duplicate: false };
  })();
}

function organisationForAddress(db, channel, address) {
  const row = db.prepare(`SELECT organisation_id FROM comms_channels WHERE channel=? AND address=? AND status='active'`).get(channel, normaliseAddress(channel, address));
  return row?.organisation_id || null;
}

// Called from the verified Telnyx webhook. Only active, platform-activated numbers route to a tenant.
export function recordTelnyxComms(db, eventType, payload) {
  if (eventType === 'message.received') {
    const to = payload?.to?.[0]?.phone_number || payload?.to;
    const from = payload?.from?.phone_number || payload?.from;
    const org = organisationForAddress(db, 'sms', to);
    if (!org || !from) return null;
    return recordInbound(db, { organisation_id: org, channel: 'sms', contact_address: from, body: payload.text || '', provider: 'telnyx', external_message_id: payload.id || null });
  }
  if (eventType === 'call.hangup') {
    const org = organisationForAddress(db, 'voice', payload?.to);
    if (!org || !payload?.from) return null;
    const start = payload.start_time ? Date.parse(payload.start_time) : NaN, end = payload.end_time ? Date.parse(payload.end_time) : NaN;
    const seconds = Number.isFinite(start) && Number.isFinite(end) && end >= start ? Math.round((end - start) / 1000) : null;
    return recordInbound(db, { organisation_id: org, channel: 'voice', contact_address: payload.from, kind: 'call_log', body: `Call ended (${payload.hangup_cause || 'unknown'})`, provider: 'telnyx', external_message_id: payload.call_session_id || payload.call_control_id || null, duration_seconds: seconds });
  }
  return null;
}

// ---------------------------------------------------------------------------------------------
export function installSaasPlatform(app, deps) {
  const { db, env, requireSaasUser, requireSaasRole, requireAdmin, saasAudit, createWorkspaceApproval, generateAiText, aiProviderStatus, recomputeWorkerEligibility, createWorkerWithCompliance, workforceSeniorRoles, financeRoles } = deps;
  const ok = (res, data = {}, status = 200) => res.status(status).json({ ok: true, ...data });
  const fail = (res, status, error) => res.status(status).json({ ok: false, error });
  const exportLimiter = rateLimit({ windowMs: 60 * 60 * 1000, limit: 10, keyGenerator: (req) => `export:${req.saas?.user_id || 'anon'}`, standardHeaders: true, legacyHeaders: false, message: { ok: false, error: 'Export limit reached. Try again later.' } });
  const commsLimiter = rateLimit({ windowMs: 60 * 1000, limit: 60, standardHeaders: true, legacyHeaders: false, message: { ok: false, error: 'Too many requests.' } });
  const hookLimiter = rateLimit({ windowMs: 60 * 1000, limit: 300, standardHeaders: true, legacyHeaders: false, message: { ok: false, error: 'Too many requests.' } });

  // ===== Data portability (owner only) =====
  const EXPORTS = {
    organisation: (o) => db.prepare(`SELECT id,name,display_name,slug,status,timezone,abn,legal_name,state,postcode,brand_theme,brand_primary_color,brand_secondary_color,created_at,updated_at FROM organisations WHERE id=?`).all(o),
    members: (o) => db.prepare(`SELECT u.id user_id,u.email,u.phone,u.full_name,m.role,m.status,m.created_at FROM memberships m JOIN users u ON u.id=m.user_id WHERE m.organisation_id=?`).all(o),
    onboarding_profile: (o) => db.prepare(`SELECT * FROM onboarding_profiles WHERE organisation_id=?`).all(o),
    workers: (o) => db.prepare(`SELECT * FROM workers WHERE organisation_id=?`).all(o),
    worker_skills: (o) => db.prepare(`SELECT s.* FROM worker_skills s JOIN workers w ON w.id=s.worker_id WHERE w.organisation_id=?`).all(o),
    worker_documents: (o) => db.prepare(`SELECT d.* FROM worker_documents d JOIN workers w ON w.id=d.worker_id WHERE w.organisation_id=?`).all(o),
    worker_compliance: (o) => db.prepare(`SELECT * FROM worker_compliance_requirements WHERE organisation_id=?`).all(o),
    work_orders: (o) => db.prepare(`SELECT * FROM work_orders WHERE organisation_id=?`).all(o),
    job_offers: (o) => db.prepare(`SELECT * FROM job_offers WHERE organisation_id=?`).all(o),
    finance_entries: (o) => db.prepare(`SELECT * FROM organisation_finance_entries WHERE organisation_id=?`).all(o),
    approvals: (o) => db.prepare(`SELECT * FROM workspace_approvals WHERE organisation_id=?`).all(o),
    comms_threads: (o) => db.prepare(`SELECT * FROM comms_threads WHERE organisation_id=?`).all(o),
    comms_messages: (o) => db.prepare(`SELECT * FROM comms_messages WHERE organisation_id=?`).all(o),
    audit_logs: (o) => db.prepare(`SELECT * FROM audit_logs WHERE organisation_id=? ORDER BY created_at`).all(o),
    privacy_records: (o) => db.prepare(`SELECT * FROM privacy_governance WHERE organisation_id=?`).all(o),
    integrations: (o) => db.prepare(`SELECT provider,display_name,status,account_label,connected_at,updated_at FROM organisation_integrations WHERE organisation_id=?`).all(o)
  };
  app.get('/api/saas/data-export', requireSaasUser, requireSaasRole('owner'), exportLimiter, (req, res) => {
    const org = req.saas.organisation_id;
    const format = String(req.query.format || 'json').toLowerCase();
    if (!['json', 'csv'].includes(format)) return fail(res, 400, 'Format must be json or csv.');
    const stamp = isoNow().slice(0, 10);
    if (format === 'csv') {
      const table = String(req.query.table || '');
      if (!Object.hasOwn(EXPORTS, table)) return fail(res, 400, `CSV exports one table at a time. Choose one of: ${Object.keys(EXPORTS).join(', ')}.`);
      const rows = EXPORTS[table](org).map(clean);
      saasAudit(req, 'privacy.data_exported', 'organisation', org, { format, table, rows: rows.length });
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${table}-${stamp}.csv"`);
      res.setHeader('Cache-Control', 'no-store');
      return res.send(toCsv(rows));
    }
    const only = req.query.table ? String(req.query.table) : null;
    if (only && !Object.hasOwn(EXPORTS, only)) return fail(res, 400, `Unknown table. Choose one of: ${Object.keys(EXPORTS).join(', ')}.`);
    const tables = {};
    for (const [name, fn] of Object.entries(EXPORTS)) if (!only || only === name) tables[name] = fn(org).map(clean);
    saasAudit(req, 'privacy.data_exported', 'organisation', org, { format, tables: Object.keys(tables) });
    res.setHeader('Cache-Control', 'no-store');
    if (req.query.download === '1') res.setHeader('Content-Disposition', `attachment; filename="export-${stamp}.json"`);
    return ok(res, { exported_at: isoNow(), format_version: 1, organisation_id: org, note: 'Secrets, password hashes, tokens and stored file paths are excluded. Uploaded files are not included.', tables });
  });

  // ===== Privacy requests and statutory erasure =====
  const requestSchema = z.object({
    request_type: z.enum(['access', 'correction', 'deletion']),
    worker_id: z.string().uuid().optional(),
    subject_name: z.string().trim().min(1).max(200),
    details: z.string().trim().max(2000).optional()
  });
  app.get('/api/saas/privacy/requests', requireSaasUser, requireSaasRole(...ADMINS), (req, res) => {
    const rows = db.prepare(`SELECT id,record_type,worker_id,title,detail,status,requested_at,due_at,completed_at,retention_basis,evidence_json FROM privacy_governance WHERE organisation_id=? AND record_type IN ('access_request','correction_request','deletion_request') ORDER BY requested_at DESC LIMIT 200`).all(req.saas.organisation_id);
    ok(res, { requests: rows });
  });
  app.post('/api/saas/privacy/requests', requireSaasUser, requireSaasRole(...ADMINS), (req, res) => {
    const parsed = requestSchema.safeParse(req.body);
    if (!parsed.success) return fail(res, 400, 'Check the request details.');
    const org = req.saas.organisation_id, d = parsed.data;
    if (d.worker_id && !db.prepare(`SELECT 1 FROM workers WHERE id=? AND organisation_id=?`).get(d.worker_id, org)) return fail(res, 404, 'Worker not found.');
    const id = crypto.randomUUID(), now = isoNow();
    db.transaction(() => {
      db.prepare(`INSERT INTO privacy_governance (id,record_type,organisation_id,user_id,worker_id,subject_key,title,detail,status,requested_at,due_at,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,'open',?,?,?,?)`)
        .run(id, `${d.request_type}_request`, org, req.saas.user_id, d.worker_id || null, `${d.request_type}:${id}`, `${d.request_type} request: ${d.subject_name}`, d.details || null, now, new Date(Date.now() + 30 * DAY).toISOString(), now, now);
      saasAudit(req, 'privacy.request_logged', 'privacy_request', id, { request_type: d.request_type });
    })();
    ok(res, { id, due_at: new Date(Date.now() + 30 * DAY).toISOString(), note: 'APP 12 and 13 expect a response within 30 days.' }, 201);
  });
  app.post('/api/saas/privacy/requests/:id/erase', requireSaasUser, requireSaasRole('owner'), (req, res) => {
    const org = req.saas.organisation_id;
    const request = db.prepare(`SELECT * FROM privacy_governance WHERE id=? AND organisation_id=? AND record_type='deletion_request' AND status='open'`).get(req.params.id, org);
    if (!request) return fail(res, 404, 'Open deletion request not found.');
    if (!request.worker_id) return fail(res, 409, 'Erasure here applies to worker records. Use account deletion for the whole business.');
    const worker = db.prepare(`SELECT * FROM workers WHERE id=? AND organisation_id=?`).get(request.worker_id, org);
    if (!worker) return fail(res, 404, 'Worker not found.');
    const now = isoNow();
    const held = Number(worker.legal_hold) === 1 || (worker.fair_work_retain_until && worker.fair_work_retain_until > now);
    if (held) {
      db.transaction(() => {
        db.prepare(`UPDATE privacy_governance SET status='retained_by_law',completed_at=?,retention_basis=?,evidence_json=?,updated_at=? WHERE id=? AND organisation_id=?`)
          .run(now, 'Fair Work Act 2009 (Cth) s 535: employee records must be kept for 7 years. Needs legal review.', JSON.stringify({ retain_until: worker.fair_work_retain_until, legal_hold: !!worker.legal_hold }), now, request.id, org);
        saasAudit(req, 'privacy.erasure_retained', 'worker', worker.id, { retain_until: worker.fair_work_retain_until, legal_hold: !!worker.legal_hold });
      })();
      return ok(res, { outcome: 'retained_by_law', retain_until: worker.fair_work_retain_until, message: 'The record is inside its statutory retention period, so it was not erased. It stays restricted to authorised senior users.' });
    }
    const docCols = db.prepare(`PRAGMA table_info(worker_documents)`).all().map((c) => c.name).filter((n) => /path/i.test(n));
    const files = docCols.length ? db.prepare(`SELECT ${docCols.join(',')} FROM worker_documents WHERE worker_id=?`).all(worker.id).flatMap((r) => Object.values(r)).filter(Boolean) : [];
    db.transaction(() => {
      db.prepare(`UPDATE workers SET full_name='Erased worker',email=NULL,phone=NULL,user_id=NULL,visa_subclass=NULL,visa_expiry=NULL,work_restrictions=NULL,vevo_reference=NULL,vevo_conditions=NULL,status='inactive',approved_for_scheduling=0,updated_at=? WHERE id=? AND organisation_id=?`).run(now, worker.id, org);
      db.prepare(`DELETE FROM worker_documents WHERE worker_id=?`).run(worker.id);
      db.prepare(`DELETE FROM worker_onboarding_invites WHERE worker_id=? AND organisation_id=?`).run(worker.id, org);
      db.prepare(`UPDATE privacy_governance SET status='completed',completed_at=?,evidence_json=?,updated_at=? WHERE id=? AND organisation_id=?`).run(now, JSON.stringify({ method: 'anonymised', documents_deleted: files.length }), now, request.id, org);
      saasAudit(req, 'privacy.worker_erased', 'worker', worker.id, { method: 'anonymised', documents_deleted: files.length });
    })();
    for (const f of files) { try { fs.rmSync(String(f), { force: true }); } catch { /* file already gone */ } }
    ok(res, { outcome: 'erased', message: 'Personal details were removed and documents deleted. Job history is kept without identifying the person.' });
  });

  // ===== VEVO result record (the check itself is made on the government VEVO service) =====
  const vevoSchema = z.object({
    status: z.enum(['pending', 'verified', 'verified_with_conditions', 'not_permitted', 'expired']),
    checked_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    reference: z.string().trim().max(60).optional(),
    work_rights_expiry: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    conditions: z.string().trim().max(500).optional(),
    consent_confirmed: z.literal(true)
  });
  app.put('/api/saas/workers/:id/vevo', requireSaasUser, requireSaasRole(...SENIOR), (req, res) => {
    const parsed = vevoSchema.safeParse(req.body);
    if (!parsed.success) return fail(res, 400, 'Provide the result, check date and confirm the worker consented to the check.');
    const org = req.saas.organisation_id, d = parsed.data;
    const worker = db.prepare(`SELECT id FROM workers WHERE id=? AND organisation_id=?`).get(req.params.id, org);
    if (!worker) return fail(res, 404, 'Worker not found.');
    if (d.status === 'verified_with_conditions' && !d.conditions) return fail(res, 400, 'Record the visa conditions (for example work-hour limits).');
    const now = isoNow(), consentId = crypto.randomUUID();
    const state = db.transaction(() => {
      db.prepare(`INSERT INTO privacy_governance (id,record_type,organisation_id,user_id,worker_id,subject_key,title,purpose,status,granted_at,created_at,updated_at) VALUES (?,'consent',?,?,?,?,?,?,'active',?,?,?)`)
        .run(consentId, org, req.saas.user_id, worker.id, `vevo:${worker.id}:${now}`, 'Consent to VEVO work-rights check', 'Verify entitlement to work in Australia', now, now, now);
      db.prepare(`UPDATE workers SET vevo_status=?,vevo_checked_at=?,vevo_checked_by_user_id=?,vevo_reference=?,vevo_work_rights_expiry=?,vevo_conditions=?,vevo_consent_id=?,updated_at=? WHERE id=? AND organisation_id=?`)
        .run(d.status, d.checked_on, req.saas.user_id, d.reference || null, d.work_rights_expiry || null, d.conditions || null, consentId, now, worker.id, org);
      saasAudit(req, 'worker.vevo_recorded', 'worker', worker.id, { status: d.status, checked_on: d.checked_on, consent_id: consentId });
      return recomputeWorkerEligibility(org, worker.id);
    })();
    ok(res, { vevo_status: d.status, work_rights_verified: state.work_rights_verified, approved_for_scheduling: state.eligible, note: 'Result recorded. The platform does not query VEVO; run the check on the Department of Home Affairs service.' });
  });

  // ===== Omnichannel inbox (voice, email, SMS, WhatsApp) =====
  app.get('/api/saas/comms/channels', requireSaasUser, requireSaasRole(...ADMINS), (req, res) => {
    ok(res, { channels: db.prepare(`SELECT channel,address,status,activated_at,created_at FROM comms_channels WHERE organisation_id=?`).all(req.saas.organisation_id) });
  });
  app.put('/api/saas/comms/channels/:channel', commsLimiter, requireSaasUser, requireSaasRole('owner'), (req, res) => {
    const channel = z.enum(['voice', 'email', 'sms', 'whatsapp']).safeParse(req.params.channel);
    const body = z.object({ address: z.string().trim().min(3).max(200) }).safeParse(req.body);
    if (!channel.success || !body.success) return fail(res, 400, 'Choose a channel and an address.');
    const address = normaliseAddress(channel.data, body.data.address);
    if (channel.data === 'email' ? !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address) : !/^\+\d{8,15}$/.test(address)) return fail(res, 400, channel.data === 'email' ? 'Enter a valid email address.' : 'Enter the number in international format, e.g. +61400000000.');
    const taken = db.prepare(`SELECT organisation_id FROM comms_channels WHERE channel=? AND address=?`).get(channel.data, address);
    if (taken && taken.organisation_id !== req.saas.organisation_id) return fail(res, 409, 'That address is already registered to another workspace.');
    const now = isoNow();
    db.transaction(() => {
      // Changing the address returns the channel to pending: routing needs platform activation again.
      db.prepare(`INSERT INTO comms_channels (organisation_id,channel,address,status,requested_by_user_id,created_at) VALUES (?,?,?,'pending',?,?) ON CONFLICT(organisation_id,channel) DO UPDATE SET address=excluded.address,status=CASE WHEN comms_channels.address=excluded.address THEN comms_channels.status ELSE 'pending' END,requested_by_user_id=excluded.requested_by_user_id`)
        .run(req.saas.organisation_id, channel.data, address, req.saas.user_id, now);
      saasAudit(req, 'comms.channel_requested', 'comms_channel', channel.data, { channel: channel.data });
    })();
    ok(res, { channel: channel.data, address, status: db.prepare(`SELECT status FROM comms_channels WHERE organisation_id=? AND channel=?`).get(req.saas.organisation_id, channel.data).status, note: 'Inbound routing starts once the platform operator activates the address.' }, 202);
  });
  // Platform operator activates an address after confirming the workspace owns it.
  app.post('/api/admin/comms-channels/:organisationId/:channel/activate', requireAdmin, (req, res) => {
    const r = db.prepare(`UPDATE comms_channels SET status='active',activated_at=? WHERE organisation_id=? AND channel=?`).run(isoNow(), req.params.organisationId, req.params.channel);
    if (!r.changes) return fail(res, 404, 'Channel request not found.');
    res.json({ ok: true });
  });

  app.get('/api/saas/comms/threads', requireSaasUser, requireSaasRole(...SENIOR), (req, res) => {
    const status = ['open', 'needs_reply', 'closed'].includes(req.query.status) ? req.query.status : null;
    const rows = db.prepare(`SELECT id,channel,contact_address,contact_name,subject,status,assigned_user_id,last_message_at FROM comms_threads WHERE organisation_id=? AND (? IS NULL OR status=?) ORDER BY last_message_at DESC LIMIT 100`).all(req.saas.organisation_id, status, status);
    ok(res, { threads: rows });
  });
  app.get('/api/saas/comms/threads/:id', requireSaasUser, requireSaasRole(...SENIOR), (req, res) => {
    const org = req.saas.organisation_id;
    const thread = db.prepare(`SELECT * FROM comms_threads WHERE id=? AND organisation_id=?`).get(req.params.id, org);
    if (!thread) return fail(res, 404, 'Thread not found.');
    ok(res, { thread, messages: db.prepare(`SELECT id,direction,kind,body,summary,provider,duration_seconds,status,approval_id,ai_generated,occurred_at FROM comms_messages WHERE thread_id=? AND organisation_id=? ORDER BY occurred_at,created_at LIMIT 500`).all(thread.id, org) });
  });
  app.patch('/api/saas/comms/threads/:id', requireSaasUser, requireSaasRole(...SENIOR), (req, res) => {
    const body = z.object({ status: z.enum(['open', 'needs_reply', 'closed']) }).safeParse(req.body);
    if (!body.success) return fail(res, 400, 'Invalid status.');
    const r = db.prepare(`UPDATE comms_threads SET status=?,updated_at=? WHERE id=? AND organisation_id=?`).run(body.data.status, isoNow(), req.params.id, req.saas.organisation_id);
    if (!r.changes) return fail(res, 404, 'Thread not found.');
    ok(res, { status: body.data.status });
  });

  // Voice log API: the AI receptionist (or staff) records a finished call with its summary.
  app.post('/api/saas/comms/voice-logs', commsLimiter, requireSaasUser, requireSaasRole(...SENIOR), (req, res) => {
    const body = z.object({
      contact_address: z.string().trim().min(3).max(40), contact_name: z.string().trim().max(200).optional(),
      summary: z.string().trim().max(4000).optional(), transcript: z.string().max(20000).optional(),
      duration_seconds: z.number().int().min(0).max(86400).optional(), occurred_at: z.string().datetime().optional(),
      external_id: z.string().max(120).optional()
    }).safeParse(req.body);
    if (!body.success) return fail(res, 400, 'Check the call details.');
    const d = body.data;
    const r = recordInbound(db, { organisation_id: req.saas.organisation_id, channel: 'voice', contact_address: d.contact_address, contact_name: d.contact_name, kind: 'call_log', body: d.transcript || d.summary || 'Call logged', summary: d.summary, provider: 'api', external_message_id: d.external_id || null, duration_seconds: d.duration_seconds ?? null, occurred_at: d.occurred_at });
    ok(res, r, r.duplicate ? 200 : 201);
  });

  // Inbound email webhook: HMAC-SHA256 over `${timestamp}.${rawBody}` using INBOUND_EMAIL_WEBHOOK_SECRET.
  app.post('/api/webhooks/inbound-email', hookLimiter, (req, res) => {
    const secret = String(env.INBOUND_EMAIL_WEBHOOK_SECRET || '');
    if (!secret) return fail(res, 503, 'Inbound email is not configured.');
    const ts = String(req.get('x-webhook-timestamp') || ''), sig = String(req.get('x-webhook-signature') || '');
    if (!req.rawBody || !/^\d+$/.test(ts) || Math.abs(Date.now() / 1000 - Number(ts)) > 300 || !safeEqual(sig, hmacHex(secret, `${ts}.${req.rawBody.toString('utf8')}`))) return fail(res, 401, 'Invalid signature.');
    const body = z.object({ message_id: z.string().max(300).optional(), from: z.object({ address: z.string().max(320), name: z.string().max(200).optional() }), to: z.string().max(320), subject: z.string().max(300).optional(), text: z.string().max(100000).optional() }).safeParse(req.body);
    if (!body.success) return fail(res, 400, 'Unrecognised email payload.');
    const org = organisationForAddress(db, 'email', body.data.to);
    if (!org) return res.status(202).json({ ok: true, routed: false });
    const r = recordInbound(db, { organisation_id: org, channel: 'email', contact_address: body.data.from.address, contact_name: body.data.from.name, subject: body.data.subject, body: body.data.text || '', provider: 'email', external_message_id: body.data.message_id || null });
    res.status(202).json({ ok: true, routed: true, duplicate: r.duplicate });
  });

  // WhatsApp Cloud API: GET verification handshake and signed POST deliveries (X-Hub-Signature-256).
  app.get('/api/webhooks/whatsapp', (req, res) => {
    const token = String(env.WHATSAPP_VERIFY_TOKEN || '');
    if (token && req.query['hub.mode'] === 'subscribe' && safeEqual(String(req.query['hub.verify_token'] || ''), token)) return res.status(200).type('text/plain').send(String(req.query['hub.challenge'] || ''));
    res.status(403).json({ ok: false, error: 'Verification failed.' });
  });
  app.post('/api/webhooks/whatsapp', hookLimiter, (req, res) => {
    const secret = String(env.META_APP_SECRET || '');
    if (!secret) return fail(res, 503, 'WhatsApp webhook is not configured.');
    const sig = String(req.get('x-hub-signature-256') || '');
    if (!req.rawBody || !safeEqual(sig, 'sha256=' + hmacHex(secret, req.rawBody))) return fail(res, 401, 'Invalid signature.');
    res.status(200).json({ ok: true });
    try {
      for (const entry of req.body?.entry || []) for (const change of entry.changes || []) {
        const v = change.value || {};
        const org = organisationForAddress(db, 'whatsapp', '+' + String(v.metadata?.display_phone_number || '').replace(/\D/g, ''));
        if (!org) continue;
        for (const m of v.messages || []) {
          const name = (v.contacts || []).find((c) => c.wa_id === m.from)?.profile?.name;
          recordInbound(db, { organisation_id: org, channel: 'whatsapp', contact_address: '+' + String(m.from).replace(/\D/g, ''), contact_name: name, body: m.text?.body || `[${m.type || 'message'}]`, provider: 'whatsapp', external_message_id: m.id });
        }
      }
    } catch (error) { console.error('[WHATSAPP WEBHOOK]', error.message); }
  });

  // ===== Universal data migration: preview (dry run) then commit =====
  // Imported people are never trusted on work rights: they always start as "requires_review" and need a VEVO result.
  const MAX_IMPORT_ROWS = 1000;
  const EMPLOYMENT = { 'full time': 'full_time', fulltime: 'full_time', ft: 'full_time', permanent: 'full_time', 'part time': 'part_time', parttime: 'part_time', pt: 'part_time', casual: 'casual', contractor: 'contractor', subcontractor: 'subcontractor', 'fixed term': 'fixed_term', apprentice: 'apprentice', temporary: 'temporary', owner: 'owner' };
  const EMPLOYMENT_VALUES = new Set(Object.values(EMPLOYMENT));
  const text = (v) => (v === null || v === undefined ? '' : String(v).trim());
  const auDate = (v) => {
    const m = text(v).match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})(?:[ T](\d{1,2}):(\d{2}))?/);
    if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}T${(m[4] || '08').padStart(2, '0')}:${m[5] || '00'}:00`;
    const iso = text(v).match(/^\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2})?)?/);
    return iso && !Number.isNaN(Date.parse(iso[0].replace(' ', 'T'))) ? iso[0].replace(' ', 'T') : null;
  };
  const money = (v) => { const n = Number(text(v).replace(/[$,\s]/g, '')); return Number.isFinite(n) && n >= 0 ? n : null; };
  const phoneKey = (v) => text(v).replace(/[^\d+]/g, '');

  const ENTITIES = {
    workers: {
      label: 'Workers', roles: workforceSeniorRoles,
      fields: ['full_name', 'email', 'phone', 'role_title', 'employment_type', 'worker_level'],
      normalise(r) {
        const errors = [], name = text(r.full_name);
        if (name.length < 2) errors.push('Name is required.');
        const email = text(r.email).toLowerCase();
        if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.push('Email is not valid.');
        const rawType = text(r.employment_type).toLowerCase().replace(/[_-]/g, ' ');
        const type = rawType ? (EMPLOYMENT[rawType] || (EMPLOYMENT_VALUES.has(rawType.replace(/ /g, '_')) ? rawType.replace(/ /g, '_') : null)) : 'casual';
        if (!type) errors.push(`Employment type "${rawType}" is not recognised.`);
        const level = text(r.worker_level) ? Number(r.worker_level) : 1;
        if (!Number.isInteger(level) || level < 1 || level > 7) errors.push('Level must be 1 to 7.');
        return { errors, value: { full_name: name, email: email || null, phone: text(r.phone) || null, role_title: text(r.role_title) || 'Team member', employment_type: type || 'casual', worker_level: level || 1, work_status: 'requires_review' }, key: email || phoneKey(r.phone) || name.toLowerCase() };
      },
      existing: (org) => new Set(db.prepare(`SELECT lower(COALESCE(email,'')) e,phone p,lower(full_name) n FROM workers WHERE organisation_id=?`).all(org).flatMap((w) => [w.e, phoneKey(w.p), w.n]).filter(Boolean)),
      create: (org, v) => createWorkerWithCompliance(org, v).id,
      update: (org, v) => {
        const w = db.prepare(`SELECT id FROM workers WHERE organisation_id=? AND (lower(email)=? OR lower(full_name)=lower(?)) LIMIT 1`).get(org, v.email || '', v.full_name);
        if (!w) return false;
        db.prepare(`UPDATE workers SET role_title=?,phone=COALESCE(?,phone),email=COALESCE(?,email),updated_at=? WHERE id=? AND organisation_id=?`).run(v.role_title, v.phone, v.email, isoNow(), w.id, org);
        return true;
      }
    },
    work_orders: {
      label: 'Work orders', roles: ['owner', 'admin', 'manager', 'super_admin'],
      fields: ['title', 'address', 'start_at', 'estimated_hours', 'required_workers', 'required_level', 'required_skills'],
      normalise(r) {
        const errors = [], title = text(r.title);
        if (title.length < 2) errors.push('Title is required.');
        const start = auDate(r.start_at);
        if (!start) errors.push('Start date is missing or not a date (use DD/MM/YYYY or YYYY-MM-DD).');
        const hours = text(r.estimated_hours) ? Number(r.estimated_hours) : null;
        if (hours !== null && !(hours > 0 && hours <= 100)) errors.push('Estimated hours must be between 0 and 100.');
        const workers = text(r.required_workers) ? Number(r.required_workers) : 1, level = text(r.required_level) ? Number(r.required_level) : 1;
        if (!Number.isInteger(workers) || workers < 1 || workers > 100) errors.push('Workers needed must be 1 to 100.');
        if (!Number.isInteger(level) || level < 1 || level > 7) errors.push('Level must be 1 to 7.');
        const skills = text(r.required_skills).split(/[,;|]/).map((x) => x.trim()).filter(Boolean).slice(0, 30);
        return { errors, value: { title, address: text(r.address) || null, start_at: start, estimated_hours: hours, required_workers: workers, required_level: level, required_skills: skills }, key: `${title.toLowerCase()}|${(start || '').slice(0, 10)}` };
      },
      existing: (org) => new Set(db.prepare(`SELECT lower(title) t,substr(start_at,1,10) d FROM work_orders WHERE organisation_id=?`).all(org).map((w) => `${w.t}|${w.d}`)),
      create: (org, v) => {
        const id = crypto.randomUUID(), now = isoNow();
        db.prepare(`INSERT INTO work_orders (id,organisation_id,title,address,start_at,estimated_hours,required_workers,required_level,required_skills,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)`).run(id, org, v.title, v.address, v.start_at, v.estimated_hours, v.required_workers, v.required_level, JSON.stringify(v.required_skills), now, now);
        return id;
      }
    },
    finance_entries: {
      label: 'Finance entries', roles: financeRoles,
      fields: ['entry_type', 'category', 'description', 'amount', 'tax', 'occurred_on'],
      normalise(r) {
        const errors = [], rawType = text(r.entry_type).toLowerCase();
        const type = /^(rev|income|sale|credit|in)/.test(rawType) ? 'revenue' : /^(exp|cost|bill|debit|out|purchase)/.test(rawType) ? 'expense' : null;
        if (!type) errors.push('Type must be revenue or expense.');
        const amount = money(r.amount), tax = text(r.tax) ? money(r.tax) : 0, date = auDate(r.occurred_on);
        if (amount === null) errors.push('Amount is not a valid number.');
        if (tax === null) errors.push('Tax is not a valid number.');
        if (!date) errors.push('Date is missing or not a date.');
        const category = text(r.category);
        if (!category) errors.push('Category is required.');
        const amountCents = amount === null ? 0 : Math.round(amount * 100);
        return { errors, value: { entry_type: type, category: category.slice(0, 120), description: text(r.description).slice(0, 1000) || null, amount_cents: amountCents, tax_cents: Math.round((tax || 0) * 100), occurred_on: (date || '').slice(0, 10) }, key: `${type}|${category.toLowerCase()}|${amountCents}|${(date || '').slice(0, 10)}|${text(r.description).toLowerCase()}` };
      },
      existing: (org) => new Set(db.prepare(`SELECT entry_type,lower(category) c,amount_cents a,occurred_on d,lower(COALESCE(description,'')) x FROM organisation_finance_entries WHERE organisation_id=?`).all(org).map((f) => `${f.entry_type}|${f.c}|${f.a}|${f.d}|${f.x}`)),
      create: (org, v, userId) => {
        const id = crypto.randomUUID(), now = isoNow();
        db.prepare(`INSERT INTO organisation_finance_entries (id,organisation_id,entry_type,category,description,amount_cents,tax_cents,occurred_on,source,created_by,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,'import',?,?,?)`).run(id, org, v.entry_type, v.category, v.description, v.amount_cents, v.tax_cents, v.occurred_on, userId, now, now);
        return id;
      }
    }
  };
  const migrationSchema = z.object({
    entity: z.enum(['workers', 'work_orders', 'finance_entries']),
    mapping: z.record(z.string().max(60), z.string().max(200)),
    rows: z.array(z.record(z.string().max(200), z.union([z.string().max(5000), z.number(), z.boolean(), z.null()]))).min(1).max(MAX_IMPORT_ROWS),
    duplicate_policy: z.enum(['skip', 'update']).default('skip'),
    confirm: z.boolean().optional()
  });
  function analyse(entity, org, rows, mapping) {
    const def = ENTITIES[entity], seen = new Set(), existing = def.existing(org);
    const out = rows.map((raw, i) => {
      const mapped = {};
      for (const field of def.fields) { const src = mapping[field]; mapped[field] = src ? raw[src] : undefined; }
      const n = def.normalise(mapped);
      let status = 'new';
      if (n.errors.length) status = 'invalid';
      else if (existing.has(n.key) || (entity === 'workers' && [n.value.email, phoneKey(n.value.phone), n.value.full_name.toLowerCase()].some((k) => k && existing.has(k)))) status = 'duplicate_existing';
      else if (seen.has(n.key)) status = 'duplicate_in_file';
      if (!n.errors.length) seen.add(n.key);
      return { row: i + 1, status, errors: n.errors, value: n.value };
    });
    const count = (s) => out.filter((r) => r.status === s).length;
    return { rows: out, counts: { total: out.length, will_create: count('new'), duplicate_existing: count('duplicate_existing'), duplicate_in_file: count('duplicate_in_file'), invalid: count('invalid') } };
  }
  function migrationGuard(req, res) {
    const parsed = migrationSchema.safeParse(req.body);
    if (!parsed.success) { fail(res, 400, `Send up to ${MAX_IMPORT_ROWS} rows with a column mapping.`); return null; }
    const role = String(req.saas.role || '').toLowerCase();
    if (!ENTITIES[parsed.data.entity].roles.map((r) => r.toLowerCase()).includes(role)) { fail(res, 403, 'Your role cannot import this kind of data.'); return null; }
    return parsed.data;
  }
  app.get('/api/saas/migration/schema', requireSaasUser, requireSaasRole(...ADMINS, 'manager', 'director'), (req, res) => {
    const role = String(req.saas.role || '').toLowerCase();
    ok(res, { max_rows: MAX_IMPORT_ROWS, entities: Object.entries(ENTITIES).filter(([, d]) => d.roles.map((r) => r.toLowerCase()).includes(role)).map(([key, d]) => ({ key, label: d.label, fields: d.fields })) });
  });
  app.post('/api/saas/migration/preview', commsLimiter, requireSaasUser, (req, res) => {
    const d = migrationGuard(req, res); if (!d) return;
    const result = analyse(d.entity, req.saas.organisation_id, d.rows, d.mapping);
    ok(res, { entity: d.entity, counts: result.counts, preview: result.rows.slice(0, 200), truncated: result.rows.length > 200, dry_run: true });
  });
  app.post('/api/saas/migration/commit', commsLimiter, requireSaasUser, (req, res) => {
    const d = migrationGuard(req, res); if (!d) return;
    if (d.confirm !== true) return fail(res, 400, 'Confirm the import after reviewing the preview.');
    const org = req.saas.organisation_id, def = ENTITIES[d.entity];
    const result = analyse(d.entity, org, d.rows, d.mapping);
    const done = { created: 0, updated: 0, skipped: 0, invalid: result.counts.invalid };
    db.transaction(() => {
      for (const r of result.rows) {
        if (r.status === 'invalid') continue;
        if (r.status === 'new') { def.create(org, r.value, req.saas.user_id); done.created++; }
        else if (d.duplicate_policy === 'update' && r.status === 'duplicate_existing' && def.update?.(org, r.value)) done.updated++;
        else done.skipped++;
      }
      saasAudit(req, 'migration.committed', d.entity, null, { ...done, rows: d.rows.length, duplicate_policy: d.duplicate_policy });
    })();
    ok(res, { entity: d.entity, ...done, note: d.entity === 'workers' ? 'Imported workers start as "requires review": record a VEVO result and complete their documents before scheduling.' : undefined }, 201);
  });

  // ===== AI drafting behind the approvals gate =====
  app.post('/api/saas/comms/threads/:id/draft', commsLimiter, requireSaasUser, requireSaasRole(...SENIOR), async (req, res) => {
    const org = req.saas.organisation_id;
    const thread = db.prepare(`SELECT * FROM comms_threads WHERE id=? AND organisation_id=?`).get(req.params.id, org);
    if (!thread) return fail(res, 404, 'Thread not found.');
    if (!aiProviderStatus().configured) return fail(res, 503, 'AI is not configured yet. Add a Gemini key or another AI provider.');
    const history = db.prepare(`SELECT direction,body,summary,kind FROM comms_messages WHERE thread_id=? AND organisation_id=? AND status NOT IN ('rejected','draft') ORDER BY occurred_at DESC LIMIT 10`).all(thread.id, org).reverse();
    const profile = db.prepare(`SELECT o.name,p.brand_voice,p.business_type FROM organisations o LEFT JOIN onboarding_profiles p ON p.organisation_id=o.id WHERE o.id=?`).get(org) || {};
    const instruction = z.string().trim().max(500).optional().safeParse(req.body?.instruction);
    let text;
    try {
      const result = await generateAiText({
        remember_conversation: false, thinking_level: 'minimal', max_output_tokens: 600, ensure_complete: true,
        system: `You draft a ${thread.channel} reply for ${profile.name || 'an Australian service business'} (${profile.business_type || 'service business'}). Use Australian English and this brand voice: ${profile.brand_voice || 'friendly, clear, professional'}. A human will review before anything is sent. Never promise prices, dates, availability or guarantees you were not given. Never include personal data beyond what the customer wrote. Reply with the message text only.`,
        messages: [...history.map((m) => ({ role: m.direction === 'inbound' ? 'user' : 'assistant', content: m.summary || m.body })), { role: 'user', content: instruction.success && instruction.data ? `Staff instruction for the reply: ${instruction.data}` : 'Write the reply.' }]
      });
      text = String(result.text || '').trim().slice(0, 4000);
    } catch (error) { return fail(res, 502, 'The AI provider could not produce a draft. Try again shortly.'); }
    if (!text) return fail(res, 502, 'The AI provider returned an empty draft.');
    const now = isoNow(), id = crypto.randomUUID();
    const result = db.transaction(() => {
      db.prepare(`INSERT INTO comms_messages (id,organisation_id,thread_id,direction,kind,body,provider,status,ai_generated,created_by_user_id,occurred_at,created_at) VALUES (?,?,?,'outbound','message',?,?,'pending_approval',1,?,?,?)`)
        .run(id, org, thread.id, text, thread.channel, req.saas.user_id, now, now);
      const approval = createWorkspaceApproval(req, { approval_type: 'outbound_message', source_module: 'comms', title: `Send ${thread.channel} reply to ${thread.contact_name || thread.contact_address}`, summary: text.slice(0, 280), entity_type: 'comms_message', entity_id: id, risk_level: 'high', draft_payload: { message_id: id, thread_id: thread.id, channel: thread.channel, to: thread.contact_address, body: text }, required_role: 'senior' });
      db.prepare(`UPDATE comms_messages SET approval_id=? WHERE id=? AND organisation_id=?`).run(approval.id, id, org);
      saasAudit(req, 'comms.ai_draft_staged', 'comms_message', id, { channel: thread.channel, approval_id: approval.id });
      return approval;
    })();
    ok(res, { message_id: id, approval_id: result.id, reference_code: result.reference_code, status: 'pending_approval', executed: false, draft: text }, 201);
  });

  // Generic intent gate: high-consequence AI intents are staged for sign-off and never executed here.
  app.post('/api/saas/ai/intents', commsLimiter, requireSaasUser, (req, res) => {
    const body = z.object({ intent: z.string().trim().min(2).max(60), title: z.string().trim().min(2).max(200), summary: z.string().trim().max(2000).optional(), entity_type: z.string().max(60).optional(), entity_id: z.string().max(80).optional(), payload: z.record(z.string(), z.any()).optional() }).safeParse(req.body);
    if (!body.success) return fail(res, 400, 'Describe the intent and a title.');
    const d = body.data;
    if (LOW_CONSEQUENCE_INTENTS.has(d.intent)) return ok(res, { staged: false, executed: false, note: 'Low-consequence intent: no approval needed.' });
    // Unknown intents are treated as high consequence: fail closed.
    const approval = db.transaction(() => {
      const a = createWorkspaceApproval(req, { approval_type: 'ai_intent', source_module: 'ai', title: d.title, summary: d.summary || '', entity_type: d.entity_type || null, entity_id: d.entity_id || null, risk_level: 'high', draft_payload: { intent: d.intent, ...(d.payload || {}) }, required_role: 'senior' });
      saasAudit(req, 'ai.intent_staged', 'workspace_approval', a.id, { intent: d.intent, known: HIGH_CONSEQUENCE_INTENTS.has(d.intent) });
      return a;
    })();
    ok(res, { staged: true, executed: false, approval_id: approval.id, reference_code: approval.reference_code }, 202);
  });

  // Dispatch happens only after a human approved, and only once.
  app.post('/api/saas/comms/messages/:id/send', commsLimiter, requireSaasUser, requireSaasRole(...SENIOR), async (req, res) => {
    const org = req.saas.organisation_id;
    const msg = db.prepare(`SELECT m.*,t.contact_address,t.channel,t.subject FROM comms_messages m JOIN comms_threads t ON t.id=m.thread_id WHERE m.id=? AND m.organisation_id=? AND m.direction='outbound'`).get(req.params.id, org);
    if (!msg) return fail(res, 404, 'Message not found.');
    const approval = msg.approval_id ? db.prepare(`SELECT status FROM workspace_approvals WHERE id=? AND organisation_id=?`).get(msg.approval_id, org) : null;
    if (!approval || approval.status !== 'approved' || msg.status !== 'approved') return fail(res, 409, 'This message has not been approved by an authorised person.');
    const claimed = db.prepare(`UPDATE comms_messages SET status='sending' WHERE id=? AND organisation_id=? AND status='approved'`).run(msg.id, org).changes;
    if (!claimed) return fail(res, 409, 'This message is already being sent.');
    let externalId = null;
    try {
      externalId = await dispatch(msg);
    } catch (error) {
      db.prepare(`UPDATE comms_messages SET status='approved' WHERE id=? AND organisation_id=?`).run(msg.id, org);
      return fail(res, error.code === 'NOT_CONFIGURED' ? 409 : 502, error.code === 'NOT_CONFIGURED' ? error.message : 'The provider rejected the message. It stays approved so you can retry.');
    }
    db.transaction(() => {
      db.prepare(`UPDATE comms_messages SET status='sent',external_message_id=COALESCE(?,external_message_id) WHERE id=? AND organisation_id=?`).run(externalId, msg.id, org);
      saasAudit(req, 'comms.message_sent', 'comms_message', msg.id, { channel: msg.channel });
    })();
    ok(res, { status: 'sent' });
  });

  async function dispatch(msg) {
    const notConfigured = (what) => Object.assign(new Error(`${what} is not configured, so the approved message could not be sent.`), { code: 'NOT_CONFIGURED' });
    const set = (v) => Boolean(String(v || '').trim());
    if (msg.channel === 'sms') {
      const from = env.TELNYX_FROM_NUMBER || env.TELNYX_PHONE_NUMBER;
      if (!set(env.TELNYX_API_KEY) || !set(from)) throw notConfigured('SMS');
      const r = await fetch('https://api.telnyx.com/v2/messages', { method: 'POST', headers: { authorization: `Bearer ${env.TELNYX_API_KEY}`, 'content-type': 'application/json' }, body: JSON.stringify({ from, to: msg.contact_address, text: msg.body }) });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error('sms failed');
      return data?.data?.id || null;
    }
    if (msg.channel === 'whatsapp') {
      if (!set(env.WHATSAPP_ACCESS_TOKEN) || !set(env.WHATSAPP_PHONE_NUMBER_ID)) throw notConfigured('WhatsApp');
      const r = await fetch(`https://graph.facebook.com/${env.META_GRAPH_VERSION || 'v23.0'}/${env.WHATSAPP_PHONE_NUMBER_ID}/messages`, { method: 'POST', headers: { authorization: `Bearer ${env.WHATSAPP_ACCESS_TOKEN}`, 'content-type': 'application/json' }, body: JSON.stringify({ messaging_product: 'whatsapp', to: msg.contact_address.replace(/\D/g, ''), type: 'text', text: { body: msg.body } }) });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error('whatsapp failed');
      return data?.messages?.[0]?.id || null;
    }
    if (msg.channel === 'email') {
      if (!set(env.RESEND_API_KEY) || !set(env.SAAS_VERIFY_FROM)) throw notConfigured('Email');
      const r = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, 'content-type': 'application/json' }, body: JSON.stringify({ from: env.SAAS_VERIFY_FROM, to: [msg.contact_address], subject: msg.subject ? `Re: ${msg.subject}` : 'Reply from us', text: msg.body }) });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error('email failed');
      return data?.id || null;
    }
    throw notConfigured('Voice replies are not sent as messages; the channel');
  }
}

// Called inside the approval decision transaction so message state can never drift from the approval.
export function applyApprovalToComms(db, approvalRow, status, editedPayloadJson) {
  if (approvalRow.entity_type !== 'comms_message') return;
  let body = null;
  if (status === 'approved' && editedPayloadJson) { try { body = String(JSON.parse(editedPayloadJson).body || '').slice(0, 4000) || null; } catch { body = null; } }
  db.prepare(`UPDATE comms_messages SET status=?,body=COALESCE(?,body) WHERE id=? AND organisation_id=? AND status='pending_approval'`)
    .run(status === 'approved' ? 'approved' : 'rejected', body, approvalRow.entity_id, approvalRow.organisation_id);
}
