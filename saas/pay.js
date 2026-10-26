// Public invoice payment page. Everything shown comes from the server; text is inserted with textContent.
(()=>{
  const card=document.getElementById('pay-card'),token=location.pathname.split('/').filter(Boolean).pop(),q=new URLSearchParams(location.search);
  const h=(tag,text,cls,attrs)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=text;if(cls)e.className=cls;if(attrs)for(const[k,v]of Object.entries(attrs))e.setAttribute(k,v);return e};
  const money=c=>new Intl.NumberFormat('en-AU',{style:'currency',currency:'AUD'}).format(c/100);
  const day=s=>new Date(s).toLocaleDateString('en-AU',{day:'numeric',month:'long',year:'numeric',timeZone:'Australia/Perth'});
  const get=async(u,o)=>{const r=await fetch(u,o),d=await r.json().catch(()=>({}));if(!r.ok)throw Object.assign(new Error(d.error||'Something went wrong.'),{data:d});return d};
  function bank(b){
    const box=h('div','','pay-bank'),dl=h('dl');
    box.append(h('b','Pay by bank transfer or PayID'),h('p','Use the invoice number as the payment reference so we can match it. We confirm your payment within one business day.','pay-muted'));
    [['Account name',b.account_name],['BSB',b.bsb],['Account number',b.account_number],b.payid?['PayID',b.payid]:null,['Reference',b.reference]].filter(Boolean).forEach(([k,v])=>{const dd=h('dd',v),cp=h('button','Copy','pay-copy',{type:'button'});cp.onclick=async()=>{try{await navigator.clipboard.writeText(v);cp.textContent='Copied'}catch{cp.textContent='Select and copy'}};dd.append(cp);dl.append(h('dt',k),dd)});
    box.append(dl);return box;
  }
  async function main(){
    let d;
    try{d=await get('/api/pay/'+encodeURIComponent(token))}catch(e){card.replaceChildren(h('h1','This link is not valid'),h('p',e.message,'pay-muted'));return}
    const inv=d.invoice;card.replaceChildren(h('h1','Invoice '+inv.number),h('p',inv.business+' · due '+day(inv.due_at),'pay-muted'),h('div',money(inv.total_cents),'pay-total'),h('p','Includes GST of '+money(inv.gst_cents)+'. Amounts are in Australian dollars.','pay-muted'));
    const ul=h('ul','','pay-lines');inv.lines.forEach(l=>{const li=h('li');li.append(h('span',l.description),h('span',money(l.cents)));ul.append(li)});card.append(ul);
    if(inv.status==='paid'||q.get('paid')){card.append(h('p',inv.status==='paid'?'This invoice is paid. Thank you.':'Thank you. We are confirming your payment and will email your receipt shortly.','pay-ok'));return}
    if(q.get('pending'))card.append(h('p','Your payment is still being confirmed. If you were charged, you will get a receipt by email.','pay-muted'));
    if(q.get('error'))card.append(h('p','We could not confirm that payment. You have not been charged twice: please try again or use another method.','pay-err'));
    const online=d.methods.filter(m=>m.kind!=='manual'),wrap=h('div','','pay-methods'),err=h('p','','pay-err');err.hidden=true;
    online.forEach((m,i)=>{const b=h('button',m.label,'pay-btn'+(i===0?' primary':''),{type:'button'});b.append(h('span','Pay '+money(inv.total_cents)));b.onclick=async()=>{wrap.querySelectorAll('button').forEach(x=>x.disabled=true);err.hidden=true;try{const r=await get('/api/pay/'+encodeURIComponent(token)+'/start',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({method:i===0?'auto':m.id})});location.href=r.url}catch(e){wrap.querySelectorAll('button').forEach(x=>x.disabled=false);err.textContent=e.message;err.hidden=false;if(e.data?.bank){card.append(bank(e.data.bank))}}};wrap.append(b)});
    if(wrap.children.length)card.append(wrap,err);
    if(d.bank)card.append(bank(d.bank));
    if(!online.length&&!d.bank)card.append(h('p','Online payment is not switched on for this invoice yet. Please reply to the invoice email and we will arrange payment with you.','pay-muted'));
    if(d.payee?.abn)card.append(h('p',d.payee.name+' · ABN '+d.payee.abn,'pay-muted'));
  }
  main();
})();
