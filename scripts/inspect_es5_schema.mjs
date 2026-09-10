import fs from 'node:fs/promises';
import path from 'node:path';
import ES5ClientPkg from 'elasticsearch';

const outputDir = path.resolve(process.argv[2] || 'outputs/01a07164-8064-7313-962f-0d73887aa809/es5-to-es8');
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
if (!env.ES5_HOST) throw new Error('Missing ES5_HOST');

const ES5Client = ES5ClientPkg.Client || ES5ClientPkg;
const client = new ES5Client({ host: env.ES5_HOST, log: 'error', requestTimeout: 120_000 });

const [info, rawIndices] = await Promise.all([
  client.info(),
  client.cat.indices({ index: 'master*', format: 'json', h: 'index,status,docs.count,store.size,pri,rep' }),
]);
const currentMonth = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit' }).replace('-', '');
function isValidMonthlyIndex(name) {
  const match = /^master(\d{4})(\d{2})$/.exec(name);
  if (!match) return false;
  const month = Number(match[2]);
  const suffix = `${match[1]}${match[2]}`;
  return month >= 1 && month <= 12 && suffix >= '200001' && suffix <= currentMonth;
}
const indices = rawIndices
  .filter((row) => isValidMonthlyIndex(row.index))
  .sort((a, b) => b.index.localeCompare(a.index));
if (!indices.length) throw new Error('No monthly masterYYYYMM indices found on ES5');

const representativeIndices = [...new Set([
  ...indices.slice(0, 12).map((row) => row.index),
  ...indices.filter((_, index) => index % 24 === 0).map((row) => row.index),
  indices[Math.floor(indices.length / 2)]?.index,
  indices.at(-1)?.index,
].filter(Boolean))];
const recentIndices = indices.slice(0, 3).map((row) => row.index);
const mappings = await client.indices.getMapping({ index: representativeIndices.join(',') });

const fieldVariants = new Map();
const typeNames = new Set();
function walkProperties(properties, prefix, sourceIndex, sourceType) {
  for (const [name, mapping] of Object.entries(properties ?? {})) {
    const field = prefix ? `${prefix}.${name}` : name;
    const variant = mapping.type ?? (mapping.properties ? 'object' : 'unknown');
    const row = fieldVariants.get(field) ?? { field, variants: new Set(), indices: new Set(), source_types: new Set() };
    row.variants.add(variant);
    row.indices.add(sourceIndex);
    row.source_types.add(sourceType);
    fieldVariants.set(field, row);
    if (mapping.properties) walkProperties(mapping.properties, field, sourceIndex, sourceType);
  }
}
for (const [sourceIndex, indexMapping] of Object.entries(mappings)) {
  for (const [sourceType, typeMapping] of Object.entries(indexMapping.mappings ?? {})) {
    typeNames.add(sourceType);
    walkProperties(typeMapping.properties, '', sourceIndex, sourceType);
  }
}

let typeBuckets = [];
try {
  const typeAgg = await client.search({
    index: recentIndices.join(','),
    size: 0,
    body: { aggs: { source_types: { terms: { field: '_type', size: 100 } } } },
  });
  typeBuckets = typeAgg.aggregations?.source_types?.buckets ?? [];
} catch (error) {
  typeBuckets = [...typeNames].sort().map((key) => ({ key, doc_count: null, note: error.message }));
}

const samples = {};
for (const bucket of typeBuckets.slice(0, 30)) {
  try {
    const response = await client.search({
      index: recentIndices.join(','),
      type: bucket.key,
      size: 1,
      body: { query: { exists: { field: 'publishedDate' } }, sort: [{ publishedDate: { order: 'desc', unmapped_type: 'date' } }] },
    });
    const hit = response.hits?.hits?.[0];
    if (hit) samples[bucket.key] = hit;
  } catch (error) {
    samples[bucket.key] = { error: error.message };
  }
}

const report = {
  inspected_at: new Date().toISOString(),
  mode: 'read-only',
  es_version: info.version?.number,
  cluster_name: info.cluster_name,
  monthly_indices: indices.length,
  newest_index: indices[0]?.index,
  oldest_index: indices.at(-1)?.index,
  total_docs_reported: indices.reduce((sum, row) => sum + (Number(String(row['docs.count'] ?? '0').replace(/,/g, '')) || 0), 0),
  representative_indices: representativeIndices,
  recent_indices_for_type_counts: recentIndices,
  source_types: typeBuckets.map((bucket) => ({ type: bucket.key, docs_in_recent_indices: bucket.doc_count })),
  fields: [...fieldVariants.values()].sort((a, b) => a.field.localeCompare(b.field)).map((row) => ({
    field: row.field,
    es5_types: [...row.variants].sort(),
    observed_in_indices: row.indices.size,
    source_types: [...row.source_types].sort(),
  })),
  mapping_conflicts: [...fieldVariants.values()].filter((row) => row.variants.size > 1).map((row) => ({ field: row.field, es5_types: [...row.variants].sort() })),
  index_inventory: indices,
};

await fs.mkdir(outputDir, { recursive: true });
await Promise.all([
  fs.writeFile(path.join(outputDir, 'es5-schema-inspection.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8'),
  fs.writeFile(path.join(outputDir, 'es5-recent-samples.json'), `${JSON.stringify(samples, null, 2)}\n`, 'utf8'),
]);
console.log(JSON.stringify({
  es_version: report.es_version,
  monthly_indices: report.monthly_indices,
  newest_index: report.newest_index,
  oldest_index: report.oldest_index,
  total_docs_reported: report.total_docs_reported,
  representative_indices: report.representative_indices,
  source_types: report.source_types,
  fields: report.fields.length,
  mapping_conflicts: report.mapping_conflicts,
  output_dir: outputDir,
}, null, 2));
