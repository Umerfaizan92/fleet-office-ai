// Phase 07: Unified Inbox, Call Handling, Campaign Studio and Consent & Unsubscribes for the business workspace.
// The Founder Console reuses the campaign view (window.SuperProComms.mountFounder) for Super Pro's own newsletter,
// which goes only to platform newsletter subscribers and never touches any business's customers.
// Nothing here reports success unless the server confirmed it. Every outgoing reply and every bulk send needs approval.
(() => {
  const el = (tag, attrs = {}, ...kids) => {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) { if (v === null || v === undefined || v === false) continue; if (k === 'class') e.className = v; else if (k === 'text') e.textContent = v; else if (k.startsWith('on')) e.addEventListener(k.slice(2), v); else if (k === 'value') e.value = v; else if (k === 'checked') e.checked = Boolean(v); else e.setAttribute(k, v === true ? '' : v); }
    for (const k of kids.flat()) if (k !== null && k !== undefined && k !== false) e.append(k.nodeType ? k : document.createTextNode(String(k)));
    return e;
  };
  const defaultApi = async (path, opt = {}) => {
    const r = await fetch(path, { credentials: 'same-origin', ...opt, headers: { 'Content-Type': 'application/json', ...(opt.headers || {}) } });
    let d = {}; try { d = await r.json(); } catch { /* not JSON */ }
    if (!r.ok || d.ok === false) throw new Error(d.error || `The server refused this action (${r.status}).`);
    return d;
  };
  const when = (v) => (v ? new Date(v).toLocaleString('en-AU', { dateStyle: 'medium', timeStyle: 'short' }) : '');
  const CH = { voice: 'Call', email: 'Email', sms: 'SMS', whatsapp: 'WhatsApp', facebook: 'Facebook', instagram: 'Instagram', tiktok: 'TikTok', x: 'X', snapchat: 'Snapchat', website: 'Website form', social: 'Social' };
  const STATUS = { received: 'Received', needs_reply: 'Needs reply', open: 'Open', closed: 'Closed', draft: 'Draft', pending_approval: 'Waiting for approval', approved: 'Approved', rejected: 'Rejected', sending: 'Sending', sent: 'Sent', delivered: 'Delivered', opened: 'Opened', failed: 'Failed', partly_failed: 'Partly failed', scheduled: 'Scheduled', cancelled: 'Cancelled', waiting: 'Scheduled' };
  const TONE = { needs_reply: 'pl-issued', pending_approval: 'pl-issued', scheduled: 'pl-issued', failed: 'pl-cancelled', partly_failed: 'pl-cancelled', rejected: 'pl-cancelled', sent: 'pl-paid', delivered: 'pl-paid', approved: 'pl-paid', urgent: 'pl-cancelled', high: 'pl-issued', hot: 'pl-paid', warm: 'pl-issued', negative: 'pl-cancelled', positive: 'pl-paid' };
  const chip = (key, text) => el('span', { class: 'portal-status ' + (TONE[key] || 'pl-draft'), text: text || STATUS[key] || key });
  const FOLDERS = [['inbox', 'Inbox'], ['sent', 'Sent'], ['drafts', 'Drafts'], ['scheduled', 'Scheduled'], ['archived', 'Archived'], ['failed', 'Failed'], ['spam', 'Spam']];
  const VIEWS_IN = [['all', 'Everything'], ['customers', 'Customers'], ['enquiries', 'Enquiries'], ['invoices', 'Invoices'], ['marketing', 'Marketing']];
  const VIEWS = {
    unifiedinbox: ['Unified Inbox', 'Email, SMS, WhatsApp, calls, voicemail, website forms and social messages in one place. Super Pro sorts and summarises each conversation and drafts replies; nothing is sent until an authorised person approves it.'],
    voiceflow: ['Call Handling', 'How your number answers: the AI receptionist, transfer to a person, voicemail, and what happens if a step fails. Every call is logged in the Unified Inbox with its transcript.'],
    campaignstudio: ['Campaign Studio', 'Email, SMS and social campaigns. Only people who agreed to marketing receive them, every message has a working unsubscribe, and nothing is sent until an authorised person approves it.'],
    consent: ['Consent & Unsubscribes', 'Who agreed to marketing, on which channel and how, plus everyone who unsubscribed or replied STOP. Suppressed addresses are never sent marketing.']
  };
  const HASH = { unifiedinbox: 'b04/unified', voiceflow: 'b04/voice', campaignstudio: 'b05/campaign-studio', consent: 'b05/consent' };
  const localInput = (iso) => { if (!iso) return ''; const d = new Date(iso); const p = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`; };
  const toIso = (v) => (v ? new Date(v).toISOString() : null);
  let uid = 0; const id = (p) => `${p}-${++uid}`;
  const field = (label, input, hint) => { const fid = input.id || (input.id = id('cx')); return el('div', { class: 'cx-field' }, el('label', { for: fid, text: label }), input, hint ? el('small', { text: hint }) : null); };
  const check = (label, attrs = {}) => { const i = el('input', { type: 'checkbox', id: id('cx'), ...attrs }); return el('label', { class: 'cx-check', for: i.id }, i, ' ', label); };

  function Comms(host, { api = defaultApi, founder = false } = {}) {
    const say = (t, bad = false) => { const p = host.querySelector('[data-cx-status]'); if (p) { p.textContent = t; p.dataset.tone = bad ? 'bad' : 'good'; } if (!bad) window.SPMotion?.toast?.(t); };
    const busy = async (btn, fn) => { if (btn) btn.disabled = true; try { await fn(); } catch (e) { say(e.message, true); } finally { if (btn) btn.disabled = false; } };
    const post = (p, b, m = 'POST') => api(p, { method: m, body: JSON.stringify(b || {}) });
    const body = () => { let b = host.querySelector('[data-cx-body]'); const n = el('div', { 'data-cx-body': '' }); if (b) b.replaceWith(n); else host.append(n); return n; };
    const section = (title, ...kids) => el('section', { class: 'portal-panel cx-panel' }, el('h2', { text: title }), ...kids);
    const empty = (t) => el('p', { class: 'portal-empty', text: t });
    const table = (cols, rows, emptyText = 'Nothing yet.') => {
      if (!rows?.length) return empty(emptyText);
      return el('div', { class: 'au-tablewrap' }, el('table', { class: 'au-table' }, el('thead', {}, el('tr', {}, cols.map(([, h]) => el('th', { scope: 'col', text: h })))),
        el('tbody', {}, rows.map((r) => el('tr', {}, cols.map(([k, , f], i) => { const v = f ? f(r[k], r) : String(r[k] ?? ''); return i === 0 ? el('th', { scope: 'row' }, v) : el('td', {}, v); }))))));
    };
    const campBase = founder ? '/api/operator/campaigns' : '/api/saas/growth/campaigns';

    async function render(view, arg) {
      host.dataset.cxView = view;
      if (!host.querySelector('[data-cx-status]')) host.append(el('p', { class: 'portal-note pl-status', role: 'status', 'aria-live': 'polite', 'data-cx-status': '' }));
      const b = body();
      b.append(el('p', { class: 'pl-meta', text: 'Loading…' }));
      try { await R[view](b, arg); b.querySelector(':scope > .pl-meta')?.remove(); } catch (e) { b.replaceChildren(el('p', { class: 'portal-note', 'data-tone': 'bad', text: e.message })); }
    }

    const state = { folder: 'inbox', view: 'all', q: '', open: null };
    const R = {
      // ---------------- Unified Inbox ----------------
      async unifiedinbox(b) {
        const qs = new URLSearchParams({ folder: state.folder, view: state.view, q: state.q });
        const [d, s] = await Promise.all([api('/api/saas/comms/unified?' + qs), api('/api/saas/comms/unified/suggestions')]);
        const folders = el('div', { class: 'au-tabs cx-folders', role: 'tablist', 'aria-label': 'Folders' }, FOLDERS.map(([k, t]) => el('button', { type: 'button', role: 'tab', class: 'portal-button', 'aria-selected': String(k === state.folder), onclick: () => { state.folder = k; state.open = null; render('unifiedinbox'); } }, t, d.counts[k] ? el('span', { class: 'cx-count', text: String(d.counts[k]) }) : null)));
        const viewSel = el('select', { id: id('cx'), onchange: (e) => { state.view = e.target.value; render('unifiedinbox'); } }, VIEWS_IN.map(([k, t]) => el('option', { value: k, text: t, selected: k === state.view || null })));
        const search = el('input', { type: 'search', id: id('cx'), value: state.q, placeholder: 'Name, number, email or subject', maxlength: '80' });
        const filters = el('form', { class: 'cx-filters', role: 'search', onsubmit: (e) => { e.preventDefault(); state.q = search.value.trim(); render('unifiedinbox'); } }, field('Show', viewSel), field('Search', search), el('button', { type: 'submit', class: 'portal-button', text: 'Search' }), el('button', { type: 'button', class: 'portal-button', text: 'Refresh', onclick: () => render('unifiedinbox') }));
        b.append(suggestionsPanel(s), folders, filters);
        const list = el('ul', { class: 'cx-list', 'aria-label': 'Conversations' });
        const detail = el('div', { class: 'cx-detail', 'aria-live': 'polite' });
        for (const it of d.items) {
          const open = () => { state.open = it.type === 'message' ? it.thread_id : it.type === 'conversation' ? it.id : null; if (state.open) showThread(state.open, detail); else if (it.type === 'campaign') location.hash = HASH.campaignstudio; else location.hash = 'b04/email'; };
          list.append(el('li', {}, el('button', { type: 'button', class: 'cx-item', 'aria-current': String(state.open && state.open === (it.thread_id || it.id)), onclick: open },
            el('span', { class: 'cx-row' }, el('b', { text: it.contact || 'Unknown' }), el('small', { text: when(it.at) })),
            el('span', { class: 'cx-row' }, el('small', { text: `${CH[it.channel] || it.channel}${it.source ? ' · ' + it.source : ''}${it.subject ? ' · ' + it.subject : ''}` }), chip(it.status)),
            el('span', { class: 'cx-preview', text: it.preview || '' }),
            it.ai ? el('span', { class: 'cx-tags' }, el('span', { class: 'portal-status pl-draft', text: it.ai.category_label || it.ai.category }), ['urgent', 'high'].includes(it.ai.escalation) ? chip(it.ai.escalation, it.ai.escalation === 'urgent' ? 'Urgent' : 'High priority') : null, it.ai.lead_band && it.ai.lead_band !== 'cold' ? chip(it.ai.lead_band, `${it.ai.lead_band === 'hot' ? 'Hot' : 'Warm'} lead (estimate)`) : null, it.ai.duplicates ? el('span', { class: 'portal-status pl-lost', text: 'Possible duplicate' }) : null) : null,
            it.scheduled_for ? el('small', { text: 'Sends ' + when(it.scheduled_for) }) : null, it.error ? el('small', { class: 'cx-error', text: it.error }) : null)));
        }
        b.append(el('div', { class: 'cx-split' }, d.items.length ? list : empty(state.folder === 'inbox' ? 'No conversations here yet. Messages, calls and website forms appear as they arrive.' : 'Nothing in this folder.'), detail));
        if (state.open) showThread(state.open, detail);
      },
      // ---------------- Call Handling ----------------
      async voiceflow(b) {
        const d = await api('/api/saas/comms/voice');
        const s = d.settings;
        b.append(section('Your number', d.number ? el('p', { text: `${d.number.address} · ${d.number.status === 'active' ? 'Active' : d.number.status}` }) : el('p', { text: 'No phone number yet. Add one in Communications > Phone Numbers.' }),
          d.profile ? el('p', { class: 'sx-source', text: `AI Receptionist profile: ${d.profile.status}. Opening hours: ${d.profile.hours || 'not set'}${d.profile.timezone ? ' (' + d.profile.timezone + ')' : ''}.` }) : el('p', { class: 'portal-note', text: 'Set up the AI Receptionist profile (business details, hours and services) so the assistant can answer accurately.' })));
        const mode = el('select', { id: id('cx'), name: 'mode' }, [['assistant', 'AI receptionist answers'], ['forward', 'Transfer straight to a person'], ['voicemail', 'Voicemail only']].map(([k, t]) => el('option', { value: k, text: t, selected: s.mode === k || null })));
        const tnum = el('input', { type: 'tel', id: id('cx'), name: 'transfer_number', autocomplete: 'off', placeholder: s.transfer_number ? `Saved (${s.transfer_number}). Enter a new number to change it.` : '+61 4xx xxx xxx' });
        const twhen = el('select', { id: id('cx'), name: 'transfer_when' }, [['on_request', 'When the caller asks, or the assistant cannot help'], ['fallback', 'Only if the assistant fails']].map(([k, t]) => el('option', { value: k, text: t, selected: s.transfer_when === k || null })));
        const notice = check('Tell callers the call is transcribed (needed before transcripts are kept)', { name: 'recording_notice', checked: s.recording_notice });
        const greet = el('textarea', { id: id('cx'), name: 'voicemail_greeting', rows: '3', maxlength: '600', text: s.voicemail_greeting || '' });
        const form = el('form', { class: 'cx-form', onsubmit: (e) => { e.preventDefault(); const btn = form.querySelector('button[type=submit]'); busy(btn, async () => { const payload = { mode: mode.value, transfer_when: twhen.value, recording_notice: notice.querySelector('input').checked, voicemail_greeting: greet.value.trim() || undefined }; if (tnum.value.trim()) payload.transfer_number = tnum.value.trim(); await post('/api/saas/comms/voice/settings', payload, 'PUT'); say('Call handling saved.'); render('voiceflow'); }); } },
          field('When a call comes in', mode), field('Transfer number', tnum, 'Used for transfers during opening hours. Shown masked once saved.'), field('Transfer', twhen), notice, field('Voicemail greeting', greet, 'Played before recording a message. Leave blank for a standard greeting with your business name.'),
          el('p', { class: 'sx-source', text: 'If a step fails: the assistant falls back to transfer (during opening hours), then voicemail, then a short apology. Each failure is recorded on the call.' }),
          el('div', { class: 'pl-actions' }, el('button', { type: 'submit', class: 'portal-button primary', text: 'Save call handling' })));
        b.append(section('Call handling', form));
        const live = (c) => c.stage !== 'ended' ? el('button', { type: 'button', class: 'portal-button', text: 'Transfer to me', onclick: (e) => busy(e.target, async () => { const r = await post(`/api/saas/comms/voice/calls/${encodeURIComponent(c.call_control_id)}/transfer`); say(r.message); }) }) : null;
        const outcome = (c) => c.voicemail ? 'Voicemail' : c.transferred_to_human ? 'Transferred to a person' : c.stage === 'ended' ? (c.answered_at ? 'Answered' : 'Missed') : 'In progress';
        b.append(section('Recent calls', table([['from_number', 'Caller'], ['started_at', 'Started', when], ['duration_seconds', 'Length', (v) => (v ? `${Math.round(v / 60)} min ${v % 60} s` : '—')], ['stage', 'Outcome', (v, c) => outcome(c)], ['failures', 'Problems', (v) => (v.length ? v.map((f) => f.step).join(', ') : 'None')], ['transcript', 'Transcript', (v) => (v ? el('details', {}, el('summary', { text: 'Read' }), el('p', { class: 'cx-transcript', text: v })) : '—')], ['call_control_id', '', (v, c) => live(c)]], d.calls, 'No calls yet.')));
      },
      // ---------------- Campaign Studio ----------------
      async campaignstudio(b, editId) {
        const d = await api(campBase);
        if (founder) { try { const o = await api('/api/operator/comms/overview'); b.append(section('Communications overview', el('p', { class: 'sx-source', text: o.note }), table([['k', 'Measure'], ['v', 'Count']], [{ k: 'Businesses using the inbox', v: o.businesses_with_inbox }, { k: 'Messages, last 30 days (all businesses)', v: o.messages_30d }, { k: 'Calls, last 30 days', v: o.calls_30d }, { k: 'Calls with a failed step', v: o.call_failures_30d }, { k: 'Newsletter subscribers', v: o.newsletter?.subscribed || 0 }, { k: 'Newsletter unsubscribes', v: o.newsletter?.unsubscribed || 0 }, { k: 'Platform suppressions', v: o.platform_suppressions }]))); } catch (e) { b.append(el('p', { class: 'portal-note', 'data-tone': 'bad', text: e.message })); } }
        const editing = editId ? d.campaigns.find((c) => c.id === editId) : null;
        b.append(builder(editing));
        b.append(section(founder ? 'Super Pro newsletter campaigns' : 'Campaigns', table([['name', 'Campaign'], ['channel', 'Channel', (v) => CH[v] || v], ['status', 'Status', (v) => chip(v)], ['audience', 'Audience', (v, c) => (c.channel === 'social' ? (c.social_targets || []).join(', ') || '—' : `${v.eligible} eligible`)], ['stats', 'Results', (v, c) => (c.channel === 'social' ? 'See content calendar' : `${v.sent} sent · ${v.clicked} clicked · ${v.unsubscribed} unsubscribed${v.failed ? ` · ${v.failed} failed` : ''}`)], ['id', '', (cid, c) => el('span', { class: 'pl-actions' }, el('button', { type: 'button', class: 'portal-button', text: 'Open', onclick: () => openCampaign(cid, b) }), ['draft', 'rejected', 'pending_approval', 'approved'].includes(c.status) ? el('button', { type: 'button', class: 'portal-button', text: 'Edit', onclick: () => render('campaignstudio', cid) }) : null)]], d.campaigns, 'No campaigns yet. Write one above.')));
      },
      // ---------------- Consent ----------------
      async consent(b) {
        const d = await api('/api/saas/comms/consents');
        const ch = () => el('select', { id: id('cx'), name: 'channel' }, el('option', { value: 'email', text: 'Email' }), el('option', { value: 'sms', text: 'SMS' }));
        const c1 = ch(), a1 = el('input', { id: id('cx'), name: 'address', required: true, maxlength: '254', autocomplete: 'off' }), st = el('select', { id: id('cx'), name: 'status' }, el('option', { value: 'granted', text: 'Agreed to marketing' }), el('option', { value: 'withdrawn', text: 'Withdrew agreement' })), ev = el('input', { id: id('cx'), name: 'evidence', required: true, minlength: '5', maxlength: '500', placeholder: 'For example: ticked the box on the booking form, 3 March' });
        const f1 = el('form', { class: 'cx-form', onsubmit: (e) => { e.preventDefault(); busy(f1.querySelector('[type=submit]'), async () => { await post('/api/saas/comms/consents', { channel: c1.value, address: a1.value.trim(), status: st.value, evidence: ev.value.trim() }); say('Consent recorded.'); render('consent'); }); } }, field('Channel', c1), field('Email or mobile', a1), field('Choice', st), field('How you know', ev, 'Keep a record of how and when the person agreed.'), el('div', { class: 'pl-actions' }, el('button', { type: 'submit', class: 'portal-button primary', text: 'Record consent' })));
        const c2 = ch(), a2 = el('input', { id: id('cx'), name: 'address', required: true, maxlength: '254', autocomplete: 'off' }), rs = el('input', { id: id('cx'), name: 'reason', required: true, minlength: '3', maxlength: '200', placeholder: 'For example: asked by phone not to be contacted' });
        const f2 = el('form', { class: 'cx-form', onsubmit: (e) => { e.preventDefault(); busy(f2.querySelector('[type=submit]'), async () => { await post('/api/saas/comms/suppressions', { channel: c2.value, address: a2.value.trim(), reason: rs.value.trim() }); say('Address added to the do-not-contact list.'); render('consent'); }); } }, field('Channel', c2), field('Email or mobile', a2), field('Reason', rs), el('div', { class: 'pl-actions' }, el('button', { type: 'submit', class: 'portal-button', text: 'Add to do-not-contact list' })));
        const SRC = { website_form: 'Website form', recorded_by_staff: 'Recorded by staff', stop_reply: 'Replied STOP', link: 'Unsubscribe link', 'one-click': 'One-click unsubscribe', manual: 'Added by staff', unsubscribe: 'Unsubscribe link', unsubscribe_reply: 'Replied unsubscribe', bounce: 'Bounced', complaint: 'Spam complaint' };
        b.append(el('div', { class: 'cx-two' }, section('Record consent', f1), section('Do not contact', f2)),
          section('Marketing consent', table([['address', 'Address'], ['channel', 'Channel', (v) => CH[v]], ['status', 'Status', (v) => chip(v === 'granted' ? 'approved' : 'rejected', v === 'granted' ? 'Agreed' : 'Withdrawn')], ['source', 'Source', (v) => SRC[v] || v], ['evidence', 'Evidence'], ['updated_at', 'Updated', when]], d.consents, 'No consent recorded yet. Website forms record it when the person ticks the marketing box.')),
          section('Unsubscribed and suppressed', table([['address', 'Address'], ['channel', 'Channel', (v) => CH[v]], ['reason', 'How', (v) => SRC[v] || v], ['source', 'Details'], ['created_at', 'Since', when]], d.suppressions, 'Nobody has unsubscribed.')));
      }
    };

    function suggestionsPanel(s) {
      const items = [
        ...s.escalations.map((x) => ({ t: x.thread_id, tone: x.level || 'urgent', label: 'Escalation', text: `${x.contact}: ${(x.reasons || []).join(', ') || x.summary || ''}` })),
        ...s.follow_ups.map((x) => ({ t: x.thread_id, tone: x.urgency === 'high' ? 'high' : 'draft', label: 'Follow up', text: `${x.contact}: ${x.reason}` })),
        ...s.leads.map((x) => ({ t: x.thread_id, tone: x.band, label: `${x.band === 'hot' ? 'Hot' : 'Warm'} lead · estimate ${x.score}/100`, text: `${x.contact}: ${x.reasons.join(', ')}` })),
        ...s.duplicates.map((x) => ({ t: x.thread_id, tone: 'draft', label: 'Possible duplicate', text: `${x.contact}: ${x.items.length} similar record(s)` }))
      ].slice(0, 8);
      const rem = s.reminders;
      return section('Needs attention', items.length ? el('ul', { class: 'cx-suggest' }, items.map((x) => el('li', {}, chip(x.tone, x.label), ' ', el('button', { type: 'button', class: 'cx-linkbtn', text: x.text, onclick: () => { state.folder = 'inbox'; state.open = x.t; render('unifiedinbox'); } })))) : empty('Nothing waiting. Follow-ups, escalations, likely leads and duplicates appear here.'),
        el('p', { class: 'sx-source', text: rem.upcoming.length ? `${rem.upcoming.length} booking(s) in the next 2 days. Appointment reminders are ${rem.rule_on ? 'on' : 'off'}${rem.rule_on ? '' : '; turn them on in AI Automations'}.` : `No bookings in the next 2 days. Appointment reminders are ${rem.rule_on ? 'on' : 'off'}.` }));
    }

    async function showThread(tid, box) {
      box.replaceChildren(el('p', { class: 'pl-meta', text: 'Loading conversation…' }));
      let d; try { d = await api('/api/saas/comms/unified/threads/' + encodeURIComponent(tid)); } catch (e) { box.replaceChildren(el('p', { class: 'portal-note', 'data-tone': 'bad', text: e.message })); return; }
      const t = d.thread, m = d.meta || {};
      const refresh = () => showThread(tid, box);
      const msgs = el('ol', { class: 'cx-msgs', 'aria-label': 'Messages' }, d.messages.map((x) => el('li', { class: 'cx-msg ' + (x.direction === 'inbound' ? 'in' : 'out') },
        el('span', { class: 'cx-row' }, el('small', { text: `${x.direction === 'inbound' ? 'From ' + (t.contact_name || t.contact_address) : 'You'}${x.ai_generated ? ' · AI draft' : ''}` }), el('small', { text: when(x.occurred_at) })),
        el('p', { text: x.body }),
        x.direction === 'outbound' ? el('span', { class: 'cx-row' }, chip(x.sched_state === 'failed' ? 'failed' : x.status), x.send_at ? el('small', { text: 'Scheduled for ' + when(x.send_at) }) : null,
          x.status === 'pending_approval' ? el('a', { href: '#b01/approvals', class: 'cx-linkbtn', text: 'Open approvals' }) : null,
          x.status === 'approved' && !x.send_at ? el('button', { type: 'button', class: 'portal-button primary', text: 'Send', onclick: (e) => busy(e.target, async () => { await post(`/api/saas/comms/messages/${encodeURIComponent(x.id)}/send`); say('Sent.'); refresh(); }) }) : null) : null)));
      const esc = m.escalation;
      const ai = section('AI summary', el('dl', { class: 'cx-dl' },
        el('dt', { text: 'Type' }), el('dd', { text: m.category ? (m.category_label || m.category[0].toUpperCase() + m.category.slice(1).replace(/_/g, ' ')) : 'Not analysed' }),
        el('dt', { text: 'Tone' }), el('dd', {}, m.sentiment ? chip(m.sentiment, m.sentiment) : '—'),
        el('dt', { text: 'Summary' }), el('dd', { text: m.summary || '—' }),
        el('dt', { text: 'Lead' }), el('dd', { text: m.lead_score !== null && m.lead_score !== undefined ? `${m.lead_score}/100 (${m.lead_band}), Super Pro estimate${m.lead_reasons?.length ? ': ' + m.lead_reasons.join(', ') : ''}` : '—' }),
        el('dt', { text: 'Escalation' }), el('dd', {}, esc && esc.level && esc.level !== 'none' ? [chip(esc.level, esc.level === 'urgent' ? 'Urgent' : esc.level === 'high' ? 'High' : 'Reply personally'), ' ', (esc.reasons || []).join(', '), esc.recommendation ? el('div', { text: esc.recommendation }) : null] : 'None'),
        m.duplicates?.length ? [el('dt', { text: 'Possible duplicates' }), el('dd', { text: m.duplicates.map((x) => x.note).join(' ') })] : null),
        el('p', { class: 'sx-source', text: 'Sorted and summarised by Super Pro from the message text. Check before acting.' }),
        el('div', { class: 'pl-actions' }, el('button', { type: 'button', class: 'portal-button', text: 'Re-analyse', onclick: (e) => busy(e.target, async () => { await post(`/api/saas/comms/unified/threads/${encodeURIComponent(tid)}/analyse`); say('Analysis updated.'); refresh(); }) })));
      const link = (bodyObj, done) => (e) => busy(e.target, async () => { await post(`/api/saas/comms/unified/threads/${encodeURIComponent(tid)}/link`, bodyObj); say(done); refresh(); });
      const crm = section('Customer and records',
        d.customer ? el('p', { text: `Linked to ${d.customer.name}${d.customer.email ? ' · ' + d.customer.email : ''}${d.customer.phone ? ' · ' + d.customer.phone : ''}` }) : el('p', { text: 'Not linked to a customer.' }),
        el('div', { class: 'pl-actions' },
          !d.customer ? d.matches.map((c) => el('button', { type: 'button', class: 'portal-button', text: `Link to ${c.name}`, onclick: link({ customer_id: c.id }, 'Linked to ' + c.name + '.') })) : null,
          !d.customer ? el('button', { type: 'button', class: 'portal-button', text: 'Create customer', onclick: link({ create_customer: { name: t.contact_name || undefined, ...(t.channel === 'email' ? { email: t.contact_address } : { phone: t.contact_address }) } }, 'Customer created and linked.') }) : null,
          !m.enquiry_id ? el('button', { type: 'button', class: 'portal-button', text: 'Create enquiry', onclick: link({ create_enquiry: { title: t.subject || undefined } }, 'Enquiry created and linked.') }) : el('a', { class: 'cx-linkbtn', href: '#b02/enquiries', text: 'Linked to an enquiry' }),
          m.invoice_id ? el('a', { class: 'cx-linkbtn', href: '#b07/invoices', text: 'Linked to an invoice' }) : null),
        ['email', 'sms'].includes(t.channel) ? el('p', { class: 'sx-source', text: d.suppressed ? 'Marketing: unsubscribed. They will not receive campaigns.' : d.consent?.status === 'granted' ? `Marketing: agreed (${d.consent.source.replace(/_/g, ' ')}).` : 'Marketing: no consent recorded, so they will not receive campaigns.' }) : null);
      const folder = m.folder || 'inbox';
      const moves = el('div', { class: 'pl-actions' }, [['inbox', 'Move to inbox'], ['archived', 'Archive'], ['spam', 'Mark as spam']].filter(([k]) => k !== folder).map(([k, l]) => el('button', { type: 'button', class: 'portal-button', text: l, onclick: (e) => busy(e.target, async () => { await post(`/api/saas/comms/unified/threads/${encodeURIComponent(tid)}/move`, { folder: k }); say(k === 'inbox' ? 'Moved to the inbox.' : k === 'archived' ? 'Archived.' : 'Marked as spam.'); state.open = null; render('unifiedinbox'); }) })));
      let reply = null;
      if (t.channel !== 'voice') {
        const txt = el('textarea', { id: id('cx'), rows: '4', maxlength: '4000', placeholder: 'Write a reply, or leave blank and tick "Draft with AI".' });
        const aiBox = check('Draft with AI from your business details');
        const at = el('input', { type: 'datetime-local', id: id('cx') });
        const form = el('form', { class: 'cx-form', onsubmit: (e) => { e.preventDefault(); busy(form.querySelector('[type=submit]'), async () => { const useAi = aiBox.querySelector('input').checked; if (!txt.value.trim() && !useAi) throw new Error('Write a reply or tick "Draft with AI".'); const r = await post(`/api/saas/comms/unified/threads/${encodeURIComponent(tid)}/reply`, { body: txt.value.trim() || undefined, use_ai: useAi, send_at: toIso(at.value) }); say(`${r.message} Reference ${r.reference_code}.`); refresh(); }); } },
          field('Reply', txt), aiBox, field('Send later (optional)', at, 'Scheduled replies are sent at this time once approved.'), el('div', { class: 'pl-actions' }, el('button', { type: 'submit', class: 'portal-button primary', text: 'Draft reply for approval' })));
        reply = section('Reply', form, el('p', { class: 'sx-source', text: 'Replies never send on their own: an authorised person approves each one first.' }));
      } else reply = section('Call', el('p', { text: 'Calls are answered by phone. The transcript and summary are above; call the person back or create an enquiry.' }));
      box.replaceChildren(el('div', { class: 'cx-head' }, el('h2', { text: t.contact_name || t.contact_address }), el('p', { class: 'pl-meta', text: `${CH[t.channel] || t.channel} · ${t.contact_address}${t.subject ? ' · ' + t.subject : ''}` }), moves), msgs, ai, crm, reply);
      box.querySelector('h2')?.setAttribute('tabindex', '-1');
    }

    function builder(c) {
      const f = {};
      f.name = el('input', { id: id('cx'), required: true, minlength: '2', maxlength: '160', value: c?.name || '' });
      f.channel = el('select', { id: id('cx'), disabled: founder || null }, (founder ? [['email', 'Email']] : [['email', 'Email'], ['sms', 'SMS'], ['social', 'Social post']]).map(([k, t]) => el('option', { value: k, text: t, selected: (c?.channel || 'email') === k || null })));
      f.subject = el('input', { id: id('cx'), maxlength: '160', value: c?.subject || '' });
      f.body = el('textarea', { id: id('cx'), rows: '6', required: true, minlength: '2', maxlength: '10000', text: c?.body || '' });
      f.cta = el('input', { id: id('cx'), type: 'url', placeholder: 'https://', maxlength: '500', value: c?.cta_url || '' });
      f.at = el('input', { id: id('cx'), type: 'datetime-local', value: localInput(c?.send_at) });
      const seg = c?.segment || {};
      f.statuses = el('div', { class: 'cx-checks', role: 'group', 'aria-label': 'Customer status' }, [['lead', 'Leads'], ['current', 'Current customers'], ['past', 'Past customers']].map(([k, t]) => check(t, { value: k, checked: (seg.statuses || []).includes(k) })));
      f.area = el('input', { id: id('cx'), maxlength: '80', value: seg.area || '', placeholder: 'Suburb or postcode' });
      f.service = el('input', { id: id('cx'), maxlength: '80', value: seg.service || '', placeholder: 'For example: tyres' });
      f.targets = el('div', { class: 'cx-checks', role: 'group', 'aria-label': 'Platforms' }, ['facebook', 'instagram', 'linkedin', 'x', 'tiktok', 'youtube'].map((k) => check(CH[k] || k[0].toUpperCase() + k.slice(1), { value: k, checked: (c?.social_targets || []).includes(k) })));
      const preview = el('p', { class: 'sx-source', 'aria-live': 'polite' });
      const segment = () => { const s = {}; const st = [...f.statuses.querySelectorAll('input:checked')].map((i) => i.value); if (st.length) s.statuses = st; if (f.area.value.trim()) s.area = f.area.value.trim(); if (f.service.value.trim()) s.service = f.service.value.trim(); return s; };
      const payload = () => { const ch = founder ? 'email' : f.channel.value; const p = { name: f.name.value.trim(), channel: ch, body: f.body.value.trim(), send_at: toIso(f.at.value), segment: founder ? {} : segment() }; if (ch === 'email' && f.subject.value.trim()) p.subject = f.subject.value.trim(); if (ch !== 'social' && f.cta.value.trim()) p.cta_url = f.cta.value.trim(); if (ch === 'social') p.social_targets = [...f.targets.querySelectorAll('input:checked')].map((i) => i.value); return p; };
      const sync = () => { const ch = founder ? 'email' : f.channel.value; wrapS.hidden = ch !== 'email'; wrapC.hidden = ch === 'social'; wrapT.hidden = ch !== 'social'; wrapSeg.hidden = founder || ch === 'social'; };
      const wrapS = field('Subject', f.subject, '20 to 60 characters reads best on phones.'), wrapC = field('Link (optional)', f.cta, 'Clicks on this link are counted.'), wrapT = el('div', { class: 'cx-field' }, el('span', { class: 'cx-label', text: 'Platforms' }), f.targets);
      const wrapSeg = el('fieldset', { class: 'cx-fieldset' }, el('legend', { text: 'Who receives it' }), f.statuses, field('Area', f.area), field('Service', f.service), el('p', { class: 'sx-source', text: 'Only people who agreed to marketing on this channel are included. Unsubscribed addresses are always left out.' }));
      f.channel.addEventListener('change', sync);
      const saved = { id: c?.id || null };
      const save = async () => { const r = saved.id ? await post(`${campBase}/${encodeURIComponent(saved.id)}`, payload(), 'PUT') : await post(campBase, payload()); saved.id = r.campaign?.id || saved.id; return r; };
      const form = el('form', { class: 'cx-form', onsubmit: (e) => { e.preventDefault(); busy(e.submitter || form.querySelector('[type=submit]'), async () => { const r = await save(); say(c ? 'Campaign updated.' + (r.campaign?.status === 'draft' && c.status !== 'draft' ? ' It went back to draft; submit it again for approval.' : '') : 'Draft saved.'); render('campaignstudio', saved.id); }); } },
        field('Campaign name', f.name), founder ? el('p', { class: 'sx-source', text: 'Platform campaigns are email only and go to Super Pro newsletter subscribers. Business customers are never included.' }) : field('Channel', f.channel), wrapS, field('Message', f.body, 'Use {first_name} to personalise. Your business name, address and an unsubscribe link (or "Reply STOP") are added automatically.'), wrapC, wrapT, field('Send at (optional)', f.at, 'Leave blank to send as soon as it is approved.'), wrapSeg,
        el('div', { class: 'pl-actions' },
          el('button', { type: 'submit', class: 'portal-button primary', text: c ? 'Save changes' : 'Save draft' }),
          el('button', { type: 'button', class: 'portal-button', text: 'Preview audience', onclick: (e) => busy(e.target, async () => { const p = payload(); if (p.channel === 'social') { preview.textContent = 'Social posts go to your connected accounts, not to a list of people.'; return; } const r = await api(`${campBase}/audience/preview?` + new URLSearchParams({ channel: p.channel, segment: JSON.stringify(p.segment) })); preview.textContent = `${r.eligible} of ${r.total} would receive it. Left out: ${r.excluded.no_consent} without consent, ${r.excluded.suppressed} unsubscribed, ${r.excluded.no_address} without an address.${r.sample.length ? ' For example: ' + r.sample.join(', ') + '.' : ''}`; }) }),
          c ? el('button', { type: 'button', class: 'portal-button', text: 'New campaign', onclick: () => render('campaignstudio') }) : null),
        preview);
      sync();
      return section(c ? `Edit: ${c.name}` : 'New campaign', form);
    }

    async function openCampaign(cid, b) {
      const d = await api(`${campBase}/${encodeURIComponent(cid)}`); const c = d.campaign;
      const box = el('div');
      const can = ['draft', 'rejected'].includes(c.status), cancellable = ['draft', 'pending_approval', 'approved', 'scheduled'].includes(c.status);
      box.append(section(c.name, el('p', { class: 'pl-meta' }, `${CH[c.channel]} · `, chip(c.status), c.send_at ? ` · sends ${when(c.send_at)}` : ''),
        c.channel !== 'social' ? el('p', { text: `Audience: ${c.audience.eligible} eligible of ${c.audience.total}. Left out: ${c.audience.excluded.no_consent} without consent, ${c.audience.excluded.suppressed} unsubscribed.` }) : el('p', { text: `Platforms: ${(c.social_targets || []).join(', ') || 'none chosen'}. Approved posts go into the content calendar.` }),
        c.channel !== 'social' ? el('p', { text: `Results: ${c.stats.sent} sent, ${c.stats.delivered} delivered, ${c.stats.opened} opened, ${c.stats.clicked} clicked, ${c.stats.replies} replied, ${c.stats.unsubscribed} unsubscribed, ${c.stats.failed} failed. Enquiries in the 30 days after: ${c.stats.enquiries_30d}.` }) : null,
        c.channel !== 'social' ? el('p', { class: 'sx-source', text: c.stats.note }) : null,
        el('h3', { text: 'Before it can be sent' }), c.compliance.issues.length ? el('ul', { class: 'sx-list cx-error' }, c.compliance.issues.map((x) => el('li', { text: x }))) : el('p', { text: 'All checks pass.' }),
        el('ul', { class: 'sx-list' }, c.compliance.rules.map((x) => el('li', { text: x }))),
        el('h3', { text: 'Suggestions' }), el('ul', { class: 'sx-list' }, c.recommendations.map((x) => el('li', { text: x }))),
        el('div', { class: 'pl-actions' },
          can ? el('button', { type: 'button', class: 'portal-button primary', text: 'Submit for approval', disabled: c.compliance.issues.length ? true : null, onclick: (e) => busy(e.target, async () => { const r = await post(`${campBase}/${encodeURIComponent(cid)}/submit`); say(r.message); render('campaignstudio'); }) }) : null,
          c.status === 'pending_approval' ? (founder ? el('p', { text: 'Waiting for approval under Operations > AI automations.' }) : el('a', { class: 'cx-linkbtn', href: '#b01/approvals', text: 'Waiting for approval: open approvals' })) : null,
          cancellable ? el('button', { type: 'button', class: 'portal-button', text: 'Cancel campaign', onclick: (e) => busy(e.target, async () => { await post(`${campBase}/${encodeURIComponent(cid)}/cancel`); say('Campaign cancelled. Nothing more will be sent.'); render('campaignstudio'); }) }) : null),
        d.recipients.length ? [el('h3', { text: 'Recipients' }), table([['address', 'Address'], ['name', 'Name'], ['status', 'Status', (v) => chip(v)], ['sent_at', 'Sent', when], ['clicked_at', 'Clicked', when], ['error', 'Problem']], d.recipients)] : null));
      b.querySelector('.cx-opened')?.remove(); box.className = 'cx-opened'; b.prepend(box); box.scrollIntoView({ block: 'start' });
    }

    return { render };
  }

  // ---------------- workspace wiring ----------------
  const instances = {};
  function view(vid) {
    let s = document.getElementById(vid + '-view');
    if (!s) { s = el('section', { class: 'view', id: vid + '-view', hidden: true }); (document.querySelector('.content-wrap') || document.body).append(s); }
    if (!s.dataset.cxReady) { s.dataset.cxReady = '1'; s.replaceChildren(el('div', { class: 'page-heading' }, el('div', {}, el('h1', { text: VIEWS[vid][0] }), el('p', { text: VIEWS[vid][1] })))); }
    return s;
  }
  if (document.getElementById('workspace') || document.querySelector('.content-wrap')) {
    for (const vid of Object.keys(VIEWS)) view(vid);
    window.addEventListener('gds:viewchange', (e) => { const vid = e.detail?.view; if (!VIEWS[vid]) return; const s = view(vid); (instances[vid] ||= Comms(s)).render(vid); });
  }
  window.SuperProComms = { mountFounder: (host, api) => Comms(host, { api, founder: true }), VIEWS };
})();
