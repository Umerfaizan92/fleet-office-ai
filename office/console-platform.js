// Phase 04 Founder Console tabs: Revenue, Infrastructure, Storage & backups, AI usage, Compliance, Feature access &
// configuration. Read-only views of server data; each says where its numbers come from and what is not recorded.
(() => {
  const el = (tag, attrs = {}, ...kids) => {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) { if (v === null || v === undefined || v === false) continue; if (k === 'class') e.className = v; else if (k === 'text') e.textContent = v; else e.setAttribute(k, v); }
    for (const k of kids.flat()) if (k !== null && k !== undefined && k !== false) e.append(k.nodeType ? k : document.createTextNode(String(k)));
    return e;
  };
  const money = (c) => (c === null || c === undefined ? 'Not recorded' : (c / 100).toLocaleString('en-AU', { style: 'currency', currency: 'AUD' }));
  const yes = (b) => el('span', { class: 'portal-status' + (b ? ' good' : ''), text: b ? 'Yes' : 'No' });
  const stat = (label, value, hint) => el('article', { class: 'portal-panel cp-stat' }, el('span', { class: 'cp-label', text: label }), el('b', { text: value }), hint ? el('small', { text: hint }) : null);
  const table = (cols, rows, empty = 'Nothing recorded yet.') => rows && rows.length
    ? el('div', { class: 'cp-table-wrap' },
      el('table', { class: 'cp-table' },
        el('thead', {}, el('tr', {}, cols.map(([, h]) => el('th', { text: h })))),
        el('tbody', {}, rows.map((r) => el('tr', {}, cols.map(([k, , f]) => el('td', {}, f ? f(r[k], r) : String(r[k] ?? ''))))))))
    : el('p', { class: 'portal-note', text: rows === null ? 'Not recorded in this database.' : empty });
  const section = (title, ...kids) => el('section', { class: 'portal-panel cp-section' }, el('h2', { text: title }), ...kids);
  const note = (t) => el('p', { class: 'portal-note cp-note', text: t });
  const grid = (...k) => el('div', { class: 'cp-grid' }, ...k);
  const dur = (s) => { const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60); return d ? `${d} d ${h} h` : h ? `${h} h ${m} min` : `${m} min`; };
  const label = (k) => String(k || '').replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());

  const renderers = {
    async 'platform/revenue'(host, api) {
      const d = await api('/api/operator/platform/revenue');
      host.append(
        note(d.note),
        grid(stat('Monthly recurring revenue', money(d.mrr_cents), `${d.subscriptions.active_paying} paying business${d.subscriptions.active_paying === 1 ? '' : 'es'}${d.addon_mrr_cents ? `, incl. ${money(d.addon_mrr_cents)} add-ons` : ''}`),
          stat('In trial', String(d.subscriptions.trialing), `${money(d.trial_pipeline_cents)} a month if they convert`),
          stat('Paid, last 30 days', money(d.paid_last_30_days_cents), `90 days: ${money(d.paid_last_90_days_cents)}`),
          stat('Waived (complimentary)', String(d.subscriptions.waived), 'Excluded from revenue')),
        section('By plan', table([['plan', 'Plan'], ['monthly_fee_cents', 'Price a month', money], ['active', 'Paying'], ['trialing', 'Trial'], ['waived', 'Waived'], ['other', 'Other']], d.plans)),
        section('Platform invoices', table([['status', 'Status', label], ['count', 'Invoices'], ['total_cents', 'Total', money]], d.invoices, 'No platform invoices yet.'))
      );
    },
    async system(host, api) {
      const [d, j] = await Promise.all([api('/api/operator/system'), api('/api/operator/jobs')]);
      const st = j.stats || {};
      host.append(
        grid(stat('Server running for', dur(d.uptime_seconds), `Node ${d.node}`), stat('Memory in use', `${d.memory_mb.rss} MB`, `Heap ${d.memory_mb.heap_used} MB`),
          stat('Database size', d.database_mb === null ? 'Unknown' : `${d.database_mb} MB`), stat('Background jobs waiting', String(st.counts?.queued ?? 0), st.oldest_due_seconds ? `Oldest waiting ${dur(st.oldest_due_seconds)}` : 'None overdue')),
        section('File storage', el('p', {}, `Mode: ${d.storage.primary_mode === 's3' ? 'private S3 bucket' : 'server disk'} · Ready: `, yes(d.storage.primary_ready)), d.storage.problems?.length ? el('ul', {}, d.storage.problems.map((p) => el('li', { text: p }))) : null),
        section('Background jobs', table([['status', 'Status', label], ['count', 'Jobs']], Object.entries(st.counts || {}).map(([status, count]) => ({ status, count }))),
          table([['type', 'Job'], ['status', 'Status', label], ['attempts', 'Attempts'], ['last_error', 'Last error', (v) => v || '']], (j.jobs || []).filter((x) => ['failed', 'dead'].includes(x.status)).slice(0, 20), 'No failed jobs.')),
        section('Security posture', table([['id', 'Check', (v) => label(String(v).replace(/^security\./, ''))], ['status', 'Status', (v) => el('span', { class: 'portal-status' + (v === 'pass' ? ' good' : ''), text: v === 'pass' ? 'OK' : 'Needs attention' })], ['detail', 'Detail']], Array.isArray(d.security) ? d.security : []), note('In development every check shows OK; in production a missing setting shows Needs attention.')),
        note('Live figures from this server. Re-open the tab to refresh.')
      );
    },
    async 'platform/backups'(host, api) {
      const d = await api('/api/operator/platform/backups');
      host.append(
        section('Database backups', table([['k', 'Check'], ['v', 'Status', (v) => (typeof v === 'boolean' ? yes(v) : String(v ?? 'Not set'))]], [
          { k: 'Backup bucket configured', v: d.database_backup.configured }, { k: 'Backups disabled by setting', v: d.database_backup.disabled },
          { k: 'Encryption', v: d.database_backup.encryption }, { k: 'Uploaded files included', v: d.database_backup.uploads_included }, { k: 'Region', v: d.database_backup.region },
          { k: 'Database on the persistent disk', v: d.persistent_disk }])),
        section('Customer files', table([['k', 'Check'], ['v', 'Status', (v) => (typeof v === 'boolean' ? yes(v) : String(v))]], [
          { k: 'Storage mode', v: d.primary_files.mode === 's3' ? 'Private S3 bucket' : 'Server disk' }, { k: 'Ready', v: d.primary_files.ready }, { k: 'Separate from the backup bucket', v: d.primary_files.separate_from_backup }]),
          d.primary_files.problems?.length ? el('ul', {}, d.primary_files.problems.map((p) => el('li', { text: p }))) : null),
        section('Restore drill', note(d.restore_drill.how))
      );
    },
    async 'platform/ai-usage'(host, api) {
      const d = await api('/api/operator/platform/ai-usage');
      host.append(
        note(d.note),
        grid(stat('AI requests, 30 days', d.ai_requests_30_days === null ? 'Not recorded' : String(d.ai_requests_30_days)),
          stat('Quality checks, 30 days', d.quality_checks_30_days ? String(d.quality_checks_30_days.runs) : 'Not recorded', d.quality_checks_30_days?.runs ? `${d.quality_checks_30_days.passed} passed · average score ${d.quality_checks_30_days.average_score}` : null),
          stat('AI provider connected', d.providers.text ? 'Yes' : 'No', d.providers.free_mode ? 'Free mode is on' : null), stat('Provider cost', 'Not recorded', 'See the AI provider’s billing')),
        section('Busiest businesses', table([['business', 'Business'], ['requests', 'AI requests']], d.by_business, 'No AI requests in the last 30 days.')),
        section('All recorded usage', table([['kind', 'Kind', label], ['count', 'Count']], d.usage_by_kind_30_days, 'No usage recorded in the last 30 days.'))
      );
    },
    async 'platform/compliance'(host, api) {
      const d = await api('/api/operator/platform/compliance');
      host.append(
        grid(stat('Terms version in force', d.legal.current_version), stat('Owners on the current terms', d.legal.accepted_current_version === null ? 'Not recorded' : `${d.legal.accepted_current_version} of ${d.legal.business_owners}`), stat('Operator MFA required', d.operator_mfa_required ? 'Yes' : 'No')),
        section('Privacy requests', table([['type', 'Request', label], ['status', 'Status', label], ['count', 'Count']], d.privacy_requests, 'No privacy requests.')),
        section('Support cases and complaints', table([['category', 'Category', label], ['status', 'Status', label], ['count', 'Count']], d.support_cases, 'No support cases.')),
        section('Account deletion requests', table([['status', 'Status', label], ['count', 'Count']], d.account_deletions, 'No deletion requests.'))
      );
    },
    async 'platform/configuration'(host, api) {
      const d = await api('/api/operator/platform/configuration');
      host.append(
        section('Environment', table([['k', 'Setting'], ['v', 'Value', (v) => (typeof v === 'boolean' ? yes(v) : String(v ?? 'Not set'))]], [{ k: 'Environment', v: d.environment }, { k: 'Public address', v: d.public_base_url }, { k: 'Operator MFA required', v: d.security.operator_mfa_required }, { k: 'Founder key set', v: d.security.admin_key_set }])),
        section('Providers connected', table([['k', 'Provider'], ['v', 'Connected', yes]], Object.entries(d.providers).map(([k, v]) => ({ k: label(k), v })))),
        section('Feature access', note(d.feature_access.model),
          table([['name', 'Plan'], ['monthly_fee_cents', 'Price a month', money], ['limits', 'Limits', (v) => Object.entries(v || {}).map(([k, x]) => `${label(k)}: ${typeof x === 'object' ? JSON.stringify(x) : x}`).join(' · ') || 'No limits recorded']], d.feature_access.plans),
          table([['profile', 'Complimentary profile', label], ['count', 'Businesses']], d.feature_access.complimentary_grants_by_profile, 'No complimentary grants.'))
      );
    },
    // Phase 06: SEO Command Centre, audit, clusters, Google, content, analytics and reports for Super Pro's own website.
    async 'platform/seo'(host, api) {
      if (!window.SuperProSeo) { host.append(note('The SEO module did not load. Reload the page.')); return; }
      await window.SuperProSeo.mount(host, '/api/operator/seo', api).render('seocentre');
    },
    // Phase 05: platform automations, platform approvals (Level 3), manual completion, platform-wide pause and audit.
    async 'platform/automation'(host, api) {
      const d = await api('/api/operator/automation');
      const when = (v) => (v ? new Date(v).toLocaleString('en-AU', { dateStyle: 'medium', timeStyle: 'short' }) : '');
      const msg = el('p', { class: 'portal-note cp-note', role: 'status', 'aria-live': 'polite' });
      const root = host.cpRoot || host; // the container on the page, even when this render was built off-page by a reload
      const reload = async (text, bad = false) => { const box = el('div'); box.cpRoot = root; try { await renderers['platform/automation'](box, api); root.replaceChildren(...box.childNodes); } catch (e) { bad = true; text = e.message; } const m = root.querySelector('[role=status]'); if (m) { m.textContent = text; m.dataset.tone = bad ? 'bad' : 'good'; } };
      const btn = (text, fn, primary = false) => { const b = el('button', { type: 'button', class: 'portal-button' + (primary ? ' primary' : ''), text }); b.addEventListener('click', async () => { b.disabled = true; try { await fn(); } catch (e) { msg.textContent = e.message; msg.dataset.tone = 'bad'; b.disabled = false; } }); return b; };
      const post = (url, body) => api(url, { method: 'POST', body: JSON.stringify(body || {}) });
      const s = d.summary, runs = s.runs_24h.reduce((n, r) => n + r.n, 0);
      const pause = d.pause.paused
        ? section('Emergency pause', el('p', { class: 'cp-alert', text: `All automations on the platform are paused${d.pause.reason ? ': ' + d.pause.reason : ''}. Waiting work is kept.` }), el('div', { class: 'cp-actions' }, btn('Resume all automations', async () => { const r = await post('/api/operator/automation/pause', { paused: false }); await reload(`Resumed. ${r.resumed} held task(s) are running.`); }, true)))
        : (() => { const reason = el('input', { maxlength: 300, placeholder: 'Reason (optional)', 'aria-label': 'Reason for pausing' }); return section('Emergency pause', note('Stops every automation for every business and the platform at once. Businesses cannot lift a platform pause.'), el('div', { class: 'cp-actions' }, reason, btn('Pause all automations', async () => { await post('/api/operator/automation/pause', { paused: true, reason: reason.value.trim() || undefined }); await reload('All automations are paused.'); }))); })();
      const approvals = d.approvals.filter((a) => ['pending', 'clarification_requested'].includes(a.status));
      const apCard = (a) => {
        const c = el('article', { class: 'portal-panel cp-approval', 'data-approval': a.id },
          el('h3', { text: a.title }),
          el('p', { class: 'cp-meta', text: `${a.reference_code} · ${label(a.risk_level)} risk · Level ${a.policy_level} · requested ${when(a.requested_at)} · expires ${when(a.expires_at)}${a.execute_after ? ' · scheduled ' + when(a.execute_after) : ''}` }),
          el('p', { text: a.summary || '' }),
          a.clarification_question ? el('p', { class: 'cp-meta', text: `Question: ${a.clarification_question}${a.clarification_answer ? ' · Answer: ' + a.clarification_answer : ''}` }) : null);
        const acts = el('div', { class: 'cp-actions' });
        const inline = (field, placeholder, submit) => { c.querySelector('.cp-inline')?.remove(); const i = el(field === 'datetime' ? 'input' : 'textarea', field === 'datetime' ? { type: 'datetime-local', 'aria-label': placeholder } : { rows: 2, maxlength: 1000, placeholder, 'aria-label': placeholder }); c.append(el('div', { class: 'cp-inline cp-actions' }, i, btn('Save', async () => { await submit(i.value); }, true))); i.focus(); };
        if (a.status === 'pending') {
          acts.append(btn('Approve', async () => { await post(`/api/operator/automation/approvals/${a.id}/decision`, { decision: 'approve' }); await reload('Approved.'); }, true),
            btn('Reject', async () => { await post(`/api/operator/automation/approvals/${a.id}/decision`, { decision: 'reject' }); await reload('Rejected. Nothing was done.'); }),
            btn('Schedule', async () => inline('datetime', 'Run at', async (v) => { await post(`/api/operator/automation/approvals/${a.id}/schedule`, { execute_after: new Date(v).toISOString() }); await reload('Scheduled.'); })),
            btn('Request clarification', async () => inline('text', 'Your question', async (v) => { await post(`/api/operator/automation/approvals/${a.id}/clarify`, { question: v }); await reload('Question recorded.'); })));
        } else acts.append(btn('Answer the question', async () => inline('text', 'Answer', async (v) => { await post(`/api/operator/automation/approvals/${a.id}/clarification`, { answer: v }); await reload('Answer saved.'); })), btn('Reject', async () => { await post(`/api/operator/automation/approvals/${a.id}/decision`, { decision: 'reject' }); await reload('Rejected.'); }));
        c.append(acts);
        return c;
      };
      const newFlow = (() => {
        const sel = el('select', { 'aria-label': 'Action' }, d.catalogue.filter((a) => !a.restricted).map((a) => el('option', { value: a.key, text: `${a.label} (Level ${a.level})` })));
        const name = el('input', { maxlength: 120, placeholder: 'Name', 'aria-label': 'Name' });
        const details = el('textarea', { rows: 2, maxlength: 2000, placeholder: 'For manual actions: what exactly should happen', 'aria-label': 'Details' });
        return el('details', { class: 'cp-new' }, el('summary', { text: 'Add a platform automation' }), el('div', { class: 'cp-actions' }, name, sel, details, btn('Save', async () => {
          const a = d.catalogue.find((x) => x.key === sel.value);
          await post('/api/operator/automation/workflows', { name: name.value.trim() || a.label, definition: { trigger: a.triggers[0], action: a.key, params: a.params.includes('details') ? { details: details.value.trim() } : {} } });
          await reload('Automation saved. Switch it on to run on its schedule.');
        }, true)));
      })();
      host.append(
        note('Platform automations check health, backups and failed work, and route deployments, infrastructure changes, credential rotation and security policy changes to you for approval. Automation never deploys, changes infrastructure or rotates keys itself: after approval a person does it and marks it done.'),
        msg,
        grid(stat('Businesses using automations', String(s.businesses_with_automations), `${s.active_workflows} active`), stat('Runs, last 24 hours', String(runs), s.runs_24h.map((r) => `${label(r.status)} ${r.n}`).join(' · ') || 'None'), stat('Business approvals waiting', String(s.waiting_approval)), stat('Suspicious text, 24 hours', String(s.suspicious_24h), `${s.paused_businesses} business(es) paused`)),
        pause,
        section('Waiting for your approval', approvals.length ? el('div', { class: 'cp-list' }, approvals.map(apCard)) : note('Nothing is waiting.')),
        section('Platform automations', newFlow, table([['name', 'Name'], ['action_label', 'Action'], ['trigger_label', 'Runs'], ['status', 'Status', label], ['last_status', 'Last result', (v, r) => (v ? `${label(v)} · ${when(r.last_run_at)}` : 'Not run yet')], ['id', '', (id, r) => el('span', { class: 'cp-actions' },
          btn(r.status === 'active' ? 'Turn off' : 'Turn on', async () => { await post(`/api/operator/automation/workflows/${id}/status`, { status: r.status === 'active' ? 'paused' : 'active' }); await reload(`${r.name}: ${r.status === 'active' ? 'off' : 'on'}.`); }),
          btn('Run now', async () => { const x = await post(`/api/operator/automation/workflows/${id}/run`, {}); await reload(`${r.name}: ${label(x.run.status)}.`); }))]], d.workflows, 'No platform automations yet.')),
        section('Recent runs', table([['created_at', 'When', when], ['action_label', 'Action'], ['status', 'Result', label], ['result', 'Detail', (v, r) => r.error || r.verification?.detail || v?.summary || ''], ['id', '', (id, r) => (r.status === 'awaiting_manual' ? btn('Mark done', async () => { await post(`/api/operator/automation/runs/${id}/manual-done`, { note: 'Done by the founder' }); await reload('Marked done.'); }, true) : '')]], d.runs, 'No runs yet.')),
        section('Reports and alerts', d.outputs.length ? el('div', { class: 'cp-list' }, d.outputs.map((o) => el('article', { class: 'portal-panel' }, el('h3', { text: o.title }), el('p', { class: 'cp-pre', text: o.body }), el('p', { class: 'cp-meta', text: when(o.created_at) })))) : note('No open reports.')));
      const audit = await api('/api/operator/automation/audit?days=30');
      host.append(section('Platform automation audit, last 30 days', table([['created_at', 'When', when], ['action', 'Event', (v) => label(String(v).replace('automation.', ''))], ['user_name', 'By']], audit.report.events.slice(0, 50), 'No events yet.')));
    }
  };
  window.SuperProPlatformConsole = { handles: (route) => Object.prototype.hasOwnProperty.call(renderers, route), render: (route, host, api) => renderers[route](host, api) };
})();
