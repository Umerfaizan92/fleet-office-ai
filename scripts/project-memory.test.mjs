// Project memory (P03.5): the real memory files are valid, and the checkpoint → snapshot → lost session → resume →
// restore cycle works. The cycle runs in a throwaway git repository, never against this repository's history, so it is
// safe inside Render's build (npm test).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { validate } from './memory/validate.mjs';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const hasGit = spawnSync('git', ['--version']).status === 0;

test('the repository project memory is complete, consistent and free of secrets', () => {
  assert.deepEqual(validate(ROOT), []);
});

test('Claude Code hooks are configured for session start and compaction, and never loop', () => {
  const s = JSON.parse(fs.readFileSync(path.join(ROOT, '.claude', 'settings.json'), 'utf8'));
  const start = s.hooks.SessionStart.flatMap((h) => h.hooks).map((h) => h.command).join(' ');
  assert.match(start, /scripts\/memory\/resume\.mjs/);
  assert.match(s.hooks.SessionStart[0].matcher, /compact/);
  assert.match(s.hooks.PreCompact.flatMap((h) => h.hooks)[0].command, /snapshot\.mjs/);
  assert.equal(s.hooks.Stop, undefined, 'a Stop hook could keep a session from ending');
});

test('checkpoint, snapshot, lost session, resume and restore', { skip: !hasGit && 'git not installed' }, async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-memory-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const sh = (cmd, args, opts = {}) => spawnSync(cmd, args, { cwd: dir, encoding: 'utf8', env: { ...process.env, GIT_CONFIG_NOSYSTEM: '1', HOME: dir }, ...opts });
  const gitc = (...a) => { const r = sh('git', ['-c', 'user.name=Memory Test', '-c', 'user.email=memory@example.test', '-c', 'init.defaultBranch=main', ...a]); assert.equal(r.status, 0, `git ${a.join(' ')}: ${r.stderr}`); return r.stdout.trim(); };
  const node = (script, ...a) => sh(process.execPath, [path.join(dir, 'scripts', 'memory', script), ...a]);

  // A tiny project with this repository's memory system and one open task.
  fs.cpSync(path.join(ROOT, 'scripts', 'memory'), path.join(dir, 'scripts', 'memory'), { recursive: true });
  fs.cpSync(path.join(ROOT, '.claude', 'project-memory'), path.join(dir, '.claude', 'project-memory'), { recursive: true });
  fs.copyFileSync(path.join(ROOT, 'CLAUDE.md'), path.join(dir, 'CLAUDE.md'));
  fs.writeFileSync(path.join(dir, '.claude', 'project-memory', 'PENDING_TASKS.md'), '# Pending tasks\n\n## T-900 Add a greeting\n- Status: NOT_STARTED\n- Acceptance: app.txt says hello and notes.txt exists.\n\n## T-901 Later work\n- Status: NOT_STARTED\n');
  fs.writeFileSync(path.join(dir, 'app.txt'), 'v1\n');
  gitc('init', '-q'); gitc('add', '-A'); gitc('commit', '-qm', 'base');
  const base = gitc('rev-parse', '--short', 'HEAD');

  // 1. Start the task and checkpoint it.
  let r = node('checkpoint.mjs', '--task', 'T-900', '--status', 'IN_PROGRESS', '--phase', 'Drill', '--done', 'read the requirement', '--todo', 'edit app.txt; add notes.txt', '--next', 'edit app.txt');
  assert.equal(r.status, 0, r.stderr);
  const pending = fs.readFileSync(path.join(dir, '.claude/project-memory/PENDING_TASKS.md'), 'utf8');
  assert.match(pending, /T-900 Add a greeting\n- Status: IN_PROGRESS/);
  assert.match(pending, /T-901 Later work\n- Status: NOT_STARTED/, 'other tasks untouched');
  gitc('add', '-A'); gitc('commit', '-qm', 'checkpoint T-900 started');

  // 2. Unfinished work, saved with a snapshot. The snapshot must not touch files, index or branch.
  fs.writeFileSync(path.join(dir, 'app.txt'), 'hello\n');
  fs.writeFileSync(path.join(dir, 'notes.txt'), 'half written\n');
  const headBefore = gitc('rev-parse', 'HEAD');
  r = node('checkpoint.mjs', '--task', 'T-900', '--status', 'IN_PROGRESS', '--done', 'edited app.txt', '--todo', 'finish notes.txt', '--next', 'finish notes.txt then run tests', '--snapshot');
  assert.equal(r.status, 0, r.stderr);
  assert.equal(gitc('rev-parse', 'HEAD'), headBefore, 'snapshot must not move the branch');
  assert.equal(gitc('diff', '--cached', '--name-only'), '', 'snapshot must not stage anything');
  assert.equal(fs.readFileSync(path.join(dir, 'notes.txt'), 'utf8'), 'half written\n');
  const refs = gitc('for-each-ref', '--format=%(refname)', 'refs/recovery/');
  assert.match(refs, /^refs\/recovery\/main\/\d{8}T\d{6}Z$/);
  const cps = fs.readFileSync(path.join(dir, '.claude/project-memory/CHECKPOINTS.md'), 'utf8');
  for (const field of ['Phase:', 'Task: T-900', 'Completed steps: edited app.txt', 'Incomplete steps: finish notes.txt', 'Files modified', 'Tests executed', 'Git branch: main', 'Commit:', 'Recovery snapshot: refs/recovery/main/', 'Known errors', 'Next exact action: finish notes.txt then run tests']) assert.ok(cps.includes(field), `checkpoint lacks ${field}`);

  // 3. The session ends and the working tree is lost (only refs and committed files survive).
  const memoryNow = ['CHECKPOINTS.md', 'SESSION_HANDOVER.md', 'PENDING_TASKS.md'].map((f) => [f, fs.readFileSync(path.join(dir, '.claude/project-memory', f), 'utf8')]);
  gitc('checkout', '--', '.'); gitc('clean', '-fdq');
  for (const [f, text] of memoryNow) fs.writeFileSync(path.join(dir, '.claude/project-memory', f), text); // memory was committed in real use
  gitc('add', '.claude'); gitc('commit', '-qm', 'memory after checkpoint');
  assert.equal(fs.existsSync(path.join(dir, 'notes.txt')), false);

  // 4. A new session: the resume check names the task and the snapshot, and does not offer finished work.
  r = node('resume.mjs', '--json');
  const report = JSON.parse(r.stdout);
  assert.equal(report.firstUnfinished.id, 'T-900');
  assert.equal(report.firstUnfinished.status, 'IN_PROGRESS');
  assert.ok(report.warnings.some((w) => w.includes('npm run memory:restore -- refs/recovery/main/')), report.warnings.join('\n'));
  assert.equal(report.handover['NEXT EXACT ACTION'], 'finish notes.txt then run tests');
  const text = node('resume.mjs').stdout;
  assert.match(text, /Resume with: T-900 Add a greeting \[IN_PROGRESS\]/);

  // 5. Restore the unfinished work; it comes back unstaged with the exact content.
  const ref = refs.split('\n')[0];
  r = node('restore.mjs', ref);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.equal(fs.readFileSync(path.join(dir, 'app.txt'), 'utf8'), 'hello\n');
  assert.equal(fs.readFileSync(path.join(dir, 'notes.txt'), 'utf8'), 'half written\n');
  assert.equal(gitc('diff', '--cached', '--name-only'), '');

  // 6. Restore never overwrites other work.
  r = node('restore.mjs', ref);
  assert.notEqual(r.status, 0);
  assert.match(r.stdout, /working tree has changes/);

  // 7. Finish the task. COMPLETED is refused without verification, accepted with it.
  fs.writeFileSync(path.join(dir, 'notes.txt'), 'done\n');
  r = node('checkpoint.mjs', '--task', 'T-900', '--status', 'COMPLETED');
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /needs --verified/);
  r = node('checkpoint.mjs', '--task', 'T-900', '--status', 'COMPLETED', '--verified', '--tests', 'drill', '--results', '1 fail');
  assert.notEqual(r.status, 0, 'failing results must block COMPLETED');
  gitc('add', '-A'); gitc('commit', '-qm', 'T-900 done');
  r = node('checkpoint.mjs', '--task', 'T-900', '--status', 'COMPLETED', '--verified', '--tests', 'drill', '--results', 'pass', '--next', 'start T-901');
  assert.equal(r.status, 0, r.stderr);
  const ho = fs.readFileSync(path.join(dir, '.claude/project-memory/SESSION_HANDOVER.md'), 'utf8');
  assert.match(ho, new RegExp(`LATEST VERIFIED COMMIT: ${gitc('rev-parse', '--short', 'HEAD')}`));
  assert.ok(!ho.includes(`LATEST VERIFIED COMMIT: ${base}`));

  // 8. The next session moves on to the next task.
  assert.equal(JSON.parse(node('resume.mjs', '--json').stdout).firstUnfinished.id, 'T-901');

  // 9. Secrets are refused, a clean tree makes no snapshot, and the resume check never fails.
  r = node('checkpoint.mjs', '--task', 'T-901', '--next', 'use password=Sup3rS3cretValue to log in');
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /refusing to write/);
  gitc('add', '-A'); gitc('commit', '-qm', 'memory');
  assert.match(node('snapshot.mjs').stdout, /working tree is clean/);
  fs.rmSync(path.join(dir, '.claude/project-memory/SESSION_HANDOVER.md'));
  r = node('resume.mjs');
  assert.equal(r.status, 0);
  assert.match(r.stdout, /SESSION_HANDOVER.md is missing/);
});

