import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import dotenv from 'dotenv';
import opensearch from '@opensearch-project/opensearch';

const { Client } = opensearch;

const DEFAULT_INDEXES = [
  'topic5d36b566c9b7f067053133d6',
  'topic5d36ace4c9b7f06705313167',
  'topic5d36ba88c9b7f0670531363c',
  'topic5d2f1dc6a57ad3e26640a5a8',
  'topic62dd74b205ded06a47567e47',
];

// Codes come from locationByCode in the supplied Vietnam GeoJSON file.
const PROVINCE_CODES = {
  'An Giang': 89,
  'Bà Rịa - Vũng Tàu': 77,
  'Bạc Liêu': 95,
  'Bắc Giang': 24,
  'Bắc Kạn': 6,
  'Bắc Ninh': 27,
  'Bến Tre': 83,
  'Bình Dương': 74,
  'Bình Định': 52,
  'Bình Phước': 70,
  'Bình Thuận': 60,
  'Cà Mau': 96,
  'Cao Bằng': 4,
  'Cần Thơ': 92,
  'Đà Nẵng': 48,
  'Đắk Lắk': 66,
  'Đắk Nông': 67,
  'Điện Biên': 11,
  'Đồng Nai': 75,
  'Đồng Tháp': 87,
  'Gia Lai': 64,
  'Hà Giang': 2,
  'Hà Nam': 35,
  'Hà Nội': 1,
  'Hà Tĩnh': 42,
  'Hải Dương': 30,
  'Hải Phòng': 31,
  'Hậu Giang': 93,
  'Hòa Bình': 17,
  'Hồ Chí Minh': 79,
  'Hưng Yên': 33,
  'Khánh Hòa': 56,
  'Kiên Giang': 91,
  'Kon Tum': 62,
  'Lai Châu': 12,
  'Lạng Sơn': 20,
  'Lào Cai': 10,
  'Lâm Đồng': 68,
  'Long An': 80,
  'Nam Định': 36,
  'Nghệ An': 40,
  'Ninh Bình': 37,
  'Ninh Thuận': 58,
  'Phú Thọ': 25,
  'Phú Yên': 54,
  'Quảng Bình': 44,
  'Quảng Nam': 49,
  'Quảng Ngãi': 51,
  'Quảng Ninh': 22,
  'Quảng Trị': 45,
  'Sóc Trăng': 94,
  'Sơn La': 14,
  'Tây Ninh': 72,
  'Thái Bình': 34,
  'Thái Nguyên': 19,
  'Thanh Hóa': 38,
  'Thừa Thiên Huế': 46,
  'Tiền Giang': 82,
  'Trà Vinh': 84,
  'Tuyên Quang': 8,
  'Vĩnh Long': 86,
  'Vĩnh Phúc': 26,
  'Yên Bái': 15,
};

const EXPECTED_PROFILE_TYPES = {
  id: 'keyword',
  gender: 'keyword',
  birthday: 'date',
  location: 'integer',
};

const UPDATE_SCRIPT = `
if (ctx._source.profile == null) {
  ctx.op = 'noop';
  return;
}
def patch = params.profiles.get(ctx._source.profile.id);
if (patch == null) {
  ctx.op = 'noop';
  return;
}
boolean changed = false;
if (patch.containsKey('gender') && ctx._source.profile.gender != patch.gender) {
  ctx._source.profile.gender = patch.gender;
  changed = true;
}
if (patch.containsKey('birthday') && ctx._source.profile.birthday != patch.birthday) {
  ctx._source.profile.birthday = patch.birthday;
  changed = true;
}
if (patch.containsKey('location') && ctx._source.profile.location != patch.location) {
  ctx._source.profile.location = patch.location;
  changed = true;
}
if (!changed) {
  ctx.op = 'noop';
}
`;

function normalizeText(value) {
  return String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .replace(/\b(tinh|thanh pho|tp)\b/g, ' ')
    .replace(/[^a-z0-9]+/g, '')
    .trim();
}

const LOCATION_BY_NORMALIZED_NAME = new Map(
  Object.entries(PROVINCE_CODES).map(([name, code]) => [normalizeText(name), code]),
);

