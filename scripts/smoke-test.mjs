import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const port = Number(process.env.SMOKE_PORT || 3199);
const base = `http://127.0.0.1:${port}`;
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'superpro-smoke-'));
const child = spawn(process.execPath, ['src/server.js'], {
  cwd: process.cwd(),
  env: {
    ...process.env,
    PORT: String(port),
    NODE_ENV: 'test',
    PUBLIC_BASE_URL: base,
    ALLOWED_ORIGINS: base,
    DATABASE_PATH: path.join(tempRoot, 'smoke.sqlite'),
    UPLOAD_DIR: path.join(tempRoot, 'uploads'),
    SAAS_VERIFICATION_TEST_MODE: '0'
  },
  stdio: ['ignore', 'pipe', 'pipe']
});

let output = '';
child.stdout.on('data', b => { output += b.toString(); });
child.stderr.on('data', b => { output += b.toString(); });

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function waitForHealth() {
  for (let i = 0; i < 40; i++) {
    if (child.exitCode !== null) throw new Error(`Server exited before health check.\n${output}`);
    try {
      const r = await fetch(`${base}/healthz`);
      if (r.status === 200) return;
    } catch {}
    await sleep(250);
  }
  throw new Error(`Timed out waiting for /healthz.\n${output}`);
}
async function expect(pathname, expected) {
  const r = await fetch(`${base}${pathname}`, { redirect: 'manual' });
  if (r.status !== expected) throw new Error(`${pathname}: expected HTTP ${expected}, received ${r.status}`);
}

let failed = null;
try {
  await waitForHealth();
  await expect('/healthz', 200);
  await expect('/saas/', 200);
  await expect('/saas/workspace', 200);
  await expect('/office/', 200);
  await expect('/api/product-guide/status', 200);
  await expect('/api/saas/ai/status', 401);
  console.log('RUNTIME SMOKE TEST PASSED: server booted and core public/protected routes returned expected status codes.');
} catch (err) {
  failed = err;
  console.error('RUNTIME SMOKE TEST FAILED');
  console.error(err?.stack || err);
  if (output) console.error('\n--- server output ---\n' + output.slice(-12000));
} finally {
  if (child.exitCode === null) child.kill('SIGTERM');
  await Promise.race([
    new Promise(resolve => child.once('exit', resolve)),
    sleep(1500)
  ]).catch(() => {});
  if (child.exitCode === null) child.kill('SIGKILL');
  fs.rmSync(tempRoot, { recursive: true, force: true });
}
if (failed) process.exit(1);
