import {renderEmail,tenantBrandFor} from './email-templates.js';
import {communicationInbound,trackCommunication} from './message-delivery.js';
// Step 4 platform layer: unified response envelope, data portability, statutory erasure,
// VEVO result records, tenant-scoped omnichannel inbox, AI drafting and the approvals gate.
// Registered once from server.js via installSaasPlatform(app, deps).
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import rateLimit from 'express-rate-limit';
import { industryByCode, industryTerms } from './industry-registry.js';

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
export const SOCIAL_CHANNELS = ['facebook', 'instagram', 'tiktok', 'x', 'snapchat', 'website'];
export const ALL_CHANNELS = ['voice', 'email', 'sms', 'whatsapp', ...SOCIAL_CHANNELS];
const normaliseAddress = (channel, value) => {
  const v = String(value || '').trim();
  if (channel === 'email') return v.toLowerCase();
  if (SOCIAL_CHANNELS.includes(channel)) return v.replace(/^@/, '').toLowerCase();
  return v.replace(/[^\d+]/g, '');
};

// ---------------------------------------------------------------------------------------------
// Inbox core (shared by the API, the provider webhooks and the Telnyx hook)
// ---------------------------------------------------------------------------------------------
export function recordInbound(db, { organisation_id, channel, contact_address, contact_name = null, subject = null, body = '', summary = null, kind = 'message', provider, external_message_id = null, duration_seconds = null, occurred_at = null }) {
  const now = isoNow();
  const address = normaliseAddress(channel, contact_address);
  if (!address) throw new Error('Missing contact address.');
  const result = db.transaction(() => {
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
    communicationInbound({organisation_id,channel,contact_address,contact_name,id});
    return { id, thread_id: thread.id, duplicate: false };
  })();
  // Phase 07: conversation analysis and automation triggers run after the message is safely stored.
  if (!result.duplicate) for (const hook of inboundHooks) { try { hook({ ...result, organisation_id, channel, contact_address: address, contact_name, subject, body, kind }); } catch (e) { console.warn('[comms] inbound hook failed:', e.message); } }
  return result;
}
export const inboundHooks = new Set();

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
  const { db, env, requireSaasUser, requireSaasRole, requireAdmin, saasAudit, createWorkspaceApproval, generateAiText, aiProviderStatus, recomputeWorkerEligibility, createWorkerWithCompliance, workforceSeniorRoles, financeRoles, uploadRoot, canAccess } = deps;
  const ok = (res, data = {}, status = 200) => res.status(status).json({ ok: true, ...data });
  const fail = (res, status, error) => res.status(status).json({ ok: false, error });
  const exportLimiter = rateLimit({ windowMs: 60 * 60 * 1000, limit: 10, keyGenerator: (req) => `export:${req.saas?.user_id || 'anon'}`, standardHeaders: true, legacyHeaders: false, message: { ok: false, error: 'Export limit reached. Try again later.' } });
  const commsLimiter = rateLimit({ windowMs: 60 * 1000, limit: 60, standardHeaders: true, legacyHeaders: false, message: { ok: false, error: 'Too many requests.' } });
  const hookLimiter = rateLimit({ windowMs: 60 * 1000, limit: 300, standardHeaders: true, legacyHeaders: false, message: { ok: false, error: 'Too many requests.' } });

  // ===== Data portability (owner only) =====
  const EXPORTS = {
    portal_mail:o=>db.prepare('SELECT id,direction,recipient,subject,body,category,status,revision,scheduled_at,created_at,updated_at FROM portal_mail WHERE scope=\'business\' AND owner_id=?').all(o),
    mail_activity:o=>db.prepare('SELECT mail_id,actor,action,revision,created_at FROM portal_mail_events WHERE scope=\'business\' AND owner_id=? ORDER BY id').all(o),
    business_documents:o=>db.prepare('SELECT * FROM tenant_documents WHERE organisation_id=?').all(o),
    service_requests:o=>db.prepare('SELECT * FROM tenant_service_requests WHERE organisation_id=?').all(o),

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
    const channel = z.enum(ALL_CHANNELS).safeParse(req.params.channel);
    const body = z.object({ address: z.string().trim().min(3).max(200) }).safeParse(req.body);
    if (!channel.success || !body.success) return fail(res, 400, 'Choose a channel and an address.');
    const address = normaliseAddress(channel.data, body.data.address);
    const social = SOCIAL_CHANNELS.includes(channel.data);
    const valid = channel.data === 'email' ? /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address) : social ? /^[\w.\-:]{2,120}$/.test(address) : /^\+\d{8,15}$/.test(address);
    if (!valid) return fail(res, 400, channel.data === 'email' ? 'Enter a valid email address.' : social ? 'Enter the account handle or page ID (letters, numbers, dots, dashes).' : 'Enter the number in international format, for example +61400000000.');
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

  // ===== Customers: one record per person or business, past, current or future =====
  const customerBody = z.object({
    name: z.string().trim().min(1).max(200), email: z.string().trim().toLowerCase().email().max(320).optional().or(z.literal('')),
    phone: z.string().trim().max(40).optional(), address: z.string().trim().max(500).optional(), notes: z.string().trim().max(4000).optional(),
    status: z.enum(['lead', 'current', 'past']).default('current')
  });
  const blank = (v) => (v === '' || v === undefined ? null : v);
  app.get('/api/saas/customers', requireSaasUser, requireSaasRole(...SENIOR), (req, res) => {
    const org = req.saas.organisation_id, q = String(req.query.q || '').trim().toLowerCase().slice(0, 100), status = String(req.query.status || '');
    const rows = db.prepare(`SELECT c.*,(SELECT COUNT(*) FROM work_orders w WHERE w.customer_id=c.id AND w.organisation_id=c.organisation_id) job_count,(SELECT MAX(w.start_at) FROM work_orders w WHERE w.customer_id=c.id AND w.organisation_id=c.organisation_id) last_job_at FROM tenant_customers c WHERE c.organisation_id=? ORDER BY c.name COLLATE NOCASE LIMIT 1000`).all(org)
      .filter((c) => (!status || c.status === status) && (!q || [c.name, c.email, c.phone, c.address].some((v) => String(v || '').toLowerCase().includes(q))));
    ok(res, { customers: rows });
  });
  app.post('/api/saas/customers', commsLimiter, requireSaasUser, requireSaasRole(...SENIOR), (req, res) => {
    const p = customerBody.safeParse(req.body);
    if (!p.success) return fail(res, 400, 'Add at least the customer name. Check the email address if you entered one.');
    const org = req.saas.organisation_id, d = p.data, now = isoNow(), id = crypto.randomUUID();
    if (d.email && db.prepare(`SELECT 1 FROM tenant_customers WHERE organisation_id=? AND lower(email)=?`).get(org, d.email)) return fail(res, 409, 'A customer with that email already exists.');
    db.prepare(`INSERT INTO tenant_customers (id,organisation_id,name,email,phone,address,notes,status,created_by_user_id,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)`).run(id, org, d.name, blank(d.email), blank(d.phone), blank(d.address), blank(d.notes), d.status, req.saas.user_id, now, now);
    saasAudit(req, 'customer.created', 'customer', id, { status: d.status });
    ok(res, { id }, 201);
  });
  app.get('/api/saas/customers/:id', requireSaasUser, requireSaasRole(...SENIOR), (req, res) => {
    const org = req.saas.organisation_id;
    const c = db.prepare(`SELECT * FROM tenant_customers WHERE id=? AND organisation_id=?`).get(req.params.id, org);
    if (!c) return fail(res, 404, 'Customer not found.');
    const jobs = db.prepare(`SELECT w.id,w.title,w.address,w.start_at,w.status,
        (SELECT COUNT(*) FROM job_photos p WHERE p.work_order_id=w.id AND p.stage='before') before_count,(SELECT COUNT(*) FROM job_photos p WHERE p.work_order_id=w.id AND p.stage='after') after_count,
        (SELECT reason_code FROM job_media_reasons r WHERE r.work_order_id=w.id AND r.stage='before') before_reason,(SELECT reason_code FROM job_media_reasons r WHERE r.work_order_id=w.id AND r.stage='after') after_reason
      FROM work_orders w WHERE w.customer_id=? AND w.organisation_id=? ORDER BY w.start_at DESC LIMIT 200`).all(c.id, org);
    const threads = db.prepare(`SELECT id,channel,status,last_message_at FROM comms_threads WHERE organisation_id=? AND ((?<>'' AND lower(contact_address)=lower(?)) OR (?<>'' AND contact_address=?)) ORDER BY last_message_at DESC LIMIT 20`).all(org, c.email || '', c.email || '', c.phone || '', c.phone || '');
    ok(res, { customer: c, jobs, conversations: threads });
  });
  app.patch('/api/saas/customers/:id', commsLimiter, requireSaasUser, requireSaasRole(...SENIOR), (req, res) => {
    const org = req.saas.organisation_id, c = db.prepare(`SELECT * FROM tenant_customers WHERE id=? AND organisation_id=?`).get(req.params.id, org);
    if (!c) return fail(res, 404, 'Customer not found.');
    const p = customerBody.partial().safeParse(req.body);
    if (!p.success) return fail(res, 400, 'Check the customer details.');
    const d = { ...c, ...Object.fromEntries(Object.entries(p.data).map(([k, v]) => [k, blank(v)])) };
    if (!d.name) return fail(res, 400, 'A customer needs a name.');
    if (d.email && d.email !== c.email && db.prepare(`SELECT 1 FROM tenant_customers WHERE organisation_id=? AND lower(email)=? AND id<>?`).get(org, d.email, c.id)) return fail(res, 409, 'A customer with that email already exists.');
    db.prepare(`UPDATE tenant_customers SET name=?,email=?,phone=?,address=?,notes=?,status=?,updated_at=? WHERE id=? AND organisation_id=?`).run(d.name, d.email, d.phone, d.address, d.notes, d.status, isoNow(), c.id, org);
    saasAudit(req, 'customer.updated', 'customer', c.id, { fields: Object.keys(p.data) });
    ok(res, { updated: true });
  });
  // Link a job to a customer (or clear the link).
  app.put('/api/saas/work-orders/:id/customer', requireSaasUser, requireSaasRole(...SENIOR), (req, res) => {
    const org = req.saas.organisation_id, p = z.object({ customer_id: z.string().uuid().nullable() }).safeParse(req.body);
    if (!p.success) return fail(res, 400, 'Choose a customer.');
    if (!db.prepare(`SELECT 1 FROM work_orders WHERE id=? AND organisation_id=?`).get(req.params.id, org)) return fail(res, 404, 'Job not found.');
    if (p.data.customer_id && !db.prepare(`SELECT 1 FROM tenant_customers WHERE id=? AND organisation_id=?`).get(p.data.customer_id, org)) return fail(res, 400, 'That customer does not belong to this workspace.');
    db.prepare(`UPDATE work_orders SET customer_id=?,updated_at=? WHERE id=? AND organisation_id=?`).run(p.data.customer_id, isoNow(), req.params.id, org);
    saasAudit(req, 'work_order.customer_linked', 'work_order', req.params.id, { customer_id: p.data.customer_id });
    ok(res, { linked: true });
  });
  // Turn an inbox conversation into a customer record (no retyping).
  app.post('/api/saas/comms/threads/:id/customer', commsLimiter, requireSaasUser, requireSaasRole(...SENIOR), (req, res) => {
    const org = req.saas.organisation_id, t = db.prepare(`SELECT * FROM comms_threads WHERE id=? AND organisation_id=?`).get(req.params.id, org);
    if (!t) return fail(res, 404, 'Conversation not found.');
    const isEmail = t.channel === 'email', isPhone = ['sms', 'whatsapp', 'voice'].includes(t.channel);
    const existing = db.prepare(`SELECT id FROM tenant_customers WHERE organisation_id=? AND ((?<>'' AND lower(email)=lower(?)) OR (?<>'' AND phone=?))`).get(org, isEmail ? t.contact_address : '', isEmail ? t.contact_address : '', isPhone ? t.contact_address : '', isPhone ? t.contact_address : '');
    if (existing) return ok(res, { id: existing.id, existing: true });
    const id = crypto.randomUUID(), now = isoNow();
    db.prepare(`INSERT INTO tenant_customers (id,organisation_id,name,email,phone,notes,status,source,created_by_user_id,created_at,updated_at) VALUES (?,?,?,?,?,?,'lead',?,?,?,?)`)
      .run(id, org, t.contact_name || t.contact_address, isEmail ? t.contact_address : null, isPhone ? t.contact_address : null, isEmail || isPhone ? null : `${t.channel}: ${t.contact_address}`, t.channel, req.saas.user_id, now, now);
    saasAudit(req, 'customer.created_from_inbox', 'customer', id, { channel: t.channel });
    ok(res, { id, existing: false }, 201);
  });

  // ===== Finance automation =====
  // The owner records what a job is worth, what was paid, materials and labour. The ledger rows (source='auto') are rebuilt from those
  // facts, so the profit figures can never drift from the job. This is bookkeeping assistance, not tax advice.
  const toCents = (v) => Math.round(Number(v || 0) * 100);
  function syncJobFinance(org, jobId, userId) {
    const j = db.prepare(`SELECT * FROM work_orders WHERE id=? AND organisation_id=?`).get(jobId, org);
    if (!j) return;
    const now = isoNow(), on = (j.paid_at || j.completed_at || j.start_at || now).slice(0, 10);
    const gst = (c) => (j.gst_applies ? Math.round(c / 11) : 0);
    db.transaction(() => {
      db.prepare(`DELETE FROM organisation_finance_entries WHERE organisation_id=? AND work_order_id=? AND source='auto'`).run(org, jobId);
      const ins = (type, category, desc, amount, tax) => amount > 0 && db.prepare(`INSERT INTO organisation_finance_entries (id,organisation_id,work_order_id,entry_type,category,description,amount_cents,tax_cents,occurred_on,source,created_by,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,'auto',?,?,?)`)
        .run(crypto.randomUUID(), org, jobId, type, category, desc, amount, tax, on, userId, now, now);
      ins('revenue', 'Job payment received', j.title, j.paid_cents, gst(j.paid_cents));
      if (j.completed_at || j.paid_cents > 0) {
        const mat = j.materials_cents + stockCostFor(org, jobId);
        ins('expense', 'Materials', j.title, mat, gst(mat));
        ins('expense', 'Labour', `${j.labour_hours} h on ${j.title}`, Math.round(j.labour_hours * j.labour_rate_cents), 0);
      }
    })();
  }
  // Materials taken from stock for a job are costed at the price paid when they were used.
  function stockCostFor(org, jobId) {
    return Math.round(Number(db.prepare(`SELECT COALESCE(SUM(-qty*unit_cost_cents),0) c FROM stock_moves WHERE organisation_id=? AND work_order_id=? AND kind='use'`).get(org, jobId)?.c || 0));
  }
  const jobMoney = (j) => {
    const stockCents = stockCostFor(j.organisation_id, j.id), materials = j.materials_cents + stockCents;
    const labour = Math.round(j.labour_hours * j.labour_rate_cents);
    const stage = j.paid_cents > 0 && j.paid_cents >= j.price_cents + j.late_fee_cents && j.price_cents > 0 ? 'paid' : j.paid_cents > 0 ? 'part_paid' : j.completed_at ? 'completed' : j.price_cents > 0 ? 'confirmed' : 'quoted';
    const counted = j.completed_at || j.paid_cents > 0;
    return { id: j.id, title: j.title, start_at: j.start_at, status: j.status, price_cents: j.price_cents, paid_cents: j.paid_cents, completed_at: j.completed_at, paid_at: j.paid_at, materials_cents: j.materials_cents, stock_materials_cents: stockCents, labour_hours: j.labour_hours, labour_rate_cents: j.labour_rate_cents, labour_cents: labour, gst_applies: !!j.gst_applies, stage,
      profit_cents: j.paid_cents - (counted ? materials + labour : 0), owing_cents: Math.max(0, j.price_cents + j.late_fee_cents - j.paid_cents), late_fee_cents: j.late_fee_cents, due_at: j.due_at, invoice_issued_at: j.invoice_issued_at };
  };
  app.get('/api/saas/finance/jobs', requireSaasUser, requireSaasRole(...ADMINS), (req, res) => {
    const rows = db.prepare(`SELECT * FROM work_orders WHERE organisation_id=? ORDER BY start_at DESC LIMIT 300`).all(req.saas.organisation_id);
    ok(res, { jobs: rows.map(jobMoney) });
  });
  app.put('/api/saas/finance/jobs/:id', requireSaasUser, requireSaasRole(...ADMINS), (req, res) => {
    const org = req.saas.organisation_id;
    const j = db.prepare(`SELECT * FROM work_orders WHERE id=? AND organisation_id=?`).get(req.params.id, org);
    if (!j) return fail(res, 404, 'Job not found.');
    const money = z.coerce.number().min(0).max(100000000);
    const p = z.object({ price: money.optional(), paid: money.optional(), materials: money.optional(), labour_hours: z.coerce.number().min(0).max(100000).optional(), labour_rate: money.optional(), completed: z.boolean().optional(), gst_applies: z.boolean().optional() }).safeParse(req.body);
    if (!p.success) return fail(res, 400, 'Check the amounts. They must be numbers of zero or more.');
    const d = p.data, now = isoNow();
    const paid = d.paid === undefined ? j.paid_cents : toCents(d.paid);
    db.prepare(`UPDATE work_orders SET price_cents=?,paid_cents=?,paid_at=?,materials_cents=?,labour_hours=?,labour_rate_cents=?,completed_at=?,gst_applies=?,updated_at=? WHERE id=? AND organisation_id=?`).run(
      d.price === undefined ? j.price_cents : toCents(d.price), paid, paid > 0 ? (j.paid_cents > 0 && j.paid_at ? j.paid_at : now) : null,
      d.materials === undefined ? j.materials_cents : toCents(d.materials), d.labour_hours ?? j.labour_hours, d.labour_rate === undefined ? j.labour_rate_cents : toCents(d.labour_rate),
      d.completed === undefined ? j.completed_at : d.completed ? (j.completed_at || now) : null, d.gst_applies === undefined ? j.gst_applies : d.gst_applies ? 1 : 0, now, j.id, org);
    syncJobFinance(org, j.id, req.saas.user_id);
    saasAudit(req, 'finance.job_money_updated', 'work_order', j.id, { fields: Object.keys(d) });
    ok(res, { job: jobMoney(db.prepare(`SELECT * FROM work_orders WHERE id=?`).get(j.id)) });
  });
  app.get('/api/saas/finance/overheads', requireSaasUser, requireSaasRole(...ADMINS), (req, res) => {
    ok(res, { overheads: db.prepare(`SELECT id,name,amount_cents,period FROM finance_overheads WHERE organisation_id=? AND active=1 ORDER BY name`).all(req.saas.organisation_id) });
  });
  app.post('/api/saas/finance/overheads', requireSaasUser, requireSaasRole(...ADMINS), (req, res) => {
    const p = z.object({ name: z.string().trim().min(1).max(120), amount: z.coerce.number().min(0).max(100000000), period: z.enum(['weekly', 'monthly', 'yearly']) }).safeParse(req.body);
    if (!p.success) return fail(res, 400, 'Add a name, an amount and how often it is paid.');
    const id = crypto.randomUUID();
    db.prepare(`INSERT INTO finance_overheads (id,organisation_id,name,amount_cents,period,created_at) VALUES (?,?,?,?,?,?)`).run(id, req.saas.organisation_id, p.data.name, toCents(p.data.amount), p.data.period, isoNow());
    saasAudit(req, 'finance.overhead_added', 'finance_overhead', id, { period: p.data.period });
    ok(res, { id }, 201);
  });
  app.delete('/api/saas/finance/overheads/:id', requireSaasUser, requireSaasRole(...ADMINS), (req, res) => {
    const r = db.prepare(`UPDATE finance_overheads SET active=0 WHERE id=? AND organisation_id=? AND active=1`).run(req.params.id, req.saas.organisation_id);
    if (!r.changes) return fail(res, 404, 'Overhead not found.');
    saasAudit(req, 'finance.overhead_removed', 'finance_overhead', req.params.id, {});
    ok(res, { removed: true });
  });
  app.get('/api/saas/finance/overview', requireSaasUser, requireSaasRole(...ADMINS), (req, res) => {
    const org = req.saas.organisation_id;
    const month = /^\d{4}-\d{2}$/.test(String(req.query.month || '')) ? String(req.query.month) : isoNow().slice(0, 7);
    const sumFor = (m, where) => db.prepare(`SELECT COALESCE(SUM(amount_cents),0) a,COALESCE(SUM(tax_cents),0) t FROM organisation_finance_entries WHERE organisation_id=? AND substr(occurred_on,1,7)=? AND ${where}`).get(org, m);
    const overheadMonthly = db.prepare(`SELECT amount_cents,period FROM finance_overheads WHERE organisation_id=? AND active=1`).all(org)
      .reduce((a, o) => a + (o.period === 'weekly' ? o.amount_cents * 52 / 12 : o.period === 'yearly' ? o.amount_cents / 12 : o.amount_cents), 0);
    const figures = (m) => {
      const rev = sumFor(m, `entry_type='revenue'`), mat = sumFor(m, `entry_type='expense' AND category='Materials'`), lab = sumFor(m, `entry_type='expense' AND category='Labour'`), oth = sumFor(m, `entry_type='expense' AND category NOT IN ('Materials','Labour')`);
      const oh = Math.round(overheadMonthly);
      return { month: m, revenue_cents: rev.a, materials_cents: mat.a, labour_cents: lab.a, other_cents: oth.a, overhead_cents: oh, profit_cents: rev.a - mat.a - lab.a - oth.a - oh, gst_collected_cents: rev.t, gst_paid_cents: mat.t + oth.t };
    };
    const months = Array.from({ length: 6 }, (_, i) => { const d = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5)) - 1 - (5 - i), 1)); return d.toISOString().slice(0, 7); });
    const owing = Number(db.prepare(`SELECT COALESCE(SUM(MAX(price_cents+late_fee_cents-paid_cents,0)),0) c FROM work_orders WHERE organisation_id=? AND price_cents>0`).get(org).c);
    const profile = db.prepare(`SELECT industry_code FROM onboarding_profiles WHERE organisation_id=?`).get(org);
    ok(res, { current: figures(month), history: months.map(figures), owing_cents: owing, terms: industryTerms(profile?.industry_code || 'custom'), note: 'Bookkeeping assistance only. GST figures are estimates assuming 10% GST-inclusive amounts. This is not tax advice; confirm BAS and tax with a registered tax agent.' });
  });

  // ===== Stock and supplies =====
  const stockNum = z.coerce.number().min(0).max(10000000);
  const itemBody = z.object({ name: z.string().trim().min(1).max(160), sku: z.string().trim().max(60).optional(), unit: z.string().trim().min(1).max(20).default('each'), cost: stockNum.default(0), reorder_level: stockNum.default(0), reorder_qty: stockNum.default(0), supplier: z.string().trim().max(160).optional() });
  function stockOverview(org) {
    const items = db.prepare(`SELECT i.*,COALESCE((SELECT SUM(qty) FROM stock_moves m WHERE m.item_id=i.id AND m.organisation_id=i.organisation_id),0) on_hand,
        COALESCE((SELECT SUM(-qty) FROM stock_moves m WHERE m.item_id=i.id AND m.organisation_id=i.organisation_id AND m.kind='use' AND substr(m.created_at,1,10)>=date('now','-30 day')),0) used_30d,
        (SELECT MAX(created_at) FROM stock_moves m WHERE m.item_id=i.id AND m.organisation_id=i.organisation_id AND m.kind='use') last_used_at
      FROM stock_items i WHERE i.organisation_id=? AND i.active=1 ORDER BY i.name COLLATE NOCASE`).all(org);
    return items.map((i) => {
      const perDay = i.used_30d / 30, daysLeft = perDay > 0 ? Math.floor(i.on_hand / perDay) : null;
      const idleDays = i.last_used_at ? Math.floor((Date.now() - Date.parse(i.last_used_at)) / DAY) : null;
      const status = i.on_hand <= 0 ? 'out' : i.reorder_level > 0 && i.on_hand <= i.reorder_level ? 'low' : (i.on_hand > 0 && (idleDays === null ? Date.now() - Date.parse(i.created_at) > 60 * DAY : idleDays > 60)) ? 'excess' : 'ok';
      const need = status === 'out' || status === 'low' ? Math.max(i.reorder_qty, Math.ceil(i.used_30d - i.on_hand), 1) : 0;
      return { id: i.id, name: i.name, sku: i.sku, unit: i.unit, cost_cents: i.cost_cents, reorder_level: i.reorder_level, reorder_qty: i.reorder_qty, supplier: i.supplier, on_hand: Math.round(i.on_hand * 1000) / 1000, used_30d: Math.round(i.used_30d * 1000) / 1000, days_left: daysLeft, status, suggested_order: need, value_cents: Math.round(Math.max(0, i.on_hand) * i.cost_cents) };
    });
  }
  app.get('/api/saas/stock', requireSaasUser, requireSaasRole(...SENIOR), (req, res) => {
    const items = stockOverview(req.saas.organisation_id);
    ok(res, { items, summary: { count: items.length, value_cents: items.reduce((a, i) => a + i.value_cents, 0), low: items.filter((i) => i.status === 'low').length, out: items.filter((i) => i.status === 'out').length, excess: items.filter((i) => i.status === 'excess').length },
      most_used: [...items].sort((a, b) => b.used_30d - a.used_30d).filter((i) => i.used_30d > 0).slice(0, 5), reorder: items.filter((i) => i.suggested_order > 0) });
  });
  // Field staff only need names to record what they used; no costs or quantities.
  app.get('/api/saas/stock/choices', requireSaasUser, (req, res) => {
    ok(res, { items: db.prepare(`SELECT id,name,unit FROM stock_items WHERE organisation_id=? AND active=1 ORDER BY name COLLATE NOCASE`).all(req.saas.organisation_id) });
  });
  app.post('/api/saas/stock/items', commsLimiter, requireSaasUser, requireSaasRole(...SENIOR), (req, res) => {
    const p = itemBody.safeParse(req.body);
    if (!p.success) return fail(res, 400, 'Add a name. Quantities and costs must be numbers of zero or more.');
    const org = req.saas.organisation_id, d = p.data, id = crypto.randomUUID(), now = isoNow();
    if (db.prepare(`SELECT 1 FROM stock_items WHERE organisation_id=? AND active=1 AND lower(name)=lower(?)`).get(org, d.name)) return fail(res, 409, 'You already have an item with that name.');
    db.prepare(`INSERT INTO stock_items (id,organisation_id,name,sku,unit,cost_cents,reorder_level,reorder_qty,supplier,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)`).run(id, org, d.name, blank(d.sku), d.unit, toCents(d.cost), d.reorder_level, d.reorder_qty, blank(d.supplier), now, now);
    saasAudit(req, 'stock.item_created', 'stock_item', id, {});
    ok(res, { id }, 201);
  });
  app.patch('/api/saas/stock/items/:id', commsLimiter, requireSaasUser, requireSaasRole(...SENIOR), (req, res) => {
    const org = req.saas.organisation_id, it = db.prepare(`SELECT * FROM stock_items WHERE id=? AND organisation_id=? AND active=1`).get(req.params.id, org);
    if (!it) return fail(res, 404, 'Item not found.');
    const p = itemBody.partial().safeParse(req.body);
    if (!p.success) return fail(res, 400, 'Check the item details.');
    const d = p.data;
    db.prepare(`UPDATE stock_items SET name=?,sku=?,unit=?,cost_cents=?,reorder_level=?,reorder_qty=?,supplier=?,updated_at=? WHERE id=? AND organisation_id=?`).run(d.name ?? it.name, d.sku === undefined ? it.sku : blank(d.sku), d.unit ?? it.unit, d.cost === undefined ? it.cost_cents : toCents(d.cost), d.reorder_level ?? it.reorder_level, d.reorder_qty ?? it.reorder_qty, d.supplier === undefined ? it.supplier : blank(d.supplier), isoNow(), it.id, org);
    saasAudit(req, 'stock.item_updated', 'stock_item', it.id, { fields: Object.keys(d) });
    ok(res, { updated: true });
  });
  app.delete('/api/saas/stock/items/:id', requireSaasUser, requireSaasRole(...ADMINS), (req, res) => {
    const r = db.prepare(`UPDATE stock_items SET active=0,updated_at=? WHERE id=? AND organisation_id=? AND active=1`).run(isoNow(), req.params.id, req.saas.organisation_id);
    if (!r.changes) return fail(res, 404, 'Item not found.');
    saasAudit(req, 'stock.item_archived', 'stock_item', req.params.id, {});
    ok(res, { archived: true });
  });
  // One movement. "in" adds (and may update the unit cost), "use" takes off stock for a job, "adjust" sets a counted level, "waste" takes off without a job.
  app.post('/api/saas/stock/items/:id/move', commsLimiter, requireSaasUser, (req, res) => {
    const org = req.saas.organisation_id, role = String(req.saas.role || '').toLowerCase(), senior = SENIOR.includes(role);
    const p = z.object({ kind: z.enum(['in', 'use', 'adjust', 'waste']), qty: z.coerce.number().min(0).max(10000000), unit_cost: stockNum.optional(), work_order_id: z.string().uuid().optional(), note: z.string().trim().max(300).optional() }).safeParse(req.body);
    if (!p.success) return fail(res, 400, 'Enter a quantity of zero or more.');
    const d = p.data;
    if (!senior && d.kind !== 'use') return fail(res, 403, 'You can record what you used on your own jobs.');
    const it = db.prepare(`SELECT * FROM stock_items WHERE id=? AND organisation_id=? AND active=1`).get(req.params.id, org);
    if (!it) return fail(res, 404, 'Item not found.');
    if (d.kind === 'use' && !d.work_order_id) return fail(res, 400, 'Choose the job this was used on.');
    if (d.work_order_id) {
      const job = db.prepare(`SELECT id FROM work_orders WHERE id=? AND organisation_id=?`).get(d.work_order_id, org);
      const mine = senior || db.prepare(`SELECT 1 FROM job_offers o JOIN workers w ON w.id=o.worker_id AND w.organisation_id=o.organisation_id WHERE o.work_order_id=? AND o.organisation_id=? AND o.status='accepted' AND w.user_id=?`).get(d.work_order_id, org, req.saas.user_id);
      if (!job || !mine) return fail(res, 404, 'Job not found.');
    }
    if (d.qty <= 0 && d.kind !== 'adjust') return fail(res, 400, 'Quantity must be more than zero.');
    const onHand = Number(db.prepare(`SELECT COALESCE(SUM(qty),0) q FROM stock_moves WHERE item_id=? AND organisation_id=?`).get(it.id, org).q);
    let delta = d.kind === 'in' ? d.qty : d.kind === 'adjust' ? d.qty - onHand : -d.qty;
    if (onHand + delta < -1e-9) return fail(res, 409, `Only ${Math.round(onHand * 1000) / 1000} ${it.unit} in stock.`);
    const now = isoNow(), unitCost = d.kind === 'in' && d.unit_cost !== undefined ? toCents(d.unit_cost) : it.cost_cents;
    db.transaction(() => {
      db.prepare(`INSERT INTO stock_moves (id,organisation_id,item_id,kind,qty,unit_cost_cents,work_order_id,note,created_by_user_id,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)`).run(crypto.randomUUID(), org, it.id, d.kind, delta, unitCost, d.work_order_id || null, blank(d.note), req.saas.user_id, now);
      if (d.kind === 'in' && d.unit_cost !== undefined) db.prepare(`UPDATE stock_items SET cost_cents=?,updated_at=? WHERE id=? AND organisation_id=?`).run(unitCost, now, it.id, org);
    })();
    if (d.kind === 'use') syncJobFinance(org, d.work_order_id, req.saas.user_id); // job materials cost follows what was used
    saasAudit(req, 'stock.moved', 'stock_item', it.id, { kind: d.kind, qty: delta, work_order_id: d.work_order_id || null });
    ok(res, { on_hand: Math.round((onHand + delta) * 1000) / 1000 }, 201);
  });
  app.get('/api/saas/stock/items/:id/moves', requireSaasUser, requireSaasRole(...SENIOR), (req, res) => {
    ok(res, { moves: db.prepare(`SELECT m.id,m.kind,m.qty,m.unit_cost_cents,m.note,m.created_at,w.title job_title FROM stock_moves m LEFT JOIN work_orders w ON w.id=m.work_order_id AND w.organisation_id=m.organisation_id WHERE m.item_id=? AND m.organisation_id=? ORDER BY m.created_at DESC LIMIT 100`).all(req.params.id, req.saas.organisation_id) });
  });

  // Command Centre: one read that feeds every live gadget. Senior roles only; money figures only for finance roles.
  app.get('/api/saas/command-centre', requireSaasUser, requireSaasRole(...SENIOR), (req, res) => {
    const org = req.saas.organisation_id;
    const n = (sql, ...a) => Number(db.prepare(sql).get(...a)?.c || 0);
    const day = (offset) => new Date(Date.now() + offset * DAY).toISOString().slice(0, 10);
    const profile = db.prepare(`SELECT o.name,p.business_type,p.industry_code FROM organisations o LEFT JOIN onboarding_profiles p ON p.organisation_id=o.id WHERE o.id=?`).get(org) || {};
    const code = profile.industry_code || 'custom';
    const series = (sql, from, count, dir = 1) => {
      const rows = db.prepare(sql).all(org, day(from)); const map = new Map(rows.map((r) => [r.d, Number(r.c)]));
      return Array.from({ length: count }, (_, i) => map.get(day(from + i * dir)) || 0);
    };
    const inboundDaily = series(`SELECT substr(occurred_at,1,10) d,COUNT(*) c FROM comms_messages WHERE organisation_id=? AND direction='inbound' AND substr(occurred_at,1,10)>=? GROUP BY d`, -6, 7);
    const byChannel = db.prepare(`SELECT t.channel,COUNT(*) c FROM comms_messages m JOIN comms_threads t ON t.id=m.thread_id WHERE m.organisation_id=? AND m.direction='inbound' AND substr(m.occurred_at,1,10)>=? GROUP BY t.channel ORDER BY c DESC`).all(org, day(-6));
    const data = {
      ok: true,
      business: { name: profile.name || '', type: profile.business_type || '', industry: industryByCode(code).label, code },
      terms: industryTerms(code),
      inbox: { needs_reply: n(`SELECT COUNT(*) c FROM comms_threads WHERE organisation_id=? AND status='needs_reply'`, org), week: inboundDaily.reduce((a, b) => a + b, 0), daily: inboundDaily, channels: byChannel.map((r) => ({ channel: r.channel, count: Number(r.c) })), drafts_waiting: n(`SELECT COUNT(*) c FROM comms_messages WHERE organisation_id=? AND status='pending_approval'`, org) },
      approvals: { pending: n(`SELECT COUNT(*) c FROM workspace_approvals WHERE organisation_id=? AND status='pending'`, org) },
      jobs: {
        awaiting: n(`SELECT COUNT(*) c FROM work_orders WHERE organisation_id=? AND status IN ('awaiting_allocation','offered')`, org),
        allocated: n(`SELECT COUNT(*) c FROM work_orders WHERE organisation_id=? AND status='allocated'`, org),
        today: n(`SELECT COUNT(*) c FROM work_orders WHERE organisation_id=? AND substr(start_at,1,10)=?`, org, day(0)),
        next7: series(`SELECT substr(start_at,1,10) d,COUNT(*) c FROM work_orders WHERE organisation_id=? AND substr(start_at,1,10)>=? AND substr(start_at,1,10)<=date('now','+6 day') GROUP BY d`, 0, 7)
      },
      team: {
        total: n(`SELECT COUNT(*) c FROM workers WHERE organisation_id=? AND status!='archived'`, org),
        ready: n(`SELECT COUNT(*) c FROM workers WHERE organisation_id=? AND approved_for_scheduling=1 AND status='active'`, org),
        attention: n(`SELECT COUNT(*) c FROM workers WHERE organisation_id=? AND approved_for_scheduling=0 AND status!='archived'`, org),
        expiring: n(`SELECT COUNT(*) c FROM worker_documents d JOIN workers w ON w.id=d.worker_id WHERE w.organisation_id=? AND d.expiry_date IS NOT NULL AND d.expiry_date<=date('now','+30 day')`, org)
      },
      finance: null
    };
    if (ADMINS.includes(String(req.saas.role || '').toLowerCase())&&(!canAccess||canAccess(req,'finance','read'))) {
      const month = day(0).slice(0, 7);
      const sum = (type, extra = '') => n(`SELECT COALESCE(SUM(amount_cents),0) c FROM organisation_finance_entries WHERE organisation_id=? AND entry_type='${type}' AND substr(occurred_on,1,7)=?${extra}`, org, month);
      const rev = sum('revenue'), exp = sum('expense');
      data.finance = { month, revenue_cents: rev, expense_cents: exp, profit_cents: rev - exp, daily_revenue_cents: series(`SELECT substr(occurred_on,1,10) d,COALESCE(SUM(amount_cents),0) c FROM organisation_finance_entries WHERE organisation_id=? AND entry_type='revenue' AND substr(occurred_on,1,10)>=? GROUP BY d`, -6, 7) };
    }
    if(canAccess){if(!canAccess(req,'inbox','read'))data.inbox={needs_reply:0,week:0,daily:[],channels:[],drafts_waiting:0};if(!canAccess(req,'approvals','read'))data.approvals={pending:0};if(!canAccess(req,'jobs','read'))data.jobs={today:0,awaiting:0,allocated:0,next7:[]};if(!canAccess(req,'workforce','read'))data.team={total:0,ready:0,attention:0,expiring:0}}
    res.json(data);
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
    if (!r.duplicate) queueAutoDraft(org, r.thread_id);
    res.status(202).json({ ok: true, routed: true, duplicate: r.duplicate });
  });

  // Social inbox (Facebook, Instagram, TikTok, X, Snapchat, website forms) through one signed endpoint.
  // HMAC-SHA256 over `${timestamp}.${rawBody}` with SOCIAL_WEBHOOK_SECRET (falls back to INBOUND_EMAIL_WEBHOOK_SECRET).
  app.post('/api/webhooks/social/:channel', hookLimiter, (req, res) => {
    const channel = String(req.params.channel || '').toLowerCase();
    if (!SOCIAL_CHANNELS.includes(channel)) return fail(res, 404, 'Unknown channel.');
    const secret = String(env.SOCIAL_WEBHOOK_SECRET || env.INBOUND_EMAIL_WEBHOOK_SECRET || '');
    if (!secret) return fail(res, 503, 'Social inbox is not configured.');
    const ts = String(req.get('x-webhook-timestamp') || ''), sig = String(req.get('x-webhook-signature') || '');
    if (!req.rawBody || !/^\d+$/.test(ts) || Math.abs(Date.now() / 1000 - Number(ts)) > 300 || !safeEqual(sig, hmacHex(secret, `${ts}.${req.rawBody.toString('utf8')}`))) return fail(res, 401, 'Invalid signature.');
    const body = z.object({ message_id: z.string().max(300).optional(), to: z.string().max(200), from: z.object({ id: z.string().min(1).max(200), name: z.string().max(200).optional() }), text: z.string().max(20000).optional() }).safeParse(req.body);
    if (!body.success) return fail(res, 400, 'Unrecognised message payload.');
    const org = organisationForAddress(db, channel, body.data.to);
    if (!org) return res.status(202).json({ ok: true, routed: false });
    const r = recordInbound(db, { organisation_id: org, channel, contact_address: body.data.from.id, contact_name: body.data.from.name, body: body.data.text || '', provider: channel, external_message_id: body.data.message_id || null });
    if (!r.duplicate) queueAutoDraft(org, r.thread_id);
    res.status(202).json({ ok: true, routed: true, duplicate: r.duplicate });
  });

  // Meta Messenger / Instagram DMs: same verify token and app secret as WhatsApp. The page or account id is the channel address.
  app.get('/api/webhooks/meta-messaging', (req, res) => {
    const token = String(env.WHATSAPP_VERIFY_TOKEN || '');
    if (token && req.query['hub.mode'] === 'subscribe' && safeEqual(String(req.query['hub.verify_token'] || ''), token)) return res.status(200).type('text/plain').send(String(req.query['hub.challenge'] || ''));
    res.status(403).json({ ok: false, error: 'Verification failed.' });
  });
  app.post('/api/webhooks/meta-messaging', hookLimiter, (req, res) => {
    const secret = String(env.META_APP_SECRET || '');
    if (!secret) return fail(res, 503, 'Meta messaging is not configured.');
    const sig = String(req.get('x-hub-signature-256') || '');
    if (!req.rawBody || !safeEqual(sig, 'sha256=' + hmacHex(secret, req.rawBody))) return fail(res, 401, 'Invalid signature.');
    res.status(200).json({ ok: true });
    try {
      const channel = req.body?.object === 'instagram' ? 'instagram' : 'facebook';
      for (const entry of req.body?.entry || []) {
        const org = organisationForAddress(db, channel, String(entry.id || ''));
        if (!org) continue;
        for (const m of entry.messaging || []) {
          if (!m.message || m.message.is_echo || !m.sender?.id) continue;
          const r = recordInbound(db, { organisation_id: org, channel, contact_address: String(m.sender.id), body: m.message.text || '[attachment]', provider: channel, external_message_id: m.message.mid || null });
          if (!r.duplicate) queueAutoDraft(org, r.thread_id);
        }
      }
    } catch (error) { console.error('[META MESSAGING WEBHOOK]', error.message); }
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
          const wr = recordInbound(db, { organisation_id: org, channel: 'whatsapp', contact_address: '+' + String(m.from).replace(/\D/g, ''), contact_name: name, body: m.text?.body || `[${m.type || 'message'}]`, provider: 'whatsapp', external_message_id: m.id });
          if (wr && !wr.duplicate) queueAutoDraft(org, wr.thread_id);
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
  // One place builds an AI draft and parks it behind the approvals gate. Used by staff ("Draft reply") and by auto-drafting.
  async function stageDraft({ org, thread, instruction, req, auto = false }) {
    const history = db.prepare(`SELECT direction,body,summary,kind FROM comms_messages WHERE thread_id=? AND organisation_id=? AND status NOT IN ('rejected','draft') ORDER BY occurred_at DESC LIMIT 10`).all(thread.id, org).reverse();
    const profile = db.prepare(`SELECT o.name,p.brand_voice,p.business_type FROM organisations o LEFT JOIN onboarding_profiles p ON p.organisation_id=o.id WHERE o.id=?`).get(org) || {};
    const result = await generateAiText({
      remember_conversation: false, thinking_level: 'minimal', max_output_tokens: 600, ensure_complete: true,
      system: `You draft a ${thread.channel} reply for ${profile.name || 'an Australian service business'} (${profile.business_type || 'service business'}). Use Australian English and this brand voice: ${profile.brand_voice || 'friendly, clear, professional'}. A human will review before anything is sent. Greet the customer, answer what you safely can, and politely ask for any details still missing to prepare a quote or booking (full name, suburb or address, what is needed, preferred timing, best contact number). Never promise prices, dates, availability or guarantees you were not given. Never include personal data beyond what the customer wrote. Reply with the message text only.`,
      messages: [...history.map((m) => ({ role: m.direction === 'inbound' ? 'user' : 'assistant', content: m.summary || m.body })), { role: 'user', content: instruction ? `Staff instruction for the reply: ${instruction}` : 'Write the reply.' }]
    });
    const text = String(result.text || '').trim().slice(0, 4000);
    if (!text) { const e = new Error('empty'); e.empty = true; throw e; }
    const now = isoNow(), id = crypto.randomUUID();
    const approval = db.transaction(() => {
      db.prepare(`INSERT INTO comms_messages (id,organisation_id,thread_id,direction,kind,body,provider,status,ai_generated,created_by_user_id,occurred_at,created_at) VALUES (?,?,?,'outbound','message',?,?,'pending_approval',1,?,?,?)`)
        .run(id, org, thread.id, text, thread.channel, req.saas.user_id, now, now);
      const a = createWorkspaceApproval(req, { approval_type: 'outbound_message', source_module: 'comms', title: `Send ${thread.channel} reply to ${thread.contact_name || thread.contact_address}`, summary: text.slice(0, 280), entity_type: 'comms_message', entity_id: id, risk_level: 'high', draft_payload: { message_id: id, thread_id: thread.id, channel: thread.channel, auto_drafted: auto } });
      db.prepare(`UPDATE comms_messages SET approval_id=? WHERE id=? AND organisation_id=?`).run(a.id, id, org);
      saasAudit(req, auto ? 'comms.ai_auto_draft_staged' : 'comms.ai_draft_staged', 'comms_message', id, { channel: thread.channel, approval_id: a.id });
      return a;
    })();
    return { id, approval, text };
  }
  // Auto-drafting: when a customer writes in, the AI prepares a reply for the owner to approve. Nothing is sent without approval.
  const autoQueue = new Set();
  function queueAutoDraft(org, threadId) {
    if (String(env.INBOX_AUTO_DRAFT || '1') === '0' || !aiProviderStatus().configured) return;
    const key = org + ':' + threadId;
    if (autoQueue.has(key)) return;
    autoQueue.add(key);
    setTimeout(async () => {
      try {
        const thread = db.prepare(`SELECT * FROM comms_threads WHERE id=? AND organisation_id=?`).get(threadId, org);
        if (!thread || thread.channel === 'voice') return;
        const pending = db.prepare(`SELECT 1 FROM comms_messages WHERE thread_id=? AND organisation_id=? AND status='pending_approval'`).get(threadId, org);
        if (pending) return;
        const owner = db.prepare(`SELECT user_id FROM memberships WHERE organisation_id=? AND role='owner' ORDER BY created_at LIMIT 1`).get(org);
        if (!owner) return;
        const req = { saas: { organisation_id: org, user_id: owner.user_id, role: 'owner' }, ip: 'system', headers: {}, get: () => '' };
        await stageDraft({ org, thread, instruction: '', req, auto: true });
      } catch (error) { console.warn('[INBOX AUTO-DRAFT]', error.message); }
      finally { autoQueue.delete(key); }
    }, 1500).unref?.();
  }

  app.post('/api/saas/comms/threads/:id/draft', commsLimiter, requireSaasUser, requireSaasRole(...SENIOR), async (req, res) => {
    const org = req.saas.organisation_id;
    const thread = db.prepare(`SELECT * FROM comms_threads WHERE id=? AND organisation_id=?`).get(req.params.id, org);
    if (!thread) return fail(res, 404, 'Thread not found.');
    if (!aiProviderStatus().configured) return fail(res, 503, 'AI is not configured yet. Add a Gemini key or another AI provider.');
    const instruction = z.string().trim().max(500).optional().safeParse(req.body?.instruction);
    let staged;
    try { staged = await stageDraft({ org, thread, instruction: instruction.success ? instruction.data : '', req }); }
    catch (error) { return fail(res, 502, error.empty ? 'The AI provider returned an empty draft.' : 'The AI provider could not produce a draft. Try again shortly.'); }
    ok(res, { message_id: staged.id, approval_id: staged.approval.id, reference_code: staged.approval.reference_code, status: 'pending_approval', executed: false, draft: staged.text }, 201);
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
      if(['email','sms'].includes(msg.channel))trackCommunication({organisationId:org,userId:req.saas.user_id,channel:msg.channel,recipient:msg.contact_address,category:'customer_reply',subject:msg.subject||'Customer message'},{sent:false,reason:error.code==='NOT_CONFIGURED'?'provider_not_configured':'provider_rejected'});
      db.prepare(`UPDATE comms_messages SET status='approved' WHERE id=? AND organisation_id=?`).run(msg.id, org);
      return fail(res, error.code === 'NOT_CONFIGURED' ? 409 : 502, error.code === 'NOT_CONFIGURED' ? error.message : 'The provider rejected the message. It stays approved so you can retry.');
    }
    if(['email','sms'].includes(msg.channel)){
      const brand=tenantBrandFor(db,uploadRoot,org),replyTo=db.prepare("SELECT address FROM comms_channels WHERE organisation_id=? AND channel='email' AND status='active' LIMIT 1").get(org)?.address;
      trackCommunication({organisationId:org,userId:req.saas.user_id,channel:msg.channel,recipient:msg.contact_address,category:'customer_reply',subject:msg.subject||'Customer message',followUp:msg.channel==='email'?{subject:msg.subject?`Following up: ${msg.subject}`:`Following up from ${brand.name}`,brand:{name:brand.name,color:brand.color,footer:brand.footer,links:brand.links,logoSrc:''},replyTo,frame:{heading:'A quick follow-up',paragraphs:[`${brand.name} is following up on our message from yesterday. Please reply if you need help or would like to continue.`]}}:null},{sent:true,...(msg.channel==='email'?{email_id:externalId}:{message_id:externalId})});
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
      const r = await fetch(`${String(env.TELNYX_API_BASE_URL || 'https://api.telnyx.com/v2').replace(/\/$/, '')}/messages`, { method: 'POST', headers: { authorization: `Bearer ${env.TELNYX_API_KEY}`, 'content-type': 'application/json' }, body: JSON.stringify({ from, to: msg.contact_address, text: msg.body }) });
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
      const brand=tenantBrandFor(db,uploadRoot,msg.organisation_id),rendered=renderEmail(brand,{heading:msg.subject||'Message from '+brand.name,paragraphs:[msg.body]});
      const replyTo=db.prepare("SELECT address FROM comms_channels WHERE organisation_id=? AND channel='email' AND status='active' LIMIT 1").get(msg.organisation_id)?.address;
      const r = await fetch(`${String(env.RESEND_API_BASE_URL || 'https://api.resend.com').replace(/\/$/, '')}/emails`, { method: 'POST', headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, 'content-type': 'application/json' }, body: JSON.stringify({ from: env.SAAS_VERIFY_FROM, to: [msg.contact_address], subject: msg.subject ? `Re: ${msg.subject}` : 'Reply from us', text: rendered.text,html:rendered.html,...(replyTo?{reply_to:replyTo}:{}) }) });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error('email failed');
      return data?.id || null;
    }
    if (SOCIAL_CHANNELS.includes(msg.channel)) throw notConfigured(`Sending replies directly on ${msg.channel} (the reply is approved and saved; copy it into the ${msg.channel} app for now)`);
    throw notConfigured('Voice replies are not sent as messages; the channel');
  }
  return { syncJobFinance, dispatch };
}

// Called inside the approval decision transaction so message state can never drift from the approval.
export function applyApprovalToComms(db, approvalRow, status, editedPayloadJson) {
  if (approvalRow.entity_type !== 'comms_message') return;
  let body = null;
  if (status === 'approved' && editedPayloadJson) { try { body = String(JSON.parse(editedPayloadJson).body || '').slice(0, 4000) || null; } catch { body = null; } }
  db.prepare(`UPDATE comms_messages SET status=?,body=COALESCE(?,body) WHERE id=? AND organisation_id=? AND status='pending_approval'`)
    .run(status === 'approved' ? 'approved' : 'rejected', body, approvalRow.entity_id, approvalRow.organisation_id);
}
