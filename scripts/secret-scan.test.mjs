import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';

const scanner = path.resolve('scripts/secret-scan.mjs');
function repoWith(content) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-scan-'));
  execFileSync('git', ['init', '-q'], { cwd: dir });
  fs.writeFileSync(path.join(dir, 'config.js'), content);
  execFileSync('git', ['add', '.'], { cwd: dir });
  return dir;
}

test('a committed AWS key is caught and its value is not printed', () => {
  const key = ['AKIA', 'Q3EXAMPL', 'ZB7KRN2V'].join('').replace('EXAMPL', 'HJKLMN'); // assembled at run time so this file stays clean
  const dir = repoWith(`export const k = '${key}';\n`);
  const r = spawnSync(process.execPath, [scanner], { cwd: dir, encoding: 'utf8' });
  fs.rmSync(dir, { recursive: true, force: true });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /config\.js:1 AWS access key ID/);
  assert.ok(!r.stderr.includes(key));
});

test('placeholders and clean files pass', () => {
  const dir = repoWith("const secret = 'whsec_wrongwrongwrongwrongwrong';\nconst x = 1;\n");
  const r = spawnSync(process.execPath, [scanner], { cwd: dir, encoding: 'utf8' });
  fs.rmSync(dir, { recursive: true, force: true });
  assert.equal(r.status, 0, r.stderr);
});
