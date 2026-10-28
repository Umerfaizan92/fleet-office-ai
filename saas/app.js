const speakerIcon=on=>`<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M11 5 6 9H3v6h3l5 4Z"/>${on?'<path d="M15 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14"/>':'<path d="m16 9 5 6m0-6-5 6"/>'}</svg>`;
const $ = (s) => document.querySelector(s);
const $$ = (s) => document.querySelectorAll(s);
const esc = (v) => String(v ?? '').replace(/[&<>'"]/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));

const NAV = window.SuperProNav;
let viewSequence = NAV.sequence(''), currentRole = '';
const pageMeta = NAV.pageMeta();
let currentView = 'dashboard';
let noteTimer;

function enhanceShell(){
  if ($('#foai-final-style')) return;
  const style=document.createElement('style'); style.id='foai-final-style'; style.textContent=`.auth-panel-head{margin-bottom:34px}.account-choice{display:flex!important;align-items:center;justify-content:flex-end;gap:7px;margin:0 0 20px!important;padding:0!important;border:0!important;background:transparent!important}.account-choice>span{margin:0!important;color:var(--muted);font-size:12px}.auth-switch-link,.auth-alt-action button{padding:0;border:0;background:transparent;color:var(--brand-2);font-weight:800;cursor:pointer}.auth-switch-link:hover,.auth-alt-action button:hover{text-decoration:underline}.auth-alt-action{margin:2px 0 0;text-align:center;color:var(--muted);font-size:12px}.auth-alt-action button{font-size:12px}.office-preview{position:relative;z-index:1;max-width:680px;margin:0 0 auto;border:1px solid rgba(255,255,255,.09);border-radius:18px;background:rgba(13,16,21,.78);box-shadow:0 24px 80px rgba(0,0,0,.28);backdrop-filter:blur(18px);overflow:hidden}.office-preview-bar{display:flex;align-items:center;justify-content:space-between;padding:11px 14px;border-bottom:1px solid rgba(255,255,255,.07);color:#d8dee8;font-size:12px;font-weight:800;letter-spacing:.05em;text-transform:uppercase}.office-preview-bar span{display:flex;align-items:center;gap:7px}.office-preview-bar i{width:7px;height:7px;border-radius:50%;background:var(--green);box-shadow:0 0 0 4px rgba(100,215,161,.09)}.office-preview-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:1px;background:rgba(255,255,255,.06)}.office-preview-grid article{position:relative;min-height:116px;padding:16px;background:#0d1117}.office-preview-grid b{display:block;margin:7px 0 3px;font-size:13px}.office-preview-grid small{display:block;color:#818c9d;font-size:12px;line-height:1.45}.preview-label{color:#657081;font-size:12px;font-weight:900;letter-spacing:.12em}.preview-status{position:absolute;right:12px;bottom:12px;padding:4px 7px;border:1px solid rgba(217,173,89,.24);border-radius:999px;background:rgba(217,173,89,.08);color:#d9ad59;font-size:12px;font-weight:900;text-transform:uppercase}.preview-status.live{color:#6fdda8;border-color:rgba(100,215,161,.22);background:rgba(100,215,161,.08)}.preview-status.good{color:#8cc5ff;border-color:rgba(126,184,255,.22);background:rgba(126,184,255,.08)}.workspace-nav button{grid-template-columns:28px 1fr auto!important}.nav-step{display:grid;place-items:center;width:24px;height:24px;border:1px solid var(--line);border-radius:7px;background:var(--panel-2);color:var(--muted-2);font-size:12px;font-weight:900}.workspace-nav button.active .nav-step{border-color:var(--brand-line);background:var(--brand-soft);color:var(--brand-2)}.workspace-nav button>svg{display:none}.view{animation:foaiView .28s ease both}@keyframes foaiView{from{opacity:.25;transform:translateY(8px)}to{opacity:1;transform:none}}.flow-nav{position:sticky;z-index:22;bottom:0;display:grid;grid-template-columns:auto 1fr auto;align-items:center;gap:16px;margin:10px 32px 0;padding:10px 14px;border:1px solid var(--line);border-bottom:0;border-radius:14px 14px 0 0;background:color-mix(in srgb,var(--panel) 92%,transparent);box-shadow:0 -12px 40px rgba(0,0,0,.14);backdrop-filter:blur(18px)}.flow-nav>div{text-align:center}.flow-nav small{display:block;color:var(--muted-2);font-size:12px;font-weight:900;letter-spacing:.14em}.flow-nav b{display:block;color:var(--text-2);font-size:12px}.flow-nav button{min-width:110px}.trial-hero{display:grid;grid-template-columns:1fr auto;align-items:center;gap:22px;margin-bottom:18px;padding:26px}.trial-hero h2{margin:4px 0 5px;font-size:26px}.trial-hero p{margin:0;color:var(--muted)}.trial-count{display:grid;place-items:center;min-width:118px;min-height:96px;border:1px solid var(--brand-line);border-radius:16px;background:var(--brand-soft)}.trial-count strong{font-size:36px;line-height:1;color:var(--brand-2)}.trial-count span{color:var(--muted);font-size:12px}.trial-progress{grid-column:1/-1;height:6px;border-radius:999px;background:var(--panel-3);overflow:hidden}.trial-progress span{display:block;width:0;height:100%;background:linear-gradient(90deg,var(--brand),var(--brand-2));transition:width .45s}.pricing-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px;margin-bottom:18px}.pricing-card{display:flex;flex-direction:column;min-height:330px;padding:24px;border:1px solid var(--line);border-radius:16px;background:var(--panel);box-shadow:var(--shadow-sm)}.pricing-card.featured{border-color:var(--brand-line);background:linear-gradient(180deg,var(--brand-soft),var(--panel) 34%)}.pricing-tag{color:var(--brand-2);font-size:12px;font-weight:900;letter-spacing:.13em}.pricing-card h2{margin:8px 0 5px;font-size:22px}.pricing-card p{margin:0 0 14px;color:var(--muted);font-size:12px}.pricing-card ul{display:grid;gap:9px;margin:6px 0 24px;padding:0;list-style:none}.pricing-card li{position:relative;padding-left:19px;color:var(--text-2);font-size:12px}.pricing-card li:before{content:'✓';position:absolute;left:0;color:var(--green)}.pricing-card button{margin-top:auto}.billing-safety{display:flex;gap:14px;padding:20px}.billing-safety h2{margin:0 0 3px;font-size:14px}.billing-safety p{margin:0;color:var(--muted);font-size:12px}@media(max-width:1100px){.pricing-grid{grid-template-columns:1fr}.flow-nav{margin-left:18px;margin-right:18px}}@media(max-width:720px){.office-preview-grid{grid-template-columns:1fr}.office-preview-grid article{min-height:100px}.flow-nav{grid-template-columns:1fr 1fr;margin:8px 12px 0}.flow-nav>div{display:none}.trial-hero{grid-template-columns:1fr}.trial-progress{grid-column:auto}}`; document.head.appendChild(style);
  const heading=$('.auth-heading'); if(heading){heading.querySelector('h2').textContent='Create your workspace';const sub=$('#auth-subtitle');if(sub)sub.textContent='Start your secure 14-day trial. No payment is required to create the workspace.'}
  const choice=$('.account-choice'); if(choice)choice.innerHTML='<span>Already have an account?</span><button class="auth-switch-link" type="button" data-auth-switch="login">Sign in</button>';
  const reg=$('#register-form'),login=$('#login-form'); if(reg&&!reg.querySelector('.auth-alt-action'))reg.insertAdjacentHTML('beforeend','<p class="auth-alt-action">Already have an account? <button type="button" data-auth-switch="login">Sign in securely</button></p>'); if(login&&!login.querySelector('.auth-alt-action'))login.insertAdjacentHTML('beforeend','<p class="auth-alt-action">Don\'t have an account? <button type="button" data-auth-switch="register">Join workspace</button></p>');
  const visual=$('.auth-visual'); if(visual&&!visual.querySelector('.office-preview'))visual.querySelector('.auth-copy')?.insertAdjacentHTML('afterend','<div class="office-preview"><div class="office-preview-bar"><span><i></i> Live operations desk</span><small>Workspace preview</small></div><div class="office-preview-grid"><article><span class="preview-label">INCOMING</span><b>Customer call</b><small>AI receptionist · ready for approval</small><span class="preview-status live">Live</span></article><article><span class="preview-label">TODAY</span><b>4 jobs scheduled</b><small>2 allocated · 2 awaiting team</small><span class="preview-status">Operations</span></article><article><span class="preview-label">WORKFORCE</span><b>Team ready</b><small>Compliance, skills and availability checked</small><span class="preview-status good">Ready</span></article></div></div>');
    const main=$('main.content-wrap'); if(main&&!$('#billing-view'))main.insertAdjacentHTML('beforeend',`<section id="billing-view" class="view" hidden><div class="page-heading"><div><p class="kicker">PLANS & BILLING</p><h1>Your 14-day free trial</h1><p>Try everything on your chosen plan before you pay. Billing stays off until a payment provider is connected.</p></div><span class="status-pill neutral" id="trial-status-pill">Trial active</span></div><div class="trial-hero panel"><div><span class="panel-kicker">CURRENT ACCESS</span><h2 id="trial-plan-name">Trial</h2><p id="trial-copy">Loading trial status…</p></div><div class="trial-count"><strong id="trial-days">14</strong><span>days remaining</span></div><div class="trial-progress"><span id="trial-progress-bar"></span></div></div><div class="pricing-grid"><article class="pricing-card"><span class="pricing-tag">ESSENTIAL</span><h2>Starter · A$49</h2><p>For solo operators and small service teams.</p><ul><li>CRM & enquiries</li><li>Quotes, bookings and jobs</li><li>Core workforce records</li><li>Approval-controlled AI</li></ul><button class="secondary-button" type="button" disabled>Billing not enabled</button></article><article class="pricing-card featured"><span class="pricing-tag">RECOMMENDED</span><h2>Operations · A$99</h2><p>For growing teams that need workforce, compliance and automation.</p><ul><li>Everything in Starter</li><li>Up to 50 workers, 3,000 customers</li><li>Compliance & onboarding</li><li>AI Operations workflows</li></ul><button class="primary-button" type="button" disabled>Payment provider required</button></article><article class="pricing-card"><span class="pricing-tag">ADVANCED</span><h2>Scale · A$149</h2><p>For larger multi-team service businesses.</p><ul><li>Everything in Operations</li><li>Up to 25 team logins</li><li>6,000 AI requests a month</li><li>All 8 channels</li></ul><button class="secondary-button" type="button" disabled>Billing not enabled</button></article></div><article class="panel billing-safety"><span class="feature-icon"><svg><use href="#i-shield"/></svg></span><div><h2>No surprise billing</h2><p>No charge is made until a payment provider is connected and you have agreed to pay.</p></div></article>
  <article class="panel" id="account-lifecycle-panel">
    <div class="panel-head"><div><span class="panel-kicker">ACCOUNT & DATA SAFETY</span><h2>Your workspace stays yours</h2></div><span class="status-pill good" id="account-preservation-status">Preserved</span></div>
    <p>Your account and business data are not deleted automatically because a trial ends or billing changes. Deletion can only be started by the workspace owner and requires a separate verification step.</p>
    <div class="readiness-list">
      <div><span class="check-dot done"><svg><use href="#i-check"></use></svg></span><span><b>Indefinite preservation</b><small>Account and workspace data remain stored unless you explicitly complete deletion or deletion is legally required.</small></span></div>
      <div><span class="check-dot done"><svg><use href="#i-check"></use></svg></span><span><b>Owner-controlled deletion</b><small>Email verification, typed confirmation and a 7-day cancellation window are required.</small></span></div>
      <div><span class="check-dot done"><svg><use href="#i-check"></use></svg></span><span><b>Tenant isolation</b><small>Your SaaS workspace records are scoped to your organisation and protected by authenticated server routes.</small></span></div>
    </div>
    <div id="account-deletion-state" class="connection-note">Loading account lifecycle…</div>
    <div class="button-row">
      <button id="start-account-deletion" class="secondary-button" type="button">Request account deletion</button>
      <button id="cancel-account-deletion" class="secondary-button" type="button" hidden>Cancel scheduled deletion</button>
    </div>
    <div id="account-deletion-confirm" class="panel" hidden style="margin-top:14px">
      <h3>Confirm permanent deletion request</h3>
      <p>A security code has been sent to your verified email. Nothing is deleted yet.</p>
      <label>Verification code<input id="account-deletion-code" inputmode="numeric" maxlength="6" placeholder="6-digit code"></label>
      <label>Type <b>DELETE MY ACCOUNT</b><input id="account-deletion-text" autocomplete="off" placeholder="DELETE MY ACCOUNT"></label>
      <div class="button-row"><button id="confirm-account-deletion" class="danger-button" type="button">Schedule deletion</button><button id="close-account-deletion" class="secondary-button" type="button">Cancel</button></div>
      <small>After confirmation, a 7-day cancellation window starts. Your account and data remain intact during that window.</small>
    </div>
  </article></section>`);
  const footer=$('.app-footer'); if(footer&&!$('#flow-nav'))footer.insertAdjacentHTML('beforebegin','<div id="flow-nav" class="flow-nav"><button id="flow-prev" class="secondary-button compact" type="button">← Previous</button><div><small>GUIDED WORKSPACE</small><b id="flow-position">Step 1 of 8</b></div><button id="flow-next" class="primary-button compact" type="button">Next →</button></div>');
}
enhanceShell();

async function api(url, options={}){const r=await fetch(url,{credentials:'same-origin',...options,headers:{...(options.body&&!(options.body instanceof FormData)?{'content-type':'application/json'}:{}),...options.headers}});const d=await r.json().catch(()=>({}));if(!r.ok){const e=new Error(r.status===429?'This feature is receiving several requests at once. Please wait a few seconds and try again.':(d.error||'The requested action could not be completed.'));e.status=r.status;e.payload=d;throw e}return d}
window.SuperProApi=api;
// No rejected promise or stray error may surface as a console error or a blank screen: show a calm notice instead.
let lastFault=0;
function reportFault(reason){
  const now=Date.now();if(now-lastFault<4000)return;lastFault=now;
  const message=reason&&reason.message?reason.message:'Something went wrong. Please try again.';
  try{note(message,true)}catch{}
}
window.addEventListener('unhandledrejection',event=>{event.preventDefault();reportFault(event.reason)});
window.addEventListener('error',event=>{if(event.target&&event.target!==window)return;reportFault(event.error)});
function installWorkspaceAddressSearch(){
  const input=$('#workspace-address-search'),box=$('#workspace-address-suggestions'),form=$('#onboarding-form');if(!input||!box||!form||input.dataset.ready)return;input.dataset.ready='1';
  if(!$('#workspace-address-style')){const s=document.createElement('style');s.id='workspace-address-style';s.textContent='.workspace-address-suggestions{position:absolute;z-index:50;left:0;right:0;top:100%;max-height:260px;overflow:auto;border:1px solid var(--line);border-radius:10px;background:var(--panel);box-shadow:0 14px 34px rgba(0,0,0,.32)}.workspace-address-suggestions button{display:block;width:100%;padding:10px 12px;border:0;border-bottom:1px solid var(--line);background:transparent;color:var(--text-2);text-align:left;font-size:12px;cursor:pointer}.workspace-address-suggestions button:hover{background:var(--brand-soft)}#workspace-address-search{position:relative}';document.head.appendChild(s)}
  let timer=null;
  const stateCode=v=>({'Australian Capital Territory':'ACT','New South Wales':'NSW','Northern Territory':'NT','Queensland':'QLD','South Australia':'SA','Tasmania':'TAS','Victoria':'VIC','Western Australia':'WA'}[String(v||'').trim()]||String(v||'').trim().toUpperCase());
  input.addEventListener('input',()=>{clearTimeout(timer);const q=input.value.trim();if(q.length<4){box.hidden=true;return}timer=setTimeout(async()=>{try{const d=await api('/api/saas/address/search?q='+encodeURIComponent(q));const rows=d.suggestions||[];box.innerHTML='';if(!rows.length){box.hidden=true;return}for(const x of rows){const b=document.createElement('button');b.type='button';b.textContent=x.display_name;b.onclick=()=>{for(const [k,v] of Object.entries({address_unit:x.unit||'',address_street_number:x.street_number||'',address_street_name:x.street_name||'',address_suburb:x.suburb||'',address_state:stateCode(x.state),address_postcode:x.postcode||'',address_formatted:x.display_name||'',address_source:x.source||'OpenStreetMap'}))if(form.elements[k])form.elements[k].value=v;input.value=x.display_name||'';box.hidden=true};box.appendChild(b)}box.hidden=false}catch{box.hidden=true}},280)});
  document.addEventListener('click',e=>{if(e.target!==input&&!box.contains(e.target))box.hidden=true});
}

function note(v,bad=false){const e=$('#workspace').hidden?$('#auth-message'):$('#notice');if(!e)return;e.textContent=v;e.style.color=bad?'var(--red)':'var(--green)';clearTimeout(noteTimer);if(e.id==='notice'&&v)noteTimer=setTimeout(()=>e.textContent='',6500)}
function obj(f){return Object.fromEntries(new FormData(f))} function initials(name='User'){return name.trim().split(/\s+/).slice(0,2).map(x=>x[0]).join('').toUpperCase()||'U'}
function setTheme(theme,{persist=true}={}){
  const resolved=theme==='light'?'light':'dark';/* black and gold is the house look; light stays one click away */
  document.documentElement.dataset.theme=resolved;
  if(persist)localStorage.setItem('foai-theme',theme);
  $$('.theme-icon use').forEach(u=>u.setAttribute('href',resolved==='dark'?'#i-sun':'#i-moon'));
}
setTheme(localStorage.getItem('foai-theme')||'dark',{persist:false});
$$('.theme-toggle').forEach(b=>b.addEventListener('click',()=>setTheme(document.documentElement.dataset.theme==='dark'?'light':'dark')));
window.matchMedia?.('(prefers-color-scheme: dark)').addEventListener?.('change',()=>{
  if(localStorage.getItem('foai-theme')==='system')setTheme('system',{persist:false});
});
function closeSidebar(){$('#sidebar')?.classList.remove('open');$('#sidebar-scrim')?.classList.remove('show')} $('#open-sidebar')?.addEventListener('click',()=>{$('#sidebar').classList.add('open');$('#sidebar-scrim').classList.add('show')});$('#close-sidebar')?.addEventListener('click',closeSidebar);$('#sidebar-scrim')?.addEventListener('click',closeSidebar);
function updateFlowNav(){const index=Math.max(0,viewSequence.indexOf(currentView)),prev=$('#flow-prev'),next=$('#flow-next'),pos=$('#flow-position');if(pos)pos.textContent=`Step ${index+1} of ${viewSequence.length}`;if(prev)prev.disabled=index===0;if(next){next.disabled=index===viewSequence.length-1;next.textContent=index===viewSequence.length-1?'Complete':'Next →'}}
function showView(name,{instant=false}={}){if(!viewSequence.includes(name)){note('This feature is not authorised for your account. Ask your business owner for access.',true);name=viewSequence[0]||'support';}currentView=name;$$('.workspace-nav [data-view]').forEach(x=>x.classList.toggle('active',x.dataset.view===name));NAV.reveal(name);$$('.view').forEach(v=>v.hidden=v.id!==`${name}-view`);const meta=pageMeta[name]||['WORKSPACE','Super Pro AI Office Manager'];if($('#page-eyebrow'))$('#page-eyebrow').textContent=meta[0];if($('#page-title'))$('#page-title').textContent=meta[1];updateFlowNav();closeSidebar();const route=`#${NAV.pathFor(name)||name}`;if(location.hash!==route)history.pushState(null,'',route);window.dispatchEvent(new CustomEvent('gds:viewchange',{detail:{view:name,meta}}));if(name==='governance')loadGovernance().catch(e=>note(e.message,true));if(name==='integrations')loadSelfServiceIntegrations().catch(e=>note(e.message,true));if(name==='finance')loadFinance().catch(e=>note(e.message,true));if(name==='approvals')window.SuperProApprovals?.install?.();requestAnimationFrame(()=>window.scrollTo({top:0,behavior:instant?'auto':'smooth'}))}
$('.workspace-nav')?.addEventListener('click',e=>{const b=e.target.closest('[data-view]');if(b)showView(b.dataset.view)});document.addEventListener('click',e=>{const focus=e.target.closest('[data-focus]');if(focus){e.preventDefault();document.getElementById(focus.dataset.focus)?.focus();return}const target=e.target.closest('[data-jump]');if(target){e.preventDefault();showView(target.dataset.jump)}});$$('[data-scroll]').forEach(b=>b.onclick=()=>{const target=$(b.dataset.scroll);const view=target?.closest('[id$="-view"]');if(view)showView(view.id.replace(/-view$/,''));requestAnimationFrame(()=>target?.scrollIntoView({behavior:'smooth',block:'start'}))});$('#flow-prev')?.addEventListener('click',()=>{const i=viewSequence.indexOf(currentView);if(i>0)showView(viewSequence[i-1])});$('#flow-next')?.addEventListener('click',()=>{const i=viewSequence.indexOf(currentView);if(i<viewSequence.length-1)showView(viewSequence[i+1])});
function setAuthMode(mode,initial=false){const target=mode==='register'?'create-account.html':'sign-in.html';if(!initial&&!location.pathname.endsWith(target)){location.href=target;return;}const isRegister=mode==='register';$('#register-form').hidden=!isRegister;$('#login-form').hidden=isRegister;$('#auth-message').textContent='';const h=$('.auth-heading h2'),sub=$('#auth-subtitle');if(h)h.textContent=isRegister?'Create your secure workspace':'Sign in to your workspace';if(sub)sub.textContent=isRegister?'Choose your plan, create your account and start 14 days free. No card is required.':'Enter your account details to continue to your secure workspace.';const choice=$('.account-choice');if(choice){const label=choice.querySelector('span'),button=choice.querySelector('button');if(label)label.textContent=isRegister?'Already have an account?':'New to Super Pro AI Office Manager?';if(button){button.dataset.authSwitch=isRegister?'login':'register';button.textContent=isRegister?'Sign in':'Join workspace'}}window.scrollTo({top:0,behavior:'smooth'})}
document.addEventListener('click',e=>{const b=e.target.closest('[data-auth-switch]');if(b)setAuthMode(b.dataset.authSwitch)});setAuthMode(location.pathname.endsWith('create-account.html')?'register':'login',true);
$$('[data-prompt]').forEach(b=>b.onclick=()=>{const f=$('#assistant-form'),t=f?.querySelector('textarea[name="message"]'),title=f?.querySelector('input[name="title"]');if(t){t.value=b.dataset.prompt||'';t.dispatchEvent(new Event('input'));t.focus()}if(title&&b.dataset.title)title.value=b.dataset.title});const aiPrompt=$('#assistant-form textarea[name="message"]'),promptCount=$('#prompt-count');function updatePromptCount(){if(promptCount&&aiPrompt)promptCount.textContent=`${aiPrompt.value.length} characters`}aiPrompt?.addEventListener('input',updatePromptCount);aiPrompt?.addEventListener('keydown',e=>{if((e.ctrlKey||e.metaKey)&&e.key==='Enter'){e.preventDefault();$('#assistant-form')?.requestSubmit()}});updatePromptCount();

async function boot(){
  let d;
  try{d=await api('/api/saas/me')}
  catch(x){
    if(x.status===401){window.SuperProWorkspaceContext?.clear();location.replace('sign-in.html');return}
    $('#welcome').hidden=false;$('#workspace').hidden=true;
    if(x.status&&x.status!==401)note('The workspace service is temporarily unavailable. Please try again.',true);
    return;
  }
  window.SuperProWorkspaceContext?.bind(d.organisation.id);
  $('#welcome').hidden=true;$('#workspace').hidden=false;window.GDS_SESSION=d;
  window.dispatchEvent(new CustomEvent('superpro:workspace-ready'));
  loadBusinessSwitcher().catch(err=>note(err.message,true));
  document.documentElement.dataset.userRole=String(d.user.role||'user').toLowerCase();
  const role=String(d.user.role||'').toLowerCase();
  viewSequence=NAV.sequence(role);NAV.render($('.workspace-nav'),role);NAV.setRoleBadge($('#org-role-side'),role);
  $('#org-name-side').textContent=d.organisation.name;const workspaceAvatar=$('#org-avatar-side');if(workspaceAvatar)workspaceAvatar.textContent=initials(d.organisation.name);$('#user-line').textContent=d.user.full_name+' · '+d.user.role+' · '+d.user.email;$('#mfa-status-side').textContent=d.user.mfa_enabled?'Two-step sign-in is on':'Two-step sign-in is off';$('#profile-name').textContent=d.user.full_name;$('#profile-role').textContent=d.user.role;$('#profile-avatar').textContent=initials(d.user.full_name);$('#first-name').textContent=d.user.full_name.split(/\s+/)[0]||'there';

  await loadWorkspaceBranding().catch(err=>note('Branding could not be loaded: '+err.message,true));
  const seniorRole=['owner','admin','manager','super_admin','director'].includes(role),ownerRole=['owner','admin','super_admin'].includes(role);
  const loaders=[
    ['dashboard',loadDashboard],['business setup',loadOnboarding],['workforce',loadWorkers],['jobs',loadJobs],['AI operations',loadThreads],['content studio',loadRenders],['subscription',loadSubscription],['account lifecycle',loadAccountLifecycle]
  ].filter(([name])=>window.GDS_SESSION?.access?.mode!=='custom'||name==='account lifecycle'||window.GDS_SESSION.access.grants.includes(({'business setup':'settings',workforce:'workforce',jobs:'jobs','AI operations':'ai','content studio':'content',subscription:'billing',dashboard:'dashboard'}[name])+'.read')).filter(([name])=>window.GDS_SESSION?.access?.mode==='custom'||seniorRole||['dashboard','workforce','jobs','account lifecycle'].includes(name)).filter(([name])=>window.GDS_SESSION?.access?.mode==='custom'||ownerRole||name!=='subscription');
  let failed=[];
  const first=await Promise.allSettled(loaders.map(([,fn])=>fn()));
  first.forEach((result,index)=>{if(result.status==='rejected')failed.push({name:loaders[index][0],fn:loaders[index][1],error:result.reason})});
  if(failed.length){
    await new Promise(resolve=>setTimeout(resolve,650));
    const retry=await Promise.allSettled(failed.map(x=>x.fn()));
    failed=failed.filter((item,index)=>retry[index].status==='rejected').map((item,index)=>({...item,error:retry[index].reason}));
  }
  if(failed.length){
    console.warn('Workspace modules failed after retry:',failed.map(x=>({module:x.name,error:x.error?.message||String(x.error)})));
    note('Signed in successfully. '+failed.map(x=>x.name).join(', ')+' is temporarily unavailable; the rest of the workspace is ready.',true);
  }
  currentRole=role;showView(NAV.resolve(location.hash,role)||'dashboard',{instant:true});
  try{
    const approvals=await api('/api/saas/approvals?status=pending');
    const badge=$('#nav-approvals');if(badge)badge.textContent=String(approvals.counts?.pending||0);
  }catch{}
  setTimeout(()=>maybeStartTour(d),350);
}

$('#register-form').onsubmit=e=>{e.preventDefault();location.href='create-account.html'};
const registerPassword=$('#register-form')?.elements.password,registerConfirm=$('#register-form')?.elements.confirm_password;function updatePasswordMatch(){const hint=$('#password-match');if(!hint||!registerConfirm)return;if(!registerConfirm.value){hint.textContent='Both passwords must match.';hint.classList.remove('error-text','success-text');return}const ok=registerPassword.value===registerConfirm.value;hint.textContent=ok?'Passwords match.':'Passwords do not match.';hint.classList.toggle('success-text',ok);hint.classList.toggle('error-text',!ok)}registerPassword?.addEventListener('input',updatePasswordMatch);registerConfirm?.addEventListener('input',updatePasswordMatch);
let accessRefreshBusy=false;
async function refreshStaffAccess(){if(accessRefreshBusy||document.hidden||!window.GDS_SESSION)return;accessRefreshBusy=true;try{const d=await api('/api/saas/access/me');if(d.role!==window.GDS_SESSION.user.role||JSON.stringify(d.access)!==JSON.stringify(window.GDS_SESSION.access)){window.GDS_SESSION.user.role=d.role;document.documentElement.dataset.userRole=d.role;NAV.setRoleBadge($('#org-role-side'),d.role);window.GDS_SESSION.access=d.access;window.dispatchEvent(new Event('superpro:access-changed'));viewSequence=NAV.sequence(window.GDS_SESSION.user.role);NAV.render($('.workspace-nav'),window.GDS_SESSION.user.role);showView(viewSequence.includes(currentView)?currentView:viewSequence[0],{instant:true})}}catch{}finally{accessRefreshBusy=false}}
setInterval(refreshStaffAccess,30000);window.addEventListener('focus',refreshStaffAccess);
$('#login-form').onsubmit=async e=>{e.preventDefault();const b=obj(e.target);if(!b.mfa_code)delete b.mfa_code;try{await api('/api/saas/login',{method:'POST',body:JSON.stringify(b)});location.href='workspace.html#dashboard'}catch(x){if(x.payload?.mfa_required){e.target.querySelector('.mfa-details')?.setAttribute('open','');e.target.elements.mfa_code?.focus()}note(x.message,true)}};$('#logout').onclick=async()=>{try{await api('/api/saas/logout',{method:'POST'});sessionStorage.removeItem('gds-session');location.href='/saas/'}catch(err){note('Sign out failed. Please retry. '+err.message,true)}};
async function loadAccountLifecycle(){
  const state=$('#account-deletion-state'),start=$('#start-account-deletion'),cancel=$('#cancel-account-deletion'),box=$('#account-deletion-confirm');
  if(!state)return;
  try{
    const d=await api('/api/saas/account/lifecycle');
    const pending=d.deletion_request;
    $('#account-preservation-status').textContent=d.account?.preserved_indefinitely?'Preserved':'Review';
    if(pending?.status==='scheduled'){
      const when=pending.eligible_after?new Date(pending.eligible_after).toLocaleString():'after the cancellation window';
      state.textContent='Deletion is scheduled for '+when+'. Your data remains intact until then.';
      start.hidden=true;cancel.hidden=false;if(box)box.hidden=true;
    }else if(pending?.status==='pending_verification'){
      state.textContent='A deletion verification request is waiting for confirmation. No deletion is scheduled yet.';
      start.hidden=false;cancel.hidden=true;
    }else{
      state.textContent='No deletion is scheduled. Your account and data remain preserved.';
      start.hidden=false;cancel.hidden=true;if(box)box.hidden=true;
    }
  }catch(err){state.textContent='Account lifecycle status could not be loaded: '+err.message}
}
let accountDeletionRequestId='';
$('#start-account-deletion')?.addEventListener('click',async()=>{
  const button=$('#start-account-deletion');button.disabled=true;
  try{
    const d=await api('/api/saas/account/deletion/start',{method:'POST',body:JSON.stringify({})});
    accountDeletionRequestId=d.request_id;
    $('#account-deletion-confirm').hidden=false;
    $('#account-deletion-state').textContent=d.message;
    $('#account-deletion-code')?.focus();
  }catch(err){note(err.message,true)}
  finally{button.disabled=false}
});
$('#confirm-account-deletion')?.addEventListener('click',async()=>{
  const code=String($('#account-deletion-code')?.value||'').trim(),confirmText=String($('#account-deletion-text')?.value||'').trim();
  if(!accountDeletionRequestId){note('Start a new deletion request first.',true);return}
  try{
    const d=await api('/api/saas/account/deletion/confirm',{method:'POST',body:JSON.stringify({request_id:accountDeletionRequestId,code,confirm_text:confirmText})});
    note(d.message);accountDeletionRequestId='';$('#account-deletion-confirm').hidden=true;await loadAccountLifecycle();
  }catch(err){note(err.message,true)}
});
$('#cancel-account-deletion')?.addEventListener('click',async()=>{
  if(!confirm('Cancel the scheduled account deletion and keep this workspace and all data?'))return;
  try{const d=await api('/api/saas/account/deletion/cancel',{method:'POST',body:JSON.stringify({})});note(d.message);await loadAccountLifecycle()}catch(err){note(err.message,true)}
});
$('#close-account-deletion')?.addEventListener('click',()=>{$('#account-deletion-confirm').hidden=true;accountDeletionRequestId=''});
async function loadDashboard(){const d=await api('/api/saas/dashboard'),m=d.metrics;$('#m-workers').textContent=m.workers;$('#m-ready').textContent=m.ready;$('#m-attention').textContent=m.attention;$('#m-jobs').textContent=m.jobs;$('#m-expiring').textContent=m.expiring;$('#nav-jobs').textContent=m.jobs;$('#briefing').textContent=m.attention||m.jobs||m.expiring?`${m.attention} worker${m.attention===1?'':'s'} need compliance attention, ${m.jobs} job${m.jobs===1?'':'s'} await allocation, and ${m.expiring} document${m.expiring===1?'':'s'} expire within 30 days.`:'No immediate workforce or allocation risks detected. Your operational foundation is clear.'}

let industryRegistryCache=[];
let selectedIndustryCode='custom';
function refreshWorkerRoleSuggestions(){
  const list=$('#worker-role-suggestions');
  if(!list)return;
  const selected=industryRegistryCache.find(row=>row.code===selectedIndustryCode);
  const description=[selected?.label,selected?.group,$('#business-type')?.value].filter(Boolean).join(' ').toLowerCase();
  const groups=[
    [/polish|metal|fabricat|weld|manufactur/,['Metal Polisher','Fabricator','Workshop Technician','Quality Inspector']],
    [/construct|build|plumb|electri|trade/,['Tradesperson','Site Supervisor','Apprentice','Project Manager']],
    [/clean|facilit|maintenance/,['Cleaner','Cleaning Supervisor','Maintenance Technician','Site Manager']],
    [/transport|logistic|freight|truck|fleet/,['Driver','Fleet Coordinator','Diesel Mechanic','Dispatcher']],
    [/health|care|disabil|support/,['Support Worker','Care Coordinator','Registered Nurse','Team Leader']],
    [/hospitality|restaurant|cafe|food/,['Chef','Kitchen Hand','Waitstaff','Shift Supervisor']],
    [/retail|shop|store/,['Sales Assistant','Store Manager','Stock Controller','Customer Service Officer']],
    [/technology|software|digital|consult/,['Software Developer','IT Support Specialist','Consultant','Project Coordinator']]
  ];
  const matched=groups.filter(([pattern])=>pattern.test(description)).flatMap(([,roles])=>roles);
  const roles=[...new Set([...matched,'Technician','Supervisor','Manager','Apprentice','Contractor'])];
  list.replaceChildren(...roles.map(role=>{const option=document.createElement('option');option.value=role;return option}));
}
function applyIndustryModules(modules=[]){
  // Industry packs recommend and customise the workspace; they must never hide
  // core customer functionality. Every subscribed/trial workspace keeps access
  // to every core page, while recommended areas are highlighted contextually.
  const recommended=new Set(Array.isArray(modules)?modules:[]);
  document.querySelectorAll('.workspace-nav [data-view]').forEach(button=>{
    button.hidden=false;
    const view=button.dataset.view;
    const isRecommended=recommended.has(view)||['dashboard','onboarding','governance','support','manual','billing'].includes(view);
    button.classList.toggle('industry-recommended',isRecommended);
    button.dataset.industryRecommended=isRecommended?'1':'0';
  });
}
function industrySearchText(row){return [row.label,row.group,row.anzsic,...(row.keywords||[]),...(row.specialties||[])].join(' ').toLowerCase()}
function renderIndustryBrowser(query=''){
  const grid=$('#industry-browser-grid'),count=$('#industry-result-count');if(!grid)return;
  const q=String(query||'').trim().toLowerCase();
  let rows=industryRegistryCache.filter(row=>row.code!=='custom');
  if(q)rows=rows.filter(row=>industrySearchText(row).includes(q));
  rows=rows.slice(0,q?40:18);
  if(count)count.textContent=q?(rows.length+' matching business profile'+(rows.length===1?'':'s')):((industryRegistryCache.length-1)+' Australian business profiles available — search for more');
  if(!rows.length){
    grid.innerHTML='<div class="industry-empty"><b>No exact profile found.</b><span>Use Custom setup, describe your activity, and Super Pro will create a reviewable starting workspace.</span><button type="button" class="secondary-button compact" data-industry-code="custom">Use custom setup</button></div>';
  }else{
    grid.innerHTML=rows.map(row=>'<button type="button" class="industry-browser-card '+(row.code===selectedIndustryCode?'selected':'')+'" data-industry-code="'+esc(row.code)+'"><span class="industry-code">'+esc(row.anzsic||'SP')+'</span><div><b>'+esc(row.label)+'</b><small>'+esc(row.group)+(row.specialties&&row.specialties.length?' · '+esc(row.specialties.slice(0,3).join(' · ')):'')+'</small></div><i>'+(row.code===selectedIndustryCode?'Selected':'Choose')+' →</i></button>').join('');
  }
  grid.querySelectorAll('[data-industry-code]').forEach(btn=>btn.onclick=()=>selectIndustryProfile(btn.dataset.industryCode,{applySuggestions:true,announce:true}));
}
function renderRegulatoryProfile(industry){
  const host=$('#regulatory-profile-preview'),list=$('#regulatory-source-list');if(!host||!list||!industry)return;
  const docs=(industry.documents||[]).map(x=>'<li>'+esc(x)+'</li>').join('');
  const sources=(industry.sources||[]).map(x=>'<article class="reg-source-row"><div><b>'+esc(x.name)+'</b><small>'+esc(x.authority)+' · '+esc(x.jurisdiction||'AU')+'</small><span>'+esc(x.note||'Official source')+'</span></div><a href="'+esc(x.url)+'" target="_blank" rel="noopener">Open official source ↗</a>'+(x.last_check?'<em class="reg-check '+(x.last_check.changed?'changed':'ok')+'">'+(x.last_check.changed?'Changed — review required':'Last checked')+' · '+esc(new Date(x.last_check.checked_at).toLocaleDateString())+'</em>':'')+'</article>').join('');
  const summary=host.querySelector('span');if(summary)summary.textContent=industry.summary||'Industry-aware workspace profile.';
  list.innerHTML='<div class="reg-docs"><b>Recommended evidence / records to review</b><ul>'+(docs||'<li>Confirm activity-specific obligations with the relevant authority.</li>')+'</ul></div><div class="reg-sources"><b>Official sources</b>'+(sources||'<small>No sector-specific source is configured yet; general Australian sources still apply.</small>')+'</div><p class="regulatory-human-control">AI may identify and summarise source changes, but legal, employment, clinical, financial and publishing decisions remain subject to authorised human review.</p>';
}
function renderSelectedIndustry(row){
  const card=$('#selected-industry-card');if(!card||!row)return;
  card.hidden=false;
  card.innerHTML='<div><span class="panel-kicker">SELECTED BUSINESS PROFILE</span><h3>'+esc(row.label)+'</h3><p>'+esc(row.summary)+'</p></div><div class="selected-industry-meta"><span>'+esc(row.group)+'</span>'+(row.anzsic?'<span>ANZSIC '+esc(row.anzsic)+'</span>':'')+'<span>'+(row.services||[]).length+' starter workflows</span></div>'+(row.specialties&&row.specialties.length?'<div class="selected-specialties">'+row.specialties.slice(0,8).map(x=>'<span>'+esc(x)+'</span>').join('')+'</div>':'');
}

function setWorkspaceNavLabel(view,label){
  const button=document.querySelector('.workspace-nav [data-view="'+view+'"]');if(button){const spans=button.querySelectorAll('span');if(spans[1])spans[1].textContent=label}
  if(pageMeta[view])pageMeta[view][1]=label;
}
function applyIndustryWorkspaceLanguage(row){
  document.documentElement.dataset.industry=row?.code||'custom';
  let workforce='Workforce & Compliance',jobs='Work Orders & Dispatch',finance='Profit & Payments';
  let workforceHero='Build a compliant, job-ready team',jobsHero='Create work, then allocate the right people';
  const code=row?.code||'';
  if(/healthcare|nursing|allied_health|dental|pharmacy|veterinary/.test(code)){workforce='People & credentials';jobs='Appointments & service delivery';workforceHero='Manage credentialed practitioners and staff';jobsHero='Coordinate appointments, services and accountable delivery'}
  else if(/ndis|aged_care|childcare/.test(code)){workforce='People & credentials';jobs='Care & service delivery';workforceHero='Manage a screened, credentialed service team';jobsHero='Coordinate supports, care and service delivery'}
  else if(code==='real_estate'){workforce='People & team';jobs='Properties & inspections';workforceHero='Build a licensed, accountable property team';jobsHero='Coordinate inspections, property tasks and follow-up'}
  else if(code==='manufacturing'){workforce='People & production team';jobs='Production & work orders';workforceHero='Build a safe, production-ready team';jobsHero='Plan production work, quality steps and allocation'}
  else if(code==='transport_logistics'){workforce='People & drivers';jobs='Dispatch & allocation';workforceHero='Manage a ready, credentialed transport workforce';jobsHero='Dispatch work and allocate people or fleet resources'}
  else if(/education_training/.test(code)){workforce='People & educators';jobs='Classes & delivery';workforceHero='Manage qualified educators, trainers and staff';jobsHero='Coordinate classes, sessions and service delivery'}
  else if(/retail_ecommerce|wholesale_trade/.test(code)){workforce='People & team';jobs='Orders & operations';workforceHero='Build an operationally ready team';jobsHero='Coordinate orders, tasks and customer operations'}
  else if(/construction_trades|repair_automotive|cleaning_facilities/.test(code)){workforce='Workforce & Compliance';jobs='Work Orders & Dispatch';workforceHero='Build a compliant, job-ready team';jobsHero='Create work, then allocate the right people'}
  setWorkspaceNavLabel('workforce',workforce);setWorkspaceNavLabel('jobs',jobs);setWorkspaceNavLabel('finance',finance);
  const wh=$('#workforce-view .page-heading h1'),jh=$('#jobs-view .page-heading h1');if(wh)wh.textContent=workforceHero;if(jh)jh.textContent=jobsHero;
}
function selectIndustryProfile(code,{applySuggestions=false,announce=false}={}){
  const row=industryRegistryCache.find(x=>x.code===code)||industryRegistryCache.find(x=>x.code==='custom');if(!row)return;
  selectedIndustryCode=row.code;
  const select=$('#industry-code'),f=$('#onboarding-form');if(select)select.value=row.code;
  if(f&&applySuggestions){
    f.elements.business_type.value=row.label;
    f.elements.services.value=(row.services||[]).join('\n');
    if(f.elements.custom_sections&&!f.elements.custom_sections.value.trim())f.elements.custom_sections.value=(row.specialties||[]).slice(0,6).join('\n');
    if(!f.elements.brand_voice.value.trim())f.elements.brand_voice.value='Professional, clear, trustworthy and appropriate to the selected industry.';
    if(!f.elements.ai_instructions.value.trim())f.elements.ai_instructions.value='Use the selected industry profile and saved business settings as context. Keep consequential actions under authorised human approval. Flag uncertainty and do not invent licences, legal obligations, prices or professional advice.';
  }
  renderSelectedIndustry(row);renderRegulatoryProfile(row);applyIndustryModules(row.modules||[]);applyIndustryWorkspaceLanguage(row);renderIndustryBrowser($('#industry-search')?.value||'');
  if(announce)note(row.label+' profile selected. Review the AI suggestions, official-source guidance and workspace modules before saving.');
}
async function loadIndustryRegistry(selected='custom'){
  try{
    const d=await api('/api/saas/industry-registry');industryRegistryCache=d.industries||[];
    const select=$('#industry-code');if(!select)return;
    select.innerHTML=industryRegistryCache.map(x=>'<option value="'+esc(x.code)+'">'+esc(x.label)+' · '+esc(x.group)+'</option>').join('');
    selectedIndustryCode=industryRegistryCache.some(x=>x.code===selected)?selected:'custom';select.value=selectedIndustryCode;
    const search=$('#industry-search');if(search&&!search.dataset.bound){search.dataset.bound='1';search.addEventListener('input',()=>renderIndustryBrowser(search.value))}
    const custom=$('#choose-custom-industry');if(custom&&!custom.dataset.bound){custom.dataset.bound='1';custom.addEventListener('click',()=>selectIndustryProfile('custom',{applySuggestions:true,announce:true}))}
    renderIndustryBrowser(search?.value||'');selectIndustryProfile(selectedIndustryCode,{applySuggestions:false});
  }catch(err){console.warn('Industry registry could not load:',err.message);if($('#industry-result-count'))$('#industry-result-count').textContent='Business catalogue is temporarily unavailable. Custom setup remains available.'}
}
async function loadRegulatorySources(){
  try{
    const d=await api('/api/saas/regulatory/sources');if(d.industry)renderRegulatoryProfile({...d.industry,sources:d.sources||[]});
  }catch(err){console.warn('Regulatory sources could not load:',err.message)}
}
$('#check-regulatory-sources')?.addEventListener('click',async()=>{
  const b=$('#check-regulatory-sources');b.disabled=true;b.textContent='Checking official sources…';
  try{
    const d=await api('/api/saas/regulatory/check',{method:'POST',body:JSON.stringify({industry_code:$('#industry-code')?.value||selectedIndustryCode})});note(d.message||'Official-source check completed.');
    await loadRegulatorySources();
  }catch(err){note(err.message,true)}
  finally{b.disabled=false;b.textContent='Check official sources now'}
});
async function loadOnboarding(){
  const d=await api('/api/saas/onboarding'),f=$('#onboarding-form'),p=d.profile;installWorkspaceAddressSearch();
  await loadIndustryRegistry(p.industry_code||'custom');
  await loadWorkspaceBranding();
  for(const k of ['business_type','industry_code','business_structure','team_mode','ai_setup_mode','phone','website','service_area','address_unit','address_street_number','address_street_name','address_suburb','address_state','address_postcode','address_formatted','address_source','brand_voice','approval_mode','ai_instructions'])if(f.elements[k])f.elements[k].value=p[k]||'';
  f.elements.services.value=(p.services||[]).join('\n');if(f.elements.custom_sections)f.elements.custom_sections.value=(p.custom_sections||[]).join('\n');if(f.elements.complete)f.elements.complete.checked=!!p.complete;
    applyIndustryModules(p.workspace_modules||d.industry?.modules||[]);
  await loadRegulatorySources();
}
$('#onboarding-form').onsubmit=async e=>{e.preventDefault();const b=obj(e.target);b.services=b.services.split('\n').map(x=>x.trim()).filter(Boolean);b.custom_sections=String(b.custom_sections||'').split('\n').map(x=>x.trim()).filter(Boolean);b.complete=e.target.elements.complete.checked;try{const d=await api('/api/saas/onboarding',{method:'PUT',body:JSON.stringify(b)});note('Workspace settings saved successfully. Industry-specific modules and official-source guidance have been refreshed.');applyIndustryModules(d.industry?.modules||[]);renderRegulatoryProfile({...d.industry,sources:(industryRegistryCache.find(x=>x.code===d.industry?.code)?.sources||[])});}catch(x){note(x.message,true)}};
// Brand colour: the platform default stays on the built-in theme; a custom colour recolours the accent live.
const PLATFORM_DEFAULT_PRIMARY='#f59e0b';
function applyBrandColours(hex){
  const root=document.documentElement.style,valid=/^#[0-9a-f]{6}$/i.test(hex||'')&&hex.toLowerCase()!==PLATFORM_DEFAULT_PRIMARY;
  if(!valid){['--brand','--brand-2','--brand-soft','--brand-line','--cyan','--cyan-soft'].forEach(k=>root.removeProperty(k));return}
  const n=parseInt(hex.slice(1),16),r=n>>16,g=n>>8&255,b=n&255,rgba=a=>`rgba(${r},${g},${b},${a})`;
  root.setProperty('--brand',hex);root.setProperty('--cyan',hex);root.setProperty('--brand-2',hex);
  root.setProperty('--brand-soft',rgba(.13));root.setProperty('--cyan-soft',rgba(.13));root.setProperty('--brand-line',rgba(.32));
}
$('#branding-primary-color')?.addEventListener('input',e=>{e.target.dataset.touched='1';applyBrandColours(e.target.value)});
$('#branding-secondary-color')?.addEventListener('input',e=>{e.target.dataset.touched='1'});
async function loadWorkspaceBranding(){
  const d=await api('/api/saas/branding'),b=d.branding;
  const name=$('#branding-display-name'),logo=$('#branding-logo-url'),theme=$('#branding-theme');
  const primary=$('#branding-primary-color'),secondary=$('#branding-secondary-color');
  const isDefault=!b.primary_color||b.primary_color.toLowerCase()===PLATFORM_DEFAULT_PRIMARY;
  if(primary){primary.value=isDefault?'#d9ad59':b.primary_color;delete primary.dataset.touched}
  if(secondary){secondary.value=b.secondary_color||'#1e293b';delete secondary.dataset.touched}
  applyBrandColours(null);
  if(name)name.value=b.display_name||'';
  if(logo)logo.value=b.logo_url||'';
  const preview=$('#branding-logo-preview');if(preview){preview.hidden=!b.logo_url;if(b.logo_url)preview.src=b.logo_url;else preview.removeAttribute('src')};
  if(theme)theme.value=b.theme||'system';
  const label=$('#org-name-side'),avatar=$('#org-avatar-side');
  if(label)label.textContent=b.display_name||window.GDS_SESSION?.organisation?.name||'Workspace';
  if(avatar){
    const fallback=initials(b.display_name||window.GDS_SESSION?.organisation?.name||'Workspace');
    avatar.replaceChildren(document.createTextNode(fallback));
    if(b.logo_url){
      const image=document.createElement('img');
      image.src=b.logo_url;image.alt='';image.loading='lazy';image.referrerPolicy='no-referrer';
      image.addEventListener('error',()=>image.remove(),{once:true});
      avatar.replaceChildren(image);
    }
  }
  const canEdit=['owner','admin','administrator'].includes(String(window.GDS_SESSION?.user?.role||'').toLowerCase());
  const section=$('#workspace-branding-settings');
  if(section)section.querySelectorAll('input,select,button').forEach(el=>{el.disabled=!canEdit});
  const ownerControls=$('#owner-control-centre');
  if(ownerControls)ownerControls.hidden=!canEdit;
  if(!localStorage.getItem('foai-theme'))setTheme(b.theme||'dark',{persist:false}); /* a person's own choice always wins over the workspace default */
}
$('#upload-workspace-logo')?.addEventListener('click',async()=>{
  const input=$('#branding-logo-file'),file=input?.files?.[0],button=$('#upload-workspace-logo'),feedback=$('#branding-upload-feedback');
  if(!file){if(feedback)feedback.textContent='Select a logo image first.';return}
  if(!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>1024*1024){if(feedback)feedback.textContent='Choose a PNG, JPEG or WebP image smaller than 1 MB.';return}
  const body=new FormData();body.append('logo',file);
  button.disabled=true;
  try{
    const response=await fetch('/api/saas/branding/logo',{method:'POST',body,credentials:'same-origin'});
    const result=await response.json();
    if(!response.ok||!result.ok)throw new Error(result.error||'Logo upload failed.');
    if(feedback)feedback.textContent='Logo uploaded successfully.';
    if($('#branding-logo-url'))$('#branding-logo-url').value=result.logo_url;
    if(input)input.value='';
    await loadWorkspaceBranding();
  }catch(error){if(feedback)feedback.textContent=error.message;note(error.message,true)}
  finally{button.disabled=false}
});
$('#save-workspace-branding')?.addEventListener('click',async()=>{
  const feedback=$('#branding-feedback'),button=$('#save-workspace-branding');
  button.disabled=true;
  try{
    const d=await api('/api/saas/branding',{method:'PUT',body:JSON.stringify({
      display_name:$('#branding-display-name').value.trim(),
      logo_url:$('#branding-logo-url').value.trim(),
      theme:$('#branding-theme').value,
      ...($('#branding-primary-color')?.dataset.touched?{primary_color:$('#branding-primary-color').value}:{}),
      ...($('#branding-secondary-color')?.dataset.touched?{secondary_color:$('#branding-secondary-color').value}:{})
    })});
    if(feedback)feedback.textContent='Workspace appearance saved.';
    await loadWorkspaceBranding();
    if(d.branding.theme!=='system'&&!localStorage.getItem('foai-theme'))setTheme(d.branding.theme);
  }catch(error){if(feedback)feedback.textContent=error.message;note(error.message,true)}
  finally{button.disabled=false}
});
async function loadWorkers(){
  refreshWorkerRoleSuggestions();
  const d=await api('/api/saas/workers'),list=$('#workers');
  const filter=$('#worker-status-filter')?.value||'active';
  const search=String($('#worker-directory-search')?.value||'').trim().toLowerCase();
  const visible=d.workers.filter(w=>(filter==='all'||(filter==='active'?w.status==='active':filter==='onboarding'?w.status==='onboarding':filter==='inactive'?['inactive','archived','terminated','deactivated'].includes(w.status):true))&&(!search||[w.full_name,w.role_title,w.email,w.phone].some(value=>String(value||'').toLowerCase().includes(search))));
  list.innerHTML=visible.map(w=>{
    const skills=(w.skills||[]).slice(0,5);
    const active=w.status==='active';
    const rightsVerified=w.work_rights_status==='verified';
    const declarationReview=w.declared_work_status==='requires_review';
    const ready=active&&rightsVerified&&!declarationReview&&Boolean(w.approved_for_scheduling);
    const statusLabel=!active?String(w.status||'Onboarding').replaceAll('_',' '):ready?'Ready to schedule':declarationReview?'Declaration review required':!rightsVerified?'Work rights review required':'Scheduling approval required';
    return `<article class="row-card" data-worker-id="${esc(w.id)}">
      <header><div><b>${esc(w.full_name)}</b><div class="muted">${esc(w.role_title)} · ${esc(w.employment_type.replaceAll('_',' '))} · Level ${w.worker_level}</div></div><span class="status ${ready?'good':'warn'}">${esc(statusLabel)}</span></header>
      <p class="muted">Declared status: ${esc(String(w.declared_work_status||'requires_review').replaceAll('_',' '))} · Work rights: ${esc(w.work_rights_status.replaceAll('_',' '))} · Compliance ${w.compliance_summary?.verified||0}/${w.compliance_summary?.required||0}</p>
      <div class="worker-skill-summary">${skills.length?skills.map(s=>`<span class="filter-chip">${esc(s.skill_name)} · ${esc(s.competency)} · ${esc(s.verification_status||'pending')}</span>`).join(''):'<span class="muted">No skills recorded yet.</span>'}</div>
      <div class="row-actions"><button type="button" data-worker-compliance="${esc(w.id)}">Compliance & credentials</button><button type="button" data-worker-skill="${esc(w.id)}">Add / verify skill</button><button type="button" data-worker-invite="${esc(w.id)}" data-worker-email="${esc(w.email||'')}" data-worker-phone="${esc(w.phone||'')}">Send onboarding link</button></div>
    </article>`;
  }).join('')||'<div class="empty-state"><b>'+ (d.workers.length?'No workers match this filter':'No workers yet')+'</b><span>'+(d.workers.length?'Choose another status to view existing worker records.':'Add your first worker profile to begin onboarding and eligibility checks.')+'</span></div>';
}
$('#worker-status-filter')?.addEventListener('change',()=>loadWorkers().catch(x=>note(x.message,true)));
let workerSearchTimer;
$('#worker-directory-search')?.addEventListener('input',()=>{
  clearTimeout(workerSearchTimer);
  workerSearchTimer=setTimeout(()=>{
    const input=$('#worker-directory-search');
    if(input?.isConnected)loadWorkers().catch(x=>note(x.message,true));
  },220);
});
$('#industry-code')?.addEventListener('change',refreshWorkerRoleSuggestions);
$('#business-type')?.addEventListener('input',refreshWorkerRoleSuggestions);
$('#worker-form').onsubmit=async e=>{e.preventDefault();try{const created=await api('/api/saas/workers',{method:'POST',body:JSON.stringify(obj(e.target))});e.target.reset();if($('#worker-status-filter'))$('#worker-status-filter').value='onboarding';updateWorkStatusHelp();note('Worker profile created. Complete the compliance verification before scheduling.');await Promise.all([loadWorkers(),loadDashboard()]);if(created.id)await openWorkerCompliance(created.id)}catch(x){note(x.message,true)}};

function ensureWorkforceDialog(){
  let d=$('#workforce-dialog');if(d)return d;
  d=document.createElement('dialog');d.id='workforce-dialog';d.className='workforce-dialog';
  d.innerHTML='<div class="workforce-dialog-shell"><header><div><span class="panel-kicker">WORKFORCE CONTROL</span><h2 id="workforce-dialog-title">Worker compliance</h2></div><button type="button" class="secondary-button compact" data-close-workforce>Close</button></header><div id="workforce-dialog-body"></div></div>';
  document.body.append(d);d.querySelector('[data-close-workforce]').onclick=()=>d.close();return d;
}
function workforceStatusClass(status){return status==='verified'?'good':(['rejected','expired','restricted'].includes(status)?'danger':'warn')}
async function openWorkerCompliance(id){
  const d=ensureWorkforceDialog(),body=d.querySelector('#workforce-dialog-body');body.innerHTML='<div class="empty-state">Loading compliance record…</div>';d.showModal();
  try{
    const x=await api('/api/saas/workers/'+encodeURIComponent(id)+'/compliance'),w=x.worker;
    d.querySelector('#workforce-dialog-title').textContent=w.full_name+' — compliance & credentials';
    body.innerHTML=`
      <div class="notice-banner"><div><b>Scheduling eligibility: ${x.eligible?'Eligible':'Blocked pending compliance'}</b><span>${x.verified_count}/${x.required_count} required compliance items verified. Work rights: ${x.work_rights_verified?'verified':'not yet verified'}.</span></div></div>
      <section class="workforce-review-section"><h3>Compliance requirements</h3><div class="record-list">${(x.requirements||[]).map(r=>`<article class="row-card"><header><div><b>${esc(r.label)}</b><div class="muted">${esc(r.category.replaceAll('_',' '))} · ${esc(r.verification_method.replaceAll('_',' '))}</div></div><span class="status ${workforceStatusClass(r.status)}">${esc(r.status.replaceAll('_',' '))}</span></header>${r.condition_note?`<p class="muted">${esc(r.condition_note)}</p>`:''}${r.official_source_url?`<a class="text-button" href="${esc(r.official_source_url)}" target="_blank" rel="noopener">Open official verification source ↗</a>`:''}<div class="row-actions"><button type="button" data-review-requirement="${esc(r.id)}" data-worker-id="${esc(id)}">Review / update</button></div></article>`).join('')}</div></section>
      <section class="workforce-review-section"><h3>Skills & competency</h3><div class="record-list">${(x.skills||[]).map(s=>`<article class="row-card"><header><div><b>${esc(s.skill_name)}</b><div class="muted">${esc(s.competency)} · evidence: ${esc(s.evidence_reference||'not recorded')}</div></div><span class="status ${workforceStatusClass(s.verification_status||'pending')}">${esc(s.verification_status||'pending')}</span></header></article>`).join('')||'<div class="empty-state">No skills recorded.</div>'}</div></section>
      <section class="workforce-review-section"><h3>Document checklist</h3><div class="record-list">${(x.documents||[]).map(doc=>`<article class="row-card"><header><div><b>${esc(doc.document_type.replaceAll('_',' '))}</b><div class="muted">${doc.required?'Required':'Optional'} · ${esc(doc.document_name||'No evidence uploaded')}</div></div><span class="status ${workforceStatusClass(doc.verification_status||'pending')}">${esc(doc.verification_status||'pending')}</span></header><form class="row-actions" data-staff-doc-upload="${esc(doc.id)}" data-worker-id="${esc(id)}"><input type="file" name="file" accept=".pdf,image/jpeg,image/png,image/webp"><button type="submit">Upload / replace evidence</button><button type="button" data-review-document="${esc(doc.id)}" data-worker-id="${esc(id)}">Review document</button></form></article>`).join('')}</div></section>`;
  }catch(err){body.innerHTML='<div class="empty-state">'+esc(err.message)+'</div>'}
}
async function reviewComplianceRequirement(workerId,requirementId){
  const evidence=prompt('Evidence / official verification reference (do not enter passwords):','');if(evidence===null)return;
  const decision=String(prompt('Status: verified, review_required, restricted, rejected or expired','verified')||'').trim().toLowerCase();
  if(!['verified','review_required','restricted','rejected','expired','pending'].includes(decision)){note('Invalid compliance status.',true);return}
  try{await api(`/api/saas/workers/${workerId}/compliance/${requirementId}`,{method:'PATCH',body:JSON.stringify({status:decision,evidence_reference:evidence,evidence_note:'Authorised workforce review'})});note('Compliance requirement updated.');await Promise.all([openWorkerCompliance(workerId),loadWorkers(),loadDashboard()])}catch(err){note(err.message,true)}
}
async function addWorkerSkill(id){
  const d=ensureWorkforceDialog(),body=d.querySelector('#workforce-dialog-body');d.querySelector('#workforce-dialog-title').textContent='Add / verify worker skill';
  body.innerHTML='<form id="worker-skill-form" class="form-grid"><label class="full"><span>Skill / competency</span><input name="skill_name" required placeholder="e.g. Truck Metal Polishing"></label><label><span>Competency</span><select name="competency"><option value="competent">Competent</option><option value="advanced">Advanced</option><option value="expert">Expert</option><option value="training">Training</option></select></label><label><span>Verification status</span><select name="verification_status"><option value="pending">Pending review</option><option value="verified">Verified by authorised reviewer</option></select></label><label><span>Evidence type</span><input name="evidence_type" placeholder="Certificate, licence, internal assessment…"></label><label><span>Evidence/reference</span><input name="evidence_reference" placeholder="Certificate/licence/reference number"></label><label><span>Expiry date</span><input name="expiry_date" type="date"></label><label class="full"><span>Requirement / assessment note</span><textarea name="requirement_note" rows="3" placeholder="What evidence or practical assessment supports this competency?"></textarea></label><button class="primary-button full" type="submit">Save skill record</button></form>';d.showModal();
  body.querySelector('#worker-skill-form').onsubmit=async e=>{e.preventDefault();const payload=obj(e.target);try{await api(`/api/saas/workers/${id}/skills`,{method:'POST',body:JSON.stringify(payload)});d.close();note('Worker skill record saved.');await loadWorkers()}catch(err){note(err.message,true)}};
}
async function reviewWorkerDocument(workerId,documentId){
  const evidence=prompt('Document / official verification reference:','');if(evidence===null)return;
  const status=String(prompt('Status: verified, review_required, rejected or expired','verified')||'').trim().toLowerCase();
  if(!['verified','review_required','rejected','expired','pending'].includes(status)){note('Invalid document status.',true);return}
  try{await api(`/api/saas/workers/${workerId}/documents/${documentId}`,{method:'PATCH',body:JSON.stringify({verification_status:status,evidence_reference:evidence,notes:'Authorised document review'})});note('Worker document review saved.');await Promise.all([openWorkerCompliance(workerId),loadWorkers(),loadDashboard()])}catch(err){note(err.message,true)}
}
async function uploadWorkerDocument(form){
  const workerId=form.dataset.workerId,documentId=form.dataset.staffDocUpload,file=form.elements.file?.files?.[0];if(!file){note('Choose a PDF or image first.',true);return}
  const fd=new FormData();fd.append('file',file);const b=form.querySelector('button[type="submit"]');b.disabled=true;
  try{const r=await fetch(`/api/saas/workers/${encodeURIComponent(workerId)}/documents/${encodeURIComponent(documentId)}/upload`,{method:'POST',credentials:'same-origin',body:fd});const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||'Evidence upload failed.');note('Worker evidence uploaded for review.');await openWorkerCompliance(workerId)}catch(err){note(err.message,true)}finally{b.disabled=false}
}
async function inviteWorker(button){
  const id=button.dataset.workerInvite,email=prompt('Worker email address (leave blank if using mobile only):',button.dataset.workerEmail||'');if(email===null)return;
  const phone=prompt('Worker mobile number (leave blank if using email only):',button.dataset.workerPhone||'');if(phone===null)return;
  try{
    const d=await api(`/api/saas/workers/${id}/invite`,{method:'POST',body:JSON.stringify({email:email.trim(),phone:phone.trim(),expires_days:7})});
    const delivered=[d.delivery?.email?.sent?'email':null,d.delivery?.sms?.sent?'SMS':null].filter(Boolean).join(' and ');
    await navigator.clipboard?.writeText(d.invite_url).catch(()=>{});
    note((delivered?'Secure onboarding link sent by '+delivered+'. ':'Secure onboarding link created. ')+(navigator.clipboard?'Link copied to clipboard.':'Copy the link from the response if needed.'));
  }catch(err){note(err.message,true)}
}
$('#workers')?.addEventListener('click',e=>{
  const compliance=e.target.closest('[data-worker-compliance]');if(compliance){e.preventDefault();openWorkerCompliance(compliance.dataset.workerCompliance);return}
  const skill=e.target.closest('[data-worker-skill]');if(skill){e.preventDefault();addWorkerSkill(skill.dataset.workerSkill);return}
  const invite=e.target.closest('[data-worker-invite]');if(invite){e.preventDefault();inviteWorker(invite);return}
  const review=e.target.closest('[data-review-requirement]');if(review){e.preventDefault();reviewComplianceRequirement(review.dataset.workerId,review.dataset.reviewRequirement)}
});
document.addEventListener('click',e=>{const review=e.target.closest('[data-review-requirement]');if(review){e.preventDefault();reviewComplianceRequirement(review.dataset.workerId,review.dataset.reviewRequirement);return}const doc=e.target.closest('[data-review-document]');if(doc){e.preventDefault();reviewWorkerDocument(doc.dataset.workerId,doc.dataset.reviewDocument)}});
document.addEventListener('submit',e=>{const form=e.target.closest('[data-staff-doc-upload]');if(form){e.preventDefault();uploadWorkerDocument(form)}});

function updateWorkStatusHelp(){
  const select=$('#worker-form [name="work_status"]');if(!select)return;
  let box=$('#work-status-help');if(!box){box=document.createElement('div');box.id='work-status-help';box.className='notice-banner full';select.closest('label').after(box)}
  const map={
    australian_citizen:['Declaration only — evidence review required','Citizenship is not verified by selecting this option. Appropriate identity/citizenship evidence must be reviewed.','https://immi.homeaffairs.gov.au/visas/already-have-a-visa/check-visa-details-and-conditions/check-conditions-online/'],
    permanent_resident:['Declaration only — current entitlement review required','Record appropriate identity evidence and use an authorised/official work-right check where applicable.','https://immi.homeaffairs.gov.au/visa-conditions-subsite/Pages/vevo-for-organisations.aspx'],
    visa_holder:['VEVO work-right review required','Record the visa details and check current work entitlements/conditions through VEVO with the worker’s permission.','https://immi.homeaffairs.gov.au/visa-conditions-subsite/Pages/vevo-for-organisations.aspx'],
    requires_review:['Scheduling blocked until reviewed','An authorised reviewer must establish lawful work entitlement before allocation.','https://immi.homeaffairs.gov.au/visas/employing-and-sponsoring-someone/hire-someone-in-australia/']
  };
  const x=map[select.value]||map.requires_review;box.innerHTML='<div><b>'+x[0]+'</b><span>'+x[1]+' Verification workflow will open immediately after the worker profile is created.</span><a class="text-button" href="'+x[2]+'" target="_blank" rel="noopener noreferrer">Official guidance ↗</a></div>';
}
$('#worker-form [name="work_status"]')?.addEventListener('change',updateWorkStatusHelp);updateWorkStatusHelp();

let skillSuggestTimer=null;
async function refreshJobSkillSuggestions(){
  const form=$('#job-form'),title=form?.elements?.title?.value?.trim()||'',host=$('#job-skill-suggestions');if(!form||!host)return;
  try{
    const d=await api('/api/saas/work-orders/skill-suggestions?title='+encodeURIComponent(title));
    const suggestions=(d.suggestions||[]).slice(0,14);host.innerHTML='<div class="muted">Suggested for this business / job — click individual skills or add the recommended set:</div><div class="row-actions"><button type="button" data-add-recommended-skills>+ Add recommended skills</button>'+suggestions.map(s=>`<button type="button" data-add-job-skill="${esc(s.name)}">${esc(s.name)}</button>`).join('')+'</div>';host.dataset.suggestions=JSON.stringify(suggestions.map(s=>s.name));
  }catch{host.innerHTML='<div class="muted">Skill suggestions are temporarily unavailable.</div>'}
}
(function installJobSkillAssist(){
  const form=$('#job-form'),field=form?.elements?.required_skills;if(!form||!field)return;
  let host=$('#job-skill-suggestions');if(!host){host=document.createElement('div');host.id='job-skill-suggestions';host.className='job-skill-suggestions';field.closest('label').append(host)}
  form.elements.title?.addEventListener('input',()=>{clearTimeout(skillSuggestTimer);skillSuggestTimer=setTimeout(refreshJobSkillSuggestions,280)});
  host.addEventListener('click',e=>{const lines=field.value.split('\\n').map(x=>x.trim()).filter(Boolean),all=e.target.closest('[data-add-recommended-skills]');if(all){let suggestions=[];try{suggestions=JSON.parse(host.dataset.suggestions||'[]')}catch{}for(const s of suggestions.slice(0,8))if(!lines.some(x=>x.toLowerCase()===String(s).toLowerCase()))lines.push(s);field.value=lines.join('\\n');return}const b=e.target.closest('[data-add-job-skill]');if(!b)return;if(!lines.some(x=>x.toLowerCase()===b.dataset.addJobSkill.toLowerCase()))lines.push(b.dataset.addJobSkill);field.value=lines.join('\\n')});
  refreshJobSkillSuggestions();
})();

async function loadJobs(){
  const d=await api('/api/saas/work-orders'),list=$('#jobs');
  list.innerHTML=d.jobs.map(j=>`<article class="row-card"><header><div><b>${esc(j.title)}</b><div class="muted">${new Date(j.start_at).toLocaleString()} · ${j.required_workers} worker${j.required_workers===1?'':'s'} · Level ${j.required_level}+</div></div><span class="status">${esc(j.status.replaceAll('_',' '))}</span></header><p class="muted">${esc(j.address||'No address')} · Skills: ${(j.required_skills||[]).map(esc).join(', ')||'None specified'} · ${j.accepted_workers||0}/${j.required_workers} accepted</p><div class="row-actions">${['owner','admin','manager','super_admin','director'].includes(currentRole)?`<button type="button" data-offer-job="${esc(j.id)}">Find eligible workers →</button>`:''}<button type="button" data-job-media="${esc(j.id)}" data-job-title="${esc(j.title)}">Photos &amp; videos</button><button type="button" data-job-stock="${esc(j.id)}" data-job-title="${esc(j.title)}">Materials used</button></div></article>`).join('')||'<div class="empty-state"><b>No work orders yet</b><span>Create a job and the eligibility engine will match compliant workers.</span></div>';
}
$('#job-form').onsubmit=async e=>{e.preventDefault();const b=obj(e.target);if(!b.customer_id)delete b.customer_id;b.required_skills=String(b.required_skills||'').split(/\r?\n/).map(x=>x.trim()).filter(Boolean);try{await api('/api/saas/work-orders',{method:'POST',body:JSON.stringify(b)});e.target.reset();note('Work order added to the allocation pool.');await Promise.all([loadJobs(),loadDashboard(),refreshJobSkillSuggestions()])}catch(x){note(x.message,true)}};
$('#jobs')?.addEventListener('click',async e=>{
  const b=e.target.closest('[data-offer-job]');if(!b)return;
  b.disabled=true;b.textContent='Checking eligibility…';
  try{
    const d=await api('/api/saas/work-orders/'+encodeURIComponent(b.dataset.offerJob)+'/offer',{method:'POST'});
    if(d.offered)note('Offered to '+d.offered+' fully eligible worker'+(d.offered===1?'':'s')+': '+(d.eligible_workers||[]).map(x=>x.full_name).join(', '));
    else{
      const reasons=(d.evaluated||[]).slice(0,5).map(x=>x.full_name+': '+[x.missing_skills?.length?'missing verified skills '+x.missing_skills.join(', '):'',x.blocking_compliance?'compliance items pending':'',!x.work_rights_verified?'work rights not verified':''].filter(Boolean).join('; ')).join(' | ');
      note('No fully eligible workers. '+(reasons||'Check worker compliance, level and verified skills.'),true);
    }
    await Promise.all([loadJobs(),loadDashboard()]);
  }catch(err){note(err.message,true)}finally{b.disabled=false;b.textContent='Find eligible workers →'}
});
async function loadThreads(){const d=await api('/api/saas/ai/threads');$('#threads').innerHTML=d.threads.map(t=>`<article class="row-card"><header><div><b>${esc(t.title)}</b><div class="muted">Updated ${new Date(t.updated_at).toLocaleString()}</div></div><span class="status">${t.last_ai_response?'AI complete':'Saved'}</span></header>${t.last_ai_response?`<p class="muted" style="white-space:pre-wrap;margin-top:10px">${esc(t.last_ai_response)}</p>`:''}</article>`).join('')||'<div class="empty-state"><b>No AI Operations threads</b><span>Save an instruction to start building workspace-scoped operational memory.</span></div>'}$('#assistant-form').onsubmit=async e=>{e.preventDefault();const f=obj(e.target),submit=e.target.querySelector('button[type="submit"]');if(submit)submit.disabled=true;try{const d=await api('/api/saas/ai/threads',{method:'POST',body:JSON.stringify({title:f.title,message:f.message})});e.target.reset();updatePromptCount();note(d.ai_response?'AI Operations completed the task and saved the answer below.':d.note);await loadThreads()}catch(x){note(x.message,true)}finally{if(submit)submit.disabled=false}};
async function loadMfaStatus(){try{const st=await api('/api/saas/mfa');const t=$('#mfa-status-side');if(t)t.textContent=st.mfa_enabled?'Two-step sign-in is on':'Two-step sign-in is off';const b=$('#setup-mfa');if(b){b.textContent=st.mfa_enabled?'Security: on':'Secure account';b.title=st.mfa_enabled?'Two-step sign-in is on. Click to manage.':'Turn on two-step sign-in';b.classList.toggle('is-on',!!st.mfa_enabled)}}catch{}}
window.addEventListener('superpro:workspace-ready',()=>loadMfaStatus());
$('#setup-mfa')?.addEventListener('click',async()=>{
  const dlg=$('#mfa-dialog'),body=$('#mfa-body');if(!dlg||!body)return;body.replaceChildren();
  const h=(t,tx,c)=>{const e=document.createElement(t);if(tx!==undefined)e.textContent=tx;if(c)e.className=c;return e},inp=(ph,type='text')=>{const i=document.createElement('input');i.placeholder=ph;i.type=type;i.inputMode=type==='password'?'text':'numeric';i.autocomplete=type==='password'?'current-password':'one-time-code';return i},btn=(tx,cls,fn)=>{const b=h('button',tx,cls);b.type='button';b.onclick=fn;return b};
  const close=btn('Close','secondary-button',()=>dlg.close());
  try{
    const st=await api('/api/saas/mfa');
    if(st.mfa_enabled){
      body.append(h('div','On','mfa-state mfa-on'),h('h2','Two-step sign-in is on'),h('p','Every sign-in needs your password and a 6-digit code from your authenticator app.','mfa-lead'));
      const pw=inp('Your password','password'),code=inp('Current 6-digit code');code.maxLength=6;
      const off=btn('Turn off','danger-button',async()=>{try{await api('/api/saas/mfa/disable',{method:'POST',body:JSON.stringify({password:pw.value,code:code.value})});dlg.close();note('Two-step sign-in is off.');await loadMfaStatus()}catch(x){note(x.message,true)}});
      const box=h('div','','mfa-step');box.append(h('b','Turn it off'),h('p','Confirm with your password and a current code.','muted'),pw,code);
      const act=h('div','','dialog-actions');act.append(close,off);body.append(box,act);
    }else{
      const d=await api('/api/saas/mfa/setup',{method:'POST'});
      body.append(h('div','Off','mfa-state mfa-off'),h('h2','Turn on two-step sign-in'),h('p','Takes about a minute. Even if someone learns your password, they cannot get in without your phone.','mfa-lead'));
      const s1=h('div','','mfa-step');s1.append(h('span','1','mfa-num'),h('b','Install an authenticator app'),h('p','Google Authenticator, Microsoft Authenticator or Authy, free on your phone.','muted'));
      const s2=h('div','','mfa-step');s2.append(h('span','2','mfa-num'),h('b','Scan this code'),h('p','Open the app, tap Add, and scan. On a phone, tap the link instead.','muted'));
      if(d.qr_svg){const q=h('div','','mfa-qr');const img=document.createElement('img');img.alt='Authenticator QR code';img.width=180;img.height=180;img.src='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(d.qr_svg);q.append(img);s2.append(q)}
      const link=h('a','Open in my authenticator app');link.href=d.otpauth_uri;link.className='mfa-link';
      const key=h('code',d.secret);key.id='mfa-secret';s2.append(link,h('small','Cannot scan? Type this key into the app:','muted'),key);
      const s3=h('div','','mfa-step');s3.append(h('span','3','mfa-num'),h('b','Enter the 6-digit code'),h('p','The app shows a new code every 30 seconds.','muted'));
      const code=inp('000000');code.id='mfa-code';code.maxLength=6;
      const ok=btn('Turn on','primary-button compact',async()=>{try{await api('/api/saas/mfa/verify',{method:'POST',body:JSON.stringify({code:code.value})});dlg.close();note('Two-step sign-in is on. You will need a code each time you sign in.');await loadMfaStatus()}catch(x){note(x.message,true)}});
      s3.append(code);const act=h('div','','dialog-actions');act.append(close,ok);body.append(s1,s2,s3,act);
    }
    dlg.showModal();
  }catch(x){note(x.message,true)}
});
async function loadRenders(){const d=await api('/api/saas/video-renders');$('#renders').innerHTML=d.jobs.map(j=>{const x=j.edit_spec||{};return `<article class="row-card"><header><div><b>${esc(j.quality)} · ${esc(x.aspect_ratio)}</b><div class="muted">${esc(x.platform||'Multi-platform')} · ${esc(x.goal||'Saved render specification')}</div></div><span class="status">${esc(j.status)}</span></header></article>`}).join('')||'<div class="empty-state"><b>No render specifications</b><span>Create an AI-assisted output specification to populate this queue.</span></div>'}
const trendProfiles={
'X':[['Lead with the point','Put the result or offer in the first line; threads and short clips travel furthest.'],['Native video','Short square or landscape clips with captions play well in the timeline.'],['Clear call to action','Ask for one reply, one click or one booking.']],
'Snapchat Spotlight':[['Vertical and fast','Full-screen 9:16 with the strongest moment in the first second.'],['Sound optional','Use captions so it works muted.'],['Local angle','Show the suburb or the finished job.']],
'WhatsApp Status':[['Personal and short','Under 30 seconds, vertical, one message.'],['Offer with a reply','Invite people to message you to book.'],['Consent first','Only share customer photos you have permission to use.']],
'TikTok':[['Hook in 1–2 seconds','Open on the strongest visual result; avoid a slow logo intro.'],['Native vertical pacing','Use 9:16, frequent visual changes and concise on-screen text.'],['Search-aware caption','Use a descriptive caption and spoken/on-screen keywords relevant to the service.']],
'Instagram Reels':[['Transformation structure','Before → process → reveal performs as a clear visual story.'],['Save/share value','Add a useful tip or detail viewers may save or share.'],['Clean safe zones','Keep captions and CTA away from lower/right interface overlays.']],
'Facebook Reels':[['Immediate context','Explain the job/result quickly for viewers discovering the business cold.'],['Readable captions','Assume sound-off viewing and keep text larger and slower.'],['Local action','Use a clear enquiry or location-relevant CTA when appropriate.']],
'YouTube Shorts':[['Retention first','Deliver the payoff early, then show the process that created it.'],['Loop-friendly ending','End on a frame or idea that can naturally return to the opening.'],['Title intent','Use a specific searchable title rather than generic promotional wording.']],
'YouTube':[['Story arc','Use hook → proof → process → result → next action.'],['Thumbnail moment','Preserve a clean high-contrast result frame for thumbnail selection.'],['Chapter-ready structure','For longer videos, create clear sections and remove dead time.']],
'LinkedIn':[['Business outcome','Lead with the operational/customer result rather than entertainment alone.'],['Credibility proof','Show process, standards, measurable detail or before/after evidence.'],['Professional CTA','Invite a relevant conversation instead of using engagement bait.']]
};
function renderTrendSuggestions(){const el=$('#trend-suggestions'),platform=$('#content-platform')?.value||'TikTok',items=trendProfiles[platform]||trendProfiles.TikTok;if(!el)return;el.innerHTML=items.map((x,i)=>`<button class="trend-card" type="button" data-trend="${i}"><span>0${i+1}</span><div><b>${esc(x[0])}</b><small>${esc(x[1])}</small></div><em>Apply</em></button>`).join('');el.querySelectorAll('.trend-card').forEach((b,i)=>b.onclick=()=>{const ta=$('#video-form [name="style_prompt"]');if(ta){ta.value=(ta.value?ta.value.trim()+' ':'')+items[i][1];ta.dispatchEvent(new Event('input'))}note('Suggestion added to the AI editing direction.')});updateCreativeScore()}
function updateCreativeScore(){const f=$('#video-form');if(!f)return;let score=55;const text=f.elements.style_prompt?.value||'';if(text.length>35)score+=10;if(f.elements.captions?.checked)score+=7;if(f.elements.auto_highlights?.checked)score+=8;if(f.elements.auto_reframe?.checked)score+=6;if(f.elements.cta?.checked)score+=6;if(f.elements.transition?.value==='auto')score+=5;score=Math.min(97,score);const out=$('#creative-score');if(out)out.textContent=score;const sig=$('#performance-signals');if(sig)sig.innerHTML=`<div><b>Hook</b><span>${score>=80?'Strong setup':'Add a clearer first-second payoff'}</span></div><div><b>Retention</b><span>${f.elements.auto_highlights?.checked?'AI highlight selection enabled':'Enable best-moment selection'}</span></div><div><b>Conversion</b><span>${f.elements.cta?.checked?'Goal-matched CTA enabled':'Add a clear next action'}</span></div><small class="prediction-note">This score evaluates specification completeness and creative best-practice signals. It does not predict or guarantee views.</small>`}
$('#content-platform')?.addEventListener('change',renderTrendSuggestions);$('#refresh-trends')?.addEventListener('click',()=>{renderTrendSuggestions();note('Platform strategy suggestions refreshed. Connect authorised platform analytics for live account-specific trend signals.')});$('#video-form')?.addEventListener('input',updateCreativeScore);$('#generate-ai-spec')?.addEventListener('click',async()=>{const f=$('#video-form'),b=$('#generate-ai-spec');if(!f||!b)return;b.disabled=true;const original=b.textContent;b.textContent='Generating…';try{const d=await api('/api/saas/content/ai-spec',{method:'POST',body:JSON.stringify({platform:f.elements.platform.value,goal:f.elements.goal.value,aspect_ratio:f.elements.aspect_ratio.value,media_id:f.elements.media_id.value,current_direction:f.elements.style_prompt.value,language:'auto'})});const x=d.spec||{};if(x.transition&&[...f.elements.transition.options].some(o=>o.value===x.transition))f.elements.transition.value=x.transition;if(x.style_prompt)f.elements.style_prompt.value=x.style_prompt;if(x.hook&&[...f.elements.hook.options].some(o=>o.text===x.hook||o.value===x.hook))f.elements.hook.value=[...f.elements.hook.options].find(o=>o.text===x.hook||o.value===x.hook).value;if(x.pacing&&[...f.elements.pacing.options].some(o=>o.text===x.pacing||o.value===x.pacing))f.elements.pacing.value=[...f.elements.pacing.options].find(o=>o.text===x.pacing||o.value===x.pacing).value;if(x.caption_style&&[...f.elements.caption_style.options].some(o=>o.text===x.caption_style||o.value===x.caption_style))f.elements.caption_style.value=[...f.elements.caption_style.options].find(o=>o.text===x.caption_style||o.value===x.caption_style).value;for(const k of ['captions','auto_reframe','auto_highlights','cta'])if(typeof x[k]==='boolean'&&f.elements[k])f.elements[k].checked=x[k];renderTrendSuggestions();updateCreativeScore();note(d.source==='configured-ai-provider'?'Live AI specification generated. Review it before saving.':'Built-in specification generated because the live AI provider is unavailable.');}catch(err){note(err.message||'AI specification could not be generated.',true)}finally{b.disabled=false;b.textContent=original}});
$('#video-form').onsubmit=async e=>{e.preventDefault();const f=obj(e.target),body={quality:f.quality,edit_spec:{platform:f.platform,goal:f.goal,aspect_ratio:f.aspect_ratio,clips:[{media_id:f.media_id,start_seconds:Number(f.start_seconds),end_seconds:Number(f.end_seconds),transition:f.transition}],pacing:f.pacing,hook:f.hook,caption_style:f.caption_style,captions:e.target.elements.captions.checked,music:e.target.elements.music.checked,logo:e.target.elements.logo.checked,auto_reframe:e.target.elements.auto_reframe.checked,auto_highlights:e.target.elements.auto_highlights.checked,cta:e.target.elements.cta.checked,style_prompt:f.style_prompt}};try{const d=await api('/api/saas/video-renders',{method:'POST',body:JSON.stringify(body)});note(d.note);await loadRenders()}catch(x){note(x.message,true)}};renderTrendSuggestions();updateCreativeScore();
function money(cents){return new Intl.NumberFormat(undefined,{style:'currency',currency:'AUD'}).format((Number(cents)||0)/100)}
async function loadFinance(){await window.SuperProFinance?.load?.()}
$('#finance-form')?.addEventListener('submit',async e=>{e.preventDefault();const b=obj(e.target);try{await api('/api/saas/finance',{method:'POST',body:JSON.stringify(b)});e.target.reset();e.target.elements.occurred_on.value=new Date().toISOString().slice(0,10);note('Finance entry saved to this workspace.');await loadFinance()}catch(x){note(x.message,true)}});
async function loadSubscription(){try{const d=await api('/api/saas/subscription'),s=d.subscription,life=d.lifecycle||{};if(!s)return;const total=d.trial_days||14,remaining=Number.isFinite(s.trial_remaining_days)?s.trial_remaining_days:0,trialEnd=s.trial_ends_at?new Date(s.trial_ends_at):null,pct=Math.max(0,Math.min(100,((total-remaining)/total)*100));$('#trial-plan-name').textContent=s.plan_name||'Trial';$('#trial-days').textContent=remaining;if($('#sidebar-trial-days'))$('#sidebar-trial-days').textContent=remaining;const descriptions={trialing:`Trial ends ${trialEnd?.toLocaleString()||''}. Full workspace access is active.`,restricted:`Trial ended. Workspace is read-only during the ${d.policy?.post_trial_restrict_days||30}-day recovery period.`,archived:`Workspace is read-only and data is protected in the retention period for up to ${d.policy?.archive_retention_days||183} days.`,restore_window:`Final restoration window is active for ${d.policy?.final_restore_window_days||14} days. Contact support/payment setup to restore access.`,deletion_due:'Retention and restoration windows have ended. Data is marked deletion-due, but this build does not auto-delete; controlled policy/legal review is required.',preserved:'Trial has ended. Workspace data is preserved indefinitely. No active paid subscription is confirmed.',active:'Paid access is active.'};const footer=$('#subscription-footer');if(footer)footer.textContent=`Subscription: ${(life.state||s.status||'unknown').replaceAll('_',' ')} · External services require configured providers`;$('#trial-copy').textContent=descriptions[life.state]||d.note||'Subscription status loaded.';$('#trial-progress-bar').style.width=`${pct}%`;$('#trial-status-pill').textContent=(life.state||s.status||'trialing').replaceAll('_',' ');$('#trial-status-pill').classList.toggle('warn',life.state!=='trialing'&&life.state!=='active');const clock=$('#trial-clock'),label=$('#trial-count-label');if(clock&&label){const target=life.trial_ends_at||life.restricted_until||life.retention_ends_at||life.restore_window_ends_at||life.deletion_due_at;const render=()=>{const ms=target?Math.max(0,new Date(target).getTime()-Date.now()):0,days=Math.floor(ms/86400000),hrs=Math.floor(ms%86400000/3600000),min=Math.floor(ms%3600000/60000),sec=Math.floor(ms%60000/1000);clock.textContent=target?`${days}d ${String(hrs).padStart(2,'0')}:${String(min).padStart(2,'0')}:${String(sec).padStart(2,'0')}`:'—';label.textContent=life.state==='trialing'?'until trial expiry':life.state==='preserved'?'data preserved indefinitely':life.state==='active'?'paid access active':'subscription status'};render();clearInterval(window.__gdsTrialTimer);window.__gdsTrialTimer=setInterval(render,1000)}try{const providers=await api('/api/saas/billing/providers'),grid=$('#billing-provider-grid');if(grid)grid.innerHTML=providers.providers.map(x=>`<article><b>${esc(x.name)}</b><span class="status-pill ${x.ready?'success':'neutral'}">${x.ready?'Ready':'Connect later'}</span><small>${x.ready?'Platform configuration detected.':'Operator credentials are not configured yet.'}</small></article>`).join('')}catch{}}catch(x){if($('#trial-copy'))$('#trial-copy').textContent='Subscription status is temporarily unavailable.'}}
const tooltip=$('#smart-tooltip');function inferredTip(el){if(el.dataset.tip)return el.dataset.tip;const label=(el.getAttribute('aria-label')||el.textContent||'').replace(/\s+/g,' ').trim();if(!label)return'';if(el.matches('[data-view]'))return`Open ${label.replace(/\d+/g,'').trim()} in this workspace.`;if(el.tagName==='A')return`Open ${label}.`;if(el.tagName==='BUTTON')return`${label}.`;return''}function showTip(el,x,y){if(!tooltip||matchMedia('(pointer:coarse)').matches)return;const text=inferredTip(el);if(!text)return;tooltip.textContent=text;tooltip.setAttribute('aria-hidden','false');tooltip.classList.add('show');const pad=14,w=tooltip.offsetWidth||220,h=tooltip.offsetHeight||40;tooltip.style.left=`${Math.min(innerWidth-w-pad,Math.max(pad,x+14))}px`;tooltip.style.top=`${Math.min(innerHeight-h-pad,Math.max(pad,y+16))}px`}function hideTip(){tooltip?.classList.remove('show');tooltip?.setAttribute('aria-hidden','true')}document.addEventListener('pointerover',e=>{const el=e.target.closest('button,a,[data-tip]');if(el)showTip(el,e.clientX,e.clientY)});document.addEventListener('pointermove',e=>{if(tooltip?.classList.contains('show')){const el=e.target.closest('button,a,[data-tip]');if(el)showTip(el,e.clientX,e.clientY)}});document.addEventListener('pointerout',e=>{if(e.target.closest('button,a,[data-tip]'))hideTip()});document.addEventListener('focusin',e=>{const el=e.target.closest('button,a,[data-tip]');if(el){const r=el.getBoundingClientRect();showTip(el,r.left+r.width/2,r.bottom)}});document.addEventListener('focusout',hideTip);
window.addEventListener('hashchange',()=>{if($('#workspace')&&!$('#workspace').hidden){const requested=NAV.resolve(location.hash,currentRole);if(requested&&requested!==currentView)showView(requested,{instant:true})}});
if(location.pathname.endsWith('workspace.html'))boot();else{$('#welcome').hidden=false;const email=sessionStorage.getItem('gds-new-email');if(email&&location.pathname.endsWith('sign-in.html')){$('#login-form').elements.email.value=email;note('Account created. Sign in to continue.');sessionStorage.removeItem('gds-new-email');}}


if(location.pathname.endsWith('sign-in.html'))$('.auth-heading .kicker').textContent='WELCOME BACK';
$('.sidebar-trial-card')?.addEventListener('click',()=>showView('billing'));
// Intelligent workspace finder — live AI guidance, navigation, voice input and spoken answers.
const finder=document.createElement('dialog');
finder.className='modal smart-finder';
finder.innerHTML='<form method="dialog" class="finder-close"><button class="secondary-button" aria-label="Close search">Close</button></form><div class="finder-heading"><span class="panel-kicker">GLOBAL AI SEARCH</span><h2>What do you want to do?</h2><p>Ask naturally about Super Pro, your workspace, setup, security, connections or where to go next.</p></div><div class="finder-input-row"><input id="page-search" type="search" placeholder="Ask or search the workspace…"><button class="secondary-button finder-mic" id="finder-mic" type="button">🎙 Talk</button></div><div class="finder-status" id="finder-status" aria-live="polite"></div><div id="page-results" class="smart-results"></div>';
document.body.append(finder);
let finderRequest=0,finderAnswerText='',finderAnswerLang='en',finderTimer=null,finderAudio=null,finderAudioUrl='';
function stopFinderVoice(){window.SuperProAIClient?.stopSpeech?.();if(finderAudio){try{finderAudio.pause();finderAudio.src=''}catch{}finderAudio=null}if(finderAudioUrl){try{URL.revokeObjectURL(finderAudioUrl)}catch{}finderAudioUrl=''}try{speechSynthesis.cancel()}catch{}}
function finderBrowserSpeak(text,lang='en'){
  if(!('speechSynthesis'in window)||!('SpeechSynthesisUtterance'in window))return false;
  const locale={en:'en-AU',ur:'ur-PK',hi:'hi-IN',pa:'pa-IN',ar:'ar-SA',bn:'bn-BD',ta:'ta-IN',zh:'zh-CN',ja:'ja-JP',ko:'ko-KR',es:'es-ES',fr:'fr-FR'}[lang]||'en-AU';
  const voices=speechSynthesis.getVoices()||[],family=locale.split('-')[0].toLowerCase(),voice=voices.find(v=>String(v.lang||'').toLowerCase()===locale.toLowerCase())||voices.find(v=>String(v.lang||'').toLowerCase().split('-')[0]===family);
  const utterance=new SpeechSynthesisUtterance(String(text||'').replace(/[*_#]/g,' ').replace(/\s+/g,' ').trim());utterance.lang=voice?.lang||locale;if(voice)utterance.voice=voice;utterance.rate=.96;
  utterance.onstart=()=>{$('#finder-status').textContent='Speaking…'};utterance.onend=()=>{$('#finder-status').textContent='Voice reply finished.'};utterance.onerror=()=>{$('#finder-status').textContent='Device voice could not play this reply.'};
  try{speechSynthesis.cancel();speechSynthesis.resume?.();speechSynthesis.speak(utterance);return true}catch{return false}
}
async function speakFinderAnswer(){
  if(!finderAnswerText){$('#finder-status').textContent='Ask a question first.';return}
  stopFinderVoice();
  const runtime=window.SuperProAIClient;
  if(runtime){
    await runtime.ensurePlaybackContext?.();
    await runtime.speak(finderAnswerText,finderAnswerLang,{
      voice:'auto',
      onStatus:(message)=>{$('#finder-status').textContent=message}
    });
    return;
  }
  if(!finderBrowserSpeak(finderAnswerText,finderAnswerLang))$('#finder-status').textContent='Voice playback is unavailable on this browser/device.';
}
async function searchPages(){
  const input=finder.querySelector('input'),term=input.value.trim(),request=++finderRequest,lower=term.toLowerCase();
  const navMatches=viewSequence.filter(v=>!term||pageMeta[v][1].toLowerCase().includes(lower)||pageMeta[v][0].toLowerCase().includes(lower));
  const actions=window.GDSProductGuide?.findActions(term)||[];
  const ordered=[...new Set([...actions.map(a=>a.view),...navMatches])].slice(0,6);
  let html=ordered.map(v=>'<button class="finder-result" type="button" data-result="'+v+'"><span>'+String(viewSequence.indexOf(v)+1).padStart(2,'0')+'</span><div><b>'+esc(pageMeta[v][1])+'</b><small>'+esc(pageMeta[v][0])+' · open workspace area</small></div><i>→</i></button>').join('');
  if(term){html+='<article class="finder-answer waiting"><span>AI</span><div><b>Super Pro AI</b><p>Thinking about your question…</p></div></article>'}
  finder.querySelector('#page-results').innerHTML=html||'<p class="muted">Start typing what you want to accomplish.</p>';
  finder.querySelectorAll('[data-result]').forEach(b=>b.onclick=()=>{finder.close();showView(b.dataset.result)});
  if(!term){finderAnswerText='';return}
  try{
    const guide=await (window.GDSProductGuide?.answerAsync?.(term,'workspace',currentView,'auto')||Promise.resolve(window.GDSProductGuide?.answer?.(term,'workspace',currentView)));
    if(request!==finderRequest)return;
    finderAnswerText=guide?.text||'Tell me the outcome you want and I will guide you to the closest workspace area.';
    finderAnswerLang=guide?.language||window.GDSProductGuide?.detectLanguage?.(term)||'en';
    const waiting=finder.querySelector('.finder-answer.waiting');
    if(waiting)waiting.outerHTML='<article class="finder-answer"><span>AI</span><div><b>Super Pro AI</b><p>'+esc(finderAnswerText)+'</p><div class="finder-answer-actions"><button type="button" class="secondary-button compact" id="finder-hear-answer">🔊 Hear answer</button></div></div></article>';
    finder.querySelector('#finder-hear-answer')?.addEventListener('click',speakFinderAnswer);
  }catch(err){
    if(request!==finderRequest)return;
    const waiting=finder.querySelector('.finder-answer.waiting');if(waiting)waiting.innerHTML='<span>!</span><div><b>AI answer unavailable</b><p>'+esc(err.message||'Please try again.')+'</p></div>';
  }
}
function scheduleFinderSearch(){clearTimeout(finderTimer);finderTimer=setTimeout(searchPages,220)}
function openFinder(seed=''){finder.showModal();const input=finder.querySelector('input');input.value=seed;searchPages();input.focus()}
$('.search-button')?.addEventListener('click',()=>openFinder());
finder.querySelector('input').addEventListener('input',scheduleFinderSearch);
finder.addEventListener('close',stopFinderVoice);
document.addEventListener('keydown',e=>{if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='k'&&!$('#workspace').hidden){e.preventDefault();openFinder()}});
(()=>{
  const mic=finder.querySelector('#finder-mic'),R=window.SpeechRecognition||window.webkitSpeechRecognition;
  let listening=false,recognition=null;
  const finish=()=>{listening=false;mic.classList.remove('listening');mic.textContent='🎙 Talk'};
  function browserFallback(){
    if(!R){finish();$('#finder-status').textContent='Voice input is unavailable on this browser/device.';return}
    if(!recognition){
      recognition=new R();recognition.interimResults=true;recognition.continuous=false;recognition.lang=navigator.language||'en-AU';
      recognition.onstart=()=>{listening=true;mic.classList.add('listening');mic.textContent='Listening…';$('#finder-status').textContent='Listening with device recognition…'};
      recognition.onresult=e=>{let spoken='';for(let i=e.resultIndex;i<e.results.length;i++)spoken+=e.results[i][0].transcript;finder.querySelector('input').value=spoken.trim();scheduleFinderSearch()};
      recognition.onend=finish;
      recognition.onerror=e=>{finish();$('#finder-status').textContent=e.error==='not-allowed'?'Microphone permission is blocked.':'Voice recognition could not start.'};
    }
    try{recognition.start()}catch{finish()}
  }
  async function start(){
    const runtime=window.SuperProAIClient;
    if(runtime?.isListening?.()){runtime.stopListening();return}
    if(listening){try{recognition?.stop()}catch{};return}
    stopFinderVoice();
    if(!runtime){browserFallback();return}
    try{
      const result=await runtime.listen({
        language:'auto',
        onStatus:(message)=>{$('#finder-status').textContent=message},
        onListening:(active)=>{listening=active;mic.classList.toggle('listening',active);mic.textContent=active?'Listening…':'🎙 Talk'}
      });
      if(result?.text){
        finder.querySelector('input').value=result.text;
        $('#finder-status').textContent=`Detected ${String(result.language||'auto').toUpperCase()} · searching…`;
        scheduleFinderSearch();
      }
    }catch(err){finish();$('#finder-status').textContent=err.message||'Voice transcription failed. Please try again.'}
  }
  mic.onclick=start;
})();;
$('[aria-label="Notifications"]')?.addEventListener('click',()=>{showView('dashboard');note('Review the command centre for current activity and attention items.');});

// Content Studio media library lives in workspace-media.js.
(()=>{
  document.querySelectorAll('.studio-workflow button').forEach((b,i)=>b.onclick=()=>{document.querySelectorAll('.studio-workflow button').forEach(x=>x.classList.remove('active'));b.classList.add('active');const targets=['.source-library-panel','.source-library-panel','#video-form','#video-form','.trend-panel','#renders'];const target=document.querySelector(targets[i]);target?.dispatchEvent(new CustomEvent('superpro:reveal-section',{bubbles:true}));target?.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'start'})});})();


// v8 premium onboarding, guided tour and persistent AI co-pilot.
function maybeStartTour(me){
  const key=`gds-tour-${me?.organisation?.slug||'workspace'}`;
  const forced=sessionStorage.getItem('gds-run-tour')==='1';
  if(!forced&&localStorage.getItem(key)==='done')return;
  sessionStorage.removeItem('gds-run-tour');
  if(window.SuperProTour){window.SuperProTour.start({onDone:()=>{localStorage.setItem(key,'done');const setupKey=key+'-setup';const first=localStorage.getItem(setupKey)!=='prompted';localStorage.setItem(setupKey,'prompted');showView(first?'onboarding':'dashboard',{instant:true});note(first?'Tour finished. Next, set up your business so every page fits your industry.':'Tour complete. Use the search bar or the assistant whenever you need help.')}});return}
  // Titles and order come from the navigation module; only the explanatory copy lives here.
  const tourCopy={
    dashboard:'Start here. Super Pro AI Office Manager surfaces workforce readiness, allocation risk and the next operational items needing attention.',
    onboarding:'Choose your industry template, services, brand voice, approval policy and permanent AI instructions.',
    workforce:'Add yourself and your team, then track work rights, skills, documents and scheduling readiness.',
    jobs:'Create work orders and match only workers who meet the required level, skills and compliance rules.',
    finance:'Authorised senior users can track operational revenue, stock and service costs, overheads and per-job net profit. This is not statutory accounting or tax advice.',
    assistant:'Save operational instructions and build organisation-scoped AI memory. Live generative responses require an approved model connection.',
    approvals:'Review pending consequential actions, save human-control rules and keep a tenant-scoped decision history before external execution.',
    video:'Reuse media, create AI-assisted render specifications and optimise content for each connected platform.',
    integrations:'Choose the business platforms you want to use. Customers never enter developer secrets; app-level provider credentials stay protected server-side.',
    governance:'Review role-aware policies, complaints, escalation, security alerts and senior-only tamper-evident audit evidence.',
    support:'Use support and protected reporting pathways. Review complaint rights and escalation options.',
    manual:'See your live location in the application map, get role-aware instructions, and jump directly to the next task or Help Desk.',
    billing:'Review trial status and plan access. Paid billing remains disabled until a payment provider and explicit authority are configured.'
  };
  const steps=viewSequence.filter(v=>tourCopy[v]).map(v=>[v,pageMeta[v][1],tourCopy[v]]);
  const dialog=document.createElement('dialog');dialog.className='tour-dialog';let index=0;
  function draw(){const [view,title,copy]=steps[index];showView(view,{instant:true});dialog.innerHTML=`<div class="tour-progress"><span style="width:${((index+1)/steps.length)*100}%"></span></div><div class="tour-step"><span class="tour-count">${String(index+1).padStart(2,'0')} / ${String(steps.length).padStart(2,'0')}</span><p class="panel-kicker">FIRST WORKSPACE TOUR</p><h2>${esc(title)}</h2><p>${esc(copy)}</p><div class="tour-actions"><button class="text-button" data-tour-skip type="button">Skip tour</button><div><button class="secondary-button" data-tour-back type="button" ${index===0?'disabled':''}>← Back</button><button class="primary-button" data-tour-next type="button">${index===steps.length-1?'Finish setup tour':'Next →'}</button></div></div></div>`;dialog.querySelector('[data-tour-skip]').onclick=finish;dialog.querySelector('[data-tour-back]').onclick=()=>{if(index>0){index--;draw()}};dialog.querySelector('[data-tour-next]').onclick=()=>{if(index<steps.length-1){index++;draw()}else finish()}}
  function finish(){localStorage.setItem(key,'done');dialog.close();dialog.remove();const setupKey=key+'-setup';const first=localStorage.getItem(setupKey)!=='prompted';localStorage.setItem(setupKey,'prompted');showView(first?'onboarding':'dashboard',{instant:true});note(first?'Tour finished. Next, set up your business so every page fits your industry.':'Guided tour complete. You can use AI Search or the floating assistant whenever you need help.')}
  document.body.append(dialog);dialog.showModal();draw();
}

(function installCopilot(){
  if($('#gds-copilot'))return;
  const shell=document.createElement('div');shell.id='gds-copilot';shell.className='copilot';shell.innerHTML=`<button class="copilot-launch" type="button" aria-label="Open Super Pro AI co-pilot"><span>AI</span><b>Ask Super Pro</b><i>Voice + typing</i></button><section class="copilot-panel" hidden><header><div><span class="ai-orb">AI</span><div><b>Super Pro Co-pilot</b><small>Workspace guidance · no silent external actions</small></div></div><div style="display:flex;gap:6px"><select data-copilot-voice-style aria-label="Voice preference" title="Voice preference" style="max-width:92px"><option value="auto">Auto voice</option><option value="female">Female</option><option value="male">Male</option></select><button class="icon-button active" data-copilot-speaker aria-label="Toggle spoken replies" type="button" aria-pressed="true" title="Toggle spoken replies">🔊</button><button class="icon-button" data-copilot-voice-test type="button" title="Test voice">▶</button><button class="icon-button" data-copilot-close aria-label="Close Super Pro AI" type="button">×</button></div></header><div class="copilot-log"><div class="copilot-message ai"><b>How can I help?</b><p>Ask a specific question about Super Pro, your workspace, setup, security, connections, jobs, staff, Content Studio or where to go next.</p></div></div><div class="copilot-suggestions"><button type="button">How do I add an employee?</button><button type="button">Open Content Studio</button><button type="button">What should I set up next?</button></div><form><button class="copilot-mic" type="button">◉</button><textarea rows="1" placeholder="Ask Super Pro…"></textarea><button class="copilot-send" type="submit">➜</button></form><div class="copilot-voice-status" aria-live="polite" style="padding:0 14px 12px;color:var(--muted);font-size:12px">Spoken replies are on.</div></section>`;
  document.body.append(shell);
  const panel=shell.querySelector('.copilot-panel'),launch=shell.querySelector('.copilot-launch'),log=shell.querySelector('.copilot-log'),text=shell.querySelector('textarea'),voiceStatus=shell.querySelector('.copilot-voice-status');
  const speaker=shell.querySelector('[data-copilot-speaker]'),voiceTest=shell.querySelector('[data-copilot-voice-test]');
  let lastCopilotTopic='',voiceOn=localStorage.getItem('superpro_copilot_voice')!=='off',speechRun=0,activeVoiceAudio=null,activeVoiceUrl='';
  const localeMap={en:'en-AU',ur:'ur-PK',hi:'hi-IN',pa:'pa-IN',ar:'ar-SA',zh:'zh-CN',ja:'ja-JP',ko:'ko-KR',bn:'bn-BD',ta:'ta-IN',es:'es-ES',fr:'fr-FR'}; const recognitionLocales=['en-AU','ur-PK','hi-IN','pa-IN','ar-SA','zh-CN','ja-JP','ko-KR','bn-BD','ta-IN','es-ES','fr-FR'];
  const voiceStyle=shell.querySelector('[data-copilot-voice-style]'); let voicePreference=localStorage.getItem('superpro_copilot_voice_style')||'auto';
  if(voiceStyle){voiceStyle.value=voicePreference;voiceStyle.onchange=()=>{voicePreference=voiceStyle.value;localStorage.setItem('superpro_copilot_voice_style',voicePreference);voiceStatus.textContent=`Voice preference: ${voicePreference}. Language matching takes priority.`}};
  function syncFloatingChats(active=''){
    const staff=document.querySelector('#gds-staff-chat'),staffLaunch=staff?.querySelector('.sc-launch'),staffPanel=staff?.querySelector('.sc-panel');
    if(active==='copilot'){if(staffPanel)staffPanel.hidden=true;if(staffLaunch)staffLaunch.hidden=true}
    else if(!panel.hidden){if(staffLaunch)staffLaunch.hidden=true}
    else if(staffLaunch)staffLaunch.hidden=false;
    window.dispatchEvent(new CustomEvent('superpro:floating-chat',{detail:{active}}));
  }
  launch.onclick=()=>{panel.hidden=false;launch.hidden=true;syncFloatingChats('copilot');text.focus()};
  shell.querySelector('[data-copilot-close]').onclick=()=>{panel.hidden=true;launch.hidden=false;stopVoice(true);syncFloatingChats('')};
  window.addEventListener('superpro:floating-chat',e=>{if(e.detail?.active==='staff'){panel.hidden=true;launch.hidden=true;stopVoice(true)}else if(!e.detail?.active&&panel.hidden)launch.hidden=false});
  const femaleVoiceHints=/female|heera|sana|samantha|victoria|aria|jenny|zira|hazel|karen|tessa|susan|sonia|natasha|veena|ava|emma|olivia|neerja|shimmer|nova|marin/i;
  const maleVoiceHints=/male|asad|david|mark|guy|ryan|george|daniel|james|ravi|hemant|imran|liam|aaron|onyx|cedar/i;
  const speechSupported='speechSynthesis' in window&&'SpeechSynthesisUtterance' in window;
  function languageOf(value){return window.GDSProductGuide?.detectLanguage?.(value)||'en'}
  function cleanSpeech(value){return (window.GDSProductGuide?.cleanSpeech?.(value)||String(value||'')).replace(/https?:\/\/\S+/gi,'').replace(/\s+/g,' ').trim()}
  let replyToken=0,answerController=null;
  function stopVoice(cancelReply=false){
    speechRun++;if(cancelReply){replyToken++;answerController?.abort()}
    try{window.SuperProAIClient?.stopSpeech?.();window.SuperProAIClient?.stopListening?.(true)}catch{}
    if(activeVoiceAudio){try{activeVoiceAudio.pause();activeVoiceAudio.src=''}catch{}activeVoiceAudio=null}
    if(activeVoiceUrl){try{URL.revokeObjectURL(activeVoiceUrl)}catch{}activeVoiceUrl=''}
    if(speechSupported){speechSynthesis.cancel();speechSynthesis.resume?.()}
    try{browserRecognition?.abort()}catch{}
  }
  function matchingVoice(locale){
    if(!speechSupported)return null;const list=speechSynthesis.getVoices()||[],family=locale.split('-')[0].toLowerCase();
    const exact=list.filter(v=>String(v.lang||'').toLowerCase()===locale.toLowerCase()),same=list.filter(v=>String(v.lang||'').toLowerCase().split('-')[0]===family),pool=exact.length?exact:same;
    if(voicePreference==='female'){const v=pool.find(x=>femaleVoiceHints.test(x.name));if(v)return v}
    if(voicePreference==='male'){const v=pool.find(x=>maleVoiceHints.test(x.name));if(v)return v}
    return pool.find(v=>v.default)||pool[0]||null;
  }
  function browserSpeak(spoken,lang,run){
    if(!speechSupported||run!==speechRun||!voiceOn){voiceStatus.textContent='Voice playback is unavailable on this device.';return}
    const locale=localeMap[lang]||'en-AU',voice=matchingVoice(locale),chunks=spoken.match(/.{1,220}(?:\s|$)/g)||[spoken];let i=0;
    const next=()=>{if(run!==speechRun||!voiceOn)return;if(i>=chunks.length){voiceStatus.textContent='Voice reply finished.';return}
      const u=new SpeechSynthesisUtterance(chunks[i++].trim());u.lang=voice?.lang||locale;if(voice)u.voice=voice;u.rate=.96;u.pitch=1;
      u.onstart=()=>voiceStatus.textContent=`Speaking with device voice · ${u.lang}`;
      u.onend=next;
      u.onerror=e=>{const type=String(e?.error||'');if(!/canceled|interrupted/i.test(type))voiceStatus.textContent='Voice playback could not continue. Tap ▶ to test voice.'};
      try{speechSynthesis.resume?.();speechSynthesis.speak(u)}catch{voiceStatus.textContent='Voice playback could not start. Tap ▶ to test voice.'}
    };next()
  }
  async function speakReply(value,lang='en'){
    if(!voiceOn)return;
    const spoken=cleanSpeech(value);if(!spoken)return;
    const runtime=window.SuperProAIClient;
    if(runtime){
      const run=speechRun;
      await runtime.ensurePlaybackContext?.();
      if(!voiceOn||panel.hidden||run!==speechRun)return;
      return runtime.speak(spoken,lang,{
        voice:voicePreference,
        onStatus:(message)=>{voiceStatus.textContent=message}
      });
    }
    stopVoice();const run=++speechRun;
    return browserSpeak(spoken,lang,run);
  }
  async function reply(q){
    const myToken=++replyToken;answerController?.abort();const controller=new AbortController();answerController=controller;
    const actions=window.GDSProductGuide?.findActions(q)||[],best=actions[0];
    log.insertAdjacentHTML('beforeend',`<div class="copilot-message user"><p>${esc(q)}</p></div><div class="copilot-message ai waiting"><b>Super Pro AI</b><p>Thinking about your actual question…</p></div>`);log.scrollTop=log.scrollHeight;
    const waiting=log.querySelector('.waiting:last-of-type');let guide;
    try{guide=await (window.GDSProductGuide?.answerAsync?.(q,`workspace:${currentView}`,lastCopilotTopic,'auto',{signal:controller.signal})||Promise.resolve(window.GDSProductGuide?.answer(q,'workspace',lastCopilotTopic)))}catch{guide=window.GDSProductGuide?.answer(q,'workspace',lastCopilotTopic)}
    if(myToken!==replyToken){waiting?.remove();return}
    if(guide?.topic)lastCopilotTopic=guide.topic;waiting?.remove();
    const shouldNavigate=best&&/(open|show|go|take me|where|add|find|connect|खोल|दिखा|جاؤ|کھول)/i.test(q);
    if(shouldNavigate){showView(best.view);log.insertAdjacentHTML('beforeend',`<div class="copilot-message ai"><b>Opened ${esc(best.label)}</b><p>${esc(guide?.text||'I took you to the closest workspace area.')}</p></div>`)}
    else{log.insertAdjacentHTML('beforeend',`<div class="copilot-message ai"><b>Super Pro AI</b><p>${esc(guide?.text||'Tell me the outcome you want and I will give you the next practical step.')}</p></div>`)}
    log.scrollTop=log.scrollHeight;text.value='';
    if(guide?.text&&myToken===replyToken)speakReply(guide.text,guide.language||languageOf(q));
  }
  shell.querySelector('form').onsubmit=e=>{e.preventDefault();const q=text.value.trim();if(q){stopVoice();reply(q)}};shell.querySelectorAll('.copilot-suggestions button').forEach(b=>b.onclick=()=>reply(b.textContent));
  speaker.classList.toggle('active',voiceOn);speaker.innerHTML=speakerIcon(voiceOn);speaker.setAttribute('aria-pressed',String(voiceOn));
  speaker.onclick=()=>{voiceOn=!voiceOn;localStorage.setItem('superpro_copilot_voice',voiceOn?'on':'off');speaker.classList.toggle('active',voiceOn);speaker.innerHTML=speakerIcon(voiceOn);speaker.setAttribute('aria-pressed',String(voiceOn));if(!voiceOn){stopVoice();voiceStatus.textContent='Spoken replies are off.'}else{voiceStatus.textContent='Spoken replies are on. Tap ▶ if you want to test the device voice.'}};
  voiceTest.onclick=()=>{if(!speechSupported){voiceStatus.textContent='This browser does not expose speech playback.';return}voiceOn=true;localStorage.setItem('superpro_copilot_voice','on');speaker.classList.add('active');speaker.innerHTML=speakerIcon(true);speaker.setAttribute('aria-pressed','true');speakReply('Super Pro voice is ready. Ask me a question and I will answer aloud.','en')};
  const R=window.SpeechRecognition||window.webkitSpeechRecognition,mic=shell.querySelector('.copilot-mic');
  let copilotRecorder=null,copilotStream=null,copilotListening=false;
  async function copilotAutoListen(){
    stopVoice();
    const runtime=window.SuperProAIClient;
    if(runtime){
      if(runtime.isListening?.()){runtime.stopListening?.();return}
      try{
        const result=await runtime.listen({
          language:'auto',
          onStatus:(message)=>{voiceStatus.textContent=message},
          onListening:(active)=>{copilotListening=active;mic.classList.toggle('listening',active)}
        });
        if(result?.text&&!panel.hidden){
          text.value=result.text;
          const lang=result.language||languageOf(result.text);
          voiceStatus.textContent=`Detected ${String(lang).toUpperCase()} · preparing reply…`;
          await reply(result.text);
        }
      }catch(err){voiceStatus.textContent=err.message||'Voice transcription failed. Please try again.'}
      return;
    }
    if(!navigator.mediaDevices?.getUserMedia||!window.MediaRecorder){
      if(!R){voiceStatus.textContent='Voice input is not supported in this browser.';return}
      browserListen();return;
    }
    browserListen();
  }
  let browserRecognition=null;
  function browserListen(){
    if(!R){voiceStatus.textContent='Voice input is not supported in this browser.';return}
    if(!browserRecognition){
      let finalTranscript='';browserRecognition=new R();browserRecognition.interimResults=true;browserRecognition.continuous=false;browserRecognition.maxAlternatives=3;
      browserRecognition.onstart=()=>{copilotListening=true;mic.classList.add('listening');voiceStatus.textContent=`Listening · ${browserRecognition.lang}. Speak naturally…`};
      browserRecognition.onresult=e=>{let q='';for(let i=0;i<e.results.length;i++)q+=e.results[i][0].transcript+' ';finalTranscript=q.trim();text.value=finalTranscript;const detected=languageOf(finalTranscript);voiceStatus.textContent=`Heard ${detected.toUpperCase()} · preparing reply…`;if(e.results[e.results.length-1].isFinal&&finalTranscript){const run=speechRun;setTimeout(()=>{if(!panel.hidden&&run===speechRun)reply(finalTranscript)},180)}};
      browserRecognition.onend=()=>{copilotListening=false;mic.classList.remove('listening')};
      browserRecognition.onerror=e=>{copilotListening=false;mic.classList.remove('listening');voiceStatus.textContent=e.error==='not-allowed'?'Microphone permission is blocked.':'Voice recognition could not start.'};
    }
    const nav=String(navigator.language||'').toLowerCase();browserRecognition.lang=recognitionLocales.find(x=>x.toLowerCase()===nav)||recognitionLocales.find(x=>x.toLowerCase().split('-')[0]===nav.split('-')[0])||'en-AU';
    try{browserRecognition.start()}catch{}
  }
  window.addEventListener('superpro:ask',event=>{const q=String(event.detail?.question||'').trim();if(!q)return;panel.hidden=false;launch.hidden=true;syncFloatingChats('copilot');stopVoice();reply(q)});
  window.addEventListener('pagehide',()=>stopVoice(true));
  document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!panel.hidden)shell.querySelector('[data-copilot-close]').click()});
  mic.onclick=()=>{const runtime=window.SuperProAIClient;if(runtime?.isListening?.()){runtime.stopListening();return}stopVoice();if(copilotListening){try{browserRecognition?.stop()}catch{};return}copilotAutoListen()};
})();

