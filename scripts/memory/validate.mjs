// Validates the project memory files. Git-independent, so it also runs inside Render's build (npm test).
//   npm run memory:validate
// Checks: every file exists; the handover block has all 13 fields; task IDs are unique and statuses valid; every
// COMPLETED task has an evidence entry; checkpoints are numbered in order; no secrets anywhere in memory or CLAUDE.md.
import fs from 'node:fs';
import path from 'node:path';
import { findRoot, memDir, read, MEMORY_FILES, HANDOVER_KEYS, STATUSES, parseHandover, parseTasks, findSecrets, START, END } from './lib.mjs';

export function validate(root) {
  const dir = memDir(root);
  const problems = [];
  for (const f of MEMORY_FILES) if (!fs.existsSync(path.join(dir, f))) problems.push(`missing .claude/project-memory/${f}`);
  if (!fs.existsSync(path.join(root, 'CLAUDE.md'))) problems.push('missing CLAUDE.md');
  if (problems.length) return problems;

  const ho = read(path.join(dir, 'SESSION_HANDOVER.md'));
  if (!ho.includes(START) || !ho.includes(END)) problems.push('SESSION_HANDOVER.md has no generated block (run npm run memory:checkpoint)');
  const fields = parseHandover(ho);
  for (const k of HANDOVER_KEYS) if (!fields[k]) problems.push(`SESSION_HANDOVER.md is missing "${k}:"`);

  const pending = parseTasks(read(path.join(dir, 'PENDING_TASKS.md')));
  const completedText = read(path.join(dir, 'COMPLETED_TASKS.md'));
  const completed = parseTasks(completedText);
  const seen = new Set();
  for (const t of pending) {
    if (seen.has(t.id)) problems.push(`${t.id} is listed twice in PENDING_TASKS.md`);
    seen.add(t.id);
    if (!t.status || !STATUSES.includes(t.status)) problems.push(`${t.id} has an invalid or missing status (${t.status || 'none'}); use ${STATUSES.join(', ')}`);
    if (t.status === 'COMPLETED' && !completed.some((c) => c.id === t.id)) problems.push(`${t.id} is COMPLETED but has no evidence entry in COMPLETED_TASKS.md`);
  }
  const cIds = new Set();
  for (const c of completed) { if (cIds.has(c.id)) problems.push(`${c.id} appears twice in COMPLETED_TASKS.md`); cIds.add(c.id); }
  for (const block of completedText.split(/\n(?=##\s+T-)/).filter((b) => /^##\s+T-/.test(b))) {
    if (!/^\s*-\s*Evidence:/m.test(block)) problems.push(`${block.match(/T-\d+/)[0]} in COMPLETED_TASKS.md has no "- Evidence:" line`);
  }

  const cps = (read(path.join(dir, 'CHECKPOINTS.md')).match(/^## CP-(\d+)/gm) || []).map((s) => Number(s.slice(6)));
  cps.forEach((n, i) => { if (n !== i + 1) problems.push(`CHECKPOINTS.md numbering breaks at CP-${String(n).padStart(3, '0')}`); });

  for (const f of [...MEMORY_FILES.map((m) => path.join(dir, m)), path.join(root, 'CLAUDE.md')]) {
    const hits = findSecrets(read(f));
    if (hits.length) problems.push(`${path.relative(root, f)} looks like it contains: ${hits.join(', ')}`);
  }
  return problems;
}

if (process.argv[1]?.endsWith('validate.mjs')) {
  const problems = validate(findRoot());
  if (problems.length) { console.log('PROJECT MEMORY INVALID:\n' + problems.map((p) => '  - ' + p).join('\n')); process.exit(1); }
  console.log('PROJECT MEMORY VALID: all files present, handover complete, task statuses consistent, no secrets.');
}
