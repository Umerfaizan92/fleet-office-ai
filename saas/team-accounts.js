(()=>{
 const $=s=>document.querySelector(s),esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const request=async(path,method='GET',body)=>{const response=await fetch('/api/saas/team-accounts'+path,{method,credentials:'same-origin',headers:{'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});const data=await response.json();if(!response.ok)throw Error(data.error||'Request failed');return data;};
 const status=message=>{$('#team-status').textContent=message};
 async function refresh(){
  try{const data=await request('');
   $('#team-members').innerHTML=data.members.map(m=>`<article class="panel"><strong>${esc(m.full_name)}</strong><p>${esc(m.email)} · ${esc(m.role)}${m.role_title?' · '+esc(m.role_title):''}</p>${m.role!=='owner'?`<form data-team-role="${esc(m.id)}"><label>Authorised role<select name="role">${['admin','manager','employee','contractor'].map(role=>`<option value="${role}" ${role===m.role?'selected':''}>${role[0].toUpperCase()+role.slice(1)}</option>`).join('')}</select></label><button class="primary-button compact" type="submit">Save role</button></form><button class="secondary-button" type="button" data-staff-permissions="${esc(m.id)}">Feature &amp; task access</button><button class="secondary-button" type="button" data-staff-activity="${esc(m.id)}">Activity log</button><button class="secondary-button" type="button" data-team-revoke="members/${esc(m.id)}">Revoke business access</button>`:''}</article>`).join('')||'<p>No members found.</p>';
   $('#team-invitations').innerHTML=data.invitations.map(i=>{const state=i.status==='pending'&&Date.parse(i.expires_at)<Date.now()?'expired':i.status;return `<article class="panel"><strong>${esc(i.invited_email)}</strong><p>${esc(i.role)} · ${esc(state)} · Expires ${esc(new Date(i.expires_at).toLocaleString())}</p>${state==='pending'?`<button class="secondary-button" type="button" data-team-revoke="invitations/${esc(i.id)}">Revoke invitation</button>`:''}</article>`}).join('')||'<p>No invitations yet.</p>';
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
  try{const data=await request('/invitations','POST',{...Object.fromEntries(new FormData(event.target)),send:event.target.elements.send.checked});result.textContent=data.note;
   const link=document.createElement('input');link.readOnly=true;link.value=new URL(data.invite_path,location.href).href;link.setAttribute('aria-label','Private invitation link');result.append(link);await refresh();
  }catch(error){result.textContent=error.message}finally{button.disabled=false}
 });
 $('#team-view')?.addEventListener('submit',async event=>{
  const form=event.target.closest('[data-team-role]');if(!form)return;event.preventDefault();
  const button=form.querySelector('button');button.disabled=true;
  try{const data=await request('/members/'+encodeURIComponent(form.dataset.teamRole)+'/role','PATCH',{role:form.elements.role.value});status(data.note);await refresh()}catch(error){status(error.message)}finally{button.disabled=false}
 });
 $('#team-view')?.addEventListener('click',async event=>{
  const button=event.target.closest('[data-team-revoke]');if(!button)return;
  if(!confirm('Revoke this invitation or business access? Existing records and other business memberships will be preserved.'))return;
  button.disabled=true;try{await request('/'+button.dataset.teamRevoke,'DELETE');status('Access updated.');await refresh()}catch(error){button.disabled=false;status(error.message)}
 });
 const dialog=document.createElement('dialog');dialog.className='sp-access-dialog';dialog.setAttribute('aria-label','Individual staff access');document.body.append(dialog);
 const closeButton=()=>{dialog.querySelector('[data-close]').onclick=()=>dialog.close()};
 $('#team-view')?.addEventListener('click',async event=>{
  const permissions=event.target.closest('[data-staff-permissions]'),activity=event.target.closest('[data-staff-activity]');if(!permissions&&!activity)return;
  const memberId=(permissions||activity).dataset[permissions?'staffPermissions':'staffActivity'];let policy=null;
  try{
   if(activity){const data=await request('/members/'+encodeURIComponent(memberId)+'/activity');dialog.innerHTML='<header><h2>Staff activity in this business</h2><button type="button" data-close>Close</button></header><p>Only this member’s events in your organisation. Recorded events include a tamper-evident hash.</p><div class="sp-access-log">'+data.activity.map(a=>'<article><strong>'+esc(a.action)+'</strong><p>'+esc(new Date(a.created_at).toLocaleString())+' · '+esc(a.entity_type)+'</p><small>'+esc(a.event_hash||'')+'</small></article>').join('')+'</div>';closeButton();dialog.showModal();return}
   const data=await request('/members/'+encodeURIComponent(memberId)+'/permissions');policy=data.policy;
   dialog.innerHTML='<header><h2>Access for '+esc(data.member.full_name)+'</h2><button type="button" data-close>Close</button></header><p>Applies only to this member in this business. Platform operator access and owner-only controls cannot be granted here.</p><form id="staff-access-form"><label>Permission mode<select name="mode"><option value="role">Use role defaults</option><option value="custom">Individual feature &amp; task permissions</option></select></label><div class="sp-access-grid">'+data.catalog.map(f=>'<fieldset><legend>'+esc(f.label)+'</legend>'+f.actions.map(a=>'<label><input type="checkbox" name="grant" value="'+esc(f.id+'.'+a)+'" '+(policy.grants.includes(f.id+'.'+a)?'checked':'')+'> '+esc(a==='read'?'View':a)+'</label>').join('')+'</fieldset>').join('')+'</div><p role="status" id="staff-access-note"></p><button type="submit" class="primary-button">Save this member’s access</button></form>';
   closeButton();const form=dialog.querySelector('form');form.elements.mode.value=policy.mode;const sync=()=>{form.querySelectorAll('input').forEach(i=>i.disabled=form.elements.mode.value!=='custom')};sync();form.elements.mode.onchange=sync;
   form.addEventListener('change',e=>{if(e.target.name!=='grant')return;const [feature,action]=e.target.value.split('.');if(e.target.checked&&action!=='read')form.querySelector('input[value="'+feature+'.read"]').checked=true;if(!e.target.checked&&action==='read')form.querySelectorAll('input').forEach(i=>{if(i.value.startsWith(feature+'.'))i.checked=false})});
   form.onsubmit=async e=>{e.preventDefault();const button=form.querySelector('[type=submit]');button.disabled=true;try{const updated=await request('/members/'+encodeURIComponent(memberId)+'/permissions','PUT',{mode:form.elements.mode.value,revision:policy.revision,grants:[...form.querySelectorAll('input:checked')].map(i=>i.value)});policy=updated.policy;dialog.querySelector('#staff-access-note').textContent='Saved. Server permissions apply immediately, including existing sessions.'}catch(error){dialog.querySelector('#staff-access-note').textContent=error.message}finally{button.disabled=false}};
   dialog.showModal();
  }catch(error){status(error.message)}
 });
 window.addEventListener('gds:viewchange',event=>{if(event.detail?.view==='team')refresh()});
 if(location.hash==='#team'&&window.GDS_SESSION?.user?.role==='owner')refresh();
})();
