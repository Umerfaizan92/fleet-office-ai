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
  let conversationLanguage=localStorage.getItem('superpro_conversation_language')||'auto';
  let recognition=null, listening=false, lastTopic='', lastLanguage=conversationLanguage==='auto'?'en':conversationLanguage, availableVoices=[], serverAudio=null, serverAudioUrl='', mediaRecorder=null, mediaStream=null;
  let speechRun=0, speechHeartbeat=null, speechPrimed=false, micWarmUntil=0;
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
  async function updateVoiceCapability(){
    const cap=$('#voice-capability');if(!cap)return;
    const title=cap.querySelector('[data-voice-capability-title]');
    let serverVoice=false,serverTranscription=false,provider='';
    try{
      const r=await fetch('/api/product-guide/status',{credentials:'same-origin',cache:'no-store'});
      const d=await r.json().catch(()=>({}));
      if(r.ok&&d?.ok){serverVoice=Boolean(d.voice_server_ready);serverTranscription=Boolean(d.transcription_server_ready);provider=d.voice_provider||''}
    }catch{}
    const inputReady=serverTranscription||recognitionSupported;
    const outputReady=serverVoice||speechSupported;
    if(title)title.textContent=inputReady||outputReady?'Voice ready':'Voice unavailable';
    if(!inputReady&&!outputReady)setVoiceStatus('Voice services are unavailable on this browser/device. Typing remains fully available.','unavailable');
    else if(!inputReady)setVoiceStatus('Spoken replies are available, but microphone input is not available on this browser/device.','limited');
    else if(!outputReady)setVoiceStatus('Microphone input is available, but spoken reply playback is not available on this browser/device.','limited');
    else setVoiceStatus((serverTranscription||serverVoice)?('Voice ready'+(provider?' · '+provider:'')+'. Server AI voice/transcription is available with device fallback.'):'Voice ready using this device/browser speech services.','ready');
  }
  function addMessage(role,text,title=''){
    const el=document.createElement('div');el.className=`message ${role}`;
    el.innerHTML=`<span>${role==='ai'?'AI':'YOU'}</span><div>${title?`<b>${escape(title)}</b>`:''}<p>${escape(text)}</p></div>`;
    log.append(el);scrollChat();return el;
  }

  function languageSwitch(text){
    const t=String(text||'').toLowerCase().replace(/[’']/g,"'").trim();
    const rules=[
      ['ur',/(?:اردو|urdu).{0,32}(?:بات|بول|speak|talk)|(?:بات|بول|speak|talk).{0,32}(?:اردو|urdu)|(?:in|میں|mein)\s+(?:urdu|اردو)/i],
      ['pa',/(?:ਪੰਜਾਬੀ|ਪੰਜਾਬੀ|punjabi).{0,32}(?:ਗੱਲ|ਬੋਲ|speak|talk)|(?:ਗੱਲ|ਬੋਲ|speak|talk).{0,32}(?:ਪੰਜਾਬੀ|punjabi)|(?:in|ਵਿੱਚ|vich)\s+(?:punjabi|ਪੰਜਾਬੀ)/i],
      ['en',/(?:english|انگریزی).{0,32}(?:speak|talk|بات|بول)|(?:speak|talk|بات|بول).{0,32}(?:english|انگریزی)|(?:in|میں|mein)\s+english/i],
      ['hi',/(?:हिंदी|hindi).{0,32}(?:बात|बोल|speak|talk)|(?:बात|बोल|speak|talk).{0,32}(?:हिंदी|hindi)/i],
      ['ar',/(?:العربية|arabic).{0,32}(?:تحدث|تكلم|speak|talk)|(?:speak|talk).{0,32}(?:arabic|العربية)/i],
      ['es',/(?:español|spanish).{0,32}(?:habla|speak|talk)|(?:speak|talk).{0,32}(?:spanish|español)/i],
      ['fr',/(?:français|french).{0,32}(?:parle|speak|talk)|(?:speak|talk).{0,32}(?:french|français)/i]
    ];
    return rules.find(([,re])=>re.test(t))?.[0]||null;
  }
  function lockConversationLanguage(lang){
    if(!lang||lang==='auto')return;
    conversationLanguage=lang;lastLanguage=lang;
    try{localStorage.setItem('superpro_conversation_language',lang)}catch{}
    if(recognition)recognition.lang=speechLocale(lang);
    const select=$('#guide-language');if(select&&select.value==='auto')select.dataset.detectedLanguage=lang;
  }
  function activeInputLanguage(){
    const selected=$('#guide-language')?.value||'auto';
    return selected==='auto'?(conversationLanguage!=='auto'?conversationLanguage:(lastLanguage||'en')):selected;
  }
  function speechLocale(lang){return ({ur:'ur-PK',hi:'hi-IN',pa:'pa-IN',ar:'ar-SA',es:'es-ES',fr:'fr-FR',zh:'zh-CN',ja:'ja-JP',ko:'ko-KR',bn:'bn-BD',ta:'ta-IN',en:'en-AU'})[lang]||'en-AU'}
  const femaleHints=/female|heera|sana|samantha|victoria|aria|jenny|zira|hazel|karen|tessa|susan|sonia|natasha|veena|ava|emma|olivia|neerja/i;
  const maleHints=/male|asad|david|mark|guy|ryan|george|daniel|james|ravi|hemant|imran|liam|aaron/i;
  function refreshVoices(){if(speechSupported)availableVoices=window.speechSynthesis.getVoices()||[];return availableVoices}
  refreshVoices();
  if(speechSupported)window.speechSynthesis.addEventListener?.('voiceschanged',refreshVoices);

  function ensureVoicesReady(timeout=1600){
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
  function stopSpeech(){speechRun++;if(speechHeartbeat){clearInterval(speechHeartbeat);speechHeartbeat=null}if(serverAudio){try{serverAudio.pause();serverAudio.src=''}catch{}serverAudio=null}if(serverAudioUrl){try{URL.revokeObjectURL(serverAudioUrl)}catch{}serverAudioUrl=''}if(speechSupported){window.speechSynthesis.cancel();window.speechSynthesis.resume?.()}}
  function primeSpeech(){
    if(!speechSupported||speechPrimed)return;
    speechPrimed=true;
    try{const u=new SpeechSynthesisUtterance(' ');u.volume=0;u.rate=1;window.speechSynthesis.cancel();window.speechSynthesis.speak(u);window.speechSynthesis.resume?.()}catch{}
  }
  document.addEventListener('pointerdown',primeSpeech,{once:true,capture:true});
  document.addEventListener('keydown',primeSpeech,{once:true,capture:true});

  async function speakBrowser(text,lang=lastLanguage){
    if(!speechSupported){setVoiceStatus('Spoken reply playback is not supported in this browser. The text reply is ready.','limited');return false}
    await ensureVoicesReady();const locale=speechLocale(lang),found=findLanguageVoice(locale),voice=found.voice,chunks=splitSpeech(text);if(!chunks.length)return false;const run=++speechRun;let index=0,started=false,retryUsed=false,pref=voicePreference();
    const announce=()=>{if(voice){const preferenceNote=pref!=='auto'&&!found.matchedPreference?' · requested voice style not exposed by this device':'';setVoiceStatus(`Speaking in ${voice.lang||locale} using ${voice.name}${preferenceNote}`,'speaking')}else setVoiceStatus(`Speaking in ${locale} using this device's speech service.`,'speaking')};
    const failStatus=()=>setVoiceStatus(`This device could not play the ${locale} voice. The text reply is still available.`,'limited');
    const next=()=>{if(run!==speechRun||!voiceReplies)return;if(index>=chunks.length){if(speechHeartbeat){clearInterval(speechHeartbeat);speechHeartbeat=null}setVoiceStatus('Voice reply finished. Press the microphone to speak, or type your next question.','ready');return}const u=new SpeechSynthesisUtterance(chunks[index++]);u.rate=.96;u.pitch=1;u.lang=voice?.lang||locale;if(voice)u.voice=voice;u.onstart=()=>{started=true;retryUsed=false;announce()};u.onend=()=>{started=false;next()};u.onerror=e=>{started=false;if(run!==speechRun)return;const reason=String(e?.error||'').toLowerCase();if(!['interrupted','canceled'].includes(reason))failStatus()};try{window.speechSynthesis.resume?.();window.speechSynthesis.speak(u)}catch{failStatus();return}setTimeout(()=>{if(run!==speechRun||started||retryUsed||window.speechSynthesis.speaking||window.speechSynthesis.pending)return;retryUsed=true;index=Math.max(0,index-1);window.speechSynthesis.cancel();window.speechSynthesis.resume?.();next()},850)};
    speechHeartbeat=setInterval(()=>{if(run===speechRun&&voiceReplies&&window.speechSynthesis.paused)window.speechSynthesis.resume?.()},5000);next();return true
  }
  async function speak(text,lang=lastLanguage){
    if(!voiceReplies)return false;stopSpeech();
    const locale=speechLocale(lang);
    // Non-English replies must never silently disappear when cloud TTS is
    // quota-limited. Start a native-locale browser voice if the server cannot
    // return playable audio, and treat play() rejection as a real fallback.
    try{
      const response=await fetch('/api/product-guide/speech',{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json'},body:JSON.stringify({text,language:lang,voice:voicePreference()})});
      if(response.ok){
        const blob=await response.blob();
        if(!blob.size)throw new Error('Empty server voice');
        serverAudioUrl=URL.createObjectURL(blob);serverAudio=new Audio(serverAudioUrl);
        let fallbackStarted=false;
        const fallback=async()=>{if(fallbackStarted)return;fallbackStarted=true;if(serverAudioUrl){try{URL.revokeObjectURL(serverAudioUrl)}catch{}serverAudioUrl=''}serverAudio=null;await speakBrowser(text,lang)};
        serverAudio.onplay=()=>setVoiceStatus(`Speaking naturally in ${locale} using Super Pro AI voice.`,'speaking');
        serverAudio.onended=()=>{if(serverAudioUrl)URL.revokeObjectURL(serverAudioUrl);serverAudioUrl='';serverAudio=null;setVoiceStatus('Voice reply finished. Press the microphone to speak, or type your next question.','ready')};
        serverAudio.onerror=()=>{fallback()};
        try{await serverAudio.play();return true}catch{await fallback();return true}
      }
    }catch{}
    return await speakBrowser(text,lang)
  }


  function setQuick(items=[]){const box=$('#quick-prompts');box.innerHTML=items.slice(0,3).map(x=>`<button type="button">${escape(x)}</button>`).join('');box.querySelectorAll('button').forEach(b=>b.onclick=()=>ask(b.textContent))}
  async function ask(question){
    const q=String(question||'').trim();if(!q)return;
    // True barge-in: any new customer turn immediately silences current AI audio.
    stopSpeech();
    primeSpeech();addMessage('user',q);input.value='';resize();
    const wait=addMessage('ai','Thinking through the product…');wait.querySelector('p').classList.add('typing');
    try{
      const selectedLanguage=$('#guide-language')?.value||'auto';
      const switched=languageSwitch(q);
      if(switched)lockConversationLanguage(switched);
      const detectedLanguage=window.GDSProductGuide.detectLanguage?.(q)||'en';
      if(selectedLanguage==='auto'&&conversationLanguage==='auto'&&detectedLanguage!=='en')lockConversationLanguage(detectedLanguage);
      const language=selectedLanguage==='auto'?(conversationLanguage!=='auto'?conversationLanguage:'auto'):selectedLanguage;
      const result=await (window.GDSProductGuide.answerAsync?.(q,'public',lastTopic,language)||Promise.resolve(window.GDSProductGuide.answer(q,'public',lastTopic)));
      lastTopic=result.topic||lastTopic;
      // A locked/selected conversation language owns both reply and TTS locale.
      // Do not let provider metadata switch an Urdu conversation back to English.
      const selectedNow=$('#guide-language')?.value||'auto';
      lastLanguage=selectedNow!=='auto'?selectedNow:(conversationLanguage!=='auto'?conversationLanguage:(result.language||window.GDSProductGuide.detectLanguage?.(q)||'en'));
      wait.remove();addMessage('ai',result.text,'AI product guidance');setQuick(result.suggestions);satisfaction.hidden=false;await speak(result.text,lastLanguage);
    }catch(e){
      wait.remove();
      const selected=$('#guide-language')?.value||'auto';
      const lang=selected!=='auto'?selected:(window.GDSProductGuide?.detectLanguage?.(q)||lastLanguage||'en');
      let result=null;
      try{result=await window.GDSProductGuide?.answerAsync?.(q,'public',lastTopic,lang)}catch{}
      if(!result){
        const emergency={ur:'جی ہاں، میں آپ سے اردو میں بات کر سکتا ہوں۔ اپنا سوال اردو یا رومن اردو میں پوچھیں، میں اسی زبان میں جواب دوں گا۔',hi:'हाँ, मैं आपसे हिंदी में बात कर सकता हूँ। अपना सवाल हिंदी में पूछें, मैं उसी भाषा में जवाब दूँगा।',pa:'ਹਾਂ, ਮੈਂ ਤੁਹਾਡੇ ਨਾਲ ਪੰਜਾਬੀ ਵਿੱਚ ਗੱਲ ਕਰ ਸਕਦਾ ਹਾਂ। ਪੰਜਾਬੀ ਵਿੱਚ ਸਵਾਲ ਪੁੱਛੋ ਅਤੇ ਮੈਂ ਪੰਜਾਬੀ ਵਿੱਚ ਜਵਾਬ ਦਿਆਂਗਾ।',ar:'نعم، يمكنني التحدث معك بالعربية. اطرح سؤالك بالعربية وسأجيبك بالعربية.',es:'Sí, puedo hablar contigo en español. Haz tu pregunta en español y responderé en español.',fr:'Oui, je peux parler avec vous en français. Posez votre question en français et je répondrai en français.'};
        result={text:emergency[lang]||'Please ask your question again.',language:lang,source:'localized-ui-fallback',suggestions:[]};
      }
      if(lang!=='en'&&result.source==='browser-product-knowledge'){
        const emergency={ur:'جی ہاں، میں آپ سے اردو میں بات کر سکتا ہوں۔ اپنا سوال اردو یا رومن اردو میں پوچھیں، میں اسی زبان में जवाब दूँगा।',hi:'हाँ, मैं आपसे हिंदी में बात कर सकता हूँ। अपना सवाल हिंदी में पूछें, मैं उसी भाषा में जवाब दूँगा।',pa:'ਹਾਂ, ਮੈਂ ਤੁਹਾਡੇ ਨਾਲ ਪੰਜਾਬੀ ਵਿੱਚ ਗੱਲ ਕਰ ਸਕਦਾ ਹਾਂ। ਪੰਜਾਬੀ ਵਿੱਚ ਸਵਾਲ ਪੁੱਛੋ ਅਤੇ ਮੈਂ ਪੰਜਾਬੀ ਵਿੱਚ ਜਵਾਬ ਦਿਆਂਗਾ।',ar:'نعم، يمكنني التحدث معك بالعربية. اطرح سؤالك بالعربية وسأجيبك بالعربية.',es:'Sí, puedo hablar contigo en español. Haz tu pregunta en español y responderé en español.',fr:'Oui, je peux parler avec vous en français. Posez votre question en français et je répondrai en français.'};
        if(emergency[lang])result={...result,text:emergency[lang],language:lang,source:'localized-ui-fallback'};
      }
      lastTopic=result.topic||lastTopic;lastLanguage=result.language||lang;
      addMessage('ai',result.text,'AI product guidance');setQuick(result.suggestions||[]);satisfaction.hidden=false;
      setVoiceStatus('Built-in guidance is active. You can keep asking in the same language.','ready');
      await speak(result.text,lastLanguage);
    }
  }
  form.addEventListener('submit',e=>{e.preventDefault();ask(input.value)});
  input.addEventListener('input',resize);
  input.addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();form.requestSubmit()}});
  function resize(){input.style.height='auto';input.style.height=Math.min(110,input.scrollHeight)+'px'}
  $('#clear-chat').onclick=()=>{stopSpeech();log.innerHTML='<div class="message ai"><span>AI</span><div><b>Fresh conversation.</b><p>Ask me anything about Super Pro AI Office Manager—features, AI, plans, security, setup, industries, jobs, calls, content or integrations.</p></div></div>';lastTopic='';satisfaction.hidden=true;conversion.hidden=true;setQuick(['What can this software do?','Can AI answer calls and messages?','How secure is account creation?']);setVoiceStatus('Fresh conversation ready. Speak or type in your preferred language.','ready')};

  const voiceOutput=$('#voice-output');
  function paintVoiceToggle(){if(!voiceOutput)return;voiceOutput.classList.toggle('active',voiceReplies);voiceOutput.textContent=voiceReplies?'🔊':'🔇';voiceOutput.title=voiceReplies?'Voice replies on':'Voice replies off';voiceOutput.setAttribute('aria-pressed',String(voiceReplies))}
  paintVoiceToggle();
  voiceOutput.onclick=()=>{voiceReplies=!voiceReplies;localStorage.setItem('superpro_voice_replies',voiceReplies?'on':'off');paintVoiceToggle();if(!voiceReplies){stopSpeech();setVoiceStatus('Spoken replies are off. Text replies will continue.','limited')}else{primeSpeech();setVoiceStatus('Spoken replies are on. Super Pro AI server voice is preferred; the device voice is used only as a fallback.','ready')}};

  function initRecognition(){
    const R=window.SpeechRecognition||window.webkitSpeechRecognition;if(!R)return null;
    const r=new R();r.lang=speechLocale($('#guide-language')?.value==='auto'?'en':$('#guide-language')?.value);r.interimResults=true;r.continuous=false;r.maxAlternatives=3;
    r.onstart=()=>{stopSpeech();listening=true;$('#voice-input').classList.add('listening');setVoiceStatus(`Listening in ${r.lang}… speak naturally.`,'listening')};
    r.onresult=e=>{let text='';for(let i=e.resultIndex;i<e.results.length;i++)text+=e.results[i][0].transcript;input.value=text;resize();if(e.results[e.results.length-1].isFinal)setTimeout(()=>ask(input.value),160)};
    r.onerror=e=>{setVoiceStatus(e.error==='not-allowed'?'Microphone permission was blocked. Allow microphone access or type your question.':'Voice input could not start. Try again or type your question.','limited')};
    r.onend=()=>{listening=false;$('#voice-input').classList.remove('listening');if(!input.value.trim())setVoiceStatus('Press the microphone to speak, or type your question.','ready')};return r;
  }


  function startBrowserRecognitionFallback(){
    if(!recognition){
      setVoiceStatus('Server transcription is unavailable and this browser does not expose speech recognition. Choose a language and type your question.','limited');
      return false;
    }
    const selected=$('#guide-language')?.value||'auto';
    const lang=selected==='auto'?activeInputLanguage():selected;
    recognition.lang=speechLocale(lang);
    try{
      setVoiceStatus('Server transcription unavailable. Switching to device recognition in '+recognition.lang+'…','listening');
      recognition.start();return true;
    }catch{
      setVoiceStatus('Device speech recognition could not start. Tap the microphone again or type your question.','limited');
      return false;
    }
  }

  async function autoListen(){
    // Warm the microphone before recording. Some Chrome/Windows audio devices
    // deliver silence during the first few hundred ms after activation.
    if(!navigator.mediaDevices?.getUserMedia||!window.MediaRecorder){
      if(startBrowserRecognitionFallback())return;
      setVoiceStatus('Automatic language microphone mode is not supported in this browser. Choose a language or type your question.','limited');return;
    }
    if(mediaRecorder&&mediaRecorder.state==='recording'){mediaRecorder.stop();return}
    stopSpeech();let chunks=[],audioContext=null,sourceNode=null,analyser=null,monitorTimer=null,hardStopTimer=null,speechStarted=false,silenceSince=0;
    const cleanupMonitor=()=>{if(monitorTimer)clearInterval(monitorTimer);if(hardStopTimer)clearTimeout(hardStopTimer);monitorTimer=null;hardStopTimer=null;try{sourceNode?.disconnect()}catch{}try{analyser?.disconnect()}catch{}try{audioContext?.close()}catch{}audioContext=null};
    try{
      mediaStream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true}});
      if(Date.now()>micWarmUntil){setVoiceStatus('Microphone ready… start speaking.','listening');await new Promise(resolve=>setTimeout(resolve,650));micWarmUntil=Date.now()+30000}
      const preferred=['audio/webm;codecs=opus','audio/webm'].find(t=>MediaRecorder.isTypeSupported?.(t))||'';
      mediaRecorder=new MediaRecorder(mediaStream,preferred?{mimeType:preferred}:undefined);
      mediaRecorder.ondataavailable=e=>{if(e.data?.size)chunks.push(e.data)};
      mediaRecorder.onstart=()=>{
        listening=true;$('#voice-input').classList.add('listening');setVoiceStatus('Listening… start speaking. I will answer when you finish.','listening');
        try{
          const AC=window.AudioContext||window.webkitAudioContext;
          if(AC){
            audioContext=new AC();sourceNode=audioContext.createMediaStreamSource(mediaStream);analyser=audioContext.createAnalyser();analyser.fftSize=1024;sourceNode.connect(analyser);
            const samples=new Uint8Array(analyser.fftSize),startedAt=Date.now(),noiseSamples=[];let threshold=0.012;
            monitorTimer=setInterval(()=>{
              if(mediaRecorder?.state!=='recording')return;
              analyser.getByteTimeDomainData(samples);let sum=0;
              for(const v of samples){const n=(v-128)/128;sum+=n*n}
              const rms=Math.sqrt(sum/samples.length),now=Date.now();
              if(!speechStarted&&now-startedAt<450){noiseSamples.push(rms);const floor=noiseSamples.reduce((a,b)=>a+b,0)/noiseSamples.length;threshold=Math.min(.035,Math.max(.008,floor*2.4))}
              if(rms>threshold){speechStarted=true;silenceSince=0;setVoiceStatus('I can hear you…','listening')}
              else if(speechStarted){
                if(!silenceSince)silenceSince=now;
                if(now-silenceSince>950)mediaRecorder.stop();
              }else if(now-startedAt>8000)mediaRecorder.stop();
            },100);
          }
        }catch{}
        hardStopTimer=setTimeout(()=>{if(mediaRecorder?.state==='recording')mediaRecorder.stop()},12000);
      };
      mediaRecorder.onstop=async()=>{
        cleanupMonitor();listening=false;$('#voice-input').classList.remove('listening');mediaStream?.getTracks().forEach(t=>t.stop());
        const blob=new Blob(chunks,{type:mediaRecorder.mimeType||'audio/webm'});
        if(!speechStarted||blob.size<900){
          // Do not make the customer press the microphone twice. Automatically
          // continue listening through browser recognition on the same attempt.
          setVoiceStatus('I did not catch that clearly. Still listening… please continue.','listening');
          setTimeout(()=>startBrowserRecognitionFallback(),100);return
        }
        const fd=new FormData();fd.append('audio',blob,'speech.webm');fd.append('language',($('#guide-language')?.value||'auto')==='auto'?(conversationLanguage!=='auto'?conversationLanguage:'auto'):$('#guide-language').value);
        setVoiceStatus('Understanding what you said…','listening');
        try{
          const r=await fetch('/api/product-guide/transcribe',{method:'POST',credentials:'same-origin',body:fd});
          const d=await r.json().catch(()=>({}));
          if(!r.ok||!String(d.text||'').trim())throw new Error(d.error||'Transcription failed.');
          const transcript=String(d.text).trim();
          input.value=transcript;
          const switched=languageSwitch(transcript),detected=d.language||window.GDSProductGuide?.detectLanguage?.(transcript)||'en';
          if(switched)lockConversationLanguage(switched);else if(($('#guide-language')?.value||'auto')==='auto'&&conversationLanguage==='auto'&&detected!=='en')lockConversationLanguage(detected);
          lastLanguage=conversationLanguage!=='auto'?conversationLanguage:detected;resize();
          setVoiceStatus('Heard: “'+transcript.slice(0,90)+(transcript.length>90?'…':'')+'”','ready');
          await ask(transcript);
        }catch(e){
          setVoiceStatus('Server transcription failed. Switching to device recognition…','listening');
          setTimeout(()=>startBrowserRecognitionFallback(),120);
        }
      };
      mediaRecorder.start(200);
    }catch(e){
      cleanupMonitor();mediaStream?.getTracks().forEach(t=>t.stop());
      if(e?.name==='NotAllowedError'){setVoiceStatus('Microphone permission was blocked. Allow microphone access and try again.','limited');return}
      setVoiceStatus('Server microphone capture failed. Switching to device recognition…','listening');startBrowserRecognitionFallback();
    }
  }
  const guideHeader=document.querySelector('.guide-actions');
  if(guideHeader&&!$('#guide-language')){
    const voice=document.createElement('select');voice.id='guide-voice';voice.className='guide-language guide-voice';voice.title='Voice preference';voice.setAttribute('aria-label','Voice preference');voice.innerHTML='<option value="auto">Voice: Auto</option><option value="female">Voice: Female</option><option value="male">Voice: Male</option>';
    const savedVoice=localStorage.getItem('superpro_voice_preference');if(['auto','female','male'].includes(savedVoice))voice.value=savedVoice;
    const select=document.createElement('select');select.id='guide-language';select.className='guide-language';select.title='Reply and voice-input language';select.setAttribute('aria-label','Reply language');select.innerHTML='<option value="auto">Auto language</option><option value="en">English</option><option value="ur">Urdu</option><option value="hi">Hindi</option><option value="pa">Punjabi</option><option value="ar">Arabic</option><option value="zh">Chinese</option><option value="ja">Japanese</option><option value="ko">Korean</option><option value="bn">Bengali</option><option value="ta">Tamil</option><option value="es">Spanish</option><option value="fr">French</option>';
    const savedLanguage=localStorage.getItem('superpro_guide_language');if([...select.options].some(o=>o.value===savedLanguage))select.value=savedLanguage;
    guideHeader.prepend(voice);guideHeader.prepend(select);
    select.onchange=()=>{localStorage.setItem('superpro_guide_language',select.value);if(select.value==='auto'){conversationLanguage='auto';localStorage.removeItem('superpro_conversation_language');lastLanguage='en'}else lockConversationLanguage(select.value);if(recognition)recognition.lang=speechLocale(activeInputLanguage());setVoiceStatus(select.value==='auto'?'Auto language is on. Typed text and microphone audio are detected automatically using the server transcription service when available.':`Voice input and replies set to ${select.selectedOptions[0].textContent}. Super Pro will prefer a matching installed voice and otherwise request this locale from the device speech service.`,'ready')};
    voice.onchange=()=>{localStorage.setItem('superpro_voice_preference',voice.value);setVoiceStatus(`Voice preference set to ${voice.selectedOptions[0].textContent.replace('Voice: ','')}. Language matching takes priority; gender preference is applied only when the device exposes a suitable named voice.`,'ready')};
  }

  recognition=initRecognition();
  $('#voice-input').onclick=()=>{primeSpeech();stopSpeech();const selected=$('#guide-language')?.value||'auto';if(selected==='auto'){autoListen();return}if(!recognition){setVoiceStatus('Browser speech recognition is unavailable. Select Auto language to use server transcription, or type your question.','limited');return}if(listening)recognition.stop();else{recognition.lang=speechLocale(selected);recognition.start()}};
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
