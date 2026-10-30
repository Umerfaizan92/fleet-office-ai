import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const source=readFileSync(new URL('../src/server.js',import.meta.url),'utf8');

function routeDefinitions(method,path){
  const escaped=path.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  const pattern=new RegExp('app\\.'+method+'\\(\\s*[\\\'"]'+escaped+'[\\\'"]\\s*,([^\\n]*)','g');
  return [...source.matchAll(pattern)].map(m=>m[1]);
}

test('only one canonical POST route for creating work orders',()=>{
 const routes=routeDefinitions('post','/api/saas/work-orders');
 assert.equal(routes.length,1,'duplicate work-order creation route');
 assert.match(routes[0],/requireSaasUser\s*,\s*requireSaasRole\(\s*'owner'\s*,\s*'admin'\s*,\s*'manager'\s*,\s*'super_admin'\s*\)/);
});

test('only one canonical POST offer route with management RBAC',()=>{
 const routes=routeDefinitions('post','/api/saas/work-orders/:id/offer');
 assert.equal(routes.length,1,'duplicate offer route');
 assert.match(routes[0],/requireSaasUser\s*,\s*requireSaasRole\(\s*'owner'\s*,\s*'admin'\s*,\s*'manager'\s*,\s*'super_admin'\s*\)/);
 const routeBody=source.slice(source.indexOf("app.post('/api/saas/work-orders/:id/offer'"),source.indexOf('const workforceOnboardingLimiter'));
 // Phase 05: eligibility lives in evaluateWorkOrder, shared by this route and the automation engine, so both apply the same checks.
 assert.match(routeBody,/offerWorkOrder\(/);
 const evaluate=source.slice(source.indexOf('function evaluateWorkOrder('),source.indexOf('function offerWorkOrder('));
 assert.ok(evaluate.length>100,'evaluateWorkOrder exists');
 assert.match(evaluate,/workerComplianceState/);
 assert.match(evaluate,/work_rights_verified/);
 assert.match(evaluate,/verification_status/);
 assert.match(source.slice(source.indexOf('function offerWorkOrder('),source.indexOf("app.post('/api/saas/work-orders/:id/offer'")),/evaluateWorkOrder\(/);
});

test('finance is restricted to owner, admin and super_admin',()=>{
 assert.match(source,/const financeRoles\s*=\s*\['owner',\s*'admin',\s*'super_admin'\];/);
 assert.equal((source.match(/requireSaasRole\(\.\.\.financeRoles\)/g)||[]).length,2);
});
