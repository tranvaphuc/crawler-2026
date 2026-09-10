import fs from 'node:fs/promises';
import path from 'node:path';
import { SpreadsheetFile, Workbook } from '@oai/artifact-tool';
import { deepClone } from './lib/node_compat.mjs';

const [sourceMappingPath, samplesPath, statsPath, outputDir, workbookPath, previewDir, facebookSamplesPath, channelTypesPath] = process.argv.slice(2);
if (!sourceMappingPath || !samplesPath || !statsPath || !outputDir || !workbookPath || !previewDir) {
  throw new Error('Usage: node scripts/build_kompa2_es8_blueprint.mjs <es7-mapping> <samples> <stats> <output-dir> <workbook.xlsx> <preview-dir>');
}

const sourceIndex = 'topic56fc9bc282ea19d067e5d8a1';
const sourceMapping = JSON.parse(await fs.readFile(sourceMappingPath, 'utf8'));
const sampleBundle = JSON.parse(await fs.readFile(samplesPath, 'utf8'));
const stats = JSON.parse(await fs.readFile(statsPath, 'utf8'));
const facebookSampleBundle = facebookSamplesPath ? JSON.parse(await fs.readFile(facebookSamplesPath, 'utf8')) : null;
const channelTypeSamples = channelTypesPath ? JSON.parse(await fs.readFile(channelTypesPath, 'utf8')) : [];
const selectedSamples = facebookSampleBundle?.samples?.length ? facebookSampleBundle.samples.slice(0, 3) : sampleBundle.samples?.slice(0, 3);
const sample = selectedSamples?.[0];
if (!sample) throw new Error('No sample document found');

const DATE_FORMAT = 'strict_date_time';
const DATE_OUTPUT = "UTC ISO 8601: yyyy-MM-dd'T'HH:mm:ss.SSS'Z'";
const keyword = (extra = {}) => ({ type: 'keyword', ignore_above: 512, ...extra });
const textField = (extra = {}) => ({
  type: 'text',
  analyzer: 'folded_text',
  fields: { raw: { type: 'keyword', ignore_above: 256 } },
  ...extra,
});
const dateField = () => ({ type: 'date', format: DATE_FORMAT });

const settingsComponent = {
  version: 1,
  _meta: { owner: 'Kompa Data Platform', purpose: 'Shared ES8 settings for content current projections' },
  template: {
    settings: {
      number_of_shards: 6,
      number_of_replicas: 1,
      refresh_interval: '30s',
      'mapping.total_fields.limit': 1500,
      analysis: {
        filter: { folded_ascii: { type: 'asciifolding', preserve_original: true } },
        analyzer: {
          folded_text: { type: 'custom', tokenizer: 'standard', filter: ['lowercase', 'folded_ascii'] },
        },
      },
    },
  },
};

const metaComponent = {
  version: 1,
  _meta: { source: 'Kompa 2.0 Master Blueprint v1.2, mapping rules and lineage requirements' },
  template: {
    mappings: {
      dynamic: 'strict',
      _meta: {
        schema: 'k2-content-current',
        schema_version: '1.0.0',
        projection_role: 'near-real-time search and serving',
        source_model: sourceIndex,
      },
      properties: {
        content_id: keyword(),
        schema_version: keyword(),
        projection_version: keyword(),
        source_document_version: { type: 'long' },
        published_at: dateField(),
        collected_at: dateField(),
        updated_at: dateField(),
        last_seen_at: dateField(),
        raw_ref: keyword({ index: false, ignore_above: 2048 }),
        raw_checksum: keyword(),
        lineage: {
          type: 'object', dynamic: 'strict', properties: {
            source_index: keyword(), source_document_id: keyword(), collector: keyword(),
            source_pipeline: keyword(), input_hash: keyword(), migrated_at: dateField(),
          },
        },
      },
    },
  },
};

const coreComponent = {
  version: 1,
  _meta: { source: 'Kompa 2.0 canonical content projection' },
  template: {
    mappings: {
      properties: {
        platform: keyword(),
        content_type: keyword(),
        external_id: keyword(),
        url: keyword({ ignore_above: 2048 }),
        origin_url: keyword({ index: false, ignore_above: 2048 }),
        author: {
          type: 'object', dynamic: 'strict', properties: {
            id: keyword(), canonical_id: keyword(), name: textField(), username: keyword(), actor_id: keyword(),
            platform: keyword(), hostname: keyword(), url: keyword({ ignore_above: 2048 }),
          },
        },
        conversation_id: keyword(),
        parent_content_id: keyword(),
        relations: {
          type: 'object', dynamic: 'strict', properties: { parent_published_at: dateField(), comment_parent_content_id: keyword() },
        },
        language: {
          type: 'object', dynamic: 'strict', properties: { code: keyword(), confidence: { type: 'half_float' } },
        },
        source: {
          type: 'object', dynamic: 'strict', properties: {
            id: keyword(), name: textField(), username: keyword(), type: keyword(), platform: keyword(), hostname: keyword(),
            url: keyword({ ignore_above: 2048 }),
          },
        },
        locale: {
          type: 'object', dynamic: 'strict', properties: {
            region: keyword(), country_code: keyword(), language_code: keyword(), timezone: keyword(),
            location_name: textField(), address: textField(), geographic: { type: 'geo_point', ignore_malformed: true },
          },
        },
        engagement_current: {
          type: 'object', dynamic: 'strict', properties: {
            likes: { type: 'long' }, shares: { type: 'long' }, comments: { type: 'long' },
            interactions: { type: 'long' }, views: { type: 'long' },
            reactions: {
              type: 'object', dynamic: 'strict', properties: {
                total: { type: 'long' }, like: { type: 'long' }, love: { type: 'long' }, care: { type: 'long' },
                haha: { type: 'long' }, wow: { type: 'long' }, sad: { type: 'long' }, angry: { type: 'long' },
                reposts: { type: 'long' }, saved: { type: 'long' },
              },
            },
          },
        },
        match_context_ids: keyword(),
        flags: {
          type: 'object', dynamic: 'strict', properties: {
            is_deleted: { type: 'boolean' }, has_translation: { type: 'boolean' },
            was_updated: { type: 'boolean' }, mentions_main_brand: { type: 'boolean' },
          },
        },
        lifecycle: {
          type: 'object', dynamic: 'strict', properties: { content_status: keyword(), privacy: keyword() },
        },
        tags: {
          type: 'object', dynamic: 'strict', properties: {
            labels: keyword(), campaigns: keyword(), crises: keyword(), processing: keyword(),
          },
        },
        content_spans: {
          type: 'nested', dynamic: 'strict', properties: {
            type: keyword(), value: keyword({ ignore_above: 1024 }), offset: { type: 'integer' }, length: { type: 'integer' },
          },
        },
        translations: {
          type: 'nested', dynamic: 'strict', properties: {
            language_code: keyword(), content: textField(), title: textField(), description: textField(), summary: textField(),
          },
        },
        media: {
          type: 'object', dynamic: 'strict', properties: {
            preview_url: keyword({ index: false, ignore_above: 2048 }),
            shared_value: keyword({ index: false, ignore_above: 2048 }),
          },
        },
      },
    },
  },
};

const textComponent = {
  version: 1,
  _meta: { purpose: 'Searchable user-visible text only; operational logs are excluded' },
  template: {
    mappings: {
      properties: {
        text: {
          type: 'object', dynamic: 'strict', properties: {
            original: textField(), normalized: textField(), title: textField(), description: textField(),
            caption: textField(), story: textField(), share_name: textField(), summary: textField(),
          },
        },
      },
    },
  },
};

const intelligenceComponent = {
  version: 1,
  _meta: { purpose: 'Latest bounded intelligence projection; versioned outputs remain in k2-enrichment-event' },
  template: {
    mappings: {
      properties: {
        intelligence_current: {
          type: 'object', dynamic: 'strict', properties: {
            entity_ids: keyword(), topic_ids: keyword(),
            entities: { type: 'nested', dynamic: 'strict', properties: { type: keyword(), value: keyword({ ignore_above: 1024 }) } },
            context: { type: 'nested', dynamic: 'strict', properties: { value: keyword({ ignore_above: 1024 }), sentiment: keyword() } },
            sentiment: keyword(), sentiment_score: { type: 'float' }, sentiment_model_version: keyword(),
            advertisement: keyword(), angle: keyword(), audience: keyword(), category: keyword(), emotion: keyword(),
            industry: keyword(), intensity: keyword(), intent: keyword(), product_type: keyword(), purpose: keyword(),
            severity: keyword(), spam: keyword(), subject: keyword(), subtopic: keyword(), topic: keyword(), tone: keyword(),
            explanation: { type: 'text', index: false },
          },
        },
      },
    },
  },
};

const components = [
  ['k2-ct-content-settings-v1', settingsComponent],
  ['k2-ct-common-meta-v1', metaComponent],
  ['k2-ct-content-core-v1', coreComponent],
  ['k2-ct-content-text-v1', textComponent],
  ['k2-ct-intelligence-current-v1', intelligenceComponent],
];

