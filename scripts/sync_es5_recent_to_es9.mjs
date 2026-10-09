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
import { DEFAULT_START, MIGRATION_VERSION } from './migrate_es5_oct2026_to_es9.mjs';

export function computeRecentRange({ start, fullSnapshotEnd, lastSuccessfulEnd, now, overlapHours }) {
  const minimum = new Date(start).getTime();
  const cursor = new Date(lastSuccessfulEnd || fullSnapshotEnd).getTime();
  const end = new Date(now).getTime();
  const overlapMs = Number(overlapHours) * 60 * 60 * 1000;
  if (![minimum, cursor, end, overlapMs].every(Number.isFinite) || overlapMs < 0 || end <= minimum) {
    throw new Error('Invalid incremental migration range inputs');
  }
  return {
    gte: new Date(Math.max(minimum, cursor - overlapMs)).toISOString(),
    lt: new Date(end).toISOString(),
  };
}

function log(event, values = {}) {
  process.stdout.write(`${JSON.stringify({ at: new Date().toISOString(), event, ...values })}\n`);
}

function debugStep(step, message, values = {}) {
  console.log(`[ES5-TO-ES9][RECENT STEP ${step}] ${message} ${JSON.stringify(values)}`);
}

async function readJson(file) {
  try { return JSON.parse(await fs.readFile(file, 'utf8')); }
  catch (error) { if (error.code === 'ENOENT') return undefined; throw error; }
}

