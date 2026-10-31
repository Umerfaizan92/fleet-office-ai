/* Sections enhance existing DOM. Switching a section never clones or submits a form. */
(() => {
  const slug = s => String(s).trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'section';
  const stableLabel = s => String(s).replace(/\s*\(\d+ open\)\s*$/i, '');
  const key = b => b.dataset.sectionKey || b.dataset.finTab || b.dataset.grTab || b.dataset.auTab || b.dataset.svTab || b.dataset.settingsTarget || slug(stableLabel([...b.childNodes].filter(n=>!n.classList?.contains('cx-count')).map(n=>n.textContent).join('')));
  let restoring = false, scheduled = false, pendingFocus = '';
  const currentRoot = () => document.querySelector('.view:not([hidden])') || document.getElementById('console-content');
  function changed(label, value) {
    if (!restoring) { const params = new URLSearchParams(location.hash.split('?')[1] || ''); params.set('section', value); const hash = location.hash.split('?')[0] + '?' + params; if (location.hash !== hash) history.pushState(null, '', hash); }
    window.dispatchEvent(new CustomEvent('superpro:sectionchange', { detail: { label, key: value } }));
  }
  function keyboard(list) {
    if (list.dataset.sectionKeyboard) return; list.dataset.sectionKeyboard = '1';
    list.addEventListener('keydown', e => { if (e.target.getAttribute('role') !== 'tab') return; const items = [...list.querySelectorAll('[role=tab]')].filter(b => !b.disabled && !b.hidden), i = items.indexOf(e.target); let n;
      if (e.key === 'ArrowRight') n = (i + 1) % items.length; else if (e.key === 'ArrowLeft') n = (i - 1 + items.length) % items.length; else if (e.key === 'Home') n = 0; else if (e.key === 'End') n = items.length - 1;
      if (n !== undefined) { e.preventDefault(); e.stopImmediatePropagation(); items[n]?.focus(); items[n]?.click(); }
    }, true);
  }
  function install(view, panels, { host, labels, preferred, companions = {} } = {}) {
    if (panels.length < 2 || view.dataset.sectionInstalled) return;
    view.dataset.sectionInstalled = 'true';
    view._superProSectionPanels = panels;
    const nav = host || document.createElement('div'); nav.classList.add('context-section-tabs'); nav.setAttribute('role', 'tablist'); nav.setAttribute('aria-label', 'Page sections'); nav.replaceChildren();
    nav.dataset.managedSections = 'true';
    if (!host) { const heading = view.querySelector(':scope > .page-heading'); if (heading) heading.after(nav); else view.prepend(nav); }
    const containers = new Set(), buttons = [];
    panels.forEach((panel, i) => { panel.id ||= (view.id || 'page') + '-section-' + i; panel.classList.add('focus-section'); let parent = panel.parentElement;
      while (parent && parent !== view) { containers.add(parent); parent.classList.add('focus-container'); parent = parent.parentElement; }
      const b = document.createElement('button'); b.type = 'button'; b.setAttribute('role', 'tab'); b.textContent = labels?.[i] || panel.querySelector('h2,h3,summary')?.textContent.trim() || 'Section ' + (i + 1); const k = slug(stableLabel(b.textContent)); b.dataset.sectionKey = k + (buttons.some(x => x.dataset.sectionKey === k) ? '-' + i : ''); b.id = panel.id + '-tab'; b.setAttribute('aria-controls', panel.id); panel.setAttribute('role', 'tabpanel'); panel.setAttribute('aria-labelledby', b.id); panel.tabIndex = 0; buttons.push(b); nav.append(b);
    });
    let selected = Math.max(0, buttons.findIndex(b => b.textContent === preferred));
    const choose = (i, record = false) => { const available = panels.map((p, n) => !p.hidden ? n : -1).filter(n => n >= 0); if (!available.includes(i)) i = available[0]; if (i === undefined) { nav.hidden = true; return; } nav.hidden = false; selected = i;
      panels.forEach((p, n) => { p.classList.toggle('focus-inactive', n !== i); buttons[n].hidden = p.hidden; buttons[n].disabled = p.hidden; buttons[n].setAttribute('aria-selected', String(n === i)); buttons[n].tabIndex = n === i ? 0 : -1; });
      for (const [index, selector] of Object.entries(companions)) view.querySelectorAll(selector).forEach((panel, n) => { const b = buttons[Number(index)]; panel.classList.toggle('focus-inactive', Number(index) !== i); panel.id ||= `${view.id}-companion-${index}-${n}`; panel.setAttribute('role','tabpanel'); panel.setAttribute('aria-labelledby',b.id); b.setAttribute('aria-controls',panel.id); });
      containers.forEach(c => c.classList.toggle('focus-inactive', !c.contains(panels[i]))); if (record) changed(buttons[i].textContent, key(buttons[i]));
    };
    view._superProSectionRefresh = () => {
      choose(selected);
      if (!host) { const heading = view.querySelector(':scope > .page-heading'); if (heading && heading.nextElementSibling !== nav) heading.after(nav); }
    };
    buttons.forEach((b, i) => b.addEventListener('click', () => choose(i, true)));
    const reveal = target => { const i = panels.findIndex(p => p.contains(target)); if (i >= 0) choose(i, true); };
    const revealEvent = e => reveal(e.target);
    view.addEventListener('invalid', revealEvent, true); view.addEventListener('superpro:reveal-section', revealEvent);
    const observer = new MutationObserver(() => choose(selected)); panels.forEach(p => observer.observe(p, { attributes: true, attributeFilter: ['hidden'] }));
    view.addEventListener('superpro:sections-dispose', () => { observer.disconnect(); view.removeEventListener('invalid', revealEvent, true); view.removeEventListener('superpro:reveal-section', revealEvent); }, { once: true }); keyboard(nav); choose(selected); restore();
  }
  function enhanceNative(root) {
    root.querySelectorAll('[role=tablist]').forEach(list => { list.classList.add('context-section-tabs'); keyboard(list); if (list.dataset.managedSections) return; const tabs = [...list.querySelectorAll('[role=tab]')];
      tabs.forEach((b, i) => { b.dataset.sectionKey ||= key(b); b.id ||= `${root.id || 'page'}-native-tab-${b.dataset.sectionKey}-${i}`;
        if (!b.hasAttribute('aria-selected')) b.setAttribute('aria-selected', String(b.classList.contains('active') || (!tabs.some(t => t.getAttribute('aria-selected') === 'true') && i === 0))); b.tabIndex = b.getAttribute('aria-selected') === 'true' ? 0 : -1;
        let panel;
        if (b.dataset.finTab) panel = root.querySelector(`[data-fin-pane="${CSS.escape(b.dataset.finTab)}"]`);
        else if (b.dataset.grTab) panel = root.querySelector(`[data-gr-pane="${CSS.escape(b.dataset.grTab)}"]`);
        else if (b.dataset.settingsTarget) panel = document.getElementById(b.dataset.settingsTarget)?.closest('article');
        else if (list.getAttribute('aria-label') === 'Email folders') panel = root.querySelector('.portal-mail-list');
        else panel = root.querySelector('[data-au-body],[data-sx-body],[data-cx-body]') || list.nextElementSibling;
        if (panel && !panel.matches('[role=status],button,nav,[role=tablist]')) { panel.id ||= `${root.id || 'page'}-panel-${b.dataset.sectionKey}`; b.setAttribute('aria-controls', panel.id); panel.setAttribute('role', 'tabpanel'); if (b.getAttribute('aria-selected') === 'true') panel.setAttribute('aria-labelledby', b.id); }
      });
    });
  }
  function restore() {
    const root = currentRoot(); if (!root) return; const value = new URLSearchParams(location.hash.split('?')[1] || '').get('section'); if (!value) return;
    const b = [...root.querySelectorAll('[role=tab]'), ...document.querySelectorAll('#console-tabs [role=tab]')].find(b => key(b) === value && !b.disabled && !b.hidden);
    if (b && b.getAttribute('aria-selected') !== 'true') { restoring = true; b.click(); restoring = false; }
    if (b) window.dispatchEvent(new CustomEvent('superpro:sectionchange', { detail: { label: b.textContent, key: value } }));
  }
  // Data-heavy modules keep related forms, totals and record details together.
  // Give their real heading sections a top jump index without hiding dependencies.
  function indexSections(root) {
    const bodies = [...root.querySelectorAll('[data-fx-body],[data-sx-body],[data-cx-body]')];
    const ordinaryContent = root.id !== 'console-content' || root.dataset.navigationRoute === 'overview';
    if (ordinaryContent && !root.dataset.sectionInstalled && !bodies.length && !root.querySelector('[role=tablist]')) bodies.push(root);
    const retained = new Set(bodies);
    for (const nav of root.querySelectorAll('[data-section-index]')) if (!retained.has(nav.parentElement)) nav.remove();
    for (const body of bodies) {
      const panels = [...body.querySelectorAll(':scope > .portal-panel,:scope > article.panel,:scope > form.portal-panel')].filter(p => p.querySelector('h2,h3,summary'));
      const previous = body._superProIndex;
      if (previous && previous.panels.length === panels.length && panels.every((p,i)=>p===previous.panels[i])) continue;
      previous?.nav.remove();
      if (panels.length < 2) { delete body._superProIndex; continue; }
      const nav = document.createElement('nav'); nav.className = 'context-section-tabs context-section-index'; nav.dataset.sectionIndex = 'true'; nav.setAttribute('aria-label','Content sections');
      panels.forEach((panel,i) => {
        const label = panel.querySelector('h2,h3,summary').textContent.trim();
        panel.id ||= `${root.id}-content-${slug(label)}-${i}`;
        const b = document.createElement('button'); b.type='button'; b.textContent=label; b.dataset.sectionLink=panel.id; b.setAttribute('aria-controls',panel.id);
        b.onclick = () => { nav.querySelectorAll('button').forEach(t=>t.removeAttribute('aria-current')); b.setAttribute('aria-current','location'); panel.tabIndex=-1; panel.focus({preventScroll:true}); panel.scrollIntoView({block:'start',behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'}); window.dispatchEvent(new CustomEvent('superpro:sectionchange',{detail:{label,key:panel.id}})); };
        nav.append(b);
      });
      const heading = body.querySelector(':scope > .page-heading'); if (heading) heading.after(nav); else body.prepend(nav);
      body._superProIndex = {panels,nav};
    }
  }
  function refresh() {
    scheduled = false; const root = currentRoot(); if (!root) return;
    // Existing modules replace their content after a save. Rebind tabs to the new
    // panels while retaining the selected section in the current URL.
    if (root._superProSectionPanels?.some(panel => !root.contains(panel))) window.SuperProPageSections.dispose(root);
    if (root.id === 'console-content' && !root.querySelector('[role=tablist]')) { const panels = [...root.querySelectorAll(':scope > .cp-view > section.cp-section')]; if (panels.length > 1) install(root, panels, { host: document.getElementById('console-tabs') }); }
    root._superProSectionRefresh?.(); enhanceNative(root); restore(); indexSections(root);
    if (pendingFocus) { const tab = [...root.querySelectorAll('[role=tab]')].find(b => key(b) === pendingFocus); if (tab) { if (document.activeElement === document.body) tab.focus(); pendingFocus = ''; } }
  }
  const queue = () => { if (!scheduled) { scheduled = true; requestAnimationFrame(refresh); } };
  document.addEventListener('click', e => { const b = e.target.closest('[role=tab]'); if (!b || b.closest('.focus-navigation')) return; const root = currentRoot(); if (!root?.contains(b) && !b.closest('#console-tabs')) return;
    const focused = document.activeElement === b;
    queueMicrotask(() => { if (b.isConnected) b.closest('[role=tablist]')?.querySelectorAll('[role=tab]').forEach(t => { t.setAttribute('aria-selected', String(t === b)); t.tabIndex = t === b ? 0 : -1; }); else if (focused) pendingFocus = key(b); changed(b.textContent, key(b)); queue(); });
  }, true);
  function boot() { const root = document.querySelector('.content-wrap') || document.getElementById('console-content'); if (root) new MutationObserver(queue).observe(root, { childList: true, subtree: true }); queue(); const h = document.querySelector('.app-topbar,.portal-topbar'); if (h) new ResizeObserver(() => document.documentElement.style.setProperty('--navigation-header-height', h.getBoundingClientRect().height + 'px')).observe(h); }
  document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', boot) : boot();
  window.addEventListener('gds:viewchange', queue); window.addEventListener('hashchange', queue); window.addEventListener('popstate', queue);
  window.SuperProPageSections = { install, restore, refresh: queue, dispose(root) { root.dispatchEvent(new Event('superpro:sections-dispose')); delete root.dataset.sectionInstalled; delete root._superProSectionPanels; delete root._superProSectionRefresh; const host = document.getElementById('console-tabs'); if (host) { host.replaceChildren(); delete host.dataset.managedSections; } } };
})();