function mergeObjects(target, source) {
  for (const [key, value] of Object.entries(source ?? {})) {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      target[key] = mergeObjects(target[key] && typeof target[key] === 'object' ? target[key] : {}, value);
    } else target[key] = value;
  }
  return target;
}

const resolvedSettings = {};
const resolvedMappings = {};
for (const [, body] of components) {
  mergeObjects(resolvedSettings, deepClone(body.template?.settings ?? {}));
  mergeObjects(resolvedMappings, deepClone(body.template?.mappings ?? {}));
}

const indexTemplate = {
  index_patterns: ['k2-content-current-v*'],
  priority: 250,
  version: 1,
  composed_of: components.map(([name]) => name),
  template: {
    aliases: { 'k2-content-read': {}, 'k2-content-write': {} },
  },
  _meta: {
    owner: 'Kompa Data Platform',
    source_blueprint: 'Kompa 2.0 Master Blueprint v1.2',
    source_es7_index: sourceIndex,
    migration_strategy: 'project-transform-index, not mapping copy',
  },
};

const createIndexBody = {
  settings: resolvedSettings,
  mappings: resolvedMappings,
  aliases: { 'k2-content-read': {}, 'k2-content-write': { is_write_index: true } },
};

function flattenProperties(properties = {}, prefix = '') {
  const rows = [];
  for (const [name, spec] of Object.entries(properties)) {
    const fieldPath = prefix ? `${prefix}.${name}` : name;
    const multi = Object.keys(spec.fields ?? {});
    rows.push({
      fieldPath,
      type: `${spec.type ?? 'object'}${multi.length ? ` + ${multi.join(', ')}` : ''}`,
      analyzer: spec.analyzer ?? '',
      indexed: spec.index === false ? 'No' : 'Yes',
      format: spec.format ?? '',
      dynamic: spec.dynamic ?? '',
    });
    rows.push(...flattenProperties(spec.properties, fieldPath));
  }
  return rows;
}

const sourceRows = flattenProperties(sourceMapping.properties);
const targetRows = flattenProperties(resolvedMappings.properties);

const inferenceNames = new Set(['advertisement', 'angle', 'audience', 'category', 'emotion', 'industry', 'intensity', 'intent', 'product_type', 'purpose', 'severity', 'spam', 'subject', 'subtopic', 'topic', 'tone']);
const reviewRoots = new Set(['alert', 'displayStatus', 'handlingStatus', 'handlingStep', 'level', 'riskGroup', 'qcReview']);
const tagRoots = { labels: 'labels', campaignTags: 'campaigns', crisisTags: 'crises', processingTag: 'processing' };

function prefixTarget(fieldPath, sourcePrefix, targetPrefix) {
  return fieldPath === sourcePrefix ? targetPrefix : `${targetPrefix}${fieldPath.slice(sourcePrefix.length)}`;
}

