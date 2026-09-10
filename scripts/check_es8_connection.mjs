import fs from 'node:fs/promises';
import http from 'node:http';
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
if (!host || !username || !password) throw new Error('Missing ES8_HOST, ES8_USER or ES8_PASS in .env');

const preferredProtocol = String(env.ES8_PROTOCOL || '').replace(':', '');
const allowSelfSigned = process.argv.includes('--allow-self-signed');
const protocols = preferredProtocol ? [preferredProtocol] : ['http', 'https'];
const auth = Buffer.from(`${username}:${password}`).toString('base64');

function request(protocol, pathname, rejectUnauthorized = true) {
  const transport = protocol === 'https' ? https : http;
  return new Promise((resolve, reject) => {
    const req = transport.request({
      protocol: `${protocol}:`, host, port, method: 'GET', path: pathname,
      headers: { Authorization: `Basic ${auth}`, Accept: 'application/json' },
      timeout: 10000,
      ...(protocol === 'https' ? { rejectUnauthorized } : {}),
    }, (res) => {
      const chunks = [];
      let bytes = 0;
      res.on('data', (chunk) => {
        bytes += chunk.length;
        if (bytes <= 2_000_000) chunks.push(chunk);
      });
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        let body;
        try { body = JSON.parse(text); } catch { body = text.slice(0, 500); }
        resolve({ status: res.statusCode, body });
      });
    });
    req.on('timeout', () => req.destroy(new Error('request timeout')));
    req.on('error', reject);
    req.end();
  });
}

let protocol;
let root;
const connectionErrors = [];
for (const candidate of protocols) {
  try {
    const response = await request(candidate, '/', true);
    if (response.status) {
      protocol = candidate;
      root = response;
      break;
    }
  } catch (error) {
    connectionErrors.push({ protocol: candidate, error: error.code || error.message });
    if (candidate === 'https' && allowSelfSigned && ['SELF_SIGNED_CERT_IN_CHAIN', 'DEPTH_ZERO_SELF_SIGNED_CERT', 'UNABLE_TO_VERIFY_LEAF_SIGNATURE'].includes(error.code)) {
      try {
        const response = await request(candidate, '/', false);
        protocol = candidate;
        root = response;
        connectionErrors.push({ protocol: candidate, warning: 'certificate validation bypassed for this diagnostic request' });
        break;
      } catch (insecureError) {
        connectionErrors.push({ protocol: `${candidate}-self-signed`, error: insecureError.code || insecureError.message });
      }
    }
  }
}
if (!protocol) {
  console.log(JSON.stringify({ connected: false, host, port, attempts: connectionErrors }, null, 2));
  process.exit(2);
}

const endpoints = {
  authenticate: '/_security/_authenticate',
  health: '/_cluster/health?filter_path=cluster_name,status,number_of_nodes,number_of_data_nodes,active_primary_shards,active_shards,unassigned_shards',
  indices: '/_cat/indices?format=json&h=index,health,status,docs.count,store.size&s=index',
};
const responses = {};
for (const [name, pathname] of Object.entries(endpoints)) {
  try { responses[name] = await request(protocol, pathname, !allowSelfSigned); }
  catch (error) { responses[name] = { error: error.code || error.message }; }
}

const indices = Array.isArray(responses.indices?.body) ? responses.indices.body : [];
const result = {
  connected: true,
  endpoint: `${protocol}://${host}:${port}`,
  tls_certificate_verified: !(protocol === 'https' && allowSelfSigned),
  root_status: root.status,
  cluster_name: root.body?.cluster_name,
  cluster_uuid: root.body?.cluster_uuid,
  version: root.body?.version?.number,
  distribution: root.body?.version?.distribution || 'elasticsearch',
  authenticate: {
    status: responses.authenticate?.status,
    username: responses.authenticate?.body?.username,
    roles: responses.authenticate?.body?.roles,
    authentication_type: responses.authenticate?.body?.authentication_type,
  },
  health: { status_code: responses.health?.status, ...(responses.health?.body && typeof responses.health.body === 'object' ? responses.health.body : {}) },
  indices: {
    status_code: responses.indices?.status,
    visible_count: indices.length,
    sample: indices.slice(0, 20),
    error: responses.indices?.error || (responses.indices?.status >= 400 ? responses.indices?.body?.error?.type || responses.indices?.body : undefined),
  },
};
console.log(JSON.stringify(result, null, 2));
