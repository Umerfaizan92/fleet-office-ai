(()=>{
  const GUIDE_VERSION='16.1';
  const MAX_MEMORY_ITEMS=500;
  const MAX_MEMORY_CHARS=500000;
  const $=s=>document.querySelector(s);

  const extraKnowledge=[
    {id:'account-verification',keys:'account create register verification abn acn abr guid email otp mobile sms code australian business',text:'Account creation is designed to verify the Australian business identity first, then verify the owner email and Australian mobile before the workspace is created. Production ABN verification requires a genuine ABN Lookup Web Services GUID; a registration reference or placeholder is not a GUID.'},
    {id:'workspace-navigation',keys:'workspace navigation menu command centre dashboard where page section',text:'The workspace navigation is organised into Command centre, Business setup, People & workforce, Jobs & allocation, Expenses & profit for authorised roles, AI Operations, Content Studio, Connections, Trust & governance, Help & complaints, Digital user manual, and Plans & billing.'},
    {id:'ai-operations',keys:'ai operations assistant help guide chat memory question answer operations intelligence',text:'AI Operations is the in-workspace assistant area. It should answer product and workspace questions, explain setup and connections, help plan operational work, and keep consequential actions under human approval. Saved operational tasks remain organisation-scoped.'},
    {id:'workforce',keys:'worker employee staff workforce people add employee compliance skill level work rights roster',text:'People & Workforce supports worker profiles, employment details, work-right readiness, onboarding progress, verified skills, scheduling readiness and role-aware access. The owner can also be represented as a worker where appropriate.'},
    {id:'jobs',keys:'job work order allocation booking schedule worker match dispatch eligible',text:'Jobs & Allocation supports work orders with time, location, required worker count, level and skills. The eligibility flow can match active, available and scheduling-approved workers, but consequential allocation remains reviewable.'},
    {id:'finance',keys:'expense profit finance overhead material gst net profit job profitability',text:'Expenses & Profit can record operational expenses and link costs to jobs so authorised users can compare recorded revenue and expenses. It is operational reporting, not tax or accounting advice.'},
    {id:'content-studio',keys:'content studio video reel render transition tiktok instagram youtube caption trend',text:'Content Studio prepares platform-aware render specifications, including aspect ratio, pacing, hooks, captions, transitions, reframing, highlights and CTA guidance. Live trends, publishing and account analytics require official platform connections.'},
    {id:'connections',keys:'connections integration connect api oauth credentials social channel',text:'Connections are designed around server-side application credentials plus provider-authorised account consent. Customers should not be asked to paste developer secrets. A provider should only be shown as live after credentials, permissions and a connection test succeed.'},
    {id:'whatsapp',keys:'whatsapp meta facebook phone number id access token business messaging',text:'WhatsApp Business integration uses the Meta business/app setup, a WhatsApp Business Account, a Phone Number ID and an authorised access token with the required WhatsApp management and messaging permissions. Tokens must stay in protected server environment variables.'},
    {id:'google-youtube',keys:'google youtube oauth client id client secret api key youtube data api',text:'Google and YouTube connection uses a Google Cloud project, YouTube Data API v3, and OAuth web-application credentials for user-authorised channel access. Redirect URIs must exactly match the deployed HTTPS callback configured by the application.'},
    {id:'tiktok',keys:'tiktok oauth login kit client key secret redirect',text:'TikTok connection uses the official OAuth/Login Kit flow with an app client key, protected client secret and exact HTTPS redirect URI. Account tokens belong server-side and the application should report connection status only after authorisation succeeds.'},
    {id:'telnyx',keys:'telnyx phone call sms ai receptionist number 1300 transfer voice',text:'The telephony architecture targets Telnyx for business calls, SMS and AI receptionist workflows. Protected owner transfer must never disclose a private destination number, and call/SMS status should only be reported after the provider confirms it.'},
    {id:'email',keys:'email resend smtp verification email notification',text:'Email features can use an approved transactional email provider. Verification and operational notifications must use verified sending identities and protected API credentials; delivery should not be claimed until the provider confirms success.'},
    {id:'payments',keys:'stripe paypal payment billing subscription charge card',text:'Paid billing must remain disabled until the selected payment provider is configured, final commercial terms are set and the customer explicitly authorises payment. No charge should occur silently.'},
    {id:'social-future',keys:'snapchat x twitter social media connection',text:'Snapchat and X are optional platform connections. They remain unavailable until the relevant developer account, application credentials, permissions and provider review are completed.'},
    {id:'security',keys:'security privacy password mfa session tenant isolation rate limit audit secret api key',text:'The security design includes protected server-side secrets, authenticated sessions, tenant isolation, rate limiting, optional authenticator MFA, role controls and audit-ready events. Raw API keys and private transfer details must never be exposed to customer workspaces.'},
    {id:'governance',keys:'governance audit complaint help desk policy privacy security report case',text:'Trust & Governance includes role-aware policy guidance, audit evidence and protected support/escalation workflows. The Help & Complaint Desk can route general help, complaints, privacy/security concerns and higher-risk matters for authorised human review.'},
    {id:'manual',keys:'manual tutorial guide walkthrough how to use where am i next step',text:'The Digital User Manual is intended to explain the current workspace area, show what it is for and guide the user to the next permitted action. First-time users should be able to follow a guided workspace journey and revisit help later.'},
    {id:'install',keys:'install pwa mobile desktop tablet add home screen browser app',text:'Super Pro includes Progressive Web App support for compatible browsers on desktop and mobile. Private workspace and API requests are intentionally excluded from the public offline cache.'},
    {id:'plans',keys:'plan pricing starter operations scale trial cost subscription',text:'The current test presentation shows a 14-day trial with no card required and indicative AUD plans: Starter A$99/month + GST, Operations A$199/month + GST and Scale A$349/month + GST. Commercial billing requires final terms and a configured payment provider.'},
    {id:'limitations',keys:'not working missing not connected pending limitation live production',text:'This is a live-test/pre-launch build. A feature that depends on an external provider is only fully live when its real credentials, required permissions and end-to-end connection test are complete. The assistant must distinguish implemented application capability from an external connection that is still pending.'}
  ];

  function clean(v){return String(v??'').toLowerCase().normalize('NFKC').replace(/[^\p{L}\p{N}+&\s-]/gu,' ').replace(/\s+/g,' ').trim()}
  function tokens(v){return clean(v).split(/\s+/).filter(x=>x.length>2)}
  function overlapScore(query,text){
    const q=tokens(query), t=clean(text);if(!q.length)return 0;
    let score=0;for(const w of new Set(q)){if(t.includes(w))score+=w.length>6?3:1}
    return score;
  }
  function romanUrduScore(text){
    const set=new Set(clean(text).split(/\s+/));
    const markers=['mujhe','mera','meri','mere','kaise','kya','kyun','nahi','nahin','hai','hain','mein','main','aap','apko','mujh','karna','karo','krna','yeh','yahan','wala','wali','chahiye','batao','bataye','samjhao','sath','aur'];
    return markers.reduce((n,w)=>n+(set.has(w)?1:0),0);
  }
  function detectLanguageV16(text){
    const base=window.GDSProductGuide?.detectLanguage?.(text)||'en';
    if(base!=='en')return base;
    if(romanUrduScore(text)>=2)return 'ur';
    return 'en';
  }
  const languageNames={en:'English',ur:'Urdu',hi:'Hindi',pa:'Punjabi',ar:'Arabic',zh:'Chinese',ja:'Japanese',ko:'Korean',bn:'Bengali',ta:'Tamil',es:'Spanish',fr:'French'};

  function scopeKey(context='public'){
    if(context==='workspace'){
      const org=window.GDS_SESSION?.organisation?.id||window.GDS_SESSION?.organisation?.name||'workspace';
      const user=window.GDS_SESSION?.user?.id||window.GDS_SESSION?.user?.email||'user';
      return `superpro_ai_memory_v16:${org}:${user}`;
    }
    return 'superpro_ai_memory_v16:public';
  }
  function loadMemory(context='public'){
    try{const value=JSON.parse(localStorage.getItem(scopeKey(context))||'[]');return Array.isArray(value)?value:[]}catch{return []}
  }
  function saveMemory(context,items){
    let out=items.slice(-MAX_MEMORY_ITEMS);
    let chars=out.reduce((n,x)=>n+String(x.q||'').length+String(x.a||'').length,0);
    while(out.length>8&&chars>MAX_MEMORY_CHARS){const first=out.shift();chars-=String(first.q||'').length+String(first.a||'').length}
    try{localStorage.setItem(scopeKey(context),JSON.stringify(out))}catch{}
  }
  function remember(context,q,a,meta={}){
    const items=loadMemory(context);items.push({q:String(q).slice(0,4000),a:String(a).slice(0,8000),topic:meta.topic||'',language:meta.language||'',at:Date.now()});saveMemory(context,items)
  }
  function relevantMemory(context,query,maxChars=420){
    const items=loadMemory(context);if(!items.length)return '';
    const recent=items.slice(-4);
    const older=items.slice(0,-4).map(x=>({x,score:overlapScore(query,`${x.q} ${x.a}`)})).filter(x=>x.score>0).sort((a,b)=>b.score-a.score).slice(0,2).map(x=>x.x);
    const chosen=[...older,...recent].filter((x,i,a)=>a.indexOf(x)===i);
    let text=chosen.map(x=>`Q: ${x.q}\nA: ${x.a}`).join('\n');
    if(text.length>maxChars)text=text.slice(text.length-maxChars);
    return text;
  }
  function clearMemory(context='public'){try{localStorage.removeItem(scopeKey(context))}catch{}}

  function topicKnowledge(query){
    const rows=[];
    const guide=window.GDSProductGuide;
    for(const k of extraKnowledge){const score=overlapScore(query,`${k.keys} ${k.text}`);if(score)rows.push({score,text:k.text})}
    for(const t of guide?.topics||[]){const score=overlapScore(query,`${t.title} ${(t.keys||[]).join(' ')} ${t.answer||''}`);if(score)rows.push({score,text:t.answer})}
    rows.sort((a,b)=>b.score-a.score);
    const unique=[];for(const row of rows){if(!unique.some(x=>x.text===row.text))unique.push(row);if(unique.length>=4)break}
    return unique;
  }
  function pageKnowledge(query){
    if(!document.body)return [];
    const selectors=['.workspace-nav button','.page-heading','.feature-card','.security-list','.industry-rail button','.integration-card','.panel-head','.manual-card'];
    const rows=[];
    for(const el of document.querySelectorAll(selectors.join(','))){
      const text=String(el.innerText||'').replace(/\s+/g,' ').trim();if(text.length<15||text.length>900)continue;
      const score=overlapScore(query,text);if(score>1)rows.push({score,text});
    }
    return rows.sort((a,b)=>b.score-a.score).slice(0,3);
  }
  function buildSourceContext(query,maxChars=760){
    const rows=[...topicKnowledge(query),...pageKnowledge(query)].sort((a,b)=>b.score-a.score);
    const parts=[];let used=0;
    for(const row of rows){const text=row.text.replace(/\s+/g,' ').trim();if(parts.includes(text))continue;const piece=(parts.length?' | ':'')+text;if(used+piece.length>maxChars)break;parts.push(text);used+=piece.length}
    return parts.join(' | ');
  }
  function currentWorkspaceHint(){
    if(!location.pathname.includes('workspace'))return '';
    const active=$('.workspace-nav button.active')?.innerText?.trim()||'';
    const org=window.GDS_SESSION?.organisation?.name||'';
    const role=window.GDS_SESSION?.user?.role||'';
    return [org&&`Organisation: ${org}`,role&&`Role: ${role}`,active&&`Current area: ${active}`].filter(Boolean).join(' · ');
  }
  function buildProviderQuestion(question,context,language){
    const q=String(question||'').trim().slice(0,1100);
    const memory=relevantMemory(context,q,360);
    const baseFixed=`User question: ${q}\nReply language: ${languageNames[language]||language}. Answer the user directly in that language. Be accurate, practical and calm. Use about 60–150 words unless numbered steps are clearly better. Do not repeat a generic product description. Do not invent a connection, action, price, credential or live status. If an external integration is not confirmed, say what must be configured or tested. `;
    let remaining=Math.max(0,1900-baseFixed.length);
    const source=buildSourceContext(q,Math.min(760,Math.max(240,remaining-260)));
    remaining=Math.max(0,1900-baseFixed.length-source.length-40);
    const mem=memory.slice(-Math.min(memory.length,remaining));
    const workspace=currentWorkspaceHint();
    return `${baseFixed}\nVerified product context: ${source||'Use the Super Pro product and workspace knowledge already provided to you.'}${workspace?`\nWorkspace context: ${workspace}`:''}${mem?`\nRelevant conversation memory: ${mem}`:''}`.slice(0,1950);
  }

  function install(){
    const guide=window.GDSProductGuide;if(!guide||guide.__v16Installed)return false;
    guide.__v16Installed=true;guide.version=GUIDE_VERSION;
    const originalAnswer=guide.answer?.bind(guide);
    const originalAsync=guide.answerAsync?.bind(guide);
    if(!originalAnswer||!originalAsync)return false;

    guide.detectLanguage=detectLanguageV16;
    guide.memory={load:loadMemory,clear:clearMemory,remember,relevant:relevantMemory};
    guide.knowledge={extra:extraKnowledge,context:buildSourceContext};
    guide.answerAsync=async function(question,context='public',previousTopic='',requestedLanguage='auto'){
      const q=String(question||'').trim();
      const local=originalAnswer(q,context,previousTopic);
      const language=requestedLanguage&&requestedLanguage!=='auto'?requestedLanguage:detectLanguageV16(q);
      const enriched=buildProviderQuestion(q,context,language);
      let result=null;
      try{result=await originalAsync(enriched,context,previousTopic,language)}catch{}
      let chosen;
      if(result?.source==='configured-ai-provider'&&String(result.text||'').trim())chosen={...local,...result,topic:local.topic||result.topic,language};
      else chosen={...local,language,source:'expanded-product-memory'};
      if(!chosen.text||chosen.text.length<12)chosen.text=local.text||'Tell me what you want to do in Super Pro AI Office Manager and I will guide you to the relevant area.';
      remember(context,q,chosen.text,chosen);
      return chosen;
    };

    document.querySelector('#chat-input')?.setAttribute('dir','auto');
    const observer=new MutationObserver(()=>document.querySelectorAll('.message p,.message b').forEach(x=>x.setAttribute('dir','auto')));
    const chat=$('#chat-log');if(chat)observer.observe(chat,{childList:true,subtree:true});
    $('#clear-chat')?.addEventListener('click',()=>clearMemory('public'),{capture:true});
    window.dispatchEvent(new CustomEvent('superpro:guide-v16-ready',{detail:{version:GUIDE_VERSION}}));
    return true;
  }

  if(!install()){
    let tries=0;const timer=setInterval(()=>{tries++;if(install()||tries>50)clearInterval(timer)},100);
  }
})();