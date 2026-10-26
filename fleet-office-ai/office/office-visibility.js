// Weekly SEO and AI-search report panel. Built with textContent so nothing from a competitor page is ever treated as HTML.
(() => {
  const h = (tag, text, cls) => { const e = document.createElement(tag); if (text !== undefined) e.textContent = text; if (cls) e.className = cls; return e; };
  const tone = { fix: 'Fix', improve: 'Improve', good: 'Good' };
  async function load() {
    const view = document.querySelector('#searchvisibility-view .panel'); if (!view) return;
    let box = document.querySelector('#vis-weekly'); if (!box) { box = h('div', undefined, 'vis-weekly'); box.id = 'vis-weekly'; view.prepend(box); }
    const d = await api('/api/admin/visibility'); box.replaceChildren();
    const head = h('div', undefined, 'vis-head'); head.append(h('h3', 'Weekly search and AI-search check'));
    const run = h('button', 'Run the check now'); run.type = 'button'; run.onclick = async () => { run.disabled = true; run.textContent = 'Checking…'; try { await api('/api/admin/visibility/run', { method: 'POST', body: '{}' }); notice('Check finished.'); } catch (e) { notice(e.message, true); } load(); };
    head.append(run); box.append(head);
    box.append(h('p', d.honest_limits, 'muted'));
    const r = d.latest;
    if (!r) { box.append(h('p', 'No report yet. The first one runs automatically, or press the button above.')); }
    else {
      const trend = r.previous_score == null ? '' : r.score === r.previous_score ? ' (no change)' : r.score > r.previous_score ? ` (up ${r.score - r.previous_score})` : ` (down ${r.previous_score - r.score})`;
      box.append(h('p', `Score ${r.score}/100${trend} · checked ${new Date(r.created_at).toLocaleString('en-AU')}`, 'vis-score'));
      box.append(h('p', r.summary + (r.summary_source === 'ai' ? '' : '')));
      if (d.history.length > 1) box.append(h('p', 'Recent scores: ' + d.history.map((x) => x.score).join(' → '), 'muted'));
      const all = [{ page: 'Whole site', findings: r.site.findings, score: null }, ...r.pages];
      for (const p of all) {
        const det = h('details'); det.append(h('summary', `${p.page}${p.score == null ? '' : ' · ' + p.score + '/100'}${p.noindex ? ' · hidden from search' : ''}`));
        const ul = h('ul'); [...p.findings].sort((a, b) => ['fix', 'improve', 'good'].indexOf(a.level) - ['fix', 'improve', 'good'].indexOf(b.level)).forEach((f) => ul.append(h('li', `${tone[f.level]}: ${f.text}`)));
        det.append(ul); if (p.findings.some((f) => f.level === 'fix')) det.open = true; box.append(det);
      }
      if (r.competitors.length) {
        box.append(h('h4', 'Competitor comparison'));
        r.competitors.forEach((c) => { const d2 = h('div', undefined, 'vis-comp'); d2.append(h('b', c.label)); if (!c.ok) d2.append(h('p', c.note || 'Could not be checked.', 'muted')); else { d2.append(h('p', `Score ${c.score}/100 · "${c.title}"`)); if (c.h1) d2.append(h('p', `Main heading: ${c.h1}`, 'muted')); if (c.prices_seen.length) d2.append(h('p', `Prices mentioned: $${c.prices_seen.join(', $')}`, 'muted')); c.where_they_are_ahead.forEach((t) => d2.append(h('p', t))); if (c.words_they_use_that_you_do_not.length) d2.append(h('p', 'Words they use that you do not: ' + c.words_they_use_that_you_do_not.join(', '), 'muted')); } box.append(d2); });
      }
    }
    const form = h('form', undefined, 'vis-add'); form.append(h('h4', 'Pages to compare against (up to 5)'));
    const ul = h('ul'); d.competitors.forEach((c) => { const li = h('li', c.label ? `${c.label} · ${c.url}` : c.url); const rm = h('button', 'Remove'); rm.type = 'button'; rm.onclick = async () => { await api(`/api/admin/visibility/competitors/${c.id}`, { method: 'DELETE' }); load(); }; li.append(' ', rm); ul.append(li); }); form.append(ul);
    const url = h('input'); url.placeholder = 'https://competitor.com/pricing'; url.type = 'url'; const label = h('input'); label.placeholder = 'Name (optional)'; const add = h('button', 'Add page'); form.append(url, label, add);
    form.onsubmit = async (e) => { e.preventDefault(); try { await api('/api/admin/visibility/competitors', { method: 'POST', body: JSON.stringify({ url: url.value, label: label.value || undefined }) }); load(); } catch (er) { notice(er.message, true); } };
    box.append(form);
  }
  document.addEventListener('click', (e) => { if (e.target.closest('.nav[data-view="searchvisibility"]')) setTimeout(() => load().catch((er) => notice(er.message, true)), 60); });
})();
