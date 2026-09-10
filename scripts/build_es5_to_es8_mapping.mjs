import fs from 'node:fs/promises';
import path from 'node:path';

const outputDir = path.resolve(process.argv[2] || 'outputs/01a07164-8064-7313-962f-0d73887aa809/es5-to-es8');
const inspection = JSON.parse(await fs.readFile(path.join(outputDir, 'es5-schema-inspection.json'), 'utf8'));
const samples = JSON.parse(await fs.readFile(path.join(outputDir, 'es5-recent-samples.json'), 'utf8'));

const keyword = { type: 'keyword', ignore_above: 512 };
const componentTemplate = {
  version: 1,
  _meta: {
    purpose: 'Fields required to preserve useful ES5 legacy data in the Kompa 2.0 canonical content projection',
    status: 'proposal-only; not deployed',
    source_version: inspection.es_version,
  },
  template: {
    mappings: {
      properties: {
        lineage: {
          type: 'object',
          dynamic: 'strict',
          properties: {
            legacy_source_index: keyword,
            legacy_source_document_id: keyword,
            legacy_source_type: keyword,
            legacy_source_version: { type: 'long' },
            legacy_migrated_at: { type: 'date', format: 'strict_date_time' },
            legacy_object_id: keyword,
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
      },
    },
  },
};

const directRules = {
  author: ['author.name', 'MOVE', 'Fallback author display name'],
  authorName: ['author.name', 'MOVE', 'Prefer when populated, otherwise author'],
  authorId: ['author.id, author.canonical_id, author.url', 'TRANSFORM', 'Use stable ID; build platform URL from ID'],
  caption: ['text.caption', 'MOVE', 'Text field'],
  city: ['locale.location_name', 'MOVE', 'Legacy city'],
  commentParentId: ['relations.comment_parent_content_id', 'TRANSFORM', 'Canonical content relation'],
  content: ['text.normalized', 'MOVE', 'Normalized/searchable content'],
  contentRaw: ['text.original', 'MOVE', 'Prefer as original text; fallback to content'],
  contentSummary: ['text.summary', 'MOVE', 'Text summary'],
  contentType: ['content_type', 'TRANSFORM', 'Normalize enum; fallback to ES5 _type'],
  country: ['locale.country_code', 'NORMALIZE', 'Normalize country code/name'],
  delayCrawler: ['crawl_metrics.delay_crawler_ms', 'CAST', 'String/number to long'],
  delayMongo: ['crawl_metrics.delay_mongo_ms', 'CAST', 'String/number to long'],
  delayEs: ['crawl_metrics.delay_es_ms', 'CAST', 'String/number to long'],
  delayTotal: ['crawl_metrics.delay_total_ms', 'CAST', 'String/number to long'],
  description: ['text.description', 'MOVE', 'Text field'],
  'ds.source': ['lineage.collector', 'MOVE', 'Crawler provenance'],
  'ds.soure': ['lineage.collector', 'MOVE', 'Typo fallback when ds.source missing'],
  hasTranslateBuzz: ['flags.has_translation', 'MOVE', 'Boolean'],
  insertedDate: ['collected_at', 'NORMALIZE', 'Convert ES5 ISO/epoch to strict UTC ISO-8601'],
  link: ['origin_url', 'MOVE', 'Alternate/origin URL; document url remains top-level url'],
  name: ['text.share_name', 'MOVE', 'Legacy shared/display name'],
  objectId: ['lineage.legacy_object_id', 'MOVE', 'Preserve legacy object identifier'],
  parentDate: ['relations.parent_published_at', 'NORMALIZE', 'Convert to strict UTC ISO-8601'],
  parentId: ['parent_content_id', 'TRANSFORM', 'Canonical content relation'],
  picture: ['media.preview_url', 'MOVE', 'Preview image URL'],
  place: ['locale.location_name', 'MOVE', 'Prefer place over city when populated'],
  publishedDate: ['published_at + target index', 'NORMALIZE', 'UTC ISO value; route by Asia/Ho_Chi_Minh day to masterYYYYMMDD'],
  siteId: ['source.id, source.url', 'TRANSFORM', 'Stable source ID and platform-specific URL'],
  siteName: ['source.name', 'MOVE', 'Source display name'],
  source: ['lineage.collector', 'FALLBACK', 'Use only when ds.source is missing'],
  story: ['text.story', 'MOVE', 'Text field'],
  title: ['text.title', 'MOVE', 'Text field'],
  total_crawled_cmt: ['crawl_metrics.total_crawled_comments', 'CAST', 'Crawler completeness metric'],
  translateBuzz: ['translations', 'NORMALIZE', 'Always emit nested array; normalize lang to lowercase keyword'],
  'translateBuzz.lang': ['translations.language_code', 'NORMALIZE', 'Resolve ES5 keyword/text conflict'],
  'translateBuzz.content': ['translations.content', 'MOVE', 'Nested text'],
  'translateBuzz.title': ['translations.title', 'MOVE', 'Nested text'],
  'translateBuzz.description': ['translations.description', 'MOVE', 'Nested text'],
  'translateBuzz.contentSummary': ['translations.summary', 'MOVE', 'Nested text'],
  updated_time: ['updated_at', 'NORMALIZE', 'Convert to strict UTC ISO-8601'],
  url: ['url', 'MOVE', 'Document URL; never use as source URL'],
  views: ['engagement_current.views', 'CAST', 'String/number to long'],
};
const reactionFields = new Set(['reactions', 'love', 'haha', 'wow', 'sad', 'angry', 'pride', 'thankful']);
const engagementFields = new Set(['likes', 'shares', 'comments', 'interactions']);
const droppedDsFields = new Set(['ds.ip', 'ds.username', 'ds.keyword', 'ds.channel', 'ds.word']);

const fieldMap = inspection.fields.map((field) => {
  let target;
  let action;
  let rule;
  if (directRules[field.field]) [target, action, rule] = directRules[field.field];
  else if (reactionFields.has(field.field)) {
    target = `engagement_current.reactions.${field.field === 'reactions' ? 'total' : field.field}`;
    action = 'CAST';
    rule = 'String/number to long';
  } else if (engagementFields.has(field.field)) {
    target = `engagement_current.${field.field}`;
    action = 'CAST';
    rule = 'String/number to long';
  } else if (field.field === 'ds') {
    target = 'lineage'; action = 'PARTIAL'; rule = 'Keep collector only; discard credentials/network/keyword operational fields';
  } else if (droppedDsFields.has(field.field)) {
    target = null; action = 'DROP'; rule = 'Operational/high-cardinality crawler detail; keep outside serving index';
  } else if (field.field === 'type') {
    target = 'lineage.legacy_source_type'; action = 'IGNORE_VALUE'; rule = 'Use ES5 metadata _type, including normalization of fbUsertopic typo';
  } else {
    target = null; action = 'REVIEW'; rule = 'No automatic target selected';
  }
  return { es5_field: field.field, es5_types: field.es5_types, es8_target: target, action, rule };
});
fieldMap.unshift(
  { es5_field: '_id', es5_types: ['metadata'], es8_target: 'external_id, content_id, ES8 _id', action: 'TRANSFORM', rule: 'external_id=_id; content_id/ES8 _id=content:<platform>:<post|comment>:<_id>' },
  { es5_field: '_type', es5_types: ['metadata'], es8_target: 'platform, content_type, source.type, lineage.legacy_source_type', action: 'TRANSFORM', rule: 'Derive platform and POST/COMMENT; Facebook PAGE/GROUP/USER; skip fbEvent*' },
  { es5_field: '_index', es5_types: ['metadata'], es8_target: 'lineage.source_index', action: 'MOVE', rule: 'Preserve monthly ES5 source index' },
);

function toIso(value) {
  if (value === null || value === undefined || value === '') return undefined;
  const date = typeof value === 'number' || /^\d+$/.test(String(value)) ? new Date(Number(value)) : new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}
function platformFrom(type, url) {
  const value = String(type ?? '').toLowerCase();
  const documentUrl = String(url ?? '').toLowerCase();
  if (value.startsWith('fb')) return 'facebook';
  if (value.startsWith('tiktok')) return 'tiktok';
  if (value.startsWith('threads')) return 'threads';
  if (value.startsWith('sns')) return documentUrl.includes('instagram.com') ? 'instagram' : 'sns';
  for (const candidate of ['youtube', 'linkedin', 'news', 'forum', 'ecommerce', 'review']) if (value.startsWith(candidate)) return candidate;
  return 'web';
}
function contentTypeFrom(type) { return String(type ?? '').toLowerCase().includes('comment') || String(type ?? '').toLowerCase().includes('cmt') ? 'COMMENT' : 'POST'; }
function sourceTypeFrom(type, platform) {
  const value = String(type ?? '').toLowerCase();
  if (value.startsWith('fbpage')) return 'PAGE';
  if (value.startsWith('fbgroup')) return 'GROUP';
  if (value.startsWith('fbuser')) return 'USER';
  return ({ youtube: 'CHANNEL', news: 'SITE', forum: 'FORUM', ecommerce: 'STORE', review: 'PLACE', web: 'SITE', sns: 'SITE' })[platform] ?? 'ACCOUNT';
}
function hostname(platform, url) {
  const known = { facebook: 'facebook.com', tiktok: 'tiktok.com', threads: 'threads.com', instagram: 'instagram.com', youtube: 'youtube.com', linkedin: 'linkedin.com' }[platform];
  if (known) return known;
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return undefined; }
}
function rootUrl(url) { try { return new URL(url).origin; } catch { return undefined; } }
function profileUrl(platform, id, url, isGroup = false) {
  const stable = String(id ?? '').trim().replace(/^@/, '');
  if (platform === 'facebook' && stable) return isGroup ? `https://www.facebook.com/groups/${stable}` : `https://www.facebook.com/${stable}`;
  if (platform === 'tiktok' && stable) return `https://www.tiktok.com/@${stable}`;
  if (platform === 'instagram' && stable) return `https://www.instagram.com/@${stable}`;
  if (platform === 'threads' && stable) return `https://www.threads.com/@${stable}`;
  if (platform === 'youtube' && stable) return stable.startsWith('UC') ? `https://www.youtube.com/channel/${stable}` : `https://www.youtube.com/@${stable}`;
  return rootUrl(url);
}
function asLong(value) { const number = Number(value); return value === '' || value == null || !Number.isFinite(number) ? undefined : Math.trunc(number); }
function compact(object) { return Object.fromEntries(Object.entries(object).filter(([, value]) => value !== undefined && value !== null && value !== '' && (!Array.isArray(value) || value.length))); }
function transform(hit) {
  const source = hit._source ?? {};
  const legacyType = hit._type;
  const platform = platformFrom(legacyType, source.url);
  const contentType = contentTypeFrom(source.contentType ?? legacyType);
  const host = hostname(platform, source.url);
  const id = `content:${platform}:${contentType.toLowerCase()}:${hit._id}`;
  const translated = Array.isArray(source.translateBuzz) ? source.translateBuzz : (source.translateBuzz ? [source.translateBuzz] : []);
  return compact({
    content_id: id,
    schema_version: '1.0.0',
    projection_version: 'content-projector-es5-proposal-v1',
    published_at: toIso(source.publishedDate),
    collected_at: toIso(source.insertedDate),
    updated_at: toIso(source.updated_time),
    platform,
    content_type: contentType,
    external_id: String(hit._id),
    url: source.url,
    origin_url: source.link,
    author: compact({ id: source.authorId, canonical_id: source.authorId ? `profile:${platform}:${source.authorId}` : undefined, name: source.authorName || source.author, username: ['tiktok', 'instagram', 'threads'].includes(platform) ? source.authorId : undefined, platform, hostname: host, url: profileUrl(platform, source.authorId, source.url) }),
    parent_content_id: source.parentId ? `content:${platform}:post:${source.parentId}` : undefined,
    relations: compact({ parent_published_at: toIso(source.parentDate), comment_parent_content_id: source.commentParentId ? `content:${platform}:comment:${source.commentParentId}` : undefined }),
    source: compact({ id: source.siteId, name: source.siteName, username: ['tiktok', 'instagram', 'threads'].includes(platform) ? source.siteId : undefined, type: sourceTypeFrom(legacyType, platform), platform, hostname: host, url: profileUrl(platform, source.siteId, source.url, String(legacyType).toLowerCase().startsWith('fbgroup')) }),
    locale: compact({ country_code: source.country, location_name: source.place || source.city }),
    engagement_current: compact({ likes: asLong(source.likes), shares: asLong(source.shares), comments: asLong(source.comments), interactions: asLong(source.interactions), views: asLong(source.views), reactions: compact({ total: asLong(source.reactions), love: asLong(source.love), haha: asLong(source.haha), wow: asLong(source.wow), sad: asLong(source.sad), angry: asLong(source.angry), pride: asLong(source.pride), thankful: asLong(source.thankful) }) }),
    flags: compact({ has_translation: source.hasTranslateBuzz }),
    translations: translated.map((item) => compact({ language_code: String(item?.lang ?? '').toLowerCase() || undefined, content: item?.content, title: item?.title, description: item?.description, summary: item?.contentSummary })).filter((item) => Object.keys(item).length),
    media: compact({ preview_url: source.picture }),
    text: compact({ original: source.contentRaw || source.content, normalized: source.content, title: source.title, description: source.description, caption: source.caption, story: source.story, share_name: source.name, summary: source.contentSummary }),
    crawl_metrics: compact({ delay_crawler_ms: asLong(source.delayCrawler), delay_mongo_ms: asLong(source.delayMongo), delay_es_ms: asLong(source.delayEs), delay_total_ms: asLong(source.delayTotal), total_crawled_comments: asLong(source.total_crawled_cmt) }),
    raw_ref: `es5://${hit._index}/${legacyType}/${hit._id}`,
    lineage: compact({ source_index: hit._index, source_document_id: String(hit._id), collector: source.ds?.source || source.ds?.soure || source.source, source_pipeline: 'es5-legacy', legacy_source_type: legacyType, legacy_object_id: source.objectId, migrated_at: new Date().toISOString() }),
  });
}

const transformedSamples = Object.fromEntries(Object.entries(samples)
  .filter(([type, hit]) => !type.toLowerCase().startsWith('fbevent') && hit?._source)
  .slice(0, 6)
  .map(([type, hit]) => [type, { target_id: transform(hit).content_id, document: transform(hit) }]));

const review = `# ES5 → ES8 mapping proposal\n\n` +
  `- ES5: ${inspection.es_version}; ${inspection.monthly_indices.toLocaleString('en-US')} valid monthly indices; ${inspection.total_docs_reported.toLocaleString('en-US')} documents reported.\n` +
  `- Routing: publishedDate → strict UTC ISO-8601; index day in Asia/Ho_Chi_Minh.\n` +
  `- Ignore: fbEventTopic/fbEventComment.\n` +
  `- Collision warning: ES5 and ES7 can share legacy _id. Do not bulk-index ES5 into live master* until precedence is selected. Recommended validation target: es5-stage-YYYYMMDD, then merge with ES7 enrichment winning.\n` +
  `- ES5 mapping conflicts normalized: translateBuzz object|nested → nested array; translateBuzz.lang text|keyword → lowercase keyword.\n` +
  `- Proposed strict-mapping additions: lineage legacy identifiers, pride/thankful reactions, and bounded crawl_metrics.\n`;

await Promise.all([
  fs.writeFile(path.join(outputDir, 'es5-to-es8-field-map.json'), `${JSON.stringify(fieldMap, null, 2)}\n`, 'utf8'),
  fs.writeFile(path.join(outputDir, 'master-ct-es5-compat-v1.proposal.json'), `${JSON.stringify(componentTemplate, null, 2)}\n`, 'utf8'),
  fs.writeFile(path.join(outputDir, 'es5-transformed-samples.proposal.json'), `${JSON.stringify(transformedSamples, null, 2)}\n`, 'utf8'),
  fs.writeFile(path.join(outputDir, 'README.md'), review, 'utf8'),
]);

console.log(JSON.stringify({ output_dir: outputDir, mapped_fields: fieldMap.length, review_fields: fieldMap.filter((row) => row.action === 'REVIEW').map((row) => row.es5_field), samples: Object.keys(transformedSamples), deployed: false }, null, 2));
