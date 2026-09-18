(() => {
  const topics = [
    {id:'overview',title:'What is Super Pro AI Office Manager?',keys:['what is','what does','overview','about','product','software','office manager','ai office','platform'],answer:'Super Pro AI Office Manager is an AI-assisted operating system for service businesses. It brings enquiries, customers, CRM, quotes, bookings, jobs, workforce, communications, content workflows, integrations and owner-approved AI actions into one connected workspace.',next:['What are the main modules?','Who is Super Pro AI Office Manager built for?','How do I get started?']},
    {id:'voice-conversation',title:'Talk to the AI product guide',keys:['can i talk to you','talk to you','talk with you','speak to you','speak with you','voice chat','voice conversation','can you hear me','use microphone','microphone','talk by voice'],answer:'Yes. You can talk to the Super Pro Product Guide by pressing the microphone button, allowing microphone access, and speaking naturally. Choose Auto language or select the language you plan to speak for better recognition. If spoken replies are enabled, the guide will also read its answer aloud using the best matching voice your device exposes, or the device speech service when a named browser voice is not listed.',next:['Which languages can I use?','How do I turn spoken replies on?','What can I ask the product guide?']},
    {id:'modules',title:'What is included?',keys:['module','modules','feature','features','included','products','tools','capabilities','everything included'],answer:'The product is organised around a Command Centre, Business Setup, People & Workforce, Jobs & Allocation, AI Operations, Content Studio, Connections, Plans & Billing, customer and lead workflows, plus Trust & Governance. Global AI Search and the Super Pro Co-pilot help users find the right area quickly.',next:['Tell me about AI Operations','How does workforce management work?','What can Content Studio do?']},
    {id:'ai',title:'AI and automation',keys:['ai','artificial intelligence','automation','assistant','copilot','agent','automatic','workflow','smart'],answer:'The AI layer can explain the product, draft and organise work, prepare next actions, surface attention items, build content specifications and guide users around the workspace. Consequential external actions remain approval-controlled instead of being silently executed.',next:['What can AI do automatically?','What requires owner approval?','How does the AI co-pilot work?']},
    {id:'receptionist',title:'AI receptionist and communications',keys:['phone','call','receptionist','voice','sms','whatsapp','message','email','telnyx','1300','number','answer calls','call handling'],answer:'The communications architecture supports AI receptionist workflows, calls, SMS, email and connected messaging channels. Telnyx is the current telephony target, while WhatsApp/Meta, email and other authorised channels are designed to feed customer context into the Inbox and CRM. A channel is only treated as live after its credentials, permissions and connection test succeed.',next:['Can it use a 1300 number?','How are calls saved to CRM?','Which messaging channels can connect?']},
    {id:'crm',title:'Customers, leads and follow-up',keys:['crm','lead','customer','enquiry','inquiry','follow up','follow-up','sales','quote recovery','review','referral','pipeline'],answer:'The customer workflow is designed around one timeline: capture enquiries and lead source, prepare responses, retain customer context, follow up, recover unaccepted quotes, trigger review and referral workflows, and connect outcomes back to bookings, jobs and revenue.',next:['How does lead follow-up work?','Can it help recover quotes?','Does it keep customer history?']},
    {id:'jobs',title:'Jobs, booking and workforce',keys:['job','booking','schedule','dispatch','allocate','employee','worker','staff','team','workforce','roster','crew','skills'],answer:'You can create worker profiles, track skills and work-right readiness, create work orders, and match eligible workers to jobs. The owner can also be a worker, so the same workflow supports a solo operator or a larger team.',next:['Can I add multiple employees?','How does job allocation work?','What workforce compliance is tracked?']},
    {id:'content',title:'Content Studio',keys:['content','video','reel','tiktok','instagram','facebook','youtube','render','social','caption','trend','transition','editing'],answer:'Content Studio organises media and recordings, creates platform-aware render specifications, suggests hooks, transitions, captions, safe-zone framing and creative improvements, and stores render jobs. Live trends, publishing and account analytics activate only after the relevant official platform connection is authorised.',next:['Can it suggest transitions automatically?','Does it support TikTok and Reels?','How are live trends handled?']},
    {id:'search',title:'Search and voice navigation',keys:['search','find','where','navigate','voice search','how do i find','command palette','spoken request'],answer:'Inside the workspace, Global AI Search accepts typed or spoken requests such as “add a worker”, “show jobs”, “open Content Studio” or “where do I connect WhatsApp?”. It returns matching workspace areas plus guidance, so users do not need to remember menu names.',next:['Can I use voice inside the workspace?','Show me how the co-pilot navigates','What can I search for?']},
    {id:'industries',title:'Who it is for',keys:['industry','industries','tradie','trades','accountant','accounting','hairdresser','salon','real estate','property','service business','business type','plumber','electrician','cleaner'],answer:'Super Pro AI Office Manager is designed for service businesses rather than one narrow trade. Templates cover trades and field services, accounting and professional services, salons and hairdressers, real estate and property services, mobile or appointment services, and custom service businesses. The owner can then tailor the setup.',next:['How would it work for a tradie?','How would it work for a salon?','Can I create my own business type?']},
    {id:'security',title:'Security and verification',keys:['security','secure','verification','abn','email verification','mobile verification','mfa','privacy','hack','scam','tenant','otp','password'],answer:'New Australian workspaces are designed to verify an ABN or ACN plus email and Australian-mobile one-time codes before account creation. Sign-in uses HTTP-only sessions, rate limiting, tenant isolation, optional authenticator MFA and temporary lockout after repeated failed passwords. Production ABN or ACN verification requires an authorised ABN Lookup Web Services GUID.',next:['Why verify both email and mobile?','Does it store my password in the browser?','How does MFA work?']},
    {id:'plans',title:'Plans and trial',keys:['price','pricing','plan','plans','cost','trial','starter','operations','scale','subscription','billing','monthly','annual'],answer:'The current test build offers a 14-day trial with no card required. Indicative plans shown are Starter A$99/month + GST, Operations A$199/month + GST and Scale A$349/month + GST. Paid billing remains disabled until a payment provider and final commercial terms are configured.',next:['What is in Starter?','What is in Operations?','When does billing start?']},
    {id:'integrations',title:'Integrations',keys:['integration','connect','meta','facebook','instagram','whatsapp','tiktok','youtube','google','snapchat','twitter','x','xero','quickbooks','api','connection'],answer:'The platform is designed to connect communications, social, telephony, email, Meta/Facebook/Instagram, WhatsApp, TikTok, YouTube, Snapchat, X, Google Business, websites and later accounting and payment tools through approved APIs. App-level developer secrets stay protected server-side while each customer authorises only their own business account through the provider consent flow.',next:['How do I connect WhatsApp?','Does it connect to YouTube?','Are integrations already live?']},
    {id:'approvals',title:'Human control',keys:['approval','control','human','permission','automatic send','autonomous','risk','send automatically','approve'],answer:'AI assistance is approval-aware. A workspace can require approval for everything, for external actions, or use custom rules. Messaging, allocations, payments and other consequential actions should not silently execute outside the permissions the owner sets.',next:['What does external-action approval mean?','Can I change approval rules later?','What actions should stay manual?']},
    {id:'setup',title:'Getting started',keys:['start','setup','create account','sign up','register','onboarding','first time','walkthrough','tutorial','getting started','how do i use'],answer:'Start on the product introduction, ask the AI guide anything you need, then create a verified workspace. After business-identifier, email and mobile verification, sign in. The first-login journey guides you through Command Centre, Business Setup, Workforce, Jobs, AI Operations, Content Studio, Connections, Trust & Governance and Billing.',next:['What do I need to create an account?','What happens after sign-in?','Can I replay the tutorial?']},
    {id:'customise',title:'Customisation',keys:['customise','customize','custom','my business','brand voice','instructions','settings','tailor','tailored'],answer:'Business Setup lets the owner define business type, services, service area, brand voice, approval mode and permanent AI instructions. Industry templates prefill sensible starting points but should not silently overwrite information the user has already entered.',next:['What can I customise?','How do industry templates work?','Can I set permanent AI instructions?']},
    {id:'data',title:'Data and privacy',keys:['data','privacy','store data','customer data','employee data','retention','delete','export','backup'],answer:'The architecture is organisation-scoped and designed around tenant isolation, authenticated sessions, role-based access, audit-ready actions, a tamper-evident governance ledger and controlled handling of customer and workforce information.',next:['Is each business data isolated?','What workforce data is sensitive?','What still needs production review?']},
    {id:'mobile',title:'Desktop and mobile use',keys:['mobile','phone app','responsive','tablet','desktop','field','onsite','on site','android','iphone'],answer:'The interface is responsive and supports desktop, laptop, tablet and mobile use. It also includes installable PWA support. Microphone recognition and spoken playback depend on browser and device speech services, with automatic fallback to the device speech engine where possible.',next:['Can field staff use it?','How do I install it?','How does voice work on mobile?']},
    {id:'value',title:'Why businesses use it',keys:['why','benefit','benefits','value','save time','growth','grow','worth','problem solve','replace'],answer:'The goal is to reduce fragmentation: instead of switching between disconnected customer, job, team, content and communication tools, the business works from one operational context. That can support faster follow-up, clearer ownership of work, fewer missed tasks and more consistent customer handling while keeping important decisions under human control.',next:['How does it help get more leads?','How does it save admin time?','What stays under human control?']},
    {id:'governance',title:'Trust, governance and complaints',keys:['governance','complaint','complaints','help desk','support desk','rights','policy','policies','procedure','grievance','trust center','audit log','activity log'],answer:'The Trust & Governance layer provides a Help & Complaint Desk, role-aware policies, protected escalation, case references, senior-only security and audit views, and human review for consequential matters. Higher-risk privacy, security, safety, fraud, staff-conduct or legal cases can use configured escalation channels.',next:['Who can see activity logs?','How are confidential complaints routed?','What policies can staff acknowledge?']},
    {id:'audit',title:'Tamper-evident audit and access',keys:['audit','audit trail','activity log','immutable','blockchain','tamper','tamper proof','hash','ledger','owner access','manager access','who can see logs'],answer:'Super Pro AI Office Manager uses organisation-scoped audit events plus an append-only governance ledger with linked cryptographic hashes. That provides tamper evidence without placing private customer information on a public blockchain. Organisation-wide governance evidence is restricted server-side to authorised senior roles.',next:['Is this a public blockchain?','Can employees see owner logs?','What happens if someone changes a record?']},
    {id:'complaint-routing',title:'Confidential complaints and escalation',keys:['confidential complaint','complaint against manager','whistleblower','whistleblowing','report manager','serious complaint','escalation','fraud report','security incident','privacy complaint'],answer:'A complaint can request confidential routing. Higher-risk cases can bypass a conflicted manager. Statutory whistleblower protection is not automatically promised because eligibility and legal protections depend on the person, subject matter, recipient and circumstances.',next:['Will the owner be alerted?','Can a manager see a complaint about them?','How are whistleblower reports different?']},
    {id:'self-service-integrations',title:'Self-service platform connections',keys:['self service','oauth','api key','developer key','connect social media','all social platforms','customer should not setup api'],answer:'Customers should not paste developer API secrets. The Connections hub is designed so customers select the platforms they want and authorise their own account through provider consent. Super Pro keeps app-level provider credentials server-side.',next:['Which platforms are included?','Do customers need API keys?','Can all content be managed from one place?']},
    {id:'manual',title:'Digital user manual and live map',keys:['user manual','manual','digital manual','live map','application map','where am i','what do i do next','navigation map','guided help','guide me','show me how'],answer:'The Digital User Manual is designed to follow the current workspace location, explain what the page is for, suggest the next permitted actions and take the user to the relevant workspace section or Help Desk.',next:['Open the digital user manual','What should I do next?','Can staff see different guidance?']},
    {id:'key-control',title:'Platform key control',keys:['keys','api keys','secret','secrets','key control','platform credentials','customer api key','developer secret'],answer:'Super Pro uses platform-managed application credentials. The operator configures provider credentials in the protected server or production secret manager; customer workspaces never receive raw developer secrets.',next:['Do customers see API keys?','Where should production secrets be stored?','How do customers connect their accounts?']},
    {id:'finance-intelligence',title:'Expenses and profit intelligence',keys:['expense','expenses','profit','net profit','overhead','insurance','stock cost','job profit','costs'],answer:'The Office Manager can record business expenses such as materials, stock, supplied services, subscriptions, insurance and overheads. Costs can be linked to jobs so authorised users can compare recorded revenue and expenses for job-level and overall net-profit reporting. Tax and accounting treatment still requires professional review.',next:['Can I link an expense to a job?','Who can see profit information?','Can AI categorise expenses?']},
    {id:'quality-loop',title:'Maker and checker quality loop',keys:['maker checker','checker','verifier','quality loop','verify ai','ai quality'],answer:'Super Pro separates creation from verification. A maker prepares output, a separate checker tests explicit quality and safety criteria, the verdict is recorded, and failed checks are revised instead of silently promoted. Consequential actions still require authorised human review.',next:['Where are checker results stored?','Can the checker send actions?','How does the quality ratchet work?']},
    {id:'referrals',title:'Referral rewards and attribution',keys:['referral','refer','reward','discount','referral code','invite business'],answer:'Each subscribed organisation can have an original referral code. Referred accounts can retain attribution to that source while reward eligibility and amounts remain controlled by published program rules.',next:['Where do I enter a referral code?','Can I see referred businesses?','How are rewards approved?']},
    {id:'search-visibility',title:'SEO, GEO and AEO visibility',keys:['seo','geo','aeo','search visibility','answer engine','generative engine','google','bing','indexnow'],answer:'The public product experience includes crawl controls, sitemap, canonical metadata, structured data, an Answer Center, IndexNow readiness and a Search Visibility Centre. Private workspaces remain excluded from crawling.',next:['What is the Answer Center?','Are private pages indexed?','What is IndexNow?']},
    {id:'install-app',title:'Install on desktop, tablet and mobile',keys:['download','install','mobile app','desktop app','tablet','pwa','add to home screen'],answer:'Super Pro includes installable Progressive Web App support for compatible desktop and mobile browsers. It does not claim an app-store listing until one is actually published. Authenticated workspace data is intentionally excluded from the public offline cache.',next:['How do I install it?','Does it work on mobile?','Is private data cached offline?']},
    {id:'limitations',title:'What is not live yet',keys:['not working','not live','limitation','limitations','available now','production ready','ready','real ai','live ai'],answer:'This is a pre-launch build. Core workspace flows, product guidance and secure-registration architecture are implemented for testing, while individual external integrations are only live when their production credentials, provider authorisation and connection tests are complete.',next:['What can I test now?','What credentials are needed for production?','Which integrations still need connection?']}
  ];

  const legacyKnowledge=[
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

  const clean=value=>String(value||'').toLowerCase().replace(/[^\p{L}\p{N}+&\s-]/gu,' ').replace(/\s+/g,' ').trim();
  const words=value=>clean(value).split(' ').filter(Boolean);
  function rank(query,topic){
    const q=clean(query);if(!q)return 0;let score=0;
    for(const key of topic.keys){const k=clean(key);if(q===k)score+=32;else if(q.includes(k))score+=12+Math.min(8,words(k).length*2);else{const ks=words(k).filter(w=>w.length>2);score+=ks.filter(w=>q.includes(w)).length*3}}
    score+=words(topic.title).filter(w=>w.length>3&&q.includes(w)).length*2;
    return score;
  }
  function conversational(query){
    const q=clean(query);
    if(/^(hi|hello|hey|good morning|good afternoon|good evening)\b/.test(q))return {text:'Welcome to Super Pro AI Office Manager. Ask me a specific question and I’ll explain the relevant feature, workflow or setup step. I can also guide you through the product step by step.',topic:'greeting',suggestions:['What can Super Pro AI Office Manager do?','Show me how to get started','Can I talk to you by voice?']};
    if(/\b(thanks|thank you|cheers)\b/.test(q))return {text:'You’re welcome. Ask another question whenever you like, or tell me what you want to achieve and I’ll guide you to the relevant part of Super Pro.',topic:'thanks',suggestions:['Show me the main modules','Explain the trial and plans','How do I create a secure account?']};
    if(/^(how can you help me|what can you help me with|what can you do for me|how can you help|what can you do)\??$/.test(q))return {text:'I can help you operate and understand Super Pro, not just point to a menu. Ask me to explain a feature, troubleshoot setup, connect a service, add staff, organise jobs, review security or governance controls, use Content Studio, understand billing, or navigate to the right workspace area. I can also answer follow-up questions using the current conversation and workspace context. Tell me the outcome you want, and I’ll give you the next practical step.',topic:'capabilities',suggestions:['What should I set up next?','How do I add an employee?','Check my connection setup']};
    if(/\b(i cannot hear you|i can(?:not|'t) hear you|no voice|no sound|not speaking|voice not working|cannot hear the reply|can(?:not|'t) hear the reply)\b/.test(q))return {text:'The text answer is working, but spoken playback needs attention. Make sure the speaker button in this chat is on, your phone media volume is up, and the browser is allowed to use the device speech service. Press the speaker button once to run an audible voice test. If the selected language has no installed voice, Super Pro will ask the device speech engine for that language instead of using a wrong-language voice.',topic:'voice-troubleshooting',suggestions:['Test voice now','How do I use the microphone?','Which languages support voice?']};
    return null;
  }
  function answer(query,context='public',previousTopic=''){
    const q=clean(query);
    if(!q)return {text:'Ask me anything about Super Pro AI Office Manager—features, AI, plans, security, setup, industries, jobs, calls, content, integrations or how to use a specific area.',topic:'overview',suggestions:['What can Super Pro AI Office Manager do?','How does secure account verification work?','Can I talk to you by voice?']};
    const chat=conversational(q);if(chat)return chat;
    const followUp=/^(tell me more|more|more detail|explain more|how exactly|what else|continue|go on)\b/.test(q);
    if(followUp&&previousTopic){const prev=topics.find(t=>t.id===previousTopic);if(prev)return {text:`${prev.answer} Ask me the exact part you want to do and I can break it into practical steps.`,topic:prev.id,suggestions:prev.next||['How do I set this up?','What does the customer see?','What requires approval?']};}
    const ranked=topics.map(t=>({topic:t,score:rank(q,t)})).sort((a,b)=>b.score-a.score),best=ranked[0];
    if(!best||best.score<=1)return {text:'I can help with any Super Pro AI Office Manager question. Tell me the task you are trying to complete—for example setting up calls, connecting WhatsApp, creating workers, managing jobs, using Content Studio, security, plans or navigation—and I’ll give you the relevant steps.',topic:'fallback',suggestions:['Show me how to set up the app','Can AI answer calls and messages?','How do employees and jobs work?']};
    let text=best.topic.answer;
    const second=ranked.find((x,i)=>i>0&&x.score>=Math.max(9,best.score*.62));
    if(second&&second.topic.id!==best.topic.id)text+=` ${second.topic.answer}`;
    if(context==='workspace')text+=' I can also take you to the closest workspace area.';
    return {text,topic:best.topic.id,suggestions:best.topic.next||ranked.slice(1,4).filter(x=>x.score>1).map(x=>x.topic.title)};
  }

  const navigation=[
    {view:'dashboard',label:'Command centre',keys:['dashboard','command centre','home','overview','attention','brief']},
    {view:'onboarding',label:'Business setup',keys:['setup','business setup','profile','industry','services','approval settings','brand voice']},
    {view:'workforce',label:'People & workforce',keys:['worker','employee','staff','team','workforce','people','compliance','add employee']},
    {view:'jobs',label:'Jobs & allocation',keys:['job','booking','allocate','allocation','schedule','dispatch','work order']},
    {view:'assistant',label:'AI Operations',keys:['ai operations','assistant','ai task','operations task','memory','instructions']},
    {view:'video',label:'Content studio',keys:['content','video','reel','render','social','media','tiktok','youtube']},
    {view:'integrations',label:'Connections',keys:['integration','connection','connect','whatsapp','tiktok','facebook','instagram','youtube','snapchat','twitter','x','email','sms','phone','telnyx']},
    {view:'governance',label:'Trust & governance',keys:['governance','trust','complaint','complaints','help desk','policy','policies','audit','security alert','rights','legal','activity log']},
    {view:'manual',label:'Digital user manual',keys:['manual','user manual','guide','live map','application map','help me','where am i','what next']},
    {view:'billing',label:'Plans & billing',keys:['billing','plan','subscription','trial','price','pricing']}
  ];
  function findActions(query){const q=clean(query);return navigation.map(n=>({...n,score:n.keys.reduce((s,k)=>s+(q.includes(clean(k))?10:0),0)+(q.includes(clean(n.label))?15:0)})).filter(x=>x.score>0).sort((a,b)=>b.score-a.score)}
  function detectLanguage(text){
    const t=String(text||''),normalized=t.toLowerCase().replace(/[^a-zà-ÿ]+/g,' ').trim(),words=normalized.split(/\s+/).filter(Boolean),set=new Set(words);
    if(/[ےںٹڈڑھچپگژکگیہ]/.test(t)||/(?:^|\s)(?:ہے|ہیں|میں|آپ|کیا|کیسے|نہیں|اور|یہ|وہ|جو|کو|سے|کا|کی)(?:\s|$)/.test(t))return 'ur';
    if(/[\u0600-\u06FF]/.test(t))return 'ar';
    if(/[\u0900-\u097F]/.test(t))return 'hi';
    if(/[\u0A00-\u0A7F]/.test(t))return 'pa';
    if(/[\u4E00-\u9FFF]/.test(t))return 'zh';
    if(/[\u3040-\u30FF]/.test(t))return 'ja';
    if(/[\uAC00-\uD7AF]/.test(t))return 'ko';
    if(/[\u0980-\u09FF]/.test(t))return 'bn';
    if(/[\u0B80-\u0BFF]/.test(t))return 'ta';
    const count=list=>list.reduce((n,w)=>n+(set.has(w)?1:0),0);
    const punjabiStrong=['tusi','tuhanu','mainu','sanu','kiven','kiwen','kivein','naal','assi','asi','veere','paaji'];
    if(count(punjabiStrong)>=1)return 'pa';
    const urduStrong=['mujhe','mera','meri','mere','aap','apko','aapko','kaise','kyun','nahi','nahin','chahiye','batao','bataye','samjhao','karna','karo','krna','yeh','yahan','wala','wali','acha','theek','kya'];
    const urduCommon=['hai','hain','mein','main','aur','se','ko','ka','ki','ke'];
    const strong=count(urduStrong),common=count(urduCommon);
    if(strong>=1||(strong+common)>=2)return 'ur';
    if(/[áéíóúñ¿¡]/i.test(t))return 'es';
    if(/[àâçéèêëîïôûùüÿœ]/i.test(t))return 'fr';
    return 'en'
  }
  const emergencyLanguageReply={
    ur:'جی ہاں، میں آپ سے اردو میں بات کر سکتا ہوں۔ آپ اپنا سوال اردو یا رومن اردو میں پوچھیں، میں اسی زبان میں جواب دوں گا۔ آپ Super Pro AI Office Manager کے سیٹ اپ، AI Operations، کالز، WhatsApp، ملازمین، جابز، سیکیورٹی یا کسی بھی فیچر کے بارے میں پوچھ سکتے ہیں۔',
    hi:'हाँ, मैं आपसे हिंदी में बात कर सकता हूँ। आप अपना सवाल हिंदी या Roman Hindi में पूछें और मैं उसी भाषा में जवाब दूँगा। आप Super Pro AI Office Manager के setup, AI Operations, calls, WhatsApp, employees, jobs, security या किसी भी feature के बारे में पूछ सकते हैं।',
    pa:'ਹਾਂ, ਮੈਂ ਤੁਹਾਡੇ ਨਾਲ ਪੰਜਾਬੀ ਵਿੱਚ ਗੱਲ ਕਰ ਸਕਦਾ ਹਾਂ। ਤੁਸੀਂ ਪੰਜਾਬੀ ਜਾਂ Roman Punjabi ਵਿੱਚ ਸਵਾਲ ਪੁੱਛੋ ਅਤੇ ਮੈਂ ਉਸੇ ਭਾਸ਼ਾ ਵਿੱਚ ਜਵਾਬ ਦੇਵਾਂਗਾ। ਤੁਸੀਂ setup, AI Operations, calls, WhatsApp, staff, jobs ਜਾਂ security ਬਾਰੇ ਪੁੱਛ ਸਕਦੇ ਹੋ।',
    ar:'نعم، يمكنني التحدث معك بالعربية. اطرح سؤالك بالعربية وسأجيبك باللغة نفسها. يمكنك السؤال عن الإعداد، وعمليات الذكاء الاصطناعي، والمكالمات، وواتساب، والموظفين، والوظائف، والأمان أو أي ميزة أخرى.',
    es:'Sí, puedo hablar contigo en español. Haz tu pregunta en español y responderé en el mismo idioma. Puedes preguntar sobre configuración, AI Operations, llamadas, WhatsApp, personal, trabajos, seguridad o cualquier función.',
    fr:'Oui, je peux parler avec vous en français. Posez votre question en français et je répondrai dans la même langue. Vous pouvez demander de l’aide sur la configuration, AI Operations, les appels, WhatsApp, le personnel, les tâches, la sécurité ou toute autre fonction.',
    bn:'হ্যাঁ, আমি আপনার সঙ্গে বাংলায় কথা বলতে পারি। বাংলায় প্রশ্ন করুন, আমি একই ভাষায় উত্তর দেব। সেটআপ, AI Operations, কল, WhatsApp, কর্মী, কাজ, নিরাপত্তা বা অন্য যেকোনো ফিচার সম্পর্কে জিজ্ঞেস করতে পারেন।',
    ta:'ஆம், நான் உங்களுடன் தமிழில் பேச முடியும். உங்கள் கேள்வியை தமிழில் கேளுங்கள்; அதே மொழியில் பதிலளிப்பேன். அமைப்பு, AI Operations, அழைப்புகள், WhatsApp, பணியாளர்கள், வேலைகள், பாதுகாப்பு அல்லது வேறு எந்த அம்சத்தையும் கேட்கலாம்.',
    zh:'可以，我可以用中文和你交流。请直接用中文提问，我会用中文回答。你可以询问设置、AI Operations、电话、WhatsApp、员工、工作、安全或其他功能。',
    ja:'はい、日本語でお話しできます。日本語で質問してください。同じ言語で回答します。設定、AI Operations、通話、WhatsApp、スタッフ、仕事、セキュリティ、その他の機能について質問できます。',
    ko:'네, 한국어로 대화할 수 있습니다. 한국어로 질문하면 같은 언어로 답변하겠습니다. 설정, AI Operations, 통화, WhatsApp, 직원, 작업, 보안 또는 다른 기능에 대해 물어보세요.'
  };
  function knowledgeContext(query,maxChars=950){
    const q=clean(query),qWords=q.split(/\s+/).filter(x=>x.length>2),rows=[];
    const scoreText=text=>qWords.reduce((n,w)=>n+(clean(text).includes(w)?1:0),0);
    for(const k of legacyKnowledge){const score=scoreText(`${k.keys} ${k.text}`);if(score)rows.push({score,text:k.text})}
    for(const t of topics){const score=scoreText(`${t.title} ${(t.keys||[]).join(' ')} ${t.answer||''}`);if(score)rows.push({score,text:t.answer})}
    if(typeof document!=='undefined'&&document.body){
      for(const el of document.querySelectorAll('.workspace-nav button,.page-heading,.feature-card,.security-list,.industry-rail button,.integration-card,.panel-head,.manual-card')){
        const text=String(el.innerText||'').replace(/\s+/g,' ').trim();if(text.length<15||text.length>900)continue;const score=scoreText(text);if(score>1)rows.push({score,text});
      }
    }
    rows.sort((a,b)=>b.score-a.score);
    const out=[];let used=0;
    for(const row of rows){const text=String(row.text||'').replace(/\s+/g,' ').trim();if(!text||out.includes(text))continue;const add=(out.length?3:0)+text.length;if(used+add>maxChars)break;out.push(text);used+=add}
    return out.join(' | ');
  }
  function plainText(value){
    return String(value??'')
      .replace(/\r\n?/g,'\n')
      .replace(/\*\*([^*]+)\*\*/g,'$1')
      .replace(/__([^_]+)__/g,'$1')
      .replace(/~~([^~]+)~~/g,'$1')
      .replace(/`{1,3}([^`]+)`{1,3}/g,'$1')
      .replace(/^\s{0,3}#{1,6}\s+/gm,'')
      .replace(/^\s*[\-*]\s+/gm,'')
      .replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g,'$1')
      .replace(/[\*_~]+/g,'')
      .replace(/[ \t]+\n/g,'\n')
      .replace(/\n{3,}/g,'\n\n')
      .trim();
  }
  function speechText(value){return plainText(value).replace(/https?:\/\/\S+/gi,'').replace(/\s+/g,' ').trim()}
  function memoryKey(context='public'){
    const scope=String(context||'public').startsWith('workspace')?'workspace':'public';
    return 'superpro_ai_memory_current:'+scope;
  }
  function loadMemory(context='public'){try{const v=JSON.parse(localStorage.getItem(memoryKey(context))||'[]');return Array.isArray(v)?v:[]}catch{return[]}}
  function saveMemory(context,rows){
    let out=rows.slice(-120),chars=out.reduce((n,x)=>n+String(x.q||'').length+String(x.a||'').length,0);
    while(out.length>8&&chars>120000){const first=out.shift();chars-=String(first.q||'').length+String(first.a||'').length}
    try{localStorage.setItem(memoryKey(context),JSON.stringify(out))}catch{}
  }
  function remember(context,q,a,meta={}){
    const rows=loadMemory(context);rows.push({q:plainText(q).slice(0,3000),a:plainText(a).slice(0,7000),topic:meta.topic||'',language:meta.language||'',at:Date.now()});saveMemory(context,rows)
  }
  function relevantMemory(context,query,maxChars=650){
    const qWords=new Set(clean(query).split(/\s+/).filter(x=>x.length>2));
    const rows=loadMemory(context),scored=rows.slice(0,-4).map(x=>({x,score:[...qWords].reduce((n,w)=>n+(clean(x.q+' '+x.a).includes(w)?1:0),0)})).filter(x=>x.score>0).sort((a,b)=>b.score-a.score).slice(0,2).map(x=>x.x);
    const chosen=[...scored,...rows.slice(-4)].filter((x,i,a)=>a.indexOf(x)===i);
    return chosen.map(x=>`Q: ${x.q}\nA: ${x.a}`).join('\n').slice(-maxChars);
  }
  function clearMemory(context='public'){try{localStorage.removeItem(memoryKey(context))}catch{}}
  function conversationId(context='public'){
    const scope=String(context||'public').startsWith('workspace')?'workspace':'public',key='superpro_conversation_current:'+scope;
    try{let id=localStorage.getItem(key)||'';if(!id){id=crypto?.randomUUID?.()||`sp-${Date.now()}-${Math.random().toString(36).slice(2)}`;localStorage.setItem(key,id)}return id}catch{return `sp-${Date.now()}`}
  }
  async function answerAsync(query,context='public',previousTopic='',language='auto'){
    const q=String(query||'').trim(),local=answer(q,context,previousTopic);
    const detected=language&&language!=='auto'?language:detectLanguage(q);
    const memory=relevantMemory(context,q);
    const knowledge=knowledgeContext(q),providerQuestion=[q,knowledge&&`Verified product context: ${knowledge}`,memory&&`Relevant recent conversation context:\n${memory}`].filter(Boolean).join('\n\n');
    try{
      const r=await fetch('/api/product-guide/answer',{method:'POST',credentials:'same-origin',cache:'no-store',headers:{'content-type':'application/json'},body:JSON.stringify({question:providerQuestion,context,language:detected,conversation_id:conversationId(context)})});
      const d=await r.json().catch(()=>({}));
      if(r.ok&&d.text){
        const result={...local,text:plainText(d.text),language:detected,source:d.source||'server-guidance'};
        remember(context,q,result.text,result);return result;
      }
    }catch{}
    let result;
    if(detected!=='en'&&emergencyLanguageReply[detected])result={...local,text:emergencyLanguageReply[detected],language:detected,source:'localized-browser-fallback'};
    else result={...local,text:plainText(local.text),language:detected,source:'browser-product-knowledge'};
    remember(context,q,result.text,result);return result;
  }
  window.GDSProductGuide={version:'current-2026-09-19',topics,answer,answerAsync,findActions,clean,detectLanguage,cleanOutput:plainText,cleanSpeech:speechText,memory:{load:loadMemory,clear:clearMemory,remember,relevant:relevantMemory}};
})();