$('#replay-tour')?.addEventListener('click',async()=>{try{const me=await api('/api/saas/me');localStorage.removeItem(`gds-tour-${me.organisation.slug}`);sessionStorage.setItem('gds-run-tour','1');maybeStartTour(me)}catch(e){note(e.message,true)}});

// Premium Trust & Governance layer — role-aware policies, protected complaints,
// senior-only audit evidence and self-service integration preparation.
let governanceLoadedAt=0;
async function loadGovernance(force=false){
  if(!$('#governance-view'))return;
  if(!force&&Date.now()-governanceLoadedAt<5000)return;
  governanceLoadedAt=Date.now();
  const d=await api('/api/saas/governance/overview');
  const industry=$('#gov-industry-copy');
  if(industry)industry.textContent=`${d.industry||'Your business'} governance profile · Australian launch configuration · role: ${d.role}. Policies and workflows stay organisation-scoped so business profiles do not mix.`;
  const chips=$('#gov-control-chips');
  if(chips)chips.innerHTML=Object.entries(d.controls||{}).map(([k,v])=>`<span class="${v?'good':''}">${v?'✓':'○'} ${esc(k.replaceAll('_',' '))}</span>`).join('');
  renderGovernancePolicies(d.policies||[]);
  renderGovernanceStats(d.case_counts||[],d.notifications||[],d.senior_access);
  renderGovernanceNotifications(d.notifications||[],d.senior_access);
  renderGovernanceAudit(d.audit||[],d.ledger||[],d.senior_access);
  if(d.senior_access){
    const cases=await api('/api/saas/governance/cases').catch(()=>({cases:[]}));
    renderGovernanceCases(cases.cases||[]);
  }else{
    const el=$('#gov-case-list');if(el)el.innerHTML='<div class="gov-restricted"><b>Your complaint rights remain available.</b><br>Case administration and organisation-wide complaint records are restricted to authorised senior roles. Use the Help Desk to submit or report a concern.</div>';
  }
}
function renderGovernancePolicies(items){
  const el=$('#gov-policy-list');if(!el)return;
  if(!items.length){el.innerHTML='<div class="gov-empty">No role-matched policies are configured yet.</div>';return}
  el.innerHTML=items.map(p=>`<article class="gov-policy"><div class="gov-policy-top"><div><b>${esc(p.title)}</b><small>Version ${esc(p.version)} · ${esc(p.source_note||'Governance template')}</small></div><span class="gov-tag ${p.acknowledged?'ack':''}">${p.acknowledged?'Acknowledged':p.requires_ack?'Review required':'Reference'}</span></div><p>${esc(p.summary)}</p><div class="gov-policy-detail" id="policy-detail-${esc(p.id)}" hidden>${esc(p.body_markdown)}</div><div class="gov-policy-actions"><button class="gov-mini-button" type="button" data-policy-read="${esc(p.id)}">Read policy</button>${p.requires_ack&&!p.acknowledged?`<button class="gov-mini-button" type="button" data-policy-ack="${esc(p.id)}">Acknowledge</button>`:''}</div></article>`).join('');
  el.querySelectorAll('[data-policy-read]').forEach(b=>b.onclick=()=>{const detail=$(`#policy-detail-${CSS.escape(b.dataset.policyRead)}`);if(detail){detail.hidden=!detail.hidden;b.textContent=detail.hidden?'Read policy':'Hide policy'}});
  el.querySelectorAll('[data-policy-ack]').forEach(b=>b.onclick=async()=>{b.disabled=true;try{await api(`/api/saas/governance/policies/${encodeURIComponent(b.dataset.policyAck)}/acknowledge`,{method:'POST',body:'{}'});note('Policy acknowledgement recorded in the governance audit trail.');await loadGovernance(true)}catch(e){b.disabled=false;note(e.message,true)}});
}
function renderGovernanceStats(rows,notifications,senior){
  const el=$('#gov-case-stats');if(!el)return;
  if(!senior){el.innerHTML='<div class="gov-stat"><strong>Role</strong><span>Private access</span></div><div class="gov-stat"><strong>✓</strong><span>Help available</span></div><div class="gov-stat"><strong>✓</strong><span>Policy access</span></div><div class="gov-stat"><strong>✓</strong><span>Protected routing</span></div>';return}
  const count=(predicate)=>rows.filter(predicate).reduce((sum,r)=>sum+Number(r.count||0),0);
  const open=count(r=>!['resolved','closed'].includes(r.status));
  const high=count(r=>r.severity==='high');
  const critical=count(r=>r.severity==='critical');
  const unread=notifications.filter(n=>n.status!=='read').length;
  el.innerHTML=`<div class="gov-stat"><strong>${open}</strong><span>Open</span></div><div class="gov-stat"><strong>${high}</strong><span>High risk</span></div><div class="gov-stat"><strong>${critical}</strong><span>Critical</span></div><div class="gov-stat"><strong>${unread}</strong><span>Unread alerts</span></div>`;
}
function renderGovernanceCases(items){
  const el=$('#gov-case-list');if(!el)return;
  if(!items.length){el.innerHTML='<div class="gov-empty">No organisation complaints or support cases yet.</div>';return}
  el.innerHTML=items.slice(0,30).map(c=>`<article class="gov-case"><div class="gov-case-top"><div><b>${esc(c.reference_code)} · ${esc(c.subject)}</b><small>${esc(c.reporter_type)} · ${esc(c.category.replaceAll('_',' '))} · ${new Date(c.created_at).toLocaleString()}</small></div><span class="gov-tag ${esc(c.severity)}">${esc(c.severity)}</span></div><p>${esc(c.triage_summary||'')}</p><div class="gov-case-actions"><select class="gov-mini-button" data-case-status="${esc(c.id)}"><option value="open" ${c.status==='open'?'selected':''}>Open</option><option value="acknowledged" ${c.status==='acknowledged'?'selected':''}>Acknowledged</option><option value="investigating" ${c.status==='investigating'?'selected':''}>Investigating</option><option value="waiting_on_reporter" ${c.status==='waiting_on_reporter'?'selected':''}>Waiting on reporter</option><option value="resolved" ${c.status==='resolved'?'selected':''}>Resolved</option><option value="closed" ${c.status==='closed'?'selected':''}>Closed</option></select>${c.confidential?'<span class="gov-tag">Confidential</span>':''}</div></article>`).join('');
  el.querySelectorAll('[data-case-status]').forEach(select=>select.onchange=async()=>{select.disabled=true;try{await api(`/api/saas/governance/cases/${encodeURIComponent(select.dataset.caseStatus)}/status`,{method:'POST',body:JSON.stringify({status:select.value})});note('Case status updated and recorded in the governance ledger.');await loadGovernance(true)}catch(e){select.disabled=false;note(e.message,true)}});
}
function renderGovernanceNotifications(items,senior){
  const el=$('#gov-notification-list');if(!el)return;
  if(!senior){el.innerHTML='<div class="gov-restricted">Organisation-wide security and complaint alerts are restricted to authorised senior roles.</div>';return}
  if(!items.length){el.innerHTML='<div class="gov-empty">No governance alerts yet.</div>';return}
  el.innerHTML=items.slice(0,20).map(n=>`<article class="gov-notification"><div class="gov-notification-top"><div><b>${esc(n.title)}</b><small>${new Date(n.created_at).toLocaleString()} · ${esc(n.notification_type.replaceAll('_',' '))}</small></div><span class="gov-tag ${esc(n.severity)}">${esc(n.status)}</span></div><p>${esc(n.message)}</p>${n.status!=='read'?`<div class="gov-policy-actions"><button class="gov-mini-button" data-alert-read="${esc(n.id)}" type="button">Mark read</button></div>`:''}</article>`).join('');
  el.querySelectorAll('[data-alert-read]').forEach(b=>b.onclick=async()=>{try{await api(`/api/saas/governance/notifications/${encodeURIComponent(b.dataset.alertRead)}/read`,{method:'POST',body:'{}'});await loadGovernance(true)}catch(e){note(e.message,true)}});
}
function renderGovernanceAudit(audit,ledger,senior){
  const el=$('#gov-audit-list');if(!el)return;
  if(!senior){el.innerHTML='<div class="gov-restricted">Activity logs and tamper-evident governance evidence are restricted to Owner, Admin, Manager, Director or equivalent authorised senior roles.</div>';return}
  const items=[...ledger.slice(0,10).map(x=>({...x,kind:'Ledger'})),...audit.slice(0,10).map(x=>({...x,kind:'Audit'}))].sort((a,b)=>String(b.created_at).localeCompare(String(a.created_at))).slice(0,16);
  if(!items.length){el.innerHTML='<div class="gov-empty">No governance evidence has been written yet.</div>';return}
  el.innerHTML=items.map(x=>`<article class="gov-audit"><div class="gov-audit-top"><div><b>${esc(x.event_type)}</b><small>${esc(x.kind)} · ${new Date(x.created_at).toLocaleString()} · ${esc(x.entity_type||'system')}</small></div><span class="gov-tag">Verified hash</span></div><code class="gov-hash">${esc(x.event_hash||x.payload_hash||'hash pending')}</code></article>`).join('');
}

