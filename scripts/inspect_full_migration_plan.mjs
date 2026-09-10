import fs from 'node:fs/promises';
import https from 'node:https';
import { Client } from '@opensearch-project/opensearch';

const sourceIndex = process.argv[2] || 'topic56fc9bc282ea19d067e5d8a1';
const envText = await fs.readFile('.env', 'utf8');
const env = {};
for (const rawLine of envText.split(/\r?\n/)) {
  const line = rawLine.trim();
  if (!line || line.startsWith('#')) continue;
  const separator = line.indexOf('=');
  if (separator < 1) continue;
  const key = line.slice(0, separator).trim();
  let value = line.slice(separator + 1).trim();
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
  env[key] = value;
}
const es7 = new Client({ node: env.ES7_HOST, maxRetries: 2, requestTimeout: 180_000 });
const auth = Buffer.from(`${env.ES8_USER}:${env.ES8_PASS}`).toString('base64');

function es8Get(requestPath) {
  return new Promise((resolve, reject) => {
    const req = https.request({ host: env.ES8_HOST, port: Number(env.ES8_PORT || 9200), method: 'GET', path: requestPath, rejectUnauthorized: false, headers: { Authorization: `Basic ${auth}`, Accept: 'application/json' }, timeout: 60_000 }, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        let body;
        try { body = JSON.parse(text); } catch { body = text.slice(0, 2000); }
        resolve({ status: res.statusCode, body });
      });
    });
    req.on('timeout', () => req.destroy(new Error('ES8 request timeout')));
    req.on('error', reject);
    req.end();
  });
}

const response = await es7.search({
  index: sourceIndex,
  body: {
    size: 0,
    query: { bool: { filter: [{ exists: { field: 'publishedDate' } }], must_not: [{ terms: { type: ['fbEventTopic', 'fbEventComment'] } }] } },
    aggs: { days: { date_histogram: { field: 'publishedDate', calendar_interval: 'day', time_zone: 'Asia/Ho_Chi_Minh', format: 'yyyyMMdd', min_doc_count: 1 } } },
  },
});
const body = response?.body ?? response;
const buckets = body.aggregations?.days?.buckets ?? [];
const [settings, indices] = await Promise.all([
  es8Get('/_cluster/settings?include_defaults=true&flat_settings=true'),
  es8Get('/_cat/indices/master*?format=json&h=index,pri,rep,docs.count,store.size&s=index'),
]);
const counts = buckets.map((bucket) => bucket.doc_count).sort((a, b) => a - b);
const total = buckets.reduce((sum, bucket) => sum + bucket.doc_count, 0);
console.log(JSON.stringify({
  sourceIndex,
  non_event_dated_documents: total,
  non_empty_days: buckets.length,
  newest_day: buckets.at(-1)?.key_as_string,
  oldest_day: buckets[0]?.key_as_string,
  median_documents_per_day: counts[Math.floor(counts.length / 2)] ?? 0,
  max_documents_in_one_day: counts.at(-1) ?? 0,
  newest_10_days: buckets.slice(-10).reverse().map((bucket) => ({ day: bucket.key_as_string, count: bucket.doc_count })),
  cluster_settings_status: settings.status,
  cluster_max_shards_per_node: settings.body?.persistent?.['cluster.max_shards_per_node'] ?? settings.body?.transient?.['cluster.max_shards_per_node'] ?? settings.body?.defaults?.['cluster.max_shards_per_node'],
  existing_master_indices: indices.body,
}, null, 2));
