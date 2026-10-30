// Phase 07: unified communications and campaigns. Every row belongs to one owner: a business (organisation id) or
// 'platform' (Founder Console). Platform mail and campaigns never touch a business's customer communications, and
// no business can read platform rows.
import crypto from 'node:crypto';
import { analyseThread, draftReply, duplicates, followUps, CATEGORIES } from './ai.js';

const iso = (t = Date.now()) => new Date(t).toISOString();
const J = (s, f) => { if (s === null || s === undefined) return f; try { return JSON.parse(s); } catch { return f; } };
const uid = () => crypto.randomUUID();
const normEmail = (e) => String(e || '').trim().toLowerCase();
export const normPhone = (p) => { let d = String(p || '').replace(/[^\d+]/g, ''); if (/^04\d{8}$/.test(d)) d = '+61' + d.slice(1); else if (/^614\d{8}$/.test(d)) d = '+' + d; else if (/^0[2378]\d{8}$/.test(d)) d = '+61' + d.slice(1); return d; };
const normAddr = (channel, a) => (channel === 'email' ? normEmail(a) : normPhone(a));
const SPAM_WORDS = /\b(free!+|100% free|act now|limited time only|winner|cash bonus|guaranteed|risk[- ]free|click here|buy now|\$\$\$)\b/i;

