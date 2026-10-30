// Phase 04: offshore staff and the automation overview.
import test from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { randomUUID, randomBytes, createHash } from 'node:crypto';
import { startServer } from './test-server.mjs';
import { seedOwner } from './visual/session.mjs';

function member(server, org, role) {
  const db = new Database(server.dbPath), now = new Date().toISOString(), uid = randomUUID(), token = randomBytes(24).toString('hex');
  db.prepare('INSERT INTO users (id,email,full_name,password_hash,password_salt,created_at,updated_at) VALUES (?,?,?,?,?,?,?)').run(uid, `${role}-${uid}@example.test`, role, 'x', 'x', now, now);
  db.prepare('INSERT INTO memberships (organisation_id,user_id,role,created_at) VALUES (?,?,?,?)').run(org, uid, role, now);
  db.prepare('INSERT INTO user_sessions (id,user_id,token_hash,expires_at,created_at,last_seen_at) VALUES (?,?,?,?,?,?)').run(randomUUID(), uid, createHash('sha256').update(token).digest('hex'), new Date(Date.now() + 3600000).toISOString(), now, now);
  db.close();
  return 'fp_session=' + token;
}

test('offshore staff: recorded, acknowledged, never offered on-site jobs, private to the business', async (t) => {
  const s = await startServer();
  t.after(() => s.stop());
  const owner = await seedOwner(s), other = await seedOwner(s, { business: 'Other Co', email: 'other@other.example.test' });
  const O = (m, u, b) => s.call(m, u, { cookie: owner.cookie, body: b });
  let r = await O('POST', '/api/saas/workers/offshore', { full_name: 'Maria Santos', role_title: 'Admin assistant', country: 'Philippines', timezone: 'Not/AZone', engagement: 'contractor' });
  assert.equal(r.status, 400); assert.match(r.json.error, /time zone/);
  r = await O('POST', '/api/saas/workers/offshore', { full_name: 'Maria Santos', email: 'maria@example.test', role_title: 'Admin assistant', country: 'Philippines', timezone: 'Asia/Manila', engagement: 'contractor' });
  assert.equal(r.status, 201, r.text);
  const id = r.json.id;
  r = await O('GET', '/api/saas/workers/offshore');
  assert.equal(r.json.staff.length, 1); assert.equal(r.json.staff[0].data_acknowledged, false);
  assert.equal((await s.call('GET', '/api/saas/workers/offshore', { cookie: other.cookie })).json.staff.length, 0, 'other business sees none');

  r = await O('POST', `/api/saas/workers/offshore/${id}/data-acknowledgement`, { confirm: true, note: 'short' });
  assert.equal(r.status, 400, 'safeguards must be described');
  r = await s.call('POST', `/api/saas/workers/offshore/${id}/data-acknowledgement`, { cookie: other.cookie, body: { confirm: true, note: 'Signed privacy agreement, no downloads' } });
  assert.equal(r.status, 404, 'another business cannot acknowledge');
  r = await O('POST', `/api/saas/workers/offshore/${id}/data-acknowledgement`, { confirm: true, note: 'Signed confidentiality and privacy agreement; view-only access; no downloads' });
  assert.equal(r.status, 200, r.text);
  assert.equal((await O('GET', '/api/saas/workers/offshore')).json.staff[0].data_acknowledged, true);

  // Even if wrongly marked as approved for scheduling, an offshore worker is never offered an on-site job.
  const db = new Database(s.dbPath), now = new Date().toISOString(), job = randomUUID();
  db.prepare("UPDATE workers SET approved_for_scheduling=1,work_rights_status='verified' WHERE id=?").run(id);
  db.prepare('INSERT INTO work_orders (id,organisation_id,title,address,start_at,created_at,updated_at) VALUES (?,?,?,?,?,?,?)').run(job, owner.org, 'Site job', '1 Main St', '2026-11-10T01:00:00.000Z', now, now);
  db.close();
  r = await O('POST', `/api/saas/work-orders/${job}/offer`, {});
  assert.equal(r.status, 200, r.text);
  assert.ok(!r.json.evaluated.some((w) => w.id === id), 'offshore worker not considered');
  assert.equal(r.json.offered, 0);
  const d2 = new Database(s.dbPath); assert.equal(d2.prepare('SELECT COUNT(*) n FROM job_offers WHERE worker_id=?').get(id).n, 0); d2.close();

  const worker = member(s, owner.org, 'worker');
  assert.equal((await s.call('GET', '/api/saas/workers/offshore', { cookie: worker })).status, 403, 'field roles cannot see the offshore team');
});

