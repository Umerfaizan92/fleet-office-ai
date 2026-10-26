// "Get paid" pad: one button in the top bar for every team member. Pick a job, pick how the customer pays, show the QR, watch it turn
// to Paid and see that the receipt reached the customer. Employees only see jobs they are on. Card numbers are typed by the customer
// on the payment provider's own page and never reach this app.
(()=>{
  const {el,api,money,note,role}=window.SuperProUI||{};if(!el)return;
  let dlg=null,state=null,timer=null;
  const cardLine=c=>`${(c.brand||'Card').replace(/^./,x=>x.toUpperCase())} •••• ${c.last4||'····'} · expires ${String(c.exp_month||'').padStart(2,'0')}/${String(c.exp_year||'').slice(-2)}`;
  const stop=()=>{if(timer){clearInterval(timer);timer=null}};
  const close=()=>{stop();if(dlg){try{dlg.close()}catch{}dlg.remove();dlg=null}};
  const head=(title,sub)=>el('div',{class:'pad-head'},el('div',{},el('h2',{text:title}),sub?el('p',{class:'muted',text:sub}):null),el('button',{type:'button',class:'icon-button',text:'×','aria-label':'Close',onclick:close}));
  async function qrInto(host,url){
    try{const r=await api('/api/saas/payments/qr?text='+encodeURIComponent(url));const img=document.createElement('img');img.alt='QR code for the payment link';img.width=220;img.height=220;img.src='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(r.svg);host.replaceChildren(img)}catch{host.textContent='The QR code could not be made. Use the link instead.'}
  }
  function cardBadge(c){
    const t=[c.cvc_check==='pass'?'security code checked':c.cvc_check==='fail'?'security code did not match':null,c.postal_check==='pass'?'postcode matched':c.postal_check==='fail'?'postcode did not match':null,c.three_d_secure==='authenticated'?'3-D Secure approved':null].filter(Boolean);
    return el('span',{class:`pay-badge pay-${c.expired?'bad':c.verified?'ok':'warn'}`,title:t.join(', '),text:c.expired?'Expired':c.verified?'Authorised by the card issuer':'Not fully verified'});
  }
  function pickJob(){
    const {jobs,ways,note:msg,scope}=state;
    const body=el('div',{class:'pad-body'},head('Get paid',scope==='my_jobs'?'Jobs you are on that still have a balance.':'Jobs with a balance owing.'));
    if(msg)body.append(el('p',{class:'pay-callout',text:msg}));
    if(!jobs.length)body.append(el('div',{class:'empty-state'},el('b',{text:'Nothing to collect right now'}),el('span',{text:scope==='my_jobs'?'You will see a job here once you have accepted it and it has a price.':'Jobs appear here once they have a price and a balance.'})));
    else body.append(el('div',{class:'pad-jobs'},...jobs.map(j=>el('button',{type:'button',class:'pad-job',disabled:!ways.length||null,onclick:()=>chooseWay(j)},el('span',{},el('b',{text:j.title}),el('small',{text:j.customer_name||'No customer saved'})),el('strong',{text:money(j.owing_cents)})))));
    dlg.replaceChildren(body);
  }
  function chooseWay(j){
    const {ways}=state,amount=el('input',{type:'number',min:'1',step:'0.01',max:String(j.owing_cents/100),value:String(j.owing_cents/100),'aria-label':'Amount (AUD)'});
    const sel=el('select',{'aria-label':'How will they pay?'},...ways.map(w=>el('option',{value:w.id,text:w.label})));
    const save=el('input',{type:'checkbox',id:'pad-save'});const send=el('input',{type:'checkbox',id:'pad-send'});
    const saveRow=el('label',{class:'fin-check'},save,el('span',{text:'Offer the customer a box to save their card for next time (they choose; we never see the number)'}));
    const sync=()=>{saveRow.hidden=!(sel.value==='stripe'&&j.customer_id)};sel.onchange=sync;sync();
    const go=el('button',{type:'button',class:'primary-button',text:'Get paid'});
    go.onclick=async()=>{go.disabled=true;go.textContent='Preparing…';try{const body={work_order_id:j.id,provider:sel.value,amount:Number(amount.value),send_to_customer:send.checked};if(sel.value==='stripe'&&save.checked)body.save_card=true;const r=await api('/api/saas/payments/pad/request',{method:'POST',body:JSON.stringify(body)});show(j,r)}catch(e){note(e.message,true);go.disabled=false;go.textContent='Get paid'}};
    const saved=(j.saved_cards||[]).filter(c=>!c.expired);
    const savedBox=saved.length&&state.can_charge_saved?el('div',{class:'pad-saved'},el('h3',{text:'Charge a saved card'}),el('p',{class:'muted',text:'This customer agreed to save a card with you. The card issuer checks every charge.'}),...saved.map(c=>el('div',{class:'pad-card'},el('div',{},el('b',{text:cardLine(c)}),cardBadge(c)),el('button',{type:'button',class:'secondary-button compact',text:'Charge this card',onclick:async e=>{const b=e.currentTarget;if(!confirm(`Charge ${money(Math.round(Number(amount.value)*100))} to ${cardLine(c)}?`))return;b.disabled=true;try{const r=await api('/api/saas/payments/saved-cards/'+c.id+'/charge',{method:'POST',body:JSON.stringify({work_order_id:j.id,amount:Number(amount.value)})});watch(j,r.payment.id,true)}catch(err){note(err.message,true);b.disabled=false}}})))):null;
    dlg.replaceChildren(el('div',{class:'pad-body'},head(j.title,j.customer_name?`For ${j.customer_name}. Owing ${money(j.owing_cents)}.`:`Owing ${money(j.owing_cents)}.`),
      el('label',{},el('span',{text:'Amount (AUD)'}),amount),el('label',{},el('span',{text:'How will they pay?'}),sel),saveRow,
      el('label',{class:'fin-check'},send,el('span',{text:j.can_message?'Also send the link to the customer now (email and text)':'Also send the link (this customer has no email or mobile saved)',})),
      el('div',{class:'pay-actions'},go,el('button',{type:'button',class:'text-button',text:'Back',onclick:pickJob})),savedBox));
    if(!j.can_message)send.disabled=true;
  }
  function show(j,r){
    const p=r.payment,box=el('div',{class:'tap-qr',text:'Making the code…'}),status=el('div',{class:'pad-status',role:'status'},el('span',{class:'pay-badge pay-warn',text:'Waiting for the customer'}));
    const body=el('div',{class:'pad-body'},head(`Customer pays ${money(p.amount_cents)}`,j.title));
    if(p.checkout_url){
      const link=el('input',{readonly:true,value:p.checkout_url,'aria-label':'Payment link'});
      body.append(box,el('p',{class:'muted',text:'Ask the customer to scan this with their phone camera, or send them the link. They can pay with Apple Pay, Google Pay or a card on the provider’s own secure page.'}),link,
        el('div',{class:'pay-actions'},el('button',{type:'button',class:'secondary-button compact',text:'Copy link',onclick:async()=>{try{await navigator.clipboard.writeText(p.checkout_url);note('Copied.')}catch{link.select()}}}),navigator.share?el('button',{type:'button',class:'secondary-button compact',text:'Share',onclick:()=>navigator.share({title:'Payment',url:p.checkout_url}).catch(()=>{})}):null,window.SuperProTap?el('button',{type:'button',class:'secondary-button compact',text:'Full-screen code',onclick:()=>window.SuperProTap.open(p.checkout_url,p.amount_cents)}):null));
      qrInto(box,p.checkout_url);
    }else if(r.bank){body.append(el('p',{},el('b',{text:'Bank transfer. '}),'Ask the customer to use this reference:'),el('pre',{class:'pay-pre',text:`${r.bank.details}\nReference: ${r.bank.reference}`}),el('p',{class:'muted',text:'The business confirms bank transfers once the money arrives, then the receipt goes out.'}))}
    body.append(status,el('div',{class:'pay-actions'},el('button',{type:'button',class:'text-button',text:'Done for now',onclick:close})));
    dlg.replaceChildren(body);
    if(p.checkout_url)watch(j,p.id,false,status);
  }
  function watch(j,id,instant,statusEl){
    stop();
    if(instant){dlg.replaceChildren(el('div',{class:'pad-body'},head('Payment',j.title),statusEl=el('div',{class:'pad-status',role:'status'},el('span',{class:'pay-badge pay-warn',text:'Confirming with the card issuer…'}))))}
    let n=0;
    const tick=async()=>{
      n+=1;if(n>150){stop();return}
      try{const r=await api('/api/saas/payments/pad/status/'+id);const st=r.payment.status;
        if(st==='paid'){stop();paid(j,r,statusEl)}
        else if(['failed','cancelled','expired'].includes(st)){stop();statusEl.replaceChildren(el('span',{class:'pay-badge pay-bad',text:st==='failed'?'The payment did not go through':'This request is no longer active'}),el('p',{class:'muted',text:r.payment.failure_reason||'Create a new request to try again.'}))}
      }catch{}
    };
    tick();timer=setInterval(tick,4000);
  }
  function paid(j,r,statusEl){
    const rc=r.receipts||[],sent=rc.filter(x=>x.status==='sent'),failed=rc.filter(x=>x.status==='failed'||x.status==='not_configured');
    const line=sent.length?`Receipt ${r.payment.receipt_no} sent by ${[...new Set(sent.map(x=>x.channel==='sms'?'text message':'email'))].join(' and ')}.`:rc.length&&failed.length?`Receipt ${r.payment.receipt_no} could not be delivered (${failed.map(x=>String(x.detail||x.status).replaceAll('_',' ')).join(', ')}). Print it or try again.`:`Receipt ${r.payment.receipt_no} is saved. This customer has no email or mobile on file, so print it or add their details.`;
    statusEl.replaceChildren(el('div',{class:'pad-paid'},el('span',{class:'pad-tick','aria-hidden':'true',text:'✓'}),el('div',{},el('b',{text:`Paid ${money(r.payment.amount_cents)}`}),el('p',{text:line}))),
      el('div',{class:'pay-actions'},window.SuperProReceipt?el('button',{type:'button',class:'primary-button compact',text:'Print receipt',onclick:()=>window.SuperProReceipt.printPayment(r.payment.id)}):null,el('button',{type:'button',class:'secondary-button compact',text:'Send receipt again',onclick:async e=>{e.currentTarget.disabled=true;try{const s=await api('/api/saas/payments/pad/'+r.payment.id+'/receipt',{method:'POST',body:'{}'});note(s.sent.map(x=>`${x.channel}: ${String(x.status).replaceAll('_',' ')}`).join(', ')||'No email or mobile saved for this customer.')}catch(err){note(err.message,true)}finally{e.currentTarget.disabled=false}}}),el('button',{type:'button',class:'text-button',text:'Close',onclick:close})));
    document.dispatchEvent(new CustomEvent('gds:payment-received',{detail:{id:r.payment.id}}));
  }
  async function open(){
    if(dlg)return;
    dlg=el('dialog',{class:'modal pad-modal','data-modal-priority':''},el('div',{class:'pad-body'},el('p',{class:'muted',text:'Loading…'})));
    dlg.addEventListener('close',()=>{stop();if(dlg){dlg.remove();dlg=null}});document.body.append(dlg);dlg.showModal();
    try{state=await api('/api/saas/payments/pad');pickJob()}catch(e){dlg.replaceChildren(el('div',{class:'pad-body'},head('Get paid'),el('p',{class:'muted',text:e.message})))}
  }
  function mount(){
    if(document.querySelector('#pad-open'))return;
    const anchor=document.querySelector('#open-digital-manual');if(!anchor)return;
    anchor.before(el('button',{type:'button',id:'pad-open',class:'pad-top-button',onclick:open,'aria-label':'Get paid: take a payment from a customer'},el('span',{'aria-hidden':'true',text:'$'}),el('b',{text:'Get paid'})));
  }
  const ready=()=>{mount()};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',ready);else ready();
  window.SuperProPad={open};
})();
