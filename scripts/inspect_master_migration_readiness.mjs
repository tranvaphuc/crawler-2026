import fs from 'node:fs/promises';
import https from 'node:https';
import { Client } from '@opensearch-project/opensearch';

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

const sourceIndex = process.argv[2] || 'topic56fc9bc282ea19d067e5d8a1';
if (!/^topic[a-f0-9]+$/.test(sourceIndex)) throw new Error(`Unexpected source index: ${sourceIndex}`);

const es7 = new Client({ node: env.ES7_HOST, maxRetries: 1, requestTimeout: 120_000 });
const es8Host = env.ES8_HOST;
const es8Port = Number(env.ES8_PORT || 9200);
const es8User = env.ES8_USER;
const es8Pass = env.ES8_PASS;
if (!env.ES7_HOST || !es8Host || !es8User || !es8Pass) throw new Error('Missing ES7/ES8 connection variables');
const auth = Buffer.from(`${es8User}:${es8Pass}`).toString('base64');

function es8Request(method, requestPath, body) {
  const payload = body === undefined ? undefined : JSON.stringify(body);
  return new Promise((resolve, reject) => {
    const req = https.request({
      host: es8Host,
      port: es8Port,
      method,
      path: requestPath,
      rejectUnauthorized: false,
      headers: {
        Authorization: `Basic ${auth}`,
        Accept: 'application/json',
        ...(payload ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } : {}),
      },
      timeout: 30_000,
    }, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        let parsed;
        try { parsed = text ? JSON.parse(text) : null; } catch { parsed = text.slice(0, 1000); }
        resolve({ status: res.statusCode, body: parsed });
      });
    });
    req.on('timeout', () => req.destroy(new Error('ES8 request timeout')));
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

const unwrap = (response) => response?.body ?? response;
const [dateStatsResponse, sourceCountResponse] = await Promise.all([
  es7.search({
    index: sourceIndex,
    body: {
      size: 0,
      aggs: {
        min_date: { min: { field: 'publishedDate' } },
        max_date: { max: { field: 'publishedDate' } },
        dated: { filter: { exists: { field: 'publishedDate' } } },
        ignored_events: { filter: { terms: { type: ['fbEventTopic', 'fbEventComment'] } } },
      },
    },
  }),
  es7.count({ index: sourceIndex }),
]);
const dateStats = unwrap(dateStatsResponse)?.aggregations ?? {};

const [privileges, allocation, templates, masterIndices, role, user] = await Promise.all([
  es8Request('POST', '/_security/user/_has_privileges', {
    cluster: ['manage_index_templates', 'manage_security', 'monitor'],
    index: [{ names: ['master*'], privileges: ['create_index', 'manage', 'write', 'read', 'view_index_metadata'] }],
  }),
  es8Request('GET', '/_cat/allocation?format=json&bytes=gb&h=node,shards,disk.indices,disk.used,disk.avail,disk.total,disk.percent'),
  es8Request('GET', '/_index_template?filter_path=index_templates.name,index_templates.index_template.index_patterns,index_templates.index_template.priority'),
  es8Request('GET', '/_cat/indices/master*?format=json&h=index,health,status,docs.count,store.size&s=index'),
  es8Request('GET', '/_security/role/master_readonly'),
  es8Request('GET', '/_security/user/master_reader'),
]);

const templateRows = Array.isArray(templates.body?.index_templates) ? templates.body.index_templates : [];
const overlappingTemplates = templateRows.filter((row) => (row.index_template?.index_patterns ?? []).some((pattern) => String(pattern).startsWith('master') || pattern === '*'));

console.log(JSON.stringify({
  source: {
    index: sourceIndex,
    count: unwrap(sourceCountResponse)?.count,
    dated_count: dateStats.dated?.doc_count,
    missing_published_date: (unwrap(sourceCountResponse)?.count ?? 0) - (dateStats.dated?.doc_count ?? 0),
    ignored_facebook_events: dateStats.ignored_events?.doc_count,
    min_published_date: dateStats.min_date?.value_as_string,
    max_published_date: dateStats.max_date?.value_as_string,
  },
  es8: {
    privileges_status: privileges.status,
    has_all_requested: privileges.body?.has_all_requested,
    cluster_privileges: privileges.body?.cluster,
    master_index_privileges: privileges.body?.index?.['master*'],
    allocation: allocation.body,
    overlapping_templates: overlappingTemplates,
    existing_master_indices: masterIndices.status === 404 ? [] : masterIndices.body,
    existing_role_status: role.status,
    existing_user_status: user.status,
  },
}, null, 2));
