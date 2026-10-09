import fs from 'node:fs/promises';
import http from 'node:http';
import https from 'node:https';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import zlib from 'node:zlib';
import dotenv from 'dotenv';
import { deepClone } from './node_compat.mjs';

export const MASTER_TEMPLATE_NAME = 'master-template-v1';
export const MASTER_COMPONENT_FILES = [
  ['master-ct-content-settings-v1', 'k2-ct-content-settings-v1.json'],
  ['master-ct-common-meta-v1', 'k2-ct-common-meta-v1.json'],
  ['master-ct-content-core-v1', 'k2-ct-content-core-v1.json'],
  ['master-ct-content-text-v1', 'k2-ct-content-text-v1.json'],
  ['master-ct-intelligence-current-v1', 'k2-ct-intelligence-current-v1.json'],
];
const DEFAULT_BLUEPRINT_DIR = fileURLToPath(
  new URL('../../config/es9-master-template/', import.meta.url),
);

export async function loadProjectEnv() {
  const fileEnv = dotenv.parse(await fs.readFile(path.resolve('.env')));
  // Values supplied by PM2/systemd/the shell must win over repository defaults.
  return { ...fileEnv, ...process.env };
}

export function requireSuccess(label, response) {
  if (response.status < 200 || response.status >= 300) {
    throw new Error(`${label} failed with HTTP ${response.status}: ${JSON.stringify(response.body).slice(0, 3000)}`);
  }
  return response.body;
}

export function createEs9Request(env) {
  for (const key of ['ES9_HOST', 'ES9_PORT', 'ES9_USER', 'ES9_PASS']) {
    if (!env[key]) throw new Error(`Missing ${key} in .env`);
  }
  const protocol = String(env.ES9_PROTOCOL || 'https').replace(/:$/, '').toLowerCase();
  if (!['http', 'https'].includes(protocol)) throw new Error(`Unsupported ES9_PROTOCOL: ${protocol}`);
  const transport = protocol === 'https' ? https : http;
  const agent = protocol === 'https'
    ? new https.Agent({ keepAlive: true, maxSockets: 8, maxFreeSockets: 8, rejectUnauthorized: false })
    : new http.Agent({ keepAlive: true, maxSockets: 8, maxFreeSockets: 8 });
  const auth = Buffer.from(`${env.ES9_USER}:${env.ES9_PASS}`).toString('base64');

  return function es9Request(method, requestPath, body, { contentType = 'application/json', timeout = 300_000, gzip = false } = {}) {
    const raw = body === undefined ? undefined : (typeof body === 'string' ? body : JSON.stringify(body));
    const payload = raw === undefined ? undefined : (gzip ? zlib.gzipSync(Buffer.from(raw)) : Buffer.from(raw));
    return new Promise((resolve, reject) => {
      const req = transport.request({
        host: env.ES9_HOST,
        port: Number(env.ES9_PORT),
        method,
        path: requestPath,
        agent,
        ...(protocol === 'https' ? { rejectUnauthorized: false } : {}),
        headers: {
          Authorization: `Basic ${auth}`,
          Accept: 'application/json',
          ...(gzip ? { 'Content-Encoding': 'gzip' } : {}),
          ...(payload ? { 'Content-Type': contentType, 'Content-Length': payload.length } : {}),
        },
        timeout,
      }, (res) => {
        const chunks = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8');
          let parsed;
          try { parsed = text ? JSON.parse(text) : null; } catch { parsed = text.slice(0, 3000); }
          resolve({ status: res.statusCode, body: parsed });
        });
      });
      req.on('timeout', () => req.destroy(new Error(`ES9 ${method} ${requestPath} timed out`)));
      req.on('error', reject);
      if (payload) req.write(payload);
      req.end();
    });
  };
}

function collectDateFormats(value, formats = []) {
  if (!value || typeof value !== 'object') return formats;
  if (value.type === 'date') formats.push(value.format);
  for (const child of Object.values(value)) collectDateFormats(child, formats);
  return formats;
}

