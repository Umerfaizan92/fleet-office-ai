import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createDb } from '../src/db.js';
import { prepareStorage, runDiagnostics } from '../src/diagnostics.js';

test('only a validated synthetic preview reports intentional ephemeral storage as a warning', () => {
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),'preview-diagnostics-'));
 const env={NODE_ENV:'production',RENDER:'true',SUPERPRO_ISOLATED_PREVIEW:'1',DATABASE_PATH:path.join(temp,'app.sqlite'),UPLOAD_DIR:path.join(temp,'uploads'),PREVIEW_BUSINESS_PASSWORD:'synthetic-preview-password-only'};
 for(const key of ['ADMIN_API_KEY','SESSION_SECRET','SAAS_SESSION_SECRET','ADMIN_SESSION_SECRET','INTEGRATION_ENCRYPTION_KEY'])env[key]='synthetic-secret-'.repeat(4);
 const db=createDb(':memory:');
 try{
  const storage=prepareStorage({env,backendRoot:temp,persistentRoot:path.join(temp,'unmounted')});
  const report=runDiagnostics({db,env,storage});
  assert.equal(report.checks.find(c=>c.id==='storage.persistent').status,'warn');
  assert.match(report.checks.find(c=>c.id==='storage.persistent').detail,/synthetic/);
  assert.equal(report.ok,true);assert.equal(report.status,'degraded');
  const production={...env};delete production.SUPERPRO_ISOLATED_PREVIEW;
  const real=runDiagnostics({db,env:production,storage});
  assert.equal(real.checks.find(c=>c.id==='storage.persistent').status,'fail');assert.equal(real.ok,false);
  assert.throws(()=>runDiagnostics({db,env:{...env,AWS_ACCESS_KEY_ID:'synthetic-forbidden'},storage}),/unsafe/);
  assert.throws(()=>prepareStorage({env:{...env,DATABASE_PATH:'/var/data/production.sqlite'},backendRoot:temp}),/under \/tmp/);
  fs.writeFileSync(path.join(temp,'blocked'),'fixture');
  assert.throws(()=>prepareStorage({env:{...env,UPLOAD_DIR:path.join(temp,'blocked','uploads')},backendRoot:temp,persistentRoot:path.join(temp,'unmounted')}),/refusing fallback/);
 }finally{db.close();fs.rmSync(temp,{recursive:true,force:true});}
});
