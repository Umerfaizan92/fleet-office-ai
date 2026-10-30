// Phase 06: Website & Visibility workspace views: SEO Command Centre, Technical Audit, Keyword Clusters, Google,
// Content Studio, Website Builder, Local SEO, SEO Analytics and SEO Reports. The same file serves the Founder Console
// (window.SuperProSeo.mount(host, '/api/operator/seo', api)) for Super Pro's own website.
// Every number shown names its source; measured figures and Super Pro estimates are never mixed.
(() => {
  const el = (tag, attrs = {}, ...kids) => {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) { if (v === null || v === undefined || v === false) continue; if (k === 'class') e.className = v; else if (k === 'text') e.textContent = v; else if (k.startsWith('on')) e.addEventListener(k.slice(2), v); else if (k === 'value') e.value = v; else e.setAttribute(k, v === true ? '' : v); }
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
  const num = (n, d = 0) => (n === null || n === undefined ? '—' : Number(n).toLocaleString('en-AU', { maximumFractionDigits: d }));
  const pct = (n) => (n === null || n === undefined ? '—' : (n * 100).toFixed(1) + '%');
  const money = (c, cur = 'AUD') => (Number(c) || 0).toLocaleString('en-AU', { style: 'currency', currency: cur || 'AUD' });
  const LEVEL = { fix: ['Must fix', 'pl-cancelled'], improve: ['Improve', 'pl-issued'], good: ['Good', 'pl-paid'], not_measured: ['Not measured', 'pl-lost'], info: ['Information', 'pl-draft'], setup: ['Needs set-up', 'pl-lost'] };
  const chip = (level, text) => el('span', { class: 'portal-status ' + (LEVEL[level]?.[1] || 'pl-draft'), text: text || LEVEL[level]?.[0] || level });
  const source = (t) => el('p', { class: 'sx-source', text: 'Source: ' + t });
  const VIEWS = {
    seocentre: ['SEO Command Centre', 'Your website, search visibility and Google data in one place. Measured figures always name their source; Super Pro estimates are marked as estimates. Nobody can guarantee Google indexing or rankings.'],
    seoaudit: ['Technical Audit', 'Super Pro reads your site the way a search crawler does and lists what to fix: crawling, indexing, sitemaps, redirects, broken links, titles, headings, images, mobile, https and more.'],
    seoclusters: ['Keyword Clusters', 'Topics people search for, grouped by intent and mapped to your pages, with content gaps and internal links. Search volumes appear only from Search Console or a list you upload.'],
    seogoogle: ['Google', 'Connect Search Console, Analytics 4, Business Profile, Tag Manager, Google Ads reporting and PageSpeed Insights. A service shows as verified only after a real call to Google worked.'],
    seostudio: ['Content Studio', 'Drafts for pages, FAQs, articles, meta descriptions, schema and alt text, written from your business facts. Claims that need checking are listed before anything can be published.'],
    seobuilder: ['Website Builder', 'Build pages from sections, preview them, and publish. Small wording fixes can go live under your rule; new claims, design changes and first releases wait for approval.'],
    seolocal: ['Local SEO', 'Check your business details match everywhere, your Google profile, service areas and reviews. Review replies are drafted for you and posted only after approval.'],
    seoanalytics: ['SEO Analytics', 'Clicks, impressions, CTR and position from Search Console; sessions and key events from Analytics; leads and revenue from your Super Pro records.'],
    seoreports: ['SEO Reports', 'Daily checks, weekly analysis and monthly reports. Turn on the scheduled jobs in the Command Centre.']
  };

  function Seo(host, base, api = defaultApi, { founder = false, onStatus = null } = {}) {
    const say = (t, bad = false) => { const p = host.querySelector('[data-sx-status]'); if (p) { p.textContent = t; p.dataset.tone = bad ? 'bad' : 'good'; } onStatus?.(t, bad); if (!bad) window.SPMotion?.toast?.(t); };
    const busy = async (btn, fn) => { btn.disabled = true; try { await fn(); } catch (e) { say(e.message, true); } finally { btn.disabled = false; } };
    const post = (p, b, m = 'POST') => api(base + p, { method: m, body: JSON.stringify(b || {}) });
    const get = (p) => api(base + p);
    const body = () => { let b = host.querySelector('[data-sx-body]'); const n = el('div', { 'data-sx-body': '' }); if (b) b.replaceWith(n); else host.append(n); return n; };
    const section = (title, ...kids) => el('section', { class: 'portal-panel sx-panel' }, el('h2', { text: title }), ...kids);
    const empty = (t) => el('p', { class: 'portal-empty', text: t });
    const cell = (r, [k, , f], i) => { const v = f ? f(r[k], r) : String(r[k] ?? ''); return i === 0 ? el('th', { scope: 'row' }, v) : el('td', {}, v); };
    const table = (cols, rows, emptyText = 'Nothing yet.') => {
      if (!rows?.length) return empty(emptyText);
      const head = el('thead', {}, el('tr', {}, cols.map(([, h]) => el('th', { scope: 'col', text: h }))));
      const bodyRows = el('tbody', {}, rows.map((r) => el('tr', {}, cols.map((c, i) => cell(r, c, i)))));
      return el('div', { class: 'au-tablewrap' }, el('table', { class: 'au-table' }, head, bodyRows));
    };
    const go = (view) => { if (founder) render(view); else location.hash = ({ seocentre: 'b06/seo', seoaudit: 'b06/audit', seoclusters: 'b06/keywords', seogoogle: 'b06/google', seostudio: 'b06/studio', seobuilder: 'b06/builder', seolocal: 'b06/local', seoanalytics: 'b06/analytics', seoreports: 'b06/reports' })[view]; };

    async function render(view, arg) {
      host.dataset.sxView = view;
      if (!host.querySelector('[data-sx-status]')) host.append(el('p', { class: 'portal-note pl-status', role: 'status', 'aria-live': 'polite', 'data-sx-status': '' }));
      if (founder) { let nav = host.querySelector('.sx-founder-nav'); if (!nav) { nav = el('div', { class: 'au-tabs sx-founder-nav', role: 'tablist', 'aria-label': 'SEO sections' }); host.prepend(nav); } nav.replaceChildren(...Object.entries(VIEWS).filter(([k]) => k !== 'seolocal').map(([k, [t]]) => el('button', { type: 'button', role: 'tab', class: 'portal-button', 'aria-selected': String(k === view), onclick: () => render(k) }, t.replace('SEO ', '')))); }
      const b = body();
      b.append(el('p', { class: 'pl-meta', text: 'Loading…' }));
      try { await R[view](b, arg); b.querySelector(':scope > .pl-meta')?.remove(); } catch (e) { b.replaceChildren(el('p', { class: 'portal-note', 'data-tone': 'bad', text: e.message })); }
    }

    const R = {
      // ---------------- Command Centre ----------------
      async seocentre(b) {
        const d = await get('/command');
        const a = d.audit, k = d.keywords, sc = d.measured.search_console;
        const stat = (label, value, note) => el('div', { class: 'pl-stage' }, el('b', { text: value }), el('span', { text: label }), note ? el('small', { text: note }) : null);
        b.append(el('div', { class: 'au-stats' },
          stat('Technical audit', a ? `${a.score}/100` : 'Not run', a ? `${a.counts.fix} to fix · ${when(a.created_at)}` : 'Run your first audit'),
          stat('Topic clusters', k ? String(k.summary.clusters) : '—', k ? `${k.gaps} gap(s) · ${k.cannibalisation} overlap(s)` : 'Build clusters'),
          stat('Organic clicks, 28 days', sc ? num(sc.clicks) : 'Not measured', sc ? `${num(sc.impressions)} impressions · Search Console` : 'Connect Search Console'),
          stat('Google services verified', `${d.google.filter((g) => g.status === 'verified').length} of ${d.google.length}`, d.google.some((g) => g.status === 'failing') ? 'One or more failing' : '')));
        if (a) b.append(el('p', { class: 'sx-source', text: a.score_note }));
        const acts = el('div', { class: 'pl-actions' },
          el('button', { type: 'button', class: 'portal-button primary', text: 'Run technical audit', onclick: (e) => busy(e.target, async () => { await post('/audit', {}); say('Audit finished.'); go('seoaudit'); }) }),
          el('button', { type: 'button', class: 'portal-button', text: 'Build keyword clusters', onclick: (e) => busy(e.target, async () => { await post('/keywords/plan', {}); say('Clusters updated.'); go('seoclusters'); }) }),
          el('button', { type: 'button', class: 'portal-button', text: 'Create monthly report', onclick: (e) => busy(e.target, async () => { await post('/reports', { kind: 'monthly' }); say('Report created.'); go('seoreports'); }) }));
        b.append(acts);
        if (!d.facts.website_url && !d.sites.length && !founder) b.append(el('p', { class: 'portal-note', text: 'Add your website address in Website & Visibility > Search & AI visibility (Business facts), or build pages with the Website Builder, so audits can run.' }));
        if (d.alerts.length) b.append(section('Needs attention', el('ul', { class: 'sx-list' }, d.alerts.map((x) => el('li', {}, el('b', { text: x.title }), el('span', { class: 'pl-body', text: x.body }), el('small', { class: 'pl-meta', text: when(x.created_at) }))))));
        if (a?.top?.length) b.append(section('Top problems from the last audit', el('ul', { class: 'sx-list' }, a.top.map((c) => el('li', {}, chip(c.level), ` ${c.category_name}: ${c.title}`)))));
        if (k?.top?.length) b.append(section('Opportunities (Super Pro estimates)', el('ul', { class: 'sx-list' }, k.top.map((p) => el('li', {}, el('b', { text: `${p.primary} · ${p.score}` }), el('span', { class: 'pl-meta', text: p.reasons.join('; ') })))), source('Super Pro estimate from the reasons shown; not Google data.')));
        b.append(section('Google', el('div', { class: 'sx-chips' }, d.google.map((g) => el('span', { class: 'sx-gchip', 'data-status': g.status }, `${g.name}: ${({ verified: 'verified', failing: 'failing', connected_unverified: 'connected, not yet verified', not_connected: 'not connected' })[g.status]}`))), el('button', { type: 'button', class: 'portal-button', text: 'Open Google', onclick: () => go('seogoogle') })));
        const sched = section('Scheduled SEO jobs', el('p', { class: 'pl-meta', text: 'Daily: crawl errors, outages, indexing and broken pages. Weekly: Google data, opportunities and technical issues. Monthly: report, clusters and recommendations. They run through AI Automations and never change your website.' }),
          table([['label', 'Job'], ['frequency', 'When'], ['status', 'Status', (v) => chip(v === 'active' ? 'good' : 'setup', v === 'active' ? 'On' : v === 'not_set_up' ? 'Not set up' : 'Off')], ['last_run_at', 'Last run', (v, r) => (v ? `${when(v)} · ${String(r.last_status || '').replace(/_/g, ' ')}` : 'Not yet')]], d.schedules));
        const on = d.schedules.every((x) => x.status === 'active');
        sched.append(el('div', { class: 'pl-actions' }, el('button', { type: 'button', class: 'portal-button' + (on ? '' : ' primary'), text: on ? 'Turn scheduled jobs off' : 'Turn scheduled jobs on', onclick: (e) => busy(e.target, async () => { await post('/schedules', { enabled: !on }); say(on ? 'Scheduled SEO jobs are off.' : 'Scheduled SEO jobs are on.'); await render('seocentre'); }) })));
        b.append(sched);
        if (!founder) b.append(section('Your sites', d.sites.length ? el('ul', { class: 'sx-list' }, d.sites.map((s) => el('li', {}, el('b', { text: s.name }), ` · ${s.live} of ${s.pages} page(s) live · `, el('a', { href: s.url, target: '_blank', rel: 'noopener', text: s.url })))) : empty('No sites built yet.'), el('button', { type: 'button', class: 'portal-button', text: 'Open Website Builder', onclick: () => go('seobuilder') })));
      },
      // ---------------- Technical Audit ----------------
      async seoaudit(b) {
        const d = await get('/audit');
        const url = el('input', { type: 'url', placeholder: founder ? 'Super Pro website (default)' : 'https://your-website.com.au', 'aria-label': 'Website address', value: d.audit?.site_url || '' });
        b.append(el('form', { class: 'pl-toolbar sx-form', onsubmit: (e) => { e.preventDefault(); busy(e.submitter || e.target.querySelector('button'), async () => { await post('/audit', url.value ? { url: url.value } : {}); say('Audit finished.'); await render('seoaudit'); }); } }, url, el('button', { type: 'submit', class: 'portal-button primary', text: 'Run audit' })));
        const a = d.audit;
        if (!a) { b.append(empty('No audit yet. Run one to see what to fix.')); return; }
        b.append(el('p', { class: 'pl-meta', text: `${a.site_url} · ${when(a.created_at)} · ${a.counts.pages} page(s) read · score ${a.score}/100` }), el('p', { class: 'sx-source', text: a.score_note }));
        b.append(el('div', { class: 'sx-cats' }, a.categories.map((c) => el('button', { type: 'button', class: 'sx-cat', 'data-status': c.status, onclick: () => { filter.value = c.id; draw(); } }, el('b', { text: c.name }), chip(c.status, c.status === 'fix' ? `${c.fixes} to fix` : c.status === 'improve' ? `${c.improves} to improve` : undefined)))));
        const filter = el('select', { 'aria-label': 'Show', onchange: () => draw() }, el('option', { value: '', text: 'All findings' }), el('option', { value: ':fix', text: 'Must fix' }), el('option', { value: ':improve', text: 'Improve' }), a.categories.map((c) => el('option', { value: c.id, text: c.name })));
        const list = el('div', { class: 'au-runs' });
        const draw = () => list.replaceChildren(...a.checks.filter((c) => !filter.value || (filter.value.startsWith(':') ? c.level === filter.value.slice(1) : c.category === filter.value)).map((c) => el('article', { class: 'portal-card au-runcard' }, el('div', { class: 'pl-card-head' }, el('h3', { text: c.title }), chip(c.level)), el('p', { class: 'pl-meta', text: c.category_name + (c.count ? ` · ${c.count} page(s)` : '') }), c.detail ? el('p', { class: 'pl-body', text: c.detail }) : null, c.how ? el('p', { class: 'pl-meta', text: 'How to fix: ' + c.how }) : null, c.urls.length ? el('details', {}, el('summary', { text: 'Pages' }), el('ul', { class: 'sx-urls' }, c.urls.map((u) => el('li', { text: u })))) : null)));
        b.append(el('div', { class: 'pl-toolbar' }, filter), list); draw();
        b.append(section('Pages read', table([['url', 'Address'], ['status', 'Status'], ['title', 'Title'], ['words', 'Words'], ['depth', 'Clicks from home'], ['ms', 'Answer time (ms)']], a.pages.slice(0, 100))));
        b.append(section('Earlier audits', table([['created_at', 'When', when], ['site_url', 'Site'], ['trigger', 'Started by'], ['score', 'Score', (v, r) => (r.status === 'done' ? String(v) : r.status)]], d.history)));
      },
      // ---------------- Keyword Clusters ----------------
      async seoclusters(b) {
        const d = await get('/keywords');
        const manual = el('textarea', { rows: 3, placeholder: 'One keyword per line' });
        const csv = el('textarea', { rows: 3, placeholder: 'Paste a CSV (keyword, volume) from Google Keyword Planner or another tool' });
        const src = el('input', { placeholder: 'Where the list came from, e.g. Google Keyword Planner', maxlength: 80 });
        const file = el('input', { type: 'file', accept: '.csv,text/csv,text/plain', 'aria-label': 'Upload CSV', onchange: async () => { const f = file.files[0]; if (f) csv.value = (await f.text()).slice(0, 500000); } });
        b.append(el('details', { class: 'pl-newwrap', open: !d.plan }, el('summary', { text: 'Add keywords' }), el('div', { class: 'portal-panel sx-form-grid' }, el('label', {}, 'Your own keywords', manual), el('label', {}, 'Keyword list (CSV)', csv, file), el('label', {}, 'Source', src),
          el('p', { class: 'pl-meta', text: 'Volumes are stored exactly as your source gives them and always show the source. Super Pro never invents search volumes.' }),
          el('div', { class: 'pl-actions' }, el('button', { type: 'button', class: 'portal-button', text: 'Add keywords', onclick: (e) => busy(e.target, async () => { const r = await post('/keywords/inputs', { manual: manual.value.split('\n').map((x) => x.trim()).filter(Boolean), csv: csv.value, source_name: src.value.trim() || 'Uploaded list' }); say(`${r.added} keyword(s) added, ${r.with_volume} with a volume.`); manual.value = ''; csv.value = ''; }) })))));
        b.append(el('div', { class: 'pl-actions' }, el('button', { type: 'button', class: 'portal-button primary', text: d.plan ? 'Rebuild clusters' : 'Build clusters', onclick: (e) => busy(e.target, async () => { await post('/keywords/plan', {}); say('Clusters updated.'); await render('seoclusters'); }) })));
        const p = d.plan;
        if (!p) { b.append(empty('No clusters yet. They use your services and areas, your pages (from the last audit), Search Console and any list you add.')); return; }
        const s = p.summary;
        b.append(el('p', { class: 'pl-meta', text: `${s.keywords} keywords in ${s.clusters} clusters · ${s.measured_keywords} measured in Search Console · ${s.with_volume} with an uploaded volume · ${s.pages_used} page(s) from the audit · ${when(p.created_at)}` }), el('p', { class: 'sx-source', text: p.note }));
        b.append(section('Priorities (Super Pro estimates)', table([['primary', 'Topic'], ['score', 'Priority'], ['action', 'Action', (v) => (v === 'create' ? 'Create a page' : 'Improve the page')], ['reasons', 'Why', (v) => v.join('; ')]], p.priorities.slice(0, 15))));
        if (p.pillars.length) b.append(section('Pillar pages', el('ul', { class: 'sx-list' }, p.pillars.map((x) => el('li', {}, el('b', { text: x.title }), el('span', { class: 'pl-body', text: x.recommendation }), x.supporting.length ? el('small', { class: 'pl-meta', text: `${x.supporting.length} supporting cluster(s)` }) : null)))));
        if (p.gaps.length) b.append(section('Content gaps', table([['primary', 'Topic'], ['intent', 'Intent'], ['suggested_page', 'Suggested page'], ['reason', 'Why'], ['primary', '', (v, r) => el('button', { type: 'button', class: 'portal-button', text: 'Draft it', onclick: () => { sessionStorage.setItem('sx-studio-topic', JSON.stringify({ topic: v, kind: r.intent === 'informational' ? 'blog' : r.suggested_page.startsWith('Service-area') ? 'location' : 'service' })); go('seostudio'); } })]], p.gaps.slice(0, 20))));
        if (p.cannibalisation.length) b.append(section('Pages competing for the same search', el('ul', { class: 'sx-list' }, p.cannibalisation.map((c) => el('li', {}, el('b', { text: c.keyword }), ' ', chip(c.basis === 'measured' ? 'fix' : 'improve', c.basis === 'measured' ? 'Measured' : 'Possible'), el('span', { class: 'pl-body', text: c.pages.map((x) => x.url + (x.impressions ? ` (${x.impressions} impressions)` : '')).join(' · ') }), el('small', { class: 'pl-meta', text: c.note }))))));
        if (p.internal_links.length) b.append(section('Internal links to add', table([['from', 'On this page'], ['to', 'Link to'], ['anchor', 'Link text'], ['why', 'Why']], p.internal_links.slice(0, 30))));
        const EV = { search_console: 'Search Console', import: 'Uploaded list', site: 'Your site', business_facts: 'Business facts', manual: 'Added by you', combination: 'Suggested combination' };
        const clusterCard = (c) => {
          const m = c.keywords.map((k) => k.evidence?.search_console).filter(Boolean);
          return el('article', { class: 'portal-card pl-card' },
            el('div', { class: 'pl-card-head' }, el('h3', { text: c.primary }), el('span', { class: 'au-chip', text: c.intent_label })),
            c.secondary.length ? el('p', { class: 'pl-meta', text: 'Also: ' + c.secondary.join(', ') }) : null,
            el('p', { class: 'pl-meta', text: c.page ? 'Page: ' + c.page : 'No page yet' }),
            el('p', { class: 'pl-meta', text: 'Evidence: ' + [...new Set(c.keywords.flatMap((k) => k.sources))].map((x) => EV[x] || x).join(', ') }),
            m.length ? el('p', { class: 'pl-meta', text: `Measured: ${m.reduce((a, e) => a + e.clicks, 0)} clicks, ${m.reduce((a, e) => a + e.impressions, 0)} impressions (Search Console)` }) : null);
        };
        b.append(section('All clusters', el('div', { class: 'pl-grid' }, p.clusters.slice(0, 60).map(clusterCard))));
      },
      // ---------------- Google ----------------
      async seogoogle(b) {
        const d = await get('/google');
        b.append(el('p', { class: 'sx-source', text: d.note }));
        if (founder) b.append(el('p', { class: 'portal-note', text: 'For Super Pro’s own site, add a Google service account (GOOGLE_SERVICE_ACCOUNT_JSON in Render) and add its email as a user of the Search Console and GA4 properties. PageSpeed needs PAGESPEED_API_KEY.' }));
        const grid = el('div', { class: 'pl-grid' });
        for (const g of d.services) {
          const c = el('article', { class: 'portal-card pl-card', 'data-google': g.service },
            el('div', { class: 'pl-card-head' }, el('h3', { text: g.name }), chip(g.status === 'verified' ? 'good' : g.status === 'failing' ? 'fix' : g.status === 'connected_unverified' ? 'improve' : 'setup', ({ verified: 'Verified', failing: 'Failing', connected_unverified: 'Connected, not verified', not_connected: 'Not connected' })[g.status])),
            el('ul', { class: 'sx-urls' }, g.actions.map((x) => el('li', { text: x }))),
            el('p', { class: 'pl-meta', text: g.quota }),
            g.linked ? el('p', { class: 'pl-meta', text: `Linked: ${g.linked.label}` }) : null,
            g.last_check ? el('p', { class: 'pl-meta', 'data-tone': g.last_check.ok ? null : 'bad', text: `Last live check ${when(g.last_check.at)}: ${g.last_check.detail}` }) : null,
            !g.ready ? el('p', { class: 'pl-meta', text: 'Needs a Google Ads developer token on this deployment.' }) : null);
          const acts = el('div', { class: 'pl-actions' });
          if (!founder && g.connection === 'not_connected' && g.service !== 'pagespeed') acts.append(el('a', { class: 'portal-button primary', href: '#b08/connections', text: g.service === 'business_profile' ? 'Connect Google Business Profile' : 'Connect Google' }));
          acts.append(el('button', { type: 'button', class: 'portal-button', text: g.service === 'pagespeed' ? 'Measure now' : 'Check connection', onclick: (e) => busy(e.target, async () => { const r = await post(`/google/${g.service}/verify`, {}); say(r.detail); await render('seogoogle'); }) }));
          if (!['pagespeed'].includes(g.service)) acts.append(el('button', { type: 'button', class: 'portal-button', text: g.linked ? 'Change' : 'Choose ' + (g.service === 'search_console' ? 'property' : g.service === 'analytics' ? 'GA4 property' : g.service === 'business_profile' ? 'location' : 'account'), onclick: (e) => busy(e.target, async () => {
            const r = await get(`/google/${g.service}/resources`); c.querySelector('.pl-inline')?.remove();
            const sel = el('select', { 'aria-label': 'Choose' }, r.resources.map((x) => el('option', { value: x.resource, text: x.label, disabled: x.usable ? null : true })));
            const f = el('div', { class: 'pl-inline pl-actions' }, sel, el('button', { type: 'button', class: 'portal-button primary', text: 'Link', onclick: (ev) => busy(ev.target, async () => { await post(`/google/${g.service}/link`, { resource: sel.value, label: sel.selectedOptions[0]?.textContent }, 'PUT'); say('Linked.'); await render('seogoogle'); }) }));
            c.append(r.resources.length ? f : el('p', { class: 'pl-inline pl-meta', text: 'Google returned nothing to link for this account.' }));
          }) }));
          c.append(acts); grid.append(c);
        }
        b.append(grid, el('div', { class: 'pl-actions' }, el('button', { type: 'button', class: 'portal-button primary', text: 'Sync Google data now', onclick: (e) => busy(e.target, async () => { const r = await post('/google/sync', {}); const parts = Object.entries(r.results); say(parts.length ? parts.map(([k, v]) => `${k.replace(/_/g, ' ')}: ${v.ok ? (v.rows ?? v.reviews ?? 'done') + (v.rows !== undefined ? ' rows' : v.reviews !== undefined ? ' reviews' : '') : 'failed (' + v.error + ')'}`).join(' · ') : 'Nothing is linked yet: choose a property first.', parts.some(([, v]) => !v.ok) || !parts.length); }) })));
        const sm = el('input', { type: 'url', placeholder: 'https://your-site/sitemap.xml', 'aria-label': 'Sitemap address' });
        b.append(section('Submit a sitemap to Google', el('p', { class: 'pl-meta', text: 'Submitting asks Google to read the sitemap. Google decides when and whether to crawl and index the pages. This needs approval.' }), el('div', { class: 'pl-actions' }, sm, el('button', { type: 'button', class: 'portal-button', text: 'Send for approval', onclick: (e) => busy(e.target, async () => { await post('/google/sitemap', { sitemap_url: sm.value }); say('Sent for approval. It is submitted once approved.'); }) }))));
      },
      // ---------------- Content Studio ----------------
      async seostudio(b) {
        const [d, audit, sites] = await Promise.all([get('/studio'), get('/audit'), founder ? Promise.resolve({ sites: [] }) : get('/sites')]);
        let pre = null; try { pre = JSON.parse(sessionStorage.getItem('sx-studio-topic') || 'null'); sessionStorage.removeItem('sx-studio-topic'); } catch { /* storage blocked */ }
        const kind = el('select', { 'aria-label': 'What to write' }, Object.entries(d.kinds).map(([k, v]) => el('option', { value: k, text: v, selected: pre?.kind === k })));
        const topic = el('input', { placeholder: 'Topic, service or area', 'aria-label': 'Topic', maxlength: 160, value: pre?.topic || '' });
        const page = el('select', { 'aria-label': 'Page (for alt text, meta and refresh)' }, el('option', { value: '', text: 'No page' }), (audit.audit?.pages || []).filter((p) => p.status === 200).map((p) => el('option', { value: p.url, text: p.title || p.url })));
        const out = el('div');
        b.append(el('form', { class: 'portal-panel sx-form-grid', onsubmit: (e) => { e.preventDefault(); busy(e.submitter, async () => { const r = await post('/studio', { kind: kind.value, ...(topic.value ? { topic: topic.value } : {}), ...(page.value ? { page_url: page.value } : {}) }); show(r.draft, out); say(r.draft.method === 'ai' ? 'Draft written with AI. Check the claims listed.' : 'Draft written from your business facts (no AI provider connected). Replace the [placeholders] with your own words.'); }); } },
          el('label', {}, 'What to write', kind), el('label', {}, 'Topic', topic), el('label', {}, 'Page', page), el('div', { class: 'pl-actions' }, el('button', { type: 'submit', class: 'portal-button primary', text: 'Write draft' }))), out);
        function show(dr, target) {
          target.replaceChildren(el('article', { class: 'portal-panel sx-draft' },
            el('div', { class: 'pl-card-head' }, el('h3', { text: dr.title || dr.kind_label }), el('span', { class: 'au-chip', text: dr.method === 'ai' ? 'AI draft' : dr.method === 'rules' ? 'From your data' : 'Template from your facts' })),
            dr.note ? el('p', { class: 'pl-meta', text: dr.note }) : null,
            dr.meta_title ? el('p', {}, el('b', { text: 'Meta title: ' }), dr.meta_title) : null,
            dr.meta_description ? el('p', {}, el('b', { text: 'Meta description: ' }), dr.meta_description) : null,
            dr.claims?.length ? el('div', { class: 'sx-claims' }, el('h4', { text: 'Claims to check before publishing' }), el('ul', {}, dr.claims.map((c) => el('li', {}, chip(c.level === 'blocked' ? 'fix' : c.level === 'verified' ? 'good' : 'improve', c.level === 'blocked' ? 'Removed' : c.level === 'verified' ? 'Verified' : 'Check'), ` ${c.text} — ${c.reason}`)))) : null,
            (dr.blocks || []).length ? el('div', { class: 'sx-blocks' }, dr.blocks.map((bl) => el('div', { class: 'sx-block' }, el('small', { class: 'pl-meta', text: bl.type }), bl.heading ? el('h4', { text: bl.heading }) : null, bl.text ? el('p', { class: 'pl-body', text: bl.text }) : null, bl.items ? el('ul', {}, bl.items.map((i) => el('li', { text: typeof i === 'string' ? i : `${i.q} — ${i.a}` }))) : null))) : null,
            dr.alt ? table([['src', 'Image'], ['alt', 'Suggested alt text']], dr.alt, 'Every image already has alt text.') : null,
            dr.suggestions ? el('ul', { class: 'sx-list' }, dr.suggestions.map((x) => el('li', { text: x }))) : null,
            dr.links ? table([['from', 'On this page'], ['to', 'Link to'], ['anchor', 'Link text']], dr.links, 'Build keyword clusters first.') : null,
            dr.schema?.length ? el('details', {}, el('summary', { text: 'Schema markup (JSON-LD)' }), el('pre', { class: 'sx-pre', text: JSON.stringify(dr.schema, null, 2) })) : null,
            !founder && dr.blocks?.length && sites.sites?.length ? (() => { const s = el('select', { 'aria-label': 'Site' }, sites.sites.map((x) => el('option', { value: x.id, text: x.name }))); const sl = el('input', { placeholder: 'page-address', 'aria-label': 'Page address', value: dr.slug || '' }); return el('div', { class: 'pl-actions' }, s, sl, el('button', { type: 'button', class: 'portal-button primary', text: 'Create page from this draft', onclick: (e) => busy(e.target, async () => { await post(`/sites/${s.value}/pages`, { title: dr.title, slug: sl.value, template: ['location', 'service', 'landing', 'industry'].includes(dr.kind) ? (dr.kind === 'location' ? 'location' : 'service') : dr.kind === 'blog' ? 'article' : 'service', from_draft: dr.id }); say('Page created as a draft in the Website Builder.'); go('seobuilder'); }) })); })() : null));
        }
        b.append(section('Saved drafts', d.drafts.length ? el('ul', { class: 'sx-list' }, d.drafts.map((x) => el('li', {}, el('button', { type: 'button', class: 'portal-button', text: 'Open', onclick: () => { show({ ...x.draft, id: x.id }, out); out.scrollIntoView({ block: 'start' }); } }), ` ${d.kinds[x.kind]}: ${x.topic || ''} · ${x.status} · ${when(x.created_at)} `, x.status !== 'archived' ? el('button', { type: 'button', class: 'portal-button', text: 'Archive', onclick: (e) => busy(e.target, async () => { await post(`/studio/${x.id}`, { status: 'archived' }, 'PATCH'); await render('seostudio'); }) }) : null))) : empty('No drafts yet.')));
      },
      // ---------------- Website Builder ----------------
      async seobuilder(b, openPage = null) {
        const d = await get('/sites');
        const name = el('input', { placeholder: 'Site name', 'aria-label': 'Site name', maxlength: 120 }), sl = el('input', { placeholder: 'site-address', 'aria-label': 'Site address', maxlength: 60 }), colour = el('input', { type: 'color', value: '#1f4e79', 'aria-label': 'Brand colour' });
        b.append(el('details', { class: 'pl-newwrap', open: !d.sites.length }, el('summary', { text: 'Create a site' }), el('form', { class: 'portal-panel sx-form-grid', onsubmit: (e) => { e.preventDefault(); busy(e.submitter, async () => { await post('/sites', { name: name.value.trim(), slug: sl.value.trim(), brand: { primary_color: colour.value } }); say('Site created. Add a page called "home" first.'); await render('seobuilder'); }); } }, el('label', {}, 'Name', name), el('label', {}, 'Address (letters, numbers, dashes)', sl), el('label', {}, 'Brand colour', colour), el('div', { class: 'pl-actions' }, el('button', { type: 'submit', class: 'portal-button primary', text: 'Create site' })))));
        const editor = el('div', { 'data-editor': '' });
        for (const s of d.sites) {
          const t = el('input', { placeholder: 'Page title', 'aria-label': 'Page title', maxlength: 160 }), ps = el('input', { placeholder: 'page-address (home for the front page)', 'aria-label': 'Page address', maxlength: 60 }), tpl = el('select', { 'aria-label': 'Template' }, Object.entries(d.templates).map(([k, v]) => el('option', { value: k, text: v })));
          b.append(section(s.name, el('p', { class: 'pl-meta' }, 'Live address: ', el('a', { href: s.url, target: '_blank', rel: 'noopener', text: s.url })),
            table([['title', 'Page'], ['slug', 'Address'], ['status', 'Status', (v, r) => chip(r.published_version ? 'good' : v === 'scheduled' ? 'improve' : 'setup', r.published_version ? `Live (v${r.published_version})${r.draft_version > r.published_version ? ' · newer draft' : ''}` : v === 'scheduled' ? 'Scheduled' : 'Draft')], ['updated_at', 'Changed', when], ['id', '', (id) => el('button', { type: 'button', class: 'portal-button', text: 'Edit', onclick: () => edit(id) })]], s.pages, 'No pages yet.'),
            el('form', { class: 'pl-actions', onsubmit: (e) => { e.preventDefault(); busy(e.submitter, async () => { const r = await post(`/sites/${s.id}/pages`, { title: t.value.trim(), slug: ps.value.trim(), template: tpl.value }); say('Page created as a draft.'); await render('seobuilder', r.page.id); }); } }, t, ps, tpl, el('button', { type: 'submit', class: 'portal-button', text: 'Add page' }))));
        }
        b.append(editor);
        if (openPage) edit(openPage);
        async function edit(id) {
          const { page: p, publishing } = await get(`/pages/${id}`);
          const c = structuredClone(p.draft);
          const f = { title: el('input', { value: c.title, maxlength: 160, 'aria-label': 'Title' }), slug: el('input', { value: c.slug || p.slug, maxlength: 60, 'aria-label': 'Address' }), meta_title: el('input', { value: c.meta_title || '', maxlength: 120, 'aria-label': 'Meta title' }), meta_description: el('textarea', { rows: 2, maxlength: 320, 'aria-label': 'Meta description', value: c.meta_description || '' }) };
          const blocksBox = el('div', { class: 'sx-editblocks' });
          const field = (bl, key, label, multi = false) => { const i = multi ? el('textarea', { rows: 4, 'aria-label': label, value: bl[key] || '' }) : el('input', { 'aria-label': label, value: bl[key] || '' }); i.addEventListener('input', () => { bl[key] = i.value; }); return el('label', {}, label, i); };
          const listField = (bl, label) => { const i = el('textarea', { rows: 3, 'aria-label': label, value: (bl.items || []).join('\n') }); i.addEventListener('input', () => { bl.items = i.value.split('\n').map((x) => x.trim()).filter(Boolean); }); return el('label', {}, label + ' (one per line)', i); };
          const faqField = (bl) => { const i = el('textarea', { rows: 5, 'aria-label': 'Questions and answers', value: (bl.items || []).map((x) => `${x.q}\n${x.a}`).join('\n\n') }); i.addEventListener('input', () => { bl.items = i.value.split(/\n\s*\n/).map((x) => { const [q, ...a] = x.split('\n'); return { q: (q || '').trim(), a: a.join(' ').trim() }; }).filter((x) => x.q); }); return el('label', {}, 'Question on the first line, answer below, blank line between', i); };
          function drawBlocks() {
            blocksBox.replaceChildren(...c.blocks.map((bl, i) => el('fieldset', { class: 'sx-editblock' }, el('legend', { text: `${i + 1}. ${bl.type}` }),
              bl.type === 'hero' ? [field(bl, 'heading', 'Main heading'), field(bl, 'text', 'Intro', true), field(bl, 'cta_label', 'Button label'), field(bl, 'cta_href', 'Button link (#contact, /sites/…, https://, tel:)')] : null,
              bl.type === 'text' ? [field(bl, 'heading', 'Heading'), field(bl, 'text', 'Text (blank line between paragraphs)', true)] : null,
              ['services', 'areas'].includes(bl.type) ? [field(bl, 'heading', 'Heading'), listField(bl, 'Items')] : null,
              bl.type === 'faq' ? [field(bl, 'heading', 'Heading'), faqField(bl)] : null,
              bl.type === 'cta' ? [field(bl, 'heading', 'Heading'), field(bl, 'text', 'Text', true), field(bl, 'label', 'Button label'), field(bl, 'href', 'Button link')] : null,
              bl.type === 'contact' ? [field(bl, 'heading', 'Heading'), field(bl, 'phone', 'Phone'), field(bl, 'email', 'Email'), field(bl, 'address', 'Address (leave empty if you have no shopfront)'), (() => { const i = el('input', { type: 'checkbox' }); i.checked = Boolean(bl.form); i.addEventListener('change', () => { bl.form = i.checked; }); return el('label', { class: 'sx-check' }, i, ' Show a contact form (messages arrive in the Unified Inbox as enquiries)'); })()] : null,
              bl.type === 'image' ? [field(bl, 'src', 'Image address (https://)'), field(bl, 'alt', 'Alt text (describe the image)'), field(bl, 'width', 'Width (px)'), field(bl, 'height', 'Height (px)'), field(bl, 'caption', 'Caption')] : null,
              bl.type === 'reviews' ? [field(bl, 'heading', 'Heading'), el('p', { class: 'pl-meta', text: 'Shows real 4 and 5-star Google reviews synced from your Business Profile, with the source named. Nothing is shown if there are none.' })] : null,
              el('div', { class: 'pl-actions' }, el('button', { type: 'button', class: 'portal-button', text: 'Move up', disabled: i === 0 ? true : null, onclick: () => { [c.blocks[i - 1], c.blocks[i]] = [c.blocks[i], c.blocks[i - 1]]; drawBlocks(); } }), el('button', { type: 'button', class: 'portal-button', text: 'Move down', disabled: i === c.blocks.length - 1 ? true : null, onclick: () => { [c.blocks[i + 1], c.blocks[i]] = [c.blocks[i], c.blocks[i + 1]]; drawBlocks(); } }), el('button', { type: 'button', class: 'portal-button', text: 'Remove', onclick: () => { c.blocks.splice(i, 1); drawBlocks(); } })))));
          }
          drawBlocks();
          const addType = el('select', { 'aria-label': 'Section type' }, d.block_types.map((x) => el('option', { value: x, text: x })));
          const note = el('input', { placeholder: 'What changed (optional)', 'aria-label': 'Version note', maxlength: 200 });
          const at = el('input', { type: 'datetime-local', 'aria-label': 'Publish at (optional)' });
          const save = async () => { const content = { title: f.title.value.trim(), slug: f.slug.value.trim(), meta_title: f.meta_title.value.trim(), meta_description: f.meta_description.value.trim(), blocks: c.blocks, schema: c.schema || [] }; return post(`/pages/${p.id}`, { content, ...(note.value.trim() ? { note: note.value.trim() } : {}) }, 'PUT'); };
          const checks = el('div', { class: 'sx-checks' }, el('h4', { text: 'Checks before publishing' }), p.checks.checks.length ? el('ul', {}, p.checks.checks.map((x) => el('li', {}, chip(x.level === 'block' ? 'fix' : x.level === 'approval' ? 'improve' : x.level === 'ok' ? 'good' : 'info', ({ block: 'Must fix', warn: 'Advice', approval: 'Needs approval', ok: 'Verified' })[x.level]), ` ${x.text}`))) : el('p', { class: 'pl-meta', text: 'No problems found.' }));
          editor.replaceChildren(el('section', { class: 'portal-panel sx-editor', 'data-page': p.id },
            el('div', { class: 'pl-card-head' }, el('h2', { text: `Editing "${p.title}"` }), el('button', { type: 'button', class: 'portal-button', text: 'Close', onclick: () => editor.replaceChildren() })),
            el('p', { class: 'pl-meta' }, `Draft version ${p.draft_version}${p.published ? ` · live version ${p.published.version}` : ' · not live yet'} · `, el('a', { href: p.preview_url, target: '_blank', rel: 'noopener', text: 'Preview (not indexed)' }), p.published ? [' · ', el('a', { href: p.live_url, target: '_blank', rel: 'noopener', text: 'Live page' })] : null),
            el('div', { class: 'sx-form-grid' }, el('label', {}, 'Title', f.title), el('label', {}, 'Address', f.slug), el('label', {}, 'Meta title', f.meta_title), el('label', {}, 'Meta description', f.meta_description)),
            blocksBox,
            el('div', { class: 'pl-actions' }, addType, el('button', { type: 'button', class: 'portal-button', text: 'Add section', onclick: () => { c.blocks.push({ type: addType.value, ...(addType.value === 'faq' || addType.value === 'services' || addType.value === 'areas' ? { items: [] } : {}) }); drawBlocks(); } })),
            p.suggestions.length ? el('div', { class: 'sx-suggest' }, el('h4', { text: 'Design suggestions' }), el('ul', {}, p.suggestions.map((x) => el('li', { text: x })))) : null,
            checks,
            el('div', { class: 'pl-actions' }, note, el('button', { type: 'button', class: 'portal-button primary', text: 'Save version', onclick: (e) => busy(e.target, async () => { await save(); say('Saved as a new version.'); edit(p.id); }) })),
            el('div', { class: 'pl-actions' }, el('label', {}, 'Publish at ', at), el('button', { type: 'button', class: 'portal-button primary', text: 'Publish', onclick: (e) => busy(e.target, async () => { const r = await post(`/pages/${p.id}/publish`, at.value ? { publish_at: new Date(at.value).toISOString() } : {}); say(r.message, r.run.status === 'failed'); await render('seobuilder', p.id); }) })),
            el('details', {}, el('summary', { text: `Versions (${p.versions.length})` }), el('ul', { class: 'sx-list' }, p.versions.map((v) => el('li', {}, `Version ${v.version} · ${when(v.created_at)} · ${v.note || ''} `, v.version !== p.draft_version ? el('button', { type: 'button', class: 'portal-button', text: 'Roll back to this', onclick: (e) => busy(e.target, async () => { const r = await post(`/pages/${p.id}/rollback`, { version: v.version }); say(r.message); await render('seobuilder', p.id); }) }) : el('span', { class: 'pl-meta', text: '(current draft)' }))))),
            el('details', { open: publishing.length ? true : null }, el('summary', { text: 'Publishing history' }), table([['created_at', 'Requested', when], ['status', 'Result', (v) => String(v).replace(/_/g, ' ')], ['level', 'Level'], ['result', 'Detail', (v, r) => r.error || v?.summary || (r.status === 'awaiting_approval' ? 'Waiting in Approvals' : '')]], publishing, 'Not published yet.'))));
          editor.scrollIntoView({ block: 'start' });
        }
      },
      // ---------------- Local SEO ----------------
      async seolocal(b) {
        const d = await get('/local');
        const AREA = { nap: 'Contact details', profile: 'Google Business Profile', hours: 'Opening hours', areas: 'Service areas', schema: 'Local structured data', reviews: 'Reviews', photos: 'Photos' };
        b.append(section('Checks', el('ul', { class: 'sx-list' }, d.checks.map((c) => el('li', {}, chip(c.level), ` ${AREA[c.area] || c.area}: ${c.title}`, c.detail ? el('span', { class: 'pl-body', text: c.detail }) : null, c.how ? el('small', { class: 'pl-meta', text: c.how }) : null)))));
        if (d.gbp) b.append(section('Google Business Profile', el('p', {}, el('b', { text: d.gbp.title }), ` · ${d.gbp.primary_category} · ${d.gbp.address || 'service-area business'} · ${d.gbp.phone}`), source(`Google Business Profile, synced ${when(d.gbp_fetched_at)}`), d.performance && !d.performance.error ? table([['k', 'Metric'], ['v', 'Last 28 days']], Object.entries(d.performance).map(([k, v]) => ({ k: k.replace(/_/g, ' ').toLowerCase(), v: num(v) }))) : null));
        b.append(section('Reviews', d.reviews.length ? el('div', { class: 'au-runs' }, d.reviews.map((r) => {
          const c = el('article', { class: 'portal-card au-runcard', 'data-review': r.review_id }, el('div', { class: 'pl-card-head' }, el('h3', { text: `${r.reviewer} · ${r.rating ?? '?'} star(s)` }), chip(r.reply ? 'good' : r.reply_status === 'awaiting_approval' ? 'improve' : 'setup', r.reply ? 'Replied' : r.reply_status === 'awaiting_approval' ? 'Reply waiting for approval' : 'No reply')), el('p', { class: 'pl-body', text: r.comment || '(No comment)' }), r.reply ? el('p', { class: 'pl-meta', text: 'Your reply: ' + r.reply }) : null);
          if (!r.reply) { const t = el('textarea', { rows: 3, 'aria-label': 'Reply', value: r.reply_draft || '' }); c.append(t, el('div', { class: 'pl-actions' }, el('button', { type: 'button', class: 'portal-button', text: 'Draft a reply', onclick: (e) => busy(e.target, async () => { const x = await post(`/local/reviews/${encodeURIComponent(r.review_id)}/draft`, {}); t.value = x.reply_draft; }) }), el('button', { type: 'button', class: 'portal-button primary', text: 'Send for approval', onclick: (e) => busy(e.target, async () => { const x = await post(`/local/reviews/${encodeURIComponent(r.review_id)}/reply`, { comment: t.value }); say(x.message); await render('seolocal'); }) }))); }
          return c;
        })) : empty('No reviews yet. Connect Google Business Profile and sync. Super Pro never writes or buys reviews.')));
        b.append(section('Service-area and location pages', table([['area', 'Area'], ['type', 'Page type', (v) => (v === 'location' ? 'Location (you have an address here)' : 'Service area (you travel here)')], ['exists', 'Page exists', (v) => (v ? 'Yes' : 'No')], ['note', 'Note'], ['area', '', (v, r) => (r.exists ? '' : el('button', { type: 'button', class: 'portal-button', text: 'Draft page', onclick: () => { sessionStorage.setItem('sx-studio-topic', JSON.stringify({ topic: v, kind: 'location' })); go('seostudio'); } }))]], d.location_pages, 'Add the areas you serve in Business facts.')));
      },
      // ---------------- Analytics ----------------
      async seoanalytics(b) {
        const days = el('select', { 'aria-label': 'Period', onchange: () => load() }, [[7, 'Last 7 days'], [28, 'Last 28 days'], [90, 'Last 90 days']].map(([v, t]) => el('option', { value: v, text: t, selected: v === 28 })));
        const out = el('div'); b.append(el('div', { class: 'pl-toolbar' }, days), out);
        async function load() {
          const d = await get('/dashboard?days=' + days.value), m = d.measured;
          const stat = (label, value, prev) => el('div', { class: 'pl-stage' }, el('b', { text: value }), el('span', { text: label }), prev !== undefined ? el('small', { text: prev }) : null);
          const sc = m.search_console;
          out.replaceChildren(
            el('h2', { class: 'au-h', text: 'Measured' }),
            section('Search (Google Search Console)', sc ? [el('div', { class: 'au-stats' }, stat('Clicks', num(sc.clicks), sc.previous ? `previous: ${num(sc.previous.clicks)}` : undefined), stat('Impressions', num(sc.impressions), sc.previous ? `previous: ${num(sc.previous.impressions)}` : undefined), stat('CTR', pct(sc.ctr), sc.previous ? `previous: ${pct(sc.previous.ctr)}` : undefined), stat('Average position', num(sc.position, 1), sc.previous ? `previous: ${num(sc.previous.position, 1)}` : undefined)), source(sc.source + ` · ${d.period.start} to ${d.period.end} · Google's data is usually 2 to 3 days behind`), el('h3', { text: 'Top pages' }), table([['page', 'Page'], ['clicks', 'Clicks', (v) => num(v)], ['impressions', 'Impressions', (v) => num(v)], ['position', 'Position', (v) => num(v, 1)]], sc.top_pages), el('h3', { text: 'Top searches' }), table([['query', 'Search'], ['clicks', 'Clicks', (v) => num(v)], ['impressions', 'Impressions', (v) => num(v)], ['position', 'Position', (v) => num(v, 1)]], sc.top_queries)] : empty('Not measured: connect and link Search Console, then sync.')),
            section('Landing pages and conversions (Google Analytics 4)', m.analytics ? [el('div', { class: 'au-stats' }, stat('Organic sessions', num(m.analytics.organic_sessions)), stat('Key events', num(m.analytics.organic_key_events)), stat('Revenue', money(m.analytics.organic_revenue, m.analytics.currency))), source(m.analytics.source), table([['landing_page', 'Landing page'], ['sessions', 'Sessions', (v) => num(v)], ['key_events', 'Key events', (v) => num(v)], ['revenue', 'Revenue', (v) => money(v, m.analytics.currency)]], m.analytics.landing_pages)] : empty('Not measured: connect and link a GA4 property, then sync.')),
            !founder ? section('Leads and revenue (your Super Pro records)', m.leads ? [el('div', { class: 'au-stats' }, stat('Website enquiries', num(m.leads.website_enquiries)), stat('Qualified (quoted)', num(m.leads.qualified)), stat('Paid revenue attributed', money((m.revenue_attribution?.paid_cents || 0) / 100))), source(m.leads.source), source(m.revenue_attribution.source)] : empty('Not available.')) : null,
            section('Technical errors', m.technical ? [el('div', { class: 'au-stats' }, stat('Audit score', `${m.technical.score}/100`), stat('To fix', num(m.technical.fixes)), stat('To improve', num(m.technical.improvements))), source(`${m.technical.source}, ${when(m.technical.audited_at)}`)] : empty('Run a technical audit.')),
            section('Core Web Vitals (PageSpeed Insights)', m.core_web_vitals ? table([['strategy', 'Device'], ['field', 'Real users (LCP / CLS / INP)', (v) => (v ? `${(v.lcp_ms / 1000).toFixed(1)} s / ${v.cls ?? '—'} / ${v.inp_ms ?? '—'} ms` : 'Not enough Chrome data')], ['lab', 'Lab test (LCP / CLS / score)', (v) => `${v.lcp_ms ? (v.lcp_ms / 1000).toFixed(1) + ' s' : '—'} / ${v.cls ?? '—'} / ${v.performance_score ?? '—'}`], ['fetched_at', 'Measured', when]], m.core_web_vitals) : empty('Not measured: run PageSpeed in Google.')),
            el('h2', { class: 'au-h', text: 'Estimates' }),
            section('Opportunities (Super Pro estimates, not measurements)', d.estimates ? [table([['primary', 'Topic'], ['score', 'Priority'], ['reasons', 'Reasons', (v) => v.join('; ')]], d.estimates.priorities), source(d.estimates.source)] : empty('Build keyword clusters to see estimated opportunities.')));
        }
        await load();
      },
      // ---------------- Reports ----------------
      async seoreports(b, openReport = null) {
        const d = await get('/reports');
        const view = el('div');
        b.append(el('div', { class: 'pl-actions' }, ['daily', 'weekly', 'monthly'].map((k) => el('button', { type: 'button', class: 'portal-button' + (k === 'monthly' ? ' primary' : ''), text: `Create ${k} report`, onclick: (e) => busy(e.target, async () => { const r = await post('/reports', { kind: k }); say('Report created.'); await render('seoreports', r.report); }) })), el('button', { type: 'button', class: 'portal-button', text: 'Print', onclick: () => window.print() })),
          section('Reports', table([['created_at', 'Created', when], ['kind', 'Type'], ['period_start', 'Period', (v, r) => `${v} to ${r.period_end}`], ['id', '', (id) => el('button', { type: 'button', class: 'portal-button', text: 'Open', onclick: async () => show((await get('/reports/' + id)).report) })]], d.reports, 'No reports yet.')), view);
        function show(r) {
          const m = r.measured, sc = m.search_console;
          view.replaceChildren(el('article', { class: 'portal-panel sx-report' }, el('h2', { text: `${r.kind[0].toUpperCase() + r.kind.slice(1)} SEO report · ${r.period.start} to ${r.period.end}` }),
            el('h3', { text: 'Measured' }),
            el('ul', { class: 'sx-list' }, el('li', { text: sc ? `Search Console: ${num(sc.clicks)} clicks, ${num(sc.impressions)} impressions, CTR ${pct(sc.ctr)}, average position ${num(sc.position, 1)}.` : 'Search Console: not connected.' }), el('li', { text: m.analytics ? `Analytics 4 (organic): ${num(m.analytics.organic_sessions)} sessions, ${num(m.analytics.organic_key_events)} key events.` : 'Analytics 4: not connected.' }), m.leads ? el('li', { text: `Website enquiries: ${m.leads.website_enquiries} (${m.leads.qualified} quoted).` }) : null, r.technical ? el('li', { text: `Technical audit: ${r.technical.score}/100, ${r.technical.counts.fix} to fix.${r.technical.new_issues.length ? ' New: ' + r.technical.new_issues.join('; ') + '.' : ''}${r.technical.fixed.length ? ' Fixed: ' + r.technical.fixed.join('; ') + '.' : ''}` }) : el('li', { text: 'Technical audit: not run.' })),
            r.clusters ? [el('h3', { text: 'Clusters and gaps' }), el('ul', { class: 'sx-list' }, r.clusters.gaps.map((g) => el('li', { text: `${g.primary}: ${g.suggested_page}` })))] : null,
            r.freshness?.length ? [el('h3', { text: 'Pages to refresh' }), el('ul', { class: 'sx-list' }, r.freshness.map((x) => el('li', { text: `${x.title} (${x.url}): ${x.note}` })))] : null,
            el('h3', { text: 'Recommendations' }), el('ul', { class: 'sx-list' }, r.recommendations.map((x) => el('li', { text: x }))),
            el('p', { class: 'sx-source', text: r.note })));
          view.scrollIntoView({ block: 'start' });
        }
        if (openReport) show(openReport);
      }
    };
    return { render };
  }

  // ---------------- workspace wiring ----------------
  const instances = {};
  function view(id) {
    let s = document.getElementById(id + '-view');
    if (!s) { s = el('section', { class: 'view', id: id + '-view', hidden: true }); (document.querySelector('.content-wrap') || document.body).append(s); }
    if (!s.dataset.sxReady) { s.dataset.sxReady = '1'; s.replaceChildren(el('div', { class: 'page-heading' }, el('div', {}, el('h1', { text: VIEWS[id][0] }), el('p', { text: VIEWS[id][1] })))); }
    return s;
  }
  if (document.getElementById('workspace') || document.querySelector('.content-wrap')) {
    for (const id of Object.keys(VIEWS)) view(id);
    window.addEventListener('gds:viewchange', (e) => { const id = e.detail?.view; if (!VIEWS[id]) return; const s = view(id); (instances[id] ||= Seo(s, '/api/saas/seo')).render(id); });
  }
  window.SuperProSeo = { mount: (host, base, api) => Seo(host, base, api, { founder: true }), VIEWS };
})();