let integrationsLoadedAt=0;
const integrationHelp={
  meta:'Connect Facebook Pages and Instagram professional accounts through Meta authorisation.',
  whatsapp:'Connect a WhatsApp Business account through the approved Meta/WhatsApp business flow.',
  tiktok:'Authorise the TikTok account through TikTok OAuth. Super Pro never stores the TikTok password.',
  youtube:'Authorise the Google account and select the YouTube channel permitted for publishing and analytics.',
  snapchat:'Authorise the Snapchat business account through the provider consent flow when platform credentials are ready.',
  x:'Authorise the X account through X OAuth when the Super Pro app credentials are configured.',
  google_business:'Authorise Google and select the Business Profile locations this workspace may manage.',
  website:'Configure your website form/webhook endpoint. No social-media password is required.',
  email_sms:'Connect the platform-managed email/SMS provider and configure sender identity/consent rules.'
};
async function loadSelfServiceIntegrations(force=false){
  const view=$('#integrations-view');if(!view)return;
  if(!force&&Date.now()-integrationsLoadedAt<5000)return;integrationsLoadedAt=Date.now();
  const grid=$('#self-service-integration-grid');if(!grid)return;
  grid.innerHTML='<div class="gov-empty">Checking provider readiness and saved workspace choices…</div>';
  try{
    const d=await api('/api/saas/integrations/self-service');
    grid.innerHTML=d.integrations.map(x=>{
      const connected=x.status==='connected',prepared=x.status==='setup_ready',ready=Boolean(x.provider_ready);
      const state=connected?'Connected':ready?(prepared?'Ready to authorise':'Provider ready'):'Provider configuration required';
      const action=connected?'Manage connection':ready?'Connect / Authorise':'What is needed';
      return `<article class="integration-card self-service" data-provider-card="${esc(x.provider)}"><span class="integration-logo">${esc((x.display_name||x.provider).slice(0,1))}</span><div><b>${esc(x.display_name)}</b><small>${esc((x.capabilities||[]).join(' · '))}</small><div class="integration-note-inline ${ready?'provider-ready':'provider-pending'}">${esc(state)}</div>${x.account_label?`<div class="integration-note-inline">Account: ${esc(x.account_label)}</div>`:''}${(!ready&&!connected&&(x.missing_setup||[]).length)?`<div class="integration-note-inline provider-pending">Waiting for the administrator to add: ${esc(x.missing_setup.join(', '))}</div>`:''}</div><button type="button" data-connect-provider="${esc(x.provider)}" data-ready="${ready?'1':'0'}" data-status="${esc(x.status||'not_connected')}">${action}</button></article>`;
    }).join('');
    grid.querySelectorAll('[data-connect-provider]').forEach(b=>b.onclick=async()=>{
      const provider=b.dataset.connectProvider,ready=b.dataset.ready==='1',status=b.dataset.status;
      if(status==='connected'){note('This connection is already authorised. Connection management and disconnect controls become available from the provider session record.');return}
      if(!ready){const miss=(b.closest('.integration-card')?.querySelector('.provider-pending+.provider-pending')?.textContent||'').replace('Waiting for the administrator to add: ','');note(integrationHelp[provider]+' This connection is not switched on yet. The Super Pro administrator needs to add'+(miss?': '+miss:' the provider credentials')+' in the hosting settings. You never type a social-media password here.',true);return}
      b.disabled=true;
      try{
        const r=await api(`/api/saas/integrations/self-service/${encodeURIComponent(provider)}/authorise`,{method:'POST',body:'{}'});
        if(r.authorize_url){location.href=r.authorize_url;return}
        note(r.message||integrationHelp[provider]);
        await loadSelfServiceIntegrations(true);
      }catch(e){note(e.message||integrationHelp[provider],true);b.disabled=false}
    });
  }catch(e){grid.innerHTML=`<div class="gov-empty">${esc(e.message||'Connections could not be loaded.')}</div>`}
}


