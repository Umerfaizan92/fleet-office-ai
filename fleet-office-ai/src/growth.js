// Growth Engine: a business describes itself once, then gets competitor insight (from posts it pastes in), content patterns,
// four weekly content pillars, a 30-day calendar, formats written in its own voice, a comment-to-sale script system and a
// repurposing plan. Calendar posts are only ever published after an owner/admin approves them. Facebook Pages and X are
// published directly; other channels (and image/carousel/reel posts) are marked "ready to post" with the full brief.
// Everything is scoped to one organisation. AI text is used when a provider is configured, otherwise plain templates.
import { z } from 'zod';
import crypto from 'node:crypto';
import { appendAuditLog } from './db.js';

const SENIOR = ['owner', 'admin', 'manager', 'super_admin', 'director'];
const APPROVERS = ['owner', 'admin', 'super_admin'];
const iso = (d = new Date()) => d.toISOString();
const clip = (s, n) => String(s || '').slice(0, n);
const PILLARS = ['Authority', 'Story', 'Audience', 'Sale'];
const POST_TYPES = ['text', 'image', 'carousel', 'reel', 'color_bg'];
const AUTO_PUBLISH = { facebook: ['text', 'color_bg'], x: ['text', 'color_bg'] };
const KINDS = ['competitor_study', 'patterns', 'pillars', 'formats', 'engagement', 'repurpose'];

const KIND_TITLE = {
  competitor_study: 'What works for similar pages',
  patterns: 'Content patterns to follow',
  pillars: 'Your 4 weekly content pillars',
  formats: '10 posts in your voice',
  engagement: 'Comment, DM and sale scripts',
  repurpose: 'Weekly repurposing system'
};

/* ---- scheduling ------------------------------------------------------------------------------------------------ */
// Slots for `days` days starting at `startDate` (YYYY-MM-DD), `perDay` posts per day spread across [fromHour, toHour].
// tzOffsetMin is Date.getTimezoneOffset() of the owner's device (Perth = -480), so the hours are the owner's local hours.
export function buildSlots({ startDate, days, perDay, fromHour = 6, toHour = 21, tzOffsetMin = 0 }) {
  const [y, m, d] = String(startDate).split('-').map(Number);
  const n = Math.max(1, Math.min(16, perDay | 0));
  const span = Math.max(0, toHour - fromHour);
  const hours = n === 1 ? [Math.round((fromHour + toHour) / 2)] : Array.from({ length: n }, (_, i) => Math.round(fromHour + (span * i) / (n - 1)));
  const out = [];
  for (let day = 0; day < days; day++) {
    for (const h of [...new Set(hours)]) out.push({ day: day + 1, at: new Date(Date.UTC(y, m - 1, d + day, h, 0) + tzOffsetMin * 60000).toISOString() });
  }
  return out;
}

