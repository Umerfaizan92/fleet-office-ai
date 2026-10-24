import {spawn} from 'node:child_process';
import {randomBytes,randomUUID,createHash} from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';

const root=fs.mkdtempSync(path.join(os.tmpdir(),'superpro-branding-update-'));
const port=32000+Math.floor(Math.random()*10000);
const base='http://127.0.0.1:'+port, dbPath=path.join(root,'test.sqlite');
const uploadDir=path.join(root,'uploads');
const child=spawn(process.execPath,['src/server.js'],{
  cwd:process.cwd(),env:{...process.env,PORT:String(port),NODE_ENV:'test',
    PUBLIC_BASE_URL:base,ALLOWED_ORIGINS:base,DATABASE_PATH:dbPath,
    UPLOAD_DIR:uploadDir,SAAS_VERIFICATION_TEST_MODE:'0'},
  stdio:['ignore','pipe','pipe']
});
let output='';
child.stdout.on('data',b=>output+=b.toString());
child.stderr.on('data',b=>output+=b.toString());
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function waitHealth(){
  for(let i=0;i<60;i++){
    if(child.exitCode!==null)throw Error('Server terminated: '+output.slice(-3000));
    try{const r=await fetch(base+'/healthz');if(r.status===200)return}catch{}
    await sleep(250);
  }
  throw Error('Server startup failed: '+output.slice(-3000));
}
let db=null;
try{
  await waitHealth();
  db=new Database(dbPath);
  const now=new Date().toISOString(),later=new Date(Date.now()+3600000).toISOString();
  const a=randomUUID(),b=randomUUID();
  const addOrg=db.prepare('INSERT INTO organisations (id,name,slug,created_at,updated_at) VALUES (?,?,?,?,?)');
  addOrg.run(a,'Brand A','brand-a-'+a,now,now);addOrg.run(b,'Brand B','brand-b-'+b,now,now);
  const roles=['owner','admin','super_admin','manager','worker','director','other_owner'];
  const cookies={};
  for(const role of roles){
    const id=randomUUID(),token=randomBytes(24).toString('hex'),org=role==='other_owner'?b:a;
    db.prepare('INSERT INTO users (id,email,full_name,password_hash,password_salt,created_at,updated_at) VALUES (?,?,?,?,?,?,?)')
      .run(id,role+id+'@example.test',role,'unused','unused',now,now);
    db.prepare('INSERT INTO memberships (organisation_id,user_id,role,created_at) VALUES (?,?,?,?)')
      .run(org,id,role==='other_owner'?'owner':role,now);
    db.prepare('INSERT INTO user_sessions (id,user_id,token_hash,expires_at,created_at,last_seen_at) VALUES (?,?,?,?,?,?)')
      .run(randomUUID(),id,createHash('sha256').update(token).digest('hex'),later,now,now);
    cookies[role]='fp_session='+token;
  }
  async function call(uri,role=null,method='GET',value=undefined,org=undefined){
    const headers={};
    if(role)headers.Cookie=cookies[role];
    if(org)headers['X-Organisation-Id']=org;
    const opts={method,headers};
    if(value!==undefined){
      if(value instanceof FormData)opts.body=value;
      else {headers['Content-Type']='application/json';opts.body=JSON.stringify(value)}
    }
    const response=await fetch(base+uri,opts);
    const data=response.headers.get('content-type')?.includes('application/json')
      ?await response.json():await response.arrayBuffer();
    return {status:response.status,data,headers:response.headers};
  }
  async function expectStatus(uri,role,method,payload,status,org=undefined){
    const r=await call(uri,role,method,payload,org);
    assert.equal(r.status,status,role+' '+method+' '+uri+' returned '+r.status+' '+JSON.stringify(r.data).slice(0,300));
    return r;
  }

  const edit='/api/saas/branding',upload='/api/saas/branding/logo';
  const settings={display_name:'Alpha Custom',theme:'dark',primary_color:'#ABCDEF',secondary_color:'#112233',brand_voice:'friendly'};
  await expectStatus(edit,null,'PUT',settings,401);
  await expectStatus(upload,null,'POST',{},401);
  for(const role of ['worker','manager','director']){
    await expectStatus(edit,role,'PUT',settings,403);
    await expectStatus(upload,role,'POST',{},403);
  }
  await expectStatus(edit,'owner','PUT',{},400);
  await expectStatus(edit,'owner','PUT',{theme:'neon'},400);
  await expectStatus(edit,'owner','PUT',{primary_color:'red'},400);
  await expectStatus(edit,'owner','PUT',{logo_url:'javascript:alert(1)'},400);
  await expectStatus(edit,'owner','PUT',{logo_url:'/api/saas/branding/logo/'+b+'/'+randomUUID()+'.png'},400);
  await expectStatus(edit,'owner','PUT',settings,403,b);
  let r=await expectStatus(edit,'owner','PUT',settings,200);
  assert.equal(r.data.branding.brand_name,'Alpha Custom');
  assert.equal(r.data.branding.theme,'dark');
  assert.equal(r.data.branding.primary_color,'#abcdef');
  assert.equal(r.data.branding.secondary_color,'#112233');
  assert.equal(r.data.branding.brand_voice,'friendly');
  r=await expectStatus(edit,'admin','PUT',{brand_name:'Alpha Admin'},200);
  assert.equal(r.data.branding.display_name,'Alpha Admin');
  r=await expectStatus(edit,'super_admin','PUT',{theme:'light'},200);
  assert.equal(r.data.branding.theme,'light');
  assert.equal(db.prepare('SELECT brand_voice FROM onboarding_profiles WHERE organisation_id=?').get(a).brand_voice,'friendly');
  assert.equal(db.prepare('SELECT brand_primary_color,brand_secondary_color FROM organisations WHERE id=?').get(a).brand_primary_color,'#abcdef');
  assert.equal((await expectStatus(edit,'other_owner','PUT',{brand_name:'B Updated'},200)).data.branding.brand_name,'B Updated');
  assert.equal((await expectStatus(edit.replace('branding','branding'),'owner','GET',undefined,200)).data.branding.display_name,'Alpha Admin');
  assert.equal((await expectStatus(edit,'other_owner','GET',undefined,200)).data.branding.display_name,'B Updated');

  const png=Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000b49444154789c636000020000050001a5f645400000000049454e44ae426082','hex');
  const form=(buf,mime,name)=>{const fd=new FormData();fd.append('logo',new Blob([buf],{type:mime}),name);return fd};
  await expectStatus(upload,'owner','POST',form(Buffer.from('<script>alert(1)</script>'),'image/png','spoof.png'),415);
  const invalidSvg=Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"><path d="M0 0"/></svg>');
  await expectStatus(upload,'owner','POST',form(invalidSvg,'image/svg+xml','bad.svg'),415);
  await expectStatus(upload,'owner','POST',form(Buffer.alloc(1024*1024+1,1),'image/png','huge.png'),413);
  r=await expectStatus(upload,'owner','POST',form(png,'image/png','logo.png'),200);
  assert.match(r.data.logo_url,new RegExp('^/api/saas/branding/logo/'+a+'/[a-f0-9-]{36}\\.png$'));
  assert.equal(db.prepare('SELECT brand_logo_url FROM organisations WHERE id=?').get(a).brand_logo_url,r.data.logo_url);
  assert.ok(fs.existsSync(path.join(uploadDir,'branding',a,path.basename(r.data.logo_url))));
  let served=await expectStatus(r.data.logo_url,'owner','GET',undefined,200);
  assert.equal(served.headers.get('content-type'),'image/png');
  assert.equal(Buffer.compare(Buffer.from(served.data),png),0);
  assert.equal((await call(r.data.logo_url)).status,401);
  assert.equal((await call(r.data.logo_url,'other_owner')).status,404);
  const safeSvg=Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect x="1" y="1" width="8" height="8" fill="#abc"/></svg>');
  r=await expectStatus(upload,'admin','POST',form(safeSvg,'image/svg+xml','logo.svg'),200);
  served=await expectStatus(r.data.logo_url,'owner','GET',undefined,200);
  assert.equal(served.headers.get('content-type'),'image/svg+xml');
  assert.match(served.headers.get('content-security-policy'),/sandbox/);
  assert.equal(Buffer.compare(Buffer.from(served.data),safeSvg),0);
  await expectStatus(edit,'owner','PUT',{logo_url:'https://example.org/sample.png'},200);
  assert.equal((await expectStatus(edit,'owner','GET',undefined,200)).data.branding.logo_url,'https://example.org/sample.png');
  await expectStatus(edit,'owner','PUT',{logo_url:''},200);
  assert.equal((await expectStatus(edit,'owner','GET',undefined,200)).data.branding.logo_url,'/saas/superpro-icon-192.png');
  assert.ok(db.prepare('SELECT COUNT(*) count FROM saas_audit_events WHERE organisation_id=? AND event_type=?').get(a,'branding.updated').count>=3);
  assert.ok(db.prepare('SELECT COUNT(*) count FROM saas_audit_events WHERE organisation_id=? AND event_type=?').get(a,'branding.logo_uploaded').count>=2);
  console.log('BRANDING EDIT/LOGO TEST PASSED: roles, tenant isolation, DB values, upload signatures and limits, SVG protection, storage, audit.');
}catch(error){
  console.error('BRANDING EDIT/LOGO TEST FAILED:',error?.stack||error);
  if(output)console.error('--- server output ---\\n'+output.slice(-5000));
  process.exitCode=1;
}finally{
  if(db)db.close();
  if(child.exitCode===null)child.kill('SIGTERM');
  await Promise.race([new Promise(resolve=>child.once('exit',resolve)),sleep(1500)]).catch(()=>{});
  if(child.exitCode===null)child.kill('SIGKILL');
  fs.rmSync(root,{recursive:true,force:true});
}