async function listSourceIndices(es5, outputFile) {
  const rows = await es5.cat.indices({
    index: 'master*',
    format: 'json',
    h: 'index,status,docs.count,store.size',
    requestTimeout: 120_000,
  });
  const indices = selectEs5SourceIndices(rows);
  await writeJsonAtomic(outputFile, {
    source: 'ES5',
    naming: 'masterYYYYWW',
    captured_at: new Date().toISOString(),
    count: indices.length,
    indices,
  });
  return indices;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  debugStep('00', 'recent sync module loaded', { pid: process.pid, cwd: process.cwd(), node: process.version });
  debugStep('01', 'loading .env');
  const env = await loadProjectEnv();
  debugStep('02', '.env loaded', {
    has_es5_host: Boolean(env.ES5_HOST),
    has_es9_host: Boolean(env.ES9_HOST),
    has_es9_user: Boolean(env.ES9_USER),
    has_es9_pass: Boolean(env.ES9_PASS),
  });
  if (!env.ES5_HOST) throw new Error('Missing ES5_HOST in .env');
  const reportRoot = path.resolve(
    process.argv[2] || 'outputs/01a07164-8064-7313-962f-0d73887aa809/es5-to-es9/oct-2026-migration',
  );
  const recentDir = path.join(reportRoot, 'recent-sync');
  const fullStatePath = path.join(reportRoot, 'full-state.json');
  const cursorPath = path.join(recentDir, 'cursor.json');
  const latestPath = path.join(recentDir, 'latest.json');
  const lockPath = path.join(reportRoot, 'es5-to-es9.lock');
  const start = env.ES5_TO_ES9_START || DEFAULT_START;
  const overlapHours = Number(env.ES5_TO_ES9_RECENT_OVERLAP_HOURS || 2);
  const slices = Number(env.ES5_TO_ES9_RECENT_SLICES || env.ES5_TO_ES9_SLICES || 4);

  debugStep('03', 'runtime paths resolved', { report_root: reportRoot, full_state_path: fullStatePath, latest_path: latestPath });
  await fs.mkdir(recentDir, { recursive: true });
  let releaseLock;
  try {
    debugStep('04', 'acquiring shared migration lock', { lock_path: lockPath });
    releaseLock = await acquireLock(lockPath);
    debugStep('05', 'shared migration lock acquired');
  } catch (error) {
    if (!String(error.message).startsWith('Migration already running with PID')) throw error;
    const skipped = { status: 'skipped', reason: 'full or incremental migration currently owns the shared lock', detail: error.message, at: new Date().toISOString() };
    await writeJsonAtomic(latestPath, skipped);
    log('recent_sync_skipped', skipped);
    process.exit(0);
  }

  const report = { status: 'running', started_at: new Date().toISOString() };
  try {
    const fullState = await readJson(fullStatePath);
    debugStep('06', 'full migration checkpoint read', { status: fullState?.status ?? 'missing' });
    if (fullState?.status !== 'complete'
      || fullState?.migration_version !== MIGRATION_VERSION
      || fullState?.start !== start) {
      const skipped = {
        status: 'skipped',
        reason: 'full ES5 to ES9 migration is not complete',
        full_status: fullState?.status ?? 'missing',
        at: new Date().toISOString(),
      };
      await writeJsonAtomic(latestPath, skipped);
      log('recent_sync_skipped', skipped);
      process.exitCode = 0;
    } else {
      const cursor = await readJson(cursorPath);
      const range = computeRecentRange({
        start,
        fullSnapshotEnd: fullState.snapshot_end,
        lastSuccessfulEnd: cursor?.last_successful_end,
        now: new Date().toISOString(),
        overlapHours,
      });
      const ES5Client = ES5ClientPkg.Client || ES5ClientPkg;
      debugStep('07', 'creating ES5 and ES9 clients', { gte: range.gte, lt: range.lt, slices });
      const es5 = new ES5Client({
        host: env.ES5_HOST,
        log: 'error',
        requestTimeout: Number(env.ES5_REQUEST_TIMEOUT_MS || 300_000),
        maxRetries: Number(env.ES5_MAX_RETRIES || 3),
        keepAlive: true,
      });
      const es9Request = createEs9Request(env);
      debugStep('08', 'deploying ES9 templates');
      const template = await deployMasterTemplateEs9({ env, es9Request });
      debugStep('09', 'listing ES5 source indices');
      const sourceIndices = await listSourceIndices(es5, path.join(recentDir, 'source-indices.json'));
      debugStep('10', 'ES5 source indices listed', { count: sourceIndices.length });
      if (!sourceIndices.length) throw new Error('No active ES5 weekly master indices found');

      Object.assign(report, {
        source: 'ES5 master weekly indices',
        target: 'Elasticsearch 9 masterYYYYMMDD',
        source_index_selection_version: ES5_SOURCE_INDEX_SELECTION_VERSION,
        migration_version: MIGRATION_VERSION,
        query: { field: 'insertedDate', ...range, overlap_hours: overlapHours },
        source_index_count: sourceIndices.length,
        template,
      });
      await writeJsonAtomic(latestPath, report);
      log('recent_sync_started', { ...range, overlap_hours: overlapHours, source_indices: sourceIndices.length });

      let nextProgress = 20_000;
      const stats = await migrateEs5InsertedRange({
        es5,
        es8Request: es9Request,
        sourceIndices,
        gte: range.gte,
        lt: range.lt,
        slices,
        sourceIndexBatchSize: Number(env.ES5_SOURCE_INDEX_BATCH_SIZE || 32),
        projectionVersion: 'es5-to-es9-incremental-v1',
        onProgress: (progress) => {
          if (progress.scanned >= nextProgress) {
            log('recent_sync_progress', {
              scanned: progress.scanned,
              upserted: progress.upserted,
              invalid_published_date: progress.invalid_published_date,
            });
            while (progress.scanned >= nextProgress) nextProgress += 20_000;
          }
        },
        onSourceBatchStarted: (progress) => debugStep('11A', 'source batch started', progress),
        onSourceBatch: (progress) => debugStep('11B', 'source batch completed', progress),
        onSourceBatchError: (progress) => console.error(`[ES5-TO-ES9][RECENT STEP 11X] source batch failed ${JSON.stringify(progress)}`),
      });
      debugStep('12', 'refreshing affected ES9 indices', { indices: stats.affected_indices.length });
      for (const index of stats.affected_indices) {
        requireSuccess(`refresh ${index}`, await es9Request('POST', `/${encodeURIComponent(index)}/_refresh`));
      }

      Object.assign(report, stats, { status: 'complete', completed_at: new Date().toISOString() });
      await writeJsonAtomic(latestPath, report);
      await writeJsonAtomic(cursorPath, {
        migration_version: MIGRATION_VERSION,
        last_successful_end: range.lt,
        overlap_hours: overlapHours,
        last_run_completed_at: report.completed_at,
      });
      log('recent_sync_completed', {
        scanned: stats.scanned,
        upserted: stats.upserted,
        affected_indices: stats.affected_indices,
        cursor: range.lt,
      });
    }
  } catch (error) {
    Object.assign(report, { status: 'failed', failed_at: new Date().toISOString(), error: error.stack ?? String(error) });
    await writeJsonAtomic(latestPath, report).catch(() => {});
    throw error;
  } finally {
    if (releaseLock) await releaseLock();
  }
}
