// Phase 08: Money views. Sales documents (quotations, estimates, deposits, tax invoices, adjustment notes), Payments &
// Refunds, Bank Reconciliation, Reports & GST, Finance Settings & Compliance, and Change Plan. The Founder Console reuses
// this file for platform billing (window.SuperProFinance.mountFounder). Success is shown only after the server confirms.
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
  const $ = (c) => (Number(c || 0) / 100).toLocaleString('en-AU', { style: 'currency', currency: 'AUD' });
  const day = (v) => (v ? new Date(v).toLocaleDateString('en-AU', { dateStyle: 'medium' }) : '');
  const when = (v) => (v ? new Date(v).toLocaleString('en-AU', { dateStyle: 'medium', timeStyle: 'short' }) : '');
  const KIND = { quote: 'Quotation', estimate: 'Estimate', invoice: 'Invoice', deposit: 'Deposit invoice', credit_note: 'Adjustment note' };
  const STATUS = { draft: 'Draft', approved: 'Approved', sent: 'Sent', issued: 'Issued', part_paid: 'Part paid', paid: 'Paid', overdue: 'Overdue', cancelled: 'Cancelled', converted: 'Converted', pending_approval: 'Waiting for approval', rejected: 'Rejected', awaiting_manual: 'Approved: pay it back', submitted: 'Sent to Stripe', completed: 'Refunded', failed: 'Failed', unmatched: 'To reconcile', matched: 'Matched', categorised: 'Categorised', ignored: 'Ignored', open: 'Open', resolved: 'Resolved', dismissed: 'Dismissed', applied: 'Applied', scheduled: 'Scheduled', refunded: 'Refunded' };
  const TONE = { paid: 'pl-paid', issued: 'pl-issued', part_paid: 'pl-issued', overdue: 'pl-cancelled', pending_approval: 'pl-issued', rejected: 'pl-cancelled', failed: 'pl-cancelled', completed: 'pl-paid', matched: 'pl-paid', categorised: 'pl-paid', awaiting_manual: 'pl-issued', open: 'pl-issued', action: 'pl-cancelled', review: 'pl-issued', ok: 'pl-paid', high: 'pl-cancelled', medium: 'pl-issued', approved: 'pl-paid', applied: 'pl-paid' };
  const chip = (k, text) => el('span', { class: 'portal-status ' + (TONE[k] || 'pl-draft'), text: text || STATUS[k] || k });
  let uid = 0; const nid = () => `fx-${++uid}`;
  const field = (label, input, hint) => { input.id ||= nid(); return el('div', { class: 'fx-field' }, el('label', { for: input.id, text: label }), input, hint ? el('small', { text: hint }) : null); };
  const check = (label, attrs = {}) => { const i = el('input', { type: 'checkbox', id: nid(), ...attrs }); return el('label', { class: 'fx-check', for: i.id }, i, ' ', label); };
  const VIEWS = {
    finsales: ['Quotes & Invoices', 'Quotations, estimates, deposit invoices, tax invoices and adjustment notes. Every invoice is checked against the ATO tax invoice rules before it is issued, and issued invoices cannot be changed.'],
    finpayments: ['Payments & Refunds', 'Receipts for money received, and refunds. Customer payments go straight to your own Stripe, PayPal or bank account. Every refund needs approval by an authorised person.'],
    finreconcile: ['Bank Reconciliation', 'Import your bank statement (CSV) and match each line to a recorded payment or an expense category. Super Pro suggests matches; nothing is reconciled until you confirm it.'],
    finreports: ['Reports & GST', 'Profit and loss, GST (BAS draft), money owed to you, overdue follow-ups and a summary of your records. Reports are drafts for checking, not tax advice.'],
    fincompliance: ['Finance Settings & Compliance', 'GST registration and invoice settings, a compliance review against published Australian rules, flagged activity and the finance audit trail.'],
    finplan: ['Change Plan', 'Move to another Super Pro plan. Upgrades start now and are prorated on your next invoice; downgrades start at your next billing month.']
  };
  const HASH = { finsales: 'b07/sales', finpayments: 'b07/payments-refunds', finreconcile: 'b07/reconcile', finreports: 'b07/reports', fincompliance: 'b07/compliance', finplan: 'b09/change-plan' };

  function Finance(host, { api = defaultApi, founder = false } = {}) {
    const say = (t, bad = false) => { const p = host.querySelector('[data-fx-status]'); if (p) { p.textContent = t; p.dataset.tone = bad ? 'bad' : 'good'; } if (!bad) window.SPMotion?.toast?.(t); };
    const busy = async (btn, fn) => { if (btn) btn.disabled = true; try { await fn(); } catch (e) { say(e.message, true); } finally { if (btn && btn.isConnected) btn.disabled = false; } };
    const post = (p, b, m = 'POST') => api(p, { method: m, body: JSON.stringify(b || {}) });
    const body = () => { let b = host.querySelector('[data-fx-body]'); const n = el('div', { 'data-fx-body': '' }); if (b) b.replaceWith(n); else host.append(n); return n; };
    const section = (title, ...kids) => el('section', { class: 'portal-panel fx-panel' }, el('h2', { text: title }), ...kids);
    const empty = (t) => el('p', { class: 'portal-empty', text: t });
    const note = (t) => el('p', { class: 'sx-source', text: t });
    const table = (cols, rows, emptyText = 'Nothing yet.') => {
      if (!rows?.length) return empty(emptyText);
      return el('div', { class: 'au-tablewrap' }, el('table', { class: 'au-table' }, el('thead', {}, el('tr', {}, cols.map(([, h]) => el('th', { scope: 'col', text: h })))),
        el('tbody', {}, rows.map((r) => el('tr', {}, cols.map(([k, , f], i) => { const v = f ? f(r[k], r) : String(r[k] ?? ''); return i === 0 ? el('th', { scope: 'row' }, v) : el('td', {}, v); }))))));
    };
    async function render(view, arg) {
      host.dataset.fxView = view;
      if (!host.querySelector('[data-fx-status]')) host.append(el('p', { class: 'portal-note pl-status', role: 'status', 'aria-live': 'polite', 'data-fx-status': '' }));
      const b = body(); b.append(el('p', { class: 'pl-meta', text: 'Loading…' }));
      try { await R[view](b, arg); b.querySelector(':scope > .pl-meta')?.remove(); } catch (e) { b.replaceChildren(el('p', { class: 'portal-note', 'data-tone': 'bad', text: e.message })); }
    }
    const setupNote = (o) => (o.seller.gst_status_set ? null : el('p', { class: 'portal-note', 'data-tone': 'bad' }, 'Say whether your business is registered for GST before issuing invoices: ', el('a', { href: '#' + HASH.fincompliance, text: 'Finance settings' }), '.'));

    // ---------------- line editor ----------------
    function linesEditor(lines, codes) {
      const box = el('div', { class: 'fx-lines' });
      const rows = [];
      const addRow = (l = {}) => {
        const d = el('input', { maxlength: '300', value: l.description || '', 'aria-label': 'Item description' });
        const q = el('input', { type: 'number', min: '0.01', step: '0.01', value: String(l.quantity ?? 1), 'aria-label': 'Quantity' });
        const u = el('input', { type: 'number', min: '0', step: '0.01', value: l.unit_cents !== undefined ? (l.unit_cents / 100).toFixed(2) : '', 'aria-label': 'Unit price' });
        const t = el('select', { 'aria-label': 'Tax code' }, Object.entries(codes).map(([k, v]) => el('option', { value: k, text: v, selected: (l.tax_code || 'GST') === k || null })));
        const rm = el('button', { type: 'button', class: 'portal-button', text: 'Remove', onclick: () => { const i = rows.indexOf(r); rows.splice(i, 1); row.remove(); } });
        const row = el('div', { class: 'fx-line' }, d, q, u, t, rm); const r = { d, q, u, t };
        rows.push(r); box.append(row);
      };
      (lines?.length ? lines : [{}]).forEach(addRow);
      const add = el('button', { type: 'button', class: 'portal-button', text: 'Add item', onclick: () => addRow() });
      return { node: el('div', {}, el('div', { class: 'fx-line fx-line-head', 'aria-hidden': 'true' }, el('span', { text: 'Description' }), el('span', { text: 'Qty' }), el('span', { text: 'Unit price' }), el('span', { text: 'Tax' }), el('span')), box, add), value: () => rows.map((r) => ({ description: r.d.value.trim(), quantity: Number(r.q.value), unit_price: Number(r.u.value || 0), tax_code: r.t.value })).filter((r) => r.description) };
    }

    const R = {
      // ---------------- sales documents ----------------
      async finsales(b, openId) {
        const [o, d] = await Promise.all([api('/api/saas/finance/hub'), api('/api/saas/finance/documents')]);
        const c = o.counts;
        b.append(setupNote(o) || '', el('div', { class: 'au-stats' },
          el('div', { class: 'pl-stage' }, el('b', { text: String(c.invoices_unpaid) }), el('span', { text: 'Invoices unpaid' }), el('small', { text: `${c.overdue} overdue` })),
          el('div', { class: 'pl-stage' }, el('b', { text: $(Object.values(o.aged).reduce((s, v) => s + v, 0)) }), el('span', { text: 'Owed to you' }), el('small', { text: `${$(o.aged.d31_60 + o.aged.d61_90 + o.aged.d90_plus)} over 30 days` })),
          el('div', { class: 'pl-stage' }, el('b', { text: String(c.quotes_open + c.estimates_open) }), el('span', { text: 'Quotes and estimates open' })),
          el('div', { class: 'pl-stage' }, el('b', { text: String(c.credit_notes_waiting + c.refunds_waiting) }), el('span', { text: 'Waiting for approval' }), el('small', { text: 'Credit notes and refunds' }))));
        const detail = el('div', { class: 'fx-detail', 'aria-live': 'polite' });
        b.append(creator(o, detail), draftFromJob(o, detail));
        const kinds = [['', 'All'], ['quote', 'Quotations'], ['estimate', 'Estimates'], ['deposit', 'Deposits'], ['invoice', 'Invoices'], ['credit_note', 'Adjustment notes']];
        const filter = el('select', { id: nid(), onchange: () => draw() }, kinds.map(([k, t]) => el('option', { value: k, text: t })));
        const list = el('div');
        const draw = () => list.replaceChildren(table([['number', 'Number', (v, r) => v || 'Not numbered yet'], ['kind', 'Type', (v) => KIND[v]], ['title', 'For'], ['customer', 'Customer'], ['status', 'Status', (v) => chip(v)], ['total_cents', 'Total', (v) => $(v)], ['money', 'Owing', (v) => (v ? $(v.owing_cents) : '')], ['id', '', (id) => el('button', { type: 'button', class: 'portal-button', text: 'Open', onclick: () => showDoc(id, detail, o) })]], d.documents.filter((x) => !filter.value || x.kind === filter.value), 'No documents yet. Create one above.'));
        draw();
        b.append(section('Documents', field('Show', filter), list, el('p', { class: 'pl-actions' }, el('a', { class: 'portal-button', href: '/api/saas/finance/reports/documents.csv', text: 'Download all as CSV' }))), detail);
        if (openId) showDoc(openId, detail, o);
      },
      // ---------------- payments and refunds ----------------
      async finpayments(b) {
        const [rc, rf] = await Promise.all([api('/api/saas/finance/receipts'), api('/api/saas/finance/refunds')]);
        const refundForm = (r) => { const a = el('input', { type: 'number', min: '0.01', step: '0.01', max: ((r.amount_cents - (r.refunded_cents || 0)) / 100).toFixed(2), 'aria-label': 'Refund amount' }); const why = el('input', { maxlength: '500', 'aria-label': 'Reason for the refund', placeholder: 'Reason' }); return el('details', {}, el('summary', { text: 'Refund' }), el('form', { class: 'fx-inline', onsubmit: (e) => { e.preventDefault(); busy(e.submitter, async () => { const x = await post(`/api/saas/finance/payments/${encodeURIComponent(r.id)}/refund`, { amount: Number(a.value), reason: why.value.trim() }); say(x.message); render('finpayments'); }); } }, a, why, el('button', { type: 'submit', class: 'portal-button', text: 'Request refund' }))); };
        b.append(section('Receipts', note('A receipt is created when a payment is received. Card payments are confirmed by your payment provider before they show here.'), table([['receipt_no', 'Receipt'], ['paid_at', 'Paid', day], ['customer', 'From'], ['job', 'For', (v, r) => `${v}${r.invoice_number ? ' (' + r.invoice_number + ')' : ''}`], ['amount_cents', 'Amount', (v) => $(v)], ['refunded_cents', 'Refunded', (v) => (v ? $(v) : '')], ['method', 'How', (v, r) => v || r.provider], ['id', '', (id, r) => el('span', { class: 'pl-actions' }, el('a', { class: 'portal-button', href: `/api/saas/finance/receipts/${encodeURIComponent(id)}/print`, target: '_blank', rel: 'noopener', text: 'Print' }), r.status === 'paid' && r.amount_cents > (r.refunded_cents || 0) ? refundForm(r) : null)]], rc.receipts, 'No payments received yet.')));
        const done = (r) => { const ref = el('input', { maxlength: '80', 'aria-label': 'Bank or PayPal reference', placeholder: 'Reference' }); return el('form', { class: 'fx-inline', onsubmit: (e) => { e.preventDefault(); busy(e.submitter, async () => { await post(`/api/saas/finance/refunds/${encodeURIComponent(r.id)}/complete`, { reference: ref.value.trim() }); say('Refund recorded.'); render('finpayments'); }); } }, ref, el('button', { type: 'submit', class: 'portal-button primary', text: 'Mark refunded' })); };
        b.append(section('Refunds', note('Refunds of card payments go back through your own Stripe account after approval. Bank and PayPal refunds are approved here, paid back by you, then marked done.'), table([['created_at', 'Requested', day], ['job', 'Job'], ['receipt_no', 'Payment'], ['amount_cents', 'Amount', (v) => $(v)], ['reason', 'Reason'], ['status', 'Status', (v) => chip(v)], ['id', '', (id, r) => (r.status === 'awaiting_manual' ? done(r) : r.status === 'pending_approval' ? el('a', { href: '#b01/approvals', class: 'fx-link', text: 'Open approvals' }) : r.provider_ref || r.completed_reference || '')]], rf.refunds, 'No refunds.')));
      },
      // ---------------- reconciliation ----------------
      async finreconcile(b) {
        const d = await api('/api/saas/finance/reconciliation');
        const file = el('input', { type: 'file', accept: '.csv,text/csv', id: nid() });
        const imp = el('form', { class: 'fx-form', onsubmit: (e) => { e.preventDefault(); busy(e.submitter, async () => { const f = file.files[0]; if (!f) throw new Error('Choose a CSV file from your bank.'); if (f.size > 900000) throw new Error('That file is too large. Export a shorter date range.'); const r = await post('/api/saas/finance/bank/import', { filename: f.name, csv: await f.text() }); say(`Imported ${r.added} line(s)${r.duplicates ? `, skipped ${r.duplicates} already imported` : ''}${r.errors.length ? `, ${r.errors.length} row(s) not understood` : ''}.`); render('finreconcile'); }); } }, field('Bank statement (CSV)', file, 'Most banks export Date, Description and Amount (or Debit and Credit) columns.'), el('div', { class: 'pl-actions' }, el('button', { type: 'submit', class: 'portal-button primary', text: 'Import statement' })));
        b.append(section('Import', imp, d.last_import ? note(`Last import ${when(d.last_import.created_at)} (${d.last_import.rows} line(s)).`) : null),
          el('div', { class: 'au-stats' }, ...[['unmatched', 'To reconcile'], ['matched', 'Matched to payments'], ['categorised', 'Categorised'], ['ignored', 'Ignored']].map(([k, t]) => el('div', { class: 'pl-stage' }, el('b', { text: String(d.counts[k]) }), el('span', { text: t })))));
        const act = (l) => {
          if (l.status !== 'unmatched') return el('button', { type: 'button', class: 'portal-button', text: 'Undo', onclick: (e) => busy(e.target, async () => { await post(`/api/saas/finance/bank/${l.id}/undo`); say('Line is back to reconcile.'); render('finreconcile'); }) });
          const s = l.suggestion || {}, best = (s.payments || [])[0];
          const cat = el('select', { 'aria-label': 'Category for ' + l.description }, d.categories.map((c) => el('option', { value: c, text: c, selected: s.category?.category === c || null })));
          return el('div', { class: 'fx-actions' },
            best ? el('button', { type: 'button', class: 'portal-button primary', text: `Match ${best.receipt_no || best.invoice_number || 'payment'}`, title: best.why.join('; '), onclick: (e) => busy(e.target, async () => { await post(`/api/saas/finance/bank/${l.id}/match`, { payment_id: best.payment_id }); say('Matched.'); render('finreconcile'); }) }) : null,
            cat, el('button', { type: 'button', class: 'portal-button', text: 'Save category', onclick: (e) => busy(e.target, async () => { const r = await post(`/api/saas/finance/bank/${l.id}/match`, { category: cat.value }); say(r.finance_entry_id ? 'Categorised and recorded as an expense.' : 'Categorised.'); render('finreconcile'); }) }),
            el('button', { type: 'button', class: 'portal-button', text: 'Ignore', onclick: (e) => busy(e.target, async () => { await post(`/api/saas/finance/bank/${l.id}/match`, { ignore: true, note: 'Ignored by staff' }); say('Ignored.'); render('finreconcile'); }) }));
        };
        const sug = (l) => { const s = l.suggestion || {}; const p = (s.payments || [])[0]; return el('div', { class: 'fx-sug' }, p ? el('span', { text: `Payment ${p.receipt_no || ''} ${p.job || ''}: ${p.why.join(', ')}` }) : null, s.category ? el('small', { text: `${s.category.category}: ${s.category.reason}` }) : null); };
        b.append(section('Bank lines', note(d.note), table([['posted_on', 'Date', day], ['description', 'Description'], ['amount_cents', 'Amount', (v) => $(v)], ['status', 'Status', (v, l) => [chip(v), l.category ? ' ' + l.category : '']], ['suggestion', 'Super Pro suggests', (v, l) => (l.status === 'unmatched' ? sug(l) : '')], ['id', '', (id, l) => act(l)]], d.lines, 'Import a statement to start.')));
        if (d.recorded_not_in_bank.length) b.append(section('Recorded but not seen in the bank', note('These bank or manual payments were recorded more than 5 days ago and no bank line is matched to them yet.'), table([['paid_at', 'Recorded', day], ['job', 'Job'], ['receipt_no', 'Receipt'], ['amount_cents', 'Amount', (v) => $(v)], ['method', 'How']], d.recorded_not_in_bank)));
      },
      // ---------------- reports ----------------
      async finreports(b, range) {
        const t = new Date(), fy = t.getMonth() >= 6 ? t.getFullYear() : t.getFullYear() - 1;
        const from = el('input', { type: 'date', id: nid(), value: range?.from || `${fy}-07-01` }), to = el('input', { type: 'date', id: nid(), value: range?.to || t.toISOString().slice(0, 10) });
        const q = `?from=${encodeURIComponent(from.value)}&to=${encodeURIComponent(to.value)}`;
        const [pl, gst, aged, ins] = await Promise.all([api('/api/saas/finance/reports/pl' + q), api('/api/saas/finance/reports/gst' + q), api('/api/saas/finance/reports/aged'), api('/api/saas/finance/insights' + q)]);
        b.append(el('form', { class: 'fx-filters', onsubmit: (e) => { e.preventDefault(); render('finreports', { from: from.value, to: to.value }); } }, field('From', from), field('To', to), el('button', { type: 'submit', class: 'portal-button', text: 'Show' })));
        b.append(section('Summary', el('ul', { class: 'sx-list' }, ins.summary.points.map((p) => el('li', { text: p }))), note(ins.summary.basis)));
        const p = pl.report;
        b.append(section('Profit and loss', table([['category', 'Income'], ['amount_cents', 'Amount', (v) => $(v)]], p.income, 'No income recorded.'), table([['category', 'Expenses'], ['amount_cents', 'Amount', (v) => $(v)]], p.expenses, 'No expenses recorded.'), el('p', { class: 'fx-total' }, `Income ${$(p.total_income_cents)} · Expenses ${$(p.total_expenses_cents)} · ${p.profit_cents >= 0 ? 'Profit' : 'Loss'} ${$(Math.abs(p.profit_cents))}`), note(p.note), el('p', { class: 'pl-actions' }, el('a', { class: 'portal-button', href: '/api/saas/finance/reports/pl.csv' + q, text: 'Download CSV' }))));
        const g = gst.report;
        b.append(section('GST (BAS draft)', g.registered ? table([['k', 'Label'], ['v', 'Amount', (v) => $(v)]], [{ k: 'G1 Total sales (inc GST)', v: g.G1_total_sales_cents }, { k: 'G3 GST-free sales', v: g.G3_gst_free_sales_cents }, { k: '1A GST on sales', v: g['1A_gst_on_sales_cents'] }, { k: '1B GST on purchases', v: g['1B_gst_on_purchases_cents'] }, { k: 'Net GST (1A less 1B)', v: g.net_gst_cents }]) : el('p', { text: g.note }), g.registered ? note(`${g.basis === 'cash' ? 'Cash' : 'Accrual'} basis, ${g.counts.sales} sale(s), ${g.counts.purchases} purchase(s). ${g.note}`) : null));
        b.append(section('Owed to you', table([['k', 'Age'], ['v', 'Owing', (v) => $(v)]], [{ k: 'Not yet due', v: aged.report.buckets.current }, { k: '1 to 30 days overdue', v: aged.report.buckets.d1_30 }, { k: '31 to 60 days', v: aged.report.buckets.d31_60 }, { k: '61 to 90 days', v: aged.report.buckets.d61_90 }, { k: 'Over 90 days', v: aged.report.buckets.d90_plus }]), el('p', { class: 'pl-actions' }, el('a', { class: 'portal-button', href: '/api/saas/finance/reports/aged.csv', text: 'Download CSV' }))));
        b.append(section('Overdue: suggested follow-ups', table([['number', 'Invoice'], ['customer', 'Customer'], ['days_overdue', 'Days overdue'], ['owing_cents', 'Owing', (v) => $(v)], ['reminders_sent', 'Reminders sent'], ['recommendation', 'Suggestion'], ['document_id', '', (id) => el('a', { class: 'portal-button', href: '#' + HASH.finsales, onclick: () => { pendingOpen = id; }, text: 'Open' })]], ins.follow_ups, 'Nothing is overdue.'), note('Super Pro suggestions from your records. Automatic customer reminders are set in Money > Payment settings.')));
        if (ins.discrepancies.length) b.append(section('Discrepancies found', el('ul', { class: 'sx-list' }, ins.discrepancies.map((x) => el('li', {}, chip(x.severity), ' ', x.message)))));
      },
      // ---------------- settings and compliance ----------------
      async fincompliance(b) {
        const [st, cr, au, ins] = await Promise.all([api('/api/saas/finance/settings'), api('/api/saas/finance/compliance'), api('/api/saas/finance/audit').catch(() => ({ events: null })), api('/api/saas/finance/insights')]);
        const s = st.settings;
        const reg = el('select', { id: nid() }, el('option', { value: '', text: 'Choose', selected: s.gst_registered === null || null }), el('option', { value: '1', text: 'Yes, registered for GST', selected: s.gst_registered === 1 || null }), el('option', { value: '0', text: 'No, not registered', selected: s.gst_registered === 0 || null }));
        const inc = check('Prices I enter include GST', { checked: s.prices_include_gst === 1 });
        const basis = el('select', { id: nid() }, [['cash', 'Cash (when paid)'], ['accrual', 'Accrual (when invoiced)']].map(([k, t]) => el('option', { value: k, text: t, selected: s.accounting_basis === k || null })));
        const per = el('select', { id: nid() }, [['quarterly', 'Quarterly'], ['monthly', 'Monthly'], ['annual', 'Annual']].map(([k, t]) => el('option', { value: k, text: t, selected: s.bas_period === k || null })));
        const valid = el('input', { type: 'number', id: nid(), min: '1', max: '365', value: String(s.quote_valid_days) }), dep = el('input', { type: 'number', id: nid(), min: '0', max: '100', value: String(s.deposit_percent) });
        const foot = el('textarea', { id: nid(), rows: '2', maxlength: '600', text: s.footer_note || '' });
        const form = el('form', { class: 'fx-form', onsubmit: (e) => { e.preventDefault(); busy(e.submitter, async () => { if (reg.value === '') throw new Error('Choose whether the business is registered for GST.'); await post('/api/saas/finance/settings', { gst_registered: reg.value === '1', prices_include_gst: inc.querySelector('input').checked, accounting_basis: basis.value, bas_period: per.value, quote_valid_days: Number(valid.value), deposit_percent: Number(dep.value), footer_note: foot.value.trim() || null }, 'PUT'); say('Finance settings saved.'); render('fincompliance'); }); } },
          field('Registered for GST?', reg, 'Registered businesses issue tax invoices showing GST. Check with the ATO or your tax agent if unsure.'), inc, field('GST reporting basis', basis), field('BAS period', per), field('Quotations valid for (days)', valid), field('Usual deposit (%)', dep), field('Invoice footer (payment terms, bank details shown elsewhere)', foot),
          el('div', { class: 'pl-actions' }, el('button', { type: 'submit', class: 'portal-button primary', text: 'Save finance settings' })));
        b.append(section('Finance settings', form, note(`ABN on your invoices: ${st.seller.abn || 'not set'} (change it in Setup & Trust > Settings).`)));
        b.append(section('Compliance review', el('ul', { class: 'fx-review' }, cr.items.map((i) => el('li', {}, chip(i.status, i.status === 'ok' ? 'OK' : i.status === 'action' ? 'Action needed' : 'Review'), el('b', { text: ' ' + i.area + ': ' }), i.text, i.fix ? el('small', { text: ' ' + i.fix }) : null))), note(cr.disclaimer),
          el('details', {}, el('summary', { text: `Rules used (ruleset ${cr.ruleset.id}, reviewed ${cr.ruleset.reviewed_at})` }), el('ul', { class: 'sx-list' }, cr.ruleset.sources.map((x) => el('li', {}, el('a', { href: x.url, target: '_blank', rel: 'noopener', text: x.topic })))), note(cr.ruleset.reviewed_by))));
        const flags = ins.flags.filter((f) => f.status === 'open');
        const resolve = (f) => { const n = el('input', { maxlength: '300', 'aria-label': 'What you found', placeholder: 'What you found' }); return el('form', { class: 'fx-inline', onsubmit: (e) => { e.preventDefault(); busy(e.submitter, async () => { await post(`/api/saas/finance/flags/${f.id}`, { status: e.submitter?.value || 'resolved', note: n.value.trim() }); say('Flag closed.'); render('fincompliance'); }); } }, n, el('button', { type: 'submit', class: 'portal-button', value: 'resolved', text: 'Resolved' }), el('button', { type: 'submit', class: 'portal-button', value: 'dismissed', text: 'Not a problem' })); };
        b.append(section('Flagged for checking', table([['severity', 'Level', (v) => chip(v)], ['message', 'What Super Pro noticed'], ['created_at', 'Since', day], ['id', '', (id, f) => resolve(f)]], flags, 'Nothing flagged.'), note('Flags are Super Pro checks on your records (unusual refunds, many manual payments, mismatched totals, changes made overnight). They are prompts to look, not findings.')));
        b.append(section('Audit trail', au.events ? table([['created_at', 'When', when], ['user_name', 'Who', (v, r) => v || (r.user_id ? 'Staff member' : 'System')], ['action', 'What', (v) => v.replace(/^(finance|payment|invoice)\./, '').replace(/_/g, ' ')], ['entity_type', 'Record']], au.events.slice(0, 100), 'No finance activity yet.') : note('Only owners and admins can see the finance audit trail.')));
      },
      // ---------------- plan change ----------------
      async finplan(b) {
        const d = await api('/api/saas/finance/plan-changes');
        const sel = el('select', { id: nid() }, d.plans.map((p) => el('option', { value: p.id, text: `${p.name}: ${$(p.monthly_fee_cents)} a month plus GST` })));
        const out = el('div', { 'aria-live': 'polite' });
        const quote = async () => { const q = await api('/api/saas/finance/plan-change/quote?plan=' + encodeURIComponent(sel.value)).catch((e) => ({ ok: false, error: e.message })); out.replaceChildren(q.ok ? el('div', {}, el('p', { text: q.explanation }), el('button', { type: 'button', class: 'portal-button primary', text: q.kind === 'upgrade' ? `Upgrade to ${q.to.name}` : `Change to ${q.to.name}`, onclick: (e) => busy(e.target, async () => { const r = await post('/api/saas/finance/plan-change', { plan_id: sel.value }); say(r.scheduled ? `Plan change scheduled for ${day(r.effective_at)}.` : `You are now on ${r.to.name}.`); render('finplan'); }) })) : el('p', { text: q.error })); };
        sel.addEventListener('change', quote);
        b.append(section('Choose a plan', field('Plan', sel), out), section('Plan changes', table([['created_at', 'Requested', day], ['from_plan', 'From'], ['to_plan', 'To'], ['kind', 'Type'], ['effective_at', 'Starts', day], ['proration_cents', 'Prorated charge', (v) => (v ? $(v) + ' + GST' : '')], ['status', 'Status', (v) => chip(v)], ['id', '', (id, c) => (c.status === 'scheduled' ? el('button', { type: 'button', class: 'portal-button', text: 'Cancel', onclick: (e) => busy(e.target, async () => { await post(`/api/saas/finance/plan-change/${id}/cancel`); say('Scheduled change cancelled.'); render('finplan'); }) }) : '')]], d.changes, 'No plan changes yet.')));
        quote();
      }
    };
    let pendingOpen = null;
    R.finsales = ((orig) => async (b, id) => { const x = id || pendingOpen; pendingOpen = null; return orig(b, x); })(R.finsales);

    function creator(o, detail) {
      const kind = el('select', { id: nid() }, [['invoice', 'Tax invoice'], ['deposit', 'Deposit invoice'], ['quote', 'Quotation'], ['estimate', 'Estimate']].map(([k, t]) => el('option', { value: k, text: t })));
      const title = el('input', { id: nid(), maxlength: '240', required: true });
      const cust = el('select', { id: nid() }, el('option', { value: '', text: 'No customer' }), o.customers.map((c) => el('option', { value: c.id, text: c.name })));
      const jobSel = el('select', { id: nid() }, el('option', { value: '', text: 'Choose the job' }), o.jobs.map((j) => el('option', { value: j.id, text: `${j.title}${j.has_invoice ? ' (has an invoice)' : ''}` })));
      const lines = linesEditor([], o.tax_codes);
      const jobWrap = field('Job', jobSel, 'Invoices are linked to a job so payments and the balance are tracked.');
      const sync = () => { jobWrap.hidden = !['invoice', 'deposit'].includes(kind.value); };
      kind.addEventListener('change', sync);
      jobSel.addEventListener('change', () => { const j = o.jobs.find((x) => x.id === jobSel.value); if (j && !title.value) title.value = j.title; if (j?.customer_id) cust.value = j.customer_id; });
      const form = el('form', { class: 'fx-form', onsubmit: (e) => { e.preventDefault(); busy(e.submitter, async () => { const ls = lines.value(); if (!ls.length) throw new Error('Add at least one item with a description.'); const r = await post('/api/saas/finance/documents', { kind: kind.value, title: title.value.trim(), customer_id: cust.value || null, work_order_id: jobWrap.hidden ? null : jobSel.value || null, lines: ls }); say(`${KIND[r.document.kind]} saved as a draft.`); render('finsales', r.document.id); }); } },
        el('div', { class: 'fx-grid' }, field('Type', kind), field('Title', title), field('Customer', cust), jobWrap), el('div', { class: 'fx-field' }, el('span', { class: 'fx-label', text: 'Items' }), lines.node), note(o.seller.gst_registered ? (o.seller.prices_include_gst ? 'Unit prices include GST.' : 'Unit prices exclude GST; GST is added.') : 'Not registered for GST: no GST is added.'),
        el('div', { class: 'pl-actions' }, el('button', { type: 'submit', class: 'portal-button primary', text: 'Save draft' })));
      sync();
      return el('details', { class: 'portal-panel fx-panel' }, el('summary', { text: 'New quotation, estimate or invoice' }), form);
    }
    function draftFromJob(o, detail) {
      const done = o.jobs.filter((j) => j.completed_at && !j.has_invoice);
      if (!done.length) return null;
      const sel = el('select', { id: nid() }, done.map((j) => el('option', { value: j.id, text: j.title })));
      return section('Completed jobs without an invoice', el('form', { class: 'fx-inline', onsubmit: (e) => { e.preventDefault(); busy(e.submitter, async () => { const r = await post(`/api/saas/finance/jobs/${sel.value}/draft-invoice`); say('Draft invoice prepared by Super Pro. Check every line before approving.'); render('finsales', r.document.id); }); } }, field('Job', sel), el('button', { type: 'submit', class: 'portal-button', text: 'Prepare invoice draft' })), note('Super Pro copies the quotation lines, or the hours, rate and materials on the job. You check and approve it.'));
    }

    async function showDoc(id, box, o) {
      box.replaceChildren(el('p', { class: 'pl-meta', text: 'Loading…' }));
      let d; try { d = (await api('/api/saas/finance/documents/' + encodeURIComponent(id))).document; } catch (e) { box.replaceChildren(el('p', { class: 'portal-note', 'data-tone': 'bad', text: e.message })); return; }
      const refresh = () => render('finsales', id);
      const act = (text, fn, primary = false) => el('button', { type: 'button', class: 'portal-button' + (primary ? ' primary' : ''), text, onclick: (e) => busy(e.target, fn) });
      const acts = el('div', { class: 'pl-actions' });
      const editable = ['draft', 'approved'].includes(d.stored_status) && d.kind !== 'credit_note';
      if (d.stored_status === 'draft' && d.kind !== 'credit_note') acts.append(act('Approve', async () => { await post(`/api/saas/finance/documents/${id}/approve`, { revision: d.revision }); say('Approved. Issue it when ready.'); refresh(); }, true));
      if (d.stored_status === 'approved') acts.append(act(['quote', 'estimate'].includes(d.kind) ? 'Mark as sent' : 'Issue', async () => { await post(`/api/saas/finance/documents/${id}/issue`); say(['quote', 'estimate'].includes(d.kind) ? 'Marked as sent.' : 'Issued.'); refresh(); }, true));
      if (d.kind === 'estimate' && !['converted', 'cancelled'].includes(d.stored_status)) acts.append(act('Turn into a quotation', async () => { const r = await post(`/api/saas/finance/documents/${id}/convert`, { to: 'quote' }); say('Quotation created.'); render('finsales', r.document.id); }));
      if (d.kind === 'quote' && d.stored_status !== 'cancelled') { acts.append(act('Create deposit invoice', async () => { const r = await post(`/api/saas/finance/documents/${id}/convert`, { to: 'deposit' }); say('Deposit invoice drafted.'); render('finsales', r.document.id); }), act('Create invoice', async () => { const r = await post(`/api/saas/finance/documents/${id}/convert`, { to: 'invoice' }); say('Invoice drafted.'); render('finsales', r.document.id); })); }
      if (['invoice', 'deposit'].includes(d.kind) && ['issued', 'part_paid', 'overdue'].includes(d.status)) for (const [p, t] of [['stripe', 'Card payment link'], ['bank', 'Bank transfer details'], ['paypal', 'PayPal link']]) acts.append(act(t, async () => { const r = await post(`/api/saas/finance/documents/${id}/payment-link`, { provider: p }); linkOut.replaceChildren(r.payment?.checkout_url ? el('p', {}, 'Payment link: ', el('a', { href: r.payment.checkout_url, target: '_blank', rel: 'noopener', text: r.payment.checkout_url })) : r.bank ? el('p', { class: 'fx-pre', text: `${r.bank.details}\nReference: ${r.bank.reference}` }) : el('p', { text: 'Payment request created.' })); say('Payment request created.'); }));
      let cancelForm = null;
      if (editable || ['draft', 'approved', 'sent'].includes(d.stored_status)) { const why = el('input', { maxlength: '300', id: nid() }); cancelForm = el('details', {}, el('summary', { text: 'Cancel this document' }), el('form', { class: 'fx-inline', onsubmit: (e) => { e.preventDefault(); busy(e.submitter, async () => { await post(`/api/saas/finance/documents/${id}/cancel`, { reason: why.value.trim() }); say('Cancelled.'); refresh(); }); } }, field('Reason (kept in the record)', why), el('button', { type: 'submit', class: 'portal-button', text: 'Cancel document' }))); }
      acts.append(el('a', { class: 'portal-button', href: `/api/saas/finance/documents/${encodeURIComponent(id)}/print`, target: '_blank', rel: 'noopener', text: 'Print or PDF' }));
      const linkOut = el('div', { 'aria-live': 'polite' });
      const cmp = d.compliance;
      const lines = el('div', { class: 'au-tablewrap' }, el('table', { class: 'au-table' }, el('thead', {}, el('tr', {}, ['Item', 'Qty', 'Unit price', 'Tax', 'GST', 'Amount'].map((h) => el('th', { scope: 'col', text: h })))), el('tbody', {}, d.lines.map((l) => el('tr', {}, el('th', { scope: 'row', text: l.description }), el('td', { text: String(l.quantity) }), el('td', { text: $(l.unit_cents) }), el('td', { text: o.tax_codes[l.tax_code] || l.tax_code }), el('td', { text: $(l.gst_cents) }), el('td', { text: $(l.inc_cents) }))))));
      let editor = null;
      if (editable) { const ed = linesEditor(d.lines, o.tax_codes); editor = el('details', {}, el('summary', { text: 'Edit items' }), ed.node, el('div', { class: 'pl-actions' }, act('Save changes', async () => { await post(`/api/saas/finance/documents/${id}`, { lines: ed.value() }, 'PUT'); say(d.stored_status === 'approved' ? 'Saved. It went back to draft; approve it again.' : 'Saved.'); refresh(); }))); }
      let credit = null;
      if (d.kind === 'invoice' && ['issued', 'part_paid', 'paid', 'overdue'].includes(d.status)) {
        const amt = el('input', { type: 'number', min: '0.01', step: '0.01', id: nid() }), why = el('input', { maxlength: '500', id: nid() });
        credit = el('details', {}, el('summary', { text: 'Credit or correct this invoice (adjustment note)' }), el('form', { class: 'fx-form', onsubmit: (e) => { e.preventDefault(); busy(e.submitter, async () => { const r = await post(`/api/saas/finance/documents/${id}/credit-note`, { amount: Number(amt.value), reason: why.value.trim() }); say(r.message); refresh(); }); } }, field('Amount to credit (inc GST)', amt), field('Reason', why, 'Shown on the adjustment note.'), el('div', { class: 'pl-actions' }, el('button', { type: 'submit', class: 'portal-button', text: 'Send for approval' }))));
      }
      const m = d.money;
      box.replaceChildren(section(`${d.heading}${d.number ? ' ' + d.number : ''}`,
        el('p', { class: 'pl-meta' }, chip(d.status), ` ${d.title}${d.customer ? ' · ' + d.customer : ''}${d.issued_at ? ' · issued ' + day(d.issued_at) : ''}${d.due_at ? ' · due ' + day(d.due_at) : ''}${d.ai_prepared ? ' · prepared by Super Pro' : ''}`),
        d.parent ? el('p', { text: `From ${KIND[d.parent.kind] || d.parent.kind} ${d.parent.number || d.parent.title}${d.reason ? '. Reason: ' + d.reason : ''}` }) : null,
        lines, el('p', { class: 'fx-total' }, `Ex GST ${$(d.ex_cents)} · GST ${$(d.gst_cents)} · Total ${$(d.total_cents)}`),
        m ? el('p', { text: `Paid ${$(Math.min(m.paid_cents, m.job_price_cents ?? m.total_cents))} · Owing ${$(m.owing_cents)}${m.credited_cents ? ' · Credited ' + $(m.credited_cents) : ''}` }) : null,
        cmp ? el('div', { class: 'fx-checks' }, el('h3', { text: cmp.ok ? 'Tax invoice checks pass' : 'Fix before issuing' }), el('ul', { class: 'sx-list' }, [...cmp.issues.map((x) => el('li', { class: 'fx-bad', text: x })), ...cmp.notes.map((x) => el('li', { text: x }))]), note(`Checked against ruleset ${cmp.ruleset}.`)) : null,
        acts, linkOut, editor, credit, cancelForm,
        d.credit_notes?.length ? [el('h3', { text: 'Adjustment notes' }), table([['number', 'Number', (v) => v || 'Not issued'], ['status', 'Status', (v) => chip(v)], ['total_cents', 'Amount', (v) => $(v)], ['reason', 'Reason']], d.credit_notes)] : null,
        d.refunds?.length ? [el('h3', { text: 'Refunds on this job' }), table([['created_at', 'Requested', day], ['amount_cents', 'Amount', (v) => $(v)], ['status', 'Status', (v) => chip(v)], ['reason', 'Reason']], d.refunds)] : null,
        m?.payments?.length ? [el('h3', { text: 'Payments' }), table([['created_at', 'Created', day], ['provider', 'How'], ['amount_cents', 'Amount', (v) => $(v)], ['status', 'Status', (v) => chip(v)], ['receipt_no', 'Receipt']], m.payments)] : null));
      box.scrollIntoView({ block: 'start' });
    }

    // ---------------- Founder Console: platform billing ----------------
    async function founderView(b) {
      const [pl, rn, dn, rv] = await Promise.all([api('/api/operator/finance/plans'), api('/api/operator/finance/renewals'), api('/api/operator/finance/dunning'), api('/api/operator/finance/revenue')]);
      b.append(section('Revenue', el('div', { class: 'au-stats' }, el('div', { class: 'pl-stage' }, el('b', { text: $(rv.mrr_cents) }), el('span', { text: 'Monthly recurring' })), el('div', { class: 'pl-stage' }, el('b', { text: $(rv.arr_cents) }), el('span', { text: 'Annual run rate' })), el('div', { class: 'pl-stage' }, el('b', { text: $(rv.outstanding_cents) }), el('span', { text: 'Invoiced, unpaid' }), el('small', { text: `${rv.outstanding_invoices} invoice(s)` })), el('div', { class: 'pl-stage' }, el('b', { text: String(rv.failed_payments) }), el('span', { text: 'Failed payments' }))),
        table([['month', 'Month'], ['collected_ex_gst_cents', 'Collected ex GST', (v) => $(v)], ['gst_collected_cents', 'GST collected', (v) => $(v)], ['invoiced_cents', 'Invoiced', (v) => $(v)], ['upgrades', 'Upgrades'], ['downgrades', 'Downgrades']], rv.months), note(rv.note)));
      const priceForm = (p) => { const amt = el('input', { type: 'number', min: '0', step: '0.01', 'aria-label': `New monthly price for ${p.name}` }), eff = el('input', { type: 'date', 'aria-label': `Effective date for ${p.name}` }), why = el('input', { maxlength: '300', 'aria-label': `Reason for changing ${p.name}`, placeholder: 'Reason' }); return el('details', {}, el('summary', { text: 'Change price' }), el('form', { class: 'fx-inline', onsubmit: (e) => { e.preventDefault(); busy(e.submitter, async () => { const r = await post(`/api/operator/finance/plans/${encodeURIComponent(p.id)}/price`, { monthly_price: Number(amt.value), effective_from: eff.value, reason: why.value.trim() }); say(r.message); render('founder'); }); } }, amt, eff, why, el('button', { type: 'submit', class: 'portal-button', text: 'Send for approval' }))); };
      b.append(section('Plans and prices', table([['name', 'Plan'], ['monthly_fee_cents', 'Monthly (ex GST)', (v) => $(v)], ['subscribers', 'Subscribers'], ['pending', 'Waiting', (v) => (v.length ? v.map((c) => `${$(c.to_cents)} from ${c.effective_from} (${STATUS[c.status] || c.status})`).join('; ') : '')], ['history', 'History', (v) => v.map((h) => `${$(h.monthly_fee_cents)} from ${h.effective_from}`).join(' · ')], ['id', '', (id, p) => priceForm(p)]], pl.plans), note(`Every price change needs platform approval (Operations > AI automations). Increases need ${pl.policy.increase_notice_days} days' notice to existing subscribers, who are told automatically.`)));
      b.append(section('Renewals and trials', el('p', { text: `${rn.renewing.length} subscription(s) renew on ${day(rn.next_renewal)}, totalling ${$(rn.renewing_total_cents)} before GST.` }), table([['business', 'Trial ending'], ['plan', 'Plan'], ['trial_ends_at', 'Ends', day], ['days_left', 'Days left']], rn.trials_ending, 'No trials end in the next 14 days.'), table([['business', 'Scheduled change'], ['from_plan', 'From'], ['to_plan', 'To'], ['effective_at', 'On', day]], rn.scheduled_changes, 'No scheduled plan changes.')));
      const resolve = (c) => { const n = el('input', { maxlength: '200', 'aria-label': 'Outcome', placeholder: 'Outcome' }); return el('form', { class: 'fx-inline', onsubmit: (e) => { e.preventDefault(); busy(e.submitter, async () => { await post(`/api/operator/finance/dunning/${c.id}/resolve`, { resolution: n.value.trim() }); say('Case closed.'); render('founder'); }); } }, n, el('button', { type: 'submit', class: 'portal-button', text: 'Close case' })); };
      b.append(section('Payment problems', table([['business', 'Business'], ['reason', 'Problem'], ['days_open', 'Days open'], ['step', 'Reminders sent'], ['status', 'Status', (v, c) => [chip(v), c.restrict_suggested ? ' Consider restricting access' : '']], ['id', '', (id, c) => (c.status === 'open' ? resolve(c) : c.resolution || '')]], dn.cases, 'No payment problems.'), note(`Owners are reminded on days ${dn.policy.dunning_steps_days.join(', ')}. Restricting access is still your decision.`), el('div', { class: 'pl-actions' }, el('button', { type: 'button', class: 'portal-button', text: 'Run billing checks now', onclick: (e) => busy(e.target, async () => { const r = await post('/api/operator/finance/run-daily'); say(`Checks done: ${r.applied} price change(s) applied, ${r.notified} announced, ${r.changes} plan change(s), ${r.reminded} reminder(s).`); render('founder'); }) }))));
    }
    R.founder = founderView;
    return { render };
  }

  // ---------------- workspace wiring ----------------
  const instances = {};
  function view(vid) {
    let s = document.getElementById(vid + '-view');
    if (!s) { s = el('section', { class: 'view', id: vid + '-view', hidden: true }); (document.querySelector('.content-wrap') || document.body).append(s); }
    if (!s.dataset.fxReady) { s.dataset.fxReady = '1'; s.replaceChildren(el('div', { class: 'page-heading' }, el('div', {}, el('h1', { text: VIEWS[vid][0] }), el('p', { text: VIEWS[vid][1] })))); }
    return s;
  }
  if (document.getElementById('workspace') || document.querySelector('.content-wrap')) {
    for (const vid of Object.keys(VIEWS)) view(vid);
    window.addEventListener('gds:viewchange', (e) => { const vid = e.detail?.view; if (!VIEWS[vid]) return; const s = view(vid); (instances[vid] ||= Finance(s)).render(vid); });
  }
  window.SuperProFinance = { mountFounder: (host, api) => Finance(host, { api, founder: true }), VIEWS };
})();
