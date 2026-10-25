/* Ask-anything command bar for the workspace home: type, speak, listen, and see what is happening.
   Uses the existing AI assistant form; nothing is sent without the person pressing Send or finishing a spoken request. */
(function(){
  'use strict';
  const view=document.getElementById('dashboard-view');if(!view||document.getElementById('sp-askbar'))return;
  const Rec=window.SpeechRecognition||window.webkitSpeechRecognition;
  const bar=document.createElement('section');bar.id='sp-askbar';bar.className='sp-askbar';bar.setAttribute('aria-label','Ask Super Pro');
  bar.innerHTML=`<div class="sp-ask-head"><h2>What would you like done today?</h2><p class="sp-ask-status" role="status" aria-live="polite"><span class="pulse-dot"></span><span data-ask-state>Ready</span></p></div>
  <form class="sp-ask-form" autocomplete="off"><label class="sr-only" for="sp-ask-input">Ask Super Pro</label>
  <input id="sp-ask-input" type="text" placeholder="Type a request, or press the microphone and speak" maxlength="2000"/>
  <button type="button" class="sp-ask-mic" aria-pressed="false" aria-label="Speak your request" title="Speak your request"${Rec?'':' disabled'}><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></svg><span>${Rec?'Speak':'Voice unavailable'}</span></button>
  <button type="submit" class="primary-button sp-ask-send">Send</button></form>
  <div class="sp-ask-chips" role="group" aria-label="Quick requests"><button type="button" data-q="What needs my attention today?">What needs attention today</button><button type="button" data-q="Draft replies to new enquiries for my approval.">Draft replies for approval</button><button type="button" data-q="Which workers have compliance documents expiring soon?">Expiring compliance</button><button type="button" data-q="Summarise this week's jobs and income.">This week's jobs and income</button></div>`;
  const first=view.firstElementChild;view.insertBefore(bar,first);
  const state=bar.querySelector('[data-ask-state]'),dot=bar.querySelector('.pulse-dot'),input=bar.querySelector('#sp-ask-input'),mic=bar.querySelector('.sp-ask-mic'),form=bar.querySelector('form');
  const set=(text,kind)=>{state.textContent=text;dot.className='pulse-dot'+(kind?' '+kind:'')};
  function send(text){
    text=String(text||'').trim();if(!text)return;
    const go=document.createElement('button');go.hidden=true;go.dataset.jump='assistant';document.body.appendChild(go);go.click();go.remove();
    setTimeout(()=>{
      const f=document.getElementById('assistant-form'),t=f&&f.querySelector('textarea[name="message"]');
      if(!t){set('Open the AI page to continue','warn');return}
      t.value=text;t.dispatchEvent(new Event('input',{bubbles:true}));
      set('Working on it','info');input.value='';
      if(f.requestSubmit)f.requestSubmit();else f.dispatchEvent(new Event('submit',{cancelable:true,bubbles:true}));
      setTimeout(()=>set('Ready'),4000);
    },250);
  }
  form.addEventListener('submit',e=>{e.preventDefault();send(input.value)});
  bar.querySelectorAll('[data-q]').forEach(b=>b.addEventListener('click',()=>send(b.dataset.q)));
  if(Rec){
    let rec=null,listening=false,heard='';
    const stop=()=>{listening=false;mic.setAttribute('aria-pressed','false');mic.classList.remove('is-listening')};
    mic.addEventListener('click',()=>{
      if(listening&&rec){rec.stop();return}
      rec=new Rec();rec.lang=document.documentElement.lang||'en-AU';rec.interimResults=true;rec.continuous=false;heard='';
      rec.onstart=()=>{listening=true;mic.setAttribute('aria-pressed','true');mic.classList.add('is-listening');set('Listening… speak now','warn')};
      rec.onresult=ev=>{heard=Array.from(ev.results).map(r=>r[0].transcript).join(' ');input.value=heard};
      rec.onerror=ev=>{stop();set(ev.error==='not-allowed'?'Microphone blocked. Allow it in the browser address bar.':'Could not hear you. Try again.','warn')};
      rec.onend=()=>{const had=listening;stop();if(had&&heard.trim()){set('Heard you. Check the text, then press Send.')}else if(had){set('Ready')}};
      try{rec.start()}catch{set('Microphone is busy. Try again.','warn')}
    });
  }
  try{const synth=window.speechSynthesis;if(synth&&!synth.__spWrapped){const orig=synth.speak.bind(synth);synth.speak=u=>{const emit=on=>window.dispatchEvent(new CustomEvent('superpro:speaking',{detail:{on}}));u.addEventListener('start',()=>emit(true));u.addEventListener('end',()=>emit(false));u.addEventListener('error',()=>emit(false));return orig(u)};synth.__spWrapped=true}}catch{}
  window.addEventListener('superpro:speaking',e=>set(e.detail&&e.detail.on?'Speaking':'Ready',e.detail&&e.detail.on?'info':''));
})();
