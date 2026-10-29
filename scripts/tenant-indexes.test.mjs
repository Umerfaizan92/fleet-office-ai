// Every table that holds business records can be filtered by organisation through an index,
// so tenant-scoped queries stay fast and a new table without one is caught in review.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createDb } from '../src/db.js';
import { createJobQueue } from '../src/job-queue.js';

test('every table with organisation_id has an index that starts with it', () => {
  const db = createDb(':memory:');
  createJobQueue({ db });
  const missing = [];
  for (const { name } of db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all()) {
    const cols = db.prepare(`PRAGMA table_info("${name}")`).all();
    if (!cols.some((c) => c.name === 'organisation_id')) continue;
    const pkFirst = cols.filter((c) => c.pk).sort((a, b) => a.pk - b.pk)[0]?.name === 'organisation_id';
    const indexed = db.prepare(`PRAGMA index_list("${name}")`).all().some((i) => db.prepare(`PRAGMA index_info("${i.name}")`).all().sort((a, b) => a.seqno - b.seqno)[0]?.name === 'organisation_id');
    if (!pkFirst && !indexed) missing.push(name);
  }
  assert.deepEqual(missing, []);
});
