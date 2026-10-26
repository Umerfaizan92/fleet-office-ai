// Content Studio media library: private uploads per business, picked as the source for a render.
(()=>{
  const {el,api,onView,role,note}=window.SuperProUI;
  const $=s=>document.querySelector(s);
  let items=[],mode='all',selected='';
  const size=b=>b>1048576?(b/1048576).toFixed(1)+' MB':Math.max(1,Math.round(b/1024))+' KB';
  const canDelete=()=>['owner','admin','super_admin'].includes(role());

  function thumb(m){
    const url=`/api/saas/media/${m.id}/file`;
    if(m.kind==='photo')return el('img',{src:url,alt:m.original_name,loading:'lazy'});
    if(m.kind==='video')return el('video',{src:url+'#t=0.1',preload:'metadata',muted:true,playsinline:true});
    return el('div',{class:'media-audio'},el('span',{text:'Audio'}),el('audio',{src:url,controls:true,preload:'none'}));
  }
  function draw(){
    const grid=$('#media-library-grid');if(!grid)return;
    const q=($('#media-library-search')?.value||'').trim().toLowerCase(),sort=$('#media-library-sort')?.value||'recent';
    let list=items.filter(m=>(mode==='all'||m.kind===mode)&&(!q||m.original_name.toLowerCase().includes(q)));
    list=[...list].sort((a,b)=>sort==='name'?a.original_name.localeCompare(b.original_name):sort==='type'?a.kind.localeCompare(b.kind):b.created_at.localeCompare(a.created_at));
    $('#library-count').textContent=`${items.length} ${items.length===1?'file':'files'}`;
    if(!list.length){grid.replaceChildren(el('div',{class:'empty-state'},el('b',{text:items.length?'Nothing matches':'No media yet'}),el('span',{text:items.length?'Try a different search or filter.':'Drop photos, videos or audio above to start your library.'})));return}
    grid.replaceChildren(...list.map(m=>el('article',{class:'media-card'+(m.id===selected?' selected':''),'data-id':m.id},
      el('button',{type:'button',class:'media-pick','aria-label':`Use ${m.original_name} as the source`,onclick:()=>pick(m)},thumb(m)),
      el('div',{class:'media-meta'},el('b',{text:m.original_name}),el('small',{text:`${m.kind}, ${size(m.size_bytes)}`})),
      canDelete()?el('button',{type:'button',class:'media-del',text:'Remove','aria-label':`Remove ${m.original_name}`,onclick:()=>remove(m)}):null)));
  }
  function pick(m){
    selected=m.id;const f=$('#video-form');if(f?.elements.media_id)f.elements.media_id.value=m.id;
    const s=$('#library-selection');if(s)s.replaceChildren(el('span',{text:`Source: ${m.original_name}`}),el('small',{text:'This file will be used in the render brief below.'}));
    draw();$('#video-form')?.scrollIntoView({behavior:'smooth',block:'nearest'});
  }
  async function remove(m){
    if(!confirm(`Remove ${m.original_name} from your library?`))return;
    try{await api('/api/saas/media/'+m.id,{method:'DELETE'});if(selected===m.id)selected='';note('Removed.');await load()}catch(e){note(e.message,true)}
  }
  async function load(){try{items=(await api('/api/saas/media')).media||[]}catch{items=[]}draw()}
  async function upload(files){
    const list=[...files];if(!list.length)return;
    const fd=new FormData();list.slice(0,10).forEach(f=>fd.append('files',f));
    const drop=$('#media-drop');drop?.classList.add('busy');
    try{const r=await api('/api/saas/media',{method:'POST',body:fd});note(`${r.saved} ${r.saved===1?'file':'files'} added to your library.`);await load()}
    catch(e){note(e.message,true)}finally{drop?.classList.remove('busy')}
  }
  const drop=$('#media-drop'),input=$('#media-file');
  const choose=()=>input?.click();
  drop?.addEventListener('click',e=>{if(e.target!==input)choose()});
  drop?.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();choose()}});
  ['dragenter','dragover'].forEach(t=>drop?.addEventListener(t,e=>{e.preventDefault();drop.classList.add('over')}));
  ['dragleave','drop'].forEach(t=>drop?.addEventListener(t,e=>{e.preventDefault();drop.classList.remove('over')}));
  drop?.addEventListener('drop',e=>upload(e.dataTransfer?.files||[]));
  input?.addEventListener('change',()=>{upload(input.files);input.value=''});
  $('#organize-library')?.addEventListener('click',choose);
  $('#add-demo-assets')?.addEventListener('click',()=>{note('Importing straight from a social account needs that platform to approve this app. For now, save the clip from the platform and upload it here. Connect accounts under Marketing & Channels.');});
  document.querySelectorAll('[data-source-mode]').forEach(b=>b.addEventListener('click',()=>{mode=b.dataset.sourceMode;document.querySelectorAll('[data-source-mode]').forEach(x=>x.classList.toggle('active',x===b));draw()}));
  $('#media-library-search')?.addEventListener('input',draw);$('#media-library-sort')?.addEventListener('change',draw);
  onView('video',{enter:load});
})();
