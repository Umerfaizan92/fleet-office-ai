// Command Centre live board: animated gadgets fed by /api/saas/command-centre. Built with DOM calls and textContent only.
(()=>{
  const {el,api,onView,money,role}=window.SuperProUI;
  const NS='http://www.w3.org/2000/svg';
  const reduce=()=>window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const CHANNEL={voice:'calls',email:'email',sms:'SMS',whatsapp:'WhatsApp',facebook:'Facebook',instagram:'Instagram',tiktok:'TikTok',x:'X',snapchat:'Snapchat',website:'website forms'};
  let timer=null,board=null,seen=new Map();

  const svg=(tag,attrs)=>{const n=document.createElementNS(NS,tag);for(const [k,v] of Object.entries(attrs||{}))n.setAttribute(k,v);return n};
  const ICON_PATHS={
    inbox:'M4 5h16v14H4zM4 6l8 7 8-7',approvals:'M9 3h6v4H9zM7 5H4v16h16V5h-3M8 14l3 3 5-6',
    jobs:'M4 6h16v15H4zM8 3v6m8-6v6M4 11h16m-11 4h2',workforce:'M15 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8m9-5a4 4 0 0 1 0 8m-1 2a4 4 0 0 1 4 4v2',
    finance:'M4 20V10m5 10V4m6 16v-7m5 7V7',team:'M12 3l8 3v6c0 5-8 9-8 9s-8-4-8-9V6zM8 12l3 3 5-6',
    integrations:'M10 14l4-4m-7 5-2 2a3 3 0 0 0 4 4l4-4m-2-6 4-4a3 3 0 0 1 4 4l-2 2',growth:'M4 19l5-6 4 3 7-11M14 5h6v6',onboarding:'M12 3v3m0 12v3M3 12h3m12 0h3M5.6 5.6l2.1 2.1m8.6 8.6 2.1 2.1m0-12.8-2.1 2.1m-8.6 8.6-2.1 2.1M16 12a4 4 0 1 0-8 0 4 4 0 0 0 8 0'
  };
  function featureIcon(key){const root=svg('svg',{viewBox:'0 0 24 24','aria-hidden':'true'});root.append(svg('path',{d:ICON_PATHS[key]||ICON_PATHS.jobs}));return el('span',{class:'gx-icon'},root)}
  function shortcuts(){
    const allowed=new Set(window.SuperProNav?.sequence(role())||[]);
    const items=[['comms','inbox','Inbox','Conversations & replies'],['jobs','jobs','Job pool','Schedules & allocations'],['workforce','workforce','People','Workers & compliance'],['team','team','Staff access','Individual permissions'],['integrations','integrations','Connections','Channels & readiness'],['growth','growth','Growth Engine','Content & campaigns'],['finance','finance','Finance','Costs & payments'],['onboarding','onboarding','Smart setup','Business preferences']].filter(([view])=>allowed.has(view));
    if(!items.length)return null;
    return el('section',{class:'gx-workspace-links','aria-label':'Workspace shortcuts'},el('div',{class:'gx-links-head'},el('h3',{text:'Your workspace'}),el('span',{text:'Choose your next step'})),el('div',{class:'gx-shortcuts'},items.map(([view,key,title,sub])=>el('button',{type:'button',class:'gx-shortcut','data-jump':view},featureIcon(key),el('span',{},el('b',{text:title}),el('small',{text:sub})),el('span',{class:'gx-shortcut-arrow','aria-hidden':'true',text:'↗'})))));
  }
  function spark(values){
    const w=120,h=36,max=Math.max(1,...values),step=w/Math.max(1,values.length-1);
    const pts=values.map((v,i)=>[i*step,h-3-(v/max)*(h-8)]);
    const line=pts.map((p,i)=>(i?'L':'M')+p[0].toFixed(1)+' '+p[1].toFixed(1)).join(' ');
    const root=svg('svg',{viewBox:`0 0 ${w} ${h}`,class:'gx-spark','aria-hidden':'true',preserveAspectRatio:'none'});
    root.append(svg('path',{d:`${line} L${w} ${h} L0 ${h} Z`,class:'gx-spark-fill'}),svg('path',{d:line,class:'gx-spark-line',pathLength:'1'}),svg('circle',{cx:pts.at(-1)[0],cy:pts.at(-1)[1],r:'2.6',class:'gx-spark-dot'}));
    return root;
  }
  function ring(pct){
    const r=26,c=2*Math.PI*r,root=svg('svg',{viewBox:'0 0 64 64',class:'gx-ring','aria-hidden':'true'});
    root.append(svg('circle',{cx:32,cy:32,r,class:'gx-ring-bg'}),svg('circle',{cx:32,cy:32,r,class:'gx-ring-fg','stroke-dasharray':c.toFixed(1),'stroke-dashoffset':(c*(1-Math.max(0,Math.min(1,pct)))).toFixed(1),transform:'rotate(-90 32 32)'}));
    return root;
  }
  function countUp(node,to,fmt){
    const key=node.dataset.key,from=seen.get(key)??0;seen.set(key,to);
    if(reduce()||from===to){node.textContent=fmt(to);return}
    const t0=performance.now(),dur=900;
    const tick=now=>{const p=Math.min(1,(now-t0)/dur),e=1-Math.pow(1-p,3);node.textContent=fmt(from+(to-from)*e);if(p<1)requestAnimationFrame(tick)};
    requestAnimationFrame(tick);
  }
  function tilt(card){
    if(reduce())return;
    card.addEventListener('pointermove',e=>{
      if(e.pointerType==='touch')return;
      const r=card.getBoundingClientRect(),x=(e.clientX-r.left)/r.width-.5,y=(e.clientY-r.top)/r.height-.5;
      card.style.setProperty('--rx',(-y*9).toFixed(2)+'deg');card.style.setProperty('--ry',(x*11).toFixed(2)+'deg');
      card.style.setProperty('--mx',((x+.5)*100).toFixed(0)+'%');card.style.setProperty('--my',((y+.5)*100).toFixed(0)+'%');
    });
    card.addEventListener('pointerleave',()=>{card.style.setProperty('--rx','0deg');card.style.setProperty('--ry','0deg')});
  }
  function tile({key,label,value,fmt=v=>String(Math.round(v)),unit,sub,graphic,tone='gold',jump}){
    const num=el('strong',{class:'gx-num','data-key':key});
    const card=el(jump?'button':'div',{class:`gx-tile gx-${tone}`,type:jump?'button':null,'data-jump':jump||null,'aria-label':`${label}: ${fmt(value)}${unit?' '+unit:''}. ${sub||''}`},
      el('div',{class:'gx-tile-head'},featureIcon(({inbox:'inbox',approvals:'approvals','jobs-today':'jobs',team:'workforce',profit:'finance'})[key]),el('span',{class:'gx-label',text:label})),
      el('div',{class:'gx-main'},el('div',{class:'gx-figure'},num,unit?el('em',{text:unit}):null),graphic||null),
      el('span',{class:'gx-sub',text:sub||''}));
    countUp(num,value,fmt);tilt(card);return card;
  }
  const plural=(n,one,many)=>`${n} ${n===1?one:many||one+'s'}`;

  function render(d){
    const T=d.terms,cards=[];
    const topCh=d.inbox.channels[0];
    cards.push(tile({key:'inbox',label:'Waiting for a reply',value:d.inbox.needs_reply,unit:d.inbox.needs_reply===1?'conversation':'conversations',sub:d.inbox.week?`${plural(d.inbox.week,'message')} this week${topCh?`, most from ${CHANNEL[topCh.channel]||topCh.channel}`:''}`:'No new messages this week',graphic:spark(d.inbox.daily),jump:'comms',tone:d.inbox.needs_reply?'alert':'gold'}));
    cards.push(tile({key:'approvals',label:'Needs your approval',value:d.approvals.pending,sub:d.inbox.drafts_waiting?`${plural(d.inbox.drafts_waiting,'AI reply draft')} ready to review`:'Nothing is waiting on you',jump:'approvals',tone:d.approvals.pending?'alert':'good',graphic:ring(d.approvals.pending?0.25:1)}));
    cards.push(tile({key:'jobs-today',label:`${T.jobs} today`,value:d.jobs.today,sub:`${d.jobs.awaiting} awaiting a ${T.team.toLowerCase().replace(/s$/,'')}, ${d.jobs.allocated} lined up`,graphic:spark(d.jobs.next7),jump:'jobs'}));
    const pct=d.team.total?d.team.ready/d.team.total:0;
    cards.push(tile({key:'team',label:`${T.team} ready to work`,value:d.team.ready,unit:`of ${d.team.total}`,sub:d.team.attention||d.team.expiring?`${d.team.attention} need checks, ${d.team.expiring} documents expiring in 30 days`:'All checks are up to date',graphic:ring(pct),jump:'workforce',tone:d.team.attention?'warn':'good'}));
    if(d.finance){
      const f=d.finance;
      cards.push(tile({key:'profit',label:'Profit this month',value:f.profit_cents/100,fmt:v=>money(Math.round(v*100)),sub:`${T.revenue} ${money(f.revenue_cents)}, ${T.costs.toLowerCase()} ${money(f.expense_cents)}`,graphic:spark(f.daily_revenue_cents),jump:'finance',tone:f.profit_cents<0?'alert':'good'}));
    }
    const head=el('div',{class:'gx-head'},el('div',{},el('h2',{text:d.business.name?`${d.business.name} right now`:'Your business right now'}),el('p',{text:d.business.industry&&d.business.code!=='custom'?`Tuned for ${d.business.industry.toLowerCase()}. Figures refresh by themselves.`:'Figures refresh by themselves.'})),el('span',{class:'gx-live'},el('i'),'Live'));
    const features={comms:'inbox',approvals:'approvals',jobs:'jobs',workforce:'workforce',finance:'finance'};const shown=cards.filter(c=>window.GDS_SESSION?.access?.mode!=='custom'||window.SuperProCan(features[c.dataset.jump]));const focus=board.contains(document.activeElement)?document.activeElement.closest('[data-jump]')?.dataset.jump:null;board.dataset.cards=String(shown.length);const links=shortcuts();board.replaceChildren(head,el('div',{class:'gx-grid'},shown),...(links?[links]:[]));if(focus)board.querySelector('[data-jump="'+focus+'"]')?.focus({preventScroll:true});
  }
  async function load(){
    if(!board)return;
    try{render(await api('/api/saas/command-centre'));document.querySelector('.operational-strip')?.classList.add('gx-replaced')}catch{/* workers and unconnected data keep the simple strip */}
  }
  function mount(){
    if(board)return;
    const heading=document.querySelector('#dashboard-view .dashboard-heading');if(!heading)return;
    board=el('section',{class:'gx-board','aria-label':'Live business gadgets'});heading.after(board);const observer=new IntersectionObserver(([entry])=>board.classList.toggle('gx-in-view',entry.isIntersecting),{threshold:.05});observer.observe(board);
  }
  onView('dashboard',{enter(){mount();load();clearInterval(timer);timer=setInterval(()=>{if(!document.hidden)load()},30000)},leave(){clearInterval(timer)}});
  document.addEventListener('visibilitychange',()=>{if(!document.hidden&&board&&!board.closest('[hidden]'))load()});
})();
