import fs from 'node:fs';
import path from 'node:path';
const root=process.cwd();
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const exists=p=>fs.existsSync(path.join(root,p));
const checks=[];const add=(name,ok)=>checks.push({name,ok:Boolean(ok)});

const required=[
  'src/server.js','src/db.js','src/ai-provider-shim.js',
  'saas/index.html','saas/workspace.html','saas/product-guide.js','saas/intro.js','saas/app.js',
  'saas/ai-operations.js','saas/common.js','saas/install.js','saas/workspace-extras.js',
  'saas/brand.css','saas/experience.css','saas/public-sections.css','saas/public-voice-install.css','saas/workspace-theme.css',
  'saas/manifest.webmanifest','saas/sw.js','saas/superpro-icon-192.png','saas/superpro-icon-512.png',
  'office/index.html','office/office.js','office/office-extras.js','office/office-records.js','office/office-insights.js',
  'office/office-theme.css','office/office-records.css','office/office-layout.css','office/office-insights.css'
];
for(const f of required)add('file:'+f,exists(f));

const obsolete=[
  'saas/guide-v16.js','saas/guide-v17-hotfix.js','saas/superpro-v12.js','saas/superpro-v12.css',
  'saas/v11.js','saas/v14.js','saas/v15.js','saas/ai-operations-v16.js','saas/v5.css','saas/v13.css','saas/v14.css','saas/v15.css',
  'office/office-v11.js','office/office-v12.js','office/office-v14.js','office/office-v11.css','office/office-v12.css','office/office-v13.css','office/office-v14.css'
];
add('cleanup:no-obsolete-runtime-files',obsolete.every(f=>!exists(f)));

const index=read('saas/index.html'),workspace=read('saas/workspace.html'),guide=read('saas/product-guide.js'),intro=read('saas/intro.js'),app=read('saas/app.js'),ops=read('saas/ai-operations.js'),server=read('src/server.js'),shim=read('src/ai-provider-shim.js'),sw=read('saas/sw.js'),office=read('office/index.html'),db=read('src/db.js');
add('brand:super-pro',index.includes('Super Pro AI Office Manager')&&office.includes('Super Pro AI Office Manager'));
add('runtime:single-guide',index.includes('product-guide.js')&&!index.includes('guide-v16')&&!index.includes('guide-v17'));
add('runtime:current-workspace-ai',workspace.includes('ai-operations.js')&&workspace.includes('workspace-extras.js'));
add('runtime:current-common',index.includes('common.js')&&workspace.includes('common.js'));
add('language:roman-urdu',guide.includes("strong>=1||(strong+common)>=2")&&server.includes("strong>=1||(strong+common)>=2"));
add('language:localized-fallback',guide.includes('localized-browser-fallback')&&guide.includes('emergencyLanguageReply'));
add('language:selected-priority',guide.includes("language&&language!=='auto'?language:detectLanguage"));
add('memory:current-conversation',guide.includes('superpro_ai_memory_current')&&guide.includes('conversation_id:conversationId'));
add('ai:central-provider',server.includes('generateAiText')&&shim.includes('resolveAiProviderConfig'));
add('ai:strict-free-mode',shim.includes('if (freeAiModeEnabled()) return gemini')&&shim.includes('if (freeAiModeEnabled()) return null'));
add('ai:gemini-free',shim.includes('generativelanguage.googleapis.com')&&server.includes('GEMINI_TTS_MODEL'));
add('ai:operations-resilient',server.includes('local-operational-fallback')&&server.includes('/api/saas/ai/threads')&&ops.includes('/api/saas/ai/threads'));
add('ai:content-studio-live',server.includes('/api/saas/content/ai-spec')&&app.includes('/api/saas/content/ai-spec'));
add('ai:global-search-stt',app.includes('/api/saas/voice/transcribe')&&app.includes('automatic language detection'));
add('ai:operations-status',ops.includes('/api/saas/ai/status')&&ops.includes('startBrowserRecognitionFallback'));
add('ai:copilot-init-safe',!app.includes("voiceTest=shell.querySelector('[data-copilot-voice-test]'); if(voiceStyle)"));
add('ai:quality-central',server.includes('/api/admin/ai-quality/check')&&!server.includes("checkerBase=String(env.AI_CHECKER_PROVIDER_BASE_URL"));
add('voice:server-tts',server.includes('/api/saas/voice/speech')&&server.includes('makeGeminiSpeechAudio'));
add('voice:server-stt',server.includes('/api/saas/voice/transcribe')&&server.includes('transcribeWithGemini'));
add('voice:browser-fallback',intro.includes('startBrowserRecognitionFallback')&&app.includes('browserSpeak'));
add('voice:barge-in',intro.includes('stopSpeech();\n    primeSpeech();addMessage')&&intro.includes('r.onstart=()=>{stopSpeech();')&&ops.includes('stopSpeech()'));
add('voice:male-female-auto',intro.includes('Voice: Female')&&intro.includes('Voice: Male')&&server.includes('geminiVoiceChoice'));
add('pwa:manifest',index.includes('manifest.webmanifest'));
add('pwa:private-cache-exclusion',sw.includes("startsWith('/api/')")&&sw.includes("includes('workspace')")&&sw.includes("startsWith('/office/')"));
add('connections:oauth',server.includes('/api/saas/integrations/oauth/:provider/callback')&&server.includes('saveIntegrationConnection'));
add('connections:no-customer-secrets',server.includes('customer_secret_entry:false'));
add('security:sessions',server.includes('HttpOnly')&&server.includes('SameSite=Strict'));
add('security:mfa',server.includes('/api/saas/mfa/setup')&&server.includes('/api/saas/mfa/verify'));
add('governance:audit',server.includes('governance_ledger')&&server.includes('saas_audit_events'));
add('workforce:jobs',server.includes('/api/saas/workers')&&server.includes('/api/saas/work-orders'));
add('finance:tenant',server.includes('/api/saas/finance')&&db.includes('organisation_finance_entries'));
add('content:studio',workspace.includes('video-view')&&app.includes('renderTrendSuggestions'));
add('office:current-assets',office.includes('office-extras.js')&&office.includes('office-records.js')&&office.includes('office-insights.js')&&!office.includes('office-v11'));
add('seo:public',/<title>[^<]{20,}/.test(index)&&/name="description"/.test(index)&&/rel="canonical"/.test(index)&&/application\/ld\+json/.test(index));
add('private:noindex-office',/noindex,nofollow/.test(office));

const score=Math.round(100*checks.filter(x=>x.ok).length/checks.length),status=score>=90?'PASS':'FAIL',ts=new Date().toISOString();
fs.mkdirSync(path.join(root,'qa'),{recursive:true});
if(!exists('qa/results.tsv'))fs.writeFileSync(path.join(root,'qa/results.tsv'),'timestamp\tversion\tscore\tstatus\tchecks\n');
fs.appendFileSync(path.join(root,'qa/results.tsv'),`${ts}\tcurrent\t${score}\t${status}\t${checks.map(x=>`${x.ok?'✓':'✗'}${x.name}`).join(';')}\n`);
console.log(`CURRENT QUALITY CHECK: ${status} ${score}/100`);
for(const c of checks)console.log(`${c.ok?'PASS':'FAIL'}  ${c.name}`);
process.exit(status==='PASS'?0:1);
