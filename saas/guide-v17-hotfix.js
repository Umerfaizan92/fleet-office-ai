(()=>{
  if(window.__SUPERPRO_GUIDE_V17_1__)return;
  window.__SUPERPRO_GUIDE_V17_1__=true;
  const nativeFetch=window.fetch.bind(window);

  function plainText(value){
    let s=String(value??'').replace(/\r\n?/g,'\n');
    s=s.replace(/\*\*([^*]+)\*\*/g,'$1')
      .replace(/__([^_]+)__/g,'$1')
      .replace(/~~([^~]+)~~/g,'$1')
      .replace(/`{1,3}([^`]+)`{1,3}/g,'$1')
      .replace(/^\s{0,3}#{1,6}\s+/gm,'')
      .replace(/^\s*[\-*]\s+/gm,'')
      .replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g,'$1')
      .replace(/[\*_~]+/g,'')
      .replace(/[ \t]+\n/g,'\n')
      .replace(/\n{3,}/g,'\n\n')
      .trim();
    return s;
  }
  function speechText(value){
    return plainText(value)
      .replace(/https?:\/\/\S+/gi,'')
      .replace(/\s+/g,' ')
      .trim();
  }

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

  function patchGuide(){
    const guide=window.GDSProductGuide;
    if(!guide?.answerAsync||guide.__plainSpeechV171)return false;
    guide.__plainSpeechV171=true;
    guide.cleanOutput=plainText;
    guide.cleanSpeech=speechText;

    const nativeAnswerAsync=guide.answerAsync.bind(guide);
    guide.answerAsync=async function(...args){
      const result=await nativeAnswerAsync(...args);
      if(result&&typeof result==='object'){
        if('text' in result)result.text=plainText(result.text);
        if(Array.isArray(result.suggestions))result.suggestions=result.suggestions.map(plainText).filter(Boolean);
      }
      return result;
    };

    if(guide.memory?.load){
      const nativeLoad=guide.memory.load.bind(guide.memory);
      guide.memory.load=function(...args){
        const rows=nativeLoad(...args);
        return Array.isArray(rows)?rows.map(x=>({...x,q:plainText(x?.q),a:plainText(x?.a)})):rows;
      };
    }
    return true;
  }

  if(!patchGuide()){
    let attempts=0;
    const timer=setInterval(()=>{attempts++;if(patchGuide()||attempts>120)clearInterval(timer)},100);
  }
})();