// Phase 09: safe, bounded self-healing. Only recoveries that cannot lose or change customer data run on their own:
//   • background jobs that failed on a temporary error (network, timeout, rate limit, 5xx) and whose type is known to be
//     safe to repeat are given two more attempts, at most twice per job;
//   • jobs stuck past their lease are reported (the queue reclaims them itself; one with no handler is flagged);
//   • expired, non-sensitive caches and old temporary backup files are cleared;
//   • a failed backup-bucket connection is rebuilt once and checked again.
// Anything destructive or hard to undo (rollback, database restore, migrations, credential changes, data deletion,
// major configuration changes) is never done here. Those are Level 3 manual actions that need a named approver,
// run zero automatic attempts, and are carried out by a person.
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const iso = (t = Date.now()) => new Date(t).toISOString();
const HOUR = 3600000, DAY = 24 * HOUR;
export const HEAL_POLICY = Object.freeze({
  max_heals_per_job: 2, extra_attempts_per_heal: 2, dead_within_hours: 24,
  transient: /(ETIMEDOUT|ECONNRESET|ECONNREFUSED|EAI_AGAIN|ENOTFOUND|EPIPE|socket hang up|network|timed? ?out|timeout|rate.?limit|too many requests|\b429\b|\b50[0-4]\b|temporar|could not be reached|unavailable|try again)/i,
  // Job types whose handlers are idempotent (repeating them cannot do something twice).
  safe_types: ['audit.verify_chain', 'campaign.send', 'automation.execute'],
  // Never requeued automatically, whatever the error.
  never: /(delete|purge|restore|rollback|migrat|credential|rotate|refund|transfer|payout|charge|erase)/i
});
// Keys match src/automation/catalogue.js. Deploying, infrastructure changes and credential rotation reuse the
// platform actions that existed before Phase 09.
export const APPROVAL_ONLY = Object.freeze([
  ['production_deployment', 'Deploy to production', 'Deploy from Render yourself after the tests pass and the release checklist is done. Automation never deploys.'],
  ['production_rollback', 'Roll back production to an earlier deploy', 'In Render, open the service, choose Events, pick the last good deploy and press Rollback. Then check /healthz and Founder Console > Reliability.'],
  ['restore_database', 'Restore the production database from a backup', 'Follow RUNBOOKS.md "Database restore": restore to a new file with npm run backup:restore (it needs this approval reference), check it, then switch the server to it during a maintenance window.'],
  ['infrastructure_change', 'Change or migrate infrastructure (hosting, database, storage)', 'Follow the tested migration plan; keep the current Render deployment until the new one has passed its checks.'],
  ['credential_rotation', 'Change or rotate a credential', 'Create the new key at the provider, update it in Render, redeploy, check the integration, then revoke the old key.'],
  ['platform_data_deletion', 'Delete data permanently', 'Confirm the records, legal hold and retention rules first. Delete only what was approved and record what was removed.'],
  ['major_config_change', 'Make a major configuration change', 'Change one setting at a time in Render, redeploy, and watch Reliability for 30 minutes before the next change.']
]);

