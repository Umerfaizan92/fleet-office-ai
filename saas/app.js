const $ = (s) => document.querySelector(s);
const $$ = (s) => document.querySelectorAll(s);
const esc = (v) => String(v ?? '').replace(/[&<>'"]/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));

const viewSequence = ['dashboard','onboarding','workforce','jobs','assistant','video','integrations','billing'];
const pageMeta = {
  dashboard:['START HERE','Command centre'],
  onboarding:['SETUP','Business setup'],
  workforce:['PEOPLE','People & workforce'],
  jobs:['OPERATIONS','Jobs & allocation'],
  assistant:['INTELLIGENCE','AI Operations'],
  video:['CONTENT','Content studio'],
  integrations:['SYSTEM','Connections'],
  billing:['ACCOUNT','Plans & billing']
};
let currentView = 'dashboard';
let noteTimer;

function enhanceShell(){
  if ($('#foai-final-style')) return;
  const style=document.createElement('style');
  style.id='foai-final-style';
  style.textContent=`
  .auth-panel-head{margin-bottom:34px}.account-choice{display:flex!important;align-items:center;justify-content:flex-end;gap:7px;margin:0 0 20px!important;padding:0!important;border:0!important;background:transparent!important}.account-choice>span{margin:0!important;color:var(--muted);font-size:11px}.auth-switch-link,.auth-alt-action button{padding:0;border:0;background:transparent;color:var(--brand-2);font-weight:800;cursor:pointer}.auth-switch-link:hover,.auth-alt-action button:hover{text-decoration:underline}.auth-alt-action{margin:2px 0 0;text-align:center;color:var(--muted);font-size:11px}.auth-alt-action button{font-size:11px}.office-preview{position:relative;z-index:1;max-width:680px;margin:0 0 auto;border:1px solid rgba(255,255,255,.09);border-radius:18px;background:rgba(13,16,21,.78);box-shadow:0 24px 80px rgba(0,0,0,.28);backdrop-filter:blur(18px);overflow:hidden}.office-preview-bar{display:flex;align-items:center;justify-content:space-between;padding:11px 14px;border-bottom:1px solid rgba(255,255,255,.07);color:#d8dee8;font-size:10px;font-weight:800;letter-spacing:.05em;text-transform:uppercase}.office-preview-bar span{display:flex;align-items:center;gap:7px}.office-preview-bar i{width:7px;height:7px;border-radius:50%;background:var(--green);box-shadow:0 0 0 4px rgba(100,215,161,.09)}.office-preview-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:1px;background:rgba(255,255,255,.06)}.office-preview-grid article{position:relative;min-height:116px;padding:16px;background:#0d1117}.office-preview-grid b{display:block;margin:7px 0 3px;font-size:13px}.office-preview-grid small{display:block;color:#818c9d;font-size:9px;line-height:1.45}.preview-label{color:#657081;font-size:8px;font-weight:900;letter-spacing:.12em}.preview-status{position:absolute;right:12px;bottom:12px;padding:4px 7px;border:1px solid rgba(217,173,89,.24);border-radius:999px;background:rgba(217,173,89,.08);color:#d9ad59;font-size:7px;font-weight:900;text-transform:uppercase}.preview-status.live{color:#6fdda8;border-color:rgba(100,215,161,.22);background:rgba(100,215,161,.08)}.preview-status.good{color:#8cc5ff;border-color:rgba(126,184,255,.22);background:rgba(126,184,255,.08)}.workspace-nav button{grid-template-columns:28px 1fr auto!important}.nav-step{display:grid;place-items:center;width:24px;height:24px;border:1px solid var(--line);border-radius:7px;background:var(--panel-2);color:var(--muted-2);font-size:8px;font-weight:900}.workspace-nav button.active .nav-step{border-color:var(--brand-line);background:var(--brand-soft);color:var(--brand-2)}.workspace-nav button>svg{display:none}.view{animation:foaiView .28s ease both}@keyframes foaiView{from{opacity:.25;transform:translateY(8px)}to{opacity:1;transform:none}}.flow-nav{position:sticky;z-index:22;bottom:0;display:grid;grid-template-columns:auto 1fr auto;align-items:center;gap:16px;margin:10px 32px 0;padding:10px 14px;border:1px solid var(--line);border-bottom:0;border-radius:14px 14px 0 0;background:color-mix(in srgb,var(--panel) 92%,transparent);box-shadow:0 -12px 40px rgba(0,0,0,.14);backdrop-filter:blur(18px)}.flow-nav>div{text-align:center}.flow-nav small{display:block;color:var(--muted-2);font-size:7px;font-weight:900;letter-spacing:.14em}.flow-nav b{display:block;color:var(--text-2);font-size:10px}.flow-nav button{min-width:110px}.trial-hero{display:grid;grid-template-columns:1fr auto;align-items:center;gap:22px;margin-bottom:18px;padding:26px}.trial-hero h2{margin:4px 0 5px;font-size:26px}.trial-hero p{margin:0;color:var(--muted)}.trial-count{display:grid;place-items:center;min-width:118px;min-height:96px;border:1px solid var(--brand-line);border-radius:16px;background:var(--brand-soft)}.trial-count strong{font-size:36px;line-height:1;color:var(--brand-2)}.trial-count span{color:var(--muted);font-size:9px}.trial-progress{grid-column:1/-1;height:6px;border-radius:999px;background:var(--panel-3);overflow:hidden}.trial-progress span{display:block;width:0;height:100%;background:linear-gradient(90deg,var(--brand),var(--brand-2));transition:width .45s}.pricing-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px;margin-bottom:18px}.pricing-card{display:flex;flex-direction:column;min-height:330px;padding:24px;border:1px solid var(--line);border-radius:16px;background:var(--panel);box-shadow:var(--shadow-sm)}.pricing-card.featured{border-color:var(--brand-line);background:linear-gradient(180deg,var(--brand-soft),var(--panel) 34%)}.pricing-tag{color:var(--brand-2);font-size:8px;font-weight:900;letter-spacing:.13em}.pricing-card h2{margin:8px 0 5px;font-size:22px}.pricing-card p{margin:0 0 14px;color:var(--muted);font-size:11px}.pricing-card ul{display:grid;gap:9px;margin:6px 0 24px;padding:0;list-style:none}.pricing-card li{position:relative;padding-left:19px;color:var(--text-2);font-size:10px}.pricing-card li:before{content:'✓';position:absolute;left:0;color:var(--green)}.pricing-card button{margin-top:auto}.billing-safety{display:flex;gap:14px;padding:20px}.billing-safety h2{margin:0 0 3px;font-size:14px}.billing-safety p{margin:0;color:var(--muted);font-size:10px}@media(max-width:1100px){.pricing-grid{grid-template-columns:1fr}.flow-nav{margin-left:18px;margin-right:18px}}@media(max-width:720px){.office-preview-grid{grid-template-columns:1fr}.office-preview-grid article{min-height:100px}.flow-nav{grid-template-columns:1fr 1fr;margin:8px 12px 0}.flow-nav>div{display:none}.trial-hero{grid-template-columns:1fr}.trial-progress{grid-column:auto}}
  `;
  document.head.appendChild(style);

  const heading=$('.auth-heading');
  if(heading){heading.querySelector('h2').textContent='Create your workspace';const sub=$('#auth-subtitle');if(sub)sub.textContent='Start your secure 14-day trial. No payment is required to create the workspace.'}
  const choice=$('.account-choice');
  if(choice){choice.innerHTML='<span>Already have an account?</span><button class="auth-switch-link" type="button" data-auth-switch="login">Sign in</button>'}
  const reg=$('#register-form'),login=$('#login-form');
  if(reg&&!reg.querySelector('.auth-alt-action')) reg.insertAdjacentHTML('beforeend','<p class="auth-alt-action">Already have an account? <button type="button" data-auth-switch="login">Sign in securely</button></p>');
  if(login&&!login.querySelector('.auth-alt-action')) login.insertAdjacentHTML('beforeend','<p class="auth-alt-action">Don\'t have an account? <button type="button" data-auth-switch="register">Create workspace</button></p>');
  const visual=$('.auth-visual');
  if(visual&&!visual.querySelector('.office-preview')) visual.querySelector('.auth-copy')?.insertAdjacentHTML('afterend','<div class="office-preview"><div class="office-preview-bar"><span><i></i> Live operations desk</span><small>Workspace preview</small></div><div class="office-preview-grid"><article><span class="preview-label">INCOMING</span><b>Customer call</b><small>AI receptionist · ready for approval</small><span class="preview-status live">Live</span></article><article><span class="preview-label">TODAY</span><b>4 jobs scheduled</b><small>2 allocated · 2 awaiting team</small><span class="preview-status">Operations</span></article><article><span class="preview-label">WORKFORCE</span><b>Team ready</b><small>Compliance, skills and availability checked</small><span class="preview-status good">Ready</span></article></div></div>');

  const nav=$('.workspace-nav');
  if(nav){nav.innerHTML='<span class="nav-label">START HERE</span><button data-view="dashboard" class="active" type="button"><span class="nav-step">01</span><span>Command centre</span></button><button data-view="onboarding" type="button"><span class="nav-step">02</span><span>Business setup</span></button><span class="nav-label">RUN THE BUSINESS</span><button data-view="workforce" type="button"><span class="nav-step">03</span><span>People & workforce</span></button><button data-view="jobs" type="button"><span class="nav-step">04</span><span>Jobs & allocation</span><span class="nav-badge" id="nav-jobs">0</span></button><button data-view="assistant" type="button"><span class="nav-step">05</span><span>AI Operations</span></button><span class="nav-label">GROW & CONNECT</span><button data-view="video" type="button"><span class="nav-step">06</span><span>Content studio</span></button><button data-view="integrations" type="button"><span class="nav-step">07</span><span>Connections</span></button><button data-view="billing" type="button"><span class="nav-step">08</span><span>Plans & billing</span></button>'}

  const main=$('main.content-wrap');
  if(main&&!$('#billing-view')) main.insertAdjacentHTML('beforeend','<section id="billing-view" class="view" hidden><div class="page-heading"><div><p class="kicker">PLANS & BILLING</p><h1>Your 14-day launch trial</h1><p>Test the operating system before activating a paid subscription. Billing remains disabled until a payment provider and final pricing are approved.</p></div><span class="status-pill neutral" id="trial-status-pill">Trial active</span></div><div class="trial-hero panel"><div><span class="panel-kicker">CURRENT ACCESS</span><h2 id="trial-plan-name">Founder Trial</h2><p id="trial-copy">Loading trial status…</p></div><div class="trial-count"><strong id="trial-days">14</strong><span>days remaining</span></div><div class="trial-progress"><span id="trial-progress-bar"></span></div></div><div class="pricing-grid"><article class="pricing-card"><span class="pricing-tag">ESSENTIAL</span><h2>Starter</h2><p>For solo operators and small service teams.</p><ul><li>CRM & enquiries</li><li>Quotes, bookings and jobs</li><li>Core workforce records</li><li>Approval-controlled AI</li></ul><button class="secondary-button" type="button" disabled>Pricing to be activated</button></article><article class="pricing-card featured"><span class="pricing-tag">MOST COMPLETE</span><h2>Operations</h2><p>For growing teams that need workforce, compliance and automation.</p><ul><li>Everything in Starter</li><li>Job pool & eligibility</li><li>Compliance & onboarding</li><li>AI Operations workflows</li></ul><button class="primary-button" type="button" disabled>Payment provider required</button></article><article class="pricing-card"><span class="pricing-tag">ADVANCED</span><h2>Scale</h2><p>For larger multi-team service businesses.</p><ul><li>Everything in Operations</li><li>Advanced permissions</li><li>Higher usage limits</li><li>Priority integrations</li></ul><button class="secondary-button" type="button" disabled>Configure before launch</button></article></div><article class="panel billing-safety"><span class="feature-icon"><svg><use href="#i-shield"/></svg></span><div><h2>No surprise billing</h2><p>No charge occurs until an approved payment processor, final AUD pricing, GST treatment and customer consent are connected.</p></div></article></section>');
  const footer=$('.app-footer');
  if(footer&&!$('#flow-nav')) footer.insertAdjacentHTML('beforebegin','<div id="flow-nav" class="flow-nav"><button id="flow-prev" class="secondary-button compact" type="button">← Previous</button><div><small>GUIDED WORKSPACE</small><b id="flow-position">Step 1 of 8</b></div><button id="flow-next" class="primary-button compact" type="button">Next →</button></div>');
  $$('[data-auth-switch]').forEach(b=>b.addEventListener('click',()=>setAuthMode(b.dataset.authSwitch)));
}

enhanceShell();

async function api(url, options = {}) {
  const r = await fetch(url, {
    ...options,
    headers: {
      ...(options.body ? {'content-type':'application/json'} : {}),
      ...options.headers
    }
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || 'Request failed');
  return d;
}

function note(v, bad = false) {
  const e = $('#notice') || $('#auth-message');
  if (!e) return;
  e.textContent = v;
  e.style.color = bad ? 'var(--red)' : 'var(--green)';
  clearTimeout(noteTimer);
  if (e.id === 'notice' && v) noteTimer = setTimeout(() => e.textContent = '', 5000);
}

function obj(f) { return Object.fromEntries(new FormData(f)); }
function initials(name = 'User') {
  return name.trim().split(/\s+/).slice(0,2).map(x => x[0]).join('').toUpperCase() || 'U';
}

function setTheme(theme) {
  document.documentElement.dataset.theme = theme;
  localStorage.setItem('foai-theme', theme);
  $$('.theme-icon use').forEach(u => u.setAttribute('href', theme === 'dark' ? '#i-sun' : '#i-moon'));
}
setTheme(localStorage.getItem('foai-theme') || 'dark');
$$('.theme-toggle').forEach(b => b.addEventListener('click', () => setTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark')));

function closeSidebar() {
  $('#sidebar')?.classList.remove('open');
  $('#sidebar-scrim')?.classList.remove('show');
}
$('#open-sidebar')?.addEventListener('click', () => { $('#sidebar').classList.add('open'); $('#sidebar-scrim').classList.add('show'); });
$('#close-sidebar')?.addEventListener('click', closeSidebar);
$('#sidebar-scrim')?.addEventListener('click', closeSidebar);

function updateFlowNav() {
  const index = Math.max(0, viewSequence.indexOf(currentView));
  const prev = $('#flow-prev');
  const next = $('#flow-next');
  const pos = $('#flow-position');
  if (pos) pos.textContent = `Step ${index + 1} of ${viewSequence.length}`;
  if (prev) prev.disabled = index === 0;
  if (next) {
    next.disabled = index === viewSequence.length - 1;
    next.textContent = index === viewSequence.length - 1 ? 'Complete' : 'Next →';
  }
}

function showView(name, {instant = false} = {}) {
  if (!viewSequence.includes(name)) name = 'dashboard';
  currentView = name;
  $$('.workspace-nav [data-view]').forEach(x => x.classList.toggle('active', x.dataset.view === name));
  $$('.view').forEach(v => v.hidden = v.id !== `${name}-view`);
  const meta = pageMeta[name] || ['WORKSPACE','Fleet Office AI'];
  if ($('#page-eyebrow')) $('#page-eyebrow').textContent = meta[0];
  if ($('#page-title')) $('#page-title').textContent = meta[1];
  updateFlowNav();
  closeSidebar();
  history.replaceState(null, '', `#${name}`);
  const top = $('.content-wrap');
  requestAnimationFrame(() => {
    (top || document.documentElement).scrollIntoView?.({behavior: instant ? 'auto' : 'smooth', block:'start'});
    window.scrollTo({top:0, behavior: instant ? 'auto' : 'smooth'});
  });
}

$$('.workspace-nav [data-view]').forEach(b => b.onclick = () => showView(b.dataset.view));
$$('[data-jump]').forEach(b => b.onclick = () => showView(b.dataset.jump));
$$('[data-scroll]').forEach(b => b.onclick = () => $(b.dataset.scroll)?.scrollIntoView({behavior:'smooth', block:'start'}));
$('#flow-prev')?.addEventListener('click', () => {
  const i = viewSequence.indexOf(currentView);
  if (i > 0) showView(viewSequence[i - 1]);
});
$('#flow-next')?.addEventListener('click', () => {
  const i = viewSequence.indexOf(currentView);
  if (i < viewSequence.length - 1) showView(viewSequence[i + 1]);
});

function setAuthMode(mode) {
  const isRegister = mode === 'register';
  $('#register-form').hidden = !isRegister;
  $('#login-form').hidden = isRegister;
  $('#auth-message').textContent = '';
  const h = $('.auth-heading h2');
  const sub = $('#auth-subtitle');
  if (h) h.textContent = isRegister ? 'Create your secure workspace' : 'Sign in to your workspace';
  if (sub) sub.textContent = isRegister
    ? 'Choose your plan, create your account and start 14 days free. No card is required in this test build.'
    : 'Enter your account details to continue to your secure workspace.';
  $$('.account-choice').forEach(x => x.hidden = false);
  const choice = $('.account-choice');
  if (choice) {
    const label = choice.querySelector('span');
    const button = choice.querySelector('button');
    if (label) label.textContent = isRegister ? 'Already have an account?' : 'New to Fleet Office AI?';
    if (button) {
      button.dataset.authSwitch = isRegister ? 'login' : 'register';
      button.textContent = isRegister ? 'Sign in' : 'Create workspace';
    }
  }
  window.scrollTo({top:0, behavior:'smooth'});
}
$$('[data-auth-switch]').forEach(b => b.addEventListener('click', () => setAuthMode(b.dataset.authSwitch)));
setAuthMode('register');

$$('[data-prompt]').forEach(b => b.onclick = () => {
  const f = $('#assistant-form');
  const t = f?.querySelector('textarea[name="message"]');
  const title = f?.querySelector('input[name="title"]');
  if (t) { t.value = b.dataset.prompt || ''; t.dispatchEvent(new Event('input')); t.focus(); }
  if (title && b.dataset.title) title.value = b.dataset.title;
});

const aiPrompt = $('#assistant-form textarea[name="message"]');
const promptCount = $('#prompt-count');
function updatePromptCount() { if (promptCount && aiPrompt) promptCount.textContent = `${aiPrompt.value.length} characters`; }
aiPrompt?.addEventListener('input', updatePromptCount);
aiPrompt?.addEventListener('keydown', e => {
  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); $('#assistant-form')?.requestSubmit(); }
});
updatePromptCount();

async function boot() {
  try {
    const d = await api('/api/saas/me');
    $('#welcome').hidden = true;
    $('#workspace').hidden = false;
    $('#org-name-side').textContent = d.organisation.name;
    $('#user-line').textContent = `${d.user.full_name} · ${d.user.role} · ${d.user.email}`;
    $('#mfa-status-side').textContent = d.user.mfa_enabled ? 'Authenticator MFA enabled' : 'MFA setup recommended';
    $('#profile-name').textContent = d.user.full_name;
    $('#profile-role').textContent = d.user.role;
    $('#profile-avatar').textContent = initials(d.user.full_name);
    $('#first-name').textContent = d.user.full_name.split(/\s+/)[0] || 'there';
    await Promise.all([loadDashboard(),loadOnboarding(),loadWorkers(),loadJobs(),loadThreads(),loadRenders(),loadSubscription()]);
    const requested = location.hash.replace('#','');
    showView(viewSequence.includes(requested) ? requested : 'dashboard', {instant:true});
  } catch {
    $('#welcome').hidden = false;
    $('#workspace').hidden = true;
    setAuthMode('register');
  }
}

$('#register-form').onsubmit = async e => {
  e.preventDefault();
  const b = obj(e.target);
  const hint = $('#password-match');
  if (b.password !== b.confirm_password) {
    if (hint) { hint.textContent = 'Passwords do not match.'; hint.classList.add('error-text'); }
    note('Passwords do not match. Please enter the same password twice.', true);
    e.target.elements.confirm_password.focus();
    return;
  }
  if (hint) { hint.textContent = 'Passwords match.'; hint.classList.remove('error-text'); }
  if (!e.target.elements.accept_terms?.checked) {
    note('Please review and accept the Terms of Service and Privacy Notice to create a workspace.', true);
    return;
  }
  b.accept_terms = true;
  b.terms_version = 'prelaunch-2026-09-14';
  try {
    const d = await api('/api/saas/register', {method:'POST', body:JSON.stringify(b)});
    const email = b.email;
    e.target.reset();
    setAuthMode('login');
    $('#login-form').elements.email.value = email;
    $('#login-form').elements.password.focus();
    note(d.message || 'Account created successfully. Sign in to open your secure workspace.');
  } catch (x) { note(x.message, true); }
};

const registerPassword = $('#register-form')?.elements.password;
const registerConfirm = $('#register-form')?.elements.confirm_password;
function updatePasswordMatch() {
  const hint = $('#password-match');
  if (!hint || !registerConfirm) return;
  if (!registerConfirm.value) {
    hint.textContent = 'Both passwords must match.';
    hint.classList.remove('error-text','success-text');
    return;
  }
  const ok = registerPassword.value === registerConfirm.value;
  hint.textContent = ok ? 'Passwords match.' : 'Passwords do not match.';
  hint.classList.toggle('success-text', ok);
  hint.classList.toggle('error-text', !ok);
}
registerPassword?.addEventListener('input', updatePasswordMatch);
registerConfirm?.addEventListener('input', updatePasswordMatch);

$('#login-form').onsubmit = async e => {
  e.preventDefault();
  const b = obj(e.target);
  if (!b.mfa_code) delete b.mfa_code;
  try { await api('/api/saas/login', {method:'POST', body:JSON.stringify(b)}); await boot(); }
  catch (x) { note(x.message, true); }
};

$('#logout').onclick = async () => { await api('/api/saas/logout', {method:'POST'}); location.href = '/saas/'; };

async function loadDashboard() {
  const d = await api('/api/saas/dashboard'), m = d.metrics;
  $('#m-workers').textContent = m.workers;
  $('#m-ready').textContent = m.ready;
  $('#m-attention').textContent = m.attention;
  $('#m-jobs').textContent = m.jobs;
  $('#m-expiring').textContent = m.expiring;
  $('#nav-jobs').textContent = m.jobs;
  $('#briefing').textContent = m.attention || m.jobs || m.expiring
    ? `${m.attention} worker${m.attention===1?'':'s'} need compliance attention, ${m.jobs} job${m.jobs===1?'':'s'} await allocation, and ${m.expiring} document${m.expiring===1?'':'s'} expire within 30 days.`
    : 'No immediate workforce or allocation risks detected. Your operational foundation is clear.';
}

async function loadOnboarding() {
  const d = await api('/api/saas/onboarding'), f = $('#onboarding-form'), p = d.profile;
  for (const k of ['business_type','phone','website','service_area','brand_voice','approval_mode','ai_instructions']) if (f.elements[k]) f.elements[k].value = p[k] || '';
  f.elements.services.value = (p.services || []).join('\n');
  if (f.elements.complete) f.elements.complete.checked = !!p.complete;
}
$('#onboarding-form').onsubmit = async e => {
  e.preventDefault();
  const b = obj(e.target);
  b.services = b.services.split('\n').map(x => x.trim()).filter(Boolean);
  b.complete = e.target.elements.complete.checked;
  await api('/api/saas/onboarding', {method:'PUT', body:JSON.stringify(b)});
  note('Workspace settings saved successfully.');
};

async function loadWorkers() {
  const d = await api('/api/saas/workers');
  $('#workers').innerHTML = d.workers.map(w => `<article class="row-card"><header><div><b>${esc(w.full_name)}</b><div class="muted">${esc(w.role_title)} · ${esc(w.employment_type.replaceAll('_',' '))} · Level ${w.worker_level}</div></div><span class="status ${w.approved_for_scheduling?'good':'warn'}">${w.approved_for_scheduling?'Ready to schedule':'Onboarding'}</span></header><p class="muted">Work rights: ${esc(w.work_rights_status.replaceAll('_',' '))} · Onboarding ${w.onboarding_progress}% · Passport optional</p><div class="row-actions"><button onclick="completeCompliance('${w.id}')">Test: approve compliance</button><button onclick="addSkill('${w.id}')">Add verified skill</button></div></article>`).join('') || '<div class="empty-state"><b>No workers yet</b><span>Add your first worker profile to begin onboarding and eligibility checks.</span></div>';
}
$('#worker-form').onsubmit = async e => { e.preventDefault(); try { await api('/api/saas/workers',{method:'POST',body:JSON.stringify(obj(e.target))}); e.target.reset(); note('Worker profile created with compliance checklist.'); await Promise.all([loadWorkers(),loadDashboard()]); } catch(x){ note(x.message,true); } };
window.completeCompliance = async id => { try { await api(`/api/saas/workers/${id}/compliance`,{method:'PATCH',body:JSON.stringify({work_rights_status:'verified',onboarding_progress:100})}); note('Compliance marked verified for testing.'); await Promise.all([loadWorkers(),loadDashboard()]); } catch(x){ note(x.message,true); } };
window.addSkill = async id => { const skill=prompt('Skill name, e.g. Truck Polishing'); if(!skill)return; const competency=prompt('Competency: competent, advanced or expert','competent')||'competent'; try{await api(`/api/saas/workers/${id}/skills`,{method:'POST',body:JSON.stringify({skill_name:skill,competency})});note('Verified worker skill saved.')}catch(x){note(x.message,true)}};

async function loadJobs(){const d=await api('/api/saas/work-orders');$('#jobs').innerHTML=d.jobs.map(j=>`<article class="row-card"><header><div><b>${esc(j.title)}</b><div class="muted">${new Date(j.start_at).toLocaleString()} · ${j.required_workers} worker${j.required_workers===1?'':'s'} · Level ${j.required_level}+</div></div><span class="status">${esc(j.status.replaceAll('_',' '))}</span></header><p class="muted">${esc(j.address||'No address')} · Skills: ${j.required_skills.map(esc).join(', ')||'None specified'} · ${j.accepted_workers}/${j.required_workers} accepted</p><div class="row-actions"><button onclick="offerJob('${j.id}')">Find eligible workers →</button></div></article>`).join('')||'<div class="empty-state"><b>No work orders yet</b><span>Create a job and the eligibility engine will match compliant workers.</span></div>'}
$('#job-form').onsubmit=async e=>{e.preventDefault();const b=obj(e.target);b.required_skills=b.required_skills.split('\n').map(x=>x.trim()).filter(Boolean);try{await api('/api/saas/work-orders',{method:'POST',body:JSON.stringify(b)});e.target.reset();note('Work order added to the allocation pool.');await Promise.all([loadJobs(),loadDashboard()])}catch(x){note(x.message,true)}};
window.offerJob=async id=>{try{const d=await api(`/api/saas/work-orders/${id}/offer`,{method:'POST'});note(d.offered?`Offered to ${d.offered} eligible worker${d.offered===1?'':'s'}: ${d.eligible_workers.map(x=>x.full_name).join(', ')}`:'No eligible workers. Check compliance, level and verified skills.',!d.offered);await Promise.all([loadJobs(),loadDashboard()])}catch(x){note(x.message,true)}};

async function loadThreads(){const d=await api('/api/saas/ai/threads');$('#threads').innerHTML=d.threads.map(t=>`<article class="row-card"><header><div><b>${esc(t.title)}</b><div class="muted">Updated ${new Date(t.updated_at).toLocaleString()}</div></div><span class="status">Saved</span></header></article>`).join('')||'<div class="empty-state"><b>No AI Operations threads</b><span>Save an instruction to start building workspace-scoped operational memory.</span></div>'}
$('#assistant-form').onsubmit=async e=>{e.preventDefault();const f=obj(e.target),payload={title:f.title,message:f.message};const d=await api('/api/saas/ai/threads',{method:'POST',body:JSON.stringify(payload)});e.target.reset();updatePromptCount();note(d.note);await loadThreads()};

$('#setup-mfa')?.addEventListener('click',async()=>{const d=await api('/api/saas/mfa/setup',{method:'POST'});$('#mfa-secret').textContent=d.secret;$('#mfa-dialog').showModal()});
$('#verify-mfa').onclick=async()=>{await api('/api/saas/mfa/verify',{method:'POST',body:JSON.stringify({code:$('#mfa-code').value})});$('#mfa-dialog').close();note('Authenticator MFA enabled.');await boot()};

async function loadRenders(){const d=await api('/api/saas/video-renders');$('#renders').innerHTML=d.jobs.map(j=>`<article class="row-card"><header><div><b>${esc(j.quality)} · ${esc(j.edit_spec.aspect_ratio)}</b><div class="muted">Saved render specification</div></div><span class="status">${esc(j.status)}</span></header></article>`).join('')||'<div class="empty-state"><b>No render specifications</b><span>Create a high-resolution output specification to populate this queue.</span></div>'}
$('#video-form').onsubmit=async e=>{e.preventDefault();const f=obj(e.target),body={quality:f.quality,edit_spec:{aspect_ratio:f.aspect_ratio,clips:[{media_id:f.media_id,start_seconds:Number(f.start_seconds),end_seconds:Number(f.end_seconds),transition:f.transition}],captions:e.target.elements.captions.checked,music:e.target.elements.music.checked,logo:e.target.elements.logo.checked,style_prompt:f.style_prompt}};const d=await api('/api/saas/video-renders',{method:'POST',body:JSON.stringify(body)});note(d.note);await loadRenders()};

async function loadSubscription(){
  try {
    const d = await api('/api/saas/subscription');
    const s = d.subscription;
    if (!s) return;
    const now = Date.now();
    const end = s.trial_ends_at ? new Date(s.trial_ends_at).getTime() : now;
    const start = s.created_at ? new Date(s.created_at).getTime() : now;
    const remaining = Math.max(0, Math.ceil((end - now) / 86400000));
    const total = Math.max(1, Math.round((end - start) / 86400000) || 14);
    const pct = Math.max(0, Math.min(100, ((total - remaining) / total) * 100));
    $('#trial-plan-name').textContent = s.plan_name || 'Founder Trial';
    $('#trial-days').textContent = remaining; if ($('#sidebar-trial-days')) $('#sidebar-trial-days').textContent = remaining;
    $('#trial-copy').textContent = remaining > 0 ? `Your workspace is in its ${total}-day trial. ${remaining} day${remaining===1?'':'s'} remain before a subscription will be required.` : 'Your trial period has ended. Billing activation is required before commercial use.';
    $('#trial-progress-bar').style.width = `${pct}%`;
    $('#trial-status-pill').textContent = remaining > 0 ? 'Trial active' : 'Trial ended';
    $('#trial-status-pill').classList.toggle('warn', remaining <= 3);
  } catch (x) {
    if ($('#trial-copy')) $('#trial-copy').textContent = 'Subscription status is temporarily unavailable.';
  }
}


// V5 contextual guidance: every interactive control can explain itself on hover/focus.
const tooltip = $('#smart-tooltip');
function inferredTip(el){
  if (el.dataset.tip) return el.dataset.tip;
  const label=(el.getAttribute('aria-label')||el.textContent||'').replace(/\s+/g,' ').trim();
  if (!label) return '';
  if (el.matches('[data-view]')) return `Open ${label.replace(/\d+/g,'').trim()} in this workspace.`;
  if (el.tagName==='A') return `Open ${label}.`;
  if (el.tagName==='BUTTON') return `${label}.`;
  return '';
}
function showTip(el,x,y){
  if(!tooltip||matchMedia('(pointer:coarse)').matches)return;
  const text=inferredTip(el); if(!text)return;
  tooltip.textContent=text; tooltip.setAttribute('aria-hidden','false'); tooltip.classList.add('show');
  const pad=14,w=tooltip.offsetWidth||220,h=tooltip.offsetHeight||40;
  tooltip.style.left=`${Math.min(innerWidth-w-pad,Math.max(pad,x+14))}px`;
  tooltip.style.top=`${Math.min(innerHeight-h-pad,Math.max(pad,y+16))}px`;
}
function hideTip(){tooltip?.classList.remove('show');tooltip?.setAttribute('aria-hidden','true')}
document.addEventListener('pointerover',e=>{const el=e.target.closest('button,a,[data-tip]');if(el)showTip(el,e.clientX,e.clientY)});
document.addEventListener('pointermove',e=>{if(tooltip?.classList.contains('show')){const el=e.target.closest('button,a,[data-tip]');if(el)showTip(el,e.clientX,e.clientY)}});
document.addEventListener('pointerout',e=>{if(e.target.closest('button,a,[data-tip]'))hideTip()});
document.addEventListener('focusin',e=>{const el=e.target.closest('button,a,[data-tip]');if(el){const r=el.getBoundingClientRect();showTip(el,r.left+r.width/2,r.bottom)}});
document.addEventListener('focusout',hideTip);

$$('[data-plan-select]').forEach(btn=>btn.addEventListener('click',()=>{
  const plan=btn.dataset.planSelect;
  const radio=$(`#register-form input[name="plan_id"][value="${plan}"]`);
  if(radio){radio.checked=true; note(`${btn.textContent.replace('Select ','')} selected for your next trial. New accounts can choose this plan during signup.`)}
}));

boot();
