import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import ES5ClientPkg from 'elasticsearch';
import {
  ES5_SOURCE_INDEX_SELECTION_VERSION,
  acquireLock,
  migrateEs5InsertedRange,
  selectEs5SourceIndices,
  writeJsonAtomic,
} from './lib/es5_master_migration_lib.mjs';
import {
  createEs9Request,
  deployMasterTemplateEs9,
  loadProjectEnv,
  requireSuccess,
} from './lib/es9_master_target.mjs';

export const DEFAULT_START = '2026-09-30T17:00:00.000Z'; // 2026-10-01 00:00:00 Asia/Ho_Chi_Minh
export const MIGRATION_VERSION = 'es5-to-es9-oct-2026-v1';
const DAY_MS = 24 * 60 * 60 * 1000;

export function makeWindows(startIso, endIso) {
  const start = new Date(startIso).getTime();
  const end = new Date(endIso).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end) || start >= end) {
    throw new Error(`Invalid migration range: ${startIso}..${endIso}`);
  }
  const windows = [];
  for (let cursor = start; cursor < end; cursor += DAY_MS) {
    const windowEnd = Math.min(cursor + DAY_MS, end);
    const gte = new Date(cursor).toISOString();
    const lt = new Date(windowEnd).toISOString();
    windows.push({ id: `${gte}__${lt}`, gte, lt });
  }
  return windows.reverse();
}

function log(event, values = {}) {
  process.stdout.write(`${JSON.stringify({ at: new Date().toISOString(), event, ...values })}\n`);
}

async function readState(statePath) {
  try { return JSON.parse(await fs.readFile(statePath, 'utf8')); }
  catch (error) { if (error.code === 'ENOENT') return undefined; throw error; }
}

function hasFlag(flag) { return process.argv.slice(2).includes(flag); }
function positionalArgs() { return process.argv.slice(2).filter((value) => !value.startsWith('--')); }

