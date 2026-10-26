// Business Setup: a plain checklist that shows what is done and jumps to what is next. Wording follows the business type.
(()=>{
  const {el,api,onView,role}=window.SuperProUI;
  let host=null;
  async function safe(url){try{return await api(url)}catch{return null}}
  async function build(){
    const view=document.querySelector('#onboarding-view');if(!view)return;
    if(!host){host=el('section',{class:'panel setup-check','aria-label':'Setup checklist'});(view.querySelector('.page-heading')||view.firstElementChild).after(host)}
    const owner=['owner','admin','super_admin'].includes(role());
    const [cc,ob,jobs,conn,oh]=await Promise.all([safe('/api/saas/command-centre'),safe('/api/saas/onboarding'),safe('/api/saas/work-orders'),safe('/api/saas/integrations/self-service'),owner?safe('/api/saas/finance/overheads'):null]);
    const T=cc?.terms||{job:'Job',jobs:'Jobs',customer:'Customer',team:'Team'},p=ob?.profile||{};
    const connected=(conn?.integrations||conn?.providers||[]).filter?.(x=>x.status==='connected').length||0;
    const steps=[
      {done:!!(p.completed_at||p.business_type),title:'Tell us what your business does',text:'Pick your industry so every page uses your words.',view:'onboarding'},
      {done:(p.services||[]).length>0,title:'List your services',text:`What you sell, so quotes and ${T.customer.toLowerCase()} replies are accurate.`,view:'onboarding'},
      {done:!!p.phone||!!p.website,title:'Add contact details',text:'Phone and website go on replies and documents.',view:'onboarding'},
      {done:connected>0,title:'Connect a channel',text:'Facebook, Instagram, WhatsApp, email and more, so enquiries land in one inbox.',view:'integrations'},
      {done:(jobs?.jobs||[]).length>0,title:`Create your first ${T.job.toLowerCase()}`,text:'Jobs drive scheduling and profit.',view:'jobs'},
      ...(owner?[{done:(oh?.overheads||[]).length>0,title:'Add fixed overheads',text:'Rent, insurance and software, so profit is real.',view:'finance'}]:[])
    ];
    const done=steps.filter(s=>s.done).length;
    host.replaceChildren(
      el('div',{class:'setup-head'},el('div',{},el('h2',{text:done===steps.length?'Your workspace is set up':`Set up your workspace: ${done} of ${steps.length} done`}),el('p',{text:cc?.business?.industry&&cc.business.code!=='custom'?`Tuned for ${cc.business.industry.toLowerCase()}.`:'Do these in any order. Each one takes a minute or two.'})),
        el('div',{class:'setup-bar',role:'progressbar','aria-valuenow':String(done),'aria-valuemin':'0','aria-valuemax':String(steps.length)},el('i',{style:`width:${Math.round(done/steps.length*100)}%`}))),
      el('ol',{class:'setup-list'},...steps.map(s=>el('li',{class:s.done?'done':''},el('span',{class:'setup-tick','aria-hidden':'true',text:s.done?'✓':''}),el('div',{},el('b',{text:s.title}),el('small',{text:s.text})),s.done?el('em',{text:'Done'}):el('button',{type:'button',class:'secondary-button compact','data-jump':s.view,text:'Open'})))));
  }
  onView('onboarding',{enter:build});
})();
