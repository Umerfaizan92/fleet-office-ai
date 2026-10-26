// Hover tilt for glass cards. Sets CSS variables only; the 3D itself is CSS (perspective + rotate).
// No dependencies, skipped on touch devices and when reduced motion is requested.
(()=>{
  const fine=matchMedia('(hover:hover) and (pointer:fine)'),calm=matchMedia('(prefers-reduced-motion:reduce)');
  if(!fine.matches||calm.matches)return;
  const SEL='.metric-card,.pricing-card,.panel.interactive,.integration-card';
  const MAX=6;let raf=0,cur=null,ev=null;
  const apply=()=>{
    raf=0;if(!cur||!ev)return;
    const r=cur.getBoundingClientRect(),x=(ev.clientX-r.left)/r.width,y=(ev.clientY-r.top)/r.height;
    cur.style.setProperty('--ry',((x-.5)*2*MAX).toFixed(2)+'deg');
    cur.style.setProperty('--rx',((.5-y)*2*MAX).toFixed(2)+'deg');
    cur.style.setProperty('--mx',(x*100).toFixed(1)+'%');cur.style.setProperty('--my',(y*100).toFixed(1)+'%');
  };
  const reset=el=>{el.classList.remove('is-tilting');el.style.removeProperty('--rx');el.style.removeProperty('--ry')};
  document.addEventListener('pointermove',e=>{
    const el=e.target.closest&&e.target.closest(SEL);
    if(cur&&cur!==el){reset(cur);cur=null}
    if(!el)return;
    if(!el.classList.contains('tilt'))el.classList.add('tilt');
    cur=el;ev=e;el.classList.add('is-tilting');
    if(!raf)raf=requestAnimationFrame(apply);
  },{passive:true});
  document.addEventListener('pointerleave',()=>{if(cur){reset(cur);cur=null}},true);
})();
