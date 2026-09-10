import fs from 'node:fs/promises';
import path from 'node:path';
import { Client } from '@opensearch-project/opensearch';

const outputDir = path.resolve(process.argv[2] || 'outputs/01a07164-8064-7313-962f-0d73887aa809/es5-to-es8');
const samples = JSON.parse(await fs.readFile(path.join(outputDir, 'es5-recent-samples.json'), 'utf8'));
const envText = await fs.readFile('.env', 'utf8');
const env = Object.fromEntries(envText.split(/\r?\n/).map((line) => {
  const index = line.indexOf('=');
  if (index < 1 || line.trim().startsWith('#')) return [];
  return [line.slice(0, index).trim(), line.slice(index + 1).trim().replace(/^['"]|['"]$/g, '')];
}).filter((row) => row.length));
const client = new Client({ node: env.ES7_HOST, requestTimeout: 120_000, compression: 'gzip', suggestCompression: true });
const sourceIndex = 'topic56fc9bc282ea19d067e5d8a1';
const rows = Object.entries(samples).filter(([, hit]) => hit?._id).map(([type, hit]) => ({ type, id: hit._id }));
const response = await client.search({
  index: sourceIndex,
  body: { size: rows.length, _source: ['type', 'publishedDate'], query: { ids: { values: rows.map((row) => row.id) } } },
});
const body = response?.body ?? response;
const found = new Map((body.hits?.hits ?? []).map((hit) => [hit._id, hit]));
const result = rows.map((row) => ({ es5_type: row.type, id: row.id, found_in_es7: found.has(row.id), es7_type: found.get(row.id)?._source?.type, es7_published_date: found.get(row.id)?._source?.publishedDate }));
await fs.writeFile(path.join(outputDir, 'es5-es7-sample-id-overlap.json'), `${JSON.stringify(result, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ checked: result.length, overlapping: result.filter((row) => row.found_in_es7).length, rows: result }, null, 2));
