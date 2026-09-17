(()=>{
  if(window.__SUPERPRO_GUIDE_V17__)return;
  window.__SUPERPRO_GUIDE_V17__=true;
  const nativeFetch=window.fetch.bind(window);
  function conversationId(){
    const workspace=location.pathname.includes('/workspace');
    const key=workspace?'superpro_workspace_conversation_v17':'superpro_public_conversation_v17';
    let id='';
    try{id=localStorage.getItem(key)||''}catch{}
    if(!id){id=(crypto?.randomUUID?.()||`sp-${Date.now()}-${Math.random().toString(36).slice(2)}`);try{localStorage.setItem(key,id)}catch{}}
    return id;
  }
  window.fetch=async function superProGuideFetch(input,init={}){
    const url=typeof input==='string'?input:input?.url||'';
    if(!/\/api\/product-guide\/answer(?:\?|$)/.test(url)||String(init.method||'GET').toUpperCase()!=='POST')return nativeFetch(input,init);
    try{
      const body=JSON.parse(String(init.body||'{}'));
      if(body.question&&!/Conversation-ID:/i.test(body.question)){
        body.question=`Conversation-ID: ${conversationId()}\n${body.question}`;
        init={...init,body:JSON.stringify(body)};
      }
    }catch{}
    return nativeFetch(input,init);
  };
})();