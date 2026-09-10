import fs from 'node:fs/promises';
import path from 'node:path';
import { ES5_FULL_START, listEs5SourceIndices, loadEs5MigrationContext } from './lib/es5_master_migration_lib.mjs';
import { IGNORED_TYPES } from './lib/master_migration_lib.mjs';

const outputDir = path.resolve(process.argv[2] || 'outputs/01a07164-8064-7313-962f-0d73887aa809/es5-to-es8');
const { es5 } = await loadEs5MigrationContext();
const sourceIndices = await listEs5SourceIndices(es5);
const snapshotEnd = new Date().toISOString();
const response = await es5.search({
  index: sourceIndices.join(','),
  size: 0,
  body: {
    query: {
      bool: {
        filter: [{ range: { insertedDate: { gte: ES5_FULL_START, lt: snapshotEnd } } }, { exists: { field: 'publishedDate' } }],
        must_not: [{ terms: { _type: IGNORED_TYPES } }],
      },
    },
    aggs: {
      min_published: { min: { field: 'publishedDate' } },
      max_published: { max: { field: 'publishedDate' } },
      source_types: { terms: { field: '_type', size: 100 } },
      published_days: { date_histogram: { field: 'publishedDate', interval: 'day', time_zone: '+07:00', min_doc_count: 1 } },
    },
  },
});
const report = {
  planned_at: new Date().toISOString(),
  mode: 'read-only',
  source_indices: sourceIndices,
  source_index_count: sourceIndices.length,
  inserted_date_range: { gte: ES5_FULL_START, lt: snapshotEnd },
  documents: response.hits?.total,
  min_published: response.aggregations?.min_published?.value_as_string,
  max_published: response.aggregations?.max_published?.value_as_string,
  exact_non_empty_published_days: response.aggregations?.published_days?.buckets?.length,
  source_types: (response.aggregations?.source_types?.buckets ?? []).map((bucket) => ({ type: bucket.key, documents: bucket.doc_count })),
  published_days: (response.aggregations?.published_days?.buckets ?? []).map((bucket) => ({ day_start_utc: bucket.key_as_string, documents: bucket.doc_count })),
};
await fs.mkdir(outputDir, { recursive: true });
const output = path.join(outputDir, 'es5-aug2026-migration-plan.json');
await fs.writeFile(output, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ ...report, source_indices: undefined, published_days: undefined, output }, null, 2));
