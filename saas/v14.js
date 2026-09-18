(()=>{
  // v14 compatibility layer retained for referral attribution and public service-worker registration.
  // v15 owns the richer install UX to avoid duplicate install prompts/listeners.
  if('serviceWorker'in navigator)window.addEventListener('load',()=>navigator.serviceWorker.register('/saas/sw.js',{scope:'/saas/'}).catch(()=>{}));
  const ref=new URLSearchParams(location.search).get('ref');
  if(ref)sessionStorage.setItem('superpro_referral_code',ref.trim().toUpperCase());
})();
