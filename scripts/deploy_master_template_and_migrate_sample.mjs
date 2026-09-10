import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import https from 'node:https';
import { Client } from '@opensearch-project/opensearch';
import { deepClone } from './lib/node_compat.mjs';

const [sourceIndex = 'topic56fc9bc282ea19d067e5d8a1', requestedLimit = '1000', blueprintDir = 'outputs/01a07164-8064-7313-962f-0d73887aa809/es8-blueprint-v1', reportDir = 'outputs/01a07164-8064-7313-962f-0d73887aa809/master-migration'] = process.argv.slice(2);
if (!/^topic[a-f0-9]+$/.test(sourceIndex)) throw new Error(`Unexpected source index: ${sourceIndex}`);
const limit = Number(requestedLimit);
if (!Number.isInteger(limit) || limit < 1 || limit > 10_000) throw new Error(`Sample limit must be 1..10000, received ${requestedLimit}`);

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
if (!env.ES7_HOST || !env.ES8_HOST || !env.ES8_USER || !env.ES8_PASS) throw new Error('Missing ES7/ES8 connection variables');

const es7 = new Client({ node: env.ES7_HOST, maxRetries: 2, requestTimeout: 120_000 });
const adminAuth = Buffer.from(`${env.ES8_USER}:${env.ES8_PASS}`).toString('base64');

function es8Request(method, requestPath, body, { auth = adminAuth, contentType = 'application/json', timeout = 120_000 } = {}) {
  const payload = body === undefined ? undefined : (typeof body === 'string' ? body : JSON.stringify(body));
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
        ...(payload ? { 'Content-Type': contentType, 'Content-Length': Buffer.byteLength(payload) } : {}),
      },
      timeout,
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
    req.on('timeout', () => req.destroy(new Error(`ES8 ${method} ${requestPath} timed out`)));
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

function requireSuccess(label, response) {
  if (response.status < 200 || response.status >= 300) {
    const detail = typeof response.body === 'string' ? response.body : JSON.stringify(response.body);
    throw new Error(`${label} failed with HTTP ${response.status}: ${detail.slice(0, 3000)}`);
  }
  return response.body;
}

const DATE_FORMAT = 'strict_date_time';
const ROUTING_TIMEZONE = 'Asia/Ho_Chi_Minh';
const componentFiles = [
  ['master-ct-content-settings-v1', 'k2-ct-content-settings-v1.json'],
  ['master-ct-common-meta-v1', 'k2-ct-common-meta-v1.json'],
  ['master-ct-content-core-v1', 'k2-ct-content-core-v1.json'],
  ['master-ct-content-text-v1', 'k2-ct-content-text-v1.json'],
  ['master-ct-intelligence-current-v1', 'k2-ct-intelligence-current-v1.json'],
];

const componentBodies = [];
let sharedAnalysis;
for (const [name, filename] of componentFiles) {
  const body = JSON.parse(await fs.readFile(path.join(blueprintDir, filename), 'utf8'));
  body._meta = { ...(body._meta ?? {}), target_pattern: 'master*', deployed_by: 'sample ES7 to ES8 migration' };
  if (name === 'master-ct-content-settings-v1') {
    body.template.settings.number_of_shards = 1;
    body.template.settings.number_of_replicas = 0;
    body.template.settings.refresh_interval = '30s';
    sharedAnalysis = deepClone(body.template.settings.analysis);
  }
  componentBodies.push([name, body]);
}
for (const [name, body] of componentBodies) {
  if (name !== 'master-ct-content-settings-v1' && body.template?.mappings) {
    body.template.settings = { ...(body.template.settings ?? {}), analysis: deepClone(sharedAnalysis) };
  }
}

const indexTemplateName = 'master-template-v1';
const indexTemplate = {
  index_patterns: ['master*'],
  priority: 500,
  version: 1,
  composed_of: componentFiles.map(([name]) => name),
  template: {},
  _meta: {
    owner: 'Kompa Data Platform',
    source_index: sourceIndex,
    date_routing: `masterYYYYMMDD from publishedDate in ${ROUTING_TIMEZONE}`,
    date_mapping_format: DATE_FORMAT,
  },
};