function parseArgs(argv) {
  const options = {
    input: 'output/demo_zl_1_normalized.json',
    indexes: DEFAULT_INDEXES,
    batchSize: 500,
    scanBatchSize: 5_000,
    report: 'outputs/es7-profile-update-report.json',
    execute: false,
    validateOnly: false,
    limit: null,
    confirm: '',
  };

  for (const arg of argv) {
    if (arg === '--execute') options.execute = true;
    else if (arg === '--validate-only') options.validateOnly = true;
    else if (arg.startsWith('--input=')) options.input = arg.slice('--input='.length);
    else if (arg.startsWith('--indexes=')) options.indexes = arg.slice('--indexes='.length).split(',').filter(Boolean);
    else if (arg.startsWith('--batch-size=')) options.batchSize = Number(arg.slice('--batch-size='.length));
    else if (arg.startsWith('--scan-batch-size=')) options.scanBatchSize = Number(arg.slice('--scan-batch-size='.length));
    else if (arg.startsWith('--report=')) options.report = arg.slice('--report='.length);
    else if (arg.startsWith('--limit=')) options.limit = Number(arg.slice('--limit='.length));
    else if (arg.startsWith('--confirm=')) options.confirm = arg.slice('--confirm='.length);
    else if (arg === '--help') options.help = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }

  if (!Number.isInteger(options.batchSize) || options.batchSize < 1 || options.batchSize > 2_000) {
    throw new Error('--batch-size must be an integer from 1 to 2000');
  }
  if (!Number.isInteger(options.scanBatchSize) || options.scanBatchSize < 1 || options.scanBatchSize > 50_000) {
    throw new Error('--scan-batch-size must be an integer from 1 to 50000');
  }
  if (options.limit !== null && (!Number.isInteger(options.limit) || options.limit < 1)) {
    throw new Error('--limit must be a positive integer');
  }
  if (options.execute && options.limit !== null) {
    throw new Error('--limit is only allowed for dry-run/testing, never with --execute');
  }
  if (options.execute && options.confirm !== 'UPDATE_ES7_PROFILES') {
    throw new Error('Live writes require --confirm=UPDATE_ES7_PROFILES');
  }
  if (options.execute && options.validateOnly) {
    throw new Error('--execute and --validate-only cannot be used together');
  }
  if (options.indexes.length === 0) throw new Error('At least one index is required');
  return options;
}

function printHelp() {
  console.log(`Usage:
  node scripts/update-es7-profiles.mjs [options]

Default mode is a read-only dry-run: validate mappings, find matching documents,
and write a report. Null input fields are ignored and never clear ES values.

Options:
  --input=PATH             Input JSON (default: output/demo_zl_1_normalized.json)
  --indexes=A,B            Override the five default topic indexes
  --batch-size=N           User IDs per write batch (default: 500)
  --scan-batch-size=N      User IDs per read-only preflight query (default: 5000)
  --report=PATH            JSON report path
  --limit=N                Inspect only N input rows (dry-run/testing only)
  --validate-only          Validate and transform input without connecting to ES
  --execute                Perform update_by_query writes
  --confirm=UPDATE_ES7_PROFILES  Required together with --execute
  --help                   Show this help
`);
}

function unwrap(response) {
  return response?.body ?? response;
}

function chunks(values, size) {
  const result = [];
  for (let offset = 0; offset < values.length; offset += size) {
    result.push(values.slice(offset, offset + size));
  }
  return result;
}

function birthdayEpoch(year) {
  const numericYear = Number(year);
  const currentYear = new Date().getUTCFullYear();
  if (!Number.isInteger(numericYear) || numericYear < 1900 || numericYear > currentYear) {
    throw new Error(`Invalid birthday year: ${year}`);
  }
  return Date.UTC(numericYear, 1, 2, 0, 0, 0, 0);
}

