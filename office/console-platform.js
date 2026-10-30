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
    }
  };
  window.SuperProPlatformConsole = { handles: (route) => Object.prototype.hasOwnProperty.call(renderers, route), render: (route, host, api) => renderers[route](host, api) };
})();
