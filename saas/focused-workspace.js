(() => {
  const configurations = {
    dashboard: {selector:'.operational-strip, .dashboard-grid > article, .dashboard-workflow', labels:['Business overview','Attention items','Readiness','Workflow guide'], companions:{0:'.gx-board'}},
    billing: {selector:':scope > .trial-hero, :scope > .pricing-grid, :scope > article', labels:['Current access','Compare plans','Payment connections','Usage & add-ons','Billing safeguards','Plan features']},
    approvals: {selector:'.approval-metrics, .two-column-layout > article, #approval-policy-host', labels:['Decision overview','Queue & history','Approval policy'],preferred:'Queue & history'},
    workforce: {selector:'.two-column-layout > article', preferred:'People'},
    jobs: {selector:'.two-column-layout > article', preferred:'Open work orders'},
    team: {selector:':scope > article, :scope > details', labels:['Business members','Invitation history']},
    integrations: {selector:':scope > article', preferred:'Your business connections'},
    governance: {selector:':scope > article, .gov-hero-grid > article, .gov-grid > article'},
    support: {selector:'.dashboard-grid > article'},
    manual: {selector:'.manual-layout > article, .manual-side > article, .manual-grid > article', labels:['Workspace map','Current area','Your role','Next steps','Connections guide','Help']},
    assistant: {selector:'.ai-command-strip, #spai-v16, .ai-layout > article', labels:['How AI works','Ask AI','Save an operational task','Saved tasks'],preferred:'Ask AI'},
    stock: {selector:'.two-column-layout > article, :scope > article', labels:['Reorder','Most used','Stock on hand'],preferred:'Stock on hand'},
    exports: {selector:'.export-grid > article',preferred:'Full workspace backup'},
    video: {selector:'.source-library-panel, .content-studio-grid > article, .studio-side > article'}
  };
  function installSections(view, config) {
    window.SuperProPageSections.install(view, Array.from(new Set(view.querySelectorAll(config.selector))), config);
  }
  function paginate(list,size=5){
    const nav=document.createElement('div');nav.className='focus-pagination';nav.setAttribute('aria-label','List pages');
    const previous=document.createElement('button'),next=document.createElement('button'),status=document.createElement('span');previous.type=next.type='button';previous.textContent='← Previous';next.textContent='Next →';status.setAttribute('role','status');nav.append(previous,status,next);list.after(nav);let page=0;
    function render(){const rows=Array.from(list.children).filter(row=>!row.hidden);const pages=Math.max(1,Math.ceil(rows.length/size));page=Math.min(page,pages-1);rows.forEach((row,index)=>row.classList.toggle('focus-page-hidden',Math.floor(index/size)!==page));nav.hidden=pages===1;previous.disabled=page===0;next.disabled=page===pages-1;status.textContent=`Page ${page+1} of ${pages} · ${rows.length} items`;}
    previous.addEventListener('click',()=>{page=Math.max(0,page-1);render()});next.addEventListener('click',()=>{page++;render()});
    const reveal=target=>{const rows=Array.from(list.children).filter(row=>!row.hidden);const index=rows.findIndex(row=>row.contains(target));if(index>=0){page=Math.floor(index/size);render()}};
    list.addEventListener('invalid',event=>reveal(event.target),true);list.addEventListener('superpro:reveal-section',event=>reveal(event.target));
    // A resource picker or requirements box changing inside a card is not a new list.
    // Only replacing the actual rows resets pagination; row visibility changes just clamp it.
    new MutationObserver(records=>{
      const replaced=records.some(record=>record.type==='childList'&&record.target===list);
      const visibility=records.some(record=>record.type==='attributes'&&record.target.parentElement===list);
      if(replaced||visibility){if(replaced)page=0;render()}
    }).observe(list,{childList:true,subtree:true,attributes:true,attributeFilter:['hidden']});render();
  }
  function install(){
    for(const [id,config] of Object.entries(configurations)){const view=document.getElementById(id+'-view');if(view){if(id==='assistant'&&!document.getElementById('spai-v16'))window.addEventListener('superpro:ai-operations-ready',()=>installSections(view,config),{once:true});else installSections(view,config)}}
    for(const id of ['industry-browser-grid','workers','jobs','finance-job-profit','finance-entries','team-members','team-invitations','self-service-integration-grid','workspace-approval-list','threads','renders']){const list=document.getElementById(id);if(list)paginate(list)}
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install);else install();
})();