function mapField(fieldPath, sourceType) {
  const root = fieldPath.split('.')[0];
  const leaf = fieldPath.split('.').at(-1);
  const direct = {
    content: ['k2-content-current-v1', 'text.original', 'RENAME', 'trim; preserve original text; compute text.normalized separately'],
    title: ['k2-content-current-v1', 'text.title', 'RENAME', 'copy if non-empty'],
    description: ['k2-content-current-v1', 'text.description', 'RENAME', 'copy if non-empty'],
    caption: ['k2-content-current-v1', 'text.caption', 'RENAME', 'copy if non-empty'],
    story: ['k2-content-current-v1', 'text.story', 'RENAME', 'copy if non-empty'],
    shareName: ['k2-content-current-v1', 'text.share_name', 'RENAME', 'copy if non-empty'],
    contentSummary: ['k2-content-current-v1', 'text.summary', 'RENAME', 'copy if non-empty'],
    type: ['k2-content-current-v1', 'content_type', 'TRANSFORM', 'normalize content enum; derive source.type by legacy channel: PAGE/GROUP/USER/CHANNEL/SITE/FORUM/STORE/PLACE/ACCOUNT; ignore fbEvent*'],
    contentType: ['k2-content-current-v1', 'content_type', 'MERGE', 'fallback source for canonical content_type; prefer explicit validated value'],
    siteId: ['k2-content-current-v1', 'source.id', 'TRANSFORM', 'copy as keyword; TikTok/Instagram/Threads source.url must use siteId, not siteName'],
    siteName: ['k2-content-current-v1', 'source.name', 'RENAME', 'copy display name; never use it as the stable URL key'],
    url: ['k2-content-current-v1', 'url', 'RENAME', 'document URL stays at top level; do not treat it as source profile URL'],
    originLink: ['k2-content-current-v1', 'origin_url', 'RENAME', 'copy original document URL; index=false'],
    hostname: ['k2-content-current-v1', 'source.hostname', 'MERGE', 'lowercase hostname; also populate author.hostname and source.hostname'],
    publishedDate: ['k2-content-current-v1', 'published_at', 'TRANSFORM', `normalize to ${DATE_OUTPUT}`],
    insertedDate: ['k2-content-current-v1', 'collected_at', 'TRANSFORM', `normalize to ${DATE_OUTPUT}`],
    updatedDate: ['k2-content-current-v1', 'updated_at', 'TRANSFORM', `normalize to ${DATE_OUTPUT}`],
    lastVisitDate: ['k2-content-current-v1', 'last_seen_at', 'TRANSFORM', `normalize to ${DATE_OUTPUT}`],
    parentDate: ['k2-content-current-v1', 'relations.parent_published_at', 'TRANSFORM', `normalize to ${DATE_OUTPUT}`],
    parentId: ['k2-content-current-v1', 'parent_content_id', 'TRANSFORM', 'canonicalize to content:<platform>:<legacy-id>'],
    commentParentId: ['k2-content-current-v1', 'relations.comment_parent_content_id', 'TRANSFORM', 'canonicalize to content:<platform>:<legacy-id>'],
    lang: ['k2-content-current-v1', 'language.code', 'TRANSFORM', 'lowercase BCP-47/ISO code; retain unknown code as keyword'],
    likes: ['k2-content-current-v1', 'engagement_current.likes', 'CAST', 'coerce numeric strings to long; invalid/missing stays null'],
    shares: ['k2-content-current-v1', 'engagement_current.shares', 'CAST', 'coerce numeric strings to long; invalid/missing stays null'],
    comments: ['k2-content-current-v1', 'engagement_current.comments', 'CAST', 'coerce numeric strings to long; invalid/missing stays null'],
    interactions: ['k2-content-current-v1', 'engagement_current.interactions', 'CAST', 'coerce numeric strings to long; invalid/missing stays null'],
    views: ['k2-content-current-v1', 'engagement_current.views', 'CAST', 'coerce numeric strings to long; invalid/missing stays null'],
    filters: ['k2-content-current-v1', 'match_context_ids', 'TRANSFORM', 'canonicalize routing/filter values to context IDs'],
    hasTranslateBuzz: ['k2-content-current-v1', 'flags.has_translation', 'RENAME', 'copy boolean'],
    isDeleted: ['k2-content-current-v1', 'flags.is_deleted', 'RENAME', 'copy boolean'],
    updatedBuzz: ['k2-content-current-v1', 'flags.was_updated', 'RENAME', 'copy boolean'],
    privacy: ['k2-content-current-v1', 'lifecycle.privacy', 'RENAME', 'normalize to controlled keyword enum'],
    contentStatus: ['k2-content-current-v1', 'lifecycle.content_status', 'RENAME', 'normalize to controlled keyword enum'],
    picture: ['k2-content-current-v1', 'media.preview_url', 'RENAME', 'copy URL; index=false'],
    mention_mainbrand: ['k2-content-current-v1', 'flags.mentions_main_brand', 'RENAME', 'copy boolean'],
    explanation: ['k2-content-current-v1', 'intelligence_current.explanation', 'MOVE', 'latest explanation only; index=false'],
    polarity: ['k2-content-current-v1', 'intelligence_current.sentiment_score', 'TRANSFORM', 'validate score range and cast to float'],
    tokenizers: ['k2-enrichment-event', '', 'MOVE', 'do not persist token arrays in current content; regenerate for search analysis'],
    logDetectLabels: ['Object storage / k2-enrichment-event', 'payload_ref', 'MOVE', 'store raw log externally; keep ref/checksum/event metadata'],
    logDetectLang: ['Object storage / k2-enrichment-event', 'payload_ref', 'MOVE', 'store raw log externally; keep ref/checksum/event metadata'],
    logDetectSentiments: ['Object storage / k2-enrichment-event', 'payload_ref', 'MOVE', 'store raw log externally; keep ref/checksum/event metadata'],
    logDetectSpam: ['Object storage / k2-enrichment-event', 'payload_ref', 'MOVE', 'store raw log externally; keep ref/checksum/event metadata'],
  };
  if (direct[fieldPath]) return direct[fieldPath];

  if (fieldPath.startsWith('profile.')) {
    if (fieldPath === 'profile.id') return ['k2-content-current-v1', 'author.id', 'TRANSFORM', 'copy platform ID; derive author.canonical_id; build author.url only when the platform accepts this stable ID'];
    if (fieldPath === 'profile.name') return ['k2-content-current-v1', 'author.name', 'DENORMALIZE', 'copy display name only; never use it as the stable URL key; authoritative profile remains separate'];
    return ['k2-profile-current-v1 / k2-profile-snapshot', prefixTarget(fieldPath, 'profile', 'profile'), 'MOVE', 'remove full profile attributes from content projection; upsert current and append snapshot'];
  }
  if (fieldPath === 'profile') return ['k2-content-current-v1 + k2-profile-current-v1 / k2-profile-snapshot', 'author', 'SPLIT', 'keep author.id/name/external_id in content; emit full profile entity and snapshots separately'];

  if (fieldPath.startsWith('locale.')) {
    const localeMap = { country: 'country_code', language: 'language_code', location: 'location_name' };
    const targetLeaf = localeMap[leaf] ?? leaf;
    return ['k2-content-current-v1', `locale.${targetLeaf}`, 'TRANSFORM', leaf === 'geographic' ? 'parse valid lat/lon into geo_point' : 'normalize controlled value; omit blank'];
  }
  if (fieldPath === 'locale') return ['k2-content-current-v1', 'locale', 'TRANSFORM', 'normalize country/language/timezone and validate geo_point'];

  if (fieldPath.startsWith('ds.')) return ['k2-content-current-v1', leaf === 'source' ? 'lineage.collector' : `lineage.${leaf}`, 'MOVE', 'move crawler provenance into lineage'];
  if (fieldPath === 'ds') return ['k2-content-current-v1', 'lineage', 'MOVE', 'move crawler provenance into lineage'];

  if (fieldPath.startsWith('detailInteraction.')) {
    const targetLeaf = { reactions: 'total' }[leaf] ?? leaf;
    if (['comments', 'shares', 'views'].includes(leaf)) return ['k2-content-current-v1', `engagement_current.${leaf}`, 'MERGE', 'coerce to long; prefer freshest counter and prevent double counting'];
    return ['k2-content-current-v1', `engagement_current.reactions.${targetLeaf}`, 'MOVE', 'coerce numeric strings to long'];
  }
  if (fieldPath === 'detailInteraction') return ['k2-content-current-v1', 'engagement_current', 'MERGE', 'merge detailed counters into bounded current engagement object'];

  if (fieldPath.startsWith('translateBuzz.')) {
    const targetLeaf = { lang: 'language_code', contentSummary: 'summary' }[leaf] ?? leaf;
    return ['k2-content-current-v1', `translations[].${targetLeaf}`, 'TRANSFORM', 'bounded nested array; normalize language code and omit empty text'];
  }
  if (fieldPath === 'translateBuzz') return ['k2-content-current-v1', 'translations[]', 'TRANSFORM', 'convert bounded translations to nested documents; overflow/history to enrichment event'];

  if (fieldPath.startsWith('contentTags.')) return ['k2-content-current-v1', `content_spans[].${leaf}`, 'RENAME', 'preserve tuple integrity as bounded nested spans'];
  if (fieldPath === 'contentTags') return ['k2-content-current-v1', 'content_spans[]', 'RENAME', 'bounded nested spans'];

  if (root in tagRoots) {
    if (fieldPath === root) return ['k2-content-current-v1 + k2-enrichment-event', `tags.${tagRoots[root]}`, 'SPLIT', 'keep only current tag values in content; audit metadata becomes events'];
    if (leaf === 'value') return ['k2-content-current-v1', `tags.${tagRoots[root]}`, 'EXTRACT', 'extract and deduplicate current values'];
    return ['k2-enrichment-event', `tag_event.${leaf}`, 'MOVE', 'preserve tag audit/history outside content current'];
  }

  if (reviewRoots.has(root)) {
    if (fieldPath === root) return ['k2-review-current-v1 / k2-review-event', root, 'SPLIT', 'current review state to review-current; audit/history to review-event'];
    return ['k2-review-current-v1 / k2-review-event', `${root}.${leaf}`, ['createdAt', 'createdBy', 'updatedAt', 'updatedBy', 'timeShow'].includes(leaf) ? 'MOVE' : 'SPLIT', 'remove workflow state from search projection'];
  }

  if (fieldPath.startsWith('isDeletedDetail.')) return ['k2-audit-event', `delete_event.${leaf}`, 'MOVE', 'retain deletion audit separately; content keeps flags.is_deleted'];
  if (fieldPath === 'isDeletedDetail') return ['k2-audit-event', 'delete_event', 'MOVE', 'retain deletion audit separately; content keeps flags.is_deleted'];

  if (fieldPath.startsWith('sharedMedia.')) {
    if (leaf === 'value') return ['k2-content-current-v1', 'media.shared_value', 'EXTRACT', 'keep only current serving reference; index=false'];
    return ['k2-enrichment-event', `shared_media_event.${leaf}`, 'MOVE', 'history/audit outside content current'];
  }
  if (fieldPath === 'sharedMedia') return ['k2-content-current-v1 + k2-enrichment-event', 'media.shared_value', 'SPLIT', 'current value in content; history/audit as event'];

  if (fieldPath.startsWith('sentiment.')) {
    if (leaf === 'value') return ['k2-content-current-v1', 'intelligence_current.sentiment', 'EXTRACT', 'map 1→POSITIVE, 2→NEGATIVE, 3→NEUTRAL, -1/missing→NONE'];
    return ['k2-enrichment-event', `sentiment_event.${leaf}`, 'MOVE', 'preserve operator/model audit metadata as event'];
  }
  if (fieldPath === 'sentiment') return ['k2-content-current-v1 + k2-enrichment-event', 'intelligence_current.sentiment', 'SPLIT', 'latest normalized text value in content; audit/history as event'];

  if (fieldPath.startsWith('entity_recognition.')) return ['k2-content-current-v1', `intelligence_current.entities[].${leaf}`, 'RENAME', 'bounded nested migration bridge; resolve canonical entity_ids when possible'];
  if (fieldPath === 'entity_recognition') return ['k2-content-current-v1', 'intelligence_current.entities[]', 'TRANSFORM', 'deduplicate tuples; populate canonical entity_ids when resolved'];
  if (fieldPath.startsWith('context.')) return ['k2-content-current-v1', `intelligence_current.context[].${leaf}`, 'RENAME', 'bounded nested context tuples'];
  if (fieldPath === 'context') return ['k2-content-current-v1', 'intelligence_current.context[]', 'RENAME', 'bounded nested context tuples'];

  if (fieldPath.startsWith('inference.')) {
    const remainder = fieldPath.slice('inference.'.length);
    if (remainder === 'polarity') return ['k2-content-current-v1', 'intelligence_current.sentiment_score', 'MERGE', 'cast float; prefer versioned latest inference output'];
    if (remainder === 'mention_mainbrand') return ['k2-content-current-v1', 'flags.mentions_main_brand', 'MERGE', 'copy boolean; prefer versioned latest inference output'];
    if (remainder === 'sentiment') return ['k2-content-current-v1', 'intelligence_current.sentiment', 'TRANSFORM', 'map 1→POSITIVE, 2→NEGATIVE, 3→NEUTRAL, -1/missing→NONE'];
    if (remainder.startsWith('entity_recognition.')) return ['k2-content-current-v1', `intelligence_current.entities[].${remainder.split('.').at(-1)}`, 'MERGE', 'deduplicate with top-level entity tuples'];
    if (remainder === 'entity_recognition') return ['k2-content-current-v1', 'intelligence_current.entities[]', 'MERGE', 'deduplicate with top-level entity tuples'];
    if (remainder.startsWith('context.')) return ['k2-content-current-v1', `intelligence_current.context[].${remainder.split('.').at(-1)}`, 'MERGE', 'deduplicate with top-level context tuples'];
    if (remainder === 'context') return ['k2-content-current-v1', 'intelligence_current.context[]', 'MERGE', 'deduplicate with top-level context tuples'];
    if (remainder === 'explanation') return ['k2-content-current-v1', 'intelligence_current.explanation', 'MERGE', 'latest explanation only; full version stays in enrichment event'];
    return ['k2-content-current-v1', `intelligence_current.${remainder}`, 'MERGE', 'latest version wins; full model output and version metadata go to enrichment event'];
  }
  if (fieldPath === 'inference') return ['k2-content-current-v1 + k2-enrichment-event', 'intelligence_current', 'SPLIT', 'project latest bounded fields; append full versioned inference event'];

  if (inferenceNames.has(fieldPath)) return ['k2-content-current-v1', `intelligence_current.${fieldPath}`, 'MERGE', 'legacy top-level fallback; prefer versioned inference result when present'];

  if (fieldPath.startsWith('usage.')) return ['k2-enrichment-event / k2-metric-daily', `usage.${leaf}`, 'MOVE', 'store per-run usage on event and aggregate daily metrics'];
  if (fieldPath === 'usage') return ['k2-enrichment-event / k2-metric-daily', 'usage', 'MOVE', 'operational/model usage is not content search state'];

  return ['Object storage / migration quarantine', '', 'REVIEW', `no automatic target rule for ${fieldPath}; retain raw payload reference and review`];
}

