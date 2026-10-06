import fs from 'node:fs/promises';
import path from 'node:path';
import ES5ClientPkg from 'elasticsearch';
import {
  IGNORED_TYPES,
  acquireLock,
  ensureIndex,
  indexNameFromPublishedDate,
  loadMigrationContext,
  requireSuccess,
  searchSlice,
  toIsoDate,
} from './master_migration_lib.mjs';
import { deepClone } from './node_compat.mjs';

export const ES5_FULL_START = '2026-07-31T17:00:00.000Z'; // 2026-08-01 00:00:00 Asia/Ho_Chi_Minh
export const ES5_RECENT_LOOKBACK = 'now-6h';
export const ES5_SOURCE_INDEX_SELECTION_VERSION = 'weekly-v1';
const ES5_SOURCE_INDEX_CACHE_VERSION = 3;
const currentVietnamYear = Number(new Intl.DateTimeFormat('en-US', {
  timeZone: 'Asia/Ho_Chi_Minh',
  year: 'numeric',
}).format(new Date()));
export { acquireLock };

const compatibilityProperties = {
  lineage: {
    type: 'object',
    dynamic: 'strict',
    properties: {
      legacy_source_index: { type: 'keyword', ignore_above: 512 },
      legacy_source_document_id: { type: 'keyword', ignore_above: 512 },
      legacy_source_type: { type: 'keyword', ignore_above: 512 },
      legacy_source_version: { type: 'long' },
      legacy_migrated_at: { type: 'date', format: 'strict_date_time' },
    },
  },
  engagement_current: {
    type: 'object',
    dynamic: 'strict',
    properties: {
      reactions: {
        type: 'object',
        dynamic: 'strict',
        properties: {
          pride: { type: 'long' },
          thankful: { type: 'long' },
        },
      },
    },
  },
  crawl_metrics: {
    type: 'object',
    dynamic: 'strict',
    properties: {
      delay_crawler_ms: { type: 'long' },
      delay_mongo_ms: { type: 'long' },
      delay_es_ms: { type: 'long' },
      delay_total_ms: { type: 'long' },
      total_crawled_comments: { type: 'long' },
    },
  },
};

export async function loadEs5MigrationContext() {
  const context = await loadMigrationContext();
  if (!context.env.ES5_HOST) throw new Error('Missing ES5_HOST');
  const ES5Client = ES5ClientPkg.Client || ES5ClientPkg;
  const es5 = new ES5Client({
    host: context.env.ES5_HOST,
    log: 'error',
    requestTimeout: 300_000,
    maxRetries: 3,
    keepAlive: true,
  });
  return { ...context, es5 };
}

export function isValidEs5WeeklyIndex(name) {
  const match = /^master(\d{4})(\d{2})$/.exec(name);
  if (!match) return false;
  const year = Number(match[1]);
  const week = Number(match[2]);
  return year >= 2000 && year <= currentVietnamYear && week >= 1 && week <= 53;
}

export function selectEs5SourceIndices(rows) {
  return rows
    .filter((row) => row.status === 'open' && isValidEs5WeeklyIndex(row.index))
    .map((row) => row.index)
    .sort((a, b) => b.localeCompare(a));
}

export async function listEs5SourceIndices(es5) {
  const cachePath = path.resolve('outputs/01a07164-8064-7313-962f-0d73887aa809/es5-to-es8/es5-source-indices.json');
  let rows;
  try {
    rows = await es5.cat.indices({ index: 'master*', format: 'json', h: 'index,status,docs.count,store.size', requestTimeout: 120_000 });
  } catch (error) {
    try {
      const cached = JSON.parse(await fs.readFile(cachePath, 'utf8'));
      if (
        cached.selection_version === ES5_SOURCE_INDEX_CACHE_VERSION
        && Array.isArray(cached.indices)
        && cached.indices.length
        && cached.indices.every(isValidEs5WeeklyIndex)
      ) return cached.indices;
    } catch {}
    throw error;
  }
  const indices = selectEs5SourceIndices(rows);
  await fs.mkdir(path.dirname(cachePath), { recursive: true });
  await fs.writeFile(cachePath, `${JSON.stringify({
    selection_version: ES5_SOURCE_INDEX_CACHE_VERSION,
    naming: 'masterYYYYWW',
    captured_at: new Date().toISOString(),
    indices,
  }, null, 2)}\n`, 'utf8');
  return indices;
}