$('#open-help-desk')?.addEventListener('click',()=>window.GDSSupport?.open?.());

$('#ai-design-business')?.addEventListener('click',async()=>{
  const f=$('#onboarding-form'),description=$('#business-description')?.value?.trim(),button=$('#ai-design-business');
  if(!description){note('Describe your business first so AI can design a relevant starting structure.',true);return}
  button.disabled=true;button.textContent='AI is designing your workspace…';
  try{
    const d=await api('/api/saas/onboarding/ai-design',{method:'POST',body:JSON.stringify({
      business_description:description,
      industry_code:f.elements.industry_code?.value||selectedIndustryCode,
      business_structure:f.elements.business_structure.value,
      team_mode:f.elements.team_mode.value
    })});
    const x=d.design||{};
    f.elements.business_type.value=x.business_type||f.elements.business_type.value;
    f.elements.services.value=(x.services||[]).join('\n');
    if(f.elements.custom_sections)f.elements.custom_sections.value=(x.custom_sections||[]).join('\n');
    if(!f.elements.brand_voice.value.trim())f.elements.brand_voice.value=x.brand_voice||'';
    if(!f.elements.ai_instructions.value.trim())f.elements.ai_instructions.value=x.ai_instructions||'';
    if(x.workspace_modules)applyIndustryModules(x.workspace_modules);
    if(d.industry)renderSelectedIndustry(d.industry);
    if(d.official_sources&&d.industry)renderRegulatoryProfile({...d.industry,sources:d.official_sources});
    const p=$('#ai-design-preview');
    if(p){const bb=p.querySelector('b'),sp=p.querySelector('span');if(bb)bb.textContent='AI design ready for human review';if(sp)sp.textContent=(x.business_type||'Business')+' · '+(x.services||[]).length+' services · '+(x.custom_sections||[]).length+' suggested sections. Nothing consequential is executed until you review and save.'}
    note('AI prepared an industry-aware starting setup. Review the services, controls and official-source guidance before saving.');
  }catch(e){note(e.message,true)}
  finally{button.disabled=false;button.textContent='AI design my setup'}
});


async function loadBusinessSwitcher(){
  const select=$('#business-switcher');if(!select)return;
  const data=await api('/api/saas/my-organisations');
  select.replaceChildren(...data.organisations.map(org=>{
    const option=document.createElement('option');option.value=org.organisation_id;
    option.textContent=`${org.name} (${org.role})`;return option;
  }));
  select.value=data.active_organisation_id;select.hidden=data.organisations.length<2;
  select.onchange=async()=>{
    select.disabled=true;
    try{await window.SuperProWorkspaceContext.switchTo(select.value)}
    catch(err){select.value=data.active_organisation_id;select.disabled=false;note(err.message,true)}
  };
}

/* Result of a provider sign-in: show it, send the person to Connections, then tidy the address bar. */
(function(){
  try{
    const q=new URLSearchParams(location.search),ok=q.get('integration_connected'),err=q.get('integration_error');
    if(!ok&&!err)return;
    history.replaceState(null,'',location.pathname+'#marketing/connections');
    const tell=()=>{if(typeof note==='function')note(ok?`${ok.replace(/_/g,' ')} connected.`:`Connection did not finish: ${err}`,Boolean(err))};
    setTimeout(()=>{try{showView('integrations')}catch{}tell()},1800);
  }catch{}
})();
