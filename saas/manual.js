(() => {
  const views = [
    {id:'dashboard',step:'01',title:'Command centre',group:'Start here',copy:'See the business snapshot, attention items and the fastest route into today’s work.',actions:['Review attention items','Open AI Operations']},
    {id:'onboarding',step:'02',title:'Business setup',group:'Setup',copy:'Set the industry profile, services, service area, approval policy, brand voice and permanent AI instructions.',actions:['Review business profile','Confirm approval rules']},
    {id:'workforce',step:'03',title:'People & workforce',group:'Operations',copy:'Add workers and staff, then manage role, work-right, skill and readiness information.',actions:['Add a worker','Review compliance']},
    {id:'jobs',step:'04',title:'Jobs & allocation',group:'Operations',copy:'Create work orders and allocate only workers who meet the configured readiness and skill rules.',actions:['Create work order','Find eligible workers']},
    {id:'assistant',step:'05',title:'AI Operations',group:'Intelligence',copy:'Prepare and organise AI-assisted operational work while keeping consequential actions under human approval.',actions:['Create AI task','Review approval controls']},
    {id:'video',step:'06',title:'Content studio',group:'Growth',copy:'Build platform-aware content specifications from your business media and connected channel strategy.',actions:['Choose media','Create render specification']},
    {id:'integrations',step:'07',title:'Connections',group:'System',copy:'Connect the business channels you use. Customers never paste Super Pro platform developer secrets.',actions:['Choose a platform','Review connector readiness']},
    {id:'governance',step:'08',title:'Trust & governance',group:'Trust',copy:'Review role-matched policies, support cases, escalations and privileged audit evidence.',actions:['Review policies','Open Help Desk']},
    {id:'support',step:'09',title:'Help & complaints',group:'Help',copy:'Open support, complaint and protected reporting pathways without blocking the workspace. The AI Co-pilot remains available everywhere.',actions:['Open Help Desk','Review complaint rights']},
    {id:'manual',step:'10',title:'Digital user manual',group:'Guide',copy:'Use this live map, role-specific instructions and direct navigation to understand the workspace at any time.',actions:['Choose a map destination','Ask Super Pro for guidance']},
    {id:'billing',step:'11',title:'Plans & billing',group:'Account',copy:'Review trial access and plan boundaries. Paid billing stays off until checkout is deliberately activated.',actions:['Review current plan','Review plan access']}
  ];

  const roleProfiles = {
    owner:{title:'Owner',copy:'Full business oversight. Prioritise security, approval rules, governance, integrations and operating performance.',chips:['Business control','Governance access','Integration oversight','Approval authority']},
    super_admin:{title:'Super Admin',copy:'Privileged administration. Use least privilege, MFA and audit review when changing access or integrations.',chips:['Privileged admin','Audit access','Security controls','Platform setup']},
    admin:{title:'Administrator',copy:'Administrative access should be used only for authorised setup, user support and operational configuration.',chips:['Administration','Workspace setup','Support','Operational controls']},
    director:{title:'Director / Senior',copy:'Senior oversight guidance emphasises risk, complaints, governance and business-level decisions.',chips:['Senior oversight','Governance','Risk review','Escalations']},
    manager:{title:'Manager',copy:'Manage day-to-day operations within the permissions granted by the owner. Sensitive complaints may bypass conflicted roles.',chips:['Operations','Team coordination','Case handling','Approvals']},
    complaints_officer:{title:'Complaints Officer',copy:'Focus on protected case handling, evidence, acknowledgement, escalation and conflict-free complaint administration.',chips:['Complaints','Evidence','Escalation','Confidentiality']},
    privacy_officer:{title:'Privacy Officer',copy:'Focus on privacy policy, information handling, incidents, access controls and lawful escalation.',chips:['Privacy','Data handling','Incidents','Governance']},
    security_officer:{title:'Security Officer',copy:'Focus on security alerts, privileged activity, account protection and tamper-evident records.',chips:['Security','Audit','MFA','Incident response']},
    employee:{title:'Employee',copy:'Your manual focuses on the work, policies and actions available to your account without exposing senior-only administration.',chips:['Assigned work','Policies','Help Desk','Role access']},
    worker:{title:'Worker',copy:'Use role-relevant job, workforce, policy and help functions. Senior audit and organisation-wide cases remain restricted.',chips:['Jobs','Readiness','Policies','Help Desk']},
    contractor:{title:'Contractor',copy:'Use only the business areas and information specifically authorised for your engagement.',chips:['Assigned work','Policies','Help Desk','Limited access']}
  };

  const qs = s => document.querySelector(s);
  const esc = v => String(v ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const viewFromHash = () => location.hash.replace('#','') || 'dashboard';
  const getRole = () => String(window.GDS_SESSION?.user?.role || document.documentElement.dataset.userRole || 'user').toLowerCase();
  const seniorRoles = new Set(['owner','super_admin','admin','director','manager','complaints_officer','privacy_officer','security_officer']);
  let lastOperationalView = sessionStorage.getItem('gds-last-operational-view') || 'dashboard';

  function navigate(view){
    const button = document.querySelector(`.workspace-nav [data-view="${CSS.escape(view)}"]`);
    if (button) button.click();
    else location.hash = view;
  }

  function renderRibbon(view){
    const ribbon = qs('#gds-location-ribbon');
    if(!ribbon) return;
    const item = views.find(x=>x.id===view) || views[0];
    const role = roleProfiles[getRole()] || {title:(getRole()||'User').replaceAll('_',' ')};
    ribbon.querySelector('[data-location-step]').textContent = item.step;
    ribbon.querySelector('[data-location-title]').textContent = item.title;
    ribbon.querySelector('[data-location-group]').textContent = `${item.group} · ${role.title}`;
    const prompt=ribbon.querySelector('[data-location-prompt]');if(prompt)prompt.textContent=`Suggested: ${item.actions?.[0]||'open the user manual'}`;
    ribbon.dataset.view=view;
  }

  function renderManual(){
    if(!qs('#manual-view')) return;
    const roleKey=getRole(), role=roleProfiles[roleKey] || {title:roleKey.replaceAll('_',' ')||'Workspace user',copy:'Guidance follows the permissions assigned to this account.',chips:['Role-aware access','Help Desk','Guided navigation']};
    const active = viewFromHash()==='manual' ? lastOperationalView : viewFromHash();
    const activeItem=views.find(x=>x.id===active)||views[0];
    const map=qs('#manual-map');
    if(map) map.innerHTML=views.map((x,i)=>`<button type="button" class="manual-map-node ${x.id===active?'is-origin':''} ${x.id==='manual'?'is-manual':''}" data-manual-go="${esc(x.id)}"><span>${x.step}</span><div><small>${esc(x.group)}</small><b>${esc(x.title)}</b></div><i>${x.id===active?'YOU ARE HERE':'→'}</i></button>${i<views.length-1?'<em class="manual-map-link"></em>':''}`).join('');
    const roleTitle=qs('#manual-role-title'),roleCopy=qs('#manual-role-copy'),roleChips=qs('#manual-role-chips'),rolePill=qs('#manual-role-pill');
    if(roleTitle)roleTitle.textContent=role.title;if(roleCopy)roleCopy.textContent=role.copy;if(rolePill)rolePill.textContent=`${role.title} manual`;
    if(roleChips)roleChips.innerHTML=(role.chips||[]).map(x=>`<span>${esc(x)}</span>`).join('');
    const locationCopy=qs('#manual-location-copy');if(locationCopy)locationCopy.textContent=`${activeItem.step} · ${activeItem.title}. ${activeItem.copy}`;
    const contextTitle=qs('#manual-context-title'),contextCopy=qs('#manual-context-copy'),contextActions=qs('#manual-context-actions');
    if(contextTitle)contextTitle.textContent=activeItem.title;if(contextCopy)contextCopy.textContent=activeItem.copy;
    if(contextActions)contextActions.innerHTML=`<button class="primary-button compact" type="button" data-manual-go="${esc(activeItem.id)}">Open ${esc(activeItem.title)}</button><button class="secondary-button compact" type="button" data-manual-ask="${esc(activeItem.title)}">Explain this area</button>`;
    const next=qs('#manual-next-list');
    if(next){
      const base=views.findIndex(x=>x.id===activeItem.id);const candidates=[views[Math.min(base+1,views.length-1)],views.find(x=>x.id==='governance'),views.find(x=>x.id==='integrations')].filter(Boolean);const unique=[...new Map(candidates.map(x=>[x.id,x])).values()].slice(0,3);
      next.innerHTML=unique.map(x=>`<button type="button" data-manual-go="${esc(x.id)}"><span>${x.step}</span><div><b>${esc(x.title)}</b><small>${esc(x.copy)}</small></div><i>→</i></button>`).join('');
    }
    loadKeyStatus();
  }

  async function loadKeyStatus(){
    const host=qs('#manual-key-status');if(!host)return;
    try{
      const r=await fetch('/api/saas/integrations/self-service',{credentials:'same-origin'});if(!r.ok)throw new Error('status unavailable');const d=await r.json();
      const ready=(d.integrations||[]).filter(x=>x.provider_ready).length,total=(d.integrations||[]).length;
      host.innerHTML=`<div><strong>${ready}/${total}</strong><span>connectors currently configured</span></div><p>${seniorRoles.has(getRole())?'Platform credentials remain server-side and are never returned by this screen.':'Your business can use connectors the platform operator has enabled; raw developer keys are never exposed to your account.'}</p>`;
    }catch{host.innerHTML='<span>Connector readiness will appear when the workspace service is available.</span>'}
  }

  function install(){
    if(!qs('#workspace')) return;
    if(!qs('#gds-location-ribbon')){
      const ribbon=document.createElement('div');ribbon.id='gds-location-ribbon';ribbon.className='gds-location-ribbon';ribbon.innerHTML='<div class="location-pin"><span data-location-step>01</span></div><div class="location-copy"><small data-location-group>START HERE</small><b data-location-title>Command centre</b><em data-location-prompt>Review the business snapshot</em></div><div class="location-track"><span></span><i></i><i></i><i></i><i></i><i></i></div><button type="button" id="location-open-manual">Open map & manual →</button>';
      const main=qs('.app-main');const top=qs('.app-topbar');if(main&&top)top.insertAdjacentElement('afterend',ribbon);
    }
    qs('#open-digital-manual')?.addEventListener('click',()=>{const current=viewFromHash();if(current!=='manual'){lastOperationalView=current;sessionStorage.setItem('gds-last-operational-view',current)}navigate('manual')});
    qs('#location-open-manual')?.addEventListener('click',()=>{const current=viewFromHash();if(current!=='manual'){lastOperationalView=current;sessionStorage.setItem('gds-last-operational-view',current)}navigate('manual')});
    document.addEventListener('click',e=>{
      const go=e.target.closest('[data-manual-go]');if(go){navigate(go.dataset.manualGo);return}
      const ask=e.target.closest('[data-manual-ask]');if(ask){const launcher=qs('.copilot-launch');if(launcher){launcher.click();setTimeout(()=>{const ta=qs('#gds-copilot textarea');if(ta){ta.value=`Explain ${ask.dataset.manualAsk} and what I should do here for my role.`;ta.focus()}},80)}}
    });
    qs('#manual-help-desk')?.addEventListener('click',()=>window.GDSSupport?.open?.());
    window.addEventListener('gds:viewchange',e=>{
      const view=e.detail?.view||viewFromHash();if(view!=='manual'){lastOperationalView=view;sessionStorage.setItem('gds-last-operational-view',view)}renderRibbon(view);if(view==='manual')setTimeout(renderManual,0)
    });
    renderRibbon(viewFromHash());renderManual();
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install);else install();
})();
