/* Shared, permission-filtered presentation. Authorisation remains on the server. */
(() => {
  const make = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text) e.textContent = text; return e; };
  const media = matchMedia('(max-width: 1024px)');
  const read = (key) => { try { return localStorage.getItem(key); } catch { return null; } };
  const write = (key, value) => { try { localStorage.setItem(key, value); } catch { /* preferences are optional */ } };
  const dirty = new Map();
  const values = (form) => JSON.stringify([...form.elements].filter(e => e.name && !['password', 'hidden', 'submit', 'button'].includes(e.type)).map(e => [e.name, e.type === 'file' ? [...e.files].map(f => [f.name, f.size, f.lastModified]) : ['checkbox', 'radio'].includes(e.type) ? e.checked : e.value]));
  document.addEventListener('focusin', e => { const f = e.target.form; if (f && !dirty.has(f)) dirty.set(f, values(f)); });
  document.addEventListener('reset', e => dirty.delete(e.target));
  document.addEventListener('superpro:form-saved', e => { if (e.target.tagName === 'FORM') dirty.delete(e.target); });
  // Save acknowledgement from the real form lifecycle: requests that a submit starts (within a short window) belong to
  // it. Only if every one of them succeeds do the submitted values become the new baseline; any failure keeps the
  // warning, and edits made after submitting still count. Values stay in memory only.
  let pending = null;
  document.addEventListener('submit', e => {
    const form = e.target; if (form?.tagName !== 'FORM') return;
    const job = { form, snapshot: values(form), open: 0, failed: false, used: false };
    pending = job; setTimeout(() => { if (pending === job) pending = null; settle(job); }, 1500);
  }, true);
  const settle = (job) => { if (job.open || pending === job || !job.used || job.failed || !dirty.has(job.form)) return; dirty.set(job.form, job.snapshot); };
  const nativeFetch = window.fetch?.bind(window);
  if (nativeFetch) window.fetch = function (input, init) {
    const job = pending, method = String(init?.method || input?.method || 'GET').toUpperCase();
    const p = nativeFetch(input, init);
    if (!job || method === 'GET' || method === 'HEAD') return p;
    job.open += 1; job.used = true;
    p.then(r => { if (!r.ok) job.failed = true; }, () => { job.failed = true; }).finally(() => { job.open -= 1; settle(job); });
    return p;
  };
  const hasEdits = () => { for (const [f, baseline] of dirty) { if (!f.isConnected) dirty.delete(f); else if (f.closest('.view:not([hidden]),#console-content,dialog[open]') && values(f) !== baseline) return true; } return false; };
  const canLeave = () => !hasEdits() || confirm('Leave this page? Changes you have not saved may be lost.');
  window.addEventListener('beforeunload', e => { if (hasEdits()) { e.preventDefault(); e.returnValue = ''; } });

  class Navigation {
    constructor({ rail, toggle, triggerHost, key, background = [], onSelect }) {
      Object.assign(this, { rail, toggle, key, background, onSelect });
      this.groups = []; this.active = ''; this.open = ''; this.drawer = false;
      document.body.dataset.navigation = 'nested';
      rail.classList.add('nested-rail'); rail.id ||= 'business-navigation';
      this.nav = rail.querySelector('nav') || rail.appendChild(make('nav'));
      this.nav.setAttribute('aria-label', 'Pages');
      this.scrim = make('button', 'navigation-scrim'); this.scrim.type = 'button'; this.scrim.setAttribute('aria-label', 'Close navigation'); this.scrim.hidden = true; document.body.append(this.scrim);
      this.trigger = make('button', 'navigation-mobile-trigger', '☰ Menu'); this.trigger.type = 'button'; this.trigger.setAttribute('aria-controls', rail.id); this.trigger.setAttribute('aria-expanded', 'false'); triggerHost.prepend(this.trigger);
      toggle.setAttribute('aria-label', 'Collapse navigation'); toggle.setAttribute('aria-controls', this.nav.id ||= rail.id + '-pages');
      toggle.onclick = () => media.matches ? this.setDrawer(false) : this.setCollapsed(!this.collapsed);
      this.trigger.onclick = () => this.setDrawer(!this.drawer);
      this.scrim.onclick = () => this.setDrawer(false);
      this.nav.addEventListener('click', e => {
        const b = e.target.closest('[data-nav-group]');
        if (b) { this.open = this.open === b.dataset.navGroup ? '' : b.dataset.navGroup; this.paint(); return; }
        const a = e.target.closest('a[data-nav-page]'); if (!a || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey || e.button) return;
        if (!canLeave()) { e.preventDefault(); return; }
        this.onSelect?.(a.dataset.navPage); if (media.matches) this.setDrawer(false, false);
      });
      this.rail.addEventListener('keydown', e => {
        if (e.key === 'Escape') { e.preventDefault(); if (this.drawer) this.setDrawer(false); else if (this.collapsed) { const id = this.open; this.open = ''; this.paint(); this.nav.querySelector(`[data-nav-group="${CSS.escape(id)}"]`)?.focus(); } }
        if (e.key === 'Tab' && this.drawer) { const list = [...rail.querySelectorAll('a[href],button,select')].filter(x => !x.hidden && !x.disabled && x.getClientRects().length); const first = list[0], last = list.at(-1); if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); } else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); } }
      });
      document.addEventListener('click', e => { if (this.collapsed && !rail.contains(e.target)) { this.open = ''; this.paint(); } });
      this.onMedia = () => { if (this.drawer) this.setDrawer(false); this.paint(); }; media.addEventListener('change', this.onMedia);
      this.setCollapsed(read(key) === 'collapsed');
    }
    setCollapsed(value) { this.collapsed = !!value; this.rail.dataset.expanded = String(!value); this.rail.dataset.compact = String(value); delete this.rail.dataset.collapsed; this.toggle.setAttribute('aria-expanded', String(!value)); this.toggle.setAttribute('aria-label', value ? 'Expand navigation' : 'Collapse navigation'); this.toggle.querySelector('span:last-child')?.replaceChildren(document.createTextNode(value ? 'Expand navigation' : 'Collapse navigation')); write(this.key, value ? 'collapsed' : 'expanded'); if (value) this.open = ''; this.paint(); }
    setDrawer(value, restore = true) {
      this.drawer = !!value; this.rail.dataset.drawer = String(value); this.trigger.setAttribute('aria-expanded', String(value)); this.scrim.hidden = !value; document.body.classList.toggle('navigation-drawer-open', value);
      this.background.forEach(e => { if (e) { if (value) { e.dataset.navWasInert = String(e.inert); e.inert = true; } else { e.inert = e.dataset.navWasInert === 'true'; delete e.dataset.navWasInert; } } });
      if (value) { this.rail.setAttribute('role', 'dialog'); this.rail.setAttribute('aria-modal', 'true'); } else { this.rail.removeAttribute('role'); this.rail.removeAttribute('aria-modal'); }
      this.paint(); if (value) this.toggle.focus(); else if (restore) this.trigger.focus();
    }
    setGroups(groups) {
      this.groups = groups; this.nav.replaceChildren();
      for (const g of groups) {
        const box = make('section', 'navigation-group'), b = make('button', 'portal-main-button navigation-group-toggle'); b.type = 'button'; b.dataset.navGroup = g.id;
        if (g.attribute) b.setAttribute(g.attribute, g.id);
        const icon = make('span', 'portal-icon'); icon.setAttribute('aria-hidden', 'true'); if (g.icon) icon.append(g.icon());
        b.append(icon, make('span', 'navigation-label', g.label), make('span', 'navigation-chevron', '⌄')); b.setAttribute('aria-label', g.label);
        const children = make('div', 'navigation-children'); children.id = this.rail.id + '-' + g.id; b.setAttribute('aria-controls', children.id);
        for (const p of g.pages) { const a = make('a', 'navigation-page', p.label); a.href = '#' + p.path; a.dataset.navPage = p.id; a.setAttribute('aria-label', p.label); if (p.badge) { const badge = make('span', 'navigation-badge'); badge.dataset.badgeSource = p.badge; a.append(badge); } children.append(a); }
        box.append(b, children); this.nav.append(box);
      }
      this.setActive(this.active);
    }
    setActive(id) { this.active = id; const g = this.groups.find(g => g.pages.some(p => p.id === id)); if (g) this.open = g.id; this.paint(); }
    paint() {
      this.rail.inert = media.matches && !this.drawer;
      this.rail.querySelectorAll('.navigation-group').forEach(box => { const b = box.firstElementChild, id = b.dataset.navGroup, group = this.groups.find(g => g.id === id), open = id === this.open, active = group?.pages.some(p => p.id === this.active); b.setAttribute('aria-expanded', String(open)); b.classList.toggle('has-active', !!active); const children = b.nextElementSibling; children.hidden = !open;
        if (this.collapsed && !media.matches && open) { const r = b.getBoundingClientRect(); children.style.top = Math.max(8, Math.min(r.top, innerHeight - 220)) + 'px'; } else children.style.top = '';
        children.querySelectorAll('a').forEach(a => { if (a.dataset.navPage === this.active) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
      });
      document.body.dataset.navigationCompact = String(this.collapsed && !media.matches);
    }
    search(q) { q = String(q).trim().toLowerCase(); this.nav.querySelectorAll('.navigation-group').forEach(box => { const group = box.querySelector('[data-nav-group]'); const groupMatch = group.textContent.toLowerCase().includes(q); let hit = groupMatch; for (const a of box.querySelectorAll('a')) { a.hidden = !!q && !groupMatch && !a.textContent.toLowerCase().includes(q); if (!a.hidden) hit = true; } box.hidden = !hit; if (q && hit) { box.lastElementChild.hidden = false; group.setAttribute('aria-expanded', 'true'); } }); if (!q) this.paint(); }
  }
  window.SuperProNavigation = { Navigation, canLeave, hasEdits };
})();
