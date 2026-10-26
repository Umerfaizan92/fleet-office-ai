/* Public design layer: 3D tilt, mobile carousels, legal table of contents. Safe to fail: pages work without it. */
(function(){
  'use strict';
  const reduce=matchMedia('(prefers-reduced-motion: reduce)').matches||localStorage.getItem('foai-motion')==='reduce';

  // carousels: layout switches on in CSS at <=900px; controls are always built but hidden on wide screens
  function carousel(track,startOnFeatured){
    if(!track||track.dataset.pdCar)return;
    const items=[...track.children].filter(n=>n.tagName!=='I');if(items.length<2)return;
    track.dataset.pdCar='1';track.classList.add('pd-car');
    const ctrl=document.createElement('div');ctrl.className='pd-ctrl';
    const prev=document.createElement('button');prev.type='button';prev.setAttribute('aria-label','Previous');prev.textContent='‹';
    const next=document.createElement('button');next.type='button';next.setAttribute('aria-label','Next');next.textContent='›';
    const dots=document.createElement('div');dots.className='pd-dots';
    items.forEach((_,n)=>{const b=document.createElement('button');b.type='button';b.setAttribute('aria-label','Show item '+(n+1)+' of '+items.length);dots.appendChild(b)});
    ctrl.append(prev,dots,next);track.after(ctrl);
    track.setAttribute('aria-roledescription','carousel');
    const idx=()=>{let b=0,d=1e9;const mid=track.scrollLeft+track.clientWidth/2;items.forEach((n,i)=>{const dd=Math.abs(n.offsetLeft+n.offsetWidth/2-mid);if(dd<d){d=dd;b=i}});return b};
    const mark=()=>{const i=idx();[...dots.children].forEach((d,k)=>{const on=k===i;d.classList.toggle('on',on);if(on)d.setAttribute('aria-current','true');else d.removeAttribute('aria-current')})};
    const go=i=>{const n=items[Math.max(0,Math.min(items.length-1,i))];track.scrollTo({left:n.offsetLeft-(track.clientWidth-n.offsetWidth)/2,behavior:reduce?'auto':'smooth'})};
    [...dots.children].forEach((b,n)=>b.addEventListener('click',()=>go(n)));
    prev.onclick=()=>go(idx()-1);next.onclick=()=>go(idx()+1);
    track.addEventListener('scroll',()=>requestAnimationFrame(mark),{passive:true});
    track.tabIndex=0;track.setAttribute('role','region');track.addEventListener('keydown',e=>{if(e.key==='ArrowRight'){go(idx()+1);e.preventDefault()}if(e.key==='ArrowLeft'){go(idx()-1);e.preventDefault()}});
    mark();
    if(startOnFeatured){const f=items.findIndex(n=>n.classList.contains('featured'));if(f>0)requestAnimationFrame(()=>{if(innerWidth<=900)go(f)})}
  }
  function init(){
    carousel(document.querySelector('.why-grid'));
    carousel(document.querySelector('.feature-grid'));
    carousel(document.querySelector('.industry-rail'));
    carousel(document.querySelector('.journey-track'));
    /* Plans stay a stacked list on small screens so prices and join actions are not inside a carousel. */

    // legal pages: contents list from the section headings
    const shell=document.querySelector('.legal-shell');
    if(shell&&!shell.querySelector('.legal-toc')){
      const hs=[...shell.querySelectorAll(':scope > section > h2')];
      if(hs.length>=6){
        const d=document.createElement('details');d.className='legal-toc';d.open=innerWidth>760;
        d.innerHTML='<summary>Contents</summary><ol></ol>';const ol=d.querySelector('ol');
        hs.forEach((h,i)=>{const id='s'+(i+1);h.id=h.id||id;const li=document.createElement('li');const a=document.createElement('a');a.href='#'+h.id;a.textContent=h.textContent;li.appendChild(a);ol.appendChild(li)});
        const first=shell.querySelector(':scope > section');if(first)first.before(d);
      }
    }
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
