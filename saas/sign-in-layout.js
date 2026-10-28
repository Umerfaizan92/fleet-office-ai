// Show the feature overview when space permits; keep the sign-in task first on phones.
(()=>{
 const panel=document.querySelector('.signin-feature-disclosure');if(!panel)return;
 const desktop=matchMedia('(min-width:901px)');const sync=()=>{panel.open=desktop.matches};sync();desktop.addEventListener('change',sync);
})();
