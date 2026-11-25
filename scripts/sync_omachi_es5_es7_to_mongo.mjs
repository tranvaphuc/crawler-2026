import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

import dotenv from 'dotenv';
import ES5ClientPkg from 'elasticsearch';
import opensearch from '@opensearch-project/opensearch';
import mongoose from 'mongoose';

dotenv.config({ quiet: true });

const { Client: ES7Client } = opensearch;
const ES5Client = ES5ClientPkg.Client || ES5ClientPkg;

const DEFAULT_START = '2026-08-31T17:00:00.000Z'; // 2026-09-01 00:00:00 Asia/Ho_Chi_Minh
const DEFAULT_ES5_INDEX = 'auto';
const DEFAULT_ES7_INDEX = 'topic5d556d546d35efe10b97f310';
const DEFAULT_DB = 'omachi';
const DEFAULT_COLLECTION = 'buzzes';
const DEFAULT_REPORT = 'outputs/01a07164-8064-7313-962f-0d73887aa809/omachi-sync/latest.json';
const ENRICH_FIELDS = ['sentiment', 'labels', 'isDeleted'];
const EXCLUDED_MONGO_FIELDS = [
  '_sync',
  'delayCrawler',
  'delayEs',
  'delayMongo',
  'delayTotal',
  'ds',
  'insertedDate',
  'level',
  'hasTranslateBuzz',
  'translateBuzz',
];
const LABEL_NAMES = new Map([
  ['68fecc8c64c712540d4f9751', 'Chất lượng Sản phẩm'],
  ['68fecc9064c712540d4f9752', 'Hương vị'],
  ['68fecc9464c712540d4f9753', 'Bao bì & Đóng gói'],
  ['68fecc9964c712540d4f9754', 'Giá cả & Khuyến mãi'],
  ['68fecc9e64c712540d4f9755', 'Kênh Phân phối & Hậu cần'],
  ['68fecca264c712540d4f9756', 'Thương hiệu & Quảng cáo'],
  ['68fecca764c712540d4f9757', 'Hỗ trợ & Dịch vụ K.Hàng'],
  ['68feccac64c712540d4f9758', 'Trò chơi nhỏ - trực tuyển'],
  ['68feccb064c712540d4f9759', 'Ban lãnh đạo'],
  ['68feccb564c712540d4f975a', 'Cổ phiếu, chứng khoán'],
  ['68feccb964c712540d4f975c', 'Nguồn gốc &Thành phần'],
  ['68feccbe64c712540d4f975d', 'Trải nghiệm sử dụng'],
  ['68feccc364c712540d4f975e', 'So sánh thương hiệu'],
  ['68feccc764c712540d4f975f', 'Tuyển dụng & Nhân sự'],
  ['68fecccc64c712540d4f9760', 'Doanh thu & Lợi nhuận'],
  ['68fecccf64c712540d4f9761', 'Khác'],
]);

