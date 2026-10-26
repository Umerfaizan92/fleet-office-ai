// Plans & Billing > "Payment connections": status per provider, the provider's own certification (information only),
// the owner's written authorisation, and the business bank-account form. DOM built with textContent only.
(()=>{
  const {el,api,onView,note,role}=window.SuperProUI||{};if(!el)return;
  const CHIP={live:['Ready','ok'],needs_authorisation:['Needs your confirmation','warn'],not_connected:['Not connected','neutral']};
  const when=iso=>iso?new Date(iso).toLocaleDateString('en-AU',{day:'numeric',month:'short',year:'numeric',timeZone:'Australia/Perth'}):'';

  function authDialog(p,done){
    const boxes=p.statements.map(s=>{const b=el('input',{type:'checkbox',name:s.key,id:`auth-${p.id}-${s.key}`});return [s,b]});
    const err=el('p',{class:'muted',role:'alert'});
    const ok=el('button',{class:'primary-button',type:'button',text:'Confirm authorisation',disabled:true});
    const cancel=el('button',{class:'secondary-button',type:'button',text:'Cancel'});
    const sync=()=>{ok.disabled=!boxes.every(([,b])=>b.checked)};
    const dlg=el('dialog',{class:'modal sp-dlg'},el('h2',{text:`Authorise ${p.name}`}),
      el('p',{class:'muted',text:'Tick each statement. We record who confirmed, when, and which version of these statements they saw.'}),
      ...boxes.map(([s,b])=>{b.onchange=sync;return el('label',{class:'legal-agree'},b,el('span',{text:' '+s.text}))}),err,
      el('div',{class:'dialog-actions'},cancel,ok));
    cancel.onclick=()=>{dlg.close();dlg.remove()};
    dlg.addEventListener('cancel',()=>dlg.remove());
    ok.onclick=async()=>{ok.disabled=true;try{await api('/api/saas/billing/authorise',{method:'POST',body:JSON.stringify({provider:p.id,confirmed:boxes.filter(([,b])=>b.checked).map(([s])=>s.key)})});dlg.close();dlg.remove();note('Authorised.');done()}catch(e){err.textContent=e.message;ok.disabled=false}};
    document.body.append(dlg);dlg.showModal();
  }

  function bankForm(settings,done){
    const b=settings?.bank||{};
    const f={name:el('input',{name:'bank_account_name',value:b.account_name||'',maxlength:'80',autocomplete:'off'}),bsb:el('input',{name:'bank_bsb',value:b.bsb||'',inputmode:'numeric',placeholder:'123-456',autocomplete:'off'}),acc:el('input',{name:'bank_account_number',value:b.account_number||'',inputmode:'numeric',placeholder:'5 to 9 digits',autocomplete:'off'}),payid:el('input',{name:'payid',value:b.payid||'',maxlength:'80',placeholder:'Optional',autocomplete:'off'})};
    const save=el('button',{class:'primary-button compact',type:'submit',text:'Save bank details'});
    const form=el('form',{class:'bill-bank'},
      el('label',{},el('span',{text:'Account name'}),f.name),el('label',{},el('span',{text:'BSB'}),f.bsb),
      el('label',{},el('span',{text:'Account number'}),f.acc),el('label',{},el('span',{text:'PayID (optional)'}),f.payid),
      el('p',{class:'muted',text:'Shown to your customers on invoices and pay links when they choose bank transfer. We never move money out of this account.'}),save);
    form.onsubmit=async e=>{e.preventDefault();save.disabled=true;try{await api('/api/saas/payments/settings',{method:'PUT',body:JSON.stringify({bank_account_name:f.name.value.trim(),bank_bsb:f.bsb.value.trim(),bank_account_number:f.acc.value.trim(),payid:f.payid.value.trim()})});note('Bank details saved.');done()}catch(err){note(err.message,true)}finally{save.disabled=false}};
    return form;
  }

  async function load(){
    const panel=document.querySelector('#billing-view .billing-providers');if(!panel)return;
    if(!['owner','admin'].includes(role())){panel.querySelector('#billing-provider-grid')?.replaceChildren(el('p',{class:'muted',text:'Only an owner or admin can change payment connections.'}));return}
    let setup,ps=null;
    try{setup=await api('/api/saas/billing/setup')}catch{return}
    try{ps=(await api('/api/saas/payments/settings')).settings}catch{}
    const head=panel.querySelector('.panel-head h2');if(head)head.textContent='Payment connections';
    const sub=panel.querySelector('.panel-head p');if(sub)sub.textContent='Connect the ways your customers can pay you, then confirm you are authorised to use each one. The money goes straight to your own account.';
    const cards=setup.providers.map(p=>{
      const [label,tone]=CHIP[p.status]||CHIP.not_connected;
      const actions=el('div',{class:'dialog-actions'});
      if(p.id!=='bank'){const go=el('button',{class:'secondary-button compact',type:'button',text:p.connected?'Change keys':'Connect'});go.onclick=()=>{location.hash='#money/ledger';setTimeout(()=>document.querySelector('[data-fin-tab="payments"],[data-fin-tab=getpaid],[data-tab="payments"]')?.click(),400)};actions.append(go)}
      if(p.connected&&!p.authorised){const a=el('button',{class:'primary-button compact',type:'button',text:'Confirm authorisation'});a.onclick=()=>authDialog(p,load);actions.append(a)}
      if(p.authorised){const w=el('button',{class:'secondary-button compact',type:'button',text:'Withdraw'});w.onclick=async()=>{if(!confirm('Withdraw authorisation? New payment links for this method pause until you confirm again.'))return;try{await api('/api/saas/billing/withdraw',{method:'POST',body:JSON.stringify({provider:p.id})});load()}catch(e){note(e.message,true)}};actions.append(w)}
      const body=[el('div',{class:'bill-head'},el('b',{text:p.name}),el('span',{class:'status-pill '+tone,text:label})),
        el('p',{class:'muted',text:'You need: '+p.needs}),el('p',{class:'muted bill-cert',text:p.certification}),
        p.authorised?el('p',{class:'bill-ok',text:`Authorised on ${when(p.authorised_at)}.`}):null];
      if(p.id==='bank')body.push(bankForm(ps,load));
      body.push(actions);
      return el('div',{class:'row-card bill-card'},...body);
    });
    const grid=panel.querySelector('#billing-provider-grid');
    grid.className='bill-grid';grid.replaceChildren(...cards,el('p',{class:'muted bill-foot',text:'Certifications shown belong to the provider, not to Super Pro. Wallets (Apple Pay, Google Pay) appear on the pay page only when your Stripe account has them switched on. Where a provider requires its own review or app approval, that happens in the provider\'s dashboard and only they can grant it.'}));
  }
  window.addEventListener('gds:viewchange',e=>{if(e.detail?.view==='billing')load().catch(()=>{})});
})();
