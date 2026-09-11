import assert from 'node:assert/strict';
import {
  isValidEs5WeeklyIndex,
  selectEs5SourceIndices,
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

console.log('ES5 weekly source-index selection tests passed');
