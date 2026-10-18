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
