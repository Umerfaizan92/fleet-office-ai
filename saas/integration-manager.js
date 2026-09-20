(()=>{
  if(window.SuperProIntegrationManager)return;
  const esc=v=>String(v??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
  const api=async(url,opt={})=>{
    const r=await fetch(url,{credentials:'same-origin',headers:{'content-type':'application/json',...(opt.headers||{})},...opt});
    const d=await r.json().catch(()=>({}));
    if(!r.ok)throw new Error(d.error||'The integration action could not be completed.');
    return d;
  };
  const notify=(message,type='success')=>{
    if(window.GDSLive?.push)window.GDSLive.push(message,type);
    else console[type==='error'?'error':'log'](message);
  };
  const style=document.createElement('style');
  style.textContent=[
    '.integration-card.self-service.has-integration-manager{grid-template-columns:44px minmax(0,1fr)!important;grid-template-rows:auto auto!important;align-items:start!important;height:auto!important;min-height:0!important;overflow:visible!important}.integration-card.self-service.has-integration-manager>.integration-logo{grid-column:1;grid-row:1}.integration-card.self-service.has-integration-manager>div:not(.integration-manager){grid-column:2;grid-row:1;min-width:0}.integration-card.self-service.has-integration-manager>[data-connect-provider]{display:none!important}.integration-manager{grid-column:1/-1!important;grid-row:2!important;width:100%;min-width:0;margin-top:4px;padding-top:12px;border-top:1px solid rgba(255,255,255,.08);display:grid;gap:12px;align-self:stretch}',
    '.integration-manager-actions{display:flex;flex-wrap:wrap;gap:8px;align-items:center;justify-content:flex-start}.integration-manager-actions button{position:static!important;grid-column:auto!important;width:auto!important;max-width:100%;margin:0!important}',
    '.integration-resource-list{display:grid;gap:6px;max-height:220px;overflow:auto}',
    '.integration-resource-list label{display:flex;gap:9px;align-items:flex-start;padding:8px 9px;border:1px solid rgba(255,255,255,.07);border-radius:10px;background:rgba(255,255,255,.025)}',
    '.integration-resource-list label>span{display:grid;gap:2px}.integration-resource-list small{color:#8f9bab}',
    '.integration-requirements-inline{grid-column:1/-1;margin-top:8px;padding:9px 10px;border:1px solid rgba(232,190,105,.25);border-radius:10px;background:rgba(232,190,105,.06);color:#c8b88e;line-height:1.5}',
    '.integration-health-pass{color:#72d39a}.integration-health-fail{color:#ff8f8f}',
    '.integration-manager-status{font-size:11px;line-height:1.5;color:#9aa5b4;overflow-wrap:anywhere}'
  ].join('');
  document.head.append(style);

  const help={
    meta:'Super Pro must be registered with Meta once. Each subscriber then signs in on Meta itself and authorises their own Facebook Pages and Instagram professional accounts.',
    whatsapp:'Super Pro must be configured for Meta/WhatsApp Business. Each subscriber authorises their own Meta business, WhatsApp Business Account and phone number.',
    tiktok:'Super Pro needs an approved TikTok developer app. Subscribers sign in on TikTok itself. Publishing appears only when the app is approved for the required publishing scope.',
    youtube:'Super Pro needs a Google OAuth client. Subscribers sign in on Google itself and authorise their own YouTube channel.',
    google_business:'Super Pro needs a Google OAuth client and Business Profile API access. Subscribers authorise their own Google Business Profile account and locations.',
    x:'Super Pro needs its X OAuth application credentials. Subscribers sign in on X itself; Super Pro never receives their X password.',
    snapchat:'Super Pro needs an approved Snapchat OAuth application. Subscribers sign in with Snapchat and authorise the resources granted by Snapchat.',
    website:'Website/API credentials can be connected without exposing them to other workspaces.',
    email_sms:'Email/SMS transport is currently platform-managed; customer-specific provider connections can be added as separate OAuth/API connectors.'
  };

  function managerHtml(x){
    const resources=Array.isArray(x.resources)?x.resources:[];
    const selected=new Set((x.selected_resources||[]).map(r=>String(r.id)));
    const picker=resources.length?'<div><b>Authorised resources</b><small>Select what this workspace may actually use.</small><div class="integration-resource-list">'+resources.map(r=>'<label><input type="checkbox" data-im-resource="'+esc(r.id)+'" '+(selected.has(String(r.id))?'checked':'')+'><span><b>'+esc(r.label||r.id)+'</b><small>'+esc(String(r.type||'resource').replaceAll('_',' ')+(r.detail?' · '+r.detail:''))+'</small></span></label>').join('')+'</div><button type="button" class="secondary-button compact" data-im-save="'+esc(x.provider)+'">Save selection</button></div>':'';
    const health=x.last_test_status==='pass'?'<span class="integration-health-pass">Last connection test passed</span>':x.last_test_status==='fail'?'<span class="integration-health-fail">Last connection test failed</span>':'<span>Connection test recommended</span>';
    return '<div class="integration-manager" data-im-manager="'+esc(x.provider)+'"><div class="integration-manager-status">'+health+(x.last_tested_at?' · '+esc(new Date(x.last_tested_at).toLocaleString()):'')+'</div><div class="integration-manager-actions"><button type="button" class="secondary-button compact" data-im-test="'+esc(x.provider)+'">Test connection</button><button type="button" class="secondary-button compact" data-im-disconnect="'+esc(x.provider)+'">Disconnect</button></div>'+picker+'</div>';
  }

  async function enhance(){
    const grid=document.querySelector('#self-service-integration-grid');
    if(!grid)return;
    let d;
    try{d=await api('/api/saas/integrations/self-service')}catch{return}
    for(const x of d.integrations||[]){
      const card=grid.querySelector('[data-provider-card="'+CSS.escape(x.provider)+'"]');
      if(!card)continue;
      card.querySelector('[data-im-manager]')?.remove();
      card.querySelector('[data-im-requirements]')?.remove();
      const legacyAction=card.querySelector('[data-connect-provider]');
      card.classList.toggle('has-integration-manager',x.status==='connected');
      if(x.status==='connected'){
        if(legacyAction){legacyAction.hidden=true;legacyAction.setAttribute('aria-hidden','true')}
        card.insertAdjacentHTML('beforeend',managerHtml(x));
      }else{
        if(legacyAction){legacyAction.hidden=false;legacyAction.removeAttribute('aria-hidden')}
      }
      if(x.status!=='connected'&&!x.provider_ready){
        const box=document.createElement('div');
        box.className='integration-requirements-inline';
        box.dataset.imRequirements=x.provider;
        box.hidden=true;
        box.textContent=help[x.provider]||'This provider needs Super Pro platform registration before subscribers can securely authorise their own account.';
        card.append(box);
      }
    }
  }

  document.addEventListener('click',async e=>{
    const noReady=e.target.closest('[data-connect-provider][data-ready="0"]');
    if(noReady){
      e.preventDefault();e.stopImmediatePropagation();
      const card=noReady.closest('[data-provider-card]'),box=card?.querySelector('[data-im-requirements]');
      if(box)box.hidden=!box.hidden;
      return;
    }
    const already=e.target.closest('[data-connect-provider][data-status="connected"]');
    if(already){
      e.preventDefault();e.stopImmediatePropagation();
      already.closest('[data-provider-card]')?.querySelector('[data-im-manager]')?.scrollIntoView({behavior:'smooth',block:'nearest'});
      return;
    }

    const test=e.target.closest('[data-im-test]');
    if(test){
      const provider=test.dataset.imTest;test.disabled=true;test.textContent='Testing…';
      try{
        const r=await api('/api/saas/integrations/self-service/'+encodeURIComponent(provider)+'/test',{method:'POST',body:'{}'});
        notify((r.account_label||provider)+': connection test passed'+(r.refreshed?' and token refreshed':'')+'.');
      }catch(err){notify(err.message,'error')}
      finally{await enhance();test.disabled=false}
      return;
    }

    const save=e.target.closest('[data-im-save]');
    if(save){
      const provider=save.dataset.imSave,card=save.closest('[data-provider-card]');
      const resource_ids=[...card.querySelectorAll('[data-im-resource]:checked')].map(x=>x.dataset.imResource);
      save.disabled=true;
      try{
        await api('/api/saas/integrations/self-service/'+encodeURIComponent(provider)+'/resources',{method:'POST',body:JSON.stringify({resource_ids})});
        notify('Authorised resource selection saved.');
      }catch(err){notify(err.message,'error')}
      finally{save.disabled=false;await enhance()}
      return;
    }

    const disconnect=e.target.closest('[data-im-disconnect]');
    if(disconnect){
      const provider=disconnect.dataset.imDisconnect;
      if(!confirm('Disconnect this provider from this workspace? Stored provider tokens will be removed from Super Pro.'))return;
      disconnect.disabled=true;disconnect.textContent='Disconnecting…';
      try{
        const r=await api('/api/saas/integrations/self-service/'+encodeURIComponent(provider),{method:'DELETE'});
        notify(r.remote_revoked?'Provider access revoked and local credentials removed.':'Local credentials removed. Review the provider connected-app settings if you also want to revoke remote access.');
        if(typeof window.loadSelfServiceIntegrations==='function')await window.loadSelfServiceIntegrations(true);
        else location.reload();
      }catch(err){notify(err.message,'error');disconnect.disabled=false}
      return;
    }
  },true);

  const observer=new MutationObserver(()=>{clearTimeout(observer._t);observer._t=setTimeout(enhance,120)});
  const start=()=>{
    const grid=document.querySelector('#self-service-integration-grid');
    if(grid){observer.observe(grid,{childList:true,subtree:true});enhance()}
  };
  document.readyState==='loading'?document.addEventListener('DOMContentLoaded',start):start();
  window.addEventListener('hashchange',()=>setTimeout(enhance,200));
  window.SuperProIntegrationManager={enhance};
})();