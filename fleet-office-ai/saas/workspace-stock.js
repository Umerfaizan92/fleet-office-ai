// Stock & Supplies: levels, reorder hints, and recording what a job used. DOM built with textContent only.
(()=>{
  const {el,api,onView,money,role,note}=window.SuperProUI;
  const $=s=>document.querySelector(s);
  const SENIOR=['owner','admin','manager','super_admin','director'];
  const STATUS={ok:['In stock','ok'],low:['Running low','warn'],out:['Out of stock','bad'],excess:['Not moving','info']};
  let items=[];
  const num=v=>Number(v).toLocaleString('en-AU',{maximumFractionDigits:2});

  async function load(){
    let d;try{d=await api('/api/saas/stock')}catch(e){note(e.message,true);return}
    items=d.items;const s=d.summary;
    $('#stock-kpis').replaceChildren(
      ...[['Items tracked',String(s.count),'Products you keep'],['Stock value',money(s.value_cents),'At cost'],['Running low',String(s.low+s.out),`${s.out} out of stock`],['Not moving',String(s.excess),'Sitting on the shelf 60+ days']]
        .map(([l,v,sub],i)=>el('article',{class:'panel finance-kpi'+(i===2&&s.low+s.out?' fin-warn':'')},el('small',{text:l}),el('strong',{text:v}),el('span',{text:sub}))));
    $('#stock-reorder').replaceChildren(...(d.reorder.length?d.reorder.map(i=>el('article',{class:'row-card'},el('header',{},el('div',{},el('b',{text:i.name}),el('div',{class:'muted',text:`${num(i.on_hand)} ${i.unit} left${i.supplier?', supplier '+i.supplier:''}`})),el('strong',{text:`Order ${num(i.suggested_order)} ${i.unit}`})))):[el('div',{class:'empty-state'},el('b',{text:'Nothing to order'}),el('span',{text:'Items appear here when they reach the reorder level you set.'}))]));
    $('#stock-top').replaceChildren(...(d.most_used.length?d.most_used.map(i=>el('article',{class:'row-card'},el('header',{},el('b',{text:i.name}),el('strong',{text:`${num(i.used_30d)} ${i.unit}`})))):[el('div',{class:'empty-state'},el('b',{text:'No usage yet'}),el('span',{text:'Record what each job used and the busiest items show here.'}))]));
    $('#stock-list').replaceChildren(...(items.length?items.map(i=>{const [t,tone]=STATUS[i.status];
      return el('article',{class:'row-card'},el('header',{},el('div',{},el('b',{text:i.name}),el('div',{class:'muted',text:`${num(i.on_hand)} ${i.unit} on hand, ${money(i.cost_cents)} each${i.days_left!==null?`, about ${i.days_left} days left at this pace`:''}`})),el('span',{class:`status-pill ${tone}`,text:t})),
        el('div',{class:'cust-evidence'},el('button',{class:'secondary-button compact',type:'button',text:'Update stock',onclick:()=>move(i)}),el('button',{class:'secondary-button compact',type:'button',text:'Edit',onclick:()=>edit(i)})))}):[el('div',{class:'empty-state'},el('b',{text:'No items yet'}),el('span',{text:'Add what you sell or use on jobs. Not every business needs this section.'}))]));
  }
  function edit(i){
    const f=$('#stock-item-form');f.reset();f.dataset.id=i?.id||'';$('#stock-item-title').textContent=i?'Edit item':'Add item';
    if(i){f.elements.name.value=i.name;f.elements.sku.value=i.sku||'';f.elements.unit.value=i.unit;f.elements.cost.value=(i.cost_cents/100).toFixed(2);f.elements.reorder_level.value=i.reorder_level;f.elements.reorder_qty.value=i.reorder_qty;f.elements.supplier.value=i.supplier||''}
    $('#stock-item-dialog').showModal();
  }
  $('#stock-new')?.addEventListener('click',()=>edit(null));
  $('#stock-item-form')?.addEventListener('submit',async e=>{
    if(e.submitter?.value!=='save')return;e.preventDefault();
    const f=e.target,id=f.dataset.id,b=Object.fromEntries(new FormData(f));
    try{await api(id?'/api/saas/stock/items/'+id:'/api/saas/stock/items',{method:id?'PATCH':'POST',body:JSON.stringify(b)});$('#stock-item-dialog').close();note('Saved.');load()}catch(x){note(x.message,true)}
  });

  async function jobOptions(){try{return (await api('/api/saas/work-orders')).jobs}catch{return []}}
  async function move(item,presetJob){
    const f=$('#stock-move-form');f.reset();f.dataset.id=item.id;$('#stock-move-title').textContent='Update '+item.name;
    const jobs=await jobOptions();f.elements.work_order_id.replaceChildren(el('option',{value:'',text:'Choose a job'}),...jobs.map(j=>el('option',{value:j.id,text:j.title,selected:j.id===presetJob?true:null})));
    f.elements.kind.value=presetJob?'use':'in';sync();$('#stock-move-dialog').showModal();
  }
  function sync(){const f=$('#stock-move-form'),k=f.elements.kind.value;$('#stock-job-field').hidden=k!=='use';$('#stock-cost-field').hidden=k!=='in';$('#stock-qty-label').textContent=k==='adjust'?'Counted quantity':'Quantity';f.elements.work_order_id.required=k==='use'}
  $('#stock-move-form')?.elements.kind.addEventListener('change',sync);
  $('#stock-move-form')?.addEventListener('submit',async e=>{
    if(e.submitter?.value!=='save')return;e.preventDefault();
    const f=e.target,b=Object.fromEntries(new FormData(f));for(const k of ['unit_cost','work_order_id','note'])if(!b[k])delete b[k];
    try{const r=await api(`/api/saas/stock/items/${f.dataset.id}/move`,{method:'POST',body:JSON.stringify(b)});$('#stock-move-dialog').close();note(`Saved. ${num(r.on_hand)} left.`);load()}catch(x){note(x.message,true)}
  });

  // Field staff: "Materials used" on their own job (no costs or levels shown).
  document.addEventListener('click',async e=>{
    const b=e.target.closest('[data-job-stock]');if(!b)return;
    let choices=[];try{choices=(await api('/api/saas/stock/choices')).items}catch{}
    if(!choices.length)return note('No stock items have been set up yet.',true);
    const f=$('#stock-move-form');f.reset();f.dataset.id='';$('#stock-move-title').textContent='Materials used on '+(b.dataset.jobTitle||'this job');
    const pick=el('select',{name:'item',required:true,'aria-label':'Item'},el('option',{value:'',text:'Choose an item'}),...choices.map(c=>el('option',{value:c.id,text:`${c.name} (${c.unit})`})));
    f.elements.kind.value='use';f.elements.kind.parentElement.hidden=true;
    f.elements.work_order_id.replaceChildren(el('option',{value:b.dataset.jobStock,text:b.dataset.jobTitle,selected:true}));
    let holder=$('#stock-item-pick');if(!holder){holder=el('label',{id:'stock-item-pick'},el('span',{text:'Item'}));f.insertBefore(holder,f.children[1])}holder.replaceChildren(el('span',{text:'Item'}),pick);holder.hidden=false;
    sync();$('#stock-job-field').hidden=true;$('#stock-move-dialog').showModal();
    pick.onchange=()=>{f.dataset.id=pick.value};
    $('#stock-move-dialog').addEventListener('close',()=>{f.elements.kind.parentElement.hidden=false;holder.hidden=true},{once:true});
  });
  onView('stock',{enter:load});
})();