for (const [name, body] of componentBodies) {
  requireSuccess(`PUT component template ${name}`, await es8Request('PUT', `/_component_template/${encodeURIComponent(name)}`, body));
}
requireSuccess(`PUT index template ${indexTemplateName}`, await es8Request('PUT', `/_index_template/${encodeURIComponent(indexTemplateName)}`, indexTemplate));
const simulation = requireSuccess('simulate master index template', await es8Request('POST', '/_index_template/_simulate_index/master20260908'));
const simulatedDateFormats = [];
function collectDateFormats(value) {
  if (!value || typeof value !== 'object') return;
  if (value.type === 'date') simulatedDateFormats.push(value.format);
  for (const child of Object.values(value)) collectDateFormats(child);
}
collectDateFormats(simulation.template?.mappings?.properties);
if (!simulatedDateFormats.length || simulatedDateFormats.some((value) => value !== DATE_FORMAT)) {
  throw new Error(`Simulated template date formats are inconsistent: ${JSON.stringify(simulatedDateFormats)}`);
}

const unwrap = (response) => response?.body ?? response;
const searchResponse = await es7.search({
  index: sourceIndex,
  version: true,
  body: {
    size: limit,
    track_total_hits: false,
    sort: [{ _doc: 'asc' }],
    query: {
      bool: {
        filter: [{ exists: { field: 'publishedDate' } }],
        must_not: [{ terms: { type: ['fbEventTopic', 'fbEventComment'] } }],
      },
    },
  },
});
const hits = unwrap(searchResponse)?.hits?.hits ?? [];
if (hits.length !== limit) throw new Error(`Expected ${limit} ES7 hits, received ${hits.length}`);

function toIsoDate(value) {
  if (value === null || value === undefined || value === '') return undefined;
  let date;
  if (typeof value === 'number' || /^-?\d+(?:\.\d+)?$/.test(String(value).trim())) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return undefined;
    date = new Date(Math.abs(numeric) < 100000000000 ? numeric * 1000 : numeric);
  } else date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

function indexNameFromPublishedDate(value) {
  const iso = toIsoDate(value);
  if (!iso) throw new Error(`Invalid publishedDate: ${String(value)}`);
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone: ROUTING_TIMEZONE,
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date(iso)).filter((part) => part.type !== 'literal').map((part) => [part.type, part.value]));
  return `master${parts.year}${parts.month}${parts.day}`;
}

function platformFrom(source) {
  const type = String(source.type ?? '').toLowerCase();
  const url = String(source.url ?? '').toLowerCase();
  if (type.includes('tiktok') || url.includes('tiktok.com')) return 'tiktok';
  if (type.startsWith('fb') || url.includes('facebook.com')) return 'facebook';
  if (type.startsWith('threads') || url.includes('threads.com') || url.includes('threads.net')) return 'threads';
  if (url.includes('instagram.com')) return 'instagram';
  if (type.startsWith('sns')) return 'sns';
  if (url.includes('youtube.com') || url.includes('youtu.be')) return 'youtube';
  if (type.startsWith('linkedin') || url.includes('linkedin.com')) return 'linkedin';
  if (type.startsWith('news')) return 'news';
  if (type.startsWith('forum')) return 'forum';
  if (type.startsWith('ecommerce')) return 'ecommerce';
  if (type.startsWith('review')) return 'review';
  return 'web';
}

function contentTypeFrom(value) {
  const normalized = String(value ?? '').toLowerCase();
  if (normalized.includes('comment')) return 'COMMENT';
  if (normalized.includes('video')) return 'VIDEO';
  if (normalized.includes('topic') || normalized.includes('post')) return 'POST';
  return 'OTHER';
}

function hostnameFromPlatform(platform) {
  return ({ facebook: 'facebook.com', tiktok: 'tiktok.com', instagram: 'instagram.com', threads: 'threads.com', youtube: 'youtube.com', linkedin: 'linkedin.com' })[platform];
}

function domainFrom(...values) {
  for (const value of values) {
    const candidate = String(value ?? '').trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
    if (/^(?:[a-z0-9-]+\.)+[a-z]{2,}$/i.test(candidate)) return candidate;
  }
  return undefined;
}

