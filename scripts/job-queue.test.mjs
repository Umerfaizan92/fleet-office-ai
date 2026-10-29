import test from 'node:test';
import assert from 'node:assert/strict';
import { createDb } from '../src/db.js';
import { createJobQueue } from '../src/job-queue.js';
import { routeShape } from '../src/observability.js';
import { startServer } from './test-server.mjs';

const quiet = { warn() {}, error() {} };
function setup() {
  let now = Date.parse('2026-10-30T00:00:00Z');
  const db = createDb(':memory:');
  const q = createJobQueue({ db, log: quiet, clock: () => now });
  return { db, q, advance: (ms) => { now += ms; }, at: () => now };
}

test('an idempotency key never creates a second job', () => {
  const { q } = setup();
  q.register('demo.send', () => 'ok');
  const a = q.enqueue('demo.send', { n: 1 }, { idempotencyKey: 'send:1' });
  const b = q.enqueue('demo.send', { n: 2 }, { idempotencyKey: 'send:1' });
  assert.equal(a.duplicate, false); assert.equal(b.duplicate, true); assert.equal(b.job.id, a.job.id);
  assert.equal(q.stats().counts.queued, 1);
});

test('failures retry with growing delays, then move to dead letters, and can be retried by hand', async () => {
  const { q, advance } = setup();
  let calls = 0;
  q.register('demo.flaky', () => { calls += 1; throw new Error('provider down'); }, { maxAttempts: 3, baseDelayMs: 1000 });
  const { job } = q.enqueue('demo.flaky', {});
  assert.equal((await q.runOnce()).status, 'failed');
  assert.equal(await q.runOnce(), null, 'not due again until the back-off passes');
  // Delays are base × 2^(attempt−1) plus up to 1 s of jitter: 1–2 s, then 2–3 s.
  advance(2100); assert.equal((await q.runOnce()).status, 'failed');
  advance(1500); assert.equal(await q.runOnce(), null, 'second back-off is longer');
  advance(1600); assert.equal((await q.runOnce()).status, 'dead');
  assert.equal(calls, 3);
  assert.equal(q.stats().counts.dead, 1);
  assert.equal(q.list({ status: 'dead' })[0].last_error, 'provider down');
  assert.equal(q.retry(job.id), true);
  assert.equal(q.stats().counts.queued, 1);
});

test('a job whose worker died is picked up again after its lease, and two claims never get the same job', async () => {
  const { q, advance } = setup();
  q.register('demo.slow', () => 'done', { timeoutMs: 1000 });
  q.enqueue('demo.slow', {});
  const first = q.claim();
  assert.ok(first);
  assert.equal(q.claim(), null, 'leased job is not handed out twice');
  advance(40000);
  const again = q.claim();
  assert.equal(again.id, first.id); assert.equal(again.attempts, 2);
});

test('a handler that hangs is stopped by its timeout and counted as a failure', async () => {
  const { q } = setup();
  q.register('demo.hang', () => new Promise(() => {}), { timeoutMs: 50, maxAttempts: 1 });
  q.enqueue('demo.hang', {});
  const r = await q.runOnce();
  assert.equal(r.status, 'dead'); assert.match(r.error, /timed out/);
});

test('cancelled jobs never run; unknown job types are left for a worker that knows them', async () => {
  const { q } = setup();
  q.register('demo.ok', () => 1);
  const { job } = q.enqueue('demo.ok', {});
  assert.equal(q.cancel(job.id), true);
  assert.equal(await q.runOnce(), null);
  q.enqueue('other.type', {});
  assert.equal(await q.runOnce(), null);
});

test('log routes hide record identifiers', () => {
  assert.equal(routeShape('/api/saas/customers/3f2a9c1e-5b7d-4e8a-9c21-7d4e5f6a8b90?x=secret'), '/api/saas/customers/:id');
  assert.equal(routeShape('/api/pay/abcdefghijklmnopqrstuvwxyz123'), '/api/pay/:token');
});

test('founder views: jobs, system and readiness on a real server', async () => {
  const s = await startServer({ LOG_FORMAT: 'json' });
  try {
    const ready = await fetch(s.base + '/readyz');
    assert.equal(ready.status, 200);
    assert.match(ready.headers.get('x-request-id') || '', /^[0-9a-f-]{36}$/);
    const echo = await fetch(s.base + '/readyz', { headers: { 'x-request-id': 'trace-12345678' } });
    assert.equal(echo.headers.get('x-request-id'), 'trace-12345678');
    const jobs = await s.call('GET', '/api/operator/jobs', { headers: { 'x-admin-key': s.adminKey } });
    assert.equal(jobs.status, 200, jobs.text);
    assert.ok(jobs.json.stats.registered.includes('audit.verify_chain'));
    const sys = await s.call('GET', '/api/operator/system', { headers: { 'x-admin-key': s.adminKey } });
    assert.equal(sys.status, 200, sys.text);
    assert.equal(sys.json.storage.primary_mode, 'disk');
    assert.ok(!sys.text.includes(s.adminKey), 'no secret values in the system view');
    assert.equal((await s.call('GET', '/api/operator/system')).status, 401);
    assert.match(s.log(), /"msg":"request","id":"trace-12345678","method":"GET","route":"\/readyz","status":200/);
  } finally { await s.stop(); }
});