const mappingRows = sourceRows.map((row) => {
  const [destination, targetField, action, rule] = mapField(row.fieldPath, row.type);
  return { ...row, destination, targetField, action, rule };
});

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
  const v = String(value ?? '').toLowerCase();
  if (v.includes('comment')) return 'COMMENT';
  if (v.includes('video')) return 'VIDEO';
  if (v.includes('topic') || v.includes('post')) return 'POST';
  return 'OTHER';
}
function hostnameFromPlatform(platform) {
  if (platform === 'facebook') return 'facebook.com';
  if (platform === 'tiktok') return 'tiktok.com';
  if (platform === 'instagram') return 'instagram.com';
  if (platform === 'threads') return 'threads.com';
  if (platform === 'youtube') return 'youtube.com';
  if (platform === 'linkedin') return 'linkedin.com';
  return undefined;
}
function cleanHandle(value) {
  const handle = String(value ?? '').trim().replace(/^@/, '');
  return handle && !/\s/.test(handle) ? handle : undefined;
}
function domainFrom(...values) {
  for (const value of values) {
    const candidate = String(value ?? '').trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
    if (/^(?:[a-z0-9-]+\.)+[a-z]{2,}$/i.test(candidate)) return candidate;
  }
  return undefined;
}
function authorUsernameFrom(source, platform) {
  if (!['tiktok', 'instagram', 'threads'].includes(platform)) return undefined;
  const id = cleanHandle(source.profile?.id);
  return id && !/^\d+$/.test(id) ? id : undefined;
}
function sourceUsernameFrom(source, platform) {
  if (!['tiktok', 'instagram', 'threads'].includes(platform)) return undefined;
  const id = cleanHandle(source.siteId);
  return id && !/^\d+$/.test(id) ? id : undefined;
}
function youtubeChannelUrl(id, name) {
  const channelId = String(id ?? '').trim();
  if (/^UC[A-Za-z0-9_-]+$/.test(channelId)) return `https://www.youtube.com/channel/${channelId}`;
  const handle = cleanHandle(String(name ?? '').startsWith('@') ? name : '');
  return handle ? `https://www.youtube.com/@${handle}` : undefined;
}
function stableId(value) {
  const id = String(value ?? '').trim().replace(/^@/, '');
  return id || undefined;
}
function siteRootUrlFrom(source) {
  try {
    const parsed = new URL(source.url);
    if (['http:', 'https:'].includes(parsed.protocol)) return parsed.origin;
  } catch {}
  const domain = domainFrom(source.hostname, source.siteName, source.siteId, source.profile?.id);
  return domain ? `https://${domain}` : undefined;
}
function authorUrlFrom(source, platform) {
  const id = stableId(source.profile?.id);
  if (platform === 'facebook' && String(source.type ?? '').toLowerCase().startsWith('fbevent')) return undefined;
  if (platform === 'facebook' && id) return `https://www.facebook.com/${id}`;
  if (platform === 'tiktok' && id) return `https://www.tiktok.com/@${id}`;
  if (platform === 'instagram' && id) return `https://www.instagram.com/@${id}`;
  if (platform === 'threads' && id) return `https://www.threads.com/@${id}`;
  if (platform === 'youtube') return youtubeChannelUrl(id, source.profile?.name);
  return siteRootUrlFrom(source);
}
function sourceUrlFrom(source, platform) {
  const id = stableId(source.siteId);
  const legacyType = String(source.type ?? '').toLowerCase();
  if (platform === 'facebook' && id) {
    if (legacyType.startsWith('fbgroup')) return `https://www.facebook.com/groups/${id}`;
    if (legacyType.startsWith('fbevent')) return undefined;
    return `https://www.facebook.com/${id}`;
  }
  if (platform === 'tiktok' && id) return `https://www.tiktok.com/@${id}`;
  if (platform === 'instagram' && id) return `https://www.instagram.com/@${id}`;
  if (platform === 'threads' && id) return `https://www.threads.com/@${id}`;
  if (platform === 'youtube') return youtubeChannelUrl(id, source.siteName);
  return siteRootUrlFrom(source);
}
function sourceTypeFrom(value, platform) {
  const v = String(value ?? '').toLowerCase();
  if (v.startsWith('fbevent')) return undefined;
  if (v.startsWith('fbpage')) return 'PAGE';
  if (v.startsWith('fbgroup')) return 'GROUP';
  if (v.startsWith('fbuser')) return 'USER';
  if (platform === 'youtube') return 'CHANNEL';
  if (platform === 'news') return 'SITE';
  if (platform === 'forum') return 'FORUM';
  if (platform === 'ecommerce') return 'STORE';
  if (platform === 'review') return 'PLACE';
  if (['web', 'sns'].includes(platform)) return 'SITE';
  return 'ACCOUNT';
}
const urlRules = [
  { platform: 'facebook', legacy_types: 'fbPageTopic, fbPageComment', source_type: 'PAGE', author_key: 'profile.id', author_url: 'https://www.facebook.com/{profile.id}', source_key: 'siteId', source_url: 'https://www.facebook.com/{siteId}', confidence: 'HIGH', fallback: 'null when ID is missing' },
  { platform: 'facebook', legacy_types: 'fbGroupTopic, fbGroupComment', source_type: 'GROUP', author_key: 'profile.id', author_url: 'https://www.facebook.com/{profile.id}', source_key: 'siteId', source_url: 'https://www.facebook.com/groups/{siteId}', confidence: 'HIGH', fallback: 'null when ID is missing' },
  { platform: 'facebook', legacy_types: 'fbUserTopic, fbUserComment', source_type: 'USER', author_key: 'profile.id', author_url: 'https://www.facebook.com/{profile.id}', source_key: 'siteId', source_url: 'https://www.facebook.com/{siteId}', confidence: 'HIGH', fallback: 'null when ID is missing' },
  { platform: 'tiktok', legacy_types: 'tiktokTopic, tiktokComment', source_type: 'ACCOUNT', author_key: 'profile.id', author_url: 'https://www.tiktok.com/@{profile.id}', source_key: 'siteId', source_url: 'https://www.tiktok.com/@{siteId}', confidence: 'SPECIFIED', fallback: 'null when ID is missing; do not use profile.name/siteName' },
  { platform: 'instagram', legacy_types: 'snsTopic, snsComment when document url contains instagram.com', source_type: 'ACCOUNT', author_key: 'profile.id', author_url: 'https://www.instagram.com/@{profile.id}', source_key: 'siteId', source_url: 'https://www.instagram.com/@{siteId}', confidence: 'SPECIFIED', fallback: 'classify SNS as Instagram only when document URL contains instagram.com' },
  { platform: 'sns', legacy_types: 'snsTopic, snsComment without instagram.com', source_type: 'ACCOUNT', author_key: 'site root', author_url: '{document URL origin}', source_key: 'site root', source_url: '{document URL origin}', confidence: 'SPECIFIED', fallback: 'treat as site-based SNS, not Instagram' },
  { platform: 'threads', legacy_types: 'threadsTopic, threadsComment', source_type: 'ACCOUNT', author_key: 'profile.id', author_url: 'https://www.threads.com/@{profile.id}', source_key: 'siteId', source_url: 'https://www.threads.com/@{siteId}', confidence: 'SPECIFIED', fallback: 'null when ID is missing; do not use profile.name/siteName' },
  { platform: 'youtube', legacy_types: 'youtubeTopic, youtubeComment', source_type: 'CHANNEL', author_key: 'profile.id', author_url: 'https://www.youtube.com/channel/{profile.id}', source_key: 'siteId', source_url: 'https://www.youtube.com/channel/{siteId}', confidence: 'HIGH', fallback: 'if only @handle exists, use https://www.youtube.com/@{handle}' },
  { platform: 'news', legacy_types: 'newsTopic, newsComment', source_type: 'SITE', author_key: 'document URL origin', author_url: '{site root URL}', source_key: 'document URL origin', source_url: '{site root URL}', confidence: 'SPECIFIED', fallback: 'fallback to hostname/siteName/siteId domain' },
  { platform: 'forum', legacy_types: 'forumTopic, forumComment', source_type: 'FORUM', author_key: 'document URL origin', author_url: '{site root URL}', source_key: 'document URL origin', source_url: '{site root URL}', confidence: 'SPECIFIED', fallback: 'fallback to hostname/siteName/siteId domain' },
  { platform: 'ecommerce', legacy_types: 'ecommerceTopic, ecommerceComment', source_type: 'STORE', author_key: 'document URL origin', author_url: '{site root URL}', source_key: 'document URL origin', source_url: '{site root URL}', confidence: 'SPECIFIED', fallback: 'fallback to hostname/siteName/siteId domain' },
  { platform: 'review', legacy_types: 'reviewTopic', source_type: 'PLACE', author_key: 'document URL origin', author_url: '{site root URL}', source_key: 'document URL origin', source_url: '{site root URL}', confidence: 'SPECIFIED', fallback: 'fallback to hostname/siteName/siteId domain' },
  { platform: 'linkedin', legacy_types: 'linkedinTopic, linkedinComment', source_type: 'ACCOUNT', author_key: 'document URL origin', author_url: '{site root URL}', source_key: 'document URL origin', source_url: '{site root URL}', confidence: 'SPECIFIED', fallback: 'fallback to hostname/siteName/siteId domain' },
  { platform: 'other/site', legacy_types: 'all remaining types', source_type: 'SITE', author_key: 'document URL origin', author_url: '{site root URL}', source_key: 'document URL origin', source_url: '{site root URL}', confidence: 'SPECIFIED', fallback: 'fallback to hostname/siteName/siteId domain' },
];
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