function siteRootUrlFrom(source) {
  try {
    const parsed = new URL(source.url);
    if (['http:', 'https:'].includes(parsed.protocol)) return parsed.origin;
  } catch {}
  const domain = domainFrom(source.hostname, source.siteName, source.siteId, source.profile?.id);
  return domain ? `https://${domain}` : undefined;
}

function stableId(value) {
  const id = String(value ?? '').trim().replace(/^@/, '');
  return id || undefined;
}

function cleanUsername(value) {
  const id = stableId(value);
  return id && !/^\d+$/.test(id) && !/\s/.test(id) ? id : undefined;
}

function youtubeChannelUrl(id, name) {
  const channelId = stableId(id);
  if (/^UC[A-Za-z0-9_-]+$/.test(channelId ?? '')) return `https://www.youtube.com/channel/${channelId}`;
  const handle = String(name ?? '').trim();
  return handle.startsWith('@') ? `https://www.youtube.com/${handle}` : undefined;
}

function authorUrlFrom(source, platform) {
  const id = stableId(source.profile?.id);
  if (platform === 'facebook' && id) return `https://www.facebook.com/${id}`;
  if (platform === 'tiktok' && id) return `https://www.tiktok.com/@${id}`;
  if (platform === 'instagram' && id) return `https://www.instagram.com/@${id}`;
  if (platform === 'threads' && id) return `https://www.threads.com/@${id}`;
  if (platform === 'youtube') return youtubeChannelUrl(id, source.profile?.name);
  return siteRootUrlFrom(source);
}

function sourceUrlFrom(source, platform) {
  const id = stableId(source.siteId);
  const type = String(source.type ?? '').toLowerCase();
  if (platform === 'facebook' && id) {
    if (type.startsWith('fbgroup')) return `https://www.facebook.com/groups/${id}`;
    return `https://www.facebook.com/${id}`;
  }
  if (platform === 'tiktok' && id) return `https://www.tiktok.com/@${id}`;
  if (platform === 'instagram' && id) return `https://www.instagram.com/@${id}`;
  if (platform === 'threads' && id) return `https://www.threads.com/@${id}`;
  if (platform === 'youtube') return youtubeChannelUrl(id, source.siteName);
  return siteRootUrlFrom(source);
}

function sourceTypeFrom(value, platform) {
  const type = String(value ?? '').toLowerCase();
  if (type.startsWith('fbpage')) return 'PAGE';
  if (type.startsWith('fbgroup')) return 'GROUP';
  if (type.startsWith('fbuser')) return 'USER';
  if (platform === 'youtube') return 'CHANNEL';
  if (platform === 'news') return 'SITE';
  if (platform === 'forum') return 'FORUM';
  if (platform === 'ecommerce') return 'STORE';
  if (platform === 'review') return 'PLACE';
  if (['web', 'sns'].includes(platform)) return 'SITE';
  return 'ACCOUNT';
}

function sentimentFrom(source) {
  const raw = source.inference?.sentiment ?? source.sentiment?.value ?? source.sentiment ?? -1;
  const numeric = Number(raw);
  if (Number.isFinite(numeric)) return ({ 1: 'POSITIVE', 2: 'NEGATIVE', 3: 'NEUTRAL', '-1': 'NONE' })[numeric] ?? 'NONE';
  const normalized = String(raw ?? '').trim().toUpperCase();
  if (normalized === 'POSITIVE') return 'POSITIVE';
  if (['NEGATIVE', 'NEGA'].includes(normalized)) return 'NEGATIVE';
  if (normalized === 'NEUTRAL') return 'NEUTRAL';
  return 'NONE';
}

function asLong(value) {
  if (value === null || value === undefined || value === '') return undefined;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.trunc(numeric) : undefined;
}

function nonEmptyObject(object) {
  return Object.fromEntries(Object.entries(object).filter(([, value]) => value !== undefined && value !== null && value !== '' && (!Array.isArray(value) || value.length > 0)));
}

function tagValues(values) {
  return [...new Set((Array.isArray(values) ? values : []).map((item) => item && typeof item === 'object' ? item.value : item).filter((value) => value !== undefined && value !== null && value !== '').map(String))];
}

const intelligenceKeys = ['advertisement', 'angle', 'audience', 'category', 'emotion', 'industry', 'intensity', 'intent', 'product_type', 'purpose', 'severity', 'spam', 'subject', 'subtopic', 'topic', 'tone'];

