// Single source of truth for workspace navigation: six groups, each a dropdown
// menu in the top bar (and in the mobile header).
// app.js, the page finder and the manual read from this list; nothing else
// should hard-code view names, labels or role gates.
(()=>{
  const FINANCE_ROLES=['owner','admin','super_admin']; // must match financeRoles in src/server.js
  const SENIOR_ROLES=['owner','admin','manager','super_admin','director']; // must match workforceSeniorRoles in src/server.js
  // `path` is the canonical hash route (#domain/section). Old single-word hashes such as #finance still resolve.
  const DOMAINS=[
    {id:'today',label:'Today',kicker:'TODAY',icon:'i-grid',items:[
      {view:'dashboard',path:'today/home',alias:['operations/command'],label:'Home & AI Command',icon:'i-grid'},
      {view:'assistant',path:'today/assistant',alias:['operations/receptionist'],label:'AI Assistant & Receptionist',icon:'i-spark',roles:SENIOR_ROLES},
      {view:'approvals',path:'today/approvals',alias:['governance/approvals'],label:'Approvals',icon:'i-check',badge:'nav-approvals'}
    ]},
    {id:'customers',label:'Customers & Work',kicker:'CUSTOMERS & WORK',icon:'i-bell',items:[
      {view:'customers',path:'customers/list',alias:['customers'],label:'Customers',icon:'i-users',roles:SENIOR_ROLES},
      {view:'stock',path:'customers/stock',alias:['stock'],label:'Stock & Supplies',icon:'i-briefcase',roles:SENIOR_ROLES},
      {view:'comms',path:'customers/inbox',alias:['operations/inbox'],label:'Inbox (all channels)',icon:'i-bell',roles:SENIOR_ROLES},
      {view:'jobs',path:'customers/jobs',alias:['operations/dispatch'],label:'Jobs & Dispatch',icon:'i-briefcase',badge:'nav-jobs'}
    ]},
    {id:'people',label:'People',kicker:'PEOPLE',icon:'i-users',items:[
      {view:'workforce',path:'people/workers',alias:['workforce/compliance'],label:'Workers & Compliance',icon:'i-users'},
      {view:'team',path:'people/staff',alias:['workforce/staff'],label:'Staff Accounts & Roles',icon:'i-users',roles:['owner']},
      {view:'hiring',path:'people/hiring',alias:['hiring'],label:'Hiring (owner & admin only)',icon:'i-briefcase',roles:['owner','admin']}
    ]},
    {id:'marketing',label:'Marketing & Channels',kicker:'MARKETING & CHANNELS',icon:'i-video',items:[
      {view:'video',path:'marketing/studio',alias:['workforce/growth'],label:'Content Studio',icon:'i-video',roles:SENIOR_ROLES},
      {view:'growth',path:'marketing/growth',alias:['growth'],label:'Growth Engine',icon:'i-spark',roles:SENIOR_ROLES},
      {view:'visibility',path:'marketing/search',alias:['seo','visibility'],label:'Search & AI Visibility',icon:'i-spark',roles:SENIOR_ROLES},
      {view:'integrations',path:'marketing/connections',alias:['workforce/connections'],label:'Connections (social, WhatsApp, website)',icon:'i-link',roles:SENIOR_ROLES}
    ]},
    {id:'money',label:'Money',kicker:'MONEY',icon:'i-briefcase',items:[
      {view:'finance',path:'money/ledger',alias:['finance/ledger'],label:'Profit & Payments',icon:'i-shield',roles:FINANCE_ROLES},
      {view:'billing',path:'money/billing',alias:['finance/billing'],label:'Plans & Billing',icon:'i-doc',roles:FINANCE_ROLES}
    ]},
    {id:'setup',label:'Setup & Trust',kicker:'SETUP & TRUST',icon:'i-shield',items:[
      {view:'onboarding',path:'setup/settings',alias:['governance/settings'],label:'Brand & Settings',icon:'i-building',roles:SENIOR_ROLES},
      {view:'migration',path:'setup/import',alias:['governance/migration'],label:'Import Your Data',icon:'i-arrow',roles:SENIOR_ROLES},
      {view:'exports',path:'setup/print',alias:['governance/exports'],label:'Print & Export Hub',icon:'i-doc',roles:['owner']},
      {view:'governance',path:'setup/trust',alias:['governance/trust'],label:'Trust & Security',icon:'i-shield'},
      {view:'support',path:'setup/help',alias:['governance/help'],label:'Help & Complaints',icon:'i-bell'},
      {view:'manual',path:'setup/manual',alias:['governance/manual'],label:'User Manual',icon:'i-doc'}
    ]}
  ];
  const esc=v=>String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const featureFor={dashboard:'dashboard',assistant:'ai',approvals:'approvals',customers:'customers',stock:'stock',comms:'inbox',jobs:'jobs',workforce:'workforce',hiring:'hiring',video:'content',growth:'growth',visibility:'visibility',integrations:'integrations',finance:'finance',billing:'billing',onboarding:'settings',governance:'governance'};
  const allowed=(item,role)=>{const access=window.GDS_SESSION?.access;if(access?.mode==='custom'&&featureFor[item.view])return access.grants.includes(featureFor[item.view]+'.read');return !item.roles||item.roles.includes(role)};
  window.SuperProCan=(feature,action='read')=>{const a=window.GDS_SESSION?.access;return a?.mode==='owner'||a?.grants?.includes(feature+'.'+action)||false};
  const icon=name=>`<svg aria-hidden="true"><use href="#${name}"></use></svg>`;
  const ROLE_LABELS={owner:'Owner',admin:'Admin',super_admin:'Super admin',manager:'Manager',director:'Director',employee:'Employee',contractor:'Contractor'};

  function visibleItems(role){return DOMAINS.flatMap(d=>d.items.filter(i=>i.view&&allowed(i,role)))}
  function sequence(role){return visibleItems(role).map(i=>i.view)}
  function pathFor(view){for(const d of DOMAINS){const i=d.items.find(x=>x.view===view);if(i)return i.path}return null}
  // Turn a location hash into a view the role may open: canonical path, legacy view name, or a bare domain id.
  function resolve(hash,role){
    const h=String(hash||'').replace(/^#/,'').replace(/\/+$/,'').toLowerCase();if(!h)return null;
    const items=visibleItems(role);
    const hit=items.find(i=>i.path===h||i.view===h||(i.alias||[]).includes(h))||(DOMAINS.find(d=>d.id===h)&&items.find(i=>DOMAINS.find(d=>d.id===h).items.includes(i)));
    return hit?hit.view:null;
  }
  function pageMeta(){
    const meta={};
    DOMAINS.forEach(d=>d.items.forEach(i=>{if(i.view)meta[i.view]=[d.kicker,i.label]}));
    return meta;
  }
  function itemHtml(item){
    if(item.href){
      return `<a class="nav-item nav-item-link" href="${esc(item.href)}"><span class="nav-step">${icon(item.icon)}</span><span>${esc(item.label)}</span></a>`;
    }
    const badge=item.badge?`<span class="nav-badge" id="${esc(item.badge)}">0</span>`:'';
    return `<button class="nav-item" data-view="${esc(item.view)}" type="button"><span class="nav-step">${icon(item.icon)}</span><span>${esc(item.label)}</span>${badge}</button>`;
  }
  function closeAll(nav){
    nav.querySelectorAll('.nav-domain[data-open="true"]').forEach(section=>{
      section.dataset.open='false';section.querySelector('.nav-domain-toggle')?.setAttribute('aria-expanded','false');
    });
  }
  function render(nav,role){
    if(!nav)return;
    nav.innerHTML=DOMAINS.map(d=>{
      const items=d.items.filter(i=>allowed(i,role));
      if(!items.length)return'';
      return `<section class="nav-domain" data-domain="${d.id}" data-open="false">`
        +`<button class="nav-domain-toggle" type="button" aria-expanded="false" aria-haspopup="true" aria-controls="nav-domain-${d.id}"><span class="nav-step">${icon(d.icon)}</span><span>${esc(d.label)}</span>${icon('i-chevron')}</button>`
        +`<div class="nav-domain-items" id="nav-domain-${d.id}">${items.map(itemHtml).join('')}</div></section>`;
    }).join('');
    nav.querySelectorAll('.nav-domain-toggle').forEach(btn=>btn.addEventListener('click',event=>{
      event.stopPropagation();
      const section=btn.closest('.nav-domain');
      const mouseHover=event.detail>0&&matchMedia('(hover:hover) and (pointer:fine)').matches&&section.matches(':hover');
      const open=mouseHover||section.dataset.open!=='true';
      closeAll(nav);
      if(open){section.dataset.open='true';btn.setAttribute('aria-expanded','true');
        const menu=section.querySelector('.nav-domain-items'),bounds=btn.getBoundingClientRect();
        menu.style.maxHeight=Math.max(120,innerHeight-bounds.bottom-24)+'px';
        menu.style.left='';menu.style.right='';
        if(bounds.left+Math.min(310,innerWidth-24)>innerWidth-12){menu.style.left='auto';menu.style.right='0'}
      }
    }));
    // Hover is a desktop convenience; touch and keyboard retain explicit controls.
    nav.querySelectorAll('.nav-domain').forEach(section=>{
      const toggle=section.querySelector('.nav-domain-toggle'),menu=section.querySelector('.nav-domain-items');
      let closeTimer;
      const open=()=>{clearTimeout(closeTimer);closeAll(nav);section.dataset.open='true';toggle.setAttribute('aria-expanded','true');
        const bounds=toggle.getBoundingClientRect();menu.style.maxHeight=Math.max(120,innerHeight-bounds.bottom-24)+'px';
        menu.style.left='';menu.style.right='';
        if(bounds.left+Math.min(310,innerWidth-24)>innerWidth-12){menu.style.left='auto';menu.style.right='0'}
      };
      section.addEventListener('pointerenter',e=>{if(e.pointerType==='mouse'&&matchMedia('(hover:hover) and (pointer:fine)').matches)open()});
      section.addEventListener('pointerleave',e=>{if(e.pointerType==='mouse')closeTimer=setTimeout(()=>{if(!menu.contains(document.activeElement)){section.dataset.open='false';toggle.setAttribute('aria-expanded','false')}},180)});
      toggle.addEventListener('keydown',e=>{if(e.key==='ArrowDown'){e.preventDefault();open();menu.querySelector('.nav-item')?.focus()}});
      menu.addEventListener('keydown',e=>{const items=[...menu.querySelectorAll('.nav-item')],at=items.indexOf(document.activeElement);let next;
        if(e.key==='ArrowDown')next=(at+1)%items.length;else if(e.key==='ArrowUp')next=(at-1+items.length)%items.length;else if(e.key==='Home')next=0;else if(e.key==='End')next=items.length-1;
        if(next!==undefined){e.preventDefault();items[next]?.focus()}
      });
      section.addEventListener('focusout',()=>setTimeout(()=>{if(!section.contains(document.activeElement)&&!section.matches(':hover')){section.dataset.open='false';toggle.setAttribute('aria-expanded','false')}},0));
    });
    // Selecting an item, clicking elsewhere or pressing Escape closes the menu.
    nav.addEventListener('click',event=>{if(event.target.closest('.nav-item'))closeAll(nav)});
    if(!nav.dataset.navBound){
      nav.dataset.navBound='1';
      document.addEventListener('click',event=>{if(!nav.contains(event.target))closeAll(nav)});
      document.addEventListener('keydown',event=>{if(event.key==='Escape'){const open=nav.querySelector('.nav-domain[data-open="true"] .nav-domain-toggle');closeAll(nav);open?.focus()}});
    }
    window.dispatchEvent(new Event('superpro:nav-ready'));
  }
  // Mark the domain that holds the active view so the user never loses their place.
  function reveal(view){
    const nav=document.querySelector('.workspace-nav');if(!nav)return;
    nav.querySelectorAll('.nav-domain').forEach(section=>{
      section.classList.toggle('has-active',!!section.querySelector(`[data-view="${CSS.escape(view)}"]`));
    });
  }
  function setRoleBadge(el,role){
    if(!el)return;
    el.dataset.role=role||'';
    el.textContent=ROLE_LABELS[role]||(role?role.replace(/_/g,' '):'Member');
  }
  window.SuperProNav={DOMAINS,FINANCE_ROLES,SENIOR_ROLES,sequence,pathFor,resolve,pageMeta,render,reveal,setRoleBadge};
})();
