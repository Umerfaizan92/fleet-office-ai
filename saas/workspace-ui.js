// Small shared helpers for the workspace view modules. DOM is built with textContent only, never innerHTML,
// so customer-supplied text (emails, SMS, imported files) cannot inject markup.
(()=>{
  function el(tag,props,...kids){
    const node=document.createElement(tag);
    for(const [key,value] of Object.entries(props||{})){
      if(value===null||value===undefined||value===false)continue;
      if(key==='class')node.className=value;
      else if(key==='text')node.textContent=value;
      else if(key.startsWith('on')&&typeof value==='function')node.addEventListener(key.slice(2),value);
      else node.setAttribute(key,value===true?'':String(value));
    }
    for(const kid of kids.flat()){if(kid===null||kid===undefined||kid===false)continue;node.append(kid.nodeType?kid:document.createTextNode(String(kid)))}
    return node;
  }
  const api=(url,options)=>window.SuperProApi(url,options);
  const handlers=new Map();
  // Views announce themselves through the router's `gds:viewchange` event; modules start work on enter and stop on leave.
  window.addEventListener('gds:viewchange',event=>{
    const view=event.detail?.view;
    for(const [name,h] of handlers){
      if(name===view){h.active=true;Promise.resolve().then(()=>h.enter?.()).catch(()=>{})}
      else if(h.active){h.active=false;try{h.leave?.()}catch{}}
    }
  });
  const onView=(name,h)=>handlers.set(name,{...h,active:false});
  const when=iso=>{const d=new Date(iso);return Number.isNaN(d.getTime())?'':d.toLocaleString('en-AU',{timeZone:'Australia/Perth',day:'numeric',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'})};
  const money=cents=>new Intl.NumberFormat('en-AU',{style:'currency',currency:'AUD'}).format((Number(cents)||0)/100);
  const role=()=>String(window.GDS_SESSION?.user?.role||'').toLowerCase();
  window.SuperProUI={el,api,onView,when,money,role};
})();
