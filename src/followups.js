// AI-written follow-up emails from the operator to a subscriber's account holder. The AI sees account-level facts only
// (plan, trial, limits, sign-in recency), never anything inside the business's workspace. Nothing is sent until the
// operator reads, edits and approves each email.
import crypto from 'node:crypto';
import { z } from 'zod';
import { sendBrandedEmail } from './mailer.js';
import { renderEmail, platformBrand, PLATFORM_NAME } from './email-templates.js';

const iso = () => new Date().toISOString();
const clean = (s, n) => String(s || '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').trim().slice(0, n);
const JSON_ONLY = /^```(?:json)?\s*|\s*```$/gi;

export function templateFor(topic, f) {
  const t = String(topic || '').toLowerCase(), first = f.first, biz = f.business;
  const sign = '\n\nIf you would like a hand, just reply to this email.\n\nThe Super Pro team';
  if (/trial|expir|end/.test(t) || f.trial_soon) return { subject: `Your ${PLATFORM_NAME} trial for ${biz}`, body: `Hi ${first},\n\nYour free trial for ${biz} is nearly over. Everything you have saved stays safe either way.\n\nIf there is anything you have not had time to try, tell me and I will point you to it. When you are ready, you can choose the plan that fits under Plans & Billing.${sign}` };
  if (/pay|refus|fail|overdue|invoice/.test(t) || f.payment_issue) return { subject: `A quick note about your ${PLATFORM_NAME} payment`, body: `Hi ${first},\n\nWe could not complete a recent payment for ${biz}. Your data is safe and nothing has been removed.\n\nPlease check your payment details when you can. If something looks wrong on our side, let me know and I will sort it out.${sign}` };
  if (/limit|upgrade|add-?on|storage|ai|more/.test(t) || f.near_limit) return { subject: `Getting close to your ${f.plan} plan limits`, body: `Hi ${first},\n\n${f.near_limit ? `You are using ${f.near_limit} of your plan. ` : ''}Good news, that means ${biz} is putting Super Pro to work.\n\nYou can add extra room under Plans & Billing, or move to the next plan. Either way, what you have saved stays exactly as it is.${sign}` };
  if (/idle|quiet|re-?engage|inactive|check/.test(t) || f.idle_days >= 14) return { subject: `Can I help you get more from ${PLATFORM_NAME}?`, body: `Hi ${first},\n\nI noticed it has been a little while since you last signed in. Is there something that is not working the way you hoped?\n\nA good quick win is to connect one channel and plan your first week of posts in the Growth Engine. It takes about ten minutes.${sign}` };
  return { subject: `How is ${PLATFORM_NAME} going for ${biz}?`, body: `Hi ${first},\n\nJust checking in to see how things are going. Is there anything you would like to be easier, or a feature you are missing?\n\nYour feedback shapes what we build next.${sign}` };
}