function transformDocument(hit) {
  const source = hit._source ?? {};
  const platform = platformFrom(source);
  const contentType = contentTypeFrom(source.contentType ?? source.type);
  const hostname = hostnameFromPlatform(platform) ?? (() => { try { return new URL(source.url).hostname.replace(/^www\./, ''); } catch { return source.hostname; } })();
  const profileId = stableId(source.profile?.id);
  const siteId = stableId(source.siteId);
  const detailed = source.detailInteraction ?? {};
  const inference = source.inference ?? {};
  const entityRows = Array.isArray(inference.entity_recognition) ? inference.entity_recognition : (Array.isArray(source.entity_recognition) ? source.entity_recognition : []);
  const contextRows = Array.isArray(inference.context) ? inference.context : (Array.isArray(source.context) ? source.context : []);
  const intelligence = { sentiment: sentimentFrom(source), sentiment_score: inference.polarity ?? source.polarity };
  for (const key of intelligenceKeys) intelligence[key] = inference[key] ?? source[key];
  intelligence.entities = entityRows.map((item) => nonEmptyObject({ type: item?.type, value: item?.value })).filter((item) => Object.keys(item).length);
  intelligence.context = contextRows.map((item) => nonEmptyObject({ value: item?.value, sentiment: item?.sentiment })).filter((item) => Object.keys(item).length);
  intelligence.explanation = inference.explanation ?? source.explanation;

  const document = {
    content_id: `content:${platform}:${contentType.toLowerCase()}:${hit._id}`,
    schema_version: '1.0.0',
    projection_version: 'content-projector-sample-v1',
    source_document_version: hit._version,
    published_at: toIsoDate(source.publishedDate),
    collected_at: toIsoDate(source.insertedDate),
    updated_at: toIsoDate(source.updatedDate),
    last_seen_at: toIsoDate(source.lastVisitDate),
    platform,
    content_type: contentType,
    external_id: String(hit._id),
    url: source.url,
    origin_url: source.originLink,
    author: nonEmptyObject({
      id: profileId,
      canonical_id: profileId ? `profile:${platform}:${profileId}` : undefined,
      name: source.profile?.name,
      username: ['tiktok', 'instagram', 'threads'].includes(platform) ? cleanUsername(profileId) : undefined,
      platform,
      hostname,
      url: authorUrlFrom(source, platform),
    }),
    parent_content_id: source.parentId ? `content:${platform}:${source.parentId}` : undefined,
    relations: nonEmptyObject({
      parent_published_at: toIsoDate(source.parentDate),
      comment_parent_content_id: source.commentParentId ? `content:${platform}:${source.commentParentId}` : undefined,
    }),
    language: nonEmptyObject({ code: String(source.lang ?? source.locale?.language ?? '').toLowerCase() || undefined }),
    source: nonEmptyObject({
      id: siteId,
      name: source.siteName,
      username: ['tiktok', 'instagram', 'threads'].includes(platform) ? cleanUsername(siteId) : undefined,
      type: sourceTypeFrom(source.type, platform),
      platform,
      hostname,
      url: sourceUrlFrom(source, platform),
    }),
    locale: nonEmptyObject({
      region: source.locale?.region,
      country_code: String(source.locale?.country ?? '').toLowerCase() === 'vietnam' ? 'VN' : source.locale?.country,
      language_code: String(source.locale?.language ?? '').toLowerCase() || undefined,
      timezone: source.locale?.timezone === '+7' || source.locale?.timezone === '7' ? '+07:00' : source.locale?.timezone,
      location_name: typeof source.locale?.location === 'string' ? source.locale.location : undefined,
      address: source.locale?.address,
      geographic: source.locale?.geographic,
    }),
    engagement_current: nonEmptyObject({
      likes: asLong(source.likes),
      shares: asLong(source.shares ?? detailed.shares),
      comments: asLong(source.comments ?? detailed.comments),
      interactions: asLong(source.interactions),
      views: asLong(source.views ?? detailed.views),
      reactions: nonEmptyObject({
        total: asLong(detailed.reactions), like: asLong(detailed.like), love: asLong(detailed.love), care: asLong(detailed.care), haha: asLong(detailed.haha), wow: asLong(detailed.wow), sad: asLong(detailed.sad), angry: asLong(detailed.angry), reposts: asLong(detailed.reposts), saved: asLong(detailed.saved),
      }),
    }),
    match_context_ids: (Array.isArray(source.filters) ? source.filters : []).map((value) => `context:legacy:${value}`),
    flags: nonEmptyObject({ is_deleted: source.isDeleted, has_translation: source.hasTranslateBuzz ?? false, was_updated: source.updatedBuzz, mentions_main_brand: inference.mention_mainbrand ?? source.mention_mainbrand }),
    lifecycle: nonEmptyObject({ content_status: source.contentStatus, privacy: source.privacy }),
    tags: nonEmptyObject({ labels: tagValues(source.labels), campaigns: tagValues(source.campaignTags), crises: tagValues(source.crisisTags), processing: tagValues(source.processingTag) }),
    content_spans: (Array.isArray(source.contentTags) ? source.contentTags : []).map((item) => nonEmptyObject({ type: item?.type, value: item?.value, offset: asLong(item?.offset), length: asLong(item?.length) })).filter((item) => Object.keys(item).length),
    translations: (Array.isArray(source.translateBuzz) ? source.translateBuzz : []).map((item) => nonEmptyObject({ language_code: String(item?.lang ?? '').toLowerCase() || undefined, content: item?.content, title: item?.title, description: item?.description, summary: item?.contentSummary })).filter((item) => Object.keys(item).length),
    media: nonEmptyObject({ preview_url: source.picture, shared_value: source.sharedMedia?.value == null ? undefined : String(source.sharedMedia.value) }),
    text: nonEmptyObject({ original: source.content, normalized: String(source.content ?? '').trim().normalize('NFC'), title: source.title, description: source.description, caption: source.caption, story: source.story, share_name: source.shareName, summary: source.contentSummary }),
    intelligence_current: nonEmptyObject(intelligence),
    lineage: nonEmptyObject({ source_index: sourceIndex, source_document_id: String(hit._id), collector: source.ds?.source, migrated_at: new Date().toISOString() }),
  };
  return nonEmptyObject(document);
}

