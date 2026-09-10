import fs from 'node:fs/promises';
import path from 'node:path';
import dotenv from 'dotenv';
import { Client } from '@opensearch-project/opensearch';

dotenv.config({ quiet: true });
const [index, outputPath] = process.argv.slice(2);
if (!index || !outputPath) throw new Error('Usage: node scripts/fetch_es7_facebook_samples.mjs <index> <output.json>');
if (!/^topic[a-f0-9]+$/.test(index)) throw new Error(`Unexpected index name: ${index}`);
if (!process.env.ES7_HOST) throw new Error('ES7_HOST is missing');

const client = new Client({ node: process.env.ES7_HOST, maxRetries: 1, requestTimeout: 60_000 });
const unwrap = (response) => response?.body ?? response;

async function getSamples(type, size) {
  const response = await client.search({
    index,
    body: {
      size,
      sort: [{ _doc: 'asc' }],
      query: {
        bool: {
          filter: [{ term: { type } }, { exists: { field: 'profile.id' } }, { exists: { field: 'content' } }],
        },
      },
    },
  });
  return (unwrap(response)?.hits?.hits ?? []).map((hit) => ({ _id: hit._id, _source: hit._source }));
}

const [topics, comments] = await Promise.all([
  getSamples('fbPageTopic', 1),
  getSamples('fbPageComment', 2),
]);
const samples = [...topics, ...comments];
await fs.mkdir(path.dirname(outputPath), { recursive: true });
await fs.writeFile(outputPath, `${JSON.stringify({ index, samples }, null, 2)}\n`);
console.log(JSON.stringify({
  index,
  counts: {
    fbPageTopic: topics.length,
    fbPageComment: comments.length,
    total: samples.length,
  },
  ids: samples.map((sample) => ({ id: sample._id, type: sample._source?.type })),
  outputPath,
}, null, 2));
