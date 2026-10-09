import assert from 'node:assert/strict';
import {
  isValidEs5WeeklyIndex,
  selectEs5SourceIndices,
  transformEs5Hit,
} from '../scripts/lib/es5_master_migration_lib.mjs';

assert.equal(isValidEs5WeeklyIndex('master202601'), true);
assert.equal(isValidEs5WeeklyIndex('master202636'), true);
assert.equal(isValidEs5WeeklyIndex('master202637'), true);
assert.equal(isValidEs5WeeklyIndex('master202653'), true);
assert.equal(isValidEs5WeeklyIndex('master202600'), false);
assert.equal(isValidEs5WeeklyIndex('master202654'), false);
assert.equal(isValidEs5WeeklyIndex('master20260901'), false);
assert.equal(isValidEs5WeeklyIndex('master999929'), false);
assert.equal(isValidEs5WeeklyIndex('topic202637'), false);

assert.deepEqual(selectEs5SourceIndices([
  { index: 'master202612', status: 'open' },
  { index: 'master202636', status: 'open' },
  { index: 'master202637', status: 'open' },
  { index: 'master202638', status: 'close' },
  { index: 'master202654', status: 'open' },
  { index: 'topic202637', status: 'open' },
]), [
  'master202637',
  'master202636',
  'master202612',
]);

const transformed = transformEs5Hit({
  _index: 'master202641',
  _type: 'fbPageTopic',
  _id: 'routing-test',
  _version: 1,
  _source: {
    publishedDate: '2023-12-11T12:00:00.000Z',
    insertedDate: '2026-10-09T04:00:00.000Z',
    content: 'routing test',
  },
});
assert.equal(transformed.index, 'master20231211');
assert.equal(transformed.upsert.published_at, '2023-12-11T12:00:00.000Z');
assert.equal(transformed.upsert.collected_at, '2026-10-09T04:00:00.000Z');

console.log('ES5 weekly source-index selection tests passed');
