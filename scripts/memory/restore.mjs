// Restores unfinished work from a recovery snapshot into the working tree.
// Safety: refuses when the working tree has changes (never overwrites unrelated work) and when a git operation is in
// progress. It applies only the snapshot's differences, so commits made since the snapshot are kept.
//   npm run memory:restore -- refs/recovery/<branch>/<timestamp>
//   npm run memory:restore -- --latest
import { findRoot, git, gitState, recoverySnapshots, parseArgs } from './lib.mjs';

export function restore(root, ref) {
  const state = gitState(root);
  if (!state.repo) return { ok: false, reason: 'not a git repository' };
  if (state.operations.length) return { ok: false, reason: `git ${state.operations.join(', ')} in progress` };
  if (state.changed.length || state.untracked.length) return { ok: false, reason: 'working tree has changes; commit, stash or snapshot them first so nothing is overwritten' };
  if (!git(root, ['cat-file', '-e', `${ref}^{commit}`]).ok) return { ok: false, reason: `snapshot ${ref} not found` };
  const base = git(root, ['rev-parse', `${ref}^`]).out;
  const diff = git(root, ['diff', '--binary', base, ref]);
  if (!diff.ok) return { ok: false, reason: diff.err };
  if (!diff.out) return { ok: true, files: [] };
  const apply = git(root, ['apply', '--3way', '--whitespace=nowarn'], { input: diff.out + '\n' });
  if (!apply.ok) return { ok: false, reason: 'could not apply cleanly (the branch moved on): ' + apply.err.split('\n')[0] + '. Inspect with: git diff ' + base + ' ' + ref };
  git(root, ['reset', '-q']); // --3way stages files; leave them unstaged like the original work
  const files = git(root, ['diff', '--name-only', base, ref]).out.split('\n').filter(Boolean);
  return { ok: true, files, base: base.slice(0, 7) };
}

if (process.argv[1]?.endsWith('restore.mjs')) {
  const args = parseArgs(process.argv.slice(2));
  const root = findRoot();
  const ref = args.latest ? recoverySnapshots(root).find((s) => s.ref.includes(`/${gitState(root).branch}/`))?.ref : args._[0];
  if (!ref) { console.log('Give a snapshot ref (see npm run memory:snapshot -- --list) or --latest.'); process.exit(1); }
  const r = restore(root, ref);
  if (!r.ok) { console.log(`Not restored: ${r.reason}.`); process.exit(1); }
  console.log(`Restored ${r.files.length} file(s) from ${ref}. Review with git status / git diff, then re-run the tests before committing.`);
}
