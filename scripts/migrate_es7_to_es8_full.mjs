import fs from 'node:fs/promises';
import path from 'node:path';
import {
  IGNORED_TYPES,
  ROUTING_TIMEZONE,
  acquireLock,
  bulkUpsert,
  ensureIndex,
  loadMigrationContext,
  requireSuccess,
  searchSlice,
  transformDocument,
  utcBoundsForVietnamDay,
} from './lib/master_migration_lib.mjs';

const sourceIndex = process.argv[2] || 'topic56fc9bc282ea19d067e5d8a1';
const stateDir = path.resolve(process.argv[3] || 'outputs/01a07164-8064-7313-962f-0d73887aa809/master-migration/full');
if (!/^topic[a-f0-9]+$/.test(sourceIndex)) throw new Error(`Unexpected source index: ${sourceIndex}`);

const statePath = path.join(stateDir, 'full-migration-state.json');
const lockPath = path.join(stateDir, 'full-migration.lock');
const unwrap = (response) => response?.body ?? response;

async function writeJsonAtomic(file, value) {
  const temporary = `${file}.${process.pid}.tmp`;
  await fs.writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  await fs.rename(temporary, file);
}

async function readState() {
  try { return JSON.parse(await fs.readFile(statePath, 'utf8')); }
  catch (error) { if (error.code === 'ENOENT') return undefined; throw error; }
}

function log(event, values = {}) {
  process.stdout.write(`${JSON.stringify({ at: new Date().toISOString(), event, ...values })}\n`);
}

await fs.mkdir(stateDir, { recursive: true });
const releaseLock = await acquireLock(lockPath);
const { es7, es8Request } = await loadMigrationContext();

