import fs from 'node:fs/promises';
import path from 'node:path';
import {
  ES5_FULL_START,
  acquireLock,
  listEs5SourceIndices,
  loadEs5MigrationContext,
  migrateEs5InsertedRange,
  writeJsonAtomic,
} from './lib/es5_master_migration_lib.mjs';
import { requireSuccess } from './lib/master_migration_lib.mjs';

const reportRoot = path.resolve(process.argv[2] || 'outputs/01a07164-8064-7313-962f-0d73887aa809/es5-to-es8/migration');
const recentDir = path.join(reportRoot, 'recent-6h');
const latestPath = path.join(recentDir, 'latest.json');
const lockPath = path.join(reportRoot, 'es5-migration.lock');
const SIX_HOURS_MS = 6 * 60 * 60 * 1000;

function log(event, values = {}) {
  process.stdout.write(`${JSON.stringify({ at: new Date().toISOString(), event, ...values })}\n`);
}

await fs.mkdir(recentDir, { recursive: true });
let releaseLock;
try {
  releaseLock = await acquireLock(lockPath);
} catch (error) {
  if (!String(error.message).startsWith('Migration already running with PID')) throw error;
  const report = { status: 'skipped', reason: error.message, at: new Date().toISOString() };
  await writeJsonAtomic(latestPath, report);
  log('recent_sync_skipped', report);
  process.exit(0);
}

const { es5, es8Request } = await loadEs5MigrationContext();
const endedAt = new Date();
const lowerBound = Math.max(new Date(ES5_FULL_START).getTime(), endedAt.getTime() - SIX_HOURS_MS);
const gte = new Date(lowerBound).toISOString();
const lt = endedAt.toISOString();
const report = {
  status: 'running',
  source: 'ES5 master monthly indices',
  query: { field: 'insertedDate', gte, lt, maximum_lookback_hours: 6 },
  started_at: new Date().toISOString(),
};

try {
  const sourceIndices = await listEs5SourceIndices(es5);
  report.source_index_count = sourceIndices.length;
  log('recent_sync_started', { gte, lt, source_indices: sourceIndices.length });
  let nextProgress = 20_000;
  const stats = await migrateEs5InsertedRange({
    es5,
    es8Request,
    sourceIndices,
    gte,
    lt,
    slices: 4,
    projectionVersion: 'content-projector-es5-recent-6h-v1',
    onProgress: (progress) => {
      if (progress.scanned >= nextProgress) {
        log('recent_sync_progress', { scanned: progress.scanned, upserted: progress.upserted, invalid_published_date: progress.invalid_published_date });
        while (progress.scanned >= nextProgress) nextProgress += 20_000;
      }
    },
  });
  for (const index of stats.affected_indices) requireSuccess(`refresh ${index}`, await es8Request('POST', `/${encodeURIComponent(index)}/_refresh`));
  Object.assign(report, stats, { status: 'complete', completed_at: new Date().toISOString() });
  await writeJsonAtomic(latestPath, report);
  log('recent_sync_completed', { scanned: stats.scanned, upserted: stats.upserted, affected_indices: stats.affected_indices.length, report: latestPath });
} catch (error) {
  report.status = 'failed';
  report.failed_at = new Date().toISOString();
  report.error = error.stack ?? String(error);
  await writeJsonAtomic(latestPath, report).catch(() => {});
  throw error;
} finally {
  if (releaseLock) await releaseLock();
}