function platformFrom(legacyType, documentUrl) {
  const type = String(legacyType ?? '').toLowerCase();
  const url = String(documentUrl ?? '').toLowerCase();
  if (type.includes('instagram') || url.includes('instagram.com')) return 'instagram';
  if (type.startsWith('fb')) return 'facebook';
  if (type.startsWith('tiktok') || url.includes('tiktok.com')) return 'tiktok';
  if (type.startsWith('threads') || url.includes('threads.com') || url.includes('threads.net')) return 'threads';
  if (type.startsWith('sns')) return 'sns';
  for (const candidate of ['youtube', 'linkedin', 'news', 'forum', 'ecommerce', 'review']) {
    if (type.startsWith(candidate)) return candidate;
  }
  return 'web';
}

function contentTypeFrom(legacyType, explicitType) {
  const value = String(explicitType || legacyType || '').toLowerCase();
  if (value.includes('comment') || value.includes('cmt')) return 'COMMENT';
  if (value.includes('topic') || value.includes('post')) return 'POST';
  return 'OTHER';
}

function sourceTypeFrom(legacyType, platform) {
  const type = String(legacyType ?? '').toLowerCase();
  if (type.startsWith('fbpage')) return 'PAGE';
  if (type.startsWith('fbgroup')) return 'GROUP';
  if (type.startsWith('fbuser')) return 'USER';
  return ({ youtube: 'CHANNEL', news: 'SITE', forum: 'FORUM', ecommerce: 'STORE', review: 'PLACE', web: 'SITE', sns: 'SITE' })[platform] ?? 'ACCOUNT';
}

function hostnameFrom(platform, url) {
  const known = { facebook: 'facebook.com', tiktok: 'tiktok.com', instagram: 'instagram.com', threads: 'threads.com', youtube: 'youtube.com', linkedin: 'linkedin.com' }[platform];
  if (known) return known;
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return undefined; }
}

function rootUrl(url) {
  try { const value = new URL(url); return ['http:', 'https:'].includes(value.protocol) ? value.origin : undefined; }
  catch { return undefined; }
}

function stableId(value) {
  const result = String(value ?? '').trim().replace(/^@/, '');
  return result || undefined;
}

function accountUrl(platform, idValue, documentUrl, { group = false } = {}) {
  const id = stableId(idValue);
  if (platform === 'facebook' && id) return group ? `https://www.facebook.com/groups/${id}` : `https://www.facebook.com/${id}`;
  if (platform === 'tiktok' && id) return `https://www.tiktok.com/@${id}`;
  if (platform === 'instagram' && id) return `https://www.instagram.com/@${id}`;
  if (platform === 'threads' && id) return `https://www.threads.com/@${id}`;
  if (platform === 'youtube' && id) return /^UC[A-Za-z0-9_-]+$/.test(id) ? `https://www.youtube.com/channel/${id}` : `https://www.youtube.com/@${id}`;
  return rootUrl(documentUrl);
}

function asLong(value) {
  if (value === null || value === undefined || value === '') return undefined;
  const number = Number(value);
  return Number.isFinite(number) ? Math.trunc(number) : undefined;
}

function compact(object) {
  return Object.fromEntries(Object.entries(object).filter(([, value]) => value !== undefined && value !== null && value !== '' && (!Array.isArray(value) || value.length > 0)));
}

