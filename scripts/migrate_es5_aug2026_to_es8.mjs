import fs from 'node:fs/promises';
import path from 'node:path';
import {
  ES5_FULL_START,
  ES5_SOURCE_INDEX_SELECTION_VERSION,
  acquireLock,
  listEs5SourceIndices,
  loadEs5MigrationContext,
  migrateEs5InsertedRange,
  writeJsonAtomic,
} from './lib/es5_master_migration_lib.mjs';
import { requireSuccess } from './lib/master_migration_lib.mjs';

const reportRoot = path.resolve(process.argv[2] || 'outputs/01a07164-8064-7313-962f-0d73887aa809/es5-to-es8/migration');
const statePath = path.join(reportRoot, 'full-state.json');
const lockPath = path.join(reportRoot, 'es5-migration.lock');
const DAY_MS = 24 * 60 * 60 * 1000;

function log(event, values = {}) {
  process.stdout.write(`${JSON.stringify({ at: new Date().toISOString(), event, ...values })}\n`);
}

async function readState() {
  try { return JSON.parse(await fs.readFile(statePath, 'utf8')); }
  catch (error) { if (error.code === 'ENOENT') return undefined; throw error; }
}

function makeWindows(startIso, endIso) {
  const start = new Date(startIso).getTime();
  const end = new Date(endIso).getTime();
  const windows = [];
  for (let cursor = start; cursor < end; cursor += DAY_MS) {
    const windowEnd = Math.min(cursor + DAY_MS, end);
    const gte = new Date(cursor).toISOString();
    const lt = new Date(windowEnd).toISOString();
    windows.push({ id: `${gte}__${lt}`, gte, lt });
  }
  return windows.reverse();
}

await fs.mkdir(reportRoot, { recursive: true });
const releaseLock = await acquireLock(lockPath);
const { es5, es8Request } = await loadEs5MigrationContext();
try {
  const prior = await readState();
  const canResumePrior = prior?.source_index_selection_version === ES5_SOURCE_INDEX_SELECTION_VERSION;
  if (prior?.status === 'complete' && canResumePrior) {
    log('already_complete', { state_path: statePath, upserted: prior.total_upserted, completed_windows: prior.completed_windows?.length });
    process.exitCode = 0;
  } else {
    const snapshotEnd = canResumePrior && prior?.snapshot_end ? prior.snapshot_end : new Date().toISOString();
    const sourceIndices = await listEs5SourceIndices(es5);
    if (!sourceIndices.length) throw new Error('No active ES5 weekly source indices found');
    const windows = makeWindows(ES5_FULL_START, snapshotEnd);
    const completed = new Set(canResumePrior ? (prior?.completed_windows ?? []) : []);
    if (prior && !canResumePrior) {
      log('checkpoint_reset', {
        reason: 'source index selection changed to weekly shards',
        previous_version: prior.source_index_selection_version ?? null,
        current_version: ES5_SOURCE_INDEX_SELECTION_VERSION,
      });
    }
    const state = {
      status: 'running',
      source: 'ES5 master weekly indices',
      source_index_selection_version: ES5_SOURCE_INDEX_SELECTION_VERSION,
      query_field: 'insertedDate',
      start: ES5_FULL_START,
      start_vietnam: '2026-08-01T00:00:00+07:00',
      snapshot_end: snapshotEnd,
      source_indices: sourceIndices,
      source_index_count: sourceIndices.length,
      windows_total: windows.length,
      completed_windows: [...completed],
      per_window: canResumePrior ? (prior?.per_window ?? {}) : {},
      total_scanned: canResumePrior ? (prior?.total_scanned ?? 0) : 0,
      total_upserted: canResumePrior ? (prior?.total_upserted ?? 0) : 0,
      total_invalid_published_date: canResumePrior ? (prior?.total_invalid_published_date ?? 0) : 0,
      started_at: canResumePrior ? prior.started_at : new Date().toISOString(),
      resumed_at: canResumePrior ? new Date().toISOString() : undefined,
      restarted_at: prior && !canResumePrior ? new Date().toISOString() : undefined,
    };
    await writeJsonAtomic(statePath, state);
    log('full_started', { start: ES5_FULL_START, snapshot_end: snapshotEnd, source_indices: sourceIndices.length, windows_total: windows.length, completed_windows: completed.size });

    for (let ordinal = 0; ordinal < windows.length; ordinal += 1) {
      const window = windows[ordinal];
      if (completed.has(window.id)) continue;
      let nextProgress = 20_000;
      const startedAt = new Date().toISOString();
      log('window_started', { ...window, ordinal: ordinal + 1, windows_total: windows.length });
      const stats = await migrateEs5InsertedRange({
        es5,
        es8Request,
        sourceIndices,
        gte: window.gte,
        lt: window.lt,
        slices: 4,
        projectionVersion: 'content-projector-es5-full-v1',
        onProgress: (progress) => {
          if (progress.scanned >= nextProgress) {
            log('window_progress', { window: window.id, scanned: progress.scanned, upserted: progress.upserted, invalid_published_date: progress.invalid_published_date });
            while (progress.scanned >= nextProgress) nextProgress += 20_000;
          }
        },
      });
      for (const index of stats.affected_indices) requireSuccess(`refresh ${index}`, await es8Request('POST', `/${encodeURIComponent(index)}/_refresh`));
      completed.add(window.id);
      state.completed_windows = [...completed];
      state.per_window[window.id] = { ...window, ...stats, started_at: startedAt, completed_at: new Date().toISOString() };
      state.total_scanned += stats.scanned;
      state.total_upserted += stats.upserted;
      state.total_invalid_published_date += stats.invalid_published_date;
      state.updated_at = new Date().toISOString();
      await writeJsonAtomic(statePath, state);
      log('window_completed', { window: window.id, scanned: stats.scanned, upserted: stats.upserted, affected_indices: stats.affected_indices.length, completed_windows: completed.size, windows_total: windows.length });
    }

    state.status = 'complete';
    state.completed_at = new Date().toISOString();
    state.updated_at = state.completed_at;
    await writeJsonAtomic(statePath, state);
    log('full_completed', { total_scanned: state.total_scanned, total_upserted: state.total_upserted, completed_windows: completed.size, state_path: statePath });
  }
} catch (error) {
  const state = await readState();
  if (state) {
    state.status = 'failed';
    state.failed_at = new Date().toISOString();
    state.error = error.stack ?? String(error);
    await writeJsonAtomic(statePath, state).catch(() => {});
  }
  throw error;
} finally {
  await releaseLock();
}