const channelUrlExamples = channelTypeSamples.filter((row) => !String(row.type ?? '').toLowerCase().startsWith('fbevent')).map((row) => {
  const source = row.sample ?? {};
  const platform = platformFrom(source);
  return {
    legacy_type: row.type,
    document_count: row.count,
    platform,
    document_url: source.url,
    author_id: source.profile?.id == null ? null : String(source.profile.id),
    author_name: source.profile?.name,
    author_url: authorUrlFrom(source, platform) ?? null,
    source_id: source.siteId == null ? null : String(source.siteId),
    source_name: source.siteName,
    source_type: sourceTypeFrom(source.type, platform),
    source_url: sourceUrlFrom(source, platform) ?? null,
  };
});
function asLong(value) {
  if (value === null || value === undefined || value === '') return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? Math.trunc(n) : undefined;
}
function toIsoDate(value) {
  if (value === null || value === undefined || value === '') return undefined;
  let date;
  if (typeof value === 'number' || /^-?\d+(?:\.\d+)?$/.test(String(value).trim())) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return undefined;
    date = new Date(Math.abs(numeric) < 100000000000 ? numeric * 1000 : numeric);
  } else {
    date = new Date(value);
  }
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}
function nonEmptyObject(object) {
  return Object.fromEntries(Object.entries(object).filter(([, value]) => value !== undefined && value !== null && value !== ''));
}

function transformDocument(sampleDocument) {
  const source = sampleDocument._source ?? {};
  const platform = platformFrom(source);
  const hostname = hostnameFromPlatform(platform) ?? (() => { try { return new URL(source.url).hostname.replace(/^www\./, ''); } catch { return source.hostname; } })();
  const authorUsername = authorUsernameFrom(source, platform);
  const sourceUsername = sourceUsernameFrom(source, platform);
  const legacyId = sampleDocument._id;
  const transformed = {
    content_id: `content:${platform}:${contentTypeFrom(source.contentType ?? source.type).toLowerCase()}:${legacyId}`,
    schema_version: '1.0.0',
    projection_version: 'content-projector-migration-v2',
    platform,
    content_type: contentTypeFrom(source.contentType ?? source.type),
    external_id: legacyId,
    url: source.url,
    origin_url: source.originLink || undefined,
    author: nonEmptyObject({
      id: source.profile?.id == null || source.profile.id === '' ? undefined : String(source.profile.id),
      canonical_id: source.profile?.id ? `profile:${platform}:${source.profile.id}` : undefined,
      name: source.profile?.name || undefined,
      username: authorUsername,
      platform,
      hostname,
      url: authorUrlFrom(source, platform),
    }),
    parent_content_id: source.parentId ? `content:${platform}:${source.parentId}` : undefined,
    published_at: toIsoDate(source.publishedDate),
    collected_at: toIsoDate(source.insertedDate),
    updated_at: toIsoDate(source.updatedDate),
    last_seen_at: toIsoDate(source.lastVisitDate),
    relations: nonEmptyObject({
      parent_published_at: toIsoDate(source.parentDate),
      comment_parent_content_id: source.commentParentId ? `content:${platform}:${source.commentParentId}` : undefined,
    }),
    text: nonEmptyObject({ original: source.content, normalized: String(source.content ?? '').trim().normalize('NFC'), title: source.title, description: source.description, caption: source.caption, summary: source.contentSummary }),
    language: nonEmptyObject({ code: String(source.lang ?? source.locale?.language ?? '').toLowerCase() || undefined }),
    source: nonEmptyObject({
      id: source.siteId == null || source.siteId === '' ? undefined : String(source.siteId), name: source.siteName, username: sourceUsername, type: sourceTypeFrom(source.type, platform),
      platform, hostname, url: sourceUrlFrom(source, platform),
    }),
    locale: nonEmptyObject({
      region: source.locale?.region,
      country_code: String(source.locale?.country ?? '').toLowerCase() === 'vietnam' ? 'VN' : source.locale?.country,
      language_code: String(source.locale?.language ?? '').toLowerCase() || undefined,
      timezone: source.locale?.timezone === '+7' ? '+07:00' : source.locale?.timezone,
      location_name: typeof source.locale?.location === 'string' ? source.locale.location : undefined,
      address: source.locale?.address,
    }),
    engagement_current: nonEmptyObject({ likes: asLong(source.likes), shares: asLong(source.shares), comments: asLong(source.comments), interactions: asLong(source.interactions), views: asLong(source.views) }),
    match_context_ids: (source.filters ?? []).map((value) => `context:legacy:${value}`),
    flags: nonEmptyObject({ is_deleted: source.isDeleted, has_translation: source.hasTranslateBuzz ?? false, was_updated: source.updatedBuzz }),
    tags: nonEmptyObject({ labels: (source.labels ?? []).map((x) => x?.value).filter(Boolean) }),
    content_spans: (source.contentTags ?? []).map((x) => nonEmptyObject({ type: x.type, value: x.value, offset: x.offset, length: x.length })),
    translations: (source.translateBuzz ?? []).map((x) => nonEmptyObject({ language_code: String(x.lang ?? '').toLowerCase(), content: x.content, title: x.title, description: x.description, summary: x.contentSummary })),
    intelligence_current: nonEmptyObject({ entity_ids: [], topic_ids: [], sentiment: sentimentFrom(source), sentiment_score: source.inference?.polarity ?? source.polarity }),
    lineage: nonEmptyObject({ source_index: sourceIndex, source_document_id: sampleDocument._id, collector: source.ds?.source, migrated_at: '2026-09-09T00:00:00.000Z' }),
  };
  for (const [key, value] of Object.entries(transformed)) {
    if (value === undefined || value === null || value === '' || (Array.isArray(value) && value.length === 0)) delete transformed[key];
    if (value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === 0) delete transformed[key];
  }
  return transformed;
}

const transformedSamples = selectedSamples.map((sampleDocument) => transformDocument(sampleDocument));
const transformedSample = transformedSamples[0];
const s = sample._source;

function validateStrictDocument(value, properties, currentPath = '') {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return [];
  const errors = [];
  for (const [key, child] of Object.entries(value)) {
    const fieldPath = currentPath ? `${currentPath}.${key}` : key;
    const spec = properties?.[key];
    if (!spec) {
      errors.push(`Unknown strict-mapping field: ${fieldPath}`);
      continue;
    }
    if (Array.isArray(child) && spec.properties) {
      for (const item of child) errors.push(...validateStrictDocument(item, spec.properties, fieldPath));
    } else if (child && typeof child === 'object' && spec.properties) {
      errors.push(...validateStrictDocument(child, spec.properties, fieldPath));
    }
  }
  return errors;
}
const strictValidationErrors = transformedSamples.flatMap((document) => validateStrictDocument(document, resolvedMappings.properties));
if (strictValidationErrors.length) throw new Error(strictValidationErrors.join('\n'));

const bundle = {
  summary: {
    target_index: 'k2-content-current-v1',
    read_alias: 'k2-content-read',
    write_alias: 'k2-content-write',
    role: 'bounded rebuildable search/serving projection',
    dynamic: 'strict',
    date_format: DATE_FORMAT,
    date_output: DATE_OUTPUT,
    source_es7_index: sourceIndex,
  },
  api_sequence: [
    ...components.map(([name, body]) => ({ method: 'PUT', path: `/_component_template/${name}`, body_file: `${name}.json`, body })),
    { method: 'PUT', path: '/_index_template/k2-it-content-current-v1', body_file: 'k2-it-content-current-v1.json', body: indexTemplate },
    { method: 'POST', path: '/_index_template/_simulate_index/k2-content-current-v1', purpose: 'resolve component composition and detect mapping conflicts before index creation' },
    { method: 'PUT', path: '/k2-content-current-v1', body_file: 'k2-content-current-v1-create.json', body: createIndexBody },
  ],
};

