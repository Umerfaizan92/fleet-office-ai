// Omnichannel inbox: live feed, call transcript playback, AI draft requests and approval buttons.
(()=>{
  const {el,api,onView,when,role}=window.SuperProUI;
  const $=selector=>document.querySelector(selector);
  const LABEL={voice:'Call',email:'Email',sms:'SMS',whatsapp:'WhatsApp'};
  const STATE_CLASS={received:'info',draft:'info',pending_approval:'warn',approved:'ok',rejected:'bad',sending:'warn',sent:'ok',failed:'bad'};
  const STATE_TEXT={received:'Received',draft:'Draft',pending_approval:'Waiting for approval',approved:'Approved',rejected:'Rejected',sending:'Sending',sent:'Sent',failed:'Failed'};
  let timer=null,selected=null,requestId=0,lastSignature='',wired=false;
  const canManageChannels=()=>['owner','admin','super_admin'].includes(role());

  const stopSpeech=()=>{try{window.speechSynthesis?.cancel()}catch{}};
  const say=message=>{const n=$('#comms-live-label');if(n)n.textContent=message};

  function threadRow(thread){
    const button=el('button',{type:'button','aria-current':thread.id===selected?'true':'false',onclick:()=>openThread(thread.id)},
      el('span',{class:'row'},el('b',{text:thread.contact_name||thread.contact_address}),el('span',{class:'chip '+(thread.status==='needs_reply'?'warn':thread.status==='closed'?'':'info'),text:thread.status==='needs_reply'?'Needs reply':thread.status})),
      el('span',{class:'row'},el('small',{text:`${LABEL[thread.channel]||thread.channel} · ${thread.subject||thread.contact_address}`}),el('small',{text:when(thread.last_message_at)})));
    return el('li',null,button);
  }

  async function loadThreads({quiet=false}={}){
    const ticket=++requestId;
    const status=$('#comms-filter')?.value||'';
    const data=await api('/api/saas/comms/threads'+(status?`?status=${encodeURIComponent(status)}`:''));
    if(ticket!==requestId)return;
    const list=$('#comms-thread-list');if(!list)return;
    list.replaceChildren(...data.threads.map(threadRow));
    $('#comms-empty').hidden=data.threads.length>0;
    say('Updated '+new Date().toLocaleTimeString('en-AU',{timeZone:'Australia/Perth',hour:'2-digit',minute:'2-digit'}));
    if(selected&&!quiet)await openThread(selected,{keepScroll:true});
  }

  function transcriptControls(message){
    const text=message.body||message.summary||'';
    const controls=el('div',{class:'actions'});
    if(text&&'speechSynthesis' in window){
      controls.append(el('button',{type:'button',class:'secondary-button compact',onclick:()=>{stopSpeech();const u=new SpeechSynthesisUtterance(text);u.lang='en-AU';u.rate=1;window.speechSynthesis.speak(u)}},'▶ Play transcript'),
        el('button',{type:'button',class:'secondary-button compact',onclick:stopSpeech},'■ Stop'));
    }
    return controls;
  }

  async function decide(message,decision){
    try{await api(`/api/saas/approvals/${message.approval_id}/decision`,{method:'POST',body:JSON.stringify({decision})});await openThread(selected,{keepScroll:true})}
    catch(error){$('#comms-draft-feedback').textContent=error.message}
  }
  async function send(message){
    try{await api(`/api/saas/comms/messages/${message.id}/send`,{method:'POST'});$('#comms-draft-feedback').textContent='Sent.'}
    catch(error){$('#comms-draft-feedback').textContent=error.message}
    await openThread(selected,{keepScroll:true});
  }

  function messageNode(message){
    const outbound=message.direction==='outbound';
    const meta=el('div',{class:'meta'},el('span',{text:outbound?'You':'Customer'}),el('span',{text:when(message.occurred_at)}),
      message.kind==='call_log'?el('span',{class:'chip info',text:'Call'+(message.duration_seconds?` · ${Math.floor(message.duration_seconds/60)}m ${message.duration_seconds%60}s`:'')}):null,
      message.ai_generated?el('span',{class:'chip info',text:'AI draft'}):null,
      outbound?el('span',{class:'chip '+(STATE_CLASS[message.status]||''),text:STATE_TEXT[message.status]||message.status}):null);
    const node=el('div',{class:'msg'+(outbound?' out':'')},meta);
    if(message.kind==='call_log'){
      if(message.summary)node.append(el('p',{text:message.summary}));
      if(message.body&&message.body!==message.summary)node.append(el('details',null,el('summary',{text:'Transcript'}),el('pre',{text:message.body})));
      node.append(transcriptControls(message));
    }else node.append(el('p',{text:message.body}));
    const actions=el('div',{class:'actions'});
    if(outbound&&message.status==='pending_approval'&&message.approval_id)actions.append(
      el('button',{type:'button',class:'primary-button compact',onclick:()=>decide(message,'approve')},'Approve'),
      el('button',{type:'button',class:'secondary-button compact',onclick:()=>decide(message,'reject')},'Reject'));
    if(outbound&&message.status==='approved')actions.append(el('button',{type:'button',class:'primary-button compact',onclick:()=>send(message)},'Send now'));
    if(actions.childNodes.length)node.append(actions);
    return node;
  }

  async function openThread(id,{keepScroll=false}={}){
    selected=id;stopSpeech();
    const ticket=++requestId;
    const data=await api('/api/saas/comms/threads/'+encodeURIComponent(id));
    if(ticket!==requestId)return;
    const {thread,messages}=data,box=$('#comms-messages'),previous=box.scrollTop;
    $('#comms-detail-kicker').textContent=(LABEL[thread.channel]||thread.channel).toUpperCase()+' · '+thread.contact_address;
    $('#comms-detail-title').textContent=thread.contact_name||thread.subject||thread.contact_address;
    box.replaceChildren(...messages.map(messageNode));
    box.scrollTop=keepScroll?previous:box.scrollHeight;
    const close=$('#comms-close-thread');close.hidden=false;close.textContent=thread.status==='closed'?'Reopen':'Mark closed';close.dataset.next=thread.status==='closed'?'open':'closed';
    $('#comms-draft-form').hidden=thread.channel==='voice'; // calls are logged, not replied to as messages
    document.querySelectorAll('#comms-thread-list button').forEach(b=>b.setAttribute('aria-current','false'));
    lastSignature=messages.length+':'+(messages.at(-1)?.status||'');
  }

  async function loadChannels(){
    const panel=$('#comms-channels-panel');
    if(!canManageChannels()){panel.hidden=true;return}
    panel.hidden=false;
    const data=await api('/api/saas/comms/channels'),byChannel=Object.fromEntries(data.channels.map(c=>[c.channel,c]));
    $('#comms-channels').replaceChildren(...['voice','sms','whatsapp','email'].map(channel=>{
      const current=byChannel[channel];
      const input=el('input',{name:'address',value:current?.address||'',placeholder:channel==='email'?'inbox@yourbusiness.com.au':'+61400000000','aria-label':`${LABEL[channel]} address`,required:true,disabled:role()!=='owner'});
      const form=el('form',{onsubmit:async event=>{
        event.preventDefault();const note=form.querySelector('small');
        try{const r=await api('/api/saas/comms/channels/'+channel,{method:'PUT',body:JSON.stringify({address:input.value})});note.textContent=r.note||'Saved.';await loadChannels()}
        catch(error){note.textContent=error.message}
      }},
        el('span',{class:'row'},el('b',{text:LABEL[channel]}),el('span',{class:'chip '+(current?.status==='active'?'ok':current?'warn':''),text:current?(current.status==='active'?'Active':'Waiting for activation'):'Not set'})),
        input,role()==='owner'?el('button',{class:'secondary-button compact',type:'submit'},'Save address'):null,el('small',{role:'status'}));
      return form;
    }));
  }

  function wire(){
    if(wired)return;wired=true;
    $('#comms-filter')?.addEventListener('change',()=>loadThreads().catch(e=>say(e.message)));
    $('#comms-close-thread')?.addEventListener('click',async event=>{
      try{await api('/api/saas/comms/threads/'+encodeURIComponent(selected),{method:'PATCH',body:JSON.stringify({status:event.currentTarget.dataset.next})});await loadThreads()}catch(e){say(e.message)}
    });
    $('#comms-draft-form')?.addEventListener('submit',async event=>{
      event.preventDefault();
      const button=$('#comms-draft-button'),note=$('#comms-draft-feedback'),input=$('#comms-draft-instruction');
      if(!selected)return;
      button.disabled=true;note.textContent='Drafting…';
      try{
        const r=await api(`/api/saas/comms/threads/${encodeURIComponent(selected)}/draft`,{method:'POST',body:JSON.stringify({instruction:input.value.trim()||undefined})});
        note.textContent=`Draft ${r.reference_code} is waiting for approval. Nothing has been sent.`;input.value='';
        await openThread(selected,{keepScroll:false});
      }catch(error){note.textContent=error.message}
      finally{button.disabled=false}
    });
    // Pause polling while the tab is hidden; refresh immediately on return.
    document.addEventListener('visibilitychange',()=>{if(timer&&!document.hidden)refresh()});
  }
  async function refresh(){
    try{
      await loadThreads({quiet:true});
      if(selected){
        const data=await api('/api/saas/comms/threads/'+encodeURIComponent(selected)),signature=data.messages.length+':'+(data.messages.at(-1)?.status||'');
        if(signature!==lastSignature)await openThread(selected,{keepScroll:true});
      }
    }catch(error){say('Reconnecting…')}
  }

  onView('comms',{
    enter(){
      wire();
      loadThreads().catch(e=>say(e.message));loadChannels().catch(()=>{});
      clearInterval(timer);
      timer=setInterval(()=>{if(!document.hidden)refresh()},20000);
    },
    leave(){clearInterval(timer);timer=null;stopSpeech()}
  });
  window.addEventListener('pagehide',()=>{clearInterval(timer);stopSpeech()});
})();
