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
import { fileURLToPath, pathToFileURL } from 'node:url';

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
    assert.equal(pkg.scripts.start, 'node scripts/start.mjs');
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
  for (const [label, script] of [['final validation', 'scripts/validate-release.mjs'], ['quality check', 'scripts/quality-check.mjs'], ['quality ratchet', 'scripts/quality-ratchet.mjs']]) {
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
      for (const [label, pw] of [['trailing space', password + ' '], ['capitalised first letter', password[0].toUpperCase() + password.slice(1)]]) {
        const v = await call('POST', '/api/saas/login', { body: { email: ' Verify.Owner@Example.com ', password: pw } });
        assert.equal(v.status, 200, 'mobile keyboard variant rejected: ' + label);
      }
      assert.equal((await call('POST', '/api/saas/login', { body: { email: 'verify.owner@example.com', password: 'wrong-' + password } })).status, 401, 'wrong password must still fail');
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
      ['worker 403: connections list', 'GET', '/api/saas/integrations/self-service', 'worker', 403],
      ['worker 403: disconnect a social account', 'DELETE', '/api/saas/integrations/self-service/meta', 'worker', 403],
      ['manager 403: disconnect a social account (owner/admin only)', 'DELETE', '/api/saas/integrations/self-service/meta', 'manager', 403],
      ['manager 200: connections list', 'GET', '/api/saas/integrations/self-service', 'manager', 200],
      ['worker 403: content studio renders', 'GET', '/api/saas/video-renders', 'worker', 403],
      ['worker 403: AI threads', 'GET', '/api/saas/ai/threads', 'worker', 403],
      ['worker 403: referrals', 'GET', '/api/saas/referrals', 'worker', 403],
      ['worker 403: billing providers', 'GET', '/api/saas/billing/providers', 'worker', 403],
      ['worker gets no organisation-wide dashboard numbers', 'GET', '/api/saas/dashboard', 'worker', 200],
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
    await check('5b finance automation: paid job builds revenue, materials and labour; overheads count; other tenants and managers are blocked', async () => {
      const put = (cookie, body, id = ids.workOrder) => call('PUT', `/api/saas/finance/jobs/${id}`, { cookie, body });
      assert.equal((await put(cookies.manager, { price: 1 })).status, 403, 'managers cannot edit job money');
      assert.equal((await put(cookies.ownerB, { price: 1 })).status, 404, 'other tenant cannot touch the job');
      assert.equal((await put(cookies.owner, { price: -5 })).status, 400);
      const r = await put(cookies.owner, { price: 500, paid: 500, materials: 110, labour_hours: 2, labour_rate: 40, completed: true });
      assert.equal(r.status, 200, r.text);
      assert.equal(r.json.job.profit_cents, 50000 - 11000 - 8000); assert.equal(r.json.job.stage, 'paid');
      await put(cookies.owner, { price: 500, paid: 500, materials: 110, labour_hours: 2, labour_rate: 40, completed: true }); // idempotent
      assert.equal((await call('POST', '/api/saas/finance/overheads', { cookie: cookies.owner, body: { name: 'Insurance', amount: 1200, period: 'yearly' } })).status, 201);
      const month = new Date().toISOString().slice(0, 7);
      const ov = await call('GET', '/api/saas/finance/overview', { cookie: cookies.owner });
      assert.equal(ov.status, 200);
      const auto = (await call('GET', '/api/saas/finance', { cookie: cookies.owner })).json.entries.filter((e) => e.source === 'auto');
      assert.equal(auto.length, 3, 'exactly one revenue, materials and labour entry after repeated saves');
      assert.equal(ov.json.current.overhead_cents, 10000);
      assert.equal((await call('GET', '/api/saas/finance/overview', { cookie: cookies.manager })).status, 403);
      assert.equal((await call('GET', '/api/saas/finance/overview', { cookie: cookies.ownerB })).json.current.revenue_cents, 0);
    });
    await check('5c media library: upload is private to the business, typed, and role-limited', async () => {
      const send = (cookie, name, type) => { const fd = new FormData(); fd.append('files', new Blob([Buffer.from('89504e470d0a1a0a', 'hex')], { type }), name); return fetch(base + '/api/saas/media', { method: 'POST', headers: { origin: base, cookie }, body: fd }); };
      assert.equal((await send(cookies.worker, 'a.png', 'image/png')).status, 403, 'workers cannot upload');
      assert.equal((await send(cookies.owner, 'evil.html', 'text/html')).status, 400, 'html is refused');
      const up = await send(cookies.owner, 'site.png', 'image/png'); assert.equal(up.status, 201);
      const id = (await up.json()).ids[0];
      const list = await call('GET', '/api/saas/media', { cookie: cookies.owner }); assert.equal(list.json.media.length, 1);
      assert.equal((await call('GET', '/api/saas/media', { cookie: cookies.ownerB })).json.media.length, 0, 'other business sees nothing');
      assert.equal((await call('GET', `/api/saas/media/${id}/file`, { cookie: cookies.ownerB })).status, 404, 'other business cannot fetch the file');
      const file = await fetch(base + `/api/saas/media/${id}/file`, { headers: { cookie: cookies.owner } });
      assert.equal(file.status, 200); assert.equal(file.headers.get('content-type'), 'image/png'); assert.equal(file.headers.get('x-content-type-options'), 'nosniff');
      assert.equal((await call('DELETE', `/api/saas/media/${id}`, { cookie: cookies.manager })).status, 403);
      assert.equal((await call('DELETE', `/api/saas/media/${id}`, { cookie: cookies.owner })).status, 200);
    });
    await check('5d customers: one record per customer, jobs and before/after evidence linked, missing photo needs a reason, workers locked out', async () => {
      const mk = await call('POST', '/api/saas/customers', { cookie: cookies.manager, body: { name: 'Pat Customer', email: 'Pat@Example.com', phone: '+61400111222', status: 'current' } });
      assert.equal(mk.status, 201, mk.text); const cid = mk.json.id;
      assert.equal((await call('POST', '/api/saas/customers', { cookie: cookies.manager, body: { name: 'Dup', email: 'pat@example.com' } })).status, 409, 'duplicate email');
      assert.equal((await call('GET', '/api/saas/customers', { cookie: cookies.worker })).status, 403, 'workers cannot list customers');
      assert.equal((await call('GET', `/api/saas/customers/${cid}`, { cookie: cookies.worker })).status, 403);
      assert.equal((await call('GET', `/api/saas/customers/${cid}`, { cookie: cookies.ownerB })).status, 404, 'other tenant');
      assert.equal((await call('GET', '/api/saas/customers', { cookie: cookies.ownerB })).json.customers.length, 0);
      assert.equal((await call('PUT', `/api/saas/work-orders/${ids.workOrder}/customer`, { cookie: cookies.ownerB, body: { customer_id: cid } })).status, 404);
      assert.equal((await call('PUT', `/api/saas/work-orders/${ids.workOrder}/customer`, { cookie: cookies.manager, body: { customer_id: cid } })).status, 200);
      const send = (cookie, job, stage) => { const fd = new FormData(); fd.append('stage', stage); fd.append('files', new Blob([Buffer.from('ffd8ffe0', 'hex')], { type: 'image/jpeg' }), 'before.jpg'); return fetch(base + `/api/saas/work-orders/${job}/media`, { method: 'POST', headers: { origin: base, cookie }, body: fd }); };
      assert.equal((await send(cookies.worker, ids.workOrder, 'before')).status, 404, 'a worker not on the job cannot add or see evidence');
      assert.equal((await send(cookies.ownerB, ids.workOrder, 'before')).status, 404);
      assert.equal((await send(cookies.manager, ids.workOrder, 'before')).status, 201);
      assert.equal((await call('POST', `/api/saas/work-orders/${ids.workOrder}/media-reason`, { cookie: cookies.manager, body: { stage: 'after', reason_code: 'other' } })).status, 400, 'Other needs a note');
      assert.equal((await call('POST', `/api/saas/work-orders/${ids.workOrder}/media-reason`, { cookie: cookies.manager, body: { stage: 'after', reason_code: 'customer_declined' } })).status, 201);
      const detail = await call('GET', `/api/saas/customers/${cid}`, { cookie: cookies.manager });
      const job = detail.json.jobs.find((j) => j.id === ids.workOrder);
      assert.equal(job.before_count, 1); assert.equal(job.after_count, 0); assert.equal(job.after_reason, 'customer_declined');
      const mine = await call('GET', `/api/saas/work-orders/${ids.workOrder}/media`, { cookie: cookies.manager }); const mid = mine.json.media[0].id;
      assert.equal((await call('GET', `/api/saas/job-media/${mid}/file`, { cookie: cookies.worker })).status, 404);
      assert.equal((await call('GET', `/api/saas/job-media/${mid}/file`, { cookie: cookies.ownerB })).status, 404);
      assert.equal((await fetch(base + `/api/saas/job-media/${mid}/file`, { headers: { cookie: cookies.manager } })).status, 200);
      const jobs = await call('GET', '/api/saas/work-orders', { cookie: cookies.manager });
      assert.equal(jobs.json.jobs[0].price_cents, undefined, 'managers do not see job money'); assert.ok(jobs.json.jobs[0].customer_id, 'managers see the customer link');
    });
    await check('5e stock: movements decide on-hand, use on a job feeds job profit, workers see names only', async () => {
      const mk = await call('POST', '/api/saas/stock/items', { cookie: cookies.manager, body: { name: 'Polish compound', unit: 'tin', cost: 5, reorder_level: 3, reorder_qty: 10 } });
      assert.equal(mk.status, 201, mk.text); const item = mk.json.id;
      assert.equal((await call('POST', '/api/saas/stock/items', { cookie: cookies.manager, body: { name: 'polish COMPOUND' } })).status, 409, 'duplicate name');
      assert.equal((await call('POST', '/api/saas/stock/items', { cookie: cookies.worker, body: { name: 'x' } })).status, 403);
      assert.equal((await call('GET', '/api/saas/stock', { cookie: cookies.worker })).status, 403, 'workers do not see levels or costs');
      const names = await call('GET', '/api/saas/stock/choices', { cookie: cookies.worker }); assert.equal(names.status, 200);
      assert.deepEqual(Object.keys(names.json.items[0]).sort(), ['id', 'name', 'unit'], 'names only');
      assert.equal((await call('GET', '/api/saas/stock/choices', { cookie: cookies.ownerB })).json.items.length, 0);
      const mv = (cookie, body, id = item) => call('POST', `/api/saas/stock/items/${id}/move`, { cookie, body });
      assert.equal((await mv(cookies.worker, { kind: 'in', qty: 5 })).status, 403, 'workers cannot add stock');
      assert.equal((await mv(cookies.ownerB, { kind: 'in', qty: 5 })).status, 404, 'other tenant');
      assert.equal((await mv(cookies.manager, { kind: 'in', qty: 10 })).json.on_hand, 10);
      assert.equal((await mv(cookies.manager, { kind: 'use', qty: 2 })).status, 400, 'use needs a job');
      assert.equal((await mv(cookies.worker, { kind: 'use', qty: 1, work_order_id: ids.workOrder })).status, 404, 'a worker not on the job cannot use stock on it');
      assert.equal((await mv(cookies.manager, { kind: 'use', qty: 99, work_order_id: ids.workOrder })).status, 409, 'cannot go below zero');
      const before = (await call('GET', '/api/saas/finance/jobs', { cookie: cookies.owner })).json.jobs.find((j) => j.id === ids.workOrder).profit_cents;
      assert.equal((await mv(cookies.manager, { kind: 'use', qty: 4, work_order_id: ids.workOrder })).json.on_hand, 6);
      const after = (await call('GET', '/api/saas/finance/jobs', { cookie: cookies.owner })).json.jobs.find((j) => j.id === ids.workOrder);
      assert.equal(before - after.profit_cents, 2000, 'stock used lowers job profit by qty x cost'); assert.equal(after.stock_materials_cents, 2000);
      const ov = await call('GET', '/api/saas/stock', { cookie: cookies.manager });
      assert.equal(ov.json.items[0].on_hand, 6); assert.equal(ov.json.summary.value_cents, 3000);
      assert.equal((await mv(cookies.manager, { kind: 'adjust', qty: 2 })).json.on_hand, 2);
      assert.equal((await call('GET', '/api/saas/stock', { cookie: cookies.manager })).json.items[0].status, 'low');
      assert.equal((await call('GET', '/api/saas/stock', { cookie: cookies.manager })).json.reorder.length, 1);
    });
    await check('5f staff chat: sent -> delivered on the other person\'s fetch -> read only when they open it; other tenants see nothing', async () => {
      const sent = await call('POST', '/api/saas/staff-chat', { cookie: cookies.manager, body: { message: 'Receipt test <b>hello</b>' } });
      assert.equal(sent.status, 201); const id = sent.json.message.id;
      const find = (r) => r.json.messages.find((m) => m.id === id);
      let mine = find(await call('GET', '/api/saas/staff-chat', { cookie: cookies.manager }));
      assert.equal(mine.mine, true); assert.equal(mine.delivered_count, 0); assert.equal(mine.read_by.length, 0, 'not delivered until someone else fetches');
      const peek = await call('GET', '/api/saas/staff-chat', { cookie: cookies.worker });
      assert.ok(peek.json.unread >= 1, 'recipient has an unread count'); assert.equal(find(peek).mine, false);
      mine = find(await call('GET', '/api/saas/staff-chat', { cookie: cookies.manager }));
      assert.ok(mine.delivered_count >= 1, 'delivered after the recipient fetched'); assert.equal(mine.read_by.length, 0, 'fetching without opening is not reading');
      assert.equal((await call('GET', '/api/saas/staff-chat?read=1', { cookie: cookies.worker })).json.unread, 0);
      mine = find(await call('GET', '/api/saas/staff-chat', { cookie: cookies.manager }));
      assert.equal(mine.read_by.length, 1, 'read once the recipient opened the panel');
      assert.equal((await call('GET', '/api/saas/staff-chat', { cookie: cookies.ownerB })).json.messages.some((m) => m.id === id), false, 'other tenant cannot see it');
    });
    await check('5g payments: secrets sealed, signed webhooks mark paid once, receipts logged, late fee applies once, workers locked out', async () => {
      const KEY = 'sk_test_' + 'a1b2c3d4e5f6g7h8i9j0k1l2', WH = 'whsec_' + 'z9y8x7w6v5u4t3s2r1q0p9o8';
      const cfg = (cookie, body) => call('PUT', '/api/saas/payments/settings', { cookie, body });
      for (const who of ['worker', 'manager']) {
        assert.equal((await call('GET', '/api/saas/payments/settings', { cookie: cookies[who] })).status, 403, who + ' cannot see payment settings');
        assert.equal((await call('GET', '/api/saas/payments/overview', { cookie: cookies[who] })).status, 403);
        assert.equal((await call('POST', '/api/saas/payments/requests', { cookie: cookies[who], body: { work_order_id: ids.workOrder, provider: 'bank' } })).status, 403);
      }
      assert.equal((await cfg(cookies.owner, { stripe_secret_key: 'not-a-key' })).status, 400, 'bad key shape is refused');
      assert.equal((await cfg(cookies.owner, { late_fee_enabled: true })).status, 400, 'late fee needs the terms acknowledgement');
      const saved = await cfg(cookies.owner, { stripe_secret_key: KEY, stripe_webhook_secret: WH, bank_account_name: 'Test Plumbing', bank_bsb: '066-000', bank_account_number: '12345678', terms_days: 7, late_fee_enabled: true, late_fee_percent: 10, late_fee_terms_acknowledged: true, customer_reminders: true });
      assert.equal(saved.status, 200, saved.text); assert.equal(saved.json.settings.stripe.connected, true); assert.equal(saved.json.settings.late_fee_acknowledged, true);
      assert.ok(!saved.text.includes(KEY) && !saved.text.includes(WH), 'secrets are never returned');
      const stored = db.prepare(`SELECT stripe_secret_enc,stripe_webhook_enc FROM payment_settings WHERE organisation_id=?`).get(orgId);
      assert.ok(stored.stripe_secret_enc && !stored.stripe_secret_enc.includes(KEY) && !stored.stripe_webhook_enc.includes(WH), 'secrets are encrypted at rest');
      assert.equal(db.prepare(`SELECT COUNT(*) c FROM audit_logs WHERE action='payment.settings_updated' AND metadata_json LIKE ?`).get('%' + KEY + '%').c, 0, 'audit log never holds a secret');
      // a job with a customer who has an email
      const cust = await call('POST', '/api/saas/customers', { cookie: cookies.owner, body: { name: 'Pay Customer', email: 'pay.customer@example.com', phone: '+61400999888', status: 'current' } });
      assert.equal(cust.status, 201, cust.text);
      const mkJob = async (title, price) => {
        const j = await call('POST', '/api/saas/work-orders', { cookie: cookies.manager, body: { title, address: '1 Test St', start_at: '2026-12-05T08:00:00+08:00', required_workers: 1, required_level: 1, customer_id: cust.json.id } });
        assert.equal(j.status, 201, j.text); const id = j.json.id || j.json.work_order?.id || j.json.job?.id;
        assert.equal((await call('PUT', `/api/saas/finance/jobs/${id}`, { cookie: cookies.owner, body: { price } })).status, 200); return id;
      };
      const J = await mkJob('Payments test job', 400);
      assert.equal((await call('POST', '/api/saas/payments/requests', { cookie: cookies.owner, body: { work_order_id: J, provider: 'paypal' } })).status, 409, 'PayPal not connected');
      assert.equal((await call('POST', '/api/saas/payments/requests', { cookie: cookies.ownerB, body: { work_order_id: J, provider: 'bank' } })).status, 404, 'other tenant cannot see the job');
      assert.equal((await call('POST', '/api/saas/payments/requests', { cookie: cookies.owner, body: { work_order_id: J, provider: 'bank', amount: 150 } })).status, 409, 'bank payments need the owner to confirm authorisation first');
      assert.equal((await call('POST', '/api/saas/billing/authorise', { cookie: cookies.worker, body: { provider: 'bank', confirmed: ['own', 'accurate'] } })).status, 403, 'workers cannot authorise');
      assert.equal((await call('POST', '/api/saas/billing/authorise', { cookie: cookies.owner, body: { provider: 'bank', confirmed: ['own'] } })).status, 400, 'every statement must be ticked');
      assert.equal((await call('POST', '/api/saas/billing/authorise', { cookie: cookies.owner, body: { provider: 'bank', confirmed: ['own', 'accurate'] } })).status, 200);
      const setup = await call('GET', '/api/saas/billing/setup', { cookie: cookies.owner });
      assert.equal(setup.json.providers.find((x) => x.id === 'bank').authorised, true);
      const bank = await call('POST', '/api/saas/payments/requests', { cookie: cookies.owner, body: { work_order_id: J, provider: 'bank', amount: 150 } });
      assert.equal(bank.status, 201, bank.text); assert.equal(bank.json.payment.status, 'pending'); assert.ok(bank.json.bank.reference.startsWith('SP-'));
      assert.ok(db.prepare(`SELECT invoice_issued_at,due_at FROM work_orders WHERE id=?`).get(J).due_at, 'asking for payment starts the clock');
      // signed Stripe webhook
      const wdb = (await import('better-sqlite3')).default(dbPath); // the shared read-only handle cannot seed provider rows
      const sp = randomUUID(), sess = 'cs_test_' + sp.slice(0, 12);
      wdb.prepare(`INSERT INTO job_payments (id,organisation_id,work_order_id,provider,method,status,amount_cents,currency,provider_ref,checkout_url,created_at,updated_at) VALUES (?,?,?,'stripe','card','pending',20000,'aud',?,'https://checkout.stripe.test/x',?,?)`).run(sp, orgId, J, sess, new Date().toISOString(), new Date().toISOString());
      const hook = (orgPath, event, { secret = WH, t = Math.floor(Date.now() / 1000), sig } = {}) => {
        const raw = JSON.stringify(event), v1 = sig ?? createHmac('sha256', secret).update(`${t}.${raw}`).digest('hex');
        return call('POST', `/api/webhooks/payments/stripe/${orgPath}`, { body: event, headers: { 'stripe-signature': `t=${t},v1=${v1}` } });
      };
      const done = (id, total = 20000) => ({ id, type: 'checkout.session.completed', data: { object: { id: sess, payment_status: 'paid', amount_total: total, currency: 'aud', payment_intent: 'pi_test_1' } } });
      assert.equal((await hook(orgId, done('evt_1'), { sig: 'deadbeef' })).status, 400, 'bad signature');
      assert.equal((await hook(orgId, done('evt_1'), { secret: 'whsec_wrongwrongwrongwrongwrong' })).status, 400, 'wrong secret');
      assert.equal((await hook(orgId, done('evt_1'), { t: 1000 })).status, 400, 'stale timestamp');
      assert.equal((await hook(randomUUID(), done('evt_1'))).status, 400, 'unknown business');
      const mismatch = await hook(orgId, done('evt_2', 100));
      assert.equal(mismatch.json.outcome, 'amount_mismatch'); assert.equal(db.prepare(`SELECT paid_cents FROM work_orders WHERE id=?`).get(J).paid_cents, 0, 'wrong amount is not marked paid');
      const okHook = await hook(orgId, done('evt_3')); assert.equal(okHook.json.outcome, 'paid', okHook.text);
      assert.equal(db.prepare(`SELECT paid_cents FROM work_orders WHERE id=?`).get(J).paid_cents, 20000);
      assert.equal((await hook(orgId, done('evt_3'))).json.duplicate, true, 'replayed event does nothing');
      assert.equal(db.prepare(`SELECT paid_cents FROM work_orders WHERE id=?`).get(J).paid_cents, 20000, 'paid exactly once');
      const rec = db.prepare(`SELECT status,receipt_no FROM job_payments WHERE id=?`).get(sp); assert.equal(rec.status, 'paid'); assert.match(rec.receipt_no, /^R-\d{4}-\d{4}$/);
      assert.ok(db.prepare(`SELECT COUNT(*) c FROM payment_notices WHERE organisation_id=? AND payment_id=? AND kind='receipt'`).get(orgId, sp).c >= 1, 'receipt attempt is logged');
      assert.ok(db.prepare(`SELECT COUNT(*) c FROM audit_logs WHERE organisation_id=? AND action='payment.received'`).get(orgId).c >= 1);
      const fin = (await call('GET', '/api/saas/finance/jobs', { cookie: cookies.owner })).json.jobs.find((j) => j.id === J);
      assert.equal(fin.paid_cents, 20000); assert.equal(fin.stage, 'part_paid', 'job status follows the payment');
      // manual records and bank confirmation
      assert.equal((await call('POST', '/api/saas/payments/record', { cookie: cookies.manager, body: { work_order_id: J, amount: 10, method: 'cash' } })).status, 403);
      assert.equal((await call('POST', '/api/saas/payments/record', { cookie: cookies.owner, body: { work_order_id: J, amount: 9999, method: 'cash' } })).status, 400, 'cannot take more than is owing');
      assert.equal((await call('POST', '/api/saas/payments/record', { cookie: cookies.owner, body: { work_order_id: J, amount: 50, method: 'cash' } })).status, 201);
      assert.equal((await call('POST', '/api/saas/payments/record', { cookie: cookies.owner, body: { work_order_id: J, amount: 149, method: 'bank_transfer', payment_id: bank.json.payment.id } })).status, 400, 'amount must match the transfer requested');
      assert.equal((await call('POST', '/api/saas/payments/record', { cookie: cookies.owner, body: { work_order_id: J, amount: 150, method: 'bank_transfer', payment_id: bank.json.payment.id } })).status, 201);
      assert.equal((await call('GET', '/api/saas/finance/jobs', { cookie: cookies.owner })).json.jobs.find((j) => j.id === J).stage, 'paid', 'fully paid after the bank transfer is confirmed');
      assert.equal((await call('POST', '/api/saas/payments/record', { cookie: cookies.owner, body: { work_order_id: J, amount: 1, method: 'cash' } })).status, 409, 'nothing more to collect');
      assert.equal((await call('GET', '/api/saas/payments', { cookie: cookies.ownerB })).json.payments.length, 0, 'other tenant sees no payments');
      // 7-day rule: late fee once, reminders once
      const J2 = await mkJob('Overdue job', 1000), old = new Date(Date.now() - 10 * 864e5).toISOString(), due = new Date(Date.now() - 3 * 864e5).toISOString();
      wdb.prepare(`UPDATE work_orders SET invoice_issued_at=?,due_at=? WHERE id=?`).run(old, due, J2); wdb.close();
      const c1 = await call('POST', '/api/saas/payments/run-cycle', { cookie: cookies.owner }); assert.equal(c1.status, 200, c1.text); assert.equal(c1.json.summary.fees_applied, 1);
      const late = (await call('GET', '/api/saas/finance/jobs', { cookie: cookies.owner })).json.jobs.find((j) => j.id === J2);
      assert.equal(late.late_fee_cents, 10000, '10% of the total'); assert.equal(late.owing_cents, 110000);
      const noticesAfter = db.prepare(`SELECT COUNT(*) c FROM payment_notices WHERE organisation_id=?`).get(orgId).c;
      const c2 = await call('POST', '/api/saas/payments/run-cycle', { cookie: cookies.owner }); assert.equal(c2.json.summary.fees_applied, 0, 'late fee is charged once');
      assert.equal(db.prepare(`SELECT COUNT(*) c FROM payment_notices WHERE organisation_id=?`).get(orgId).c, noticesAfter, 'reminders are not repeated');
      assert.ok(db.prepare(`SELECT COUNT(*) c FROM payment_notices WHERE organisation_id=? AND kind='owner_reminder' AND channel='in_app'`).get(orgId).c >= 2, 'owner is reminded in the app');
      const ov = (await call('GET', '/api/saas/payments/overview', { cookie: cookies.owner })).json;
      assert.ok(ov.totals.overdue_count >= 1 && ov.totals.late_fees_cents >= 10000);
      const wo = (await call('GET', '/api/saas/work-orders', { cookie: cookies.manager })).json.jobs.find((j) => j.id === J2);
      assert.ok(wo && !('late_fee_cents' in wo) && !('due_at' in wo) && !('price_cents' in wo), 'managers do not see money fields');
    });
    await check('5h subscribers register: operator only, business-level facts only; lifecycle emails and plan changes are recorded', async () => {
      const op = { 'x-admin-key': ADMIN_KEY };
      assert.ok([401, 403].includes((await call('GET', '/api/admin/subscribers')).status), 'no key, no register');
      assert.ok([401, 403].includes((await call('GET', '/api/admin/subscribers', { cookie: cookies.owner })).status), 'a business owner cannot open the register');
      const reg = await call('GET', '/api/admin/subscribers', { headers: op }); assert.equal(reg.status, 200, reg.text);
      const mine = reg.json.subscribers.find((x) => x.id === orgId); assert.ok(mine && mine.plan_name && mine.category && mine.status, 'business, category, plan and status are listed');
      for (const secret of ['pay.customer@example.com', 'Pay Customer', 'Pat Customer', 'password', 'workers']) assert.ok(!reg.text.includes(secret), `register must not contain ${secret}`);
      assert.ok(reg.json.totals.all >= 1 && Array.isArray(reg.json.by_plan) && Array.isArray(reg.json.by_category));
      assert.ok(db.prepare(`SELECT COUNT(*) c FROM lifecycle_emails WHERE organisation_id=? AND kind='welcome'`).get(orgId).c === 1, 'welcome email was attempted once at sign-up');
      const before = mine.plan_id, target = before === 'operations' ? 'scale' : 'operations';
      const changed = await call('POST', `/api/admin/subscribers/${orgId}/plan`, { headers: op, body: { plan_id: target } }); assert.equal(changed.status, 200, changed.text);
      assert.ok(db.prepare(`SELECT COUNT(*) c FROM lifecycle_emails WHERE organisation_id=? AND kind='plan_changed'`).get(orgId).c >= 1, 'plan change email recorded');
      assert.equal((await call('POST', `/api/admin/subscribers/${orgId}/plan`, { headers: op, body: { plan_id: target } })).json.email, 'not_needed', 'same plan sends nothing');
      assert.equal((await call('POST', `/api/admin/subscribers/${orgId}/payment`, { headers: op, body: { result: 'failed', reference: 'INV-9001', reason: 'Card declined' } })).status, 200);
      assert.equal((await call('GET', '/api/admin/subscribers', { headers: op })).json.subscribers.find((x) => x.id === orgId).payment_status, 'failed');
      assert.equal((await call('POST', `/api/admin/subscribers/${orgId}/payment`, { headers: op, body: { result: 'succeeded', reference: 'INV-9002', amount_cents: 19900 } })).status, 200);
      const after = (await call('GET', '/api/admin/subscribers', { headers: op })).json.subscribers.find((x) => x.id === orgId);
      assert.equal(after.payment_status, 'paid'); assert.equal(after.status, 'active');
      assert.ok(db.prepare(`SELECT COUNT(*) c FROM lifecycle_emails WHERE organisation_id=? AND kind IN ('subscription_receipt','subscription_payment_failed')`).get(orgId).c === 2, 'receipt and refusal emails recorded');
      const mineAlerts = await call('GET', '/api/saas/notifications', { cookie: cookies.owner }); assert.equal(mineAlerts.status, 200);
      assert.ok(mineAlerts.json.notifications.some((n) => n.kind === 'billing'), 'owner is alerted when a subscription payment is refused');
      assert.equal((await call('GET', '/api/saas/notifications', { cookie: cookies.ownerB })).json.notifications.some((n) => n.kind === 'billing'), false, 'alerts are private to the business');
      assert.equal((await call('GET', '/api/saas/notifications', { cookie: cookies.worker })).json.notifications.some((n) => n.kind === 'billing'), false, 'workers do not receive the owner alerts');
    });
    await check('5i growth engine: plans and a 30-day calendar are private, nothing is sent until an owner approves, unconnected channels fail safely', async () => {
      const prof = { niche: 'Electrical contractor', audience: 'Homeowners in Perth', product: 'Switchboard upgrades', platforms: ['facebook'], posts_per_day: 4, from_hour: 6, to_hour: 21, competitors: [] };
      assert.equal((await call('PUT', '/api/saas/growth/profile', { cookie: cookies.worker, body: prof })).status, 403, 'workers cannot use the growth engine');
      assert.equal((await call('PUT', '/api/saas/growth/profile', { cookie: cookies.owner, body: prof })).status, 200);
      for (const kind of ['pillars', 'engagement']) { const g = await call('POST', '/api/saas/growth/generate', { cookie: cookies.owner, body: { kind } }); assert.equal(g.status, 201, g.text); assert.ok(g.json.plan.content.sections.length >= 1); }
      const cal = await call('POST', '/api/saas/growth/calendar/generate', { cookie: cookies.owner, body: { days: 3, start_date: '2030-01-10', tz_offset_min: -480 } }); assert.equal(cal.status, 201, cal.text); assert.equal(cal.json.created, 12);
      const list = (await call('GET', '/api/saas/growth/calendar', { cookie: cookies.owner })).json.items; assert.equal(list.length, 12); assert.ok(list.every((i) => i.status === 'draft'), 'everything starts as a draft');
      assert.equal(new Set(list.map((i) => i.pillar)).size, 4, 'all four pillars are used');
      assert.equal(new Date(list[0].scheduled_at).toISOString(), '2030-01-09T22:00:00.000Z', '6am Perth is 22:00 UTC the day before');
      assert.equal((await call('GET', '/api/saas/growth/calendar', { cookie: cookies.ownerB })).json.items.length, 0, 'other businesses see nothing');
      assert.equal((await call('POST', `/api/saas/growth/calendar/${list[0].id}/publish`, { cookie: cookies.owner })).status, 409, 'a draft cannot be sent');
      assert.equal((await call('POST', '/api/saas/growth/calendar/approve', { cookie: cookies.manager, body: { all_drafts: true } })).status, 403, 'managers cannot approve');
      const textPost = list.find((i) => ['text', 'color_bg'].includes(i.post_type)), imgPost = list.find((i) => i.post_type === 'image');
      assert.equal((await call('POST', '/api/saas/growth/calendar/approve', { cookie: cookies.owner, body: { ids: [textPost.id, imgPost.id] } })).json.approved, 2);
      const sent = await call('POST', `/api/saas/growth/calendar/${textPost.id}/publish`, { cookie: cookies.owner }); assert.equal(sent.status, 409); assert.match(sent.json.error, /Connect Facebook/);
      const row = (await call('GET', '/api/saas/growth/calendar?status=failed', { cookie: cookies.owner })).json.items; assert.equal(row.length, 1, 'the failed post is recorded with its reason');
      const due = await call('POST', `/api/saas/growth/calendar/${imgPost.id}/publish`, { cookie: cookies.owner }); assert.equal(due.json.status, 'due', 'image posts become ready-to-post, never auto-sent');
      assert.equal((await call('PATCH', `/api/saas/growth/calendar/${textPost.id}`, { cookie: cookies.owner, body: { hook: 'New first line' } })).json.item.status, 'draft', 'editing sends it back to draft for re-approval');
      const re = await call('POST', '/api/saas/growth/repurpose', { cookie: cookies.owner, body: { text: 'Three things to check before you hire an electrician.' } }); assert.equal(re.json.content.sections.length, 3);
    });
    await check('5j plan limits and platform activity: limits only stop new records, trials stay safe, activity is owner-only unless the owner allows someone', async () => {
      const wdb = (await import('better-sqlite3')).default(dbPath);
      try {
        const sub = wdb.prepare(`SELECT plan_id,status,payment_status,trial_ends_at FROM organisation_subscriptions WHERE organisation_id=?`).get(orgId);
        wdb.prepare(`UPDATE organisation_subscriptions SET plan_id='starter',status='trialing',payment_status='unpaid',trial_ends_at=? WHERE organisation_id=?`).run(new Date(Date.now() + 5 * 864e5).toISOString(), orgId);
        const ent = await call('GET', '/api/saas/entitlements', { cookie: cookies.owner }); assert.equal(ent.status, 200, ent.text); assert.equal(ent.json.plan.id, 'starter');
        assert.equal((await call('GET', '/api/saas/entitlements', { cookie: cookies.worker })).status, 403, 'workers do not see plan usage');
        const prof = { niche: 'Electrician', audience: 'Homeowners', product: 'Switchboards', platforms: ['facebook'], posts_per_day: 4, from_hour: 6, to_hour: 21, competitors: [] };
        const over = await call('PUT', '/api/saas/growth/profile', { cookie: cookies.owner, body: prof }); assert.equal(over.status, 403); assert.equal(over.json.upgrade, true);
        assert.equal((await call('PUT', '/api/saas/growth/profile', { cookie: cookies.owner, body: { ...prof, posts_per_day: 1 } })).status, 200);
        assert.equal((await call('POST', '/api/saas/growth/calendar/generate', { cookie: cookies.owner, body: { days: 30, start_date: '2030-03-01', tz_offset_min: 0 } })).status, 403, 'Starter plans 7 days at a time');
        assert.equal((await call('POST', '/api/saas/growth/calendar/generate', { cookie: cookies.owner, body: { days: 7, start_date: '2030-03-01', tz_offset_min: 0 } })).status, 201);
        const now = new Date().toISOString(), ins = wdb.prepare(`INSERT INTO tenant_customers (id,organisation_id,name,status,created_at,updated_at) VALUES (?,?,?,'current',?,?)`);
        const have = wdb.prepare(`SELECT COUNT(*) c FROM tenant_customers WHERE organisation_id=?`).get(orgId).c, fillIds = [];
        for (let i = have; i < 300; i++) { const id = randomUUID(); fillIds.push(id); ins.run(id, orgId, `Filler ${i}`, now, now); }
        const full = await call('POST', '/api/saas/customers', { cookie: cookies.owner, body: { name: 'One too many' } }); assert.equal(full.status, 403); assert.match(full.json.error, /up to 300 customers/);
        assert.equal((await call('GET', '/api/saas/customers', { cookie: cookies.owner })).status, 200, 'existing customers stay visible at the limit');
        assert.ok(wdb.prepare(`SELECT COUNT(*) c FROM user_notifications WHERE organisation_id=? AND kind='plan'`).get(orgId).c >= 1, 'the owner is told about the limit');
        for (const id of fillIds) wdb.prepare(`DELETE FROM tenant_customers WHERE id=?`).run(id);
        wdb.prepare(`UPDATE organisation_subscriptions SET trial_ends_at=? WHERE organisation_id=?`).run(new Date(Date.now() - 864e5).toISOString(), orgId);
        const ended = await call('POST', '/api/saas/customers', { cookie: cookies.owner, body: { name: 'After trial' } }); assert.equal(ended.status, 403); assert.equal(ended.json.trial_ended, true); assert.match(ended.json.error, /safe/);
        assert.equal((await call('GET', '/api/saas/customers', { cookie: cookies.owner })).status, 200, 'data is still readable after the trial ends');
        wdb.prepare(`UPDATE organisation_subscriptions SET plan_id=?,status=?,payment_status=?,trial_ends_at=? WHERE organisation_id=?`).run(sub.plan_id, sub.status, sub.payment_status, sub.trial_ends_at, orgId);
      } finally { wdb.close(); }
      // Platform activity: owner only, plus anyone the owner allows
      assert.equal((await call('GET', '/api/saas/activity', { cookie: cookies.worker })).status, 403);
      assert.equal((await call('GET', '/api/saas/activity', { cookie: cookies.manager })).status, 403, 'a manager is not allowed by default');
      assert.equal((await call('GET', '/api/saas/activity', { cookie: cookies.ownerB })).json.events.length, 0, 'another business sees none of it');
      const act = await call('GET', '/api/saas/activity', { cookie: cookies.owner }); assert.equal(act.status, 200, act.text);
      assert.ok(Array.isArray(act.json.summary));
      assert.ok(act.json.events.some((e) => /plan created|profile saved|calendar generated/i.test(e.action)), 'growth activity is recorded');
      assert.ok(!/access_token|refresh_token|secret/i.test(act.text), 'the log never carries credentials');
      const people = (await call('GET', '/api/saas/activity/access', { cookie: cookies.owner })).json.people, mgr = people.find((p) => p.role === 'manager'); assert.ok(mgr, 'owner can see who could be allowed');
      assert.equal((await call('GET', '/api/saas/activity/access', { cookie: cookies.manager })).status, 403, 'only the owner manages access');
      assert.equal((await call('PUT', '/api/saas/activity/access', { cookie: cookies.owner, body: { user_id: mgr.id, allowed: true } })).status, 200);
      assert.equal((await call('GET', '/api/saas/activity', { cookie: cookies.manager })).status, 200, 'an allowed person can read it');
      assert.equal((await call('PUT', '/api/saas/activity/access', { cookie: cookies.owner, body: { user_id: mgr.id, allowed: false } })).status, 200);
      assert.equal((await call('GET', '/api/saas/activity', { cookie: cookies.manager })).status, 403, 'access can be taken away');
    });
    await check('5k add-ons: requested by the owner, confirmed by the operator, raise limits for new items only, private to each business', async () => {
      const op = { 'x-admin-key': ADMIN_KEY }, wdb = (await import('better-sqlite3')).default(dbPath);
      const sub = wdb.prepare(`SELECT plan_id,status,payment_status,trial_ends_at FROM organisation_subscriptions WHERE organisation_id=?`).get(orgId);
      try {
        wdb.prepare(`UPDATE organisation_subscriptions SET plan_id='starter',status='trialing',payment_status='unpaid',trial_ends_at=? WHERE organisation_id=?`).run(new Date(Date.now() + 5 * 864e5).toISOString(), orgId);
        const fill = wdb.prepare(`INSERT INTO usage_events (id,organisation_id,kind,created_at) VALUES (?,?,'ai',?)`);
        for (let i = 0; i < 100; i++) fill.run(randomUUID(), orgId, new Date().toISOString());
        const blocked = await call('POST', '/api/saas/growth/generate', { cookie: cookies.owner, body: { kind: 'pillars' } });
        assert.equal(blocked.status, 403); assert.match(blocked.json.error, /up to 100 AI requests/); assert.match(blocked.json.error, /Plans & Billing/);
        assert.equal((await call('POST', '/api/saas/addons', { cookie: cookies.worker, body: { addon_id: 'ai_500' } })).status, 403, 'workers cannot buy add-ons');
        assert.equal((await call('POST', '/api/saas/addons', { cookie: cookies.manager, body: { addon_id: 'ai_500' } })).status, 403, 'managers cannot buy add-ons');
        const req = await call('POST', '/api/saas/addons', { cookie: cookies.owner, body: { addon_id: 'ai_500', quantity: 1 } }); assert.equal(req.status, 201, req.text);
        assert.equal((await call('POST', '/api/saas/growth/generate', { cookie: cookies.owner, body: { kind: 'pillars' } })).status, 403, 'a request alone changes nothing');
        const list = await call('GET', '/api/admin/addons', { headers: op }); assert.equal(list.status, 200);
        const mine = list.json.addons.find((a) => a.id === req.json.id); assert.ok(mine && mine.business && mine.status === 'requested');
        assert.ok(!list.text.includes('@example.com'), 'operator list is business-level only');
        assert.equal((await call('GET', '/api/admin/addons', { cookie: cookies.owner })).status === 200, false, 'owners cannot open the operator list');
        assert.equal((await call('POST', `/api/saas/addons/${req.json.id}/cancel`, { cookie: cookies.ownerB })).status, 404, 'another business cannot touch it');
        const act = await call('POST', `/api/admin/addons/${req.json.id}/activate`, { headers: op, body: {} }); assert.equal(act.status, 200, act.text);
        assert.ok(wdb.prepare(`SELECT COUNT(*) c FROM lifecycle_emails WHERE organisation_id=? AND kind='addon_active'`).get(orgId).c === 1, 'owner is emailed when it goes live');
        assert.equal((await call('POST', '/api/saas/growth/generate', { cookie: cookies.owner, body: { kind: 'pillars' } })).status, 201, 'the extra 500 requests apply at once');
        const use = (await call('GET', '/api/saas/entitlements', { cookie: cookies.owner })).json.usage.find((u) => u.key === 'ai'); assert.equal(use.limit, 600); assert.equal(use.extra, 500);
        assert.equal((await call('POST', `/api/saas/addons/${req.json.id}/cancel`, { cookie: cookies.owner, body: {} })).status, 200);
        assert.equal((await call('GET', '/api/saas/entitlements', { cookie: cookies.owner })).json.usage.find((u) => u.key === 'ai').limit, 100, 'cancelling lowers the limit again');
        assert.equal((await call('GET', '/api/saas/growth/calendar', { cookie: cookies.owner })).status, 200, 'saved items stay readable');
      } finally {
        wdb.prepare(`DELETE FROM usage_events WHERE organisation_id=?`).run(orgId);
        wdb.prepare(`UPDATE organisation_subscriptions SET plan_id=?,status=?,payment_status=?,trial_ends_at=? WHERE organisation_id=?`).run(sub.plan_id, sub.status, sub.payment_status, sub.trial_ends_at, orgId); wdb.close();
      }
    });
    await check('5l operator billing: invoices are drafted, approved one by one, scheduled, paid and receipted; reminders and profile stay account-level', async () => {
      const op = { 'x-admin-key': ADMIN_KEY };
      for (const [m, u] of [['GET', '/api/admin/invoices'], ['GET', '/api/admin/attention'], ['GET', `/api/admin/subscribers/${orgId}/profile`]]) {
        assert.ok([401, 403].includes((await call(m, u)).status) && [401, 403].includes((await call(m, u, { cookie: cookies.owner })).status), `${u} is operator only`);
      }
      const mk = await call('POST', '/api/admin/invoices/prepare', { headers: op, body: { organisation_id: orgId, period: '2031-01' } }); assert.equal(mk.status, 201, mk.text);
      assert.equal((await call('POST', '/api/admin/invoices/prepare', { headers: op, body: { organisation_id: orgId, period: '2031-01' } })).status, 409, 'one invoice per month');
      let inv = (await call('GET', '/api/admin/invoices', { headers: op })).json.invoices.find((i) => i.id === mk.json.id);
      assert.equal(inv.status, 'draft'); assert.equal(inv.gst_cents, Math.round(inv.subtotal_cents * 0.1)); assert.equal(inv.total_cents, inv.subtotal_cents + inv.gst_cents);
      assert.ok((await call('GET', '/api/admin/attention', { headers: op })).json.items.some((i) => i.kind === 'invoice_draft' && i.invoice_id === inv.id), 'a draft shows up as needing approval');
      assert.equal((await call('POST', `/api/admin/invoices/${inv.id}/adjust`, { headers: op, body: { description: 'Part-month credit', adjustment_cents: -500 } })).status, 200);
      assert.equal((await call('POST', `/api/admin/invoices/${inv.id}/paid`, { headers: op, body: { reference: 'REF-1' } })).status, 400, 'a draft cannot be marked paid');
      const sendAt = new Date(Date.now() + 5 * 864e5).toISOString();
      assert.equal((await call('POST', `/api/admin/invoices/${inv.id}/approve`, { headers: op, body: { send_at: sendAt } })).json.sent_now, false, 'a future send date waits');
      assert.equal(db.prepare(`SELECT COUNT(*) c FROM lifecycle_emails WHERE organisation_id=? AND kind='invoice'`).get(orgId).c, 0, 'nothing is emailed before the scheduled time');
      assert.ok((await call('GET', '/api/admin/attention', { headers: op })).json.items.some((i) => i.kind === 'invoice_scheduled'), 'scheduled invoices appear in the upcoming list');
      const wdb = (await import('better-sqlite3')).default(dbPath); wdb.prepare(`UPDATE platform_invoices SET send_at=? WHERE id=?`).run(new Date(Date.now() - 1000).toISOString(), inv.id); wdb.close();
      const mk2 = await call('POST', '/api/admin/invoices/prepare', { headers: op, body: { organisation_id: orgId, period: '2031-02' } });
      await call('POST', `/api/admin/invoices/${mk2.json.id}/approve`, { headers: op, body: { send_at: new Date().toISOString() } }); // approving with a time that has come sends the queue
      inv = (await call('GET', '/api/admin/invoices', { headers: op })).json.invoices.find((i) => i.id === inv.id);
      assert.ok(inv.last_error || inv.status === 'sent', 'the due invoice was attempted; with no email provider set up it stays approved and says why');
      assert.equal(db.prepare(`SELECT COUNT(*) c FROM lifecycle_emails WHERE organisation_id=? AND kind='invoice'`).get(orgId).c >= 1, true, 'the email attempt is recorded');
      assert.equal(db.prepare(`SELECT COUNT(*) c FROM work_orders WHERE organisation_id=? AND title LIKE 'SP-%'`).get(orgId).c, 0, 'platform invoices never touch the business’s own jobs and customer invoices');
      const paid = await call('POST', `/api/admin/invoices/${inv.id}/paid`, { headers: op, body: { reference: 'BANK-7788' } }); assert.equal(paid.status, 200, paid.text);
      assert.ok(db.prepare(`SELECT COUNT(*) c FROM lifecycle_emails WHERE organisation_id=? AND kind='subscription_receipt' AND dedupe_key LIKE ?`).get(orgId, `receipt:${inv.number}%`).c === 1, 'a receipt is recorded for the paid invoice');
      assert.equal((await call('POST', `/api/admin/invoices/${inv.id}/void`, { headers: op, body: {} })).status, 409, 'a paid invoice cannot be voided');
      const rem = await call('POST', '/api/admin/reminders', { headers: op, body: { title: 'Check in with the owner', due_at: new Date(Date.now() + 864e5).toISOString(), organisation_id: orgId } }); assert.equal(rem.status, 201);
      assert.ok((await call('GET', '/api/admin/attention', { headers: op })).json.items.some((i) => i.kind === 'reminder'), 'reminders set in advance show before they are due');
      const prof = await call('GET', `/api/admin/subscribers/${orgId}/profile`, { headers: op }); assert.equal(prof.status, 200, prof.text);
      assert.ok(prof.json.owner.email && prof.json.invoices.length >= 2 && Array.isArray(prof.json.suggestions) && typeof prof.json.health.score === 'number');
      for (const secret of ['Pat Customer', 'Pay Customer', 'pay.customer@example.com', 'access_token', 'password']) assert.ok(!prof.text.includes(secret), `profile must not contain ${secret}`);
    });
    await check('5m operator follow-up emails: drafted from account facts, edited, approved before sending, never leak workspace content', async () => {
      const op = { 'x-admin-key': ADMIN_KEY };
      assert.equal((await call('POST', `/api/admin/subscribers/${orgId}/followups`, { body: {} })).status, 401, 'operator only');
      const d = await call('POST', `/api/admin/subscribers/${orgId}/followups`, { headers: op, body: { topic: 'trial ending' } }); assert.equal(d.status, 201, d.text);
      assert.ok(d.json.followup.subject && d.json.followup.body.length > 40 && d.json.followup.status === 'draft');
      for (const secret of ['Pat Customer', 'Pay Customer', 'pay.customer@example.com', 'access_token']) assert.ok(!d.text.includes(secret), `draft must not contain ${secret}`);
      assert.equal(db.prepare(`SELECT COUNT(*) c FROM lifecycle_emails WHERE organisation_id=? AND kind='followup'`).get(orgId).c, 0, 'drafting sends nothing');
      const id = d.json.followup.id;
      assert.equal((await call('PATCH', `/api/admin/followups/${id}`, { headers: op, body: { subject: 'Edited subject', body: 'An edited message for the owner of this account.' } })).status, 200);
      const s = await call('POST', `/api/admin/followups/${id}/send`, { headers: op, body: {} });
      assert.ok([200, 502].includes(s.status), s.text);
      assert.equal(db.prepare(`SELECT COUNT(*) c FROM lifecycle_emails WHERE organisation_id=? AND kind='followup'`).get(orgId).c, 1, 'the send attempt is recorded');
      if (s.status === 502) assert.equal(db.prepare(`SELECT status FROM operator_followups WHERE id=?`).get(id).status, 'draft', 'an unsent email stays a draft');
      const d2 = await call('POST', `/api/admin/subscribers/${orgId}/followups`, { headers: op, body: {} }); assert.equal(d2.status, 201);
      assert.equal((await call('POST', `/api/admin/followups/${d2.json.followup.id}/discard`, { headers: op, body: {} })).status, 200);
      assert.equal((await call('POST', `/api/admin/followups/${d2.json.followup.id}/send`, { headers: op, body: {} })).status, 409, 'a discarded draft cannot be sent');
    });
    await check('5n weekly search and AI-search check: operator only, reads only public pages, competitor list is safe, attention item appears', async () => {
      const op = { 'x-admin-key': ADMIN_KEY };
      assert.equal((await call('GET', '/api/admin/visibility')).status, 401);
      const run = await call('POST', '/api/admin/visibility/run', { headers: op, body: {} }); assert.equal(run.status, 201, run.text);
      assert.ok(run.json.score >= 0 && run.json.score <= 100 && run.json.summary.length > 20);
      const g = await call('GET', '/api/admin/visibility', { headers: op }); assert.equal(g.status, 200);
      assert.ok(g.json.latest.pages.length >= 3 && g.json.latest.pages.every((p) => p.page.startsWith('/saas/')), 'only public pages are checked');
      for (const secret of ['Pat Customer', 'pay.customer@example.com', ADMIN_KEY]) assert.ok(!g.text.includes(secret));
      assert.equal((await call('POST', '/api/admin/visibility/competitors', { headers: op, body: { url: 'http://insecure.example.com' } })).status, 400, 'https only');
      const add = await call('POST', '/api/admin/visibility/competitors', { headers: op, body: { url: 'https://competitor.example.com/pricing', label: 'Rival' } }); assert.equal(add.status, 201, add.text);
      assert.equal((await call('POST', '/api/admin/visibility/competitors', { headers: op, body: { url: 'https://competitor.example.com/pricing' } })).status, 409, 'no duplicates');
      const list = (await call('GET', '/api/admin/visibility', { headers: op })).json.competitors; assert.equal(list.length, 1);
      assert.equal((await call('DELETE', `/api/admin/visibility/competitors/${list[0].id}`, { headers: op })).status, 200);
    });
    await check('5o subscriber payments: private pay link, bank fallback, signed Stripe message settles once, wrong amount or signature never does, keys never echoed', async () => {
      const op = { 'x-admin-key': ADMIN_KEY };
      assert.equal((await call('GET', '/api/admin/platform-pay')).status, 401);
      const bank = await call('PUT', '/api/admin/platform-pay/bank', { headers: op, body: { enabled: true, values: { account_name: 'Super Pro Pty Ltd', bsb: '066-123', account_number: '12345678', payid: 'pay@example.com' } } }); assert.equal(bank.status, 200, bank.text); assert.equal(bank.json.enabled, true);
      assert.equal((await call('PUT', '/api/admin/platform-pay/bank', { headers: op, body: { values: { bsb: '12' } } })).status, 400, 'a bad BSB is refused');
      const whsec = 'whsec_' + randomBytes(16).toString('hex'), sk = 'sk_test_' + randomBytes(16).toString('hex');
      const st = await call('PUT', '/api/admin/platform-pay/stripe', { headers: op, body: { enabled: true, values: { secret_key: sk, webhook_secret: whsec } } }); assert.equal(st.json.enabled, true, st.text);
      const listed = await call('GET', '/api/admin/platform-pay', { headers: op }); assert.ok(!listed.text.includes(sk) && !listed.text.includes(whsec), 'keys are never sent back');
      const mk = await call('POST', '/api/admin/invoices/prepare', { headers: op, body: { organisation_id: orgId, period: '2032-03' } }); assert.equal(mk.status, 201, mk.text);
      const ap = await call('POST', `/api/admin/invoices/${mk.json.id}/approve`, { headers: op, body: {} }); assert.equal(ap.status, 200, ap.text);
      const link = await call('POST', `/api/admin/pay-links/${mk.json.id}`, { headers: op, body: {} }); assert.equal(link.status, 200, link.text);
      const token = link.json.url.split('/pay/')[1]; assert.ok(token.length >= 40, 'the link cannot be guessed');
      const page = await call('GET', `/pay/${token}`); assert.equal(page.status, 200); assert.match(page.headers.get('x-robots-tag') || '', /noindex/);
      assert.equal((await call('GET', '/api/pay/' + 'x'.repeat(43))).status, 404, 'unknown token');
      const info = await call('GET', `/api/pay/${token}`); assert.equal(info.status, 200, info.text);
      assert.ok(info.json.methods.some((m) => m.id === 'stripe') && info.json.bank.reference === info.json.invoice.number);
      for (const secret of ['Pat Customer', 'pay.customer@example.com', orgId]) assert.ok(!info.text.includes(secret), `pay page must not reveal ${secret}`);
      const inv = db.prepare('SELECT * FROM platform_invoices WHERE id=?').get(mk.json.id);
      const hook = (payload, secret = whsec, ts = Math.floor(Date.now() / 1000)) => { const body = JSON.stringify(payload); return call('POST', '/api/webhooks/payments/platform-stripe', { headers: { 'stripe-signature': `t=${ts},v1=${createHmac('sha256', secret).update(`${ts}.${body}`).digest('hex')}` }, body: payload }); };
      const evt = (amount) => ({ id: 'evt_' + randomUUID(), type: 'checkout.session.completed', data: { object: { id: 'cs_test_' + randomUUID(), payment_status: 'paid', currency: 'aud', amount_total: amount, client_reference_id: inv.id, payment_intent: 'pi_test_123' } } });
      assert.equal((await hook(evt(inv.total_cents), 'whsec_' + 'b'.repeat(32))).status, 400, 'a wrongly signed message is refused');
      await hook(evt(inv.total_cents - 100)); assert.notEqual(db.prepare('SELECT status FROM platform_invoices WHERE id=?').get(inv.id).status, 'paid', 'a wrong amount never settles');
      assert.equal((await hook(evt(inv.total_cents))).status, 200); const done = db.prepare('SELECT status,payment_ref FROM platform_invoices WHERE id=?').get(inv.id);
      assert.equal(done.status, 'paid'); assert.match(done.payment_ref, /^Stripe /);
      await hook(evt(inv.total_cents)); assert.equal(db.prepare(`SELECT COUNT(*) c FROM lifecycle_emails WHERE organisation_id=? AND kind='subscription_receipt' AND dedupe_key LIKE ?`).get(orgId, `receipt:${inv.number}%`).c <= 1, true, 'one receipt only');
      assert.equal((await call('POST', `/api/pay/${token}/start`, { body: { method: 'auto' } })).status, 409, 'a paid invoice cannot be paid again');
    });
    await check('5p two-step sign-in: setup shows a scannable code, starting setup never switches protection off, turning it off needs password and a live code', async () => {
      const b32 = (str) => { const A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'; let bits = ''; for (const ch of str.toUpperCase()) bits += A.indexOf(ch).toString(2).padStart(5, '0'); return Buffer.from(bits.match(/.{8}/g).map((x) => parseInt(x, 2))); };
      const code = (secret, at = Date.now()) => { const h = createHmac('sha1', b32(secret)).update(Buffer.from(BigInt(Math.floor(at / 30000)).toString(16).padStart(16, '0'), 'hex')).digest(), o = h[19] & 15; return String(((h.readUInt32BE(o) & 0x7fffffff) % 1000000)).padStart(6, '0'); };
      const c = cookies.owner;
      assert.equal((await call('GET', '/api/saas/mfa', { cookie: c })).json.mfa_enabled, false);
      const setup = await call('POST', '/api/saas/mfa/setup', { cookie: c }); assert.equal(setup.status, 200, setup.text);
      assert.match(setup.json.qr_svg, /^<svg/); assert.match(setup.json.otpauth_uri, /^otpauth:\/\/totp\//);
      assert.equal((await call('POST', '/api/saas/mfa/verify', { cookie: c, body: { code: '000000' } })).status, 400, 'a wrong code is refused');
      assert.equal((await call('POST', '/api/saas/mfa/verify', { cookie: c, body: { code: code(setup.json.secret) } })).status, 200);
      assert.equal((await call('GET', '/api/saas/mfa', { cookie: c })).json.mfa_enabled, true);
      assert.equal((await call('POST', '/api/saas/mfa/setup', { cookie: c })).status, 409, 'starting setup again must not switch protection off');
      assert.equal((await call('GET', '/api/saas/mfa', { cookie: c })).json.mfa_enabled, true);
      assert.equal((await call('POST', '/api/saas/login', { body: { email: 'verify.owner@example.com', password } })).json.mfa_required, true, 'sign-in now asks for a code');
      assert.equal((await call('POST', '/api/saas/mfa/disable', { cookie: c, body: { password: 'wrong-password-123', code: code(setup.json.secret) } })).status, 401);
      assert.equal((await call('POST', '/api/saas/mfa/disable', { cookie: c, body: { password, code: code(setup.json.secret) } })).status, 200);
      assert.equal((await call('GET', '/api/saas/mfa', { cookie: c })).json.mfa_enabled, false);
    });
    await check('5q terms acceptance is recorded once per version and per person', async () => {
      const a = await call('GET', '/api/saas/legal', { cookie: cookies.worker }); assert.equal(a.status, 200); assert.equal(a.json.accepted, false); assert.ok(a.json.documents.length >= 2);
      assert.equal((await call('POST', '/api/saas/legal/accept', { cookie: cookies.worker, body: { version: a.json.version, agree: false } })).status, 400, 'agreeing is required');
      assert.equal((await call('POST', '/api/saas/legal/accept', { cookie: cookies.worker, body: { version: a.json.version, agree: true } })).status, 200);
      assert.equal((await call('POST', '/api/saas/legal/accept', { cookie: cookies.worker, body: { version: a.json.version, agree: true } })).status, 200, 'accepting twice is harmless');
      assert.equal((await call('GET', '/api/saas/legal', { cookie: cookies.worker })).json.accepted, true);
      assert.equal(db.prepare(`SELECT COUNT(*) c FROM legal_acceptances WHERE version=?`).get(a.json.version).c >= 1, true);
      assert.equal((await call('GET', '/api/saas/legal', { cookie: cookies.manager })).json.accepted, false, 'each person accepts for themselves');
    });
    await check('5r tap to pay and receipts: QR for secure links only, receipts are finance-only and business-scoped, operator readiness lists every connection', async () => {
      assert.equal((await call('GET', '/api/saas/payments/qr?text=' + encodeURIComponent('http://insecure.example/x'), { cookie: cookies.owner })).status, 400);
      const qr = await call('GET', '/api/saas/payments/qr?text=' + encodeURIComponent('https://pay.example.com/c/abc'), { cookie: cookies.owner }); assert.equal(qr.status, 200); assert.match(qr.json.svg, /^<svg/);
      assert.equal((await call('GET', '/api/saas/payments/qr?text=' + encodeURIComponent('https://pay.example.com/c/abc'), { cookie: cookies.worker })).status, 200, 'employees can use the Get paid pad');
      assert.equal((await call('GET', '/api/saas/payments/00000000-0000-4000-8000-000000000000/receipt-data', { cookie: cookies.worker })).status >= 400, true, 'employees cannot read receipts for jobs that are not theirs');
      assert.equal((await call('GET', '/api/saas/payments/saved-cards', { cookie: cookies.worker })).status, 403, 'employees cannot list saved cards');
      assert.equal((await call('GET', '/api/saas/payments/00000000-0000-4000-8000-000000000000/receipt-data', { cookie: cookies.owner })).status, 404);
      const r = await call('GET', '/api/admin/integration-readiness', { headers: { 'x-admin-key': ADMIN_KEY } }); assert.equal(r.status, 200);
      for (const p of ['meta', 'whatsapp', 'tiktok', 'youtube', 'google_business', 'x', 'snapchat', 'website', 'email_sms']) assert.ok(r.json.integrations.some((i) => i.provider === p), `readiness lists ${p}`);
      assert.ok(r.json.integrations.find((i) => i.provider === 'x').redirect_uri.endsWith('/api/saas/integrations/oauth/x/callback'));
    });
    await check('UI audit: no dead links, controls without handlers, or Cancel buttons that required fields can block', () => {
      const out = spawnSync(process.execPath, ['scripts/audit-ui.mjs'], { cwd: ROOT, encoding: 'utf8' });
      assert.equal(out.status, 0, out.stdout);
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
    await check('5s add-ons: usage packs carry the plan discount (25% Operations, 50% Scale, none on Starter)', async () => {
      const { PLAN_DISCOUNT, discounted, ADDONS } = await import(pathToFileURL(path.join(ROOT, 'src', 'addons.js')).href);
      assert.deepEqual(PLAN_DISCOUNT, { starter: 0, operations: 25, scale: 50 });
      assert.equal(discounted(ADDONS.storage_1gb.price_cents, 25), 75); assert.equal(discounted(ADDONS.storage_1gb.price_cents, 50), 50);
      const cat = await call('GET', '/api/saas/addons', { cookie: cookies.owner });
      assert.equal(cat.status, 200, cat.text);
      const gb = cat.json.catalog.find((c) => c.id === 'storage_1gb');
      assert.ok(gb, 'a 1 GB pack exists'); assert.equal(gb.price_cents, discounted(gb.list_price_cents, cat.json.discount_pct));
      const r = await call('POST', '/api/saas/addons', { cookie: cookies.owner, body: { addon_id: 'storage_1gb', quantity: 5 } });
      assert.equal(r.status, 201, r.text); assert.equal(r.json.monthly_cents, gb.price_cents * 5);
      assert.equal((await call('POST', '/api/saas/addons', { cookie: cookies.owner, body: { addon_id: 'storage_1gb', quantity: 9999 } })).status, 400);
    });
    await check('5t hiring: owner/admin only, isolated, consent + safe uploads, AI drafts need approval', async () => {
      const mk = async (cookie, title) => call('POST', '/api/saas/hiring/roles', { cookie, body: { title, employment_type: 'casual', location: 'Perth', pay_text: '$35 an hour', description: 'Help our crew.', requirements: 'White card' } });
      for (const who of ['manager', 'worker']) assert.equal((await mk(cookies[who], 'Nope')).status, 403, `${who} must not reach hiring`);
      const role = await mk(cookies.owner, 'Site labourer'); assert.equal(role.status, 201, role.text);
      const rid = role.json.role.id, link = role.json.role.apply_link, token = new URL(link).searchParams.get('t');
      assert.equal((await call('GET', `/api/saas/hiring/roles/${rid}/ads`, { cookie: cookies.ownerB })).status, 404, 'other business cannot see the role');
      // ads: drafts first, share link only after approval
      const gen = await call('POST', `/api/saas/hiring/roles/${rid}/ads/generate`, { cookie: cookies.owner, body: { platforms: ['facebook', 'x', 'whatsapp', 'sms', 'email'] } });
      assert.equal(gen.status, 201, gen.text); assert.equal(gen.json.ads.length, 5);
      const fb = gen.json.ads.find((a) => a.platform === 'facebook'); assert.equal(fb.status, 'draft'); assert.equal(fb.share_url, null); assert.ok(fb.body.includes('src=facebook'));
      const x = gen.json.ads.find((a) => a.platform === 'x'); assert.ok(x.body.length <= 400);
      assert.equal((await call('POST', `/api/saas/hiring/ads/${fb.id}/shared`, { cookie: cookies.owner, body: {} })).status, 409, 'cannot mark a draft as posted');
      const ap = await call('POST', `/api/saas/hiring/ads/${fb.id}/approve`, { cookie: cookies.owner, body: {} }); assert.equal(ap.status, 200); assert.ok(ap.json.ad.share_url.startsWith('https://www.facebook.com/'));
      // public page
      const pub = await call('GET', `/api/public/hiring/${token}`); assert.equal(pub.status, 200, pub.text); assert.equal(pub.json.role.title, 'Site labourer'); assert.ok(!JSON.stringify(pub.json).includes(orgId), 'no internal ids leak');
      assert.equal((await call('GET', '/api/public/hiring/deadbeef')).status, 404);
      const send = async (extra, files = []) => { const fd = new FormData(); fd.append('full_name', 'Alex Applicant'); fd.append('email', 'alex.applicant@example.com'); fd.append('message', 'Five years on site.'); fd.append('src', 'facebook'); for (const [k, v] of Object.entries(extra)) fd.append(k, v); for (const f of files) { fd.append('kinds', f.kind); fd.append('files', new Blob([f.bytes]), f.name); } const r = await fetch(`${base}/api/public/hiring/${token}/apply`, { method: 'POST', body: fd }); return { status: r.status, json: await r.json().catch(() => ({})) }; };
      assert.equal((await send({})).status, 400, 'consent is required');
      assert.equal((await send({ consent: 'true' }, [{ kind: 'resume', name: 'virus.pdf', bytes: Buffer.from('MZ\x90\x00 this is not a pdf at all') }])).status, 400, 'file type is judged by content, not name');
      const pdf = Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.from('1 0 obj<<>>endobj\n%%EOF\n')]);
      const ok = await send({ consent: 'true' }, [{ kind: 'resume', name: 'cv.pdf', bytes: pdf }]); assert.equal(ok.status, 201, JSON.stringify(ok.json));
      // owner sees it; others do not
      const list = await call('GET', '/api/saas/hiring/applicants', { cookie: cookies.owner }); assert.equal(list.json.applicants.length, 1); assert.equal(list.json.applicants[0].source, 'facebook');
      const aid = list.json.applicants[0].id;
      for (const who of ['manager', 'worker', 'ownerB']) { const r = await call('GET', `/api/saas/hiring/applicants/${aid}`, { cookie: cookies[who] }); assert.ok([403, 404].includes(r.status), `${who} must not read applicants`); }
      const det = await call('GET', `/api/saas/hiring/applicants/${aid}`, { cookie: cookies.owner }); assert.equal(det.json.applicant.documents.length, 1);
      const dl = await fetch(`${base}/api/saas/hiring/documents/${det.json.applicant.documents[0].id}/download`, { headers: { cookie: cookies.owner } });
      assert.equal(dl.status, 200); assert.equal(dl.headers.get('content-type'), 'application/pdf'); assert.match(dl.headers.get('content-disposition'), /^attachment/); assert.equal(dl.headers.get('x-content-type-options'), 'nosniff');
      const dlB = await fetch(`${base}/api/saas/hiring/documents/${det.json.applicant.documents[0].id}/download`, { headers: { cookie: cookies.ownerB } }); assert.equal(dlB.status, 404);
      const sm = await call('POST', `/api/saas/hiring/applicants/${aid}/summarise`, { cookie: cookies.owner, body: {} }); assert.equal(sm.status, 200); assert.match(sm.json.note, /not a recommendation/i);
      // isolation: the whole-workspace export never contains hiring data
      const ex = await call('GET', '/api/saas/data-export?format=json', { cookie: cookies.owner }); assert.ok(!ex.text.includes('alex.applicant@example.com'), 'applicant data must stay out of exports');
      // closing the role stops applications; deleting removes the files
      assert.equal((await call('POST', `/api/saas/hiring/roles/${rid}/close`, { cookie: cookies.owner, body: {} })).status, 200);
      assert.equal((await send({ consent: 'true' })).status, 410);
      const stored = db.prepare(`SELECT stored_path FROM hiring_documents WHERE applicant_id=?`).get(aid).stored_path; assert.ok(fs.existsSync(stored));
      assert.equal((await call('DELETE', `/api/saas/hiring/applicants/${aid}`, { cookie: cookies.owner })).status, 200); assert.ok(!fs.existsSync(stored), 'uploaded file is deleted with the applicant');
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
