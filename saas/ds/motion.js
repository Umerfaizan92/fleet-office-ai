/* Super Pro motion engine (Phase 03). No dependencies, ~4 KB.
   Rules: motion answers a person's action or tells a story once; nothing loops forever; everything is skipped when the
   device asks for reduced motion; work stops when the page is hidden. */
(() => {
  const root = document.documentElement;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)');
  const allowed = () => !reduce.matches;
  if (allowed()) root.classList.add('sp-motion');
  reduce.addEventListener?.('change', () => root.classList.toggle('sp-motion', allowed()));

  /* Reveal once, with optional stagger inside [data-reveal-group]. */
  const revealIO = 'IntersectionObserver' in window ? new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      const el = e.target, group = el.closest('[data-reveal-group]');
      const index = group ? [...group.querySelectorAll('[data-reveal]')].indexOf(el) : 0;
      el.style.transitionDelay = allowed() ? `${Math.min(index, 6) * 70}ms` : '0ms';
      el.classList.add('is-in');
      revealIO.unobserve(el);
      if (el.matches('[data-count-to]')) countUp(el);
      el.querySelectorAll('[data-count-to]').forEach(countUp);
    }
  }, { rootMargin: '0px 0px -8% 0px', threshold: 0.12 }) : null;

  /* Numbers count up once when they appear. */
  function countUp(el) {
    if (el.dataset.counted) return; el.dataset.counted = '1';
    const target = Number(el.dataset.countTo), prefix = el.dataset.prefix || '', suffix = el.dataset.suffix || '', dp = Number(el.dataset.decimals || 0);
    const fmt = (v) => prefix + v.toLocaleString('en-AU', { minimumFractionDigits: dp, maximumFractionDigits: dp }) + suffix;
    if (!allowed() || !Number.isFinite(target)) { el.textContent = fmt(target || 0); return; }
    const start = performance.now(), dur = 900;
    const tick = (t) => { const p = Math.min(1, (t - start) / dur), eased = 1 - Math.pow(1 - p, 3); el.textContent = fmt(target * eased); if (p < 1) requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
  }

  /* Light that follows the pointer on interactive cards. */
  function lit(el) {
    let raf = 0;
    el.addEventListener('pointermove', (ev) => {
      if (raf || ev.pointerType === 'touch') return;
      raf = requestAnimationFrame(() => { raf = 0; const r = el.getBoundingClientRect(); el.style.setProperty('--mx', `${ev.clientX - r.left}px`); el.style.setProperty('--my', `${ev.clientY - r.top}px`); });
    });
  }

  /* Gentle scroll parallax: data-parallax="0.12" moves at 12% of scroll speed, only while visible. */
  const parallax = new Set();
  let scrollRaf = 0;
  function onScroll() {
    if (scrollRaf || !allowed() || !parallax.size) return;
    scrollRaf = requestAnimationFrame(() => {
      scrollRaf = 0;
      const vh = innerHeight;
      for (const el of parallax) {
        const r = el.getBoundingClientRect();
        if (r.bottom < -200 || r.top > vh + 200) continue;
        const speed = Number(el.dataset.parallax) || 0.1, offset = (r.top + r.height / 2 - vh / 2) * -speed;
        el.style.transform = `translate3d(0,${offset.toFixed(1)}px,0)`;
      }
    });
  }
  addEventListener('scroll', onScroll, { passive: true });
  addEventListener('resize', onScroll, { passive: true });

  /* Scroll-driven story: each [data-step] that reaches the middle of the screen becomes active;
     the story element gets data-active="<step id>" and fires sp:step. */
  function story(el) {
    const steps = [...el.querySelectorAll('[data-step]')];
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) if (e.isIntersecting) {
        steps.forEach((s) => s.toggleAttribute('data-current', s === e.target));
        el.dataset.active = e.target.dataset.step;
        el.dispatchEvent(new CustomEvent('sp:step', { detail: { step: e.target.dataset.step, index: steps.indexOf(e.target) } }));
      }
    }, { rootMargin: '-45% 0px -45% 0px' });
    steps.forEach((s) => io.observe(s));
  }

  function scan(scope = document) {
    scope.querySelectorAll('[data-reveal]:not(.is-in)').forEach((el) => revealIO ? revealIO.observe(el) : el.classList.add('is-in'));
    scope.querySelectorAll('.sp-card--lit:not([data-lit])').forEach((el) => { el.dataset.lit = '1'; lit(el); });
    scope.querySelectorAll('[data-parallax]').forEach((el) => parallax.add(el));
    scope.querySelectorAll('[data-story]:not([data-story-ready])').forEach((el) => { el.dataset.storyReady = '1'; story(el); });
    if (!revealIO) scope.querySelectorAll('[data-count-to]').forEach(countUp);
    onScroll();
  }

  /* One ripple on a live indicator when its value changes. */
  function pulse(el) { if (!el) return; el.classList.remove('is-updated'); void el.offsetWidth; el.classList.add('is-updated'); }

  let toastEl;
  function toast(message, ms = 3200) {
    if (!toastEl) { toastEl = document.createElement('div'); toastEl.className = 'sp-toast'; toastEl.setAttribute('role', 'status'); toastEl.setAttribute('aria-live', 'polite'); document.body.append(toastEl); }
    toastEl.textContent = message; toastEl.classList.add('is-shown');
    clearTimeout(toastEl._t); toastEl._t = setTimeout(() => toastEl.classList.remove('is-shown'), ms);
  }

  /* Enter animation for a view that just became visible (used by the Business OS and Console on route change). */
  function enter(el) {
    if (!el || !allowed() || !el.animate) return;
    el.animate([{ opacity: 0, transform: 'translateY(10px) scale(.995)', filter: 'blur(2px)' }, { opacity: 1, transform: 'none', filter: 'none' }], { duration: 380, easing: 'cubic-bezier(.16,1,.3,1)' });
  }

  window.SPMotion = { scan, countUp, pulse, toast, enter, allowed };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => scan()); else scan();
})();
