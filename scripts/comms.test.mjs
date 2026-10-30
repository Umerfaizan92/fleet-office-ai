// Phase 07 end to end through the real server, with a local stand-in for the Telnyx and Resend APIs (the real
// providers cannot be reached from the test machine). Webhooks are signed with Ed25519 exactly as Telnyx signs them.
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import crypto from 'node:crypto';
import Database from 'better-sqlite3';
import { startServer } from './test-server.mjs';
import { seedOwner } from './visual/session.mjs';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function mockProviders() {
  const calls = [], failFor = new Set();
  const server = http.createServer((req, res) => {
    let body = ''; req.on('data', (c) => { body += c; }); req.on('end', () => {
      let j = {}; try { j = JSON.parse(body || '{}'); } catch { /* not json */ }
      calls.push({ path: req.url, method: req.method, body: j, auth: req.headers.authorization });
      const send = (status, o) => { res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify(o)); };
      if ([...failFor].some((f) => req.url.includes(f) || JSON.stringify(j).includes(f))) return send(422, { errors: [{ detail: 'Mock provider refused this request' }] });
      if (req.url === '/telnyx/messages') return send(200, { data: { id: 'sms-' + crypto.randomUUID() } });
      if (req.url.startsWith('/telnyx/calls/')) return send(200, { data: { result: 'ok' } });
      if (req.url === '/resend/emails') return send(200, { id: 'em-' + crypto.randomUUID() });
      send(404, { error: 'unknown' });
    });
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  return { base, calls, failFor, close: () => new Promise((r) => server.close(r)) };
}
async function setup() {
  const mock = await mockProviders();
  const { privateKey, publicKey } = crypto.generateKeyPairSync('ed25519');
  const raw = publicKey.export({ format: 'der', type: 'spki' }).subarray(-32).toString('base64');
  const s = await startServer({ TELNYX_API_BASE_URL: mock.base + '/telnyx', RESEND_API_BASE_URL: mock.base + '/resend', TELNYX_API_KEY: 'test-telnyx-key', TELNYX_PUBLIC_KEY: raw, TELNYX_PHONE_NUMBER: '+61800000000', TELNYX_FROM_NUMBER: '+61400000000', TELNYX_AI_ASSISTANT_ID: 'assistant-test', RESEND_API_KEY: 're_test_key', RESEND_WEBHOOK_SECRET: 'whsec_' + Buffer.from('comms-test-secret-0123456789abcdef').toString('base64'), SAAS_VERIFY_FROM: 'Super Pro <noreply@example.test>', PLATFORM_MAIL_FROM: 'Super Pro <hello@example.test>', SUPERPRO_POSTAL_ADDRESS: 'PO Box 1, Perth WA 6000' });
  const owner = await seedOwner(s, { business: 'Harbour Plumbing Pty Ltd' });
  const O = (m, u, b) => s.call(m, u, { cookie: owner.cookie, body: b });
  await O('PUT', '/api/saas/seo/profile', { business_name: 'Harbour Plumbing', services: ['Blocked drains', 'Hot water repairs'], areas: ['Fremantle', 'Cottesloe'], phone: '0400 111 222', website_url: '' });
  const db = new Database(s.dbPath), now = new Date().toISOString();
  db.prepare("UPDATE organisations SET abn='51824753556', address_formatted='1 Beach Rd, Fremantle WA 6160' WHERE id=?").run(owner.org);
  for (const [ch, addr] of [['sms', '+61400000000'], ['voice', '+61861110000']]) db.prepare("INSERT INTO comms_channels(organisation_id,channel,address,status,activated_at,created_at) VALUES (?,?,?,'active',?,?)").run(owner.org, ch, addr, now, now);
  db.close();
  const hook = async (event_type, payload, id = crypto.randomUUID()) => {
    const body = JSON.stringify({ data: { id, event_type, payload } }), ts = String(Math.floor(Date.now() / 1000));
    const sig = crypto.sign(null, Buffer.from(`${ts}|${body}`), privateKey).toString('base64');
    const r = await fetch(s.base + '/api/webhooks/telnyx', { method: 'POST', headers: { 'content-type': 'application/json', 'telnyx-signature-ed25519': sig, 'telnyx-timestamp': ts }, body });
    assert.equal(r.status, 200, await r.text()); await sleep(150); return id;
  };
  const sql = (q, ...a) => { const d = new Database(s.dbPath); try { return /^\s*select/i.test(q) ? d.prepare(q).all(...a) : d.prepare(q).run(...a); } finally { d.close(); } };
  return { s, mock, owner, O, hook, sql, stop: async () => { await s.stop(); await mock.close(); } };
}
const sms = (from, text) => ({ from: { phone_number: from }, to: [{ phone_number: '+61400000000' }], text, id: 'in-' + crypto.randomUUID() });
const approveRun = async (O, runId) => { const ap = (await O('GET', '/api/saas/approvals')).json.approvals.find((a) => a.automation_run_id === runId); assert.ok(ap, 'approval exists'); const d = await O('POST', `/api/saas/approvals/${ap.id}/decision`, { decision: 'approve' }); assert.equal(d.status, 200, d.text); return ap; };

test('unified inbox: inbound SMS is categorised, scored, linked and escalated; STOP suppresses; replies need approval and can be scheduled', async (t) => {
  const { s, mock, owner, O, hook, sql, stop } = await setup(); t.after(stop);
  sql("INSERT INTO tenant_customers(id,organisation_id,name,phone,status,source,created_at,updated_at) VALUES (?,?,?,?,'current','manual',?,?)", crypto.randomUUID(), owner.org, 'Riley Quinn', '0412 345 678', new Date().toISOString(), new Date().toISOString());
  await hook('message.received', sms('+61412345678', 'Hi, how much for a quote to fix a blocked drain in Fremantle? Tomorrow would be good.'));
  let r = await O('GET', '/api/saas/comms/unified?folder=inbox');
  assert.equal(r.status, 200, r.text);
  const item = r.json.items.find((i) => i.address === '+61412345678');
  assert.ok(item, JSON.stringify(r.json.items));
  assert.equal(item.ai.category, 'quote'); assert.equal(item.ai.lead_band, 'hot'); assert.ok(item.links.customer_id, 'linked to the existing customer by phone');
  const th = (await O('GET', `/api/saas/comms/unified/threads/${item.id}`)).json;
  assert.ok(th.meta.lead_reasons.some((x) => /Blocked drains/.test(x))); assert.equal(th.customer.name, 'Riley Quinn');
  assert.ok((await O('GET', '/api/saas/comms/unified/suggestions')).json.leads.some((l) => l.thread_id === item.id && l.basis === 'estimate'), 'a hot lead without an enquiry is suggested');
  // Conversation to CRM: create an enquiry from it.
  r = await O('POST', `/api/saas/comms/unified/threads/${item.id}/link`, { create_enquiry: {} });
  assert.equal(r.status, 200, r.text); assert.ok(r.json.enquiry_id);
  assert.equal((await O('GET', '/api/saas/comms/unified?folder=inbox&view=enquiries')).json.items.length, 1);

  // Complaint with legal wording: urgent escalation and a notification.
  await hook('message.received', sms('+61499000111', 'This is unacceptable, the leak is worse. I will go to Fair Trading if not fixed!!'));
  const sug = (await O('GET', '/api/saas/comms/unified/suggestions')).json;
  assert.ok(sug.escalations.some((e) => e.level === 'urgent' && e.reasons.some((x) => /legal|regulator/.test(x))));
  assert.ok(sql("SELECT COUNT(*) n FROM user_notifications WHERE organisation_id=? AND kind='comms_escalation'", owner.org)[0].n >= 1);
  // Spam goes to Spam; a repeated message is flagged as a duplicate.
  await hook('message.received', sms('+61488000222', 'Get backlinks for your site, rank #1 on Google, telegram me'));
  assert.equal((await O('GET', '/api/saas/comms/unified?folder=spam')).json.items.length, 1);
  await hook('message.received', sms('+61412345678', 'Hi, how much for a quote to fix a blocked drain in Fremantle? Tomorrow would be good.'));
  assert.ok(sql("SELECT duplicates_json FROM comms_thread_meta WHERE thread_id=?", item.id)[0].duplicates_json.includes('repeated_message'));
  // STOP: suppressed straight away.
  await hook('message.received', sms('+61477000333', 'STOP'));
  assert.equal(sql("SELECT reason FROM marketing_suppressions WHERE owner_key=? AND address='+61477000333'", owner.org)[0].reason, 'stop_reply');

  // Reply: drafted from a template, waits for approval, then sends through the SMS provider.
  r = await O('POST', `/api/saas/comms/unified/threads/${item.id}/reply`, {});
  assert.equal(r.status, 201, r.text); assert.equal(r.json.method, 'template'); assert.match(r.json.body, /Hi Riley/);
  assert.equal((await O('POST', `/api/saas/comms/messages/${r.json.message_id}/send`, {})).status, 409, 'not before approval');
  await O('POST', `/api/saas/approvals/${r.json.approval_id}/decision`, { decision: 'approve' });
  const before = mock.calls.filter((c) => c.path === '/telnyx/messages').length;
  assert.equal((await O('POST', `/api/saas/comms/messages/${r.json.message_id}/send`, {})).status, 200);
  const sent = mock.calls.filter((c) => c.path === '/telnyx/messages');
  assert.equal(sent.length, before + 1); assert.equal(sent.at(-1).body.to, '+61412345678');
  assert.ok((await O('GET', '/api/saas/comms/unified?folder=sent')).json.items.some((i) => i.id === r.json.message_id));
  // Scheduled reply: appears in Scheduled, goes out after approval once due; a failure lands in Failed.
  const at = new Date(Date.now() + 1200).toISOString();
  r = await O('POST', `/api/saas/comms/unified/threads/${item.id}/reply`, { body: 'We can come tomorrow at 9am.', send_at: at });
  assert.equal(r.status, 201, r.text);
  assert.ok((await O('GET', '/api/saas/comms/unified?folder=scheduled')).json.items.some((i) => i.id === r.json.message_id));
  await O('POST', `/api/saas/approvals/${r.json.approval_id}/decision`, { decision: 'approve' });
  assert.equal((await O('POST', '/api/saas/comms/unified/send-due', {})).json.sent, 0, 'not before its time');
  await sleep(1300);
  assert.equal((await O('POST', '/api/saas/comms/unified/send-due', {})).json.sent, 1);
  mock.failFor.add('We cannot make it');
  r = await O('POST', `/api/saas/comms/unified/threads/${item.id}/reply`, { body: 'We cannot make it today, sorry.', send_at: new Date(Date.now() + 1000).toISOString() });
  await O('POST', `/api/saas/approvals/${r.json.approval_id}/decision`, { decision: 'approve' }); await sleep(1100);
  await O('POST', '/api/saas/comms/unified/send-due', {});
  assert.ok((await O('GET', '/api/saas/comms/unified?folder=failed')).json.items.some((i) => i.id === r.json.message_id), 'a provider refusal shows in Failed');
  // Archive, separation and permissions.
  assert.equal((await O('POST', `/api/saas/comms/unified/threads/${item.id}/move`, { folder: 'archived' })).status, 200);
  assert.ok((await O('GET', '/api/saas/comms/unified?folder=archived')).json.items.some((i) => i.id === item.id));
  const other = await seedOwner(s, { business: 'Other Co', email: 'other@other.example.test' });
  assert.equal((await s.call('GET', `/api/saas/comms/unified/threads/${item.id}`, { cookie: other.cookie })).status, 404);
  assert.equal((await s.call('GET', '/api/saas/comms/unified', { cookie: other.cookie })).json.items.length, 0);
});

test('website contact form creates an enquiry and an inbox conversation, records consent only when ticked, ignores bots', async (t) => {
  const { s, owner, O, sql, stop } = await setup(); t.after(stop);
  let r = await fetch(`${s.base}/api/public/contact/${owner.slug}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'Sam Lee', email: 'sam@lee.example.test', message: 'Can you service my hot water system next week?', marketing_consent: true }) });
  assert.equal(r.status, 201, await r.text());
  assert.equal(sql("SELECT COUNT(*) n FROM tenant_documents WHERE organisation_id=? AND kind='enquiry' AND channel='website'", owner.org)[0].n, 1);
  assert.equal(sql("SELECT status FROM marketing_consents WHERE owner_key=? AND address='sam@lee.example.test'", owner.org)[0].status, 'granted');
  const items = (await O('GET', '/api/saas/comms/unified?folder=inbox&view=enquiries')).json.items;
  assert.ok(items.some((i) => i.channel === 'website' && i.links.enquiry_id));
  r = await fetch(`${s.base}/api/public/contact/${owner.slug}`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ name: 'Kim Park', phone: '0400 222 333', message: 'Quote for drains please', return_to: '/sites/x/contact' }), redirect: 'manual' });
  assert.equal(r.status, 303); assert.match(r.headers.get('location'), /form=sent/);
  assert.equal(sql("SELECT COUNT(*) n FROM marketing_consents WHERE owner_key=? AND address LIKE '%400222333'", owner.org)[0].n, 0, 'no consent without the box ticked');
  r = await fetch(`${s.base}/api/public/contact/${owner.slug}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'Bot', email: 'bot@spam.example.test', message: 'Buy now buy now', website: 'http://spam' }) });
  assert.equal(r.status, 201); assert.equal(sql("SELECT COUNT(*) n FROM tenant_customers WHERE email='bot@spam.example.test'")[0].n, 0, 'honeypot submissions are dropped quietly');
  assert.equal((await fetch(`${s.base}/api/public/contact/no-such-business`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'X Y', email: 'x@y.example.test', message: 'Hello there' }) })).status, 404);
});

