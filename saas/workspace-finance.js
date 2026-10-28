// Money section: overview, jobs & payments, overheads, reports. DOM built with textContent only.
(()=>{
  const {el,api,money,note}=window.SuperProUI;
  const $=s=>document.querySelector(s);
  let T={job:'Job',jobs:'Jobs',revenue:'Income',costs:'Costs',customer:'Customer'};
  const STAGE={quoted:['Quoted','neutral'],confirmed:['Confirmed','info'],completed:['Done, not paid','warn'],part_paid:['Part paid','warn'],paid:['Paid','ok']};
  const tab=name=>{document.querySelectorAll('[data-fin-tab]').forEach(b=>{const on=b.dataset.finTab===name;b.classList.toggle('active',on);b.setAttribute('aria-selected',on)});document.querySelectorAll('[data-fin-pane]').forEach(p=>p.hidden=p.dataset.finPane!==name)};
  document.addEventListener('click',e=>{const b=e.target.closest('[data-fin-tab]');if(b)tab(b.dataset.finTab)});
  const monthName=m=>new Date(m+'-01T00:00:00Z').toLocaleString('en-AU',{month:'short',timeZone:'UTC'});

  function kpi(label,value,sub,tone){const icon=document.createElementNS('http://www.w3.org/2000/svg','svg');icon.setAttribute('viewBox','0 0 24 24');icon.setAttribute('aria-hidden','true');icon.classList.add('sp-card-icon');const path=document.createElementNS(icon.namespaceURI,'path');path.setAttribute('d',/cost|overhead/i.test(label)?'M4 7h16v14H4zM8 7V3h8v4M4 12h16':/profit/i.test(label)?'M4 19l5-6 4 3 7-11M14 5h6v6':/GST/i.test(label)?'M6 3h12v18H6zM9 8h6m-6 4h6m-6 4h3':'M3 6h18v14H3zM3 10h18m-13 6h3');icon.append(path);return el('article',{class:`panel finance-kpi fin-${tone||'plain'}`},icon,el('small',{text:label}),el('strong',{text:value}),sub?el('span',{text:sub}):null)}
  function renderOverview(o){
    const c=o.current;
    $('#fin-kpis').replaceChildren(
      kpi(T.revenue+' this month',money(c.revenue_cents),'Payments received'),
      kpi('Job costs',money(c.materials_cents+c.labour_cents+c.other_cents),`Materials ${money(c.materials_cents)}, labour ${money(c.labour_cents)}`),
      kpi('Overheads',money(c.overhead_cents),'Fixed costs, spread monthly'),
      kpi('Profit this month',money(c.profit_cents),c.revenue_cents?`${Math.round(c.profit_cents/c.revenue_cents*100)}% of income`:'No income yet',c.profit_cents<0?'bad':'good'),
      kpi('Still owed to you',money(o.owing_cents),'Confirmed but unpaid',o.owing_cents?'warn':'plain'),
      kpi('GST estimate',money(c.gst_collected_cents-c.gst_paid_cents),`Collected ${money(c.gst_collected_cents)}, paid ${money(c.gst_paid_cents)}`));
    const max=Math.max(1,...o.history.map(h=>Math.abs(h.profit_cents)));
    $('#fin-trend').replaceChildren(...o.history.map(h=>el('div',{class:'fin-bar'},el('i',{class:h.profit_cents<0?'neg':'',style:`height:${Math.max(4,Math.round(Math.abs(h.profit_cents)/max*100))}%`,title:money(h.profit_cents)}),el('b',{text:monthName(h.month)}),el('small',{text:money(h.profit_cents)}))));
    const rows=[['Income',c.revenue_cents,'in'],['Materials',c.materials_cents,'out'],['Labour',c.labour_cents,'out'],['Other costs',c.other_cents,'out'],['Overheads',c.overhead_cents,'out']];
    $('#fin-breakdown').replaceChildren(...rows.map(([l,v,k])=>el('article',{class:'row-card'},el('header',{},el('b',{text:l}),el('strong',{class:k==='in'?'finance-in':'finance-out',text:(k==='in'?'+':'-')+money(v)})))));
    $('#fin-note').textContent=o.note;
  }
  function field(label,name,value,step='0.01'){return el('label',{},el('span',{text:label}),el('input',{name,type:'number',min:'0',step,value:value===0?'':String(value)}))}
  function jobCard(j){
    const [stText,stTone]=STAGE[j.stage];
    const form=el('form',{class:'fin-job-form'},
      field('Agreed price (AUD)','price',j.price_cents/100),field('Paid so far (AUD)','paid',j.paid_cents/100),field('Materials cost (AUD)','materials',j.materials_cents/100),
      field('Hours worked','labour_hours',j.labour_hours,'0.25'),field('Pay rate per hour (AUD)','labour_rate',j.labour_rate_cents/100),
      el('label',{class:'fin-check'},el('input',{type:'checkbox',name:'completed',checked:j.completed_at?true:null}),el('span',{text:'Work is finished'})),
      el('label',{class:'fin-check'},el('input',{type:'checkbox',name:'gst_applies',checked:j.gst_applies?true:null}),el('span',{text:'Prices include 10% GST'})),
      el('button',{class:'primary-button compact',type:'submit',text:'Save'}));
    form.onsubmit=async e=>{e.preventDefault();const f=e.target.elements,num=n=>f[n].value===''?0:Number(f[n].value);
      try{await api(`/api/saas/finance/jobs/${j.id}`,{method:'PUT',body:JSON.stringify({price:num('price'),paid:num('paid'),materials:num('materials'),labour_hours:num('labour_hours'),labour_rate:num('labour_rate'),completed:f.completed.checked,gst_applies:f.gst_applies.checked})});note('Saved. Profit has been updated.');await load()}catch(x){note(x.message,true)}};
    return el('details',{class:'row-card fin-job'},el('summary',{},el('div',{},el('b',{text:j.title}),el('div',{class:'muted',text:`Price ${money(j.price_cents)}, paid ${money(j.paid_cents)}${j.owing_cents?`, owing ${money(j.owing_cents)}`:''}${j.stock_materials_cents?`, stock used ${money(j.stock_materials_cents)}`:''}`})),el('span',{class:`status-pill ${stTone}`,text:stText}),el('strong',{text:money(j.profit_cents)})),form);
  }
  async function load(){
    const [o,jobs,oh,ledger]=await Promise.all([api('/api/saas/finance/overview'),api('/api/saas/finance/jobs'),api('/api/saas/finance/overheads'),api('/api/saas/finance')]);
    T={...T,...o.terms};
    $('#fin-title').textContent=`Profit on every ${T.job.toLowerCase()}, without the spreadsheet`;
    $('#fin-intro').textContent=`Enter what a ${T.job.toLowerCase()} is worth and what ${T.customer.toLowerCase()==='customer'?'the customer':'the '+T.customer.toLowerCase()} paid. Super Pro works out ${T.revenue.toLowerCase()}, ${T.costs.toLowerCase()}, labour and overheads for you.`;
    $('#fin-jobs-title').textContent=T.jobs;
    renderOverview(o);
    $('#fin-jobs').replaceChildren(...(jobs.jobs.length?jobs.jobs.map(jobCard):[el('div',{class:'empty-state'},el('b',{text:`No ${T.jobs.toLowerCase()} yet`}),el('span',{text:`Create a ${T.job.toLowerCase()} in Customers & Work and it will appear here.`}))]));
    $('#fin-overheads').replaceChildren(...(oh.overheads.length?oh.overheads.map(x=>el('article',{class:'row-card'},el('header',{},el('div',{},el('b',{text:x.name}),el('div',{class:'muted',text:`${money(x.amount_cents)} ${x.period==='weekly'?'every week':x.period==='yearly'?'every year':'every month'}`})),el('button',{class:'secondary-button compact',type:'button',text:'Remove',onclick:async()=>{try{await api('/api/saas/finance/overheads/'+x.id,{method:'DELETE'});await load()}catch(e){note(e.message,true)}}})))):[el('div',{class:'empty-state'},el('b',{text:'No overheads yet'}),el('span',{text:'Add rent, insurance or software and they are included in profit each month.'}))]));
    const sel=$('#finance-work-order');if(sel){const cur=sel.value;sel.replaceChildren(el('option',{value:'',text:'Not tied to a job'}),...jobs.jobs.map(j=>el('option',{value:j.id,text:j.title})));sel.value=[...sel.options].some(x=>x.value===cur)?cur:''}
    const d=$('#finance-form')?.elements?.occurred_on;if(d&&!d.value)d.value=new Date().toISOString().slice(0,10);
    window.__finEntries=ledger.entries||[];
    $('#finance-entries').replaceChildren(...(ledger.entries||[]).slice(0,100).map(x=>el('article',{class:'row-card'},el('header',{},el('div',{},el('b',{text:x.category}),el('div',{class:'muted',text:`${x.occurred_on}${x.work_order_title?', '+x.work_order_title:''}${x.source==='auto'?', automatic':''}`})),el('strong',{class:x.entry_type==='expense'?'finance-out':'finance-in',text:(x.entry_type==='expense'?'-':'+')+money(x.amount_cents)})))));
  }
  $('#fin-overhead-form')?.addEventListener('submit',async e=>{e.preventDefault();const f=e.target.elements;try{await api('/api/saas/finance/overheads',{method:'POST',body:JSON.stringify({name:f.name.value,amount:Number(f.amount.value),period:f.period.value})});e.target.reset();note('Overhead added.');await load()}catch(x){note(x.message,true)}});
  $('#fin-csv')?.addEventListener('click',()=>{
    const q=v=>`"${String(v??'').replace(/"/g,'""').replace(/^([=+\-@])/,"'$1")}"`;
    const rows=[['Date','Type','Category','Job','Amount AUD','GST AUD','Source'],...(window.__finEntries||[]).map(x=>[x.occurred_on,x.entry_type,x.category,x.work_order_title||'',(x.amount_cents/100).toFixed(2),(x.tax_cents/100).toFixed(2),x.source])];
    const url=URL.createObjectURL(new Blob([rows.map(r=>r.map(q).join(',')).join('\n')],{type:'text/csv'}));
    const a=el('a',{href:url,download:'superpro-ledger.csv'});document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
  });
  window.SuperProFinance={load};
})();