await fs.mkdir(outputDir, { recursive: true });
await fs.mkdir(previewDir, { recursive: true });
for (const [name, body] of components) await fs.writeFile(path.join(outputDir, `${name}.json`), `${JSON.stringify(body, null, 2)}\n`);
await fs.writeFile(path.join(outputDir, 'k2-it-content-current-v1.json'), `${JSON.stringify(indexTemplate, null, 2)}\n`);
await fs.writeFile(path.join(outputDir, 'k2-content-current-v1-create.json'), `${JSON.stringify(createIndexBody, null, 2)}\n`);
await fs.writeFile(path.join(outputDir, 'k2-content-current-v1-template-bundle.json'), `${JSON.stringify(bundle, null, 2)}\n`);
await fs.writeFile(path.join(outputDir, 'es7-sample-record.json'), `${JSON.stringify({ _index: sourceIndex, ...sample }, null, 2)}\n`);
await fs.writeFile(path.join(outputDir, 'es8-transformed-sample-record.json'), `${JSON.stringify({ _index: 'k2-content-current-v1', _id: transformedSample.content_id, _source: transformedSample }, null, 2)}\n`);
await fs.writeFile(path.join(outputDir, 'es8-sample-documents.json'), `${JSON.stringify(transformedSamples.map((document) => ({ _index: 'k2-content-current-v1', _id: document.content_id, _source: document })), null, 2)}\n`);
await fs.writeFile(path.join(outputDir, 'es7-to-es8-field-map.json'), `${JSON.stringify(mappingRows, null, 2)}\n`);
await fs.writeFile(path.join(outputDir, 'channel-url-rules.json'), `${JSON.stringify(urlRules, null, 2)}\n`);
await fs.writeFile(path.join(outputDir, 'channel-url-examples.json'), `${JSON.stringify(channelUrlExamples, null, 2)}\n`);

const font = 'Arial';
const navy = '#17365D';
const blue = '#2F75B5';
const lightBlue = '#D9EAF7';
const lightGray = '#F2F4F7';
const amber = '#FFF2CC';
const green = '#E2F0D9';
const red = '#FCE4D6';
const border = '#D9E1F2';
const workbook = Workbook.create();
const overview = workbook.worksheets.add('Overview');
const mapSheet = workbook.worksheets.add('ES7 to ES8 Map');
const schemaSheet = workbook.worksheets.add('ES8 Schema');
const urlRuleSheet = workbook.worksheets.add('URL Rules');
const sampleSheet = workbook.worksheets.add('Sample Transform');
const rawSheet = workbook.worksheets.add('Raw JSON');
for (const sheet of [overview, mapSheet, schemaSheet, urlRuleSheet, sampleSheet, rawSheet]) sheet.showGridLines = false;
overview.tabColor = navy;
mapSheet.tabColor = blue;
schemaSheet.tabColor = '#5B9BD5';
urlRuleSheet.tabColor = '#8064A2';
sampleSheet.tabColor = '#70AD47';
rawSheet.tabColor = '#A5A5A5';

const destinationCounts = new Map();
const actionCounts = new Map();
for (const row of mappingRows) {
  destinationCounts.set(row.destination, (destinationCounts.get(row.destination) ?? 0) + 1);
  actionCounts.set(row.action, (actionCounts.get(row.action) ?? 0) + 1);
}
const reviewCount = actionCounts.get('REVIEW') ?? 0;
const currentCount = mappingRows.filter((r) => r.destination.includes('k2-content-current-v1')).length;
const separateCount = mappingRows.length - currentCount;

overview.getRange('A2:H2').merge();
overview.getRange('A2').values = [['ES7 → Kompa 2.0 ES8 redesign']];
overview.getRange('A2:H2').format = { font: { name: font, size: 16, bold: true, color: navy } };
overview.getRange('A3:H3').format.borders = { bottom: { style: 'thin', color: blue } };
overview.getRange('A5:B13').values = [
  ['Source / target', 'Value'],
  ['ES7 source index', sourceIndex],
  ['ES7 engine', 'Elasticsearch 7.7.1'],
  ['Searchable source records', sampleBundle.count],
  ['Lucene docs incl. nested docs', stats.primaries?.docs?.count ?? ''],
  ['Primary store bytes', stats.primaries?.store?.size_in_bytes ?? ''],
  ['ES7 mapped field paths', sourceRows.length],
  ['ES8 target', 'k2-content-current-v1'],
  ['Migration method', 'Project → transform → bulk index'],
];
overview.getRange('D5:E13').values = [
  ['Design control', 'Decision'],
  ['Dynamic fields', 'strict'],
  ['IDs / enums', 'keyword'],
  ['Dates', `${DATE_FORMAT}; UTC ISO 8601 with milliseconds`],
  ['Large history / logs', 'separate event datasets or raw_ref'],
  ['Aliases', 'k2-content-read / k2-content-write'],
  ['Document URL', 'top-level url'],
  ['Facebook source.type', 'fbPage*=PAGE; fbGroup*=GROUP; fbUser*=USER'],
  ['Sentiment keyword', '1=POSITIVE; 2=NEGATIVE; 3=NEUTRAL; -1/missing=NONE'],
];
overview.getRange('G5:H10').values = [
  ['Mapping result', 'Count'],
  ['Source paths reviewed', mappingRows.length],
  ['Routed to content current', currentCount],
  ['Routed/split elsewhere', separateCount],
  ['Manual review remaining', reviewCount],
  ['ES8 sample documents', transformedSamples.length],
];
for (const header of ['A5:B5', 'D5:E5', 'G5:H5']) overview.getRange(header).format = { fill: navy, font: { name: font, size: 10, bold: true, color: '#FFFFFF' }, horizontalAlignment: 'center' };
overview.getRange('A5:B13').format.borders = { preset: 'outside', style: 'thin', color: border };
overview.getRange('D5:E13').format.borders = { preset: 'outside', style: 'thin', color: border };
overview.getRange('G5:H10').format.borders = { preset: 'outside', style: 'thin', color: border };
overview.getRange('B8:B10').format.numberFormat = '#,##0';
overview.getRange('H6:H10').format.numberFormat = '#,##0';

overview.getRange('A16:H16').merge();
overview.getRange('A16').values = [['Architecture decisions from Kompa 2.0 Blueprint']];
overview.getRange('A16:H16').format = { fill: lightBlue, font: { name: font, size: 10, bold: true, color: navy } };
const decisions = [
  ['1', 'ES8 is a search and near-real-time serving projection. It is rebuildable, not the raw/workflow source of truth.'],
  ['2', 'Current content keeps canonical IDs, searchable text, bounded current engagement and latest intelligence only.'],
  ['3', 'Profile history, engagement history, enrichment/model outputs, review/QC state and audit logs move to dedicated datasets.'],
  ['4', 'Raw payloads and long operational logs are retained outside the current index through raw_ref/checksum or event payload_ref.'],
  ['5', 'The source document must be transformed before bulk indexing; an ES mapping alone does not rename or restructure _source.'],
];
overview.getRange('A17:B21').values = decisions;
overview.getRange('A17:A21').format = { font: { name: font, size: 10, bold: true, color: blue }, horizontalAlignment: 'center' };
overview.getRange('B17:B21').format = { font: { name: font, size: 10, color: '#404040' }, wrapText: true };

overview.getRange('D23:H23').merge();
overview.getRange('D23').values = [['Deployment order']];
overview.getRange('D23:H23').format = { fill: lightBlue, font: { name: font, size: 10, bold: true, color: navy } };
overview.getRange('D24:H28').values = [
  ['1', 'Install component templates', '', '', ''],
  ['2', 'Install index template', '', '', ''],
  ['3', 'Simulate template for k2-content-current-v1', '', '', ''],
  ['4', 'Create physical index and aliases', '', '', ''],
  ['5', 'Run projector transform and query/count parity checks', '', '', ''],
];
for (let row = 24; row <= 28; row += 1) overview.getRange(`E${row}:H${row}`).merge();

overview.getRange('A31:H31').merge();
overview.getRange('A31').values = [['Source references']];
overview.getRange('A31:H31').format = { fill: lightBlue, font: { name: font, size: 10, bold: true, color: navy } };
const references = [
  'Kompa_2.0_Master_Blueprint_v1.2 — page 20: ES8 is the search and near-real-time serving layer.',
  'Kompa_2.0_Master_Blueprint_v1.2 — page 24: strict dynamic mapping, keyword IDs/enums, explicit dates, bounded nested arrays and raw_ref/checksum.',
  'Kompa_2.0_Master_Blueprint_v1.2 — page 97: component/index template simulation, aliases and parity validation before rollout.',
  'Kompa-2.0-Master-Deck-VN-37-slides — slides 5, 8 and 9: platform architecture, data factory and topic/query matching flow.',
];
overview.getRange('A32:H35').values = references.map((value) => [value, '', '', '', '', '', '', '']);
for (let row = 32; row <= 35; row += 1) overview.getRange(`A${row}:H${row}`).merge();
overview.getRange('A32:H35').format = { font: { name: font, size: 9, color: '#595959', italic: true }, wrapText: true };
overview.getRange('32:35').format.rowHeight = 24;

