// Phase 07: conversation intelligence. Pure, deterministic functions that work without an AI provider; when one is
// connected it may improve the summary and the reply draft wording only. Every result says how it was produced.
// Customer text is data: nothing in it can change a recipient, an action or a record.

const has = (t, re) => re.test(t);
export const CATEGORIES = {
  enquiry: 'New enquiry', quote: 'Quote request', booking: 'Booking or reschedule', invoice: 'Invoice or payment', complaint: 'Complaint',
  support: 'Question about a job', supplier: 'Supplier or vendor', marketing_reply: 'Reply to marketing', unsubscribe: 'Unsubscribe request', spam: 'Spam', other: 'Other'
};
const RULES = [
  ['unsubscribe', /^\s*(stop|unsubscribe|opt[- ]?out|cancel|remove me|stopall|end|quit)\s*[.!]*\s*$/i],
  ['spam', /(crypto|bitcoin|forex|casino|viagra|seo services|rank #?1|guest post|backlinks? for|loan approved|you have won|claim your prize|telegram me|whatsapp me at|investment opportunity)/i],
  ['complaint', /(complain|unhappy|disappointed|terrible|awful|worst|rude|not happy|poor (service|job|work)|refund|lawyer|solicitor|ombudsman|fair trading|accc|tribunal|damag(ed|e) (my|our))/i],
  ['invoice', /(invoice|receipt|paid|payment|bank transfer|overdue|remittance|bill|statement|direct debit|card declined|bpay)/i],
  ['booking', /(reschedul|change (the )?(time|date|booking)|cancel (the|my) (booking|appointment|job)|what time|running late|are you (still )?coming|confirm (the|my) (booking|appointment))/i],
  ['quote', /(quote|quotation|estimate|how much|price|pricing|cost|rates?)\b/i],
  ['supplier', /(supplier|wholesale|distributor|our products|sales rep|catalogue|trade account|purchase order)/i],
  ['support', /(job number|work order|you (were|came) (here|out)|last (week|visit)|warranty|still (leaking|broken|not working))/i],
  ['enquiry', /(can you|do you|are you able|i need|we need|looking for|interested in|would like|enquir|inquir|help with|book (a|an|in))/i]
];
export function categorise(text, { subject = '', inReplyToCampaign = false } = {}) {
  const t = `${subject || ""} ${text || ""}`.trim();
  if (!t) return { category: 'other', confidence: 0.2, method: 'rules' };
  for (const [cat, re] of RULES) if (has(t, re)) return { category: inReplyToCampaign && ['enquiry', 'quote', 'other'].includes(cat) ? 'marketing_reply' : cat, confidence: cat === 'unsubscribe' ? 0.99 : 0.7, method: 'rules' };
  return { category: inReplyToCampaign ? 'marketing_reply' : 'other', confidence: 0.3, method: 'rules' };
}

const POS = ['thank', 'thanks', 'great', 'excellent', 'awesome', 'happy', 'perfect', 'appreciate', 'love', 'brilliant', 'fantastic', 'pleased', 'wonderful', 'helpful', 'amazing'];
const NEG = ['angry', 'unhappy', 'disappointed', 'terrible', 'awful', 'worst', 'rude', 'useless', 'late', 'never', 'broken', 'leaking', 'damage', 'damaged', 'refund', 'complain', 'complaint', 'waste', 'ridiculous', 'unacceptable', 'poor', 'frustrated', 'annoyed', 'still', 'again'];
export function sentiment(text) {
  const w = String(text || '').toLowerCase().match(/[a-z']+/g) || [];
  let score = 0; for (const x of w) { if (POS.some((p) => x.startsWith(p))) score += 1; if (NEG.some((n) => x === n || x.startsWith(n))) score -= 1; }
  if (/!{2,}|\b[A-Z]{4,}\b/.test(String(text || ''))) score -= 1;
  const label = score <= -2 ? 'negative' : score < 0 ? 'concerned' : score >= 2 ? 'positive' : 'neutral';
  return { label, score, method: 'rules', note: 'An indicator from the words used, not a judgement of the customer.' };
}

export function summarise(text, { maxWords = 28 } = {}) {
  const clean = String(text || '').replace(/\s+/g, ' ').replace(/^(hi|hello|hey|dear)\b[^,.!]*[,.!]\s*/i, '').trim();
  if (!clean) return { summary: '', method: 'rules' };
  const first = clean.split(/(?<=[.!?])\s+/).find((s) => s.split(' ').length >= 4) || clean;
  const words = first.split(' ');
  return { summary: words.length > maxWords ? words.slice(0, maxWords).join(' ') + '…' : first, method: 'rules' };
}

export function extractDetails(text) {
  const t = String(text || '');
  return {
    email: (t.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i) || [])[0]?.toLowerCase() || null,
    phone: ((t.match(/(?:\+?61|0)[2-478](?:[ -]?\d){8}/) || [])[0] || '').replace(/[^\d+]/g, '') || null,
    postcode: (t.match(/\b[0-9]{4}\b(?=\D*$)/) || [])[0] || null,
    when: (t.match(/\b(today|tomorrow|tonight|this (morning|afternoon|week|weekend)|next (week|monday|tuesday|wednesday|thursday|friday|saturday|sunday)|asap|urgent(ly)?)\b/i) || [])[0] || null
  };
}

// Lead qualification: a transparent score with its reasons. Uses the business's own services and areas only.
export function qualifyLead({ text = '', category, services = [], areas = [], contact = {}, customer = null }) {
  const t = String(text || '').toLowerCase(), reasons = [];
  let score = 0;
  if (['enquiry', 'quote', 'booking'].includes(category)) { score += 30; reasons.push('Asks about work'); }
  const service = services.find((s) => String(s).toLowerCase().split(/\s+/).filter((w) => w.length > 3).some((w) => t.includes(w.replace(/s$/, ''))));
  if (service) { score += 25; reasons.push(`Matches your service "${service}"`); }
  const area = areas.find((a) => a && t.includes(String(a).toLowerCase()));
  if (area) { score += 15; reasons.push(`In your area (${area})`); }
  const d = extractDetails(text);
  if (contact.email || contact.phone || d.email || d.phone) { score += 10; reasons.push('Left contact details'); }
  if (d.when) { score += 10; reasons.push(`Timing given ("${d.when}")`); }
  if (customer) { score += 10; reasons.push('Existing customer'); }
  if (['spam', 'unsubscribe', 'supplier'].includes(category)) { score = 0; reasons.splice(0, reasons.length, 'Not a sales lead'); }
  const band = score >= 60 ? 'hot' : score >= 35 ? 'warm' : score > 0 ? 'cold' : 'none';
  return { score: Math.min(100, score), band, reasons, basis: 'estimate' };
}

export function escalation({ category, sentiment: s, text = '', customer = null, valueCents = 0 }) {
  const reasons = [];
  if (category === 'complaint') reasons.push('Complaint');
  if (s?.label === 'negative') reasons.push('Negative wording');
  if (/(lawyer|solicitor|ombudsman|fair trading|accc|tribunal|court|legal action|chargeback)/i.test(text)) reasons.push('Mentions legal or regulator action');
  if (/(gas leak|smell gas|sparking|electric shock|flood(ing)?|fire|injur|unsafe|danger)/i.test(text)) reasons.push('Possible safety issue');
  if (customer && valueCents >= 500000) reasons.push('High-value customer');
  const level = reasons.some((r) => /legal|safety/i.test(r)) ? 'urgent' : reasons.length >= 2 ? 'high' : reasons.length ? 'normal' : 'none';
  return { recommended: level !== 'none', level, reasons, recommendation: level === 'urgent' ? 'Call the customer today and tell the owner.' : level === 'high' ? 'Owner or manager should reply personally.' : level === 'normal' ? 'Reply personally rather than with a template.' : null };
}

// Duplicate detection: the same person on several channels, the same message twice, or a contact matching several customers.
export function duplicates({ thread, otherThreads = [], recentMessages = [], customers = [] }) {
  const out = [];
  const name = String(thread.contact_name || '').toLowerCase().trim();
  for (const o of otherThreads) {
    if (o.id === thread.id) continue;
    if ((name && name.length > 3 && String(o.contact_name || '').toLowerCase().trim() === name) || (o.customer_id && o.customer_id === thread.customer_id)) out.push({ type: 'same_person_other_channel', thread_id: o.id, channel: o.channel, note: `Looks like the same person on ${o.channel}.` });
  }
  const seen = new Map();
  for (const m of recentMessages) { const k = String(m.body || '').trim().toLowerCase().replace(/\s+/g, ' '); if (k.length < 12) continue; if (seen.has(k)) out.push({ type: 'repeated_message', message_id: m.id, first_id: seen.get(k), note: 'The same message arrived more than once.' }); else seen.set(k, m.id); }
  if (customers.length > 1) out.push({ type: 'several_customers', customer_ids: customers.map((c) => c.id), note: `This contact matches ${customers.length} customer records. Consider merging them.` });
  return out;
}

export function followUps({ threads = [], now = Date.now() }) {
  const H = 3600000, out = [];
  for (const t of threads) {
    const age = (now - Date.parse(t.last_inbound_at || t.last_message_at)) / H;
    if (t.status === 'needs_reply' && t.folder !== 'spam' && age >= 4) out.push({ thread_id: t.id, contact: t.contact_name || t.contact_address, reason: `Waiting for a reply for ${Math.round(age)} hours`, urgency: age >= 24 || t.escalation_level === 'urgent' ? 'high' : 'normal' });
    else if (t.last_direction === 'outbound' && ['quote', 'enquiry'].includes(t.category) && age >= 72 && age < 24 * 21) out.push({ thread_id: t.id, contact: t.contact_name || t.contact_address, reason: `No answer to your last message for ${Math.round(age / 24)} days`, urgency: 'normal' });
  }
  return out.sort((a, b) => (a.urgency === 'high' ? -1 : 1) - (b.urgency === 'high' ? -1 : 1)).slice(0, 50);
}

// Reply draft from the facts we hold. Never promises prices, times or outcomes we do not know.
export function draftReply({ thread, category, business = 'our team', details = {}, customerName = '' }) {
  const first = String(customerName || thread.contact_name || '').split(' ')[0];
  const hi = first && !/^\+?\d/.test(first) ? `Hi ${first},` : 'Hi,';
  const body = {
    enquiry: 'Thanks for getting in touch. We can help with that. Could you send the address and a good time to call so we can confirm the details?',
    quote: 'Thanks for asking for a quote. To price it accurately, could you send the address, a short description and a photo if you have one? We will come back to you with a written quote.',
    booking: 'Thanks for letting us know. We will check the schedule and confirm a new time with you shortly.',
    invoice: 'Thanks for your message about the invoice. We are checking it now and will reply with the details shortly.',
    complaint: 'Thank you for telling us, and we are sorry this has happened. We would like to put it right. Could you let us know a good time to call you?',
    support: 'Thanks for getting back to us. We are looking into it and will contact you shortly.',
    marketing_reply: 'Thanks for your reply. We will be in touch shortly.',
    other: 'Thanks for your message. We will get back to you shortly.'
  }[category] || 'Thanks for your message. We will get back to you shortly.';
  return { text: `${hi}\n\n${body}${details.when ? `\n\nYou mentioned "${details.when}"; we will do our best to fit that in.` : ''}\n\n${business}`, method: 'template' };
}

export function analyseThread({ thread, messages = [], services = [], areas = [], customer = null, inReplyToCampaign = false }) {
  const inbound = messages.filter((m) => m.direction === 'inbound');
  const text = inbound.slice(-3).map((m) => m.body).join('\n');
  const cat = categorise(text, { subject: thread.subject, inReplyToCampaign });
  const s = sentiment(text), sum = summarise(inbound.at(-1)?.body || text), details = extractDetails(text);
  return { category: cat.category, category_label: CATEGORIES[cat.category], confidence: cat.confidence, sentiment: s, summary: sum.summary, details, lead: qualifyLead({ text, category: cat.category, services, areas, contact: { email: thread.channel === 'email' ? thread.contact_address : null, phone: ['sms', 'voice', 'whatsapp'].includes(thread.channel) ? thread.contact_address : null }, customer }), escalation: escalation({ category: cat.category, sentiment: s, text, customer }), method: 'rules' };
}