function buildProfiles(rows) {
  const profiles = new Map();
  const errors = [];
  const skippedNoValues = [];

  rows.forEach((row, index) => {
    const rowNumber = index + 1;
    const id = row?.UserId === null || row?.UserId === undefined ? '' : String(row.UserId).trim();
    if (!id) {
      errors.push(`Row ${rowNumber}: missing UserId`);
      return;
    }
    if (profiles.has(id)) {
      errors.push(`Row ${rowNumber}: duplicate UserId ${id}`);
      return;
    }

    const patch = {};
    if (row.Gender !== null && row.Gender !== undefined && String(row.Gender).trim() !== '') {
      const gender = String(row.Gender).trim().toLowerCase();
      if (!['male', 'female'].includes(gender)) {
        errors.push(`Row ${rowNumber}: unsupported Gender ${JSON.stringify(row.Gender)}`);
      } else {
        patch.gender = gender;
      }
    }

    if (row.Birthday !== null && row.Birthday !== undefined && row.Birthday !== '') {
      try {
        patch.birthday = birthdayEpoch(row.Birthday);
      } catch (error) {
        errors.push(`Row ${rowNumber}: ${error.message}`);
      }
    }

    if (row.Location !== null && row.Location !== undefined && String(row.Location).trim() !== '') {
      const code = LOCATION_BY_NORMALIZED_NAME.get(normalizeText(row.Location));
      if (code === undefined) {
        errors.push(`Row ${rowNumber}: unknown Location ${JSON.stringify(row.Location)}`);
      } else {
        patch.location = code;
      }
    }

    if (Object.keys(patch).length === 0) skippedNoValues.push(id);
    else profiles.set(id, patch);
  });

  if (errors.length > 0) {
    const preview = errors.slice(0, 30).join('\n');
    throw new Error(`Input validation failed (${errors.length} errors):\n${preview}`);
  }
  return { profiles, skippedNoValues };
}

function getProfileProperties(mapping) {
  return mapping?.mappings?.properties?.profile?.properties
    ?? mapping?.mappings?._doc?.properties?.profile?.properties
    ?? null;
}

function verifyProfileTypes(properties, label) {
  if (!properties) throw new Error(`${label}: profile mapping is missing`);
  for (const [field, expectedType] of Object.entries(EXPECTED_PROFILE_TYPES)) {
    const actualType = properties[field]?.type;
    if (actualType !== expectedType) {
      throw new Error(`${label}: profile.${field} must be ${expectedType}, found ${actualType ?? 'missing'}`);
    }
  }
}

async function verifyMappings(client, indexes) {
  const templateResponse = unwrap(await client.indices.getTemplate({ name: 'topic-template' }));
  const template = templateResponse['topic-template'];
  verifyProfileTypes(getProfileProperties(template), 'template topic-template');

  const mappingResponse = unwrap(await client.indices.getMapping({ index: indexes }));
  for (const index of indexes) {
    verifyProfileTypes(getProfileProperties(mappingResponse[index]), `index ${index}`);
  }
}

async function findMatches(client, indexes, profileBatches) {
  const matchedIds = new Set();
  const documentsByIndex = Object.fromEntries(indexes.map((index) => [index, 0]));
  let matchedDocuments = 0;
  let completedBatches = 0;
  const pendingBatches = [...profileBatches];

  while (pendingBatches.length > 0) {
    const batch = pendingBatches.shift();
    let response;
    try {
      response = unwrap(await client.search({
        index: indexes,
        body: {
          size: 0,
          track_total_hits: true,
          query: { terms: { 'profile.id': batch } },
          aggs: {
            matched_profiles: { terms: { field: 'profile.id', size: batch.length } },
            matched_indexes: { terms: { field: '_index', size: indexes.length } },
          },
        },
      }));
    } catch (error) {
      if (batch.length <= 100) throw error;
      const middle = Math.ceil(batch.length / 2);
      pendingBatches.unshift(batch.slice(middle), batch.slice(0, middle));
      console.warn(`[dry-run] ES rejected a ${batch.length}-ID batch; retrying as two smaller batches.`);
      continue;
    }

    const total = typeof response.hits.total === 'number' ? response.hits.total : response.hits.total.value;
    matchedDocuments += total;
    for (const bucket of response.aggregations.matched_profiles.buckets) matchedIds.add(String(bucket.key));
    for (const bucket of response.aggregations.matched_indexes.buckets) documentsByIndex[bucket.key] += bucket.doc_count;

    completedBatches += 1;
    console.log(`[dry-run] completed=${completedBatches} pending=${pendingBatches.length} matched documents=${matchedDocuments}`);
  }

  return { matchedIds, matchedDocuments, documentsByIndex };
}

