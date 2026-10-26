// Operator screen: how subscribers pay you. Keys are typed here once, stored encrypted on the server, and never shown again.
(()=>{
  const h=(tag,text,cls,attrs)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=text;if(cls)e.className=cls;if(attrs)for(const[k,v]of Object.entries(attrs))e.setAttribute(k,v);return e};
  const NAMES={secret_key:'Secret key',webhook_secret:'Webhook signing secret',client_id:'Client ID',client_secret:'Client secret',live:'Use live mode (off = test mode)',access_token:'Access token',location_id:'Location ID',signature_key:'Webhook signature key',payment_link_url:'Zeller payment link (https://…)',account_name:'Account name',bsb:'BSB',account_number:'Account number',payid:'PayID (optional)'};
  const HELP={stripe:'Stripe Dashboard → Developers → API keys. Then Developers → Webhooks → add the address shown here, with the event "checkout.session.completed" (and "checkout.session.async_payment_succeeded" for direct debit).',paypal:'PayPal Developer → Apps & Credentials. Keep live mode off while you test with a sandbox account.',square:'Square Developer Dashboard → your app → credentials. Add the webhook address shown here for "payment.updated".',zeller:'Create a reusable payment link in your Zeller account and paste it here. Zeller does not tell us when it is paid, so you mark those invoices paid yourself.',bank:'Your own business account. This works from day one, costs nothing, and is the automatic fallback.'};
  async function load(){
    const view=document.getElementById('subpay-view');if(!view)return;
    const host=view.querySelector('#subpay-body');host.replaceChildren(h('p','Loading…','muted'));
    let d;try{d=await api('/api/admin/platform-pay')}catch(e){host.replaceChildren(h('p',e.message,'muted'));return}
    host.replaceChildren();
    if(!d.base_url_ok)host.append(h('div','Set PUBLIC_BASE_URL to your live https address on Render. Payment links and webhooks need it.','warning'));
    host.append(h('p',d.live_count?`${d.live_count} payment method${d.live_count===1?' is':'s are'} live. Subscribers see them in this order. If one fails to open, the next is tried automatically, and bank transfer is always shown last.`:'No payment method is live yet. Add your bank details first: it works straight away.','muted'));
    const list=h('div','','subpay-list');
    d.providers.forEach((p,idx)=>{
      const box=h('article','','panel subpay-card');
      const head=h('div','','subpay-head');head.append(h('b',`${idx+1}. ${p.label}`),h('span',p.live?'live':p.complete?'saved, off':'not set up','badge'));
      const up=h('button','↑','ghost',{type:'button','aria-label':'Move up'}),down=h('button','↓','ghost',{type:'button','aria-label':'Move down'});
      const move=async dir=>{const o=d.providers.map(x=>x.provider),i=o.indexOf(p.provider),j=i+dir;if(j<0||j>=o.length)return;[o[i],o[j]]=[o[j],o[i]];try{await api('/api/admin/platform-pay-order',{method:'PUT',body:JSON.stringify({order:o})});load()}catch(e){notice(e.message,true)}};
      up.onclick=()=>move(-1);down.onclick=()=>move(1);head.append(up,down);box.append(head,h('p',HELP[p.provider],'muted'));
      const form=h('form','','form-grid'),inputs={};
      p.fields.forEach(f=>{const lab=h('label');lab.append(h('span',NAMES[f]||f));let inp;if(f==='live'){inp=h('input','','',{type:'checkbox'});inp.checked=Boolean(p.values[f])}else{inp=h('input','','',{type:p.secret_fields.includes(f)?'password':'text',autocomplete:'off',placeholder:p.secret_fields.includes(f)&&p.values[f]?'Saved '+p.values[f]+' (leave blank to keep)':''});if(!p.secret_fields.includes(f))inp.value=p.values[f]||''}inputs[f]=inp;lab.append(inp);form.append(lab)});
      if(p.webhook_url)box.append(h('p','Webhook address to register: '+p.webhook_url,'muted'));
      const on=h('label','','subpay-on');const chk=h('input','','',{type:'checkbox'});chk.checked=p.enabled;on.append(chk,h('span',' Offer this to subscribers'));
      const save=h('button','Save','primary',{type:'submit'}),test=h('button','Test the details','ghost',{type:'button'});
      form.append(on,save,test);
      form.onsubmit=async e=>{e.preventDefault();const values={};for(const[f,i]of Object.entries(inputs))values[f]=i.type==='checkbox'?i.checked:i.value;try{const r=await api('/api/admin/platform-pay/'+p.provider,{method:'PUT',body:JSON.stringify({enabled:chk.checked,values})});notice(r.message);load()}catch(er){notice(er.message,true)}};
      test.onclick=async()=>{test.disabled=true;try{const r=await api('/api/admin/platform-pay/'+p.provider+'/test',{method:'POST',body:'{}'});notice(r.message)}catch(er){notice(er.message,true)}test.disabled=false};
      box.append(form);list.append(box);
    });
    host.append(list);
    if(d.recent.length){const t=h('div','','panel');t.append(h('h3','Recent payment attempts'));const ul=h('ul');d.recent.forEach(r=>ul.append(h('li',`${new Date(r.created_at).toLocaleString('en-AU')} · ${r.number} · ${r.provider} · ${r.status}${r.error?' · '+r.error:''}`)));t.append(ul);host.append(t)}
  }
  window.SuperProPay={load};
})();
