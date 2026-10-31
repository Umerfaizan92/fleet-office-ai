// Hiring (owner/admin only). Everything here talks to /api/saas/hiring/*, which keeps its own tables and files.
// DOM is built with textContent only so applicant-supplied text can never inject markup.
(()=>{
  const {el,api,onView,note,role,when}=window.SuperProUI||{};if(!el)return;
  const root=()=>document.querySelector('#hiring-root');
  const STATUS=['new','shortlisted','interview','hired','declined'];
  let tab='roles',meta=null;
  const copy=async t=>{try{await navigator.clipboard.writeText(t);note('Copied.')}catch{note('Copy failed. Select the text and copy it.',true)}};
  const btn=(text,fn,cls='secondary-button compact')=>{const b=el('button',{class:cls,type:'button',text});b.onclick=fn;return b};
  const closeDlg=d=>{d.close();d.remove()};
  const dialog=(title,...kids)=>{const d=el('dialog',{class:'modal hire-dlg'},el('h2',{text:title}),...kids);d.addEventListener('cancel',()=>d.remove());document.body.append(d);d.showModal();return d};

  function roleForm(r,done){
    const f={title:el('input',{name:'title',value:r?.title||'',required:true,maxlength:'120'}),type:el('select',{name:'employment_type'},...meta.employment.map(e=>el('option',{value:e.id,text:e.label,selected:r?.employment_type===e.id}))),
      loc:el('input',{name:'location',value:r?.location||'',maxlength:'160',placeholder:'e.g. Perth, WA'}),pay:el('input',{name:'pay_text',value:r?.pay_text||'',maxlength:'120',placeholder:'e.g. $32 to $38 an hour plus super'}),
      desc:el('textarea',{name:'description',maxlength:'4000',placeholder:'What the person will do, hours, team…'},r?.description||''),req:el('textarea',{name:'requirements',maxlength:'3000',placeholder:'Licences, tickets, experience…'},r?.requirements||'')};
    f.desc.value=r?.description||'';f.req.value=r?.requirements||'';
    const err=el('p',{class:'muted',role:'alert'}),save=el('button',{class:'primary-button',type:'submit',text:r?'Save role':'Create role'}),cancel=el('button',{class:'secondary-button',type:'button',text:'Cancel'});
    const form=el('form',{class:'hire-form',novalidate:true},el('label',{class:'wide'},el('span',{text:'Job title'}),f.title),el('label',{},el('span',{text:'Type'}),f.type),el('label',{},el('span',{text:'Location'}),f.loc),
      el('label',{class:'wide'},el('span',{text:'Pay (only what you can honestly offer)'}),f.pay),el('label',{class:'wide'},el('span',{text:'About the job'}),f.desc),el('label',{class:'wide'},el('span',{text:'What you need'}),f.req),err,el('div',{class:'dialog-actions wide'},cancel,save));
    const d=dialog(r?'Edit role':'New role',form);cancel.onclick=()=>closeDlg(d);
    form.onsubmit=async e=>{e.preventDefault();save.disabled=true;err.textContent='';try{await api(r?`/api/saas/hiring/roles/${r.id}`:'/api/saas/hiring/roles',{method:r?'PUT':'POST',body:JSON.stringify({title:f.title.value,employment_type:f.type.value,location:f.loc.value,pay_text:f.pay.value,description:f.desc.value,requirements:f.req.value})});closeDlg(d);note('Saved.');done()}catch(x){err.textContent=x.message;save.disabled=false}};
  }

  function sendInvitation(ad){
    const email=el('input',{name:'email',type:'email',placeholder:'Recipient email'}),phone=el('input',{name:'phone',type:'tel',placeholder:'Mobile (optional)',maxlength:'30'}),message=el('textarea',{name:'message',maxlength:'300',placeholder:'Short personal message (optional)'}),follow=el('input',{type:'checkbox',checked:true});
    const status=el('p',{role:'status','aria-live':'polite'}),send=el('button',{type:'submit',class:'primary-button',text:'Send invitation'}),requestId=crypto.randomUUID();
    const form=el('form',{class:'hire-form'},el('label',{},'Email',email),el('label',{},'SMS mobile',phone),el('label',{class:'wide'},'Message',message),el('label',{class:'wide'},follow,' Send one email follow-up after 24 hours if there is no reply'),status,el('div',{class:'dialog-actions wide'},send));
    const d=dialog('Send hiring invitation',form);d.append(btn('Close',()=>closeDlg(d)));
    form.onsubmit=async event=>{event.preventDefault();if(!email.value.trim()&&!phone.value.trim()){status.textContent='Enter an email or mobile.';return}send.disabled=true;status.textContent='Sending…';
      try{const r=await api(`/api/saas/hiring/ads/${ad.id}/send`,{method:'POST',body:JSON.stringify({request_id:requestId,email:email.value.trim(),phone:phone.value.trim(),message:message.value.trim(),follow_up:follow.checked})});status.textContent=`Email: ${r.delivery.email.sent?'accepted by provider':r.delivery.email.reason}. SMS: ${r.delivery.sms.sent?'accepted by provider':r.delivery.sms.reason}. ${r.note}`}catch(e){status.textContent=e.message;send.disabled=false}
    };
  }

  async function adsDialog(r){
    const body=el('div',{class:'hire-grid'});const d=dialog(`Advertise: ${r.title}`,
      el('p',{class:'muted',text:'Pick where to advertise. AI writes a draft for each place. Read, edit and approve each one. Approved adverts get a share button that opens the platform with your text ready. Each place has its own tracked apply link, so you can see which one works.'}),body);
    const pick=el('div',{class:'hire-chips'});const checks=meta.platforms.map(p=>{const c=el('input',{type:'checkbox',value:p.id,checked:['facebook','google','whatsapp','email'].includes(p.id)});pick.append(el('label',{class:'hire-chip'},c,' '+p.label));return c});
    const gen=btn('Write drafts with AI',async()=>{const ids=checks.filter(c=>c.checked).map(c=>c.value);if(!ids.length)return note('Choose at least one place.',true);gen.disabled=true;try{const x=await api(`/api/saas/hiring/roles/${r.id}/ads/generate`,{method:'POST',body:JSON.stringify({platforms:ids})});note(x.note);await list()}catch(e){note(e.message,true)}finally{gen.disabled=false}},'primary-button compact');
    d.insertBefore(pick,body);d.insertBefore(el('div',{class:'hire-actions'},gen,btn('Copy apply link',()=>copy(r.apply_link))),body);
    d.append(el('div',{class:'dialog-actions'},btn('Close',()=>closeDlg(d))));
    async function list(){
      const x=await api(`/api/saas/hiring/roles/${r.id}/ads`);body.replaceChildren(...(x.ads.length?x.ads.map(ad=>{
        const ta=el('textarea',{maxlength:'3000'});ta.value=ad.body;
        const row=el('div',{class:'hire-ad'},el('div',{class:'hire-row'},el('b',{text:ad.label}),el('span',{class:'status-pill '+(ad.status==='draft'?'warn':'ok'),text:ad.status==='draft'?'Draft':ad.status==='approved'?'Approved':'Shared'})),ta,
          el('div',{class:'hire-actions'},btn('Save edits',async()=>{try{await api(`/api/saas/hiring/ads/${ad.id}`,{method:'PUT',body:JSON.stringify({headline:ad.headline,body:ta.value})});note('Saved.');list()}catch(e){note(e.message,true)}}),
            ad.status==='draft'?btn('Approve',async()=>{try{await api(`/api/saas/hiring/ads/${ad.id}/approve`,{method:'POST',body:'{}'});list()}catch(e){note(e.message,true)}},'primary-button compact'):null,
            btn('Copy text',()=>copy(ta.value)),ad.status!=='draft'?btn('Send email / SMS invitation',()=>sendInvitation(ad),'primary-button compact'):null,
            ad.share_url?btn(`Open ${ad.label.split(' ')[0]}`,()=>{window.open(ad.share_url,'_blank','noopener')}):null,
            ad.status==='approved'?btn('Mark as posted',async()=>{try{await api(`/api/saas/hiring/ads/${ad.id}/shared`,{method:'POST',body:'{}'});list()}catch(e){note(e.message,true)}}):null));
        if(ad.status==='draft')row.append(el('p',{class:'muted',text:'Approve this advert to unlock sharing.'}));
        return row}):[el('p',{class:'muted',text:'No adverts yet. Choose places above and write drafts.'})]));
    }
    list().catch(e=>note(e.message,true));
  }

  async function applicantDialog(id,done){
    const {applicant:a}=await api(`/api/saas/hiring/applicants/${id}`);
    const sel=el('select',{},...STATUS.map(s=>el('option',{value:s,text:s[0].toUpperCase()+s.slice(1),selected:a.status===s})));
    const notes=el('textarea',{maxlength:'3000',placeholder:'Private notes'});notes.value=a.notes||'';
    const sum=el('div',{class:'hire-sum',text:a.ai_summary||'No summary yet.'});
    const docs=a.documents.length?el('ul',{class:'hire-docs'},...a.documents.map(x=>el('li',{},el('a',{href:`/api/saas/hiring/documents/${x.id}/download`,text:`${x.kind}: ${x.original_name} (${Math.ceil(x.size_bytes/1024)} KB)`,rel:'noopener'})))):el('p',{class:'muted',text:'No documents uploaded.'});
    const d=dialog(a.full_name,
      el('p',{class:'muted',text:`${a.role_title} · applied ${when(a.created_at)}${a.source?` · via ${a.source}`:''}`}),
      el('p',{},`Email: ${a.email||'-'}  ·  Phone: ${a.phone||'-'}  ·  Suburb: ${a.suburb||'-'}`),
      el('p',{},`Availability: ${a.availability||'-'}`),el('p',{text:a.message||'(No message)'}),
      el('h3',{text:'Documents'}),docs,
      el('h3',{text:'AI reading aid (draft, not a recommendation)'}),sum,
      el('div',{class:'hire-actions'},btn('Write summary',async()=>{try{const x=await api(`/api/saas/hiring/applicants/${id}/summarise`,{method:'POST',body:'{}'});sum.textContent=x.summary;note(x.note)}catch(e){note(e.message,true)}})),
      el('h3',{text:'Your decision'}),el('div',{class:'hire-row'},el('label',{},'Status ',sel)),notes,
      el('p',{class:'muted',text:`Consent recorded ${when(a.consent_at)}. Kept until ${when(a.retention_until)}, then deleted automatically.`}));
    const save=btn('Save',async()=>{try{await api(`/api/saas/hiring/applicants/${id}`,{method:'PATCH',body:JSON.stringify({status:sel.value,notes:notes.value})});closeDlg(d);note('Saved.');done()}catch(e){note(e.message,true)}},'primary-button');
    const del=btn('Delete permanently',async()=>{if(!confirm('Permanently delete this application and every uploaded document? This cannot be undone.'))return;try{await api(`/api/saas/hiring/applicants/${id}`,{method:'DELETE'});closeDlg(d);note('Deleted.');done()}catch(e){note(e.message,true)}});
    d.append(el('div',{class:'dialog-actions'},del,btn('Close',()=>closeDlg(d)),save));
  }

  async function render(){
    const host=root();if(!host)return;
    if(window.GDS_SESSION?.access?.mode==='custom'?!window.SuperProCan('hiring'):!['owner','admin'].includes(role())){host.replaceChildren(el('p',{class:'muted',text:'Only an owner or admin can open Hiring.'}));return}
    try{meta=await api('/api/saas/hiring/summary')}catch(e){host.replaceChildren(el('p',{class:'muted',text:e.message}));return}
    const ap=meta.applicants||{},total=Object.values(ap).reduce((n,x)=>n+x,0);
    const head=[el('p',{class:'hire-lock',text:'Private to owners and admins. Applicants\' details and documents are stored apart from everything else, are never used for customers, jobs or search, and are deleted automatically after 12 months.'}),
      el('div',{class:'hire-chips'},el('span',{class:'hire-chip',text:`${meta.open_roles} open role${meta.open_roles===1?'':'s'}`}),el('span',{class:'hire-chip',text:`${ap.new||0} new`}),el('span',{class:'hire-chip',text:`${total} applicant${total===1?'':'s'} in total`})),
      el('div',{class:'hire-tabs',role:'tablist','aria-label':'Hiring sections'},...[['roles','Roles and adverts'],['applicants','Applicants']].map(([k,l])=>{const b=btn(l,()=>{tab=k;render()},tab===k?'primary-button compact':'secondary-button compact');b.setAttribute('role','tab');b.setAttribute('aria-selected',String(tab===k));b.dataset.sectionKey=k;return b}))];
    const body=el('div',{class:'hire-grid'});host.replaceChildren(...head,body);
    if(tab==='roles'){
      const {roles}=await api('/api/saas/hiring/roles');
      body.replaceChildren(...(roles.length?roles.map(r=>el('article',{class:'panel hire-card'},el('div',{class:'hire-row'},el('b',{text:r.title}),el('span',{class:'status-pill '+(r.status==='open'?'ok':'neutral'),text:r.status==='open'?'Open':'Closed'})),
        el('p',{class:'muted',text:`${r.employment_label}${r.location?' · '+r.location:''}${r.pay_text?' · '+r.pay_text:''}`}),el('p',{class:'muted',text:`${r.applicants} applicant${r.applicants===1?'':'s'}`}),
        el('div',{class:'hire-actions'},btn('Advertise',()=>adsDialog(r),'primary-button compact'),btn('Edit',()=>roleForm(r,render)),btn('Copy apply link',()=>copy(r.apply_link)),
          btn(r.status==='open'?'Close role':'Reopen',async()=>{try{await api(`/api/saas/hiring/roles/${r.id}/${r.status==='open'?'close':'open'}`,{method:'POST',body:'{}'});render()}catch(e){note(e.message,true)}})))):[el('p',{class:'muted',text:'No roles yet. Create one and Super Pro will help you advertise it everywhere.'})]));
    }else{
      const {applicants}=await api('/api/saas/hiring/applicants');
      body.replaceChildren(...(applicants.length?applicants.map(a=>el('article',{class:'panel hire-card'},el('div',{class:'hire-row'},el('b',{text:a.full_name}),el('span',{class:'status-pill '+(a.status==='new'?'warn':'neutral'),text:a.status})),
        el('p',{class:'muted',text:`${a.role_title} · ${when(a.created_at)}${a.source?` · ${a.source}`:''} · ${a.documents} document${a.documents===1?'':'s'}`}),btn('Open',()=>applicantDialog(a.id,render).catch(e=>note(e.message,true)),'primary-button compact'))):[el('p',{class:'muted',text:'No applications yet.'})]));
    }
  }
  document.addEventListener('click',e=>{if(e.target.closest('#hire-new-role')){(async()=>{if(!meta)try{meta=await api('/api/saas/hiring/summary')}catch(x){return note(x.message,true)}roleForm(null,render)})()}});
  onView('hiring',{enter:()=>{render().catch(e=>note(e.message,true))}});
})();
