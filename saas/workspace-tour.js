// Guided tour for a new member: a spotlight moves to each real control, one short prompt at a time, with Back / Next.
// It only highlights things on the page; it reads and sends no data.
(()=>{
  const doc=document;
  const STEPS=[
    {title:'Welcome to your office',text:'This quick tour shows you where everything is. It takes about a minute, and you can replay it any time from the ? button.'},
    {sel:'.workspace-nav',title:'Everything is grouped here',text:'Today, Customers & Work, People, Marketing, Money and Setup & Trust. Open a group to see its pages.',side:'right'},
    {sel:'.search-button',title:'Ask or search',text:'Type or speak what you need, such as “new job for Sam” or “unpaid invoices”, and jump straight to it.',side:'bottom'},
    {sel:'#pad-open',title:'Get paid',text:'Taking a payment on site? Pick the job, show the QR code or send the link, and the receipt goes to your customer automatically.',side:'bottom'},
    {sel:'#open-digital-manual',title:'User Manual',text:'Plain-English help for every page, based on your role.',side:'bottom'},
    {sel:'.security-mini',title:'Keep your account safe',text:'Turn on two-step sign-in here. You will scan a code with your phone once, then enter a 6-digit code at each sign-in.',side:'right'},
    {sel:'.page-context',title:'Always know where you are',text:'The page name sits here. Use the menu to move around, or the browser Back button.',side:'bottom'},
    {title:'You are ready',text:'Next we will set up your business so every page fits your industry.',final:true}
  ];
  let state=null;
  const el=(t,c,h)=>{const e=doc.createElement(t);if(c)e.className=c;if(h!==undefined)e.innerHTML=h;return e};
  const visible=e=>{if(!e)return false;const r=e.getBoundingClientRect();return r.width>8&&r.height>8&&r.bottom>0&&r.right>0&&r.top<innerHeight&&r.left<innerWidth&&getComputedStyle(e).visibility!=='hidden'};
  function start(opts={},tries=0){
    if(state)return;
    if(!doc.querySelector('#pad-open')&&tries<8&&!opts.noWait){setTimeout(()=>start(opts,tries+1),400);return}
    const steps=STEPS.filter(s=>!s.sel||visible(doc.querySelector(s.sel)));
    if(steps.length<3){opts.onDone?.();return}
    const root=el('div','sp-tour');root.setAttribute('role','dialog');root.setAttribute('aria-modal','true');root.setAttribute('aria-label','Guided tour');
    const ring=el('div','sp-tour-ring'),card=el('div','sp-tour-card');root.append(ring,card);
    doc.body.append(root);doc.body.classList.add('gds-tour-active');
    state={i:0,root};
    const done=(finished)=>{doc.removeEventListener('keydown',key,true);removeEventListener('resize',place);removeEventListener('scroll',place,true);root.remove();doc.body.classList.remove('gds-tour-active');state=null;opts.onDone?.(finished)};
    function draw(){
      const s=steps[state.i],last=state.i===steps.length-1;
      card.innerHTML=`<div class="sp-tour-top"><span class="sp-tour-count">Step ${state.i+1} of ${steps.length}</span><button type="button" class="sp-tour-skip" data-tour-skip>Skip tour</button></div>
<h2>${s.title}</h2><p>${s.text}</p>
<div class="sp-tour-dots" aria-hidden="true">${steps.map((_,n)=>`<i class="${n===state.i?'on':n<state.i?'past':''}"></i>`).join('')}</div>
<div class="sp-tour-actions"><button type="button" class="sp-tour-back" ${state.i?'':'disabled'}>Back</button><button type="button" class="sp-tour-next">${last?'Finish and set up my business':'Next'}</button></div>`;
      card.querySelector('[data-tour-skip]').onclick=()=>done(false);
      card.querySelector('.sp-tour-back').onclick=()=>{if(state.i>0){state.i--;draw()}};
      card.querySelector('.sp-tour-next').onclick=()=>{if(last)done(true);else{state.i++;draw()}};
      const t=s.sel&&doc.querySelector(s.sel);if(t)t.scrollIntoView({block:'nearest',inline:'nearest'});
      place();card.querySelector('.sp-tour-next').focus({preventScroll:true});
    }
    function place(){
      if(!state)return;
      const s=steps[state.i],t=s.sel&&doc.querySelector(s.sel);
      const vw=innerWidth,vh=innerHeight,cw=Math.min(360,vw-24);card.style.width=cw+'px';
      if(!t||!visible(t)){ring.style.cssText='opacity:0;left:50%;top:50%;width:0;height:0';card.style.left=Math.max(12,(vw-cw)/2)+'px';card.style.top=Math.max(12,(vh-card.offsetHeight)/2)+'px';root.classList.add('centered');return}
      root.classList.remove('centered');
      const r=t.getBoundingClientRect(),pad=6;
      ring.style.cssText=`opacity:1;left:${r.left-pad}px;top:${r.top-pad}px;width:${r.width+pad*2}px;height:${r.height+pad*2}px`;
      const ch=card.offsetHeight;let x,y;
      if(vw<700){x=(vw-cw)/2;y=r.bottom+14+ch<vh?r.bottom+14:Math.max(12,r.top-ch-14)}
      else if(s.side==='right'&&r.right+cw+24<vw){x=r.right+18;y=Math.min(Math.max(12,r.top),vh-ch-12)}
      else{x=Math.min(Math.max(12,r.left+r.width/2-cw/2),vw-cw-12);y=r.bottom+14+ch<vh?r.bottom+14:Math.max(12,r.top-ch-14)}
      card.style.left=x+'px';card.style.top=y+'px';
    }
    function key(e){if(e.key==='Escape'){e.preventDefault();done(false)}else if(e.key==='ArrowRight'||e.key==='Enter'&&e.target.tagName!=='BUTTON'){e.preventDefault();card.querySelector('.sp-tour-next').click()}else if(e.key==='ArrowLeft'){e.preventDefault();card.querySelector('.sp-tour-back').click()}}
    doc.addEventListener('keydown',key,true);addEventListener('resize',place);addEventListener('scroll',place,true);
    draw();
  }
  window.SuperProTour={start,active:()=>!!state};
})();
