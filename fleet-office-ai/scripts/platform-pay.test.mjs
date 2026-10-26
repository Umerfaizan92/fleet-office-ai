import test from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { createPlatformPay } from '../src/platform-pay.js';

function setup(fetchImpl) {
  const db = new Database(':memory:');
  db.exec(`CREATE TABLE organisations (id TEXT PRIMARY KEY, name TEXT, display_name TEXT); INSERT INTO organisations VALUES ('o1','Acme Cleaning','Acme');
    CREATE TABLE users (id TEXT PRIMARY KEY, email TEXT); CREATE TABLE memberships (organisation_id TEXT, user_id TEXT, role TEXT); INSERT INTO users VALUES ('u1','owner@acme.test'); INSERT INTO memberships VALUES ('o1','u1','owner');
    CREATE TABLE platform_invoices (id TEXT PRIMARY KEY, organisation_id TEXT, number TEXT, total_cents INTEGER, status TEXT);
    INSERT INTO platform_invoices VALUES ('i1','o1','SP-2026-0001',5390,'sent');`);
  const settled = [];
  const pay = createPlatformPay({ db, env: { PUBLIC_BASE_URL: 'https://x.test' }, runtime: { encryptBundle: (o) => o, decryptBundle: (s) => (typeof s === 'string' ? JSON.parse(s) : s) }, settle: async (id, x) => { settled.push([id, x]); return {}; }, fetchImpl });
  const put = (provider, enabled, values) => { const routes = {}; };
  return { db, pay, settled };
}
const seal = (o) => JSON.stringify({ v: o });
function configure(db, provider, enabled, cfg, position) { db.prepare(`INSERT INTO platform_pay_providers (provider,enabled,config_enc,position,updated_at) VALUES (?,?,?,?,?)`).run(provider, enabled ? 1 : 0, seal(cfg), position, new Date().toISOString()); }
const json = (status, body) => ({ ok: status < 400, status, json: async () => body });
const inv = { id: 'i1', organisation_id: 'o1', number: 'SP-2026-0001', total_cents: 5390 };

test('the pay link is private and stable', () => {
  const { pay } = setup(async () => json(200, {}));
  const a = pay.payUrl(inv), b = pay.payUrl(inv);
  assert.equal(a, b); assert.match(a, /^https:\/\/x\.test\/pay\/[A-Za-z0-9_-]{40,}$/);
});
test('when the first provider fails, the next one is tried automatically', async () => {
  const calls = [];
  const { db, pay } = setup(async (url) => { calls.push(String(url)); if (String(url).includes('stripe.com')) return json(500, { error: { message: 'down' } }); return json(200, {}); });
  configure(db, 'stripe', true, { secret_key: 'sk_test_' + 'a'.repeat(20), webhook_secret: 'whsec_' + 'a'.repeat(20) }, 0);
  configure(db, 'zeller', true, { payment_link_url: 'https://pay.zeller.test/abc' }, 1);
  const r = await pay.start(inv, 'tok', 'auto');
  assert.equal(r.ok, true); assert.equal(r.provider, 'zeller'); assert.equal(r.tried[0].provider, 'stripe');
  assert.equal(db.prepare(`SELECT COUNT(*) c FROM platform_pay_attempts WHERE status='failed'`).get().c >= 1, true);
});
test('Stripe is asked for the exact invoice total in AUD, falling back to card only if direct debit is not enabled', async () => {
  const bodies = [];
  const { db, pay } = setup(async (url, init) => { bodies.push(String(init?.body || '')); if (bodies.length === 1) return json(400, { error: { message: 'The payment method type au_becs_debit is invalid' } }); return json(200, { id: 'cs_1', url: 'https://checkout.stripe.test/c/cs_1' }); });
  configure(db, 'stripe', true, { secret_key: 'sk_test_' + 'a'.repeat(20), webhook_secret: 'whsec_' + 'a'.repeat(20) }, 0);
  const r = await pay.start(inv, 'tok', 'stripe'); assert.equal(r.url, 'https://checkout.stripe.test/c/cs_1');
  assert.match(bodies[1], /unit_amount%5D=5390|unit_amount\]=5390|unit_amount%5D=5390/); assert.match(bodies[1], /currency%5D=aud|currency\]=aud/);
  assert.ok(!bodies[1].includes('au_becs_debit'));
});
test('a provider that is switched off or half set up is never offered', async () => {
  const { db, pay } = setup(async () => json(200, {}));
  configure(db, 'stripe', false, { secret_key: 'sk_test_' + 'a'.repeat(20), webhook_secret: 'whsec_' + 'a'.repeat(20) }, 0);
  configure(db, 'paypal', true, { client_id: 'only-id' }, 1);
  assert.deepEqual(pay.methodsFor(inv), []);
  assert.equal((await pay.start(inv, 'tok', 'auto')).ok, false);
});
test('bank transfer is offered once its details are complete', () => {
  const { db, pay } = setup(async () => json(200, {}));
  configure(db, 'bank', true, { account_name: 'A', bsb: '066123', account_number: '12345678' }, 4);
  assert.deepEqual(pay.methodsFor(inv).map((m) => m.id), ['bank']);
});
