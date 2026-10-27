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
    '@media(max-width:760px){.platform-notice-card>header,.platform-service-banner button{display:grid}.platform-notice-dialog{max-height:92dvh}}'
  ].join('');
  document.head.append(style);

  const bell=$('[aria-label="Notifications"]');
  if(!bell) return;

  const dialog=document.createElement('dialog');
  dialog.id='superpro-platform-notices';
  dialog.className='platform-notice-dialog';
  dialog.innerHTML='<div class="platform-notice-card"><header><div><span class="panel-kicker">NOTIFICATIONS</span><h2>Alerts & updates</h2><p>Jobs offered to you, onboarding, payments, plan reminders and product updates appear here.</p></div><button class="secondary-button compact" type="button" data-notice-close>Close</button></header><form class="notification-preferences"><label><input type="checkbox" name="muted"> Mute alerts</label><label><input type="checkbox" name="sound"> Sound</label><label><input type="checkbox" name="sms" checked> Urgent SMS alerts</label><button type="button" data-enable-browser>Enable browser notifications</button><button type="submit">Save preferences</button><span data-preferences-status role="status"></span></form><nav class="notification-tabs"><button type="button" data-alert-tab>Alerts</button><button type="button" data-delivery-tab hidden>Delivery activity</button></nav><div class="delivery-activity" hidden></div><div class="platform-notice-list" data-platform-notice-list><p class="muted">Loading notices…</p></div></div>';
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
  const prefs={muted:false,sound:false,browser:false,sms:true};window.SuperProNotificationSettings=prefs;
  const preferenceForm=dialog.querySelector('.notification-preferences'),preferenceStatus=dialog.querySelector('[data-preferences-status]');
  function syncPreferences(){for(const key of ['muted','sound','sms'])preferenceForm.elements[key].checked=prefs[key];preferenceForm.querySelector('[data-enable-browser]').textContent=prefs.browser?'Disable browser notifications':'Enable browser notifications'}
  async function savePreferences(){const d=await api('/api/saas/notification-preferences',{method:'PUT',body:JSON.stringify(prefs)});Object.assign(prefs,d.preferences);syncPreferences()}
  preferenceForm.onsubmit=async e=>{e.preventDefault();for(const key of ['muted','sound','sms'])prefs[key]=preferenceForm.elements[key].checked;try{await savePreferences();preferenceStatus.textContent='Preferences saved.'}catch(e){preferenceStatus.textContent=e.message}};
  preferenceForm.querySelector('[data-enable-browser]').onclick=async()=>{if(!('Notification' in window)){preferenceStatus.textContent='Browser notifications are unavailable on this device.';return}try{prefs.browser=prefs.browser?false:(await Notification.requestPermission())==='granted';await savePreferences();preferenceStatus.textContent=prefs.browser?'Browser notifications enabled while the app is open.':'Browser notifications are off.'}catch(e){preferenceStatus.textContent=e.message}};
  function notifyFresh(alert){if(prefs.muted||(alert.kind==='staff_chat_message'&&document.querySelector('#gds-staff-chat')?.dataset.state==='normal'))return;window.GDSLive?.push?.(alert.title,'success');if(prefs.browser&&window.Notification?.permission==='granted'&&document.hidden)new Notification('Super Pro AI Office Manager',{body:alert.title,tag:alert.id});if(prefs.sound){try{const C=window.AudioContext||window.webkitAudioContext,c=new C(),o=c.createOscillator(),g=c.createGain();o.connect(g);g.connect(c.destination);g.gain.value=.025;o.frequency.value=660;o.start();o.stop(c.currentTime+.12);o.onended=()=>c.close()}catch{}}}
  const deliveryBox=dialog.querySelector('.delivery-activity');let deliveryActive=false;
  async function loadDelivery(){try{const d=await api('/api/saas/message-delivery');deliveryBox.innerHTML='<h3>Delivery & follow-ups</h3><p>Accepted means the provider queued it. Delivery and email-open signals require signed provider webhooks. Email opens can be blocked; SMS read status is unavailable.</p>'+(!d.receipt_configuration?.email?'<p>Email receipt webhook needs configuration. Accepted emails remain pending until provider evidence arrives.</p>':'')+(window.GDS_SESSION?.user?.role==='owner'?'<label><input type="checkbox" data-followups '+(d.follow_ups?'checked':'')+'> Automatic 24-hour follow-ups for eligible invitations and approved customer emails</label>':'')+(d.deliveries.length?d.deliveries.map(x=>'<article class="platform-notice-item"><b>'+esc(x.subject)+'</b><p>'+esc(x.channel.toUpperCase()+' · '+x.recipient)+'</p><span class="status-pill">'+esc(x.status==='opened'?'Opened (tracking signal)':x.status)+'</span><small>'+esc(fmt(x.created_at))+(x.replied_at?' · Reply received '+esc(fmt(x.replied_at)):'')+'</small>'+(x.follow_up_state?'<small>Follow-up: '+esc(x.follow_up_state.replaceAll('_',' '))+'</small>':'')+(x.detail?'<small>'+esc(x.detail)+'</small>':'')+'</article>').join(''):'<p>No outbound deliveries recorded yet.</p>');deliveryBox.querySelector('[data-followups]')?.addEventListener('change',async e=>{try{await api('/api/saas/message-delivery/settings',{method:'PUT',body:JSON.stringify({follow_ups:e.target.checked})})}catch(err){e.target.checked=!e.target.checked;preferenceStatus.textContent=err.message}})}catch(e){deliveryBox.textContent=e.message}}
  dialog.querySelector('[data-alert-tab]').onclick=()=>{deliveryActive=false;deliveryBox.hidden=true;list.hidden=false};
  dialog.querySelector('[data-delivery-tab]').onclick=()=>{deliveryActive=true;list.hidden=true;deliveryBox.hidden=false;loadDelivery()};
  list.addEventListener('click',e=>{const b=e.target.closest('[data-alert-open]');if(!b)return;const a=alerts.find(x=>x.id===b.dataset.alertOpen);if(!a)return;if(a.link==='#staff-chat')window.SuperProStaffChat?.open();else if(a.link==='#delivery'){deliveryActive=true;list.hidden=true;deliveryBox.hidden=false;loadDelivery();return}else if(a.link?.startsWith('#'))location.hash=a.link;dialog.close()});

  const alertHtml=()=>alerts.length?'<h3>For you</h3>'+alerts.map(a=>'<article class="platform-notice-item '+(a.read_at?'read':'unread')+'"><div class="platform-notice-meta"><span>'+esc(String(a.kind).replaceAll('_',' '))+'</span><span>'+esc(fmt(a.created_at))+'</span></div><h3>'+esc(a.title)+'</h3>'+(a.link?'<button type="button" class="secondary-button compact" data-alert-open="'+esc(a.id)+'">Open</button>':'')+(a.body?'<p>'+esc(a.body)+'</p>':'')+'</article>').join('')+'<h3>Platform updates</h3>':'';
  function render(rows){
    const unread=rows.filter(x=>!x.read).length+alertUnread;
    bell.dataset.unreadCount=String(unread);
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
      if(Date.now()-announcementAt>60000){const d=await api('/api/saas/announcements');announcementRows=d.announcements||[];announcementAt=Date.now()}
      const rows=announcementRows;
      const mine=await api('/api/saas/notifications').catch(()=>({notifications:[],unread:0}));
      const freshAlert=mine.notifications.find(n=>!n.read_at&&(!alerts.length||!alerts.some(o=>o.id===n.id)));
      alerts=mine.notifications||[];alertUnread=Number(mine.unread||0);if(mine.preferences){Object.assign(prefs,mine.preferences);if(!preferenceForm.contains(document.activeElement))syncPreferences()}
      dialog.querySelector('[data-delivery-tab]').hidden=!['owner','admin'].includes(window.GDS_SESSION?.user?.role);
      render(rows);
      if(showToast&&freshAlert&&bootstrapped)notifyFresh(freshAlert);bootstrapped=true;
      const unread=rows.filter(x=>!x.read).length;
      if(showToast && !prefs.muted && unread>prev){
        const newest=rows.find(x=>!x.read);
        if(newest) window.GDSLive?.push?.((newest.kind==='maintenance'?'Scheduled maintenance':newest.kind==='incident'?'Service notice':'Platform update')+': '+newest.title,newest.severity==='critical'?'error':'success');
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
  setInterval(()=>{if(!document.hidden||prefs.browser){load(true);if(!document.hidden&&dialog.open&&deliveryActive)loadDelivery()}},5000);
  window.addEventListener('focus',()=>load(true));

  window.SuperProPlatformNotices={load,open:()=>dialog.showModal()};
})();