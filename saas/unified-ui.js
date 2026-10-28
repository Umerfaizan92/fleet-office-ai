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
    Object.assign(paths,{"enquiries": "M4 5h16v14H4zM4 6l8 7 8-7", "quotes": "M6 3h12v18H6zM9 8h6m-6 4h6m-6 4h3", "bookings": "M4 6h16v15H4zM8 3v6m8-6v6M4 11h16", "jobs": "M3 7h18v14H3zM8 7V3h8v4m-13 6h18", "expenses": "M4 20V10m5 10V4m6 16v-7m5 7V7", "performance": "M4 19l5-6 4 3 7-11M14 5h6v6", "content": "M3 5h18v14H3zM10 9l5 3-5 3z", "campaigns": "M4 10l14-6v16L4 14zM7 15l2 6", "connections": "M10 14l4-4m-7 5-2 2a3 3 0 0 0 4 4l4-4m-2-6 4-4a3 3 0 0 1 4 4l-2 2", "records": "M4 3h16v5H4zM6 8v13h12V8m-8 5h4", "officeai": "M12 3l2.4 6.6L21 12l-6.6 2.4L12 21l-2.4-6.6L3 12l6.6-2.4z", "aiquality": "M12 3l8 3v6c0 5-8 9-8 9s-8-4-8-9V6zM8 12l3 3 5-6", "subscribers": "M15 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8m8 1h4m-2-2v4", "subpay": "M3 6h18v14H3zM3 10h18m-13 6h3", "staffchat": "M4 4h16v12H9l-5 5zM8 8h8m-8 4h5", "help": "M9 8a3 3 0 1 1 5 2c-2 1-2 2-2 4m0 3v1M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0", "receptionist": "M4 13v-1a8 8 0 0 1 16 0v1M4 12H2v6h4v-6zm16 0h2v6h-4v-6zm0 6v3h-8", "website": "M3 4h18v16H3zM3 9h18m-14-3h1m2 0h1", "searchvisibility": "M20 20l-5-5m2-6a7 7 0 1 0-14 0 7 7 0 0 0 14 0m-10 0h6m-3-3v6"});
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
  // Edge scrolling runs only while a mouse is near the edge of an overflowing menu.
  const scrollingMenus=new WeakSet();
  function installMenuScroll(){
    document.querySelectorAll('.nav-domain-items,.sp-operator #app>aside nav').forEach(menu=>{
      if(scrollingMenus.has(menu))return;scrollingMenus.add(menu);
      let frame=0,speed=0,last=0;
      const stop=()=>{cancelAnimationFrame(frame);frame=0;speed=0;last=0};
      const tick=time=>{frame=0;if(!menu.isConnected||document.hidden||!speed)return stop();
        const before=menu.scrollTop,delta=speed*Math.min(2,(time-(last||time-16.7))/16.7);last=time;menu.scrollTop+=delta;
        if(Math.abs(menu.scrollTop-before)<.5)return stop();frame=requestAnimationFrame(tick);
      };
      menu.addEventListener('pointermove',e=>{
        if(e.pointerType!=='mouse'||menu.scrollHeight<=menu.clientHeight)return stop();
        const r=menu.getBoundingClientRect(),edge=30,y=e.clientY-r.top;
        speed=y<edge?-6*(1-y/edge):y>r.height-edge?6*(1-(r.height-y)/edge):0;
        if(!speed)stop();else if(!frame)frame=requestAnimationFrame(tick);
      },{passive:true});
      menu.addEventListener('pointerleave',stop,{passive:true});menu.addEventListener('pointerdown',stop,{passive:true});
      menu.addEventListener('wheel',stop,{passive:true});
    });
  }
  function surfaceCards(root){
    const selector='#workspace .panel,#workspace .row-card,#workspace .metric-card,#workspace .industry-browser-card,#app .panel,#app .stat';
    const cards=[...(root.matches?.(selector)?[root]:[]),...root.querySelectorAll(selector)];
    for(const card of cards){if(card.dataset.spSurface)continue;card.dataset.spSurface='1';card.classList.add('sp-surface-card');
      const heading=card.querySelector(':scope>h2,:scope>.panel-head h2,:scope>.form-section-head h2');if(!heading||heading.querySelector('.sp-card-icon'))continue;
      const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.classList.add('sp-card-icon','sp-section-icon');svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('aria-hidden','true');const path=document.createElementNS(svg.namespaceURI,'path');
      const view=card.closest('.view')?.id||'';path.setAttribute('d',/job|workforce/.test(view)?'M3 7h18v14H3zM8 7V3h8v4m-13 6h18':/finance|billing/.test(view)?'M4 20V10m5 10V4m6 16v-7m5 7V7':/governance|team/.test(view)?'M12 3l8 3v6c0 5-8 9-8 9s-8-4-8-9V6zM8 12l3 3 5-6':'M12 3l2.4 6.6L21 12l-6.6 2.4L12 21l-2.4-6.6L3 12l6.6-2.4z');svg.append(path);heading.prepend(svg);
    }
  }
  function installMotion(){
    const html=document.documentElement,reduced=matchMedia('(prefers-reduced-motion:reduce)'),connection=navigator.connection;
    const sync=()=>{
      const enabled=!reduced.matches&&!connection?.saveData;
      html.classList.toggle('sp-motion-enabled',enabled);html.classList.toggle('sp-page-hidden',document.hidden);
    };
    reduced.addEventListener('change',sync);connection?.addEventListener?.('change',sync);document.addEventListener('visibilitychange',sync);sync();
    // Observe additions once, then animate only a small budget of on-screen icons.
    const observed=new WeakSet(),visible=new Set(),selector='.sp-logo,.feature-card .ai-ico,.nav-step svg,.sp-nav-icon,.integration-logo,.sp-card-icon,.signin-feature-icon svg,.hero,.auth-story';
    const refresh=()=>{let count=0;for(const node of visible){if(!node.isConnected){visible.delete(node);continue}node.classList.toggle('sp-motion-visible',count++<12)}};
    const observer=new IntersectionObserver(entries=>{for(const e of entries){if(e.isIntersecting)visible.add(e.target);else{visible.delete(e.target);e.target.classList.remove('sp-motion-visible')}}refresh()},{threshold:.1});
    const register=root=>{if(!(root instanceof Element))return;surfaceCards(root);const nodes=[...(root.matches(selector)?[root]:[]),...root.querySelectorAll(selector)];for(const node of nodes){if(observed.has(node))continue;observed.add(node);node.classList.add('sp-motion-target');observer.observe(node)}};
    register(document.body);
    new MutationObserver(records=>{for(const record of records){for(const node of record.removedNodes){if(!(node instanceof Element))continue;for(const target of [node,...node.querySelectorAll('.sp-motion-target')]){observer.unobserve(target);observed.delete(target);visible.delete(target)}}for(const node of record.addedNodes)register(node)}refresh()}).observe(document.body,{childList:true,subtree:true});
    window.addEventListener('gds:viewchange',()=>{html.classList.remove('sp-view-arriving');requestAnimationFrame(()=>html.classList.add('sp-view-arriving'))});
  }
  function init(){const backdrop=document.createElement('div');backdrop.className='sp-cinematic-backdrop';backdrop.setAttribute('aria-hidden','true');document.body.prepend(backdrop);installSkip();installOffice();installMenuScroll();installMotion();for(const d of document.querySelectorAll('dialog')){if(!d.getAttribute('aria-label')&&!d.getAttribute('aria-labelledby')){const title=d.querySelector('h1,h2,h3');if(title){if(!title.id)title.id='sp-dialog-title-'+d.id;d.setAttribute('aria-labelledby',title.id)}}}}
  window.addEventListener('superpro:nav-ready',installMenuScroll);
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