async function executeUpdates(client, indexes, profiles, matchedIds, batchSize) {
  const batches = chunks([...matchedIds], batchSize);
  const result = { batches: batches.length, total: 0, updated: 0, noops: 0, versionConflicts: 0, failures: [] };

  for (let batchIndex = 0; batchIndex < batches.length; batchIndex += 1) {
    const ids = batches[batchIndex];
    const params = Object.fromEntries(ids.map((id) => [id, profiles.get(id)]));
    const response = unwrap(await client.updateByQuery({
      index: indexes,
      conflicts: 'proceed',
      refresh: false,
      wait_for_completion: true,
      body: {
        query: { terms: { 'profile.id': ids } },
        script: { lang: 'painless', source: UPDATE_SCRIPT, params: { profiles: params } },
      },
    }));

    result.total += response.total ?? 0;
    result.updated += response.updated ?? 0;
    result.noops += response.noops ?? 0;
    result.versionConflicts += response.version_conflicts ?? 0;
    if (response.failures?.length) result.failures.push(...response.failures);
    console.log(`[execute ${batchIndex + 1}/${batches.length}] updated=${result.updated} noops=${result.noops} conflicts=${result.versionConflicts}`);
    if (result.failures.length > 0) throw new Error(`ES update returned ${result.failures.length} failures; stopping`);
  }
  return result;
}

async function writeReport(reportPath, report) {
  await fs.mkdir(path.dirname(reportPath), { recursive: true });
  await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }

  const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const inputPath = path.resolve(projectRoot, options.input);
  const reportPath = path.resolve(projectRoot, options.report);
  const rawRows = JSON.parse(await fs.readFile(inputPath, 'utf8'));
  if (!Array.isArray(rawRows)) throw new Error('Input JSON must contain an array');
  const rows = options.limit === null ? rawRows : rawRows.slice(0, options.limit);
  const { profiles, skippedNoValues } = buildProfiles(rows);

  const transformed = {
    inputRows: rows.length,
    actionableProfiles: profiles.size,
    skippedNoValues: skippedNoValues.length,
    genderProfiles: [...profiles.values()].filter((value) => value.gender !== undefined).length,
    birthdayProfiles: [...profiles.values()].filter((value) => value.birthday !== undefined).length,
    locationProfiles: [...profiles.values()].filter((value) => value.location !== undefined).length,
  };
  console.log(JSON.stringify({ mode: options.validateOnly ? 'validate-only' : options.execute ? 'execute' : 'dry-run', transformed }, null, 2));
  if (options.validateOnly) return;

  dotenv.config({ path: path.join(projectRoot, '.env'), quiet: true });
  if (!process.env.ES7_HOST) throw new Error('ES7_HOST is missing from .env');
  const client = new Client({ node: process.env.ES7_HOST, maxRetries: 3, requestTimeout: 120_000 });

  try {
    await client.ping();
    await verifyMappings(client, options.indexes);
    console.log('ES7 connection and topic-template/index mappings verified.');

    const profileIds = [...profiles.keys()];
    const preflight = await findMatches(client, options.indexes, chunks(profileIds, options.scanBatchSize));
    const missingIds = profileIds.filter((id) => !preflight.matchedIds.has(id));
    const execution = options.execute
      ? await executeUpdates(client, options.indexes, profiles, preflight.matchedIds, options.batchSize)
      : null;
    const report = {
      createdAt: new Date().toISOString(),
      mode: options.execute ? 'execute' : 'dry-run',
      input: inputPath,
      indexes: options.indexes,
      birthdayRule: 'Date.UTC(year, 1, 2, 0, 0, 0, 0) (February 2 at 00:00:00 UTC, epoch milliseconds)',
      nullPolicy: 'Ignore null/empty fields; do not clear existing ES values',
      transformed,
      matchedProfiles: preflight.matchedIds.size,
      missingProfiles: missingIds.length,
      missingProfileIds: missingIds,
      matchedDocuments: preflight.matchedDocuments,
      documentsByIndex: preflight.documentsByIndex,
      execution,
    };
    await writeReport(reportPath, report);
    console.log(`Report written to ${reportPath}`);
    console.log(JSON.stringify({
      matchedProfiles: report.matchedProfiles,
      missingProfiles: report.missingProfiles,
      matchedDocuments: report.matchedDocuments,
      documentsByIndex: report.documentsByIndex,
      execution: report.execution,
    }, null, 2));
  } finally {
    await client.close();
  }
}

main().catch((error) => {
  console.error(error.stack || error.message);
  if (error?.meta?.body) console.error(JSON.stringify(error.meta.body, null, 2));
  process.exitCode = 1;
});