try {
  const histogramResponse = await es7.search({
    index: sourceIndex,
    body: {
      size: 0,
      query: {
        bool: {
          filter: [{ exists: { field: 'publishedDate' } }],
          must_not: [{ terms: { type: IGNORED_TYPES } }],
        },
      },
      aggs: {
        days: {
          date_histogram: {
            field: 'publishedDate',
            calendar_interval: 'day',
            time_zone: ROUTING_TIMEZONE,
            format: 'yyyyMMdd',
            min_doc_count: 1,
          },
        },
      },
    },
  });
  const buckets = (unwrap(histogramResponse).aggregations?.days?.buckets ?? [])
    .map((bucket) => ({ day: bucket.key_as_string, snapshot_count: bucket.doc_count }))
    .sort((a, b) => b.day.localeCompare(a.day));
  if (!buckets.length) throw new Error('No source documents with a valid publishedDate');

  const prior = await readState();
  const completedDays = new Set(prior?.completed_days ?? []);
  const state = {
    source_index: sourceIndex,
    routing_timezone: ROUTING_TIMEZONE,
    status: 'running',
    started_at: prior?.started_at ?? new Date().toISOString(),
    last_resumed_at: prior ? new Date().toISOString() : undefined,
    snapshot_at: new Date().toISOString(),
    snapshot_documents: buckets.reduce((sum, item) => sum + item.snapshot_count, 0),
    days_total: buckets.length,
    completed_days: [...completedDays],
    per_day: prior?.per_day ?? {},
    total_upserts: prior?.total_upserts ?? 0,
  };
  await writeJsonAtomic(statePath, state);
  log('migration_started', { snapshot_documents: state.snapshot_documents, days_total: buckets.length, completed_days: completedDays.size, newest_day: buckets[0].day, oldest_day: buckets.at(-1).day });

  for (let position = 0; position < buckets.length; position += 1) {
    const { day, snapshot_count: snapshotCount } = buckets[position];
    if (completedDays.has(day)) continue;
    const targetIndex = `master${day}`;
    const bounds = utcBoundsForVietnamDay(day);
    await ensureIndex(es8Request, targetIndex);
    requireSuccess(`optimize ingest ${targetIndex}`, await es8Request('PUT', `/${targetIndex}/_settings`, {
      index: {
        refresh_interval: '-1',
        translog: { durability: 'async', sync_interval: '30s' },
      },
    }));

    let processed = 0;
    let batches = 0;
    let nextProgressLog = 20_000;
    const sliceCount = snapshotCount >= 20_000 ? 4 : (snapshotCount >= 4_000 ? 2 : 1);
    const dayStartedAt = new Date().toISOString();
    log('day_started', { day, target_index: targetIndex, snapshot_count: snapshotCount, slices: sliceCount, ordinal: position + 1, days_total: buckets.length });
    try {
      async function migrateSlice(sliceId) {
        let localScrollId;
        try {
          let response = await es7.search({
            index: sourceIndex,
            scroll: '10m',
            version: true,
            body: {
              size: 2000,
              ...searchSlice(sliceId, sliceCount),
              sort: [{ _doc: 'asc' }],
              query: {
                bool: {
                  filter: [{ range: { publishedDate: bounds } }],
                  must_not: [{ terms: { type: IGNORED_TYPES } }],
                },
              },
            },
          });

          while (true) {
            const body = unwrap(response);
            localScrollId = body._scroll_id;
            const hits = body.hits?.hits ?? [];
            if (!hits.length) break;
            const items = hits.map((hit) => transformDocument(hit, sourceIndex, 'content-projector-full-v1'));
            for (const item of items) {
              if (item.index !== targetIndex) throw new Error(`Routing mismatch on ${day}: ${item.id} -> ${item.index}`);
            }
            const [, nextResponse] = await Promise.all([
              bulkUpsert(es8Request, items, { chunkSize: 1000, concurrency: 2 }),
              es7.scroll({ scroll_id: localScrollId, scroll: '10m' }),
            ]);
            processed += hits.length;
            batches += 1;
            if (processed >= nextProgressLog) {
              log('day_progress', { day, processed, snapshot_count: snapshotCount, batches, slices: sliceCount });
              while (processed >= nextProgressLog) nextProgressLog += 20_000;
            }
            response = nextResponse;
          }
        } finally {
          if (localScrollId) await es7.clearScroll({ scroll_id: localScrollId }).catch(() => {});
        }
      }

      await Promise.all(Array.from({ length: sliceCount }, (_, sliceId) => migrateSlice(sliceId)));
    } finally {
      requireSuccess(`restore durable settings ${targetIndex}`, await es8Request('PUT', `/${targetIndex}/_settings`, {
        index: {
          refresh_interval: '30s',
          translog: { durability: 'request', sync_interval: '5s' },
        },
      }));
      requireSuccess(`refresh ${targetIndex}`, await es8Request('POST', `/${targetIndex}/_refresh`));
    }

    const targetCount = requireSuccess(`count ${targetIndex}`, await es8Request('GET', `/${targetIndex}/_count`)).count;
    if (targetCount < processed) throw new Error(`${targetIndex} has ${targetCount} docs after ${processed} upserts`);

    completedDays.add(day);
    state.completed_days = [...completedDays];
    state.per_day[day] = {
      target_index: targetIndex,
      snapshot_count: snapshotCount,
      processed,
      target_count: targetCount,
      started_at: dayStartedAt,
      completed_at: new Date().toISOString(),
    };
    state.total_upserts += processed;
    state.last_completed_day = day;
    state.updated_at = new Date().toISOString();
    await writeJsonAtomic(statePath, state);
    log('day_completed', { day, processed, snapshot_count: snapshotCount, target_count: targetCount, completed_days: completedDays.size, days_total: buckets.length });

    if (completedDays.size % 100 === 0) {
      const health = requireSuccess('cluster health', await es8Request('GET', '/_cluster/health'));
      if (health.status === 'red') throw new Error('ES8 cluster health is red; stopped safely at a daily checkpoint');
      log('cluster_checkpoint', { status: health.status, indices: health.indices, active_shards: health.active_shards });
    }
  }

  state.status = 'complete';
  state.completed_at = new Date().toISOString();
  state.completed_days = [...completedDays];
  state.updated_at = state.completed_at;
  await writeJsonAtomic(statePath, state);
  log('migration_completed', { snapshot_documents: state.snapshot_documents, total_upserts: state.total_upserts, completed_days: completedDays.size, state_path: statePath });
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
