import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
const root=process.cwd(),manifest=path.join(root,'SHA256SUMS_FINAL.txt');
if(!fs.existsSync(manifest)){console.error('Missing SHA256SUMS_FINAL.txt');process.exit(1)}
const failures=[];let checked=0;
for(const [i,line] of fs.readFileSync(manifest,'utf8').split(/\r?\n/).entries()){
  if(!line.trim())continue;
  const m=line.match(/^([a-f0-9]{64})\s+\*?(.+)$/i);if(!m){failures.push(`Malformed manifest line ${i+1}`);continue}
  const file=path.join(root,m[2]);if(!fs.existsSync(file)){failures.push(`Missing ${m[2]}`);continue}
  const actual=crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');if(actual!==m[1].toLowerCase())failures.push(`Hash mismatch ${m[2]}`);else checked++;
}
if(failures.length){console.error('MANIFEST VERIFY FAILED');for(const f of failures)console.error('-',f);process.exit(1)}
console.log(`MANIFEST VERIFY PASSED: ${checked} files.`);
