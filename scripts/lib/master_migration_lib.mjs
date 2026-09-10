import fs from 'node:fs/promises';
import path from 'node:path';
import https from 'node:https';
import zlib from 'node:zlib';
import { Client } from '@opensearch-project/opensearch';

export const ROUTING_TIMEZONE = 'Asia/Ho_Chi_Minh';
export const IGNORED_TYPES = ['fbEventTopic', 'fbEventComment'];

export async function loadMigrationContext() {
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
  const es7 = new Client({ node: env.ES7_HOST, maxRetries: 3, requestTimeout: 180_000, compression: 'gzip', suggestCompression: true });
  const adminAuth = Buffer.from(`${env.ES8_USER}:${env.ES8_PASS}`).toString('base64');
  const es8Agent = new https.Agent({ keepAlive: true, maxSockets: 8, maxFreeSockets: 8, rejectUnauthorized: false });

  function es8Request(method, requestPath, body, { contentType = 'application/json', timeout = 180_000, gzip = false } = {}) {
    const rawPayload = body === undefined ? undefined : (typeof body === 'string' ? body : JSON.stringify(body));
    const payload = rawPayload === undefined ? undefined : (gzip ? zlib.gzipSync(Buffer.from(rawPayload)) : rawPayload);
    return new Promise((resolve, reject) => {
      const req = https.request({
        host: env.ES8_HOST,
        port: Number(env.ES8_PORT || 9200),
        method,
        path: requestPath,
        rejectUnauthorized: false,
        agent: es8Agent,
        headers: {
          Authorization: `Basic ${adminAuth}`,
          Accept: 'application/json',
          ...(gzip ? { 'Content-Encoding': 'gzip' } : {}),
          ...(payload ? { 'Content-Type': contentType, 'Content-Length': Buffer.byteLength(payload) } : {}),
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
      req.on('timeout', () => req.destroy(new Error(`ES8 ${method} ${requestPath} timed out`)));
      req.on('error', reject);
      if (payload) req.write(payload);
      req.end();
    });
  }

  return { env, es7, es8Request };
}

export function requireSuccess(label, response) {
  if (response.status < 200 || response.status >= 300) {
    throw new Error(`${label} failed with HTTP ${response.status}: ${JSON.stringify(response.body).slice(0, 3000)}`);
  }
  return response.body;
}

export function toIsoDate(value) {
  if (value === null || value === undefined || value === '') return undefined;
  let date;
  if (typeof value === 'number' || /^-?\d+(?:\.\d+)?$/.test(String(value).trim())) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return undefined;
    date = new Date(Math.abs(numeric) < 100000000000 ? numeric * 1000 : numeric);
  } else date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

const dateFormatter = new Intl.DateTimeFormat('en-US', { timeZone: ROUTING_TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit' });
export function indexNameFromPublishedDate(value) {
  const iso = toIsoDate(value);
  if (!iso) throw new Error(`Invalid publishedDate: ${String(value)}`);
  const parts = Object.fromEntries(dateFormatter.formatToParts(new Date(iso)).filter((part) => part.type !== 'literal').map((part) => [part.type, part.value]));
  return `master${parts.year}${parts.month}${parts.day}`;
}

export function utcBoundsForVietnamDay(day) {
  if (!/^\d{8}$/.test(day)) throw new Error(`Invalid day: ${day}`);
  const year = Number(day.slice(0, 4));
  const month = Number(day.slice(4, 6));
  const date = Number(day.slice(6, 8));
  const start = new Date(Date.UTC(year, month - 1, date) - 7 * 60 * 60 * 1000);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return { gte: start.toISOString(), lt: end.toISOString() };
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

export function transformDocument(hit, sourceIndex, projectionVersion = 'content-projector-full-v1') {
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

  const contentId = `content:${platform}:${contentType.toLowerCase()}:${hit._id}`;
  const document = {
    content_id: contentId,
    schema_version: '1.0.0',
    projection_version: projectionVersion,
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
    author: nonEmptyObject({ id: profileId, canonical_id: profileId ? `profile:${platform}:${profileId}` : undefined, name: source.profile?.name, username: ['tiktok', 'instagram', 'threads'].includes(platform) ? cleanUsername(profileId) : undefined, platform, hostname, url: authorUrlFrom(source, platform) }),
    parent_content_id: source.parentId ? `content:${platform}:${source.parentId}` : undefined,
    relations: nonEmptyObject({ parent_published_at: toIsoDate(source.parentDate), comment_parent_content_id: source.commentParentId ? `content:${platform}:${source.commentParentId}` : undefined }),
    language: nonEmptyObject({ code: String(source.lang ?? source.locale?.language ?? '').toLowerCase() || undefined }),
    source: nonEmptyObject({ id: siteId, name: source.siteName, username: ['tiktok', 'instagram', 'threads'].includes(platform) ? cleanUsername(siteId) : undefined, type: sourceTypeFrom(source.type, platform), platform, hostname, url: sourceUrlFrom(source, platform) }),
    locale: nonEmptyObject({ region: source.locale?.region, country_code: String(source.locale?.country ?? '').toLowerCase() === 'vietnam' ? 'VN' : source.locale?.country, language_code: String(source.locale?.language ?? '').toLowerCase() || undefined, timezone: source.locale?.timezone === '+7' || source.locale?.timezone === '7' ? '+07:00' : source.locale?.timezone, location_name: typeof source.locale?.location === 'string' ? source.locale.location : undefined, address: source.locale?.address, geographic: source.locale?.geographic }),
    engagement_current: nonEmptyObject({ likes: asLong(source.likes), shares: asLong(source.shares ?? detailed.shares), comments: asLong(source.comments ?? detailed.comments), interactions: asLong(source.interactions), views: asLong(source.views ?? detailed.views), reactions: nonEmptyObject({ total: asLong(detailed.reactions), like: asLong(detailed.like), love: asLong(detailed.love), care: asLong(detailed.care), haha: asLong(detailed.haha), wow: asLong(detailed.wow), sad: asLong(detailed.sad), angry: asLong(detailed.angry), reposts: asLong(detailed.reposts), saved: asLong(detailed.saved) }) }),
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
  return { index: indexNameFromPublishedDate(source.publishedDate), id: contentId, source: nonEmptyObject(document) };
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

export async function ensureIndex(es8Request, index) {
  const exists = await es8Request('HEAD', `/${encodeURIComponent(index)}`);
  if (exists.status === 200) return false;
  if (exists.status !== 404) requireSuccess(`check index ${index}`, exists);
  requireSuccess(`create index ${index}`, await es8Request('PUT', `/${encodeURIComponent(index)}`));
  return true;
}

export async function bulkUpsert(es8Request, items, { chunkSize = 500, concurrency = 1, onProgress } = {}) {
  let processed = 0;
  let succeeded = 0;
  let failed = 0;
  const chunks = [];
  for (let offset = 0; offset < items.length; offset += chunkSize) chunks.push(items.slice(offset, offset + chunkSize));
  let nextChunk = 0;

  async function runChunk(originalChunk) {
    let pending = originalChunk;
    for (let attempt = 0; attempt < 6 && pending.length; attempt += 1) {
      const lines = [];
      for (const item of pending) {
        const deleteFrom = Array.isArray(item.deleteFrom) ? item.deleteFrom : (item.deleteFrom ? [item.deleteFrom] : []);
        for (const index of deleteFrom) lines.push(JSON.stringify({ delete: { _index: index, _id: item.id } }));
        lines.push(JSON.stringify({ index: { _index: item.index, _id: item.id } }));
        lines.push(JSON.stringify(item.source));
      }
      const response = await es8Request('POST', '/_bulk?refresh=false', `${lines.join('\n')}\n`, { contentType: 'application/x-ndjson', timeout: 300_000, gzip: true });
      if (response.status === 429 || response.status >= 500) {
        if (attempt === 5) requireSuccess('bulk request', response);
        await delay(Math.min(1000 * (2 ** attempt), 15_000));
        continue;
      }
      const body = requireSuccess('bulk request', response);
      const nextPending = [];
      let sourceIndex = 0;
      for (const operation of body.items ?? []) {
        if (operation.delete) continue;
        const result = operation.index;
        const item = pending[sourceIndex++];
        if (result?.error) {
          if ([429, 502, 503, 504].includes(result.status) && attempt < 5) nextPending.push(item);
          else throw new Error(`Bulk item failed for ${result?._index}/${result?._id}: ${JSON.stringify(result?.error)}`);
        } else succeeded += 1;
      }
      pending = nextPending;
      if (pending.length) await delay(Math.min(1000 * (2 ** attempt), 15_000));
    }
    processed += originalChunk.length;
    if (onProgress) onProgress({ processed, succeeded, failed });
  }

  async function worker() {
    while (true) {
      const index = nextChunk++;
      if (index >= chunks.length) return;
      await runChunk(chunks[index]);
    }
  }

  const workerCount = Math.max(1, Math.min(Math.trunc(concurrency) || 1, chunks.length || 1));
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return { processed, succeeded, failed };
}

export async function acquireLock(lockPath) {
  await fs.mkdir(path.dirname(lockPath), { recursive: true });
  try {
    const handle = await fs.open(lockPath, 'wx');
    await handle.writeFile(`${process.pid}\n`);
    await handle.close();
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
    const pid = Number((await fs.readFile(lockPath, 'utf8')).trim());
    try { process.kill(pid, 0); throw new Error(`Migration already running with PID ${pid}`); }
    catch (signalError) {
      if (signalError.message?.startsWith('Migration already')) throw signalError;
      await fs.unlink(lockPath);
      const handle = await fs.open(lockPath, 'wx');
      await handle.writeFile(`${process.pid}\n`);
      await handle.close();
    }
  }
  return async () => { await fs.unlink(lockPath).catch(() => {}); };
}
