// Proves the backup chain end to end with a local file replica: Litestream copies a database, the restore drill
// restores it into a temporary file and checks integrity, the audit chain and row counts. Skipped when Litestream is not installed.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { createDb, appendAuditLog } from '../src/db.js';

const bin = process.env.LITESTREAM_BIN || path.resolve('bin', 'litestream');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

test('a replicated database restores with integrity, audit chain and matching counts', { skip: !fs.existsSync(bin) && 'Litestream not installed (INSTALL_LITESTREAM=1 npm ci installs it)' }, async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-drill-'));
  const live = path.join(dir, 'live.sqlite'), replica = path.join(dir, 'replica');
  const db = createDb(live);
  for (let i = 0; i < 25; i++) appendAuditLog(db, { organisation_id: null, user_id: null, action: 'drill.event', module: 'drill', entity_id: String(i), metadata: { i } });
  db.close();
  const cfg = path.join(dir, 'litestream.yml');
  fs.writeFileSync(cfg, `dbs:\n  - path: ${JSON.stringify(live)}\n    replicas:\n      - type: file\n        path: ${JSON.stringify(replica)}\n        sync-interval: 1s\n`);
  const rep = spawn(bin, ['replicate', '-config', cfg], { stdio: 'ignore' });
  try {
    for (let i = 0; i < 40 && !(fs.existsSync(replica) && fs.readdirSync(replica).length); i++) await sleep(250);
    await sleep(2500);
  } finally { rep.kill('SIGTERM'); await sleep(500); }
  const r = spawnSync(process.execPath, ['scripts/restore-drill.mjs', '--compare', live], { encoding: 'utf8', env: { PATH: process.env.PATH, HOME: dir, BACKUP_FILE_DIR: replica, LITESTREAM_BIN: bin } });
  fs.rmSync(dir, { recursive: true, force: true });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /RESTORE DRILL PASSED/);
  assert.match(r.stdout, /audit chain verified/);
});