const mapValues = mappingRows.map((r) => [r.fieldPath, r.type, r.destination, r.targetField, r.action, r.rule, r.analyzer, r.format]);
mapSheet.getRange('A1:H1').values = [['ES7 field', 'ES7 type', 'Destination dataset', 'ES8 field', 'Action', 'Transform rule', 'ES7 analyzer', 'ES7 date format']];
mapSheet.getRange(`A2:H${mapValues.length + 1}`).values = mapValues;
mapSheet.tables.add(`A1:H${mapValues.length + 1}`, true, 'Es7ToEs8MapTable').style = 'TableStyleMedium2';
mapSheet.freezePanes.freezeRows(1);
mapSheet.freezePanes.freezeColumns(1);
mapSheet.getRange(`A1:H${mapValues.length + 1}`).format.font = { name: font, size: 9 };
mapSheet.getRange('A1:H1').format = { fill: navy, font: { name: font, size: 9, bold: true, color: '#FFFFFF' }, horizontalAlignment: 'center', verticalAlignment: 'center', wrapText: true };
mapSheet.getRange(`E2:E${mapValues.length + 1}`).conditionalFormats.add('containsText', { text: 'REVIEW', format: { fill: red, font: { color: '#9C0006', bold: true } } });
mapSheet.getRange(`E2:E${mapValues.length + 1}`).conditionalFormats.add('containsText', { text: 'SPLIT', format: { fill: amber, font: { color: '#9C6500' } } });

const schemaValues = targetRows.map((r) => {
  const component = r.fieldPath.startsWith('text.') ? 'k2-ct-content-text-v1'
    : r.fieldPath.startsWith('intelligence_current.') ? 'k2-ct-intelligence-current-v1'
      : ['content_id', 'schema_version', 'projection_version', 'source_document_version', 'published_at', 'collected_at', 'updated_at', 'last_seen_at', 'raw_ref', 'raw_checksum'].includes(r.fieldPath.split('.')[0]) || r.fieldPath.startsWith('lineage.') ? 'k2-ct-common-meta-v1'
        : 'k2-ct-content-core-v1';
  return [component, r.fieldPath, r.type, r.indexed, r.analyzer, r.format, r.dynamic];
});
schemaSheet.getRange('A1:G1').values = [['Component template', 'ES8 field', 'ES8 type', 'Indexed', 'Analyzer', 'Date format', 'Dynamic']];
schemaSheet.getRange(`A2:G${schemaValues.length + 1}`).values = schemaValues;
schemaSheet.tables.add(`A1:G${schemaValues.length + 1}`, true, 'Es8SchemaTable').style = 'TableStyleMedium2';
schemaSheet.freezePanes.freezeRows(1);
schemaSheet.freezePanes.freezeColumns(2);
schemaSheet.getRange(`A1:G${schemaValues.length + 1}`).format.font = { name: font, size: 9 };
schemaSheet.getRange('A1:G1').format = { fill: navy, font: { name: font, size: 9, bold: true, color: '#FFFFFF' }, horizontalAlignment: 'center', wrapText: true };

const urlRuleValues = urlRules.map((r) => [r.platform, r.legacy_types, r.source_type, r.author_key, r.author_url, r.source_key, r.source_url, r.confidence, r.fallback]);
urlRuleSheet.getRange('A1:I1').values = [['Platform', 'ES7 types', 'source.type', 'Author key', 'author.url rule', 'Source key', 'source.url rule', 'Confidence', 'Fallback / safety rule']];
urlRuleSheet.getRange(`A2:I${urlRuleValues.length + 1}`).values = urlRuleValues;
urlRuleSheet.tables.add(`A1:I${urlRuleValues.length + 1}`, true, 'ChannelUrlRulesTable').style = 'TableStyleMedium5';
const exampleStart = urlRuleValues.length + 4;
const urlExampleValues = channelUrlExamples.map((r) => [
  r.legacy_type,
  r.document_count,
  r.platform,
  r.document_url,
  r.author_id == null ? '' : String(r.author_id),
  r.author_name,
  r.author_url,
  r.source_id == null ? '' : String(r.source_id),
  r.source_name,
  r.source_type,
  r.source_url,
]);
urlRuleSheet.getRange(`A${exampleStart}:K${exampleStart}`).values = [['ES7 type', 'Documents', 'Platform', 'Document URL', 'Author ID', 'Author name', 'Derived author.url', 'Source ID', 'Source name', 'source.type', 'Derived source.url']];
urlRuleSheet.getRange(`A${exampleStart + 1}:K${exampleStart + urlExampleValues.length}`).values = urlExampleValues;
urlRuleSheet.tables.add(`A${exampleStart}:K${exampleStart + urlExampleValues.length}`, true, 'ChannelUrlExamplesTable').style = 'TableStyleMedium4';
urlRuleSheet.freezePanes.freezeRows(1);
urlRuleSheet.getRange(`A1:K${exampleStart + urlExampleValues.length}`).format.font = { name: font, size: 9 };
urlRuleSheet.getRange('A1:I1').format = { fill: navy, font: { name: font, size: 9, bold: true, color: '#FFFFFF' }, horizontalAlignment: 'center', verticalAlignment: 'center', wrapText: true };
urlRuleSheet.getRange(`A${exampleStart}:K${exampleStart}`).format = { fill: navy, font: { name: font, size: 9, bold: true, color: '#FFFFFF' }, horizontalAlignment: 'center', verticalAlignment: 'center', wrapText: true };
urlRuleSheet.getRange(`H2:H${urlRuleValues.length + 1}`).conditionalFormats.add('containsText', { text: 'LOW', format: { fill: red, font: { color: '#9C0006', bold: true } } });
urlRuleSheet.getRange(`H2:H${urlRuleValues.length + 1}`).conditionalFormats.add('containsText', { text: 'MEDIUM', format: { fill: amber, font: { color: '#9C6500' } } });
const urlReferenceValues = [
  ['Stable-ID URL convention', 'Instagram, TikTok, Threads', 'User-approved rule on 2026-09-10: build author/source URL from profile.id/siteId; do not use mutable names'],
  ['YouTube channel ID and handle URLs', 'YouTube', 'https://support.google.com/youtube/answer/6180214?hl=en-GB'],
  ['Threads web migration to threads.com', 'Threads', 'https://about.fb.com/news/2025/04/new-features-threads-web-experience/'],
  ['Elasticsearch date formats', 'All date fields', 'https://www.elastic.co/docs/reference/elasticsearch/mapping-reference/mapping-date-format'],
  ['Live ES7 type aggregation', sourceIndex, '25 legacy types sampled on 2026-09-10; 23 examples shown after excluding fbEventTopic/fbEventComment'],
];
const urlReferenceStart = exampleStart + urlExampleValues.length + 3;
urlRuleSheet.getRange(`C${urlReferenceStart}:I${urlReferenceStart}`).merge();
urlRuleSheet.getRange(`A${urlReferenceStart}:C${urlReferenceStart}`).values = [['Research source', 'Applies to', 'Reference URL / note']];
for (let index = 0; index < urlReferenceValues.length; index += 1) {
  const row = urlReferenceStart + index + 1;
  urlRuleSheet.getRange(`C${row}:I${row}`).merge();
  urlRuleSheet.getRange(`A${row}:C${row}`).values = [[...urlReferenceValues[index]]];
  if (index % 2 === 0) urlRuleSheet.getRange(`A${row}:I${row}`).format.fill = lightBlue;
}
urlRuleSheet.getRange(`A${urlReferenceStart}:I${urlReferenceStart}`).format = { fill: navy, font: { name: font, size: 9, bold: true, color: '#FFFFFF' }, horizontalAlignment: 'center', verticalAlignment: 'center', wrapText: true };

function flattenDoc(value, prefix = '') {
  const rows = [];
  for (const [key, child] of Object.entries(value ?? {})) {
    const p = prefix ? `${prefix}.${key}` : key;
    if (child && typeof child === 'object' && !Array.isArray(child)) rows.push(...flattenDoc(child, p));
    else rows.push([p, child]);
  }
  return rows;
}
const sourceDocMap = new Map(flattenDoc(s).filter(([fieldPath]) => !fieldPath.startsWith('logDetect')));
const targetDocMap = new Map(flattenDoc(transformedSample));
const formatValue = (v) => {
  if (v === undefined) return '';
  if (typeof v === 'number' && v > 100000000000) return `${v} (${new Date(v).toISOString()})`;
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(v)) return `\u200B${v}`;
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
};
const displayedTargetPaths = new Set();
const sampleValues = [...sourceDocMap.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([sourcePath, sourceValue]) => {
  const related = mappingRows.find((r) => r.fieldPath === sourcePath);
  const targetPath = String(related?.targetField ?? '').replaceAll('[]', '');
  if (targetPath) displayedTargetPaths.add(targetPath);
  return [sourcePath, formatValue(sourceValue), targetPath, formatValue(targetDocMap.get(targetPath)), related?.action ?? 'REVIEW', related?.rule ?? 'no automatic rule'];
});
for (const [targetPath, targetValue] of [...targetDocMap.entries()].sort(([a], [b]) => a.localeCompare(b))) {
  if (displayedTargetPaths.has(targetPath)) continue;
  sampleValues.push(['', '', targetPath, formatValue(targetValue), 'DERIVED', 'derived by canonical projector']);
}
sampleSheet.getRange('A1:F1').values = [['ES7 field', 'ES7 sample value', 'ES8 field', 'ES8 transformed value', 'Action', 'Rule / note']];
sampleSheet.getRange(`B2:B${sampleValues.length + 1}`).format.numberFormat = '@';
sampleSheet.getRange(`D2:D${sampleValues.length + 1}`).format.numberFormat = '@';
sampleSheet.getRange(`A2:F${sampleValues.length + 1}`).values = sampleValues;
sampleSheet.tables.add(`A1:F${sampleValues.length + 1}`, true, 'SampleTransformTable').style = 'TableStyleMedium4';
sampleSheet.freezePanes.freezeRows(1);
sampleSheet.freezePanes.freezeColumns(1);
sampleSheet.getRange(`A1:F${sampleValues.length + 1}`).format.font = { name: font, size: 9 };
sampleSheet.getRange('A1:F1').format = { fill: navy, font: { name: font, size: 9, bold: true, color: '#FFFFFF' }, horizontalAlignment: 'center', wrapText: true };

