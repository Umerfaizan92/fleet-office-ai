// One business per document. Switching reloads the page so old forms and timers
// cannot submit records to the newly selected business.
(()=>{
  const key='superpro_active_organisation';
  let active=sessionStorage.getItem(key)||'';
  const nativeFetch=window.fetch.bind(window);
  window.fetch=(input,options={})=>{
    const url=new URL(input instanceof Request?input.url:input,location.href);
    if(active&&url.origin===location.origin&&url.pathname.startsWith('/api/')){
      const headers=new Headers(options.headers||(input instanceof Request?input.headers:undefined));
      if(!headers.has('X-Organisation-Id'))headers.set('X-Organisation-Id',active);
      return nativeFetch(input,{...options,headers});
    }
    return nativeFetch(input,options);
  };
  window.SuperProWorkspaceContext={
    bind(id){if(active&&active!==id)throw new Error('Workspace selection mismatch. Reload before continuing.');active=id;sessionStorage.setItem(key,id)},
    clear(){sessionStorage.removeItem(key)},
    async switchTo(id){
      if(id===active)return;
      // Server membership validation is authoritative, including revoked access.
      const response=await nativeFetch('/api/saas/me',{credentials:'same-origin',headers:{'X-Organisation-Id':id}});
      if(!response.ok)throw new Error('You no longer have access to that business.');
      const data=await response.json();
      if(data.organisation?.id!==id)throw new Error('Business selection could not be verified.');
      sessionStorage.setItem(key,id);
      window.SuperProAIClient?.stopSpeech?.();
      location.replace('workspace.html#dashboard');
    }
  };
})();
