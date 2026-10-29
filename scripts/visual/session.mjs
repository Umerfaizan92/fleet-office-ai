// Synthetic signed-in owner for browser checks: seeds one business, owner and session in the test database,
// accepts the current terms through the API and marks the guided tour as seen.
import Database from 'better-sqlite3';
import { randomBytes, randomUUID, createHash } from 'node:crypto';

export async function seedOwner(server, { business = 'Harbour Plumbing Pty Ltd', name = 'Alex Morgan' } = {}) {
  const db = new Database(server.dbPath), now = new Date().toISOString();
  const org = randomUUID(), uid = randomUUID(), token = randomBytes(24).toString('hex'), slug = 'harbour-' + org.slice(0, 6);
  db.prepare('INSERT INTO organisations (id,name,slug,created_at,updated_at) VALUES (?,?,?,?,?)').run(org, business, slug, now, now);
  db.prepare("INSERT INTO organisation_subscriptions (organisation_id,plan_id,status,payment_status,trial_ends_at,created_at,updated_at) VALUES (?,'operations','trialing','unpaid',?,?,?)").run(org, new Date(Date.now() + 10 * 86400000).toISOString(), now, now);
  db.prepare('INSERT INTO users (id,email,full_name,password_hash,password_salt,created_at,updated_at) VALUES (?,?,?,?,?,?,?)').run(uid, 'alex@harbour.example.test', name, 'x', 'x', now, now);
  try { db.prepare('UPDATE users SET email_verified=1,phone_verified=1 WHERE id=?').run(uid); } catch { /* older schema */ }
  db.prepare('INSERT INTO memberships (organisation_id,user_id,role,created_at) VALUES (?,?,?,?)').run(org, uid, 'owner', now);
  db.prepare('INSERT INTO user_sessions (id,user_id,token_hash,expires_at,created_at,last_seen_at) VALUES (?,?,?,?,?,?)').run(randomUUID(), uid, createHash('sha256').update(token).digest('hex'), new Date(Date.now() + 3600000).toISOString(), now, now);
  db.close();
  const cookie = 'fp_session=' + token;
  const legal = await server.call('GET', '/api/saas/legal', { cookie });
  const version = legal.json?.version || legal.json?.data?.version;
  if (version) await server.call('POST', '/api/saas/legal/accept', { cookie, body: { version, agree: true } });
  return { org, uid, token, cookie, slug };
}

export async function ownerContext(browser, server, owner, options = {}) {
  const ctx = await browser.newContext(options);
  await ctx.addCookies([{ name: 'fp_session', value: owner.token, url: server.base }]);
  await ctx.addInitScript((slug) => { try { localStorage.setItem('gds-tour-' + slug, 'done'); for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (/release_seen/.test(k)) localStorage.setItem(k, '1'); } } catch { /* storage blocked */ } }, owner.slug);
  return ctx;
}
