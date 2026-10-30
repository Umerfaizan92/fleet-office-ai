// Tenant isolation and role enforcement on a real server process.
// Two businesses, five roles, assigned and unassigned jobs, and the Phase 02 sign-in rules.
// Uses a throwaway SQLite file and synthetic people only; no provider keys, no network.
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID, createHash, scryptSync } from 'node:crypto';
import Database from 'better-sqlite3';
import { startServer } from './test-server.mjs';

function seed(dbPath) {
  const db = new Database(dbPath);
  const now = new Date().toISOString(), later = new Date(Date.now() + 3600000).toISOString(), trial = new Date(Date.now() + 10 * 86400000).toISOString();
  const out = { cookies: {}, users: {}, orgs: {} };
  const org = (key) => { const id = randomUUID(); db.prepare('INSERT INTO organisations (id,name,slug,created_at,updated_at) VALUES (?,?,?,?,?)').run(id, 'Business ' + key, 'biz-' + key + '-' + id.slice(0, 6), now, now); db.prepare("INSERT INTO organisation_subscriptions (organisation_id,plan_id,status,payment_status,trial_ends_at,created_at,updated_at) VALUES (?,'operations','trialing','unpaid',?,?,?)").run(id, trial, now, now); out.orgs[key] = id; return id; };
  const person = (key, orgId, role, { sessionCreatedAt = now, password } = {}) => {
    const uid = randomUUID(), token = randomBytes(24).toString('hex'), salt = randomBytes(16).toString('hex');
    const hash = password ? scryptSync(password, salt, 64, { N: 16384, r: 8, p: 1 }).toString('hex') : 'x';
    db.prepare("INSERT INTO users (id,email,full_name,password_hash,password_salt,created_at,updated_at) VALUES (?,?,?,?,?,?,?)").run(uid, `${key}@tenant.example.test`, key, hash, password ? salt : 'x', now, now);
    try { db.prepare('UPDATE users SET email_verified=1,phone_verified=1 WHERE id=?').run(uid); } catch { /* older schema */ }
    db.prepare('INSERT INTO memberships (organisation_id,user_id,role,created_at) VALUES (?,?,?,?)').run(orgId, uid, role, now);
    db.prepare('INSERT INTO user_sessions (id,user_id,token_hash,expires_at,created_at,last_seen_at) VALUES (?,?,?,?,?,?)').run(randomUUID(), uid, createHash('sha256').update(token).digest('hex'), later, sessionCreatedAt, now);
    out.cookies[key] = 'fp_session=' + token; out.users[key] = uid; return uid;
  };
  const A = org('a'), B = org('b');
  person('ownerA', A, 'owner'); person('managerA', A, 'manager'); person('workerA', A, 'worker'); person('contractorA', A, 'contractor'); person('employeeA', A, 'employee');
  person('ownerB', B, 'owner');
  const customer = (o, name) => { const id = randomUUID(); db.prepare('INSERT INTO tenant_customers (id,organisation_id,name,created_at,updated_at) VALUES (?,?,?,?,?)').run(id, o, name, now, now); return id; };
  out.customerA = customer(A, 'Alice Customer'); out.customerB = customer(B, 'Bob Customer');
  const worker = (o, uid, name) => { const id = randomUUID(); db.prepare('INSERT INTO workers (id,organisation_id,full_name,user_id,created_at,updated_at) VALUES (?,?,?,?,?,?)').run(id, o, name, uid, now, now); return id; };
  out.workerRecord = worker(A, out.users.workerA, 'Wendy Worker'); worker(A, out.users.contractorA, 'Carl Contractor');
  const job = (o, title, customerId) => { const id = randomUUID(); db.prepare('INSERT INTO work_orders (id,organisation_id,title,start_at,customer_id,price_cents,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)').run(id, o, title, '2026-12-01T08:00:00+08:00', customerId, 45000, now, now); return id; };
  out.assignedJob = job(A, 'Assigned job', out.customerA); out.otherJob = job(A, 'Unassigned job', out.customerA); out.jobB = job(B, 'Tenant B job', out.customerB);
  db.prepare("INSERT INTO job_offers (id,organisation_id,work_order_id,worker_id,status,offered_at) VALUES (?,?,?,?,'accepted',?)").run(randomUUID(), A, out.assignedJob, out.workerRecord, now);
  const photo = (o, jobId) => { const id = randomUUID(); db.prepare("INSERT INTO job_photos (id,organisation_id,work_order_id,stage,kind,original_name,stored_name,mime_type,size_bytes,created_at) VALUES (?,?,?,'before','photo','a.jpg',?,'image/jpeg',3,?)").run(id, o, jobId, id + '.jpg', now); return id; };
  out.photoOther = photo(A, out.otherJob); out.photoB = photo(B, out.jobB);
  db.close();
  return out;
}

