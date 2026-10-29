/* Motion for the Business OS and Founder Console (Phase 03). Requires motion.js.
   - Route changes: the newly shown view slides in once.
   - Cards inside the new view enter in a short, bounded stagger (at most 8 cards, under half a second in total).
   - Live values: when a [data-live-value] element's text changes, the nearest live dot ripples once.
   Nothing here changes sizes, data, focus order or what any control does; all of it is skipped for reduced motion. */
(() => {
  const M = () => window.SPMotion;
  const visibleViews = () => [...document.querySelectorAll('main [id$="-view"], #console-content, [data-view-root]')].filter((el) => el.offsetParent !== null);
  let last = new Set();
  function enterNew() {
    if (!M()?.allowed()) { last = new Set(visibleViews()); return; }
    const now = visibleViews();
    for (const view of now) {
      if (last.has(view)) continue;
      view.classList.remove('sp-view-enter'); void view.offsetWidth; view.classList.add('sp-view-enter');
      view.addEventListener('animationend', () => view.classList.remove('sp-view-enter'), { once: true });
      const cards = [...view.querySelectorAll(':scope .panel, :scope .metric-card, :scope .sp-surface-card, :scope .row-card')].filter((c) => c.offsetParent !== null).slice(0, 8);
      cards.forEach((c, i) => c.animate?.([{ opacity: 0, transform: 'translateY(8px)' }, { opacity: 1, transform: 'none' }], { duration: 320, delay: 60 + i * 40, easing: 'cubic-bezier(.16,1,.3,1)', fill: 'backwards' }));
    }
    last = new Set(now);
  }
  addEventListener('hashchange', () => requestAnimationFrame(() => requestAnimationFrame(enterNew)));
  addEventListener('load', () => { last = new Set(visibleViews()); });
  // Live values: when any dashboard figure changes after a refresh, the Live indicator ripples once.
  let snapshot = '', pending = 0;
  const figures = () => [...document.querySelectorAll('.gx-num, .gx-figure, [data-live-value]')].map((e) => e.textContent.trim()).join('|');
  const mo = new MutationObserver(() => {
    if (pending) return;
    pending = requestAnimationFrame(() => {
      pending = 0;
      const now = figures();
      if (snapshot && now !== snapshot) document.querySelectorAll('.gx-live i, .sp-live').forEach((dot) => { dot.classList.add('sp-live'); M()?.pulse(dot); });
      snapshot = now;
    });
  });
  const start = () => { snapshot = figures(); mo.observe(document.body, { subtree: true, characterData: true, childList: true }); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
