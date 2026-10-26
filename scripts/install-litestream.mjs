// Downloads the Litestream backup tool on the Render build (Linux only). Never fails the install: start.mjs reports a clear error if it is needed but missing.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
const env = process.env, VERSION = '0.3.13';
const wanted = env.INSTALL_LITESTREAM === '1' || env.RENDER || env.BACKUP_S3_BUCKET;
if (process.platform !== 'linux' || !wanted) process.exit(0);
const arch = process.arch === 'arm64' ? 'arm64' : process.arch === 'x64' ? 'amd64' : '';
if (!arch) process.exit(0);
const dir = path.resolve('bin'), bin = path.join(dir, 'litestream');
if (fs.existsSync(bin)) process.exit(0);
try {
  fs.mkdirSync(dir, { recursive: true });
  const url = `https://github.com/benbjohnson/litestream/releases/download/v${VERSION}/litestream-v${VERSION}-linux-${arch}.tar.gz`;
  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok) throw new Error(`download answered ${res.status}`);
  const tgz = path.join(os.tmpdir(), 'litestream.tgz');
  fs.writeFileSync(tgz, Buffer.from(await res.arrayBuffer()));
  const t = spawnSync('tar', ['xzf', tgz, '-C', dir], { stdio: 'inherit' });
  if (t.status !== 0) throw new Error('could not unpack');
  fs.chmodSync(bin, 0o755);
  console.log(`[backup] Litestream ${VERSION} installed.`);
} catch (err) { console.warn(`[backup] Litestream was not installed (${err.message}). Backups stay off until it is.`); }