function parseArgs(argv) {
  const options = {
    execute: false,
    start: process.env.OMACHI_SYNC_START || DEFAULT_START,
    end: process.env.OMACHI_SYNC_END || 'now',
    dateField: process.env.OMACHI_SYNC_DATE_FIELD || 'publishedDate',
    es5Index: process.env.OMACHI_ES5_INDEX || DEFAULT_ES5_INDEX,
    es7Index: process.env.OMACHI_ES7_INDEX || DEFAULT_ES7_INDEX,
    database: process.env.MONGO_OMACHI_DB || DEFAULT_DB,
    collection: process.env.MONGO_OMACHI_COLLECTION || DEFAULT_COLLECTION,
    batchSize: 1_000,
    limit: null,
    report: DEFAULT_REPORT,
  };

  for (const arg of argv) {
    if (arg === '--execute') options.execute = true;
    else if (arg.startsWith('--start=')) options.start = arg.slice('--start='.length);
    else if (arg.startsWith('--end=')) options.end = arg.slice('--end='.length);
    else if (arg.startsWith('--date-field=')) options.dateField = arg.slice('--date-field='.length);
    else if (arg.startsWith('--es5-index=')) options.es5Index = arg.slice('--es5-index='.length);
    else if (arg.startsWith('--es7-index=')) options.es7Index = arg.slice('--es7-index='.length);
    else if (arg.startsWith('--database=')) options.database = arg.slice('--database='.length);
    else if (arg.startsWith('--collection=')) options.collection = arg.slice('--collection='.length);
    else if (arg.startsWith('--batch-size=')) options.batchSize = Number(arg.slice('--batch-size='.length));
    else if (arg.startsWith('--limit=')) options.limit = Number(arg.slice('--limit='.length));
    else if (arg.startsWith('--report=')) options.report = arg.slice('--report='.length);
    else if (arg === '--help') options.help = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }

  if (!['publishedDate', 'insertedDate'].includes(options.dateField)) {
    throw new Error('--date-field must be publishedDate or insertedDate');
  }
  if (!Number.isInteger(options.batchSize) || options.batchSize < 1 || options.batchSize > 5_000) {
    throw new Error('--batch-size must be an integer from 1 to 5000');
  }
  if (options.limit !== null && (!Number.isInteger(options.limit) || options.limit < 1)) {
    throw new Error('--limit must be a positive integer');
  }
  return options;
}

function isoWeekParts(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error(`Invalid date for ES5 weekly index: ${value}`);
  const day = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const weekday = day.getUTCDay() || 7;
  day.setUTCDate(day.getUTCDate() + 4 - weekday);
  const weekYear = day.getUTCFullYear();
  const yearStart = new Date(Date.UTC(weekYear, 0, 1));
  const week = Math.ceil((((day - yearStart) / 86_400_000) + 1) / 7);
  return { year: weekYear, week };
}

function weeklyIndices(startValue, endValue) {
  const start = new Date(startValue);
  const end = endValue === 'now' ? new Date() : new Date(endValue);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) {
    throw new Error(`Invalid sync range: ${startValue}..${endValue}`);
  }
  const indices = new Set();
  const cursor = new Date(start);
  while (cursor <= end) {
    const { year, week } = isoWeekParts(cursor);
    indices.add(`master${year}${String(week).padStart(2, '0')}`);
    cursor.setUTCDate(cursor.getUTCDate() + 7);
  }
  const endParts = isoWeekParts(end);
  indices.add(`master${endParts.year}${String(endParts.week).padStart(2, '0')}`);
  return [...indices].sort();
}

function resolveEs5Indices(option, start, end) {
  if (option === 'auto') return weeklyIndices(start, end);
  const indices = option.split(',').map((value) => value.trim()).filter(Boolean);
  if (!indices.length) throw new Error('--es5-index contains no index');
  return indices;
}

function printHelp() {
  console.log(`Usage:
  node scripts/sync_omachi_es5_es7_to_mongo.mjs [options]

The default mode is a read-only dry-run. --execute writes to MongoDB.

Options:
  --execute                    Upsert ES5 documents and ES7 enrichment into MongoDB
  --start=DATE                 Range start (default: ${DEFAULT_START})
  --end=DATE                   Range end (default: now)
  --date-field=FIELD           publishedDate or insertedDate (default: publishedDate)
  --es5-index=INDEX[,INDEX]    ES5 weekly indices; auto derives them from the range
  --es7-index=INDEX            ES7 enrichment index (default: ${DEFAULT_ES7_INDEX})
  --database=NAME              MongoDB database (default: ${DEFAULT_DB})
  --collection=NAME            MongoDB collection (default: ${DEFAULT_COLLECTION})
  --batch-size=N               ES5 scroll and Mongo bulk size (default: 1000)
  --limit=N                    Process at most N matching ES5 documents
  --report=PATH                JSON report path
  --help                       Show this help
`);
}

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name} in .env`);
  return value;
}

function parseKeywords(raw) {
  let values;
  try {
    values = JSON.parse(raw);
  } catch {
    values = raw.match(/"([^"]+)"|'([^']+)'|[^,\s()]+/g)?.map((value) => value.replace(/^["']|["']$/g, '')) ?? [];
  }
  if (!Array.isArray(values)) throw new Error('KEYWORD_FOR_OMACHI must be a JSON array or a separated keyword list');
  const result = [...new Set(values.map((value) => String(value).trim()).filter(Boolean))];
  if (!result.length) throw new Error('KEYWORD_FOR_OMACHI contains no keywords');
  return result;
}

function mongoUri(database) {
  if (process.env.MONGO_OMACHI_URI) return process.env.MONGO_OMACHI_URI;
  const host = required('MONGO_OMACHI_HOST');
  const port = required('MONGO_OMACHI_PORT');
  const user = required('MONGO_OMACHI_IMPORT_USER');
  const password = required('MONGO_OMACHI_IMPORT_PASS');
  return `mongodb://${encodeURIComponent(user)}:${encodeURIComponent(password)}@${host}:${port}/${encodeURIComponent(database)}?authSource=${encodeURIComponent(database)}&authMechanism=SCRAM-SHA-256&directConnection=true`;
}

