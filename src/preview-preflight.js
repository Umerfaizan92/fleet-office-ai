// No application imports: this must run before storage/provider modules are loaded.
import fs from 'node:fs';
import path from 'node:path';

export function assertIsolatedPreview(env = process.env) {
  if (env.SUPERPRO_ISOLATED_PREVIEW !== '1') return;
  const configured = (key) => String(env[key] ?? '').trim() !== '';
  const blocked = Object.keys(env).filter((key) => configured(key) && (
    /(?:AWS|S3)/i.test(key) ||
    (key.startsWith('BACKUP_') && key !== 'BACKUP_DISABLED') ||
    /(?:API_KEY|SECRET_KEY|ACCESS_TOKEN|CLIENT_SECRET|WEBHOOK_SECRET|SMTP_|MAIL_PASSWORD|GOOGLE_APPLICATION_CREDENTIALS)/.test(key) && key !== 'ADMIN_API_KEY' ||
    ['META_APP_SECRET', 'AI_TOOL_SHARED_SECRET'].includes(key)
  ));
  if (blocked.length || /^(1|true|yes|on)$/i.test(String(env.REQUIRE_PERSISTENT_DISK || '').trim())) {
    throw new Error('Isolated preview configuration is unsafe; startup aborted before backup access. Remove storage/provider configuration.');
  }
  // Explicit ephemeral paths prevent defaults from selecting a mounted production disk.
  for (const key of ['DATABASE_PATH', 'UPLOAD_DIR']) {
    const value = env[key];
    if (!value || !path.isAbsolute(value)) throw new Error('Isolated preview requires explicit ephemeral database and upload paths.');
    const resolved = path.resolve(value);
    if (!resolved.startsWith('/tmp/') || resolved === '/tmp') throw new Error('Isolated preview storage must stay under /tmp.');
    // Resolve the nearest existing parent too, so a symlink cannot escape /tmp.
    let parent = resolved;
    while (!fs.existsSync(parent)) parent = path.dirname(parent);
    const real = fs.realpathSync(parent);
    if (real !== '/tmp' && !real.startsWith('/tmp/')) throw new Error('Isolated preview storage cannot follow a symlink outside /tmp.');
  }
  if (String(env.PREVIEW_BUSINESS_PASSWORD || '').length < 20) throw new Error('Set a unique strong preview test password.');
  // Prevent a local .env from loading live credentials after the preflight.
  env.SUPERPRO_SKIP_DOTENV = '1';
}

// ESM evaluates this first import before server dependencies (some load dotenv).
// Keep direct `node src/server.js` startup protected as well as npm start.
assertIsolatedPreview();
