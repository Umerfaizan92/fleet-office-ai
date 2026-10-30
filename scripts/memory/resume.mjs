// Resume check, run at the start of every session (Claude Code SessionStart hook) or by hand:
//   npm run memory:resume            readable report
//   npm run memory:resume -- --json  machine-readable (used by tests)
// It compares the recorded handover with the real repository instead of trusting the notes, and names the first
// unfinished task. It never changes anything, never uses the network, and always exits 0 so it cannot block a session.
import path from 'node:path';
import { findRoot, memDir, read, gitState, parseHandover, parseTasks, lastCheckpoint, commitExists, isAncestor, git, parseArgs } from './lib.mjs';

export function resumeReport(root) {
  const dir = memDir(root);
  const handoverText = read(path.join(dir, 'SESSION_HANDOVER.md'));
  const pendingText = read(path.join(dir, 'PENDING_TASKS.md'));
  const completedText = read(path.join(dir, 'COMPLETED_TASKS.md'));
  const ho = parseHandover(handoverText);
  const state = gitState(root);
  const pending = parseTasks(pendingText);
  const completed = parseTasks(completedText).map((t) => t.id);
  const cp = lastCheckpoint(read(path.join(dir, 'CHECKPOINTS.md')));
  const warnings = [];
  const facts = [];

  if (!handoverText) warnings.push('SESSION_HANDOVER.md is missing: project memory not set up or not checked out.');
  if (!state.repo) warnings.push('Not a git repository: cannot verify the recorded state.');
  else {
    const recBranch = (ho['CURRENT BRANCH'] || '').split(/\s/)[0];
    if (recBranch && recBranch !== state.branch) warnings.push(`Handover was written on branch "${recBranch}" but you are on "${state.branch}". Switch branch or confirm the handover is out of date.`);
    const recCommit = (ho['LATEST VERIFIED COMMIT'] || '').split(/\s/)[0];
    if (/^[0-9a-f]{7,40}$/.test(recCommit)) {
      if (!commitExists(root, recCommit)) warnings.push(`Recorded verified commit ${recCommit} does not exist here (history rewritten, or a different clone).`);
      else if (!isAncestor(root, recCommit, 'HEAD')) warnings.push(`Recorded verified commit ${recCommit} is not part of HEAD. The branch diverged; inspect before continuing.`);
      else {
        const since = git(root, ['log', '--format=%h %s', `${recCommit}..HEAD`]).out;
        if (since) facts.push(`Commits after the last verified commit (verify their tests before relying on them):\n${since.split('\n').map((l) => '    ' + l).join('\n')}`);
      }
    }
    const dirty = state.changed.length + state.untracked.length;
    const recDirty = /^none/i.test(ho['UNCOMMITTED CHANGES'] || '') ? 0 : null;
    if (dirty && recDirty === 0) warnings.push(`Handover says no uncommitted changes, but ${dirty} file(s) are changed. Another session or tool changed files; review git diff first.`);
    if (state.operations.length) warnings.push(`A git ${state.operations.join(', ')} is in progress. Finish or abort it before anything else.`);
    if (!dirty && (ho['UNCOMMITTED CHANGES'] || '').includes('refs/recovery/')) {
      const ref = (ho['UNCOMMITTED CHANGES'].match(/refs\/recovery\/\S+/) || [])[0];
      if (ref && commitExists(root, ref)) warnings.push(`Unfinished work from the last session is not in the working tree. Restore it with: npm run memory:restore -- ${ref}`);
      else if (ref) warnings.push(`Unfinished work was saved in ${ref}, but that snapshot is not in this clone (snapshots are local unless pushed). The work must be redone from the handover notes.`);
    }
    if (state.mainNewer) warnings.push(`origin/main has ${state.mainNewer} commit(s) this branch does not contain (as of the last fetch). Other tools may have changed main.`);
  }

  const order = ['IN_PROGRESS', 'TESTING', 'BLOCKED', 'NOT_STARTED'];
  const open = pending.filter((t) => t.status && t.status !== 'COMPLETED');
  // The task the last session was working on wins while it is still open; otherwise the first active task, then the first not started.
  const recordedTask = ((ho['CURRENT TASK'] || '').match(/T-\d{3,}/) || [])[0];
  const first = open.find((t) => t.id === recordedTask && t.status !== 'BLOCKED') || open.find((t) => t.status === 'IN_PROGRESS') || open.find((t) => t.status === 'TESTING') || open.find((t) => t.status === 'NOT_STARTED') || null;
  for (const t of pending) if (t.status === 'COMPLETED' && !completed.includes(t.id)) warnings.push(`${t.id} is COMPLETED in PENDING_TASKS.md but has no evidence entry in COMPLETED_TASKS.md.`);
  for (const t of pending) if (completed.includes(t.id) && t.status !== 'COMPLETED') warnings.push(`${t.id} appears in COMPLETED_TASKS.md but PENDING_TASKS.md says ${t.status}.`);

  return {
    branch: state.branch, head: state.head, subject: state.subject, ahead: state.ahead, remoteBranch: state.remoteBranch,
    changed: state.changed || [], untracked: state.untracked || [],
    // Snapshots older than the last checkpoint are history (their work was checkpointed since); list only newer ones.
    snapshots: (state.snapshots || []).filter((sn) => !cp?.heading || Date.parse(sn.date) > Date.parse(cp.heading.split(' ')[1])).slice(0, 3), olderSnapshots: Math.max(0, (state.snapshots || []).length - (state.snapshots || []).filter((sn) => !cp?.heading || Date.parse(sn.date) > Date.parse(cp.heading.split(' ')[1])).length),
    handover: ho, lastCheckpoint: cp, firstUnfinished: first, open: open.map((t) => ({ id: t.id, status: t.status, title: t.title })).sort((a, b) => order.indexOf(a.status) - order.indexOf(b.status)),
    completedCount: completed.length, warnings, facts
  };
}

