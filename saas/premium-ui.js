// Premium finish for every page: the animated Super Pro mark, real icons in place of text symbols, and the owner card.
// No data is read or sent here; it only changes how the page looks.
(()=>{
  let n=0;
  const logo=()=>{n+=1;const id='sp'+n;return `<svg class="sp-logo" viewBox="0 0 48 48" aria-hidden="true" focusable="false"><defs><linearGradient id="${id}g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffe9a8"/><stop offset=".55" stop-color="#d9ad59"/><stop offset="1" stop-color="#9a6b25"/></linearGradient><linearGradient id="${id}s" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset=".5" stop-color="#fff" stop-opacity=".55"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient><clipPath id="${id}c"><rect x="2" y="2" width="44" height="44" rx="13"/></clipPath></defs><rect x="1.5" y="1.5" width="45" height="45" rx="13.5" fill="#0b0e14" stroke="url(#${id}g)" stroke-width="1.6"/><g clip-path="url(#${id}c)"><g class="sp-orbit"><ellipse cx="24" cy="24" rx="19.5" ry="8" fill="none" stroke="url(#${id}g)" stroke-width="1.1" opacity=".5" transform="rotate(-28 24 24)"/><circle class="sp-sat" cx="41.3" cy="16.2" r="2.3" fill="#ffe9a8"/></g><rect class="sp-shine" x="-30" y="-4" width="22" height="56" fill="url(#${id}s)" transform="skewX(-20)"/></g><path d="M9 32v-8m0 4h5m25-12v8m0-4h-5" fill="none" stroke="url(#${id}g)" stroke-width="1.4"/><circle cx="9" cy="34" r="1.5" fill="#d9ad59"/><circle cx="39" cy="14" r="1.5" fill="#d9ad59"/><text x="24" y="30.4" text-anchor="middle" font-family="Inter,'Segoe UI',system-ui,sans-serif" font-weight="900" font-size="18" letter-spacing="-.8" fill="url(#${id}g)">SP</text></svg>`};
  const ICONS={
    '✦':'<svg viewBox="0 0 32 32" class="ai-ico ai-spark"><path class="a" d="M16 3l2.6 7.4L26 13l-7.4 2.6L16 23l-2.6-7.4L6 13l7.4-2.6z"/><path class="b" d="M25 20l1.1 3 3 1.1-3 1.1L25 28l-1.1-2.8-3-1.1 3-1.1z"/><path class="c" d="M7 21l.8 2.2L10 24l-2.2.8L7 27l-.8-2.2L4 24l2.2-.8z"/></svg>',
    '◎':'<svg viewBox="0 0 32 32" class="ai-ico ai-inbox"><rect x="4" y="8" width="24" height="17" rx="3.5"/><path class="a" d="M5 10l11 8 11-8"/><circle class="dot" cx="26" cy="8" r="3.2"/></svg>',
    '◈':'<svg viewBox="0 0 32 32" class="ai-ico ai-team"><circle class="a" cx="16" cy="10" r="4.2"/><path d="M7.5 26c.8-5 4-8 8.5-8s7.7 3 8.5 8"/><circle class="b" cx="6.5" cy="13" r="2.6"/><circle class="c" cx="25.5" cy="13" r="2.6"/></svg>',
    '◉':'<svg viewBox="0 0 32 32" class="ai-ico ai-voice"><path d="M9 6.5c0-1 .8-1.8 1.8-1.8h2.2l2 5-2.4 1.6a13 13 0 0 0 6.4 6.4l1.6-2.4 5 2v2.2c0 1-.8 1.8-1.8 1.8C14 21.3 9 14.5 9 6.5z"/><path class="w1" d="M21 6.5a7 7 0 0 1 4.5 4.5"/><path class="w2" d="M21.5 2.5a11 11 0 0 1 8 8"/></svg>',
    '▣':'<svg viewBox="0 0 32 32" class="ai-ico ai-studio"><rect x="4" y="6" width="24" height="20" rx="4"/><path class="play" d="M13.5 12l7 4-7 4z"/><path class="scan" d="M7 22h18"/></svg>',
    '⌕':'<svg viewBox="0 0 32 32" class="ai-ico ai-find"><g class="lens"><circle cx="14" cy="14" r="7.5"/><path d="M20 20l7 7"/></g></svg>',
    '▯':'<svg viewBox="0 0 32 32" class="ai-ico ai-phone"><rect x="9" y="3.5" width="14" height="25" rx="3.5"/><path d="M14 24.5h4"/><path class="a" d="M12.5 9.5h7"/></svg>',
    'desk':'<svg viewBox="0 0 32 32" class="ai-ico ai-desk"><rect x="3.5" y="6" width="25" height="16" rx="3"/><path d="M11 27h10M16 22v5"/><path class="a" d="M8 11h9"/></svg>',
    '✓':'<svg viewBox="0 0 32 32" class="ai-ico ai-secure"><path d="M16 3.5l10 3.6v8.2c0 6-4.2 10.4-10 13.2C10.2 25.7 6 21.3 6 15.3V7.1z"/><path class="tick" d="M11 16.2l3.6 3.6 6.9-7.3"/></svg>'
  };
  function swapIcons(){
    document.querySelectorAll('.feature-card .icon,.install-choice-icon').forEach(e=>{
      if(e.dataset.spIcon)return;const g=e.textContent.trim();let key=g;
      if(e.classList.contains('install-choice-icon')&&g==='▣')key='desk';
      if(ICONS[key]){e.innerHTML=ICONS[key];e.dataset.spIcon='1';e.setAttribute('aria-hidden','true')}
    });
  }
  function swapLogos(){
    document.querySelectorAll('.sp-glyph,.sp-auth-mark,.sp-workspace-mark,.sp-monogram').forEach(e=>{
      if(e.dataset.spLogo)return;e.dataset.spLogo='1';e.classList.add('sp-logo-host');e.innerHTML=logo();
    });
  }
  function install(){swapLogos();swapIcons();addEyes()}

  // Show/hide eye button on every password box, so people can check what they typed (helps on phones).
  const eye='<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>';
  const eyeOff='<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 3l18 18"/><path d="M10.6 5.1A10.7 10.7 0 0 1 12 5c6.4 0 10 7 10 7a17 17 0 0 1-3.2 4M6.6 6.6C3.7 8.4 2 12 2 12s3.6 7 10 7c1.7 0 3.2-.4 4.5-1"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/></svg>';
  const addEyes=()=>{document.querySelectorAll('input[type="password"]:not([data-eye])').forEach(inp=>{
    inp.dataset.eye='1';const wrap=document.createElement('span');wrap.className='pw-wrap';inp.parentNode.insertBefore(wrap,inp);wrap.appendChild(inp);
    const b=document.createElement('button');b.type='button';b.className='pw-eye';b.setAttribute('aria-label','Show password');b.setAttribute('aria-pressed','false');b.innerHTML=eye;wrap.appendChild(b);
    b.addEventListener('click',e=>{e.preventDefault();const show=inp.type==='password';inp.type=show?'text':'password';b.innerHTML=show?eyeOff:eye;b.setAttribute('aria-label',show?'Hide password':'Show password');b.setAttribute('aria-pressed',show?'true':'false');inp.focus({preventScroll:true})});
  })};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install);else install();
  new MutationObserver(()=>{clearTimeout(install.t);install.t=setTimeout(install,120)}).observe(document.documentElement,{childList:true,subtree:true});
})();