export async function deployMasterTemplateEs9({
  env,
  es9Request,
  blueprintDir = DEFAULT_BLUEPRINT_DIR,
} = {}) {
  const resolvedEnv = env ?? await loadProjectEnv();
  const request = es9Request ?? createEs9Request(resolvedEnv);
  const root = path.resolve(blueprintDir);
  const info = requireSuccess('read ES9 root', await request('GET', '/'));
  if (!String(info.version?.number || '').startsWith('9.')) {
    throw new Error(`Expected Elasticsearch 9.x, received ${info.version?.number ?? 'unknown'}`);
  }
  const maxShardsPerNode = resolvedEnv.ES9_MAX_SHARDS_PER_NODE
    ? Number(resolvedEnv.ES9_MAX_SHARDS_PER_NODE)
    : undefined;
  if (maxShardsPerNode !== undefined) {
    if (!Number.isInteger(maxShardsPerNode) || maxShardsPerNode < 1000) {
      throw new Error(`Invalid ES9_MAX_SHARDS_PER_NODE: ${resolvedEnv.ES9_MAX_SHARDS_PER_NODE}`);
    }
    requireSuccess(
      'set ES9 maximum shards per node',
      await request('PUT', '/_cluster/settings', {
        persistent: { 'cluster.max_shards_per_node': maxShardsPerNode },
      }),
    );
  }

  const components = [];
  let sharedAnalysis;
  for (const [name, filename] of MASTER_COMPONENT_FILES) {
    const body = JSON.parse(await fs.readFile(path.join(root, filename), 'utf8'));
    body._meta = {
      ...(body._meta ?? {}),
      target_pattern: 'master*',
      deployed_by: 'ES5 to ES9 October 2026 migration',
      source_template: 'ES8 master-template-v1',
    };
    if (name === 'master-ct-content-settings-v1') {
      body.template.settings.number_of_shards = Number(resolvedEnv.ES9_MASTER_SHARDS || 1);
      body.template.settings.number_of_replicas = Number(resolvedEnv.ES9_MASTER_REPLICAS || 0);
      body.template.settings.refresh_interval = resolvedEnv.ES9_MASTER_REFRESH_INTERVAL || '30s';
      sharedAnalysis = deepClone(body.template.settings.analysis);
    }
    components.push([name, body]);
  }

  // Component templates are validated independently. Include the shared analyzer
  // on mapping components so folded_text resolves during each PUT.
  for (const [name, body] of components) {
    if (name !== 'master-ct-content-settings-v1' && body.template?.mappings) {
      body.template.settings = { ...(body.template.settings ?? {}), analysis: deepClone(sharedAnalysis) };
    }
    requireSuccess(`PUT component template ${name}`, await request('PUT', `/_component_template/${encodeURIComponent(name)}`, body));
  }

  const template = {
    index_patterns: ['master*'],
    priority: 500,
    version: 1,
    composed_of: MASTER_COMPONENT_FILES.map(([name]) => name),
    template: {},
    _meta: {
      owner: 'Kompa Data Platform',
      source_template: 'ES8 master-template-v1',
      date_routing: 'masterYYYYMMDD from publishedDate in Asia/Ho_Chi_Minh',
      date_mapping_format: 'strict_date_time',
    },
  };
  requireSuccess(`PUT index template ${MASTER_TEMPLATE_NAME}`, await request('PUT', `/_index_template/${MASTER_TEMPLATE_NAME}`, template));

  const simulation = requireSuccess(
    'simulate ES9 master template',
    await request('POST', '/_index_template/_simulate_index/master20261001'),
  );
  const dateFormats = collectDateFormats(simulation.template?.mappings?.properties);
  if (!dateFormats.length || dateFormats.some((format) => format !== 'strict_date_time')) {
    throw new Error(`Unexpected ES9 date formats: ${JSON.stringify(dateFormats)}`);
  }
  if (Number(simulation.template?.settings?.index?.number_of_replicas) !== Number(resolvedEnv.ES9_MASTER_REPLICAS || 0)) {
    throw new Error('Simulated ES9 template has an unexpected replica count');
  }

  return {
    cluster_name: info.cluster_name,
    version: info.version.number,
    index_template: MASTER_TEMPLATE_NAME,
    component_templates: MASTER_COMPONENT_FILES.map(([name]) => name),
    index_patterns: template.index_patterns,
    shards: Number(resolvedEnv.ES9_MASTER_SHARDS || 1),
    replicas: Number(resolvedEnv.ES9_MASTER_REPLICAS || 0),
    date_fields_checked: dateFormats.length,
    max_shards_per_node: maxShardsPerNode,
  };
}
