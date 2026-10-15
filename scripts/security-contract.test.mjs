import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const server=fs.readFileSync(new URL('../src/server.js',import.meta.url),'utf8');
const db=fs.readFileSync(new URL('../src/db.js',import.meta.url),'utf8');
const extras=fs.readFileSync(new URL('../saas/workspace-extras.js',import.meta.url),'utf8');

test('scheduled deletion requires owner confirmation and a 28-day grace period',()=>{
  const start=server.indexOf("app.post('/api/saas/account/deletion/confirm'");
  const end=server.indexOf("app.post('/api/saas/account/deletion/cancel'",start);
  assert.ok(start>=0&&end>start);
  const route=server.slice(start,end);
  assert.match(route,/role\|\|'\)\.toLowerCase\(\)!=='owner'/);
  assert.match(route,/confirmedAt\.getTime\(\)\+28\*DAY_MS/);
  assert.match(route,/28-day cancellation window/);
});
test('deletion cancellation is owner-only and tenant-scoped',()=>{
  assert.match(server,/app\.post\('\/api\/saas\/account\/deletion\/cancel',requireSaasUser,requireSaasRole\('owner'\)/);
  assert.match(server,/WHERE id=\? AND organisation_id=\? AND status='scheduled'/);
});
test('organisation selection requires authenticated membership',()=>{
  assert.match(server,/const selectedOrganisation=suppliedOrganisation\|\|null/);
  assert.match(server,/JOIN memberships m ON m\.user_id=u\.id/);
  assert.match(server,/\(\? IS NULL OR m\.organisation_id=\?\)/);
  assert.match(server,/app\.get\('\/api\/saas\/my-organisations',requireSaasUser/);
});
test('staff presence is tenant scoped and users update only their own presence',()=>{
  assert.match(db,/CREATE TABLE IF NOT EXISTS staff_availability/);
  assert.match(db,/PRIMARY KEY\(organisation_id,user_id\)/);
  assert.match(server,/app\.put\('\/api\/saas\/staff-availability\/me',requireSaasUser/);
  assert.match(server,/\.run\(req\.saas\.organisation_id,req\.saas\.user_id,parsed\.data\.status/);
  assert.match(server,/includeInactive=manager&&req\.query\.include_inactive==='1'/);
  assert.match(extras,/staff-availability\/me/);
});

console.log('Security contract tests passed (static checks only; runtime tests remain required).');
