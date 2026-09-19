import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';

const root=process.cwd(),failures=[];
const abs=p=>path.join(root,p),exists=p=>fs.existsSync(abs(p)),read=p=>fs.readFileSync(abs(p),'utf8');

const required=[
  'package.json','.env.example',
  'src/server.js','src/db.js','src/ai-provider-shim.js','src/integration-runtime.js',
  'saas/index.html','saas/workspace.html','saas/product-guide.js','saas/intro.js','saas/workspace-ai-runtime.js','saas/app.js',
  'saas/ai-operations.js','saas/integration-manager.js','saas/platform-notices.js','saas/common.js','saas/install.js','saas/workspace-extras.js',
  'saas/brand.css','saas/experience.css','saas/public-sections.css','saas/public-voice-install.css','saas/workspace-theme.css',
  'saas/manual.js','saas/support.js','saas/adaptive.css','saas/governance.css','saas/manifest.webmanifest','saas/sw.js',
  'saas/superpro-icon-192.png','saas/superpro-icon-512.png',
  'office/index.html','office/office.js','office/office.css','office/office-extras.js','office/office-records.js','office/office-insights.js',
  'office/office-theme.css','office/office-records.css','office/office-layout.css','office/office-insights.css',
  'scripts/quality-check.mjs','scripts/quality-ratchet.mjs','scripts/check-config.mjs','scripts/smoke-test.mjs','scripts/verify-manifest.mjs'
];
for(const p of required)if(!exists(p))failures.push('Missing '+p);

const obsolete=[
  'saas/guide-v16.js','saas/guide-v17-hotfix.js','saas/superpro-v12.js','saas/superpro-v12.css',
  'saas/v11.js','saas/v14.js','saas/v15.js','saas/ai-operations-v16.js','saas/v5.css','saas/v13.css','saas/v14.css','saas/v15.css',
  'office/office-v11.js','office/office-v12.js','office/office-v14.js','office/office-v11.css','office/office-v12.css','office/office-v13.css','office/office-v14.css'
];
for(const p of obsolete)if(exists(p))failures.push('Obsolete runtime still present: '+p);