const transformed = hits.map((hit) => ({ index: indexNameFromPublishedDate(hit._source?.publishedDate), id: `content:${platformFrom(hit._source ?? {})}:${contentTypeFrom(hit._source?.contentType ?? hit._source?.type).toLowerCase()}:${hit._id}`, source: transformDocument(hit) }));
const targetIndices = [...new Set(transformed.map((item) => item.index))].sort();

for (const index of targetIndices) {
  const existing = await es8Request('HEAD', `/${encodeURIComponent(index)}`);
  if (existing.status === 404) requireSuccess(`create index ${index}`, await es8Request('PUT', `/${encodeURIComponent(index)}`));
  else if (existing.status !== 200) requireSuccess(`check index ${index}`, existing);
}

const bulkFailures = [];
let indexed = 0;
for (let offset = 0; offset < transformed.length; offset += 200) {
  const chunk = transformed.slice(offset, offset + 200);
  const lines = [];
  for (const item of chunk) {
    lines.push(JSON.stringify({ index: { _index: item.index, _id: item.id } }));
    lines.push(JSON.stringify(item.source));
  }
  const bulk = requireSuccess(`bulk chunk ${offset / 200 + 1}`, await es8Request('POST', '/_bulk?refresh=false', `${lines.join('\n')}\n`, { contentType: 'application/x-ndjson', timeout: 180_000 }));
  for (const entry of bulk.items ?? []) {
    const result = entry.index;
    if (result?.error) bulkFailures.push({ index: result._index, id: result._id, status: result.status, error: result.error });
    else indexed += 1;
  }
  console.log(JSON.stringify({ stage: 'bulk', processed: Math.min(offset + chunk.length, transformed.length), indexed, failures: bulkFailures.length }));
}
if (bulkFailures.length) throw new Error(`Bulk migration had ${bulkFailures.length} failures: ${JSON.stringify(bulkFailures.slice(0, 10))}`);
requireSuccess('refresh target indices', await es8Request('POST', `/${targetIndices.map(encodeURIComponent).join(',')}/_refresh`));

