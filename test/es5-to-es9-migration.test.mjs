import assert from 'node:assert/strict';
import { DEFAULT_START, makeWindows } from '../scripts/migrate_es5_oct2026_to_es9.mjs';
import { computeRecentRange } from '../scripts/sync_es5_recent_to_es9.mjs';

const windows = makeWindows(DEFAULT_START, '2026-10-03T05:30:00.000Z');
assert.equal(windows.length, 3);
assert.deepEqual(windows.at(-1), {
  id: '2026-09-30T17:00:00.000Z__2026-10-01T17:00:00.000Z',
  gte: '2026-09-30T17:00:00.000Z',
  lt: '2026-10-01T17:00:00.000Z',
});
assert.deepEqual(windows[0], {
  id: '2026-10-02T17:00:00.000Z__2026-10-03T05:30:00.000Z',
  gte: '2026-10-02T17:00:00.000Z',
  lt: '2026-10-03T05:30:00.000Z',
});
assert.throws(() => makeWindows(DEFAULT_START, DEFAULT_START), /Invalid migration range/);

assert.deepEqual(computeRecentRange({
  start: DEFAULT_START,
  fullSnapshotEnd: '2026-10-02T00:00:00.000Z',
  now: '2026-10-03T00:00:00.000Z',
  overlapHours: 2,
}), {
  gte: '2026-10-01T22:00:00.000Z',
  lt: '2026-10-03T00:00:00.000Z',
});
assert.deepEqual(computeRecentRange({
  start: DEFAULT_START,
  fullSnapshotEnd: '2026-10-01T00:00:00.000Z',
  lastSuccessfulEnd: '2026-10-02T18:00:00.000Z',
  now: '2026-10-03T00:00:00.000Z',
  overlapHours: 2,
}), {
  gte: '2026-10-02T16:00:00.000Z',
  lt: '2026-10-03T00:00:00.000Z',
});
console.log('ES5 to ES9 migration window tests passed');