test('voice: routed per number, assistant with business context, transcript, fallback to transfer, voicemail, apology, duplicates', async (t) => {
  const { s, mock, owner, O, hook, sql, stop } = await setup(); t.after(stop);
  const rp = await O('PUT', '/api/saas/receptionist-profile', { greeting: 'Thanks for calling Harbour Plumbing, how can I help?', knowledge: 'We clear blocked drains and repair hot water systems in Fremantle and Cottesloe.', hours: 'Mon-Sun 00:00-23:59', timezone: 'Australia/Perth', revision: 0 });
  assert.equal(rp.status, 200, rp.text);
  const cmd = (id, action) => mock.calls.filter((c) => c.path === `/telnyx/calls/${id}/actions/${action}`);
  // 1. Normal call: answered, transcription and assistant start together, transcript saved, call log in the inbox.
  let id = 'call-' + crypto.randomUUID();
  const evId = await hook('call.initiated', { call_control_id: id, call_session_id: 'sess-1', direction: 'incoming', from: '+61412000999', to: '+61861110000' });
  assert.equal(cmd(id, 'answer').length, 1, 'answered');
  await hook('call.initiated', { call_control_id: id, direction: 'incoming', from: '+61412000999', to: '+61861110000' }, evId);
  assert.equal(cmd(id, 'answer').length, 1, 'a repeated webhook is ignored');
  await hook('call.answered', { call_control_id: id, from: '+61412000999', to: '+61861110000' });
  assert.equal(cmd(id, 'transcription_start').length, 1);
  const start = cmd(id, 'ai_assistant_start')[0]; assert.ok(start, 'assistant started');
  assert.match(start.body.assistant.instructions, /Harbour Plumbing/); assert.match(start.body.assistant.instructions, /blocked drains/);
  assert.equal(start.body.interruption_settings.enable, true); assert.match(start.body.greeting, /transcribed/);
  await hook('call.transcription', { call_control_id: id, transcription_data: { transcript: 'I need my blocked drain cleared tomorrow', is_final: true } });
  await hook('call.transcription', { call_control_id: id, transcription_data: { transcript: 'partial', is_final: false } });
  await hook('call.hangup', { call_control_id: id, call_session_id: 'sess-1', hangup_cause: 'normal_clearing', start_time: new Date(Date.now() - 60000).toISOString(), end_time: new Date().toISOString() });
  let log = sql("SELECT m.body,m.summary FROM comms_messages m JOIN comms_threads t ON t.id=m.thread_id WHERE t.organisation_id=? AND t.channel='voice'", owner.org);
  assert.equal(log.length, 1, 'one call log, not two'); assert.match(log[0].body, /Caller: I need my blocked drain cleared tomorrow/); assert.doesNotMatch(log[0].body, /partial/);
  // 2. Assistant fails: the caller is transferred to the business's transfer number (open hours), never left in silence.
  await O('PUT', '/api/saas/comms/voice/settings', { mode: 'assistant', transfer_number: '0412 777 888', recording_notice: true });
  mock.failFor.add('ai_assistant_start');
  id = 'call-' + crypto.randomUUID();
  await hook('call.initiated', { call_control_id: id, direction: 'incoming', from: '+61412000111', to: '+61861110000' });
  await hook('call.answered', { call_control_id: id });
  assert.equal(cmd(id, 'transfer')[0]?.body.to, '+61412777888');
  const v = (await O('GET', '/api/saas/comms/voice')).json;
  assert.equal(v.settings.transfer_number, '••• 888', 'the transfer number is never shown in full');
  assert.ok(v.calls.find((c) => c.call_control_id === id).failures.some((f) => f.step === 'ai_assistant_start'));
  // 3. Voicemail mode: greeting, then recording after the greeting, recording link and owner notified.
  mock.failFor.clear();
  await O('PUT', '/api/saas/comms/voice/settings', { mode: 'voicemail', recording_notice: false, voicemail_greeting: 'You have reached Harbour Plumbing. Leave a message after the tone.' });
  id = 'call-' + crypto.randomUUID();
  await hook('call.initiated', { call_control_id: id, direction: 'incoming', from: '+61412000222', to: '+61861110000' });
  await hook('call.answered', { call_control_id: id });
  const greet = cmd(id, 'speak')[0]; assert.match(greet.body.payload, /Leave a message/);
  await hook('call.speak.ended', { call_control_id: id, client_state: greet.body.client_state });
  assert.equal(cmd(id, 'record_start')[0].body.play_beep, true);
  await hook('call.recording.saved', { call_control_id: id, recording_urls: { mp3: 'https://recordings.example.test/vm.mp3' } });
  await hook('call.hangup', { call_control_id: id, hangup_cause: 'normal_clearing' });
  log = sql("SELECT m.body FROM comms_messages m JOIN comms_threads t ON t.id=m.thread_id WHERE t.organisation_id=? AND t.contact_address='+61412000222'", owner.org);
  assert.match(log[0].body, /^Voicemail/); assert.match(log[0].body, /vm\.mp3/);
  assert.ok(sql("SELECT COUNT(*) n FROM user_notifications WHERE organisation_id=? AND kind='voicemail'", owner.org)[0].n >= 1);
  // 4. Everything fails: apology, then hang up.
  mock.failFor.add('record_start');
  id = 'call-' + crypto.randomUUID();
  await hook('call.initiated', { call_control_id: id, direction: 'incoming', from: '+61412000333', to: '+61861110000' });
  await hook('call.answered', { call_control_id: id });
  await hook('call.speak.ended', { call_control_id: id, client_state: cmd(id, 'speak')[0].body.client_state });
  const apology = cmd(id, 'speak').find((c) => /Sorry/.test(c.body.payload)); assert.ok(apology, 'apology spoken');
  await hook('call.speak.ended', { call_control_id: id, client_state: apology.body.client_state });
  assert.equal(cmd(id, 'hangup').length, 1, 'then hung up');
  // 5. Unknown number: rejected, not answered by a generic assistant.
  id = 'call-' + crypto.randomUUID();
  await hook('call.initiated', { call_control_id: id, direction: 'incoming', from: '+61412000444', to: '+61899999999' });
  assert.equal(cmd(id, 'reject').length, 1); assert.equal(cmd(id, 'answer').length, 0);
  // Other businesses cannot see or transfer this business's calls.
  const other = await seedOwner(s, { business: 'Other Co', email: 'other2@other.example.test' });
  assert.equal((await s.call('GET', '/api/saas/comms/voice', { cookie: other.cookie })).json.calls.length, 0);
  assert.equal((await s.call('POST', `/api/saas/comms/voice/calls/${id}/transfer`, { cookie: other.cookie, body: {} })).status, 404);
});

