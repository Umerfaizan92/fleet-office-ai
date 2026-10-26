// Text messages for payment receipts and reminders (Telnyx). Never throws; reports why a message was not sent.
const usable = (v) => { const t = String(v || '').trim(); return Boolean(t) && !/^(YOUR_|REPLACE_|CHANGE_ME|CHANGEME)/i.test(t); };

export async function sendTextMessage(env, { to, text }, fetchImpl = globalThis.fetch) {
  const from = env.TELNYX_FROM_NUMBER || env.TELNYX_PHONE_NUMBER;
  if (!usable(env.TELNYX_API_KEY) || !usable(from)) return { sent: false, reason: 'sms_not_configured' };
  const number = String(to || '').replace(/[^\d+]/g, '');
  if (!/^\+?\d{8,15}$/.test(number)) return { sent: false, reason: 'no_valid_mobile_number' };
  try {
    const r = await fetchImpl('https://api.telnyx.com/v2/messages', { method: 'POST', headers: { authorization: `Bearer ${env.TELNYX_API_KEY}`, 'content-type': 'application/json' }, body: JSON.stringify({ from, to: number, text: String(text).slice(0, 600) }) });
    const d = await r.json().catch(() => ({}));
    return r.ok ? { sent: true, message_id: d?.data?.id || null } : { sent: false, reason: String(d?.errors?.[0]?.detail || `HTTP ${r.status}`).slice(0, 200) };
  } catch (err) { return { sent: false, reason: String(err.message || err).slice(0, 200) }; }
}
