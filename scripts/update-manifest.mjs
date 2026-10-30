// Regenerates SHA256SUMS.txt for every tracked (or new, non-ignored) file. Run after any change, then `npm run verify:manifest`.
import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
// Working notes and generated reports change between commits on their own (checkpoints, test runs), so they are not
// release files: including them made every checkpoint-only commit fail verify:manifest (and npm test on Render).
const EXCLUDED = /^(\.claude\/project-memory\/|qa\/reports\/)/;
const files = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard'], { encoding: 'utf8' })
  .split('\n').filter(Boolean).filter(f => f !== 'SHA256SUMS.txt' && !EXCLUDED.test(f) && fs.existsSync(f)).sort();
const lines = files.map(f => `${crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex')}  ${f}`);
fs.writeFileSync('SHA256SUMS.txt', lines.join('\n') + '\n');
console.log(`Manifest updated: ${files.length} files.`);
