import fs from 'node:fs/promises';
import https from 'node:https';

const requestedValue = Number(process.argv[2]);
if (!Number.isInteger(requestedValue) || requestedValue < 1000 || requestedValue > 10000) {
  throw new Error('Expected max shards per node between 1000 and 10000');
}

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
if (!env.ES8_HOST || !env.ES8_USER || !env.ES8_PASS) throw new Error('Missing ES8 connection variables');
const auth = Buffer.from(`${env.ES8_USER}:${env.ES8_PASS}`).toString('base64');

function request(method, requestPath, body) {
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

const update = await request('PUT', '/_cluster/settings', { persistent: { 'cluster.max_shards_per_node': requestedValue } });
if (update.status < 200 || update.status >= 300) throw new Error(`Update failed: HTTP ${update.status} ${JSON.stringify(update.body)}`);
const verify = await request('GET', '/_cluster/settings?include_defaults=true&flat_settings=true');
if (verify.status !== 200) throw new Error(`Verify failed: HTTP ${verify.status} ${JSON.stringify(verify.body)}`);
const actual = verify.body?.persistent?.['cluster.max_shards_per_node'] ?? verify.body?.transient?.['cluster.max_shards_per_node'] ?? verify.body?.defaults?.['cluster.max_shards_per_node'];
if (String(actual) !== String(requestedValue)) throw new Error(`Expected ${requestedValue}, found ${actual}`);
console.log(JSON.stringify({ success: true, setting: 'cluster.max_shards_per_node', previous_default: 1000, current: actual, scope: 'persistent', cluster: 'ES8' }, null, 2));