function keywordQuery(keywords, dateField, start, end) {
  const should = [];
  for (const keyword of keywords) {
    for (const field of ['title', 'content', 'description']) {
      should.push({ match_phrase: { [field]: keyword } });
    }
  }
  return {
    bool: {
      filter: [{ range: { [dateField]: { gte: start, lte: end } } }],
      must: [{ bool: { should, minimum_should_match: 1 } }],
    },
  };
}

function sourceDocument(hit) {
  const document = { ...(hit._source ?? {}) };
  delete document._id;
  for (const field of [...EXCLUDED_MONGO_FIELDS, ...ENRICH_FIELDS]) delete document[field];
  // ES document _id is the stable join key used by the ES7 topic index.
  document.id = String(hit._id);
  return document;
}

function sentimentName(raw) {
  const value = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw.value : raw;
  if (value === null || value === undefined || value === '' || value === -1 || value === '-1') return 'None';
  const normalized = String(value).trim().toLowerCase();
  if (normalized === '1' || normalized === 'positive') return 'Positive';
  if (normalized === '2' || normalized === 'nega' || normalized === 'negative') return 'Nega';
  if (normalized === '3' || normalized === 'neutral') return 'Neutral';
  if (normalized === 'none') return 'None';
  throw new Error(`Unsupported ES7 sentiment value: ${JSON.stringify(value)}`);
}

function labelNames(raw) {
  if (!Array.isArray(raw)) return [];
  const names = raw.map((item) => {
    const value = item && typeof item === 'object' ? (item.value ?? item.id) : item;
    const id = value === null || value === undefined ? '' : String(value).trim();
    return LABEL_NAMES.get(id) ?? id;
  }).filter(Boolean);
  return [...new Set(names)];
}

function enrichmentPatch(es7Document) {
  const source = es7Document._source ?? {};
  return {
    sentiment: sentimentName(source.sentiment),
    labels: labelNames(source.labels),
    isDeleted: Object.prototype.hasOwnProperty.call(source, 'isDeleted') ? source.isDeleted : null,
  };
}

function log(event, values = {}) {
  process.stdout.write(`${JSON.stringify({ at: new Date().toISOString(), event, ...values })}\n`);
}

