// One place that says what each plan includes and enforces it. Limits only ever stop NEW records being added;
// nothing already saved is hidden, changed or deleted when a plan is lower or a trial ends.
import crypto from 'node:crypto';

export const RULES = {
  starter: { business_users: 3, workers: 10, customers: 300, stock_items: 50, media_mb: 1024, ai: 100, channels: 2, growth_days: 7, growth_posts_per_day: 1, growth_auto_publish: false },
  operations: { business_users: 10, workers: 50, customers: 3000, stock_items: 500, media_mb: 10240, ai: 1500, channels: 6, growth_days: 30, growth_posts_per_day: 4, growth_auto_publish: true },
  scale: { business_users: 25, workers: 250, customers: -1, stock_items: -1, media_mb: 51200, ai: 6000, channels: 8, growth_days: 30, growth_posts_per_day: 16, growth_auto_publish: true }
};
const PLAN_ALIAS = { 'founder-trial': 'operations' };
const LABEL = { business_users: ['team logins', ''], workers: ['workers', ''], customers: ['customers', ''], stock_items: ['stock items', ''], media: ['storage', 'MB'], ai: ['AI requests this month', ''], channels: ['connected channels', ''] };
const COUNTED = ['business_users', 'workers', 'customers', 'stock_items', 'media', 'ai', 'channels'];
const ADDABLE = ['media', 'ai', 'business_users'];
const PLATFORM_MANAGED = ['website', 'email_sms'];
const GATES = [
  ['POST', /^\/customers$/, 'customers'], ['POST', /^\/stock\/items$/, 'stock_items'], ['POST', /^\/workers$/, 'workers'],
  ['POST', /^\/team-accounts\/invitations$/, 'business_users'], ['POST', /^\/media$/, 'media'],
  ['POST', /^\/ai\/threads$/, 'ai'], ['POST', /^\/seo\/draft$/, 'ai'], ['POST', /^\/hiring\/roles\/[^/]+\/ads\/generate$/, 'ai'], ['POST', /^\/hiring\/applicants\/[^/]+\/summarise$/, 'ai'], ['POST', /^\/content\/ai-spec$/, 'ai'], ['POST', /^\/growth\/(?:generate|repurpose|calendar\/generate)$/, 'ai'],
  ['POST', /^\/integrations\/self-service\/([a-z_]+)\/authorise$/, 'channels']
];
const monthStart = () => { const d = new Date(); return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)).toISOString(); };

