#!/usr/bin/env node
// One command to prove the build is safe to deploy:  npm test   (or: node scripts/verify-all.mjs [--fast] [--only=<stage>] [--manifest])
//
// Stages
//   syntax     every JS file, JSON file, inline HTML script and manifest parses; package.json and render.yaml are sane
//   storage    database bootstrap, schema self-healing, audit-chain tamper detection, persistent-disk fallback
//   suites     the existing contract tests, final validation and the quality gate (skipped with --fast)
//   live       a real server: RBAC matrix (worker 403 / owner 200) and the full pipeline
//              ingestion -> work order -> AI draft -> human approval -> ledger -> audit log
//
// Exit code 0 only when every check passes. Nothing here touches your real database or .env: all state lives in a temp folder
// and the server is started with an explicit, minimal environment.
import { spawn, spawnSync } from 'node:child_process';
import { createHash, createHmac, randomBytes, randomUUID } from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
process.chdir(ROOT);
const args = process.argv.slice(2);
const FAST = args.includes('--fast');
const ONLY = args.find((a) => a.startsWith('--only='))?.slice(7) || null;
const WITH_MANIFEST = args.includes('--manifest');
process.env.SUPERPRO_SKIP_DOTENV = '1'; // every server and test started below ignores the developer's real .env (no real SMS, email or AI calls)
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'superpro-verify-'));

/* ---------------------------------------------------------------- tiny runner --- */
const results = [];
let currentStage = '';
const useColor = process.stdout.isTTY;
const paint = (code, text) => (useColor ? `\x1b[${code}m${text}\x1b[0m` : text);
async function check(name, fn) {
  const started = Date.now();
  try {
    await fn();
    results.push({ stage: currentStage, name, ok: true });
    console.log(`  ${paint(32, 'PASS')} ${name}${Date.now() - started > 1500 ? paint(90, ` (${((Date.now() - started) / 1000).toFixed(1)}s)`) : ''}`);
  } catch (error) {
    const message = String(error?.message || error).split('\n').slice(0, 6).join('\n        ');
    results.push({ stage: currentStage, name, ok: false, message });
    console.log(`  ${paint(31, 'FAIL')} ${name}\n        ${message}`);
  }
}
async function stage(name, title, fn) {
  if (ONLY && ONLY !== name) return;
  currentStage = name;
  console.log(`\n${paint(1, `[${name}]`)} ${title}`);
  try { await fn(); } catch (error) { await check('stage setup', () => { throw error; }); }
}

/* ---------------------------------------------------------------- file helpers --- */
const SKIP_DIRS = new Set(['node_modules', '.git', 'data', 'archive', 'coverage', 'dist', '.tmp', 'legacy-archive']);
function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) { if (!SKIP_DIRS.has(entry.name) && !entry.name.startsWith('legacy-archive-')) walk(path.join(dir, entry.name), out); }
    else out.push(path.join(dir, entry.name));
  }
  return out;
}
const rel = (f) => path.relative(ROOT, f).split(path.sep).join('/');
const run = (command, argv, options = {}) => spawnSync(command, argv, { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, ...options });

