// Writes the public website's static pages into saas/site/ from scripts/site/content.mjs and templates.mjs.
//   npm run build:site            write the pages
//   npm run build:site -- --check exit 1 if any committed page is out of date (used by the tests)
import fs from 'node:fs';
import path from 'node:path';
import { PAGES } from './site/templates.mjs';

const out = path.resolve('saas/site');
const check = process.argv.includes('--check');
fs.mkdirSync(out, { recursive: true });
let stale = [];
for (const [file, html] of PAGES()) {
  const target = path.join(out, file);
  if (check) { if (!fs.existsSync(target) || fs.readFileSync(target, 'utf8') !== html) stale.push(file); }
  else fs.writeFileSync(target, html);
}
if (check && stale.length) { console.error('Public pages are out of date; run npm run build:site\n  ' + stale.join('\n  ')); process.exit(1); }
console.log(check ? `Public pages up to date (${PAGES().length}).` : `Wrote ${PAGES().length} public pages to saas/site/.`);