function localAssetRefs(file){
  const html=read(file),refs=[];
  for(const m of html.matchAll(/<(?:script|link)\b[^>]*(?:src|href)=["']([^"']+)["'][^>]*>/gi)){
    const raw=m[1];
    if(!raw||raw.startsWith('http:')||raw.startsWith('https:')||raw.startsWith('//')||raw.startsWith('#')||raw.startsWith('data:')||raw.includes('__PUBLIC_BASE_URL__'))continue;
    const clean=raw.split('?')[0].split('#')[0];
    if(!/\.(?:js|css|html|webmanifest|png|svg|ico)$/i.test(clean))continue;
    const rel=clean.startsWith('/')?clean.replace(/^\//,''):path.posix.normalize(path.posix.join(path.posix.dirname(file),clean));
    refs.push({raw,rel});
  }
  return refs;
}
for(const dir of ['saas','office']){
  for(const name of fs.readdirSync(abs(dir)).filter(x=>x.endsWith('.html'))){
    const file=dir+'/'+name;
    for(const ref of localAssetRefs(file))if(!exists(ref.rel))failures.push(`${file} references missing ${ref.raw} -> ${ref.rel}`);
  }
}

const jsFiles=[];
for(const dir of ['saas','office','src','scripts']){
  if(!exists(dir))continue;
  for(const name of fs.readdirSync(abs(dir))){
    if(!/\.(?:js|mjs)$/i.test(name))continue;
    jsFiles.push(dir+'/'+name);
  }
}
for(const file of jsFiles){
  const r=spawnSync(process.execPath,['--check',abs(file)],{encoding:'utf8'});
  if(r.status!==0)failures.push(`Syntax error in ${file}: ${String(r.stderr||r.stdout).trim().split('\n').slice(-2).join(' ')}`);
}

const index=read('saas/index.html'),workspace=read('saas/workspace.html'),office=read('office/index.html'),guide=read('saas/product-guide.js'),server=read('src/server.js'),shim=read('src/ai-provider-shim.js'),intro=read('saas/intro.js'),sw=read('saas/sw.js'),render=read('render.yaml');
for(const token of ['product-guide.js','intro.js','common.js','install.js','id="voice-capability"','Multilingual AI','manifest.webmanifest'])if(!index.includes(token))failures.push('index.html missing '+token);
for(const token of ['workspace-ai-runtime.js','app.js','ai-operations.js','integration-manager.js','platform-notices.js','workspace-extras.js','common.js','id="integration-self-service"','id="manual-view"','id="support-view"'])if(!workspace.includes(token))failures.push('workspace.html missing '+token);
if((workspace.match(/id="integration-self-service"/g)||[]).length!==1)failures.push('workspace.html must contain exactly one Connections hub');
for(const token of ['office.js','office-extras.js','office-records.js','office-insights.js','office-theme.css','office-layout.css','../saas/experience.css'])if(!office.includes(token))failures.push('office/index.html missing '+token);
for(const token of ['localized-browser-fallback','superpro_ai_memory_current','conversation_id:conversationId','knowledgeContext','detectLanguage'])if(!guide.includes(token))failures.push('product-guide.js missing '+token);
for(const token of ['/api/saas/integrations/self-service/:provider/test','/api/saas/integrations/self-service/:provider/resources','/api/saas/industry-registry','/api/saas/onboarding','/api/saas/regulatory/sources','/api/saas/regulatory/check','/api/saas/releases/latest','/api/saas/announcements','/api/admin/platform-announcements','/api/product-guide/answer','/api/product-guide/speech','/api/product-guide/speech-stream','/api/product-guide/transcribe','/api/saas/voice/speech','/api/saas/voice/transcribe','/api/saas/ai/status','/api/saas/ai/threads','local-operational-fallback','/api/saas/integrations/oauth/:provider/callback','/api/admin/ai-quality/check'])if(!server.includes(token))failures.push('server.js missing '+token);
for(const token of ['freeAiModeEnabled','geminiProviderConfig','if (freeAiModeEnabled()) return gemini','if (freeAiModeEnabled()) return null'])if(!shim.includes(token))failures.push('ai-provider-shim.js missing '+token);
for(const token of ['startBrowserRecognitionFallback','findLanguageVoice','splitSpeech','speechHeartbeat','guide-voice'])if(!intro.includes(token))failures.push('intro.js missing '+token);
for(const token of ["startsWith('/api/')","includes('workspace')","startsWith('/office/')","const CACHE='superpro-public-"])if(!sw.includes(token))failures.push('sw.js missing '+token);


for(const token of ['plan: 0.5c-512mb','numInstances: 1','mountPath: /var/data','value: "/var/data/super-pro.sqlite"','value: "/var/data/uploads"'])if(!render.includes(token))failures.push('render.yaml missing production persistence token '+token);
if(intro.includes('setTimeout(resolve,650)')||!intro.includes('Capture the first word immediately')||!intro.includes('No speech detected. Microphone stopped'))failures.push('intro.js microphone capture/auto-stop protections are incomplete');
if(!intro.includes('decodeAudioData')||!intro.includes('ensurePlaybackContext'))failures.push('intro.js missing unlocked Web Audio playback path');
if(!index.includes('intro.js?v=29')||!sw.includes('intro.js?v=29')||!sw.includes('superpro-public-20260919-14'))failures.push('public voice cache version was not bumped');

const env=read('.env.example');
for(const token of ['FREE_AI_MODE=1','GEMINI_API_KEY=','GEMINI_MODEL=gemini-3.5-flash','GEMINI_STT_MODEL=gemini-3.5-transcribe','GEMINI_TTS_MODEL=gemini-3.1-flash-tts-preview','SESSION_SECRET='])if(!env.includes(token))failures.push('.env.example missing '+token);
for(const token of ['/api/saas/content/ai-spec','generateAiText','local-content-fallback'])if(!server.includes(token))failures.push('server.js missing '+token);
if(!server.includes("const allowUnlistedOrigins = env.NODE_ENV !== 'production'")||server.includes('allowedOrigins.length === 0 ||'))failures.push('Production CORS must fail closed when ALLOWED_ORIGINS is omitted');
const app=read('saas/app.js'),ops=read('saas/ai-operations.js'),workspaceAi=read('saas/workspace-ai-runtime.js'),platformNotices=read('saas/platform-notices.js'),db=read('src/db.js');
for(const token of ['/api/saas/content/ai-spec'])if(!app.includes(token))failures.push('app.js missing '+token);
for(const token of ['/api/saas/ai/status','startBrowserRecognitionFallback'])if(!ops.includes(token))failures.push('ai-operations.js missing '+token);
for(const token of ['/api/saas/voice/transcribe','/api/saas/voice/speech','/api/saas/voice/speech-stream'])if(!workspaceAi.includes(token))failures.push('workspace-ai-runtime.js missing '+token);
if(app.includes("voiceTest=shell.querySelector('[data-copilot-voice-test]'); if(voiceStyle)"))failures.push('app.js contains unsafe copilot voice initialization ordering');
if(!workspaceAi.includes('window.SuperProAIClient')||!workspaceAi.includes('/api/saas/voice/speech-stream')||!workspaceAi.includes('/api/saas/voice/transcribe'))failures.push('workspace shared AI runtime is incomplete');
if(!app.includes('SuperProAIClient')||!ops.includes('SuperProAIClient'))failures.push('workspace assistants are not using the shared AI runtime');
const integrationRuntime=read('src/integration-runtime.js'),integrationManager=read('saas/integration-manager.js');
if(!integrationRuntime.includes('decryptBundle')||!integrationRuntime.includes('refreshToken')||!integrationRuntime.includes('testConnection')||!integrationRuntime.includes('revokeConnection'))failures.push('integration token lifecycle runtime is incomplete');
if(!integrationManager.includes('Test connection')||!integrationManager.includes('Disconnect')||!integrationManager.includes('Save selection'))failures.push('customer integration management UI is incomplete');
if(!server.includes('loadIntegrationBundle')||!server.includes('persistIntegrationBundle'))failures.push('server does not use encrypted integration token runtime');
if(!platformNotices.includes('/api/saas/announcements')||!platformNotices.includes('Updates & service notices'))failures.push('platform notice inbox is incomplete');
if(!db.includes('platform_announcements')||!db.includes('platform_announcement_deliveries'))failures.push('platform announcement storage is missing');
if(app.includes('button.hidden=!always&&!allowed.has(view)'))failures.push('industry setup must not hide core workspace modules');

if(failures.length){
  console.error('CURRENT FINAL VALIDATION FAILED');
  for(const x of failures)console.error('-',x);
  process.exit(1);
}
console.log(`CURRENT FINAL VALIDATION PASSED: ${required.length} core files, ${jsFiles.length} JavaScript files syntax-checked, local asset references resolved, obsolete runtime files absent.`);
