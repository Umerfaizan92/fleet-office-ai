// Asks each signed-in person to accept the current Terms and Privacy Notice once per version.
(()=>{
  const {el,api}=window.SuperProUI||{};if(!el)return;
  async function check(){
    let d;try{d=await api('/api/saas/legal')}catch{return}
    if(d.accepted)return;
    const box=el('input',{type:'checkbox',id:'legal-agree'});
    const ok=el('button',{class:'primary-button',type:'button',text:'I agree and continue',disabled:true});
    const out=el('button',{class:'secondary-button',type:'button',text:'Sign out'});
    const err=el('p',{class:'muted',role:'alert'});
    box.onchange=()=>{ok.disabled=!box.checked};
    const dlg=el('dialog',{class:'modal legal-modal','data-modal-priority':''},el('h2',{text:'Please review our updated terms'}),
      el('p',{text:'To keep using your workspace, please read and accept the current terms. This applies to every owner, staff member and worker who signs in. We record the date and version you accept.'}),
      el('ul',{},...d.documents.map(x=>el('li',{},el('a',{href:x.url,target:'_blank',rel:'noopener',text:x.title+' (opens in a new tab)'})))),
      el('label',{class:'legal-agree'},box,el('span',{text:' I have read and accept the Terms of Service and the Privacy Notice.'})),err,
      el('div',{class:'dialog-actions'},out,ok));
    dlg.addEventListener('cancel',e=>e.preventDefault());
    ok.onclick=async()=>{ok.disabled=true;try{await api('/api/saas/legal/accept',{method:'POST',body:JSON.stringify({version:d.version,agree:true})});dlg.close();dlg.remove()}catch(e){err.textContent=e.message;ok.disabled=false}};
    out.onclick=async()=>{try{await api('/api/saas/logout',{method:'POST',body:'{}'})}catch{}location.href='sign-in.html'};
    document.body.append(dlg);dlg.showModal();
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(check,600));else setTimeout(check,600);
})();
