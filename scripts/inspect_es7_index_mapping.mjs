import fs from 'node:fs/promises';
import path from 'node:path';
import dotenv from 'dotenv';
import { Client } from '@opensearch-project/opensearch';

dotenv.config({ quiet: true });

const index = process.argv[2];
const outputDir = process.argv[3];
if (!index || !outputDir) {
  throw new Error('Usage: node scripts/inspect_es7_index_mapping.mjs <index> <output-dir>');
}
if (!/^topic[a-f0-9]+$/.test(index)) {
  throw new Error(`Refusing unexpected index name: ${index}`);
}
if (!process.env.ES7_HOST) {
  throw new Error('ES7_HOST is missing from .env');
}

const client = new Client({
  node: process.env.ES7_HOST,
  maxRetries: 1,
  requestTimeout: 60_000,
});

const unwrap = (response) => response?.body ?? response;
const [infoResponse, mappingResponse, settingsResponse, statsResponse, countResponse, sampleResponse] = await Promise.all([
  client.info(),
  client.indices.getMapping({ index }),
  client.indices.getSettings({ index }),
  client.indices.stats({ index, metric: ['docs', 'store'] }),
  client.count({ index }),
  client.search({
    index,
    body: {
      size: 5,
      sort: [{ _doc: 'asc' }],
      query: { match_all: {} },
    },
  }),
]);

const mapping = unwrap(mappingResponse)?.[index]?.mappings ?? {};
const settings = unwrap(settingsResponse)?.[index]?.settings ?? {};
const indexStats = unwrap(statsResponse)?.indices?.[index] ?? {};
const count = unwrap(countResponse)?.count ?? null;
const clusterInfo = unwrap(infoResponse) ?? {};
const samples = (unwrap(sampleResponse)?.hits?.hits ?? []).map((hit) => ({
  _id: hit._id,
  _source: hit._source,
}));

await fs.mkdir(outputDir, { recursive: true });
await Promise.all([
  fs.writeFile(path.join(outputDir, `${index}-es7-mapping.raw.json`), `${JSON.stringify(mapping, null, 2)}\n`),
  fs.writeFile(path.join(outputDir, `${index}-es7-settings.raw.json`), `${JSON.stringify(settings, null, 2)}\n`),
  fs.writeFile(path.join(outputDir, `${index}-samples.raw.json`), `${JSON.stringify({ count, samples }, null, 2)}\n`),
  fs.writeFile(path.join(outputDir, `${index}-source-cluster-info.raw.json`), `${JSON.stringify(clusterInfo, null, 2)}\n`),
  fs.writeFile(path.join(outputDir, `${index}-stats.raw.json`), `${JSON.stringify(indexStats, null, 2)}\n`),
]);

const properties = mapping.properties ?? mapping._doc?.properties ?? {};
console.log(JSON.stringify({
  index,
  documentCount: count,
  primaryStoreBytes: indexStats.primaries?.store?.size_in_bytes ?? null,
  mappingKeys: Object.keys(mapping),
  topLevelFieldCount: Object.keys(properties).length,
  topLevelFields: Object.keys(properties).sort(),
  sampleCount: samples.length,
  sourceCluster: {
    distribution: clusterInfo.version?.distribution ?? 'elasticsearch',
    version: clusterInfo.version?.number ?? null,
    tagline: clusterInfo.tagline ?? null,
  },
  outputDir,
}, null, 2));
