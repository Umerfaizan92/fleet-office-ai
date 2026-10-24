// Universal data migration wizard: drag-and-drop CSV/JSON, header autodetect, server dry run, then commit.
(()=>{
  const {el,api,onView}=window.SuperProUI;
  const $=selector=>document.querySelector(selector);
  const MAX_BYTES=1024*1024,MAX_ROWS=1000;
  const norm=value=>String(value||'').toLowerCase().replace(/[^a-z0-9]/g,'');
  const LABELS={full_name:'Full name',email:'Email',phone:'Phone',role_title:'Role title',employment_type:'Employment type',worker_level:'Level',title:'Job title',address:'Address',start_at:'Start date',estimated_hours:'Estimated hours',required_workers:'Workers needed',required_level:'Required level',required_skills:'Skills',entry_type:'Type (revenue/expense)',category:'Category',description:'Description',amount:'Amount',tax:'Tax / GST',occurred_on:'Date'};
  const REQUIRED={workers:['full_name'],work_orders:['title','start_at'],finance_entries:['entry_type','category','amount','occurred_on']};
  // Normalised header aliases from common legacy systems (spreadsheets, MYOB, Xero, ServiceM8, Deputy and similar exports).
  const SYNONYMS={
    full_name:['fullname','name','employeename','workername','staffname','contactname','employee'],email:['email','emailaddress','mail','workemail'],
    phone:['phone','mobile','mobilenumber','phonenumber','cell','telephone'],role_title:['roletitle','role','position','jobtitle','designation'],
    employment_type:['employmenttype','employment','contracttype','engagement','worktype'],worker_level:['workerlevel','level','grade','classification'],
    title:['title','jobname','jobtitle','job','workorder','name','summary'],address:['address','siteaddress','site','location','jobaddress'],
    start_at:['startat','startdate','start','scheduled','scheduleddate','datetime','date'],estimated_hours:['estimatedhours','hours','duration','estimate'],
    required_workers:['requiredworkers','workers','crew','headcount','staffneeded'],required_level:['requiredlevel','level'],required_skills:['requiredskills','skills','skill','tags'],
    entry_type:['entrytype','type','kind','transactiontype','incomeexpense','direction'],category:['category','account','accountname','class','group'],
    description:['description','memo','details','narration','reference','payee','notes'],amount:['amount','total','value','gross','amountaud','netamount'],
    tax:['tax','gst','taxamount','gstamount'],occurred_on:['occurredon','transactiondate','invoicedate','date','paiddate']
  };
  const state={entity:'',fields:[],headers:[],rows:[],mapping:{},schema:null,wired:false,previewed:false,armed:null};

  // ---- parsing ----
  function parseCsv(text){
    const rows=[];let row=[],cell='',quoted=false;
    const input=text.replace(/^﻿/,'');
    const delimiter=(input.split('\n',1)[0].match(/;/g)||[]).length>(input.split('\n',1)[0].match(/,/g)||[]).length?';':',';
    for(let i=0;i<input.length;i++){
      const c=input[i];
      if(quoted){if(c==='"'){if(input[i+1]==='"'){cell+='"';i++}else quoted=false}else cell+=c}
      else if(c==='"')quoted=true;
      else if(c===delimiter){row.push(cell);cell=''}
      else if(c==='\n'||c==='\r'){if(c==='\r'&&input[i+1]==='\n')i++;row.push(cell);cell='';rows.push(row);row=[]}
      else cell+=c;
    }
    if(cell!==''||row.length){row.push(cell);rows.push(row)}
    const [head,...body]=rows.filter(r=>r.some(v=>String(v).trim()!==''));
    if(!head)return [];
    const headers=head.map((h,i)=>String(h).trim()||`Column ${i+1}`);
    return body.map(r=>Object.fromEntries(headers.map((h,i)=>[h,(r[i]??'').trim()])));
  }
  function parseJson(text){
    const data=JSON.parse(text),list=Array.isArray(data)?data:Array.isArray(data?.rows)?data.rows:Array.isArray(data?.data)?data.data:null;
    if(!list)throw new Error('JSON must be a list of records, or an object with a "rows" list.');
    return list.filter(r=>r&&typeof r==='object'&&!Array.isArray(r)).map(r=>Object.fromEntries(Object.entries(r).map(([k,v])=>[k,v===null||['string','number','boolean'].includes(typeof v)?v:JSON.stringify(v)])));
  }
  // When a file has First name / Last name columns, build a combined name column so "Full name" can map to it.
  function addCombinedName(rows){
    if(!rows.length)return rows;
    const keys=Object.keys(rows[0]),first=keys.find(k=>/^(first|given)(name)?$/.test(norm(k))||norm(k)==='firstname'),last=keys.find(k=>/^(last|sur|family)(name)?$/.test(norm(k))||norm(k)==='lastname');
    if(!first||!last||keys.some(k=>SYNONYMS.full_name.includes(norm(k))))return rows;
    return rows.map(r=>({...r,'First + last name':`${r[first]||''} ${r[last]||''}`.trim()}));
  }
  function autodetect(fields,headers){
    const mapping={},used=new Set();
    if(fields.includes('full_name')&&headers.includes('First + last name')){mapping.full_name='First + last name';used.add('First + last name')}
    const bySyn=(syn,exact)=>headers.find(h=>!used.has(h)&&(exact?syn.includes(norm(h)):syn.some(s=>s.length>=4&&norm(h).includes(s))));
    for(const exact of [true,false])for(const field of fields){
      if(mapping[field])continue;
      const hit=bySyn(SYNONYMS[field]||[],exact);
      if(hit){mapping[field]=hit;used.add(hit)}
    }
    return mapping;
  }

  // ---- rendering ----
  const say=(id,text)=>{const n=$(id);if(n)n.textContent=text||''};
  function renderMapping(){
    const grid=$('#migration-mapping'),sample=state.rows[0]||{};
    grid.replaceChildren(...state.fields.map(field=>{
      const required=(REQUIRED[state.entity]||[]).includes(field);
      const select=el('select',{'aria-label':LABELS[field]||field,onchange:()=>{if(select.value)state.mapping[field]=select.value;else delete state.mapping[field];state.previewed=false;resetResult();refreshPreviewButton();sampleCell.textContent=sampleFor(field)}},
        el('option',{value:'',text:'— not mapped —'}),...state.headers.map(h=>el('option',{value:h,text:h,selected:state.mapping[field]===h})));
      const sampleFor=f=>state.mapping[f]?String(sample[state.mapping[f]]??''):'';
      const sampleCell=el('small',{text:sampleFor(field)});
      return el('div',{class:'mapping-row'},el('label',null,LABELS[field]||field,required?el('span',{class:'chip warn',text:'required'}):null,select),sampleCell,el('span'));
    }));
    $('#migration-map-panel').hidden=false;refreshPreviewButton();
  }
  function missingRequired(){return (REQUIRED[state.entity]||[]).filter(f=>!state.mapping[f])}
  function refreshPreviewButton(){
    const missing=missingRequired(),button=$('#migration-preview');
    button.disabled=missing.length>0||!state.rows.length;
    say('#migration-preview-feedback',missing.length?`Map: ${missing.map(f=>LABELS[f]).join(', ')}`:`${state.rows.length} rows ready.`);
  }
  function resetResult(){$('#migration-result-panel').hidden=true;$('#migration-commit').disabled=true;state.armed=null}

  async function handleFile(file){
    resetResult();$('#migration-map-panel').hidden=true;
    if(!file)return;
    if(file.size>MAX_BYTES)return say('#migration-file-info','That file is over 1 MB. Split it into smaller files.');
    if(!/\.(csv|json)$/i.test(file.name))return say('#migration-file-info','Choose a .csv or .json file.');
    try{
      const text=await file.text();
      const rows=addCombinedName(/\.json$/i.test(file.name)?parseJson(text):parseCsv(text));
      if(!rows.length)return say('#migration-file-info','No data rows were found in that file.');
      if(rows.length>MAX_ROWS)return say('#migration-file-info',`That file has ${rows.length} rows. The limit is ${MAX_ROWS} per import; split it and import in parts.`);
      state.rows=rows;state.headers=Object.keys(rows[0]);state.mapping=autodetect(state.fields,state.headers);
      say('#migration-file-info',`${file.name}: ${rows.length} rows, ${state.headers.length} columns.`);
      renderMapping();
    }catch(error){say('#migration-file-info',error instanceof SyntaxError?'That file is not valid JSON.':error.message)}
  }

  async function loadSchema(){
    if(state.schema)return;
    const data=await api('/api/saas/migration/schema');
    state.schema=data;
    const select=$('#migration-entity');
    select.replaceChildren(...data.entities.map(e=>el('option',{value:e.key,text:e.label})));
    selectEntity(select.value);
  }
  function selectEntity(key){
    const entity=state.schema?.entities.find(e=>e.key===key);if(!entity)return;
    state.entity=key;state.fields=entity.fields;state.rows=[];state.headers=[];state.mapping={};
    $('#migration-map-panel').hidden=true;resetResult();say('#migration-file-info','');
    $('#migration-update-option').hidden=key!=='workers';
  }

  const chipFor={new:['ok','Will create'],duplicate_existing:['warn','Already exists'],duplicate_in_file:['warn','Repeated in file'],invalid:['bad','Needs fixing']};
  function renderPreview(data){
    const c=data.counts;
    $('#migration-counts').replaceChildren(...[['Will create',c.will_create],['Already exist',c.duplicate_existing],['Repeated in file',c.duplicate_in_file],['Need fixing',c.invalid]].map(([label,n])=>el('div',null,el('strong',{text:String(n)}),el('span',{text:label}))));
    const body=$('#migration-table tbody');
    body.replaceChildren(...data.preview.map(r=>{
      const [cls,text]=chipFor[r.status];
      const detail=r.errors.length?r.errors.join(' '):Object.values(r.value||{}).filter(v=>v!==null&&v!=='').slice(0,3).join(' · ');
      return el('tr',null,el('td',{text:String(r.row)}),el('td',null,el('span',{class:'chip '+cls,text})),el('td',{text:detail}));
    }));
    if(data.truncated)body.append(el('tr',null,el('td',{colspan:'3',text:`Showing the first 200 of ${c.total} rows. All rows are checked.`})));
    $('#migration-result-panel').hidden=false;
    $('#migration-commit').disabled=!(c.will_create>0||(c.duplicate_existing>0&&updateChosen()));
    say('#migration-commit-feedback',c.invalid?`${c.invalid} row(s) will be skipped until fixed in your file.`:'');
  }
  const updateChosen=()=>document.querySelector('input[name="migration-dup"]:checked')?.value==='update';
  const payload=()=>({entity:state.entity,mapping:state.mapping,rows:state.rows,duplicate_policy:updateChosen()?'update':'skip'});

  async function preview(){
    const button=$('#migration-preview');button.disabled=true;say('#migration-preview-feedback','Checking…');
    try{const data=await api('/api/saas/migration/preview',{method:'POST',body:JSON.stringify(payload())});state.previewed=true;renderPreview(data);say('#migration-preview-feedback','Dry run complete. Nothing has been imported.')}
    catch(error){say('#migration-preview-feedback',error.message)}
    finally{button.disabled=missingRequired().length>0}
  }
  async function commit(){
    const button=$('#migration-commit');
    if(!state.previewed)return;
    // Two-step confirm: first press arms, second press imports.
    if(!state.armed){button.textContent='Press again to confirm import';state.armed=setTimeout(()=>{state.armed=null;button.textContent='Import now'},5000);return}
    clearTimeout(state.armed);state.armed=null;button.disabled=true;button.textContent='Importing…';
    try{
      const r=await api('/api/saas/migration/commit',{method:'POST',body:JSON.stringify({...payload(),confirm:true})});
      say('#migration-commit-feedback',`Imported: ${r.created} created, ${r.updated} updated, ${r.skipped} skipped, ${r.invalid} invalid.${r.note?' '+r.note:''}`);
      state.previewed=false;
      if(typeof window.loadWorkers==='function')window.loadWorkers().catch(()=>{});
    }catch(error){say('#migration-commit-feedback',error.message);button.disabled=false}
    finally{button.textContent='Import now'}
  }

  function wire(){
    if(state.wired)return;state.wired=true;
    const zone=$('#migration-drop'),input=$('#migration-file');
    zone.addEventListener('click',()=>input.click());
    zone.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();input.click()}});
    for(const type of ['dragenter','dragover'])zone.addEventListener(type,e=>{e.preventDefault();zone.classList.add('is-over')});
    for(const type of ['dragleave','drop'])zone.addEventListener(type,e=>{e.preventDefault();zone.classList.remove('is-over')});
    zone.addEventListener('drop',e=>handleFile(e.dataTransfer?.files?.[0]));
    input.addEventListener('change',()=>{handleFile(input.files?.[0]);input.value=''});
    $('#migration-entity').addEventListener('change',e=>selectEntity(e.target.value));
    $('#migration-preview').addEventListener('click',preview);
    $('#migration-commit').addEventListener('click',commit);
    document.querySelectorAll('input[name="migration-dup"]').forEach(r=>r.addEventListener('change',()=>{if(state.previewed)preview()}));
    // A file dropped outside the zone must not navigate the whole page away.
    for(const type of ['dragover','drop'])window.addEventListener(type,e=>{if(!e.target.closest?.('#migration-drop')&&e.dataTransfer?.types?.includes('Files'))e.preventDefault()});
  }
  onView('migration',{enter(){wire();loadSchema().catch(e=>say('#migration-file-info',e.message))},leave(){clearTimeout(state.armed);state.armed=null}});
})();
