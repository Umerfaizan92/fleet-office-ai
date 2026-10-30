// Phase 09: Founder Console > Operations > Reliability. Health of every component, alerts, backups and restore tests,
// recovery readiness (RPO/RTO), self-healing activity, approval-only recovery actions and daily summaries.
// Buttons report success only after the server confirms it.
(() => {
  const el = (tag, attrs = {}, ...kids) => {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) { if (v === null || v === undefined || v === false) continue; if (k === 'class') e.className = v; else if (k === 'text') e.textContent = v; else if (k.startsWith('on')) e.addEventListener(k.slice(2), v); else if (k === 'value') e.value = v; else e.setAttribute(k, v === true ? '' : v); }
    for (const k of kids.flat()) if (k !== null && k !== undefined && k !== false) e.append(k.nodeType ? k : document.createTextNode(String(k)));
    return e;
  };
  const when = (v) => (v ? new Date(v).toLocaleString('en-AU', { dateStyle: 'medium', timeStyle: 'short' }) : 'Never');
  const ago = (h) => (h === null || h === undefined ? 'never' : h < 1 ? `${Math.round(h * 60)} min ago` : h < 48 ? `${Math.round(h)} h ago` : `${Math.round(h / 24)} days ago`);
  const kb = (b) => (b ? (b > 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.round(b / 1024)} KB`) : '');
  const ST = { ok: ['OK', 'good'], warn: ['Check', 'warn'], fail: ['Failing', 'bad'], unknown: ['Not checked', ''], passed: ['Passed', 'good'], failed: ['Failed', 'bad'], running: ['Running', 'warn'], open: ['Open', 'bad'], acknowledged: ['Acknowledged', 'warn'], resolved: ['Resolved', 'good'], critical: ['Critical', 'bad'], warning: ['Warning', 'warn'], requeued: ['Retried', 'warn'], left_alone: ['Left for a person', ''], gave_up: ['Gave up', 'bad'], cleared: ['Cleared', 'good'], reported: ['Reported', 'warn'], recovered: ['Recovered', 'good'], still_failing: ['Still failing', 'bad'], pending: ['Waiting for approval', 'warn'], approved: ['Approved', 'good'], rejected: ['Rejected', 'bad'] };
  const chip = (s, text) => el('span', { class: 'portal-status rl-chip ' + (ST[s]?.[1] || ''), 'data-status': s, text: text || ST[s]?.[0] || s });
  const section = (title, ...kids) => el('section', { class: 'portal-panel cp-section' }, el('h2', { text: title }), ...kids);
  const note = (t) => el('p', { class: 'portal-note cp-note', text: t });
  const table = (cols, rows, empty = 'Nothing yet.') => (rows?.length ? el('div', { class: 'cp-table-wrap' }, el('table', { class: 'cp-table' }, el('thead', {}, el('tr', {}, cols.map(([, h]) => el('th', { scope: 'col', text: h })))), el('tbody', {}, rows.map((r) => el('tr', {}, cols.map(([k, , f]) => el('td', {}, f ? f(r[k], r) : String(r[k] ?? '')))))))) : note(empty));

  async function render(host, api) {
    const root = host.cpRoot || host;
    const post = (u, b) => api(u, { method: 'POST', body: JSON.stringify(b || {}) });
    const status = el('p', { class: 'portal-note cp-note', role: 'status', 'aria-live': 'polite' });
    const say = (t, bad = false) => { const m = root.querySelector('[data-rl-status]') || status; m.textContent = t; m.dataset.tone = bad ? 'bad' : 'good'; };
    const reload = async (msg, bad) => { const box = el('div'); box.cpRoot = root; try { await render(box, api); root.replaceChildren(...box.childNodes); } catch (e) { msg = e.message; bad = true; } if (msg) say(msg, bad); };
    const btn = (text, fn, primary = false) => el('button', { type: 'button', class: 'portal-button' + (primary ? ' primary' : ''), text, onclick: async (e) => { const b = e.currentTarget; b.disabled = true; try { await fn(); if (b.isConnected) b.disabled = false; } catch (err) { say(err.message, true); b.disabled = false; } } });
    status.setAttribute('data-rl-status', '');
    const d = await api('/api/operator/reliability');
    const h = d.health, bk = d.backups, rd = d.readiness;
    const overall = h.overall;
    const banner = el('div', { class: 'rl-banner', 'data-status': overall }, chip(overall, overall === 'ok' ? 'All checks pass' : overall === 'warn' ? 'Needs attention' : overall === 'fail' ? 'Problems found' : 'Not checked yet'), el('span', { text: h.checked_at ? ` Last checked ${when(h.checked_at)}.` : ' Run the checks to see the current state.' }));
    host.append(status, banner, el('div', { class: 'cp-actions' }, btn('Run checks now', async () => { const r = await post('/api/operator/reliability/checks'); await reload(`Checks finished: ${r.components.filter((c) => c.status === 'fail').length} failing, ${r.components.filter((c) => c.status === 'warn').length} to check.`); }, true)));

    host.append(section('Components', h.components.length ? el('ul', { class: 'rl-grid' }, h.components.map((c) => el('li', { class: 'rl-card', 'data-status': c.status }, el('div', { class: 'rl-head' }, el('b', { text: c.label }), chip(c.status)), el('p', { text: c.detail })))) : note('No checks have run yet.')));

    const open = h.alerts.filter((a) => a.status !== 'resolved');
    const alertAct = (a) => { const n = el('input', { maxlength: '300', 'aria-label': `Note for ${a.title}`, placeholder: 'Note (optional)' }); return el('span', { class: 'rl-inline' }, n, a.status === 'open' ? btn('Acknowledge', async () => { await post(`/api/operator/reliability/alerts/${a.id}/acknowledge`, { note: n.value.trim() || undefined }); await reload('Alert acknowledged.'); }) : null, btn('Resolve', async () => { await post(`/api/operator/reliability/alerts/${a.id}/resolve`, { note: n.value.trim() || undefined }); await reload('Alert resolved.'); })); };
    host.append(section(`Alerts (${open.length} open)`, table([['severity', 'Level', (v) => chip(v)], ['title', 'Alert'], ['detail', 'Detail'], ['opened_at', 'Since', when], ['notify_result', 'Emailed', (v, a) => (a.severity === 'critical' ? (v === 'sent' ? 'Yes' : v === 'no_operator_email' ? 'No: set OPERATOR_ALERT_EMAIL' : v || 'Not yet') : 'Warnings are not emailed')], ['status', 'Status', (v) => chip(v)], ['id', '', (id, a) => alertAct(a)]], open, 'No open alerts.'),
      h.alerts.some((a) => a.status === 'resolved') ? el('details', {}, el('summary', { text: 'Recently resolved' }), table([['title', 'Alert'], ['opened_at', 'Opened', when], ['resolved_at', 'Resolved', when], ['resolved_by', 'By']], h.alerts.filter((a) => a.status === 'resolved').slice(0, 15))) : null));

    host.append(section('Recovery readiness', el('p', {}, chip(rd.ready ? 'ok' : 'warn', rd.ready ? 'Ready' : 'Not ready'), ` Recovery point objective: ${rd.rpo?.continuous}; daily snapshots ${rd.rpo?.snapshot}. Recovery time objective: database ${rd.rto?.database}, full service ${rd.rto?.full_service}.`), el('ul', { class: 'rl-list' }, rd.items.map((i) => el('li', {}, chip(i.ok ? 'ok' : 'warn', i.ok ? 'Yes' : 'No'), ' ', i.text)))));

    const storageBox = el('div', { 'aria-live': 'polite' });
    host.append(section('Backups',
      el('div', { class: 'cp-grid' },
        el('article', { class: 'portal-panel cp-stat' }, el('span', { class: 'cp-label', text: 'Last good snapshot' }), el('b', { text: ago(bk.snapshot_age_hours) }), el('small', { text: bk.last_good_snapshot ? `${kb(bk.last_good_snapshot.bytes)}, ${bk.last_good_snapshot.tables} tables, audit chain ${bk.last_good_snapshot.audit_ok ? 'verified' : 'not verified'}` : 'None yet' })),
        el('article', { class: 'portal-panel cp-stat' }, el('span', { class: 'cp-label', text: 'Last passed restore test' }), el('b', { text: ago(bk.restore_test_age_hours) }), el('small', { text: bk.last_restore_test ? `Last test ${bk.last_restore_test.status}${bk.last_restore_test.seconds ? ` in ${Number(bk.last_restore_test.seconds).toFixed(1)} s` : ''}` : 'None yet' })),
        el('article', { class: 'portal-panel cp-stat' }, el('span', { class: 'cp-label', text: 'Where backups go' }), el('b', { text: bk.offsite ? 'Off-site bucket' : bk.configured ? 'This server only' : 'Not set' }), el('small', { text: bk.litestream ? 'Continuous replication running' : 'Continuous replication not running in this process' }))),
      el('div', { class: 'cp-actions' }, btn('Back up now', async () => { const r = await post('/api/operator/reliability/backups/snapshot'); await reload(`Snapshot saved (${kb(r.bytes)}, ${r.tables} tables).`); }, true), btn('Test a restore', async () => { const r = await post('/api/operator/reliability/backups/verify', {}); await reload(`Restore test passed: checksum, integrity and audit chain verified in ${Number(r.seconds).toFixed(1)} s.`); }), btn('Back up configuration', async () => { await post('/api/operator/reliability/backups/config'); await reload('Configuration backed up (setting names only, no secret values).'); }), btn('Check the backup bucket', async () => { const r = await api('/api/operator/reliability/storage'); storageBox.replaceChildren(table([['name', 'Check'], ['status', 'Result', (v) => chip(v)], ['detail', 'Detail']], r.checks), note(`${r.inventory?.snapshot_count ?? 0} snapshot(s) in the bucket; ${r.inventory?.days_with_snapshot_last_7 ?? 0} of the last 7 days have one.`)); say('Bucket checked.'); })),
      storageBox,
      table([['started_at', 'Started', when], ['kind', 'Type', (v) => (v === 'config' ? 'Configuration' : 'Database snapshot')], ['status', 'Result', (v) => chip(v === 'ok' ? 'passed' : v)], ['bytes', 'Size', kb], ['trigger', 'How'], ['error', 'Problem']], bk.history, 'No backups taken yet.'),
      el('h3', { text: 'Restore tests' }),
      table([['started_at', 'Started', when], ['status', 'Result', (v) => chip(v)], ['seconds', 'Time', (v) => (v ? `${Number(v).toFixed(1)} s` : '')], ['checksum_ok', 'Checksum', (v) => (v === null ? '' : v ? 'OK' : 'Mismatch')], ['integrity', 'Integrity'], ['error', 'Problem']], bk.tests, 'No restore tests yet.'),
      note(`Snapshots daily (1 to 5 am Perth), configuration daily, restore test weekly. Retention is set by the bucket's lifecycle rules: Litestream ${bk.policy.retention.litestream_hours} h, daily snapshots ${bk.policy.retention.daily_snapshots_days} days, monthly for ${bk.policy.retention.monthly_snapshots_months} months. Super Pro never deletes backups.`)));

    host.append(section('Self-healing', note(`Automatic only for safe recoveries: jobs that failed on a temporary error and are safe to repeat get ${d.heal.policy.extra_attempts_per_heal} more attempts, at most ${d.heal.policy.max_heals_per_job} times; expired public caches are cleared; a failed backup-bucket connection is rebuilt once. Nothing destructive is ever retried.`),
      el('div', { class: 'cp-actions' }, btn('Run self-healing now', async () => { const r = await post('/api/operator/reliability/heal'); await reload(`${r.actions.length} action(s) recorded.`); })),
      table([['at', 'When', when], ['kind', 'What', (v) => ({ job_retry: 'Background job', stuck_job: 'Stuck job', stuck_run: 'Stuck automation', cache: 'Cache', telemetry: 'Monitoring data', reconnect: 'Backup connection' })[v] || v], ['outcome', 'Outcome', (v) => chip(v)], ['detail', 'Detail']], d.heal.recent, 'Nothing needed yet.')));

    const act = el('select', { id: 'rl-action', 'aria-label': 'Action needing approval' }, d.approval_only.map((a) => el('option', { value: a.key, text: a.label })));
    const how = note(d.approval_only[0]?.how || '');
    act.addEventListener('change', () => { how.textContent = d.approval_only.find((a) => a.key === act.value)?.how || ''; });
    const details = el('textarea', { id: 'rl-details', rows: '3', maxlength: '2000', 'aria-label': 'What should be done and why' });
    host.append(section('Needs approval: rollback, restore, migration, credentials, deletion, major changes',
      note('These are never done automatically. Request approval here; an approver decides under Operations > AI automations; then a person carries it out and marks it done.'),
      el('div', { class: 'rl-form' }, el('label', { for: 'rl-action', text: 'Action' }), act, how, el('label', { for: 'rl-details', text: 'What should be done and why' }), details, el('div', { class: 'cp-actions' }, btn('Request approval', async () => { const r = await post('/api/operator/reliability/requests', { action: act.value, details: details.value.trim() }); await reload(r.message); }))),
      table([['created_at', 'Requested', when], ['action', 'Action', (v) => d.approval_only.find((a) => a.key === v)?.label || v], ['reference_code', 'Reference'], ['approval_status', 'Approval', (v) => chip(v || 'pending')], ['status', 'Run', (v) => String(v).replace(/_/g, ' ')]], d.requests, 'No requests yet.')));

    host.append(section('Daily summaries', el('div', { class: 'cp-actions' }, btn('Send today\'s summary now', async () => { const r = await post('/api/operator/reliability/summary', { send: true }); await reload(r.summary.emailed_to ? `Summary emailed to ${r.summary.emailed_to} (${r.summary.email_result}).` : 'Summary saved. Set OPERATOR_ALERT_EMAIL to have it emailed.'); })), table([['day', 'Day'], ['overall', 'Overall', (v) => chip(v)], ['emailed_to', 'Emailed to', (v) => (v ? v.replace(/^(.).*(@.*)$/, '$1…$2') : 'Not emailed')], ['email_result', 'Result']], d.summaries, 'No summaries yet. One is made each morning (Perth time).')));
  }
  window.SuperProReliability = { render };
})();
