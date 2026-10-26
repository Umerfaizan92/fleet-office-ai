// Public job application page. The job link carries a random token; nothing here reveals any other business data.
(()=>{
  const $=s=>document.querySelector(s);
  const q=new URLSearchParams(location.search),token=(q.get('t')||'').replace(/[^a-f0-9]/gi,''),src=(q.get('src')||'').slice(0,20);
  const job=$('#ap-job'),form=$('#ap-form'),msg=$('#ap-msg');
  const say=(t,bad)=>{msg.textContent=t||'';msg.className='ap-msg '+(t?(bad?'bad':'ok'):'')};
  const h=(tag,props,...kids)=>{const n=document.createElement(tag);for(const[k,v]of Object.entries(props||{})){if(k==='text')n.textContent=v;else if(k==='class')n.className=v;else n.setAttribute(k,v)}n.append(...kids.flat().filter(Boolean));return n};
  let kinds=['resume','licence','certificate','reference','other'];
  const label={resume:'Resume',licence:'Licence',certificate:'Certificate / ticket',reference:'Reference',other:'Other'};
  function addFile(){
    if(document.querySelectorAll('.ap-file').length>=5)return say('You can add up to 5 documents.',true);
    const kind=h('select',{'aria-label':'Document type'},...kinds.map(k=>{const o=h('option',{value:k,text:label[k]});return o}));
    const file=h('input',{type:'file',accept:'.pdf,.docx,.jpg,.jpeg,.png,.webp','aria-label':'Choose a document'});
    const rm=h('button',{type:'button',class:'ap-ghost',text:'Remove'});const row=h('div',{class:'ap-file'},kind,file,rm);rm.onclick=()=>row.remove();$('#ap-files').append(row);
  }
  async function start(){
    if(!token){job.replaceChildren(h('h1',{text:'This job link is not valid.'}),h('p',{text:'Please ask the business for the link again.'}));return}
    try{
      const r=await fetch(`/api/public/hiring/${token}`,{headers:{accept:'application/json'}}),d=await r.json();
      if(!r.ok)throw new Error(d.error||'This job link is not valid.');
      document.title=`${d.role.title} at ${d.business}`;
      const meta=h('div',{class:'ap-meta'},...[d.role.employment_label,d.role.location,d.role.pay_text].filter(Boolean).map(t=>h('span',{text:t})));
      job.replaceChildren(h('p',{class:'ap-brand',text:d.business}),h('h1',{text:d.role.title}),meta,d.role.description?h('p',{class:'ap-desc',text:d.role.description}):null,d.role.requirements?h('p',{},h('b',{text:'What you need: '}),d.role.requirements):null);
      $('#ap-biz').textContent=d.business;$('#ap-months').textContent=String(d.notice.retention_months);kinds=d.kinds||kinds;
      if(!d.open){job.append(h('p',{class:'ap-done',text:'Applications for this role are now closed. Thank you for your interest.'}));return}
      form.hidden=false;addFile();
    }catch(e){job.replaceChildren(h('h1',{text:'We could not open this job.'}),h('p',{text:e.message}))}
  }
  $('#ap-add').onclick=addFile;
  form.addEventListener('submit',async e=>{
    e.preventDefault();say('');
    if(!form.full_name.value.trim()||!form.email.value.trim())return say('Please enter your name and email.',true);
    if(!$('#ap-consent').checked)return say('Please tick the box to confirm you have read the privacy notice.',true);
    const fd=new FormData();for(const n of ['full_name','email','phone','suburb','availability','message','website'])fd.append(n,form[n].value);
    fd.append('consent','true');fd.append('src',src);
    let total=0;for(const row of document.querySelectorAll('.ap-file')){const f=row.querySelector('input[type=file]').files[0];if(!f)continue;if(f.size>8*1024*1024)return say(`${f.name} is larger than 8 MB.`,true);total+=f.size;fd.append('kinds',row.querySelector('select').value);fd.append('files',f)}
    const b=$('#ap-send');b.disabled=true;b.textContent='Sending…';
    try{
      const r=await fetch(`/api/public/hiring/${token}/apply`,{method:'POST',body:fd}),d=await r.json().catch(()=>({}));
      if(!r.ok)throw new Error(d.error||'We could not send your application. Please try again.');
      form.replaceChildren(h('div',{class:'ap-done'},h('h2',{text:'Application sent'}),h('p',{text:d.message})));
    }catch(err){say(err.message,true);b.disabled=false;b.textContent='Send my application'}
  });
  start();
})();
