import {communicationInbound} from './message-delivery.js';
import {deliverInvitation} from './invitation-delivery.js';
// Hiring: advertise roles on every channel, collect applications and documents, keep it ALL apart from the rest of the
// workspace. Separate tables, a separate file folder, owner/admin access only, nothing joined to customers, jobs, workers,
// search, exports or AI context. AI only drafts (ads, a neutral summary); a person approves and a person decides.
import { z } from 'zod';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import multer from 'multer';
import rateLimit from 'express-rate-limit';
import { appendAuditLog } from './db.js';

export const NOTICE_VERSION = '2026-10';
const OWNERS = ['owner', 'admin'];
const iso = (d = new Date()) => d.toISOString();
const clip = (s, n) => String(s || '').trim().slice(0, n);
const EMPLOYMENT = ['full_time', 'part_time', 'casual', 'contract', 'apprentice'];
const EMPLOYMENT_LABEL = { full_time: 'Full time', part_time: 'Part time', casual: 'Casual', contract: 'Contract', apprentice: 'Apprentice' };
export const PLATFORMS = {
  facebook: { label: 'Facebook', max: 900, share: (u, t) => `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(u)}` },
  instagram: { label: 'Instagram', max: 900, share: null },
  google: { label: 'Google (Business Profile / Ads)', max: 750, share: null },
  tiktok: { label: 'TikTok', max: 300, share: null },
  snapchat: { label: 'Snapchat', max: 250, share: null },
  x: { label: 'X (Twitter)', max: 270, share: (u, t) => `https://twitter.com/intent/tweet?text=${encodeURIComponent(t)}&url=${encodeURIComponent(u)}` },
  youtube: { label: 'YouTube', max: 900, share: null },
  linkedin: { label: 'LinkedIn', max: 900, share: (u) => `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(u)}` },
  whatsapp: { label: 'WhatsApp', max: 600, share: (u, t) => `https://wa.me/?text=${encodeURIComponent(`${t}\n${u}`)}` },
  sms: { label: 'SMS', max: 300, share: (u, t) => `sms:?&body=${encodeURIComponent(`${t} ${u}`)}` },
  email: { label: 'Email', max: 1500, share: (u, t, subject) => `mailto:?subject=${encodeURIComponent(subject || 'We are hiring')}&body=${encodeURIComponent(`${t}\n\n${u}`)}` },
  website: { label: 'Website / careers page', max: 1500, share: null }
};
const FILE_KINDS = ['resume', 'licence', 'certificate', 'reference', 'other'];
// Real file type from the first bytes, never from the browser's claim.
function sniff(buf) {
  if (buf.length < 12) return null;
  if (buf.slice(0, 4).toString() === '%PDF') return { mime: 'application/pdf', ext: 'pdf' };
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return { mime: 'image/jpeg', ext: 'jpg' };
  if (buf.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return { mime: 'image/png', ext: 'png' };
  if (buf.slice(0, 4).toString() === 'RIFF' && buf.slice(8, 12).toString() === 'WEBP') return { mime: 'image/webp', ext: 'webp' };
  if (buf[0] === 0x50 && buf[1] === 0x4b && buf[2] === 0x03 && buf[3] === 0x04) return { mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', ext: 'docx' };
  return null;
}
const parseJson = (t) => { try { const m = String(t || '').match(/\{[\s\S]*\}/); return m ? JSON.parse(m[0]) : null; } catch { return null; } };

export function installHiring(app, { db, env = {}, uploadRoot, requireSaasUser, requireSaasRole, saasAudit, generateAiText, notify }) {
  db.exec(`CREATE TABLE IF NOT EXISTS hiring_roles (
      id TEXT PRIMARY KEY, organisation_id TEXT NOT NULL, title TEXT NOT NULL, employment_type TEXT NOT NULL, location TEXT, pay_text TEXT,
      description TEXT, requirements TEXT, status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('draft','open','closed')),
      public_token TEXT NOT NULL UNIQUE, created_by TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
      FOREIGN KEY(organisation_id) REFERENCES organisations(id) ON DELETE CASCADE);
    CREATE INDEX IF NOT EXISTS idx_hiring_roles_org ON hiring_roles(organisation_id, status);
    CREATE TABLE IF NOT EXISTS hiring_ads (
      id TEXT PRIMARY KEY, organisation_id TEXT NOT NULL, role_id TEXT NOT NULL, platform TEXT NOT NULL, headline TEXT, body TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','approved','shared')), approved_by TEXT, approved_at TEXT, shared_at TEXT, created_at TEXT NOT NULL,
      FOREIGN KEY(role_id) REFERENCES hiring_roles(id) ON DELETE CASCADE);
    CREATE INDEX IF NOT EXISTS idx_hiring_ads_role ON hiring_ads(role_id);
    CREATE TABLE IF NOT EXISTS hiring_applicants (
      id TEXT PRIMARY KEY, organisation_id TEXT NOT NULL, role_id TEXT NOT NULL, full_name TEXT NOT NULL, email TEXT, phone TEXT, suburb TEXT,
      availability TEXT, message TEXT, source TEXT, status TEXT NOT NULL DEFAULT 'new' CHECK(status IN ('new','shortlisted','interview','hired','declined')),
      notes TEXT, ai_summary TEXT, ai_summary_at TEXT, consent_at TEXT NOT NULL, notice_version TEXT NOT NULL, retention_until TEXT NOT NULL,
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
      FOREIGN KEY(role_id) REFERENCES hiring_roles(id) ON DELETE CASCADE);
    CREATE INDEX IF NOT EXISTS idx_hiring_app_org ON hiring_applicants(organisation_id, status, created_at);
    CREATE TABLE IF NOT EXISTS hiring_documents (
      id TEXT PRIMARY KEY, organisation_id TEXT NOT NULL, applicant_id TEXT NOT NULL, kind TEXT NOT NULL, original_name TEXT NOT NULL,
      stored_path TEXT NOT NULL, mime TEXT NOT NULL, size_bytes INTEGER NOT NULL, created_at TEXT NOT NULL,
      FOREIGN KEY(applicant_id) REFERENCES hiring_applicants(id) ON DELETE CASCADE);
    CREATE INDEX IF NOT EXISTS idx_hiring_docs ON hiring_documents(applicant_id);`);

  db.exec("CREATE TABLE IF NOT EXISTS hiring_invitation_sends(id TEXT NOT NULL,organisation_id TEXT NOT NULL,body_hash TEXT NOT NULL,result_json TEXT,PRIMARY KEY(organisation_id,id))");
  const guard = [requireSaasUser, requireSaasRole(...OWNERS)];
  const org = (req) => req.saas.organisation_id;
  const base = () => String(env.PUBLIC_BASE_URL || '').replace(/\/$/, '');
  const hiringRoot = path.join(uploadRoot, 'hiring');
  const bizName = (o) => { const r = db.prepare(`SELECT COALESCE(display_name,name) n FROM organisations WHERE id=?`).get(o); return r?.n || 'Our business'; };
  const roleOf = (o, id) => db.prepare(`SELECT * FROM hiring_roles WHERE id=? AND organisation_id=?`).get(id, o);
  const applyLink = (role, src) => `${base()}/saas/apply.html?t=${role.public_token}${src ? `&src=${src}` : ''}`;
  const hlog = (req, action, entity, id, detail = {}) => { try { saasAudit(req, `hiring.${action}`, entity, id, detail); } catch { /* audit is best effort here */ } };
  const publicRole = (r) => ({ id: r.id, title: r.title, employment_type: r.employment_type, employment_label: EMPLOYMENT_LABEL[r.employment_type], location: r.location || '', pay_text: r.pay_text || '', description: r.description || '', requirements: r.requirements || '', status: r.status, apply_link: applyLink(r), created_at: r.created_at, updated_at: r.updated_at });
  const removeFiles = (applicantId) => {
    for (const d of db.prepare(`SELECT stored_path FROM hiring_documents WHERE applicant_id=?`).all(applicantId)) { try { fs.rmSync(d.stored_path, { force: true }); } catch { /* already gone */ } }
  };

  /* ------------------------------ owner/admin: roles ------------------------------ */
  app.get('/api/saas/hiring/summary', ...guard, (req, res) => {
    const o = org(req);
    const counts = Object.fromEntries(db.prepare(`SELECT status, COUNT(*) c FROM hiring_applicants WHERE organisation_id=? GROUP BY status`).all(o).map((r) => [r.status, r.c]));
    res.json({ ok: true, open_roles: db.prepare(`SELECT COUNT(*) c FROM hiring_roles WHERE organisation_id=? AND status='open'`).get(o).c, applicants: counts, platforms: Object.entries(PLATFORMS).map(([id, p]) => ({ id, label: p.label })), employment: EMPLOYMENT.map((id) => ({ id, label: EMPLOYMENT_LABEL[id] })), notice_version: NOTICE_VERSION });
  });
  app.get('/api/saas/hiring/roles', ...guard, (req, res) => {
    const o = org(req);
    const rows = db.prepare(`SELECT r.*, (SELECT COUNT(*) FROM hiring_applicants a WHERE a.role_id=r.id) applicants FROM hiring_roles r WHERE r.organisation_id=? ORDER BY r.created_at DESC`).all(o);
    res.json({ ok: true, roles: rows.map((r) => ({ ...publicRole(r), applicants: r.applicants })) });
  });
  const roleSchema = z.object({
    title: z.string().trim().min(2).max(120), employment_type: z.enum(EMPLOYMENT), location: z.string().trim().max(160).optional().default(''),
    pay_text: z.string().trim().max(120).optional().default(''), description: z.string().trim().max(4000).optional().default(''), requirements: z.string().trim().max(3000).optional().default('')
  });
  app.post('/api/saas/hiring/roles', ...guard, (req, res) => {
    const p = roleSchema.safeParse(req.body);
    if (!p.success) return res.status(400).json({ ok: false, error: p.error.issues[0]?.message || 'Check the role details.' });
    const o = org(req), id = crypto.randomUUID(), now = iso(), token = crypto.randomBytes(12).toString('hex');
    db.prepare(`INSERT INTO hiring_roles (id,organisation_id,title,employment_type,location,pay_text,description,requirements,status,public_token,created_by,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,'open',?,?,?,?)`)
      .run(id, o, p.data.title, p.data.employment_type, p.data.location, p.data.pay_text, p.data.description, p.data.requirements, token, req.saas.user_id, now, now);
    hlog(req, 'role_created', 'hiring_role', id);
    res.status(201).json({ ok: true, role: publicRole(roleOf(o, id)) });
  });
  app.put('/api/saas/hiring/roles/:id', ...guard, (req, res) => {
    const r = roleOf(org(req), req.params.id); if (!r) return res.status(404).json({ ok: false, error: 'Role not found.' });
    const p = roleSchema.safeParse(req.body); if (!p.success) return res.status(400).json({ ok: false, error: p.error.issues[0]?.message || 'Check the role details.' });
    db.prepare(`UPDATE hiring_roles SET title=?,employment_type=?,location=?,pay_text=?,description=?,requirements=?,updated_at=? WHERE id=?`).run(p.data.title, p.data.employment_type, p.data.location, p.data.pay_text, p.data.description, p.data.requirements, iso(), r.id);
    hlog(req, 'role_updated', 'hiring_role', r.id);
    res.json({ ok: true, role: publicRole(roleOf(org(req), r.id)) });
  });
  app.post('/api/saas/hiring/roles/:id/:action(open|close)', ...guard, (req, res) => {
    const r = roleOf(org(req), req.params.id); if (!r) return res.status(404).json({ ok: false, error: 'Role not found.' });
    const next = req.params.action === 'open' ? 'open' : 'closed';
    db.prepare(`UPDATE hiring_roles SET status=?,updated_at=? WHERE id=?`).run(next, iso(), r.id);
    hlog(req, `role_${next}`, 'hiring_role', r.id);
    res.json({ ok: true, status: next, note: next === 'closed' ? 'The apply link now shows that applications are closed.' : 'The apply link is open again.' });
  });

  /* ------------------------------ owner/admin: ads ------------------------------ */
  const adView = (ad, role) => {
    const p = PLATFORMS[ad.platform]; const link = applyLink(role, ad.platform);
    return { id: ad.id, platform: ad.platform, label: p?.label || ad.platform, headline: ad.headline || '', body: ad.body, status: ad.status, approved_at: ad.approved_at, shared_at: ad.shared_at, link,
      share_url: ad.status !== 'draft' && p?.share ? p.share(link, ad.body, ad.headline) : null, max: p?.max };
  };
  function templateAd(platform, role, biz) {
    const link = applyLink(role, platform), type = EMPLOYMENT_LABEL[role.employment_type].toLowerCase();
    const where = role.location ? ` in ${role.location}` : '';
    const pay = role.pay_text ? ` ${role.pay_text}.` : '';
    const long = `${biz} is hiring: ${role.title} (${type})${where}.${pay}\n\n${clip(role.description, 500)}${role.requirements ? `\n\nYou will need: ${clip(role.requirements, 300)}` : ''}\n\nApply in two minutes: ${link}`;
    const short = `${biz} is hiring a ${role.title}${where}. ${type[0].toUpperCase()}${type.slice(1)}.${pay} Apply: ${link}`;
    const body = ['x', 'snapchat', 'tiktok', 'sms'].includes(platform) ? short : long;
    return { headline: `${role.title} wanted${where}`, body: clip(body, PLATFORMS[platform].max) };
  }
  app.get('/api/saas/hiring/roles/:id/ads', ...guard, (req, res) => {
    const role = roleOf(org(req), req.params.id); if (!role) return res.status(404).json({ ok: false, error: 'Role not found.' });
    res.json({ ok: true, ads: db.prepare(`SELECT * FROM hiring_ads WHERE role_id=? ORDER BY created_at DESC`).all(role.id).map((a) => adView(a, role)), apply_link: applyLink(role) });
  });
  const genSchema = z.object({ platforms: z.array(z.enum(Object.keys(PLATFORMS))).min(1).max(12) });
  app.post('/api/saas/hiring/roles/:id/ads/generate', ...guard, async (req, res) => {
    const o = org(req), role = roleOf(o, req.params.id); if (!role) return res.status(404).json({ ok: false, error: 'Role not found.' });
    const p = genSchema.safeParse(req.body); if (!p.success) return res.status(400).json({ ok: false, error: 'Choose at least one place to advertise.' });
    const biz = bizName(o); let ai = null;
    try {
      const r = await generateAiText({ remember_conversation: false, thinking_level: 'minimal', max_output_tokens: 3000, system: 'You write honest, plain-English job adverts for Australian small businesses. Never mention age, gender, race, religion, family status or any protected attribute. Never promise pay or conditions that are not given. Reply with JSON only.',
        messages: [{ role: 'user', content: `Business: ${biz}\nRole: ${role.title} (${EMPLOYMENT_LABEL[role.employment_type]})\nLocation: ${role.location || 'not stated'}\nPay: ${role.pay_text || 'not stated'}\nAbout the job: ${clip(role.description, 1500)}\nRequirements: ${clip(role.requirements, 1000)}\nWrite one advert for each of these channels, using the character limits given. Put the placeholder {{LINK}} where the apply link goes. Channels and limits: ${p.data.platforms.map((k) => `${k} (${PLATFORMS[k].max})`).join(', ')}.\nReturn JSON: {"ads":{"<channel>":{"headline":"","body":""}}}` }] });
      ai = parseJson(r.text)?.ads || null;
    } catch { /* AI not configured: use plain templates */ }
    const made = [];
    const ins = db.prepare(`INSERT INTO hiring_ads (id,organisation_id,role_id,platform,headline,body,status,created_at) VALUES (?,?,?,?,?,?, 'draft', ?)`);
    for (const pf of p.data.platforms) {
      const a = ai?.[pf]; const link = applyLink(role, pf);
      const t = a && typeof a.body === 'string' && a.body.trim() ? { headline: clip(a.headline, 140), body: clip(a.body.replaceAll('{{LINK}}', link), PLATFORMS[pf].max + 120) } : templateAd(pf, role, biz);
      if (!t.body.includes(link)) t.body = `${t.body}\n${link}`;
      const id = crypto.randomUUID(); ins.run(id, o, role.id, pf, t.headline, t.body, iso()); made.push(id);
    }
    hlog(req, 'ads_generated', 'hiring_role', role.id, { count: made.length, ai: Boolean(ai) });
    res.status(201).json({ ok: true, ai_written: Boolean(ai), ads: made.map((id) => adView(db.prepare(`SELECT * FROM hiring_ads WHERE id=?`).get(id), role)), note: 'These are drafts. Read and edit each one, then approve it before it can be shared.' });
  });
  const adSchema = z.object({ headline: z.string().trim().max(140).optional(), body: z.string().trim().min(10).max(3000) });
  const adOf = (o, id) => db.prepare(`SELECT * FROM hiring_ads WHERE id=? AND organisation_id=?`).get(id, o);
  app.put('/api/saas/hiring/ads/:id', ...guard, (req, res) => {
    const a = adOf(org(req), req.params.id); if (!a) return res.status(404).json({ ok: false, error: 'Advert not found.' });
    const p = adSchema.safeParse(req.body); if (!p.success) return res.status(400).json({ ok: false, error: 'The advert needs some text (at least 10 characters).' });
    db.prepare(`UPDATE hiring_ads SET headline=?,body=?,status='draft',approved_by=NULL,approved_at=NULL WHERE id=?`).run(p.data.headline ?? a.headline, p.data.body, a.id);
    hlog(req, 'ad_edited', 'hiring_ad', a.id);
    res.json({ ok: true, note: 'Saved. Editing an advert sends it back to draft so you can approve the new wording.' });
  });
  app.post('/api/saas/hiring/ads/:id/:action(approve|shared)', ...guard, (req, res) => {
    const a = adOf(org(req), req.params.id); if (!a) return res.status(404).json({ ok: false, error: 'Advert not found.' });
    if (req.params.action === 'approve') {
      db.prepare(`UPDATE hiring_ads SET status='approved',approved_by=?,approved_at=? WHERE id=?`).run(req.saas.user_id, iso(), a.id); hlog(req, 'ad_approved', 'hiring_ad', a.id, { platform: a.platform });
    } else {
      if (a.status === 'draft') return res.status(409).json({ ok: false, error: 'Approve the advert first.' });
      db.prepare(`UPDATE hiring_ads SET status='shared',shared_at=? WHERE id=?`).run(iso(), a.id); hlog(req, 'ad_shared', 'hiring_ad', a.id, { platform: a.platform });
    }
    const role = roleOf(org(req), a.role_id);
    res.json({ ok: true, ad: adView(adOf(org(req), a.id), role) });
  });

  app.post('/api/saas/hiring/ads/:id/send',...guard,async(req,res)=>{
    const o=org(req),ad=adOf(o,req.params.id);if(!ad)return res.status(404).json({ok:false,error:'Advert not found.'});
    if(ad.status==='draft')return res.status(409).json({ok:false,error:'Approve the advert before sending invitations.'});
    const role=roleOf(o,ad.role_id);if(!role||role.status!=='open')return res.status(409).json({ok:false,error:'This hiring role is closed.'});
    const p=z.object({request_id:z.string().uuid(),email:z.string().trim().email().optional().or(z.literal('')),phone:z.string().trim().max(30).optional(),message:z.string().trim().max(300).default(''),follow_up:z.boolean().default(true)}).refine(v=>v.email||v.phone).safeParse(req.body);
    if(!p.success)return res.status(400).json({ok:false,error:'Enter a recipient email or mobile and a short message of up to 300 characters.'});
    const input=p.data,hash=crypto.createHash('sha256').update(JSON.stringify(input)).digest('hex');
    const prior=db.prepare('SELECT * FROM hiring_invitation_sends WHERE organisation_id=? AND id=?').get(o,input.request_id);
    if(prior){if(prior.body_hash!==hash||!prior.result_json)return res.status(409).json({ok:false,error:'This send request is already processing or its details changed.'});return res.json(JSON.parse(prior.result_json))}
    db.prepare('INSERT INTO hiring_invitation_sends(id,organisation_id,body_hash) VALUES (?,?,?)').run(input.request_id,o,hash);
    const delivery=await deliverInvitation(env,{organisationId:o,userId:req.saas.user_id,email:input.email,phone:input.phone,businessName:req.saas.organisation_name||'Your business',heading:`Invitation to apply: ${role.title}`,url:applyLink(role,'email'),message:input.message,followUp:input.follow_up,category:'hiring_invitation'});
    const result={ok:true,delivery,note:'Provider acceptance is not delivery confirmation. Open Notifications → Delivery activity for updates.'};
    db.prepare('UPDATE hiring_invitation_sends SET result_json=? WHERE organisation_id=? AND id=?').run(JSON.stringify(result),o,input.request_id);
    hlog(req,'invitation_sent','hiring_ad',ad.id,{email:delivery.email.sent,sms:delivery.sms.sent});res.json(result);
  });

  /* ------------------------------ owner/admin: applicants ------------------------------ */
  const appView = (r, docs) => ({ id: r.id, role_id: r.role_id, role_title: r.role_title, full_name: r.full_name, email: r.email, phone: r.phone, suburb: r.suburb, availability: r.availability, message: r.message, source: r.source,
    status: r.status, notes: r.notes || '', ai_summary: r.ai_summary || '', ai_summary_at: r.ai_summary_at, consent_at: r.consent_at, retention_until: r.retention_until, created_at: r.created_at, documents: docs });
  const docsOf = (id) => db.prepare(`SELECT id,kind,original_name,mime,size_bytes,created_at FROM hiring_documents WHERE applicant_id=? ORDER BY created_at`).all(id);
  app.get('/api/saas/hiring/applicants', ...guard, (req, res) => {
    const o = org(req), status = String(req.query.status || ''), roleId = String(req.query.role_id || '');
    const rows = db.prepare(`SELECT a.*, r.title role_title, (SELECT COUNT(*) FROM hiring_documents d WHERE d.applicant_id=a.id) docs FROM hiring_applicants a JOIN hiring_roles r ON r.id=a.role_id WHERE a.organisation_id=? ${status ? 'AND a.status=?' : ''} ${roleId ? 'AND a.role_id=?' : ''} ORDER BY a.created_at DESC LIMIT 500`).all(...[o, status || null, roleId || null].filter((v) => v !== null));
    res.json({ ok: true, applicants: rows.map((r) => ({ id: r.id, role_title: r.role_title, full_name: r.full_name, status: r.status, source: r.source, created_at: r.created_at, documents: r.docs })) });
  });
  const findApplicant = (o, id) => db.prepare(`SELECT a.*, r.title role_title FROM hiring_applicants a JOIN hiring_roles r ON r.id=a.role_id WHERE a.id=? AND a.organisation_id=?`).get(id, o);
  app.get('/api/saas/hiring/applicants/:id', ...guard, (req, res) => {
    const a = findApplicant(org(req), req.params.id); if (!a) return res.status(404).json({ ok: false, error: 'Applicant not found.' });
    hlog(req, 'applicant_viewed', 'hiring_applicant', a.id);
    res.json({ ok: true, applicant: appView(a, docsOf(a.id)) });
  });
  const patchSchema = z.object({ status: z.enum(['new', 'shortlisted', 'interview', 'hired', 'declined']).optional(), notes: z.string().trim().max(3000).optional() });
  app.patch('/api/saas/hiring/applicants/:id', ...guard, (req, res) => {
    const a = findApplicant(org(req), req.params.id); if (!a) return res.status(404).json({ ok: false, error: 'Applicant not found.' });
    const p = patchSchema.safeParse(req.body); if (!p.success) return res.status(400).json({ ok: false, error: 'Check the status or notes.' });
    db.prepare(`UPDATE hiring_applicants SET status=?,notes=?,updated_at=? WHERE id=?`).run(p.data.status ?? a.status, p.data.notes ?? a.notes, iso(), a.id);
    hlog(req, 'applicant_updated', 'hiring_applicant', a.id, { status: p.data.status || a.status });
    res.json({ ok: true });
  });
  app.post('/api/saas/hiring/applicants/:id/summarise', ...guard, async (req, res) => {
    const a = findApplicant(org(req), req.params.id); if (!a) return res.status(404).json({ ok: false, error: 'Applicant not found.' });
    let text = '';
    try {
      const r = await generateAiText({ remember_conversation: false, thinking_level: 'minimal', max_output_tokens: 700, system: 'You help a small-business owner read a job application fairly. Reply in plain text only.',
        messages: [{ role: 'user', content: `Role: ${a.role_title}\nApplicant message: ${clip(a.message, 1500)}\nAvailability: ${clip(a.availability, 300)}\nSuburb: ${clip(a.suburb, 80)}\nWrite: (1) two sentences on the skills and experience the applicant actually states, (2) their availability, (3) three questions to ask at interview. Judge only job-relevant skills and availability. Ignore and never mention age, gender, race, religion, disability, family status or anything else protected. Do NOT recommend hiring or rejecting. The owner decides.` }] });
      text = clip(r.text, 2500);
    } catch { /* provider missing */ }
    if (!text) text = `Stated skills and experience: ${clip(a.message, 400) || 'nothing written'}.\nAvailability: ${clip(a.availability, 200) || 'not stated'}.\nQuestions to ask: What similar work have you done? When could you start? Can you show the licences or tickets this role needs?`;
    db.prepare(`UPDATE hiring_applicants SET ai_summary=?,ai_summary_at=? WHERE id=?`).run(text, iso(), a.id);
    hlog(req, 'applicant_summarised', 'hiring_applicant', a.id);
    res.json({ ok: true, summary: text, note: 'A draft to help you read the application. It is not a recommendation. You decide.' });
  });
  app.delete('/api/saas/hiring/applicants/:id', ...guard, (req, res) => {
    const a = findApplicant(org(req), req.params.id); if (!a) return res.status(404).json({ ok: false, error: 'Applicant not found.' });
    removeFiles(a.id); db.prepare(`DELETE FROM hiring_applicants WHERE id=?`).run(a.id);
    try { fs.rmSync(path.join(hiringRoot, org(req), a.id), { recursive: true, force: true }); } catch { /* folder already gone */ }
    hlog(req, 'applicant_deleted', 'hiring_applicant', a.id);
    res.json({ ok: true, note: 'The application and every uploaded document were permanently deleted.' });
  });
  app.get('/api/saas/hiring/documents/:id/download', ...guard, (req, res) => {
    const d = db.prepare(`SELECT * FROM hiring_documents WHERE id=? AND organisation_id=?`).get(req.params.id, org(req));
    if (!d || !fs.existsSync(d.stored_path)) return res.status(404).json({ ok: false, error: 'Document not found.' });
    hlog(req, 'document_downloaded', 'hiring_document', d.id);
    res.setHeader('Content-Type', d.mime); res.setHeader('X-Content-Type-Options', 'nosniff'); res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(d.original_name)}`);
    fs.createReadStream(d.stored_path).pipe(res);
  });

  /* ------------------------------ public: apply form ------------------------------ */
  const applyLimiter = rateLimit({ windowMs: 60 * 60 * 1000, limit: 8, standardHeaders: true, legacyHeaders: false, message: { ok: false, error: 'Too many applications from this connection. Please try again later.' } });
  const viewLimiter = rateLimit({ windowMs: 60 * 1000, limit: 60, standardHeaders: true, legacyHeaders: false, message: { ok: false, error: 'Too many requests.' } });
  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 8 * 1024 * 1024, files: 5, fields: 20, fieldSize: 6000 } });
  const byToken = (t) => db.prepare(`SELECT * FROM hiring_roles WHERE public_token=?`).get(String(t).replace(/[^a-f0-9]/gi, '').slice(0, 40));
  app.get('/api/public/hiring/:token', viewLimiter, (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    const r = byToken(req.params.token); if (!r) return res.status(404).json({ ok: false, error: 'This job link is not valid.' });
    res.json({ ok: true, business: bizName(r.organisation_id), open: r.status === 'open', role: { title: r.title, employment_label: EMPLOYMENT_LABEL[r.employment_type], location: r.location || '', pay_text: r.pay_text || '', description: r.description || '', requirements: r.requirements || '' },
      notice: { version: NOTICE_VERSION, retention_months: 12 }, kinds: FILE_KINDS });
  });
  const applySchema = z.object({
    full_name: z.string().trim().min(2).max(100), email: z.string().trim().email().max(160), phone: z.string().trim().max(40).optional().default(''),
    suburb: z.string().trim().max(80).optional().default(''), availability: z.string().trim().max(400).optional().default(''), message: z.string().trim().max(3000).optional().default(''),
    consent: z.literal('true'), src: z.string().trim().max(20).optional().default(''), website: z.string().optional().default('')
  });
  app.post('/api/public/hiring/:token/apply', applyLimiter, upload.array('files', 5), (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    const r = byToken(req.params.token); if (!r) return res.status(404).json({ ok: false, error: 'This job link is not valid.' });
    if (r.status !== 'open') return res.status(410).json({ ok: false, error: 'Applications for this role are closed.' });
    const p = applySchema.safeParse(req.body || {});
    if (!p.success) return res.status(400).json({ ok: false, error: p.error.issues.some((i) => i.path[0] === 'consent') ? 'Please tick the box to confirm you have read the privacy notice.' : (p.error.issues[0]?.message || 'Check your details.') });
    if (p.data.website) return res.json({ ok: true, message: 'Thank you. Your application was sent.' }); // honeypot: pretend success
    const files = req.files || [], kinds = [].concat(req.body.kinds || []);
    const checked = [];
    for (const [i, f] of files.entries()) {
      const t = sniff(f.buffer); if (!t) return res.status(400).json({ ok: false, error: `${f.originalname}: please upload a PDF, Word (.docx), JPG, PNG or WebP file.` });
      checked.push({ f, t, kind: FILE_KINDS.includes(kinds[i]) ? kinds[i] : 'other' });
    }
    const o = r.organisation_id, id = crypto.randomUUID(), now = iso();
    const retain = iso(new Date(Date.now() + 365 * 86400000));
    const src = Object.keys(PLATFORMS).includes(p.data.src) ? p.data.src : 'direct';
    const dir = path.join(hiringRoot, o, id); fs.mkdirSync(dir, { recursive: true });
    try {
      db.prepare(`INSERT INTO hiring_applicants (id,organisation_id,role_id,full_name,email,phone,suburb,availability,message,source,consent_at,notice_version,retention_until,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
        .run(id, o, r.id, p.data.full_name, p.data.email.toLowerCase(), p.data.phone, p.data.suburb, p.data.availability, p.data.message, src, now, NOTICE_VERSION, retain, now, now);
      for (const c of checked) {
        const docId = crypto.randomUUID(), file = path.join(dir, `${docId}.${c.t.ext}`);
        fs.writeFileSync(file, c.f.buffer, { mode: 0o600 });
        db.prepare(`INSERT INTO hiring_documents (id,organisation_id,applicant_id,kind,original_name,stored_path,mime,size_bytes,created_at) VALUES (?,?,?,?,?,?,?,?,?)`).run(docId, o, id, c.kind, clip(c.f.originalname.replace(/[\r\n"\\/]/g, '_'), 120), file, c.t.mime, c.f.size, now);
      }
    } catch (e) { try { fs.rmSync(dir, { recursive: true, force: true }); db.prepare(`DELETE FROM hiring_applicants WHERE id=?`).run(id); } catch { /* best effort */ } return res.status(500).json({ ok: false, error: 'We could not save your application. Please try again.' }); }
    communicationInbound({organisation_id:o,channel:'email',contact_address:p.data.email,contact_name:p.data.full_name,id,audience:'hiring'});
    appendAuditLog(db, { organisation_id: o, action: 'hiring.application_received', module: 'hiring', entity_type: 'hiring_applicant', entity_id: id, metadata: { source: src, files: checked.length } });
    notify?.notifyRoles?.(o, OWNERS, { kind: 'hiring', title: 'New job application', body: `A new application arrived for ${r.title}.`, link: '#hiring', dedupe: `hiring:${id}` })?.catch?.(() => {});
    res.status(201).json({ ok: true, message: 'Thank you. Your application was sent. If it suits, the business will contact you.' });
  });

  // Keep personal information only as long as the notice promises.
  const purge = () => {
    try {
      for (const a of db.prepare(`SELECT id,organisation_id FROM hiring_applicants WHERE retention_until<?`).all(iso())) {
        removeFiles(a.id); db.prepare(`DELETE FROM hiring_applicants WHERE id=?`).run(a.id);
        try { fs.rmSync(path.join(hiringRoot, a.organisation_id, a.id), { recursive: true, force: true }); } catch { /* gone */ }
        appendAuditLog(db, { organisation_id: a.organisation_id, action: 'hiring.applicant_expired', module: 'hiring', entity_type: 'hiring_applicant', entity_id: a.id, metadata: {} });
      }
    } catch (e) { console.error('[hiring] retention purge failed:', e.message); }
  };
  setInterval(purge, 6 * 60 * 60 * 1000).unref?.();
  return { purge };
}
