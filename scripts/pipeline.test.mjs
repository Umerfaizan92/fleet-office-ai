// Phase 04: the subscriber pipeline end to end against the real server and database.
// Enquiry → Quote → Booking → Allocation → Completion → Invoice → Payment, with propagation checks at every step,
// tenant isolation, staff permissions and refusals that must never look like success.
import test from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { randomUUID, randomBytes, createHash } from 'node:crypto';
import { startServer } from './test-server.mjs';
import { seedOwner } from './visual/session.mjs';

function addMember(server, org, role, name) {
  const db = new Database(server.dbPath), now = new Date().toISOString(), uid = randomUUID(), token = randomBytes(24).toString('hex');
  db.prepare('INSERT INTO users (id,email,full_name,password_hash,password_salt,created_at,updated_at) VALUES (?,?,?,?,?,?,?)').run(uid, `${role}-${uid}@example.test`, name, 'x', 'x', now, now);
  db.prepare('INSERT INTO memberships (organisation_id,user_id,role,created_at) VALUES (?,?,?,?)').run(org, uid, role, now);
  db.prepare('INSERT INTO user_sessions (id,user_id,token_hash,expires_at,created_at,last_seen_at) VALUES (?,?,?,?,?,?)').run(randomUUID(), uid, createHash('sha256').update(token).digest('hex'), new Date(Date.now() + 3600000).toISOString(), now, now);
  db.close();
  return { uid, cookie: 'fp_session=' + token };
}

