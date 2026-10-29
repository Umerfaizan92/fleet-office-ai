import test from 'node:test';
import assert from 'node:assert/strict';
import { operatorMfaEnforced, passwordCandidates, sessionTooOld, sessionMaxAgeMs, securityPosture } from '../src/security-policy.js';

test('founder MFA enforcement is off unless explicitly switched on', () => {
  assert.equal(operatorMfaEnforced({}), false);
  assert.equal(operatorMfaEnforced({ REQUIRE_OPERATOR_MFA: '0' }), false);
  for (const v of ['1', 'true', 'YES', ' on ']) assert.equal(operatorMfaEnforced({ REQUIRE_OPERATOR_MFA: v }), true, v);
});

test('default password matching keeps the mobile first-letter tolerance', () => {
  const c = passwordCandidates('secret-Pass 1 ');
  assert.ok(c.includes('secret-Pass 1'));
  assert.ok(c.includes('Secret-Pass 1'));
  assert.ok(c.length <= 7);
});

test('strict password matching drops the case swap but keeps trimming and Unicode normalisation', () => {
  const c = passwordCandidates(' café-Pass ', { strict: true });
  assert.ok(c.includes('café-Pass'));
  assert.ok(c.includes('café-Pass'), 'NFC form accepted');
  assert.ok(!c.some((v) => v.startsWith('C')), 'no case-swapped variant');
});

test('absolute session cap only applies when configured', () => {
  const old = new Date(Date.now() - 40 * 86400000).toISOString();
  assert.equal(sessionMaxAgeMs({}), 0);
  assert.equal(sessionTooOld(old, {}), false);
  assert.equal(sessionTooOld(old, { SESSION_MAX_AGE_DAYS: '30' }), true);
  assert.equal(sessionTooOld(new Date().toISOString(), { SESSION_MAX_AGE_DAYS: '30' }), false);
  assert.equal(sessionTooOld('not a date', { SESSION_MAX_AGE_DAYS: '30' }), true, 'unreadable start fails closed');
});

test('security posture warns in production only and never prints values', () => {
  const secret = 'JBSWY3DPEHPK3PXP-should-never-appear';
  const prod = securityPosture({ NODE_ENV: 'production', SESSION_TTL_DAYS: '365', OPERATOR_TOTP_SECRET: secret });
  assert.ok(prod.some((c) => c.id === 'security.session_ttl' && c.status === 'warn'));
  assert.ok(prod.find((c) => c.id === 'security.operator_mfa').status === 'pass');
  assert.ok(!JSON.stringify(prod).includes(secret));
  const dev = securityPosture({ NODE_ENV: 'test', SESSION_TTL_DAYS: '365' });
  assert.ok(dev.every((c) => c.status === 'pass'), 'development is never marked degraded');
});
