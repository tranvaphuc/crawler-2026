import { loadMigrationContext, requireSuccess } from './lib/master_migration_lib.mjs';

const { env, es8Request } = await loadMigrationContext();
const response = await es8Request('POST', '/_reindex?wait_for_completion=true', {
  max_docs: 1,
  source: {
    remote: { host: env.ES7_HOST, socket_timeout: '30s', connect_timeout: '10s' },
    index: 'topic56fc9bc282ea19d067e5d8a1',
    query: { ids: { values: ['__kompa_remote_reindex_connectivity_probe_missing_id__'] } },
  },
  dest: { index: 'master20260912', op_type: 'index' },
});
const body = requireSuccess('remote reindex connectivity probe', response);
console.log(JSON.stringify({ status: 'ok', total: body.total, created: body.created, updated: body.updated, failures: body.failures }, null, 2));