test('pipeline: enquiry to payment with propagation, isolation and honest refusals', async (t) => {
  const s = await startServer();
  t.after(() => s.stop());
  const owner = await seedOwner(s, { business: 'Pipeline Plumbing Pty Ltd' });
  const other = await seedOwner(s, { business: 'Other Business Pty Ltd', name: 'Other Owner', email: 'other@other.example.test' });
  const as = (who) => (method, url, body) => s.call(method, url, { cookie: who.cookie, body });
  const O = as(owner), X = as(other);
  const db = () => new Database(s.dbPath);

  // 1. Enquiry with a new customer: the customer is created as a lead.
  let r = await O('POST', '/api/saas/pipeline/enquiries', { title: 'Leaking hot water system', details: 'Unit 4, water under the tank', channel: 'phone', customer: { name: 'Sam Rivera', phone: '0400 000 000', email: 'sam@example.test', address: '4/12 Beach Rd, Perth WA' } });
  assert.equal(r.status, 201, r.text);
  const enquiryId = r.json.id, customerId = r.json.customer_id;
  r = await O('GET', '/api/saas/customers');
  assert.ok(JSON.stringify(r.json).includes('Sam Rivera'), 'new customer appears in Customers');
  r = await O('POST', '/api/saas/pipeline/enquiries', { title: 'No customer' });
  assert.equal(r.status, 400, 'an enquiry needs a customer');
  r = await X('POST', '/api/saas/pipeline/enquiries', { title: 'Cross tenant', customer_id: customerId });
  assert.equal(r.status, 400, 'another business cannot use this customer');

  // 2. Quote from the enquiry: amount ex GST, GST 10%, enquiry becomes quoted, linked by source.
  r = await O('POST', `/api/saas/pipeline/enquiries/${enquiryId}/quote`, { amount: 1000, gst_applies: true });
  assert.equal(r.status, 201, r.text);
  assert.deepEqual([r.json.amount_cents, r.json.gst_cents, r.json.total_cents], [100000, 10000, 110000]);
  const quoteId = r.json.id;
  r = await X('POST', `/api/saas/pipeline/enquiries/${enquiryId}/quote`, { amount: 5 });
  assert.equal(r.status, 404, 'another business cannot quote this enquiry');
  r = await O('GET', '/api/saas/pipeline/enquiry');
  assert.equal(r.json.records.find((e) => e.id === enquiryId).status, 'quoted');

  // 3. Booking needs an approved and accepted quote; refusals return errors, never ok.
  r = await O('POST', `/api/saas/pipeline/quotes/${quoteId}/book`, { start_at: '2026-11-03T09:00:00+08:00', revision: 1 });
  assert.equal(r.status, 409); assert.equal(r.json.ok, false);
  r = await O('POST', `/api/saas/business-hub/quote/${quoteId}/approve`, { revision: 1 });
  assert.equal(r.status, 200, r.text);
  r = await O('POST', `/api/saas/business-hub/quote/${quoteId}/accept`, { revision: 1, evidence: 'Accepted by phone 30 Oct, ref Sam' });
  assert.equal(r.status, 200, r.text);
  r = await O('POST', `/api/saas/pipeline/quotes/${quoteId}/book`, { start_at: '2026-11-03T09:00:00+08:00', revision: 1, estimated_hours: 3, required_workers: 1 });
  assert.equal(r.status, 201, r.text);
  const bookingId = r.json.id, jobId = r.json.work_order_id;
  assert.ok(jobId, 'booking creates a job');

  // The job carries the customer, the address and the GST-inclusive price into Jobs and Money.
  let d = db(); let job = d.prepare('SELECT * FROM work_orders WHERE id=?').get(jobId); d.close();
  assert.equal(job.customer_id, customerId); assert.equal(job.address, '4/12 Beach Rd, Perth WA'); assert.equal(job.price_cents, 110000); assert.equal(job.status, 'awaiting_allocation');
  r = await O('GET', '/api/saas/work-orders');
  assert.ok(JSON.stringify(r.json).includes(jobId), 'job is listed in Jobs');
  r = await O('GET', '/api/saas/finance/jobs');
  assert.equal(r.json.jobs.find((j) => j.id === jobId).price_cents, 110000, 'job price is in Money');

  // 4. Allocation: the job is offered and the worker accepts through the real API; the job becomes allocated.
  const worker = addMember(s, owner.org, 'worker', 'Wes Worker');
  d = db(); const workerId = randomUUID(), offerId = randomUUID(), now = new Date().toISOString();
  d.prepare("INSERT INTO workers (id,organisation_id,user_id,full_name,status,declared_work_status,created_at,updated_at) VALUES (?,?,?,?,'active','australian_citizen',?,?)").run(workerId, owner.org, worker.uid, 'Wes Worker', now, now);
  d.prepare('INSERT INTO job_offers (id,organisation_id,work_order_id,worker_id,offered_at) VALUES (?,?,?,?,?)').run(offerId, owner.org, jobId, workerId, now);
  d.close();
  r = await as(worker)('POST', `/api/saas/job-offers/${offerId}/respond`, { status: 'accepted' });
  assert.equal(r.status, 200, r.text);
  d = db(); assert.equal(d.prepare('SELECT status FROM work_orders WHERE id=?').get(jobId).status, 'allocated'); d.close();
  r = await O('GET', '/api/saas/pipeline/booking');
  assert.equal(r.json.records.find((b) => b.id === bookingId).job.offers.accepted, 1, 'booking shows the accepted worker');
  r = await as(worker)('POST', `/api/saas/pipeline/jobs/${jobId}/invoice`, {});
  assert.equal(r.status, 403, 'a worker cannot invoice');

  // 5. Completion: invoicing before completion is refused; completion propagates to the booking.
  r = await O('POST', `/api/saas/pipeline/jobs/${jobId}/invoice`, {});
  assert.equal(r.status, 409); assert.match(r.json.error, /complete/);
  r = await X('POST', `/api/saas/pipeline/jobs/${jobId}/complete`, {});
  assert.equal(r.status, 404, 'another business cannot complete this job');
  r = await O('POST', `/api/saas/pipeline/jobs/${jobId}/complete`, {});
  assert.equal(r.status, 200, r.text);
  r = await O('POST', `/api/saas/pipeline/jobs/${jobId}/complete`, {});
  assert.equal(r.status, 409, 'completing twice is refused');
  r = await O('GET', '/api/saas/pipeline/booking');
  assert.equal(r.json.records.find((b) => b.id === bookingId).status, 'completed');

  // 6. Invoice from the completed job: same amounts as the quote; one invoice per job; must be approved to issue.
  r = await O('POST', `/api/saas/pipeline/jobs/${jobId}/invoice`, {});
  assert.equal(r.status, 201, r.text);
  assert.deepEqual([r.json.amount_cents, r.json.gst_cents, r.json.total_cents], [100000, 10000, 110000]);
  const invoiceId = r.json.id;
  r = await O('POST', `/api/saas/pipeline/jobs/${jobId}/invoice`, {});
  assert.equal(r.status, 409, 'a second invoice for the same job is refused');
  r = await O('POST', `/api/saas/pipeline/invoices/${invoiceId}/issue`, {});
  assert.equal(r.status, 409, 'issuing an unapproved invoice is refused');
  r = await O('POST', `/api/saas/business-hub/invoice/${invoiceId}/approve`, { revision: 1 });
  assert.equal(r.status, 200, r.text);
  r = await O('POST', `/api/saas/pipeline/invoices/${invoiceId}/issue`, {});
  assert.equal(r.status, 200, r.text);
  d = db(); job = d.prepare('SELECT * FROM work_orders WHERE id=?').get(jobId); d.close();
  assert.ok(job.invoice_issued_at && job.due_at, 'issuing sets the job invoice and due dates used by payments');
  r = await O('GET', '/api/saas/pipeline/booking');
  assert.equal(r.json.records.find((b) => b.id === bookingId).status, 'invoiced');

  // 7. Payment through the existing payments module: part payment, then the rest; the invoice follows.
  r = await O('POST', '/api/saas/payments/record', { work_order_id: jobId, amount: 500, method: 'bank_transfer' });
  assert.equal(r.status, 201, r.text);
  r = await O('GET', '/api/saas/pipeline/invoice');
  assert.equal(r.json.records.find((i) => i.id === invoiceId).status, 'part_paid');
  r = await O('POST', '/api/saas/payments/record', { work_order_id: jobId, amount: 700, method: 'eftpos' });
  assert.equal(r.status, 400, 'paying more than is owing is refused');
  r = await O('POST', '/api/saas/payments/record', { work_order_id: jobId, amount: 600, method: 'eftpos' });
  assert.equal(r.status, 201, r.text);
  r = await O('GET', '/api/saas/pipeline/invoice');
  const inv = r.json.records.find((i) => i.id === invoiceId);
  assert.equal(inv.status, 'paid'); assert.ok(inv.paid_at); assert.equal(inv.job.owing_cents, 0);
  r = await O('GET', '/api/saas/finance/jobs');
  assert.equal(r.json.jobs.find((j) => j.id === jobId).stage, 'paid', 'Money shows the job paid');

  // The trail shows the whole chain in order, with payments and history; other businesses cannot see it.
  r = await O('GET', `/api/saas/pipeline/trail/${invoiceId}`);
  assert.equal(r.status, 200, r.text);
  assert.deepEqual(r.json.chain.map((c) => c.kind), ['enquiry', 'quote', 'booking', 'invoice']);
  assert.equal(r.json.payments.filter((p) => p.status === 'paid').length, 2);
  assert.ok(r.json.events.some((e) => e.action === 'invoice.issued'));
  r = await X('GET', `/api/saas/pipeline/trail/${invoiceId}`);
  assert.equal(r.status, 404);
  r = await X('GET', '/api/saas/pipeline/invoice');
  assert.equal(r.json.records.length, 0, 'other business sees none of these records');

  // The overview counts the paid invoice and nothing stuck in between.
  r = await O('GET', '/api/saas/pipeline/overview');
  const stage = (k) => r.json.stages.find((x) => x.key === k);
  assert.equal(stage('paid').count, 1); assert.equal(stage('paid').total_cents, 110000);
  for (const k of ['enquiries', 'quotes', 'bookings', 'allocated', 'to_invoice', 'unpaid']) assert.equal(stage(k).count, 0, k);
});

