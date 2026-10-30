// Downloads the Litestream backup tool on the Render build (Linux only). Never fails the install: start.mjs reports a clear error if it is needed but missing.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
// SHA-256 of the official v0.3.13 release archives, recorded when this version was pinned (30 Oct 2026).
// A download that does not match is refused, so a tampered archive can never become the backup tool.
const SHA256 = {
  amd64: 'eb75a3de5cab03875cdae9f5f539e6aedadd66607003d9b1e7a9077948818ba0',
  arm64: '9585f5a508516bd66af2b2376bab4de256a5ef8e2b73ec760559e679628f2d59'
};
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
  const archive = Buffer.from(await res.arrayBuffer());
  const digest = createHash('sha256').update(archive).digest('hex');
  if (digest !== SHA256[arch]) throw new Error(`checksum mismatch for linux-${arch} (got ${digest.slice(0, 12)}…); refusing to install`);
  const tgz = path.join(os.tmpdir(), 'litestream.tgz');
  fs.writeFileSync(tgz, archive);
  const t = spawnSync('tar', ['xzf', tgz, '-C', dir], { stdio: 'inherit' });
  if (t.status !== 0) throw new Error('could not unpack');
  fs.chmodSync(bin, 0o755);
  console.log(`[backup] Litestream ${VERSION} installed.`);
} catch (err) { console.warn(`[backup] Litestream was not installed (${err.message}). Backups stay off until it is.`); }
