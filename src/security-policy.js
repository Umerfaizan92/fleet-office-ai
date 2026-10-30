// Phase 02 sign-in and session policy.
// Every stricter rule here is switched on by an environment setting, so the live service keeps its current behaviour
// until the founder turns each rule on deliberately (see docs/infrastructure/DEPLOYMENT_PLAN.md).

const on = (value) => /^(1|true|yes|on)$/i.test(String(value ?? '').trim());
const days = (value) => {
  const n = Number(String(value ?? '').trim());
  return Number.isFinite(n) && n > 0 ? n : 0;
};

// REQUIRE_OPERATOR_MFA=1: the founder key alone never opens the console; an authenticator code is always needed.
// If the setting is on but OPERATOR_TOTP_SECRET is missing, founder access fails closed rather than falling back to the key alone.
export function operatorMfaEnforced(env = process.env) {
  return on(env.REQUIRE_OPERATOR_MFA);
}

export function operatorTotpConfigured(env = process.env) {
  return Boolean(String(env.OPERATOR_TOTP_SECRET || '').trim());
}

// STRICT_PASSWORD_MATCH=1: only the exact password, with surrounding spaces trimmed and Unicode normalised, is accepted.
// Without it the original mobile-keyboard tolerance (first-letter case swap) stays, so nobody is locked out unexpectedly.
export function passwordCandidates(raw, { strict = false } = {}) {
  const value = String(raw ?? '');
  const out = [value];
  const add = (v) => { if (v && !out.includes(v)) out.push(v); };
  const trimmed = value.trim();
  add(trimmed);
  add(value.normalize('NFC'));
  add(trimmed.normalize('NFC'));
  add(trimmed.normalize('NFKC'));
  if (!strict && trimmed.length) {
    const first = trimmed[0];
    const swapped = first === first.toLowerCase() ? first.toUpperCase() : first.toLowerCase();
    add(swapped + trimmed.slice(1));
    add((swapped + trimmed.slice(1)).normalize('NFC'));
  }
  return out.slice(0, 7);
}

export function strictPasswordMatch(env = process.env) {
  return on(env.STRICT_PASSWORD_MATCH);
}

// SESSION_MAX_AGE_DAYS: an absolute limit from sign-in, however active the session is. 0 or unset keeps the sliding renewal only.
export function sessionMaxAgeMs(env = process.env) {
  return days(env.SESSION_MAX_AGE_DAYS) * 86400000;
}

export function sessionTooOld(createdAt, env = process.env, now = Date.now()) {
  const max = sessionMaxAgeMs(env);
  if (!max) return false;
  const started = Date.parse(String(createdAt || ''));
  if (!Number.isFinite(started)) return true; // an unreadable start time cannot be trusted
  return now - started > max;
}

// Names and states only, never values. Used by the diagnostics report so the founder can see what is still relaxed.
export function securityPosture(env = process.env) {
  const production = env.NODE_ENV === 'production';
  const checks = [];
  const add = (id, ok, detail) => checks.push({ id, status: ok ? 'pass' : production ? 'warn' : 'pass', detail });
  const totp = operatorTotpConfigured(env);
  add('security.operator_mfa', totp, totp
    ? (operatorMfaEnforced(env) ? 'Founder sign-in requires an authenticator code (enforced).' : 'Founder sign-in uses an authenticator code; set REQUIRE_OPERATOR_MFA=1 to refuse the key on its own.')
    : 'OPERATOR_TOTP_SECRET is not set, so the founder key alone opens the console.');
  const ttl = days(env.SESSION_TTL_DAYS) || 7;
  add('security.session_ttl', ttl <= 30, `Business sessions renew for ${ttl} day(s) after each use${ttl > 30 ? '; 30 or fewer is recommended' : ''}.`);
  const cap = days(env.SESSION_MAX_AGE_DAYS);
  add('security.session_cap', cap > 0 && cap <= 90, cap ? `Sessions end ${cap} day(s) after sign-in at the latest.` : 'SESSION_MAX_AGE_DAYS is not set, so an active session never has to sign in again.');
  add('security.password_match', strictPasswordMatch(env), strictPasswordMatch(env) ? 'Passwords must match exactly (spaces and Unicode form aside).' : 'A first-letter case swap is still accepted; set STRICT_PASSWORD_MATCH=1 to stop it.');
  return checks;
}
