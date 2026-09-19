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
    '.platform-notice-meta{display:flex;justify-content:space-between;gap:10px;text-transform:uppercase;font-size:10px;color:#d8b465}',
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
  dialog.innerHTML='<div class="platform-notice-card"><header><div><span class="panel-kicker">PLATFORM UPDATES</span><h2>Updates & service notices</h2><p>Scheduled maintenance, temporary issues and completed product changes appear here.</p></div><button class="secondary-button compact" type="button" data-notice-close>Close</button></header><div class="platform-notice-list" data-platform-notice-list><p class="muted">Loading notices…</p></div></div>';
  document.body.append(dialog);
  dialog.querySelector('[data-notice-close]').onclick=()=>dialog.close();

  const list=dialog.querySelector('[data-platform-notice-list]');
  const dot=bell.querySelector('.notification-dot');
  const fmt=value=>{
    if(!value) return '';
    const d=new Date(value);
    return Number.isNaN(d.getTime())?String(value):d.toLocaleString();
  };

  function render(rows){
    const unread=rows.filter(x=>!x.read).length;
    bell.dataset.unreadCount=String(unread);
    if(dot) dot.hidden=unread===0;
    if(!rows.length){
      list.innerHTML='<div class="gov-empty">No platform notices at the moment.</div>';
      return;
    }
    list.innerHTML=rows.map(row=>{
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
        await load(false);
      }catch(err){window.GDSLive?.push?.(err.message,'error')}
    });
  }

  async function load(showToast=true){
    try{
      const prev=Number(bell.dataset.unreadCount||0);
      const d=await api('/api/saas/announcements');
      const rows=d.announcements||[];
      render(rows);
      const unread=Number(d.unread||0);
      if(showToast && unread>prev){
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

  bell.onclick=async()=>{await load(false);dialog.showModal()};
  setTimeout(()=>load(true),1200);
  setInterval(()=>load(true),60000);

  window.SuperProPlatformNotices={load,open:()=>dialog.showModal()};
})();