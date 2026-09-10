import fs from 'node:fs/promises';
import path from 'node:path';
import dotenv from 'dotenv';
import { Client } from '@opensearch-project/opensearch';

dotenv.config({ quiet: true });
const [index, outputPath] = process.argv.slice(2);
if (!index || !outputPath) throw new Error('Usage: node scripts/inspect_es7_channel_types.mjs <index> <output.json>');
if (!/^topic[a-f0-9]+$/.test(index)) throw new Error(`Unexpected index name: ${index}`);

const client = new Client({ node: process.env.ES7_HOST, maxRetries: 1, requestTimeout: 120_000 });
const response = await client.search({
  index,
  body: {
    size: 0,
    aggs: {
      content_types: {
        terms: { field: 'type', size: 250, order: { _key: 'asc' } },
        aggs: {
          sample: {
            top_hits: {
              size: 1,
              _source: { includes: ['type', 'siteId', 'siteName', 'url', 'hostname', 'profile.id', 'profile.name', 'ds.source'] },
            },
          },
        },
      },
    },
  },
});
const body = response?.body ?? response;
const rows = (body.aggregations?.content_types?.buckets ?? []).map((bucket) => {
  const hit = bucket.sample?.hits?.hits?.[0] ?? {};
  return { type: bucket.key, count: bucket.doc_count, sample_id: hit._id, sample: hit._source };
});
await fs.mkdir(path.dirname(outputPath), { recursive: true });
await fs.writeFile(outputPath, `${JSON.stringify(rows, null, 2)}\n`);
console.log(JSON.stringify({ typeCount: rows.length, types: rows.map((row) => ({ type: row.type, count: row.count })) }, null, 2));
