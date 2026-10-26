// Subscribers: the operator's register of businesses on the platform. Business-level information only.
(() => {
  let data = null, filter = 'all';
  const day = (v) => (v ? new Intl.DateTimeFormat('en-AU', { dateStyle: 'medium', timeZone: 'Australia/Perth' }).format(new Date(v)) : '—');
  const STATUS = { trialing: 'Trial', active: 'Paying', restricted: 'Restricted', cancelled: 'Cancelled' };
  const stateOf = (r) => (r.status === 'trialing' ? `Trial${r.trial_days_left === null ? '' : r.trial_days_left > 0 ? `, ${r.trial_days_left} day${r.trial_days_left === 1 ? '' : 's'} left` : ', ended'}` : STATUS[r.status] || r.status);

  function manage(r, plans) {
    return `<tr class="sub-manage" hidden data-manage="${esc(r.id)}"><td colspan="7"><div class="sub-actions">
      <label>Plan <select data-plan>${plans.map((p) => `<option value="${esc(p.id)}" ${p.id === r.plan_id ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select></label>
      <button type="button" data-open-profile="${esc(r.id)}">Open profile</button>
      <button type="button" data-apply-plan="${esc(r.id)}">Change plan and email the owner</button>
      <label>Payment reference <input data-ref placeholder="e.g. INV-1042" maxlength="60"></label>
      <label>Amount (AUD) <input data-amount type="number" min="1" step="0.01" value="${(r.monthly_fee_cents / 100) || ''}"></label>
      <button type="button" data-pay="succeeded" data-id="${esc(r.id)}">Payment received</button>
      <button type="button" data-pay="failed" data-id="${esc(r.id)}">Payment refused</button></div></td></tr>`;
  }
  function render() {
    const rows = data.subscribers.filter((r) => filter === 'all' || r.status === filter), t = data.totals;
    const breakdown = (title, list) => `<div class="panel sub-break"><h3>${title}</h3>${list.map((x) => `<div><span>${esc(x.name)}</span><b>${x.count}</b></div>`).join('') || '<p>None yet.</p>'}</div>`;
    $('#subscribers-body').innerHTML = `
      <div class="stats">${[['Subscribers', t.all], ['On trial', t.trialing], ['Paying', t.paying], ['Monthly income', money(t.monthly_recurring_cents)], ['Payment problems', t.payment_problems]].map(([n, v]) => `<div class="stat"><span>${n}</span><b>${v}</b></div>`).join('')}</div>
      <div class="sub-breakdowns">${breakdown('By plan', data.by_plan)}${breakdown('By status', data.by_status.map((x) => ({ ...x, name: STATUS[x.name] || x.name })))}${breakdown('By category', data.by_category)}</div>
      <div class="panel"><div class="panel-head"><div><h2>All subscribers</h2><span>Business details only. Staff, workers, customers and jobs are never shown here.</span></div>
        <div class="sub-tools"><select id="sub-filter" aria-label="Filter by status">${[['all', 'Everyone'], ['trialing', 'On trial'], ['active', 'Paying'], ['restricted', 'Restricted']].map(([v, l]) => `<option value="${v}" ${filter === v ? 'selected' : ''}>${l}</option>`).join('')}</select><button type="button" id="sub-csv">Download CSV</button></div></div>
        <div class="table-wrap"><table><thead><tr><th>Business</th><th>Category</th><th>Plan</th><th>Status</th><th>Payment</th><th>Account holder</th><th>Joined</th></tr></thead><tbody>${rows.map((r) => `<tr class="sub-row" data-row="${esc(r.id)}" tabindex="0"><td><b>${esc(r.business)}</b><br><small>${esc(r.state || '')}</small></td><td>${esc(r.category)}</td><td>${esc(r.plan_name)}</td><td>${esc(stateOf(r))}</td><td>${esc(r.payment_status)}</td><td>${esc(r.owner_name || '—')}<br><small>${esc(r.owner_email || '')}</small></td><td>${day(r.created_at)}</td></tr>${manage(r, data.plans)}`).join('') || '<tr><td colspan="7">No subscribers match.</td></tr>'}</tbody></table></div></div>`;
    $('#sub-filter').onchange = (e) => { filter = e.target.value; render(); };
    $('#sub-csv').onclick = () => {
      const q = (v) => `"${String(v ?? '').replace(/"/g, '""').replace(/^([=+\-@])/, "'$1")}"`;
      const csv = [['Business', 'Category', 'Plan', 'Status', 'Trial ends', 'Payment', 'Account holder', 'Email', 'Joined'], ...rows.map((r) => [r.business, r.category, r.plan_name, stateOf(r), r.trial_ends_at || '', r.payment_status, r.owner_name, r.owner_email, r.created_at])].map((l) => l.map(q).join(',')).join('\n');
      const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(new Blob([csv], { type: 'text/csv' })), download: 'subscribers.csv' });
      document.body.append(a); a.click(); a.remove();
    };
    $$('.sub-row').forEach((tr) => { const open = () => { const m = $(`[data-manage="${tr.dataset.row}"]`); m.hidden = !m.hidden; }; tr.onclick = open; tr.onkeydown = (e) => { if (e.key === 'Enter') open(); }; });
    $$('[data-apply-plan]').forEach((b) => b.onclick = async () => {
      const tr = b.closest('tr');
      try { const r = await api(`/api/admin/subscribers/${b.dataset.applyPlan}/plan`, { method: 'POST', body: JSON.stringify({ plan_id: tr.querySelector('[data-plan]').value }) }); notice(`Plan set to ${r.plan}. Email: ${String(r.email).replaceAll('_', ' ')}.`); await load(); } catch (e) { notice(e.message, true); }
    });
    $$('[data-pay]').forEach((b) => b.onclick = async () => {
      const tr = b.closest('tr'), reference = tr.querySelector('[data-ref]').value.trim(), amount = Number(tr.querySelector('[data-amount]').value);
      try { const r = await api(`/api/admin/subscribers/${b.dataset.id}/payment`, { method: 'POST', body: JSON.stringify({ result: b.dataset.pay, reference, amount_cents: amount ? Math.round(amount * 100) : undefined }) }); notice(`Recorded. Email: ${String(r.email).replaceAll('_', ' ')}.`); await load(); } catch (e) { notice(e.message, true); }
    });
  }
  function renderAddons(a) {
    const rows = a.addons.map((r) => `<tr><td>${esc(r.business)}</td><td>${esc(r.quantity)} × ${esc(r.name)} (${esc(r.unit)})</td><td>${money(r.monthly_cents)}</td><td>${r.status === 'requested' ? 'Waiting' : 'Active'}</td><td>${r.status === 'requested' ? `<button type="button" data-addon="activate" data-id="${esc(r.id)}">Confirm and email</button> <button type="button" data-addon="decline" data-id="${esc(r.id)}">Decline</button>` : `<button type="button" data-addon="cancel" data-id="${esc(r.id)}">Cancel</button>`}</td></tr>`).join('');
    $('#subscribers-body').insertAdjacentHTML('beforeend', `<div class="panel" id="addon-panel"><div class="panel-head"><div><h2>Add-ons</h2><span>Extra storage, AI requests and logins. Active add-ons bring ${money(a.monthly_cents)} a month.</span></div></div><div class="table-wrap"><table><thead><tr><th>Business</th><th>Add-on</th><th>Per month</th><th>Status</th><th></th></tr></thead><tbody>${rows || '<tr><td colspan="5">No add-on requests yet.</td></tr>'}</tbody></table></div></div>`);
    $$('[data-addon]').forEach((b) => b.onclick = async () => {
      try { const r = await api(`/api/admin/addons/${b.dataset.id}/${b.dataset.addon}`, { method: 'POST', body: '{}' }); notice(b.dataset.addon === 'activate' ? `Add-on active. Email: ${r.email}.` : 'Done.'); load(); } catch (e) { notice(e.message, true); }
    });
  }
  const when = (v) => (v ? new Intl.DateTimeFormat('en-AU', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Australia/Perth' }).format(new Date(v)) : '—');
  function renderAttention(a) {
    const rows = a.items.map((i) => `<li class="att-${esc(i.level)}"><span>${esc(i.text)}</span>${i.reminder_id ? `<button type="button" data-rem-done="${esc(i.reminder_id)}">Done</button>` : ''}${i.org ? `<button type="button" data-open-profile="${esc(i.org)}">Open</button>` : ''}</li>`).join('');
    $('#subscribers-body').insertAdjacentHTML('afterbegin', `<div class="panel" id="attention-panel"><div class="panel-head"><div><h2>Needs your attention</h2><span>${a.digest_email_set ? 'A daily summary is emailed to you.' : 'Set OPERATOR_EMAIL to get this as a daily email.'}${a.tax_invoice_ready ? '' : ' Set PLATFORM_ABN so invoices are valid tax invoices.'}</span></div></div>
      <ul class="att-list">${rows || '<li>All clear. Nothing needs you right now.</li>'}</ul>
      <form id="rem-form" class="sub-actions"><label>Remind me to <input name="title" maxlength="160" required placeholder="e.g. Check in with Smith Plumbing"></label><label>On <input name="due" type="datetime-local" required></label><button type="submit">Set reminder</button></form></div>`);
    $('#rem-form').onsubmit = async (e) => { e.preventDefault(); const f = e.target.elements; try { await api('/api/admin/reminders', { method: 'POST', body: JSON.stringify({ title: f.title.value, due_at: new Date(f.due.value).toISOString() }) }); notice('Reminder set.'); load(); } catch (err) { notice(err.message, true); } };
    $$('[data-rem-done]').forEach((b) => b.onclick = async () => { await api(`/api/admin/reminders/${b.dataset.remDone}/done`, { method: 'POST', body: '{}' }); load(); });
    $$('[data-open-profile]').forEach((b) => b.onclick = () => openProfile(b.dataset.openProfile));
  }
  function renderInvoices(d) {
    const rows = d.invoices.map((i) => {
      const act = i.status === 'draft' ? `<input type="datetime-local" data-send-at title="When to send. Leave empty for the start of the month."> <button type="button" data-inv="approve" data-id="${esc(i.id)}">Approve</button> <button type="button" data-inv="adjust" data-id="${esc(i.id)}">Adjust</button> <button type="button" data-inv="void" data-id="${esc(i.id)}">Void</button>`
        : i.status === 'approved' || i.status === 'sent' ? `<input data-ref placeholder="Payment reference" maxlength="60"> <button type="button" data-inv="paid" data-id="${esc(i.id)}">Mark paid</button> <button type="button" data-inv="void" data-id="${esc(i.id)}">Void</button>` : '';
      return `<tr><td>${esc(i.number)}</td><td>${esc(i.business)}</td><td>${esc(i.lines.map((l) => l.description).join(', '))}</td><td>${money(i.total_cents)}<br><small>incl. ${money(i.gst_cents)} GST</small></td><td>${esc(i.status)}${i.status === 'approved' ? `<br><small>sends ${when(i.send_at)}</small>` : ''}${i.last_error ? `<br><small>${esc(i.last_error)}</small>` : ''}</td><td>${act}</td></tr>`;
    }).join('');
    $('#subscribers-body').insertAdjacentHTML('beforeend', `<div class="panel" id="invoice-panel"><div class="panel-head"><div><h2>Invoices</h2><span>Drafts are prepared before each month. You approve each one and choose when it goes out.</span></div><button type="button" id="inv-prepare">Prepare next month</button></div><div class="table-wrap"><table><thead><tr><th>No.</th><th>Business</th><th>For</th><th>Total</th><th>Status</th><th></th></tr></thead><tbody>${rows || '<tr><td colspan="6">No invoices yet.</td></tr>'}</tbody></table></div></div>`);
    $('#inv-prepare').onclick = async () => { try { const r = await api('/api/admin/invoices/prepare', { method: 'POST', body: '{}' }); notice(`${r.created} draft${r.created === 1 ? '' : 's'} prepared.`); load(); } catch (e) { notice(e.message, true); } };
    $$('[data-inv]').forEach((b) => b.onclick = async () => {
      const tr = b.closest('tr'), id = b.dataset.id, act = b.dataset.inv;
      try {
        if (act === 'approve') { const v = tr.querySelector('[data-send-at]').value; const r = await api(`/api/admin/invoices/${id}/approve`, { method: 'POST', body: JSON.stringify(v ? { send_at: new Date(v).toISOString() } : {}) }); notice(r.sent_now ? 'Approved and sent.' : `Approved. It sends ${when(r.send_at)}.`); }
        else if (act === 'adjust') { const d = prompt('What is the adjustment for? (e.g. Part-month credit)'); if (!d) return; const a = Number(prompt('Amount in dollars. Use a minus for a discount.')); if (!Number.isFinite(a) || !a) return; await api(`/api/admin/invoices/${id}/adjust`, { method: 'POST', body: JSON.stringify({ description: d, adjustment_cents: Math.round(a * 100) }) }); notice('Draft updated.'); }
        else if (act === 'void') { if (!confirm('Void this invoice?')) return; await api(`/api/admin/invoices/${id}/void`, { method: 'POST', body: '{}' }); notice('Invoice voided.'); }
        else if (act === 'paid') { const ref = tr.querySelector('[data-ref]').value.trim(); const r = await api(`/api/admin/invoices/${id}/paid`, { method: 'POST', body: JSON.stringify({ reference: ref }) }); notice(`Marked paid. Receipt email: ${r.email}.`); }
        load();
      } catch (e) { notice(e.message, true); }
    });
  }
  function wireFollowups(id) {
    const panel = $('#profile-panel'); panel.insertAdjacentHTML('beforeend', '<div class="panel" id="fu-box"><h3>Follow-up emails</h3><p class="muted">Drafted from account details only. Nothing is sent until you read it and press Send.</p><div id="fu-list"></div></div>');
    const list = $('#fu-list');
    const card = (f) => { const d = document.createElement('div'); d.className = 'fu-card'; d.innerHTML = `<small>${f.status === 'sent' ? 'Sent ' + when(f.sent_at) + ' to ' + esc(f.sent_to || '') : 'Draft' + (f.source === 'ai' ? ' written by AI' : ' from a template') + (f.to ? ' · to ' + esc(f.to) : '')}</small><input ${f.status === 'sent' ? 'disabled' : ''} value="${esc(f.subject)}"><textarea rows="8" ${f.status === 'sent' ? 'disabled' : ''}>${esc(f.body)}</textarea>${f.status === 'sent' ? '' : '<div class="row-actions"><button class="primary fu-send">Send email</button><button class="ghost fu-discard">Discard</button></div>'}`;
      if (f.status === 'sent') return d; const [subj, body] = [d.querySelector('input'), d.querySelector('textarea')];
      const save = () => api(`/api/admin/followups/${f.id}`, { method: 'PATCH', body: JSON.stringify({ subject: subj.value, body: body.value }) });
      d.querySelector('.fu-discard').onclick = async () => { await api(`/api/admin/followups/${f.id}/discard`, { method: 'POST' }); d.remove(); };
      d.querySelector('.fu-send').onclick = async () => { try { await save(); let r; try { r = await api(`/api/admin/followups/${f.id}/send`, { method: 'POST', body: JSON.stringify({}) }); } catch (e) { if (e.needs_confirm || /last 2 days/.test(e.message || '')) { if (!confirm(e.message)) return; r = await api(`/api/admin/followups/${f.id}/send`, { method: 'POST', body: JSON.stringify({ confirm_again: true }) }); } else throw e; } notice('Email sent.'); load(); } catch (e) { notice(e.message || 'Could not send.'); } };
      return d; };
    const refresh = async () => { list.replaceChildren(); (await api(`/api/admin/subscribers/${id}/followups`)).followups.forEach((f) => list.append(card(f))); };
    panel.querySelectorAll('.fu-draft').forEach((btn) => { btn.onclick = async () => { btn.disabled = true; try { const r = await api(`/api/admin/subscribers/${id}/followups`, { method: 'POST', body: JSON.stringify({ topic: btn.dataset.topic }) }); list.prepend(card(r.followup)); $('#fu-box').scrollIntoView({ behavior: 'smooth' }); } catch (e) { notice(e.message || 'Could not draft.'); } btn.disabled = false; }; });
    refresh().catch(() => {});
  }
  async function openProfile(id) {
    const p = await api(`/api/admin/subscribers/${id}/profile`); document.querySelector('#profile-panel')?.remove();
    const b = p.business, li = (arr, f) => arr.map(f).join('') || '<li>None.</li>';
    $('#subscribers-body').insertAdjacentHTML('afterbegin', `<div class="panel" id="profile-panel"><div class="panel-head"><div><h2>${esc(b.business)}</h2><span>${esc(b.plan_name)} · ${esc(b.status)} · joined ${day(b.created_at)}${b.abn ? ' · ABN ' + esc(b.abn) : ''}</span></div><button type="button" id="profile-close">Close</button></div>
      <div class="sub-breakdowns"><div class="panel sub-break"><h3>Account holder</h3><div><span>Name</span><b>${esc(p.owner.name || '—')}</b></div><div><span>Email</span><b>${esc(p.owner.email || '—')}</b></div><div><span>Phone</span><b>${esc(p.owner.phone || '—')}</b></div><div><span>Last sign-in</span><b>${when(p.owner.last_login_at)}</b></div></div>
      <div class="panel sub-break"><h3>Health ${p.health.score}/100</h3><ul>${li(p.health.reasons.length ? p.health.reasons : ['No concerns'], (x) => `<li>${esc(x)}</li>`)}</ul><h3>Suggested next steps</h3><ul>${li(p.suggestions, (x) => `<li><b>${esc(x.title)}</b><br><small>${esc(x.detail)}</small><br><button class="ghost fu-draft" data-topic="${esc(x.title)}">Write an email</button></li>`)}</ul><button class="ghost fu-draft" data-topic="">Write a check-in email</button></div>
      <div class="panel sub-break"><h3>Plan use</h3>${p.usage.map((u) => `<div><span>${esc(u.label)}</span><b>${u.used.toLocaleString('en-AU')}${u.limit < 0 ? '' : ' / ' + u.limit.toLocaleString('en-AU')}</b></div>`).join('')}<h3>Connected platforms</h3><p>${p.channels.map(esc).join(', ') || 'None yet'}</p></div>
      <div class="panel sub-break"><h3>Invoices</h3><ul>${li(p.invoices, (i) => `<li>${esc(i.number)} · ${money(i.total_cents)} · ${esc(i.status)}</li>`)}</ul><h3>Add-ons</h3><ul>${li(p.addons, (a) => `<li>${a.quantity} × ${esc(a.name)} · ${esc(a.status)}</li>`)}</ul></div>
      <div class="panel sub-break"><h3>Account activity</h3><ul>${li(p.timeline, (t) => `<li>${when(t.at)} · ${esc(t.action)}</li>`)}</ul><h3>Emails sent</h3><ul>${li(p.emails, (t) => `<li>${when(t.created_at)} · ${esc(t.kind.replaceAll('_', ' '))} (${esc(t.status)})</li>`)}</ul></div></div>
      <p class="muted">Account-level information only. Their staff, workers, customers and files are never shown here.</p></div>`);
    wireFollowups(id);
    $('#profile-close').onclick = () => $('#profile-panel').remove(); $('#profile-panel').scrollIntoView({ behavior: 'smooth' });
  }
  async function load() { data = await api('/api/admin/subscribers'); data.plans = (await api('/api/admin/subscription-plans')).plans; render(); try { renderAddons(await api('/api/admin/addons')); } catch { /* register still works without it */ } try { renderInvoices(await api('/api/admin/invoices')); renderAttention(await api('/api/admin/attention')); } catch { /* register still works without it */ } }
  window.SuperProSubscribers = { load };
})();