const ids = transformed.map((item) => item.id);
const verification = requireSuccess('verify migrated IDs', await es8Request('POST', `/${targetIndices.map(encodeURIComponent).join(',')}/_search`, {
  size: 0,
  track_total_hits: true,
  query: { ids: { values: ids } },
  aggs: { by_index: { terms: { field: '_index', size: 1000, order: { _key: 'asc' } } } },
}));
const verifiedCount = typeof verification.hits?.total === 'number' ? verification.hits.total : verification.hits?.total?.value;
if (verifiedCount !== limit) throw new Error(`Verification expected ${limit} migrated IDs, found ${verifiedCount}`);

const roleName = 'master_readonly';
const username = 'master_reader';
const password = `${crypto.randomBytes(18).toString('base64url')}!A7`;
requireSuccess(`create role ${roleName}`, await es8Request('PUT', `/_security/role/${roleName}`, {
  cluster: [],
  indices: [{ names: ['master*'], privileges: ['read', 'view_index_metadata'], allow_restricted_indices: false }],
  applications: [],
  run_as: [],
  metadata: { purpose: 'Read-only access to master* indices' },
}));
requireSuccess(`create user ${username}`, await es8Request('PUT', `/_security/user/${username}`, {
  password,
  roles: [roleName],
  full_name: 'Master indices read-only',
  metadata: { purpose: 'Read-only access to master* indices' },
}));

const readerAuth = Buffer.from(`${username}:${password}`).toString('base64');
const readerPrivileges = requireSuccess('verify read-only user privileges', await es8Request('POST', '/_security/user/_has_privileges', {
  cluster: ['monitor', 'manage_security'],
  index: [{ names: ['master*'], privileges: ['read', 'view_index_metadata', 'write', 'create_index', 'delete_index', 'manage'] }],
}, { auth: readerAuth }));
const readerIndexPrivileges = readerPrivileges.index?.['master*'] ?? {};
if (readerIndexPrivileges.read !== true || readerIndexPrivileges.view_index_metadata !== true) throw new Error('Read-only user is missing required read privileges');
if (['write', 'create_index', 'delete_index', 'manage'].some((privilege) => readerIndexPrivileges[privilege] !== false)) throw new Error(`Read-only user unexpectedly has mutation privilege: ${JSON.stringify(readerIndexPrivileges)}`);

await fs.mkdir(reportDir, { recursive: true });
const credentialsPath = path.join(reportDir, 'master_reader.credentials.txt');
await fs.writeFile(credentialsPath, `endpoint=https://${env.ES8_HOST}:${env.ES8_PORT || 9200}\nusername=${username}\npassword=${password}\nrole=${roleName}\nindex_pattern=master*\n`, { mode: 0o600 });
await fs.chmod(credentialsPath, 0o600);
const reportPath = path.join(reportDir, 'migration-report.json');
const report = {
  completed_at: new Date().toISOString(),
  source_index: sourceIndex,
  requested_documents: limit,
  fetched_documents: hits.length,
  indexed_documents: indexed,
  verified_documents: verifiedCount,
  ignored_types: ['fbEventTopic', 'fbEventComment'],
  routing_timezone: ROUTING_TIMEZONE,
  target_indices: targetIndices,
  per_index_counts: (verification.aggregations?.by_index?.buckets ?? []).map((bucket) => ({ index: bucket.key, count: bucket.doc_count })),
  template: { name: indexTemplateName, component_templates: componentFiles.map(([name]) => name), date_format: DATE_FORMAT, simulated_date_fields: simulatedDateFormats.length },
  readonly_user: {
    username,
    role: roleName,
    index_pattern: 'master*',
    read: readerIndexPrivileges.read,
    view_index_metadata: readerIndexPrivileges.view_index_metadata,
    write: readerIndexPrivileges.write,
    create_index: readerIndexPrivileges.create_index,
    delete_index: readerIndexPrivileges.delete_index,
    manage: readerIndexPrivileges.manage,
    credentials_file: credentialsPath,
  },
};
await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);

console.log(JSON.stringify({
  success: true,
  sourceIndex,
  indexed,
  verifiedCount,
  targetIndices,
  indexTemplateName,
  roleName,
  username,
  credentialsPath,
  reportPath,
  password_written_to_file_only: true,
}, null, 2));