export function migrateComms(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS comms_thread_meta (thread_id TEXT PRIMARY KEY, organisation_id TEXT NOT NULL, folder TEXT NOT NULL DEFAULT 'inbox' CHECK (folder IN ('inbox','archived','spam')), category TEXT, sentiment TEXT, sentiment_score INTEGER, summary TEXT, lead_score INTEGER, lead_band TEXT, lead_reasons_json TEXT, escalation_level TEXT, escalation_json TEXT, customer_id TEXT, enquiry_id TEXT, invoice_id TEXT, campaign_id TEXT, duplicates_json TEXT, method TEXT, analysed_at TEXT, updated_at TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS comms_meta_org ON comms_thread_meta(organisation_id, folder);
    CREATE TABLE IF NOT EXISTS comms_message_schedule (message_id TEXT PRIMARY KEY, organisation_id TEXT NOT NULL, send_at TEXT NOT NULL, state TEXT NOT NULL DEFAULT 'waiting', error TEXT, created_by TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS marketing_consents (owner_key TEXT NOT NULL, channel TEXT NOT NULL CHECK (channel IN ('email','sms')), address TEXT NOT NULL, customer_id TEXT, status TEXT NOT NULL CHECK (status IN ('granted','withdrawn')), source TEXT NOT NULL, evidence TEXT, recorded_by TEXT, granted_at TEXT, withdrawn_at TEXT, updated_at TEXT NOT NULL, PRIMARY KEY (owner_key, channel, address));
    CREATE TABLE IF NOT EXISTS marketing_suppressions (owner_key TEXT NOT NULL, channel TEXT NOT NULL, address TEXT NOT NULL, reason TEXT NOT NULL, source TEXT, created_by TEXT, created_at TEXT NOT NULL, PRIMARY KEY (owner_key, channel, address));
    CREATE TABLE IF NOT EXISTS comms_campaigns (id TEXT PRIMARY KEY, owner_key TEXT NOT NULL, name TEXT NOT NULL, channel TEXT NOT NULL CHECK (channel IN ('email','sms','social')), status TEXT NOT NULL DEFAULT 'draft', subject TEXT, body TEXT NOT NULL DEFAULT '', cta_url TEXT, social_targets_json TEXT, segment_json TEXT NOT NULL DEFAULT '{}', send_at TEXT, run_id TEXT, revision INTEGER NOT NULL DEFAULT 1, approved_revision INTEGER, created_by TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, sent_at TEXT, error TEXT);
    CREATE INDEX IF NOT EXISTS comms_campaigns_owner ON comms_campaigns(owner_key, created_at);
    CREATE TABLE IF NOT EXISTS comms_campaign_recipients (campaign_id TEXT NOT NULL, owner_key TEXT NOT NULL, address TEXT NOT NULL, customer_id TEXT, name TEXT, status TEXT NOT NULL, provider_id TEXT, error TEXT, token TEXT NOT NULL UNIQUE, sent_at TEXT, clicked_at TEXT, unsubscribed_at TEXT, PRIMARY KEY (campaign_id, address));
    CREATE INDEX IF NOT EXISTS comms_recipients_provider ON comms_campaign_recipients(provider_id);
  `);
}

export function createCommsService({ db, env = {}, fetchImpl = globalThis.fetch, dispatch, pipeline, profileOf, notify = () => {}, emit = () => {}, aiReply = null, aiAvailable = () => false, engineRef = { current: null }, publicBase = () => '', log = console }) {
  migrateComms(db);
  const isPlatform = (k) => k === 'platform';
  const secret = () => String(env.SESSION_SECRET || env.SAAS_SESSION_SECRET || 'dev-unsubscribe-secret');
  const business = (org) => (isPlatform(org) ? { name: 'Super Pro AI Office Manager', abn: env.SUPERPRO_ABN || '', address: env.SUPERPRO_POSTAL_ADDRESS || '' } : (() => { const o = db.prepare('SELECT COALESCE(display_name,name) name, abn, address_formatted FROM organisations WHERE id=?').get(org) || {}; return { name: o.name || 'Our business', abn: o.abn || '', address: o.address_formatted || '' }; })());

  // ---------------- conversation analysis (runs on every inbound message) ----------------
  function customerFor(org, channel, address) {
    if (channel === 'email') return db.prepare('SELECT * FROM tenant_customers WHERE organisation_id=? AND lower(email)=?').all(org, normEmail(address));
    if (['sms', 'voice', 'whatsapp'].includes(channel)) { const d = normPhone(address).slice(-9); return d.length >= 8 ? db.prepare("SELECT * FROM tenant_customers WHERE organisation_id=? AND replace(replace(replace(COALESCE(phone,''),' ',''),'-',''),'+61','0') LIKE ?").all(org, '%' + d) : []; }
    return [];
  }
  function analyse(org, threadId) {
    const t = db.prepare('SELECT * FROM comms_threads WHERE id=? AND organisation_id=?').get(threadId, org); if (!t) return null;
    const messages = db.prepare('SELECT id,direction,body,occurred_at,kind FROM comms_messages WHERE thread_id=? AND organisation_id=? ORDER BY occurred_at,created_at').all(t.id, org);
    const prev = db.prepare('SELECT * FROM comms_thread_meta WHERE thread_id=?').get(t.id);
    const customers = customerFor(org, t.channel, t.contact_address);
    const customer = prev?.customer_id ? db.prepare('SELECT * FROM tenant_customers WHERE id=? AND organisation_id=?').get(prev.customer_id, org) : customers.length === 1 ? customers[0] : null;
    const p = profileOf(org) || {};
    const campaign = db.prepare("SELECT r.campaign_id FROM comms_campaign_recipients r WHERE r.owner_key=? AND r.address=? AND r.status='sent' AND r.sent_at>=? ORDER BY r.sent_at DESC LIMIT 1").get(org, normAddr(t.channel === 'email' ? 'email' : 'sms', t.contact_address), iso(Date.now() - 14 * 86400000));
    const a = analyseThread({ thread: t, messages, services: p.services || [], areas: p.areas || [], customer, inReplyToCampaign: Boolean(campaign) });
    const enquiry = prev?.enquiry_id || (customer ? db.prepare("SELECT id FROM tenant_documents WHERE organisation_id=? AND kind='enquiry' AND customer_id=? AND status IN ('open','quoted') ORDER BY created_at DESC LIMIT 1").get(org, customer.id)?.id : null) || null;
    const invoice = prev?.invoice_id || (customer && a.category === 'invoice' ? db.prepare("SELECT id FROM tenant_documents WHERE organisation_id=? AND kind='invoice' AND customer_id=? ORDER BY created_at DESC LIMIT 1").get(org, customer.id)?.id : null) || null;
    const others = db.prepare('SELECT t.id,t.channel,t.contact_name,m.customer_id FROM comms_threads t LEFT JOIN comms_thread_meta m ON m.thread_id=t.id WHERE t.organisation_id=? AND t.id<>? ORDER BY t.last_message_at DESC LIMIT 200').all(org, t.id);
    const dup = duplicates({ thread: { ...t, customer_id: customer?.id }, otherThreads: others, recentMessages: messages.filter((m) => m.direction === 'inbound' && Date.parse(m.occurred_at) > Date.now() - 86400000), customers });
    const folder = prev?.folder && prev.folder !== 'inbox' ? prev.folder : a.category === 'spam' ? 'spam' : 'inbox';
    db.prepare(`INSERT INTO comms_thread_meta(thread_id,organisation_id,folder,category,sentiment,sentiment_score,summary,lead_score,lead_band,lead_reasons_json,escalation_level,escalation_json,customer_id,enquiry_id,invoice_id,campaign_id,duplicates_json,method,analysed_at,updated_at) VALUES (@thread_id,@org,@folder,@category,@sentiment,@score,@summary,@lead,@band,@reasons,@esc,@escj,@customer,@enquiry,@invoice,@campaign,@dups,@method,@at,@at)
      ON CONFLICT(thread_id) DO UPDATE SET folder=excluded.folder,category=excluded.category,sentiment=excluded.sentiment,sentiment_score=excluded.sentiment_score,summary=excluded.summary,lead_score=excluded.lead_score,lead_band=excluded.lead_band,lead_reasons_json=excluded.lead_reasons_json,escalation_level=excluded.escalation_level,escalation_json=excluded.escalation_json,customer_id=COALESCE(comms_thread_meta.customer_id,excluded.customer_id),enquiry_id=COALESCE(comms_thread_meta.enquiry_id,excluded.enquiry_id),invoice_id=COALESCE(comms_thread_meta.invoice_id,excluded.invoice_id),campaign_id=COALESCE(excluded.campaign_id,comms_thread_meta.campaign_id),duplicates_json=excluded.duplicates_json,method=excluded.method,analysed_at=excluded.analysed_at,updated_at=excluded.updated_at`)
      .run({ thread_id: t.id, org, folder, category: a.category, sentiment: a.sentiment.label, score: a.sentiment.score, summary: a.summary, lead: a.lead.score, band: a.lead.band, reasons: JSON.stringify(a.lead.reasons), esc: a.escalation.level, escj: JSON.stringify(a.escalation), customer: customer?.id || null, enquiry, invoice, campaign: campaign?.campaign_id || null, dups: JSON.stringify(dup), method: a.method, at: iso() });
    return { ...a, folder, customer_id: customer?.id || null, enquiry_id: enquiry, invoice_id: invoice, duplicates: dup, customers_matched: customers.length };
  }
  // Inbound hook: analyse, honour STOP/unsubscribe, escalate, and tell automations a message arrived.
  function onInbound(m) {
    if (!m.organisation_id || m.kind === 'call_log' && !m.body) return;
    const a = analyse(m.organisation_id, m.thread_id); if (!a) return;
    if (a.category === 'unsubscribe' && ['sms', 'whatsapp', 'email'].includes(m.channel)) { suppress(m.organisation_id, m.channel === 'email' ? 'email' : 'sms', m.contact_address, m.channel === 'email' ? 'unsubscribe_reply' : 'stop_reply', 'inbound message', null); db.prepare("UPDATE comms_threads SET status='closed' WHERE id=?").run(m.thread_id); }
    if (a.escalation.level === 'urgent' || a.escalation.level === 'high') notify(m.organisation_id, { kind: 'comms_escalation', title: a.escalation.level === 'urgent' ? 'Urgent message' : 'Message needs a personal reply', body: `${m.contact_name || m.contact_address}: ${a.summary}`, link: '#b04/inbox', urgent: a.escalation.level === 'urgent', dedupe: `esc:${m.thread_id}:${a.escalation.level}` });
    emit(m.organisation_id, 'inbox.message', { thread_id: m.thread_id, message_id: m.id }, { key: m.id });
  }

  // ---------------- unified inbox ----------------
  const FOLDERS = ['inbox', 'sent', 'drafts', 'scheduled', 'archived', 'failed', 'spam'];
  const VIEWS = ['all', 'customers', 'enquiries', 'invoices', 'marketing'];
  function inbox(org, { folder = 'inbox', view = 'all', q = '', limit = 100 } = {}) {
    if (!FOLDERS.includes(folder)) folder = 'inbox'; if (!VIEWS.includes(view)) view = 'all';
    const like = q ? `%${String(q).toLowerCase().replace(/[%_\\]/g, (c) => '\\' + c)}%` : null;
    const viewSql = { all: '', customers: ' AND m.customer_id IS NOT NULL', enquiries: " AND (m.enquiry_id IS NOT NULL OR m.category IN ('enquiry','quote'))", invoices: " AND (m.invoice_id IS NOT NULL OR m.category='invoice')", marketing: " AND (m.campaign_id IS NOT NULL OR m.category IN ('marketing_reply','unsubscribe'))" }[view];
    const items = [];
    if (['inbox', 'archived', 'spam'].includes(folder)) {
      const rows = db.prepare(`SELECT t.*, m.folder, m.category, m.sentiment, m.summary, m.lead_score, m.lead_band, m.escalation_level, m.customer_id, m.enquiry_id, m.invoice_id, m.campaign_id, m.duplicates_json,
        (SELECT body FROM comms_messages x WHERE x.thread_id=t.id ORDER BY occurred_at DESC LIMIT 1) last_body, (SELECT direction FROM comms_messages x WHERE x.thread_id=t.id ORDER BY occurred_at DESC LIMIT 1) last_direction
        FROM comms_threads t LEFT JOIN comms_thread_meta m ON m.thread_id=t.id WHERE t.organisation_id=? AND COALESCE(m.folder,'inbox')=?${viewSql}${like ? " AND (lower(t.contact_address) LIKE @l ESCAPE '\\' OR lower(COALESCE(t.contact_name,'')) LIKE @l ESCAPE '\\' OR lower(COALESCE(t.subject,'')) LIKE @l ESCAPE '\\')" : ''} ORDER BY t.last_message_at DESC LIMIT ?`.replace('@l', '?').replace('@l', '?').replace('@l', '?'))
        .all(...[org, folder, ...(like ? [like, like, like] : []), limit]);
      for (const r of rows) items.push({ type: 'conversation', id: r.id, channel: r.channel, contact: r.contact_name || r.contact_address, address: r.contact_address, subject: r.subject, preview: r.summary || String(r.last_body || '').slice(0, 160), status: r.status, at: r.last_message_at, last_direction: r.last_direction, ai: r.category ? { category: r.category, category_label: CATEGORIES[r.category], sentiment: r.sentiment, lead_score: r.lead_score, lead_band: r.lead_band, escalation: r.escalation_level, duplicates: J(r.duplicates_json, []).length } : null, links: { customer_id: r.customer_id, enquiry_id: r.enquiry_id, invoice_id: r.invoice_id, campaign_id: r.campaign_id } });
    } else {
      const status = { sent: "m.status='sent'", drafts: "m.status IN ('draft','pending_approval','approved') AND s.message_id IS NULL", scheduled: "s.message_id IS NOT NULL AND s.state='waiting'", failed: "(m.status='failed' OR s.state='failed')" }[folder];
      for (const r of db.prepare(`SELECT m.*, t.channel, t.contact_address, t.contact_name, t.subject, s.send_at, s.state sched_state, s.error sched_error FROM comms_messages m JOIN comms_threads t ON t.id=m.thread_id LEFT JOIN comms_message_schedule s ON s.message_id=m.id LEFT JOIN comms_thread_meta x ON x.thread_id=t.id WHERE m.organisation_id=? AND m.direction='outbound' AND ${status}${viewSql.replace(/m\./g, 'x.')} ORDER BY COALESCE(s.send_at,m.occurred_at) DESC LIMIT ?`).all(org, limit))
        items.push({ type: 'message', id: r.id, thread_id: r.thread_id, channel: r.channel, contact: r.contact_name || r.contact_address, subject: r.subject, preview: String(r.body).slice(0, 160), status: r.sched_state === 'failed' ? 'failed' : r.status, at: r.send_at || r.occurred_at, scheduled_for: r.send_at || null, error: r.sched_error || null, ai_generated: Boolean(r.ai_generated) });
      if (view === 'all' || view === 'customers') {
        const mailStatus = { sent: "status IN ('sent','delivered','opened')", drafts: "status IN ('draft','approved')", scheduled: "status='scheduled'", failed: "status='failed'" }[folder];
        for (const r of db.prepare(`SELECT id,recipient,subject,body,status,scheduled_at,updated_at,category FROM portal_mail WHERE scope='business' AND owner_id=? AND ${mailStatus} ORDER BY updated_at DESC LIMIT ?`).all(org, limit))
          items.push({ type: 'email', id: r.id, channel: 'email', contact: r.recipient, subject: r.subject, preview: String(r.body).slice(0, 160), status: r.status, at: r.scheduled_at || r.updated_at, scheduled_for: r.scheduled_at || null, source: 'Email Centre' });
      }
      if (view === 'all' || view === 'marketing') {
        const cs = { sent: "status='sent'", drafts: "status IN ('draft','pending_approval','approved')", scheduled: "status='scheduled'", failed: "status IN ('failed','partly_failed')" }[folder];
        for (const r of db.prepare(`SELECT * FROM comms_campaigns WHERE owner_key=? AND ${cs} ORDER BY updated_at DESC LIMIT ?`).all(org, limit))
          items.push({ type: 'campaign', id: r.id, channel: r.channel, contact: `${counts(r.id).recipients} recipient(s)`, subject: r.subject || r.name, preview: String(r.body).slice(0, 160), status: r.status, at: r.sent_at || r.send_at || r.updated_at, scheduled_for: r.send_at || null, source: 'Campaigns' });
      }
    }
    return { folder, view, items: items.sort((a, b) => String(b.at).localeCompare(String(a.at))).slice(0, limit) };
  }
  function folderCounts(org) {
    const one = (sql, ...a) => db.prepare(sql).get(...a).n;
    return {
      inbox: one("SELECT COUNT(*) n FROM comms_threads t LEFT JOIN comms_thread_meta m ON m.thread_id=t.id WHERE t.organisation_id=? AND COALESCE(m.folder,'inbox')='inbox' AND t.status='needs_reply'", org),
      drafts: one("SELECT COUNT(*) n FROM comms_messages m LEFT JOIN comms_message_schedule s ON s.message_id=m.id WHERE m.organisation_id=? AND m.direction='outbound' AND m.status IN ('draft','pending_approval','approved') AND s.message_id IS NULL", org) + one("SELECT COUNT(*) n FROM comms_campaigns WHERE owner_key=? AND status IN ('draft','pending_approval')", org),
      scheduled: one("SELECT COUNT(*) n FROM comms_message_schedule WHERE organisation_id=? AND state='waiting'", org) + one("SELECT COUNT(*) n FROM comms_campaigns WHERE owner_key=? AND status='scheduled'", org),
      failed: one("SELECT COUNT(*) n FROM comms_messages WHERE organisation_id=? AND direction='outbound' AND status='failed'", org) + one("SELECT COUNT(*) n FROM comms_message_schedule WHERE organisation_id=? AND state='failed'", org),
      spam: one("SELECT COUNT(*) n FROM comms_thread_meta WHERE organisation_id=? AND folder='spam'", org)
    };
  }
  function thread(org, id) {
    const t = db.prepare('SELECT * FROM comms_threads WHERE id=? AND organisation_id=?').get(id, org); if (!t) return null;
    const meta = db.prepare('SELECT * FROM comms_thread_meta WHERE thread_id=?').get(id) || analyse(org, id) && db.prepare('SELECT * FROM comms_thread_meta WHERE thread_id=?').get(id);
    const messages = db.prepare('SELECT m.id,m.direction,m.kind,m.body,m.summary,m.status,m.ai_generated,m.occurred_at,m.approval_id,s.send_at,s.state sched_state FROM comms_messages m LEFT JOIN comms_message_schedule s ON s.message_id=m.id WHERE m.thread_id=? AND m.organisation_id=? ORDER BY m.occurred_at,m.created_at LIMIT 500').all(id, org);
    const customer = meta?.customer_id ? db.prepare('SELECT id,name,email,phone,status FROM tenant_customers WHERE id=? AND organisation_id=?').get(meta.customer_id, org) : null;
    const consent = ['email', 'sms'].includes(t.channel) ? db.prepare('SELECT status,source,granted_at,withdrawn_at FROM marketing_consents WHERE owner_key=? AND channel=? AND address=?').get(org, t.channel, normAddr(t.channel, t.contact_address)) || null : null;
    const suppressed = Boolean(db.prepare('SELECT 1 FROM marketing_suppressions WHERE owner_key=? AND channel=? AND address=?').get(org, t.channel === 'email' ? 'email' : 'sms', normAddr(t.channel === 'email' ? 'email' : 'sms', t.contact_address)));
    return { thread: t, meta: meta ? { ...meta, lead_reasons: J(meta.lead_reasons_json, []), escalation: J(meta.escalation_json, null), duplicates: J(meta.duplicates_json, []) } : null, messages, customer, consent, suppressed, matches: customer ? [] : customerFor(org, t.channel, t.contact_address).map((c) => ({ id: c.id, name: c.name })) };
  }
  function move(org, id, folder) {
    if (!['inbox', 'archived', 'spam'].includes(folder)) return false;
    const t = db.prepare('SELECT id FROM comms_threads WHERE id=? AND organisation_id=?').get(id, org); if (!t) return false;
    if (!db.prepare('SELECT 1 FROM comms_thread_meta WHERE thread_id=?').get(id)) analyse(org, id);
    db.prepare('UPDATE comms_thread_meta SET folder=?,updated_at=? WHERE thread_id=? AND organisation_id=?').run(folder, iso(), id, org);
    if (folder !== 'inbox') db.prepare("UPDATE comms_threads SET status='closed',updated_at=? WHERE id=?").run(iso(), id);
    return true;
  }
  // Conversation-to-CRM linking: an existing customer, a new customer from the conversation, an enquiry or an invoice.
  function link(org, id, { customer_id, create_customer, enquiry_id, invoice_id, create_enquiry }, actor) {
    const t = db.prepare('SELECT * FROM comms_threads WHERE id=? AND organisation_id=?').get(id, org); if (!t) return { ok: false, status: 404, error: 'Conversation not found.' };
    if (!db.prepare('SELECT 1 FROM comms_thread_meta WHERE thread_id=?').get(id)) analyse(org, id);
    const own = (kind, rid) => db.prepare(`SELECT id FROM tenant_documents WHERE id=? AND organisation_id=? AND kind=?`).get(rid, org, kind);
    let cid = customer_id || null;
    if (cid && !db.prepare('SELECT 1 FROM tenant_customers WHERE id=? AND organisation_id=?').get(cid, org)) return { ok: false, status: 400, error: 'That customer is not in this business.' };
    if (create_customer) { cid = uid(); db.prepare("INSERT INTO tenant_customers(id,organisation_id,name,email,phone,status,source,created_by_user_id,created_at,updated_at) VALUES (?,?,?,?,?,'lead','inbox',?,?,?)").run(cid, org, String(create_customer.name || t.contact_name || t.contact_address).slice(0, 160), t.channel === 'email' ? t.contact_address : (create_customer.email || null), ['sms', 'voice', 'whatsapp'].includes(t.channel) ? t.contact_address : (create_customer.phone || null), actor, iso(), iso()); }
    if (enquiry_id && !own('enquiry', enquiry_id)) return { ok: false, status: 400, error: 'That enquiry is not in this business.' };
    if (invoice_id && !own('invoice', invoice_id)) return { ok: false, status: 400, error: 'That invoice is not in this business.' };
    let eid = enquiry_id || null;
    if (create_enquiry) { const m = db.prepare("SELECT body FROM comms_messages WHERE thread_id=? AND direction='inbound' ORDER BY occurred_at DESC LIMIT 1").get(id); const r = pipeline.createEnquiry(org, actor, { title: String(create_enquiry.title || t.subject || `Enquiry from ${t.contact_name || t.contact_address}`).slice(0, 240), details: m?.body || '', channel: { email: 'email', sms: 'sms', voice: 'phone', website: 'website', whatsapp: 'social', facebook: 'social', instagram: 'social' }[t.channel] || 'other', customer_id: cid || db.prepare('SELECT customer_id FROM comms_thread_meta WHERE thread_id=?').get(id)?.customer_id || undefined, customer: { name: t.contact_name || t.contact_address, email: t.channel === 'email' ? t.contact_address : null, phone: ['sms', 'voice', 'whatsapp'].includes(t.channel) ? t.contact_address : null } }); eid = r.id; cid = cid || r.customer_id; }
    db.prepare('UPDATE comms_thread_meta SET customer_id=COALESCE(?,customer_id),enquiry_id=COALESCE(?,enquiry_id),invoice_id=COALESCE(?,invoice_id),updated_at=? WHERE thread_id=?').run(cid, eid, invoice_id || null, iso(), id);
    return { ok: true, customer_id: cid, enquiry_id: eid };
  }
  // Reply: always a draft that needs approval; it can be scheduled. Recipients come from the conversation only.
  async function reply(org, id, { body, send_at = null, use_ai = false }, req, createApproval) {
    const t = db.prepare('SELECT * FROM comms_threads WHERE id=? AND organisation_id=?').get(id, org); if (!t) return { ok: false, status: 404, error: 'Conversation not found.' };
    if (t.channel === 'voice') return { ok: false, status: 409, error: 'Calls are answered by phone; log the outcome instead of sending a message.' };
    let text = String(body || '').trim(), method = 'person';
    if (!text) {
      const meta = db.prepare('SELECT category FROM comms_thread_meta WHERE thread_id=?').get(id) || analyse(org, id);
      const last = db.prepare("SELECT body FROM comms_messages WHERE thread_id=? AND direction='inbound' ORDER BY occurred_at DESC LIMIT 1").get(id)?.body || '';
      const cust = db.prepare('SELECT c.name FROM comms_thread_meta m JOIN tenant_customers c ON c.id=m.customer_id WHERE m.thread_id=?').get(id);
      const draft = draftReply({ thread: t, category: meta.category, business: business(org).name, details: {}, customerName: cust?.name || '' });
      text = draft.text; method = 'template';
      if (use_ai && aiReply && aiAvailable()) { try { const ai = await aiReply({ business: business(org).name, category: meta.category, last }); if (ai && ai.length > 10) { text = ai.slice(0, 4000); method = 'ai'; } } catch (e) { log.warn('[comms] AI reply failed, template used:', e.message); } }
    }
    if (send_at && Date.parse(send_at) < Date.now() - 60000) return { ok: false, status: 400, error: 'Choose a future time to schedule.' };
    const mid = uid(), now = iso();
    const approval = db.transaction(() => {
      db.prepare("INSERT INTO comms_messages(id,organisation_id,thread_id,direction,kind,body,provider,status,ai_generated,created_by_user_id,occurred_at,created_at) VALUES (?,?,?,'outbound','message',?,'super_pro','pending_approval',?,?,?,?)").run(mid, org, id, text.slice(0, 4000), method === 'ai' ? 1 : 0, req.saas.user_id, now, now);
      const a = createApproval(req, { approval_type: 'external_message', source_module: 'comms', title: `Reply to ${t.contact_name || t.contact_address} (${t.channel})`, summary: text.slice(0, 600), entity_type: 'comms_message', entity_id: mid, risk_level: 'normal', draft_payload: { body: text.slice(0, 4000), channel: t.channel, to: t.contact_address, method, send_at } });
      db.prepare('UPDATE comms_messages SET approval_id=? WHERE id=?').run(a.id, mid);
      if (send_at) db.prepare("INSERT INTO comms_message_schedule(message_id,organisation_id,send_at,state,created_by,created_at,updated_at) VALUES (?,?,?,'waiting',?,?,?)").run(mid, org, send_at, req.saas.user_id, now, now);
      return a;
    })();
    return { ok: true, message_id: mid, approval_id: approval.id, reference_code: approval.reference_code, method, body: text, scheduled_for: send_at || null };
  }
  // Scheduled replies go out only when approved and due. Unapproved ones wait until their approval expires.
  async function sendDue() {
    const due = db.prepare("SELECT s.*, m.status mstatus FROM comms_message_schedule s JOIN comms_messages m ON m.id=s.message_id WHERE s.state='waiting' AND s.send_at<=?").all(iso());
    let sent = 0;
    for (const s of due) {
      if (s.mstatus === 'rejected') { db.prepare("UPDATE comms_message_schedule SET state='cancelled',error='Rejected',updated_at=? WHERE message_id=?").run(iso(), s.message_id); continue; }
      if (s.mstatus !== 'approved') continue;
      const claimed = db.prepare("UPDATE comms_messages SET status='sending' WHERE id=? AND status='approved'").run(s.message_id).changes; if (!claimed) continue;
      const msg = db.prepare('SELECT m.*,t.contact_address,t.channel,t.subject FROM comms_messages m JOIN comms_threads t ON t.id=m.thread_id WHERE m.id=?').get(s.message_id);
      if (['email', 'sms'].includes(msg.channel) && db.prepare('SELECT 1 FROM marketing_suppressions WHERE owner_key=? AND channel=? AND address=? AND reason IN (\'bounce\',\'complaint\')').get(msg.organisation_id, msg.channel, normAddr(msg.channel, msg.contact_address))) { db.prepare("UPDATE comms_messages SET status='failed' WHERE id=?").run(msg.id); db.prepare("UPDATE comms_message_schedule SET state='failed',error=?,updated_at=? WHERE message_id=?").run('The address bounced or complained before; not sent.', iso(), msg.id); continue; }
      try { const ext = await dispatch(msg); db.prepare("UPDATE comms_messages SET status='sent',external_message_id=COALESCE(?,external_message_id) WHERE id=?").run(ext, msg.id); db.prepare("UPDATE comms_message_schedule SET state='sent',updated_at=? WHERE message_id=?").run(iso(), msg.id); sent++; }
      catch (e) { db.prepare("UPDATE comms_messages SET status='failed' WHERE id=?").run(msg.id); db.prepare("UPDATE comms_message_schedule SET state='failed',error=?,updated_at=? WHERE message_id=?").run(String(e.message).slice(0, 300), iso(), msg.id); notify(msg.organisation_id, { kind: 'comms_failed', title: 'A scheduled message could not be sent', body: String(e.message).slice(0, 160), link: '#b04/inbox' }); }
    }
    return { sent, due: due.length };
  }
  function suggestions(org) {
    const threads = db.prepare("SELECT t.*, m.category, m.folder, m.escalation_level, (SELECT direction FROM comms_messages x WHERE x.thread_id=t.id ORDER BY occurred_at DESC LIMIT 1) last_direction, (SELECT MAX(occurred_at) FROM comms_messages x WHERE x.thread_id=t.id AND direction='inbound') last_inbound_at FROM comms_threads t LEFT JOIN comms_thread_meta m ON m.thread_id=t.id WHERE t.organisation_id=? AND COALESCE(m.folder,'inbox')='inbox' ORDER BY t.last_message_at DESC LIMIT 300").all(org);
    const reminders = db.prepare("SELECT w.id,w.title,w.start_at,c.name FROM work_orders w LEFT JOIN tenant_customers c ON c.id=w.customer_id WHERE w.organisation_id=? AND w.start_at BETWEEN ? AND ? AND w.completed_at IS NULL AND w.status<>'cancelled' ORDER BY w.start_at LIMIT 20").all(org, iso(), iso(Date.now() + 2 * 86400000));
    const reminderRule = db.prepare("SELECT enabled FROM automation_rules WHERE organisation_id=? AND rule_key='appointment_reminders'").get(org)?.enabled;
    const esc = db.prepare("SELECT t.id,t.contact_name,t.contact_address,m.escalation_json,m.summary FROM comms_thread_meta m JOIN comms_threads t ON t.id=m.thread_id WHERE m.organisation_id=? AND m.escalation_level IN ('urgent','high') AND t.status<>'closed' ORDER BY m.updated_at DESC LIMIT 20").all(org).map((r) => ({ thread_id: r.id, contact: r.contact_name || r.contact_address, summary: r.summary, ...J(r.escalation_json, {}) }));
    const dups = db.prepare("SELECT t.id,t.contact_name,t.contact_address,m.duplicates_json FROM comms_thread_meta m JOIN comms_threads t ON t.id=m.thread_id WHERE m.organisation_id=? AND m.duplicates_json NOT IN ('[]','') ORDER BY m.updated_at DESC LIMIT 20").all(org).map((r) => ({ thread_id: r.id, contact: r.contact_name || r.contact_address, items: J(r.duplicates_json, []) }));
    const leads = db.prepare("SELECT t.id,t.contact_name,t.contact_address,m.lead_score,m.lead_band,m.lead_reasons_json,m.summary FROM comms_thread_meta m JOIN comms_threads t ON t.id=m.thread_id WHERE m.organisation_id=? AND m.lead_band IN ('hot','warm') AND m.folder='inbox' AND m.enquiry_id IS NULL ORDER BY m.lead_score DESC LIMIT 20").all(org).map((r) => ({ thread_id: r.id, contact: r.contact_name || r.contact_address, score: r.lead_score, band: r.lead_band, reasons: J(r.lead_reasons_json, []), summary: r.summary, basis: 'estimate' }));
    return { follow_ups: followUps({ threads }), escalations: esc, duplicates: dups, leads, reminders: { rule_on: Boolean(reminderRule), upcoming: reminders } };
  }

  // ---------------- website contact forms ----------------
  function contactForm(slug, d) {
    const org = db.prepare('SELECT o.id FROM organisations o WHERE o.slug=?').get(slug)?.id || db.prepare('SELECT owner_key id FROM seo_sites WHERE slug=?').get(slug)?.id;
    if (!org || isPlatform(org)) return { ok: false, status: 404, error: 'This form is not available.' };
    const address = d.email || d.phone;
    const r = pipeline.createEnquiry(org, 'website_form', { title: `Website enquiry from ${d.name}`.slice(0, 240), details: d.message, channel: 'website', customer: { name: d.name, email: d.email || null, phone: d.phone || null } });
    const inbound = recordInboundRef.current(db, { organisation_id: org, channel: 'website', contact_address: address, contact_name: d.name, subject: 'Website enquiry', body: d.message, provider: 'website_form', external_message_id: null });
    db.prepare('UPDATE comms_thread_meta SET enquiry_id=COALESCE(enquiry_id,?),customer_id=COALESCE(customer_id,?) WHERE thread_id=?').run(r.id, r.customer_id, inbound.thread_id);
    for (const [ch, a] of [['email', d.email], ['sms', d.phone]]) if (a && d.marketing_consent) consent(org, ch, a, { status: 'granted', source: 'website_form', evidence: `Ticked "${d.consent_text || 'Send me news and offers'}" on the contact form`, customer_id: r.customer_id }, null);
    notify(org, { kind: 'website_enquiry', title: 'New website enquiry', body: `${d.name}: ${String(d.message).slice(0, 120)}`, link: '#b02/enquiries' });
    return { ok: true, enquiry_id: r.id };
  }
  const recordInboundRef = { current: null };

  // ---------------- consent, suppression, unsubscribe ----------------
  function consent(owner, channel, address, { status, source, evidence = '', customer_id = null }, actor) {
    const a = normAddr(channel, address); if (!a) return false;
    db.prepare(`INSERT INTO marketing_consents(owner_key,channel,address,customer_id,status,source,evidence,recorded_by,granted_at,withdrawn_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(owner_key,channel,address) DO UPDATE SET status=excluded.status,source=excluded.source,evidence=excluded.evidence,recorded_by=excluded.recorded_by,customer_id=COALESCE(excluded.customer_id,marketing_consents.customer_id),granted_at=CASE WHEN excluded.status='granted' THEN excluded.granted_at ELSE marketing_consents.granted_at END,withdrawn_at=CASE WHEN excluded.status='withdrawn' THEN excluded.withdrawn_at ELSE NULL END,updated_at=excluded.updated_at`)
      .run(owner, channel, a, customer_id, status, source, String(evidence).slice(0, 500), actor, status === 'granted' ? iso() : null, status === 'withdrawn' ? iso() : null, iso());
    if (status === 'granted') db.prepare("DELETE FROM marketing_suppressions WHERE owner_key=? AND channel=? AND address=? AND reason IN ('unsubscribe','stop_reply','unsubscribe_reply','manual')").run(owner, channel, a);
    return true;
  }
  function suppress(owner, channel, address, reason, source, actor) {
    const a = normAddr(channel, address); if (!a) return false;
    db.prepare('INSERT OR IGNORE INTO marketing_suppressions(owner_key,channel,address,reason,source,created_by,created_at) VALUES (?,?,?,?,?,?,?)').run(owner, channel, a, reason, source || null, actor || null, iso());
    db.prepare("UPDATE marketing_consents SET status='withdrawn',withdrawn_at=?,updated_at=? WHERE owner_key=? AND channel=? AND address=?").run(iso(), iso(), owner, channel, a);
    return true;
  }
  const token = (campaignId, address) => crypto.createHmac('sha256', secret()).update(`${campaignId}|${address}`).digest('base64url').slice(0, 32);
  function unsubscribe(tok, how = 'link') {
    const r = db.prepare('SELECT r.*, c.channel FROM comms_campaign_recipients r JOIN comms_campaigns c ON c.id=r.campaign_id WHERE r.token=?').get(String(tok || ''));
    if (!r) return null;
    suppress(r.owner_key, r.channel === 'sms' ? 'sms' : 'email', r.address, 'unsubscribe', `campaign ${r.campaign_id} (${how})`, null);
    db.prepare('UPDATE comms_campaign_recipients SET unsubscribed_at=COALESCE(unsubscribed_at,?) WHERE token=?').run(iso(), r.token);
    return { business: business(r.owner_key).name, address: r.address, channel: r.channel };
  }
  function click(tok) { const r = db.prepare('SELECT r.*, c.cta_url FROM comms_campaign_recipients r JOIN comms_campaigns c ON c.id=r.campaign_id WHERE r.token=?').get(String(tok || '')); if (!r || !r.cta_url) return null; db.prepare('UPDATE comms_campaign_recipients SET clicked_at=COALESCE(clicked_at,?) WHERE token=?').run(iso(), r.token); return r.cta_url; }

  // ---------------- audiences ----------------
  // Marketing goes only to people with recorded consent for that channel and never to suppressed addresses.
  function audience(owner, channel, segment = {}) {
    if (channel === 'social') return { eligible: [], excluded: { no_consent: 0, suppressed: 0, no_address: 0 }, total: 0 };
    const rows = isPlatform(owner)
      ? (channel === 'email' ? db.prepare("SELECT id, email address, full_name name, NULL customer_id, organisation_name area FROM newsletter_subscribers WHERE status='subscribed'").all() : [])
      : db.prepare(`SELECT c.id customer_id, c.name, c.email, c.phone, c.address, c.status, c.source, c.created_at,
          (SELECT MAX(start_at) FROM work_orders w WHERE w.customer_id=c.id AND w.organisation_id=c.organisation_id) last_job,
          (SELECT GROUP_CONCAT(lower(title),' | ') FROM work_orders w WHERE w.customer_id=c.id AND w.organisation_id=c.organisation_id) job_titles
          FROM tenant_customers c WHERE c.organisation_id=?`).all(owner).filter((c) => {
        if (segment.statuses?.length && !segment.statuses.includes(c.status)) return false;
        if (segment.sources?.length && !segment.sources.includes(c.source)) return false;
        if (segment.area && !String(c.address || '').toLowerCase().includes(String(segment.area).toLowerCase())) return false;
        if (segment.service && !String(c.job_titles || '').includes(String(segment.service).toLowerCase())) return false;
        if (segment.last_job_before && !(c.last_job && c.last_job < segment.last_job_before)) return false;
        if (segment.last_job_after && !(c.last_job && c.last_job >= segment.last_job_after)) return false;
        if (segment.created_after && c.created_at < segment.created_after) return false;
        return true;
      }).map((c) => ({ ...c, address: channel === 'email' ? normEmail(c.email) : normPhone(c.phone) }));
    const excluded = { no_consent: 0, suppressed: 0, no_address: 0 }, eligible = [], seen = new Set();
    for (const r of rows) {
      const a = isPlatform(owner) ? normEmail(r.address) : r.address;
      if (!a || (channel === 'email' && !/@/.test(a)) || (channel === 'sms' && !/^\+?\d{9,15}$/.test(a))) { excluded.no_address++; continue; }
      if (seen.has(a)) continue; seen.add(a);
      if (db.prepare('SELECT 1 FROM marketing_suppressions WHERE owner_key=? AND channel=? AND address=?').get(owner, channel, a)) { excluded.suppressed++; continue; }
      if (!isPlatform(owner) && !db.prepare("SELECT 1 FROM marketing_consents WHERE owner_key=? AND channel=? AND address=? AND status='granted'").get(owner, channel, a)) { excluded.no_consent++; continue; }
      eligible.push({ address: a, customer_id: r.customer_id || null, name: r.name || '' });
    }
    return { eligible, excluded, total: rows.length };
  }

  // ---------------- campaigns ----------------
  function campaignOut(c) { if (!c) return null; const aud = audience(c.owner_key, c.channel, J(c.segment_json, {})); return { ...c, segment: J(c.segment_json, {}), social_targets: J(c.social_targets_json, []), segment_json: undefined, social_targets_json: undefined, audience: { eligible: aud.eligible.length, excluded: aud.excluded, total: aud.total, sample: aud.eligible.slice(0, 5).map((r) => r.name || r.address) }, stats: counts(c.id), recommendations: recommend(c), compliance: compliance(c) }; }
  function counts(id) {
    const r = db.prepare("SELECT COUNT(*) recipients, SUM(status='sent') sent, SUM(status='failed') failed, SUM(clicked_at IS NOT NULL) clicked, SUM(unsubscribed_at IS NOT NULL) unsubscribed FROM comms_campaign_recipients WHERE campaign_id=?").get(id);
    const delivered = db.prepare("SELECT COUNT(*) n FROM comms_campaign_recipients r JOIN communication_deliveries d ON d.provider_id=r.provider_id WHERE r.campaign_id=? AND d.status IN ('delivered','opened')").get(id).n;
    const opened = db.prepare("SELECT COUNT(*) n FROM comms_campaign_recipients r JOIN communication_deliveries d ON d.provider_id=r.provider_id WHERE r.campaign_id=? AND d.status='opened'").get(id).n;
    const c = db.prepare('SELECT owner_key,sent_at FROM comms_campaigns WHERE id=?').get(id);
    const replies = c?.sent_at && !isPlatform(c.owner_key) ? db.prepare("SELECT COUNT(DISTINCT m.thread_id) n FROM comms_thread_meta m WHERE m.campaign_id=?").get(id).n : 0;
    const enquiries = c?.sent_at && !isPlatform(c.owner_key) ? db.prepare("SELECT COUNT(*) n FROM tenant_documents d WHERE d.organisation_id=? AND d.kind='enquiry' AND d.created_at>=? AND d.created_at<=? AND d.customer_id IN (SELECT customer_id FROM comms_campaign_recipients WHERE campaign_id=? AND status='sent')").get(c.owner_key, c.sent_at, iso(Date.parse(c.sent_at) + 30 * 86400000), id).n : 0;
    return { recipients: r.recipients || 0, sent: r.sent || 0, failed: r.failed || 0, delivered, opened, clicked: r.clicked || 0, unsubscribed: r.unsubscribed || 0, replies, enquiries_30d: enquiries, note: 'From provider receipts and Super Pro records. Opens are a tracking signal and undercount (many apps block it).' };
  }
  function compliance(c) {
    const issues = [];
    if (c.channel === 'email') { if (!c.subject) issues.push('Add a subject line.'); }
    if (c.channel === 'sms' && String(c.body).length + 30 > 320) issues.push('SMS is longer than two messages once the opt-out line is added.');
    if (!String(c.body).trim()) issues.push('Write the message.');
    const b = business(c.owner_key);
    if (c.channel !== 'social' && !b.name) issues.push('Your business name is needed to identify you as the sender.');
    if (c.channel === 'email' && !b.address && !b.abn) issues.push('Add your business address or ABN so recipients can identify you (shown in the footer).');
    if (/\{(?!first_name\})[^}]*\}/.test(c.body)) issues.push('Only {first_name} can be used as a placeholder.');
    return { ok: !issues.length, issues, rules: ['Only people who agreed to marketing on this channel receive it.', 'Every message identifies the business and has a working unsubscribe (email link, SMS "Reply STOP").', 'Unsubscribes and STOP replies are honoured straight away, and suppressed addresses are never sent to.', 'Every bulk send needs approval by an authorised person.'] };
  }
  // AI creative recommendations: plain rules from the message itself, plus what earlier campaigns measured.
  function recommend(c) {
    const out = [], body = String(c.body || '');
    if (c.channel === 'email') { const s = String(c.subject || ''); if (s.length < 20 || s.length > 60) out.push(`Subject is ${s.length} characters; 20 to 60 usually reads best on phones.`); if (!/\{first_name\}/.test(body)) out.push('Add {first_name} to the greeting to personalise it.'); if (!c.cta_url) out.push('Add one clear link (for example "Book a service") so you can see who clicked.'); if (SPAM_WORDS.test(`${s} ${body}`)) out.push('Words like "FREE!!!" or "guaranteed" make messages look like spam; say it plainly.'); if (/[A-Z]{6,}/.test(s)) out.push('Avoid capitals in the subject.'); }
    if (c.channel === 'sms') { if (body.length > 140) out.push(`SMS is ${body.length} characters; keep it under 140 so the opt-out line fits in one message.`); if (!/\b(book|call|reply|visit|quote)\b/i.test(body)) out.push('Say what to do next (book, call, reply).'); }
    if (c.channel === 'social') { if (body.length > 280) out.push('Shorter posts work better on X; the calendar lets you adjust each platform.'); if (!c.social_targets_json || !J(c.social_targets_json, []).length) out.push('Choose at least one platform.'); }
    const past = db.prepare("SELECT id FROM comms_campaigns WHERE owner_key=? AND channel=? AND status='sent' AND id<>? ORDER BY sent_at DESC LIMIT 10").all(c.owner_key, c.channel, c.id).map((x) => ({ id: x.id, ...counts(x.id) })).filter((x) => x.sent >= 5);
    if (past.length) { const best = past.sort((a, b) => b.clicked / b.sent - a.clicked / a.sent)[0]; out.push(`Your best recent ${c.channel} campaign had ${Math.round((best.clicked / best.sent) * 100)}% clicks from ${best.sent} sends (measured).`); }
    else out.push('General guidance, not measured for your audience: mid-week mornings are a common choice for service businesses.');
    return out;
  }
  function saveCampaign(owner, d, actor, id = null) {
    const now = iso();
    if (id) {
      const c = db.prepare('SELECT * FROM comms_campaigns WHERE id=? AND owner_key=?').get(id, owner); if (!c) return { ok: false, status: 404, error: 'Campaign not found.' };
      if (!['draft', 'rejected', 'approved', 'pending_approval'].includes(c.status)) return { ok: false, status: 409, error: 'This campaign has already been sent or scheduled.' };
      db.prepare("UPDATE comms_campaigns SET name=?,subject=?,body=?,cta_url=?,segment_json=?,social_targets_json=?,send_at=?,revision=revision+1,status='draft',approved_revision=NULL,updated_at=? WHERE id=?").run(d.name, d.subject || null, d.body, d.cta_url || null, JSON.stringify(d.segment || {}), JSON.stringify(d.social_targets || []), d.send_at || null, now, id);
      return { ok: true, campaign: campaignOut(db.prepare('SELECT * FROM comms_campaigns WHERE id=?').get(id)) };
    }
    const nid = uid();
    db.prepare("INSERT INTO comms_campaigns(id,owner_key,name,channel,status,subject,body,cta_url,segment_json,social_targets_json,send_at,created_by,created_at,updated_at) VALUES (?,?,?,?,'draft',?,?,?,?,?,?,?,?,?)").run(nid, owner, d.name, d.channel, d.subject || null, d.body, d.cta_url || null, JSON.stringify(d.segment || {}), JSON.stringify(d.social_targets || []), d.send_at || null, actor, now, now);
    return { ok: true, campaign: campaignOut(db.prepare('SELECT * FROM comms_campaigns WHERE id=?').get(nid)) };
  }
  // Request approval: every bulk send is Level 3 in the automation engine (send_campaign), with its numbers shown.
  async function requestSend(owner, id, actor) {
    const c = db.prepare('SELECT * FROM comms_campaigns WHERE id=? AND owner_key=?').get(id, owner); if (!c) return { ok: false, status: 404, error: 'Campaign not found.' };
    if (!['draft', 'rejected'].includes(c.status)) return { ok: false, status: 409, error: c.status === 'pending_approval' ? 'This campaign is already waiting for approval.' : 'This campaign has already been approved or sent.' };
    const comp = compliance(c); if (!comp.ok) return { ok: false, status: 409, error: comp.issues.join(' ') };
    if (c.channel !== 'social' && !audience(owner, c.channel, J(c.segment_json, {})).eligible.length) return { ok: false, status: 409, error: 'Nobody in this audience has agreed to receive marketing on this channel.' };
    const engine = engineRef.current;
    const r = engine.startRun({ id: null, scope: isPlatform(owner) ? 'platform' : 'business', organisation_id: isPlatform(owner) ? null : owner, current_version: 0 }, { trigger: 'manual', key: `campaign:${c.id}:r${c.revision}`, payload: { campaign_id: c.id }, definition: { trigger: 'manual', action: 'send_campaign', conditions: [], params: { campaign_id: c.id, revision: c.revision }, analysis: 'rules', always_approve: true, approval_expires_hours: 168 }, actor: actor ? { id: actor } : null });
    await r.promise;
    db.prepare("UPDATE comms_campaigns SET status='pending_approval',run_id=?,updated_at=? WHERE id=?").run(r.id, iso(), c.id);
    return { ok: true, run_id: r.id };
  }
  function campaignProposal(owner, id, revision) {
    const c = db.prepare('SELECT * FROM comms_campaigns WHERE id=? AND owner_key=?').get(id, owner); if (!c) return null;
    const aud = audience(owner, c.channel, J(c.segment_json, {}));
    const segments = c.channel === 'sms' ? Math.ceil((String(c.body).length + 30) / 153) : 0;
    const cost = c.channel === 'sms' && env.SMS_COST_CENTS ? aud.eligible.length * segments * Number(env.SMS_COST_CENTS) : null;
    return { campaign_id: c.id, revision, current_revision: c.revision, name: c.name, channel: c.channel, recipients: aud.eligible.length, excluded: aud.excluded, sample: aud.eligible.slice(0, 5).map((x) => x.name || x.address), send_at: c.send_at, subject: c.subject, body: c.body, estimated_cost_cents: cost, social_targets: J(c.social_targets_json, []) };
  }
  // Called by the approved run. Sends in batches through the job queue; can be paused; never sends a changed draft.
  function approveCampaign(owner, p, approver) {
    const c = db.prepare('SELECT * FROM comms_campaigns WHERE id=? AND owner_key=?').get(p.campaign_id, owner);
    if (!c) throw Object.assign(new Error('Campaign not found.'), { permanent: true });
    if (c.revision !== p.revision) throw Object.assign(new Error('The campaign was edited after it was submitted. Submit it again.'), { permanent: true });
    db.prepare("UPDATE comms_campaigns SET status=?,approved_revision=revision,updated_at=? WHERE id=?").run(c.send_at && Date.parse(c.send_at) > Date.now() ? 'scheduled' : 'approved', iso(), c.id);
    if (c.channel === 'social') return socialCampaign(owner, c, approver);
    const aud = audience(owner, c.channel, J(c.segment_json, {}));
    const ins = db.prepare("INSERT OR IGNORE INTO comms_campaign_recipients(campaign_id,owner_key,address,customer_id,name,status,token) VALUES (?,?,?,?,?,'queued',?)");
    db.transaction(() => { for (const r of aud.eligible) ins.run(c.id, owner, r.address, r.customer_id, r.name, token(c.id, r.address)); })();
    return { queued: aud.eligible.length, send_at: c.send_at && Date.parse(c.send_at) > Date.now() ? c.send_at : null };
  }
  function socialCampaign(owner, c, approver) {
    const targets = J(c.social_targets_json, []); const ids = [];
    // Social posts join the content calendar already approved (this approval is the sign-off). The calendar publishes
    // them on time through the connected accounts, or shows them as failed if an account is not connected.
    for (const t of targets) { const id = uid(); db.prepare("INSERT INTO growth_calendar(id,organisation_id,plan_day,scheduled_at,platform,pillar,post_type,hook,body,status,approved_by,approved_at,created_at,updated_at) VALUES (?,?,0,?,?,'campaign','post',?,?,'approved',?,?,?,?)").run(id, owner, c.send_at || iso(), t, String(c.name).slice(0, 300), String(c.body).slice(0, 3000), approver || null, iso(), iso(), iso()); ids.push(id); }
    db.prepare("UPDATE comms_campaigns SET status='scheduled',social_targets_json=?,updated_at=? WHERE id=?").run(JSON.stringify(targets.map((t, i) => ({ platform: t, calendar_id: ids[i] }))), iso(), c.id);
    return { calendar_items: ids.length };
  }
  async function sendBatch(owner, campaignId, { batch = 50, isPaused = () => false } = {}) {
    const c = db.prepare('SELECT * FROM comms_campaigns WHERE id=? AND owner_key=?').get(campaignId, owner);
    if (!c || !['approved', 'scheduled', 'sending'].includes(c.status) || c.approved_revision !== c.revision) return { done: true, skipped: 'not approved' };
    if (c.send_at && Date.parse(c.send_at) > Date.now()) return { done: false, wait_until: c.send_at };
    if (isPaused()) return { done: false, paused: true };
    db.prepare("UPDATE comms_campaigns SET status='sending',updated_at=? WHERE id=?").run(iso(), c.id);
    const b = business(owner);
    const rows = db.prepare("SELECT * FROM comms_campaign_recipients WHERE campaign_id=? AND status='queued' LIMIT ?").all(c.id, batch);
    for (const r of rows) {
      if (db.prepare('SELECT 1 FROM marketing_suppressions WHERE owner_key=? AND channel=? AND address=?').get(owner, c.channel, r.address)) { db.prepare("UPDATE comms_campaign_recipients SET status='skipped_suppressed' WHERE campaign_id=? AND address=?").run(c.id, r.address); continue; }
      if (!isPlatform(owner) && !db.prepare("SELECT 1 FROM marketing_consents WHERE owner_key=? AND channel=? AND address=? AND status='granted'").get(owner, c.channel, r.address)) { db.prepare("UPDATE comms_campaign_recipients SET status='skipped_no_consent' WHERE campaign_id=? AND address=?").run(c.id, r.address); continue; }
      const first = String(r.name || '').split(' ')[0] || 'there';
      const text = String(c.body).replace(/\{first_name\}/g, first);
      try {
        const pid = c.channel === 'email' ? await sendEmail(owner, b, c, r, text) : await sendSms(owner, b, c, r, text);
        db.prepare("UPDATE comms_campaign_recipients SET status='sent',provider_id=?,sent_at=? WHERE campaign_id=? AND address=?").run(pid, iso(), c.id, r.address);
        if (pid) db.prepare("INSERT OR IGNORE INTO communication_deliveries(id,organisation_id,user_id,channel,recipient,provider,provider_id,status,category,subject,created_at) VALUES (?,?,?,?,?,?,?,'accepted','marketing',?,?)").run(uid(), isPlatform(owner) ? 'platform' : owner, null, c.channel, r.address, c.channel === 'email' ? 'resend' : 'telnyx', pid, c.subject || c.name, iso());
      } catch (e) {
        db.prepare("UPDATE comms_campaign_recipients SET status='failed',error=? WHERE campaign_id=? AND address=?").run(String(e.message).slice(0, 200), c.id, r.address);
        if (e.stopAll) { db.prepare("UPDATE comms_campaign_recipients SET status='failed',error=? WHERE campaign_id=? AND status='queued'").run(String(e.message).slice(0, 200), c.id); break; }
      }
    }
    const left = db.prepare("SELECT COUNT(*) n FROM comms_campaign_recipients WHERE campaign_id=? AND status='queued'").get(c.id).n;
    if (!left) { const s = counts(c.id); db.prepare('UPDATE comms_campaigns SET status=?,sent_at=?,error=?,updated_at=? WHERE id=?').run(s.sent ? (s.failed ? 'partly_failed' : 'sent') : 'failed', iso(), s.sent ? null : (db.prepare("SELECT error FROM comms_campaign_recipients WHERE campaign_id=? AND status='failed' LIMIT 1").get(c.id)?.error || 'Nothing could be sent.'), iso(), c.id); }
    return { done: !left, sent_now: rows.length, left };
  }
  async function sendEmail(owner, b, c, r, text) {
    const key = env.RESEND_API_KEY, from = isPlatform(owner) ? (env.PLATFORM_MAIL_FROM || env.SAAS_VERIFY_FROM) : env.SAAS_VERIFY_FROM;
    if (!key || !from) throw Object.assign(new Error('Email sending is not set up (RESEND_API_KEY and a verified sender).'), { stopAll: true });
    const unsub = `${publicBase()}/u/${r.token}`, link = c.cta_url ? `${publicBase()}/c/${r.token}` : null;
    const esc = (s) => String(s).replace(/[&<>"]/g, (x) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[x]));
    const html = `<div style="font:16px/1.5 sans-serif;max-width:600px">${text.split(/\n{2,}/).map((p) => `<p>${esc(p).replace(/\n/g, '<br>')}</p>`).join('')}${link ? `<p><a href="${esc(link)}">${'Find out more'}</a></p>` : ''}<hr><p style="font-size:12px;color:#555">Sent by ${esc(b.name)}${b.abn ? ` · ABN ${esc(b.abn)}` : ''}${b.address ? ` · ${esc(b.address)}` : ''}. You are receiving this because you agreed to hear from us. <a href="${esc(unsub)}">Unsubscribe</a>.</p></div>`;
    const res = await fetchImpl(`${String(env.RESEND_API_BASE_URL || 'https://api.resend.com').replace(/\/$/, '')}/emails`, { method: 'POST', headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' }, body: JSON.stringify({ from, to: [r.address], subject: c.subject, html, text: `${text}\n\n${link ? link + '\n\n' : ''}Sent by ${b.name}. Unsubscribe: ${unsub}`, headers: { 'List-Unsubscribe': `<${unsub}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' }, tags: [{ name: 'category', value: 'marketing' }] }) });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) throw Object.assign(new Error(j?.message || `Email provider answered ${res.status}`), { stopAll: [401, 403].includes(res.status) });
    return j.id || null;
  }
  async function sendSms(owner, b, c, r, text) {
    const from = env.TELNYX_FROM_NUMBER || env.TELNYX_PHONE_NUMBER;
    if (!env.TELNYX_API_KEY || !from) throw Object.assign(new Error('SMS sending is not set up (Telnyx).'), { stopAll: true });
    const body = `${b.name}: ${text}${c.cta_url ? ` ${publicBase()}/c/${r.token}` : ''} Reply STOP to opt out`;
    const res = await fetchImpl(`${String(env.TELNYX_API_BASE_URL || 'https://api.telnyx.com/v2').replace(/\/$/, '')}/messages`, { method: 'POST', headers: { authorization: `Bearer ${env.TELNYX_API_KEY}`, 'content-type': 'application/json' }, body: JSON.stringify({ from, to: r.address, text: body }) });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) throw Object.assign(new Error(j?.errors?.[0]?.detail || `SMS provider answered ${res.status}`), { stopAll: [401, 403].includes(res.status) });
    return j?.data?.id || null;
  }
  // Provider bounces and complaints suppress the address for its owner (Resend webhooks / Telnyx failures).
  function providerEvent(providerId, kind) { const r = db.prepare('SELECT r.*, c.channel FROM comms_campaign_recipients r JOIN comms_campaigns c ON c.id=r.campaign_id WHERE r.provider_id=?').get(providerId); if (!r) return false; suppress(r.owner_key, r.channel, r.address, kind, `provider ${kind}`, null); return true; }

  return { analyse, onInbound, inbox, folderCounts, thread, move, link, reply, sendDue, suggestions, contactForm, recordInboundRef, consent, suppress, unsubscribe, click, audience, campaignOut, saveCampaign, requestSend, campaignProposal, approveCampaign, sendBatch, providerEvent, counts, business, normAddr };
}
