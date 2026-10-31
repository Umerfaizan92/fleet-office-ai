(() => {
  if (window.SuperProPlatformNotices) return;
  const $ = s => document.querySelector(s);
  const esc = v => String(v ?? '').replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
  const api = async (url,opt={}) => {
    const r = await fetch(url,{credentials:'same-origin',headers:{'content-type':'application/json',...(opt.headers||{})},...opt});
    const d = await r.json().catch(()=>({}));
    if(!r.ok) throw new Error(d.error || 'The requested action could not be completed.');
    return d;
  };

  const style=document.createElement('style');
  style.textContent=[
    '.platform-notice-dialog{width:min(760px,calc(100vw - 24px));max-height:86dvh;padding:0;border:1px solid rgba(255,255,255,.1);border-radius:20px;background:#0d131b;color:#eef2f7}',
    '.platform-notice-dialog::backdrop{background:rgba(0,0,0,.68);backdrop-filter:blur(4px)}',
    '.platform-notice-card{display:grid;gap:16px;padding:20px}.platform-notice-card>header{display:flex;justify-content:space-between;gap:16px;align-items:flex-start}',
    '.platform-notice-card h2{margin:4px 0 6px}.platform-notice-card p{color:#9aa5b4;line-height:1.55}',
    '.platform-notice-list{display:grid;gap:10px;max-height:62dvh;overflow:auto}',
    '.platform-notice-item{padding:14px;border:1px solid rgba(255,255,255,.08);border-radius:14px;background:#111923}',
    '.platform-notice-item.unread{border-color:rgba(232,190,105,.45);box-shadow:inset 3px 0 0 #e8be69}',
    '.platform-notice-item.warning,.platform-notice-item.critical{border-color:rgba(239,174,114,.45)}',
    '.platform-notice-meta{display:flex;justify-content:space-between;gap:10px;text-transform:uppercase;font-size:12px;color:#d8b465}',
    '.platform-notice-item h3{margin:8px 0 6px}.platform-notice-item small{display:block;margin:8px 0;color:#8c98a8}',
    '.platform-notice-item details{margin:10px 0;padding:10px;border-radius:10px;background:#0b1118}',
    '.platform-notice-item summary{cursor:pointer;font-weight:800}',
    '.platform-service-banner{position:sticky;top:0;z-index:80;background:#2a2112;border-bottom:1px solid rgba(232,190,105,.35)}',
    '.platform-service-banner button{display:flex;width:100%;gap:10px;align-items:center;padding:10px 18px;border:0;background:transparent;color:#f4e6c3;text-align:left;cursor:pointer}',
    '.platform-service-banner span{font-size:12px;opacity:.85}',
    '.platform-notice-card{gap:12px;padding:16px}.platform-notice-card>header{align-items:center}.platform-notice-card>header h2{margin:0;font-size:1.15rem}',
    '.notice-close{min-width:40px;min-height:40px;border:1px solid rgba(255,255,255,.12);border-radius:12px;background:transparent;color:#eef2f7;font-size:20px;line-height:1;cursor:pointer}',
    '.notice-count{margin-left:8px;padding:2px 8px;border-radius:999px;background:#e8be69;color:#1a1308;font-size:12px;font-weight:800}',
    '.notice-prefs{display:flex;flex-wrap:wrap;align-items:center;gap:6px;margin:0;padding:8px 0 0;border:0;border-top:1px solid rgba(255,255,255,.08);border-radius:0;background:none}',
    '.notice-prefs button{min-height:30px;padding:3px 10px;border:1px solid rgba(255,255,255,.14);border-radius:999px;background:transparent;color:#c7d0dc;font-size:12px;font-weight:700;cursor:pointer}',
    '.notice-prefs button[aria-pressed=true]{border-color:#e8be69;color:#e8be69;background:rgba(232,190,105,.1)}',
    '.notice-prefs [data-preferences-status]{flex:1 0 100%;min-height:0;color:#8c98a8;font-size:11px}',
    '.notice-device{display:flex;flex-wrap:wrap;align-items:center;gap:8px;padding:10px 12px;border:1px solid rgba(232,190,105,.35);border-radius:14px;background:#1a1710;color:#f4e6c3;font-size:13px}',
    '.notice-device b{flex:1 1 180px}.notice-device button{min-height:32px;padding:4px 12px;border-radius:999px;border:1px solid #e8be69;background:#e8be69;color:#1a1308;font-weight:800;cursor:pointer}.notice-device button+button{background:transparent;color:#f4e6c3;border-color:rgba(255,255,255,.2)}',
    '.notice-device-toast{position:fixed;z-index:120;left:50%;bottom:max(16px,env(safe-area-inset-bottom));transform:translateX(-50%);width:min(520px,calc(100vw - 24px));box-shadow:0 18px 50px rgba(0,0,0,.45)}',
    '.notification-tabs{display:flex;gap:6px}.notification-tabs button{min-height:32px;padding:4px 12px;border-radius:999px;border:1px solid rgba(255,255,255,.12);background:transparent;color:#c7d0dc;font-size:12px;font-weight:700}',
    '@media(max-width:760px){.platform-notice-card>header{display:flex}.platform-service-banner button{display:grid}.platform-notice-dialog{max-height:92dvh}}'
  ].join('');
  document.head.append(style);

  const bell=$('[aria-label="Notifications"]');
  if(!bell) return;

  const dialog=document.createElement('dialog');
  dialog.id='superpro-platform-notices';
  dialog.className='platform-notice-dialog';
  dialog.innerHTML='<div class="platform-notice-card"><header><h2>Notifications<span class="notice-count" data-notice-count hidden></span></h2><button class="notice-close" type="button" data-notice-close aria-label="Close notifications">×</button></header><div class="notice-device" data-device-prompt hidden><b>Turn on alerts for this device</b><button type="button" data-device-allow>Allow</button></div><nav class="notification-tabs" data-notice-tabs hidden><button type="button" data-alert-tab>Alerts</button><button type="button" data-delivery-tab hidden>Delivery activity</button></nav><div class="delivery-activity" hidden></div><div class="platform-notice-list" data-platform-notice-list><p class="muted">Loading notices…</p></div><div class="notice-prefs" role="group" aria-label="Notification settings"><button type="button" data-pref="muted" aria-pressed="false">Mute</button><button type="button" data-pref="sound" aria-pressed="true">Sound</button><button type="button" data-pref="sms" aria-pressed="true" title="Text me about urgent alerts">SMS</button><button type="button" data-enable-browser aria-pressed="false">This device</button><span data-preferences-status role="status"></span></div></div>';
  document.body.append(dialog);
  dialog.querySelector('[data-notice-close]').onclick=()=>dialog.close();

  const list=dialog.querySelector('[data-platform-notice-list]');
  const dot=bell.querySelector('.notification-dot');
  const fmt=value=>{
    if(!value) return '';
    const d=new Date(value);
    return Number.isNaN(d.getTime())?String(value):d.toLocaleString();
  };

  let alerts=[],alertUnread=0,bootstrapped=false,announcementRows=[],announcementAt=0;
  const prefs={muted:false,sound:true,browser:false,sms:true};window.SuperProNotificationSettings=prefs;
  const preferenceForm=dialog.querySelector('.notice-prefs'),preferenceStatus=dialog.querySelector('[data-preferences-status]');
  const deviceButton=preferenceForm.querySelector('[data-enable-browser]'),devicePrompt=dialog.querySelector('[data-device-prompt]');
  const canNotify=()=>'Notification' in window;
  function syncPreferences(){
    for(const b of preferenceForm.querySelectorAll('[data-pref]'))b.setAttribute('aria-pressed',String(Boolean(prefs[b.dataset.pref])));
    const on=prefs.browser&&canNotify()&&Notification.permission==='granted';deviceButton.setAttribute('aria-pressed',String(on));deviceButton.hidden=!canNotify();
    devicePrompt.hidden=!(canNotify()&&Notification.permission==='default');
  }
  async function savePreferences(){const d=await api('/api/saas/notification-preferences',{method:'PUT',body:JSON.stringify(prefs)});Object.assign(prefs,d.preferences);syncPreferences()}
  const say=(t)=>{preferenceStatus.textContent=t;clearTimeout(say.t);say.t=setTimeout(()=>{preferenceStatus.textContent=''},3000)};
  // Each toggle saves immediately; no separate Save button.
  preferenceForm.addEventListener('click',async e=>{const b=e.target.closest('[data-pref]');if(!b)return;const key=b.dataset.pref,before=prefs[key];prefs[key]=!before;syncPreferences();try{await savePreferences();say(key==='muted'?(prefs.muted?'Alerts muted.':'Alerts on.'):key==='sound'?(prefs.sound?'Sound on.':'Sound off.'):(prefs.sms?'Urgent SMS on.':'Urgent SMS off.'))}catch(err){prefs[key]=before;syncPreferences();say(err.message)}});
  async function enableDevice(){if(!canNotify()){say('Alerts are not available in this browser.');return false}
    try{const granted=(await Notification.requestPermission())==='granted';prefs.browser=granted;await savePreferences();say(granted?'Alerts on for this device.':'Alerts were not allowed. You can allow them in the browser settings.');return granted}catch(err){say(err.message);return false}}
  deviceButton.onclick=async()=>{if(prefs.browser&&Notification.permission==='granted'){prefs.browser=false;await savePreferences().catch(()=>{});say('Alerts off for this device.')}else await enableDevice()};
  dialog.querySelector('[data-device-allow]').onclick=()=>enableDevice();
  // Ask once per device (and on first launch of the installed app) to allow alerts. Needs a tap, so it is a small prompt.
  const seenKey='superpro-alert-prompt-v1';const seen=()=>{try{return localStorage.getItem(seenKey)==='1'}catch{return true}};const markSeen=()=>{try{localStorage.setItem(seenKey,'1')}catch{}};
  function devicePromptToast(force=false){
    if(!canNotify()||Notification.permission!=='default'||(!force&&seen())||document.querySelector('.notice-device-toast'))return;
    const t=document.createElement('div');t.className='notice-device notice-device-toast';t.setAttribute('role','dialog');t.setAttribute('aria-label','Turn on alerts');
    t.innerHTML='<b>Turn on alerts so you hear about jobs, payments and approvals.</b><button type="button">Allow</button><button type="button">Not now</button>';
    const [allow,later]=t.querySelectorAll('button');allow.onclick=async()=>{markSeen();t.remove();await enableDevice()};later.onclick=()=>{markSeen();t.remove()};document.body.append(t);
  }
  window.addEventListener('appinstalled',()=>setTimeout(()=>devicePromptToast(true),800));
  const chime=()=>{try{const C=window.AudioContext||window.webkitAudioContext,c=new C(),g=c.createGain();g.connect(c.destination);g.gain.value=.05;[[880,0],[1175,.13]].forEach(([f,at])=>{const o=c.createOscillator();o.frequency.value=f;o.type='sine';o.connect(g);o.start(c.currentTime+at);o.stop(c.currentTime+at+.14)});setTimeout(()=>c.close(),600)}catch{}};
  async function systemNotify(title,body,tag){if(!(prefs.browser&&canNotify()&&Notification.permission==='granted'&&document.hidden))return;try{const reg=await navigator.serviceWorker?.getRegistration?.();if(reg?.showNotification){await reg.showNotification(title,{body,tag,icon:'/saas/superpro-icon-192.png',badge:'/saas/superpro-icon-192.png'});return}}catch{}try{new Notification(title,{body,tag,icon:'/saas/superpro-icon-192.png'})}catch{}}
  function announce(text,kind='success',tag=''){if(prefs.muted)return;window.GDSLive?.push?.(text,kind);systemNotify('Super Pro AI Office Manager',text,tag||text);if(prefs.sound)chime()}
  function notifyFresh(alert){if(prefs.muted||(alert.kind==='staff_chat_message'&&document.querySelector('#gds-staff-chat')?.dataset.state==='normal'))return;announce(alert.title,'success',alert.id)}
  const deliveryBox=dialog.querySelector('.delivery-activity');let deliveryActive=false;
  async function loadDelivery(){try{const d=await api('/api/saas/message-delivery');deliveryBox.innerHTML='<h3>Delivery & follow-ups</h3><p>Accepted means the provider queued it. Delivery and email-open signals require signed provider webhooks. Email opens can be blocked; SMS read status is unavailable.</p>'+(!d.receipt_configuration?.email?'<p>Email receipt webhook needs configuration. Accepted emails remain pending until provider evidence arrives.</p>':'')+(window.GDS_SESSION?.user?.role==='owner'?'<label><input type="checkbox" data-followups '+(d.follow_ups?'checked':'')+'> Automatic 24-hour follow-ups for eligible invitations and approved customer emails</label>':'')+(d.deliveries.length?d.deliveries.map(x=>'<article class="platform-notice-item"><b>'+esc(x.subject)+'</b><p>'+esc(x.channel.toUpperCase()+' · '+x.recipient)+'</p><span class="status-pill">'+esc(x.status==='opened'?'Opened (tracking signal)':x.status)+'</span><small>'+esc(fmt(x.created_at))+(x.replied_at?' · Reply received '+esc(fmt(x.replied_at)):'')+'</small>'+(x.follow_up_state?'<small>Follow-up: '+esc(x.follow_up_state.replaceAll('_',' '))+'</small>':'')+(x.detail?'<small>'+esc(x.detail)+'</small>':'')+'</article>').join(''):'<p>No outbound deliveries recorded yet.</p>');deliveryBox.querySelector('[data-followups]')?.addEventListener('change',async e=>{try{await api('/api/saas/message-delivery/settings',{method:'PUT',body:JSON.stringify({follow_ups:e.target.checked})})}catch(err){e.target.checked=!e.target.checked;preferenceStatus.textContent=err.message}})}catch(e){deliveryBox.textContent=e.message}}
  dialog.querySelector('[data-alert-tab]').onclick=()=>{deliveryActive=false;deliveryBox.hidden=true;list.hidden=false};
  dialog.querySelector('[data-delivery-tab]').onclick=()=>{deliveryActive=true;list.hidden=true;deliveryBox.hidden=false;loadDelivery()};
  list.addEventListener('click',e=>{const b=e.target.closest('[data-alert-open]');if(!b)return;const a=alerts.find(x=>x.id===b.dataset.alertOpen);if(!a)return;if(a.link==='#staff-chat')window.SuperProStaffChat?.open();else if(a.link==='#delivery'){deliveryActive=true;list.hidden=true;deliveryBox.hidden=false;loadDelivery();return}else if(a.link?.startsWith('#'))location.hash=a.link;dialog.close()});

  const alertHtml=()=>alerts.length?'<h3>For you</h3>'+alerts.map(a=>'<article class="platform-notice-item '+(a.read_at?'read':'unread')+'"><div class="platform-notice-meta"><span>'+esc(String(a.kind).replaceAll('_',' '))+'</span><span>'+esc(fmt(a.created_at))+'</span></div><h3>'+esc(a.title)+'</h3>'+(a.link?'<button type="button" class="secondary-button compact" data-alert-open="'+esc(a.id)+'">Open</button>':'')+(a.body?'<p>'+esc(a.body)+'</p>':'')+'</article>').join('')+'<h3>Platform updates</h3>':'';
  function render(rows){
    const unread=rows.filter(x=>!x.read).length+alertUnread;
    bell.dataset.unreadCount=String(unread);
    const count=dialog.querySelector('[data-notice-count]');count.textContent=String(unread);count.hidden=unread===0;
    if(dot) dot.hidden=unread===0;
    if(!rows.length){
      list.innerHTML=alertHtml()+'<div class="gov-empty">No platform notices at the moment.</div>';
      return;
    }
    list.innerHTML=alertHtml()+rows.map(row=>{
      const timing=[
        row.starts_at ? 'Starts '+fmt(row.starts_at) : '',
        row.expected_end_at ? 'Expected '+fmt(row.expected_end_at) : '',
        row.resolved_at ? 'Resolved '+fmt(row.resolved_at) : ''
      ].filter(Boolean).join(' · ');
      return '<article class="platform-notice-item '+(row.read?'read':'unread')+' '+esc(row.severity||'info')+'">'+
        '<div class="platform-notice-meta"><span>'+esc(String(row.kind||'notice').replaceAll('_',' '))+'</span><code>'+esc(row.reference_code)+'</code></div>'+
        '<h3>'+esc(row.title)+'</h3>'+
        '<p>'+esc(row.message)+'</p>'+
        (timing?'<small>'+esc(timing)+'</small>':'')+
        (row.before_summary?'<details><summary>What was happening before</summary><p>'+esc(row.before_summary)+'</p></details>':'')+
        (row.after_summary?'<details><summary>What changed / current state</summary><p>'+esc(row.after_summary)+'</p></details>':'')+
        (row.read?'':'<button class="secondary-button compact" type="button" data-platform-read="'+esc(row.id)+'">Mark as read</button>')+
      '</article>';
    }).join('');
    list.querySelectorAll('[data-platform-read]').forEach(btn=>btn.onclick=async()=>{
      try{
        await api('/api/saas/announcements/'+encodeURIComponent(btn.dataset.platformRead)+'/read',{method:'POST',body:'{}'});
        announcementAt=0;await load(false);
      }catch(err){window.GDSLive?.push?.(err.message,'error')}
    });
  }

  async function load(showToast=true){
    try{
      const prev=Number(bell.dataset.unreadCount||0);
      if(Date.now()-announcementAt>15000){const d=await api('/api/saas/announcements');announcementRows=d.announcements||[];announcementAt=Date.now()}
      const rows=announcementRows;
      const mine=await api('/api/saas/notifications').catch(()=>({notifications:[],unread:0}));
      const freshAlert=mine.notifications.find(n=>!n.read_at&&(!alerts.length||!alerts.some(o=>o.id===n.id)));
      alerts=mine.notifications||[];alertUnread=Number(mine.unread||0);if(mine.preferences){Object.assign(prefs,mine.preferences);if(!preferenceForm.contains(document.activeElement))syncPreferences()}
      dialog.querySelector('[data-delivery-tab]').hidden=!['owner','admin'].includes(window.GDS_SESSION?.user?.role);
      dialog.querySelector('[data-notice-tabs]').hidden=dialog.querySelector('[data-delivery-tab]').hidden;
      render(rows);
      if(showToast&&freshAlert&&bootstrapped)notifyFresh(freshAlert);bootstrapped=true;
      const unread=rows.filter(x=>!x.read).length;
      if(showToast && !prefs.muted && unread>prev){
        const newest=rows.find(x=>!x.read);
        if(newest) announce((newest.kind==='maintenance'?'Scheduled maintenance':newest.kind==='incident'?'Service notice':'Platform update')+': '+newest.title,newest.severity==='critical'?'error':'success',newest.id);
      }
      const active=rows.find(x=>!x.read && ['maintenance','incident','degraded_service'].includes(x.kind) && x.status!=='resolved');
      let banner=$('#superpro-service-banner');
      if(active){
        if(!banner){
          banner=document.createElement('div');
          banner.id='superpro-service-banner';
          banner.className='platform-service-banner';
          $('.app-main')?.prepend(banner);
        }
        const eta=active.expected_end_at?' · Expected '+fmt(active.expected_end_at):'';
        banner.innerHTML='<button type="button"><b>'+esc(active.title)+'</b><span>'+esc(active.message+eta)+'</span></button>';
        banner.querySelector('button').onclick=()=>dialog.showModal();
      }else if(banner) banner.remove();
    }catch{}
  }

  bell.onclick=async()=>{await load(false);dialog.showModal();if(alertUnread){await api('/api/saas/notifications/read',{method:'POST',body:JSON.stringify({ids:alerts.filter(a=>!a.read_at).map(a=>a.id)})}).catch(()=>{});setTimeout(()=>load(false),1500)}};
  setTimeout(()=>load(true),1200);
  setTimeout(()=>{syncPreferences();devicePromptToast(matchMedia('(display-mode: standalone)').matches&&!seen())},4000);
  setInterval(()=>{if(!document.hidden||prefs.browser){load(true);if(!document.hidden&&dialog.open&&deliveryActive)loadDelivery()}},5000);
  window.addEventListener('focus',()=>load(true));

  window.SuperProPlatformNotices={load,open:()=>dialog.showModal()};
})();