/* ---- text helpers ---------------------------------------------------------------------------------------------- */
function parseJson(text) {
  const raw = String(text || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  try { return JSON.parse(raw); } catch { const a = raw.indexOf('{'), b = raw.lastIndexOf('}'); if (a >= 0 && b > a) return JSON.parse(raw.slice(a, b + 1)); throw new Error('AI reply was not JSON'); }
}
const planShape = z.object({
  summary: z.string().max(1500),
  sections: z.array(z.object({ title: z.string().max(160), items: z.array(z.string().max(1500)).max(40) })).max(20)
});

const ctx = (p) => `Business niche: ${p.niche || 'not given'}. Audience: ${p.audience || 'not given'}. Product or service: ${p.product || 'not given'}. Voice: ${p.voice || 'friendly, simple words, short sentences'}. Story: ${p.story || 'not given'}.`;

function aiPrompt(kind, p, extra) {
  const base = `${ctx(p)}\nReturn JSON only: {"summary": string, "sections": [{"title": string, "items": [string]}]}. Use simple words and short sentences. Be specific to this business. Never invent statistics.`;
  const ask = {
    competitor_study: `Study these pages in the same niche: ${(p.competitors || []).join(', ') || 'none listed'}. You cannot browse Facebook, so analyse ONLY the post texts pasted below. Say which hooks, formats and topics the pasted posts use and why they likely work. If nothing was pasted, say that and give a short checklist for how to review a competitor page by hand.\nPasted posts:\n${extra || '(none)'}`,
    patterns: `Give the top 5 content patterns to follow on Facebook and Instagram for this niche. For each: type of post, best time of day to try (as a test, not a promise), caption length and why. Label anything that is general practice rather than measured data.`,
    pillars: `Give exactly 4 weekly content pillars named Authority, Story, Audience and Sale (one section each). Each section: what it is, 4 post ideas, and how often per week.`,
    formats: `Write 10 ready-to-post Facebook posts using proven formats (question, list, before/after, myth vs truth, story, behind the scenes, offer). Sound like the owner talking to a friend. Each item is one full post. Put the format name in the first line.`,
    engagement: `Write exact scripts: replies to comments that turn commenters into followers; replies to engagement-bait posts; how to move a comment to a DM; DM scripts that move to a sale (opener, question, offer, follow-up after 24h, polite close). Never use pressure, fake scarcity or misleading claims.`,
    repurpose: `Create a weekly repurposing system: take the top 3 posts each week and turn each into 3 new pieces (text to carousel, carousel to reel script, reel to story sequence). Give a checklist plus one worked example for this business.`
  }[kind];
  return `${base}\nTask: ${ask}`;
}

function template(kind, p) {
  const n = p.niche || 'your business', a = p.audience || 'your customers', pr = p.product || 'your service';
  const T = (summary, sections) => ({ summary, sections });
  if (kind === 'competitor_study') return T('Paste the text of 3 to 5 top posts from similar pages and run this again for a specific breakdown. Super Pro cannot browse other pages for you.', [
    { title: 'How to review a similar page', items: ['Open the page and sort by what has the most comments and shares.', 'Write down the first line of each top post. That is the hook.', 'Note the format: text, photo, carousel, reel or colour background.', 'Note the topic and whether it asks a question.', 'Look for what repeats across three or more posts. That repeat is the pattern.'] }]);
  if (kind === 'patterns') return T('General best practice for ' + n + '. These are starting tests, not measured results. Check your own insights after two weeks.', [
    { title: 'Five patterns to test', items: ['Question posts that people can answer in one word.', 'Before and after photos of real work.', 'Short story posts of 3 to 6 lines.', 'Quick tips as a list of three.', 'A clear offer post once or twice a week, never every post.'] },
    { title: 'Timing and length', items: ['Test early morning, lunch and evening and keep what your insights favour.', 'Keep captions under 80 words unless it is a story.', 'Put the hook in the first line.'] }]);
  if (kind === 'pillars') return T(`Four pillars for ${n}, for ${a}.`, [
    { title: 'Authority', items: [`Show how you do ${pr} step by step.`, 'Answer the question you hear most.', 'Share a common mistake and the fix.', 'Explain a price or a process plainly.'] },
    { title: 'Story', items: ['Why you started.', 'A job that went wrong and what you learned.', 'A day in the work.', 'A customer result, with their permission.'] },
    { title: 'Audience', items: ['Ask a question.', 'Poll: this or that.', 'Ask for tips or local recommendations.', 'Celebrate a customer or a local win.'] },
    { title: 'Sale', items: [`A clear offer for ${pr}.`, 'Limited availability, only if true.', 'A review with a booking link.', 'How to book in three steps.'] }]);
  if (kind === 'formats') return T('Ten starting posts. Change the details so they are true for you.', [{ title: 'Posts', items: [
    `Quick question for ${a}: what is the one thing you wish you knew before hiring someone for ${pr}?`,
    `Myth: ${pr} is always expensive. Truth: it depends on three things. Want me to list them?`,
    `3 things I check before every job: 1) the access, 2) the materials, 3) the timing. What would you add?`,
    `Before and after. Same space, one day of work. Which one do you like?`,
    `I started this because I was tired of bad service. Here is what I do differently.`,
    `A customer asked me this today. Here is the short answer.`,
    `Behind the scenes: how we get ready the night before.`,
    `Tip for ${a}: do this one thing this week and it will save you money.`,
    `Booking is easy. Message us, we reply the same day, we confirm the time.`,
    `Thank you to everyone who shared our last post. Tell me what you want to see next.`] }]);
  if (kind === 'engagement') return T('Reply fast, be helpful first, move to DM only when the person asks or agrees.', [
    { title: 'Reply to a comment', items: ['Thanks {name}! Good question. Short answer: {answer}. Want me to send you the details?', 'Love this, {name}. Follow the page and you will see more of this each week.'] },
    { title: 'Comment to DM', items: ['I will message you the details now so you do not have to scroll. Check your inbox.', 'Happy to give a quote. Can I send you a quick DM?'] },
    { title: 'DM to sale', items: ['Opener: Hi {name}, thanks for your comment. What are you looking to get done?', 'Question: When do you need it, and what is your rough budget?', `Offer: Based on that, ${pr} would be {price}. I can do {day}. Shall I lock it in?`, 'Follow-up after 24 hours: Hi {name}, just checking you saw my message. Happy to answer any questions.', 'Polite close: No problem at all. If anything changes, message me any time.'] }]);
  return T('Create once, post everywhere. Do this every week in about 30 minutes.', [
    { title: 'Each week', items: ['Pick your top 3 posts by comments and shares.', 'Turn each text post into a carousel of 5 slides: hook, 3 points, call to action.', 'Turn each carousel into a 20 to 30 second reel script: hook, 3 quick points, call to action.', 'Turn each reel into a 4 frame story sequence: teaser, question, answer, link.', 'Schedule the new pieces on different days.'] }]);
}

const HOOKS = {
  Authority: ['The #1 mistake I see with {product}', '3 things to check before you hire for {product}', 'Here is how {product} really works', 'What {audience} should know about {product}', 'Stop paying too much for {product}. Do this first.'],
  Story: ['Why I started this business', 'The job that taught me the most', 'A day in my work, no filter', 'I almost quit. Here is what changed.', 'A customer said this and it stuck with me'],
  Audience: ['Quick question for {audience}', 'This or that? Tell me below.', 'What should I post about next?', 'Tag someone who needs to see this', 'What is your biggest problem with {product}?'],
  Sale: ['Booking is open for {product}', 'Want {product} sorted this week? Message us.', 'What our customers say about {product}', 'How to book in 3 simple steps', 'This week we can take two more jobs']
};
const fill = (s, p) => s.replaceAll('{product}', p.product || 'our service').replaceAll('{audience}', p.audience || 'you');

/* ---- install ---------------------------------------------------------------------------------------------------- */
export function installGrowth(app, { db, env = {}, requireSaasUser, requireSaasRole, saasAudit, generateAiText, notify, connections, entitlements, fetchImpl = globalThis.fetch }) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS growth_profiles (
      organisation_id TEXT PRIMARY KEY, niche TEXT, audience TEXT, product TEXT, voice TEXT, story TEXT,
      competitors_json TEXT NOT NULL DEFAULT '[]', platforms_json TEXT NOT NULL DEFAULT '["facebook"]',
      posts_per_day INTEGER NOT NULL DEFAULT 3, from_hour INTEGER NOT NULL DEFAULT 6, to_hour INTEGER NOT NULL DEFAULT 21,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS growth_plans (
      id TEXT PRIMARY KEY, organisation_id TEXT NOT NULL, kind TEXT NOT NULL, title TEXT NOT NULL,
      content_json TEXT NOT NULL, source TEXT NOT NULL, created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_growth_plans_org ON growth_plans(organisation_id, kind, created_at);
    CREATE TABLE IF NOT EXISTS growth_calendar (
      id TEXT PRIMARY KEY, organisation_id TEXT NOT NULL, plan_day INTEGER NOT NULL, scheduled_at TEXT NOT NULL,
      platform TEXT NOT NULL, pillar TEXT NOT NULL, post_type TEXT NOT NULL, hook TEXT NOT NULL, body TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'draft', external_id TEXT, error TEXT, approved_by TEXT, approved_at TEXT, published_at TEXT,
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_growth_calendar_org ON growth_calendar(organisation_id, scheduled_at);
    CREATE INDEX IF NOT EXISTS idx_growth_calendar_due ON growth_calendar(status, scheduled_at);
  `);

  const gate = [requireSaasUser, requireSaasRole(...SENIOR)];
  const gateApprove = [requireSaasUser, requireSaasRole(...APPROVERS)];
  const org = (req) => req.saas.organisation_id;
  const json = (s, f) => { try { return JSON.parse(s); } catch { return f; } };

  const profileRow = (o) => {
    const r = db.prepare(`SELECT * FROM growth_profiles WHERE organisation_id=?`).get(o);
    const onboarding = db.prepare(`SELECT business_type,services,brand_voice FROM onboarding_profiles WHERE organisation_id=?`).get(o) || {};
    return {
      niche: r?.niche ?? onboarding.business_type ?? '', audience: r?.audience ?? '', product: r?.product ?? onboarding.services ?? '',
      voice: r?.voice ?? onboarding.brand_voice ?? '', story: r?.story ?? '',
      competitors: json(r?.competitors_json, []), platforms: json(r?.platforms_json, ['facebook']),
      posts_per_day: r?.posts_per_day ?? 3, from_hour: r?.from_hour ?? 6, to_hour: r?.to_hour ?? 21
    };
  };
  const latest = (o, kind) => {
    const r = db.prepare(`SELECT * FROM growth_plans WHERE organisation_id=? AND kind=? ORDER BY created_at DESC, rowid DESC LIMIT 1`).get(o, kind);
    return r ? { id: r.id, kind: r.kind, title: r.title, source: r.source, created_at: r.created_at, content: json(r.content_json, {}) } : null;
  };
  const publicItem = (r) => ({ id: r.id, plan_day: r.plan_day, scheduled_at: r.scheduled_at, platform: r.platform, pillar: r.pillar, post_type: r.post_type, hook: r.hook, body: r.body, status: r.status, error: r.error, published_at: r.published_at, auto_publish: (AUTO_PUBLISH[r.platform] || []).includes(r.post_type) && entitlements.rules(r.organisation_id).growth_auto_publish });

  async function aiPlan(kind, profile, extra) {
    try {
      const r = await generateAiText({ remember_conversation: false, thinking_level: 'minimal', max_output_tokens: 2500, system: 'You are the Super Pro Growth Engine for small businesses. Reply with JSON only.', messages: [{ role: 'user', content: aiPrompt(kind, profile, extra) }] });
      const parsed = planShape.safeParse(parseJson(r.text));
      if (parsed.success && parsed.data.sections.length) return parsed.data;
    } catch { /* provider missing or invalid reply: use the template */ }
    return null;
  }

  // ---------- profile and overview ----------
  app.get('/api/saas/growth/overview', ...gate, async (req, res) => {
    const o = org(req), profile = profileRow(o);
    const plans = Object.fromEntries(KINDS.map((k) => [k, latest(o, k)]));
    const counts = Object.fromEntries(db.prepare(`SELECT status, COUNT(*) c FROM growth_calendar WHERE organisation_id=? GROUP BY status`).all(o).map((r) => [r.status, r.c]));
    const conns = db.prepare(`SELECT provider,status,account_label FROM organisation_integrations WHERE organisation_id=?`).all(o);
    const channels = [['facebook', 'meta', 'Facebook Page', true], ['instagram', 'meta', 'Instagram', false], ['x', 'x', 'X', true], ['youtube', 'youtube', 'YouTube', false], ['tiktok', 'tiktok', 'TikTok', false], ['snapchat', 'snapchat', 'Snapchat', false], ['whatsapp', 'whatsapp', 'WhatsApp', false]]
      .map(([id, provider, label, auto]) => { const c = conns.find((x) => x.provider === provider); return { id, label, connected: c?.status === 'connected', account: c?.account_label || null, auto_publish: auto }; });
    res.json({ ok: true, profile, plans, kinds: KINDS.map((k) => ({ kind: k, title: KIND_TITLE[k] })), calendar_counts: counts, channels, pillars: PILLARS });
  });

  const profileSchema = z.object({
    niche: z.string().trim().max(200), audience: z.string().trim().max(300), product: z.string().trim().max(300),
    voice: z.string().trim().max(300).optional().default(''), story: z.string().trim().max(1500).optional().default(''),
    competitors: z.array(z.string().trim().min(1).max(200)).max(5).default([]),
    platforms: z.array(z.enum(['facebook', 'instagram', 'x', 'youtube', 'tiktok', 'snapchat', 'whatsapp'])).min(1).max(7).default(['facebook']),
    posts_per_day: z.number().int().min(1).max(16).default(3), from_hour: z.number().int().min(0).max(23).default(6), to_hour: z.number().int().min(0).max(23).default(21)
  }).refine((v) => v.to_hour >= v.from_hour, { message: 'Finish time must be after the start time.' });
  app.put('/api/saas/growth/profile', ...gate, (req, res) => {
    const p = profileSchema.safeParse(req.body);
    if (!p.success) return res.status(400).json({ ok: false, error: p.error.issues[0]?.message || 'Check the details.' });
    const d = p.data, lim = entitlements.rules(org(req));
    if (d.posts_per_day > lim.growth_posts_per_day) return res.status(403).json({ ok: false, upgrade: true, error: `Your plan allows up to ${lim.growth_posts_per_day} post${lim.growth_posts_per_day === 1 ? '' : 's'} a day. Upgrade to post more often.` });
    db.prepare(`INSERT INTO growth_profiles (organisation_id,niche,audience,product,voice,story,competitors_json,platforms_json,posts_per_day,from_hour,to_hour,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
      ON CONFLICT(organisation_id) DO UPDATE SET niche=excluded.niche,audience=excluded.audience,product=excluded.product,voice=excluded.voice,story=excluded.story,competitors_json=excluded.competitors_json,platforms_json=excluded.platforms_json,posts_per_day=excluded.posts_per_day,from_hour=excluded.from_hour,to_hour=excluded.to_hour,updated_at=excluded.updated_at`)
      .run(org(req), d.niche, d.audience, d.product, d.voice, d.story, JSON.stringify(d.competitors), JSON.stringify(d.platforms), d.posts_per_day, d.from_hour, d.to_hour, iso());
    saasAudit(req, 'growth.profile_saved', 'growth', org(req), { platforms: d.platforms, posts_per_day: d.posts_per_day });
    res.json({ ok: true, profile: profileRow(org(req)) });
  });

  // ---------- plans ----------
  app.post('/api/saas/growth/generate', ...gate, async (req, res) => {
    const p = z.object({ kind: z.enum(KINDS), samples: z.string().max(12000).optional().default('') }).safeParse(req.body);
    if (!p.success) return res.status(400).json({ ok: false, error: 'Choose what to create.' });
    const profile = profileRow(org(req));
    if (!profile.niche && !profile.product) return res.status(400).json({ ok: false, error: 'Add your business type or what you sell first.' });
    const ai = await aiPlan(p.data.kind, profile, p.data.samples);
    const content = ai || template(p.data.kind, profile);
    const id = crypto.randomUUID();
    db.prepare(`INSERT INTO growth_plans (id,organisation_id,kind,title,content_json,source,created_at) VALUES (?,?,?,?,?,?,?)`).run(id, org(req), p.data.kind, KIND_TITLE[p.data.kind], JSON.stringify(content), ai ? 'ai' : 'template', iso());
    saasAudit(req, 'growth.plan_created', 'growth', id, { kind: p.data.kind, source: ai ? 'ai' : 'template' });
    res.status(201).json({ ok: true, plan: latest(org(req), p.data.kind) });
  });

  // ---------- calendar ----------
  async function hookBank(profile) {
    const bank = Object.fromEntries(PILLARS.map((k) => [k, []]));
    try {
      const r = await generateAiText({ remember_conversation: false, thinking_level: 'minimal', max_output_tokens: 3500, system: 'You write social posts for small businesses. Reply with JSON only.', messages: [{ role: 'user', content: `${ctx(profile)}\nWrite 12 posts for each pillar (Authority, Story, Audience, Sale). Each has a hook (first line, under 100 characters) and a body (under 400 characters, simple words, short sentences, true and not misleading). Return JSON: {"Authority":[{"hook":"","body":""}],"Story":[...],"Audience":[...],"Sale":[...]}` }] });
      const j = parseJson(r.text);
      for (const k of PILLARS) for (const it of Array.isArray(j[k]) ? j[k] : []) if (it?.hook) bank[k].push({ hook: clip(it.hook, 160), body: clip(it.body, 1500), ai: true });
    } catch { /* templates below */ }
    return bank;
  }

  app.post('/api/saas/growth/calendar/generate', ...gate, async (req, res) => {
    const p = z.object({ days: z.number().int().min(1).max(30).default(30), start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), tz_offset_min: z.number().int().min(-840).max(840).default(0) }).safeParse(req.body);
    if (!p.success) return res.status(400).json({ ok: false, error: 'Choose a start date and number of days.' });
    const o = org(req), profile = profileRow(o), lim = entitlements.rules(o);
    if (!profile.niche && !profile.product) return res.status(400).json({ ok: false, error: 'Add your business type or what you sell first.' });
    if (p.data.days > lim.growth_days) return res.status(403).json({ ok: false, upgrade: true, error: `Your plan can plan up to ${lim.growth_days} days at a time. Upgrade for longer calendars.` });
    if (profile.posts_per_day > lim.growth_posts_per_day) return res.status(403).json({ ok: false, upgrade: true, error: `Your plan allows up to ${lim.growth_posts_per_day} post${lim.growth_posts_per_day === 1 ? '' : 's'} a day. Lower it in About you, or upgrade.` });
    const slots = buildSlots({ startDate: p.data.start_date, days: p.data.days, perDay: profile.posts_per_day, fromHour: profile.from_hour, toHour: profile.to_hour, tzOffsetMin: p.data.tz_offset_min });
    const bank = await hookBank(profile), now = iso();
    const used = Object.fromEntries(PILLARS.map((k) => [k, 0]));
    const first = slots[0]?.at, last = slots[slots.length - 1]?.at;
    const tx = db.transaction(() => {
      db.prepare(`DELETE FROM growth_calendar WHERE organisation_id=? AND status='draft' AND scheduled_at BETWEEN ? AND ?`).run(o, first, last);
      const ins = db.prepare(`INSERT INTO growth_calendar (id,organisation_id,plan_day,scheduled_at,platform,pillar,post_type,hook,body,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,'draft',?,?)`);
      slots.forEach((s, i) => {
        const pillar = PILLARS[i % 4], type = POST_TYPES[(i * 2 + Math.floor(i / 5)) % POST_TYPES.length];
        const platform = profile.platforms[i % profile.platforms.length];
        const k = used[pillar]++, fromBank = bank[pillar][k];
        const hooks = HOOKS[pillar], tpl = fill(hooks[k % hooks.length], profile);
        ins.run(crypto.randomUUID(), o, s.day, s.at, platform, pillar, type, fromBank?.hook || tpl, fromBank?.body || '', now, now);
      });
    });
    tx();
    saasAudit(req, 'growth.calendar_generated', 'growth', o, { days: p.data.days, posts: slots.length });
    res.status(201).json({ ok: true, created: slots.length, ai_written: PILLARS.reduce((n, k) => n + Math.min(bank[k].length, used[k]), 0) });
  });

  app.get('/api/saas/growth/calendar', ...gate, (req, res) => {
    const q = z.object({ status: z.string().max(20).optional(), limit: z.coerce.number().int().min(1).max(600).default(200) }).safeParse(req.query);
    const lim = q.success ? q.data.limit : 200, st = q.success ? q.data.status : undefined;
    const rows = st
      ? db.prepare(`SELECT * FROM growth_calendar WHERE organisation_id=? AND status=? ORDER BY scheduled_at LIMIT ?`).all(org(req), st, lim)
      : db.prepare(`SELECT * FROM growth_calendar WHERE organisation_id=? ORDER BY scheduled_at LIMIT ?`).all(org(req), lim);
    res.json({ ok: true, items: rows.map(publicItem) });
  });

  app.patch('/api/saas/growth/calendar/:id', ...gate, (req, res) => {
    const p = z.object({ hook: z.string().trim().min(1).max(300).optional(), body: z.string().max(3000).optional(), scheduled_at: z.string().datetime().optional(), platform: z.enum(['facebook', 'instagram', 'x', 'youtube', 'tiktok', 'snapchat', 'whatsapp']).optional(), post_type: z.enum(POST_TYPES).optional(), action: z.enum(['skip', 'restore']).optional() }).safeParse(req.body);
    if (!p.success) return res.status(400).json({ ok: false, error: 'Check the post details.' });
    const row = db.prepare(`SELECT * FROM growth_calendar WHERE id=? AND organisation_id=?`).get(req.params.id, org(req));
    if (!row) return res.status(404).json({ ok: false, error: 'Post not found.' });
    if (['published', 'publishing'].includes(row.status)) return res.status(409).json({ ok: false, error: 'This post has already gone out.' });
    const d = p.data, edited = d.hook !== undefined || d.body !== undefined || d.scheduled_at || d.platform || d.post_type;
    let status = row.status;
    if (d.action === 'skip') status = 'skipped'; else if (d.action === 'restore' || (edited && row.status !== 'draft')) status = 'draft';
    db.prepare(`UPDATE growth_calendar SET hook=?,body=?,scheduled_at=?,platform=?,post_type=?,status=?,error=NULL,approved_by=CASE WHEN ?='draft' THEN NULL ELSE approved_by END,updated_at=? WHERE id=?`)
      .run(d.hook ?? row.hook, d.body ?? row.body, d.scheduled_at ?? row.scheduled_at, d.platform ?? row.platform, d.post_type ?? row.post_type, status, status, iso(), row.id);
    saasAudit(req, 'growth.post_edited', 'growth_post', row.id, { fields: Object.keys(d) });
    res.json({ ok: true, item: publicItem(db.prepare(`SELECT * FROM growth_calendar WHERE id=?`).get(row.id)) });
  });

  // Approving is the human sign-off. Only approved posts are ever sent.
  app.post('/api/saas/growth/calendar/approve', ...gateApprove, (req, res) => {
    const p = z.object({ ids: z.array(z.string().max(60)).max(600).optional(), all_drafts: z.boolean().optional() }).safeParse(req.body);
    if (!p.success || (!p.data.ids?.length && !p.data.all_drafts)) return res.status(400).json({ ok: false, error: 'Choose posts to approve.' });
    const o = org(req), now = iso();
    const rows = p.data.all_drafts
      ? db.prepare(`SELECT id FROM growth_calendar WHERE organisation_id=? AND status='draft'`).all(o)
      : p.data.ids.map((id) => db.prepare(`SELECT id FROM growth_calendar WHERE id=? AND organisation_id=? AND status='draft'`).get(id, o)).filter(Boolean);
    const up = db.prepare(`UPDATE growth_calendar SET status='approved',approved_by=?,approved_at=?,updated_at=? WHERE id=?`);
    db.transaction(() => rows.forEach((r) => up.run(req.saas.user_id, now, now, r.id)))();
    saasAudit(req, 'growth.posts_approved', 'growth', o, { count: rows.length });
    res.json({ ok: true, approved: rows.length });
  });

  // ---------- publishing ----------
  async function sendFacebook(o, item) {
    const c = connections.load(o, 'meta');
    if (!c || c.row.status !== 'connected') throw new Error('Connect Facebook first.');
    const page = (c.settings.selected_resources || []).find((r) => r.type === 'facebook_page');
    if (!page) throw new Error('Choose which Facebook Page to post to in Connections.');
    const bundle = await connections.fresh(c, 'meta');
    const version = String(env.META_GRAPH_VERSION || 'v23.0');
    const tokenRes = await fetchImpl(`https://graph.facebook.com/${version}/${encodeURIComponent(page.id)}?fields=access_token`, { headers: { authorization: 'Bearer ' + bundle.access_token } });
    const tokenJson = await tokenRes.json().catch(() => ({}));
    if (!tokenRes.ok || !tokenJson.access_token) throw new Error(tokenJson?.error?.message || 'Facebook did not give page access. Reconnect and allow posting.');
    const body = new URLSearchParams({ message: `${item.hook}\n\n${item.body}`.trim(), access_token: tokenJson.access_token });
    const r = await fetchImpl(`https://graph.facebook.com/${version}/${encodeURIComponent(page.id)}/feed`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j.id) throw new Error(j?.error?.message || 'Facebook refused the post.');
    return String(j.id);
  }
  async function sendX(o, item) {
    const c = connections.load(o, 'x');
    if (!c || c.row.status !== 'connected') throw new Error('Connect X first.');
    const bundle = await connections.fresh(c, 'x');
    const text = `${item.hook}\n\n${item.body}`.trim();
    if (text.length > 280) throw new Error('This post is longer than 280 characters. Shorten it for X.');
    const r = await fetchImpl('https://api.x.com/2/tweets', { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + bundle.access_token }, body: JSON.stringify({ text }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j?.data?.id) throw new Error(j?.detail || j?.title || 'X refused the post.');
    return String(j.data.id);
  }

  // Claims the row first so two timers or a double click can never post twice.
  async function publishItem(id, { actor = null } = {}) {
    const claim = db.prepare(`UPDATE growth_calendar SET status='publishing',updated_at=? WHERE id=? AND status IN ('approved','failed','due')`).run(iso(), id);
    if (!claim.changes) return { ok: false, error: 'This post is not ready to send.' };
    const item = db.prepare(`SELECT * FROM growth_calendar WHERE id=?`).get(id);
    const set = (status, extra = {}) => db.prepare(`UPDATE growth_calendar SET status=?,external_id=?,error=?,published_at=?,updated_at=? WHERE id=?`).run(status, extra.external_id ?? null, extra.error ?? null, extra.published_at ?? null, iso(), id);
    const ownerAlert = (title, body) => notify?.notifyRoles?.(item.organisation_id, ['owner', 'admin'], { kind: 'content', title, body, link: '#growth', dedupe: `growth:${id}:${title}` }).catch(() => {});
    const audit = (action, metadata) => appendAuditLog(db, { organisation_id: item.organisation_id, user_id: actor, action, module: 'growth', entity_type: 'growth_post', entity_id: id, metadata });
    if (!(AUTO_PUBLISH[item.platform] || []).includes(item.post_type) || !entitlements.rules(item.organisation_id).growth_auto_publish) {
      set('due');
      audit('growth.post_ready_to_post', { platform: item.platform, type: item.post_type });
      ownerAlert('Post ready to share', `${item.platform} ${item.post_type.replace('_', ' ')} post: "${clip(item.hook, 80)}". Open Growth to copy it.`);
      return { ok: true, status: 'due' };
    }
    try {
      const ext = item.platform === 'facebook' ? await sendFacebook(item.organisation_id, item) : await sendX(item.organisation_id, item);
      set('published', { external_id: ext, published_at: iso() });
      audit('growth.post_published', { platform: item.platform, external_id: ext });
      return { ok: true, status: 'published', external_id: ext };
    } catch (err) {
      const msg = clip(err?.message || err, 300);
      set('failed', { error: msg });
      audit('growth.post_failed', { platform: item.platform, error: msg });
      ownerAlert('A scheduled post did not go out', `${clip(item.hook, 60)}: ${msg}`);
      return { ok: false, status: 'failed', error: msg };
    }
  }

  app.post('/api/saas/growth/calendar/:id/publish', ...gateApprove, async (req, res) => {
    const row = db.prepare(`SELECT status FROM growth_calendar WHERE id=? AND organisation_id=?`).get(req.params.id, org(req));
    if (!row) return res.status(404).json({ ok: false, error: 'Post not found.' });
    if (row.status === 'draft') return res.status(409).json({ ok: false, error: 'Approve this post before sending it.' });
    const r = await publishItem(req.params.id, { actor: req.saas.user_id });
    res.status(r.ok ? 200 : 409).json(r);
  });

  async function runDue() {
    const due = db.prepare(`SELECT id FROM growth_calendar WHERE status='approved' AND scheduled_at<=? ORDER BY scheduled_at LIMIT 20`).all(iso());
    for (const d of due) await publishItem(d.id);
    return due.length;
  }
  const timer = setInterval(() => { runDue().catch((e) => console.warn('[growth] scheduler:', e.message)); }, 60 * 1000);
  timer.unref?.();

  // ---------- repurposing a single post ----------
  app.post('/api/saas/growth/repurpose', ...gate, async (req, res) => {
    const p = z.object({ text: z.string().trim().min(10).max(3000) }).safeParse(req.body);
    if (!p.success) return res.status(400).json({ ok: false, error: 'Paste the post you want to reuse.' });
    const profile = profileRow(org(req));
    const ai = await (async () => {
      try {
        const r = await generateAiText({ remember_conversation: false, thinking_level: 'minimal', max_output_tokens: 1500, system: 'Reply with JSON only.', messages: [{ role: 'user', content: `${ctx(profile)}\nTurn this post into 3 new pieces. Return JSON {"summary":"","sections":[{"title":"Carousel (5 slides)","items":[]},{"title":"Reel script (20-30 seconds)","items":[]},{"title":"Story sequence (4 frames)","items":[]}]}. Post:\n${p.data.text}` }] });
        const s = planShape.safeParse(parseJson(r.text)); return s.success ? s.data : null;
      } catch { return null; }
    })();
    const first = p.data.text.split(/\n|(?<=[.!?])\s/)[0].slice(0, 120);
    const content = ai || { summary: 'Three new pieces from one post. Edit the wording to match your voice.', sections: [
      { title: 'Carousel (5 slides)', items: [`Slide 1 (hook): ${first}`, 'Slide 2: Point one', 'Slide 3: Point two', 'Slide 4: Point three', 'Slide 5: Call to action, for example "Message us to book."'] },
      { title: 'Reel script (20-30 seconds)', items: [`0-3s hook, spoken: ${first}`, '3-20s: three quick points, one sentence each, with captions on screen', 'Last 5s: call to action and where to book'] },
      { title: 'Story sequence (4 frames)', items: ['Frame 1: teaser question', 'Frame 2: one surprising point', 'Frame 3: the answer', 'Frame 4: link sticker or "message us"'] }] };
    saasAudit(req, 'growth.repurposed', 'growth', org(req), { source: ai ? 'ai' : 'template' });
    res.json({ ok: true, content, source: ai ? 'ai' : 'template' });
  });

  return { runDue, publishItem };
}
