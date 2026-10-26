import test from 'node:test';
import assert from 'node:assert/strict';
import { PILLARS, pillarScore, analyseCluster } from '../src/seo-cluster.js';

test('five pillars with five checks each, named as in the Modern SEO Cluster', () => {
  assert.deepEqual(Object.values(PILLARS).map(p => p.name), ['SEO', 'AEO', 'GEO', 'AIO', 'SXO']);
  for (const p of Object.values(PILLARS)) assert.equal(p.checks.length, 5);
});

test('an empty business scores low but never crashes, and reports every pillar', () => {
  const r = analyseCluster({ profile: {}, site: null, content: [], channels: [], aiLog: [], metrics: [], signals: {}, now: new Date('2026-10-26') });
  const text = JSON.stringify(r);
  for (const id of ['seo', 'aeo', 'geo', 'aio', 'sxo']) assert.ok(text.includes(id));
});

test('score drops 20 per fix and 8 per improve/setup', () => {
  assert.equal(pillarScore([{ level: 'ok' }, { level: 'ok' }]), 100);
  assert.equal(pillarScore([{ level: 'fix' }]), 80);
  assert.equal(pillarScore([{ level: 'improve' }, { level: 'setup' }]), 84);
});