export function transformEs5Hit(hit, projectionVersion = 'content-projector-es5-v1') {
  const source = hit._source ?? {};
  const legacyType = hit._type;
  if (IGNORED_TYPES.map((value) => value.toLowerCase()).includes(String(legacyType).toLowerCase())) return undefined;
  const platform = platformFrom(legacyType, source.url);
  const contentType = contentTypeFrom(legacyType, source.contentType);
  const host = hostnameFrom(platform, source.url);
  const authorId = stableId(source.authorId);
  const siteId = stableId(source.siteId);
  const contentId = `content:${platform}:${contentType.toLowerCase()}:${hit._id}`;
  const translated = Array.isArray(source.translateBuzz) ? source.translateBuzz : (source.translateBuzz ? [source.translateBuzz] : []);
  const migratedAt = new Date().toISOString();
  const legacyLineage = compact({
    legacy_source_index: hit._index,
    legacy_source_document_id: String(hit._id),
    legacy_source_type: legacyType,
    legacy_source_version: hit._version,
    legacy_migrated_at: migratedAt,
  });
  const document = compact({
    content_id: contentId,
    schema_version: '1.0.0',
    projection_version: projectionVersion,
    source_document_version: hit._version,
    published_at: toIsoDate(source.publishedDate),
    collected_at: toIsoDate(source.insertedDate),
    updated_at: toIsoDate(source.updated_time),
    platform,
    content_type: contentType,
    external_id: String(hit._id),
    url: source.url,
    origin_url: source.link,
    author: compact({ id: authorId, canonical_id: authorId ? `profile:${platform}:${authorId}` : undefined, name: source.authorName || source.author, username: ['tiktok', 'instagram', 'threads'].includes(platform) ? authorId : undefined, platform, hostname: host, url: accountUrl(platform, authorId, source.url) }),
    parent_content_id: source.parentId ? `content:${platform}:post:${source.parentId}` : undefined,
    relations: compact({ parent_published_at: toIsoDate(source.parentDate), comment_parent_content_id: source.commentParentId ? `content:${platform}:comment:${source.commentParentId}` : undefined }),
    source: compact({ id: siteId, name: source.siteName, username: ['tiktok', 'instagram', 'threads'].includes(platform) ? siteId : undefined, type: sourceTypeFrom(legacyType, platform), platform, hostname: host, url: accountUrl(platform, siteId, source.url, { group: String(legacyType).toLowerCase().startsWith('fbgroup') }) }),
    locale: compact({ country_code: source.country, location_name: source.place || source.city }),
    engagement_current: compact({
      likes: asLong(source.likes), shares: asLong(source.shares), comments: asLong(source.comments), interactions: asLong(source.interactions), views: asLong(source.views),
      reactions: compact({ total: asLong(source.reactions), love: asLong(source.love), haha: asLong(source.haha), wow: asLong(source.wow), sad: asLong(source.sad), angry: asLong(source.angry), pride: asLong(source.pride), thankful: asLong(source.thankful) }),
    }),
    flags: compact({ has_translation: source.hasTranslateBuzz }),
    translations: translated.map((item) => compact({ language_code: String(item?.lang ?? '').toLowerCase() || undefined, content: item?.content, title: item?.title, description: item?.description, summary: item?.contentSummary })).filter((item) => Object.keys(item).length),
    media: compact({ preview_url: source.picture }),
    text: compact({ original: source.contentRaw || source.content, normalized: source.content, title: source.title, description: source.description, caption: source.caption, story: source.story, share_name: source.name, summary: source.contentSummary }),
    crawl_metrics: compact({ delay_crawler_ms: asLong(source.delayCrawler), delay_mongo_ms: asLong(source.delayMongo), delay_es_ms: asLong(source.delayEs), delay_total_ms: asLong(source.delayTotal), total_crawled_comments: asLong(source.total_crawled_cmt) }),
    raw_ref: `es5://${hit._index}/${legacyType}/${hit._id}`,
    lineage: compact({ source_index: hit._index, source_document_id: String(hit._id), collector: source.ds?.source || source.ds?.soure || source.source, source_pipeline: 'es5-legacy', migrated_at: migratedAt, ...legacyLineage }),
  });
  if (!document.published_at) throw new Error(`Invalid publishedDate for ${hit._index}/${legacyType}/${hit._id}`);

  const partial = deepClone(document);
  delete partial.schema_version;
  delete partial.projection_version;
  delete partial.source_document_version;
  partial.lineage = legacyLineage;
  return { index: indexNameFromPublishedDate(source.publishedDate), id: contentId, partial, upsert: document };
}

const preparedIndices = new Map();
export async function ensureEs5TargetIndex(es8Request, index) {
  let preparation = preparedIndices.get(index);
  if (!preparation) {
    preparation = (async () => {
      await ensureIndex(es8Request, index);
      requireSuccess(`apply ES5 compatibility mapping to ${index}`, await es8Request('PUT', `/${encodeURIComponent(index)}/_mapping`, { properties: compatibilityProperties }));
    })();
    preparedIndices.set(index, preparation);
    preparation.catch(() => {
      if (preparedIndices.get(index) === preparation) preparedIndices.delete(index);
    });
  }
  await preparation;
}

function delay(milliseconds) { return new Promise((resolve) => setTimeout(resolve, milliseconds)); }

export async function bulkMergeEs5(es8Request, items, { chunkSize = 500, concurrency = 2 } = {}) {
  const chunks = [];
  for (let offset = 0; offset < items.length; offset += chunkSize) chunks.push(items.slice(offset, offset + chunkSize));
  let cursor = 0;
  let succeeded = 0;
  async function runChunk(original) {
    let pending = original;
    for (let attempt = 0; pending.length && attempt < 6; attempt += 1) {
      const lines = [];
      for (const item of pending) {
        lines.push(JSON.stringify({ update: { _index: item.index, _id: item.id, retry_on_conflict: 3 } }));
        lines.push(JSON.stringify({ doc: item.partial, upsert: item.upsert }));
      }
      const response = await es8Request('POST', '/_bulk?refresh=false', `${lines.join('\n')}\n`, { contentType: 'application/x-ndjson', timeout: 300_000, gzip: true });
      if (response.status === 429 || response.status >= 500) {
        if (attempt === 5) requireSuccess('ES5 merge bulk', response);
        await delay(Math.min(1000 * 2 ** attempt, 15_000));
        continue;
      }
      const body = requireSuccess('ES5 merge bulk', response);
      const retry = [];
      for (let index = 0; index < (body.items ?? []).length; index += 1) {
        const result = body.items[index].update;
        if (!result?.error) { succeeded += 1; continue; }
        if ([429, 502, 503, 504].includes(result.status) && attempt < 5) retry.push(pending[index]);
        else throw new Error(`ES5 merge failed for ${result?._index}/${result?._id}: ${JSON.stringify(result?.error)}`);
      }
      pending = retry;
      if (pending.length) await delay(Math.min(1000 * 2 ** attempt, 15_000));
    }
  }
  async function worker() {
    while (true) {
      const index = cursor++;
      if (index >= chunks.length) return;
      await runChunk(chunks[index]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(Math.max(1, concurrency), chunks.length || 1) }, () => worker()));
  return { processed: items.length, succeeded };
}

