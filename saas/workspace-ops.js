// Phase 04 views: Offshore Staff (People) and Automation (Setup & Trust). Messages come only from the server's answer.
(() => {
  const el = (tag, attrs = {}, ...kids) => {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) { if (v === null || v === undefined || v === false) continue; if (k === 'class') e.className = v; else if (k === 'text') e.textContent = v; else if (k.startsWith('on')) e.addEventListener(k.slice(2), v); else e.setAttribute(k, v === true ? '' : v); }
    for (const k of kids.flat()) if (k !== null && k !== undefined && k !== false) e.append(k.nodeType ? k : document.createTextNode(String(k)));
    return e;
  };
  async function api(path, opt = {}) {
    const r = await fetch(path, { credentials: 'same-origin', ...opt, headers: { 'Content-Type': 'application/json', ...(window.SuperProWorkspaceContext?.headers?.() || {}), ...(opt.headers || {}) } });
    let d = {}; try { d = await r.json(); } catch { /* not JSON */ }
    if (!r.ok || d.ok === false) throw new Error(d.error || `The server refused this action (${r.status}).`);
    return d;
  }
  const VIEWS = {
    offshore: ['Offshore Staff', 'Team members who work for you from outside Australia. They are never offered on-site jobs, and you record how customer information is protected when they can see it.'],
    automation: ['Automation', 'Everything Super Pro does on its own, in one place. Anything that reaches a customer still waits for approval.']
  };
  const say = (s, t, bad = false) => { const p = s.querySelector('[data-ops-status]'); if (!p) return; p.textContent = t; p.dataset.tone = bad ? 'bad' : 'good'; if (!bad) window.SPMotion?.toast?.(t); };
  function ensure(id) {
    let s = document.getElementById(id + '-view');
    if (!s) { s = el('section', { class: 'view', id: id + '-view', hidden: true }); (document.querySelector('.content-wrap') || document.body).append(s); }
    if (!s.dataset.opsView) {
      s.replaceChildren(el('div', { class: 'page-heading' }, el('div', {}, el('h1', { text: VIEWS[id][0] }), el('p', { text: VIEWS[id][1] }))), el('p', { class: 'portal-note pl-status', role: 'status', 'aria-live': 'polite', 'data-ops-status': '' }));
      s.dataset.opsView = id;
    }
    return s;
  }
  const localTime = (tz) => { try { return new Date().toLocaleTimeString('en-AU', { timeZone: tz, hour: 'numeric', minute: '2-digit', weekday: 'short' }); } catch { return ''; } };

  async function offshore() {
    const s = ensure('offshore'), body = el('div', { 'data-body': '1' });
    const prev = s.querySelector('[data-body]'); if (prev) prev.replaceWith(body); else s.append(body);
    try {
      const { staff } = await api('/api/saas/workers/offshore');
      const f = el('form', { class: 'portal-panel portal-form pl-new' }, el('h2', { text: 'Add an offshore team member' }),
        el('label', {}, 'Full name', el('input', { name: 'full_name', required: true, maxlength: 160 })),
        el('label', {}, 'Email', el('input', { name: 'email', type: 'email', maxlength: 254 })),
        el('label', {}, 'Role', el('input', { name: 'role_title', required: true, maxlength: 120, placeholder: 'For example: admin assistant' })),
        el('label', {}, 'Country', el('input', { name: 'country', required: true, maxlength: 80, placeholder: 'For example: Philippines' })),
        el('label', {}, 'Time zone', el('input', { name: 'timezone', required: true, maxlength: 64, placeholder: 'For example: Asia/Manila', list: 'ops-tz' }),
          el('datalist', { id: 'ops-tz' }, ['Asia/Manila', 'Asia/Kolkata', 'Asia/Karachi', 'Asia/Dhaka', 'Asia/Jakarta', 'Asia/Ho_Chi_Minh', 'Pacific/Auckland', 'Europe/London', 'America/Bogota'].map((z) => el('option', { value: z })))),
        el('label', {}, 'Engaged as', el('select', { name: 'engagement' }, [['contractor', 'Contractor'], ['agency', 'Through an agency'], ['employee', 'Employee']].map(([v, t]) => el('option', { value: v, text: t })))));
      const b = el('button', { type: 'submit', class: 'portal-button primary', text: 'Add team member' });
      f.append(b);
      f.addEventListener('submit', async (e) => {
        e.preventDefault(); b.disabled = true;
        try { await api('/api/saas/workers/offshore', { method: 'POST', body: JSON.stringify(Object.fromEntries(new FormData(f))) }); say(s, 'Team member added. Record the data acknowledgement before they see customer details.'); await offshore(); }
        catch (err) { say(s, err.message, true); b.disabled = false; }
      });
      body.append(el('details', { class: 'pl-newwrap', open: !staff.length }, el('summary', { text: 'Add an offshore team member' }), f));
      const grid = el('div', { class: 'portal-grid pl-grid' });
      for (const w of staff) {
        const c = el('article', { class: 'portal-card pl-card', 'data-id': w.id },
          el('div', { class: 'pl-card-head' }, el('h2', { text: w.full_name }), el('span', { class: 'portal-status ' + (w.data_acknowledged ? 'pl-paid' : 'pl-issued'), text: w.data_acknowledged ? 'Data safeguards recorded' : 'Data acknowledgement needed' })),
          el('p', { class: 'pl-who', text: [w.role_title, w.country, { contractor: 'contractor', agency: 'through an agency', employee: 'employee' }[w.engagement]].filter(Boolean).join(' · ') }),
          el('p', { class: 'pl-meta', text: `Local time ${localTime(w.timezone)} (${w.timezone}) · Not offered on-site jobs${w.email ? ' · ' + w.email : ''}` }),
          w.data_acknowledged ? el('p', { class: 'pl-meta', text: `Recorded ${new Date(w.data_ack_at).toLocaleDateString('en-AU', { dateStyle: 'medium' })}: ${w.data_ack_note}` }) : null);
        if (!w.data_acknowledged) {
          const a = el('div', { class: 'pl-actions' });
          a.append(el('button', { type: 'button', class: 'portal-button primary', text: 'Record data acknowledgement', onclick: () => {
            c.querySelector('.pl-inline')?.remove();
            const fm = el('form', { class: 'pl-inline portal-form' },
              el('p', { class: 'portal-note', text: 'Australian Privacy Principle 8: before customer personal information is shown to someone overseas, take reasonable steps so they handle it as the APPs require. Describe the steps you have taken (for example a signed confidentiality and privacy agreement, limited access, no downloads).' }),
              el('label', {}, 'Safeguards in place', el('textarea', { name: 'note', required: true, minlength: 10, maxlength: 1000, rows: 3 })),
              el('label', { class: 'pl-check' }, el('input', { type: 'checkbox', name: 'confirm', required: true }), 'I confirm these safeguards are in place'));
            const sb = el('button', { type: 'submit', class: 'portal-button primary', text: 'Save acknowledgement' });
            fm.append(el('div', { class: 'pl-actions' }, sb, el('button', { type: 'button', class: 'portal-button', text: 'Cancel', onclick: () => fm.remove() })));
            fm.addEventListener('submit', async (e) => {
              e.preventDefault(); sb.disabled = true;
              try { await api(`/api/saas/workers/offshore/${w.id}/data-acknowledgement`, { method: 'POST', body: JSON.stringify({ confirm: fm.elements.confirm.checked, note: fm.elements.note.value.trim() }) }); say(s, 'Data acknowledgement recorded.'); await offshore(); }
              catch (err) { say(s, err.message, true); sb.disabled = false; }
            });
            c.append(fm); fm.querySelector('textarea').focus();
          } }));
          c.append(a);
        }
        grid.append(c);
      }
      if (!staff.length) grid.append(el('p', { class: 'portal-empty', text: 'No offshore team members yet.' }));
      body.append(grid, el('p', { class: 'portal-note', text: 'Offshore team members who need to sign in get their own staff account in People > Staff accounts, with only the access they need.' }));
    } catch (e) { body.replaceChildren(el('p', { class: 'portal-note', 'data-tone': 'bad', text: e.message })); }
  }

  async function automation() {
    const s = ensure('automation'), body = el('div', { 'data-body': '1' });
    const prev = s.querySelector('[data-body]'); if (prev) prev.replaceWith(body); else s.append(body);
    try {
      const { automations } = await api('/api/saas/automation');
      const owner = window.GDS_SESSION?.user?.role === 'owner' || window.GDS_SESSION?.access?.mode === 'owner';
      const grid = el('div', { class: 'portal-grid pl-grid' });
      for (const a of automations) {
        const c = el('article', { class: 'portal-card pl-card', 'data-key': a.key },
          el('div', { class: 'pl-card-head' }, el('h2', { text: a.title }), el('span', { class: 'portal-status ' + (a.on ? 'pl-paid' : 'pl-lost'), text: a.on ? 'On' : 'Off' })),
          el('p', { class: 'pl-body', text: a.detail }));
        const acts = el('div', { class: 'pl-actions' });
        if (a.toggle && owner) acts.append(el('button', { type: 'button', class: 'portal-button' + (a.on ? '' : ' primary'), text: a.on ? 'Turn off' : 'Turn on', onclick: async (e) => {
          e.target.disabled = true;
          try { const r = await api('/api/saas/automation/reminders', { method: 'PUT', body: JSON.stringify({ key: a.toggle, on: !a.on }) }); say(s, `${a.title}: ${r.on ? 'on' : 'off'}.`); await automation(); }
          catch (err) { say(s, err.message, true); e.target.disabled = false; }
        } }));
        if (a.change) acts.append(el('a', { class: 'portal-button', href: a.change, text: 'Change' }));
        if (acts.childNodes.length) c.append(acts);
        grid.append(c);
      }
      body.append(el('article', { class: 'portal-card pl-card au-link', 'data-key': 'ai_automations' }, el('div', { class: 'pl-card-head' }, el('h2', { text: 'AI Automations' })), el('p', { class: 'pl-body', text: 'Build your own automations, set which routine actions may run without asking, pause everything at once, and read the audit report.' }), el('div', { class: 'pl-actions' }, el('a', { class: 'portal-button primary', href: '#b01/automations', text: 'Open AI Automations' }))), grid);
    } catch (e) { body.replaceChildren(el('p', { class: 'portal-note', 'data-tone': 'bad', text: e.message })); }
  }

  // ---------- record results in the workspace search box ----------
  const VIEW_ID = { 'b02/enquiries': 'enquiries', 'b02/quotes': 'quotes', 'b02/bookings': 'bookings', 'b07/invoices': 'businessinvoices' };
  const TYPE_LABEL = { customer: 'Customer', enquiry: 'Enquiry', quote: 'Quote', booking: 'Booking', invoice: 'Invoice', job: 'Job', worker: 'Team member' };
  let searchSeq = 0, searchTimer = 0;
  function attachSearch() {
    const results = document.getElementById('page-results'), dialog = results?.closest('dialog'), input = dialog?.querySelector('input');
    if (!results || !input || results.dataset.records) return Boolean(results);
    results.dataset.records = '1';
    const run = () => {
      const term = input.value.trim(), seq = ++searchSeq;
      if (term.length < 2 || results.querySelector(`.finder-records[data-term="${CSS.escape(term)}"]`)) return;
      clearTimeout(searchTimer);
      searchTimer = setTimeout(async () => {
        let list = [];
        try { list = (await api('/api/saas/search?q=' + encodeURIComponent(term))).results; } catch { return; }
        if (seq !== searchSeq || input.value.trim() !== term) return;
        results.querySelector('.finder-records')?.remove();
        const box = el('section', { class: 'finder-records', 'data-term': term, 'aria-label': 'Matching records' }, el('h3', { text: list.length ? 'Records' : 'No matching records' }));
        for (const r of list) box.append(el('button', { type: 'button', class: 'finder-result', 'data-record': r.type, onclick: () => {
          dialog.close();
          if (VIEW_ID[r.view]) window.SuperProPipeline?.prefill(VIEW_ID[r.view], r.title);
          location.hash = r.view;
        } }, el('span', { text: TYPE_LABEL[r.type] || r.type }), el('div', {}, el('b', { text: r.title }), el('small', { text: r.detail || '' }))));
        const answer = results.querySelector('.finder-answer');
        if (answer) results.insertBefore(box, answer); else results.append(box);
      }, 180);
    };
    new MutationObserver(run).observe(results, { childList: true });
    input.addEventListener('input', run);
    return true;
  }
  if (!attachSearch()) { const t = setInterval(() => { if (attachSearch()) clearInterval(t); }, 500); setTimeout(() => clearInterval(t), 20000); }

  for (const id of Object.keys(VIEWS)) ensure(id);
  window.addEventListener('gds:viewchange', (e) => { if (e.detail?.view === 'offshore') offshore(); if (e.detail?.view === 'automation') automation(); });
})();
