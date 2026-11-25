// Read-only production inspection: metadata and at most two examples per Facebook type.
import 'dotenv/config';
import fs from 'node:fs/promises';
import path from 'node:path';
import ES from 'elasticsearch';
import dayjs from 'dayjs';
import isoWeek from 'dayjs/plugin/isoWeek.js';
dayjs.extend(isoWeek);

const root = path.resolve(process.argv[2] || 'outputs/facebook-es5-contract-2026-10-23');
if (!process.env.ES5_HOST) throw Error('Missing ES5_HOST');
const client = new ES.Client({ host: process.env.ES5_HOST, log: [], requestTimeout: 30000, maxRetries: 0 });
const safe = value => {
  if (Array.isArray(value)) return value.map(safe);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value).filter(([k]) => !/^(?:cookie|authorization|password|access_token|fb_dtsg|lsd)$/i.test(k)).map(([k, v]) => [k, safe(v)]));
};
try {
  await fs.mkdir(root, { recursive: true });
  const info = await client.info();
  const inventory = await client.cat.indices({ index: 'master*', format: 'json', h: 'index,status,docs.count' });
  const now = dayjs(new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }));
  const maxShard = `${now.isoWeekYear()}${String(now.isoWeek()).padStart(2, '0')}`;
  const candidates = inventory.filter(r => /^master20\d{4}$/.test(r.index) && r.status === 'open' &&
      r.index.slice(6) <= maxShard)
    .sort((a, b) => b.index.localeCompare(a.index));
  const indices = candidates.slice(0, 3).map(r => r.index);
  if (!indices.length) throw Error('No master indices');
  const mappings = await client.indices.getMapping({ index: indices.join(',') });
  const facebookMappings = Object.fromEntries(Object.entries(mappings).map(([index, v]) => [index, {
    mappings: Object.fromEntries(Object.entries(v.mappings || {}).filter(([type]) => /^fb/i.test(type))) }]));
  const rawTemplates = await client.indices.getTemplate({ filterPath: '*.template,*.index_patterns,*.order,*.mappings,*.settings,*.aliases' });
  const templates = Object.fromEntries(Object.entries(rawTemplates).filter(([, v]) => String(v.template || v.index_patterns || '').includes('master'))
    .map(([name, v]) => [name, { ...v, mappings: Object.fromEntries(Object.entries(v.mappings || {}).filter(([type]) => /^fb/i.test(type) || type === '_default_')) }]));
  const types = [...new Set(Object.values(facebookMappings).flatMap(v => Object.keys(v.mappings)))].sort();
  const samples = {};
  for (const type of types.filter(t => /page|user|group/i.test(t))) {
    const r = await client.search({ index: indices.join(','), type, size: 2,
      body: { query: { match_all: {} }, sort: ['_doc'] } });
    samples[type] = (r.hits?.hits || []).map(h => safe({ _index: h._index, _type: h._type, _id: h._id, _source: h._source }));
  }
  const report = { inspectedAt: new Date().toISOString(), mode: 'READ_ONLY', version: info.version?.number,
    indices, templateNames: Object.keys(templates), types, sampleCounts: Object.fromEntries(Object.entries(samples).map(([k, v]) => [k, v.length])) };
  for (const [name, data] of Object.entries({ 'inspection': report, 'templates': templates, 'mappings': facebookMappings, 'es5-samples': samples })) {
    await fs.writeFile(path.join(root, name + '.json'), JSON.stringify(data, null, 2));
  }
  console.log(JSON.stringify(report));
} catch (error) {
  console.error(JSON.stringify({ error: error.body?.error?.type || error.code || error.name, operation: 'read-only ES5 inspection' }));
  process.exitCode = 1;
} finally { client.close(); }
