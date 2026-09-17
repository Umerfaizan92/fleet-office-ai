(() => {
  const $=s=>document.querySelector(s), $$=s=>document.querySelectorAll(s);

  async function preserveSignedInNavigation(){
    try{
      const r=await fetch('/api/saas/me',{credentials:'same-origin'});
      if(!r.ok)return;
      const d=await r.json().catch(()=>null);
      if(!d?.ok)return;
      document.body.dataset.authenticated='true';
      const brand=document.querySelector('.site-header .brand');
      if(brand)brand.href='/saas/workspace.html#dashboard';
      const sign=document.querySelector('.site-header .nav-sign');
      if(sign){sign.href='/saas/workspace.html#dashboard';sign.textContent='Open workspace'}
      const cta=document.querySelector('.site-header .nav-cta');
      if(cta){cta.href='/saas/workspace.html#dashboard';cta.innerHTML='Return to AI Office <span>→</span>'}
    }catch{}
  }
  preserveSignedInNavigation();

  const log=$('#chat-log'), input=$('#chat-input'), form=$('#chat-form'), satisfaction=$('#satisfaction'), conversion=$('#conversion-panel');
  let voiceReplies=localStorage.getItem('superpro_voice_replies')!=='off';
  let recognition=null, listening=false, lastTopic='', lastLanguage='en', availableVoices=[];
  let speechRun=0, speechHeartbeat=null, speechPrimed=false;
  const escape=v=>String(v??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
  const speechSupported='speechSynthesis' in window && 'SpeechSynthesisUtterance' in window;
  const recognitionSupported=Boolean(window.SpeechRecognition||window.webkitSpeechRecognition);

  function scrollChat(){log?.scrollTo({top:log.scrollHeight,behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'})}
  function setVoiceStatus(text,state='ready'){
    const el=$('#voice-status');if(el){el.textContent=text;el.dataset.state=state}
    const cap=$('#voice-capability');if(cap){
      cap.dataset.state=state;
      const detail=cap.querySelector('[data-voice-capability-detail]');
      if(detail)detail.textContent=text;
    }
  }
  function updateVoiceCapability(){
    const cap=$('#voice-capability');if(!cap)return;
    const title=cap.querySelector('[data-voice-capability-title]');
    if(title)title.textContent=speechSupported||recognitionSupported?'Voice ready':'Voice unavailable';
    if(!speechSupported&&!recognitionSupported)setVoiceStatus('This browser does not expose speech input or speech playback. Typing remains fully available.','unavailable');
    else if(!speechSupported)setVoiceStatus('Microphone input is available, but this browser does not expose spoken reply playback.','limited');
    else if(!recognitionSupported)setVoiceStatus('Spoken replies are available, but microphone input is not supported in this browser.','limited');
  }
  function addMessage(role,text,title=''){
    const el=document.createElement('div');el.className=`message ${role}`;
    el.innerHTML=`<span>${role==='ai'?'AI':'YOU'}</span><div>${title?`<b>${escape(title)}</b>`:''}<p>${escape(text)}</p></div>`;
    log.append(el);scrollChat();return el;
  }

  function speechLocale(lang){return ({ur:'ur-PK',hi:'hi-IN',pa:'pa-IN',ar:'ar-SA',es:'es-ES',fr:'fr-FR',zh:'zh-CN',ja:'ja-JP',ko:'ko-KR',bn:'bn-BD',ta:'ta-IN',en:'en-AU'})[lang]||'en-AU'}
  const femaleHints=/female|heera|sana|samantha|victoria|aria|jenny|zira|hazel|karen|tessa|susan|sonia|natasha|veena|ava|emma|olivia|neerja/i;
  const maleHints=/male|asad|david|mark|guy|ryan|george|daniel|james|ravi|hemant|imran|liam|aaron/i;
  function refreshVoices(){if(speechSupported)availableVoices=window.speechSynthesis.getVoices()||[];return availableVoices}
  refreshVoices();
  if(speechSupported)window.speechSynthesis.addEventListener?.('voiceschanged',refreshVoices);

  function ensureVoicesReady(timeout=1400){
    if(!speechSupported)return Promise.resolve([]);
    const now=refreshVoices();if(now.length)return Promise.resolve(now);
    return new Promise(resolve=>{
      let done=false;
      const finish=()=>{if(done)return;done=true;clearTimeout(timer);window.speechSynthesis.removeEventListener?.('voiceschanged',onChange);resolve(refreshVoices())};
      const onChange=()=>{if(refreshVoices().length)finish()};
      const timer=setTimeout(finish,timeout);
      window.speechSynthesis.addEventListener?.('voiceschanged',onChange,{once:true});
    });
  }
  function voicePreference(){return $('#guide-voice')?.value||localStorage.getItem('superpro_voice_preference')||'auto'}
  function findLanguageVoice(locale){
    refreshVoices();
    const exact=availableVoices.filter(v=>String(v.lang||'').toLowerCase()===locale.toLowerCase());
    const family=locale.split('-')[0].toLowerCase();
    const sameFamily=availableVoices.filter(v=>String(v.lang||'').toLowerCase().split('-')[0]===family);
    const candidates=exact.length?exact:sameFamily;
    if(!candidates.length)return {voice:null,matchedPreference:false};
    const pref=voicePreference();
    if(pref==='female'){const v=candidates.find(x=>femaleHints.test(x.name));if(v)return {voice:v,matchedPreference:true}}
    if(pref==='male'){const v=candidates.find(x=>maleHints.test(x.name));if(v)return {voice:v,matchedPreference:true}}
    return {voice:candidates.find(v=>v.default)||candidates[0],matchedPreference:pref==='auto'};
  }
  function splitSpeech(text,max=220){
    const cleaned=String(text||'').replace(/\s+/g,' ').trim();if(!cleaned)return [];
    const sentences=cleaned.match(/[^.!?؟۔]+[.!?؟۔]?/g)||[cleaned],chunks=[];let current='';
    for(const sentence of sentences){
      const s=sentence.trim();if(!s)continue;
      if((current+' '+s).trim().length<=max){current=(current+' '+s).trim();continue}
      if(current)chunks.push(current);
      if(s.length<=max){current=s;continue}
      const words=s.split(' ');current='';
      for(const word of words){if((current+' '+word).trim().length>max&&current){chunks.push(current);current=word}else current=(current+' '+word).trim()}
    }
    if(current)chunks.push(current);return chunks;
  }
  function stopSpeech(){speechRun++;if(speechHeartbeat){clearInterval(speechHeartbeat);speechHeartbeat=null}if(speechSupported){window.speechSynthesis.cancel();window.speechSynthesis.resume?.()}}
  function primeSpeech(){
    if(!speechSupported||speechPrimed)return;
    speechPrimed=true;
    try{const u=new SpeechSynthesisUtterance(' ');u.volume=0;u.rate=1;window.speechSynthesis.cancel();window.speechSynthesis.speak(u);window.speechSynthesis.resume?.()}catch{}
  }
  document.addEventListener('pointerdown',primeSpeech,{once:true,capture:true});
  document.addEventListener('keydown',primeSpeech,{once:true,capture:true});

  async function speak(text,lang=lastLanguage){
    if(!voiceReplies)return;
    if(!speechSupported){setVoiceStatus('Spoken reply playback is not supported in this browser. The text reply is ready.','limited');return}
    await ensureVoicesReady();
    const locale=speechLocale(lang), found=findLanguageVoice(locale), voice=found.voice;
    if(!voice){
      const label=$('#guide-language')?.selectedOptions?.[0]?.textContent||locale;
      setVoiceStatus(`Text reply ready. A compatible ${label} voice is not installed in this browser/device, so Super Pro will not read it with the wrong-language voice.`,'limited');
      return;
    }
    const chunks=splitSpeech(text);if(!chunks.length)return;
    stopSpeech();const run=++speechRun;let index=0, started=false, retryUsed=false;
    const pref=voicePreference();
    const announce=()=>{
      const preferenceNote=pref!=='auto'&&!found.matchedPreference?' · requested voice style not exposed by this device':' ';
      setVoiceStatus(`Speaking in ${voice.lang||locale} using ${voice.name}${preferenceNote}`.trim(),'speaking');
    };
    const next=()=>{
      if(run!==speechRun||!voiceReplies)return;
      if(index>=chunks.length){if(speechHeartbeat){clearInterval(speechHeartbeat);speechHeartbeat=null}setVoiceStatus('Voice reply finished. Press the microphone to speak, or type your next question.','ready');return}
      const u=new SpeechSynthesisUtterance(chunks[index++]);u.rate=.96;u.pitch=1;u.lang=voice.lang||locale;u.voice=voice;
      u.onstart=()=>{started=true;retryUsed=false;announce()};
      u.onend=()=>{started=false;next()};
      u.onerror=e=>{started=false;if(run!==speechRun)return;const reason=String(e?.error||'').toLowerCase();if(reason==='interrupted'||reason==='canceled')return;setVoiceStatus('Voice playback was interrupted by the browser. The text reply remains available; tap the speaker button to retry.','limited')};
      try{window.speechSynthesis.resume?.();window.speechSynthesis.speak(u)}catch{setVoiceStatus('Voice playback could not start. The text reply remains available.','limited');return}
      setTimeout(()=>{
        if(run!==speechRun||started||retryUsed||window.speechSynthesis.speaking||window.speechSynthesis.pending)return;
        retryUsed=true;index=Math.max(0,index-1);window.speechSynthesis.cancel();window.speechSynthesis.resume?.();next();
      },650);
    };
    speechHeartbeat=setInterval(()=>{if(run===speechRun&&voiceReplies&&window.speechSynthesis.paused)window.speechSynthesis.resume?.()},7000);
    next();
  }

  function setQuick(items=[]){const box=$('#quick-prompts');box.innerHTML=items.slice(0,3).map(x=>`<button type="button">${escape(x)}</button>`).join('');box.querySelectorAll('button').forEach(b=>b.onclick=()=>ask(b.textContent))}
  async function ask(question){
    const q=String(question||'').trim();if(!q)return;
    primeSpeech();addMessage('user',q);input.value='';resize();
    const wait=addMessage('ai','Thinking through the product…');wait.querySelector('p').classList.add('typing');
    try{
      const language=$('#guide-language')?.value||'auto';
      const result=await (window.GDSProductGuide.answerAsync?.(q,'public',lastTopic,language)||Promise.resolve(window.GDSProductGuide.answer(q,'public',lastTopic)));
      lastTopic=result.topic||lastTopic;lastLanguage=result.language||window.GDSProductGuide.detectLanguage?.(q)||'en';
      wait.remove();addMessage('ai',result.text,'AI product guidance');setQuick(result.suggestions);satisfaction.hidden=false;await speak(result.text,lastLanguage);
    }catch(e){wait.remove();addMessage('ai','I could not reach the AI guidance service. You can still use the product guide and navigation.');setVoiceStatus('Text guidance is still available. Voice will retry on your next question.','limited')}
  }
  form.addEventListener('submit',e=>{e.preventDefault();ask(input.value)});
  input.addEventListener('input',resize);
  input.addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();form.requestSubmit()}});
  function resize(){input.style.height='auto';input.style.height=Math.min(110,input.scrollHeight)+'px'}
  $('#clear-chat').onclick=()=>{stopSpeech();log.innerHTML='<div class="message ai"><span>AI</span><div><b>Fresh conversation.</b><p>Ask me anything about Super Pro AI Office Manager—features, AI, plans, security, setup, industries, jobs, calls, content or integrations.</p></div></div>';lastTopic='';satisfaction.hidden=true;conversion.hidden=true;setQuick(['What can this software do?','Can AI answer calls and messages?','How secure is account creation?']);setVoiceStatus('Fresh conversation ready. Speak or type in your preferred language.','ready')};

  const voiceOutput=$('#voice-output');
  function paintVoiceToggle(){if(!voiceOutput)return;voiceOutput.classList.toggle('active',voiceReplies);voiceOutput.textContent=voiceReplies?'🔊':'🔇';voiceOutput.title=voiceReplies?'Voice replies on':'Voice replies off';voiceOutput.setAttribute('aria-pressed',String(voiceReplies))}
  paintVoiceToggle();
  voiceOutput.onclick=e=>{voiceReplies=!voiceReplies;localStorage.setItem('superpro_voice_replies',voiceReplies?'on':'off');paintVoiceToggle();if(!voiceReplies){stopSpeech();setVoiceStatus('Spoken replies are off. Text replies will continue.','limited')}else{primeSpeech();setVoiceStatus('Spoken replies are on. Ask a question to hear the answer in a compatible matching-language voice.','ready')}};

  function initRecognition(){
    const R=window.SpeechRecognition||window.webkitSpeechRecognition;if(!R)return null;
    const r=new R();r.lang=speechLocale($('#guide-language')?.value==='auto'?'en':$('#guide-language')?.value);r.interimResults=true;r.continuous=false;
    r.onstart=()=>{listening=true;$('#voice-input').classList.add('listening');setVoiceStatus(`Listening in ${r.lang}… speak naturally.`,'listening')};
    r.onresult=e=>{let text='';for(let i=e.resultIndex;i<e.results.length;i++)text+=e.results[i][0].transcript;input.value=text;resize();if(e.results[e.results.length-1].isFinal)setTimeout(()=>ask(input.value),160)};
    r.onerror=e=>{setVoiceStatus(e.error==='not-allowed'?'Microphone permission was blocked. Allow microphone access or type your question.':'Voice input could not start. Try again or type your question.','limited')};
    r.onend=()=>{listening=false;$('#voice-input').classList.remove('listening');if(!input.value.trim())setVoiceStatus('Press the microphone to speak, or type your question.','ready')};return r;
  }

  const guideHeader=document.querySelector('.guide-actions');
  if(guideHeader&&!$('#guide-language')){
    const voice=document.createElement('select');voice.id='guide-voice';voice.className='guide-language guide-voice';voice.title='Voice preference';voice.setAttribute('aria-label','Voice preference');voice.innerHTML='<option value="auto">Voice: Auto</option><option value="female">Voice: Female</option><option value="male">Voice: Male</option>';
    const savedVoice=localStorage.getItem('superpro_voice_preference');if(['auto','female','male'].includes(savedVoice))voice.value=savedVoice;
    const select=document.createElement('select');select.id='guide-language';select.className='guide-language';select.title='Reply and voice-input language';select.setAttribute('aria-label','Reply language');select.innerHTML='<option value="auto">Auto language</option><option value="en">English</option><option value="ur">Urdu</option><option value="hi">Hindi</option><option value="pa">Punjabi</option><option value="ar">Arabic</option><option value="zh">Chinese</option><option value="ja">Japanese</option><option value="ko">Korean</option><option value="bn">Bengali</option><option value="ta">Tamil</option><option value="es">Spanish</option><option value="fr">French</option>';
    const savedLanguage=localStorage.getItem('superpro_guide_language');if([...select.options].some(o=>o.value===savedLanguage))select.value=savedLanguage;
    guideHeader.prepend(voice);guideHeader.prepend(select);
    select.onchange=()=>{localStorage.setItem('superpro_guide_language',select.value);lastLanguage=select.value==='auto'?'en':select.value;if(recognition)recognition.lang=speechLocale(lastLanguage);setVoiceStatus(select.value==='auto'?'Auto language is on. Typed text is detected automatically; for microphone accuracy, select the language you plan to speak.':`Voice input and replies set to ${select.selectedOptions[0].textContent}. Matching-language speech is required.`,'ready')};
    voice.onchange=()=>{localStorage.setItem('superpro_voice_preference',voice.value);setVoiceStatus(`Voice preference set to ${voice.selectedOptions[0].textContent.replace('Voice: ','')}. Language matching still takes priority; gender preference applies only when the device exposes a matching voice.`,'ready')};
  }

  recognition=initRecognition();
  $('#voice-input').onclick=()=>{primeSpeech();if(!recognition){setVoiceStatus('Voice input is not supported in this browser. Chrome or Edge usually provide the broadest speech-input support; typing still works.','limited');return}if(listening)recognition.stop();else recognition.start()};
  $('#voice-capability')?.addEventListener('click',()=>{document.querySelector('.guide-actions')?.scrollIntoView({behavior:'smooth',block:'nearest'});setTimeout(()=>$('#guide-language')?.focus(),350)});
  $('#talk-to-ai').onclick=()=>{$('#experience').scrollIntoView({behavior:'smooth',block:'center'});setTimeout(()=>recognition?$('#voice-input').focus():input.focus(),500)};
  $('#satisfied-yes').onclick=()=>{conversion.hidden=false;conversion.scrollIntoView({behavior:'smooth',block:'center'})};
  $('#satisfied-more').onclick=()=>{$('#experience').scrollIntoView({behavior:'smooth',block:'center'});setTimeout(()=>input.focus(),500)};
  $('#keep-talking').onclick=()=>{$('#experience').scrollIntoView({behavior:'smooth',block:'center'});setTimeout(()=>input.focus(),500)};
  $('#final-ask').onclick=()=>{$('#experience').scrollIntoView({behavior:'smooth',block:'center'});setTimeout(()=>input.focus(),500)};
  $$('[data-question]').forEach(b=>b.onclick=()=>{$('#experience').scrollIntoView({behavior:'smooth',block:'center'});setTimeout(()=>ask(b.dataset.question),380)});
  $('#quick-prompts').querySelectorAll('button').forEach(b=>b.onclick=()=>ask(b.textContent));
  $('.mobile-nav').onclick=()=>$('.site-header nav').classList.toggle('open');$$('.site-header nav a').forEach(a=>a.onclick=()=>$('.site-header nav').classList.remove('open'));
  updateVoiceCapability();
})();
