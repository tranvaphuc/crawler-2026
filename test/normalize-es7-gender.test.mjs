import test from 'node:test';
import assert from 'node:assert/strict';
import { deepClone } from '../scripts/lib/node_compat.mjs';
import { ensureIndex, searchSlice } from '../scripts/lib/master_migration_lib.mjs';
import { ensureEs5TargetIndex } from '../scripts/lib/es5_master_migration_lib.mjs';
import { INDEXES, QUERY, GENDER_MAP, SCRIPT, parseArgs, normalizeGenders } from '../scripts/normalize-es7-gender.mjs';

function fixture({ badMapping = false, conflict = false, partial = false, taskError = false } = {}) {
  const calls = { writes: [], searches: [], saved: [] };
  const changed = new Set();
  const client = {
    indices: { getMapping: async () => ({ body: Object.fromEntries(INDEXES.map((index) => [index, {
      mappings: { properties: { profile: { properties: { gender: { type: badMapping ? 'text' : 'keyword' } } } } },
    }])) }) },
    search: async ({ index, body }) => {
      calls.searches.push(index);
      assert.deepEqual(body.query, QUERY);
      const total = changed.has(index) && !conflict ? 0 : 2;
      return { body: {
        timed_out: partial,
        _shards: { failed: 0 },
        hits: { total: { value: total, relation: 'eq' } },
        aggregations: { genders: { buckets: total ? [{ key: 'nam', doc_count: 1 }, { key: 'nữ', doc_count: 1 }] : [] } },
      } };
    },
    updateByQuery: async (request, options) => {
      calls.writes.push(request);
      assert.deepEqual(options, { maxRetries: 0 });
      assert.ok(INDEXES.includes(request.index));
      assert.deepEqual(request.body.query, QUERY);
      assert.deepEqual(request.body.script.params.genders, GENDER_MAP);
      assert.equal(request.wait_for_completion, false);
      return { body: { task: request.index } };
    },
    tasks: { get: async ({ task_id }) => {
      if (taskError) throw new Error('Connection lost while polling');
      changed.add(task_id);
      return { body: { completed: true, response: { updated: 2, version_conflicts: conflict ? 1 : 0, failures: [] } } };
    } },
  };
  return { client, calls, save: async (report) => calls.saved.push(deepClone(report)) };
}

test('single-worker searches omit slice.max=1', () => {
  assert.deepEqual(searchSlice(0, 1), {});
  assert.deepEqual(searchSlice(0, 2), { slice: { id: 0, max: 2 } });
  assert.throws(() => searchSlice(1, 1), /Invalid slice id/);
  assert.throws(() => searchSlice(0, 0), /Invalid slice count/);
});

test('concurrent index creation treats already-exists as success', async () => {
  const calls = [];
  const request = async (method, requestPath) => {
    calls.push([method, requestPath]);
    if (method === 'HEAD') return { status: 404 };
    return {
      status: 400,
      body: {
        error: {
          type: 'resource_already_exists_exception',
          root_cause: [{ type: 'resource_already_exists_exception' }],
        },
      },
    };
  };
  assert.equal(await ensureIndex(request, 'master20240304'), false);
  assert.deepEqual(calls, [
    ['HEAD', '/master20240304'],
    ['PUT', '/master20240304'],
  ]);
});

test('ES5 target preparation is shared by concurrent slices', async () => {
  const calls = [];
  const request = async (method, requestPath) => {
    calls.push([method, requestPath]);
    await Promise.resolve();
    if (method === 'HEAD') return { status: 404 };
    return { status: 200, body: { acknowledged: true } };
  };
  await Promise.all(Array.from({ length: 4 }, () => ensureEs5TargetIndex(request, 'master20990101')));
  assert.equal(calls.filter(([method]) => method === 'HEAD').length, 1);
  assert.equal(calls.filter(([, requestPath]) => requestPath === '/master20990101').length, 2);
  assert.equal(calls.filter(([, requestPath]) => requestPath.endsWith('/_mapping')).length, 1);
});

test('default dry-run and explicit write confirmation required', () => {
  assert.equal(parseArgs([]).execute, false);
  assert.throws(() => parseArgs(['--execute']), /require/);
  assert.throws(() => parseArgs(['--indexes=*']), /Unknown/);
  assert.equal(parseArgs(['--execute', '--confirm=NORMALIZE_ES7_GENDER']).execute, true);
});

test('scope is exactly the two original labels and only gender is assigned', () => {
  assert.deepEqual(GENDER_MAP, { nam: 'male', 'nữ': 'female' });
  assert.deepEqual(QUERY, { terms: { 'profile.gender': ['nam', 'nữ'] } });
  assert.match(SCRIPT, /ctx\._source\.profile\.gender = params\.genders\.get\(gender\)/);
  assert.doesNotMatch(SCRIPT, /birthday|location|profile\s*=(?!=)/);
});

test('dry-run checks all five indexes and never writes', async () => {
  const f = fixture();
  const report = await normalizeGenders(f.client, {}, f.save, () => {});
  assert.equal(report.matchedDocuments, 10);
  assert.equal(report.status, 'complete');
  assert.deepEqual(f.calls.searches, INDEXES);
  assert.equal(f.calls.writes.length, 0);
});

test('mapping mismatch or partial search aborts before any writes', async () => {
  for (const settings of [{ badMapping: true }, { partial: true }]) {
    const f = fixture(settings);
    await assert.rejects(normalizeGenders(f.client, { execute: true }, f.save, () => {}));
    assert.equal(f.calls.writes.length, 0);
  }
});

test('execute records tasks, uses exact query, and verifies remaining documents', async () => {
  const f = fixture();
  const report = await normalizeGenders(f.client, { execute: true }, f.save, () => {});
  assert.equal(f.calls.writes.length, 5);
  assert.equal(report.status, 'complete');
  for (const index of INDEXES) {
    assert.equal(report.indexes[index].taskId, index);
    assert.equal(report.indexes[index].after.total, 0);
  }
});

test('conflicts and remaining documents are not reported as success', async () => {
  const f = fixture({ conflict: true });
  const report = await normalizeGenders(f.client, { execute: true }, f.save, () => {});
  assert.equal(report.status, 'needs-review');
});

test('polling failure retains task ID and does not resubmit', async () => {
  const f = fixture({ taskError: true });
  await assert.rejects(normalizeGenders(f.client, { execute: true }, f.save, () => {}), /Connection lost/);
  assert.equal(f.calls.writes.length, 1);
  const report = f.calls.saved.at(-1);
  assert.equal(report.status, 'interrupted-or-failed');
  assert.equal(report.indexes[INDEXES[0]].taskId, INDEXES[0]);
});
