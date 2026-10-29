// Every API route in the source is called on a real server. Without a session, only a short reviewed list of public
// read-only routes may answer successfully, and a business owner's session never opens a founder route.
// A new route that forgets its sign-in check fails this test.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { randomBytes, randomUUID, createHash } from 'node:crypto';
import Database from 'better-sqlite3';
import { startServer } from './test-server.mjs';

// Reviewed public routes: readiness flags and public marketing data only, no business records.
const PUBLIC_OK = new Set([
  'GET /api/health', 'GET /api/health/storage', 'GET /api/product-guide/status', 'GET /api/public/preview-status',
  'GET /api/saas/address/search', 'GET /api/saas/branding', 'GET /api/saas/plans', 'GET /api/saas/verification-provider/status',
  'GET /api/social-stats', 'GET /api/tiktok/status'
]);
const ID = '00000000-0000-4000-8000-000000000000';

function sourceRoutes() {
  const src = fs.readdirSync('src').filter((f) => f.endsWith('.js')).map((f) => fs.readFileSync('src/' + f, 'utf8')).join('\n');
  const re = /\.(get|post|put|patch|delete)\(\s*\[?\s*["'`](\/api\/[^"'`]+)["'`]/g, out = new Set();
  let m; while ((m = re.exec(src))) out.add(m[1].toUpperCase() + ' ' + m[2]);
  return [...out].sort();
}

test('no API route answers without the right sign-in', async (t) => {
  const routes = sourceRoutes();
  assert.ok(routes.length > 350, `expected the full route inventory, found ${routes.length}`);
  const s = await startServer();
  try {
    const db = new Database(s.dbPath), now = new Date().toISOString(), org = randomUUID(), uid = randomUUID(), token = randomBytes(24).toString('hex');
    db.prepare('INSERT INTO organisations (id,name,slug,created_at,updated_at) VALUES (?,?,?,?,?)').run(org, 'Guard', 'guard-' + org.slice(0, 6), now, now);
    db.prepare("INSERT INTO organisation_subscriptions (organisation_id,plan_id,status,payment_status,trial_ends_at,created_at,updated_at) VALUES (?,'scale','trialing','unpaid',?,?,?)").run(org, new Date(Date.now() + 86400000).toISOString(), now, now);
    db.prepare('INSERT INTO users (id,email,full_name,password_hash,password_salt,created_at,updated_at) VALUES (?,?,?,?,?,?,?)').run(uid, 'guard@example.test', 'Guard', 'x', 'x', now, now);
    db.prepare('INSERT INTO memberships (organisation_id,user_id,role,created_at) VALUES (?,?,?,?)').run(org, uid, 'owner', now);
    db.prepare('INSERT INTO user_sessions (id,user_id,token_hash,expires_at,created_at,last_seen_at) VALUES (?,?,?,?,?,?)').run(randomUUID(), uid, createHash('sha256').update(token).digest('hex'), new Date(Date.now() + 3600000).toISOString(), now, now);
    db.close();
    const owner = 'fp_session=' + token;

    await t.test('signed-out callers get no successful answer outside the public list', async () => {
      const open = [];
      for (const r of routes) {
        const [method, p] = r.split(' ');
        const res = await s.call(method, p.replace(/:[A-Za-z_]+/g, ID), { body: method === 'GET' ? undefined : {} });
        if ((res.status < 300 && !PUBLIC_OK.has(r)) || (res.status >= 500 && res.status !== 503)) open.push(`${res.status} ${r}`);
      }
      assert.deepEqual(open, [], 'routes answering without sign-in (or crashing; 503 = provider not configured, which is a safe refusal):\n' + open.join('\n'));
    });
    await t.test('a business owner session never opens founder or legacy admin routes', async () => {
      const opened = [];
      for (const r of routes.filter((x) => /^\w+ \/api\/(operator|admin)\//.test(x))) {
        const [method, p] = r.split(' ');
        const res = await s.call(method, p.replace(/:[A-Za-z_]+/g, ID), { cookie: owner, body: method === 'GET' ? undefined : {} });
        if (res.status < 300 || (res.status >= 500 && res.status !== 503)) opened.push(`${res.status} ${r}`);
      }
      assert.deepEqual(opened, [], 'founder routes reachable with a business session:\n' + opened.join('\n'));
    });
  } finally { await s.stop(); }
});
