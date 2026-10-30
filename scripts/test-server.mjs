// Starts the real server on a free port with a throwaway database and synthetic secrets, for live security tests.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const freePort = () => new Promise((resolve, reject) => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const { port } = s.address(); s.close(() => resolve(port)); }); s.on('error', reject); });

export async function startServer(extraEnv = {}) {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-tenant-'));
  const port = await freePort(), base = `http://127.0.0.1:${port}`, dbPath = path.join(temp, 'db.sqlite');
  const adminKey = 'admin-' + randomBytes(16).toString('hex');
  const child = spawn(process.execPath, ['src/server.js'], {
    cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      PATH: process.env.PATH, HOME: temp, SUPERPRO_SKIP_DOTENV: '1', PORT: String(port), NODE_ENV: 'test', PUBLIC_BASE_URL: base, ALLOWED_ORIGINS: base,
      DATABASE_PATH: dbPath, UPLOAD_DIR: path.join(temp, 'uploads'), ADMIN_API_KEY: adminKey,
      SESSION_SECRET: randomBytes(24).toString('hex'), SAAS_SESSION_SECRET: randomBytes(24).toString('hex'), ADMIN_SESSION_SECRET: randomBytes(24).toString('hex'),
      INTEGRATION_ENCRYPTION_KEY: randomBytes(32).toString('hex'), FREE_AI_MODE: '0', ...extraEnv
    }
  });
  let log = ''; child.stdout.on('data', (b) => { log += b; }); child.stderr.on('data', (b) => { log += b; });
  let up = false;
  for (let i = 0; i < 150 && !up; i++) {
    if (child.exitCode !== null) throw new Error('server exited:\n' + log.slice(-1500));
    try { up = (await fetch(base + '/healthz')).ok; } catch { await sleep(150); }
  }
  if (!up) throw new Error('server not healthy:\n' + log.slice(-1500));
  const call = async (method, url, { cookie, body, headers = {} } = {}) => {
    const r = await fetch(base + url, { method, redirect: 'manual', headers: { origin: base, ...(cookie ? { cookie } : {}), ...(body !== undefined ? { 'content-type': 'application/json' } : {}), ...headers }, body: body === undefined ? undefined : JSON.stringify(body) });
    const text = await r.text(); let json = null; try { json = JSON.parse(text); } catch { /* not JSON */ }
    return { status: r.status, json, text };
  };
  const stop = async () => { child.kill('SIGTERM'); await Promise.race([new Promise((r) => child.once('exit', r)), sleep(3000)]); fs.rmSync(temp, { recursive: true, force: true }); };
  return { base, call, stop, dbPath, adminKey, temp, log: () => log };
}

