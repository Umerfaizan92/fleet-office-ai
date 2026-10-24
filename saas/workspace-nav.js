// Single source of truth for workspace navigation: four domains, each a dropdown
// menu in the top bar (and in the mobile header).
// app.js, the page finder and the manual read from this list; nothing else
// should hard-code view names, labels or role gates.
(()=>{
  const FINANCE_ROLES=['owner','admin','super_admin']; // must match financeRoles in src/server.js
  const SENIOR_ROLES=['owner','admin','manager','super_admin','director']; // must match workforceSeniorRoles in src/server.js
  // `path` is the canonical hash route (#domain/section). Old single-word hashes such as #finance still resolve.
  const DOMAINS=[
    {id:'operations',label:'Operations Control',kicker:'OPERATIONS CONTROL',icon:'i-grid',items:[
      {view:'dashboard',path:'operations/command',label:'Executive Command',icon:'i-grid'},
      {view:'assistant',path:'operations/receptionist',label:'AI Receptionist & Operations',icon:'i-spark'},
      {view:'comms',path:'operations/inbox',label:'Omnichannel Inbox',icon:'i-bell',roles:SENIOR_ROLES},
      {view:'jobs',path:'operations/dispatch',label:'Work Orders & Dispatch',icon:'i-briefcase',badge:'nav-jobs'}
    ]},
    {id:'workforce',label:'Workforce & Pipeline',kicker:'WORKFORCE & PIPELINE',icon:'i-users',items:[
      {view:'workforce',path:'workforce/compliance',label:'Workforce & Compliance',icon:'i-users'},
      {view:'team',path:'workforce/staff',label:'Staff Accounts',icon:'i-users',roles:['owner']},
      {view:'video',path:'workforce/growth',label:'Growth & Social Studio',icon:'i-video'},
      {view:'integrations',path:'workforce/connections',label:'Connections',icon:'i-link'}
    ]},
    {id:'finance',label:'Financial Ledger',kicker:'FINANCIAL LEDGER',icon:'i-briefcase',items:[
      {view:'finance',path:'finance/ledger',label:'Protected Ledger',icon:'i-shield',roles:FINANCE_ROLES},
      {view:'billing',path:'finance/billing',label:'Plans & Billing',icon:'i-doc'}
    ]},
    {id:'governance',label:'Governance & Tools',kicker:'GOVERNANCE & TOOLS',icon:'i-shield',items:[
      {view:'governance',path:'governance/trust',label:'Trust & Governance',icon:'i-shield'},
      {view:'approvals',path:'governance/approvals',label:'Approvals',icon:'i-check',badge:'nav-approvals'},
      {view:'migration',path:'governance/migration',label:'Data Migration',icon:'i-arrow',roles:SENIOR_ROLES},
      {view:'exports',path:'governance/exports',label:'Print & Export Hub',icon:'i-doc',roles:['owner']},
      {view:'onboarding',path:'governance/settings',label:'Brand Studio & Settings',icon:'i-building'},
      {view:'support',path:'governance/help',label:'Help & Complaints',icon:'i-bell'},
      {view:'manual',path:'governance/manual',label:'User Manual',icon:'i-doc'},
      {href:'/office/',label:'Previous workspace',icon:'i-arrow'}
    ]}
  ];
  const esc=v=>String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const allowed=(item,role)=>!item.roles||item.roles.includes(role);
  const icon=name=>`<svg aria-hidden="true"><use href="#${name}"></use></svg>`;
  const ROLE_LABELS={owner:'Owner',admin:'Admin',super_admin:'Super admin',manager:'Manager',director:'Director',employee:'Employee',contractor:'Contractor'};

  function visibleItems(role){return DOMAINS.flatMap(d=>d.items.filter(i=>i.view&&allowed(i,role)))}
  function sequence(role){return visibleItems(role).map(i=>i.view)}
  function pathFor(view){for(const d of DOMAINS){const i=d.items.find(x=>x.view===view);if(i)return i.path}return null}
  // Turn a location hash into a view the role may open: canonical path, legacy view name, or a bare domain id.
  function resolve(hash,role){
    const h=String(hash||'').replace(/^#/,'').replace(/\/+$/,'').toLowerCase();if(!h)return null;
    const items=visibleItems(role);
    const hit=items.find(i=>i.path===h||i.view===h)||(DOMAINS.find(d=>d.id===h)&&items.find(i=>DOMAINS.find(d=>d.id===h).items.includes(i)));
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
      const section=btn.closest('.nav-domain'),open=section.dataset.open!=='true';
      closeAll(nav);
      if(open){section.dataset.open='true';btn.setAttribute('aria-expanded','true')}
    }));
    // Selecting an item, clicking elsewhere or pressing Escape closes the menu.
    nav.addEventListener('click',event=>{if(event.target.closest('.nav-item'))closeAll(nav)});
    if(!nav.dataset.navBound){
      nav.dataset.navBound='1';
      document.addEventListener('click',event=>{if(!nav.contains(event.target))closeAll(nav)});
      document.addEventListener('keydown',event=>{if(event.key==='Escape'){const open=nav.querySelector('.nav-domain[data-open="true"] .nav-domain-toggle');closeAll(nav);open?.focus()}});
    }
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