test('resume check reports a branch mismatch and an interrupted merge', { skip: !hasGit && 'git not installed' }, async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-memory-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const sh = (cmd, args) => spawnSync(cmd, args, { cwd: dir, encoding: 'utf8', env: { ...process.env, GIT_CONFIG_NOSYSTEM: '1', HOME: dir } });
  const gitc = (...a) => sh('git', ['-c', 'user.name=T', '-c', 'user.email=t@example.test', '-c', 'init.defaultBranch=main', ...a]);
  fs.cpSync(path.join(ROOT, 'scripts', 'memory'), path.join(dir, 'scripts', 'memory'), { recursive: true });
  fs.cpSync(path.join(ROOT, '.claude', 'project-memory'), path.join(dir, '.claude', 'project-memory'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'f.txt'), 'a\n');
  gitc('init', '-q'); gitc('add', '-A'); gitc('commit', '-qm', 'base');
  gitc('checkout', '-qb', 'other'); fs.writeFileSync(path.join(dir, 'f.txt'), 'b\n'); gitc('commit', '-qam', 'b');
  gitc('checkout', '-q', 'main'); fs.writeFileSync(path.join(dir, 'f.txt'), 'c\n'); gitc('commit', '-qam', 'c');
  gitc('merge', 'other'); // conflicts and stays in progress
  const report = JSON.parse(sh(process.execPath, [path.join(dir, 'scripts/memory/resume.mjs'), '--json']).stdout);
  assert.ok(report.warnings.some((w) => /git merge is in progress/.test(w)), report.warnings.join('\n'));
  assert.ok(report.warnings.some((w) => /Handover was written on branch "phase-03-cinematic-design" but you are on "main"/.test(w)));
  assert.ok(report.warnings.some((w) => /does not exist here/.test(w)), 'recorded commit from another clone is flagged');
});
