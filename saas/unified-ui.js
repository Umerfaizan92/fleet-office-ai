// Shared presentation and accessible navigation. Never handles authentication or permissions.
(()=>{
  const operator=location.pathname.startsWith('/office');
  function installSkip(){
    const main=document.querySelector(operator?'#app>main':'main,.app-main');
    if(!main||document.querySelector('.sp-skip-link'))return;
    if(!main.id)main.id='sp-main-content';
    main.tabIndex=-1;
    const a=document.createElement('a');a.className='sp-skip-link';a.href='#'+main.id;a.textContent='Skip to main content';
    a.addEventListener('click',e=>{e.preventDefault();main.focus();main.scrollIntoView({block:'start'})});
    document.body.prepend(a);
  }
  function installOffice(){
    if(!operator)return;
    document.body.classList.add('sp-operator');
    const app=document.querySelector('#app'),aside=app?.querySelector(':scope>aside'),nav=aside?.querySelector('nav'),header=app?.querySelector('main>header');
    if(!nav||!header||document.querySelector('.sp-office-menu'))return;
    aside.id='sp-office-navigation';aside.setAttribute('aria-label','Founder navigation');
    const menu=document.createElement('button');menu.type='button';menu.className='sp-office-menu secondary';menu.textContent='☰ Menu';menu.setAttribute('aria-controls',aside.id);menu.setAttribute('aria-expanded','false');header.prepend(menu);
    const scrim=document.createElement('button');scrim.type='button';scrim.className='sp-office-scrim';scrim.setAttribute('aria-label','Close founder navigation');scrim.tabIndex=-1;app.append(scrim);
    const media=matchMedia('(max-width:900px)');
    const setOpen=(open,restore=false)=>{
      document.body.classList.toggle('sp-office-nav-open',open);menu.setAttribute('aria-expanded',String(open));aside.inert=media.matches&&!open;
      if(open)filter.focus();else if(restore)menu.focus();
    };
    menu.addEventListener('click',()=>setOpen(menu.getAttribute('aria-expanded')!=='true'));
    scrim.addEventListener('click',()=>setOpen(false,true));
    document.addEventListener('keydown',e=>{if(e.key==='Escape'&&menu.getAttribute('aria-expanded')==='true'){setOpen(false,true);e.preventDefault()}});
    media.addEventListener('change',()=>setOpen(false));
    const filter=document.createElement('input');filter.type='search';filter.className='sp-nav-filter';filter.placeholder='Find a section…';filter.setAttribute('aria-label','Find founder section');nav.before(filter);
    const groups={dashboard:'Today',enquiries:'Customers & work',expenses:'Money & insight',content:'Marketing',records:'Platform & tools'};
    const paths={dashboard:'M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z',inbox:'M3 5h18v14H3zM3 5l9 7 9-7',approvals:'m5 12 4 4 10-10',customers:'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8',default:'M6 3h8l4 4v14H6zM14 3v5h5M9 12h6M9 16h6'};
    const buttons=[...nav.querySelectorAll('button[data-view]')];
    for(const b of buttons){
      if(groups[b.dataset.view]){const label=document.createElement('div');label.className='sp-nav-group';label.textContent=groups[b.dataset.view];nav.insertBefore(label,b)}
      const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('aria-hidden','true');svg.classList.add('sp-nav-icon');const path=document.createElementNS(svg.namespaceURI,'path');path.setAttribute('d',paths[b.dataset.view]||paths.default);svg.append(path);b.prepend(svg);
      b.addEventListener('click',()=>{setOpen(false);for(const item of buttons){if(item===b)item.setAttribute('aria-current','page');else item.removeAttribute('aria-current')}});
    }
    filter.addEventListener('input',()=>{
      const q=filter.value.trim().toLowerCase();for(const b of buttons)b.hidden=!b.textContent.toLowerCase().includes(q);
      for(const group of nav.querySelectorAll('.sp-nav-group')){let n=group.nextElementSibling,visible=false;while(n&&!n.classList.contains('sp-nav-group')){if(!n.hidden)visible=true;n=n.nextElementSibling}group.hidden=!visible}
    });
    // Keep keyboard focus inside the mobile drawer while it is open.
    aside.addEventListener('keydown',e=>{if(e.key!=='Tab'||!media.matches||menu.getAttribute('aria-expanded')!=='true')return;const items=[...aside.querySelectorAll('a[href],button,input')].filter(n=>!n.disabled&&n.getClientRects().length&&!n.hidden),first=items[0],last=items.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus()}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus()}});
    setOpen(false);
  }
  function init(){installSkip();installOffice();for(const d of document.querySelectorAll('dialog')){if(!d.getAttribute('aria-label')&&!d.getAttribute('aria-labelledby')){const title=d.querySelector('h1,h2,h3');if(title){if(!title.id)title.id='sp-dialog-title-'+d.id;d.setAttribute('aria-labelledby',title.id)}}}}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
