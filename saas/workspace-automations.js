// Phase 05: AI Automations (Today > AI Automations). Build automations step by step
// (Trigger > Conditions > Analysis > Proposed action > Approval > Execution > Verification), test them with a dry run,
// keep versions, watch every run, act on suggestions, set Level 2 rules, pause everything, and read the audit report.
// Every message shown comes from the server's answer; nothing claims success unless the server confirmed it.
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
  const when = (v) => (v ? new Date(v).toLocaleString('en-AU', { dateStyle: 'medium', timeStyle: 'short' }) : '');
  const LEVEL = { 1: 'Automatic', 2: 'Rule-based', 3: 'Needs approval', 4: 'Restricted' };
  const LEVEL_HELP = {
    1: 'Internal only: it labels, summarises or drafts. Nothing reaches a customer.',
    2: 'Runs on its own only while you have switched on its rule in Rules & safety. Otherwise it waits for approval.',
    3: 'Always waits in Approvals for a person to approve, edit, schedule or reject it.',
    4: 'Never done by automation.'
  };
  const STATUS = {
    received: ['Starting', 'pl-draft'], queued: ['Running', 'pl-issued'], executing: ['Running', 'pl-issued'], approved: ['Approved, waiting to run', 'pl-issued'],
    awaiting_approval: ['Waiting for approval', 'pl-issued'], awaiting_manual: ['Approved: a person must finish it', 'pl-issued'], held: ['Held by the pause', 'pl-issued'],
    completed: ['Done', 'pl-paid'], completed_warning: ['Done, with a warning', 'pl-part'], skipped: ['Nothing to do', 'pl-lost'], dry_run: ['Dry run', 'pl-draft'],
    failed: ['Failed', 'pl-cancelled'], verification_failed: ['Did not check out', 'pl-cancelled'], rejected: ['Rejected', 'pl-lost'], expired: ['Expired', 'pl-lost'], blocked: ['Blocked', 'pl-cancelled']
  };
  const PARAM = {
    default_amount: ['Usual price, ex GST ($)', 'number'], gst_applies: ['Add GST', 'checkbox'], hours: ['Job length (hours)', 'number'], timezone: ['Time zone', 'text'],
    sign_off: ['Sign-off', 'text'], after_days: ['Days to wait', 'number'], enquiry_days: ['Enquiry waiting more than (days)', 'number'], quote_days: ['Quote unanswered more than (days)', 'number'],
    details: ['What exactly should happen', 'textarea'], work_order_id: ['Job ID', 'text'], new_price: ['New price incl. GST ($)', 'number']
  };
  const CATS = ['urgent_repair', 'new_installation', 'maintenance', 'quote_request', 'complaint', 'general'];
  const OPS = [['eq', 'is'], ['neq', 'is not'], ['contains', 'contains'], ['gt', 'more than'], ['gte', 'at least'], ['lt', 'less than'], ['lte', 'at most']];
  const human = (s) => String(s).replace(/[._]/g, ' ');
  let meta = null, tab = 'flows';
  const senior = () => true;
  const ownerish = () => ['owner', 'admin', 'super_admin', 'director'].includes(String(window.GDS_SESSION?.user?.role || window.GDS_SESSION?.role || '').toLowerCase()) || window.GDS_SESSION?.access?.mode === 'owner';

  function view() {
    let s = document.getElementById('automations-view');
    if (!s) { s = el('section', { class: 'view', id: 'automations-view', hidden: true }); (document.querySelector('.content-wrap') || document.body).append(s); }
    if (!s.dataset.ready) {
      s.dataset.ready = '1';
      s.replaceChildren(
        el('div', { class: 'page-heading' }, el('div', {}, el('h1', { text: 'AI Automations' }), el('p', { text: 'Let Super Pro handle routine work. Internal work runs on its own; anything that reaches customers, money or the public waits for your approval unless you have set a rule for it.' }))),
        el('div', { class: 'au-pause', 'data-au-pause': '' }),
        el('div', { class: 'au-tabs', role: 'tablist', 'aria-label': 'Automation sections' }, [['flows', 'Automations'], ['runs', 'Activity'], ['outputs', 'Suggestions & reports'], ['rules', 'Rules & safety'], ['audit', 'Audit report']].map(([k, t]) => el('button', { type: 'button', role: 'tab', class: 'portal-button', 'data-au-tab': k, 'aria-selected': String(k === tab), onclick: () => { tab = k; render(); } }, t))),
        el('p', { class: 'portal-note pl-status', role: 'status', 'aria-live': 'polite', 'data-au-status': '' }),
        el('div', { 'data-au-body': '' }));
    }
    return s;
  }
  const say = (t, bad = false) => { const p = view().querySelector('[data-au-status]'); p.textContent = t; p.dataset.tone = bad ? 'bad' : 'good'; if (!bad) window.SPMotion?.toast?.(t); };
  const body = () => { const b = el('div', { 'data-au-body': '' }); view().querySelector('[data-au-body]').replaceWith(b); return b; };
  const badge = (status) => { const [t, c] = STATUS[status] || [human(status), 'pl-draft']; return el('span', { class: 'portal-status ' + c, text: t }); };
  const levelChip = (n) => el('span', { class: 'au-level', 'data-level': n, text: `Level ${n} · ${LEVEL[n]}` });
  const busy = async (btn, fn) => { btn.disabled = true; try { await fn(); } catch (e) { say(e.message, true); btn.disabled = false; } };

  async function render() {
    const s = view();
    s.querySelectorAll('[data-au-tab]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.auTab === tab)));
    try { meta = await api('/api/saas/automation/engine'); } catch (e) { body().append(el('p', { class: 'portal-note', 'data-tone': 'bad', text: e.message })); return; }
    pauseBar();
    try { await ({ flows, runs, outputs, rules, audit })[tab](); } catch (e) { body().append(el('p', { class: 'portal-note', 'data-tone': 'bad', text: e.message })); }
  }

  function pauseBar() {
    const host = view().querySelector('[data-au-pause]'), p = meta.pause;
    host.replaceChildren();
    if (p.paused) {
      host.append(el('div', { class: 'au-paused', role: 'alert' },
        el('strong', { text: p.scope === 'platform' ? 'Automations are paused for every business by Super Pro support.' : 'All automations are paused.' }),
        el('span', { text: (p.reason ? ` Reason: ${p.reason}.` : '') + ' Nothing runs until they are resumed; waiting work is kept.' }),
        p.scope === 'business' && ownerish() ? el('button', { type: 'button', class: 'portal-button primary', text: 'Resume automations', onclick: (e) => busy(e.target, async () => { const r = await api('/api/saas/automation/pause', { method: 'POST', body: JSON.stringify({ paused: false }) }); say(`Automations resumed.${r.resumed ? ` ${r.resumed} held task(s) are running now.` : ''}`); await render(); }) }) : null));
    }
  }

  // ---------------- Automations list and builder ----------------
  async function flows() {
    const b = body();
    const { workflows } = await api('/api/saas/automation/workflows');
    const holder = el('div', { 'data-builder': '' });
    b.append(el('div', { class: 'pl-toolbar au-toolbar' }, el('button', { type: 'button', class: 'portal-button primary', text: 'New automation', onclick: () => builder(holder) }),
      el('span', { class: 'pl-meta', text: meta.ai_configured ? 'AI analysis is available.' : 'No AI provider is connected: automations use the built-in rules, and say so on each run.' })), holder);
    const grid = el('div', { class: 'pl-grid' });
    for (const w of workflows) {
      const c = el('article', { class: 'portal-card pl-card', 'data-workflow': w.id },
        el('div', { class: 'pl-card-head' }, el('h2', { text: w.name }), el('span', { class: 'portal-status ' + (w.status === 'active' ? 'pl-paid' : 'pl-lost'), text: w.status === 'active' ? 'On' : w.status === 'draft' ? 'Draft' : 'Off' })),
        el('p', { class: 'pl-who', text: `${w.trigger_label} → ${w.action_label}` }),
        el('div', { class: 'au-chips' }, levelChip(w.level), w.definition?.conditions?.length ? el('span', { class: 'au-chip', text: `${w.definition.conditions.length} condition(s)` }) : null, w.definition?.always_approve ? el('span', { class: 'au-chip', text: 'Always asks first' }) : null),
        el('p', { class: 'pl-meta', text: `Version ${w.current_version}` + (w.last_run_at ? ` · Last run ${when(w.last_run_at)}: ${(STATUS[w.last_status] || [w.last_status])[0]}` : ' · Not run yet') }));
      const acts = el('div', { class: 'pl-actions' });
      acts.append(el('button', { type: 'button', class: 'portal-button' + (w.status === 'active' ? '' : ' primary'), text: w.status === 'active' ? 'Turn off' : 'Turn on', onclick: (e) => busy(e.target, async () => { await api(`/api/saas/automation/workflows/${w.id}/status`, { method: 'POST', body: JSON.stringify({ status: w.status === 'active' ? 'paused' : 'active' }) }); say(`${w.name}: ${w.status === 'active' ? 'off' : 'on'}.`); await render(); }) }));
      acts.append(el('button', { type: 'button', class: 'portal-button', text: 'Edit', onclick: () => { builder(holder, w); holder.scrollIntoView({ block: 'start' }); } }));
      acts.append(el('button', { type: 'button', class: 'portal-button', text: 'Test (dry run)', onclick: (e) => busy(e.target, async () => { const r = await api(`/api/saas/automation/workflows/${w.id}/run`, { method: 'POST', body: JSON.stringify({ dry_run: true }) }); showRun(c, r.run); e.target.disabled = false; }) }));
      if (/^(manual|schedule)/.test(w.trigger)) acts.append(el('button', { type: 'button', class: 'portal-button', text: 'Run now', onclick: (e) => busy(e.target, async () => { const r = await api(`/api/saas/automation/workflows/${w.id}/run`, { method: 'POST', body: JSON.stringify({ dry_run: false }) }); showRun(c, r.run); say(runSentence(r.run)); e.target.disabled = false; }) }));
      acts.append(el('button', { type: 'button', class: 'portal-button', text: 'History', onclick: () => { tab = 'runs'; runs(w.id); view().querySelectorAll('[data-au-tab]').forEach((x) => x.setAttribute('aria-selected', String(x.dataset.auTab === 'runs'))); } }));
      acts.append(el('button', { type: 'button', class: 'portal-button', text: 'Archive', onclick: (e) => busy(e.target, async () => { await api(`/api/saas/automation/workflows/${w.id}/status`, { method: 'POST', body: JSON.stringify({ status: 'archived' }) }); say(`${w.name} archived.`); await render(); }) }));
      c.append(acts);
      grid.append(c);
    }
    if (!workflows.length) grid.append(el('p', { class: 'portal-empty', text: 'No automations yet. Choose "New automation" and start from one of the ready-made steps.' }));
    b.append(grid);
  }
  function runSentence(run) {
    if (run.status === 'dry_run') return `Dry run: it would ${run.level >= 3 ? 'ask for approval' : 'run automatically'}. Nothing was changed.`;
    if (run.status === 'awaiting_approval') return 'Sent to Approvals. Nothing happens until someone approves it.';
    if (['queued', 'executing'].includes(run.status)) return 'Running now. Check Activity for the result.';
    return `${(STATUS[run.status] || [run.status])[0]}${run.error ? ': ' + run.error : ''}`;
  }
  function showRun(card, run) {
    card.querySelector('.au-run')?.remove();
    card.append(el('div', { class: 'au-run pl-inline' }, el('div', { class: 'pl-card-head' }, el('strong', { text: run.dry_run ? 'Dry run result' : 'Run result' }), badge(run.status)),
      run.preview ? el('p', { class: 'pl-body', text: `${run.preview.description}. ${run.preview.expected_outcome || ''}` }) : null,
      run.level ? el('p', { class: 'pl-meta', text: `${LEVEL[run.level]}: ${(run.policy?.reasons || []).join(' ')}` }) : null,
      run.analysis?.method ? el('p', { class: 'pl-meta', text: run.analysis.method === 'ai' ? 'Analysed by AI within the allowed fields.' : (run.analysis.note || 'Analysed with the built-in rules.') }) : null,
      run.suspicious ? el('p', { class: 'pl-meta', 'data-tone': 'bad', text: 'The customer text looked like instructions to the system. It was treated as plain text and a person must check this.' }) : null,
      run.error ? el('p', { class: 'pl-meta', text: run.error }) : null));
  }

  function builder(holder, existing = null) {
    const cat = meta.catalogue.filter((a) => !a.restricted);
    const def = existing ? structuredClone(existing.definition) : { trigger: '', action: '', conditions: [], analysis: 'rules', params: {}, always_approve: false, approval_expires_hours: 72 };
    const f = el('form', { class: 'portal-panel au-builder', novalidate: true });
    const name = el('input', { name: 'name', required: true, minlength: 3, maxlength: 120, value: existing?.name || '', placeholder: 'For example: Label new enquiries' });
    const action = el('select', { name: 'action', required: true }, el('option', { value: '', text: 'Choose what it should do' }),
      [1, 2, 3].map((lv) => el('optgroup', { label: `Level ${lv} · ${LEVEL[lv]}` }, cat.filter((a) => a.level === lv).map((a) => el('option', { value: a.key, text: a.label, selected: a.key === def.action })))));
    const trigger = el('select', { name: 'trigger', required: true });
    const condBox = el('div', { class: 'au-conds' }), paramBox = el('div', { class: 'au-params' }), levelBox = el('div', { class: 'au-levelbox' });
    const analysis = el('select', { name: 'analysis' }, el('option', { value: 'rules', text: 'Built-in rules' }), el('option', { value: 'ai', text: 'AI (fills only the allowed fields)' }));
    const always = el('input', { type: 'checkbox', name: 'always_approve', checked: def.always_approve });
    const expires = el('input', { type: 'number', name: 'expires', min: 1, max: 720, value: def.approval_expires_hours || 72 });
    const note = el('input', { name: 'note', maxlength: 200, placeholder: existing ? 'What changed (optional)' : 'Optional note' });
    const result = el('div', { 'data-result': '' });
    const current = () => cat.find((a) => a.key === action.value);
    function fillTrigger() {
      const a = current(); trigger.replaceChildren();
      if (!a) { trigger.append(el('option', { value: '', text: 'Choose the action first' })); return; }
      for (const t of [...new Set([...a.triggers, 'manual'])]) trigger.append(el('option', { value: t, text: meta.triggers[t], selected: t === def.trigger }));
      analysis.disabled = !a.has_ai; if (!a.has_ai) analysis.value = 'rules'; else analysis.value = def.analysis || 'rules';
    }
    function fillConds() {
      const fields = meta.condition_fields[trigger.value] || [];
      condBox.replaceChildren();
      def.conditions = def.conditions.filter((c) => fields.includes(c.field));
      def.conditions.forEach((c, i) => {
        const field = el('select', { 'aria-label': 'Field', onchange: (e) => { c.field = e.target.value; } }, fields.map((x) => el('option', { value: x, text: human(x), selected: x === c.field })));
        const op = el('select', { 'aria-label': 'Comparison', onchange: (e) => { c.op = e.target.value; } }, OPS.map(([v, t]) => el('option', { value: v, text: t, selected: v === c.op })));
        const val = el('input', { 'aria-label': 'Value', value: c.value ?? '', onchange: (e) => { const v = e.target.value.trim(); c.value = v === 'true' ? true : v === 'false' ? false : v !== '' && !Number.isNaN(Number(v)) ? Number(v) : v; } });
        condBox.append(el('div', { class: 'au-cond' }, field, op, val, el('button', { type: 'button', class: 'portal-button', text: 'Remove', onclick: () => { def.conditions.splice(i, 1); fillConds(); } })));
      });
      if (fields.length) condBox.append(el('button', { type: 'button', class: 'portal-button', text: 'Add a condition', onclick: () => { def.conditions.push({ field: fields[0], op: 'eq', value: '' }); fillConds(); } }));
      else condBox.append(el('p', { class: 'pl-meta', text: 'This trigger has no conditions to test.' }));
      if (fields.includes('enquiry.category')) condBox.append(el('p', { class: 'pl-meta', text: 'Enquiry categories: ' + CATS.map(human).join(', ') + '. Urgency: high or normal.' }));
    }
    function fillParams() {
      const a = current(); paramBox.replaceChildren();
      if (!a) return;
      for (const k of a.params) {
        if (k === 'prices') { paramBox.append(el('fieldset', { class: 'au-prices' }, el('legend', { text: 'Price by enquiry type, ex GST ($). Leave blank to use the usual price.' }), CATS.map((c) => el('label', {}, human(c), el('input', { type: 'number', min: 0, step: 'any', 'data-price': c, value: def.params.prices?.[c] ?? '' }))))); continue; }
        const [label, type] = PARAM[k] || [human(k), 'text'];
        const input = type === 'textarea' ? el('textarea', { 'data-param': k, rows: 3, maxlength: 2000, text: def.params[k] ?? '' }) : el('input', { 'data-param': k, type, value: type === 'checkbox' ? null : def.params[k] ?? '', checked: type === 'checkbox' ? def.params[k] !== false : null, step: type === 'number' ? 'any' : null });
        paramBox.append(el('label', { class: type === 'checkbox' ? 'pl-check' : '' }, type === 'checkbox' ? input : label, type === 'checkbox' ? label : input));
      }
      if (!a.params.length) paramBox.append(el('p', { class: 'pl-meta', text: 'No settings needed.' }));
    }
    function fillLevel() {
      const a = current(); levelBox.replaceChildren();
      if (!a) return;
      const rule = a.rule ? meta.rules.find((r) => r.key === a.rule) : null;
      let lv = a.level;
      if (lv === 2 && !rule?.enabled) lv = 3;
      if (always.checked && lv < 3) lv = 3;
      levelBox.append(levelChip(lv), el('p', { class: 'pl-meta', text: LEVEL_HELP[lv] }));
      if (a.level === 2) levelBox.append(el('p', { class: 'pl-meta', text: `Rule "${rule?.label}": ${rule?.enabled ? 'on, so it can run on its own.' : 'off, so each one waits for approval. Switch it on in Rules & safety.'}` }));
      if (a.manual) levelBox.append(el('p', { class: 'pl-meta', text: 'After approval a person carries it out and marks it done. Super Pro does not do it for you.' }));
      if (a.effect !== 'output') levelBox.append(el('p', { class: 'pl-meta', text: 'If customer text looks like instructions to the system, this always waits for approval.' }));
    }
    function collect() {
      const a = current();
      const params = {};
      paramBox.querySelectorAll('[data-param]').forEach((i) => { if (i.type === 'checkbox') params[i.dataset.param] = i.checked; else if (i.value.trim() !== '') params[i.dataset.param] = i.type === 'number' ? Number(i.value) : i.value.trim(); });
      const prices = {}; paramBox.querySelectorAll('[data-price]').forEach((i) => { if (i.value !== '') prices[i.dataset.price] = Number(i.value); });
      if (a?.params.includes('prices')) params.prices = prices;
      return { trigger: trigger.value, action: action.value, conditions: def.conditions.filter((c) => c.value !== ''), analysis: analysis.value, params, always_approve: always.checked, approval_expires_hours: Number(expires.value) || 72 };
    }
    action.addEventListener('change', () => { def.params = {}; fillTrigger(); fillConds(); fillParams(); fillLevel(); });
    trigger.addEventListener('change', () => { fillConds(); });
    always.addEventListener('change', fillLevel);
    const step = (n, title, help, ...kids) => el('li', { class: 'au-step' }, el('div', { class: 'au-step-head' }, el('span', { class: 'au-num', 'aria-hidden': 'true', text: n }), el('h3', { text: title })), help ? el('p', { class: 'pl-meta', text: help }) : null, ...kids);
    const save = el('button', { type: 'submit', class: 'portal-button primary', text: existing ? 'Save new version' : 'Save automation' });
    const test = el('button', { type: 'button', class: 'portal-button', text: 'Test with a dry run', onclick: (e) => busy(e.target, async () => {
      const r = await api('/api/saas/automation/dry-run', { method: 'POST', body: JSON.stringify({ definition: collect() }) });
      result.replaceChildren(); showRun(result, r.run); e.target.disabled = false;
    }) });
    f.append(
      el('div', { class: 'pl-card-head' }, el('h2', { text: existing ? `Edit "${existing.name}"` : 'New automation' }), el('button', { type: 'button', class: 'portal-button', text: 'Close', onclick: () => holder.replaceChildren() })),
      el('label', {}, 'Name', name),
      el('ol', { class: 'au-steps' },
        step(1, 'Proposed action', 'What Super Pro prepares or does. The action is fixed here: AI can never pick a different one.', action, paramBox),
        step(2, 'Trigger', 'When it starts.', trigger),
        step(3, 'Conditions', 'Only continue when these are true. Leave empty to always continue.', condBox),
        step(4, 'Analysis', 'How the details are worked out. Customer text is treated as data, never as instructions.', analysis),
        step(5, 'Approval', null, levelBox, el('label', { class: 'pl-check' }, always, 'Always ask me first'), el('label', {}, 'Approval requests expire after (hours)', expires)),
        step(6, 'Execution', 'Runs once per event (no duplicates), is retried at most 3 times if a service fails, and stops at once when you pause automations.'),
        step(7, 'Verification', 'After running, Super Pro checks the result really happened and shows it in Activity. Anything that does not check out is flagged.')),
      el('label', {}, 'Version note', note),
      el('div', { class: 'pl-actions' }, save, test), result);
    f.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (name.value.trim().length < 3) { say('Give the automation a name (at least 3 characters).', true); name.focus(); return; }
      if (!action.value) { say('Choose what it should do.', true); action.focus(); return; }
      await busy(save, async () => {
        const payload = JSON.stringify({ name: name.value.trim(), definition: collect(), ...(note.value.trim() ? { note: note.value.trim() } : {}) });
        if (existing) await api(`/api/saas/automation/workflows/${existing.id}`, { method: 'PUT', body: payload });
        else await api('/api/saas/automation/workflows', { method: 'POST', body: payload });
        say(existing ? 'New version saved.' : 'Automation saved. Turn it on when you are happy with the dry run.');
        holder.replaceChildren(); await render();
      });
    });
    holder.replaceChildren(f);
    if (existing) {
      f.append(el('details', { class: 'au-versions' }, el('summary', { text: `Versions (${existing.versions.length})` }), el('ul', {}, existing.versions.map((v) => el('li', {}, `Version ${v.version} · ${when(v.created_at)} · ${v.note || ''} `, v.version !== existing.current_version ? el('button', { type: 'button', class: 'portal-button', text: 'Restore', onclick: (e) => busy(e.target, async () => { await api(`/api/saas/automation/workflows/${existing.id}/restore`, { method: 'POST', body: JSON.stringify({ version: v.version }) }); say(`Version ${v.version} restored as a new version.`); holder.replaceChildren(); await render(); }) }) : el('span', { class: 'pl-meta', text: '(current)' }))))));
    }
    fillTrigger(); fillConds(); fillParams(); fillLevel();
    name.focus();
  }

  // ---------------- Activity ----------------
  async function runs(workflowId = '') {
    const b = body();
    const filter = el('select', { class: 'pl-filter', 'aria-label': 'Show', onchange: () => load() }, [['', 'All runs'], ['awaiting_approval', 'Waiting for approval'], ['failed', 'Failed'], ['verification_failed', 'Did not check out'], ['awaiting_manual', 'Waiting for a person'], ['held', 'Held by the pause'], ['completed', 'Done']].map(([v, t]) => el('option', { value: v, text: t })));
    const list = el('div', { class: 'au-runs' });
    b.append(el('div', { class: 'pl-toolbar' }, filter, workflowId ? el('button', { type: 'button', class: 'portal-button', text: 'Show all automations', onclick: () => runs() }) : null), list);
    async function load() {
      const q = new URLSearchParams({ limit: '100' }); if (filter.value) q.set('status', filter.value); if (workflowId) q.set('workflow_id', workflowId);
      const { runs: rows } = await api('/api/saas/automation/runs?' + q);
      list.replaceChildren(...rows.map(runCard));
      if (!rows.length) list.append(el('p', { class: 'portal-empty', text: 'No runs to show.' }));
    }
    await load();
  }
  function runCard(r) {
    const c = el('article', { class: 'portal-card au-runcard', 'data-run': r.id },
      el('div', { class: 'pl-card-head' }, el('h2', { text: r.action_label }), badge(r.status)),
      el('p', { class: 'pl-meta', text: `${r.trigger_label} · ${when(r.created_at)}${r.level ? ' · ' + LEVEL[r.level] : ''}${r.attempts > 1 ? ` · ${r.attempts} attempts` : ''}` }),
      r.preview ? el('p', { class: 'pl-body', text: `${r.preview.description}. ${r.preview.expected_outcome || ''}` }) : null,
      r.result?.summary ? el('p', { class: 'pl-meta', text: r.result.summary }) : null,
      r.verification ? el('p', { class: 'pl-meta', text: 'Check: ' + r.verification.detail }) : null,
      r.error ? el('p', { class: 'pl-meta', 'data-tone': 'bad', text: r.error }) : null,
      r.suspicious ? el('p', { class: 'pl-meta', 'data-tone': 'bad', text: 'Contained text that looked like instructions; treated as plain text.' }) : null);
    const acts = el('div', { class: 'pl-actions' });
    if (r.status === 'awaiting_approval') acts.append(el('a', { class: 'portal-button primary', href: '#b01/approvals', text: 'Open Approvals' }));
    if (['failed', 'verification_failed'].includes(r.status)) acts.append(el('button', { type: 'button', class: 'portal-button', text: 'Try again', onclick: (e) => busy(e.target, async () => { await api(`/api/saas/automation/runs/${r.id}/retry`, { method: 'POST', body: '{}' }); say('Trying again. The result appears here.'); await runs(); }) }));
    if (r.status === 'awaiting_manual') acts.append(el('button', { type: 'button', class: 'portal-button primary', text: 'Mark as done', onclick: () => {
      c.querySelector('.pl-inline')?.remove();
      const fm = el('form', { class: 'pl-inline portal-form' }, el('label', {}, 'What was done (for the record)', el('input', { name: 'note', maxlength: 500, required: true })));
      const sb = el('button', { type: 'submit', class: 'portal-button primary', text: 'Save' });
      fm.append(el('div', { class: 'pl-actions' }, sb));
      fm.addEventListener('submit', (e) => { e.preventDefault(); busy(sb, async () => { await api(`/api/saas/automation/runs/${r.id}/manual-done`, { method: 'POST', body: JSON.stringify({ note: fm.elements.note.value.trim() }) }); say('Marked as done.'); await runs(); }); });
      c.append(fm); fm.querySelector('input').focus();
    } }));
    acts.append(el('button', { type: 'button', class: 'portal-button', text: 'Audit trail', onclick: async (e) => {
      const box = c.querySelector('.au-trail'); if (box) { box.remove(); return; }
      await busy(e.target, async () => {
        const d = await api(`/api/saas/automation/runs/${r.id}`);
        c.append(el('ol', { class: 'au-trail pl-events' }, d.audit.map((x) => el('li', {}, el('b', { text: human(x.action.replace('automation.', '')) }), ` · ${x.user_name || 'AI automation'} · ${when(x.created_at)}`))));
        e.target.disabled = false;
      });
    } }));
    c.append(acts);
    return c;
  }

  // ---------------- Suggestions & reports ----------------
  async function outputs() {
    const b = body();
    const { outputs: rows } = await api('/api/saas/automation/outputs');
    const KIND = { suggestion: 'Suggestion', report: 'Report', alert: 'Needs attention', draft: 'Draft', summary: 'Summary' };
    const grid = el('div', { class: 'pl-grid' });
    for (const o of rows) {
      const c = el('article', { class: 'portal-card pl-card', 'data-output': o.id }, el('div', { class: 'pl-card-head' }, el('h2', { text: o.title }), el('span', { class: 'portal-status ' + (o.kind === 'alert' ? 'pl-issued' : 'pl-draft'), text: KIND[o.kind] || o.kind })),
        el('p', { class: 'pl-body', text: o.body }), el('p', { class: 'pl-meta', text: when(o.created_at) }));
      const acts = el('div', { class: 'pl-actions' });
      if (o.link) acts.append(el('a', { class: 'portal-button', href: o.link, text: 'Open' }));
      for (const [st, label] of [['done', 'Done'], ['dismissed', 'Dismiss']]) acts.append(el('button', { type: 'button', class: 'portal-button' + (st === 'done' ? ' primary' : ''), text: label, onclick: (e) => busy(e.target, async () => { await api(`/api/saas/automation/outputs/${o.id}`, { method: 'POST', body: JSON.stringify({ status: st }) }); c.remove(); say(st === 'done' ? 'Marked done.' : 'Dismissed.'); }) }));
      c.append(acts); grid.append(c);
    }
    if (!rows.length) grid.append(el('p', { class: 'portal-empty', text: 'Nothing waiting. Suggestions, reports and alerts from your automations appear here.' }));
    b.append(grid);
  }

  // ---------------- Rules & safety ----------------
  function rules() {
    const b = body(), can = ownerish();
    b.append(el('section', { class: 'portal-panel au-stop' },
      el('h2', { text: 'Emergency pause' }),
      el('p', { class: 'pl-meta', text: 'Stops every automation in this business at once. Analysis and approval requests continue, but nothing is carried out until you resume. Any senior team member can pause; only the owner or an administrator can resume.' }),
      meta.pause.paused ? el('p', { class: 'pl-meta', text: `Paused ${when(meta.pause.at)}${meta.pause.reason ? ': ' + meta.pause.reason : ''}.` })
        : (() => { const reason = el('input', { maxlength: 300, placeholder: 'Reason (optional)', 'aria-label': 'Reason for pausing' }); return el('div', { class: 'pl-actions' }, reason, el('button', { type: 'button', class: 'portal-button au-danger', text: 'Pause all automations', onclick: (e) => busy(e.target, async () => { await api('/api/saas/automation/pause', { method: 'POST', body: JSON.stringify({ paused: true, reason: reason.value.trim() || undefined }) }); say('All automations are paused.'); await render(); }) })); })()));
    const grid = el('div', { class: 'pl-grid' });
    for (const r of meta.rules) {
      grid.append(el('article', { class: 'portal-card pl-card', 'data-rule': r.key },
        el('div', { class: 'pl-card-head' }, el('h2', { text: r.label }), el('span', { class: 'portal-status ' + (r.enabled ? 'pl-paid' : 'pl-lost'), text: r.enabled ? 'Runs without asking' : 'Asks first' })),
        el('p', { class: 'pl-body', text: r.detail }),
        r.configured_at ? el('p', { class: 'pl-meta', text: `Last changed ${when(r.configured_at)}` }) : null,
        can ? el('div', { class: 'pl-actions' }, el('button', { type: 'button', class: 'portal-button' + (r.enabled ? '' : ' primary'), text: r.enabled ? 'Ask me first again' : 'Allow without asking', onclick: (e) => busy(e.target, async () => { await api(`/api/saas/automation/rules/${r.key}`, { method: 'PUT', body: JSON.stringify({ enabled: !r.enabled, limits: r.limits }) }); say(`${r.label}: ${r.enabled ? 'asks first again' : 'now runs without asking'}.`); await render(); }) })) : el('p', { class: 'pl-meta', text: 'Only the owner or an administrator can change this.' })));
    }
    b.append(el('h2', { class: 'au-h', text: 'Level 2 rules' }), el('p', { class: 'pl-meta', text: 'These routine actions can run without asking, but only while you allow it. When a rule is off, each one waits in Approvals.' }), grid,
      el('section', { class: 'portal-panel' }, el('h2', { text: 'Built-in limits' }), el('ul', { class: 'au-limits' },
        el('li', { text: 'Sending quotes, refunds and transfers, price changes, new campaigns, publishing, staff permissions, legal submissions, billing changes, data export or deletion always need approval.' }),
        el('li', { text: 'Never done by automation: changing bank details, paying new payees, bulk-deleting customers, switching off approvals or audit logs, or following instructions found in emails, documents or websites.' }),
        el('li', { text: `At most ${meta.limits.runsPerHour} runs and ${meta.limits.executionsPerHour} actions per hour, and ${meta.limits.maxAttempts} attempts per action.` }),
        el('li', { text: 'Recipients and records always come from your own records, never from AI or customer text.' }))));
  }

  // ---------------- Audit report ----------------
  async function audit() {
    const b = body();
    const days = el('select', { class: 'pl-filter', 'aria-label': 'Period', onchange: () => load() }, [[7, 'Last 7 days'], [30, 'Last 30 days'], [90, 'Last 90 days']].map(([v, t]) => el('option', { value: v, text: t, selected: v === 30 })));
    const out = el('div');
    b.append(el('div', { class: 'pl-toolbar' }, days, el('button', { type: 'button', class: 'portal-button', text: 'Print', onclick: () => window.print() })), out);
    async function load() {
      const { report } = await api('/api/saas/automation/audit?days=' + days.value);
      const total = report.by_status.reduce((n, x) => n + x.n, 0);
      const stat = (label, n) => el('div', { class: 'pl-stage' }, el('b', { text: String(n) }), el('span', { text: label }));
      const n = (k) => report.by_status.filter((x) => k.includes(x.status)).reduce((a, x) => a + x.n, 0);
      out.replaceChildren(
        el('div', { class: 'au-stats' }, stat('Runs', total), stat('Done', n(['completed', 'completed_warning'])), stat('Waited for approval', report.by_level.find((x) => x.level === 3)?.n || 0), stat('Failed', n(['failed', 'verification_failed'])), stat('Suspicious text', report.suspicious)),
        el('div', { class: 'au-tablewrap' }, el('table', { class: 'au-table' }, el('caption', { text: 'By action' }), el('thead', {}, el('tr', {}, ['Action', 'Runs', 'Done', 'Failed'].map((h) => el('th', { scope: 'col', text: h })))),
          el('tbody', {}, report.by_action.map((a) => el('tr', {}, el('th', { scope: 'row', text: a.label }), el('td', { text: a.n }), el('td', { text: a.completed || 0 }), el('td', { text: a.failed || 0 })))))),
        el('h2', { class: 'au-h', text: 'Audit log' }),
        el('ol', { class: 'pl-events au-log' }, report.events.map((e) => el('li', {}, el('b', { text: human(e.action.replace('automation.', '')) }), ` · ${e.user_name || 'AI automation'} · ${when(e.created_at)}${e.metadata?.action ? ' · ' + human(e.metadata.action) : ''}`))),
        report.events.length ? null : el('p', { class: 'portal-empty', text: 'No automation activity in this period.' }));
    }
    await load();
  }

  window.addEventListener('gds:viewchange', (e) => { if (e.detail?.view === 'automations') { view(); render(); } });
  view();
  window.SuperProAutomations = { render };
  void senior;
})();