export function installFollowups(app, { db, env, requireAdmin, generateAiText, profile }) {
  db.exec(`CREATE TABLE IF NOT EXISTS operator_followups (
    id TEXT PRIMARY KEY, organisation_id TEXT NOT NULL, topic TEXT, subject TEXT NOT NULL, body TEXT NOT NULL, source TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','sent','discarded')), created_at TEXT NOT NULL, sent_at TEXT, sent_to TEXT,
    FOREIGN KEY(organisation_id) REFERENCES organisations(id) ON DELETE CASCADE);
    CREATE INDEX IF NOT EXISTS idx_followups_org ON operator_followups(organisation_id, status, created_at);`);

  function facts(org) {
    const p = profile(org); if (!p) return null;
    const near = p.usage.filter((u) => u.limit > 0 && u.percent >= 70).map((u) => `${u.percent}% of ${u.label}`);
    const days = p.business.trial_ends_at ? Math.ceil((Date.parse(p.business.trial_ends_at) - Date.now()) / 86400000) : null;
    const idle = p.owner.last_login_at ? Math.floor((Date.now() - Date.parse(p.owner.last_login_at)) / 86400000) : null;
    return { business: p.business.business, first: String(p.owner.name || '').split(/\s+/)[0] || 'there', email: p.owner.email, plan: p.business.plan_name, status: p.business.status, trial_days_left: p.business.status === 'trialing' ? days : null, trial_soon: p.business.status === 'trialing' && days !== null && days <= 3, payment_issue: p.business.payment_status === 'failed', near_limit: near.join(', '), idle_days: idle, channels_connected: p.channels.length };
  }

  async function draftFor(org, topic) {
    const f = facts(org); if (!f) return null;
    let out = null, source = 'template';
    try {
      const r = await generateAiText({ remember_conversation: false, thinking_level: 'minimal', max_output_tokens: 700, system: 'You write short, warm, plain-English emails from a software company to a small-business owner. Use only the facts given. Never invent features, prices, deadlines or promises. No pressure, no fake urgency. Under 120 words. One clear next step. Sign off "The Super Pro team". Reply with JSON only: {"subject":"","body":""}.', messages: [{ role: 'user', content: `Facts: ${JSON.stringify({ owner_first_name: f.first, business: f.business, plan: f.plan, status: f.status, trial_days_left: f.trial_days_left, payment_problem: f.payment_issue, limits_nearly_used: f.near_limit || null, days_since_last_sign_in: f.idle_days, channels_connected: f.channels_connected })}\nPurpose of this email: ${topic || 'a friendly check-in'}` }] });
      const j = JSON.parse(String(r.text || '').trim().replace(JSON_ONLY, ''));
      if (j?.subject && j?.body && String(j.body).length > 40) { out = { subject: clean(j.subject, 150).replace(/\s+/g, ' '), body: clean(j.body, 3000) }; source = 'ai'; }
    } catch { /* provider missing or invalid reply: template below */ }
    return { ...(out || templateFor(topic, f)), source, to: f.email };
  }

  app.post('/api/admin/subscribers/:id/followups', requireAdmin, async (req, res) => {
    const p = z.object({ topic: z.string().trim().max(160).optional().default('') }).safeParse(req.body || {});
    if (!p.success) return res.status(400).json({ ok: false, error: 'Keep the topic short.' });
    const d = await draftFor(req.params.id, p.data.topic);
    if (!d) return res.status(404).json({ ok: false, error: 'Subscriber not found.' });
    if (!d.to) return res.status(409).json({ ok: false, error: 'This account has no email address on file.' });
    const id = crypto.randomUUID();
    db.prepare(`INSERT INTO operator_followups (id,organisation_id,topic,subject,body,source,created_at) VALUES (?,?,?,?,?,?,?)`).run(id, req.params.id, p.data.topic || null, d.subject, d.body, d.source, iso());
    res.status(201).json({ ok: true, followup: { id, subject: d.subject, body: d.body, source: d.source, to: d.to, status: 'draft' } });
  });
  app.get('/api/admin/subscribers/:id/followups', requireAdmin, (req, res) => res.json({ ok: true, followups: db.prepare(`SELECT id,topic,subject,body,source,status,created_at,sent_at,sent_to FROM operator_followups WHERE organisation_id=? AND status!='discarded' ORDER BY created_at DESC LIMIT 20`).all(req.params.id) }));
  app.patch('/api/admin/followups/:id', requireAdmin, (req, res) => {
    const p = z.object({ subject: z.string().trim().min(3).max(150), body: z.string().trim().min(10).max(3000) }).safeParse(req.body);
    const r = db.prepare(`UPDATE operator_followups SET subject=?,body=? WHERE id=? AND status='draft'`).run(p.success ? clean(p.data.subject, 150).replace(/\s+/g, ' ') : '', p.success ? clean(p.data.body, 3000) : '', req.params.id);
    if (!p.success || !r.changes) return res.status(400).json({ ok: false, error: 'Only a draft can be edited. Add a subject and a message.' });
    res.json({ ok: true });
  });
  app.post('/api/admin/followups/:id/discard', requireAdmin, (req, res) => { db.prepare(`UPDATE operator_followups SET status='discarded' WHERE id=? AND status='draft'`).run(req.params.id); res.json({ ok: true }); });
  app.post('/api/admin/followups/:id/send', requireAdmin, async (req, res) => {
    const f = db.prepare(`SELECT * FROM operator_followups WHERE id=? AND status='draft'`).get(req.params.id);
    if (!f) return res.status(409).json({ ok: false, error: 'Only a draft can be sent.' });
    const recent = db.prepare(`SELECT COUNT(*) c FROM operator_followups WHERE organisation_id=? AND status='sent' AND sent_at>?`).get(f.organisation_id, new Date(Date.now() - 2 * 86400000).toISOString()).c;
    if (recent && !req.body?.confirm_again) return res.status(409).json({ ok: false, needs_confirm: true, error: 'You emailed this account in the last 2 days. Send another anyway?' });
    const to = facts(f.organisation_id)?.email;
    if (!to) return res.status(409).json({ ok: false, error: 'This account has no email address on file.' });
    const base = String(env.PUBLIC_BASE_URL || '').replace(/\/$/, '');
    const paragraphs = f.body.split(/\n{2,}/).map((x) => x.trim()).filter(Boolean);
    const r = await sendBrandedEmail(env, { to,delivery:{organisationId:f.organisation_id,category:'operator_follow_up',subject:f.subject}, subject: f.subject, rendered: renderEmail(platformBrand(env), { heading: f.subject, paragraphs, button: { label: 'Open your workspace', url: `${base}/saas/sign-in.html` }, notes: ['You are receiving this because you hold a Super Pro account. Reply to this email and a person will answer.'] }), kind: 'platform', fromName: PLATFORM_NAME });
    db.prepare(`INSERT OR IGNORE INTO lifecycle_emails (id,organisation_id,kind,dedupe_key,recipient,status,detail,created_at) VALUES (?,?,'followup',?,?,?,?,?)`).run(crypto.randomUUID(), f.organisation_id, `followup:${f.id}`, to, r.sent ? 'sent' : /not_configured/.test(r.reason || '') ? 'not_configured' : 'failed', r.sent ? null : r.reason, iso());
    if (!r.sent) return res.status(502).json({ ok: false, error: `The email was not sent (${String(r.reason || 'email is not set up').replaceAll('_', ' ')}). It is still saved as a draft.` });
    db.prepare(`UPDATE operator_followups SET status='sent',sent_at=?,sent_to=? WHERE id=?`).run(iso(), to, f.id);
    res.json({ ok: true });
  });
  return { facts, draftFor };
}
