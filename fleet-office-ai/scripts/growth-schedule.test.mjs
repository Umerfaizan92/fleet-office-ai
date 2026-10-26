import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSlots } from '../src/growth.js';

test('hourly posting from 6am to 9pm gives 16 slots a day', () => {
  const s = buildSlots({ startDate: '2030-02-01', days: 2, perDay: 16, fromHour: 6, toHour: 21 });
  assert.equal(s.length, 32);
  assert.equal(s[0].at, '2030-02-01T06:00:00.000Z');
  assert.equal(s[15].at, '2030-02-01T21:00:00.000Z');
});
test('one post a day lands mid-window and local hours follow the owner time zone', () => {
  const s = buildSlots({ startDate: '2030-02-01', days: 1, perDay: 1, fromHour: 6, toHour: 22, tzOffsetMin: -480 });
  assert.equal(s.length, 1);
  assert.equal(s[0].at, '2030-02-01T06:00:00.000Z');
});
test('never more than 16 a day and slots stay in order', () => {
  const s = buildSlots({ startDate: '2030-02-01', days: 1, perDay: 40, fromHour: 6, toHour: 21 });
  assert.ok(s.length <= 16);
  assert.deepEqual([...s].sort((a, b) => a.at.localeCompare(b.at)), s);
});
