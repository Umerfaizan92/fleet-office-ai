(()=>{
 const token=location.hash.slice(1);history.replaceState(null,'',location.pathname);
 const form=document.querySelector('#join-team-form'),status=document.querySelector('#join-status'),send=document.querySelector('#send-code');
 if(!token){form.hidden=true;status.textContent='Open the complete private invitation link supplied by your business owner.';return;}
 const request=async(path,body)=>{const response=await fetch('/api/saas/team-accounts/'+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token,...body})});const data=await response.json();if(!response.ok)throw Error(data.error||'Request failed');return data;};
 send.addEventListener('click',async()=>{if(!form.elements.email.reportValidity())return;send.disabled=true;status.textContent='Requesting verification code…';try{const data=await request('verify-email',{email:form.elements.email.value});status.textContent=data.note}catch(error){status.textContent=error.message}finally{send.disabled=false}});
 form.addEventListener('submit',async event=>{event.preventDefault();const button=form.querySelector('[type=submit]');button.disabled=true;const data=Object.fromEntries(new FormData(form));data.consent=form.elements.consent.checked;if(!data.email_code)delete data.email_code;if(!data.mfa_code)delete data.mfa_code;
  try{const result=await request('accept',data);form.reset();form.hidden=true;status.textContent=result.note;sessionStorage.removeItem('superpro_active_organisation')}catch(error){status.textContent=error.message;button.disabled=false}
 });
})();
