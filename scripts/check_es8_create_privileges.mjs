import fs from 'node:fs/promises';
import https from 'node:https';

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

const host = env.ES8_HOST;
const port = Number(env.ES8_PORT || 9200);
const username = env.ES8_USER;
const password = env.ES8_PASS;
if (!host || !username || !password) throw new Error('Missing ES8 connection variables');

const body = JSON.stringify({
  cluster: ['manage_index_templates', 'monitor'],
  index: [{
    names: ['k2-content-current-v1'],
    privileges: ['create_index', 'manage', 'write', 'create_doc', 'view_index_metadata'],
  }],
});
const auth = Buffer.from(`${username}:${password}`).toString('base64');

const result = await new Promise((resolve, reject) => {
  const req = https.request({
    host,
    port,
    method: 'POST',
    path: '/_security/user/_has_privileges',
    rejectUnauthorized: false,
    headers: {
      Authorization: `Basic ${auth}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(body),
    },
    timeout: 10000,
  }, (res) => {
    const chunks = [];
    res.on('data', (chunk) => chunks.push(chunk));
    res.on('end', () => {
      const text = Buffer.concat(chunks).toString('utf8');
      let parsed;
      try { parsed = JSON.parse(text); } catch { parsed = { response: text.slice(0, 500) }; }
      resolve({ status: res.statusCode, body: parsed });
    });
  });
  req.on('timeout', () => req.destroy(new Error('request timeout')));
  req.on('error', reject);
  req.write(body);
  req.end();
});

console.log(JSON.stringify({
  status: result.status,
  has_all_requested: result.body?.has_all_requested,
  cluster: result.body?.cluster,
  index: result.body?.index?.['k2-content-current-v1'],
}, null, 2));
