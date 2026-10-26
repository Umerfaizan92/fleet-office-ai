/* Gentle 3D tilt on the AI guide card. Off for touch screens and for people who prefer reduced motion. */
(()=>{
  const card=document.querySelector('.guide-card');if(!card)return;
  if(matchMedia('(prefers-reduced-motion:reduce)').matches||matchMedia('(hover:none)').matches)return;
  const shell=card.closest('.guide-shell')||card;
  shell.addEventListener('pointermove',e=>{
    if(e.target.closest('textarea,.chat-log'))return;
    const r=card.getBoundingClientRect(),x=(e.clientX-r.left)/r.width-.5,y=(e.clientY-r.top)/r.height-.5;
    card.style.setProperty('--ty',(x*5).toFixed(2)+'deg');card.style.setProperty('--tx',(-y*4).toFixed(2)+'deg');
  });
  shell.addEventListener('pointerleave',()=>{card.style.setProperty('--tx','0deg');card.style.setProperty('--ty','0deg')});
})();
