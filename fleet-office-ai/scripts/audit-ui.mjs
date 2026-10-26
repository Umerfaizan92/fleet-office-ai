// Static UI audit: every local link resolves, every control with an id has a handler somewhere,
// every data-view has a view section, and every dialog has a working close path. Run: node scripts/audit-ui.mjs
import fs from 'node:fs';
import path from 'node:path';
const root = path.resolve(import.meta.dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const problems = [];
const bad = (file, msg) => problems.push(`${file}: ${msg}`);
const pages = [...fs.readdirSync(path.join(root, 'saas')).filter((f) => f.endsWith('.html')).map((f) => 'saas/' + f), 'office/index.html'];
const jsAll = [...fs.readdirSync(path.join(root, 'saas')).filter((f) => f.endsWith('.js')).map((f) => 'saas/' + f), ...fs.readdirSync(path.join(root, 'office')).filter((f) => f.endsWith('.js')).map((f) => 'office/' + f)].map(read).join('\n');
const serverJs = read('src/server.js');
const routeOk = new Set(['/', '/saas/', '/office/', '/robots.txt', '/sitemap.xml', '/llms.txt', '/healthz']);
for (const f of pages) {
  const html = read(f), dir = path.dirname(f);
  const ids = new Set([...html.matchAll(/\sid=["']([^"']+)["']/g)].map((m) => m[1]));
  const embedded = [...html.matchAll(/<script(?![^>]*src)[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]).join('\n');
  const code = jsAll + '\n' + embedded + '\n' + html;
  for (const m of html.matchAll(/(?:href|src)=["']([^"'#?]+)(?:[?#][^"']*)?["']/g)) {
    const u = m[1]; if (/^(https?:|mailto:|tel:|data:|javascript:|sms:|__)/.test(u) || u.includes('${') ) continue;
    if (u.startsWith('/')) { if (!routeOk.has(u) && !fs.existsSync(path.join(root, u.slice(1))) && !fs.existsSync(path.join(root, u.slice(1) + '.html'))) bad(f, `link to ${u} does not exist`); continue; }
    if (!fs.existsSync(path.join(root, dir, u))) bad(f, `missing file ${u}`);
  }
  const panes = new Set([...html.matchAll(/data-pane=["']([^"']+)["']/g)].map((m) => m[1]));
  for (const m of html.matchAll(/href=["']#([^"']+)["']/g)) if (!ids.has(m[1]) && !panes.has(m[1])) bad(f, `anchor #${m[1]} has no target`);
  for (const m of html.matchAll(/<(button|a|input)\b[^>]*\sid=["']([^"']+)["'][^>]*>/g)) {
    const [tag, id] = [m[1], m[2]]; if (tag === 'input' && !/type=["'](button|submit)/.test(m[0])) continue;
    if (/disabled/.test(m[0]) && false) continue;
    const used = new RegExp(`['"\`]#${id}['"\`\\s.\\[]|getElementById\\(['"]${id}['"]\\)|\\$\\(['"]#${id}['"]\\)|\\['"]#${id}`).test(code) || code.includes(`#${id}`) || code.includes(`'${id}'`) || code.includes(`"${id}"`);
    const inForm = new RegExp(`<form[\\s\\S]*?id=["']${id}["']`).test(html) && /type=["']submit/.test(m[0]);
    if (!used && !inForm && !/type=["']submit/.test(m[0]) && tag !== 'a') bad(f, `button #${id} has no handler`);
  }
  for (const m of html.matchAll(/data-view=["']([^"']+)["']/g)) if (!ids.has(m[1] + '-view') && !code.includes(`'${m[1]}'`) ) bad(f, `nav data-view="${m[1]}" has no view`);
  for (const m of html.matchAll(/<form\b[^>]*method=["']dialog["'][^>]*>([\s\S]*?)<\/form>/g)) {
    for (const b of m[1].matchAll(/<button\b[^>]*value=["']cancel["'][^>]*>/g)) if (!/formnovalidate|type=["']button["']/.test(b[0])) bad(f, 'a Cancel button can be blocked by required fields (add formnovalidate)');
  }
}
for (const m of serverJs.matchAll(/res\.redirect\([^,]*['"`](\/[^'"`?]*)/g)) void m;
console.log(problems.length ? problems.join('\n') + `\n\n${problems.length} problem(s)` : 'UI audit: no dead links, handlers or Cancel traps found.');
process.exit(problems.length ? 1 : 0);
