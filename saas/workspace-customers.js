// Customers: one record per customer with their jobs, before/after photos, and a reason when a photo is not available.
(()=>{
  const {el,api,onView,role,when,note}=window.SuperProUI;
  const $=s=>document.querySelector(s);
  const SENIOR=['owner','admin','manager','super_admin','director'];
  const STATUS={lead:'Future',current:'Current',past:'Past'};
  let list=[],selected='',reasons={};

  async function loadList(){
    const q=$('#cust-search')?.value||'',st=$('#cust-status')?.value||'';
    try{list=(await api(`/api/saas/customers?q=${encodeURIComponent(q)}&status=${encodeURIComponent(st)}`)).customers}catch{list=[]}
    $('#cust-list').replaceChildren(...(list.length?list.map(c=>el('button',{type:'button',class:'row-card cust-row'+(c.id===selected?' selected':''),onclick:()=>open(c.id)},
      el('header',{},el('div',{},el('b',{text:c.name}),el('div',{class:'muted',text:[c.phone,c.email].filter(Boolean).join(', ')||'No contact details'})),el('span',{class:'status-pill neutral',text:STATUS[c.status]})),
      el('small',{class:'muted',text:`${c.job_count} ${c.job_count===1?'job':'jobs'}${c.last_job_at?', last on '+new Date(c.last_job_at).toLocaleDateString('en-AU'):''}`}))):[el('div',{class:'empty-state'},el('b',{text:'No customers yet'}),el('span',{text:'Add one, or save an inbox conversation as a customer.'}))]));
  }
  const evidence=(count,reason,label)=>count?el('span',{class:'cust-chip ok',text:`${label}: ${count}`}):reason?el('span',{class:'cust-chip warn',title:reasons[reason]||reason,text:`${label}: ${reasons[reason]||reason}`}):el('span',{class:'cust-chip bad',text:`${label}: none yet`});
  async function open(id){
    selected=id;
    try{
      const d=await api('/api/saas/customers/'+id),c=d.customer;
      try{reasons=(await api(`/api/saas/work-orders/${d.jobs[0]?.id||'none'}/media`)).reasons||reasons}catch{}
      $('#cust-detail').replaceChildren(...[
        el('div',{class:'panel-head'},el('div',{},el('span',{class:'panel-kicker',text:STATUS[c.status].toUpperCase()+' CUSTOMER'}),el('h2',{text:c.name})),el('button',{class:'secondary-button compact',type:'button',text:'Edit',onclick:()=>edit(c)})),
        el('dl',{class:'cust-facts'},...[['Phone',c.phone],['Email',c.email],['Address',c.address],['Notes',c.notes]].filter(x=>x[1]).flatMap(([k,v])=>[el('dt',{text:k}),el('dd',{text:v})])),
        el('h3',{text:'Jobs'}),
        ...(d.jobs.length?d.jobs.map(j=>el('article',{class:'row-card'},el('header',{},el('div',{},el('b',{text:j.title}),el('div',{class:'muted',text:`${when(j.start_at)}${j.address?', '+j.address:''}`})),el('span',{class:'status',text:String(j.status).replaceAll('_',' ')})),
          el('div',{class:'cust-evidence'},evidence(j.before_count,j.before_reason,'Before'),evidence(j.after_count,j.after_reason,'After'),el('button',{class:'secondary-button compact',type:'button',text:'Open photos',onclick:()=>openMedia(j.id,j.title)})))):[el('div',{class:'empty-state'},el('b',{text:'No jobs yet'}),el('span',{text:'Link a job when you create it, under Jobs & Dispatch.'}))]),
        d.conversations.length?el('p',{class:'muted',text:`${d.conversations.length} conversation${d.conversations.length===1?'':'s'} in the Inbox match this customer's contact details.`}):null].filter(Boolean));
      document.querySelectorAll('.cust-row').forEach(r=>r.classList.remove('selected'));loadList();
    }catch(e){note(e.message,true)}
  }
  function edit(c){
    const f=$('#cust-form'),dlg=$('#cust-dialog');f.reset();f.dataset.id=c?.id||'';
    $('#cust-dialog-title').textContent=c?'Edit customer':'Add customer';
    for(const k of ['name','email','phone','address','status','notes'])f.elements[k].value=c?.[k]||(k==='status'?'current':'');
    dlg.showModal();
  }
  $('#cust-new')?.addEventListener('click',()=>edit(null));
  $('#cust-form')?.addEventListener('submit',async e=>{
    if(e.submitter?.value!=='save')return;
    e.preventDefault();const f=e.target,id=f.dataset.id,body=Object.fromEntries(new FormData(f));
    try{const r=await api(id?'/api/saas/customers/'+id:'/api/saas/customers',{method:id?'PATCH':'POST',body:JSON.stringify(body)});$('#cust-dialog').close();note('Customer saved.');await loadList();open(id||r.id)}catch(x){note(x.message,true)}
  });
  $('#cust-search')?.addEventListener('input',()=>{clearTimeout(loadList.t);loadList.t=setTimeout(loadList,250)});
  $('#cust-status')?.addEventListener('change',loadList);

  // ---- job photos dialog: used by staff on their own jobs and by seniors everywhere ----
  async function openMedia(jobId,title){
    const dlg=$('#jobmedia-dialog'),body=$('#jm-body');$('#jm-title').textContent=title||'Job photos';
    async function draw(){
      let d;try{d=await api(`/api/saas/work-orders/${jobId}/media`)}catch(e){body.replaceChildren(el('p',{text:e.message}));return}
      reasons=d.reasons;
      const stage=(name,label)=>{
        const items=d.media.filter(m=>m.stage===name),miss=d.missing.find(m=>m.stage===name);
        const input=el('input',{type:'file',accept:'image/*,video/*',multiple:true,capture:null,hidden:true});
        input.onchange=async()=>{if(!input.files.length)return;const fd=new FormData();fd.append('stage',name);[...input.files].slice(0,10).forEach(x=>fd.append('files',x));try{await api(`/api/saas/work-orders/${jobId}/media`,{method:'POST',body:fd});note('Added.');draw();loadList()}catch(e){note(e.message,true)}};
        const sel=el('select',{'aria-label':'Why is there no '+name+' photo?'},el('option',{value:'',text:'No photo? Choose why'}),...Object.entries(d.reasons).map(([k,v])=>el('option',{value:k,text:v})));
        const noteBox=el('input',{placeholder:'Short note (needed for Other)',maxlength:'500'});
        const save=el('button',{type:'button',class:'secondary-button compact',text:'Save reason',onclick:async()=>{if(!sel.value)return note('Choose a reason first.',true);try{await api(`/api/saas/work-orders/${jobId}/media-reason`,{method:'POST',body:JSON.stringify({stage:name,reason_code:sel.value,note:noteBox.value})});note('Reason saved.');draw();loadList()}catch(e){note(e.message,true)}}});
        return el('section',{class:'jm-stage'},el('h3',{text:label}),
          el('div',{class:'jm-grid'},...items.map(m=>el('figure',{},m.kind==='photo'?el('img',{src:`/api/saas/job-media/${m.id}/file`,alt:m.original_name,loading:'lazy'}):el('video',{src:`/api/saas/job-media/${m.id}/file`,controls:true,preload:'metadata',playsinline:true}),
            SENIOR.includes(role())?el('button',{type:'button',class:'media-del',text:'Remove',onclick:async()=>{if(!confirm('Remove this file?'))return;try{await api('/api/saas/job-media/'+m.id,{method:'DELETE'});draw();loadList()}catch(e){note(e.message,true)}}}):null))),
          miss&&!items.length?el('p',{class:'cust-chip warn',text:`No ${name} photo: ${d.reasons[miss.reason_code]||miss.reason_code}${miss.note?' ('+miss.note+')':''}`}):null,
          el('div',{class:'jm-actions'},el('button',{type:'button',class:'primary-button compact',text:'Add photo or video',onclick:()=>input.click()}),input),
          items.length?null:el('div',{class:'jm-reason'},sel,noteBox,save));
      };
      body.replaceChildren(stage('before','Before'),stage('after','After'));
    }
    await draw();dlg.showModal();
  }
  $('#jm-close')?.addEventListener('click',()=>$('#jobmedia-dialog').close());
  document.addEventListener('click',e=>{const b=e.target.closest('[data-job-media]');if(b)openMedia(b.dataset.jobMedia,b.dataset.jobTitle)});
  window.SuperProJobMedia={open:openMedia};

  async function fillJobCustomers(){
    if(window.GDS_SESSION?.access?.mode==='custom'?!window.SuperProCan('customers'):!SENIOR.includes(role()))return;
    try{const c=(await api('/api/saas/customers')).customers;const sel=$('#job-customer');if(sel){sel.replaceChildren(el('option',{value:'',text:'No customer linked'}),...c.map(x=>el('option',{value:x.id,text:x.name})));$('#job-customer-field').hidden=false}}catch{}
  }
  onView('customers',{enter:loadList});
  onView('jobs',{enter:fillJobCustomers});
})();