export function createHealer({ db, queue = null, backups = null, monitor = null, isSafeAutomationRun = () => false, cacheFiles = [], clock = () => Date.now(), log = console }) {
  db.exec(`CREATE TABLE IF NOT EXISTS reliability_heal_log (id TEXT PRIMARY KEY, at TEXT NOT NULL, kind TEXT NOT NULL, target TEXT, outcome TEXT NOT NULL, detail TEXT);
    CREATE INDEX IF NOT EXISTS reliability_heal_target ON reliability_heal_log(kind, target);`);
  const now = () => iso(clock());
  const note = (kind, target, outcome, detail) => { db.prepare('INSERT INTO reliability_heal_log (id,at,kind,target,outcome,detail) VALUES (?,?,?,?,?,?)').run(crypto.randomUUID(), now(), kind, target, outcome, String(detail || '').slice(0, 300)); return { kind, target, outcome, detail }; };
  const heals = (jobId) => db.prepare("SELECT COUNT(*) n FROM reliability_heal_log WHERE kind='job_retry' AND target=? AND outcome='requeued'").get(jobId).n;

  function safeToRepeat(job) {
    if (HEAL_POLICY.never.test(job.type)) return [false, 'This kind of job is never repeated automatically.'];
    if (!HEAL_POLICY.safe_types.includes(job.type)) return [false, 'Not on the list of jobs that are safe to repeat.'];
    if (job.type === 'automation.execute') { let p = {}; try { p = JSON.parse(job.payload_json || '{}'); } catch { /* none */ } if (!isSafeAutomationRun(p.run_id)) return [false, 'The automation step it runs is not a read-only or reporting step.']; }
    if (!HEAL_POLICY.transient.test(String(job.last_error || ''))) return [false, 'The error does not look temporary.'];
    return [true, ''];
  }
  function retryJobs() {
    const out = [];
    const dead = db.prepare("SELECT * FROM background_jobs WHERE status='dead' AND updated_at>=? ORDER BY updated_at LIMIT 50").all(iso(clock() - HEAL_POLICY.dead_within_hours * HOUR));
    for (const j of dead) {
      const [ok, why] = safeToRepeat(j);
      if (!ok) { if (!db.prepare("SELECT 1 FROM reliability_heal_log WHERE kind='job_retry' AND target=? AND outcome='left_alone'").get(j.id)) out.push(note('job_retry', j.id, 'left_alone', `${j.type}: ${why}`)); continue; }
      if (heals(j.id) >= HEAL_POLICY.max_heals_per_job) { if (!db.prepare("SELECT 1 FROM reliability_heal_log WHERE kind='job_retry' AND target=? AND outcome='gave_up'").get(j.id)) out.push(note('job_retry', j.id, 'gave_up', `${j.type}: already retried ${HEAL_POLICY.max_heals_per_job} times; left for a person.`)); continue; }
      const attempts = Math.max(0, j.max_attempts - HEAL_POLICY.extra_attempts_per_heal);
      const r = db.prepare("UPDATE background_jobs SET status='queued',attempts=?,run_at=?,finished_at=NULL,updated_at=? WHERE id=? AND status='dead'").run(attempts, iso(clock() + 60000), now(), j.id);
      if (r.changes) out.push(note('job_retry', j.id, 'requeued', `${j.type}: temporary error "${String(j.last_error).slice(0, 120)}"; ${HEAL_POLICY.extra_attempts_per_heal} more attempt(s).`));
    }
    return out;
  }
  function stuckTasks() {
    const out = [];
    const known = new Set(queue?.types?.() || []);
    for (const j of db.prepare("SELECT id,type,locked_until,attempts,max_attempts FROM background_jobs WHERE status='running' AND locked_until < ?").all(iso(clock() - 5 * 60000))) {
      if (known.size && !known.has(j.type)) { if (!db.prepare("SELECT 1 FROM reliability_heal_log WHERE kind='stuck_job' AND target=?").get(j.id)) out.push(note('stuck_job', j.id, 'reported', `${j.type} has no handler in this version, so it cannot be picked up. Retry or cancel it in Background jobs.`)); }
      // Otherwise the queue reclaims an expired lease on its next pass, within the job's own attempt limit.
    }
    for (const r of safeAll("SELECT id,action,updated_at FROM automation_runs WHERE status='executing' AND updated_at < ?", iso(clock() - 30 * 60000))) {
      if (!db.prepare("SELECT 1 FROM reliability_heal_log WHERE kind='stuck_run' AND target=?").get(r.id)) out.push(note('stuck_run', r.id, 'reported', `Automation "${r.action}" has been executing for over 30 minutes. It is not restarted automatically; check it in AI automations.`));
    }
    return out;
  }
  function safeAll(sql, ...a) { try { return db.prepare(sql).all(...a); } catch { return []; } }
  function clearCaches() {
    const out = []; let removed = 0;
    for (const { file, maxAgeMs } of cacheFiles) { try { const st = fs.statSync(file); if (clock() - st.mtimeMs > maxAgeMs) { fs.unlinkSync(file); removed++; out.push(note('cache', path.basename(file), 'cleared', 'Expired public statistics cache; it is rebuilt on the next request.')); } } catch { /* missing is fine */ } }
    for (const d of (() => { try { return fs.readdirSync(os.tmpdir()); } catch { return []; } })()) {
      if (!/^sp-(snap|verify|restore)-/.test(d)) continue;
      const full = path.join(os.tmpdir(), d); try { if (clock() - fs.statSync(full).mtimeMs > DAY) { fs.rmSync(full, { recursive: true, force: true }); removed++; } } catch { /* ignore */ }
    }
    const telemetry = monitor?.purgeTelemetry?.() || 0;
    if (telemetry) out.push(note('telemetry', null, 'cleared', `${telemetry} old monitoring row(s) removed (monitoring data only).`));
    return { out, removed };
  }
  async function reconnect() {
    const out = [];
    const last = (() => { try { return db.prepare("SELECT status,detail FROM reliability_checks WHERE component='storage' ORDER BY checked_at DESC LIMIT 1").get(); } catch { return null; } })();
    if (backups && last?.status === 'fail' && /bucket|S3|upload/i.test(last.detail || '')) {
      backups.resetClient();
      const r = await backups.storageChecks().catch((e) => ({ checks: [{ name: 'Bucket reachable', status: 'fail', detail: e.message }] }));
      const reach = (r.checks || []).find((c) => c.name === 'Bucket reachable');
      out.push(note('reconnect', 'backup_bucket', reach?.status === 'ok' ? 'recovered' : 'still_failing', reach?.detail || 'Checked once; not retried again until the next cycle.'));
    }
    return out;
  }
  async function run() {
    const actions = [...retryJobs(), ...stuckTasks(), ...clearCaches().out, ...(await reconnect())];
    return { at: now(), actions, policy: { ...HEAL_POLICY, transient: String(HEAL_POLICY.transient), never: String(HEAL_POLICY.never) } };
  }
  const history = (limit = 100) => db.prepare('SELECT * FROM reliability_heal_log ORDER BY at DESC LIMIT ?').all(limit);
  return { run, retryJobs, stuckTasks, clearCaches, reconnect, history, safeToRepeat, policy: HEAL_POLICY };
}