export async function migrateEs5InsertedRange({
  es5,
  es8Request,
  sourceIndices,
  gte,
  lt,
  slices = 4,
  sourceIndexBatchSize = 32,
  maxDocuments,
  projectionVersion,
  onProgress,
  onSourceBatch,
}) {
  const stats = { scanned: 0, upserted: 0, ignored_events: 0, invalid_published_date: 0, affected_indices: new Set() };
  const documentLimit = maxDocuments === undefined ? undefined : Number(maxDocuments);
  if (documentLimit !== undefined && (!Number.isInteger(documentLimit) || documentLimit < 1)) {
    throw new Error(`Invalid maxDocuments: ${String(maxDocuments)}`);
  }
  if (documentLimit !== undefined && Number(slices) !== 1) {
    throw new Error('maxDocuments requires slices=1 so the limit is deterministic');
  }
  const batchSize = Math.max(1, Number(sourceIndexBatchSize) || 32);
  const sourceBatches = [];
  for (let offset = 0; offset < sourceIndices.length; offset += batchSize) {
    sourceBatches.push(sourceIndices.slice(offset, offset + batchSize));
  }
  async function migrateSlice(indices, sliceId) {
    let scrollId;
    try {
      let response = await es5.search({
        index: indices.join(','),
        scroll: '10m',
        version: true,
        body: {
          size: 1000,
          ...searchSlice(sliceId, slices),
          sort: ['_doc'],
          query: {
            bool: {
              filter: [{ range: { insertedDate: { gte, lt } } }, { exists: { field: 'publishedDate' } }],
              must_not: [{ terms: { _type: IGNORED_TYPES } }],
            },
          },
        },
      });
      while (true) {
        scrollId = response._scroll_id;
        const remaining = documentLimit === undefined ? Infinity : documentLimit - stats.scanned;
        const hits = (response.hits?.hits ?? []).slice(0, Math.max(0, remaining));
        if (!hits.length) break;
        stats.scanned += hits.length;
        const items = [];
        for (const hit of hits) {
          try {
            const item = transformEs5Hit(hit, projectionVersion);
            if (item) items.push(item); else stats.ignored_events += 1;
          } catch (error) {
            if (String(error.message).startsWith('Invalid publishedDate')) { stats.invalid_published_date += 1; continue; }
            throw error;
          }
        }
        const nextResponsePromise = es5.scroll({ scrollId, scroll: '10m' });
        for (const index of new Set(items.map((item) => item.index))) {
          await ensureEs5TargetIndex(es8Request, index);
          stats.affected_indices.add(index);
        }
        if (items.length) {
          await bulkMergeEs5(es8Request, items, { chunkSize: 500, concurrency: 2 });
          stats.upserted += items.length;
        }
        if (onProgress) onProgress(stats);
        if (documentLimit !== undefined && stats.scanned >= documentLimit) {
          nextResponsePromise.catch(() => {});
          break;
        }
        response = await nextResponsePromise;
      }
    } finally {
      if (scrollId) await es5.clearScroll({ scrollId }).catch(() => {});
    }
  }
  for (let batchIndex = 0; batchIndex < sourceBatches.length; batchIndex += 1) {
    if (documentLimit !== undefined && stats.scanned >= documentLimit) break;
    const indices = sourceBatches[batchIndex];
    await Promise.all(Array.from({ length: slices }, (_, sliceId) => migrateSlice(indices, sliceId)));
    if (onSourceBatch) {
      onSourceBatch({
        batch: batchIndex + 1,
        batches: sourceBatches.length,
        indices: indices.length,
        scanned: stats.scanned,
        upserted: stats.upserted,
      });
    }
  }
  return { ...stats, affected_indices: [...stats.affected_indices].sort() };
}

export async function writeJsonAtomic(file, value) {
  const temporary = `${file}.${process.pid}.tmp`;
  await fs.writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  await fs.rename(temporary, file);
}
