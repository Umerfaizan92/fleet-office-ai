import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import { createDb, appendAuditLog, resolveDatabasePath } from '../src/db.js';

const tmp = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'dbschema-')), 'app.sqlite');
const now = new Date().toISOString();

test('database path resolution', () => {
  assert.equal(resolveDatabasePath({ DATABASE_PATH: '/x/y.sqlite' }), '/x/y.sqlite');
  assert.match(resolveDatabasePath({}), /app\.sqlite$/);
});

test('fresh bootstrap: WAL, foreign keys, tables, VEVO and privacy seeds', () => {
  const db = createDb(tmp());
  assert.equal(db.pragma('journal_mode', { simple: true }), 'wal');
  assert.equal(db.pragma('foreign_keys', { simple: true }), 1);
  const cols = (t) => db.prepare(`PRAGMA table_info(${t})`).all().map((c) => c.name);
  for (const c of ['vevo_status', 'vevo_checked_at', 'vevo_reference', 'vevo_work_rights_expiry', 'fair_work_retain_until', 'legal_hold']) assert.ok(cols('workers').includes(c), c);
  assert.ok(cols('memberships').includes('status'));
  assert.ok(cols('onboarding_profiles').includes('custom_sections'));
  assert.equal(db.prepare(`SELECT COUNT(*) n FROM privacy_governance WHERE record_type='app_registry'`).get().n, 13);
  assert.ok(db.prepare(`SELECT retention_days FROM privacy_governance WHERE subject_key='fair_work_employee_records'`).get().retention_days >= 7 * 365);
  assert.equal(db.prepare(`SELECT 1 FROM sqlite_master WHERE name='saas_audit_events'`).get(), undefined);
  db.close();
});

test('bootstrap is idempotent and a second open changes nothing', () => {
  const file = tmp();
  createDb(file).close();
  const db = createDb(file);
  assert.equal(db.prepare(`SELECT COUNT(*) n FROM privacy_governance WHERE record_type='app_registry'`).get().n, 13);
  db.close();
});

test('audit_logs is append-only, hash-chained and retained 7 years', () => {
  const db = createDb(tmp());
  const a = appendAuditLog(db, { organisation_id: 'o1', user_id: 'u1', user_name: 'A', user_role: 'owner', action: 'worker.created', ip_address: '1.2.3.4', user_agent: 'ua', metadata: { x: 1 } });
  const b = appendAuditLog(db, { organisation_id: 'o1', user_id: 'u1', action: 'worker.updated' });
  assert.equal(db.prepare('SELECT prev_hash FROM audit_logs WHERE id=?').get(b.id).prev_hash, a.eventHash);
  const row = db.prepare('SELECT * FROM audit_logs WHERE id=?').get(a.id);
  assert.equal(row.module, 'worker');
  assert.ok(new Date(row.retention_until).getUTCFullYear() >= new Date().getUTCFullYear() + 7);
  assert.throws(() => db.prepare(`UPDATE audit_logs SET action='x' WHERE id=?`).run(a.id), /append-only/);
  assert.throws(() => db.prepare(`DELETE FROM audit_logs WHERE id=?`).run(a.id), /retained for 7 years/);
  db.close();
});

test('legacy saas_audit_events rows are moved into audit_logs with hashes preserved', () => {
  const file = tmp();
  createDb(file).close();
  const raw = new Database(file);
  raw.exec(`CREATE TABLE saas_audit_events (id TEXT PRIMARY KEY, organisation_id TEXT NOT NULL, actor_user_id TEXT, event_type TEXT NOT NULL, entity_type TEXT, entity_id TEXT, detail_json TEXT NOT NULL DEFAULT '{}', created_at TEXT NOT NULL, prev_hash TEXT, event_hash TEXT)`);
  raw.prepare(`INSERT INTO saas_audit_events VALUES ('e1','o1',NULL,'branding.updated','org','o1','{"a":1}',?,NULL,'h1')`).run(now);
  raw.close();
  const db = createDb(file);
  const moved = db.prepare(`SELECT * FROM audit_logs WHERE id='e1'`).get();
  assert.equal(moved.action, 'branding.updated');
  assert.equal(moved.event_hash, 'h1');
  assert.equal(db.prepare(`SELECT 1 FROM sqlite_master WHERE name='saas_audit_events'`).get(), undefined);
  db.close();
});

test('suspended membership value is constrained and VEVO status is validated', () => {
  const db = createDb(tmp());
  db.prepare(`INSERT INTO organisations (id,name,slug,created_at,updated_at) VALUES ('o','O','o',?,?)`).run(now, now);
  db.prepare(`INSERT INTO users (id,email,full_name,password_hash,password_salt,created_at,updated_at) VALUES ('u','a@b.co','A','h','s',?,?)`).run(now, now);
  assert.throws(() => db.prepare(`INSERT INTO memberships (organisation_id,user_id,role,status,created_at) VALUES ('o','u','owner','bogus',?)`).run(now));
  db.prepare(`INSERT INTO memberships (organisation_id,user_id,role,status,created_at) VALUES ('o','u','owner','suspended',?)`).run(now);
  assert.throws(() => db.prepare(`INSERT INTO workers (id,organisation_id,full_name,vevo_status,created_at,updated_at) VALUES ('w','o','W','maybe',?,?)`).run(now, now));
  db.close();
});

test('a failed bootstrap rolls back completely', () => {
  const file = tmp();
  const raw = new Database(file);
  // A table with the same name but a hostile shape makes the unified layer fail part-way.
  raw.exec(`CREATE TABLE privacy_governance (id TEXT)`);
  raw.close();
  assert.throws(() => createDb(file));
  const check = new Database(file);
  assert.equal(check.prepare(`SELECT COUNT(*) n FROM sqlite_master WHERE type='table'`).get().n, 1);
  check.close();
});