test('campaigns: consent-only audiences, approval before any send, unsubscribe and STOP honoured, scheduling, edits after submit, tracking', async (t) => {
  const { s, mock, owner, O, sql, stop } = await setup(); t.after(stop);
  const now = new Date().toISOString(), add = (name, email, phone, consent) => { const id = crypto.randomUUID(); sql("INSERT INTO tenant_customers(id,organisation_id,name,email,phone,address,status,source,created_at,updated_at) VALUES (?,?,?,?,?,?,'current','manual',?,?)", id, owner.org, name, email, phone, '1 Beach Rd, Fremantle WA', now, now); return id; };
  add('Ana Ruiz', 'ana@ruiz.example.test', '0400 100 100'); add('Ben Ford', 'ben@ford.example.test', '0400 200 200'); add('Cal Dee', 'cal@dee.example.test', null);
  for (const [ch, a] of [['email', 'ana@ruiz.example.test'], ['email', 'ben@ford.example.test'], ['sms', '0400 100 100']]) assert.equal((await O('POST', '/api/saas/comms/consents', { channel: ch, address: a, status: 'granted', evidence: 'Signed up on the job sheet, 1 Oct' })).status, 201);
  assert.equal((await O('POST', '/api/saas/comms/suppressions', { channel: 'email', address: 'ben@ford.example.test', reason: 'Asked by phone' })).status, 201);
  let r = await O('GET', `/api/saas/growth/campaigns/audience/preview?channel=email&segment=${encodeURIComponent(JSON.stringify({ area: 'Fremantle' }))}`);
  assert.deepEqual([r.json.eligible, r.json.excluded.no_consent, r.json.excluded.suppressed], [1, 1, 1]);
  // Compliance: an email without a subject cannot be submitted.
  r = await O('POST', '/api/saas/growth/campaigns', { name: 'Spring check', channel: 'email', body: 'Hi {first_name}, time for a service.', segment: {} });
  const cid = r.json.campaign.id;
  assert.equal((await O('POST', `/api/saas/growth/campaigns/${cid}/submit`, {})).status, 409);
  r = await O('PUT', `/api/saas/growth/campaigns/${cid}`, { name: 'Spring check', channel: 'email', subject: 'Time for your hot water service', body: 'Hi {first_name},\n\nIt is a good time for a hot water service.', cta_url: 'https://harbour.example.test/book', segment: {} });
  assert.ok(r.json.campaign.recommendations.length); assert.ok(r.json.campaign.compliance.ok, JSON.stringify(r.json.campaign.compliance));
  r = await O('POST', `/api/saas/growth/campaigns/${cid}/submit`, {});
  assert.equal(r.status, 201, r.text); assert.equal(r.json.run.status, 'awaiting_approval'); assert.equal(r.json.run.level, 3);
  assert.match(r.json.run.preview.expected_outcome, /1 email/); assert.match(r.json.run.preview.expected_outcome, /1 without consent, 1 unsubscribed/);
  assert.equal(mock.calls.filter((c) => c.path === '/resend/emails').length, 0, 'nothing is sent before approval');
  await approveRun(O, r.json.run.id);
  await sleep(900);
  const emails = mock.calls.filter((c) => c.path === '/resend/emails');
  assert.equal(emails.length, 1); assert.deepEqual(emails[0].body.to, ['ana@ruiz.example.test']);
  assert.match(emails[0].body.html, /Hi Ana/); assert.match(emails[0].body.html, /Unsubscribe/); assert.match(emails[0].body.html, /Sent by Harbour Plumbing/);
  assert.match(emails[0].body.headers['List-Unsubscribe'], /\/u\//); assert.equal(emails[0].body.headers['List-Unsubscribe-Post'], 'List-Unsubscribe=One-Click');
  let c = (await O('GET', `/api/saas/growth/campaigns/${cid}`)).json;
  assert.equal(c.campaign.status, 'sent'); assert.equal(c.campaign.stats.sent, 1);
  // Click tracking and one-click unsubscribe.
  const tok = emails[0].body.headers['List-Unsubscribe'].match(/\/u\/([^>]+)/)[1];
  const click = await fetch(`${s.base}/c/${tok}`, { redirect: 'manual' }); assert.equal(click.status, 302); assert.equal(click.headers.get('location'), 'https://harbour.example.test/book');
  assert.match(await (await fetch(`${s.base}/u/${tok}`)).text(), /Unsubscribe/, 'GET only asks, so link scanners cannot unsubscribe people');
  assert.equal(sql("SELECT COUNT(*) n FROM marketing_suppressions WHERE address='ana@ruiz.example.test'")[0].n, 0);
  assert.equal((await fetch(`${s.base}/u/${tok}`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: 'List-Unsubscribe=One-Click' })).status, 200);
  c = (await O('GET', `/api/saas/growth/campaigns/${cid}`)).json;
  assert.equal(c.campaign.stats.clicked, 1); assert.equal(c.campaign.stats.unsubscribed, 1);
  // A second campaign now has nobody to send to.
  r = await O('POST', '/api/saas/growth/campaigns', { name: 'Again', channel: 'email', subject: 'Another note for you', body: 'Hello again {first_name}.', segment: {} });
  assert.equal((await O('POST', `/api/saas/growth/campaigns/${r.json.campaign.id}/submit`, {})).status, 409, 'unsubscribed people are never sent to');
  // SMS: scheduled, includes the business name and STOP, and is not sent early.
  r = await O('POST', '/api/saas/growth/campaigns', { name: 'SMS reminder', channel: 'sms', body: 'Winter special on hot water checks. Book online.', send_at: new Date(Date.now() + 2500).toISOString(), segment: {} });
  const sid = r.json.campaign.id;
  r = await O('POST', `/api/saas/growth/campaigns/${sid}/submit`, {}); await approveRun(O, r.json.run.id); await sleep(600);
  assert.equal((await O('GET', `/api/saas/growth/campaigns/${sid}`)).json.campaign.status, 'scheduled');
  assert.equal(mock.calls.filter((x) => x.path === '/telnyx/messages').length, 0, 'not before its time');
  await sleep(6500);
  const texts = mock.calls.filter((x) => x.path === '/telnyx/messages');
  assert.equal(texts.length, 1, 'sent after its time'); assert.match(texts[0].body.text, /^Harbour Plumbing( Pty Ltd)?: /); assert.match(texts[0].body.text, /Reply STOP to opt out$/); assert.equal(texts[0].body.to, '+61400100100');
  // Editing after submitting: the approval cannot send the changed version.
  r = await O('POST', '/api/saas/growth/campaigns', { name: 'Edit me', channel: 'sms', body: 'Original text here.', segment: {} });
  const eid = r.json.campaign.id; r = await O('POST', `/api/saas/growth/campaigns/${eid}/submit`, {});
  sql('UPDATE comms_campaigns SET revision=revision+1, body=? WHERE id=?', 'Changed after approval was requested', eid);
  await approveRun(O, r.json.run.id); await sleep(400);
  const run = (await O('GET', `/api/saas/automation/runs/${r.json.run.id}`)).json.run;
  assert.equal(run.status, 'failed'); assert.match(run.error, /edited after it was submitted/);
  // Social campaign: posts join the content calendar as approved items.
  r = await O('POST', '/api/saas/growth/campaigns', { name: 'Before and after', channel: 'social', body: 'Another tidy hot water install in Cottesloe.', social_targets: ['facebook', 'instagram'], segment: {} });
  r = await O('POST', `/api/saas/growth/campaigns/${r.json.campaign.id}/submit`, {}); await approveRun(O, r.json.run.id); await sleep(300);
  assert.equal(sql("SELECT COUNT(*) n FROM growth_calendar WHERE organisation_id=? AND pillar='campaign' AND status='approved'", owner.org)[0].n, 2);
  // Separation: another business sees none of it.
  const other = await seedOwner(s, { business: 'Other Co', email: 'other3@other.example.test' });
  assert.equal((await s.call('GET', '/api/saas/growth/campaigns', { cookie: other.cookie })).json.campaigns.length, 0);
  assert.equal((await s.call('GET', `/api/saas/growth/campaigns/${cid}`, { cookie: other.cookie })).status, 404);
});

