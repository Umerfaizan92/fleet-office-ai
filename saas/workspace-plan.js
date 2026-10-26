// Plans & Billing > "Your plan and what you have used". DOM built with textContent only.
(()=>{
  const {el,api,onView,note}=window.SuperProUI;
  async function load(){
    const host=document.querySelector('#billing-view');if(!host)return;
    let d;try{d=await api('/api/saas/entitlements')}catch{return}
    const rows=d.usage.map(u=>{
      const unlimited=u.limit<0,tone=u.percent>=100?'bad':u.percent>=80?'warn':'ok';
      return el('div',{class:'plan-use-row'},el('div',{class:'plan-use-head'},el('span',{text:u.label}),el('b',{text:unlimited?`${u.used.toLocaleString('en-AU')}${u.unit?' '+u.unit:''}, unlimited`:`${u.used.toLocaleString('en-AU')} of ${u.limit.toLocaleString('en-AU')}${u.unit?' '+u.unit:''}${u.extra?` (includes ${u.extra.toLocaleString('en-AU')} extra)`:''}`})),
        el('div',{class:'plan-use-bar',role:'progressbar','aria-valuenow':String(unlimited?0:u.percent),'aria-valuemin':'0','aria-valuemax':'100','aria-label':u.label},el('i',{class:'plan-use-'+tone,style:`width:${unlimited?4:Math.max(u.percent,2)}%`})));
    });
    const card=el('div',{class:'plan-block plan-usage',id:'plan-usage'},el('div',{class:'panel-head'},el('div',{},el('span',{class:'panel-kicker',text:'YOUR PLAN'}),el('h2',{text:`${d.plan.name}: what you have used`}),el('p',{text:d.locked?'Your trial has ended. Everything you have is safe and readable. Choose a plan to add more.':'Limits only stop new items being added. Nothing you already have is hidden or deleted.'}))),...rows);
    let ad=null;try{ad=await api('/api/saas/addons')}catch{}
    const money=c=>new Intl.NumberFormat('en-AU',{style:'currency',currency:'AUD'}).format(c/100);
    const pct=ad?.discount_pct||0;
    const tiers=ad?.discount_tiers||{};
    const addBlock=ad?el('div',{class:'plan-block plan-addons'},el('div',{class:'panel-head'},el('div',{},el('span',{class:'panel-kicker',text:'PAY FOR WHAT YOU USE'}),el('h2',{text:'Add extra room as you grow'}),el('p',{text:'Add as little or as much as you need. Prices are per month plus GST. We confirm each request and email you. Cancel any time.'}))),
      el('p',{class:'pack-banner',text:pct?`Your plan gets ${pct}% off every add-on. The price shown is already discounted.`:`Operations gets ${tiers.operations||25}% off add-ons and Scale gets ${tiers.scale||50}% off. Starter pays the list price.`}),
      el('div',{class:'gr-grid'},...ad.catalog.map(c=>{
        const qty=el('input',{type:'number',min:'1',max:String(c.max||20),value:'1','aria-label':`How many: ${c.name}`});
        const total=el('strong',{text:`${money(c.price_cents)} a month`});
        qty.oninput=()=>{const n=Math.max(1,Math.min(c.max||20,parseInt(qty.value||'1',10)||1));total.textContent=`${money(c.price_cents*n)} a month`};
        const b=el('button',{class:'secondary-button compact',type:'button',text:'Request'});
        b.onclick=async()=>{const n=Math.max(1,Math.min(c.max||20,parseInt(qty.value||'1',10)||1));b.disabled=true;try{const r=await api('/api/saas/addons',{method:'POST',body:JSON.stringify({addon_id:c.id,quantity:n})});note(r.message);await load()}catch(e){note(e.message,true);b.disabled=false}};
        return el('div',{class:'row-card'},el('b',{text:`${c.name}: ${c.unit}`}),el('div',{class:'muted',text:c.note}),
          el('div',{class:'pack-price'},el('span',{text:`${money(c.price_cents)} each`}),c.list_price_cents!==c.price_cents?el('s',{text:money(c.list_price_cents)}):null,c.list_price_cents!==c.price_cents?el('span',{class:'pack-off',text:`${pct}% off`}):null),
          el('label',{class:'pack-qty'},el('span',{text:'How many'}),qty),el('div',{class:'pack-foot'},total,b))})),
      ...(ad.mine.length?[el('h3',{text:'Your add-ons'}),...ad.mine.map(m=>{const x=el('button',{class:'secondary-button compact',type:'button',text:'Cancel'});x.onclick=async()=>{if(!confirm('Cancel this add-on? Anything you already saved stays.'))return;try{await api(`/api/saas/addons/${m.id}/cancel`,{method:'POST',body:'{}'});await load()}catch(e){note(e.message,true)}};return el('div',{class:'row-card'},el('b',{text:`${m.quantity} × ${m.name} (${m.unit})`}),el('div',{class:'muted',text:`${m.status==='active'?'Active':'Waiting for confirmation'} · ${money(m.monthly_cents)} a month${m.discount_pct?` · ${m.discount_pct}% plan discount`:''}`}),x)})]:[])):null;
    let inv=null;try{inv=await api('/api/saas/platform-invoices')}catch{}
    const invBlock=inv&&inv.invoices.length?el('div',{class:'plan-block plan-invoices'},el('div',{class:'panel-head'},el('div',{},el('span',{class:'panel-kicker',text:'INVOICES FROM SUPER PRO'}),el('h2',{text:'Your subscription invoices'}),el('p',{class:'muted',text:'Pay by card or bank transfer on a secure page. We never see your card number.'}))),
      ...inv.invoices.map(i=>el('div',{class:'plan-use-row'},el('div',{class:'plan-use-head'},el('span',{text:`${i.number} · ${new Date(i.period_start).toLocaleDateString('en-AU',{month:'long',year:'numeric',timeZone:'Australia/Perth'})}`}),el('b',{text:`${money(i.total_cents)} · ${i.status==='paid'?'paid':'due '+new Date(i.due_at).toLocaleDateString('en-AU',{day:'numeric',month:'short',timeZone:'Australia/Perth'})}`})),i.pay_url?el('a',{class:'primary-button compact',href:i.pay_url,text:'Pay now'}):null))):null;
    const body=host.querySelector('#plan-extras-body');if(!body)return;
    body.replaceChildren(...[card,addBlock,invBlock].filter(Boolean));
  }
  onView('billing',{enter:()=>load().catch(e=>console.error('plan load failed:',e.message))});
})();
