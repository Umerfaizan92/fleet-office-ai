// Phase 04: Founder Console data for revenue, storage and backups, AI usage, compliance and platform configuration.
// Read-only. Founder or permitted operator staff only (platform identity). Reports names and yes/no readiness, never
// secret values. Infrastructure and background jobs come from the Phase 02 routes /api/operator/system and /jobs.
import { backupBucket } from './backup-env.js';
import { storageConfig } from './object-storage.js';

const DAY = 86400000;
const has = (v) => Boolean(String(v ?? '').trim());

export function installPlatformHealth(app, { db, env, platform, policy, legalVersion }) {
  const guard = (section) => [platform.identity, platform.permit(section, 'read')];
  // A missing optional table or column becomes "not recorded" instead of an error.
  const q = (sql, ...a) => { try { return db.prepare(sql).all(...a); } catch { return null; } };
  const one = (sql, ...a) => { try { return db.prepare(sql).get(...a); } catch { return null; } };
  const since = (days) => new Date(Date.now() - days * DAY).toISOString();
  const waived = () => new Set((q('SELECT organisation_id FROM complimentary_grants') || []).map((g) => g.organisation_id).filter((id) => policy?.active?.(id)));

  // Revenue recorded in Super Pro (subscriptions, add-ons and platform invoices). Not reconciled with Stripe here.
  app.get('/api/operator/platform/revenue', ...guard('billing'), (req, res) => {
    const free = waived();
    const subs = q(`SELECT s.organisation_id,s.plan_id,s.status,s.payment_status,p.name plan_name,p.monthly_fee_cents FROM organisation_subscriptions s LEFT JOIN subscription_plans p ON p.id=s.plan_id`) || [];
    const paying = subs.filter((s) => s.status === 'active' && !free.has(s.organisation_id));
    const addons = q(`SELECT organisation_id,SUM(price_cents*quantity) c FROM organisation_addons WHERE status='active' GROUP BY organisation_id`) || [];
    const addonMrr = addons.filter((a) => !free.has(a.organisation_id) && paying.some((p) => p.organisation_id === a.organisation_id)).reduce((s, a) => s + (a.c || 0), 0);
    const byPlan = {};
    for (const s of subs) { const k = s.plan_name || s.plan_id; byPlan[k] ||= { plan: k, monthly_fee_cents: s.monthly_fee_cents || 0, active: 0, trialing: 0, other: 0, waived: 0 }; const b = byPlan[k]; if (free.has(s.organisation_id)) b.waived++; else if (s.status === 'active') b.active++; else if (s.status === 'trialing') b.trialing++; else b.other++; }
    const inv = q(`SELECT status,COUNT(*) n,SUM(total_cents) total FROM platform_invoices GROUP BY status`) || [];
    const paid30 = one(`SELECT COALESCE(SUM(total_cents),0) c FROM platform_invoices WHERE status='paid' AND paid_at>=?`, since(30))?.c ?? null;
    const paid90 = one(`SELECT COALESCE(SUM(total_cents),0) c FROM platform_invoices WHERE status='paid' AND paid_at>=?`, since(90))?.c ?? null;
    res.json({
      ok: true,
      note: 'Recorded in Super Pro from subscriptions, add-ons and platform invoices. Card payments are confirmed by the payment provider; compare with Stripe before reporting.',
      mrr_cents: paying.reduce((s, p) => s + (p.monthly_fee_cents || 0), 0) + addonMrr,
      addon_mrr_cents: addonMrr,
      subscriptions: { total: subs.length, active_paying: paying.length, trialing: subs.filter((s) => s.status === 'trialing').length, waived: free.size, other: subs.filter((s) => !['active', 'trialing'].includes(s.status)).length },
      trial_pipeline_cents: subs.filter((s) => s.status === 'trialing' && !free.has(s.organisation_id)).reduce((s, p) => s + (p.monthly_fee_cents || 0), 0),
      plans: Object.values(byPlan),
      invoices: inv.map((i) => ({ status: i.status, count: i.n, total_cents: i.total || 0 })),
      paid_last_30_days_cents: paid30, paid_last_90_days_cents: paid90
    });
  });

  // Where files and the database are kept, and whether backups are configured. Names and yes/no only.
  app.get('/api/operator/platform/backups', ...guard('operations'), (req, res) => {
    const primary = storageConfig(env), bucket = backupBucket(env);
    res.json({
      ok: true,
      primary_files: { mode: primary.mode, ready: primary.ready, problems: primary.problems, separate_from_backup: !primary.bucket || !bucket || primary.bucket !== bucket },
      database_backup: {
        configured: has(bucket), disabled: /^(1|true|yes)$/i.test(String(env.BACKUP_DISABLED || '')),
        encryption: has(env.BACKUP_S3_KMS_KEY_ID) ? 'KMS key' : has(env.BACKUP_S3_SSE) ? String(env.BACKUP_S3_SSE) : 'S3 default',
        uploads_included: has(env.BACKUP_S3_UPLOADS_PREFIX), region: env.BACKUP_S3_REGION || env.AWS_REGION || null
      },
      persistent_disk: has(env.DATABASE_PATH) && String(env.DATABASE_PATH).startsWith('/var/data'),
      restore_drill: { recorded: false, how: 'Run npm run backup:restore-drill against a copy (never production). Results are printed by the script and are not stored in the app yet.' }
    });
  });

  // AI activity recorded by the platform. Provider charges are not recorded in Super Pro.
  app.get('/api/operator/platform/ai-usage', ...guard('operations'), (req, res) => {
    const total30 = one(`SELECT COUNT(*) n FROM usage_events WHERE kind='ai' AND created_at>=?`, since(30))?.n ?? null;
    const byOrg = q(`SELECT u.organisation_id,COALESCE(o.display_name,o.name) business,COUNT(*) n FROM usage_events u LEFT JOIN organisations o ON o.id=u.organisation_id WHERE u.kind='ai' AND u.created_at>=? GROUP BY u.organisation_id ORDER BY n DESC LIMIT 20`, since(30)) || [];
    const kinds = q(`SELECT kind,COUNT(*) n FROM usage_events WHERE created_at>=? GROUP BY kind ORDER BY n DESC`, since(30)) || [];
    const checks = one(`SELECT COUNT(*) n,SUM(CASE WHEN status='passed' THEN 1 ELSE 0 END) passed,AVG(score) avg FROM ai_verification_runs WHERE created_at>=?`, since(30));
    res.json({
      ok: true,
      note: 'Counts of AI requests recorded by Super Pro in the last 30 days. Provider costs are billed by the AI provider and are not recorded here.',
      ai_requests_30_days: total30, by_business: byOrg.map((r) => ({ business: r.business || 'Unknown business', requests: r.n })),
      usage_by_kind_30_days: kinds.map((k) => ({ kind: k.kind, count: k.n })),
      quality_checks_30_days: checks ? { runs: checks.n || 0, passed: checks.passed || 0, average_score: checks.avg === null ? null : Math.round(checks.avg * 100) / 100 } : null,
      providers: { text: has(env.AI_PROVIDER_API_KEY) || has(env.OPENAI_API_KEY) || has(env.GEMINI_API_KEY) || has(env.GOOGLE_AI_API_KEY), checker: has(env.AI_CHECKER_API_KEY), speech: has(env.AI_TTS_API_KEY) || has(env.GEMINI_API_KEY), free_mode: /^(1|true)$/i.test(String(env.FREE_AI_MODE || '')) },
      cost_recorded: false
    });
  });

  // Privacy requests, complaints, deletion requests and legal acceptance across the platform.
  app.get('/api/operator/platform/compliance', ...guard('security'), (req, res) => {
    const privacy = q(`SELECT record_type,status,COUNT(*) n FROM privacy_governance WHERE record_type IN ('access_request','correction_request','deletion_request') GROUP BY record_type,status`);
    const cases = q(`SELECT category,status,COUNT(*) n FROM support_cases GROUP BY category,status`);
    const deletions = q(`SELECT status,COUNT(*) n FROM account_deletion_requests GROUP BY status`);
    const owners = one(`SELECT COUNT(*) n FROM memberships WHERE role='owner' AND COALESCE(status,'active')='active'`)?.n ?? null;
    const accepted = one(`SELECT COUNT(DISTINCT m.user_id) n FROM memberships m JOIN legal_acceptances l ON l.user_id=m.user_id AND l.version=? WHERE m.role='owner' AND COALESCE(m.status,'active')='active'`, legalVersion)?.n ?? null;
    res.json({
      ok: true,
      privacy_requests: privacy ? privacy.map((r) => ({ type: r.record_type, status: r.status, count: r.n })) : null,
      support_cases: cases ? cases.map((r) => ({ category: r.category, status: r.status, count: r.n })) : null,
      account_deletions: deletions ? deletions.map((r) => ({ status: r.status, count: r.n })) : null,
      legal: { current_version: legalVersion, business_owners: owners, accepted_current_version: accepted },
      operator_mfa_required: /^(1|true|yes)$/i.test(String(env.REQUIRE_OPERATOR_MFA || '')) || env.NODE_ENV === 'production'
    });
  });

  // What is switched on: providers, security settings and what each plan unlocks (the platform's feature access).
  app.get('/api/operator/platform/configuration', ...guard('founder'), (req, res) => {
    const plans = (q('SELECT id,name,monthly_fee_cents,limits_json FROM subscription_plans ORDER BY monthly_fee_cents') || []).map((p) => { let limits = {}; try { limits = JSON.parse(p.limits_json || '{}'); } catch { /* keep empty */ } return { id: p.id, name: p.name, monthly_fee_cents: p.monthly_fee_cents, limits }; });
    const grants = q('SELECT feature_profile,COUNT(*) n FROM complimentary_grants GROUP BY feature_profile') || [];
    res.json({
      ok: true,
      environment: env.NODE_ENV || 'development', public_base_url: env.PUBLIC_BASE_URL || null,
      providers: {
        email: has(env.RESEND_API_KEY), sms_voice: has(env.TELNYX_API_KEY), payments_platform: has(env.STRIPE_SECRET_KEY),
        ai: has(env.AI_PROVIDER_API_KEY) || has(env.OPENAI_API_KEY) || has(env.GEMINI_API_KEY) || has(env.GOOGLE_AI_API_KEY),
        file_storage_s3: storageConfig(env).ready, database_backup: has(backupBucket(env))
      },
      security: { operator_mfa_required: /^(1|true|yes)$/i.test(String(env.REQUIRE_OPERATOR_MFA || '')) || env.NODE_ENV === 'production', admin_key_set: has(env.ADMIN_API_KEY) },
      feature_access: { model: 'Features are unlocked per plan (limits below) and per business through complimentary grants. There are no separate runtime on/off switches.', plans, complimentary_grants_by_profile: grants.map((g) => ({ profile: g.feature_profile, count: g.n })) }
    });
  });
}
