// Records a durable checkpoint: appends to CHECKPOINTS.md, refreshes the generated block of SESSION_HANDOVER.md and,
// when given, updates the task's status in PENDING_TASKS.md. With --snapshot it also saves unfinished work as a
// recovery snapshot (see snapshot.mjs). It never commits, pushes or touches source files.
//
//   npm run memory:checkpoint -- --task T-036 --status IN_PROGRESS --phase "P03 follow-up" \
//     --done "found the rule; wrote the fix" --todo "run test:ui; update baselines" \
//     --tests "test:ui" --results "33/33" --next "run npm run test:visual" --snapshot
//
// Lists take ";" separated items or repeated flags. --verified marks HEAD as the latest verified commit (use only
// after the tests named in --tests passed on that commit). COMPLETED requires --verified, --tests and --results.
import fs from 'node:fs';
import path from 'node:path';
import { findRoot, memDir, read, gitState, parseArgs, list, nowIso, parseHandover, parseTasks, STATUSES, START, END, findSecrets } from './lib.mjs';
import { snapshot } from './snapshot.mjs';

export function checkpoint(root, opts) {
  const dir = memDir(root);
  const files = { cp: path.join(dir, 'CHECKPOINTS.md'), ho: path.join(dir, 'SESSION_HANDOVER.md'), pending: path.join(dir, 'PENDING_TASKS.md') };
  const status = opts.status ? String(opts.status).toUpperCase() : '';
  if (status && !STATUSES.includes(status)) throw new Error(`status must be one of ${STATUSES.join(', ')}`);
  if (status === 'COMPLETED' && !(opts.verified && list(opts.tests).length && list(opts.results).length)) throw new Error('COMPLETED needs --verified, --tests and --results (acceptance criteria must be verified first)');
  if (status === 'COMPLETED' && list(opts.results).some((r) => /\b(fail|failed|error)\b/i.test(r) && !/\b0 fail/i.test(r))) throw new Error('results mention failures; a task with failing tests cannot be COMPLETED');

  const state = gitState(root);
  const previous = parseHandover(read(files.ho));
  const snap = opts.snapshot ? snapshot(root, { label: opts.label || 'checkpoint', task: opts.task || '' }) : null;
  const verifiedCommit = opts.verified ? (state.repo ? `${state.head} (${state.subject})` : 'unknown') : (previous['LATEST VERIFIED COMMIT'] || 'none recorded');
  const modified = list(opts.files).length ? list(opts.files) : (state.repo ? [...state.changed, ...state.untracked] : []);
  const stamp = nowIso();
  const cpText = read(files.cp);
  const n = (cpText.match(/^## CP-\d+/gm) || []).length + 1;
  const id = `CP-${String(n).padStart(3, '0')}`;
  const fmt = (arr) => (arr.length ? arr.join('; ') : 'none');
  const entry = [
    `## ${id} ${stamp} ${opts.task || 'no task'} ${status || ''}`.trimEnd(),
    `- Phase: ${opts.phase || previous['CURRENT PHASE'] || 'not set'}`,
    `- Task: ${opts.task || 'not set'}${status ? ` (${status})` : ''}`,
    `- Completed steps: ${fmt(list(opts.done))}`,
    `- Incomplete steps: ${fmt(list(opts.todo))}`,
    `- Files modified (uncommitted at checkpoint): ${fmt(modified)}`,
    `- Tests executed: ${fmt(list(opts.tests))}`,
    `- Test results: ${fmt(list(opts.results))}`,
    `- Git branch: ${state.repo ? state.branch : 'n/a'}`,
    `- Commit: ${state.repo ? `${state.head} (${state.subject})` : 'n/a'}${state.repo && state.ahead ? `; ${state.ahead} commit(s) not on ${state.remoteBranch}` : ''}${state.repo && !state.remoteBranch ? '; branch not on remote' : ''}`,
    `- Recovery snapshot: ${snap ? (snap.created ? `${snap.ref} (${snap.sha})` : `none (${snap.reason})`) : 'not requested'}`,
    `- Known errors: ${fmt(list(opts.errors))}`,
    `- Next exact action: ${opts.next || 'not set'}`,
    ''
  ].join('\n');

  const handover = [
    START,
    `PROJECT: Super Pro AI Office Manager (Umerfaizan92/fleet-office-ai)`,
    `CURRENT BRANCH: ${state.repo ? state.branch : 'n/a'}${state.repo && !state.remoteBranch ? ' (not on GitHub yet)' : ''}`,
    `LATEST VERIFIED COMMIT: ${verifiedCommit}`,
    `CURRENT PHASE: ${opts.phase || previous['CURRENT PHASE'] || 'not set'}`,
    `CURRENT TASK: ${opts.task ? `${opts.task}${status ? ` (${status})` : ''}` : previous['CURRENT TASK'] || 'not set'}`,
    `LAST COMPLETED STEP: ${list(opts.done).slice(-1)[0] || previous['LAST COMPLETED STEP'] || 'not set'}`,
    `FILES MODIFIED: ${fmt(modified)}`,
    `TESTS PASSED: ${fmt(list(opts.results).filter((r) => !/fail/i.test(r) || /\b0 fail/i.test(r)).map((r, i) => (list(opts.tests)[i] ? `${list(opts.tests)[i]} ${r}` : r)))}`,
    `TESTS FAILED: ${fmt(list(opts.failed))}`,
    `UNCOMMITTED CHANGES: ${state.repo ? (state.changed.length + state.untracked.length ? `${state.changed.length + state.untracked.length} file(s)${snap?.created ? `, saved in ${snap.ref}` : ''}` : 'none') : 'n/a'}`,
    `KNOWN BLOCKERS: ${fmt(list(opts.blockers).length ? list(opts.blockers) : list(opts.errors))}`,
    `NEXT EXACT ACTION: ${opts.next || 'not set'}`,
    `APPROVALS REQUIRED: ${fmt(list(opts.approvals))}`,
    `LAST CHECKPOINT: ${id} at ${stamp}`,
    END
  ].join('\n');

  const leaks = findSecrets(entry + handover);
  if (leaks.length) throw new Error(`refusing to write: text looks like it contains ${leaks.join(', ')}`);

  fs.writeFileSync(files.cp, (cpText.endsWith('\n') || !cpText ? cpText : cpText + '\n') + '\n' + entry);
  const ho = read(files.ho);
  const s = ho.indexOf(START), e = ho.indexOf(END);
  const next = s >= 0 && e > s ? ho.slice(0, s) + handover + ho.slice(e + END.length) : `# Session handover\n\n${handover}\n\n## Notes\n\n${ho}`;
  fs.writeFileSync(files.ho, next);

  let taskUpdated = false;
  if (opts.task && status) {
    const pending = read(files.pending);
    const known = parseTasks(pending).some((t) => t.id === opts.task);
    if (known) {
      const re = new RegExp(`(##\\s+${opts.task}\\b[^\\n]*\\n(?:(?!##\\s)[^\\n]*\\n)*?\\s*-\\s*Status:\\s*)[A-Z_]+[^\\n]*`);
      const updated = pending.replace(re, `$1${status}`);
      if (updated !== pending) { fs.writeFileSync(files.pending, updated); taskUpdated = true; }
    }
  }
  return { id, stamp, snapshot: snap, taskUpdated };
}

if (process.argv[1]?.endsWith('checkpoint.mjs')) {
  const args = parseArgs(process.argv.slice(2));
  try {
    const r = checkpoint(findRoot(), args);
    console.log(`Checkpoint ${r.id} saved at ${r.stamp}.${r.taskUpdated ? ` ${args.task} marked ${String(args.status).toUpperCase()} in PENDING_TASKS.md.` : ''}${r.snapshot ? ` ${r.snapshot.created ? 'Snapshot ' + r.snapshot.ref : 'No snapshot: ' + r.snapshot.reason}.` : ''}`);
    console.log('Memory files changed: commit them with the work they describe (git add .claude/project-memory).');
  } catch (e) {
    console.error('Checkpoint not saved: ' + e.message);
    process.exit(1);
  }
}

