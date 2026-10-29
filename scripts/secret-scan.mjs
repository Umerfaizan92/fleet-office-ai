#!/usr/bin/env node
// Scans every file tracked by git for credentials that should never be committed. Prints file, line and the kind of
// secret only, never the value itself. Exit code 1 when anything is found.
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

const PATTERNS = [
  ['AWS access key ID', /\b(AKIA|ASIA)[0-9A-Z]{16}\b/],
  ['AWS secret access key assignment', /aws_?secret_?access_?key\s*[:=]\s*["']?[A-Za-z0-9/+]{40}\b/i],
  ['Private key block', /-----BEGIN (RSA |EC |OPENSSH |DSA |PGP )?PRIVATE KEY-----/],
  ['Stripe live secret key', /\b(sk|rk)_live_[0-9a-zA-Z]{16,}\b/],
  ['Stripe webhook secret', /\bwhsec_[0-9a-zA-Z]{24,}\b/],
  ['Resend API key', /\bre_[0-9a-zA-Z]{8,}_[0-9a-zA-Z]{16,}\b/],
  ['Telnyx API key', /\bKEY0[0-9A-F]{30,}_[0-9A-Za-z]{16,}\b/],
  ['Google API key', /\bAIza[0-9A-Za-z_-]{35}\b/],
  ['OpenAI API key', /\bsk-(proj-)?[A-Za-z0-9_-]{32,}\b/],
  ['GitHub token', /\b(ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{36}\b/],
  ['Slack token', /\bxox[abprs]-[A-Za-z0-9-]{10,}\b/],
  ['Meta long-lived token', /\bEAA[A-Za-z0-9]{100,}\b/],
  ['Render API key', /\brnd_[A-Za-z0-9]{24,}\b/]
];
const PLACEHOLDER = /(wrong|test|example|fake|dummy|placeholder|sample|xxxx|0000000)/i;
// Fixtures that intentionally look like secrets (test-only values) are listed here with the reason.
const ALLOW = [];

const files = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' }).split('\0').filter(Boolean)
  .filter((f) => !/\.(png|jpe?g|webp|gif|ico|woff2?|ttf|pdf|zip|gz|sqlite)$/i.test(f) && f !== 'package-lock.json');
const findings = [];
for (const file of files) {
  if (ALLOW.some((a) => a.file.test(file))) continue;
  let text; try { text = fs.readFileSync(file, 'utf8'); } catch { continue; }
  if (text.includes('\0')) continue;
  text.split('\n').forEach((line, i) => {
    for (const [kind, re] of PATTERNS) {
      const m = re.exec(line);
      // Obvious test placeholders (for example whsec_wrongwrong…) are not credentials.
      if (m && !PLACEHOLDER.test(m[0])) findings.push(`${file}:${i + 1} ${kind}`);
    }
  });
}
if (findings.length) { console.error('SECRET SCAN FAILED (values not shown):\n  ' + findings.join('\n  ')); process.exit(1); }
console.log(`SECRET SCAN PASSED: ${files.length} tracked files checked for ${PATTERNS.length} kinds of credential.`);
