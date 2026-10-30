import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { assertIsolatedPreview } from '../src/preview-preflight.js';

const safe = () => ({ SUPERPRO_ISOLATED_PREVIEW: '1', DATABASE_PATH: '/tmp/superpro-preview/app.sqlite', UPLOAD_DIR: '/tmp/superpro-preview/uploads', PREVIEW_BUSINESS_PASSWORD: 'synthetic-preview-password-only' });
const forbidden = ['BACKUP_S3_BUCKET','AWS_S3_BUCKET','BACKUP_FILE_DIR','AWS_ACCESS_KEY_ID','AWS_SECRET_ACCESS_KEY','AWS_SESSION_TOKEN','AWS_PROFILE','AWS_SHARED_CREDENTIALS_FILE','AWS_CONTAINER_CREDENTIALS_RELATIVE_URI','CUSTOM_S3_ACCESS','BACKUP_S3_ENDPOINT','RESEND_API_KEY','TELNYX_API_KEY','STRIPE_SECRET_KEY','GEMINI_API_KEY','GOOGLE_AI_API_KEY','OPENAI_API_KEY','AI_PROVIDER_API_KEY','AI_CHECKER_API_KEY','AI_TTS_API_KEY','WHATSAPP_ACCESS_TOKEN','META_APP_SECRET','SMTP_HOST','SMTP_PASSWORD','GOOGLE_CLIENT_SECRET','WEBSITE_API_KEY','GOOGLE_APPLICATION_CREDENTIALS'];

test('preview rejects storage and provider credentials without leaking values', () => {
  for (const key of forbidden) {
    const env = { ...safe(), [key]: 'secret-fixture-never-print', BACKUP_DISABLED: '1' };
    assert.throws(() => assertIsolatedPreview(env), (error) => !error.message.includes(env[key]) && /unsafe/.test(error.message), key);
  }
});
test('preview paths and password fail closed; production behavior is preserved', () => {
  for (const key of ['DATABASE_PATH','UPLOAD_DIR']) {
    for (const value of ['', 'data/app.sqlite', '/var/data/app.sqlite', '/tmp/../var/data/app.sqlite']) assert.throws(() => assertIsolatedPreview({ ...safe(), [key]: value }));
  }
  for (const value of ['1','true','yes','on',' TRUE ']) assert.throws(() => assertIsolatedPreview({ ...safe(), REQUIRE_PERSISTENT_DISK: value }));
  assert.throws(() => assertIsolatedPreview({ ...safe(), PREVIEW_BUSINESS_PASSWORD: 'short' }));
  const prod = { BACKUP_S3_BUCKET: 'production', AWS_ACCESS_KEY_ID: 'fixture', DATABASE_PATH: '/var/data/app.sqlite' };
  const before = { ...prod }; assertIsolatedPreview(prod); assert.deepEqual(prod, before);
  const env = safe(); assertIsolatedPreview(env); assert.equal(env.SUPERPRO_SKIP_DOTENV, '1');
});
test('preview rejects symlink escape from ephemeral storage', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'preflight-link-'));
  try { fs.symlinkSync('/var', path.join(dir, 'escape')); assert.throws(() => assertIsolatedPreview({ ...safe(), UPLOAD_DIR: path.join(dir, 'escape', 'uploads') }), /symlink/); }
  finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