const rawEs7 = [];
const rawEs8 = [];
for (let i = 0; i < selectedSamples.length; i += 1) {
  const sourceDocument = selectedSamples[i];
  const targetDocument = transformedSamples[i];
  rawEs7.push(`SAMPLE ${i + 1} — ${sourceDocument._source?.type ?? ''}`, ...JSON.stringify({ _index: sourceIndex, ...sourceDocument }, null, 2).split('\n'), '');
  rawEs8.push(`SAMPLE ${i + 1} — ${targetDocument.content_type}`, ...JSON.stringify({ _index: 'k2-content-current-v1', _id: targetDocument.content_id, _source: targetDocument }, null, 2).split('\n'), '');
}
const rawValues = Array.from({ length: Math.max(rawEs7.length, rawEs8.length) }, (_, i) => [i + 1, rawEs7[i] ?? '', rawEs8[i] ?? '']);
rawSheet.getRange('A1:C1').values = [['Line', 'Three ES7 Facebook samples', 'Three transformed ES8 documents']];
rawSheet.getRange(`A2:C${rawValues.length + 1}`).values = rawValues;
rawSheet.tables.add(`A1:C${rawValues.length + 1}`, true, 'RawJsonTable').style = 'TableStyleMedium2';
rawSheet.freezePanes.freezeRows(1);
rawSheet.getRange(`A1:C${rawValues.length + 1}`).format.font = { name: 'Courier New', size: 9 };
rawSheet.getRange('A1:C1').format = { fill: navy, font: { name: font, size: 9, bold: true, color: '#FFFFFF' }, horizontalAlignment: 'center' };

overview.getRange('A1:H30').format.font = { name: font, size: 10, color: '#202020' };
overview.getRange('A2:H2').format.font = { name: font, size: 16, bold: true, color: navy };
overview.getRange('A:A').format.columnWidth = 28;
overview.getRange('B:B').format.columnWidth = 42;
overview.getRange('C:C').format.columnWidth = 3;
overview.getRange('D:D').format.columnWidth = 24;
overview.getRange('E:E').format.columnWidth = 34;
overview.getRange('F:F').format.columnWidth = 3;
overview.getRange('G:G').format.columnWidth = 27;
overview.getRange('H:H').format.columnWidth = 18;
overview.getRange('17:18').format.rowHeight = 38;
overview.getRange('19:21').format.rowHeight = 54;

for (const [sheet, widths, rows] of [
  [mapSheet, [34, 18, 34, 40, 15, 66, 20, 28], mapValues.length + 1],
  [schemaSheet, [36, 42, 20, 12, 20, 34, 14], schemaValues.length + 1],
  [urlRuleSheet, [18, 32, 18, 42, 48, 34, 48, 14, 58, 18, 48], urlReferenceStart + urlReferenceValues.length],
  [sampleSheet, [38, 52, 52, 18, 40, 68], sampleValues.length + 1],
  [rawSheet, [8, 84, 84], rawValues.length + 1],
]) {
  widths.forEach((width, index) => { sheet.getRangeByIndexes(0, index, rows, 1).format.columnWidth = width; });
}
mapSheet.getRange(`C2:F${mapValues.length + 1}`).format.wrapText = true;
mapSheet.getRange(`A2:H${mapValues.length + 1}`).format.verticalAlignment = 'top';
schemaSheet.getRange(`A2:G${schemaValues.length + 1}`).format.verticalAlignment = 'top';
urlRuleSheet.getRange(`B2:I${urlRuleValues.length + 1}`).format.wrapText = true;
urlRuleSheet.getRange(`A2:I${urlRuleValues.length + 1}`).format.verticalAlignment = 'top';
urlRuleSheet.getRange(`D${exampleStart + 1}:K${exampleStart + urlExampleValues.length}`).format.wrapText = true;
urlRuleSheet.getRange(`A${exampleStart + 1}:K${exampleStart + urlExampleValues.length}`).format.verticalAlignment = 'top';
urlRuleSheet.getRange(`B${exampleStart + 1}:B${exampleStart + urlExampleValues.length}`).format.numberFormat = '#,##0';
urlRuleSheet.getRange(`E${exampleStart + 1}:E${exampleStart + urlExampleValues.length}`).format.numberFormat = '@';
urlRuleSheet.getRange(`H${exampleStart + 1}:H${exampleStart + urlExampleValues.length}`).format.numberFormat = '@';
urlRuleSheet.getRange(`A${urlReferenceStart + 1}:I${urlReferenceStart + urlReferenceValues.length}`).format.wrapText = true;
sampleSheet.getRange(`B2:F${sampleValues.length + 1}`).format.wrapText = true;
sampleSheet.getRange(`A2:F${sampleValues.length + 1}`).format.verticalAlignment = 'top';
sampleSheet.getRange(`B2:D${sampleValues.length + 1}`).format.numberFormat = '@';

workbook.recalculate();
const checks = [
  await workbook.inspect({ kind: 'table', range: 'Overview!A1:H35', include: 'values,formulas', tableMaxRows: 40, tableMaxCols: 10 }),
  await workbook.inspect({ kind: 'table', range: `ES7 to ES8 Map!A1:H${Math.min(mapValues.length + 1, 18)}`, include: 'values,formulas', tableMaxRows: 20, tableMaxCols: 10 }),
  await workbook.inspect({ kind: 'table', range: `ES8 Schema!A1:G${Math.min(schemaValues.length + 1, 18)}`, include: 'values,formulas', tableMaxRows: 20, tableMaxCols: 9 }),
  await workbook.inspect({ kind: 'table', range: `URL Rules!A1:K${urlReferenceStart + urlReferenceValues.length}`, include: 'values,formulas', tableMaxRows: 60, tableMaxCols: 12 }),
  await workbook.inspect({ kind: 'table', range: `Sample Transform!A1:F${Math.min(sampleValues.length + 1, 18)}`, include: 'values,formulas', tableMaxRows: 20, tableMaxCols: 8 }),
  await workbook.inspect({ kind: 'match', searchTerm: '#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A|#NUM!|#NULL!|#SPILL!|#CALC!', options: { useRegex: true, maxResults: 100 }, summary: 'final formula error scan' }),
];
await fs.writeFile(`${workbookPath}.inspect.ndjson`, `${checks.map((x) => x.ndjson).join('\n')}\n`);

for (const [sheetName, range, filename] of [
  ['Overview', 'A1:H35', 'overview.png'],
  ['ES7 to ES8 Map', `A1:H${Math.min(mapValues.length + 1, 24)}`, 'field-map.png'],
  ['ES8 Schema', `A1:G${Math.min(schemaValues.length + 1, 24)}`, 'es8-schema.png'],
  ['URL Rules', `A1:K${urlReferenceStart + urlReferenceValues.length}`, 'url-rules.png'],
  ['Sample Transform', `A1:F${Math.min(sampleValues.length + 1, 24)}`, 'sample-transform.png'],
  ['Raw JSON', `A1:C${Math.min(rawValues.length + 1, 36)}`, 'raw-json.png'],
]) {
  const blob = await workbook.render({ sheetName, range, scale: 1, format: 'png' });
  await fs.writeFile(path.join(previewDir, filename), new Uint8Array(await blob.arrayBuffer()));
}

const exported = await SpreadsheetFile.exportXlsx(workbook);
await exported.save(workbookPath);

console.log(JSON.stringify({
  workbookPath,
  outputDir,
  sourceFieldPaths: sourceRows.length,
  targetFieldPaths: targetRows.length,
  mappingRows: mappingRows.length,
  currentCount,
  separateCount,
  reviewCount,
  urlRuleCount: urlRules.length,
  urlExampleCount: channelUrlExamples.length,
  sampleId: sample._id,
}, null, 2));
