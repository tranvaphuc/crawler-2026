import fs from 'node:fs/promises';
import path from 'node:path';
import {
  IGNORED_TYPES,
  acquireLock,
  bulkUpsert,
  ensureIndex,
  loadMigrationContext,
  requireSuccess,
  transformDocument,
} from './lib/master_migration_lib.mjs';

const sourceIndex = process.argv[2] || 'topic56fc9bc282ea19d067e5d8a1';
const reportDir = path.resolve(process.argv[3] || 'outputs/01a07164-8064-7313-962f-0d73887aa809/master-migration/recent-sync');
if (!/^topic[a-f0-9]+$/.test(sourceIndex)) throw new Error(`Unexpected source index: ${sourceIndex}`);

const unwrap = (response) => response?.body ?? response;
const lockPath = path.join(reportDir, 'recent-sync.lock');
const fullLockPath = path.join(path.dirname(reportDir), 'full', 'full-migration.lock');
const latestPath = path.join(reportDir, 'latest.json');

function log(event, values = {}) {
  process.stdout.write(`${JSON.stringify({ at: new Date().toISOString(), event, ...values })}\n`);
}

async function livePidFromLock(file) {
  try {
    const pid = Number((await fs.readFile(file, 'utf8')).trim());
    process.kill(pid, 0);
    return pid;
  } catch (error) {
    if (error.code === 'ENOENT') return undefined;
    if (error.code === 'ESRCH') { await fs.unlink(file).catch(() => {}); return undefined; }
    return undefined;
  }
}

async function writeReport(report) {
  await fs.mkdir(reportDir, { recursive: true });
  const temporary = `${latestPath}.${process.pid}.tmp`;
  await fs.writeFile(temporary, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  await fs.rename(temporary, latestPath);
}

await fs.mkdir(reportDir, { recursive: true });
const fullPid = await livePidFromLock(fullLockPath);
if (fullPid) {
  const report = { status: 'skipped', reason: 'full migration is running', full_migration_pid: fullPid, at: new Date().toISOString() };
  await writeReport(report);
  log('sync_skipped', report);
  process.exit(0);
}

const releaseLock = await acquireLock(lockPath);
const { es7, es8Request } = await loadMigrationContext();
let scrollId;
const startedAt = new Date().toISOString();
const summary = {
  source_index: sourceIndex,
  status: 'running',
  started_at: startedAt,
  source_query: {
    field: 'insertedDate',
    gte: 'now-2d',
    lte: 'now',
    excluded_types: IGNORED_TYPES,
  },
  scanned: 0,
  upserted: 0,
  skipped_same_version: 0,
  moved_between_daily_indices: 0,
  invalid_published_date: 0,
  affected_indices: [],
};

try {
  log('sync_started', { source_index: sourceIndex, inserted_date_window: 'now-2d..now' });
  let response = await es7.search({
    index: sourceIndex,
    scroll: '10m',
    version: true,
    body: {
      size: 8000,
      sort: [{ _doc: 'asc' }],
      query: {
        bool: {
          filter: [
            { range: { insertedDate: { gte: 'now-2d', lte: 'now' } } },
            { exists: { field: 'publishedDate' } },
          ],
          must_not: [{ terms: { type: IGNORED_TYPES } }],
        },
      },
    },
  });

  const affected = new Set();
  while (true) {
    const body = unwrap(response);
    scrollId = body._scroll_id;
    const hits = body.hits?.hits ?? [];
    if (!hits.length) break;
    summary.scanned += hits.length;

    const projected = [];
    for (const hit of hits) {
      try { projected.push(transformDocument(hit, sourceIndex, 'content-projector-recent-v1')); }
      catch (error) {
        if (String(error.message).startsWith('Invalid publishedDate')) { summary.invalid_published_date += 1; continue; }
        throw error;
      }
    }

    const ids = projected.map((item) => item.id);
    const existingById = new Map();
    if (ids.length) {
      const existingResponse = await es8Request('POST', '/master*/_search?allow_no_indices=true&ignore_unavailable=true', {
        size: Math.min(ids.length * 4, 10_000),
        track_total_hits: false,
        _source: ['source_document_version'],
        query: { ids: { values: ids } },
      });
      const existingBody = requireSuccess('find existing recent documents', existingResponse);
      for (const hit of existingBody.hits?.hits ?? []) {
        const rows = existingById.get(hit._id) ?? [];
        rows.push(hit);
        existingById.set(hit._id, rows);
      }
    }

    const upserts = [];
    for (const item of projected) {
      const existing = existingById.get(item.id) ?? [];
      const exact = existing.find((hit) => hit._index === item.index);
      const oldIndices = [...new Set(existing.filter((hit) => hit._index !== item.index).map((hit) => hit._index))];
      const sameVersion = exact && Number(exact._source?.source_document_version) === Number(item.source.source_document_version);
      if (sameVersion && oldIndices.length === 0) {
        summary.skipped_same_version += 1;
        continue;
      }
      if (oldIndices.length) {
        item.deleteFrom = oldIndices;
        summary.moved_between_daily_indices += 1;
        oldIndices.forEach((index) => affected.add(index));
      }
      upserts.push(item);
      affected.add(item.index);
    }

    for (const index of new Set(upserts.map((item) => item.index))) await ensureIndex(es8Request, index);
    const nextResponsePromise = es7.scroll({ scroll_id: scrollId, scroll: '10m' });
    if (upserts.length) {
      await bulkUpsert(es8Request, upserts, { chunkSize: 2000, concurrency: 4 });
      summary.upserted += upserts.length;
    }
    if (summary.scanned % 20_000 < hits.length) log('sync_progress', { scanned: summary.scanned, upserted: summary.upserted, skipped_same_version: summary.skipped_same_version });
    response = await nextResponsePromise;
  }

  for (const index of affected) requireSuccess(`refresh ${index}`, await es8Request('POST', `/${index}/_refresh`));
  summary.affected_indices = [...affected].sort();
  summary.status = 'complete';
  summary.completed_at = new Date().toISOString();
  await writeReport(summary);
  log('sync_completed', summary);
} catch (error) {
  summary.status = 'failed';
  summary.failed_at = new Date().toISOString();
  summary.error = error.stack ?? String(error);
  await writeReport(summary).catch(() => {});
  throw error;
} finally {
  if (scrollId) await es7.clearScroll({ scroll_id: scrollId }).catch(() => {});
  await releaseLock();
}
