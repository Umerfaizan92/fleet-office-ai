// Phase 09: monitoring, alerting and daily health summaries for the Founder Console.
// Each probe reads what the app already records (requests, jobs, deliveries, calls, payment events, backups) and
// returns ok / warn / fail with a plain explanation. Results are stored, alerts open and close themselves, critical
// alerts are emailed to the operator, and a daily summary reports health, backups and recovery readiness.
// Probes are read-only. Nothing here changes customer data.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { monitorEventLoopDelay } from 'node:perf_hooks';
import { securityPosture } from '../security-policy.js';

const iso = (t = Date.now()) => new Date(t).toISOString();
const MIN = 60000, HOUR = 60 * MIN, DAY = 24 * HOUR;
export const COMPONENTS = Object.freeze([
  ['availability', 'Application availability'], ['api', 'API failures'], ['auth', 'Sign-in and authentication errors'], ['database', 'Database performance'], ['storage', 'Storage availability'], ['queue', 'Background jobs'], ['ai', 'AI service'], ['voice', 'Voice service'], ['email', 'Email delivery'], ['payments', 'Payment webhooks'], ['backups', 'Backups'], ['deployment', 'Deployment health'], ['resources', 'Resource usage'], ['security', 'Security events']
]);
const LABEL = Object.fromEntries(COMPONENTS);
// Request groups used by the probes. Paths only; never query strings or bodies.
const GROUPS = [
  ['webhook_payments', /^\/api\/webhooks\/payments\//], ['webhook_telnyx', /^\/api\/webhooks\/(telnyx|communications\/telnyx)/], ['webhook_other', /^\/api\/webhooks\//],
  ['auth', /^\/api\/(saas\/(auth|sign-?in|login|session|password|mfa)|operator\/(sign-?in|login|session|mfa)|admin\/(login|session))/], ['operator', /^\/api\/(operator|admin)\//], ['api', /^\/api\//]
];
const groupOf = (p) => (GROUPS.find(([, re]) => re.test(p)) || [null])[0];

export function createMonitor({ db, env = process.env, queue = null, backups = null, storage = null, databasePath = '', uploadRoot = '', mail = null, startedAt = Date.now(), clock = () => Date.now(), fetchImpl = globalThis.fetch, log = console }) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS reliability_metrics (minute TEXT NOT NULL, grp TEXT NOT NULL, status_class TEXT NOT NULL, count INTEGER NOT NULL, ms_total INTEGER NOT NULL, ms_max INTEGER NOT NULL, PRIMARY KEY (minute, grp, status_class));
    CREATE TABLE IF NOT EXISTS reliability_events (id INTEGER PRIMARY KEY AUTOINCREMENT, service TEXT NOT NULL, ok INTEGER NOT NULL, ms INTEGER, detail TEXT, at TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS reliability_events_service ON reliability_events(service, at);
    CREATE TABLE IF NOT EXISTS reliability_checks (id TEXT PRIMARY KEY, run_id TEXT NOT NULL, component TEXT NOT NULL, status TEXT NOT NULL, detail TEXT NOT NULL, metrics_json TEXT NOT NULL DEFAULT '{}', checked_at TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS reliability_checks_run ON reliability_checks(checked_at, component);
    CREATE TABLE IF NOT EXISTS reliability_alerts (id TEXT PRIMARY KEY, component TEXT NOT NULL, severity TEXT NOT NULL, title TEXT NOT NULL, detail TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'open', opened_at TEXT NOT NULL, last_seen_at TEXT NOT NULL, seen_count INTEGER NOT NULL DEFAULT 1, notified_at TEXT, notify_result TEXT, acknowledged_by TEXT, acknowledged_at TEXT, resolved_at TEXT, resolved_by TEXT, note TEXT);
    CREATE INDEX IF NOT EXISTS reliability_alerts_open ON reliability_alerts(status, component);
    CREATE TABLE IF NOT EXISTS reliability_boots (id TEXT PRIMARY KEY, started_at TEXT NOT NULL, commit_sha TEXT, node TEXT);
    CREATE TABLE IF NOT EXISTS reliability_summaries (day TEXT PRIMARY KEY, created_at TEXT NOT NULL, overall TEXT NOT NULL, body_json TEXT NOT NULL, emailed_to TEXT, email_result TEXT);
    CREATE TABLE IF NOT EXISTS reliability_state (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL);`);
  db.prepare('INSERT INTO reliability_boots (id,started_at,commit_sha,node) VALUES (?,?,?,?)').run(crypto.randomUUID(), iso(startedAt), env.RENDER_GIT_COMMIT || null, process.version);
  const now = () => iso(clock());
  const safe = (fn, d = null) => { try { return fn(); } catch { return d; } };
  const one = (sql, ...a) => safe(() => db.prepare(sql).get(...a), null);
  const all = (sql, ...a) => safe(() => db.prepare(sql).all(...a), []);
  const since = (ms) => iso(clock() - ms);
  const loop = monitorEventLoopDelay({ resolution: 20 }); loop.enable();

  // ---------------- request metrics (aggregated per minute, flushed to the database) ----------------
  let bucket = new Map();
  const flush = () => {
    if (!bucket.size) return; const rows = bucket; bucket = new Map();
    const up = db.prepare('INSERT INTO reliability_metrics (minute,grp,status_class,count,ms_total,ms_max) VALUES (?,?,?,?,?,?) ON CONFLICT(minute,grp,status_class) DO UPDATE SET count=count+excluded.count,ms_total=ms_total+excluded.ms_total,ms_max=MAX(ms_max,excluded.ms_max)');
    safe(() => db.transaction(() => { for (const [k, v] of rows) { const [minute, grp, sc] = k.split('|'); up.run(minute, grp, sc, v.count, v.ms, v.max); } })());
  };
  function middleware() {
    return (req, res, next) => {
      const t0 = process.hrtime.bigint();
      res.on('finish', () => {
        const grp = groupOf(req.originalUrl || req.url || ''); if (!grp) return;
        const ms = Math.round(Number(process.hrtime.bigint() - t0) / 1e6), sc = `${String(res.statusCode)[0]}xx`, k = `${iso(clock()).slice(0, 16)}|${grp}|${res.statusCode === 401 || res.statusCode === 403 ? res.statusCode : res.statusCode === 429 ? '429' : sc}`;
        const v = bucket.get(k) || { count: 0, ms: 0, max: 0 }; v.count++; v.ms += ms; v.max = Math.max(v.max, ms); bucket.set(k, v);
        if (bucket.size > 500) flush();
      });
      next();
    };
  }
  const metrics = (grp, windowMs) => { flush(); const r = all("SELECT status_class,SUM(count) n,SUM(ms_total) ms,MAX(ms_max) mx FROM reliability_metrics WHERE grp=? AND minute>=? GROUP BY status_class", grp, iso(clock() - windowMs).slice(0, 16)); const by = Object.fromEntries(r.map((x) => [x.status_class, x])); const total = r.reduce((s, x) => s + x.n, 0); return { total, by, n: (k) => by[k]?.n || 0, avg_ms: total ? Math.round(r.reduce((s, x) => s + x.ms, 0) / total) : null, max_ms: Math.max(0, ...r.map((x) => x.mx || 0)) }; };
  // Outcomes of calls to outside services (AI, provider APIs), recorded by small hooks.
  function recordService(service, ok, { ms = null, detail = null } = {}) { safe(() => db.prepare('INSERT INTO reliability_events (service,ok,ms,detail,at) VALUES (?,?,?,?,?)').run(service, ok ? 1 : 0, ms, detail ? String(detail).slice(0, 200) : null, now())); }

  // ---------------- probes ----------------
  const R = (status, detail, m = {}) => ({ status, detail, metrics: m });
  const P = {
    availability() {
      const t0 = Date.now(); const ok = safe(() => db.prepare('SELECT 1 ok').get().ok === 1, false); const ms = Date.now() - t0;
      const jobs = queue?.stats?.() || { oldest_due_seconds: 0 };
      if (!ok) return R('fail', 'The database did not answer. The app cannot serve requests.', { db_ms: ms });
      return R(jobs.oldest_due_seconds > 900 ? 'warn' : 'ok', `Running for ${Math.round((clock() - startedAt) / MIN)} minute(s); database answered in ${ms} ms.${jobs.oldest_due_seconds > 900 ? ' Readiness reports background work behind.' : ''} External uptime is checked by Render's health check (/healthz).`, { uptime_s: Math.round((clock() - startedAt) / 1000), db_ms: ms });
    },
    api() {
      const m = metrics('api', 15 * MIN), errs = m.n('5xx'), rate = m.total ? errs / m.total : 0;
      return R(errs >= 10 && rate >= 0.05 ? 'fail' : errs >= 3 && rate >= 0.01 ? 'warn' : 'ok', m.total ? `${m.total} API request(s) in 15 minutes, ${errs} server error(s) (${(rate * 100).toFixed(1)}%). Average ${m.avg_ms} ms, slowest ${m.max_ms} ms.` : 'No API traffic in the last 15 minutes.', { requests: m.total, errors_5xx: errs, error_rate: rate, avg_ms: m.avg_ms, max_ms: m.max_ms });
    },
    auth() {
      const m = metrics('auth', 15 * MIN), op = metrics('operator', 15 * MIN), denied = m.n('401') + m.n('403'), limited = m.n('429') + op.n('429');
      const locked = one('SELECT COUNT(*) n FROM users WHERE locked_until > ?', now())?.n || 0;
      return R(denied >= 100 || limited >= 50 ? 'fail' : denied >= 25 || locked >= 5 || limited >= 10 ? 'warn' : 'ok', `${denied} refused sign-in or session request(s) and ${limited} rate-limited request(s) in 15 minutes; ${locked} account(s) locked after failed passwords.`, { refused_15m: denied, rate_limited_15m: limited, locked_accounts: locked, operator_refused_15m: op.n('401') + op.n('403') });
    },
    database() {
      const t = (sql) => { const a = Date.now(); safe(() => db.prepare(sql).get()); return Date.now() - a; };
      const ms = Math.max(t('SELECT COUNT(*) FROM audit_logs'), t('SELECT COUNT(*) FROM background_jobs'));
      let size = null, wal = null; try { size = fs.statSync(databasePath).size; } catch { /* unknown */ } try { wal = fs.statSync(databasePath + '-wal').size; } catch { wal = 0; }
      const pages = safe(() => db.pragma('page_count', { simple: true }) * db.pragma('page_size', { simple: true }), null);
      return R(ms > 2000 ? 'fail' : ms > 250 || (wal || 0) > 512 * 1048576 ? 'warn' : 'ok', `Count queries took ${ms} ms. Database ${size ? Math.round(size / 1048576) + ' MB' : 'size unknown'}${wal ? `, write-ahead log ${Math.round(wal / 1048576)} MB` : ''}.`, { query_ms: ms, size_bytes: size ?? pages, wal_bytes: wal });
    },
    storage() {
      const dir = path.dirname(databasePath || '.'); const s = safe(() => fs.statfsSync(dir)); const free = s ? (s.bavail * s.bsize) / (s.blocks * s.bsize) : null;
      let writable = false; try { const f = path.join(uploadRoot || dir, `.sp-probe-${process.pid}`); fs.writeFileSync(f, 'ok'); fs.unlinkSync(f); writable = true; } catch { writable = false; }
      const primary = storage?.config; const sync = globalThis.__superProUploadSync || null;
      const problems = [];
      if (!writable) problems.push('The upload folder cannot be written.');
      if (free !== null && free < 0.05) problems.push(`Only ${(free * 100).toFixed(1)}% disk space left.`);
      if (primary && primary.mode === 's3' && !primary.ready) problems.push('Primary file storage is not ready: ' + (primary.problems || []).join(' '));
      if (sync?.last_error && (!sync.last_ok_at || sync.last_error_at > sync.last_ok_at)) problems.push('Copying uploads to the backup bucket failed: ' + sync.last_error);
      const warn = free !== null && free < 0.15;
      return R(problems.length ? 'fail' : warn ? 'warn' : 'ok', problems.length ? problems.join(' ') : `Disk ${free === null ? 'space unknown' : (free * 100).toFixed(0) + '% free'}; uploads folder writable${sync?.last_ok_at ? `; uploads last copied to the backup bucket ${Math.round((clock() - Date.parse(sync.last_ok_at)) / MIN)} minute(s) ago` : ''}.`, { free_ratio: free, writable, primary_mode: primary?.mode || 'disk' });
    },
    queue() {
      const st = queue?.stats?.() || { counts: {}, oldest_due_seconds: 0 };
      const dead24 = one("SELECT COUNT(*) n FROM background_jobs WHERE status='dead' AND updated_at>=?", since(DAY))?.n || 0;
      const retrying = one("SELECT COUNT(*) n FROM background_jobs WHERE status='failed'")?.n || 0;
      const stuck = one("SELECT COUNT(*) n FROM background_jobs WHERE status='running' AND locked_until < ?", now())?.n || 0;
      const lag = st.oldest_due_seconds || 0;
      return R(lag > 3600 || dead24 >= 10 ? 'fail' : lag > 900 || dead24 > 0 || stuck > 0 ? 'warn' : 'ok', `${st.counts?.queued || 0} queued, ${st.counts?.running || 0} running, ${retrying} waiting to retry, ${dead24} failed permanently in 24 hours${stuck ? `, ${stuck} stuck past their lease` : ''}. Oldest due job ${Math.round(lag / 60)} minute(s) late.`, { dead_24h: dead24, retrying, stuck, lag_s: lag });
    },
    ai() {
      const configured = Boolean(env.GEMINI_API_KEY || env.GOOGLE_AI_API_KEY || env.OPENAI_API_KEY || env.AI_PROVIDER_API_KEY);
      const r = one("SELECT COUNT(*) n, SUM(ok=0) bad, AVG(ms) ms FROM reliability_events WHERE service='ai' AND at>=?", since(HOUR)) || { n: 0, bad: 0 };
      const rate = r.n ? r.bad / r.n : 0;
      if (!configured) return R('warn', 'No AI provider key is set, so AI features fall back or are unavailable.', { configured });
      return R(r.n >= 3 && rate >= 0.5 ? 'fail' : r.bad >= 2 && rate >= 0.2 ? 'warn' : 'ok', r.n ? `${r.n} AI request(s) in the last hour, ${r.bad || 0} failed; average ${Math.round(r.ms || 0)} ms.` : 'No AI requests in the last hour.', { requests_1h: r.n, failed_1h: r.bad || 0, failure_rate: rate });
    },
    voice() {
      const configured = Boolean(env.TELNYX_API_KEY);
      const c = one("SELECT COUNT(*) n, SUM(failures_json<>'[]') bad FROM voice_calls WHERE started_at>=?", since(DAY)) || { n: 0, bad: 0 };
      const hooks = metrics('webhook_telnyx', HOUR), rejected = hooks.n('4xx') + hooks.n('401') + hooks.n('403'), errs = hooks.n('5xx');
      if (!configured) return R('warn', 'Telnyx is not configured, so calls and SMS are unavailable.', { configured });
      const rate = c.n ? (c.bad || 0) / c.n : 0;
      return R(errs >= 5 || (c.n >= 3 && rate >= 0.5) ? 'fail' : errs || rejected >= 5 || (c.bad || 0) > 0 ? 'warn' : 'ok', `${c.n} call(s) in 24 hours, ${c.bad || 0} with a failed step. Telnyx messages in the last hour: ${hooks.total} (${rejected} refused, ${errs} errors).`, { calls_24h: c.n, calls_with_failures: c.bad || 0, webhook_rejected_1h: rejected, webhook_errors_1h: errs });
    },
    email() {
      const configured = Boolean(env.RESEND_API_KEY || env.SMTP_HOST);
      const d = one("SELECT COUNT(*) n, SUM(status='failed') bad FROM communication_deliveries WHERE channel='email' AND created_at>=?", since(DAY)) || { n: 0, bad: 0 };
      const rate = d.n ? (d.bad || 0) / d.n : 0;
      if (!configured) return R('warn', 'No email provider (RESEND_API_KEY or SMTP) is set, so emails are not sent.', { configured });
      return R(d.n >= 5 && rate >= 0.25 ? 'fail' : (d.bad || 0) > 0 ? 'warn' : 'ok', `${d.n} email(s) tracked in 24 hours, ${d.bad || 0} failed or bounced.`, { emails_24h: d.n, failed_24h: d.bad || 0, failure_rate: rate });
    },
    payments() {
      const m = metrics('webhook_payments', DAY), refused = m.n('4xx') + m.n('401') + m.n('403'), errs = m.n('5xx');
      const odd = one("SELECT COUNT(*) n FROM payment_events WHERE received_at>=? AND outcome IN ('amount_mismatch','unmatched')", since(DAY))?.n || 0;
      return R(errs >= 3 ? 'fail' : errs || refused >= 5 || odd ? 'warn' : 'ok', `${m.total} payment provider message(s) in 24 hours: ${errs} failed to process, ${refused} refused (bad signature or unknown business), ${odd} unmatched or amount mismatch.`, { webhooks_24h: m.total, errors_24h: errs, refused_24h: refused, unmatched_or_mismatch_24h: odd });
    },
    backups() {
      const s = backups?.status?.(); if (!s) return R('warn', 'The backup engine is not running.', {});
      const prod = env.NODE_ENV === 'production';
      if (!s.configured) return R(prod ? 'fail' : 'warn', 'No backup target is set (BACKUP_S3_BUCKET). Only the server disk holds the data.', { configured: false });
      const p = s.policy, problems = [], warns = [];
      if (s.last_snapshot?.status === 'failed') problems.push('The last snapshot failed: ' + s.last_snapshot.error);
      if (s.snapshot_age_hours === null) warns.push('No snapshot has been taken yet.'); else if (s.snapshot_age_hours > p.snapshot_max_age_hours) problems.push(`The newest good snapshot is ${Math.round(s.snapshot_age_hours)} hours old.`);
      if (s.last_restore_test?.status === 'failed') problems.push('The last restore test failed: ' + (s.last_restore_test.error || 'see Reliability > Backups'));
      if (s.restore_test_age_hours === null) warns.push('No restore test has passed yet.'); else if (s.restore_test_age_hours > p.restore_test_max_age_hours) warns.push(`The last passed restore test was ${Math.round(s.restore_test_age_hours / 24)} days ago.`);
      if (!s.offsite) warns.push('Snapshots are kept on this server only (no off-site bucket).');
      if (prod && !s.litestream) warns.push('Continuous replication (Litestream) is not running in this process.');
      return R(problems.length ? 'fail' : warns.length ? 'warn' : 'ok', [...problems, ...warns].join(' ') || `Last snapshot ${Math.round(s.snapshot_age_hours)} hour(s) ago; last restore test passed ${Math.round(s.restore_test_age_hours)} hour(s) ago.`, { snapshot_age_h: s.snapshot_age_hours, restore_test_age_h: s.restore_test_age_hours, offsite: s.offsite, litestream: s.litestream });
    },
    async deployment() {
      const boots = one('SELECT COUNT(*) n FROM reliability_boots WHERE started_at>=?', since(DAY))?.n || 0;
      const base = { commit: env.RENDER_GIT_COMMIT ? String(env.RENDER_GIT_COMMIT).slice(0, 12) : null, restarts_24h: Math.max(0, boots - 1), environment: env.NODE_ENV || 'development' };
      let render = null;
      if (env.RENDER_API_KEY && env.RENDER_SERVICE_ID) {
        try {
          const r = await fetchImpl(`${String(env.RENDER_API_BASE_URL || 'https://api.render.com').replace(/\/$/, '')}/v1/services/${encodeURIComponent(env.RENDER_SERVICE_ID)}/deploys?limit=1`, { headers: { authorization: `Bearer ${env.RENDER_API_KEY}`, accept: 'application/json' }, signal: AbortSignal.timeout(8000) });
          const j = await r.json().catch(() => null); const d = Array.isArray(j) ? (j[0]?.deploy || j[0]) : null;
          render = r.ok && d ? { status: d.status, commit: d.commit?.id?.slice(0, 12) || null, finished_at: d.finishedAt || null } : { error: `Render API answered ${r.status}` };
          recordService('render_api', r.ok);
        } catch (e) { render = { error: e.message }; recordService('render_api', false, { detail: e.message }); }
      }
      const failedDeploy = render?.status && /failed|canceled/i.test(render.status);
      const status = failedDeploy || base.restarts_24h >= 5 ? 'fail' : base.restarts_24h >= 2 || render?.error ? 'warn' : 'ok';
      return R(status, `${base.environment}${base.commit ? ` at ${base.commit}` : ''}; ${base.restarts_24h} restart(s) in 24 hours.${render ? (render.error ? ` Render API: ${render.error}.` : ` Latest Render deploy: ${render.status}${render.commit ? ' (' + render.commit + ')' : ''}.`) : ' Set RENDER_API_KEY and RENDER_SERVICE_ID to check Render deploys.'}`, { ...base, render });
    },
    resources() {
      const mem = process.memoryUsage(), limit = Number(env.RELIABILITY_MEMORY_LIMIT_MB || 512), rss = mem.rss / 1048576, p99 = loop.percentile(99) / 1e6;
      return R(rss > limit * 0.9 || p99 > 1000 ? 'fail' : rss > limit * 0.75 || p99 > 200 ? 'warn' : 'ok', `Memory ${Math.round(rss)} MB of ${limit} MB; event loop delay p99 ${Math.round(p99)} ms.`, { rss_mb: Math.round(rss), heap_mb: Math.round(mem.heapUsed / 1048576), limit_mb: limit, loop_p99_ms: Math.round(p99) });
    },
    security() {
      const posture = safe(() => securityPosture(env).checks || securityPosture(env), []);
      const warns = (Array.isArray(posture) ? posture : []).filter((c) => c.status === 'warn');
      const op = metrics('operator', DAY), refused = op.n('401') + op.n('403');
      const chainJob = one("SELECT status,last_error,finished_at FROM background_jobs WHERE type='audit.verify_chain' ORDER BY created_at DESC LIMIT 1");
      const chainBad = chainJob && chainJob.status === 'dead';
      const sec = one('SELECT COUNT(*) n FROM security_notifications WHERE created_at>=?', since(DAY))?.n || 0;
      return R(chainBad || refused >= 100 ? 'fail' : warns.length || refused >= 20 ? 'warn' : 'ok', `${refused} refused Founder Console request(s) in 24 hours; ${sec} security notice(s) sent to users; ${warns.length} security setting(s) to review${warns.length ? ': ' + warns.map((w) => w.detail).slice(0, 2).join(' ') : ''}.${chainBad ? ' The audit chain check failed.' : ''}`, { operator_refused_24h: refused, posture_warnings: warns.length, security_notices_24h: sec, audit_chain_failed: Boolean(chainBad) });
    }
  };

  // ---------------- run, alert, notify ----------------
  async function runChecks({ trigger = 'schedule' } = {}) {
    const run = crypto.randomUUID(), at = now(), out = [];
    for (const [k] of COMPONENTS) {
      let r; try { r = await P[k](); } catch (e) { r = R('fail', `The check itself failed: ${e.message}`); }
      out.push({ component: k, label: LABEL[k], ...r });
      db.prepare('INSERT INTO reliability_checks (id,run_id,component,status,detail,metrics_json,checked_at) VALUES (?,?,?,?,?,?,?)').run(crypto.randomUUID(), run, k, r.status, r.detail, JSON.stringify(r.metrics || {}), at);
    }
    await evaluateAlerts(out);
    db.prepare("INSERT INTO reliability_state (key,value,updated_at) VALUES ('last_checks',?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at").run(run, at);
    return { run_id: run, checked_at: at, trigger, overall: overall(out), components: out };
  }
  const overall = (list) => (list.some((c) => c.status === 'fail') ? 'fail' : list.some((c) => c.status === 'warn') ? 'warn' : 'ok');
  async function evaluateAlerts(results) {
    for (const c of results) {
      const open = db.prepare("SELECT * FROM reliability_alerts WHERE component=? AND status IN ('open','acknowledged') ORDER BY opened_at DESC LIMIT 1").get(c.component);
      if (c.status === 'ok') { if (open) db.prepare("UPDATE reliability_alerts SET status='resolved',resolved_at=?,resolved_by='automatic: check passed' WHERE id=?").run(now(), open.id); continue; }
      // A warning becomes an alert only after three checks in a row, so one slow minute does not page anyone.
      if (c.status === 'warn') { const last = all('SELECT status FROM reliability_checks WHERE component=? ORDER BY checked_at DESC LIMIT 3', c.component); if (last.length < 3 || last.some((x) => x.status === 'ok')) continue; }
      const severity = c.status === 'fail' ? 'critical' : 'warning';
      if (open) { db.prepare('UPDATE reliability_alerts SET last_seen_at=?,seen_count=seen_count+1,detail=?,severity=CASE WHEN ?=\'critical\' THEN \'critical\' ELSE severity END WHERE id=?').run(now(), c.detail, severity, open.id); if (severity === 'critical' && !open.notified_at) await notifyAlert(db.prepare('SELECT * FROM reliability_alerts WHERE id=?').get(open.id)); continue; }
      const id = crypto.randomUUID();
      db.prepare("INSERT INTO reliability_alerts (id,component,severity,title,detail,opened_at,last_seen_at) VALUES (?,?,?,?,?,?,?)").run(id, c.component, severity, `${LABEL[c.component]}: ${c.status === 'fail' ? 'failing' : 'needs attention'}`, c.detail, now(), now());
      if (severity === 'critical') await notifyAlert(db.prepare('SELECT * FROM reliability_alerts WHERE id=?').get(id));
    }
  }
  const operatorEmail = () => String(env.OPERATOR_ALERT_EMAIL || env.OPERATOR_EMAIL || '').trim();
  async function notifyAlert(a) {
    const to = operatorEmail(); let result = 'no_operator_email';
    if (to && mail) { try { const r = await mail({ to, subject: `Critical: ${a.title}`, heading: a.title, paragraphs: [a.detail, `Opened ${new Date(a.opened_at).toLocaleString('en-AU', { timeZone: 'Australia/Perth' })} (Perth). Open Founder Console > Operations > Reliability for details and the runbook.`] }); result = r?.sent ? 'sent' : r?.reason || 'failed'; } catch (e) { result = 'failed: ' + e.message; } }
    db.prepare('UPDATE reliability_alerts SET notified_at=?,notify_result=? WHERE id=?').run(now(), result, a.id);
    log.warn?.(`[reliability] CRITICAL ${a.component}: ${a.detail}`);
    return result;
  }
  function acknowledge(id, by, note) { const r = db.prepare("UPDATE reliability_alerts SET status='acknowledged',acknowledged_by=?,acknowledged_at=?,note=? WHERE id=? AND status='open'").run(by, now(), String(note || '').slice(0, 300), id); return r.changes ? { ok: true } : { ok: false, status: 409, error: 'Only an open alert can be acknowledged.' }; }
  function resolve(id, by, note) { const r = db.prepare("UPDATE reliability_alerts SET status='resolved',resolved_at=?,resolved_by=?,note=COALESCE(?,note) WHERE id=? AND status IN ('open','acknowledged')").run(now(), by, note ? String(note).slice(0, 300) : null, id); return r.changes ? { ok: true } : { ok: false, status: 409, error: 'This alert is already resolved.' }; }

  function latest() {
    const run = one("SELECT value FROM reliability_state WHERE key='last_checks'")?.value;
    const comps = run ? all('SELECT component,status,detail,metrics_json,checked_at FROM reliability_checks WHERE run_id=?', run).map((r) => ({ ...r, label: LABEL[r.component], metrics: JSON.parse(r.metrics_json || '{}'), metrics_json: undefined })) : [];
    const order = COMPONENTS.map(([k]) => k); comps.sort((a, b) => order.indexOf(a.component) - order.indexOf(b.component));
    const history = all("SELECT component, SUM(status='ok') ok, SUM(status='warn') warn, SUM(status='fail') fail FROM reliability_checks WHERE checked_at>=? GROUP BY component", since(DAY));
    return { checked_at: comps[0]?.checked_at || null, overall: comps.length ? overall(comps) : 'unknown', components: comps, last_24h: history, alerts: all("SELECT * FROM reliability_alerts ORDER BY status='resolved', opened_at DESC LIMIT 50") };
  }

  // ---------------- daily summary ----------------
  async function dailySummary({ send = true } = {}) {
    const day = iso(clock()).slice(0, 10);
    const res = await runChecks({ trigger: 'daily_summary' });
    const b = backups?.status?.() || {};
    const opened = all("SELECT severity,title FROM reliability_alerts WHERE opened_at>=?", since(DAY));
    const readiness = recoveryReadiness();
    const body = { day, overall: res.overall, components: res.components.map((c) => ({ component: c.label, status: c.status, detail: c.detail })), alerts_24h: opened, open_alerts: all("SELECT severity,title,opened_at FROM reliability_alerts WHERE status<>'resolved'"), backups: { last_snapshot: b.last_good_snapshot?.started_at || null, last_restore_test: b.last_passed_restore_test?.started_at || null, offsite: b.offsite, litestream: b.litestream }, readiness };
    let emailed = null, result = null;
    if (send && operatorEmail() && mail) {
      emailed = operatorEmail();
      const line = (c) => `${c.status === 'ok' ? 'OK' : c.status === 'warn' ? 'Check' : 'FAILING'}: ${c.component}. ${c.detail}`;
      try { const r = await mail({ to: emailed, subject: `Super Pro daily health: ${res.overall === 'ok' ? 'all good' : res.overall === 'warn' ? 'needs attention' : 'problems found'}`, heading: `Daily health summary, ${day}`, paragraphs: [`Overall: ${res.overall === 'ok' ? 'all checks passed' : res.overall === 'warn' ? 'some checks need attention' : 'one or more checks are failing'}. ${body.open_alerts.length} open alert(s).`, `Recovery readiness: ${readiness.ready ? 'ready' : 'not ready'}. ${readiness.items.filter((i) => !i.ok).map((i) => i.text).join(' ')}`, ...body.components.map(line)] }); result = r?.sent ? 'sent' : r?.reason || 'failed'; } catch (e) { result = 'failed: ' + e.message; }
    }
    db.prepare('INSERT INTO reliability_summaries (day,created_at,overall,body_json,emailed_to,email_result) VALUES (?,?,?,?,?,?) ON CONFLICT(day) DO UPDATE SET created_at=excluded.created_at,overall=excluded.overall,body_json=excluded.body_json,emailed_to=excluded.emailed_to,email_result=excluded.email_result').run(day, now(), res.overall, JSON.stringify(body), emailed, result);
    return { ...body, emailed_to: emailed ? emailed.replace(/^(.).*(@.*)$/, '$1…$2') : null, email_result: result };
  }
  function recoveryReadiness() {
    const b = backups?.status?.() || {}, p = b.policy || {};
    const items = [
      { ok: Boolean(b.configured && b.offsite), text: b.offsite ? 'Backups are off-site in a separate bucket.' : 'Backups are not off-site.' },
      { ok: Boolean(b.litestream), text: b.litestream ? 'Continuous replication is running (point-in-time recovery for 72 hours).' : 'Continuous replication is not running in this process.' },
      { ok: b.snapshot_age_hours !== null && b.snapshot_age_hours <= (p.snapshot_max_age_hours || 26), text: b.snapshot_age_hours === null ? 'No snapshot yet.' : `Newest snapshot ${Math.round(b.snapshot_age_hours)} hour(s) old.` },
      { ok: b.restore_test_age_hours !== null && b.restore_test_age_hours <= (p.restore_test_max_age_hours || 192), text: b.restore_test_age_hours === null ? 'No restore test has passed yet.' : `Last restore test passed ${Math.round(b.restore_test_age_hours)} hour(s) ago${b.last_passed_restore_test?.seconds ? ` in ${Number(b.last_passed_restore_test.seconds).toFixed(1)} s` : ''}.` },
      { ok: Boolean(b.last_config && b.last_config.status === 'ok'), text: b.last_config?.status === 'ok' ? 'Configuration backed up.' : 'Configuration has not been backed up yet.' }
    ];
    return { ready: items.every((i) => i.ok), items, rpo: p.rpo, rto: p.rto };
  }

  function purgeTelemetry() {
    // Monitoring telemetry only (counters and check results), never customer data.
    const a = db.prepare('DELETE FROM reliability_metrics WHERE minute < ?').run(iso(clock() - 14 * DAY).slice(0, 16)).changes;
    const b = db.prepare('DELETE FROM reliability_events WHERE at < ?').run(since(14 * DAY)).changes;
    const c = db.prepare('DELETE FROM reliability_checks WHERE checked_at < ?').run(since(30 * DAY)).changes;
    return a + b + c;
  }
  const flushTimer = setInterval(flush, 30000); flushTimer.unref?.();
  return { middleware, recordService, runChecks, latest, acknowledge, resolve, dailySummary, recoveryReadiness, purgeTelemetry, flush, probes: P, COMPONENTS };
}
