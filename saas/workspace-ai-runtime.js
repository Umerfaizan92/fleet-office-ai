(()=>{
  if(window.SuperProAIClient)return;

  const localeMap={en:'en-AU',ur:'ur-PK',hi:'hi-IN',pa:'pa-IN',ar:'ar-SA',zh:'zh-CN',ja:'ja-JP',ko:'ko-KR',bn:'bn-BD',ta:'ta-IN',es:'es-ES',fr:'fr-FR'};
  const speechSupported='speechSynthesis'in window&&'SpeechSynthesisUtterance'in window;
  let playbackContext=null,speechRun=0,streamController=null,streamSources=[],fallbackAudio=null,fallbackUrl='',activeCapture=null,captureRun=0;
  const playbackWaiters=new Set();

  const detectLanguage=text=>window.GDSProductGuide?.detectLanguage?.(text)||'en';
  const locale=lang=>localeMap[lang]||'en-AU';
  const cleanSpeech=text=>(window.GDSProductGuide?.cleanSpeech?.(text)||String(text||'')).replace(/https?:\/\/\S+/gi,'').replace(/\s+/g,' ').trim();

  async function ensurePlaybackContext(){
    const AC=window.AudioContext||window.webkitAudioContext;if(!AC)return null;
    try{
      if(!playbackContext)playbackContext=new AC();
      if(playbackContext.state==='suspended')await playbackContext.resume();
      return playbackContext;
    }catch{return null}
  }

  function stopSpeech(){
    speechRun++;
    for(const finish of [...playbackWaiters])finish();
    try{streamController?.abort()}catch{}streamController=null;
    for(const src of streamSources.splice(0)){try{src.onended=null;src.stop()}catch{}try{src.disconnect()}catch{}}
    if(fallbackAudio){try{fallbackAudio.pause();fallbackAudio.src=''}catch{}fallbackAudio=null}
    if(fallbackUrl){try{URL.revokeObjectURL(fallbackUrl)}catch{}fallbackUrl=''}
    if(speechSupported){try{speechSynthesis.cancel();speechSynthesis.resume?.()}catch{}}
  }

  function base64PcmToAudioBuffer(base64,ctx,sampleRate=24000){
    const binary=atob(base64),bytes=new Uint8Array(binary.length);
    for(let i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i);
    const samples=Math.floor(bytes.length/2),audio=ctx.createBuffer(1,samples,sampleRate),channel=audio.getChannelData(0);
    for(let i=0;i<samples;i++){let value=bytes[i*2]|(bytes[i*2+1]<<8);if(value&0x8000)value-=0x10000;channel[i]=Math.max(-1,Math.min(1,value/32768))}
    return audio;
  }

  function matchingBrowserVoice(lang){
    if(!speechSupported)return null;
    const target=locale(lang).toLowerCase(),family=target.split('-')[0],list=speechSynthesis.getVoices()||[];
    return list.find(v=>String(v.lang||'').toLowerCase()===target)||list.find(v=>String(v.lang||'').toLowerCase().split('-')[0]===family)||null;
  }

  async function browserSpeak(text,lang,onStatus){
    if(!speechSupported)return false;
    const voice=matchingBrowserVoice(lang);
    // Never let a device with no matching Urdu/Hindi/etc voice pronounce only
    // embedded English words and pretend that multilingual speech succeeded.
    if(lang!=='en'&&!voice){onStatus?.(`Server voice is temporarily unavailable and this device has no ${locale(lang)} voice.`,'limited');return false}
    const chunks=cleanSpeech(text).match(/.{1,210}(?:\s|$)/g)||[cleanSpeech(text)];
    const run=++speechRun;
    for(const chunk of chunks){
      if(run!==speechRun)return false;
      await new Promise(resolve=>{
        const finish=()=>{playbackWaiters.delete(finish);resolve()};playbackWaiters.add(finish);
        const u=new SpeechSynthesisUtterance(chunk.trim());u.lang=voice?.lang||locale(lang);if(voice)u.voice=voice;u.rate=.98;
        u.onstart=()=>run===speechRun&&onStatus?.(`Speaking in ${u.lang} using device fallback…`,'speaking');
        u.onend=finish;u.onerror=finish;
        try{speechSynthesis.resume?.();speechSynthesis.speak(u)}catch{finish()}
      });
    }
    return run===speechRun;
  }

  async function speak(text,lang='auto',{voice='auto',onStatus}={}){
    const spoken=cleanSpeech(text);if(!spoken)return false;
    lang=lang==='auto'?detectLanguage(spoken):lang;
    stopSpeech();const run=++speechRun,ctx=await ensurePlaybackContext();
    if(run!==speechRun)return false;

    // Primary path: authenticated Gemini streaming TTS. Start playback as soon
    // as the first PCM chunk arrives instead of waiting for a complete audio file.
    if(ctx&&typeof ReadableStream!=='undefined'){
      const controller=new AbortController();streamController=controller;
      let first=false,pending='',nextStart=Math.max(ctx.currentTime+.05,ctx.currentTime),lastEnd=nextStart;
      const firstTimer=setTimeout(()=>{if(!first)controller.abort()},7000);
      try{
        onStatus?.('Preparing live AI voice…','preparing');
        const response=await fetch('/api/saas/voice/speech-stream',{
          method:'POST',credentials:'same-origin',signal:controller.signal,
          headers:{'content-type':'application/json'},body:JSON.stringify({text:spoken,language:lang,voice})
        });
        if(response.ok&&response.body){
          const reader=response.body.getReader(),decoder=new TextDecoder();
          while(true){
            if(run!==speechRun){controller.abort();clearTimeout(firstTimer);return false}
            const {value,done}=await reader.read();if(run!==speechRun)return false;if(done)break;
            pending+=decoder.decode(value,{stream:true});
            const lines=pending.split(/\r?\n/);pending=lines.pop()||'';
            for(const line of lines){
              if(!line.trim())continue;
              let event;try{event=JSON.parse(line)}catch{continue}
              if(!event.audio)continue;
              first=true;clearTimeout(firstTimer);
              const buffer=base64PcmToAudioBuffer(event.audio,ctx,Number(event.sample_rate||24000));
              if(nextStart<ctx.currentTime+.03)nextStart=ctx.currentTime+.03;
              const src=ctx.createBufferSource();src.buffer=buffer;src.connect(ctx.destination);streamSources.push(src);
              src.onended=()=>{const i=streamSources.indexOf(src);if(i>=0)streamSources.splice(i,1);try{src.disconnect()}catch{}};
              src.start(nextStart);lastEnd=nextStart+buffer.duration;nextStart=lastEnd;
              onStatus?.(`Speaking naturally in ${locale(lang)}…`,'speaking');
            }
          }
          clearTimeout(firstTimer);
          if(first){
            while(run===speechRun&&ctx.currentTime<lastEnd-.03)await new Promise(r=>setTimeout(r,60));
            if(run===speechRun)onStatus?.('Voice reply finished.','ready');
            return run===speechRun;
          }
        }else clearTimeout(firstTimer);
      }catch{clearTimeout(firstTimer)}
    }

    if(run!==speechRun)return false;

    // Secondary path: buffered server TTS. Browser speech is the last fallback.
    try{
      const controller=new AbortController();streamController=controller;
      onStatus?.('Preparing spoken reply…','preparing');
      const response=await fetch('/api/saas/voice/speech',{
        method:'POST',credentials:'same-origin',signal:controller.signal,headers:{'content-type':'application/json'},
        body:JSON.stringify({text:spoken,language:lang,voice})
      });
      if(response.ok&&run===speechRun){
        const blob=await response.blob();if(run!==speechRun)return false;if(blob.size){
          const url=URL.createObjectURL(blob),audio=new Audio(url);
          fallbackUrl=url;fallbackAudio=audio;audio.preload='auto';
          try{
            await new Promise((resolve,reject)=>{
              const finish=()=>{playbackWaiters.delete(finish);resolve()};playbackWaiters.add(finish);
              const fail=err=>{playbackWaiters.delete(finish);reject(err)};
              audio.onplay=()=>run===speechRun&&onStatus?.(`Speaking naturally in ${locale(lang)}…`,'speaking');
              audio.onended=finish;audio.onerror=fail;
              try{audio.play().catch(fail)}catch(err){fail(err)}
            });
          }finally{
            audio.onplay=audio.onended=audio.onerror=null;
            try{audio.pause()}catch{}
            URL.revokeObjectURL(url);
            if(fallbackAudio===audio){fallbackAudio=null;fallbackUrl=''}
          }
          if(run===speechRun)onStatus?.('Voice reply finished.','ready');
          return run===speechRun;
        }
      }
    }catch{}
    if(run!==speechRun)return false;
    return browserSpeak(spoken,lang,onStatus);
  }

  function isListening(){return Boolean(activeCapture?.recorder&&activeCapture.recorder.state==='recording')}

  function stopListening(cancel=false){
    if(cancel){captureRun++;if(activeCapture){activeCapture.cancelled=true;activeCapture.controller?.abort()}}
    if(activeCapture?.recorder?.state==='recording'){
      activeCapture.manualStop=true;
      try{activeCapture.recorder.stop()}catch{}
      return true;
    }
    return false;
  }

  async function listen({language='auto',onStatus,onListening}={}){
    if(isListening()){stopListening();return {text:'',stopped:true}}
    // A stopped recorder can still own an in-flight transcription. Cancel it
    // before replacing its capture so an older result cannot update this view.
    stopSpeech();stopListening(true);const run=++captureRun;
    if(!navigator.mediaDevices?.getUserMedia||!window.MediaRecorder)throw new Error('Microphone recording is not supported in this browser.');

    const stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true,channelCount:1}});
    if(run!==captureRun){stream.getTracks().forEach(t=>t.stop());return {text:'',cancelled:true}}
    const preferred=['audio/webm;codecs=opus','audio/webm'].find(t=>MediaRecorder.isTypeSupported?.(t))||'';
    const recorder=new MediaRecorder(stream,preferred?{mimeType:preferred}:undefined),chunks=[];
    const state={recorder,stream,manualStop:false,controller:new AbortController()};activeCapture=state;

    return await new Promise((resolve,reject)=>{
      let audioContext=null,sourceNode=null,analyser=null,monitorTimer=null,noSpeechTimer=null,hardStopTimer=null;
      let speechStarted=false,silenceSince=0,voicedFrames=0,noiseFloor=.003;

      const cleanup=()=>{
        if(monitorTimer)clearInterval(monitorTimer);if(noSpeechTimer)clearTimeout(noSpeechTimer);if(hardStopTimer)clearTimeout(hardStopTimer);
        try{sourceNode?.disconnect()}catch{}try{analyser?.disconnect()}catch{}try{audioContext?.close()}catch{}
        stream.getTracks().forEach(t=>t.stop());onListening?.(false);
      };

      const release=()=>{if(activeCapture===state)activeCapture=null};

      recorder.ondataavailable=e=>{if(e.data?.size)chunks.push(e.data)};
      recorder.onerror=e=>{cleanup();release();if(state.cancelled||run!==captureRun)resolve({text:'',cancelled:true});else reject(e.error||new Error('Microphone recording failed.'))};
      recorder.onstart=()=>{
        onListening?.(true);onStatus?.('Listening… speak naturally. Normal pauses will not cut you off.','listening');
        try{
          const AC=window.AudioContext||window.webkitAudioContext;
          if(AC){
            audioContext=new AC();sourceNode=audioContext.createMediaStreamSource(stream);analyser=audioContext.createAnalyser();analyser.fftSize=1024;sourceNode.connect(analyser);
            const samples=new Uint8Array(analyser.fftSize);
            monitorTimer=setInterval(()=>{
              if(recorder.state!=='recording')return;
              analyser.getByteTimeDomainData(samples);let sum=0;
              for(const v of samples){const n=(v-128)/128;sum+=n*n}
              const rms=Math.sqrt(sum/samples.length),now=Date.now();
              if(!speechStarted&&rms<.012)noiseFloor=(noiseFloor*.88)+(rms*.12);
              const threshold=Math.min(.018,Math.max(.0055,noiseFloor*2.05));
              if(rms>threshold){
                voicedFrames++;
                if(voicedFrames>=2){if(!speechStarted)onStatus?.('I can hear you… keep speaking.','listening');speechStarted=true;silenceSince=0;if(noSpeechTimer){clearTimeout(noSpeechTimer);noSpeechTimer=null}}
              }else{
                voicedFrames=Math.max(0,voicedFrames-1);
                if(speechStarted){if(!silenceSince)silenceSince=now;if(now-silenceSince>2200)recorder.stop()}
              }
            },80);
          }
        }catch{}
        noSpeechTimer=setTimeout(()=>{if(recorder.state==='recording'&&!speechStarted)recorder.stop()},7000);
        hardStopTimer=setTimeout(()=>{if(recorder.state==='recording')recorder.stop()},45000);
      };

      recorder.onstop=async()=>{
        try{
          const blob=new Blob(chunks,{type:recorder.mimeType||'audio/webm'});cleanup();
          if(state.cancelled||run!==captureRun)return resolve({text:'',cancelled:true});
          if(blob.size<700){onStatus?.('No speech detected. Microphone stopped.','ready');return resolve({text:'',noSpeech:true})}
          onStatus?.('Understanding what you said…','transcribing');
          const fd=new FormData();fd.append('audio',blob,'speech.webm');fd.append('language',language);
          const response=await fetch('/api/saas/voice/transcribe',{method:'POST',credentials:'same-origin',signal:state.controller.signal,body:fd});
          const d=await response.json().catch(()=>({}));
          if(!response.ok)throw new Error(d.error||'Voice transcription failed.');
          if(state.cancelled||run!==captureRun)return resolve({text:'',cancelled:true});
          const text=String(d.text||'').trim();
          if(!text){onStatus?.('No speech was understood. Please try again.','ready');return resolve({text:'',noSpeech:true})}
          const result={...d,text,language:d.language||detectLanguage(text)};
          onStatus?.(`Heard ${String(result.language||'auto').toUpperCase()} · preparing reply…`,'ready');
          resolve(result);
        }catch(err){
          if(state.cancelled||run!==captureRun)return resolve({text:'',cancelled:true});
          onStatus?.(err.message||'Voice transcription failed.','limited');reject(err);
        }finally{release()}
      };
      recorder.start(120);
    });
  }

  window.addEventListener('pagehide',()=>{stopSpeech();stopListening(true)});
  window.SuperProAIClient={version:'2026-09-19.1',detectLanguage,locale,cleanSpeech,speak,stopSpeech,listen,stopListening,isListening,ensurePlaybackContext};
})();
