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
    const buttons=Array.from($$('.settings-nav [data-settings-target]'));
    const panels=Array.from($$('#onboarding-form .settings-content > article'));
    if(!buttons.length||!panels.length)return;
    const nav=$('.settings-nav');nav.setAttribute('role','tablist');nav.setAttribute('aria-label','Business setup sections');
    function select(button){
      const panel=$(`#${button.dataset.settingsTarget}`)?.closest('article');if(!panel)return;
      panels.forEach(item=>{item.hidden=item!==panel});
      buttons.forEach(item=>{item.classList.toggle('active',item===button);item.setAttribute('aria-selected',String(item===button));item.tabIndex=item===button?0:-1});
    }
    buttons.forEach((button,index)=>{
      const panel=$(`#${button.dataset.settingsTarget}`)?.closest('article');if(!panel)return;
      button.id=`setup-tab-${index}`;button.setAttribute('role','tab');button.setAttribute('aria-controls',panel.id);
      panel.setAttribute('role','tabpanel');panel.setAttribute('aria-labelledby',button.id);
      button.addEventListener('click',()=>select(button));
      button.addEventListener('keydown',event=>{
        let next=index;
        if(['ArrowRight','ArrowDown'].includes(event.key))next=(index+1)%buttons.length;
        else if(['ArrowLeft','ArrowUp'].includes(event.key))next=(index+buttons.length-1)%buttons.length;
        else if(event.key==='Home')next=0;
        else if(event.key==='End')next=buttons.length-1;
        else return;
        event.preventDefault();select(buttons[next]);buttons[next].focus();
      });
    });
    $('#onboarding-form')?.addEventListener('invalid',event=>{
      const panel=event.target.closest('article');
      const button=buttons.find(item=>item.getAttribute('aria-controls')===panel?.id);
      if(button)select(button);
    },true);
    select(buttons[0]);
  }

  function setupContextHelp(){
    $$('[data-context-help]').forEach(btn=>btn.addEventListener('click',()=>openCopilot(`Explain the ${btn.dataset.contextHelp} section. Tell me what I should enter here, what Super Pro AI Office Manager will do with it, what can update automatically, what still requires approval, and where the information is used.`)));
    $$('[data-support-open],#support-open-case').forEach(btn=>btn.addEventListener('click',()=>window.GDSSupport?.open?.()));
  }

  function setupLiveToasts(){
    let stack=$('#gds-live-toasts');if(!stack){stack=document.createElement('div');stack.id='gds-live-toasts';stack.className='gds-live-toasts';document.body.append(stack)}
    const push=(text,type='success')=>{if(!text||(window.SuperProNotificationSettings?.muted&&type!=='error'))return;if(stack.children.length>=3)stack.firstElementChild.remove();const item=document.createElement('div');item.className=`gds-live-toast ${type}`;item.innerHTML=`<span>${type==='error'?'!':'✓'}</span><div><b>${type==='error'?'Action needs attention':'Live update'}</b><small>${esc(text)}</small></div>`;stack.append(item);requestAnimationFrame(()=>item.classList.add('show'));setTimeout(()=>{item.classList.remove('show');setTimeout(()=>item.remove(),300)},5200)};
    const notice=$('#notice');if(notice){new MutationObserver(()=>{const t=notice.textContent.trim();if(t)push(t,notice.style.color?.includes('red')?'error':'success')}).observe(notice,{childList:true,characterData:true,subtree:true})}
    let channel=null;const bindChannel=()=>{channel?.close();const org=window.GDS_SESSION?.organisation?.id;if(!org||!('BroadcastChannel' in window))return;channel=new BroadcastChannel('gds-workspace-live:'+org);channel.addEventListener('message',e=>e.data?.message&&push(e.data.message,e.data.type||'success'))};window.addEventListener('superpro:workspace-ready',bindChannel);bindChannel();
    window.GDSLive={push,broadcast:(message,type='success')=>{push(message,type);channel?.postMessage({message,type})}};
    let releaseTries=0;
    async function checkProductRelease(){
      try{
        const d=await api('/api/saas/releases/latest'),release=d.release;if(!release)return;
        const key='superpro_release_seen:'+release.version;if(localStorage.getItem(key)==='1')return;
        // Never stack a second modal on top of one the person must answer first (terms, tour, sign-out prompts): try again shortly.
        if(document.querySelector('dialog[open]:not(#superpro-release-dialog), .gds-tour-active, [data-tour-open="true"]')){releaseTries+=1;if(releaseTries<40)setTimeout(checkProductRelease,4000);return}
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

    let baseline=new Set();async function poll(){try{const d=await api('/api/saas/live-activity');const rows=d.events||[];if(!baseline.size){rows.forEach(x=>baseline.add(x.id));return}for(const e of rows.slice().reverse()){if(!baseline.has(e.id)){baseline.add(e.id);{const raw=String(e.event_type||'');if(/regulatory|snapshot|heartbeat|tick|cron|\.checked$/i.test(raw))continue;const words=raw.replace(/[._-]+/g,' ').trim()||'workspace update';push(words.charAt(0).toUpperCase()+words.slice(1)+'.')}}}if(baseline.size>100)baseline=new Set(rows.map(x=>x.id))}catch{}}
    setTimeout(poll,1500);setInterval(poll,7000);
  }

  function setupSupportNav(){
    document.addEventListener('click',e=>{const b=e.target.closest('[data-jump]');if(b?.dataset.jump==='support'){setTimeout(()=>document.querySelector('#support-view')?.scrollIntoView({block:'start'}),80)}});
  }

  function install(){setupSettingsNav();setupContextHelp();setupLiveToasts();setupSupportNav()}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install);else install();
})();