test('founder separation: platform campaigns go only to newsletter subscribers, from the platform sender, and never mix with business data', async (t) => {
  const { s, mock, owner, O, hook, sql, stop } = await setup(); t.after(stop);
  const F = (m, u, b) => s.call(m, u, { headers: { 'x-admin-key': s.adminKey }, body: b });
  sql("INSERT INTO newsletter_subscribers(id,email,full_name,source,status,consent_text,subscribed_at,updated_at) VALUES (?,?,?,?,?,?,?,?)", crypto.randomUUID(), 'reader@example.test', 'Pat Reader', 'public_site', 'subscribed', 'Send me product news', new Date().toISOString(), new Date().toISOString());
  sql("INSERT INTO newsletter_subscribers(id,email,full_name,source,status,consent_text,subscribed_at,updated_at) VALUES (?,?,?,?,?,?,?,?)", crypto.randomUUID(), 'gone@example.test', 'Gone', 'public_site', 'unsubscribed', 'x', new Date().toISOString(), new Date().toISOString());
  await hook('message.received', sms('+61412999000', 'Private customer message for the business'));
  assert.equal((await F('POST', '/api/operator/campaigns', { name: 'SMS blast', channel: 'sms', body: 'Hi all', segment: {} })).status, 400, 'platform campaigns are email to subscribers only');
  let r = await F('POST', '/api/operator/campaigns', { name: 'October update', channel: 'email', subject: 'What is new in Super Pro', body: 'Hi {first_name}, here is what changed this month.', segment: {} });
  assert.equal(r.status, 201, r.text); assert.equal(r.json.campaign.audience.eligible, 1);
  const pid = r.json.campaign.id;
  r = await F('POST', `/api/operator/campaigns/${pid}/submit`, {});
  assert.equal(r.status, 201, r.text);
  const pa = (await F('GET', '/api/operator/automation')).json.approvals.find((a) => a.run_id === r.json.run.id);
  assert.ok(pa, 'waits for founder approval in the platform queue');
  assert.equal((await O('GET', '/api/saas/approvals')).json.approvals.some((a) => a.automation_run_id === r.json.run.id), false, 'not in any business approval queue');
  await F('POST', `/api/operator/automation/approvals/${pa.id}/decision`, { decision: 'approve' }); await sleep(900);
  const mail = mock.calls.filter((c) => c.path === '/resend/emails');
  assert.equal(mail.length, 1); assert.deepEqual(mail[0].body.to, ['reader@example.test']); assert.equal(mail[0].body.from, 'Super Pro <hello@example.test>');
  assert.equal((await O('GET', '/api/saas/growth/campaigns')).json.campaigns.length, 0, 'businesses never see platform campaigns');
  assert.equal((await O('GET', `/api/saas/growth/campaigns/${pid}`)).status, 404);
  const ov = (await F('GET', '/api/operator/comms/overview')).json;
  assert.ok(ov.messages_30d >= 1); assert.ok(!JSON.stringify(ov).includes('Private customer message'), 'the founder sees counts, never business conversations');
  assert.equal((await O('GET', '/api/operator/campaigns')).status, 401);
  assert.equal((await s.call('GET', '/api/saas/comms/unified', { cookie: (await seedOwner(s, { business: 'W', email: 'w@w.example.test' })).cookie })).json.items.length, 0);
  void owner;
});

