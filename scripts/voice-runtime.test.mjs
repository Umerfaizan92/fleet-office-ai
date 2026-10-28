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
 const context={window:{addEventListener(){},speechSynthesis:synth,SpeechSynthesisUtterance:class{}},speechSynthesis:synth,SpeechSynthesisUtterance:class{},fetch,AbortController,setTimeout,clearTimeout,URL:{createObjectURL(){return 'blob:test'},revokeObjectURL(){}},Audio:class{constructor(){audio.push(this)}play(){this.onplay?.();return Promise.resolve()}pause(){this.paused=true}}};
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

test('closing before microphone permission resolves releases tracks without recording',async()=>{
 let allow,stops=0,recorders=0;
 const context={window:{addEventListener(){}},navigator:{mediaDevices:{getUserMedia:()=>new Promise(r=>allow=r)}},MediaRecorder:class{constructor(){recorders++}},AbortController};
 context.window.MediaRecorder=context.MediaRecorder;vm.runInNewContext(source,context);
 const pending=context.window.SuperProAIClient.listen();context.window.SuperProAIClient.stopListening(true);
 allow({getTracks:()=>[{stop(){stops++}}]});const result=await pending;
 assert.equal(result.cancelled,true);assert.equal(stops,1);assert.equal(recorders,0);
});

function recordingRuntime(fetch){
 const recorders=[],statuses=[],listening=[];let stops=0;
 class Recorder{
  static isTypeSupported(){return true}
  constructor(){this.state='inactive';this.mimeType='audio/webm';recorders.push(this)}
  start(){this.state='recording';this.onstart?.()}
  stop(){this.state='inactive';this.ondataavailable?.({data:new Blob(['a'.repeat(800)])});this.onstop?.()}
 }
 const context={window:{addEventListener(){},MediaRecorder:Recorder},MediaRecorder:Recorder,navigator:{mediaDevices:{getUserMedia:async()=>({getTracks:()=>[{stop(){stops++}}]})}},fetch,AbortController,Blob,FormData,setTimeout,clearTimeout,clearInterval};
 vm.runInNewContext(source,context);
 return {api:context.window.SuperProAIClient,recorders,statuses,listening,get stops(){return stops},listen:()=>context.window.SuperProAIClient.listen({onStatus:(...s)=>statuses.push(s),onListening:s=>listening.push(s)})};
}
test('closing during transcription aborts the request without stale status callbacks',{timeout:1500},async()=>{
 let signal;const r=recordingRuntime((_url,options)=>new Promise((_resolve,reject)=>{signal=options.signal;signal.addEventListener('abort',()=>reject(new Error('aborted')))}));
 const pending=r.listen();await tick();r.recorders[0].stop();await tick();
 assert.equal(r.stops,1);assert.equal(r.api.isListening(),false);const count=r.statuses.length;
 r.api.stopListening(true);assert.equal(signal.aborted,true);assert.equal((await pending).cancelled,true);assert.equal(r.statuses.length,count);
});
test('a replacement recording cancels earlier transcription without changing its UI',{timeout:1500},async()=>{
 const requests=[];const r=recordingRuntime((_url,options)=>new Promise((resolve,reject)=>{requests.push({signal:options.signal,resolve});options.signal.addEventListener('abort',()=>reject(new Error('aborted')))}));
 const first=r.listen();await tick();r.recorders[0].stop();await tick();
 const second=r.listen();await tick();assert.equal(requests[0].signal.aborted,true);assert.equal((await first).cancelled,true);
 assert.equal(r.api.isListening(),true);assert.equal(r.listening.at(-1),true);
 r.recorders[1].stop();await tick();requests[1].resolve({ok:true,json:async()=>({text:'Current request',language:'en'})});
 assert.equal((await second).text,'Current request');assert.equal(r.stops,2);
});
test('provider transcription failure still reports an actionable error',{timeout:1500},async()=>{
 const r=recordingRuntime(async()=>({ok:false,json:async()=>({error:'Voice temporarily unavailable'})}));
 const pending=r.listen();await tick();const failed=assert.rejects(pending,/Voice temporarily unavailable/);r.recorders[0].stop();await failed;
 assert.equal(r.statuses.at(-1)[1],'limited');assert.equal(r.stops,1);
});