test('workers, contractors and other businesses stay inside their boundaries', async (t) => {
  const s = await startServer();
  try {
    const d = seed(s.dbPath), c = d.cookies;
    const expect = async (label, method, url, cookie, allowed, body) => {
      const r = await s.call(method, url, { cookie, body });
      const list = Array.isArray(allowed) ? allowed : [allowed];
      assert.ok(list.includes(r.status), `${label}: expected ${list.join('/')} got ${r.status} ${r.text.slice(0, 160)}`);
      return r;
    };

    await t.test('a worker sees only jobs assigned to them, without prices or customer links', async () => {
      const r = await expect('worker jobs', 'GET', '/api/saas/work-orders', c.workerA, 200);
      const ids = r.json.jobs.map((j) => j.id);
      assert.deepEqual(ids, [d.assignedJob]);
      const j = r.json.jobs[0];
      assert.equal(j.price_cents, undefined); assert.equal(j.customer_id, undefined);
    });
    await t.test('a contractor with no accepted offer sees no jobs', async () => {
      const r = await expect('contractor jobs', 'GET', '/api/saas/work-orders', c.contractorA, 200);
      assert.equal(r.json.jobs.length, 0);
    });
    await t.test('job media follows the assignment', async () => {
      await expect('assigned media', 'GET', `/api/saas/work-orders/${d.assignedJob}/media`, c.workerA, 200);
      await expect('unassigned media', 'GET', `/api/saas/work-orders/${d.otherJob}/media`, c.workerA, 404);
      await expect('unassigned media file', 'GET', `/api/saas/job-media/${d.photoOther}/file`, c.workerA, 404);
      await expect('contractor media', 'GET', `/api/saas/work-orders/${d.assignedJob}/media`, c.contractorA, 404);
    });
    for (const role of ['workerA', 'contractorA']) {
      await t.test(`${role} is refused customers, money, messaging and owner tools`, async () => {
        for (const [method, url] of [
          ['GET', '/api/saas/customers'], ['GET', `/api/saas/customers/${d.customerA}`], ['GET', '/api/saas/finance'], ['GET', '/api/saas/finance/overview'],
          ['GET', '/api/saas/finance/jobs'], ['GET', '/api/saas/payments'], ['GET', '/api/saas/payments/overview'], ['GET', '/api/saas/comms/threads'],
          ['GET', '/api/saas/data-export'], ['GET', '/api/saas/hiring/roles'], ['GET', '/api/saas/integrations/self-service'], ['GET', '/api/saas/billing/providers'],
          ['GET', '/api/saas/business-hub/invoice'], ['GET', '/api/saas/business-hub/quote'], ['GET', '/api/saas/stock'], ['GET', '/api/saas/mail/messages']
        ]) await expect(`${role} ${url}`, method, url, c[role], [403, 404]);
      });
    }
    await t.test('another business cannot read or change records by id', async () => {
      await expect('B reads A customer', 'GET', `/api/saas/customers/${d.customerA}`, c.ownerB, 404);
      await expect('B edits A customer', 'PATCH', `/api/saas/customers/${d.customerA}`, c.ownerB, [400, 404], { name: 'Hijacked' });
      await expect('B reads A job media', 'GET', `/api/saas/work-orders/${d.assignedJob}/media`, c.ownerB, 404);
      await expect('B reads A photo', 'GET', `/api/saas/job-media/${d.photoOther}/file`, c.ownerB, 404);
      const jobs = await expect('B job list', 'GET', '/api/saas/work-orders', c.ownerB, 200);
      assert.ok(!JSON.stringify(jobs.json).includes(d.assignedJob));
      const customers = await expect('B customer list', 'GET', '/api/saas/customers', c.ownerB, 200);
      assert.ok(!JSON.stringify(customers.json).includes(d.customerA));
      const a = await expect('A owner reads B photo', 'GET', `/api/saas/job-media/${d.photoB}/file`, c.ownerA, 404);
      assert.ok(!a.text.includes(d.jobB));
    });
    await t.test('a workspace id sent by the browser is never trusted', async () => {
      const r = await s.call('GET', '/api/saas/customers', { cookie: c.ownerB, headers: { 'X-Organisation-Id': d.orgs.a } });
      assert.equal(r.status, 403, r.text);
      const bad = await s.call('GET', '/api/saas/customers', { cookie: c.ownerB, headers: { 'X-Organisation-Id': "a' OR 1=1 --" } });
      assert.equal(bad.status, 400);
    });
    await t.test('the owner cannot lift a worker above the field-role ceiling', async () => {
      const policy = await expect('read worker policy', 'GET', `/api/saas/team-accounts/members/${d.users.workerA}/permissions`, c.ownerA, 200);
      const put = await s.call('PUT', `/api/saas/team-accounts/members/${d.users.workerA}/permissions`, { cookie: c.ownerA, body: { mode: 'custom', revision: policy.json.policy.revision, grants: ['finance.read', 'jobs.read'] } });
      assert.equal(put.status, 400, put.text); assert.equal(put.json.code, 'ROLE_CEILING');
      const ok = await s.call('PUT', `/api/saas/team-accounts/members/${d.users.workerA}/permissions`, { cookie: c.ownerA, body: { mode: 'custom', revision: policy.json.policy.revision, grants: ['jobs.read', 'staff_chat.read'] } });
      assert.equal(ok.status, 200, ok.text);
    });
    await t.test('a stored grant beyond the ceiling is ignored at request time', async () => {
      const db = new Database(s.dbPath);
      const m = db.prepare('SELECT created_at FROM memberships WHERE user_id=?').get(d.users.contractorA);
      db.prepare("INSERT INTO staff_access_policies(organisation_id,user_id,membership_created_at,mode,grants_json,revision,updated_by,updated_at) VALUES (?,?,?,'custom',?,1,?,?)").run(d.orgs.a, d.users.contractorA, m.created_at, JSON.stringify(['finance.read', 'customers.read', 'jobs.read']), d.users.ownerA, new Date().toISOString());
      db.close();
      await expect('contractor finance via old grant', 'GET', '/api/saas/finance', c.contractorA, 403);
      await expect('contractor customers via old grant', 'GET', '/api/saas/customers', c.contractorA, 403);
    });
    await t.test('office employees keep owner-granted customer access (existing behaviour)', async () => {
      const policy = await expect('employee policy', 'GET', `/api/saas/team-accounts/members/${d.users.employeeA}/permissions`, c.ownerA, 200);
      await expect('grant employee', 'PUT', `/api/saas/team-accounts/members/${d.users.employeeA}/permissions`, c.ownerA, 200, { mode: 'custom', revision: policy.json.policy.revision, grants: ['customers.read'] });
      await expect('employee customers', 'GET', '/api/saas/customers', c.employeeA, 200);
    });
    await t.test('business sessions never reach founder APIs', async () => {
      for (const url of ['/api/operator/overview', '/api/operator/subscribers', '/api/admin/dashboard', '/api/admin/customers', '/api/saas/health/diagnostics'])
        await expect(`owner ${url}`, 'GET', url, c.ownerA, [401, 403]);
    });
  } finally { await s.stop(); }
});

