import fs from 'node:fs/promises';
import path from 'node:path';
import { listEs5SourceIndices, loadEs5MigrationContext, transformEs5Hit } from './lib/es5_master_migration_lib.mjs';
import { IGNORED_TYPES } from './lib/master_migration_lib.mjs';

const outputDir = path.resolve(process.argv[2] || 'outputs/01a07164-8064-7313-962f-0d73887aa809/es5-to-es8');
const { es5 } = await loadEs5MigrationContext();
const sourceIndices = await listEs5SourceIndices(es5);
const lt = new Date().toISOString();
const gte = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString();
const response = await es5.search({
  index: sourceIndices.join(','),
  version: true,
  size: 50,
  body: {
    sort: ['_doc'],
    query: {
      bool: {
        filter: [{ range: { insertedDate: { gte, lt } } }, { exists: { field: 'publishedDate' } }],
        must_not: [{ terms: { _type: IGNORED_TYPES } }],
      },
    },
  },
});
const projected = (response.hits?.hits ?? []).map((hit) => transformEs5Hit(hit, 'content-projector-es5-dry-run-v1'));
const report = {
  mode: 'read-only-dry-run',
  source_index_count: sourceIndices.length,
  query: { insertedDate: { gte, lt } },
  total_matching_documents: response.hits?.total,
  sampled: projected.length,
  target_indices: [...new Set(projected.map((item) => item.index))].sort(),
  source_types: [...new Set((response.hits?.hits ?? []).map((hit) => hit._type))].sort(),
  sample: projected.slice(0, 3),
};
await fs.writeFile(path.join(outputDir, 'es5-migration-dry-run.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ ...report, sample: undefined }, null, 2));
