(() => {
  const $=s=>document.querySelector(s), $$=s=>document.querySelectorAll(s);
  const esc=v=>String(v??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
  const api=async(url,opt={})=>{const r=await fetch(url,{credentials:'same-origin',headers:{'content-type':'application/json',...(opt.headers||{})},...opt});const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(r.status===429?'This feature is receiving several requests at once. Please wait a few seconds and try again.':(d.error||'The requested action could not be completed.'));return d};

  function openCopilot(question=''){
    const launch=$('.copilot-launch'),panel=$('#gds-copilot .copilot-panel'),ta=$('#gds-copilot textarea');
    if(launch&&!launch.hidden)launch.click();else if(panel)panel.hidden=false;
    if(ta){ta.value=question;ta.focus();if(question)setTimeout(()=>ta.closest('form')?.requestSubmit(),120)}
  }

  function setupSettingsNav(){
    $$('.settings-nav [data-settings-target]').forEach(btn=>btn.addEventListener('click',()=>{
      const target=$(`#${btn.dataset.settingsTarget}`);if(!target)return;
      $$('.settings-nav [data-settings-target]').forEach(x=>x.classList.toggle('active',x===btn));
      target.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'center'});
      target.classList.add('section-focus');setTimeout(()=>target.classList.remove('section-focus'),1400);
    }));
  }

  function setupContextHelp(){
    $$('[data-context-help]').forEach(btn=>btn.addEventListener('click',()=>openCopilot(`Explain the ${btn.dataset.contextHelp} section. Tell me what I should enter here, what Super Pro AI Office Manager will do with it, what can update automatically, what still requires approval, and where the information is used.`)));
    $$('[data-support-open],#support-open-case').forEach(btn=>btn.addEventListener('click',()=>window.GDSSupport?.open?.()));
  }

  function setupLiveToasts(){
    let stack=$('#gds-live-toasts');if(!stack){stack=document.createElement('div');stack.id='gds-live-toasts';stack.className='gds-live-toasts';document.body.append(stack)}
    const push=(text,type='success')=>{if(!text)return;const item=document.createElement('div');item.className=`gds-live-toast ${type}`;item.innerHTML=`<span>${type==='error'?'!':'✓'}</span><div><b>${type==='error'?'Action needs attention':'Live update'}</b><small>${esc(text)}</small></div>`;stack.append(item);requestAnimationFrame(()=>item.classList.add('show'));setTimeout(()=>{item.classList.remove('show');setTimeout(()=>item.remove(),300)},5200)};
    const notice=$('#notice');if(notice){new MutationObserver(()=>{const t=notice.textContent.trim();if(t)push(t,notice.style.color?.includes('red')?'error':'success')}).observe(notice,{childList:true,characterData:true,subtree:true})}
    const channel=('BroadcastChannel'in window)?new BroadcastChannel('gds-workspace-live'):null;channel?.addEventListener('message',e=>e.data?.message&&push(e.data.message,e.data.type||'success'));
    window.GDSLive={push,broadcast:(message,type='success')=>{push(message,type);channel?.postMessage({message,type})}};
    async function checkProductRelease(){
      try{
        const d=await api('/api/saas/releases/latest'),release=d.release;if(!release)return;
        const key='superpro_release_seen:'+release.version;if(localStorage.getItem(key)==='1')return;
        push(`Super Pro ${release.version}: ${release.title}`);
        let dialog=$('#superpro-release-dialog');
        if(!dialog){dialog=document.createElement('dialog');dialog.id='superpro-release-dialog';dialog.className='modal release-dialog';document.body.append(dialog)}
        const details=(release.details||[]).map(x=>`<article class="release-change"><b>${esc(x.area)}</b><small><strong>Before:</strong> ${esc(x.before)}</small><small><strong>Now:</strong> ${esc(x.now)}</small></article>`).join('');
        dialog.innerHTML=`<div class="release-card"><p class="kicker">PRODUCT UPDATE</p><h2>${esc(release.title)}</h2><p>${esc(release.summary)}</p><div class="release-changes">${details}</div><div class="dialog-actions"><button class="primary-button compact" type="button" data-release-ok>Got it</button></div></div>`;
        dialog.querySelector('[data-release-ok]').onclick=()=>{localStorage.setItem(key,'1');dialog.close()};
        dialog.addEventListener('cancel',()=>localStorage.setItem(key,'1'),{once:true});
        dialog.showModal();
      }catch{}
    }
    setTimeout(checkProductRelease,2200);
    async function checkRegulatorySourcesIfDue(){
      const interval=6*60*60*1000,key='superpro_regulatory_check_at';
      const last=Number(localStorage.getItem(key)||0);if(Date.now()-last<interval)return;
      localStorage.setItem(key,String(Date.now()));
      try{
        const d=await api('/api/saas/regulatory/check',{method:'POST',body:'{}'});
        const changed=(d.results||[]).filter(x=>x.changed);
        if(changed.length){
          push(`${changed.length} official regulatory source page${changed.length===1?' has':'s have'} changed. Review the source before treating it as a new obligation.`,'success');
        }
      }catch{}
    }
    setTimeout(checkRegulatorySourcesIfDue,4200);
    setInterval(checkRegulatorySourcesIfDue,60*60*1000);

    let baseline=new Set();async function poll(){try{const d=await api('/api/saas/live-activity');const rows=d.events||[];if(!baseline.size){rows.forEach(x=>baseline.add(x.id));return}for(const e of rows.slice().reverse()){if(!baseline.has(e.id)){baseline.add(e.id);push(`${String(e.event_type||'workspace update').replaceAll('_',' ')} completed.`)}}if(baseline.size>100)baseline=new Set(rows.map(x=>x.id))}catch{}}
    setTimeout(poll,1500);setInterval(poll,7000);
  }

  function setupStaffChat(){
    if($('#gds-staff-chat'))return;
    const shell=document.createElement('div');shell.id='gds-staff-chat';shell.className='gds-staff-chat';shell.innerHTML=`<button class="staff-chat-launch" type="button" aria-expanded="false"><span>◎</span><div><b>Office chat</b><small>Internal staff only</small></div></button><section class="staff-chat-panel" hidden aria-label="Office staff chat"><header><div><span class="ai-orb">◎</span><div><b>Office staff chat</b><small>Workspace-internal discussion</small></div></div><div class="staff-chat-window-actions"><button type="button" data-staff-minimise aria-label="Minimise staff chat" title="Minimise">—</button><button type="button" data-staff-close aria-label="Close staff chat" title="Close">×</button></div></header><details class="staff-directory"><summary>Team availability</summary><div class="staff-directory-list" aria-live="polite">Loading team…</div><form class="staff-availability-form"><label>Status <select name="status"><option value="available">Available</option><option value="busy">Busy</option><option value="unavailable">Unavailable</option><option value="on_leave">On leave</option><option value="day_off">Day off</option><option value="working_from_home">Working from home</option></select></label><label>Short reason (optional) <input name="reason" maxlength="120" placeholder="e.g. On a customer call"></label><label>Return time (optional) <input name="returns_at" type="datetime-local"></label><button type="submit">Update my status</button></form></details><div class="staff-chat-log"><p>Loading team messages…</p></div><form><textarea rows="2" maxlength="4000" placeholder="Message your team…" required></textarea><button type="submit">Send</button></form></section>`;document.body.append(shell);
    const launch=shell.querySelector('.staff-chat-launch'),panel=shell.querySelector('.staff-chat-panel'),log=shell.querySelector('.staff-chat-log'),form=shell.querySelector('form'),ta=shell.querySelector('textarea');let last='';
    async function load(silent=false){try{const d=await api('/api/saas/staff-chat'),rows=d.messages||[];const newest=rows.at(-1)?.id||'';if(silent&&last&&newest&&newest!==last)window.GDSLive?.push('A new internal office-chat message arrived.');last=newest;log.innerHTML=rows.length?rows.map(x=>`<article><div><b>${esc(x.sender_name)}</b><span>${esc(x.sender_role)}</span></div><p>${esc(x.message)}</p><small>${new Date(x.created_at).toLocaleString()}</small></article>`).join(''):'<p>No staff messages yet. Start an internal discussion here.</p>';log.scrollTop=log.scrollHeight}catch(e){log.innerHTML=`<p>${esc(e.message)}</p>`}}
    const directory=shell.querySelector('.staff-directory-list'),availabilityForm=shell.querySelector('.staff-availability-form');
    async function loadTeam(){
      try{
        const result=await api('/api/saas/staff-availability');
        directory.innerHTML=(result.staff||[]).map(person=>{
          const status=person.availability||'unavailable';
          const label=status.replaceAll('_',' ');
          const reason=person.reason?' · '+esc(person.reason):'';
          const returns=person.returns_at?' · Returns '+esc(new Date(person.returns_at).toLocaleString()):'';
          return '<div class="staff-directory-person"><span class="staff-status-dot" data-status="'+esc(status)+'" aria-hidden="true"></span><span><b>'+esc(person.full_name)+'</b> <small>'+esc(person.designation)+' · '+esc(label)+reason+returns+'</small></span></div>';
        }).join('')||'<p>No active team members found.</p>';
      }catch(error){directory.textContent=error.message}
    }
    availabilityForm.addEventListener('submit',async event=>{
      event.preventDefault();
      const button=availabilityForm.querySelector('button');
      const formData=new FormData(availabilityForm);
      const rawReturn=String(formData.get('returns_at')||'');
      const returns_at=rawReturn?new Date(rawReturn).toISOString():null;
      button.disabled=true;
      try{
        await api('/api/saas/staff-availability/me',{method:'PUT',body:JSON.stringify({status:formData.get('status'),reason:formData.get('reason'),returns_at})});
        await loadTeam();
      }catch(error){window.GDSLive?.push(error.message,'error')}
      finally{button.disabled=false}
    });
    shell.querySelector('.staff-directory').addEventListener('toggle',event=>{if(event.target.open)loadTeam()});
    const hidePanel=()=>{panel.hidden=true;launch.hidden=false;launch.setAttribute('aria-expanded','false');window.dispatchEvent(new CustomEvent('superpro:floating-chat',{detail:{active:''}}))};
    launch.onclick=()=>{panel.hidden=false;launch.hidden=true;launch.setAttribute('aria-expanded','true');document.querySelector('#gds-copilot .copilot-panel')?.setAttribute('hidden','');const cp=document.querySelector('#gds-copilot .copilot-launch');if(cp)cp.hidden=true;window.dispatchEvent(new CustomEvent('superpro:floating-chat',{detail:{active:'staff'}}));load();loadTeam();ta.focus()};
    panel.setAttribute('role','dialog');panel.setAttribute('aria-modal','false');panel.setAttribute('aria-label','Office staff chat');
    launch.setAttribute('aria-controls','gds-staff-chat-panel');panel.id='gds-staff-chat-panel';
    window.addEventListener('superpro:floating-chat',e=>{if(e.detail?.active==='copilot'){panel.hidden=true;launch.hidden=true}else if(!e.detail?.active&&panel.hidden)launch.hidden=false});shell.querySelector('[data-staff-close]').onclick=hidePanel;shell.querySelector('[data-staff-minimise]').onclick=hidePanel;document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!panel.hidden)hidePanel()});form.onsubmit=async e=>{e.preventDefault();const message=ta.value.trim();if(!message)return;const b=form.querySelector('button');b.disabled=true;try{await api('/api/saas/staff-chat',{method:'POST',body:JSON.stringify({message})});ta.value='';await load();window.GDSLive?.broadcast('Office chat message sent to your workspace team.')}catch(err){window.GDSLive?.push(err.message,'error')}finally{b.disabled=false}};setInterval(()=>{if(!panel.hidden)load(true)},6500);
  }

  function setupSupportNav(){
    document.addEventListener('click',e=>{const b=e.target.closest('[data-jump]');if(b?.dataset.jump==='support'){setTimeout(()=>document.querySelector('#support-view')?.scrollIntoView({block:'start'}),80)}});
  }

  function install(){setupSettingsNav();setupContextHelp();setupLiveToasts();setupStaffChat();setupSupportNav()}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install);else install();
})();
