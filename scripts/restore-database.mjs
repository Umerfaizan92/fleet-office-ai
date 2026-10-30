#!/usr/bin/env node
// Phase 09: restores a database snapshot to a NEW file, only with an approved "Restore the production database"
// request. It never overwrites the live database, and each approval can be used once: a failed or repeated attempt
// needs a new approval. Switching the server over to the restored file is a separate, manual step (RUNBOOKS.md).
//   npm run backup:restore -- --approval PA-XXXXXX --out /var/data/restore-candidate.sqlite [--snapshot <key>]
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import zlib from 'node:zlib';
import Database from 'better-sqlite3';
import { applyBackupEnv } from '../src/backup-env.js';
import { createBackups } from '../src/reliability/backup.js';
import { verifyAuditChain } from '../src/db.js';

const arg = (n) => { const i = process.argv.indexOf('--' + n); return i > 0 ? process.argv[i + 1] : null; };
const fail = (m) => { console.error('RESTORE REFUSED: ' + m); process.exit(1); };
const env = process.env; applyBackupEnv(env);
const live = path.resolve(env.DATABASE_PATH || 'data/super-pro.sqlite'), out = arg('out') ? path.resolve(arg('out')) : null, ref = arg('approval');
if (!ref) fail('give the approval reference with --approval (Founder Console > Reliability > Request approval: "Restore the production database").');
if (!out) fail('give a new file to restore into with --out.');
if (out === live || out.startsWith(live + '-')) fail('the output must not be the live database or its journal files.');
if (fs.existsSync(out)) fail(`${out} already exists. Choose a new file name; nothing is overwritten.`);
if (!fs.existsSync(live)) fail(`the live database was not found at ${live} (set DATABASE_PATH).`);

const db = new Database(live);
const approval = db.prepare("SELECT id,reference_code,status,action,decided_by,decided_at FROM platform_approvals WHERE reference_code=?").get(ref);
if (!approval || approval.action !== 'restore_database') fail(`no "restore the production database" approval with reference ${ref}.`);
if (approval.status !== 'approved') fail(`approval ${ref} is ${approval.status}, not approved.`);
const usedKey = 'approval_used:' + ref;
db.exec("CREATE TABLE IF NOT EXISTS reliability_state (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL)");
// The approval is used up before anything runs, so an interrupted or failed run cannot be retried on the same approval.
const claimed = db.prepare('INSERT OR IGNORE INTO reliability_state (key,value,updated_at) VALUES (?,?,?)').run(usedKey, JSON.stringify({ out, started_at: new Date().toISOString() }), new Date().toISOString()).changes;
if (!claimed) fail(`approval ${ref} has already been used. Request a new approval to try again.`);

const backups = createBackups({ db, env, databasePath: live, log: { log() {}, error() {} } });
const key = arg('snapshot') || await backups.latestSnapshotKey();
if (!key) fail('no snapshot was found.');
console.log(`Approval ${ref} (approved by ${approval.decided_by} at ${approval.decided_at}). Restoring ${key} to ${out}.`);
const manifest = JSON.parse((await backups.get(key.replace(/\.sqlite\.gz$/, '.manifest.json'))).toString('utf8'));
const gz = await backups.get(key);
if (crypto.createHash('sha256').update(gz).digest('hex') !== manifest.sha256) fail('the snapshot does not match its recorded SHA-256. Use an earlier snapshot.');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, zlib.gunzipSync(gz), { flag: 'wx' });
const r = new Database(out, { readonly: true });
const integrity = r.pragma('integrity_check', { simple: true }), audit = verifyAuditChain(r);
r.close();
db.prepare('UPDATE reliability_state SET value=?,updated_at=? WHERE key=?').run(JSON.stringify({ out, key, integrity, audit_ok: audit.ok, finished_at: new Date().toISOString() }), new Date().toISOString(), usedKey);
db.close();
if (integrity !== 'ok' || !audit.ok) fail(`the restored file failed its checks (integrity ${integrity}, audit chain ${audit.ok ? 'ok' : 'broken'}). Do not switch to it.`);
console.log(`RESTORED: ${out} passed integrity_check and the audit chain check (snapshot taken ${manifest.created_at}).`);
console.log('Next (manual, in a maintenance window): stop the service, keep a copy of the current database, move the restored file to DATABASE_PATH, start the service, check /readyz and Founder Console > Reliability, then mark the approval done.');
