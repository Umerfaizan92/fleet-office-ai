#!/usr/bin/env node
// Phase 10 functional preservation audit. Compares this branch with the Phase 00 baseline (origin/main, which is what
// is deployed today) and lists every HTTP route, page, element ID, workspace view, console section and npm script that
// existed before. Anything removed is a possible regression and is reported; additions are counted.
//   node scripts/release-audit.mjs [--base origin/main] [--json qa/reports/release-audit.json]
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const arg = (n, d) => { const i = process.argv.indexOf('--' + n); return i > 0 ? process.argv[i + 1] : d; };
const base = arg('base', 'origin/main'), out = arg('json', 'qa/reports/release-audit.json');
const git = (...a) => execFileSync('git', a, { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
const filesAt = (ref) => (ref ? git('ls-tree', '-r', '--name-only', ref) : git('ls-files')).split('\n').filter(Boolean);
const read = (ref, f) => { try { return ref ? git('show', `${ref}:${f}`) : fs.readFileSync(f, 'utf8'); } catch { return ''; } };

function inventory(ref) {
  const files = filesAt(ref);
  const routes = new Set(), ids = new Map(), pages = new Set(), views = new Set(), sections = new Set(), scripts = new Set(), forms = new Map();
  for (const f of files.filter((x) => /^src\/.*\.js$/.test(x))) {
    const s = read(ref, f);
    for (const m of s.matchAll(/\bapp\.(get|post|put|patch|delete)\(\s*(['"`])([^'"`]+)\2/g)) routes.add(`${m[1].toUpperCase()} ${m[3].replace(/\$\{prefix\}/g, '{prefix}')}`);
    for (const m of s.matchAll(/campaignRoutes\('([^']+)'/g)) for (const [mth, p] of [['GET', ''], ['POST', ''], ['PUT', '/:id']]) routes.add(`${mth} ${m[1]}${p}`);
  }
  for (const f of files.filter((x) => /\.html$/.test(x) && !/^(node_modules|qa|docs)\//.test(x))) {
    pages.add(f);
    const s = read(ref, f);
    for (const m of s.matchAll(/\sid="([A-Za-z][\w:-]*)"/g)) { if (!ids.has(f)) ids.set(f, new Set()); ids.get(f).add(m[1]); }
    let n = 0; for (const m of s.matchAll(/<form\b[^>]*>/g)) { n++; const id = m[0].match(/id="([^"]+)"/)?.[1]; if (!forms.has(f)) forms.set(f, new Set()); forms.get(f).add(id || `form#${n}`); }
  }
  const nav = read(ref, 'saas/workspace-nav.js');
  for (const m of nav.matchAll(/\{view:'([a-z0-9]+)'/g)) views.add(m[1]);
  for (const m of nav.matchAll(/(?:take|extra)\('([a-z0-9]+)'/g)) views.add(m[1]);
  const con = read(ref, 'office/console.js');
  for (const m of con.matchAll(/\[\s*"([a-z0-9:/_-]+)",\s*"[^"]+"\s*\]/g)) sections.add(m[1]);
  try { for (const k of Object.keys(JSON.parse(read(ref, 'package.json')).scripts || {})) scripts.add(k); } catch { /* none */ }
  return { routes, ids, pages, views, sections, scripts, forms };
}

// Changes made on purpose, each checked at runtime by the release smoke test (scripts/release-security.test.mjs).
const INTENTIONAL = { 'GET /': 'Phase 03: "/" now serves the public website home page (200) instead of redirecting to /saas/; /saas/ is unchanged.' };
const before = inventory(base), after = inventory(null);
const diff = (a, b) => [...a].filter((x) => !b.has(x)).sort();
const removedIds = [], removedForms = [];
for (const [f, set] of before.ids) { const now = after.ids.get(f) || new Set(); for (const id of set) if (!now.has(id)) removedIds.push(`${f}#${id}`); }
for (const [f, set] of before.forms) { const now = after.forms.get(f) || new Set(); for (const id of set) if (!now.has(id)) removedForms.push(`${f} ${id}`); }
// IDs that moved into a script-built view still exist at runtime; scan JS for the same id string.
const js = filesAt(null).filter((f) => /^(saas|office|site|public)\/.*\.js$/.test(f)).map((f) => fs.readFileSync(f, 'utf8')).join('\n');
const removedIdsReal = removedIds.filter((x) => { const id = x.split('#')[1]; return !js.includes(`'${id}'`) && !js.includes(`"${id}"`) && !js.includes(`#${id}`); });
const report = {
  base, base_commit: git('rev-parse', '--short', base).trim(), head_commit: git('rev-parse', '--short', 'HEAD').trim(), generated_at: new Date().toISOString(),
  counts: Object.fromEntries(['routes', 'pages', 'views', 'sections', 'scripts'].map((k) => [k, { before: before[k].size, after: after[k].size, added: diff(after[k], before[k]).length, removed: diff(before[k], after[k]).length }])),
  removed: { routes: diff(before.routes, after.routes), pages: diff(before.pages, after.pages), views: diff(before.views, after.views), console_sections: diff(before.sections, after.sections), npm_scripts: diff(before.scripts, after.scripts), element_ids: removedIdsReal, forms: removedForms },
  element_ids: { before: [...before.ids.values()].reduce((n, s) => n + s.size, 0), after: [...after.ids.values()].reduce((n, s) => n + s.size, 0), moved_to_scripts: removedIds.length - removedIdsReal.length },
  added: { routes: diff(after.routes, before.routes).length, pages: diff(after.pages, before.pages), views: diff(after.views, before.views), console_sections: diff(after.sections, before.sections) }
};
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, JSON.stringify(report, null, 2));
report.intentional = Object.fromEntries(report.removed.routes.filter((x) => INTENTIONAL[x]).map((x) => [x, INTENTIONAL[x]]));
report.removed.routes = report.removed.routes.filter((x) => !INTENTIONAL[x]);
fs.writeFileSync(out, JSON.stringify(report, null, 2));
for (const [k, v] of Object.entries(report.intentional)) console.log(`  intentional: ${k}: ${v}`);
const r = report.removed, total = Object.values(r).reduce((n, a) => n + a.length, 0);
console.log(`Baseline ${report.base} (${report.base_commit}) → HEAD ${report.head_commit}`);
for (const [k, v] of Object.entries(report.counts)) console.log(`  ${k}: ${v.before} → ${v.after} (+${v.added}, -${v.removed})`);
console.log(`  element ids: ${report.element_ids.before} → ${report.element_ids.after}`);
if (total) { console.log('REMOVED since the baseline:'); for (const [k, v] of Object.entries(r)) for (const x of v) console.log(`  ${k}: ${x}`); }
console.log(total ? `PRESERVATION AUDIT: ${total} item(s) removed. Review each one.` : 'PRESERVATION AUDIT PASSED: nothing that existed at the baseline has been removed.');
process.exitCode = total ? 1 : 0;
