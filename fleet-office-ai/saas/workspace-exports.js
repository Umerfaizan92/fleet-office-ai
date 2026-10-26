// Owner-only print and export hub: printable reports (via @media print) and full tenant backup download.
(()=>{
  const {el,api,onView,when,money}=window.SuperProUI;
  const $=selector=>document.querySelector(selector);
  const CSV_TABLES=[['workers','Workers'],['work_orders','Work orders'],['finance_entries','Finance'],['audit_logs','Activity log'],['members','Staff accounts'],['comms_messages','Messages']];
  let wired=false,cleanup=null;
  const say=text=>{const n=$('#export-feedback');if(n)n.textContent=text||''};
  const orgName=()=>window.GDS_SESSION?.organisation?.name||$('#org-name-side')?.textContent||'Workspace';

  async function download(url,filename){
    say('Preparing download…');
    const response=await fetch(url,{credentials:'same-origin'});
    if(!response.ok){const d=await response.json().catch(()=>({}));throw new Error(d.error||'The export could not be created.')}
    const blob=await response.blob(),link=document.createElement('a'),href=URL.createObjectURL(blob);
    link.href=href;link.download=filename;document.body.append(link);link.click();link.remove();
    setTimeout(()=>URL.revokeObjectURL(href),10000);
    say(`Downloaded ${filename}. This export was recorded in the activity log.`);
  }
  const stamp=()=>new Date().toISOString().slice(0,10);

  function printReport({title,columns,rows,totals,warning}){
    const root=$('#print-root');
    const table=el('table',null,el('thead',null,el('tr',null,columns.map(c=>el('th',{scope:'col',text:c})))),el('tbody',null,rows.map(r=>el('tr',null,r.map(v=>el('td',{text:v==null?'':String(v)}))))));
    root.replaceChildren(
      el('h1',{text:title}),
      el('p',{class:'print-meta',text:`${orgName()} · Generated ${when(new Date().toISOString())} (Perth time) · ${rows.length} record${rows.length===1?'':'s'}`}),
      warning?el('p',{class:'print-warning',text:warning}):null,
      totals?el('div',{class:'print-totals'},totals.map(t=>el('span',{text:t}))):null,
      table);
    root.setAttribute('aria-hidden','false');
    document.body.classList.add('is-printing-report');
    const done=()=>{document.body.classList.remove('is-printing-report');root.replaceChildren();root.setAttribute('aria-hidden','true');window.removeEventListener('afterprint',done);cleanup=null};
    cleanup=done;window.addEventListener('afterprint',done);
    window.print();
  }

  const REPORTS={
    async activity(){
      const d=await api('/api/saas/data-export?format=json&table=audit_logs');
      const rows=d.tables.audit_logs.slice().sort((a,b)=>String(b.created_at).localeCompare(String(a.created_at))).slice(0,2000);
      printReport({title:'Activity log',warning:'Confidential. Append-only audit trail. Latest 2,000 entries shown.',columns:['When (Perth)','User','Role','Action','Record','IP address'],rows:rows.map(r=>[when(r.created_at),r.user_name||'System',r.user_role||'',r.action,[r.entity_type,r.entity_id].filter(Boolean).join(' '),r.ip_address||''])});
    },
    async workers(){
      const d=await api('/api/saas/data-export?format=json&table=workers');
      const rows=d.tables.workers;
      printReport({title:'Worker master sheet',warning:'Confidential: contains personal information. Handle under the Privacy Act 1988 and destroy securely after use.',columns:['Name','Role','Type','Level','Status','Work rights','VEVO result','VEVO checked','Work rights expiry','Keep records until'],rows:rows.map(w=>[w.full_name,w.role_title,String(w.employment_type||'').replace(/_/g,' '),w.worker_level,w.status,String(w.work_rights_status||'').replace(/_/g,' '),String(w.vevo_status||'not_checked').replace(/_/g,' '),w.vevo_checked_at||'',w.vevo_work_rights_expiry||'',(w.fair_work_retain_until||'').slice(0,10)])});
    },
    async finance(){
      const d=await api('/api/saas/finance');
      const s=d.summary,byCategory=new Map();
      for(const e of d.entries){const k=`${e.entry_type}|${e.category}`;byCategory.set(k,(byCategory.get(k)||0)+e.amount_cents)}
      const rows=[...byCategory.entries()].sort().map(([k,v])=>{const [type,category]=k.split('|');return [type==='revenue'?'Revenue':'Expense',category,money(v)]});
      printReport({title:'Financial summary',warning:'Operational profit tracking only. Not a tax return, statutory accounts or financial advice.',totals:[`Revenue ${money(s.revenue_cents)}`,`Expenses ${money(s.expense_cents)}`,`Net ${money(s.net_profit_cents)}`],columns:['Type','Category','Total'],rows});
    }
  };

  function wire(){
    if(wired)return;wired=true;
    document.querySelectorAll('[data-print-report]').forEach(button=>button.addEventListener('click',async()=>{
      const kind=button.dataset.printReport;button.disabled=true;say('Preparing report…');
      try{await REPORTS[kind]();say('')}catch(error){say(error.message)}finally{button.disabled=false}
    }));
    $('#export-backup')?.addEventListener('click',async event=>{
      const button=event.currentTarget;button.disabled=true;
      try{await download('/api/saas/data-export?format=json&download=1',`workspace-backup-${stamp()}.json`)}catch(error){say(error.message)}finally{button.disabled=false}
    });
    $('#export-csv')?.replaceChildren(...CSV_TABLES.map(([key,label])=>el('button',{type:'button',class:'secondary-button compact',onclick:async()=>{try{await download(`/api/saas/data-export?format=csv&table=${key}`,`${key}-${stamp()}.csv`)}catch(error){say(error.message)}}},`${label} CSV`)));
  }
  onView('exports',{enter:wire,leave(){cleanup?.()}});
})();
