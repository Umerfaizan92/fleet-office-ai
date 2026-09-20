(()=>{
  if(window.SuperProApprovals)return;
  const $=s=>document.querySelector(s);
  const esc=v=>String(v??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
  const api=async(url,opt={})=>{
    const r=await fetch(url,{credentials:'same-origin',headers:{'content-type':'application/json',...(opt.headers||{})},...opt});
    const d=await r.json().catch(()=>({}));
    if(!r.ok)throw new Error(d.error||'The approval action could not be completed.');
    return d;
  };
  let status='pending',lastData=null;
  const defaultRules={external_messages:true,social_publishing:true,payments:true,quotes_and_invoices:true,compliance_changes:true,job_changes:false,customer_record_changes:false};

  function installStyle(){
    if($('#superpro-approvals-style'))return;
    const s=document.createElement('style');s.id='superpro-approvals-style';
    s.textContent=[
      '.approval-metrics{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;margin-bottom:16px}',
      '.approval-metric{padding:14px;border:1px solid var(--line);border-radius:12px;background:var(--panel-2)}',
      '.approval-metric strong{display:block;font-size:24px}.approval-metric span{font-size:9px;color:var(--muted);text-transform:uppercase;font-weight:900}',
      '.approval-toolbar{display:flex;flex-wrap:wrap;justify-content:space-between;gap:10px;align-items:center;margin-bottom:12px}',
      '.approval-tabs{display:flex;flex-wrap:wrap;gap:7px}.approval-tabs button.active{border-color:var(--brand-line);color:var(--brand-2);background:var(--brand-soft)}',
      '.approval-list{display:grid;gap:10px}.approval-card{padding:15px;border:1px solid var(--line);border-radius:13px;background:var(--panel-2)}',
      '.approval-card.pending{border-color:rgba(228,189,102,.32)}.approval-card header{display:flex;justify-content:space-between;gap:14px;align-items:flex-start}',
      '.approval-card h3{margin:5px 0;font-size:14px}.approval-card p{margin:7px 0;color:var(--text-2);font-size:10px;line-height:1.55}',
      '.approval-meta{display:flex;flex-wrap:wrap;gap:7px;color:var(--muted);font-size:8px}.approval-ref{font-family:ui-monospace,SFMono-Regular,Consolas,monospace;color:var(--brand-2)}',
      '.approval-actions{display:flex;flex-wrap:wrap;gap:7px;margin-top:12px}.approval-risk{padding:4px 7px;border:1px solid var(--line);border-radius:999px;font-size:8px;text-transform:uppercase;font-weight:900}',
      '.approval-risk.high,.approval-risk.critical{color:#ff9696;border-color:rgba(255,100,100,.3)}.approval-risk.elevated{color:#f2c970;border-color:rgba(242,201,112,.3)}',
      '.approval-policy-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px}.approval-policy-grid label{display:flex;gap:9px;align-items:flex-start;padding:11px;border:1px solid var(--line);border-radius:10px;background:var(--panel-2)}',
      '.approval-history{margin-top:10px;padding:10px;border-radius:10px;background:#0b0f15}.approval-history article{padding:7px 0;border-bottom:1px solid var(--line);font-size:9px}.approval-history article:last-child{border-bottom:0}',
      '@media(max-width:760px){.approval-metrics,.approval-policy-grid{grid-template-columns:1fr 1fr}.approval-card header{display:grid}}',
      '@media(max-width:480px){.approval-metrics,.approval-policy-grid{grid-template-columns:1fr}}'
    ].join('');
    document.head.append(s);
  }

  function policyHtml(policy={}){
    const rules={...defaultRules,...(policy.rules||{})};
    const labels={
      external_messages:'Messages sent to customers or external contacts',
      social_publishing:'Social media publishing',
      payments:'Payments, refunds and financial transfers',
      quotes_and_invoices:'Quotes, invoices and price commitments',
      compliance_changes:'Compliance / work-right changes',
      job_changes:'Job scheduling or allocation changes',
      customer_record_changes:'Material customer-record changes'
    };
    return '<article class="panel"><div class="panel-head"><div><span class="panel-kicker">APPROVAL POLICY</span><h2>Human control rules</h2><p>Choose what Super Pro must hold for authorised human approval before an external or consequential action proceeds.</p></div></div>'+
      '<label><span>Approval mode</span><select id="approval-policy-mode"><option value="everything">Approve everything</option><option value="external_actions">Approve external actions</option><option value="custom">Custom</option></select></label>'+
      '<div class="approval-policy-grid">'+Object.entries(labels).map(([k,label])=>'<label><input type="checkbox" data-approval-rule="'+k+'" '+(rules[k]?'checked':'')+'><span><b>'+esc(label)+'</b><small>Require approval when this rule applies.</small></span></label>').join('')+'</div>'+
      '<div class="approval-actions"><button type="button" class="primary-button compact" id="save-approval-policy">Save approval policy</button></div></article>';
  }

  function cardHtml(a,canDecide){
    const payload=a.edited_payload||a.draft_payload||{};
    const payloadText=Object.keys(payload).length?JSON.stringify(payload,null,2):'No structured payload attached.';
    return '<article class="approval-card '+esc(a.status)+'" data-approval-id="'+esc(a.id)+'">'+
      '<header><div><div class="approval-meta"><span class="approval-ref">'+esc(a.reference_code)+'</span><span>'+esc(String(a.source_module||'workspace').replaceAll('_',' '))+'</span><span>'+esc(new Date(a.requested_at).toLocaleString())+'</span></div><h3>'+esc(a.title)+'</h3><p>'+esc(a.summary||'Approval requested for review.')+'</p></div><span class="approval-risk '+esc(a.risk_level)+'">'+esc(a.risk_level)+'</span></header>'+
      '<details><summary>Review action details</summary><pre class="gov-policy-detail">'+esc(payloadText)+'</pre></details>'+
      '<div class="approval-meta"><span>Status: <b>'+esc(a.status)+'</b></span>'+(a.requested_by_name?'<span>Requested by '+esc(a.requested_by_name)+'</span>':'')+(a.decided_by_name?'<span>Decided by '+esc(a.decided_by_name)+'</span>':'')+'</div>'+
      (a.status==='pending'&&canDecide?'<div class="approval-actions"><button type="button" class="primary-button compact" data-approval-decision="approve">Approve</button><button type="button" class="secondary-button compact" data-approval-decision="reject">Reject</button></div>':'')+
      '<button type="button" class="text-button" data-approval-history>View history</button><div class="approval-history" hidden></div>'+
      '</article>';
  }

  async function load(){
    const view=$('#approvals-view');if(!view)return;
    const list=$('#workspace-approval-list'),policyHost=$('#approval-policy-host');
    if(list)list.innerHTML='<div class="gov-empty">Loading approval queue…</div>';
    try{
      const d=await api('/api/saas/approvals?status='+encodeURIComponent(status));lastData=d;
      $('#approval-count-pending').textContent=d.counts.pending;
      $('#approval-count-approved').textContent=d.counts.approved;
      $('#approval-count-rejected').textContent=d.counts.rejected;
      $('#approval-count-total').textContent=d.counts.total;
      if(policyHost){policyHost.innerHTML=policyHtml(d.policy);const mode=$('#approval-policy-mode');if(mode)mode.value=d.policy?.mode||'everything'}
      if(list)list.innerHTML=(d.approvals||[]).map(a=>cardHtml(a,d.can_decide)).join('')||'<div class="gov-empty">No '+esc(status==='all'?'approval history':status+' approvals')+' for this workspace.</div>';
      bind();
    }catch(err){if(list)list.innerHTML='<div class="gov-empty">'+esc(err.message)+'</div>'}
  }

  function bind(){
    document.querySelectorAll('[data-approval-filter]').forEach(b=>{b.classList.toggle('active',b.dataset.approvalFilter===status);b.onclick=()=>{status=b.dataset.approvalFilter;load()}});
    $('#save-approval-policy')?.addEventListener('click',async()=>{
      const rules={};document.querySelectorAll('[data-approval-rule]').forEach(x=>rules[x.dataset.approvalRule]=x.checked);
      const mode=$('#approval-policy-mode')?.value||'everything';
      try{await api('/api/saas/approvals/policy',{method:'PUT',body:JSON.stringify({mode,rules})});window.GDSLive?.push?.('Approval policy saved.','success');await load()}
      catch(err){window.GDSLive?.push?.(err.message,'error')}
    });
    document.querySelectorAll('[data-approval-decision]').forEach(b=>b.onclick=async()=>{
      const card=b.closest('[data-approval-id]'),decision=b.dataset.approvalDecision;
      const note=prompt((decision==='approve'?'Approve':'Reject')+' this request. Optional decision note:','')??null;
      if(note===null)return;
      b.disabled=true;
      try{await api('/api/saas/approvals/'+encodeURIComponent(card.dataset.approvalId)+'/decision',{method:'POST',body:JSON.stringify({decision,note})});window.GDSLive?.push?.('Approval '+(decision==='approve'?'approved':'rejected')+'.','success');await load()}
      catch(err){window.GDSLive?.push?.(err.message,'error');b.disabled=false}
    });
    document.querySelectorAll('[data-approval-history]').forEach(b=>b.onclick=async()=>{
      const card=b.closest('[data-approval-id]'),box=card.querySelector('.approval-history');
      if(!box.hidden){box.hidden=true;return}
      box.hidden=false;box.innerHTML='Loading history…';
      try{
        const d=await api('/api/saas/approvals/'+encodeURIComponent(card.dataset.approvalId)+'/events');
        box.innerHTML=(d.events||[]).map(e=>'<article><b>'+esc(String(e.event_type).replaceAll('_',' '))+'</b> · '+esc(e.actor_name||'System')+' · '+esc(new Date(e.created_at).toLocaleString())+(e.detail?.note?'<div>'+esc(e.detail.note)+'</div>':'')+'</article>').join('')||'No history yet.';
      }catch(err){box.textContent=err.message}
    });
  }

  function install(){
    installStyle();
    const view=$('#approvals-view');if(!view)return;
    if(!view.dataset.approvalsReady){view.dataset.approvalsReady='1';bind()}
    load();
  }
  window.addEventListener('gds:viewchange',e=>{if(e.detail?.view==='approvals')install()});
  window.SuperProApprovals={load,install};
})();