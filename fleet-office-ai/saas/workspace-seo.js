// Marketing > Search & AI visibility: the Modern SEO Cluster (SEO, AEO, GEO, AIO, SXO), checked automatically every week.
// Everything shown belongs to the signed-in business only. DOM built with textContent only.
(()=>{
  const {el,api,onView,note,when}=window.SuperProUI;
  const $=s=>document.querySelector(s);
  const ORDER=['seo','aeo','geo','aio','sxo'];
  const ICON={
    seo:'<svg viewBox="0 0 24 24"><circle cx="10.5" cy="10.5" r="6"/><path d="m15 15 5.5 5.5"/></svg>',
    aeo:'<svg viewBox="0 0 24 24"><rect x="5" y="3" width="14" height="18" rx="2.5"/><path d="M9 8h6M9 12h6M9 16h4"/></svg>',
    geo:'<svg viewBox="0 0 24 24"><circle cx="12" cy="5" r="2.4"/><circle cx="5" cy="18" r="2.4"/><circle cx="19" cy="18" r="2.4"/><path d="m11 7-5 9M13 7l5 9M7.5 18h9"/></svg>',
    aio:'<svg viewBox="0 0 24 24"><rect x="6" y="6" width="12" height="12" rx="2"/><path d="M9 2v3M15 2v3M9 19v3M15 19v3M2 9h3M2 15h3M19 9h3M19 15h3"/><path d="M10 15v-5l2 3 2-3v5"/></svg>',
    sxo:'<svg viewBox="0 0 24 24"><path d="M5 20V12M12 20V5M19 20v-9"/></svg>'
  };
  const MARK={good:'✓',improve:'!',fix:'×',setup:'+'};
  const WORD={good:'Good',improve:'Improve',fix:'Fix first',setup:'Needs your input'};
  let O=null,TAB='score';
  const svg=(html,cls)=>{const s=el('span',{class:cls||'sv-icon','aria-hidden':'true'});s.innerHTML=html;return s};
  const copy=async text=>{try{await navigator.clipboard.writeText(text);note('Copied.')}catch{note('Copy is blocked here. Select the text and copy it.',true)}};
  const field=(label,name,attrs={})=>el('label',{},el('span',{text:label}),el('input',{name,autocomplete:'off',...attrs}));
  const area=(label,name,value,rows=3,attrs={})=>{const t=el('textarea',{name,rows:String(rows),...attrs});t.value=value||'';return el('label',{class:'full'},el('span',{text:label}),t)};
  const select=(label,name,opts)=>el('label',{},el('span',{text:label}),el('select',{name},...opts.map(([v,t])=>el('option',{value:v,text:t}))));
  const lines=v=>String(v||'').split(/[\n,;]+/).map(s=>s.trim()).filter(Boolean);
  const date=iso=>iso?new Date(iso).toLocaleDateString('en-AU',{day:'numeric',month:'short'}):'';

  function ring(score,label){
    const wrap=el('div',{class:'sv-hub-ring',role:'img','aria-label':`Overall score ${score==null?'not checked yet':score+' out of 100'}`});
    wrap.style.setProperty('--sv-pct',String(score==null?0:score));
    wrap.append(el('div',{class:'sv-hub-core'},el('small',{text:'Modern'}),el('b',{text:'SEO'}),el('small',{text:'Cluster'}),el('strong',{text:score==null?'—':String(score)}),el('em',{text:label})));
    return wrap;
  }
  function checkRow(c){
    return el('details',{class:`sv-check sv-${c.level}`},
      el('summary',{},el('span',{class:'sv-mark',text:MARK[c.level]||'·','aria-hidden':'true'}),el('span',{class:'sv-check-name',text:c.name}),el('span',{class:'sv-check-state',text:WORD[c.level]||c.level})),
      el('div',{class:'sv-check-body'},el('p',{text:c.text}),c.how&&c.level!=='good'?el('p',{class:'sv-how'},el('b',{text:'What to do: '}),c.how):null));
  }
  function pillarCard(key){
    const meta=O.pillars_meta[key],p=O.latest?.pillars?.[key];
    const checks=p?p.checks:meta.checks.map(c=>({id:c.id,name:c.name,level:'setup',text:'Run your first check to see this.',how:''}));
    return el('article',{class:`sv-pillar sv-p-${key}`},
      el('header',{},el('span',{class:'sv-badge'},svg(ICON[key]),el('b',{text:meta.name})),el('span',{class:'sv-pillar-long',text:meta.long}),el('strong',{class:'sv-pillar-score',text:p?String(p.score):'—'})),
      el('div',{class:'sv-checks'},...checks.map(checkRow)));
  }
  function actionList(){
    const a=O.latest?.actions||[];
    if(!O.latest)return el('article',{class:'panel sv-empty'},el('b',{text:'Run your first check'}),el('span',{text:'Add your website in Business facts, then press Check now. After that it re-checks every week by itself.'}));
    return el('article',{class:'panel sv-actions'},el('div',{class:'panel-head'},el('div',{},el('h2',{text:'Do these next'}),el('p',{class:'muted',text:a.length?'Fix-first items are listed before improvements.':'Nothing needs doing right now.'}))),
      el('ol',{},...a.map(x=>el('li',{class:`sv-act sv-${x.level}`},el('span',{class:`sv-tag sv-t-${x.pillar}`,text:x.pillar_name}),el('div',{},el('b',{text:x.check}),el('span',{text:x.text}),x.how?el('small',{text:x.how}):null)))));
  }
  function score(){
    const L=O.latest,next=O.next_run,btn=el('button',{class:'primary-button',type:'button',text:L?'Check now':'Run first check'});
    btn.onclick=async()=>{btn.disabled=true;btn.textContent='Checking your website…';try{await api('/api/saas/seo/run',{method:'POST',body:'{}'});note('Check finished.');await load()}catch(e){note(e.message,true);btn.disabled=false;btn.textContent=L?'Check now':'Run first check'}};
    const hub=el('aside',{class:'sv-hub'},ring(L?.score??null,L?'out of 100':'not checked yet'),
      el('p',{class:'sv-summary',text:L?L.summary:'Five checks each for SEO, AEO, GEO, AIO and SXO, re-checked every week for your business only.'}),
      O.can_edit?btn:null,
      el('p',{class:'muted sv-when',text:L?`Last checked ${when?when(L.created_at):date(L.created_at)}${L.trigger==='weekly'?' (automatic)':''}. ${O.weekly&&next?`Next automatic check from ${date(next)}.`:O.profile.weekly?'':'Weekly checks are turned off.'}`:'Automatic weekly checks are '+(O.profile.weekly?'on':'off')+'.'}),
      L&&L.site&&L.site.note?el('p',{class:'sv-sitenote',text:L.site.note}):null);
    return el('div',{},el('div',{class:'sv-layout'},hub,el('div',{class:'sv-pillars'},...ORDER.map(pillarCard))),actionList(),history(),el('p',{class:'muted sv-limits',text:O.honest_limits}));
  }
  function history(){
    const h=O.history||[];if(h.length<2)return el('span');
    const w=520,ht=110,max=100,pts=h.map((r,i)=>[10+(w-20)*i/(h.length-1),ht-10-(ht-20)*r.score/max]);
    const box=el('article',{class:'panel sv-history'},el('div',{class:'panel-head'},el('div',{},el('h2',{text:'Your score over time'}),el('p',{class:'muted',text:`${h.length} weekly checks`}))));
    const s=el('span');s.innerHTML=`<svg viewBox="0 0 ${w} ${ht}" role="img" aria-label="Score history"><polyline fill="none" stroke="currentColor" stroke-width="3" stroke-linejoin="round" stroke-linecap="round" points="${pts.map(p=>p.map(n=>n.toFixed(1)).join(',')).join(' ')}"/>${pts.map(p=>`<circle cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="3.5" fill="currentColor"/>`).join('')}</svg>`;
    box.append(s);return box;
  }

  async function saveProfile(f,extra={}){
    const x=f.elements;
    const body={website_url:x.website_url.value.trim(),business_name:x.business_name.value.trim(),phone:x.phone.value.trim(),address:x.address.value.trim(),abn:x.abn.value.trim(),services:lines(x.services.value),areas:lines(x.areas.value),same_as:lines(x.same_as.value),weekly:x.weekly.checked,...extra};
    await api('/api/saas/seo/profile',{method:'PUT',body:JSON.stringify(body)});
  }
  function facts(){
    const p=O.profile,f=el('form',{class:'panel sv-form form-grid'});
    f.append(el('div',{class:'full'},el('h2',{text:'Business facts'}),el('p',{class:'muted',text:'These are checked against your website. Use the same name, phone and address everywhere you appear online.'})),
      field('Website address','website_url',{type:'url',placeholder:'https://yourbusiness.com.au',value:p.website_url||''}),field('Business name','business_name',{value:p.business_name||'',maxlength:'120'}),
      field('Phone','phone',{value:p.phone||'',maxlength:'40'}),field('ABN','abn',{value:p.abn||'',maxlength:'20'}),field('Street address','address',{value:p.address||'',maxlength:'200'}),
      area('Services you offer (one per line)','services',(p.services||[]).join('\n'),4),area('Suburbs or areas you serve (one per line)','areas',(p.areas||[]).join('\n'),4),
      area('Your profile links (Facebook, Instagram, Google Business Profile, LinkedIn, YouTube — one https link per line)','same_as',(p.same_as||[]).join('\n'),4),
      el('label',{class:'fin-check full'},el('input',{type:'checkbox',name:'weekly',checked:p.weekly?true:null}),el('span',{text:'Check my visibility automatically every week'})));
    const ch=el('div',{class:'sv-channels full'},el('b',{text:'Connected channels: '}),...(O.channels.length?O.channels.map(c=>el('span',{class:`pay-badge pay-${c.status==='connected'?'ok':'neutral'}`,text:`${c.display_name||c.provider}: ${c.status==='connected'?'connected':'not connected'}`})):[el('span',{class:'muted',text:'none yet'})]),el('button',{type:'button',class:'text-button','data-view':'integrations',text:'Manage connections'}));
    f.append(ch);
    if(O.can_edit){const b=el('button',{class:'primary-button',type:'submit',text:'Save business facts'});f.append(el('div',{class:'full'},b));
      f.onsubmit=async e=>{e.preventDefault();b.disabled=true;try{await saveProfile(f);note('Business facts saved.');await load()}catch(err){note(err.message,true)}finally{b.disabled=false}}}
    else f.querySelectorAll('input,textarea').forEach(i=>i.disabled=true);
    return f;
  }
  const KIND={page:'Page',post:'Social post',faq:'FAQ',video:'Video',review:'Customer review',press:'Press or mention'};
  function library(){
    const wrap=el('div',{class:'sv-stack'});
    if(O.can_edit){
      const f=el('form',{class:'panel sv-form form-grid'},el('div',{class:'full'},el('h2',{text:'Add content'}),el('p',{class:'muted',text:'Add pages, posts, FAQs, videos, reviews and press about your business. They count toward your checks. Paste the text of a social post here to include it.'})),
        select('Type','kind',Object.entries(KIND)),field('Title or question','title',{required:true,maxlength:'200'}),field('Link (optional)','url',{type:'url',placeholder:'https://'}),field('Channel (optional)','channel',{placeholder:'Facebook, Instagram, website…',maxlength:'40'}),area('Text or answer (optional)','body','',4,{maxlength:'4000'}),
        el('div',{class:'full'},el('button',{class:'primary-button',type:'submit',text:'Add to my library'})));
      f.onsubmit=async e=>{e.preventDefault();const x=f.elements,b={kind:x.kind.value,title:x.title.value.trim()};if(x.url.value.trim())b.url=x.url.value.trim();if(x.channel.value.trim())b.channel=x.channel.value.trim();if(x.body.value.trim())b.body=x.body.value.trim();try{await api('/api/saas/seo/content',{method:'POST',body:JSON.stringify(b)});note('Added.');await load()}catch(err){note(err.message,true)}};
      const topic=el('input',{placeholder:'e.g. blocked drain repair in Fremantle',maxlength:'160'});
      const mk=(kind,label)=>el('button',{type:'button',class:'secondary-button compact',text:label,onclick:async e=>{const b=e.currentTarget;if(topic.value.trim().length<3)return note('Say what the draft is about first.',true);b.disabled=true;try{const r=await api('/api/saas/seo/draft',{method:'POST',body:JSON.stringify({kind,topic:topic.value.trim()})});note(r.note);await load()}catch(err){note(err.message,true)}finally{b.disabled=false}}});
      wrap.append(f,el('article',{class:'panel sv-draft'},el('h2',{text:'Draft with AI'}),el('p',{class:'muted',text:'Drafts are saved in your library marked as drafts. Read and edit them before you use them anywhere. Nothing is published for you.'}),el('label',{},el('span',{text:'Topic'}),topic),el('div',{class:'pay-actions'},mk('faq','Draft an FAQ answer'),mk('answer_post','Draft an answer-first post'),mk('meta','Draft a title and description'))));
    }
    wrap.append(el('article',{class:'panel list-panel'},el('div',{class:'panel-head'},el('div',{},el('h2',{text:'Your library'}),el('p',{class:'muted',text:`${O.content.length} item${O.content.length===1?'':'s'}`}))),
      el('div',{class:'record-list'},...(O.content.length?O.content.map(c=>el('article',{class:'row-card'},el('header',{},el('div',{},el('b',{text:c.title}),el('div',{class:'muted',text:[KIND[c.kind]||c.kind,c.channel,/draft/.test(c.source)?'AI draft':null,date(c.created_at)].filter(Boolean).join(' · ')})),O.can_edit?el('button',{type:'button',class:'text-button',text:'Remove',onclick:async()=>{if(!confirm('Remove this item from your library?'))return;try{await api('/api/saas/seo/content/'+c.id,{method:'DELETE'});await load()}catch(e){note(e.message,true)}}}):null),c.body?el('p',{class:'muted sv-body',text:c.body.slice(0,260)}):null,c.url?el('a',{href:c.url,target:'_blank',rel:'noopener',text:c.url}):null)):[el('div',{class:'empty-state'},el('b',{text:'Nothing here yet'}),el('span',{text:'Add your best pages, FAQs, reviews and posts above.'}))]))));
    return wrap;
  }
  const PLAT={chatgpt:'ChatGPT',gemini:'Gemini',perplexity:'Perplexity',copilot:'Microsoft Copilot',google_ai:'Google AI Overview / AI Mode',claude:'Claude',other:'Other'};
  function answers(){
    const p=O.profile,svcs=(p.services||[]).slice(0,2),areas=(p.areas||[]).slice(0,2);
    const ideas=[];for(const s of svcs.length?svcs:['your main service'])for(const a of areas.length?areas:['your suburb'])ideas.push(`Who is the best ${s.toLowerCase()} in ${a}?`);
    const wrap=el('div',{class:'sv-stack'});
    wrap.append(el('article',{class:'panel'},el('h2',{text:'Check what AI says about you'}),el('p',{class:'muted',text:'We cannot see inside AI tools, so you ask them and log the answer. This is how AI Citations and AI Recommendations are scored, honestly. Try these questions:'}),el('ul',{class:'sv-ideas'},...ideas.map(t=>el('li',{},el('span',{text:t}),el('button',{type:'button',class:'text-button',text:'Copy',onclick:()=>copy(t)}))))));
    if(O.can_edit){
      const f=el('form',{class:'panel sv-form form-grid'},select('AI tool','platform',Object.entries(PLAT)),select('Kind of question','kind',[['recommendation','Recommendation (best provider near me)'],['citation','Citation (a question about my service)']]),field('Question you asked','prompt_text',{required:true,maxlength:'300'}),
        el('label',{class:'fin-check'},el('input',{type:'checkbox',name:'mentioned'}),el('span',{text:'My business was named in the answer'})),field('Notes (optional)','note',{maxlength:'400'}),el('div',{class:'full'},el('button',{class:'primary-button',type:'submit',text:'Log this check'})));
      f.onsubmit=async e=>{e.preventDefault();const x=f.elements,b={platform:x.platform.value,kind:x.kind.value,prompt_text:x.prompt_text.value.trim(),mentioned:x.mentioned.checked};if(x.note.value.trim())b.note=x.note.value.trim();try{await api('/api/saas/seo/ai-check',{method:'POST',body:JSON.stringify(b)});note('Logged.');await load()}catch(err){note(err.message,true)}};
      const m=el('form',{class:'panel sv-form form-grid'},el('div',{class:'full'},el('h2',{text:'Weekly search numbers'}),el('p',{class:'muted',text:'Copy a number from Google Search Console, Bing Webmaster Tools or your analytics. This feeds AI Search Analytics.'})),select('Where from','source',[['google_search_console','Google Search Console'],['bing_webmaster','Bing Webmaster Tools'],['ai_referrals','AI referrals (visits from AI tools)'],['analytics','Website analytics'],['other','Other']]),select('Number','metric_key',[['clicks','Clicks'],['impressions','Impressions'],['ai_referrals','AI referrals'],['calls','Phone calls'],['enquiries','Enquiries']]),field('Value this week','metric_value',{type:'number',min:'0',step:'1',required:true}),el('div',{class:'full'},el('button',{class:'secondary-button',type:'submit',text:'Save number'})));
      m.onsubmit=async e=>{e.preventDefault();const x=m.elements;try{await api('/api/saas/seo/metrics',{method:'POST',body:JSON.stringify({source:x.source.value,metric_key:x.metric_key.value,metric_value:Number(x.metric_value.value)})});note('Saved.');await load()}catch(err){note(err.message,true)}};
      wrap.append(f,m);
    }
    wrap.append(el('article',{class:'panel list-panel'},el('div',{class:'panel-head'},el('h2',{text:'Your AI answer log'})),el('div',{class:'record-list'},...(O.ai_log.length?O.ai_log.map(r=>el('article',{class:'row-card'},el('header',{},el('div',{},el('b',{text:r.prompt_text}),el('div',{class:'muted',text:`${PLAT[r.platform]||r.platform} · ${date(r.checked_at)}${r.note?' · '+r.note:''}`})),el('span',{class:`pay-badge pay-${r.mentioned?'ok':'neutral'}`,text:r.mentioned?'Named you':'Did not name you'})))):[el('div',{class:'empty-state'},el('b',{text:'No checks logged yet'}),el('span',{text:'Ask an AI tool one of the questions above and log the result.'}))]))));
    return wrap;
  }
  async function schemaPane(){
    const box=el('div',{class:'sv-stack'},el('p',{class:'muted',text:'Loading…'}));
    try{const s=await api('/api/saas/seo/schema');
      const block=(title,desc,text)=>text?el('article',{class:'panel'},el('div',{class:'panel-head'},el('div',{},el('h3',{text:title}),el('p',{class:'muted',text:desc})),el('button',{type:'button',class:'secondary-button compact',text:'Copy',onclick:()=>copy(text)})),el('pre',{class:'pay-pre sv-pre',text})):null;
      box.replaceChildren(el('p',{class:'muted',text:'Ready-made files built from your Business facts and FAQs. Give them to whoever looks after your website. They only describe what is already true about your business.'}),
        block('Business structured data (JSON-LD)','Paste inside a <script type="application/ld+json"> tag in your website header.',s.business_json_ld),
        block('FAQ structured data (JSON-LD)','Use on your questions page. Built from the FAQs in your library.',s.faq_json_ld)||el('p',{class:'muted',text:'Add FAQ items to your library to generate FAQ structured data.'}),
        block('llms.txt','Publish at /llms.txt on your website so AI tools can find a short description of you.',s.llms_txt));
    }catch(e){box.replaceChildren(el('p',{class:'muted',text:e.message}))}
    return box;
  }
  const TABS=[['score','Score'],['facts','Business facts'],['content','Content library'],['answers','AI answers'],['files','Schema & files']];
  async function draw(){
    const host=$('#sv-root');if(!host||!O)return;
    const bar=el('div',{class:'fin-tabs sv-tabs',role:'tablist','aria-label':'Search and AI visibility sections'},...TABS.map(([k,t])=>el('button',{type:'button',role:'tab',class:k===TAB?'active':'','aria-selected':String(k===TAB),'data-sv-tab':k,text:t,onclick:()=>{TAB=k;draw()}})));
    const pane=TAB==='score'?score():TAB==='facts'?facts():TAB==='content'?library():TAB==='answers'?answers():await schemaPane();
    host.replaceChildren(bar,pane);
  }
  async function load(){
    const host=$('#sv-root');if(!host)return;
    try{O=await api('/api/saas/seo/overview');await draw()}catch(e){host.replaceChildren(el('p',{class:'muted',text:e.message}))}
  }
  onView('visibility',{enter:load});
  window.SuperProSeo={load};
})();
