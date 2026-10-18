(() => {
  const configurations = {
    dashboard: {selector:'.operational-strip, .dashboard-grid > article, .dashboard-workflow', labels:['Business overview','Attention items','Readiness','Workflow guide']},
    billing: {selector:':scope > .trial-hero, :scope > .pricing-grid, :scope > article', labels:['Current access','Compare plans','Payment connections','Billing safeguards','Plan features']},
    approvals: {selector:'.approval-metrics, .two-column-layout > article, #approval-policy-host', labels:['Decision overview','Queue & history','Approval policy'],preferred:'Queue & history'},
    workforce: {selector:'.two-column-layout > article', preferred:'People'},
    jobs: {selector:'.two-column-layout > article', preferred:'Open work orders'},
    finance: {selector:'.finance-kpi-grid, .notice-banner, .two-column-layout > article, :scope > article', labels:['Overview','Accounting guidance','Add entry','Job profitability','Recent entries']},
    team: {selector:':scope > article, :scope > details', labels:['Business members','Invitation history']},
    integrations: {selector:':scope > article', preferred:'Your business connections'},
    governance: {selector:':scope > article, .gov-hero-grid > article, .gov-grid > article'},
    support: {selector:'.dashboard-grid > article'},
    manual: {selector:'.manual-layout > article, .manual-side > article, .manual-grid > article', labels:['Workspace map','Current area','Your role','Next steps','Connections guide','Help']},
    assistant: {selector:'.ai-command-strip, #spai-v16, .ai-layout > article', labels:['How AI works','Ask AI','Save an operational task','Saved tasks'],preferred:'Ask AI'},
    video: {selector:'.source-library-panel, .content-studio-grid > article, .studio-side > article'}
  };
  function installSections(view, config) {
    const panels=Array.from(new Set(view.querySelectorAll(config.selector)));
    if(panels.length<2)return;
    const nav=document.createElement('div');nav.className='focus-navigation';
    const label=document.createElement('label');label.textContent='Section';
    const select=document.createElement('select');select.setAttribute('aria-label','Choose section');
    const previous=document.createElement('button');previous.type='button';previous.textContent='← Previous section';
    const next=document.createElement('button');next.type='button';next.textContent='Next section →';
    const position=document.createElement('span');position.setAttribute('role','status');
    label.append(select);nav.append(label,previous,position,next);
    const heading=view.querySelector('.page-heading');if(heading)heading.after(nav);else view.prepend(nav);
    const containers=new Set();
    panels.forEach((panel,index)=>{
      if(!panel.id)panel.id=view.id+'-section-'+index;
      panel.classList.add('focus-section');
      const option=document.createElement('option');option.value=String(index);option.textContent=config.labels?.[index]||panel.querySelector('h2')?.textContent.trim()||panel.querySelector('summary')?.textContent.trim()||'Section '+(index+1);select.append(option);
      let parent=panel.parentElement;while(parent&&parent!==view){containers.add(parent);parent.classList.add('focus-container');parent=parent.parentElement;}
    });
    let current=0;
    function choose(index){
      const available=panels.map((p,i)=>!p.hidden?i:-1).filter(i=>i>=0);
      if(!available.includes(index))index=available[0];if(index===undefined){nav.hidden=true;return;}nav.hidden=false;current=index;
      panels.forEach((panel,i)=>{panel.classList.toggle('focus-inactive',i!==index);select.options[i].disabled=panel.hidden});
      containers.forEach(container=>container.classList.toggle('focus-inactive',!container.contains(panels[index])));
      select.value=String(index);select.setAttribute('aria-controls',panels[index].id);
      const at=available.indexOf(index);previous.disabled=at===0;next.disabled=at===available.length-1;position.textContent=`${at+1} of ${available.length}`;
    }
    function move(delta){const available=panels.map((p,i)=>!p.hidden?i:-1).filter(i=>i>=0);choose(available[available.indexOf(current)+delta]);}
    select.addEventListener('change',()=>choose(Number(select.value)));previous.addEventListener('click',()=>move(-1));next.addEventListener('click',()=>move(1));
    const reveal=target=>{const index=panels.findIndex(panel=>panel.contains(target));if(index>=0)choose(index)};
    view.addEventListener('invalid',event=>reveal(event.target),true);
    view.addEventListener('superpro:reveal-section',event=>reveal(event.target));
    // Existing loaders retain ownership of role-based hidden states.
    panels.forEach(panel=>new MutationObserver(()=>choose(current)).observe(panel,{attributes:true,attributeFilter:['hidden']}));
    const preferred=Array.from(select.options).findIndex(option=>option.textContent===config.preferred);choose(preferred<0?0:preferred);
  }
  function paginate(list,size=5){
    const nav=document.createElement('div');nav.className='focus-pagination';nav.setAttribute('aria-label','List pages');
    const previous=document.createElement('button'),next=document.createElement('button'),status=document.createElement('span');previous.type=next.type='button';previous.textContent='← Previous';next.textContent='Next →';status.setAttribute('role','status');nav.append(previous,status,next);list.after(nav);let page=0;
    function render(){const rows=Array.from(list.children).filter(row=>!row.hidden);const pages=Math.max(1,Math.ceil(rows.length/size));page=Math.min(page,pages-1);rows.forEach((row,index)=>row.classList.toggle('focus-page-hidden',Math.floor(index/size)!==page));nav.hidden=pages===1;previous.disabled=page===0;next.disabled=page===pages-1;status.textContent=`Page ${page+1} of ${pages} · ${rows.length} items`;}
    previous.addEventListener('click',()=>{page=Math.max(0,page-1);render()});next.addEventListener('click',()=>{page++;render()});
    const reveal=target=>{const rows=Array.from(list.children).filter(row=>!row.hidden);const index=rows.findIndex(row=>row.contains(target));if(index>=0){page=Math.floor(index/size);render()}};
    list.addEventListener('invalid',event=>reveal(event.target),true);list.addEventListener('superpro:reveal-section',event=>reveal(event.target));
    new MutationObserver(records=>{if(records.some(record=>record.type==='childList'||record.attributeName==='hidden')){page=0;render()}}).observe(list,{childList:true,subtree:true,attributes:true,attributeFilter:['hidden']});render();
  }
  function install(){
    for(const [id,config] of Object.entries(configurations)){const view=document.getElementById(id+'-view');if(view){if(id==='assistant'&&!document.getElementById('spai-v16'))window.addEventListener('superpro:ai-operations-ready',()=>installSections(view,config),{once:true});else installSections(view,config)}}
    for(const id of ['industry-browser-grid','workers','jobs','finance-job-profit','finance-entries','team-members','team-invitations','self-service-integration-grid','workspace-approval-list','threads','renders']){const list=document.getElementById(id);if(list)paginate(list)}
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install);else install();
})();
