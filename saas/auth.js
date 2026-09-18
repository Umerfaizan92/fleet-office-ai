(() => {
  const $=s=>document.querySelector(s); const page=document.body.dataset.authPage;
  const api=async(url,opt={})=>{const r=await fetch(url,{credentials:'same-origin',headers:{'Content-Type':'application/json',...(opt.headers||{})},...opt});let d={};try{d=await r.json()}catch{}if(!r.ok){const e=new Error(r.status===429?'Please wait a few seconds before trying again.':(d.error||'The requested action could not be completed.'));e.payload=d;throw e}return d};
  const show=(text,error=false)=>{const el=$('#auth-message');if(!el)return;el.textContent=text||'';el.classList.toggle('error',Boolean(error))};
  const objectFrom=form=>Object.fromEntries(new FormData(form).entries());
  const rememberKey='gds-remember-email';

  function stateCode(value){
    const map={'Australian Capital Territory':'ACT','New South Wales':'NSW','Northern Territory':'NT','Queensland':'QLD','South Australia':'SA','Tasmania':'TAS','Victoria':'VIC','Western Australia':'WA'};
    return map[String(value||'').trim()]||String(value||'').trim().toUpperCase();
  }
  function formatAddress(form){
    const p=['address_unit','address_street_number','address_street_name','address_suburb','state','postcode'].map(k=>String(form.elements[k]?.value||'').trim()).filter(Boolean);
    return p.join(' ');
  }

  if(page==='register'){
    const form=$('#register-form'), status=$('#business-verification-status'), verifyButton=$('#verify-business'), submit=$('#registration-submit');
    const idType=form.elements.identifier_type,idInput=form.elements.business_identifier,idLabel=$('#identifier-label'),idHelp=$('#identifier-help');
    let businessVerified=false,verifiedFingerprint='';
    const idMeta={ABN:{label:'ABN',placeholder:'11 digit ABN',help:'ABN has 11 digits. Production validation uses the Australian Business Register when configured.',max:14},ACN:{label:'ACN',placeholder:'9 digit ACN',help:'ACN has 9 digits. Production validation uses the official ABN Lookup ACN lookup when configured.',max:12},OTHER:{label:'Australian registration identifier',placeholder:'Enter registration identifier',help:'Other identifiers are captured for authorised manual verification where an automated registry check is unavailable.',max:80}};
    function syncIdentifier(){const m=idMeta[idType.value]||idMeta.ABN;idLabel.textContent=m.label;idInput.placeholder=m.placeholder;idInput.maxLength=m.max;idInput.inputMode=idType.value==='OTHER'?'text':'numeric'}
    const fingerprint=()=>[form.elements.business_name.value.trim(),idType.value,idInput.value.replace(/\s+/g,''),form.elements.state.value,form.elements.postcode.value].join('|');
    const invalidate=()=>{businessVerified=false;verifiedFingerprint='';submit.disabled=true;status.className='identity-status';status.textContent='Business verification is required before account creation.'};
    ['business_name','business_identifier','state','postcode'].forEach(n=>form.elements[n]?.addEventListener('input',invalidate));idType?.addEventListener('change',()=>{syncIdentifier();invalidate()});syncIdentifier();

    const addressSearch=$('#business-address-search'),suggestions=$('#business-address-suggestions'),preview=$('#business-address-preview');
    let addressTimer=null;
    const updateAddressPreview=()=>{if(form.elements.address_source?.value!=='search')form.elements.address_source.value='manual';const value=formatAddress(form);if(form.elements.address_formatted)form.elements.address_formatted.value=value;preview.textContent=value||'No full business address saved yet. You can continue with manual entry.'};
    ['address_unit','address_street_number','address_street_name','address_suburb'].forEach(n=>form.elements[n]?.addEventListener('input',updateAddressPreview));
    form.elements.state?.addEventListener('change',updateAddressPreview);form.elements.postcode?.addEventListener('input',updateAddressPreview);
    function chooseAddress(x){
      form.elements.address_unit.value=x.unit||'';
      form.elements.address_street_number.value=x.street_number||'';
      form.elements.address_street_name.value=x.street_name||'';
      form.elements.address_suburb.value=x.suburb||'';
      const st=stateCode(x.state);if([...form.elements.state.options].some(o=>o.value===st||o.text===st))form.elements.state.value=st;
      if(/^\d{4}$/.test(String(x.postcode||'')))form.elements.postcode.value=x.postcode;
      form.elements.address_formatted.value=x.display_name||formatAddress(form);
      form.elements.address_source.value=x.source||'search';
      addressSearch.value=x.display_name||'';
      preview.textContent=form.elements.address_formatted.value;
      suggestions.hidden=true;invalidate();
    }
    addressSearch?.addEventListener('input',()=>{
      clearTimeout(addressTimer);const q=addressSearch.value.trim();if(q.length<4){suggestions.hidden=true;return}
      addressTimer=setTimeout(async()=>{try{const d=await api('/api/saas/address/search?q='+encodeURIComponent(q),{method:'GET',headers:{}});const rows=d.suggestions||[];if(!rows.length){suggestions.innerHTML='<button type="button" disabled>No suggestion found — continue with manual entry.</button>';suggestions.hidden=false;return}suggestions.innerHTML='';for(const x of rows){const b=document.createElement('button');b.type='button';b.textContent=x.display_name;b.onclick=()=>chooseAddress(x);suggestions.appendChild(b)}suggestions.hidden=false}catch{suggestions.hidden=true}},280);
    });
    document.addEventListener('click',e=>{if(suggestions&&!suggestions.contains(e.target)&&e.target!==addressSearch)suggestions.hidden=true});

    verifyButton.onclick=async()=>{const business_name=form.elements.business_name.value.trim(),identifier_type=idType.value,business_identifier=idInput.value.trim();if(!business_name||!business_identifier){status.className='identity-status error';status.textContent=`Enter the business name and ${idMeta[identifier_type]?.label||'business identifier'} first.`;return}verifyButton.disabled=true;verifyButton.textContent='Checking…';try{const d=await api('/api/saas/business/verify',{method:'POST',body:JSON.stringify({business_name,identifier_type,business_identifier})});businessVerified=true;verifiedFingerprint=fingerprint();submit.disabled=false;status.className='identity-status verified';const loc=[d.business.state,d.business.postcode].filter(Boolean).join(' '),label=d.business.identifier_type||identifier_type;status.textContent=`${label==='OTHER'?'Captured for authorised review':'Verified'} ${label} ${d.business.identifier||business_identifier}${d.business.legal_name?` · ${d.business.legal_name}`:''}${loc?` · ${loc}`:''}${d.test_mode?' · LOCAL TEST MODE':''}`;if(d.business.state&&!form.elements.state.value)form.elements.state.value=d.business.state;if(d.business.postcode&&!form.elements.postcode.value)form.elements.postcode.value=d.business.postcode;updateAddressPreview()}catch(e){businessVerified=false;verifiedFingerprint='';submit.disabled=true;status.className='identity-status error';status.textContent=e.message}finally{verifyButton.disabled=false;verifyButton.textContent='Check business identity'}};
    const pass=form.elements.password,confirm=form.elements.confirm_password,meter=$('#password-meter'),hint=$('#password-hint');
    function updatePassword(){const v=pass.value;let score=0;if(v.length>=14)score++;if(/[A-Z]/.test(v)&&/[a-z]/.test(v))score++;if(/\d/.test(v))score++;if(/[^A-Za-z0-9]/.test(v))score++;meter.dataset.score=String(score);if(confirm.value)hint.textContent=pass.value===confirm.value?'Passwords match.':'Passwords do not match.';else hint.textContent='Use at least 14 characters; a passphrase is recommended.';hint.style.color=confirm.value&&pass.value!==confirm.value?'var(--red)':''}
    pass.addEventListener('input',updatePassword);confirm.addEventListener('input',updatePassword);
    form.onsubmit=async e=>{e.preventDefault();show('');if(!businessVerified||verifiedFingerprint!==fingerprint()){invalidate();show('Verify the current Australian business identity before continuing.',true);status.scrollIntoView({behavior:'smooth',block:'center'});return}if(pass.value!==confirm.value){show('Passwords do not match.',true);confirm.focus();return}if(!form.elements.accept_terms.checked){show('Please accept the Terms of Service and Privacy Notice.',true);return}updateAddressPreview();const b=objectFrom(form);b.accept_terms=true;b.terms_version='prelaunch-2026-09-18-v16.3';submit.disabled=true;submit.textContent='Creating secure verification…';try{const d=await api('/api/saas/registration/start',{method:'POST',body:JSON.stringify(b)});sessionStorage.setItem('gds-pending-registration',JSON.stringify({pending_id:d.pending_id,email:d.email,phone:d.phone,business:d.business,test_mode:d.test_mode,test_codes:d.delivery?.test_codes||null,delivery:d.delivery||{},raw_email:b.email}));location.href='verify-account.html'}catch(err){
      if(err.payload?.code==='ACCOUNT_EXISTS'||err.payload?.code==='BUSINESS_EXISTS'){
        const label=err.payload?.business_name?`Workspace already exists for ${err.payload.business_name}. `:'';
        show(label+(err.message||'An account already exists.')+' Redirecting to sign in…',true);
        sessionStorage.setItem('gds-new-email',String(b.email||''));
        setTimeout(()=>{location.href=err.payload.sign_in_url||'sign-in.html'},1800);
        return;
      }
      show(err.message,true);submit.disabled=false;submit.textContent='Join your AI Office →'}};
  }

  if(page==='verify'){
    const raw=sessionStorage.getItem('gds-pending-registration');if(!raw){location.href='create-account.html';return}let state;try{state=JSON.parse(raw)}catch{location.href='create-account.html';return}
    $('#verification-destination').textContent=`Enter the 6-digit email code sent to ${state.email} and the SMS code exactly as received on ${state.phone}.`;
    const paintDelivery=()=>{
      for(const channel of ['email','sms']){
        const row=document.querySelector(`[data-delivery="${channel}"]`),delivery=state.delivery?.[channel]||{};
        if(!row)continue;
        row.classList.toggle('good',Boolean(delivery.sent));
        row.classList.toggle('error',delivery.sent===false);
        const status=row.querySelector('span');
        if(channel==='sms'&&delivery.accepted&&delivery.sent)status.textContent='Telnyx accepted the SMS request — check your mobile';
        else status.textContent=delivery.sent?'Sent successfully':delivery.sent===false?'Not delivered yet — use Resend below':'Ready to send / resend';
      }
    };paintDelivery();
    api('/api/saas/verification-provider/status',{method:'GET',headers:{}}).then(d=>{
      const sms=d?.sms||{},row=document.querySelector('[data-delivery="sms"]');
      if(!row)return;
      if(sms.configured&&sms.sms_enabled&&sms.australia_allowed&&sms.app_name_configured&&sms.template_configured){
        row.title='Telnyx Verify profile is configured for Australian SMS verification.';
      }else if(sms.configured){
        const missing=[];
        if(!sms.sms_enabled)missing.push('SMS channel');
        if(!sms.australia_allowed)missing.push('Australia destination');
        if(!sms.app_name_configured)missing.push('SMS App Name');
        if(!sms.template_configured)missing.push('SMS template');
        row.querySelector('span').textContent='Telnyx Verify needs attention: '+missing.join(', ');
        row.classList.add('error');
      }
    }).catch(()=>{});
    if(state.test_mode&&state.test_codes){const box=$('#test-codes');box.hidden=false;box.innerHTML=`<b>LOCAL TEST MODE</b><br>Email code: <strong>${state.test_codes.email}</strong> · SMS code: <strong>${state.test_codes.sms}</strong><br><small>Test codes are exposed only when SAAS_VERIFICATION_TEST_MODE=1 outside production.</small>`}
    const form=$('#verification-form'),button=$('#verification-submit');
    for(const input of form.querySelectorAll('input[inputmode="numeric"]')){
      input.addEventListener('input',()=>{input.value=input.value.replace(/\D/g,'').slice(0,Number(input.maxLength)>0?Number(input.maxLength):8)});
    }form.onsubmit=async e=>{e.preventDefault();show('');const b=objectFrom(form);b.pending_id=state.pending_id;button.disabled=true;button.textContent='Verifying…';try{await api('/api/saas/registration/verify',{method:'POST',body:JSON.stringify(b)});sessionStorage.removeItem('gds-pending-registration');sessionStorage.setItem('gds-new-email',state.raw_email||'');sessionStorage.setItem('gds-first-login-tour','1');location.href='sign-in.html?created=1'}catch(err){
      if(err.payload?.code==='ACCOUNT_EXISTS'||err.payload?.code==='BUSINESS_EXISTS'){
        show((err.message||'This workspace already exists.')+' Redirecting to sign in…',true);
        sessionStorage.removeItem('gds-pending-registration');
        sessionStorage.setItem('gds-new-email',state.raw_email||'');
        setTimeout(()=>{location.href=err.payload.sign_in_url||'sign-in.html'},1800);
        return;
      }
      show(err.message,true);button.disabled=false;button.textContent='Complete secure verification →'}};
    document.querySelectorAll('[data-resend]').forEach(btn=>btn.onclick=async()=>{
      if(btn.disabled)return;
      const channel=btn.dataset.resend,original=btn.textContent;
      btn.disabled=true;
      btn.textContent=channel==='sms'?'Sending SMS…':'Sending email…';
      show(channel==='sms'?'Requesting a fresh SMS verification code from Telnyx…':'Requesting a fresh email verification code…');
      try{
        const d=await api('/api/saas/registration/resend',{method:'POST',body:JSON.stringify({pending_id:state.pending_id,channel})});
        state.delivery=state.delivery||{};
        state.delivery[channel]={sent:true,accepted:Boolean(d.delivery?.accepted),provider:d.delivery?.provider||'',message_id:d.delivery?.message_id||null};
        sessionStorage.setItem('gds-pending-registration',JSON.stringify(state));
        paintDelivery();
        btn.textContent=channel==='sms'?'SMS requested ✓':'Email sent ✓';
        show(d.message||(channel==='sms'?'Telnyx accepted the SMS request. Check your mobile.':'A new email code was sent.'));
        if(d.test_code){const box=$('#test-codes');box.hidden=false;box.innerHTML+=`<br>New ${channel.toUpperCase()} code: <strong>${d.test_code}</strong>`}
        setTimeout(()=>{btn.textContent=original;btn.disabled=false},2200);
        return;
      }catch(err){
        show(err.message,true);
        state.delivery=state.delivery||{};
        state.delivery[channel]={sent:false,error:err.message};
        sessionStorage.setItem('gds-pending-registration',JSON.stringify(state));
        paintDelivery();
        btn.textContent=channel==='sms'?'SMS failed — retry':'Email failed — retry';
      }
      btn.disabled=false;
    });
  }

  if(page==='login'){
    const form=$('#login-form'),remember=form.elements.remember_email;const newEmail=sessionStorage.getItem('gds-new-email'),saved=localStorage.getItem(rememberKey);if(newEmail){form.elements.email.value=newEmail;show('Your verified workspace is ready. Sign in to continue.');sessionStorage.removeItem('gds-new-email')}else if(saved){form.elements.email.value=saved;remember.checked=true}
    const pending=sessionStorage.getItem('gds-pending-registration');if(pending)$('#pending-verification').hidden=false;
    form.onsubmit=async e=>{e.preventDefault();show('');const b=objectFrom(form);delete b.remember_email;if(!b.mfa_code)delete b.mfa_code;try{await api('/api/saas/login',{method:'POST',body:JSON.stringify(b)});if(remember.checked)localStorage.setItem(rememberKey,form.elements.email.value.trim());else localStorage.removeItem(rememberKey);if(sessionStorage.getItem('gds-first-login-tour')==='1'){sessionStorage.setItem('gds-run-tour','1');sessionStorage.removeItem('gds-first-login-tour')}location.href='workspace.html#dashboard'}catch(err){if(err.payload?.mfa_required){$('#mfa-details').open=true;form.elements.mfa_code.focus()}show(err.message,true)}};
  }

  if(page==='recover'){
    const start=$('#recovery-start-form'),codeForm=$('#recovery-code-form'),passForm=$('#recovery-password-form'),type=$('#recovery-type'),passwordFields=$('#password-recovery-fields'),emailFields=$('#email-recovery-fields');
    let recovery={challenge_id:'',reset_token:'',recovery_type:''};
    const syncMode=()=>{const emailMode=type.value==='email';passwordFields.hidden=emailMode;emailFields.hidden=!emailMode;show('')};
    const qMode=new URLSearchParams(location.search).get('mode');if(qMode==='email')type.value='email';syncMode();type.onchange=syncMode;
    start.onsubmit=async e=>{e.preventDefault();show('');const f=objectFrom(start),body={recovery_type:f.recovery_type,channel:f.channel};if(f.recovery_type==='password'){const id=String(f.login_identifier||'').trim();if(id.includes('@'))body.email=id;else body.phone=id}else{body.phone=f.phone;body.business_identifier_type=f.business_identifier_type;body.business_identifier=f.business_identifier}
      const btn=$('#recovery-start-submit');btn.disabled=true;btn.textContent='Sending security code…';try{const d=await api('/api/saas/recovery/start',{method:'POST',body:JSON.stringify(body)});if(!d.challenge_id){show(d.message||'If the details match an account, a code will be sent.');return}recovery.challenge_id=d.challenge_id;recovery.recovery_type=f.recovery_type;start.hidden=true;codeForm.hidden=false;$('#recovery-destination').textContent=`A security code was sent to ${d.destination||'your verified recovery channel'}.`;show(d.message||'Enter the six-digit code.')}catch(err){show(err.message,true)}finally{btn.disabled=false;btn.textContent='Send secure recovery code →'}};
    codeForm.onsubmit=async e=>{e.preventDefault();show('');try{const d=await api('/api/saas/recovery/verify',{method:'POST',body:JSON.stringify({challenge_id:recovery.challenge_id,code:codeForm.elements.code.value})});codeForm.hidden=true;if(d.recovery_type==='email'){const card=$('#recovered-email-card');$('#recovered-email').textContent=d.email;card.hidden=false;show('Identity verified successfully.')}else{recovery.reset_token=d.reset_token;passForm.hidden=false;show('Identity verified. Choose a new password.')}}catch(err){show(err.message,true)}};
    passForm.onsubmit=async e=>{e.preventDefault();show('');const b=objectFrom(passForm);if(b.password!==b.confirm_password){show('Passwords do not match.',true);return}try{const d=await api('/api/saas/recovery/reset-password',{method:'POST',body:JSON.stringify({challenge_id:recovery.challenge_id,reset_token:recovery.reset_token,password:b.password,confirm_password:b.confirm_password})});show(d.message||'Password changed successfully.');setTimeout(()=>location.href='sign-in.html',900)}catch(err){show(err.message,true)}};
  }
})();