test('real startup aborts before application imports, backup access or child processes', () => {
  for (const key of forbidden) for (const entry of ['scripts/start.mjs', 'src/server.js']) {
    // No inherited environment or network credentials; all values are synthetic.
    const r = spawnSync(process.execPath, [entry], { env: { ...safe(), [key]: 'synthetic-forbidden' }, encoding: 'utf8', timeout: 5000 });
    assert.equal(r.status, 1, key); assert.match(r.stderr, /startup aborted before backup access/, key);
    assert.doesNotMatch(r.stdout + r.stderr, /synthetic-forbidden|\[backup\]|ERR_MODULE_NOT_FOUND/);
  }
});
test('safe startup reaches only the server and suppresses dotenv, unsafe startup never imports storage', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'preflight-start-'));
  try {
    fs.mkdirSync(path.join(dir, 'scripts')); fs.mkdirSync(path.join(dir, 'src'));
    fs.writeFileSync(path.join(dir, 'package.json'), '{"type":"module"}');
    fs.copyFileSync('scripts/start.mjs', path.join(dir, 'scripts/start.mjs'));
    fs.copyFileSync('src/preview-preflight.js', path.join(dir, 'src/preview-preflight.js'));
    fs.writeFileSync(path.join(dir, 'src/diagnostics.js'), 'export function prepareStorage(){ throw Error("STORAGE_TOUCHED"); }');
    fs.writeFileSync(path.join(dir, 'src/s3-files.js'), 'export function makeClient(){ throw Error("S3_TOUCHED"); } export const restoreUploads=makeClient;');
    fs.writeFileSync(path.join(dir, 'src/backup-env.js'), 'export const backupBucket=()=>""; export const applyBackupEnv=()=>({}); export const awsVariableNames=()=>[];');
    fs.writeFileSync(path.join(dir, 'src/server.js'), 'if(process.env.SUPERPRO_SKIP_DOTENV!=="1") throw Error("DOTENV_ENABLED"); console.log("SAFE_SERVER_REACHED");');
    const run = (env) => spawnSync(process.execPath, [path.join(dir, 'scripts/start.mjs')], { env, encoding: 'utf8', timeout: 5000 });
    const good = run(safe()); assert.equal(good.status, 0, good.stderr); assert.match(good.stdout, /SAFE_SERVER_REACHED/);
    fs.writeFileSync(path.join(dir, 'src/diagnostics.js'), 'throw Error("STORAGE_IMPORTED_BEFORE_GUARD");');
    const bad = run({ ...safe(), BACKUP_S3_BUCKET: 'synthetic' });
    assert.equal(bad.status, 1); assert.match(bad.stderr, /startup aborted before backup access/); assert.doesNotMatch(bad.stderr, /STORAGE_IMPORTED/);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
test('safe real preview starts on synthetic storage and serves health without providers', async () => {
  const { spawn } = await import('node:child_process');
  const { randomBytes } = await import('node:crypto');
  const net = await import('node:net');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'preflight-live-'));
  const socket = net.createServer();
  await new Promise((resolve) => socket.listen(0, '127.0.0.1', resolve));
  const port = socket.address().port;
  await new Promise((resolve) => socket.close(resolve));
  const secret = () => randomBytes(32).toString('hex');
  const child = spawn(process.execPath, ['scripts/start.mjs'], { env: {
    ...safe(), NODE_ENV: 'test', PORT: String(port), PUBLIC_BASE_URL: `http://127.0.0.1:${port}`,
    DATABASE_PATH: path.join(dir, 'preview.sqlite'), UPLOAD_DIR: path.join(dir, 'uploads'),
    ADMIN_API_KEY: secret(), SESSION_SECRET: secret(), SAAS_SESSION_SECRET: secret(),
    ADMIN_SESSION_SECRET: secret(), INTEGRATION_ENCRYPTION_KEY: secret(),
  }, stdio: ['ignore','pipe','pipe'] });
  let log = ''; child.stdout.on('data', (b) => log += b); child.stderr.on('data', (b) => log += b);
  const exited = new Promise((resolve) => child.once('exit', resolve));
  try {
    let ready = false;
    for (let i = 0; i < 100; i++) {
      assert.equal(child.exitCode, null, log);
      try { ready = (await fetch(`http://127.0.0.1:${port}/healthz`)).ok; } catch {}
      if (ready) break;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    assert.ok(ready, 'preview health must pass');
    assert.ok(fs.existsSync(path.join(dir, 'preview.sqlite')));
    assert.doesNotMatch(log, /\[backup\]|AccessDenied|Could not restore/);
  } finally {
    if (child.exitCode === null) child.kill('SIGTERM');
    await exited;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
