// Marketing > Growth Engine: business profile, content plans, 30-day calendar with approval, and post reuse. DOM built with textContent only.
(()=>{
  const {el,api,onView,note}=window.SuperProUI;
  const $=s=>document.querySelector(s);
  const APPROVERS=['owner','admin','super_admin'];
  const STATUS={draft:['Draft','warn'],approved:['Approved','ok'],publishing:['Sending','neutral'],published:['Posted','ok'],due:['Ready to post','warn'],failed:['Failed','bad'],skipped:['Skipped','neutral']};
  const PLATFORMS=[['facebook','Facebook'],['instagram','Instagram'],['x','X'],['youtube','YouTube'],['tiktok','TikTok'],['snapchat','Snapchat'],['whatsapp','WhatsApp']];
  const TYPE={text:'Text',image:'Image',carousel:'Carousel',reel:'Reel',color_bg:'Colour background'};
  let O=null,items=[];
  const badge=(t,tone)=>el('span',{class:`pay-badge pay-${tone}`,text:t});
  const canApprove=()=>APPROVERS.includes(window.SuperProUI.role());
  const tab=name=>{document.querySelectorAll('[data-gr-tab]').forEach(b=>{const on=b.dataset.grTab===name;b.classList.toggle('active',on);b.setAttribute('aria-selected',on)});document.querySelectorAll('[data-gr-pane]').forEach(p=>p.hidden=p.dataset.grPane!==name);if(name==='calendar')loadCalendar();if(name==='activity')loadActivity()};
  document.addEventListener('click',e=>{const b=e.target.closest('[data-gr-tab]');if(b)tab(b.dataset.grTab)});
  const copy=async text=>{try{await navigator.clipboard.writeText(text);note('Copied.')}catch{note('Copy is blocked here. Select the text and copy it.',true)}};
  const field=(label,name,attrs={})=>el('label',{},el('span',{text:label}),el('input',{name,autocomplete:'off',...attrs}));
  const area=(label,name,value,cls='')=>{const t=el('textarea',{name,maxlength:'1500'});t.value=value||'';return el('label',{class:cls},el('span',{text:label}),t)};

  function renderContent(c){
    const kids=[el('p',{class:'muted',text:c.summary||''})];
    for(const s of c.sections||[])kids.push(el('h4',{text:s.title}),el('ul',{},...(s.items||[]).map(t=>el('li',{text:t}))));
    return el('div',{},...kids);
  }
  function planCard(k){
    const p=O.plans[k.kind],extra=k.kind==='competitor_study'?el('textarea',{placeholder:'Paste the text of 3 to 5 top posts from similar pages here (optional). Super Pro cannot browse other pages for you.',maxlength:'12000'}):null;
    const run=el('button',{class:'primary-button compact',type:'button',text:p?'Create again':'Create'});
    run.onclick=async()=>{run.disabled=true;run.textContent='Working…';try{await api('/api/saas/growth/generate',{method:'POST',body:JSON.stringify({kind:k.kind,samples:extra?.value||''})});await load()}catch(e){note(e.message,true);run.disabled=false;run.textContent=p?'Create again':'Create'}};
    const all=p?p.content.sections.map(s=>s.title+'\n'+s.items.join('\n')).join('\n\n'):'';
    return el('article',{class:'panel gr-plan'},el('h3',{text:k.title}),...(p?[badge(p.source==='ai'?'Written by AI':'Starter template',p.source==='ai'?'ok':'neutral'),renderContent(p.content)]:[el('p',{class:'muted',text:'Not created yet.'})]),...(extra?[extra]:[]),el('div',{class:'gr-actions'},run,...(p?[el('button',{class:'secondary-button compact',type:'button',text:'Copy',onclick:()=>copy(p.content.summary+'\n\n'+all)})]:[])));
  }
  function renderChannels(){
    $('#gr-channels').replaceChildren(...O.channels.map(c=>badge(`${c.label}: ${c.connected?'connected':'not connected'}${c.connected&&!c.auto_publish?' (copy and post)':''}`,c.connected?'ok':'neutral')),el('a',{class:'secondary-button compact',href:'#marketing/connections',text:'Manage connections'}));
  }
  function renderPlan(){
    const noProfile=!O.profile.niche&&!O.profile.product;
    $('#gr-plan').replaceChildren(
      ...(noProfile?[el('p',{class:'panel gr-note',text:'Start with the About you tab: what you sell and who it is for. Then create each plan here.'})]:[]),
      el('div',{class:'gr-grid'},...O.kinds.map(planCard)));
  }
  function renderAbout(){
    const p=O.profile,f=el('form',{class:'panel gr-form'});
    const plats=el('div',{class:'gr-checks gr-wide'},...PLATFORMS.map(([id,l])=>el('label',{},el('input',{type:'checkbox',name:'plat',value:id,checked:p.platforms.includes(id)?true:null}),el('span',{text:l}))));
    const hours=n=>{const s=el('select',{name:n});for(let h=0;h<24;h++)s.append(el('option',{value:String(h),text:`${h%12||12}${h<12?'am':'pm'}`,selected:(n==='from_hour'?p.from_hour:p.to_hour)===h?true:null}));return s};
    f.append(field('What kind of business is it?','niche',{value:p.niche,required:true,maxlength:'200'}),field('Who is it for?','audience',{value:p.audience,maxlength:'300'}),field('What do you sell?','product',{value:p.product,maxlength:'300'}),field('Your voice','voice',{value:p.voice,maxlength:'300',placeholder:'Friendly, simple words, short sentences'}),
      area('Your story, in a few lines','story',p.story,'gr-wide'),field('Similar pages to learn from (up to 5, separated by commas)','competitors',{value:p.competitors.join(', '),maxlength:'900'}),
      el('div',{class:'gr-wide'},el('b',{text:'Where do you post?'}),plats),
      el('label',{},el('span',{text:'Posts per day (1 to 16)'}),el('input',{name:'per_day',type:'number',min:'1',max:'16',value:String(p.posts_per_day)})),el('label',{},el('span',{text:'First post'}),hours('from_hour')),el('label',{},el('span',{text:'Last post'}),hours('to_hour')),
      el('p',{class:'gr-note gr-wide',text:'Posting every hour from 6am to 9pm is possible, but most pages get better reach with 2 to 4 good posts a day. Start lower and raise it once your insights support it.'}),
      el('div',{class:'gr-actions gr-wide'},el('button',{class:'primary-button compact',type:'submit',text:'Save'})));
    f.onsubmit=async e=>{e.preventDefault();const x=f.elements,b=f.querySelector('button[type=submit]');b.disabled=true;
      try{await api('/api/saas/growth/profile',{method:'PUT',body:JSON.stringify({niche:x.niche.value,audience:x.audience.value,product:x.product.value,voice:x.voice.value,story:x.story.value,competitors:x.competitors.value.split(',').map(s=>s.trim()).filter(Boolean).slice(0,5),platforms:[...f.querySelectorAll('input[name=plat]:checked')].map(i=>i.value),posts_per_day:Number(x.per_day.value),from_hour:Number(x.from_hour.value),to_hour:Number(x.to_hour.value)})});note('Saved.');await load()}catch(err){note(err.message,true)}finally{b.disabled=false}};
    $('#gr-about').replaceChildren(f);
  }
  async function loadCalendar(){
    let d;try{d=await api('/api/saas/growth/calendar?limit=600')}catch(e){note(e.message,true);return}
    items=d.items;renderCalendar();
  }
  function renderCalendar(){
    const start=el('input',{type:'date',name:'start',value:new Date(Date.now()+864e5).toISOString().slice(0,10)}),days=el('input',{type:'number',min:'1',max:'30',value:'30',name:'days'});
    const gen=el('button',{class:'primary-button compact',type:'button',text:items.length?'Rebuild drafts':'Create calendar'});
    gen.onclick=async()=>{gen.disabled=true;gen.textContent='Working…';try{const r=await api('/api/saas/growth/calendar/generate',{method:'POST',body:JSON.stringify({days:Number(days.value)||30,start_date:start.value,tz_offset_min:new Date().getTimezoneOffset()})});note(`${r.created} posts planned.`);await loadCalendar()}catch(e){note(e.message,true);gen.disabled=false;gen.textContent=items.length?'Rebuild drafts':'Create calendar'}};
    const drafts=items.filter(i=>i.status==='draft').length;
    const approve=el('button',{class:'secondary-button compact',type:'button',text:`Approve all ${drafts} drafts`,disabled:!drafts||!canApprove()?true:null,title:canApprove()?'':'Only an owner or admin can approve posts.'});
    approve.onclick=async()=>{if(!confirm(`Approve ${drafts} posts? Approved posts go out at their scheduled time.`))return;approve.disabled=true;try{const r=await api('/api/saas/growth/calendar/approve',{method:'POST',body:JSON.stringify({all_drafts:true})});note(`${r.approved} posts approved.`);await loadCalendar()}catch(e){note(e.message,true)}};
    const byDay=new Map();for(const i of items){const k=new Date(i.scheduled_at).toLocaleDateString('en-AU',{weekday:'long',day:'numeric',month:'short'});(byDay.get(k)||byDay.set(k,[]).get(k)).push(i)}
    const list=[];
    for(const [day,rows] of byDay){list.push(el('div',{class:'gr-day',text:day}));for(const i of rows)list.push(itemCard(i))}
    $('#gr-calendar').replaceChildren(
      el('div',{class:'panel gr-form'},el('label',{},el('span',{text:'Start date'}),start),el('label',{},el('span',{text:'Days'}),days),el('div',{class:'gr-actions'},gen,approve)),
      el('p',{class:'gr-note',text:'Facebook Page and X text posts are sent for you after approval. Image, carousel and reel posts, and other channels, show as "Ready to post" with the full text to copy.'}),
      ...(list.length?list:[el('p',{class:'muted',text:'No posts yet. Create your calendar above.'})]));
  }
  function itemCard(i){
    const [st,tone]=STATUS[i.status]||[i.status,'neutral'],time=new Date(i.scheduled_at).toLocaleTimeString('en-AU',{hour:'numeric',minute:'2-digit'});
    const acts=[];
    if(!['published','publishing'].includes(i.status)){
      acts.push(el('button',{class:'secondary-button compact',type:'button',text:'Edit',onclick:()=>edit(i)}));
      if(i.status!=='skipped')acts.push(el('button',{class:'secondary-button compact',type:'button',text:'Skip',onclick:()=>patch(i,{action:'skip'})}));else acts.push(el('button',{class:'secondary-button compact',type:'button',text:'Restore',onclick:()=>patch(i,{action:'restore'})}));
    }
    acts.push(el('button',{class:'secondary-button compact',type:'button',text:'Copy',onclick:()=>copy(i.hook+(i.body?'\n\n'+i.body:''))}));
    if(canApprove()&&['approved','failed','due'].includes(i.status)&&i.auto_publish)acts.push(el('button',{class:'primary-button compact',type:'button',text:'Post now',onclick:async()=>{try{const r=await api(`/api/saas/growth/calendar/${i.id}/publish`,{method:'POST',body:'{}'});note(r.status==='published'?'Posted.':'Marked ready to post.');await loadCalendar()}catch(e){note(e.message,true);await loadCalendar()}}}));
    if(canApprove()&&i.status==='draft')acts.push(el('button',{class:'primary-button compact',type:'button',text:'Approve',onclick:async()=>{try{await api('/api/saas/growth/calendar/approve',{method:'POST',body:JSON.stringify({ids:[i.id]})});await loadCalendar()}catch(e){note(e.message,true)}}}));
    return el('article',{class:'row-card gr-item'},el('header',{},el('b',{text:i.hook}),el('div',{class:'gr-meta'},badge(st,tone),badge(i.pillar,'neutral'))),
      ...(i.body?[el('p',{text:i.body})]:[]),el('div',{class:'muted',text:`${time} · ${PLATFORMS.find(p=>p[0]===i.platform)?.[1]||i.platform} · ${TYPE[i.post_type]||i.post_type}${i.error?' · '+i.error:''}`}),el('div',{class:'gr-actions'},...acts));
  }
  async function patch(i,body){try{await api(`/api/saas/growth/calendar/${i.id}`,{method:'PATCH',body:JSON.stringify(body)});await loadCalendar()}catch(e){note(e.message,true)}}
  function edit(i){
    const f=el('form',{method:'dialog',class:'cust-form'},el('h2',{text:'Edit post'}),field('First line','hook',{value:i.hook,required:true,maxlength:'300'}),area('Post text','body',i.body),
      el('p',{class:'muted',text:'Editing an approved post sends it back to draft so you can approve it again.'}),
      el('div',{class:'gr-actions'},el('button',{class:'primary-button compact',value:'save',text:'Save'}),el('button',{class:'secondary-button compact',type:'button',text:'Cancel',onclick:ev=>ev.target.closest('dialog').close()})));
    const d=el('dialog',{class:'modal'},f);document.body.append(d);d.addEventListener('close',()=>d.remove());
    f.addEventListener('submit',async e=>{if(e.submitter?.value!=='save')return;e.preventDefault();await patch(i,{hook:f.elements.hook.value,body:f.elements.body.value});d.close()});
    d.showModal();
  }
  function renderReuse(){
    const t=el('textarea',{maxlength:'3000',placeholder:'Paste a post that did well. You will get a carousel, a reel script and a story sequence.'}),out=el('div',{});
    const b=el('button',{class:'primary-button compact',type:'button',text:'Make 3 new pieces'});
    b.onclick=async()=>{b.disabled=true;try{const r=await api('/api/saas/growth/repurpose',{method:'POST',body:JSON.stringify({text:t.value})});out.replaceChildren(renderContent(r.content),el('div',{class:'gr-actions'},el('button',{class:'secondary-button compact',type:'button',text:'Copy',onclick:()=>copy(r.content.sections.map(s=>s.title+'\n'+s.items.join('\n')).join('\n\n'))})))}catch(e){note(e.message,true)}finally{b.disabled=false}};
    $('#gr-reuse').replaceChildren(el('article',{class:'panel gr-plan'},el('h3',{text:'Create once, post everywhere'}),t,el('div',{class:'gr-actions'},b),out));
  }

  async function loadActivity(){
    const host=$('#gr-activity');let d;
    try{d=await api('/api/saas/activity?limit=150')}catch(e){host.replaceChildren(el('p',{class:'panel gr-note',text:e.message}));return}
    const when=iso=>new Date(iso).toLocaleString('en-AU',{day:'numeric',month:'short',hour:'numeric',minute:'2-digit'});
    const cards=d.summary.map(s=>el('article',{class:'panel gr-plan'},el('h3',{text:s.label}),badge(s.connected?'Connected':'Not connected',s.connected?'ok':'neutral'),el('p',{class:'muted',text:s.account||''}),el('p',{text:`${s.events_30d} actions, ${s.published_30d} posted, ${s.failed_30d} failed in 30 days`}),el('p',{class:'muted',text:s.last_activity?'Last: '+when(s.last_activity):'No activity yet'})));
    const rows=d.events.map(e=>el('tr',{},el('td',{text:when(e.at)}),el('td',{text:e.who}),el('td',{text:e.platform_label||'Workspace'}),el('td',{text:e.action+(e.detail.error?': '+e.detail.error:e.detail.count?` (${e.detail.count})`:'')})));
    const kids=[el('p',{class:'gr-note',text:'Every connection, post, message and change on your connected platforms is recorded here against your business. Only you and the people you allow below can see this.'}),el('div',{class:'gr-grid'},...(cards.length?cards:[el('p',{class:'muted',text:'No platforms connected yet.'})])),
      el('div',{class:'panel gr-scroll'},rows.length?el('table',{class:'gr-table'},el('thead',{},el('tr',{},...['When','Who','Platform','What happened'].map(t=>el('th',{text:t})))),el('tbody',{},...rows)):el('p',{class:'muted',text:'Nothing recorded yet.'}))];
    if(d.can_manage){
      let a;try{a=await api('/api/saas/activity/access')}catch{a={people:[]}}
      kids.push(el('article',{class:'panel gr-plan'},el('h3',{text:'Who else can see this'}),...(a.people.length?a.people.map(p=>el('label',{class:'fin-check'},el('input',{type:'checkbox',checked:p.allowed?true:null,onchange:async ev=>{try{await api('/api/saas/activity/access',{method:'PUT',body:JSON.stringify({user_id:p.id,allowed:ev.target.checked})});note(ev.target.checked?'Access allowed.':'Access removed.')}catch(err){ev.target.checked=!ev.target.checked;note(err.message,true)}}}),el('span',{text:`${p.full_name||p.email} (${p.role})`}))):[el('p',{class:'muted',text:'No other team members yet.'})])));
    }
    host.replaceChildren(...kids);
  }
  async function load(){
    try{O=await api('/api/saas/growth/overview')}catch(e){note(e.message,true);return}
    renderChannels();renderPlan();renderAbout();renderReuse();
    if(!$('#gr-calendar').hidden)loadCalendar();
  }
  onView('growth',{enter:load});
})();
