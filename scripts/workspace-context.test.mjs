import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../saas/workspace-context.js',import.meta.url),'utf8');
function setup(){
 const storage=new Map([['superpro_active_organisation','business-a']]),calls=[],navigations=[];
 const context={URL,Request,Headers,sessionStorage:{getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},location:{href:'https://app.example/saas/workspace.html',origin:'https://app.example',replace:p=>navigations.push(p)},window:{fetch:async(input,options)=>{calls.push({input,options});return {ok:true,json:async()=>({organisation:{id:'business-b'}})}}}};
 vm.runInNewContext(source,context);return {context,storage,calls,navigations,api:context.window.SuperProWorkspaceContext};
}
test('all same-origin API modules use the document business; third-party requests do not',async()=>{
 const r=setup();await r.context.window.fetch('/api/saas/work-orders');await r.context.window.fetch('/api/product-guide/answer');await r.context.window.fetch('https://provider.example/api/messages');
 assert.equal(r.calls[0].options.headers.get('X-Organisation-Id'),'business-a');assert.equal(r.calls[1].options.headers.get('X-Organisation-Id'),'business-a');assert.equal(r.calls[2].options.headers,undefined);
});
test('switch validates membership, reloads, and keeps old in-flight forms bound to old business',async()=>{
 const r=setup();await r.api.switchTo('business-b');assert.equal(r.storage.get('superpro_active_organisation'),'business-b');assert.deepEqual(r.navigations,['workspace.html#dashboard']);await r.context.window.fetch('/api/saas/work-orders',{method:'POST'});assert.equal(r.calls.at(-1).options.headers.get('X-Organisation-Id'),'business-a');
});
test('workspace memory never loads another business, user or legacy unscoped history',()=>{
 const text=readFileSync(new URL('../saas/product-guide.js',import.meta.url),'utf8');
 const code=text.slice(text.indexOf('  function memoryKey('),text.indexOf('  async function answerAsync('));
 const storage=new Map([['superpro_ai_memory_current:workspace','[{"q":"legacy private text"}]']]);
 const context={window:{},crypto,localStorage:{getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)}};
 vm.runInNewContext(code,context);assert.equal(context.loadMemory('workspace').length,0);
 context.window.GDS_SESSION={organisation:{id:'a'},user:{id:'u1'}};context.saveMemory('workspace',[{q:'Private A',a:'Answer'}]);assert.equal(context.loadMemory('workspace')[0].q,'Private A');
 context.window.GDS_SESSION.organisation.id='b';assert.equal(context.loadMemory('workspace').length,0);
 context.window.GDS_SESSION.organisation.id='a';context.window.GDS_SESSION.user.id='u2';assert.equal(context.loadMemory('workspace').length,0);
});

test('compact setup exposes one panel and reveals invalid fields with keyboard navigation',()=>{
 const source=readFileSync(new URL('../saas/workspace-extras.js',import.meta.url),'utf8');
 const code=source.slice(source.indexOf('  function setupSettingsNav('),source.indexOf('  function setupContextHelp('));
 const element=()=>({attrs:{},handlers:{},classList:{toggle(){}},setAttribute(k,v){this.attrs[k]=v},getAttribute(k){return this.attrs[k]},addEventListener(k,fn){this.handlers[k]=fn},focus(){this.focused=true}});
 const panels=Array.from({length:4},(_,i)=>({...element(),id:`panel-${i}`}));
 const buttons=panels.map((_,i)=>({...element(),dataset:{settingsTarget:`field-${i}`}}));
 const nav=element(),form=element();
 const context={$:s=>s==='.settings-nav'?nav:s==='#onboarding-form'?form:{closest:()=>panels[Number(s.at(-1))]},$$:s=>s.includes('data-settings-target')?buttons:panels};
 vm.runInNewContext(code+';setupSettingsNav();',context);
 assert.deepEqual(panels.map(p=>p.hidden),[false,true,true,true]);
 buttons[0].handlers.keydown({key:'ArrowRight',preventDefault(){}});
 assert.deepEqual(panels.map(p=>p.hidden),[true,false,true,true]);assert.equal(buttons[1].focused,true);
 form.handlers.invalid({target:{closest:()=>panels[3]}});
 assert.deepEqual(panels.map(p=>p.hidden),[true,true,true,false]);
});

test('focused sections preserve forms, expose invalid fields and respect hidden role panels',()=>{
 const source=readFileSync(new URL('../saas/focused-workspace.js',import.meta.url),'utf8');
 function element(tag='div'){
  const classes=new Set();return {tag,children:[],handlers:{},attributes:{},hidden:false,textContent:'',classList:{add:x=>classes.add(x),toggle:(x,on)=>on?classes.add(x):classes.delete(x),contains:x=>classes.has(x)},
   append(...items){for(const item of items){this.children.push(item);item.parentElement=this}},setAttribute(k,v){this.attributes[k]=v},addEventListener(k,fn){this.handlers[k]=fn},contains(item){return item===this||this.children.some(child=>child.contains(item))},get options(){return this.children},after(item){this.parentElement.append(item)},prepend(item){this.append(item)}};
 }
 const view=element(),heading=element(),container=element(),first=element(),second=element(),input=element('input');view.id='test-view';first.id='first';second.id='second';input.value='unsaved work';view.append(heading,container);container.append(first,second);first.append(input);
 first.querySelector=()=>({textContent:'Form'});second.querySelector=()=>({textContent:'Records'});view.querySelectorAll=()=>[first,second];view.querySelector=()=>heading;
 const observers=[];const context={document:{createElement:element},MutationObserver:class{constructor(callback){this.callback=callback;observers.push(this)}observe(){}}};
 vm.runInNewContext(source.slice(source.indexOf('  function installSections('),source.indexOf('  function paginate(')),context);context.installSections(view,{selector:'test',preferred:'Records'});
 const nav=view.children.at(-1),select=nav.children[0].children[0];assert.equal(first.classList.contains('focus-inactive'),true);assert.equal(second.classList.contains('focus-inactive'),false);
 view.handlers.invalid({target:input});assert.equal(first.classList.contains('focus-inactive'),false);assert.equal(input.value,'unsaved work');assert.equal(first.children[0],input);
 first.hidden=true;observers[0].callback();assert.equal(select.options[0].disabled,true);assert.equal(second.classList.contains('focus-inactive'),false);
});

test('record pagination resets when results change and does not remove records',()=>{
 const source=readFileSync(new URL('../saas/focused-workspace.js',import.meta.url),'utf8');let observer;
 function element(){const classes=new Set();return {children:[],hidden:false,handlers:{},classList:{toggle:(k,v)=>v?classes.add(k):classes.delete(k),contains:k=>classes.has(k)},append(...items){this.children.push(...items)},setAttribute(){},addEventListener(k,fn){this.handlers[k]=fn}}}
 const list=element();list.children=Array.from({length:12},element);let nav;list.after=item=>nav=item;
 const context={document:{createElement:element},MutationObserver:class{constructor(callback){observer=callback}observe(){}}};
 vm.runInNewContext(source.slice(source.indexOf('  function paginate('),source.indexOf('  function install(){')),context);context.paginate(list,5);
 assert.equal(list.children.filter(r=>!r.classList.contains('focus-page-hidden')).length,5);nav.children[2].handlers.click();assert.equal(list.children[5].classList.contains('focus-page-hidden'),false);assert.equal(list.children.length,12);
 list.children=[element(),element()];observer();assert.equal(nav.hidden,true);assert.equal(list.children[0].classList.contains('focus-page-hidden'),false);
});