export function formatReport(r) {
  const L = [];
  L.push('=== Super Pro project memory: resume check (read CLAUDE.md for the rules) ===');
  L.push(`Branch ${r.branch} at ${r.head} "${r.subject}"${r.remoteBranch ? (r.ahead ? `, ${r.ahead} commit(s) not pushed to ${r.remoteBranch}` : `, in step with ${r.remoteBranch}`) : ', not on GitHub yet'}.`);
  L.push(`Working tree: ${r.changed.length} changed, ${r.untracked.length} new file(s).${r.changed.length + r.untracked.length ? ' ' + [...r.changed, ...r.untracked].slice(0, 8).join(', ') : ''}`);
  const h = r.handover;
  L.push(`Handover: task ${h['CURRENT TASK'] || '?'}; verified commit ${h['LATEST VERIFIED COMMIT'] || '?'}.`);
  if (h['NEXT EXACT ACTION']) L.push(`Recorded next action: ${h['NEXT EXACT ACTION']}`);
  if (h['APPROVALS REQUIRED'] && !/^none/i.test(h['APPROVALS REQUIRED'])) L.push(`Approvals required: ${h['APPROVALS REQUIRED']}`);
  if (r.lastCheckpoint) L.push(`Last checkpoint: ${r.lastCheckpoint.heading}`);
  if (r.firstUnfinished) L.push(`Resume with: ${r.firstUnfinished.id} ${r.firstUnfinished.title} [${r.firstUnfinished.status}]`);
  else if (r.open.length) L.push(`No task can proceed: every open task is BLOCKED (${r.open.map((t) => t.id).join(', ')}). Ask the owner; do not start blocked work.`);
  else L.push('No unfinished task recorded. Wait for the owner\'s next instruction.');
  if (r.open.length > 1) L.push(`Other open tasks: ${r.open.filter((t) => t.id !== r.firstUnfinished?.id).map((t) => `${t.id} [${t.status}]`).join(', ')}`);
  L.push(`Verified completed tasks: ${r.completedCount} (do not redo them; see COMPLETED_TASKS.md).`);
  if (r.snapshots.length) L.push(`Recovery snapshots newer than the last checkpoint: ${r.snapshots.map((s) => `${s.ref} (${s.date})`).join('; ')}`);
  if (r.olderSnapshots) L.push(`${r.olderSnapshots} older recovery snapshot(s) kept as history (npm run memory:snapshot -- --list).`);
  for (const f of r.facts) L.push(f);
  for (const w of r.warnings) L.push(`WARNING: ${w}`);
  L.push('Before editing: confirm the state above matches the code (git log, git diff, tests). Checkpoint with npm run memory:checkpoint.');
  return L.join('\n');
}

if (process.argv[1]?.endsWith('resume.mjs')) {
  const args = parseArgs(process.argv.slice(2));
  try {
    const r = resumeReport(findRoot(process.env.CLAUDE_PROJECT_DIR || process.cwd()));
    console.log(args.json ? JSON.stringify(r, null, 2) : formatReport(r));
  } catch (e) {
    console.log(`Resume check could not run (${e.message}). Read CLAUDE.md and .claude/project-memory/SESSION_HANDOVER.md by hand.`);
  }
  process.exit(0);
}
