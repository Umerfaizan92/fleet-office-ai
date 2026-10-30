// Recovery snapshot: saves the current working tree (tracked changes and new, non-ignored files) as a git commit
// object under refs/recovery/<branch>/<timestamp>. It does NOT change the branch, the staging area or any file,
// and it is not a normal commit on the branch, so unfinished work never looks "done".
//   npm run memory:snapshot -- --label "before migration"
//   npm run memory:snapshot -- --list
// Snapshots are local. To keep a copy on GitHub (only with the owner's permission):
//   git push origin "refs/recovery/*:refs/recovery/*"
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { findRoot, git, gitState, recoverySnapshots, identityEnv, parseArgs } from './lib.mjs';

export function snapshot(root, { label = 'manual', task = '' } = {}) {
  const state = gitState(root);
  if (!state.repo) return { created: false, reason: 'not a git repository' };
  if (state.operations.length) return { created: false, reason: `git ${state.operations.join(', ')} in progress; finish or abort it first` };
  if (!state.changed.length && !state.untracked.length) return { created: false, reason: 'working tree is clean; nothing unfinished to save' };
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-snap-'));
  const env = { GIT_INDEX_FILE: path.join(tmp, 'index'), ...identityEnv(root) };
  try {
    const steps = [['read-tree', 'HEAD'], ['add', '-A', '--', '.']];
    for (const s of steps) { const r = git(root, s, { env }); if (!r.ok) return { created: false, reason: `git ${s[0]} failed: ${r.err}` }; }
    const tree = git(root, ['write-tree'], { env });
    if (!tree.ok) return { created: false, reason: 'git write-tree failed: ' + tree.err };
    if (tree.out === git(root, ['rev-parse', 'HEAD^{tree}']).out) return { created: false, reason: 'no differences from HEAD' };
    const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
    const files = [...state.changed, ...state.untracked];
    const message = `recovery snapshot (${label})${task ? ' ' + task : ''} on ${state.branch} at ${state.head}\n\nUNFINISHED WORK, NOT VERIFIED. Files:\n${files.map((f) => '  ' + f).join('\n')}\n`;
    const commit = git(root, ['commit-tree', tree.out, '-p', 'HEAD'], { env, input: message });
    if (!commit.ok) return { created: false, reason: 'git commit-tree failed: ' + commit.err };
    const ref = `refs/recovery/${state.branch.replace(/[^A-Za-z0-9._/-]/g, '-')}/${stamp}`;
    const upd = git(root, ['update-ref', ref, commit.out]);
    if (!upd.ok) return { created: false, reason: 'git update-ref failed: ' + upd.err };
    return { created: true, ref, sha: commit.out.slice(0, 7), files };
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('snapshot.mjs')) {
  const args = parseArgs(process.argv.slice(2));
  const root = findRoot();
  if (args.list) {
    const snaps = recoverySnapshots(root);
    if (!snaps.length) console.log('No recovery snapshots.');
    for (const s of snaps) console.log(`${s.date}  ${s.sha}  ${s.ref}\n    ${s.subject}`);
  } else {
    const r = snapshot(root, { label: args.label === true ? 'manual' : (args.label || 'manual'), task: args.task === true ? '' : (args.task || '') });
    if (r.created) console.log(`Recovery snapshot saved: ${r.ref} (${r.sha}), ${r.files.length} file(s). Restore with: npm run memory:restore -- ${r.ref}`);
    else if (!args.quiet) console.log(`No snapshot: ${r.reason}.`);
  }
  process.exit(0);
}
