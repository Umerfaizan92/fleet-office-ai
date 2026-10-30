#!/usr/bin/env node
// Backup restore drill. Restores the latest Litestream copy of the database from S3 into a temporary file,
// checks its integrity and audit chain, and compares row counts with the live database when one is given.
// It is read-only towards S3 and never touches the live database file.
//   npm run backup:restore-drill                         restore and check
//   npm run backup:restore-drill -- --compare /var/data/super-pro.sqlite
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import Database from 'better-sqlite3';
import { applyBackupEnv } from '../src/backup-env.js';
import { verifyAuditChain } from '../src/db.js';

const env = process.env;
const creds = applyBackupEnv(env);
const bin = env.LITESTREAM_BIN || path.resolve('bin', 'litestream');
const compareIdx = process.argv.indexOf('--compare');
const livePath = compareIdx > 0 ? process.argv[compareIdx + 1] : '';
const fail = (msg) => { console.error('RESTORE DRILL FAILED: ' + msg); process.exit(1); };

const fileReplica = String(env.BACKUP_FILE_DIR || '').trim();
if (!fileReplica && (!creds.bucket || !creds.id || !creds.secret)) fail('backup bucket or AWS keys are not set (names checked: BACKUP_S3_BUCKET/AWS_S3_BUCKET, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY).');
if (!fs.existsSync(bin)) fail(`Litestream is not installed at ${bin}. Run npm ci on Linux or set LITESTREAM_BIN.`);

const work = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-restore-'));
const target = path.join(work, 'restored.sqlite');
const replica = fileReplica ? 'file://' + path.resolve(fileReplica) : `s3://${creds.bucket}/${env.BACKUP_S3_DB_PREFIX || 'super-pro/db'}`;
const started = Date.now();
const r = spawnSync(bin, ['restore', '-o', target, replica], { stdio: ['ignore', 'pipe', 'pipe'], env: { ...env, AWS_REGION: creds.region || env.AWS_REGION || 'us-east-1' } });
if (r.status !== 0) fail('litestream restore exited with ' + r.status + ': ' + String(r.stderr).split('\n').slice(-3).join(' '));
const seconds = ((Date.now() - started) / 1000).toFixed(1);

const restored = new Database(target, { readonly: true });
const integrity = restored.pragma('integrity_check', { simple: true });
const audit = verifyAuditChain(restored);
const tables = restored.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all().map((t) => t.name);
const count = (db, t) => { try { return db.prepare(`SELECT COUNT(*) n FROM "${t}"`).get().n; } catch { return null; } };
const restoredCounts = Object.fromEntries(tables.map((t) => [t, count(restored, t)]));
console.log(`Restored ${tables.length} tables in ${seconds}s. integrity_check=${integrity}. audit chain ${audit.ok ? 'verified' : 'BROKEN'} (${audit.checked} rows).`);

let mismatches = [];
if (livePath) {
  const live = new Database(livePath, { readonly: true, fileMustExist: true });
  for (const t of tables) {
    const a = count(live, t), b = restoredCounts[t];
    // The live database keeps changing, so the restored copy may trail by the last few seconds of writes.
    if (a !== null && b !== null && b < a - 50) mismatches.push(`${t}: live ${a}, restored ${b}`);
  }
  live.close();
  console.log(mismatches.length ? `Row count gaps larger than 50:\n  ${mismatches.join('\n  ')}` : 'Row counts match the live database (within the last few seconds of writes).');
}
restored.close();
fs.rmSync(work, { recursive: true, force: true });
if (integrity !== 'ok' || !audit.ok || mismatches.length) fail('see the lines above.');
console.log('RESTORE DRILL PASSED.');