async function writeReport(file, report) {
  const target = path.resolve(file);
  await fs.mkdir(path.dirname(target), { recursive: true });
  const temporary = `${target}.${process.pid}.tmp`;
  await fs.writeFile(temporary, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  await fs.rename(temporary, target);
}

async function run() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }

  const keywords = parseKeywords(required('KEYWORD_FOR_OMACHI'));
  const es5Indices = resolveEs5Indices(options.es5Index, options.start, options.end);
  const query = keywordQuery(keywords, options.dateField, options.start, options.end);
  const es5 = new ES5Client({
    host: required('ES5_HOST'),
    log: 'error',
    requestTimeout: 300_000,
    maxRetries: 3,
    keepAlive: true,
  });
  const es7 = new ES7Client({
    node: required('ES7_HOST'),
    requestTimeout: 300_000,
    maxRetries: 3,
    compression: 'gzip',
  });

  let collection;
  let scrollId;
  const report = {
    status: 'running',
    mode: options.execute ? 'execute' : 'dry-run',
    startedAt: new Date().toISOString(),
    source: {
      es5Indices,
      es7Index: options.es7Index,
      dateField: options.dateField,
      start: options.start,
      end: options.end,
      keywordCount: keywords.length,
      searchedFields: ['title', 'content', 'description'],
    },
    matched: 0,
    es5Upserted: 0,
    es5Modified: 0,
    es7Found: 0,
    es7Missing: 0,
    es7Updated: 0,
  };

  try {
    if (options.execute) {
      await mongoose.connect(mongoUri(options.database), {
        dbName: options.database,
        maxPoolSize: 10,
        serverSelectionTimeoutMS: 30_000,
      });
      collection = mongoose.connection.db.collection(options.collection);
      await collection.createIndex({ id: 1 }, { unique: true, name: 'uniq_id' });
    }

    log('sync_started', report.source);
    let response = await es5.search({
      index: es5Indices.join(','),
      ignoreUnavailable: true,
      scroll: '10m',
      version: true,
      body: {
        size: options.batchSize,
        sort: ['_doc'],
        query,
      },
    });

    while (true) {
      scrollId = response._scroll_id;
      let hits = response.hits?.hits ?? [];
      if (!hits.length) break;
      if (options.limit !== null) hits = hits.slice(0, Math.max(0, options.limit - report.matched));
      if (!hits.length) break;

      const documents = hits.map((hit) => sourceDocument(hit));
      report.matched += documents.length;

      if (options.execute) {
        const unset = Object.fromEntries([...EXCLUDED_MONGO_FIELDS, ...ENRICH_FIELDS].map((field) => [field, '']));
        const baseResult = await collection.bulkWrite(documents.map((document) => ({
          updateOne: {
            filter: { id: document.id },
            update: { $set: document, $unset: unset },
            upsert: true,
          },
        })), { ordered: false });
        report.es5Upserted += baseResult.upsertedCount ?? 0;
        report.es5Modified += baseResult.modifiedCount ?? 0;
      }

      const es7Response = await es7.mget({
        index: options.es7Index,
        body: { ids: documents.map((document) => document.id) },
      });
      const es7Body = es7Response?.body ?? es7Response;
      const found = (es7Body.docs ?? []).filter((document) => document.found);
      const enriched = found.map((document) => ({ document, patch: enrichmentPatch(document) }));
      report.es7Found += found.length;
      report.es7Missing += documents.length - found.length;

      if (options.execute && enriched.length) {
        const enrichResult = await collection.bulkWrite(enriched.map(({ document, patch }) => ({
          updateOne: {
            filter: { id: String(document._id) },
            update: { $set: patch },
          },
        })), { ordered: false });
        report.es7Updated += enrichResult.modifiedCount ?? 0;
      }

      log('sync_progress', {
        matched: report.matched,
        es5Upserted: report.es5Upserted,
        es5Modified: report.es5Modified,
        es7Found: report.es7Found,
        es7Missing: report.es7Missing,
        es7Updated: report.es7Updated,
      });

      if (options.limit !== null && report.matched >= options.limit) break;
      response = await es5.scroll({ scrollId, scroll: '10m' });
    }

    report.status = 'complete';
    report.completedAt = new Date().toISOString();
    await writeReport(options.report, report);
    log('sync_completed', report);
  } catch (error) {
    report.status = 'failed';
    report.failedAt = new Date().toISOString();
    report.error = error.stack ?? String(error);
    await writeReport(options.report, report).catch(() => {});
    throw error;
  } finally {
    if (scrollId) await es5.clearScroll({ scrollId }).catch(() => {});
    try { es5.close(); } catch {}
    try { await es7.close(); } catch {}
    if (mongoose.connection.readyState !== 0) await mongoose.disconnect().catch(() => {});
  }
}

await run();
