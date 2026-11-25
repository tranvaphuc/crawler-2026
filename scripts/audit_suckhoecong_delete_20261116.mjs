import 'dotenv/config';
import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import ES from 'elasticsearch';
import { Client } from '@opensearch-project/opensearch';

const directory = 'outputs/suckhoecong-delete-20261116';
await fs.mkdir(directory, { recursive: true });
const query = { bool: { filter: [{ term: { siteName: 'suckhoecong.vn' } }, { term: { 'ds.source': 'news-flow-http' } }] } };
await Promise.all(['ES5', 'ES7'].map(async cluster => {
  const es = cluster === 'ES5'
    ? new ES.Client({ host: process.env.ES5_HOST, apiVersion: '5.6', log: [], requestTimeout: 60000, maxRetries: 0 })
    : new Client({ node: process.env.ES7_HOST, requestTimeout: 60000, maxRetries: 0 });
  let scrollId;
  try {
    const body = { size: 1000, query, sort: ['_doc'], _source: ['siteName', 'ds.source', 'title', 'url', 'insertedDate', 'publishedDate'] };
    if (cluster === 'ES7') body.track_total_hits = true;
    let response = await es.search({ index: 'master*,topic*', scroll: '2m', body });
    const records = [];
    let total;
    while (true) {
      const page = response.body || response;
      scrollId = page._scroll_id;
      if (page.timed_out || page._shards?.failed) throw new Error('Incomplete search');
      total ??= typeof page.hits.total === 'number' ? page.hits.total : page.hits.total.value;
      if (!page.hits.hits.length) break;
      for (const hit of page.hits.hits) {
        if (hit._source.siteName !== 'suckhoecong.vn' || hit._source.ds?.source !== 'news-flow-http') throw new Error('Exact source validation failed');
        records.push({ index: hit._index, type: hit._type, id: hit._id, source: hit._source });
      }
      response = await es.scroll(cluster === 'ES5' ? { scrollId, scroll: '2m' } : { body: { scroll_id: scrollId, scroll: '2m' } });
    }
    const keys = new Set(records.map(r => JSON.stringify([r.index, r.type, r.id])));
    if (records.length !== total || keys.size !== total) throw new Error('Count or uniqueness mismatch');
    records.sort((a, b) => JSON.stringify([a.index, a.type, a.id]).localeCompare(JSON.stringify([b.index, b.type, b.id])));
    const manifest = JSON.stringify({ cluster, query, capturedAt: new Date().toISOString(), records }, null, 2);
    const filename = `${directory}/${cluster}-manifest.json`;
    await fs.writeFile(filename, manifest);
    const indices = {};
    for (const record of records) indices[record.index] = (indices[record.index] || 0) + 1;
    const summary = { cluster, capturedAt: new Date().toISOString(), count: total, indexCount: Object.keys(indices).length, uniqueUrls: new Set(records.map(r => r.source.url)).size, indices, exactMatchVerified: true, sha256: crypto.createHash('sha256').update(manifest).digest('hex'), manifest: filename };
    await fs.writeFile(`${directory}/${cluster}-summary.json`, JSON.stringify(summary, null, 2));
    console.log(JSON.stringify(summary));
  } catch (error) {
    console.log(JSON.stringify({ cluster, error: String(error.message).replace(/https?:\/\/[^\s]+/g, '[endpoint]') }));
    process.exitCode = 1;
  } finally {
    if (scrollId) {
      try { await es.clearScroll(cluster === 'ES5' ? { scrollId } : { body: { scroll_id: [scrollId] } }); } catch {}
    }
    await es.close();
  }
}));