test('provider receipts: a Resend hard bounce or spam complaint suppresses the address for that business only', async (t) => {
  const { s, owner, sql, stop } = await setup(); t.after(stop);
  const now = new Date().toISOString(), cid = crypto.randomUUID();
  sql("INSERT INTO comms_campaigns(id,owner_key,name,channel,status,subject,body,created_at,updated_at,sent_at) VALUES (?,?,?,?,?,?,?,?,?,?)", cid, owner.org, 'Spring', 'email', 'sent', 'Spring check', 'Hi', now, now, now);
  for (const [addr, pid] of [['bounce@example.test', 'em-b1'], ['complain@example.test', 'em-c1']]) sql("INSERT INTO comms_campaign_recipients(campaign_id,owner_key,address,status,provider_id,token,sent_at) VALUES (?,?,?,'sent',?,?,?)", cid, owner.org, addr, pid, crypto.randomUUID(), now);
  const key = Buffer.from('comms-test-secret-0123456789abcdef');
  const post = async (type, emailId) => {
    const body = JSON.stringify({ type, created_at: now, data: { email_id: emailId } }), id = 'msg_' + crypto.randomUUID(), ts = String(Math.floor(Date.now() / 1000));
    const sig = crypto.createHmac('sha256', key).update(`${id}.${ts}.${body}`).digest('base64');
    const r = await fetch(s.base + '/api/webhooks/communications/resend', { method: 'POST', headers: { 'content-type': 'application/json', 'svix-id': id, 'svix-timestamp': ts, 'svix-signature': 'v1,' + sig }, body });
    assert.equal(r.status, 200, await r.text());
  };
  await post('email.bounced', 'em-b1'); await post('email.complained', 'em-c1'); await post('email.delivered', 'em-unknown');
  const rows = sql("SELECT address,reason source FROM marketing_suppressions WHERE owner_key=? ORDER BY address", owner.org);
  assert.deepEqual(rows.map((r) => [r.address, r.source]), [['bounce@example.test', 'bounce'], ['complain@example.test', 'complaint']]);
  assert.equal(sql("SELECT COUNT(*) n FROM marketing_suppressions WHERE owner_key<>?", owner.org)[0].n, 0, 'no other owner is affected');
});
