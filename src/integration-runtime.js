import crypto from 'node:crypto';

function useful(value){return value!==undefined&&value!==null&&String(value).trim()!==''}
function nowIso(){return new Date().toISOString()}
function secretKey(secret){return crypto.createHash('sha256').update('superpro-integrations:'+String(secret)).digest()}
function safeJson(value,fallback={}){try{return JSON.parse(String(value||''))}catch{return fallback}}
function publicError(data,status){
  return data?.error?.message||data?.error_description||data?.message||data?.error||('Provider request failed with HTTP '+status);
}

export function createIntegrationRuntime({env,fetchImpl=globalThis.fetch,legacySecrets=[]}={}){
  if(typeof fetchImpl!=='function')throw new Error('Integration runtime requires fetch.');

  function secretCandidates(){
    const values=[env?.INTEGRATION_ENCRYPTION_KEY,...legacySecrets,env?.SAAS_SESSION_SECRET,env?.SESSION_SECRET,env?.ADMIN_SESSION_SECRET]
      .filter(useful)
      .map(String);
    return [...new Set(values)];
  }
  function encryptionSecret(){
    const first=secretCandidates()[0];
    if(!first)throw new Error('Integration encryption secret is not configured.');
    return first;
  }
  function encryptBundle(bundle){
    const iv=crypto.randomBytes(12),cipher=crypto.createCipheriv('aes-256-gcm',secretKey(encryptionSecret()),iv);
    const data=Buffer.concat([cipher.update(JSON.stringify(bundle),'utf8'),cipher.final()]);
    return {v:1,alg:'aes-256-gcm',iv:iv.toString('base64url'),tag:cipher.getAuthTag().toString('base64url'),data:data.toString('base64url')};
  }
  function decryptWithSecret(encrypted,secret){
    const iv=Buffer.from(String(encrypted.iv),'base64url'),tag=Buffer.from(String(encrypted.tag),'base64url'),data=Buffer.from(String(encrypted.data),'base64url');
    const decipher=crypto.createDecipheriv('aes-256-gcm',secretKey(secret),iv);decipher.setAuthTag(tag);
    return JSON.parse(Buffer.concat([decipher.update(data),decipher.final()]).toString('utf8'));
  }
  function decryptBundle(encrypted){
    const value=typeof encrypted==='string'?safeJson(encrypted,null):encrypted;
    if(!value||value.alg!=='aes-256-gcm'||!value.iv||!value.tag||!value.data)throw new Error('Stored integration token bundle is invalid.');
    let last;
    for(const secret of secretCandidates()){
      try{return decryptWithSecret(value,secret)}catch(err){last=err}
    }
    throw new Error('Stored integration credentials cannot be decrypted with the current integration key.'+(last?.message?' '+last.message:''));
  }
  function normalizeToken(incoming,previous={}){
    const issued=Date.now(),merged={...previous,...incoming};
    if(!incoming?.refresh_token&&previous?.refresh_token)merged.refresh_token=previous.refresh_token;
    if(!incoming?.scope&&previous?.scope)merged.scope=previous.scope;
    merged.issued_at=new Date(issued).toISOString();
    if(Number(incoming?.expires_in)>0)merged.expires_at=new Date(issued+Number(incoming.expires_in)*1000).toISOString();
    else if(!merged.expires_at&&Number(previous?.expires_in)>0&&previous?.issued_at){
      merged.expires_at=new Date(new Date(previous.issued_at).getTime()+Number(previous.expires_in)*1000).toISOString();
    }
    if(Number(incoming?.refresh_expires_in)>0)merged.refresh_expires_at=new Date(issued+Number(incoming.refresh_expires_in)*1000).toISOString();
    return merged;
  }
  function expiring(bundle,skewMs=120000){
    if(!bundle?.access_token)return true;
    if(!bundle.expires_at)return false;
    const t=new Date(bundle.expires_at).getTime();
    return !Number.isFinite(t)||t<=Date.now()+skewMs;
  }
  async function readJson(response){
    const text=await response.text().catch(()=> '');
    if(!text)return {};
    try{return JSON.parse(text)}catch{return {message:text.slice(0,1000)}}
  }
  async function requestJson(url,{method='GET',headers={},body}={}){
    const response=await fetchImpl(url,{method,headers,body});
    const data=await readJson(response);
    if(!response.ok){
      const err=new Error(publicError(data,response.status));err.status=response.status;err.providerPayload=data;throw err;
    }
    return data;
  }
  async function postForm(url,values,headers={}){
    const body=new URLSearchParams();
    for(const [k,v] of Object.entries(values||{}))if(useful(v))body.set(k,String(v));
    return requestJson(url,{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded',...headers},body});
  }
  async function refreshToken(provider,bundle){
    if(!bundle?.refresh_token)throw new Error('This provider did not return a refresh token. Re-authorisation is required.');
    let next;
    if(provider==='youtube'||provider==='google_business'){
      next=await postForm('https://oauth2.googleapis.com/token',{client_id:env.GOOGLE_CLIENT_ID,client_secret:env.GOOGLE_CLIENT_SECRET,refresh_token:bundle.refresh_token,grant_type:'refresh_token'});
    }else if(provider==='tiktok'){
      next=await postForm('https://open.tiktokapis.com/v2/oauth/token/',{client_key:env.TIKTOK_CLIENT_KEY,client_secret:env.TIKTOK_CLIENT_SECRET,grant_type:'refresh_token',refresh_token:bundle.refresh_token});
    }else if(provider==='x'){
      const basic=Buffer.from(String(env.X_CLIENT_ID||'')+':'+String(env.X_CLIENT_SECRET||'')).toString('base64');
      next=await postForm('https://api.x.com/2/oauth2/token',{client_id:env.X_CLIENT_ID,grant_type:'refresh_token',refresh_token:bundle.refresh_token},{authorization:'Basic '+basic});
    }else if(provider==='snapchat'){
      const basic=Buffer.from(String(env.SNAPCHAT_CLIENT_ID||'')+':'+String(env.SNAPCHAT_CLIENT_SECRET||'')).toString('base64');
      next=await postForm(String(env.SNAPCHAT_TOKEN_URL||''),{grant_type:'refresh_token',refresh_token:bundle.refresh_token},{authorization:'Basic '+basic});
    }else{
      throw new Error('Automatic token refresh is not available for '+provider+'. Re-authorisation may be required when the provider token expires.');
    }
    if(!next?.access_token)throw new Error('Provider refresh did not return an access token.');
    return normalizeToken(next,bundle);
  }
  async function ensureFreshToken(provider,bundle){
    const current=normalizeToken(bundle||{},bundle||{});
    if(!expiring(current))return {bundle:current,refreshed:false};
    if(['youtube','google_business','tiktok','x','snapchat'].includes(provider)&&current.refresh_token){
      return {bundle:await refreshToken(provider,current),refreshed:true};
    }
    if(!current.access_token)throw new Error('This connection has no usable access token. Re-authorise the provider.');
    return {bundle:current,refreshed:false};
  }
  function authHeaders(bundle,extra={}){return {authorization:'Bearer '+bundle.access_token,...extra}}
  async function metaGet(path,bundle){
    const version=String(env.META_GRAPH_VERSION||'v23.0');
    return requestJson('https://graph.facebook.com/'+version+'/'+String(path).replace(/^\/+/,'').replaceAll(' ','%20'),{headers:authHeaders(bundle)});
  }
  async function testMeta(bundle){
    const identity=await metaGet('me?fields=id,name',bundle);
    const resources=[];
    try{
      const pages=await metaGet('me/accounts?fields=id,name,instagram_business_account{id,username,name}',bundle);
      for(const page of pages.data||[]){
        resources.push({id:String(page.id),type:'facebook_page',label:page.name||String(page.id)});
        const ig=page.instagram_business_account;
        if(ig?.id)resources.push({id:String(ig.id),type:'instagram_account',label:ig.username||ig.name||String(ig.id),parent_id:String(page.id)});
      }
    }catch{}
    return {identity:{id:String(identity.id||''),label:identity.name||'Meta account'},resources};
  }
  async function testWhatsApp(bundle){
    const identity=await metaGet('me?fields=id,name',bundle),resources=[];
    const businesses=await metaGet('me/businesses?fields=id,name',bundle).catch(()=>({data:[]}));
    for(const business of (businesses.data||[]).slice(0,10)){
      resources.push({id:String(business.id),type:'meta_business',label:business.name||String(business.id)});
      const wabas=await metaGet(String(business.id)+'/owned_whatsapp_business_accounts?fields=id,name',bundle).catch(()=>({data:[]}));
      for(const waba of (wabas.data||[]).slice(0,20)){
        resources.push({id:String(waba.id),type:'whatsapp_business_account',label:waba.name||String(waba.id),parent_id:String(business.id)});
        const phones=await metaGet(String(waba.id)+'/phone_numbers?fields=id,display_phone_number,verified_name,quality_rating',bundle).catch(()=>({data:[]}));
        for(const phone of phones.data||[]){
          resources.push({id:String(phone.id),type:'whatsapp_phone',label:phone.verified_name||phone.display_phone_number||String(phone.id),parent_id:String(waba.id),detail:phone.display_phone_number||''});
        }
      }
    }
    return {identity:{id:String(identity.id||''),label:identity.name||'Meta account'},resources};
  }
  async function testTikTok(bundle){
    const d=await requestJson('https://open.tiktokapis.com/v2/user/info/?fields=open_id,union_id,display_name,avatar_url',{headers:authHeaders(bundle)});
    const u=d?.data?.user||{};
    return {identity:{id:String(u.open_id||bundle.open_id||''),label:u.display_name||String(u.open_id||'TikTok account')},resources:[{id:String(u.open_id||bundle.open_id||''),type:'tiktok_account',label:u.display_name||'TikTok account'}].filter(x=>x.id)};
  }
  async function testYouTube(bundle){
    const d=await requestJson('https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true',{headers:authHeaders(bundle)});
    const resources=(d.items||[]).map(x=>({id:String(x.id),type:'youtube_channel',label:x?.snippet?.title||String(x.id)}));
    return {identity:{id:resources[0]?.id||'',label:resources[0]?.label||'Google / YouTube account'},resources};
  }
  async function testGoogleBusiness(bundle){
    const d=await requestJson('https://mybusinessaccountmanagement.googleapis.com/v1/accounts',{headers:authHeaders(bundle,{'x-goog-api-format-version':'2'})});
    const resources=[];
    for(const account of (d.accounts||[]).slice(0,10)){
      const accountName=String(account.name||'');
      if(!accountName)continue;
      resources.push({id:accountName,type:'google_business_account',label:account.accountName||accountName});
      const url='https://mybusinessbusinessinformation.googleapis.com/v1/'+accountName+'/locations?readMask=name,title,storefrontAddress,metadata';
      const locations=await requestJson(url,{headers:authHeaders(bundle,{'x-goog-api-format-version':'2'})}).catch(()=>({locations:[]}));
      for(const loc of locations.locations||[]){
        resources.push({id:String(loc.name||''),type:'google_business_location',label:loc.title||String(loc.name||''),parent_id:accountName});
      }
    }
    return {identity:{id:resources[0]?.id||'',label:resources[0]?.label||'Google Business Profile'},resources};
  }
  async function testX(bundle){
    const d=await requestJson('https://api.x.com/2/users/me?user.fields=id,name,username,profile_image_url',{headers:authHeaders(bundle)});
    const u=d.data||{};
    return {identity:{id:String(u.id||''),label:u.username?'@'+u.username:(u.name||'X account')},resources:[{id:String(u.id||''),type:'x_account',label:u.username?'@'+u.username:(u.name||'X account')}].filter(x=>x.id)};
  }
  async function testSnapchat(bundle){
    const base=String(env.SNAPCHAT_API_BASE_URL||'https://adsapi.snapchat.com').replace(/\/$/,'');
    const d=await requestJson(base+'/v1/me',{headers:authHeaders(bundle)});
    const me=d?.me||d?.data||d;
    const id=String(me?.id||me?.member_id||me?.sub||'');
    const label=me?.display_name||me?.name||me?.email||'Snapchat account';
    return {identity:{id,label},resources:id?[{id,type:'snapchat_account',label}]:[]};
  }
  async function testConnection(provider,bundle){
    const fresh=await ensureFreshToken(provider,bundle);
    let result;
    if(provider==='meta')result=await testMeta(fresh.bundle);
    else if(provider==='whatsapp')result=await testWhatsApp(fresh.bundle);
    else if(provider==='tiktok')result=await testTikTok(fresh.bundle);
    else if(provider==='youtube')result=await testYouTube(fresh.bundle);
    else if(provider==='google_business')result=await testGoogleBusiness(fresh.bundle);
    else if(provider==='x')result=await testX(fresh.bundle);
    else if(provider==='snapchat')result=await testSnapchat(fresh.bundle);
    else throw new Error('Live connection testing is not implemented for '+provider+'.');
    return {ok:true,provider,refreshed:fresh.refreshed,bundle:fresh.bundle,identity:result.identity,resources:result.resources||[],tested_at:nowIso()};
  }
  async function revokeConnection(provider,bundle){
    const token=String(bundle?.access_token||'');
    if(!token)return {remote_revoked:false,reason:'no_access_token'};
    try{
      if(provider==='youtube'||provider==='google_business'){
        await postForm('https://oauth2.googleapis.com/revoke',{token});
        return {remote_revoked:true};
      }
      if(provider==='tiktok'){
        await postForm('https://open.tiktokapis.com/v2/oauth/revoke/',{client_key:env.TIKTOK_CLIENT_KEY,client_secret:env.TIKTOK_CLIENT_SECRET,token});
        return {remote_revoked:true};
      }
      if(provider==='meta'||provider==='whatsapp'){
        const version=String(env.META_GRAPH_VERSION||'v23.0');
        await requestJson('https://graph.facebook.com/'+version+'/me/permissions',{method:'DELETE',headers:authHeaders(bundle)});
        return {remote_revoked:true};
      }
      return {remote_revoked:false,reason:'provider_remote_revoke_not_configured'};
    }catch(err){
      return {remote_revoked:false,reason:String(err?.message||err).slice(0,300)};
    }
  }

  return {encryptBundle,decryptBundle,normalizeToken,ensureFreshToken,refreshToken,testConnection,revokeConnection,requestJson,postForm};
}
