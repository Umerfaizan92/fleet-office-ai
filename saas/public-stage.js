/* Public page as one screen: sections become tabs, so nobody has to scroll a long page.
   Without JavaScript the page still works as a normal scrolling page. */
(function(){
  'use strict';
  const main=document.querySelector('main');if(!main||document.getElementById('stage'))return;
  const $=(s,r=document)=>r.querySelector(s);
  const pick=(...sel)=>sel.map(s=>$(s,main)).filter(Boolean);
  const defs=[
    ['overview','Overview',pick('.hero','#satisfaction','#conversion-panel','.signal-bar')],
    ['why','Benefits',pick('#why')],
    ['capabilities','Capabilities',pick('#capabilities')],
    ['industries','Industries',pick('#industries','.journey-section')],
    ['plans','Plans',pick('#plans')],
    ['security','Security',pick('#security')],
    ['more','Install & more',pick('#install','#referrals','#answers','.final-cta','#product-newsletter')]
  ];
  const stage=document.createElement('div');stage.id='stage';stage.className='stage';
  const panes={};
  defs.forEach(([id,label,nodes])=>{
    const pane=document.createElement('section');pane.className='stage-pane';pane.id='pane-'+id;pane.dataset.pane=id;pane.hidden=true;pane.setAttribute('aria-label',label);
    nodes.forEach(n=>pane.appendChild(n));stage.appendChild(pane);panes[id]=pane;
  });
  // legal footer lives at the end of the last pane so nothing is lost
  const foot=$('footer');if(foot){const f=foot.cloneNode(true);f.className='stage-legal';panes.more.appendChild(f)}
  main.appendChild(stage);
  // join bar: always visible, two clear choices
  const bar=document.createElement('div');bar.className='join-bar';
  bar.innerHTML='<span>Already a member?</span><a class="jb-sign" href="sign-in.html">Sign in</a><span class="jb-sep">New here?</span><a class="jb-join" href="create-account.html">Become a member</a><span class="jb-legal"><a href="privacy.html">Privacy</a><a href="terms.html">Terms</a><a href="trust-center.html">Trust</a></span>';
  document.body.appendChild(bar);
  document.documentElement.classList.add('has-stage');
  const links=Array.from(document.querySelectorAll('.site-header nav [data-pane]'));
  const alias={top:'overview',experience:'overview',install:'more',referrals:'more',answers:'more',journey:'industries'};
  function show(id,{push=true}={}){
    id=alias[id]||id;if(!panes[id])id='overview';
    Object.entries(panes).forEach(([k,p])=>{p.hidden=k!==id});
    links.forEach(a=>{const on=a.dataset.pane===id;a.classList.toggle('on',on);if(on)a.setAttribute('aria-current','page');else a.removeAttribute('aria-current')});
    if(push&&location.hash!=='#'+id)history.replaceState(null,'','#'+id);
    stage.scrollTop=0;window.scrollTo(0,0);
    document.dispatchEvent(new CustomEvent('superpro:pane',{detail:{id}}));
  }
  links.forEach(a=>a.addEventListener('click',e=>{e.preventDefault();show(a.dataset.pane);document.querySelector('.site-header nav')?.classList.remove('open')}));
  // in-page links such as "Explore the platform" switch tabs instead of scrolling
  document.addEventListener('click',e=>{
    const a=e.target.closest('a[href^="#"]');if(!a||a.dataset.pane)return;
    const id=a.getAttribute('href').slice(1);if(!id)return;
    const target=alias[id]||id;if(panes[target]){e.preventDefault();show(target)}
    else{const el=document.getElementById(id);const pane=el&&el.closest('.stage-pane');if(pane){e.preventDefault();show(pane.dataset.pane);el.scrollIntoView({block:'start'})}}
  });
  // arrow keys move between tabs when the tab bar has focus
  document.querySelector('.site-header nav')?.addEventListener('keydown',e=>{
    if(!['ArrowRight','ArrowLeft'].includes(e.key))return;
    const i=links.indexOf(document.activeElement);if(i<0)return;
    const n=links[(i+(e.key==='ArrowRight'?1:links.length-1))%links.length];n.focus();e.preventDefault();
  });
  window.addEventListener('hashchange',()=>show(location.hash.slice(1),{push:false}));
  show(location.hash.slice(1)||'overview',{push:false});
})();
