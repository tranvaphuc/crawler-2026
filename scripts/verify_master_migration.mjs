import fs from 'node:fs/promises';
import path from 'node:path';
import https from 'node:https';

const reportDir = process.argv[2] || 'outputs/01a07164-8064-7313-962f-0d73887aa809/master-migration';
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
const credentialText = await fs.readFile(path.join(reportDir, 'master_reader.credentials.txt'), 'utf8');
const credentials = Object.fromEntries(credentialText.trim().split(/\r?\n/).map((line) => {
  const separator = line.indexOf('=');
  return [line.slice(0, separator), line.slice(separator + 1)];
}));
const adminAuth = Buffer.from(`${env.ES8_USER}:${env.ES8_PASS}`).toString('base64');
const readerAuth = Buffer.from(`${credentials.username}:${credentials.password}`).toString('base64');

function request(method, requestPath, body, auth = adminAuth) {
  const payload = body === undefined ? undefined : JSON.stringify(body);
  return new Promise((resolve, reject) => {
    const req = https.request({
      host: env.ES8_HOST,
      port: Number(env.ES8_PORT || 9200),
      method,
      path: requestPath,
      rejectUnauthorized: false,
      headers: {
        Authorization: `Basic ${auth}`,
        Accept: 'application/json',
        ...(payload ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } : {}),
      },
      timeout: 120_000,
    }, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        let parsed;
        try { parsed = text ? JSON.parse(text) : null; } catch { parsed = text.slice(0, 2000); }
        resolve({ status: res.statusCode, body: parsed });
      });
    });
    req.on('timeout', () => req.destroy(new Error(`${method} ${requestPath} timed out`)));
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

function requireSuccess(label, response) {
  if (response.status < 200 || response.status >= 300) throw new Error(`${label} failed with HTTP ${response.status}: ${JSON.stringify(response.body).slice(0, 2000)}`);
  return response.body;
}

const [count, indices, template, role, user, mapping, allDocuments, readerIdentity, readerCount, readerPrivileges] = await Promise.all([
  request('GET', '/master*/_count'),
  request('GET', '/_cat/indices/master*?format=json&h=index,health,status,docs.count,store.size&s=index'),
  request('GET', '/_index_template/master-template-v1'),
  request('GET', '/_security/role/master_readonly'),
  request('GET', '/_security/user/master_reader'),
  request('GET', '/master*/_mapping'),
  request('POST', '/master*/_search', { size: 1000, track_total_hits: true, _source: ['published_at', 'url', 'author', 'source', 'intelligence_current.sentiment'], sort: [{ _doc: 'asc' }] }),
  request('GET', '/_security/_authenticate', undefined, readerAuth),
  request('GET', '/master*/_count', undefined, readerAuth),
  request('POST', '/_security/user/_has_privileges', {
    cluster: ['monitor', 'manage_security'],
    index: [{ names: ['master*'], privileges: ['read', 'view_index_metadata', 'write', 'create_index', 'delete_index', 'manage'] }],
  }, readerAuth),
]);

const countBody = requireSuccess('admin count', count);
const indexRows = requireSuccess('cat indices', indices);
const templateBody = requireSuccess('index template', template);
const roleBody = requireSuccess('role', role);
const userBody = requireSuccess('user', user);
const mappingBody = requireSuccess('mapping', mapping);
const documentsBody = requireSuccess('all documents', allDocuments);
const readerIdentityBody = requireSuccess('reader authenticate', readerIdentity);
const readerCountBody = requireSuccess('reader count', readerCount);
const readerPrivilegesBody = requireSuccess('reader privileges', readerPrivileges);

const dateFormats = [];
function collectDateFormats(value) {
  if (!value || typeof value !== 'object') return;
  if (value.type === 'date') dateFormats.push(value.format);
  for (const child of Object.values(value)) collectDateFormats(child);
}
collectDateFormats(mappingBody);

const dateFormatter = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit' });
function expectedIndex(iso) {
  const parts = Object.fromEntries(dateFormatter.formatToParts(new Date(iso)).filter((part) => part.type !== 'literal').map((part) => [part.type, part.value]));
  return `master${parts.year}${parts.month}${parts.day}`;
}
const hits = documentsBody.hits?.hits ?? [];
const routingErrors = hits.filter((hit) => expectedIndex(hit._source?.published_at) !== hit._index).map((hit) => ({ id: hit._id, actual: hit._index, expected: expectedIndex(hit._source?.published_at), published_at: hit._source?.published_at }));
const privileges = readerPrivilegesBody.index?.['master*'] ?? {};
const checks = {
  total_is_1000: countBody.count === 1000,
  reader_count_is_1000: readerCountBody.count === 1000,
  fetched_all_1000_for_routing_check: hits.length === 1000,
  routing_errors_zero: routingErrors.length === 0,
  all_indices_green: Array.isArray(indexRows) && indexRows.every((row) => row.health === 'green' && row.status === 'open'),
  template_pattern_master: templateBody.index_templates?.[0]?.index_template?.index_patterns?.includes('master*') === true,
  all_date_formats_strict_date_time: dateFormats.length > 0 && dateFormats.every((format) => format === 'strict_date_time'),
  role_pattern_master: roleBody.master_readonly?.indices?.some((entry) => entry.names?.includes('master*')) === true,
  user_has_only_expected_role: JSON.stringify(userBody.master_reader?.roles ?? []) === JSON.stringify(['master_readonly']),
  reader_identity_valid: readerIdentityBody.username === 'master_reader',
  reader_can_read: privileges.read === true && privileges.view_index_metadata === true,
  reader_cannot_mutate: ['write', 'create_index', 'delete_index', 'manage'].every((privilege) => privileges[privilege] === false),
  reader_has_no_cluster_admin: readerPrivilegesBody.cluster?.monitor === false && readerPrivilegesBody.cluster?.manage_security === false,
};
if (Object.values(checks).some((value) => value !== true)) throw new Error(`Verification failed: ${JSON.stringify(checks)}`);

const report = {
  verified_at: new Date().toISOString(),
  checks,
  total_documents: countBody.count,
  indices: indexRows,
  date_field_count: dateFormats.length,
  date_formats: [...new Set(dateFormats)],
  routing_timezone: 'Asia/Ho_Chi_Minh',
  routing_errors: routingErrors,
  template: 'master-template-v1',
  role: 'master_readonly',
  user: 'master_reader',
  sample_documents: hits.slice(0, 3).map((hit) => ({ _index: hit._index, _id: hit._id, _source: hit._source })),
};
const outputPath = path.join(reportDir, 'verification-report.json');
await fs.writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ success: true, outputPath, checks, indices: indexRows }, null, 2));
