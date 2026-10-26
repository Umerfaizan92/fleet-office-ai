import test from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { createAutomation } from '../src/automation.js';

function setup() {
  const db = new Database(':memory:');
  db.exec(`CREATE TABLE stock_items (id TEXT, organisation_id TEXT, name TEXT, unit TEXT, reorder_level REAL, active INTEGER DEFAULT 1);
    CREATE TABLE stock_moves (item_id TEXT, qty REAL);
    CREATE TABLE growth_calendar (organisation_id TEXT, status TEXT, scheduled_at TEXT);
    CREATE TABLE organisation_integrations (organisation_id TEXT, provider TEXT, status TEXT, settings_json TEXT, display_name TEXT, updated_at TEXT);`);
  const sent = [];
  const notify = { notifyRoles: async (org, roles, o) => { sent.push({ org, roles, ...o }); } };
  return { db, sent, auto: createAutomation({ db, runtime: { testConnection: async () => { throw new Error('token expired'); } }, notify, decrypt: () => ({}), persist: () => {}, audit: () => {} }) };
}

test('low stock sends one alert naming the items', async () => {
  const { db, sent, auto } = setup();
  db.prepare(`INSERT INTO stock_items VALUES ('a','o1','Cable','m',10,1),('b','o1','Screws','box',5,1)`).run();
  db.prepare(`INSERT INTO stock_moves VALUES ('a',4),('b',50)`).run();
  assert.equal(await auto.checkStock(), 1);
  assert.match(sent[0].body, /Cable: 4 m left/);
  assert.ok(!/Screws/.test(sent[0].body));
});
test('an empty calendar reminds the owner, a full one does not', async () => {
  const { db, sent, auto } = setup();
  db.prepare(`INSERT INTO growth_calendar VALUES ('o1','published','2020-01-01T00:00:00Z'),('o2','approved',?)`).run(new Date(Date.now() + 86400000).toISOString());
  assert.equal(await auto.checkCalendar(), 1);
  assert.equal(sent[0].org, 'o1');
});
test('a failed daily connection check tells the owner to reconnect', async () => {
  const { db, sent, auto } = setup();
  db.prepare(`INSERT INTO organisation_integrations VALUES ('o1','x','connected','{}','X','')`).run();
  assert.equal(await auto.checkConnections(), 1);
  assert.match(sent[0].title, /Reconnect/);
  assert.equal(JSON.parse(db.prepare(`SELECT settings_json FROM organisation_integrations`).get().settings_json).last_test_status, 'fail');
});