async function listSourceIndices(es5, reportRoot) {
  const rows = await es5.cat.indices({
    index: 'master*',
    format: 'json',
    h: 'index,status,docs.count,store.size',
    requestTimeout: 120_000,
  });
  const indices = selectEs5SourceIndices(rows);
  await writeJsonAtomic(path.join(reportRoot, 'source-indices.json'), {
    source: 'ES5',
    naming: 'masterYYYYWW',
    captured_at: new Date().toISOString(),
    count: indices.length,
    indices,
  });
  return indices;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const env = await loadProjectEnv();
  if (!env.ES5_HOST) throw new Error('Missing ES5_HOST in .env');
  const start = env.ES5_TO_ES9_START || DEFAULT_START;
  const planOnly = hasFlag('--plan');
  const es5RequestTimeout = Number(env.ES5_REQUEST_TIMEOUT_MS || 300_000);
  const es5MaxRetries = Number(env.ES5_MAX_RETRIES || 3);
  log('startup', {
    mode: planOnly ? 'plan' : 'migrate',
    start,
    pid: process.pid,
    es5_host: new URL(env.ES5_HOST).host,
    es9_target: `${env.ES9_HOST}:${env.ES9_PORT}`,
    es5_request_timeout_ms: es5RequestTimeout,
    es5_max_retries: es5MaxRetries,
  });
  const ES5Client = ES5ClientPkg.Client || ES5ClientPkg;
  const es5 = new ES5Client({
    host: env.ES5_HOST,
    log: 'error',
    requestTimeout: es5RequestTimeout,
    maxRetries: es5MaxRetries,
    keepAlive: true,
  });
  const es9Request = createEs9Request(env);
  const [outputArg] = positionalArgs();
  const reportRoot = path.resolve(outputArg || 'outputs/01a07164-8064-7313-962f-0d73887aa809/es5-to-es9/oct-2026-migration');
  const statePath = path.join(reportRoot, 'full-state.json');
  const lockPath = path.join(reportRoot, 'es5-to-es9.lock');

  await fs.mkdir(reportRoot, { recursive: true });
  log('template_deploy_started');
  const template = await deployMasterTemplateEs9({ env, es9Request });
  log('template_deploy_completed', { cluster_name: template.cluster_name, version: template.version });
  log('source_indices_started');
  const sourceIndices = await listSourceIndices(es5, reportRoot);
  log('source_indices_completed', { source_indices: sourceIndices.length });
  if (!sourceIndices.length) throw new Error('No active ES5 weekly master indices found');

  if (planOnly) {
    const snapshotEnd = new Date().toISOString();
    const count = await es5.count({
      index: sourceIndices.join(','),
      body: {
        query: {
          bool: {
            filter: [
              { range: { insertedDate: { gte: start, lt: snapshotEnd } } },
              { exists: { field: 'publishedDate' } },
            ],
            must_not: [{ terms: { _type: ['fbEventTopic', 'fbEventComment'] } }],
          },
        },
      },
    });
    log('plan', {
      start,
      start_vietnam: '2026-10-01T00:00:00+07:00',
      snapshot_end: snapshotEnd,
      matching_documents: count.count,
      source_indices: sourceIndices.length,
      windows: makeWindows(start, snapshotEnd).length,
      target: `${env.ES9_HOST}:${env.ES9_PORT}`,
      template,
    });
    process.exit(0);
  }

  const releaseLock = await acquireLock(lockPath);
  try {
    const prior = await readState(statePath);
    const canResume = prior?.migration_version === MIGRATION_VERSION
      && prior?.source_index_selection_version === ES5_SOURCE_INDEX_SELECTION_VERSION
      && prior?.start === start;
    if (prior?.status === 'complete' && canResume) {
      log('already_complete', {
        state_path: statePath,
        total_upserted: prior.total_upserted,
        snapshot_end: prior.snapshot_end,
      });
      process.exitCode = 0;
    } else {
      const snapshotEnd = canResume && prior?.snapshot_end ? prior.snapshot_end : new Date().toISOString();
      const windows = makeWindows(start, snapshotEnd);
      const completed = new Set(canResume ? (prior?.completed_windows ?? []) : []);
      const state = {
        migration_version: MIGRATION_VERSION,
        source: 'ES5 master weekly indices',
        target: 'Elasticsearch 9 masterYYYYMMDD',
        status: 'running',
        source_index_selection_version: ES5_SOURCE_INDEX_SELECTION_VERSION,
        query_field: 'insertedDate',
        start,
        start_vietnam: '2026-10-01T00:00:00+07:00',
        snapshot_end: snapshotEnd,
        source_indices: sourceIndices,
        source_index_count: sourceIndices.length,
        windows_total: windows.length,
        completed_windows: [...completed],
        per_window: canResume ? (prior?.per_window ?? {}) : {},
        total_scanned: canResume ? (prior?.total_scanned ?? 0) : 0,
        total_upserted: canResume ? (prior?.total_upserted ?? 0) : 0,
        total_invalid_published_date: canResume ? (prior?.total_invalid_published_date ?? 0) : 0,
        started_at: canResume ? prior.started_at : new Date().toISOString(),
        resumed_at: canResume ? new Date().toISOString() : undefined,
        template,
      };
      await writeJsonAtomic(statePath, state);
      log('migration_started', {
        start,
        snapshot_end: snapshotEnd,
        source_indices: sourceIndices.length,
        windows_total: windows.length,
        completed_windows: completed.size,
      });

      for (let ordinal = 0; ordinal < windows.length; ordinal += 1) {
        const window = windows[ordinal];
        if (completed.has(window.id)) continue;
        const startedAt = new Date().toISOString();
        let nextProgress = 20_000;
        log('window_started', { ...window, ordinal: ordinal + 1, windows_total: windows.length });
        const stats = await migrateEs5InsertedRange({
          es5,
          es8Request: es9Request,
          sourceIndices,
          gte: window.gte,
          lt: window.lt,
          slices: Number(env.ES5_TO_ES9_SLICES || 4),
          sourceIndexBatchSize: Number(env.ES5_SOURCE_INDEX_BATCH_SIZE || 32),
          maxDocuments: env.ES5_TO_ES9_MAX_DOCS_PER_WINDOW
            ? Number(env.ES5_TO_ES9_MAX_DOCS_PER_WINDOW)
            : undefined,
          projectionVersion: MIGRATION_VERSION,
          onProgress: (progress) => {
            if (progress.scanned >= nextProgress) {
              log('window_progress', {
                window: window.id,
                scanned: progress.scanned,
                upserted: progress.upserted,
                invalid_published_date: progress.invalid_published_date,
              });
              while (progress.scanned >= nextProgress) nextProgress += 20_000;
            }
          },
          onSourceBatch: (progress) => log('source_batch_completed', {
            window: window.id,
            ...progress,
          }),
        });
        for (const index of stats.affected_indices) {
          requireSuccess(`refresh ${index}`, await es9Request('POST', `/${encodeURIComponent(index)}/_refresh`));
        }
        completed.add(window.id);
        state.completed_windows = [...completed];
        state.per_window[window.id] = { ...window, ...stats, started_at: startedAt, completed_at: new Date().toISOString() };
        state.total_scanned += stats.scanned;
        state.total_upserted += stats.upserted;
        state.total_invalid_published_date += stats.invalid_published_date;
        state.updated_at = new Date().toISOString();
        await writeJsonAtomic(statePath, state);
        log('window_completed', {
          window: window.id,
          scanned: stats.scanned,
          upserted: stats.upserted,
          affected_indices: stats.affected_indices,
          completed_windows: completed.size,
          windows_total: windows.length,
        });
      }

      state.status = 'complete';
      state.completed_at = new Date().toISOString();
      state.updated_at = state.completed_at;
      state.cluster_health = requireSuccess('ES9 cluster health', await es9Request('GET', '/_cluster/health'));
      await writeJsonAtomic(statePath, state);
      log('migration_completed', {
        total_scanned: state.total_scanned,
        total_upserted: state.total_upserted,
        completed_windows: completed.size,
        state_path: statePath,
      });
    }
  } catch (error) {
    const state = await readState(statePath);
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
}
