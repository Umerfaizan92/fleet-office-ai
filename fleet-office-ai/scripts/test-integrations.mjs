import assert from 'node:assert/strict';
import { createIntegrationRuntime } from '../src/integration-runtime.js';

const calls=[];
const json=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{'content-type':'application/json'}});
const fetchMock=async(url,opt={})=>{
  calls.push({url:String(url),method:opt.method||'GET',body:String(opt.body||''),headers:opt.headers||{}});
  const u=String(url);
  if(u==='https://oauth2.googleapis.com/token')return json({access_token:'google-new',expires_in:3600,token_type:'Bearer'});
  if(u.includes('/youtube/v3/channels'))return json({items:[{id:'UC123',snippet:{title:'Test Channel'}}]});
  if(u.includes('/v23.0/me/accounts'))return json({data:[{id:'PAGE1',name:'Test Page',instagram_business_account:{id:'IG1',username:'test_ig'}}]});
  if(u.includes('/v23.0/me?'))return json({id:'META1',name:'Test Meta User'});
  if(u==='https://oauth2.googleapis.com/revoke')return json({});
  throw new Error('Unexpected mock URL: '+u);
};

const env={
  INTEGRATION_ENCRYPTION_KEY:'current-key',
  GOOGLE_CLIENT_ID:'google-client',
  GOOGLE_CLIENT_SECRET:'google-secret',
  META_GRAPH_VERSION:'v23.0'
};
const runtime=createIntegrationRuntime({env,fetchImpl:fetchMock,legacySecrets:['legacy-key']});

const original={access_token:'secret-access',refresh_token:'secret-refresh',expires_in:3600,scope:'openid'};
const encrypted=runtime.encryptBundle(original);
assert.equal(encrypted.alg,'aes-256-gcm');
assert.equal(JSON.stringify(encrypted).includes('secret-access'),false);
assert.equal(runtime.decryptBundle(encrypted).access_token,'secret-access');

const legacyRuntime=createIntegrationRuntime({env:{INTEGRATION_ENCRYPTION_KEY:'legacy-key'},fetchImpl:fetchMock});
const legacyEncrypted=legacyRuntime.encryptBundle({access_token:'legacy-token'});
assert.equal(runtime.decryptBundle(legacyEncrypted).access_token,'legacy-token');

const expired={
  access_token:'google-old',
  refresh_token:'google-refresh',
  expires_at:new Date(Date.now()-1000).toISOString(),
  scope:'openid'
};
const youtube=await runtime.testConnection('youtube',expired);
assert.equal(youtube.refreshed,true);
assert.equal(youtube.bundle.access_token,'google-new');
assert.equal(youtube.bundle.refresh_token,'google-refresh');
assert.equal(youtube.identity.label,'Test Channel');
assert.equal(youtube.resources[0].id,'UC123');

const meta=await runtime.testConnection('meta',{access_token:'meta-token'});
assert.equal(meta.identity.label,'Test Meta User');
assert.equal(meta.resources.some(x=>x.id==='PAGE1'&&x.type==='facebook_page'),true);
assert.equal(meta.resources.some(x=>x.id==='IG1'&&x.type==='instagram_account'),true);

const revoked=await runtime.revokeConnection('youtube',{access_token:'google-new'});
assert.equal(revoked.remote_revoked,true);

assert.equal(calls.some(x=>x.url==='https://oauth2.googleapis.com/token'&&x.body.includes('grant_type=refresh_token')),true);
assert.equal(calls.some(x=>x.url.includes('/youtube/v3/channels')),true);
assert.equal(calls.some(x=>x.url.includes('/v23.0/me/accounts')),true);

console.log('INTEGRATION RUNTIME TESTS PASSED: encryption, legacy decrypt, refresh, discovery and revoke.');
