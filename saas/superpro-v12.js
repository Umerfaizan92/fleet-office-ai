(()=>{
  const $$=(s,r=document)=>[...r.querySelectorAll(s)];
  // Keep visible branding consistent without touching backend names, storage keys or security identifiers.
  const brandMap=[];
  const walker=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);let n;while(n=walker.nextNode()){if(n.parentElement?.closest('script,style,code'))continue;let t=n.nodeValue;for(const [a,b] of brandMap)t=t.replaceAll(a,b);if(t!==n.nodeValue)n.nodeValue=t}
  const form=document.querySelector('#product-newsletter-form');
  if(form){
    const message=()=>document.querySelector('#product-newsletter-message');
    form.addEventListener('submit',async e=>{e.preventDefault();const m=message(),b=form.querySelector('button[type="submit"]');b.disabled=true;m.textContent='Saving your opt-in…';try{const data=Object.fromEntries(new FormData(form));data.consent=Boolean(form.elements.consent?.checked);data.source='public_product_site';const r=await fetch('/api/newsletter/subscribe',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(data)});const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||'Subscription could not be saved.');m.textContent='✓ '+d.message}catch(err){m.textContent=err.message}finally{b.disabled=false}});
    document.querySelector('#product-newsletter-unsubscribe')?.addEventListener('click',async()=>{const email=String(form.elements.email.value||'').trim(),m=message();if(!email){m.textContent='Enter the email address you want to unsubscribe.';return}m.textContent='Updating your preference…';try{const r=await fetch('/api/newsletter/unsubscribe',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email})});const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||'Preference could not be updated.');m.textContent='✓ '+d.message}catch(err){m.textContent=err.message}});
  }
  // Prevent accidental navigation on hash links and make section travel obvious.
  $$('a[href^="#"]').forEach(a=>a.addEventListener('click',e=>{const id=a.getAttribute('href').slice(1),el=id&&document.getElementById(id);if(el){e.preventDefault();el.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'start'});history.replaceState(null,'','#'+id)}}));

  function loadScript(src,id){
    if(document.getElementById(id))return Promise.resolve();
    return new Promise((resolve,reject)=>{const s=document.createElement('script');s.id=id;s.src=src;s.defer=true;s.onload=resolve;s.onerror=reject;document.head.appendChild(s)});
  }
  if(location.pathname.startsWith('/saas/')){
    loadScript('/saas/guide-v17-hotfix.js?v=17.0','superpro-guide-v17-hotfix')
      .catch(()=>{})
      .finally(()=>loadScript('/saas/guide-v16.js?v=16.2','superpro-guide-v16').catch(()=>{}))
      .finally(()=>{if(location.pathname.includes('/saas/workspace'))loadScript('/saas/ai-operations-v16.js?v=16.2','superpro-ai-ops-v16').catch(()=>{})});
  }
})();