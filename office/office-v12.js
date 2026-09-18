(() => {
  const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
  const esc=v=>String(v??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
  const fmt=v=>{if(!v)return'—';try{return new Intl.DateTimeFormat('en-AU',{dateStyle:'medium',timeStyle:'short',timeZone:'Australia/Perth'}).format(new Date(v))}catch{return String(v)}};
  const money=c=>new Intl.NumberFormat('en-AU',{style:'currency',currency:'AUD'}).format((Number(c)||0)/100);
  async function api(url,opt={}){
    const key=sessionStorage.getItem('fp-admin-key')||'';
    const r=await fetch(url,{credentials:'same-origin',headers:{'x-admin-key':key,...(opt.body&&!opt.raw?{'content-type':'application/json'}:{}),...(opt.headers||{})},...opt});
    const d=await r.json().catch(()=>({}));
    if(!r.ok){const e=new Error(r.status===429?(d.error||'This action is being requested too quickly. Please wait a moment and retry.'):d.error||'The requested action could not be completed.');e.status=r.status;throw e}
    return d;
  }
  function toast(text,type='success'){
    if(window.GDSOfficeV11?.toast)return window.GDSOfficeV11.toast(text,type);
    const notice=$('#notice');if(notice){notice.textContent=text;notice.className=type==='error'?'notice error':'notice';setTimeout(()=>{if(notice.textContent===text)notice.textContent=''},6000)}
  }
  const currentAdminKey=()=>sessionStorage.getItem('fp-admin-key')||'';
  const debounce=(fn,ms=260)=>{let t;return(...a)=>{clearTimeout(t);t=setTimeout(()=>fn(...a),ms)}};

  function applyPublicBrand(){
    document.title=document.title.replaceAll('Super Pro AI Office Manager','Super Pro AI Office Manager');
    const walker=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);const nodes=[];while(walker.nextNode())nodes.push(walker.currentNode);
    for(const n of nodes){if(!n.parentElement||['SCRIPT','STYLE','CODE','TEXTAREA','INPUT'].includes(n.parentElement.tagName))continue;let t=n.nodeValue;if(!t)continue;t=t.replaceAll('Super Pro AI Office Manager','Super Pro AI Office Manager').replaceAll('GDS Office Co-pilot','Super Pro Office Co-pilot').replaceAll('GDS workspace','Super Pro workspace');n.nodeValue=t}
    $$('.fp-monogram,.brand-monogram').forEach(x=>{x.textContent='SP';x.classList.add('sp-monogram')});
  }

  async function loadConversations(){
    const q=$('#conversation-search')?.value.trim()||'',channel=$('#conversation-channel')?.value||'',recordClass=$('#conversation-class')?.value||'';
    const p=new URLSearchParams();if(q)p.set('q',q);if(channel)p.set('channel',channel);if(recordClass)p.set('record_class',recordClass);
    const d=await api(`/api/admin/conversations?${p}`),el=$('#conversations-table');if(!el)return;
    el.innerHTML=`<table><thead><tr><th>Record</th><th>Channel</th><th>Customer</th><th>Last message</th><th>Messages</th><th>Updated</th></tr></thead><tbody>${(d.conversations||[]).map(c=>`<tr data-v12-conversation="${esc(c.id)}"><td><span class="record-class ${esc(c.record_class||'current')}">${c.record_class==='historical'?'Previous':'Current'}</span></td><td class="channel">${esc(c.channel)}</td><td><b>${esc(c.full_name)}</b><br><small>${esc(c.phone||c.email||'')}</small></td><td>${esc((c.last_message||'').slice(0,130))}</td><td>${Number(c.message_count||0)}</td><td>${fmt(c.updated_at)}</td></tr>`).join('')||'<tr><td colspan="6">No conversations match these filters.</td></tr>'}</tbody></table>`;
    el.querySelectorAll('[data-v12-conversation]').forEach(r=>r.onclick=()=>window.openConversation?.(r.dataset.v12Conversation));
  }

  async function loadApprovals(){
    const status=$('#approval-status-filter')?.value||'pending',d=await api(`/api/admin/approvals?status=${encodeURIComponent(status)}`),el=$('#approvals-list');if(!el)return;
    const rows=d.approvals||[];
    el.innerHTML=rows.map(a=>{const p=a.edited_payload||a.draft_payload,isPending=a.status==='pending',isReply=a.approval_type==='reply',content=isReply?(p.body||''):JSON.stringify(p,null,2);return `<article class="approval-card ${!isPending?'history-card':''}" data-v12-approval="${esc(a.id)}"><div class="panel-head"><div><span class="badge">${esc(a.approval_type)}</span><h3>${esc(a.full_name||'Business record')}</h3><small>${esc(a.status)}${a.decided_at?` · decided ${fmt(a.decided_at)}`:''}</small></div><span>${fmt(a.created_at)}</span></div><label>${isReply?'Reply / message':'Approval details'}<textarea rows="${isReply?7:10}" ${isPending&&isReply?'':'readonly'}>${esc(content)}</textarea></label>${isPending?`<div class="approval-actions"><button class="danger" data-v12-decision="reject">Reject</button><button data-v12-decision="approve">${isReply?'Approve — Ready to Send':'Approve'}</button></div>`:'<div class="history-decision"><b>Decision recorded:</b> ${esc(a.status)}</div>'}</article>`}).join('')||`<p class="muted">No ${esc(status==='all'?'approval':status)} records found.</p>`;
    el.querySelectorAll('[data-v12-approval]').forEach(card=>card.querySelectorAll('[data-v12-decision]').forEach(btn=>btn.onclick=async()=>{const id=card.dataset.v12Approval,a=rows.find(x=>x.id===id),body=card.querySelector('textarea').value,edited=a.approval_type==='reply'?{body,channel:(a.edited_payload||a.draft_payload).channel}:undefined;try{const r=await api(`/api/admin/approvals/${encodeURIComponent(id)}/decision`,{method:'POST',body:JSON.stringify({decision:btn.dataset.v12Decision,edited_payload:edited})});toast(r.message||`Approval ${r.status}.`);await loadApprovals()}catch(e){toast(e.message,'error')}}));
  }

  async function loadEnquiries(){
    const d=await api('/api/admin/enquiries'),q=($('#enquiry-search')?.value||'').trim().toLowerCase(),status=$('#status-filter')?.value||'',rows=(d.enquiries||[]).filter(e=>(!status||e.status===status)&&(!q||[e.reference_code,e.full_name,e.phone,e.email,e.service_required,e.source,e.suburb_postcode].some(v=>String(v||'').toLowerCase().includes(q)))),el=$('#enquiries-table');if(!el)return;
    el.innerHTML=`<table><thead><tr><th>Reference</th><th>Customer</th><th>Repeat enquiries</th><th>Source</th><th>Service</th><th>Status</th><th>Received</th></tr></thead><tbody>${rows.map(e=>`<tr data-v12-enquiry="${esc(e.id)}"><td>${esc(e.reference_code)}</td><td><b>${esc(e.full_name)}</b><br><small>${esc(e.phone)}</small></td><td><span class="badge">${Number(e.customer_enquiry_count||1)}</span></td><td>${esc(e.source||'website')}</td><td>${esc(e.service_required)}</td><td><span class="badge">${esc(e.status)}</span></td><td>${fmt(e.created_at)}</td></tr>`).join('')||'<tr><td colspan="7">No enquiries match these filters.</td></tr>'}</tbody></table>`;
    el.querySelectorAll('[data-v12-enquiry]').forEach(r=>r.onclick=()=>window.openEnquiry?.(r.dataset.v12Enquiry));
  }

  async function loadCustomers(){
    const d=await api('/api/admin/customers'),q=($('#customer-search')?.value||'').trim().toLowerCase(),rows=(d.customers||[]).filter(c=>!q||[c.full_name,c.phone,c.email,c.company_name,c.suburb_postcode].some(v=>String(v||'').toLowerCase().includes(q))),el=$('#customers-table');if(!el)return;
    el.innerHTML=`<table><thead><tr><th>Customer</th><th>Phone</th><th>Email</th><th>Area</th><th>Enquiries</th><th>Quotes</th><th>Full history</th></tr></thead><tbody>${rows.map(c=>`<tr><td><b>${esc(c.full_name)}</b><br>${esc(c.company_name||'')}</td><td>${esc(c.phone)}</td><td>${esc(c.email)}</td><td>${esc(c.suburb_postcode)}</td><td>${Number(c.enquiry_count||0)}</td><td>${Number(c.quote_count||0)}</td><td><button type="button" data-customer-history="${esc(c.id)}">Open record</button></td></tr>`).join('')||'<tr><td colspan="7">No customers match this search.</td></tr>'}</tbody></table>`;
    el.querySelectorAll('[data-customer-history]').forEach(b=>b.onclick=()=>openCustomerHistory(b.dataset.customerHistory));
  }

  async function openCustomerHistory(id){
    const d=await api(`/api/admin/customers/${encodeURIComponent(id)}/history`),el=$('#customer-history-detail');if(!el)return;const c=d.customer;
    const list=(title,rows,render)=>`<section class="customer-history-group"><h3>${title}<span>${rows.length}</span></h3>${rows.length?`<div class="history-mini-list">${rows.map(render).join('')}</div>`:'<p class="muted">No records.</p>'}</section>`;
    el.hidden=false;el.innerHTML=`<div class="panel-head"><div><p class="eyebrow">CUSTOMER 360°</p><h2>${esc(c.full_name)}</h2><span>${esc(c.phone||'')} · ${esc(c.email||'')} · ${esc(c.company_name||'')}</span></div><button type="button" data-customer-close>Close</button></div><div class="customer-history-grid">${list('Enquiries',d.enquiries||[],x=>`<article><b>${esc(x.reference_code||'Enquiry')}</b><span>${esc(x.service_required||'')} · ${esc(x.status)} · ${fmt(x.created_at)}</span></article>`)}${list('Conversations',d.conversations||[],x=>`<article><b>${esc(x.channel)} · ${esc(x.subject||'Conversation')}</b><span>${esc(x.record_class||'current')} · ${x.message_count||0} messages · ${fmt(x.updated_at)}</span></article>`)}${list('Quotes',d.quotes||[],x=>`<article><b>${esc(x.quote_number)}</b><span>${esc(x.status)} · ${money(x.total_cents)} · ${fmt(x.created_at)}</span></article>`)}${list('Bookings & jobs',d.bookings||[],x=>`<article><b>${esc(x.title)}</b><span>${esc(x.status)} · ${fmt(x.start_at)}</span></article>`)}${list('Invoices',d.invoices||[],x=>`<article><b>${esc(x.invoice_number)}</b><span>${esc(x.status)} · ${money(x.total_cents)} · paid ${money(x.recorded_payments||x.amount_paid_cents)}</span></article>`)}${list('Imported history',d.history||[],x=>`<article><b>${esc(x.record_type)} · ${esc(x.title)}</b><span>${esc(x.source_channel||'manual')} · ${fmt(x.occurred_at||x.imported_at)}</span><p>${esc((x.summary||'').slice(0,220))}</p></article>`)}</div>`;el.querySelector('[data-customer-close]').onclick=()=>el.hidden=true;el.scrollIntoView({behavior:'smooth',block:'start'});
  }

  async function loadCampaigns(){
    const d=await api('/api/admin/campaigns'),q=($('#campaign-search')?.value||'').trim().toLowerCase(),rows=(d.campaigns||[]).filter(c=>!q||[c.name,c.channel,c.audience_rule,c.status,c.campaign_type,c.offer].some(v=>String(v||'').toLowerCase().includes(q))),el=$('#campaigns-table');if(!el)return;
    el.innerHTML=`<table><thead><tr><th>Campaign</th><th>Type</th><th>Channel</th><th>Audience</th><th>Eligible</th><th>Status</th><th>Schedule</th></tr></thead><tbody>${rows.map(c=>`<tr><td><b>${esc(c.name)}</b><br><small>${esc(c.offer||'')}</small></td><td>${esc(c.campaign_type)}</td><td>${esc(c.channel)}</td><td>${esc(c.audience_rule)}</td><td>${Number(c.eligible_count||0)}</td><td><span class="badge">${esc(c.status)}</span></td><td>${fmt(c.scheduled_at||c.created_at)}</td></tr>`).join('')||'<tr><td colspan="7">No campaigns match this search.</td></tr>'}</tbody></table>`;
  }

  async function loadNewsletter(){
    const d=await api('/api/admin/newsletter-subscribers'),sum=$('#newsletter-summary'),table=$('#newsletter-table');if(sum)sum.innerHTML=`<div><b>${d.active||0}</b><span>Active subscribers</span></div><div><b>${d.total||0}</b><span>Total records</span></div><div><b>Opt-in</b><span>Updates, offers & packages</span></div>`;if(table)table.innerHTML=`<table><thead><tr><th>Email</th><th>Name</th><th>Organisation</th><th>Source</th><th>Status</th><th>Subscribed</th></tr></thead><tbody>${(d.subscribers||[]).map(x=>`<tr><td>${esc(x.email)}</td><td>${esc(x.full_name||'')}</td><td>${esc(x.organisation_name||'')}</td><td>${esc(x.source)}</td><td><span class="badge">${esc(x.status)}</span></td><td>${fmt(x.subscribed_at)}</td></tr>`).join('')||'<tr><td colspan="6">No product-newsletter subscribers yet.</td></tr>'}</tbody></table>`;
  }

  async function loadChannelMetrics(){
    const d=await api('/api/admin/channel-metrics'),grid=$('#channel-metrics-grid');if(!grid)return;grid.innerHTML=(d.channels||[]).map(x=>{const m=x.metrics||{},synced=Boolean(m.last_synced_at),v=n=>synced?new Intl.NumberFormat().format(Number(n||0)):'—';return `<article class="channel-metric-card"><div class="channel-metric-head"><span>${esc((x.display_name||x.channel).slice(0,2).toUpperCase())}</span><div><b>${esc(x.display_name||x.channel)}</b><small>${esc(x.status.replaceAll('_',' '))}${synced?` · synced ${fmt(m.last_synced_at)}`:' · awaiting authorised sync'}</small></div></div><div class="channel-metric-numbers"><div><b>${v(m.followers||m.subscribers)}</b><span>Followers / subscribers</span></div><div><b>${v(m.views)}</b><span>Views</span></div><div><b>${v(m.likes)}</b><span>Likes</span></div><div><b>${v(m.comments)}</b><span>Comments</span></div></div><label>AI comment reply policy<select data-channel-policy="${esc(x.channel)}"><option value="off" ${m.ai_reply_mode==='off'?'selected':''}>Off</option><option value="approval" ${!m.ai_reply_mode||m.ai_reply_mode==='approval'?'selected':''}>AI draft + human approval</option><option value="auto_safe" ${m.ai_reply_mode==='auto_safe'?'selected':''}>Auto-reply within owner rules</option></select></label><small class="policy-note">Live replies only operate after the provider is authorised and the business rules permit it.</small></article>`}).join('');grid.querySelectorAll('[data-channel-policy]').forEach(s=>s.onchange=async()=>{try{const r=await api(`/api/admin/channel-metrics/${encodeURIComponent(s.dataset.channelPolicy)}/reply-policy`,{method:'PUT',body:JSON.stringify({mode:s.value})});toast(r.note||'Reply policy saved.')}catch(e){toast(e.message,'error')}});
  }

  async function loadRecords(){
    const [summary,history]=await Promise.all([api('/api/admin/records-summary'),api(`/api/admin/history?type=${encodeURIComponent($('#history-type-filter')?.value||'')}&q=${encodeURIComponent($('#history-search')?.value||'')}`)]),sum=$('#records-summary'),tbl=$('#history-records-table');
    if(sum)sum.innerHTML=Object.entries(summary.summary||{}).map(([k,v])=>`<article><b>${Number(v||0)}</b><span>${esc(k.replaceAll('_',' '))}</span></article>`).join('');
    if(tbl)tbl.innerHTML=`<table><thead><tr><th>Type</th><th>Reference</th><th>Customer</th><th>Source</th><th>Title / summary</th><th>Date</th></tr></thead><tbody>${(history.records||[]).map(x=>`<tr><td><span class="badge">${esc(x.record_type)}</span></td><td>${esc(x.reference_code||'—')}</td><td>${esc(x.customer_name||'—')}</td><td>${esc(x.source_channel||x.import_source||'manual')}</td><td><b>${esc(x.title)}</b><br><small>${esc((x.summary||'').slice(0,150))}</small></td><td>${fmt(x.occurred_at||x.imported_at)}</td></tr>`).join('')||'<tr><td colspan="6">No previous records imported yet.</td></tr>'}</tbody></table>`;
    const inv=$('#record-invoices');if(inv)inv.innerHTML=`<table><thead><tr><th>Invoice</th><th>Customer</th><th>Status</th><th>Total</th><th>Paid</th><th>Date</th></tr></thead><tbody>${(summary.invoices||[]).map(x=>`<tr><td>${esc(x.invoice_number)}</td><td>${esc(x.full_name)}</td><td><span class="badge">${esc(x.status)}</span></td><td>${money(x.total_cents)}</td><td>${money(x.amount_paid_cents)}</td><td>${fmt(x.created_at)}</td></tr>`).join('')||'<tr><td colspan="6">No invoices yet.</td></tr>'}</tbody></table>`;
    const jobs=$('#record-completed-jobs');if(jobs)jobs.innerHTML=`<table><thead><tr><th>Job</th><th>Customer</th><th>Scheduled</th><th>Completed/updated</th></tr></thead><tbody>${(summary.completed_jobs||[]).map(x=>`<tr><td>${esc(x.title)}</td><td>${esc(x.full_name)}</td><td>${fmt(x.start_at)}</td><td>${fmt(x.updated_at)}</td></tr>`).join('')||'<tr><td colspan="4">No completed jobs yet.</td></tr>'}</tbody></table>`;
  }

  async function loadWebsite(){
    const card=$('#website-status-card');if(!card)return;card.innerHTML='<b>Checking live website…</b><span>Testing reachability.</span>';try{const d=await api('/api/admin/website-status');card.classList.toggle('reachable',Boolean(d.reachable));card.innerHTML=`<b>${d.reachable?'Live website reachable':'Embedded preview unavailable / status not confirmed'}</b><span>${esc(d.note||'')}</span><small>${esc(d.url||'')} ${d.status?`· HTTP ${d.status}`:''}</small>`}catch(e){card.innerHTML=`<b>Status check unavailable</b><span>${esc(e.message)}</span>`}
  }

  async function submitHistory(e){e.preventDefault();const form=e.currentTarget,body=Object.fromEntries(new FormData(form));if(body.occurred_at)body.occurred_at=new Date(body.occurred_at).toISOString();else delete body.occurred_at;try{await api('/api/admin/history/import',{method:'POST',body:JSON.stringify(body)});form.reset();form.elements.import_source.value='manual';toast('Previous business record imported and preserved in Records & Archive.');await Promise.allSettled([loadRecords(),loadConversations(),loadCustomers()])}catch(err){toast(err.message,'error')}}

  function bind(){
    applyPublicBrand();
    $('#history-import-form')?.addEventListener('submit',submitHistory);
    $('#approval-status-filter')?.addEventListener('change',()=>loadApprovals().catch(e=>toast(e.message,'error')));
    $('#conversation-search')?.addEventListener('input',debounce(()=>loadConversations().catch(()=>{})));$('#conversation-channel')?.addEventListener('change',()=>loadConversations().catch(()=>{}));$('#conversation-class')?.addEventListener('change',()=>loadConversations().catch(()=>{}));
    $('#enquiry-search')?.addEventListener('input',debounce(()=>loadEnquiries().catch(()=>{})));$('#status-filter')?.addEventListener('change',()=>setTimeout(()=>loadEnquiries().catch(()=>{}),20));
    $('#customer-search')?.addEventListener('input',debounce(()=>loadCustomers().catch(()=>{})));$('#campaign-search')?.addEventListener('input',debounce(()=>loadCampaigns().catch(()=>{})));$('#refresh-newsletter')?.addEventListener('click',()=>loadNewsletter().catch(e=>toast(e.message,'error')));
    $('#records-refresh')?.addEventListener('click',()=>loadRecords().catch(e=>toast(e.message,'error')));$('#history-type-filter')?.addEventListener('change',()=>loadRecords().catch(()=>{}));$('#history-search')?.addEventListener('input',debounce(()=>loadRecords().catch(()=>{})));
    $$('[data-go-view]').forEach(b=>b.addEventListener('click',()=>document.querySelector(`.nav[data-view="${CSS.escape(b.dataset.goView)}"]`)?.click()));
    $$('.workspace-return').forEach(a=>a.addEventListener('click',e=>{e.preventDefault();location.assign('/saas/workspace.html#dashboard')}));
    $$('.nav').forEach(n=>n.addEventListener('click',()=>setTimeout(()=>enhanceView(n.dataset.view),60)));
    $('#refresh')?.addEventListener('click',()=>setTimeout(()=>enhanceView(document.querySelector('.nav.active')?.dataset.view),80));
    if(currentAdminKey())setTimeout(()=>enhanceView(document.querySelector('.nav.active')?.dataset.view||'dashboard'),180);
  }

  async function enhanceView(view){
    try{
      if(view==='inbox')await loadConversations();
      else if(view==='approvals')await loadApprovals();
      else if(view==='enquiries')await loadEnquiries();
      else if(view==='customers')await loadCustomers();
      else if(view==='campaigns')await Promise.all([loadCampaigns(),loadNewsletter()]);
      else if(view==='connections')await loadChannelMetrics();
      else if(view==='records')await loadRecords();
      else if(view==='website')await loadWebsite();
    }catch(e){toast(e.message,'error')}
  }

  window.SuperProV12={loadRecords,loadWebsite,loadConversations,loadApprovals,loadCustomers,loadChannelMetrics,enhanceView};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',bind);else bind();
})();
