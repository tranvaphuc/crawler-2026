import { loadMigrationContext, requireSuccess } from './lib/master_migration_lib.mjs';

const { es8Request } = await loadMigrationContext();
const stats = requireSuccess('node stats', await es8Request('GET', '/_nodes/stats/os,process,jvm,thread_pool,fs?filter_path=nodes.*.name,nodes.*.os.cpu,nodes.*.process.cpu,nodes.*.jvm.mem,nodes.*.thread_pool.write,nodes.*.thread_pool.bulk,nodes.*.fs.total'));
const health = requireSuccess('cluster health', await es8Request('GET', '/_cluster/health'));
console.log(JSON.stringify({ health: { status: health.status, active_shards: health.active_shards, unassigned_shards: health.unassigned_shards }, stats }, null, 2));