test('Phase 02 sign-in rules apply only when switched on', async (t) => {
  const password = 'Correct-Horse-' + randomBytes(4).toString('hex');
  const s = await startServer({ REQUIRE_OPERATOR_MFA: '1', SESSION_MAX_AGE_DAYS: '30', STRICT_PASSWORD_MATCH: '1' });
  try {
    const db = new Database(s.dbPath), now = new Date().toISOString();
    const orgId = randomUUID(); db.prepare('INSERT INTO organisations (id,name,slug,created_at,updated_at) VALUES (?,?,?,?,?)').run(orgId, 'Rules', 'rules-' + orgId.slice(0, 6), now, now);
    db.prepare("INSERT INTO organisation_subscriptions (organisation_id,plan_id,status,payment_status,trial_ends_at,created_at,updated_at) VALUES (?,'starter','trialing','unpaid',?,?,?)").run(orgId, new Date(Date.now() + 86400000).toISOString(), now, now);
    const uid = randomUUID(), salt = randomBytes(16).toString('hex');
    db.prepare('INSERT INTO users (id,email,full_name,password_hash,password_salt,created_at,updated_at) VALUES (?,?,?,?,?,?,?)').run(uid, 'rules.owner@example.test', 'Rules Owner', scryptSync(password, salt, 64, { N: 16384, r: 8, p: 1 }).toString('hex'), salt, now, now);
    try { db.prepare('UPDATE users SET email_verified=1,phone_verified=1 WHERE id=?').run(uid); } catch { /* older schema */ }
    db.prepare('INSERT INTO memberships (organisation_id,user_id,role,created_at) VALUES (?,?,?,?)').run(orgId, uid, 'owner', now);
    const oldToken = randomBytes(24).toString('hex');
    db.prepare('INSERT INTO user_sessions (id,user_id,token_hash,expires_at,created_at,last_seen_at) VALUES (?,?,?,?,?,?)').run(randomUUID(), uid, createHash('sha256').update(oldToken).digest('hex'), new Date(Date.now() + 86400000).toISOString(), new Date(Date.now() - 40 * 86400000).toISOString(), now);
    db.close();

    await t.test('the founder key alone is refused and sign-in fails closed without an authenticator', async () => {
      const raw = await s.call('GET', '/api/admin/dashboard', { headers: { 'x-admin-key': s.adminKey } });
      assert.equal(raw.status, 401);
      const login = await s.call('POST', '/api/operator/login', { body: { key: s.adminKey, code: '' } });
      assert.equal(login.status, 503, login.text);
      assert.ok(!login.text.includes(s.adminKey));
    });
    await t.test('a session older than the absolute limit is ended', async () => {
      const r = await s.call('GET', '/api/saas/me', { cookie: 'fp_session=' + oldToken });
      assert.equal(r.status, 401);
      const check = new Database(s.dbPath, { readonly: true });
      assert.equal(check.prepare('SELECT COUNT(*) n FROM user_sessions WHERE user_id=?').get(uid).n, 0, 'expired session row removed');
      check.close();
    });
    await t.test('strict matching accepts the exact password and refuses a case-swapped one', async () => {
      const swapped = password[0].toLowerCase() + password.slice(1);
      assert.equal((await s.call('POST', '/api/saas/login', { body: { email: 'rules.owner@example.test', password: swapped } })).status, 401);
      const ok = await s.call('POST', '/api/saas/login', { body: { email: 'rules.owner@example.test', password: ' ' + password + ' ' } });
      assert.equal(ok.status, 200, ok.text);
    });
  } finally { await s.stop(); }
});
