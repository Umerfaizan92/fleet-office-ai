#!/usr/bin/env node
// Run right after every deploy:  npm run deploy:check -- https://super-pro-ai-office-manager.onrender.com
// Read-only. A non-zero exit means "roll back" (see docs/infrastructure/DEPLOYMENT_PLAN.md).
// Optional: OPERATOR_TOKEN (a founder session token from sign-in) adds the full diagnostics check. Nothing secret is printed.
const base = String(process.argv[2] || process.env.DEPLOY_BASE_URL || '').replace(/\/+$/, '');
if (!/^https?:\/\//.test(base)) { console.error('Usage: npm run deploy:check -- https://your-service.example'); process.exit(2); }
const results = [];
const check = async (name, fn) => { try { const detail = await fn(); results.push({ ok: true, name, detail }); } catch (e) { results.push({ ok: false, name, detail: e.message }); } };
const get = (path, headers = {}) => fetch(base + path, { headers, redirect: 'manual', signal: AbortSignal.timeout(15000) });
const must = (cond, msg) => { if (!cond) throw new Error(msg); };

await check('health check answers', async () => { const r = await get('/healthz'); must(r.status === 200, `status ${r.status}`); return 'ok'; });
await check('ready (database and job queue)', async () => {
  const r = await get('/readyz');
  if (r.status === 404) return 'not deployed yet on this version';
  const j = await r.json(); must(r.status === 200 && j.ok, `status ${r.status} ${JSON.stringify(j)}`); return 'ok';
});
await check('security headers on the public site', async () => {
  const r = await get('/saas/');
  must(r.status === 200, `status ${r.status}`);
  for (const h of ['content-security-policy', 'x-content-type-options', 'referrer-policy']) must(r.headers.get(h), `missing ${h}`);
  must(!r.headers.get('x-powered-by'), 'x-powered-by should be hidden');
  return 'present';
});
await check('signed-out visitors are refused', async () => { const r = await get('/api/saas/me'); must(r.status === 401, `status ${r.status}`); return '401'; });
await check('founder routes refuse without a token', async () => { const r = await get('/api/operator/overview'); must([401, 403].includes(r.status), `status ${r.status}`); return String(r.status); });
await check('sign-in and pricing pages load', async () => { for (const p of ['/saas/sign-in.html', '/saas/']) { const r = await get(p); must(r.status === 200, `${p} ${r.status}`); } return 'ok'; });
if (process.env.OPERATOR_TOKEN) await check('full diagnostics', async () => {
  const r = await get('/api/saas/health/diagnostics', { 'x-admin-key': process.env.OPERATOR_TOKEN });
  const j = await r.json(); must(j.ok !== false && j.status !== 'fail', `status ${j.status}`);
  const fails = (j.checks || []).filter((c) => c.status === 'fail').map((c) => c.id);
  must(!fails.length, 'failing: ' + fails.join(', '));
  return j.status;
});

for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name}${r.detail ? ' — ' + r.detail : ''}`);
const failed = results.filter((r) => !r.ok).length;
console.log(failed ? `\nDEPLOY CHECK FAILED (${failed}). Roll back: Render → Deploys → previous deploy → Rollback.` : '\nDEPLOY CHECK PASSED.');
process.exit(failed ? 1 : 0);
