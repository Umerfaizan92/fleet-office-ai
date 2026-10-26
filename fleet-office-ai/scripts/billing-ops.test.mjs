import test from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { createBillingOps } from '../src/billing-ops.js';

function setup() {
  const db = new Database(':memory:'), calls = [];
  db.exec(`CREATE TABLE organisations (id TEXT PRIMARY KEY); INSERT INTO organisations VALUES ('o1');`);
  const lifecycle = { sendInvoice: async (org, i) => { calls.push({ org, reminder: i.reminder || 0, number: i.number }); return { sent: true }; } };
  const ops = createBillingOps({ db, env: {}, lifecycle, entitlements: {}, audit: () => {}, timers: false });
  let n = 0;
  const add = (id, status, extra = {}) => db.prepare(`INSERT INTO platform_invoices (id,organisation_id,number,period_start,period_end,lines_json,subtotal_cents,gst_cents,total_cents,status,due_at,send_at,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(id, 'o1', 'SP-T-' + id, `2030-0${++n}-01T00:00:00Z`, '2030-01-31T00:00:00Z', '[]', 9900, 990, 10890, status, extra.due || '2030-01-08T00:00:00Z', extra.send || null, '2030-01-01T00:00:00Z');
  return { db, calls, ops, add };
}

test('only approved invoices whose time has come are sent, once', async () => {
  const { db, calls, ops, add } = setup();
  add('a', 'approved', { send: '2030-01-01T00:00:00Z' }); add('b', 'approved', { send: '2099-01-01T00:00:00Z' }); add('c', 'draft');
  assert.equal(await ops.sendDue(new Date('2030-01-02T00:00:00Z')), 1);
  assert.deepEqual(calls.map((c) => c.number), ['SP-T-a']);
  assert.equal(db.prepare(`SELECT status FROM platform_invoices WHERE id='a'`).get().status, 'sent');
  assert.equal(await ops.sendDue(new Date('2030-01-03T00:00:00Z')), 0, 'already sent invoices are not sent again');
});
test('overdue reminders start 3 days late and again at 7', async () => {
  const { calls, ops, add } = setup();
  add('a', 'sent');
  assert.equal(await ops.remindOverdue(new Date('2030-01-09T00:00:00Z')), 0, 'one day late is too early');
  assert.equal(await ops.remindOverdue(new Date('2030-01-12T00:00:00Z')), 1);
  assert.equal(calls.at(-1).reminder, 3);
  await ops.remindOverdue(new Date('2030-01-16T00:00:00Z'));
  assert.equal(calls.at(-1).reminder, 7);
});
