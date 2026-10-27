import {trackCommunication} from './message-delivery.js';
// Text messages for payment receipts and reminders (Telnyx). Never throws; reports why a message was not sent.
const usable = (v) => { const t = String(v || '').trim(); return Boolean(t) && !/^(YOUR_|REPLACE_|CHANGE_ME|CHANGEME)/i.test(t); };

export async function sendTextMessage(env, { to, text, delivery = null }, fetchImpl = globalThis.fetch) {
  const finish=result=>{trackCommunication(delivery?{...delivery,channel:'sms',recipient:to}:null,result);return result};
  const from = env.TELNYX_FROM_NUMBER || env.TELNYX_PHONE_NUMBER;
  if (!usable(env.TELNYX_API_KEY) || !usable(from)) return finish({ sent: false, reason: 'sms_not_configured' });
  const number = String(to || '').replace(/[^\d+]/g, '').replace(/^04/,'+614').replace(/^614/,'+614');
  if (!/^\+?\d{8,15}$/.test(number)) return finish({ sent: false, reason: 'no_valid_mobile_number' });
  try {
    const r = await fetchImpl('https://api.telnyx.com/v2/messages', { method: 'POST', headers: { authorization: `Bearer ${env.TELNYX_API_KEY}`, 'content-type': 'application/json' }, body: JSON.stringify({ from, to: number, text: String(text).slice(0, 1600) }) });
    const d = await r.json().catch(() => ({}));
    return finish(r.ok ? { sent: true, message_id: d?.data?.id || null } : { sent: false, reason: String(d?.errors?.[0]?.detail || `HTTP ${r.status}`).slice(0, 200) });
  } catch (err) { return finish({ sent: false, reason: String(err.message || err).slice(0, 200) }); }
}