export function createEntitlements({ db, getNotify = () => null, getExtras = () => ({}) }) {
  db.exec(`CREATE TABLE IF NOT EXISTS usage_events (id TEXT PRIMARY KEY, organisation_id TEXT NOT NULL, kind TEXT NOT NULL, created_at TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS idx_usage_events_org ON usage_events(organisation_id, kind, created_at);`);

  function planOf(org) {
    const s = db.prepare(`SELECT s.plan_id,s.status,s.payment_status,s.trial_ends_at,p.name FROM organisation_subscriptions s JOIN subscription_plans p ON p.id=s.plan_id WHERE s.organisation_id=?`).get(org);
    const id = PLAN_ALIAS[s?.plan_id] || s?.plan_id;
    const rules = RULES[id] || RULES.starter;
    const paid = s && (s.payment_status === 'paid' || s.status === 'active');
    const trialEnd = s?.trial_ends_at ? Date.parse(s.trial_ends_at) : 0;
    return { plan_id: RULES[id] ? id : 'starter', plan_name: s?.name || 'Starter', rules, locked: Boolean(s && !paid && trialEnd && Date.now() > trialEnd), trial_ends_at: s?.trial_ends_at || null };
  }
  const rules = (org) => planOf(org).rules;

  function used(org, key) {
    const q = (sql, ...a) => db.prepare(sql).get(...a).c;
    switch (key) {
      case 'business_users': return q(`SELECT COUNT(*) c FROM memberships WHERE organisation_id=? AND status='active'`, org) + q(`SELECT COUNT(*) c FROM team_account_invites WHERE organisation_id=? AND status='pending' AND expires_at>?`, org, new Date().toISOString());
      case 'workers': return q(`SELECT COUNT(*) c FROM workers WHERE organisation_id=?`, org);
      case 'customers': return q(`SELECT COUNT(*) c FROM tenant_customers WHERE organisation_id=?`, org);
      case 'stock_items': return q(`SELECT COUNT(*) c FROM stock_items WHERE organisation_id=? AND active=1`, org);
      case 'media': return Math.ceil((db.prepare(`SELECT COALESCE(SUM(size_bytes),0) b FROM tenant_media WHERE organisation_id=?`).get(org).b) / 1048576);
      case 'ai': return q(`SELECT COUNT(*) c FROM usage_events WHERE organisation_id=? AND kind='ai' AND created_at>=?`, org, monthStart());
      case 'channels': return q(`SELECT COUNT(*) c FROM organisation_integrations WHERE organisation_id=? AND status='connected' AND provider NOT IN ('website','email_sms')`, org);
      default: return 0;
    }
  }
  const baseLimit = (r, key) => (key === 'media' ? r.media_mb : r[key]);
  const limitOf = (r, key, org) => { const b = baseLimit(r, key); return b < 0 || !org ? b : b + (getExtras(org)[key] || 0); };

  function check(org, key, { add = 1, bytes = 0 } = {}) {
    const p = planOf(org);
    if (p.locked) return { ok: false, error: 'Your trial has ended. Choose a plan to add more. Everything you already have is safe.', locked: true, plan: p.plan_name };
    const limit = limitOf(p.rules, key, org);
    if (limit < 0) return { ok: true, limit: -1 };
    const now = used(org, key), extra = key === 'media' ? Math.ceil(bytes / 1048576) : add;
    if (now + extra > limit) {
      const [label, unit] = LABEL[key];
      return { ok: false, upgrade: true, limit, used: now, plan: p.plan_name, error: `Your ${p.plan_name} plan includes up to ${limit.toLocaleString('en-AU')}${unit ? ' ' + unit : ''} ${label}. Upgrade your plan${ADDABLE.includes(key) ? ' or add extra under Plans & Billing' : ''} to add more.` };
    }
    return { ok: true, limit, used: now };
  }

  // Runs before the route. Only the listed create actions are checked; everything else passes straight through.
  function gate(requireSaasUser) {
    return (req, res, next) => {
      const hit = GATES.find(([m, re]) => m === req.method && re.test(req.path));
      if (!hit) return next();
      requireSaasUser(req, res, () => {
        const org = req.saas.organisation_id, key = hit[2];
        if (key === 'channels') {
          const prov = hit[1].exec(req.path)[1];
          if (PLATFORM_MANAGED.includes(prov) || db.prepare(`SELECT 1 FROM organisation_integrations WHERE organisation_id=? AND provider=? AND status='connected'`).get(org, prov)) return next();
        }
        const r = check(org, key, { bytes: Number(req.headers['content-length'] || 0) });
        if (!r.ok) {
          getNotify()?.notifyRoles?.(org, ['owner'], { kind: 'plan', title: r.locked ? 'Your trial has ended' : `Plan limit reached: ${LABEL[key]?.[0] || 'feature'}`, body: r.error, link: '#billing', dedupe: `blocked:${key}:${r.locked ? 'locked' : planOf(org).plan_id}:${new Date().toISOString().slice(0, 7)}` })?.catch?.(() => {});
          return res.status(403).json({ ok: false, error: r.error, upgrade: Boolean(r.upgrade), trial_ended: Boolean(r.locked) });
        }
        if (key === 'ai') db.prepare(`INSERT INTO usage_events (id,organisation_id,kind,created_at) VALUES (?,?,?,?)`).run(crypto.randomUUID(), org, 'ai', new Date().toISOString());
        next();
      });
    };
  }

  function usage(org) {
    const r = rules(org);
    return COUNTED.map((key) => { const limit = limitOf(r, key, org), base = baseLimit(r, key), u = used(org, key); return { key, label: LABEL[key][0], unit: LABEL[key][1], used: u, limit, extra: limit < 0 ? 0 : limit - base, addable: ADDABLE.includes(key), percent: limit < 0 ? 0 : Math.min(100, Math.round((u / limit) * 100)) }; });
  }

  // Tell the owner once at 80% and once at 100% so a limit never surprises them.
  async function watch() {
    const notify = getNotify();
    if (!notify) return 0;
    let sent = 0;
    for (const { id: org } of db.prepare(`SELECT organisation_id id FROM organisation_subscriptions`).all()) {
      const p = planOf(org);
      for (const u of usage(org)) {
        if (u.limit < 0 || u.percent < 80) continue;
        const level = u.percent >= 100 ? 100 : 80, period = u.key === 'ai' ? new Date().toISOString().slice(0, 7) : p.plan_id;
        await notify.notifyRoles(org, ['owner'], { kind: 'plan', title: level === 100 ? `${u.label} limit reached` : `${u.label}: ${u.percent}% used`, body: `${u.used.toLocaleString('en-AU')} of ${u.limit.toLocaleString('en-AU')} ${u.unit} used on ${p.plan_name}. Upgrade any time to add more.`, link: '#billing', dedupe: `limit:${u.key}:${level}:${period}` });
        sent++;
      }
    }
    return sent;
  }
  const timer = setInterval(() => { watch().catch(() => {}); }, 6 * 3600 * 1000);
  timer.unref?.();

  function install(app, { requireSaasUser, requireSaasRole }) {
    app.get('/api/saas/entitlements', requireSaasUser, requireSaasRole('owner', 'admin', 'manager', 'super_admin', 'director'), (req, res) => {
      const org = req.saas.organisation_id, p = planOf(org);
      res.json({ ok: true, plan: { id: p.plan_id, name: p.plan_name }, locked: p.locked, usage: usage(org), features: { growth_days: p.rules.growth_days, growth_posts_per_day: p.rules.growth_posts_per_day, growth_auto_publish: p.rules.growth_auto_publish } });
    });
  }
  return { planOf, rules, check, usage, gate, watch, install, used };
}
