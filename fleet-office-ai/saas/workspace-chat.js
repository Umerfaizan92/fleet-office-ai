// Office staff chat: bubbles, delivered and read receipts, unread badge, minimise / maximise / close.
(()=>{
  const {el,api}=window.SuperProUI;
  const live=(m,k)=>window.GDSLive?.push?.(m,k);
  const initials=n=>String(n||'?').trim().split(/\s+/).slice(0,2).map(x=>x[0]).join('').toUpperCase();
  const timeOf=iso=>new Date(iso).toLocaleTimeString('en-AU',{hour:'2-digit',minute:'2-digit'});
  const dayOf=iso=>{const d=new Date(iso),t=new Date(),y=new Date(Date.now()-864e5);return d.toDateString()===t.toDateString()?'Today':d.toDateString()===y.toDateString()?'Yesterday':d.toLocaleDateString('en-AU',{day:'numeric',month:'short'})};
  const STATUS_LABEL={available:'Available',busy:'Busy',unavailable:'Unavailable',on_leave:'On leave',day_off:'Day off',working_from_home:'Working from home'};

  function build(){
    if(document.querySelector('#gds-staff-chat'))return;
    const badge=el('span',{class:'sc-badge',hidden:true,'aria-label':'Unread messages'});
    const launch=el('button',{class:'sc-launch',type:'button','aria-expanded':'false','aria-controls':'gds-staff-chat-panel'},el('span',{class:'sc-launch-icon','aria-hidden':'true',text:'◎'}),el('span',{class:'sc-launch-text'},el('b',{text:'Office chat'}),el('small',{text:'Internal staff only'})),badge);
    const btn=(label,text,attr)=>el('button',{type:'button','aria-label':label,title:label,...attr,text});
    const bMin=btn('Minimise staff chat','—',{'data-sc':'min'}),bMax=btn('Maximise staff chat','⤢',{'data-sc':'max'}),bClose=btn('Close staff chat','×',{'data-sc':'close'});
    const log=el('div',{class:'sc-log',role:'log','aria-live':'polite'},el('p',{class:'sc-empty',text:'Loading messages…'}));
    const dir=el('div',{class:'staff-directory-list','aria-live':'polite',text:'Loading team…'});
    const inactiveBox=el('input',{type:'checkbox'}),inactiveToggle=el('label',{class:'staff-inactive-toggle',hidden:true},inactiveBox,' Show inactive accounts (managers only)');
    const statusSel=el('select',{name:'status'},...Object.entries(STATUS_LABEL).map(([v,t])=>el('option',{value:v,text:t})));
    const avail=el('form',{class:'staff-availability-form'},el('label',{},'Status ',statusSel),el('label',{},'Short reason (optional) ',el('input',{name:'reason',maxlength:'120',placeholder:'e.g. On a customer call'})),el('label',{},'Return time (optional) ',el('input',{name:'returns_at',type:'datetime-local'})),el('button',{type:'submit',text:'Update my status'}));
    const team=el('details',{class:'staff-directory sc-team'},el('summary',{text:'Team availability'}),inactiveToggle,dir,avail);
    const ta=el('textarea',{rows:'1',maxlength:'4000',placeholder:'Message your team…',required:true,'aria-label':'Message your team'});
    const send=el('button',{class:'sc-send',type:'submit','aria-label':'Send message'},el('span',{text:'Send'}));
    const form=el('form',{class:'sc-compose'},ta,send);
    const panel=el('section',{class:'sc-panel',id:'gds-staff-chat-panel',hidden:true,role:'dialog','aria-modal':'false','aria-label':'Office staff chat'},
      el('header',{class:'sc-head'},el('span',{class:'sc-orb','aria-hidden':'true',text:'◎'}),el('div',{class:'sc-title'},el('b',{text:'Office staff chat'}),el('small',{class:'sc-sub',text:'Your team, one place'})),el('div',{class:'sc-actions'},bMin,bMax,bClose)),
      el('div',{class:'sc-body'},team,log,form));
    const shell=el('div',{id:'gds-staff-chat',class:'gds-staff-chat sc-shell'},launch,panel);
    document.body.append(shell);

    let state='closed',lastKey='',unread=0,watching=new Map(); // message id -> {delivered,read}
    const open=()=>{state=state==='closed'?'normal':state;apply();window.dispatchEvent(new CustomEvent('superpro:floating-chat',{detail:{active:'staff'}}));document.querySelector('#gds-copilot .copilot-panel')?.setAttribute('hidden','');const cp=document.querySelector('#gds-copilot .copilot-launch');if(cp)cp.hidden=true;load(true);loadTeam();ta.focus()};
    const close=()=>{state='closed';apply();window.dispatchEvent(new CustomEvent('superpro:floating-chat',{detail:{active:''}}))};
    function apply(){
      const closed=state==='closed';panel.hidden=closed;launch.hidden=!closed;launch.setAttribute('aria-expanded',String(!closed));
      shell.dataset.state=state;bMax.textContent=state==='max'?'⤡':'⤢';bMax.setAttribute('aria-label',state==='max'?'Restore staff chat size':'Maximise staff chat');bMax.title=bMax.getAttribute('aria-label');
      bMin.textContent=state==='min'?'▢':'—';bMin.setAttribute('aria-label',state==='min'?'Expand staff chat':'Minimise staff chat');bMin.title=bMin.getAttribute('aria-label');
    }
    launch.onclick=open;bClose.onclick=close;
    bMin.onclick=()=>{state=state==='min'?'normal':'min';apply();if(state==='normal'){load(true);ta.focus()}};
    bMax.onclick=()=>{state=state==='max'?'normal':'max';apply();log.scrollTop=log.scrollHeight};
    panel.querySelector('.sc-head').addEventListener('dblclick',e=>{if(!e.target.closest('button')){state=state==='max'?'normal':'max';apply()}});
    document.addEventListener('keydown',e=>{if(e.key==='Escape'&&state!=='closed'){if(state==='max'){state='normal';apply()}else close()}});
    window.addEventListener('superpro:floating-chat',e=>{if(e.detail?.active==='copilot'){state='closed';apply();launch.hidden=true}else if(!e.detail?.active&&state==='closed')launch.hidden=false});

    function ticks(m){
      if(!m.mine)return null;
      const read=(m.read_by||[]).length,delivered=m.delivered_count>0;
      const cls=read?'read':delivered?'delivered':'sent',text=read?'✓✓':delivered?'✓✓':'✓';
      const label=read?`Read by ${m.read_by.join(', ')}`:delivered?'Delivered':'Sent';
      return el('span',{class:`sc-ticks ${cls}`,title:label,'aria-label':label,text});
    }
    function bubble(m){
      const mine=m.mine;
      return el('article',{class:`sc-msg ${mine?'mine':'theirs'}`,'data-id':m.id},
        mine?null:el('span',{class:'sc-avatar','aria-hidden':'true',text:initials(m.sender_name)}),
        el('div',{class:'sc-bubble'},mine?null:el('div',{class:'sc-who'},el('b',{text:m.sender_name}),el('span',{text:m.sender_role})),el('p',{text:m.message}),el('div',{class:'sc-meta'},el('time',{datetime:m.created_at,text:timeOf(m.created_at)}),ticks(m))),
        mine&&(m.read_by||[]).length?el('small',{class:'sc-seen',text:`Seen by ${m.read_by.length>2?m.read_by.slice(0,2).join(', ')+' +'+(m.read_by.length-2):m.read_by.join(', ')}`}):null);
    }
    function render(rows){
      const nodes=[];let day='';
      for(const m of rows){const d=dayOf(m.created_at);if(d!==day){day=d;nodes.push(el('div',{class:'sc-day',text:d}))}nodes.push(bubble(m))}
      const nearBottom=log.scrollHeight-log.scrollTop-log.clientHeight<80;
      log.replaceChildren(...(nodes.length?nodes:[el('p',{class:'sc-empty',text:'No messages yet. Say hello to your team.'})]));
      if(nearBottom||!lastKey)log.scrollTop=log.scrollHeight;
    }
    async function load(visible){
      try{
        const d=await api('/api/saas/staff-chat'+(visible&&state==='normal'||visible&&state==='max'?'?read=1':'')),rows=d.messages||[];
        unread=d.unread||0;badge.hidden=!unread||state!=='closed';badge.textContent=unread>9?'9+':String(unread);launch.classList.toggle('has-unread',!!unread&&state==='closed');
        const key=rows.map(m=>m.id+':'+(m.delivered_count||0)+':'+((m.read_by||[]).length)).join('|');
        // receipts: tell the sender when a message was delivered and when it was read
        for(const m of rows){if(!m.mine||!watching.has(m.id))continue;const w=watching.get(m.id);
          if((m.read_by||[]).length>w.read){live(`${m.read_by.at(-1)} read your message.`);w.read=m.read_by.length;w.delivered=true}
          else if(m.delivered_count>0&&!w.delivered){live('Your message was delivered.');w.delivered=true}}
        if(key!==lastKey){const newest=rows.at(-1);if(lastKey&&newest&&!newest.mine&&state==='closed')live(`New message from ${newest.sender_name}.`);lastKey=key;if(state!=='closed'||!log.children.length||log.querySelector('.sc-empty'))render(rows)}
      }catch(e){if(state!=='closed')log.replaceChildren(el('p',{class:'sc-empty',text:e.message}))}
    }
    form.onsubmit=async e=>{
      e.preventDefault();const message=ta.value.trim();if(!message)return;send.disabled=true;
      try{const r=await api('/api/saas/staff-chat',{method:'POST',body:JSON.stringify({message})});ta.value='';ta.style.height='';watching.set(r.message.id,{delivered:false,read:0});lastKey='';await load(true);log.scrollTop=log.scrollHeight;send.classList.add('sent');setTimeout(()=>send.classList.remove('sent'),600)}
      catch(err){live(err.message,'error')}finally{send.disabled=false}
    };
    ta.addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.isComposing){e.preventDefault();form.requestSubmit()}});
    ta.addEventListener('input',()=>{ta.style.height='auto';ta.style.height=Math.min(ta.scrollHeight,120)+'px'});

    async function loadTeam(){
      try{
        const r=await api('/api/saas/staff-availability'+(inactiveBox.checked?'?include_inactive=1':''));
        inactiveToggle.hidden=!r.can_view_inactive;if(!r.can_view_inactive)inactiveBox.checked=false;
        dir.replaceChildren(...((r.staff||[]).map(p=>{const status=p.availability||'unavailable',label=(p.account_status==='active'?status:'inactive').replaceAll('_',' ');
          return el('div',{class:'staff-directory-person'},el('span',{class:'staff-status-dot','data-status':status,'aria-hidden':'true'}),el('span',{},el('b',{text:p.full_name}),' ',el('small',{text:`${p.designation} · ${label}${p.reason?' · '+p.reason:''}${p.returns_at?' · Returns '+new Date(p.returns_at).toLocaleString():''}`})))}))||[]);
        if(!dir.children.length)dir.textContent='No active team members found.';
      }catch(e){dir.textContent=e.message}
    }
    inactiveBox.addEventListener('change',loadTeam);
    team.addEventListener('toggle',()=>{if(team.open)loadTeam()});
    avail.addEventListener('submit',async e=>{e.preventDefault();const b=avail.querySelector('button'),f=new FormData(avail),raw=String(f.get('returns_at')||'');b.disabled=true;
      try{await api('/api/saas/staff-availability/me',{method:'PUT',body:JSON.stringify({status:f.get('status'),reason:f.get('reason'),returns_at:raw?new Date(raw).toISOString():null})});await loadTeam()}catch(err){live(err.message,'error')}finally{b.disabled=false}});

    apply();load(false);
    setInterval(()=>{if(document.hidden)return;if(state==='closed')load(false);else if(state!=='min')load(true)},6500);
    setInterval(()=>{if(!document.hidden&&state==='closed')load(false)},25000);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',build);else build();
})();