test('pipeline: the older booking route also creates the job, and staff permissions apply', async (t) => {
  const s = await startServer();
  t.after(() => s.stop());
  const owner = await seedOwner(s);
  const O = (m, u, b) => s.call(m, u, { cookie: owner.cookie, body: b });
  let r = await O('POST', '/api/saas/business-hub/quote', { title: 'Gutter clean', body: '', amount_cents: 20000 });
  assert.equal(r.status, 201);
  const q = r.json.id;
  let d = new Database(s.dbPath); assert.equal(d.prepare('SELECT gst_cents FROM tenant_documents WHERE id=?').get(q).gst_cents, 2000, 'drafts carry GST'); d.close();
  await O('POST', `/api/saas/business-hub/quote/${q}/approve`, { revision: 1 });
  await O('POST', `/api/saas/business-hub/quote/${q}/accept`, { revision: 1, evidence: 'Signed quote emailed back 30 Oct' });
  r = await O('POST', `/api/saas/business-hub/quote/${q}/book`, { revision: 1, start_at: '2026-11-04T01:00:00.000Z' });
  assert.equal(r.status, 201, r.text);
  assert.ok(r.json.work_order_id, 'the original booking button now creates the job too');
  d = new Database(s.dbPath); assert.equal(d.prepare('SELECT price_cents FROM work_orders WHERE id=?').get(r.json.work_order_id).price_cents, 22000); d.close();

  // A manager on default role grants can run customer work; a worker cannot see quotes or invoices.
  const mgr = addMember(s, owner.org, 'manager', 'Mia Manager');
  const wkr = addMember(s, owner.org, 'worker', 'Will Worker');
  r = await s.call('POST', '/api/saas/pipeline/enquiries', { cookie: mgr.cookie, body: { title: 'Manager enquiry', customer: { name: 'Kim Lee' } } });
  assert.equal(r.status, 201, r.text);
  r = await s.call('GET', '/api/saas/pipeline/quote', { cookie: wkr.cookie });
  assert.equal(r.status, 403);
  r = await s.call('GET', '/api/saas/pipeline/invoice', { cookie: wkr.cookie });
  assert.equal(r.status, 403);
  r = await s.call('GET', '/api/saas/pipeline/overview');
  assert.equal(r.status, 401, 'signed-out requests are refused');
});
