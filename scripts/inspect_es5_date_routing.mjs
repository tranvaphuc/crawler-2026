import fs from 'node:fs/promises';
import path from 'node:path';
import ES5ClientPkg from 'elasticsearch';

const outputDir = path.resolve(process.argv[2] || 'outputs/01a07164-8064-7313-962f-0d73887aa809/es5-to-es8');
const inspection = JSON.parse(await fs.readFile(path.join(outputDir, 'es5-schema-inspection.json'), 'utf8'));
const envText = await fs.readFile('.env', 'utf8');
const env = Object.fromEntries(envText.split(/\r?\n/).map((line) => {
  const index = line.indexOf('=');
  if (index < 1 || line.trim().startsWith('#')) return [];
  return [line.slice(0, index).trim(), line.slice(index + 1).trim().replace(/^['"]|['"]$/g, '')];
}).filter((row) => row.length));
const ES5Client = ES5ClientPkg.Client || ES5ClientPkg;
const client = new ES5Client({ host: env.ES5_HOST, log: 'error', requestTimeout: 120_000 });
const targets = inspection.index_inventory.slice(0, 12);

async function inspect(row) {
  const response = await client.search({
    index: row.index,
    size: 0,
    body: {
      aggs: {
        min_published: { min: { field: 'publishedDate' } },
        max_published: { max: { field: 'publishedDate' } },
        min_inserted: { min: { field: 'insertedDate' } },
        max_inserted: { max: { field: 'insertedDate' } },
        missing_published: { missing: { field: 'publishedDate' } },
      },
    },
  });
  const a = response.aggregations;
  return {
    index: row.index,
    docs_count: Number(row['docs.count']),
    min_published: a.min_published.value_as_string ?? null,
    max_published: a.max_published.value_as_string ?? null,
    min_inserted: a.min_inserted.value_as_string ?? null,
    max_inserted: a.max_inserted.value_as_string ?? null,
    missing_published: a.missing_published.doc_count,
  };
}

const results = [];
for (let offset = 0; offset < targets.length; offset += 3) {
  results.push(...await Promise.all(targets.slice(offset, offset + 3).map(inspect)));
}
await fs.writeFile(path.join(outputDir, 'es5-date-routing-inspection.json'), `${JSON.stringify(results, null, 2)}\n`, 'utf8');
console.log(JSON.stringify(results, null, 2));
