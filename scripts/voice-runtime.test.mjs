import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {workforceSkillSuggestions} from '../src/workforce-compliance.js';
const source=readFileSync(new URL('../saas/workspace-ai-runtime.js',import.meta.url),'utf8');
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function runtime(fetch){
 const audio=[],spoken=[],statuses=[];
 const synth={cancel(){},resume(){},getVoices(){return []},speak(u){spoken.push(u);u.onstart?.()}};
 const context={window:{speechSynthesis:synth,SpeechSynthesisUtterance:class{}},speechSynthesis:synth,SpeechSynthesisUtterance:class{},fetch,AbortController,setTimeout,clearTimeout,URL:{createObjectURL(){return 'blob:test'},revokeObjectURL(){}},Audio:class{constructor(){audio.push(this)}play(){this.onplay?.();return Promise.resolve()}pause(){this.paused=true}}};
 vm.runInNewContext(source,context);
 return {api:context.window.SuperProAIClient,audio,spoken,statuses,speak:()=>context.window.SuperProAIClient.speak('Test answer','en',{onStatus:(...s)=>statuses.push(s)})};
}
test('mute settles buffered audio without relying on ended event',{timeout:1500},async()=>{
 const r=runtime(async()=>({ok:true,blob:async()=>({size:1})}));const pending=r.speak();await tick();
 assert.equal(r.audio.length,1);r.api.stopSpeech();assert.equal(await pending,false);assert.equal(r.audio[0].paused,true);assert.equal(r.spoken.length,0);
});
test('mute aborts pending server request and never restarts browser fallback',{timeout:1500},async()=>{
 let signal;const r=runtime((_url,options)=>new Promise((_resolve,reject)=>{signal=options.signal;signal.addEventListener('abort',()=>reject(new Error('aborted')))}));
 const pending=r.speak();await tick();r.api.stopSpeech();assert.equal(signal.aborted,true);assert.equal(await pending,false);assert.equal(r.spoken.length,0);
});
test('mute settles device speech even when cancel emits no end event',{timeout:1500},async()=>{
 const r=runtime(async()=>({ok:false}));const pending=r.speak();await tick();assert.equal(r.spoken.length,1);r.api.stopSpeech();assert.equal(await pending,false);
});
test('late audio blob cannot resume playback after mute',{timeout:1500},async()=>{
 let release;const r=runtime(async()=>({ok:true,blob:()=>new Promise(resolve=>{release=resolve})}));const pending=r.speak();await tick();r.api.stopSpeech();release({size:1});assert.equal(await pending,false);assert.equal(r.audio.length,0);assert.equal(r.spoken.length,0);
});
test('service skills have no orphaned conjunctions',()=>{
 const suggestions=workforceSkillSuggestions({services:['Customer enquiries & quoting','coordination and painting']});
 const names=suggestions.filter(x=>x.source==='business_service').map(x=>x.name);
 assert.ok(names.includes('quoting'));assert.ok(names.includes('painting'));assert.ok(!names.some(x=>/^&|^and /i.test(x)));
});
