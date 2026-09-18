(()=>{
  const $$=(s,r=document)=>[...r.querySelectorAll(s)];

  // Register only the public /saas shell. Private API/workspace routes stay
  // network-only according to sw.js.
  if('serviceWorker' in navigator){
    window.addEventListener('load',()=>navigator.serviceWorker.register('/saas/sw.js?v=20260919.5',{scope:'/saas/',updateViaCache:'none'}).catch(()=>{}));
  }

  // Preserve referral attribution during the verified-account journey.
  const ref=new URLSearchParams(location.search).get('ref');
  if(ref)sessionStorage.setItem('superpro_referral_code',ref.trim().toUpperCase());

  // Smooth in-page navigation without interfering with real links.
  $$('a[href^="#"]').forEach(a=>a.addEventListener('click',e=>{
    const id=a.getAttribute('href').slice(1),el=id&&document.getElementById(id);
    if(!el)return;
    e.preventDefault();
    el.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'start'});
    history.replaceState(null,'','#'+id);
  }));

  // Optional product-update newsletter.
  const form=document.querySelector('#product-newsletter-form');
  if(form){
    const message=()=>document.querySelector('#product-newsletter-message');
    form.addEventListener('submit',async e=>{
      e.preventDefault();
      const m=message(),b=form.querySelector('button[type="submit"]');b.disabled=true;m.textContent='Saving your opt-in…';
      try{
        const data=Object.fromEntries(new FormData(form));data.consent=Boolean(form.elements.consent?.checked);data.source='public_product_site';
        const r=await fetch('/api/newsletter/subscribe',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(data)});
        const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||'Subscription could not be saved.');m.textContent='✓ '+d.message;
      }catch(err){m.textContent=err.message}finally{b.disabled=false}
    });
    document.querySelector('#product-newsletter-unsubscribe')?.addEventListener('click',async()=>{
      const email=String(form.elements.email.value||'').trim(),m=message();if(!email){m.textContent='Enter the email address you want to unsubscribe.';return}
      m.textContent='Updating your preference…';
      try{
        const r=await fetch('/api/newsletter/unsubscribe',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email})});
        const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||'Preference could not be updated.');m.textContent='✓ '+d.message;
      }catch(err){m.textContent=err.message}
    });
  }
})();