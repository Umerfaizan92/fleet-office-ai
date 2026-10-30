// Task and note updates for the project memory, so no session has to hand-edit files under .claude/
// (Claude Code treats .claude/ as sensitive and asks permission for every direct edit; unattended runs cannot).
//
//   npm run memory:task -- add --title "Fix X" --requirement "..." --files "a.js; b.css" --acceptance "..."
//   npm run memory:task -- status --task T-040 --status BLOCKED
//   npm run memory:task -- complete --task T-040 --evidence "commit abc1234; test:ui 34/34; npm test 73/73"
//   npm run memory:task -- decision --text "Use X because Y"
//   npm run memory:task -- error --task T-040 --text "what failed" --partial "No" --recovery "what to do"
//   npm run memory:task -- progress --text "one line for the PROGRESS.md log"
import fs from 'node:fs';
import path from 'node:path';
import { findRoot, memDir, read, parseTasks, parseArgs, STATUSES, findSecrets, gitState } from './lib.mjs';

const today = () => new Date().toISOString().slice(0, 10);
const one = (v) => (v === undefined || v === true ? '' : String([].concat(v).join('; ')).trim());

export function runTask(root, args) {
  const dir = memDir(root);
  const P = path.join(dir, 'PENDING_TASKS.md'), C = path.join(dir, 'COMPLETED_TASKS.md');
  const cmd = args._[0];
  const guard = (text) => { const hits = findSecrets(text); if (hits.length) throw new Error(`refusing to write: text looks like it contains ${hits.join(', ')}`); return text; };

  if (cmd === 'add') {
    const title = one(args.title); if (!title) throw new Error('add needs --title');
    const all = [...parseTasks(read(P)), ...parseTasks(read(C))].map((t) => Number(t.id.slice(2)));
    const id = args.id && args.id !== true ? String(args.id) : `T-${String(Math.max(0, ...all) + 1).padStart(3, '0')}`;
    if (parseTasks(read(P) + read(C)).some((t) => t.id === id)) throw new Error(`${id} already exists`);
    const status = (one(args.status) || 'NOT_STARTED').toUpperCase();
    if (!STATUSES.includes(status) || status === 'COMPLETED') throw new Error(`new task status must be one of ${STATUSES.filter((s) => s !== 'COMPLETED').join(', ')}`);
    const block = guard(`\n## ${id} ${title}\n- Status: ${status}\n- Added: ${today()}\n- Requirement: ${one(args.requirement) || 'not recorded'}\n- Files: ${one(args.files) || 'not known yet'}\n- Acceptance: ${one(args.acceptance) || 'not recorded'}\n`);
    let text = read(P);
    const marker = text.search(/\n## P\d+ onwards/);
    text = marker >= 0 ? text.slice(0, marker) + block + text.slice(marker) : text.replace(/\s*$/, '\n') + block;
    fs.writeFileSync(P, text);
    return `${id} added to PENDING_TASKS.md (${status}).`;
  }

  if (cmd === 'status') {
    const id = one(args.task), status = one(args.status).toUpperCase();
    if (!STATUSES.includes(status)) throw new Error(`--status must be one of ${STATUSES.join(', ')}`);
    if (status === 'COMPLETED') throw new Error('use "complete" with --evidence to mark a task COMPLETED');
    const text = read(P);
    const re = new RegExp(`(##\\s+${id}\\b[^\\n]*\\n(?:(?!##\\s)[^\\n]*\\n)*?\\s*-\\s*Status:\\s*)[A-Z_]+`);
    if (!re.test(text)) throw new Error(`${id} not found in PENDING_TASKS.md`);
    fs.writeFileSync(P, text.replace(re, `$1${status}`));
    return `${id} is now ${status}.`;
  }

  if (cmd === 'complete') {
    const id = one(args.task), evidence = one(args.evidence);
    if (!id) throw new Error('complete needs --task');
    if (evidence.length < 12) throw new Error('complete needs --evidence describing the verification (tests and results, commit)');
    if (/\b(fail|failed|failing)\b/i.test(evidence) && !/\b0 fail/i.test(evidence)) throw new Error('evidence mentions failures; a task with failing tests cannot be COMPLETED');
    const text = read(P);
    const m = text.match(new RegExp(`\\n## ${id}\\b[^\\n]*\\n(?:(?!## )[^\\n]*\\n?)*`));
    if (!m) throw new Error(`${id} not found in PENDING_TASKS.md`);
    const task = parseTasks(m[0])[0];
    if (task.status === 'BLOCKED') throw new Error(`${id} is BLOCKED; unblock it first`);
    const state = gitState(root);
    const body = m[0].trim().split('\n').slice(1).filter((l) => !/^\s*-\s*Status:/.test(l)).join('\n');
    const entry = guard(`\n## ${id} ${task.title}\n${body}\n${one(args.files) ? `- Files changed: ${one(args.files)}\n` : ''}- Evidence: ${evidence}${state.repo ? ` (recorded ${today()} on ${state.branch} at ${state.head})` : ''}\n`);
    fs.writeFileSync(P, text.replace(m[0], '\n'));
    fs.writeFileSync(C, read(C).replace(/\s*$/, '\n') + entry);
    return `${id} moved to COMPLETED_TASKS.md with evidence.`;
  }

  if (cmd === 'decision' || cmd === 'error') {
    const file = path.join(dir, cmd === 'decision' ? 'DECISIONS.md' : 'ERROR_LOG.md');
    const text = read(file), prefix = cmd === 'decision' ? 'D' : 'E';
    const n = Math.max(0, ...[...text.matchAll(new RegExp(`\\| ${prefix}-(\\d+) \\|`, 'g'))].map((x) => Number(x[1]))) + 1;
    const id = `${prefix}-${String(n).padStart(3, '0')}`;
    const cell = (s) => one(s).replace(/\|/g, '/').replace(/\n/g, ' ');
    if (!one(args.text)) throw new Error(`${cmd} needs --text`);
    const row = cmd === 'decision'
      ? `| ${id} | ${today()} | ${cell(args.text)} | ${cell(args.why) || 'not recorded'} |`
      : `| ${id} | ${today()} | ${cell(args.task) || 'none'} | ${cell(args.text)} | ${cell(args.partial) || 'Unknown: verify before retrying'} | ${cell(args.recovery) || 'not recorded'} |`;
    fs.writeFileSync(file, text.replace(/\s*$/, '\n') + guard(row) + '\n');
    return `${id} added to ${path.basename(file)}.`;
  }

  if (cmd === 'progress') {
    const file = path.join(dir, 'PROGRESS.md');
    if (!one(args.text)) throw new Error('progress needs --text');
    let text = read(file);
    if (!/\n## Log\n/.test(text)) text = text.replace(/\s*$/, '\n') + '\n## Log\n\nOne line per notable change, newest last (written by `npm run memory:task -- progress`).\n\n';
    fs.writeFileSync(file, text.replace(/\s*$/, '\n') + guard(`- ${today()}: ${one(args.text)}`) + '\n');
    return 'Line added to the PROGRESS.md log.';
  }

  throw new Error('commands: add, status, complete, decision, error, progress (see the top of scripts/memory/task.mjs)');
}

if (process.argv[1]?.endsWith('task.mjs')) {
  try { console.log(runTask(findRoot(), parseArgs(process.argv.slice(2)))); }
  catch (e) { console.error('Not changed: ' + e.message); process.exit(1); }
}

