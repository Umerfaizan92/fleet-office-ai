(() => {
  let shell, rail, active = 'dashboard', contextKey = '';
  const make = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text) e.textContent = text; return e; };
  function breadcrumb(view, section = '') {
    const g = window.SuperProNav?.DOMAINS.find(d => d.items.some(i => i.view === view)), p = g?.items.find(i => i.view === view); if (!p) return;
    let b = document.getElementById('workspace-breadcrumb'); if (!b) { b = make('nav', 'navigation-breadcrumb'); b.id = 'workspace-breadcrumb'; b.setAttribute('aria-label', 'Breadcrumb'); document.querySelector('.page-context')?.prepend(b); }
    b.replaceChildren(make('span', '', g.label), make('span', 'navigation-divider', '/'), make('span', '', p.label));
    if (section) b.append(make('span', 'navigation-divider', '/'), make('span', '', section));
  }
  function rebuild() {
    const nav = window.SuperProNav, session = window.GDS_SESSION; if (!nav || !session || !window.SuperProNavigation) return;
    if (!rail) {
      document.body.classList.add('portal-workspace'); rail = make('aside', 'portal-rail'); rail.id = 'business-navigation'; rail.setAttribute('aria-label', 'Business navigation');
      const brand = make('a', 'portal-brand'); brand.href = '#b01/home'; brand.append((() => { const m = make('span', 'portal-mark'), i = document.createElement('img'); i.src = '/saas/superpro-icon.svg?v=20261031'; i.alt = ''; i.width = i.height = 40; i.style.cssText = 'display:block;width:100%;height:100%;border-radius:inherit'; m.append(i); return m; })(), make('span', 'navigation-label', 'Super Pro AI'));
      const toggle = make('button', 'portal-main-button'); toggle.type = 'button'; toggle.append(make('span', 'portal-icon', '☰'), make('span', 'navigation-label', 'Collapse navigation')); rail.append(brand, toggle);
      const context = document.getElementById('workspace-context'); if (context) rail.append(context);
      rail.append(make('nav')); document.getElementById('workspace').append(rail);
      const security = document.querySelector('#sidebar .sidebar-footer'); if (security) rail.append(security);
      shell = new window.SuperProNavigation.Navigation({ rail, toggle, triggerHost: document.querySelector('.topbar-left'), key: 'sp-nav:business:pending', background: [document.querySelector('.app-main')] });
      new MutationObserver(syncBadges).observe(document.querySelector('.workspace-nav'), { childList: true, subtree: true, characterData: true });
    }
    const key = `sp-nav:business:${session.user.id || session.user.email}:${session.organisation.id}`;
    if (contextKey !== key) { contextKey = key; shell.key = key; let compact = false; try { compact = localStorage.getItem(key) === 'collapsed'; } catch {} shell.setCollapsed(compact); }
    const allowed = new Set(nav.sequence(session.user.role));
    shell.setGroups(nav.DOMAINS.map(d => ({ id: d.id, label: d.label, attribute: 'data-domain', icon: () => { const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg'), use = document.createElementNS(svg.namespaceURI, 'use'); use.setAttribute('href', '#' + d.icon); svg.append(use); return svg; }, pages: d.items.filter(i => allowed.has(i.view)).map(i => ({ id: i.view, path: i.path, label: i.label, badge: i.badge })) })).filter(d => d.pages.length));
    shell.setActive(active); syncBadges(); breadcrumb(active);
  }
  function syncBadges() { rail?.querySelectorAll('[data-badge-source]').forEach(e => { const text = document.getElementById(e.dataset.badgeSource)?.textContent || ''; if (e.textContent !== text) e.textContent = text; }); }
  window.addEventListener('superpro:nav-ready', rebuild); window.addEventListener('superpro:access-changed', rebuild);
  window.addEventListener('gds:viewchange', e => { active = e.detail.view; shell?.setActive(active); breadcrumb(active); });
  window.addEventListener('superpro:sectionchange', e => breadcrumb(active, e.detail.label));
  fetch('/api/public/preview-status').then(r => r.json()).then(d => { if (d.isolated_preview) { document.body.dataset.isolatedPreview = 'true'; document.body.prepend(make('div', 'portal-preview-banner', 'Isolated preview · Synthetic test data only · Data may reset on restart.')); } }).catch(() => {});
})();
