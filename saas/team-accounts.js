(()=>{
 const $=s=>document.querySelector(s),esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const request=async(path,method='GET',body)=>{const response=await fetch('/api/saas/team-accounts'+path,{method,credentials:'same-origin',headers:{'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});const data=await response.json();if(!response.ok)throw Error(data.error||'Request failed');return data;};
 const status=message=>{$('#team-status').textContent=message};
 async function refresh(){
  try{const data=await request('');
   $('#team-members').innerHTML=data.members.map(m=>`<article class="panel"><strong>${esc(m.full_name)}</strong><p>${esc(m.email)} · ${esc(m.role)}${m.role_title?' · '+esc(m.role_title):''}</p>${m.role!=='owner'?`<button type="button" data-team-revoke="members/${esc(m.id)}">Revoke business access</button>`:''}</article>`).join('')||'<p>No members found.</p>';
   $('#team-invitations').innerHTML=data.invitations.map(i=>{const state=i.status==='pending'&&Date.parse(i.expires_at)<Date.now()?'expired':i.status;return `<article class="panel"><strong>${esc(i.invited_email)}</strong><p>${esc(i.role)} · ${esc(state)} · Expires ${esc(new Date(i.expires_at).toLocaleString())}</p>${state==='pending'?`<button type="button" data-team-revoke="invitations/${esc(i.id)}">Revoke invitation</button>`:''}</article>`}).join('')||'<p>No invitations yet.</p>';
  }catch(error){status(error.message)}
 }
 $('#team-open-invite')?.addEventListener('click',async()=>{
  try{const response=await fetch('/api/saas/workers',{credentials:'same-origin'}),data=await response.json();if(!response.ok)throw Error(data.error||'Workers could not be loaded');
   const form=$('#team-invite-form');form.reset();$('#team-invite-result').replaceChildren();
   form.elements.worker_id.innerHTML='<option value="">Choose a worker</option>'+data.workers.map(w=>`<option value="${esc(w.id)}" data-email="${esc(w.email||'')}">${esc(w.full_name)}</option>`).join('');
   $('#team-invite-dialog').showModal();
  }catch(error){status(error.message)}
 });
 $('#team-invite-form')?.elements.worker_id.addEventListener('change',event=>{$('#team-invite-form').elements.email.value=event.target.selectedOptions[0]?.dataset.email||''});
 $('#team-close-invite')?.addEventListener('click',()=>$('#team-invite-dialog').close());
 $('#team-invite-form')?.addEventListener('submit',async event=>{
  event.preventDefault();const button=event.target.querySelector('[type=submit]');button.disabled=true;const result=$('#team-invite-result');result.textContent='Creating invitation…';
  try{const data=await request('/invitations','POST',Object.fromEntries(new FormData(event.target)));result.textContent=data.note;
   const link=document.createElement('input');link.readOnly=true;link.value=new URL(data.invite_path,location.href).href;link.setAttribute('aria-label','Private invitation link');result.append(link);await refresh();
  }catch(error){result.textContent=error.message}finally{button.disabled=false}
 });
 $('#team-view')?.addEventListener('click',async event=>{
  const button=event.target.closest('[data-team-revoke]');if(!button)return;
  if(!confirm('Revoke this invitation or business access? Existing records and other business memberships will be preserved.'))return;
  button.disabled=true;try{await request('/'+button.dataset.teamRevoke,'DELETE');status('Access updated.');await refresh()}catch(error){button.disabled=false;status(error.message)}
 });
 window.addEventListener('gds:viewchange',event=>{if(event.detail?.view==='team')refresh()});
 if(location.hash==='#team'&&window.GDS_SESSION?.user?.role==='owner')refresh();
})();