/* ================================================================ 1. SYNTAX ===== */
await stage('syntax', 'Syntax validity across all files', async () => {
  const files = walk(ROOT);
  const scripts = files.filter((f) => /\.(mjs|cjs|js)$/.test(f));
  await check(`${scripts.length} JavaScript files parse`, () => {
    const bad = [];
    for (const f of scripts) { const r = run(process.execPath, ['--check', f]); if (r.status !== 0) bad.push(`${rel(f)}: ${(r.stderr.split('\n').find((l) => /Error/.test(l)) || r.stderr).trim()}`); }
    assert.deepEqual(bad, []);
  });
  await check('JSON files parse', () => {
    const bad = [];
    for (const f of files.filter((x) => x.endsWith('.json') && !x.endsWith('package-lock.json'))) { try { JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { bad.push(`${rel(f)}: ${e.message}`); } }
    assert.deepEqual(bad, []);
  });
  await check('inline <script> blocks in HTML parse', () => {
    const bad = [];
    for (const f of files.filter((x) => x.endsWith('.html'))) {
      const html = fs.readFileSync(f, 'utf8');
      for (const m of html.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/gi)) {
        if (/\bsrc\s*=/.test(m[1]) || !m[2].trim()) continue;
        try {
          if (/application\/(ld\+)?json/i.test(m[1])) { if (!/__[A-Z_]+__/.test(m[2])) JSON.parse(m[2]); } // server placeholders such as __ABN_LD__ are filled at request time
          else if (!/type\s*=\s*["']module/i.test(m[1])) new vm.Script(m[2], { filename: rel(f) });
        } catch (e) { bad.push(`${rel(f)}: ${e.message}`); }
      }
    }
    assert.deepEqual(bad, []);
  });
  await check('local script/style references in HTML exist', () => {
    const missing = [];
    for (const f of files.filter((x) => x.endsWith('.html'))) {
      for (const m of fs.readFileSync(f, 'utf8').matchAll(/(?:src|href)=["']([^"'#?]+\.(?:js|css|png|svg|webp|jpg|ico|webmanifest))(?:\?[^"']*)?["']/gi)) {
        const ref = m[1];
        if (/^(https?:)?\/\//.test(ref) || ref.startsWith('data:')) continue;
        const candidates = ref.startsWith('/') ? [path.join(ROOT, ref), path.join(ROOT, 'saas', ref), path.join(ROOT, 'office', ref.replace(/^\/office\//, ''))] : [path.join(path.dirname(f), ref)];
        if (!candidates.some((c) => fs.existsSync(c))) missing.push(`${rel(f)} -> ${ref}`);
      }
    }
    assert.deepEqual(missing, []);
  });
  await check('package.json: start/test scripts, Node 22, every referenced script exists', () => {
    const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
    assert.equal(pkg.scripts.start, 'node src/server.js');
    assert.equal(pkg.scripts.test, 'node scripts/verify-all.mjs');
    assert.match(pkg.engines.node, /^(\^|~|>=)?22(\.|$)/, 'engines.node must be 22.x');
    const missing = [];
    for (const [name, cmd] of Object.entries(pkg.scripts)) for (const m of String(cmd).matchAll(/node(?:\s+--[\w-]+(?:=\S+)?)*\s+([\w./-]+\.(?:mjs|js|cjs))/g)) if (!fs.existsSync(m[1])) missing.push(`${name}: ${m[1]}`);
    assert.deepEqual(missing, []);
  });
  await check('render.yaml: Node 22, persistent disk at /var/data, health check, secrets generated not hard-coded', () => {
    const y = fs.readFileSync('render.yaml', 'utf8');
    assert.ok(!/\t/.test(y), 'tabs are not valid YAML');
    assert.match(y, /runtime:\s*node/);
    assert.match(y, /key:\s*NODE_VERSION\s*\n\s*value:\s*"?22[.\d]*"?/);
    assert.match(y, /mountPath:\s*\/var\/data/);
    assert.match(y, /healthCheckPath:\s*\/healthz/);
    assert.match(y, /key:\s*DATABASE_PATH\s*\n\s*value:\s*"?\/var\/data\//);
    assert.match(y, /key:\s*REQUIRE_PERSISTENT_DISK\s*\n\s*value:\s*"?1"?/);
    for (const k of ['SESSION_SECRET', 'SAAS_SESSION_SECRET', 'ADMIN_SESSION_SECRET', 'ADMIN_API_KEY', 'INTEGRATION_ENCRYPTION_KEY']) assert.match(y, new RegExp(`key:\\s*${k}\\s*\\n\\s*generateValue:\\s*true`), `${k} must be generateValue`);
    assert.ok(!/(sk-[A-Za-z0-9]{20,}|AIza[0-9A-Za-z_-]{30,}|-----BEGIN)/.test(y), 'render.yaml must not contain secrets');
  });
  await check('no .env or secret files are committed to git (a local, git-ignored .env is fine and is never read)', () => {
    if (!fs.existsSync('.git')) return; // e.g. a downloaded zip: nothing is tracked, so there is nothing to check
    const r = run('git', ['ls-files']);
    if (r.status !== 0) return; // git unavailable: skip rather than guess
    const bad = r.stdout.split('\n').filter((f) => /(^|\/)\.env($|\.)/.test(f) && !/\.example$/.test(f));
    assert.deepEqual(bad, [], 'tracked secret files: remove with git rm --cached');
  });
});

/* ======================================================= 2. STORAGE / MIGRATIONS == */
await stage('storage', 'Database migrations, self-healing and persistent-storage fallback', async () => {
  const { createDb, appendAuditLog, verifyAuditChain } = await import('../src/db.js');
  const { checkSchema, prepareStorage, probeDirectory, runDiagnostics } = await import('../src/diagnostics.js');
  const dbFile = path.join(tempRoot, 'storage', 'one.sqlite');

  await check('fresh database bootstraps and reopening is idempotent', () => {
    const first = createDb(dbFile); const tables = first.prepare(`SELECT COUNT(*) n FROM sqlite_master WHERE type='table'`).get().n; first.close();
    const second = createDb(dbFile); assert.equal(second.prepare(`SELECT COUNT(*) n FROM sqlite_master WHERE type='table'`).get().n, tables); second.close();
    assert.ok(tables >= 60, `expected a full schema, got ${tables} tables`);
  });
  await check('schema drift is detected, then patched without touching existing data', () => {
    const db = createDb(dbFile);
    const now = new Date().toISOString(), org = randomUUID();
    db.prepare('INSERT INTO organisations (id,name,slug,created_at,updated_at) VALUES (?,?,?,?,?)').run(org, 'Drift Co', 'drift-' + org, now, now);
    db.exec('ALTER TABLE onboarding_profiles DROP COLUMN custom_sections');
    db.exec('DROP TRIGGER audit_logs_no_delete');
    db.exec('DROP TABLE comms_channels');
    const dry = checkSchema(db);
    assert.ok(dry.missing.columns.includes('onboarding_profiles.custom_sections'), 'missing column not reported');
    assert.ok(dry.missing.triggers.includes('audit_logs_no_delete'), 'missing trigger not reported');
    assert.ok(dry.missing.tables.includes('comms_channels'), 'missing table not reported');
    assert.equal(db.prepare(`SELECT COUNT(*) n FROM pragma_table_info('onboarding_profiles') WHERE name='custom_sections'`).get().n, 0, 'a dry run must not change anything');
    const healed = checkSchema(db, { apply: true });
    assert.deepEqual(healed.failed, []);
    assert.ok(healed.patched.length >= 3);
    assert.equal(checkSchema(db).ok, true, 'schema still drifting after repair');
    assert.equal(db.prepare('SELECT name FROM organisations WHERE id=?').get(org).name, 'Drift Co', 'existing rows must survive');
    appendAuditLog(db, { organisation_id: org, action: 'verify.drift' });
    assert.throws(() => db.prepare(`DELETE FROM audit_logs`).run(), /audit|retention|cannot/i, 'audit protection must be restored');
    db.close();
  });
  await check('audit log is append-only and the hash chain detects tampering', () => {
    const db = createDb(path.join(tempRoot, 'storage', 'audit.sqlite'));
    for (let i = 0; i < 4; i++) appendAuditLog(db, { organisation_id: 'org-a', action: 'verify.step', metadata: { i } });
    assert.equal(verifyAuditChain(db).ok, true);
    assert.throws(() => db.prepare(`UPDATE audit_logs SET action='forged'`).run());
    assert.throws(() => db.prepare(`DELETE FROM audit_logs`).run());
    db.exec('DROP TRIGGER audit_logs_no_update'); // simulate someone bypassing the triggers
    db.prepare(`UPDATE audit_logs SET metadata_json='{"i":99}' WHERE rowid=2`).run();
    const verdict = verifyAuditChain(db);
    assert.equal(verdict.ok, false, 'tampering was not detected');
    assert.equal(runDiagnostics({ db, env: {} }).checks.find((c) => c.id === 'audit.chain').status, 'fail');
    db.close();
  });
  await check('an old database (pre-rebuild audit table) migrates and its audit chain still verifies', async () => {
    const { default: Database } = await import('better-sqlite3');
    const file = path.join(tempRoot, 'storage', 'legacy.sqlite');
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const raw = new Database(file);
    raw.exec(`CREATE TABLE saas_audit_events (id TEXT PRIMARY KEY, organisation_id TEXT NOT NULL, actor_user_id TEXT, event_type TEXT NOT NULL, entity_type TEXT, entity_id TEXT, detail_json TEXT NOT NULL DEFAULT '{}', created_at TEXT NOT NULL, prev_hash TEXT, event_hash TEXT)`);
    // Exactly how the old server hashed: entity type sits where the module name sits today.
    let prev = null;
    for (let i = 0; i < 5; i++) {
      const id = randomUUID(), at = new Date(Date.now() - (10 - i) * 60000).toISOString(), detail = JSON.stringify({ i });
      const type = i % 2 ? 'branding.updated' : 'worker.created', entity = i % 2 ? 'organisation' : null;
      const hash = createHash('sha256').update(['org-legacy', 'user-1', type, entity || '', 'e-' + i, detail, prev || '', at, id].join('|')).digest('hex');
      raw.prepare('INSERT INTO saas_audit_events VALUES (?,?,?,?,?,?,?,?,?,?)').run(id, 'org-legacy', 'user-1', type, entity, 'e-' + i, detail, at, prev, hash);
      prev = hash;
    }
    raw.close();
    const db = createDb(file);
    assert.equal(db.prepare(`SELECT COUNT(*) n FROM audit_logs`).get().n, 5, 'legacy rows were not migrated');
    appendAuditLog(db, { organisation_id: 'org-legacy', action: 'verify.after_migration' }); // new-style row chained onto the old ones
    const verdict = verifyAuditChain(db);
    assert.equal(verdict.ok, true, JSON.stringify(verdict.broken));
    assert.equal(verdict.legacy, 5); assert.equal(verdict.checked, 6);
    db.exec('DROP TRIGGER audit_logs_no_update');
    db.prepare(`UPDATE audit_logs SET metadata_json='{"forged":true}' WHERE action='branding.updated' AND rowid=(SELECT MIN(rowid) FROM audit_logs WHERE action='branding.updated')`).run();
    assert.equal(verifyAuditChain(db).ok, false, 'tampering with a pre-rebuild row must still be detected');
    db.close();
  });
  await check('writable persistent disk is used and reported as persistent', () => {
    const persistentRoot = path.join(tempRoot, 'disk-ok'); fs.mkdirSync(persistentRoot);
    const plan = prepareStorage({ env: {}, backendRoot: tempRoot, persistentRoot });
    assert.equal(plan.persistent, true); assert.equal(plan.fallback, false);
    assert.equal(plan.databasePath, path.join(persistentRoot, 'super-pro.sqlite'));
    assert.equal(plan.uploadRoot, path.join(persistentRoot, 'uploads'));
    assert.equal(probeDirectory(persistentRoot).writable, true);
  });
  await check('unwritable disk falls back to local storage and says so', () => {
    const blocker = path.join(tempRoot, 'not-a-folder'); fs.writeFileSync(blocker, 'x'); // a file where a folder should be: fails for every user, including root
    const persistentRoot = path.join(blocker, 'data');
    const plan = prepareStorage({ env: { DATABASE_PATH: path.join(persistentRoot, 'a.sqlite'), UPLOAD_DIR: path.join(persistentRoot, 'up') }, backendRoot: path.join(tempRoot, 'app'), persistentRoot });
    assert.equal(plan.fallback, true); assert.equal(plan.persistent, false);
    assert.ok(plan.warnings.length >= 1);
    assert.ok(plan.databasePath.startsWith(path.join(tempRoot, 'app', 'data')) || plan.databasePath.startsWith(os.tmpdir()));
    assert.equal(probeDirectory(path.dirname(plan.databasePath)).writable, true);
    const db = createDb(plan.databasePath); db.close(); // the fallback location really works
  });
  await check('REQUIRE_PERSISTENT_DISK stops the server instead of using fragile storage', () => {
    const blocker = path.join(tempRoot, 'not-a-folder'); const persistentRoot = path.join(blocker, 'data');
    assert.throws(() => prepareStorage({ env: { REQUIRE_PERSISTENT_DISK: '1', DATABASE_PATH: path.join(persistentRoot, 'a.sqlite') }, backendRoot: tempRoot, persistentRoot }), /REQUIRE_PERSISTENT_DISK/);
    assert.throws(() => prepareStorage({ env: { REQUIRE_PERSISTENT_DISK: '1', RENDER: 'true' }, backendRoot: tempRoot, persistentRoot: path.join(tempRoot, 'missing-mount') }), /not mounted/);
  });
  await check('local development without /var/data uses ./data and still starts', () => {
    const plan = prepareStorage({ env: {}, backendRoot: path.join(tempRoot, 'dev'), persistentRoot: path.join(tempRoot, 'no-such-mount') });
    assert.equal(plan.fallback, false); assert.equal(plan.persistent, false);
    assert.ok(plan.databasePath.startsWith(path.join(tempRoot, 'dev', 'data')));
  });
});

/* ====================================================== 3. EXISTING SUITES ======= */
await stage('suites', 'Contract tests, final validation, quality gate', async () => {
  if (FAST) { console.log('  (skipped with --fast)'); return; }
  const tests = fs.readdirSync('scripts').filter((f) => f.endsWith('.test.mjs')).map((f) => `scripts/${f}`);
  await check(`${tests.length} contract test files pass`, () => {
    const r = run(process.execPath, ['--test', '--test-concurrency=1', ...tests], { timeout: 600000 });
    assert.equal(r.status, 0, (r.stdout.match(/^# (?:fail|cancelled).*$/gm) || []).join(', ') + '\n' + (r.stdout + r.stderr).split('\n').filter((l) => /not ok|Error|fail/i.test(l)).slice(0, 8).join('\n'));
  });
  for (const [label, script] of [['final validation', 'scripts/validate-final.mjs'], ['quality check', 'scripts/quality-check.mjs'], ['quality ratchet', 'scripts/quality-ratchet.mjs']]) {
    await check(label, () => { const r = run(process.execPath, [script], { timeout: 300000 }); assert.equal(r.status, 0, (r.stdout + r.stderr).split('\n').slice(-8).join('\n')); });
  }
  if (WITH_MANIFEST) await check('file manifest matches', () => { const r = run(process.execPath, ['scripts/verify-manifest.mjs']); assert.equal(r.status, 0, r.stdout + r.stderr); });
});

/* ===================================================== 4. LIVE SERVER ============ */
const freePort = () => new Promise((resolve, reject) => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const { port } = s.address(); s.close(() => resolve(port)); }); s.on('error', reject); });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

await stage('live', 'RBAC matrix and the end-to-end pipeline on a real server', async () => {
  const MAIL_SECRET = 'mail-' + randomBytes(12).toString('hex'), ADMIN_KEY = 'admin-' + randomBytes(16).toString('hex'), AI_REPLY = 'Thanks for getting in touch. We can come and look at the leaking tap on Thursday morning.';
  // A stand-in AI provider so the draft step runs for real without any API key or network.
  const aiCalls = [];
  const ai = http.createServer((req, res) => { let b = ''; req.on('data', (c) => { b += c; }); req.on('end', () => { aiCalls.push(req.url); res.setHeader('content-type', 'application/json'); res.end(JSON.stringify({ choices: [{ message: { content: AI_REPLY } }] })); }); });
  await new Promise((r) => ai.listen(0, '127.0.0.1', r));
  const port = await freePort(), base = `http://127.0.0.1:${port}`;
  const dbPath = path.join(tempRoot, 'live', 'live.sqlite');
  const child = spawn(process.execPath, ['src/server.js'], {
    cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'],
    env: { // explicit, minimal environment: nothing from the developer's shell or .env leaks in or out
      PATH: process.env.PATH, HOME: tempRoot, SUPERPRO_SKIP_DOTENV: '1', PORT: String(port), NODE_ENV: 'test', PUBLIC_BASE_URL: base, ALLOWED_ORIGINS: base,
      DATABASE_PATH: dbPath, UPLOAD_DIR: path.join(tempRoot, 'live', 'uploads'), SAAS_VERIFICATION_TEST_MODE: '1',
      ADMIN_API_KEY: ADMIN_KEY, SESSION_SECRET: randomBytes(24).toString('hex'), SAAS_SESSION_SECRET: randomBytes(24).toString('hex'),
      ADMIN_SESSION_SECRET: randomBytes(24).toString('hex'), INTEGRATION_ENCRYPTION_KEY: randomBytes(32).toString('hex'),
      INBOUND_EMAIL_WEBHOOK_SECRET: MAIL_SECRET, FREE_AI_MODE: '0', AI_PROVIDER_BASE_URL: `http://127.0.0.1:${ai.address().port}`, AI_PROVIDER_API_KEY: 'test-key', AI_PROVIDER_MODEL: 'mock-model'
    }
  });
  let log = ''; child.stdout.on('data', (b) => { log += b; }); child.stderr.on('data', (b) => { log += b; });
  const stop = async () => { child.kill('SIGTERM'); await Promise.race([new Promise((r) => child.once('exit', r)), sleep(3000)]); ai.close(); };

  const call = async (method, url, { cookie, body, headers = {} } = {}) => {
    const r = await fetch(base + url, { method, headers: { origin: base, ...(cookie ? { cookie } : {}), ...(body !== undefined ? { 'content-type': 'application/json' } : {}), ...headers }, body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body) });
    const text = await r.text(); let json = null; try { json = JSON.parse(text); } catch { /* not JSON */ }
    return { status: r.status, json, text, headers: r.headers };
  };
  let db;
  try {
    let up = false;
    for (let i = 0; i < 100 && !up; i++) { if (child.exitCode !== null) throw new Error('Server exited early:\n' + log.slice(-1500)); try { up = (await fetch(base + '/healthz')).ok; } catch { await sleep(200); } }
    if (!up) throw new Error('Server never became healthy:\n' + log.slice(-1500));

    // --- the owner arrives through the real registration + login flow
    const password = 'A-very-long-password-' + randomBytes(3).toString('hex') + '!';
    let ownerCookie, orgId;
    await check('owner can register, verify and sign in (real flow)', async () => {
      const start = await call('POST', '/api/saas/registration/start', { body: { business_name: 'Verify Plumbing Pty Ltd', identifier_type: 'ABN', business_identifier: '33051775556', state: 'WA', postcode: '6000', full_name: 'Sam Owner', email: 'verify.owner@example.com', phone: '0411222667', password, confirm_password: password, plan_id: 'starter', accept_terms: true, terms_version: '2026-09' } });
      assert.ok([200, 202].includes(start.status), start.text);
      const codes = start.json.delivery?.test_codes || {};
      const verify = await call('POST', '/api/saas/registration/verify', { body: { pending_id: start.json.pending_id, email_code: codes.email, sms_code: codes.sms } });
      assert.ok(verify.status < 300, verify.text);
      const login = await call('POST', '/api/saas/login', { body: { email: 'verify.owner@example.com', password } });
      assert.equal(login.status, 200, login.text);
      const set = login.headers.getSetCookie?.() || [login.headers.get('set-cookie')];
      ownerCookie = set.filter(Boolean).map((c) => c.split(';')[0]).join('; ');
      assert.ok(/fp_session=/.test(ownerCookie), 'no session cookie issued');
      const me = await call('GET', '/api/saas/me', { cookie: ownerCookie });
      assert.equal(me.status, 200); assert.equal(me.json.ok, true);
      orgId = me.json.organisation?.id || me.json.data?.organisation?.id || me.json.organisation_id || me.json.membership?.organisation_id;
    });
    if (!ownerCookie) throw new Error('Cannot continue without an owner session.');
    db = (await import('better-sqlite3')).default(dbPath, { readonly: true });
    orgId = orgId || db.prepare('SELECT organisation_id FROM memberships LIMIT 1').get().organisation_id;

    // --- other roles and a second tenant are seeded straight into the database with live sessions
    const rw = (await import('better-sqlite3')).default(dbPath);
    const now = new Date().toISOString(), expires = new Date(Date.now() + 3600000).toISOString();
    const orgB = randomUUID();
    rw.prepare('INSERT INTO organisations (id,name,slug,created_at,updated_at) VALUES (?,?,?,?,?)').run(orgB, 'Other Tenant', 'other-' + orgB, now, now);
    const cookies = { owner: ownerCookie };
    for (const [key, tenant, role] of [['admin', orgId, 'admin'], ['manager', orgId, 'manager'], ['worker', orgId, 'employee'], ['ownerB', orgB, 'owner']]) {
      const uid = randomUUID(), token = randomBytes(24).toString('hex');
      rw.prepare('INSERT INTO users (id,email,full_name,password_hash,password_salt,created_at,updated_at) VALUES (?,?,?,?,?,?,?)').run(uid, `${key}-${uid}@example.test`, key, 'x', 'x', now, now);
      rw.prepare('INSERT INTO memberships (organisation_id,user_id,role,created_at) VALUES (?,?,?,?)').run(tenant, uid, role, now);
      rw.prepare('INSERT INTO user_sessions (id,user_id,token_hash,expires_at,created_at,last_seen_at) VALUES (?,?,?,?,?,?)').run(randomUUID(), uid, createHash('sha256').update(token).digest('hex'), expires, now, now);
      cookies[key] = 'fp_session=' + token;
    }
    rw.close();

    // ---------------- RBAC matrix: each row is [description, method, path, role, expected status, body]
    const matrix = [
      ['signed-out visitor is refused', 'GET', '/api/saas/me', null, 401],
      ['worker 403 / owner 200: tenant data export', 'GET', '/api/saas/data-export', 'worker', 403],
      ['owner 200: tenant data export', 'GET', '/api/saas/data-export', 'owner', 200],
      ['manager is not an owner: data export', 'GET', '/api/saas/data-export', 'manager', 403],
      ['worker 403: finance ledger', 'GET', '/api/saas/finance', 'worker', 403],
      ['manager 403: finance ledger', 'GET', '/api/saas/finance', 'manager', 403],
      ['owner 200: finance ledger', 'GET', '/api/saas/finance', 'owner', 200],
      ['worker 403: create work order', 'POST', '/api/saas/work-orders', 'worker', 403, { title: 'Nope', start_at: '2026-12-01T08:00:00+08:00', required_workers: 1, required_level: 1 }],
      ['worker 403: omnichannel inbox', 'GET', '/api/saas/comms/threads', 'worker', 403],
      ['manager 200: omnichannel inbox', 'GET', '/api/saas/comms/threads', 'manager', 200],
      ['worker 403: migration dry run', 'POST', '/api/saas/migration/preview', 'worker', 403, { entity: 'workers', rows: [{ n: 'x' }], mapping: { full_name: 'n' } }],
      ['worker 403: channel settings', 'GET', '/api/saas/comms/channels', 'worker', 403],
      ['manager 403: change channel address (owner only)', 'PUT', '/api/saas/comms/channels/email', 'manager', 403, { address: 'x@y.example' }],
      ['worker 401/403: platform diagnostics', 'GET', '/api/saas/health/diagnostics', 'worker', [401, 403]],
      ['owner 401/403: platform diagnostics need the operator key', 'GET', '/api/saas/health/diagnostics', 'owner', [401, 403]],
      ['operator key 200: platform diagnostics', 'GET', '/api/saas/health/diagnostics', 'operator', 200]
    ];
    for (const [label, method, url, role, expected, body] of matrix) {
      await check(label, async () => {
        const r = await call(method, url, { cookie: role && role !== 'operator' ? cookies[role] : undefined, body, headers: role === 'operator' ? { 'x-admin-key': ADMIN_KEY } : {} });
        const allowed = Array.isArray(expected) ? expected : [expected];
        assert.ok(allowed.includes(r.status), `expected ${allowed.join('/')} got ${r.status}: ${r.text.slice(0, 160)}`);
      });
    }

    // ---------------- pipeline
    const ids = {};
    await check('1 ingestion: signed inbound email reaches the right tenant inbox (and a bad signature does not)', async () => {
      assert.equal((await call('PUT', '/api/saas/comms/channels/email', { cookie: cookies.owner, body: { address: 'desk@verify.example' } })).status, 202);
      const rw2 = (await import('better-sqlite3')).default(dbPath);
      rw2.prepare("UPDATE comms_channels SET status='active' WHERE organisation_id=? AND channel='email'").run(orgId); rw2.close();
      const send = (secret, messageId) => { const body = JSON.stringify({ message_id: messageId, from: { address: 'casey@customer.example', name: 'Casey Customer' }, to: 'desk@verify.example', subject: 'Leaking tap', text: 'Hi, my kitchen tap is leaking. Can you come this week?' }); const ts = String(Math.floor(Date.now() / 1000)); return call('POST', '/api/webhooks/inbound-email', { body, headers: { 'x-webhook-timestamp': ts, 'x-webhook-signature': createHmac('sha256', secret).update(`${ts}.${body}`).digest('hex') } }); };
      assert.equal((await send('wrong-secret', 'bad-1')).status, 401);
      const good = await send(MAIL_SECRET, 'verify-1'); assert.equal(good.status, 202); assert.equal(good.json.routed, true);
      assert.equal((await send(MAIL_SECRET, 'verify-1')).json.duplicate, true, 'replayed message must be ignored');
      const threads = await call('GET', '/api/saas/comms/threads', { cookie: cookies.manager });
      assert.equal(threads.json.threads.length, 1); ids.thread = threads.json.threads[0].id;
      assert.equal((await call('GET', `/api/saas/comms/threads/${ids.thread}`, { cookie: cookies.ownerB })).status, 404, 'other tenant must not see the thread');
    });
    await check('2 work order: manager turns the enquiry into a job', async () => {
      const created = await call('POST', '/api/saas/work-orders', { cookie: cookies.manager, body: { title: 'Fix leaking kitchen tap (Casey Customer)', address: '12 Example St, Perth WA 6000', start_at: '2026-12-03T08:00:00+08:00', required_workers: 1, required_level: 1 } });
      assert.equal(created.status, 201, created.text); ids.workOrder = created.json.id;
      const list = await call('GET', '/api/saas/work-orders', { cookie: cookies.manager });
      assert.ok(JSON.stringify(list.json).includes(ids.workOrder));
      const listB = await call('GET', '/api/saas/work-orders', { cookie: cookies.ownerB });
      assert.ok(!JSON.stringify(listB.json).includes(ids.workOrder), 'other tenant must not see the job');
    });
    await check('3 AI draft: reply is drafted, staged for approval and NOT sent', async () => {
      const draft = await call('POST', `/api/saas/comms/threads/${ids.thread}/draft`, { cookie: cookies.manager, body: { instruction: 'Offer Thursday morning' } });
      assert.equal(draft.status, 201, draft.text);
      assert.equal(draft.json.status, 'pending_approval'); assert.equal(draft.json.executed, false); assert.equal(draft.json.draft, AI_REPLY);
      assert.ok(aiCalls.length >= 1, 'the AI provider was never called');
      ids.message = draft.json.message_id; ids.approval = draft.json.approval_id;
      assert.equal((await call('POST', `/api/saas/comms/messages/${ids.message}/send`, { cookie: cookies.manager })).status, 409, 'unapproved drafts must not send');
    });
    await check('4 human approval: worker cannot approve, other tenant cannot approve, manager can (with edits), once only', async () => {
      const url = `/api/saas/approvals/${ids.approval}/decision`;
      assert.equal((await call('POST', url, { cookie: cookies.worker, body: { decision: 'approve' } })).status, 403);
      assert.equal((await call('POST', url, { cookie: cookies.ownerB, body: { decision: 'approve' } })).status, 404);
      const approved = await call('POST', url, { cookie: cookies.manager, body: { decision: 'approve', note: 'Checked with the plumber', edited_payload: { body: AI_REPLY + ' Please reply to confirm.' } } });
      assert.equal(approved.status, 200, approved.text); assert.equal(approved.json.status, 'approved');
      const row = db.prepare('SELECT status,body,ai_generated FROM comms_messages WHERE id=?').get(ids.message);
      assert.equal(row.status, 'approved'); assert.ok(row.body.endsWith('Please reply to confirm.')); assert.equal(row.ai_generated, 1);
      assert.equal((await call('POST', url, { cookie: cookies.manager, body: { decision: 'approve' } })).status, 404, 'a decision must only apply once');
    });
    await check('5 ledger: owner books the job revenue, tenant totals are correct and isolated', async () => {
      const entry = await call('POST', '/api/saas/finance', { cookie: cookies.owner, body: { entry_type: 'revenue', category: 'Plumbing callout', description: 'Fix leaking kitchen tap', amount: 220, tax: 20, occurred_on: '2026-12-03', work_order_id: ids.workOrder } });
      assert.equal(entry.status, 201, entry.text); ids.ledger = entry.json.id;
      const ledger = await call('GET', '/api/saas/finance', { cookie: cookies.owner });
      assert.equal(ledger.json.summary.revenue_cents, 22000); assert.equal(ledger.json.summary.net_profit_cents, 22000);
      assert.equal(ledger.json.jobs.find((j) => j.id === ids.workOrder).revenue_cents, 22000, 'entry must be tied to the work order');
      assert.equal((await call('GET', '/api/saas/finance', { cookie: cookies.ownerB })).json.summary.revenue_cents, 0, 'other tenant ledger must be empty');
      assert.equal((await call('POST', '/api/saas/finance', { cookie: cookies.ownerB, body: { entry_type: 'revenue', category: 'x', amount: 1, occurred_on: '2026-12-03', work_order_id: ids.workOrder } })).status, 400, 'cannot attach a ledger entry to another tenant\'s job');
    });
    await check('6 audit log: every step is recorded, in order, and the chain verifies', async () => {
      const { verifyAuditChain } = await import('../src/db.js');
      const actions = db.prepare('SELECT action,entity_id FROM audit_logs WHERE organisation_id=? ORDER BY created_at,rowid').all(orgId);
      const names = actions.map((a) => a.action);
      for (const needed of ['work_order.created', 'comms.ai_draft_staged', 'finance.entry_created']) assert.ok(names.includes(needed), `audit log is missing ${needed}; saw ${[...new Set(names)].join(', ')}`);
      assert.ok(names.indexOf('work_order.created') < names.indexOf('comms.ai_draft_staged'), 'work order should precede the draft');
      assert.ok(names.indexOf('comms.ai_draft_staged') < names.indexOf('finance.entry_created'), 'draft should precede the ledger entry');
      assert.ok(actions.some((a) => a.action === 'work_order.created' && a.entity_id === ids.workOrder));
      assert.ok(actions.some((a) => a.action === 'finance.entry_created' && a.entity_id === ids.ledger));
      const decided = db.prepare(`SELECT COUNT(*) n FROM workspace_approval_events WHERE approval_id=? AND event_type='approved'`).get(ids.approval).n;
      assert.equal(decided, 1, 'the approval decision must have its own event record');
      const verdict = verifyAuditChain(db, orgId); assert.equal(verdict.ok, true, JSON.stringify(verdict.broken)); assert.ok(verdict.checked >= 3);
    });
    await check('diagnostics endpoint: healthy after the pipeline, secrets never echoed', async () => {
      const r = await call('GET', '/api/saas/health/diagnostics', { headers: { 'x-admin-key': ADMIN_KEY } });
      assert.equal(r.status, 200, r.text.slice(0, 400));
      for (const id of ['database.integrity', 'database.schema', 'audit.chain', 'audit.append_only', 'config.secrets']) assert.equal(r.json.checks.find((c) => c.id === id)?.status, 'pass', id);
      assert.ok(!r.text.includes(ADMIN_KEY) && !r.text.includes(MAIL_SECRET), 'a secret value leaked into diagnostics');
      assert.ok(['ok', 'degraded'].includes(r.json.status));
    });
    await check('server log shows no unhandled errors', () => {
      const bad = log.split('\n').filter((l) => /UnhandledPromiseRejection|Uncaught|TypeError:|ReferenceError:|SqliteError/.test(l));
      assert.deepEqual(bad, []);
    });
  } finally { try { db?.close(); } catch { /* already closed */ } await stop(); }
});

/* ================================================================= SUMMARY ===== */
try { fs.rmSync(tempRoot, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }); } catch { /* Windows may still hold a file; the OS clears the temp folder later */ }
const failed = results.filter((r) => !r.ok);
console.log(`\n${failed.length ? paint(31, 'VERIFICATION FAILED') : paint(32, 'ALL CHECKS PASSED')}: ${results.length - failed.length}/${results.length} checks passed.`);
if (failed.length) { for (const f of failed) console.log(`  - [${f.stage}] ${f.name}`); process.exit(1); }
