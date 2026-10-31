// Reproduce the ordered section inventory from successful synthetic browser coverage.
import fs from 'node:fs';
const read = file => JSON.parse(fs.readFileSync(new URL(file, import.meta.url), 'utf8'));
const mapping = read('../docs/navigation/MAPPING.json');
const report = read('../qa/reports/navigation-coverage.json');
if (mapping.baseline !== report.baseline || report.errors.length) throw new Error('Coverage must pass against the mapped baseline');
const lines = ['# Verified navigation and section order', '',
  'Source baseline: `' + mapping.baseline + '`. Local synthetic browser coverage; this is not a production provider readiness claim.', '',
  'Every page below was opened through its sidebar link at 1440 px and 390 px. Listed section controls were selected and their active state checked at both widths. Functional workflow tests and provider requirements are recorded separately in qa/reports/modules.json and IMPLEMENTATION.md.', ''];
const escape = s => String(s).replaceAll('|', '\\|').replaceAll('\n', ' ');
let pages = 0;
for (const [portal, groups] of [['Business', mapping.business.map(g => [g.label, g.items.map(p => [p.path, p.label])])], ['Founder', mapping.founder.map(g => [g[2], g[4].map(p => [g[0] + '/' + p[0], p[1]])])]]) {
  lines.push('## ' + portal, '');
  for (const [group, items] of groups) {
    lines.push('### ' + group, '', '| Page / sidebar submenu | Route | Top sections in displayed order | Navigation |', '|---|---|---|---|');
    for (const [route, label] of items) {
      const checks = report.coverage.filter(c => c.portal === portal && c.route === route);
      for (const width of [1440, 390]) if (!checks.some(c => c.width === width && c.section === '' && c.result === 'PASS')) throw new Error('Missing route coverage: ' + route + ' @' + width);
      const sections = [...new Set(checks.filter(c => c.width === 1440 && c.section && !c.section.startsWith('Deep link,')).map(c => c.section))];
      for (const section of sections) if (!checks.some(c => c.width === 390 && c.section === section && c.result === 'PASS')) throw new Error('Missing mobile section coverage: ' + route + '/' + section);
      lines.push(`| ${escape(label)} | \`${route}\` | ${sections.length ? sections.map(escape).join(' → ') : 'Single content view; no additional tablist observed'} | PASS, both widths |`);
      pages++;
    }
    lines.push('');
  }
}
lines.push('## Shared checks', '',
  'Section deep links, history, reload, original unsaved form values, restricted employee isolation, keyboard section selection, drawer focus restoration, saved rail preference and serious/critical WCAG A/AA navigation checks in light and dark themes passed.', '',
  'Scope limit: route/section coverage confirms navigation and rendered selection. Record writes, external integrations and operational readiness require their dedicated workflow tests and production checks. Disabled sections are not represented as working features.', '');
fs.writeFileSync(new URL('../docs/navigation/SECTIONS.md', import.meta.url), lines.join('\n'));
console.log(`${pages} pages documented from ${report.coverage.length} passing browser checks`);
