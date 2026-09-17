import './ai-provider-shim.js';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const runtimePath = path.join(__dirname, '.server-runtime-v15.mjs');
const sourceUrl = 'https://raw.githubusercontent.com/Umerfaizan92/fleet-office-ai/f36fac5764271f13275156c1ed5d227b0eb529a5/src/server.js';

async function ensureRuntimeServer(){
  const response = await fetch(sourceUrl, { headers:{ 'user-agent':'Super-Pro-AI-Office-Manager/16' } });
  if(!response.ok) throw new Error(`Unable to load pinned server base: HTTP ${response.status}`);
  const source = await response.text();
  if(!source.includes("Super Pro AI Office Manager backend running") || !source.includes("/api/product-guide/answer")) {
    throw new Error('Pinned server base failed integrity checks.');
  }
  fs.writeFileSync(runtimePath, source, 'utf8');
}

await ensureRuntimeServer();
await import(`${pathToFileURL(runtimePath).href}?v=f36fac5`);