test('automation overview shows real settings and only owners toggle reminders', async (t) => {
  const s = await startServer();
  t.after(() => s.stop());
  const owner = await seedOwner(s);
  const O = (m, u, b) => s.call(m, u, { cookie: owner.cookie, body: b });
  let r = await O('GET', '/api/saas/automation');
  assert.equal(r.status, 200, r.text);
  const by = (k) => r.json.automations.find((a) => a.key === k);
  assert.equal(by('customer_reminders').on, false); assert.equal(by('owner_reminders').on, true);
  assert.equal(by('inbox_drafts').on, false, 'no AI provider in tests, so no drafts are claimed');
  r = await O('PUT', '/api/saas/automation/reminders', { key: 'customer_reminders', on: true });
  assert.equal(r.status, 200, r.text);
  r = await O('GET', '/api/saas/automation');
  assert.equal(r.json.automations.find((a) => a.key === 'customer_reminders').on, true);
  r = await O('GET', '/api/saas/payments/settings');
  assert.equal(r.json.settings?.customer_reminders ?? r.json.customer_reminders, true, 'the payment settings show the same value');
  const mgr = member(s, owner.org, 'manager');
  assert.equal((await s.call('PUT', '/api/saas/automation/reminders', { cookie: mgr, body: { key: 'owner_reminders', on: false } })).status, 403);
  assert.equal((await s.call('GET', '/api/saas/automation')).status, 401);
});

test('record search: finds this business’s records, respects permissions, treats wildcards literally', async (t) => {
  const s = await startServer();
  t.after(() => s.stop());
  const owner = await seedOwner(s), other = await seedOwner(s, { business: 'Other Co', email: 'other2@other.example.test' });
  const O = (m, u, b) => s.call(m, u, { cookie: owner.cookie, body: b });
  let r = await O('POST', '/api/saas/pipeline/enquiries', { title: 'Hot water 50% discount query', customer: { name: 'Riley Quinn', phone: '0499 999 999' } });
  assert.equal(r.status, 201, r.text);
  await O('POST', `/api/saas/pipeline/enquiries/${r.json.id}/quote`, { amount: 300 });
  await s.call('POST', '/api/saas/pipeline/enquiries', { cookie: other.cookie, body: { title: 'Riley at the other business', customer: { name: 'Riley Other' } } });

  r = await O('GET', '/api/saas/search?q=riley');
  assert.equal(r.status, 200, r.text);
  const types = r.json.results.map((x) => x.type);
  for (const t2 of ['customer', 'enquiry', 'quote']) assert.ok(types.includes(t2), `finds ${t2}`);
  assert.ok(!JSON.stringify(r.json).includes('Riley Other'), 'never another business’s records');
  assert.equal((await O('GET', '/api/saas/search?q=0499')).json.results[0].title, 'Riley Quinn', 'finds by phone');
  assert.equal((await O('GET', '/api/saas/search?q=r')).json.results.length, 0, 'needs two characters');
  assert.equal((await O('GET', '/api/saas/search?q=%25%25')).json.results.length, 0, '%% is literal, not "match everything"');
  assert.ok((await O('GET', '/api/saas/search?q=50%25')).json.results.some((x) => x.type === 'enquiry'), 'a real percent sign still matches');

  const worker = member(s, owner.org, 'worker');
  r = await s.call('GET', '/api/saas/search?q=riley', { cookie: worker });
  assert.equal(r.status, 200);
  assert.equal(r.json.results.length, 0, 'a worker cannot find customers, quotes or invoices');
  assert.equal((await s.call('GET', '/api/saas/search?q=riley')).status, 401);
});
