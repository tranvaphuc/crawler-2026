import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { loadMigrationContext, requireSuccess } from './lib/master_migration_lib.mjs';

export const TARGET_INDEXES = [
  'topic5d36b566c9b7f067053133d6',
  'topic5d36ace4c9b7f06705313167',
  'topic5d36ba88c9b7f0670531363c',
  'topic5d2f1dc6a57ad3e26640a5a8',
  'topic62dd74b205ded06a47567e47',
];
export const SOURCE_PROFILE_INDEX = 'profile2021';
export const EXECUTION_CONFIRMATION = 'SYNC_PROFILE_DEMOGRAPHICS';
export const DEFAULT_FROM = 'now-2d';
export const DEFAULT_TO = 'now';

const EXPECTED_TARGET_TYPES = {
  id: 'keyword',
  gender: 'keyword',
  birthday: 'date',
  location: 'integer',
};
const PROFILE_SOURCE_FIELDS = ['sex', 'birthyear', 'birthday', 'birthdayDate', 'location'];
const UPDATE_SCRIPT = `
if (ctx._source.profile == null) { ctx.op = 'noop'; return; }
boolean changed = false;
if (params.patch.containsKey('gender') && ctx._source.profile.gender != params.patch.gender) {
  ctx._source.profile.gender = params.patch.gender; changed = true;
}
if (params.patch.containsKey('birthday') && ctx._source.profile.birthday != params.patch.birthday) {
  ctx._source.profile.birthday = params.patch.birthday; changed = true;
}
if (params.patch.containsKey('location') && ctx._source.profile.location != params.patch.location) {
  ctx._source.profile.location = params.patch.location; changed = true;
}
if (!changed) { ctx.op = 'noop'; }
`;

const unwrap = (response) => response?.body ?? response;
const chunks = (values, size) => Array.from(
  { length: Math.ceil(values.length / size) },
  (_, index) => values.slice(index * size, (index + 1) * size),
);

function normalizeComparableText(value) {
  return String(value ?? '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd');
}

export function normalizeGender(value) {
  const normalized = normalizeComparableText(value);
  if (['nam', 'male', 'm'].includes(normalized)) return 'male';
  if (['nu', 'female', 'f'].includes(normalized)) return 'female';
  return undefined;
}

export function birthdayEpochFromProfile(source, currentYear = new Date().getUTCFullYear()) {
  const candidates = [source?.birthyear, source?.birthdayDate, source?.birthday];
  for (const candidate of candidates) {
    if (candidate === null || candidate === undefined || candidate === '') continue;
    const match = String(candidate).match(/(?:^|\D)((?:19|20)\d{2})(?:\D|$)/);
    const year = match ? Number(match[1]) : Number(candidate);
    if (Number.isInteger(year) && year >= 1900 && year <= currentYear) {
      return Date.UTC(year, 1, 2, 0, 0, 0, 0);
    }
  }
  return undefined;
}

export function normalizeLocation(value) {
  if (value === null || value === undefined || value === '') return undefined;
  const numeric = Number(value);
  return Number.isInteger(numeric) && numeric > 0 && numeric <= 2_147_483_647 ? numeric : undefined;
}

export function extractProfilePatch(source) {
  const patch = {};
  const gender = normalizeGender(source?.sex ?? source?.gender);
  const birthday = birthdayEpochFromProfile(source);
  const location = normalizeLocation(source?.location);
  if (gender !== undefined) patch.gender = gender;
  if (birthday !== undefined) patch.birthday = birthday;
  if (location !== undefined) patch.location = location;
  return patch;
}

export function mergeProfileSources(es8Source, es7Source) {
  const preferred = extractProfilePatch(es8Source);
  const fallback = extractProfilePatch(es7Source);
  const patch = {};
  for (const key of ['gender', 'birthday', 'location']) {
    if (preferred[key] !== undefined) patch[key] = preferred[key];
    else if (fallback[key] !== undefined) patch[key] = fallback[key];
  }
  return patch;
}

function dateValue(value) {
  if (value === null || value === undefined || value === '') return undefined;
  if (typeof value === 'number' || /^\d+$/.test(String(value))) return Number(value);
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? undefined : parsed;
}

export function changedPatch(currentProfile, sourcePatch) {
  const result = {};
  if (sourcePatch.gender !== undefined && currentProfile?.gender !== sourcePatch.gender) result.gender = sourcePatch.gender;
  if (sourcePatch.birthday !== undefined && dateValue(currentProfile?.birthday) !== sourcePatch.birthday) result.birthday = sourcePatch.birthday;
  if (sourcePatch.location !== undefined && Number(currentProfile?.location) !== sourcePatch.location) result.location = sourcePatch.location;
  return result;
}

function validateDateExpression(value, label) {
  const dateMath = /^now(?:-\d+[dhm])?(?:\/[dhm])?$/;
  if (!dateMath.test(value) && Number.isNaN(Date.parse(value))) throw new Error(`${label} is not a valid ISO date or supported ES date expression`);
}

export function parseArgs(args) {
  const options = {
    execute: false,
    confirm: '',
    from: DEFAULT_FROM,
    to: DEFAULT_TO,
    pageSize: 1_000,
    profileBatchSize: 1_000,
    limit: null,
    report: null,
    indexes: TARGET_INDEXES,
    help: false,
  };
  for (const arg of args) {
    if (arg === '--execute') options.execute = true;
    else if (arg === '--help') options.help = true;
    else if (arg.startsWith('--confirm=')) options.confirm = arg.slice('--confirm='.length);
    else if (arg.startsWith('--from=')) options.from = arg.slice('--from='.length);
    else if (arg.startsWith('--to=')) options.to = arg.slice('--to='.length);
    else if (arg.startsWith('--page-size=')) options.pageSize = Number(arg.slice('--page-size='.length));
    else if (arg.startsWith('--profile-batch-size=')) options.profileBatchSize = Number(arg.slice('--profile-batch-size='.length));
    else if (arg.startsWith('--limit=')) options.limit = Number(arg.slice('--limit='.length));
    else if (arg.startsWith('--report=')) options.report = arg.slice('--report='.length);
    else if (arg.startsWith('--indexes=')) {
      options.indexes = [...new Set(arg.slice('--indexes='.length).split(',').map((index) => index.trim()).filter(Boolean))];
    }
    else throw new Error(`Unknown argument: ${arg}`);
  }
  validateDateExpression(options.from, '--from');
  validateDateExpression(options.to, '--to');
  if (!Number.isInteger(options.pageSize) || options.pageSize < 100 || options.pageSize > 5_000) throw new Error('--page-size must be 100..5000');
  if (!Number.isInteger(options.profileBatchSize) || options.profileBatchSize < 100 || options.profileBatchSize > 2_000) throw new Error('--profile-batch-size must be 100..2000');
  if (options.limit !== null && (!Number.isInteger(options.limit) || options.limit < 1)) throw new Error('--limit must be a positive integer');
  if (options.execute && options.limit !== null) throw new Error('--limit is allowed only in dry-run mode');
  if (options.indexes.length === 0 || options.indexes.some((index) => !/^[a-z0-9][a-z0-9._-]*$/.test(index))) {
    throw new Error('--indexes must be a comma-separated list of concrete lowercase index names');
  }
  if (options.execute && options.confirm !== EXECUTION_CONFIRMATION) {
    throw new Error(`Live writes require --execute --confirm=${EXECUTION_CONFIRMATION}`);
  }
  return options;
}

export function targetQuery(from, to) {
  return { bool: { filter: [
    { range: { insertedDate: { gte: from, lte: to } } },
    { prefix: { type: 'fb' } },
    { exists: { field: 'profile.id' } },
  ] } };
}

function mappingProperties(mapping) {
  return mapping?.mappings?.properties ?? mapping?.mappings?._doc?.properties ?? {};
}

function verifyTargetProperties(properties, label) {
  const profile = properties.profile;
  if (!profile || profile.type === 'nested') throw new Error(`${label}: profile must be an object`);
  for (const [field, expected] of Object.entries(EXPECTED_TARGET_TYPES)) {
    const actual = profile.properties?.[field]?.type;
    if (actual !== expected) throw new Error(`${label}: profile.${field} must be ${expected}, found ${actual ?? 'missing'}`);
  }
  if (properties.type?.type !== 'keyword') throw new Error(`${label}: type must be keyword`);
  if (properties.insertedDate?.type !== 'date') throw new Error(`${label}: insertedDate must be date`);
}

async function verifyMappings(es7, es8Request, targetIndexes) {
  const templateResponse = unwrap(await es7.indices.getTemplate({ name: 'topic-template' }));
  verifyTargetProperties(mappingProperties(templateResponse['topic-template']), 'template topic-template');
  const targetMappings = unwrap(await es7.indices.getMapping({ index: targetIndexes }));
  for (const index of targetIndexes) verifyTargetProperties(mappingProperties(targetMappings[index]), `index ${index}`);

  const es7Source = unwrap(await es7.indices.getMapping({ index: SOURCE_PROFILE_INDEX }));
  const es8Source = requireSuccess('ES8 source profile mapping', await es8Request('GET', `/${SOURCE_PROFILE_INDEX}/_mapping`));
  for (const [label, mapping] of [['ES7', es7Source], ['ES8', es8Source]]) {
    const properties = mappingProperties(mapping[SOURCE_PROFILE_INDEX]);
    for (const field of ['sex', 'birthyear', 'birthday', 'location']) {
      if (!properties[field]) throw new Error(`${label} ${SOURCE_PROFILE_INDEX}: missing ${field} mapping`);
    }
  }
}

async function fetchProfiles(es7, es8Request, ids, cache, stats, batchSize) {
  const missing = ids.filter((id) => !cache.has(id));
  for (const batch of chunks(missing, batchSize)) {
    const [es7Response, es8Response] = await Promise.all([
      es7.mget({ index: SOURCE_PROFILE_INDEX, body: { ids: batch }, _source: PROFILE_SOURCE_FIELDS }),
      es8Request('POST', `/${SOURCE_PROFILE_INDEX}/_mget?_source_includes=${PROFILE_SOURCE_FIELDS.join(',')}`, { ids: batch }),
    ]);
    const es7Docs = unwrap(es7Response).docs;
    const es8Docs = requireSuccess('ES8 profile mget', es8Response).docs;
    const es7ById = new Map(es7Docs.filter((doc) => doc.found).map((doc) => [String(doc._id), doc._source]));
    const es8ById = new Map(es8Docs.filter((doc) => doc.found).map((doc) => [String(doc._id), doc._source]));
    stats.sourceLookups += batch.length;
    stats.sourceFoundEs7 += es7ById.size;
    stats.sourceFoundEs8 += es8ById.size;
    for (const id of batch) {
      const patch = mergeProfileSources(es8ById.get(id), es7ById.get(id));
      cache.set(id, Object.keys(patch).length > 0 ? patch : null);
      if (Object.keys(patch).length > 0) stats.sourceProfilesWithValues += 1;
    }
  }
}

async function writeBulk(es7, updates) {
  const body = [];
  for (const update of updates) {
    body.push({ update: { _index: update._index, _id: update._id, retry_on_conflict: 3 } });
    body.push({ script: { lang: 'painless', source: UPDATE_SCRIPT, params: { patch: update.patch } } });
  }
  const response = unwrap(await es7.bulk({ refresh: false, body }, { maxRetries: 0 }));
  const failures = (response.items ?? []).map((item) => item.update).filter((item) => item?.error);
  if (response.errors || failures.length > 0) throw new Error(`Bulk update failed for ${failures.length} documents: ${JSON.stringify(failures.slice(0, 3))}`);
  return (response.items ?? []).reduce((counts, item) => {
    const result = item.update?.result;
    if (result === 'updated') counts.updated += 1;
    else if (result === 'noop') counts.noops += 1;
    return counts;
  }, { updated: 0, noops: 0 });
}

function newStats(targetIndexes) {
  return {
    scannedDocuments: 0,
    sourceLookups: 0,
    sourceFoundEs7: 0,
    sourceFoundEs8: 0,
    sourceProfilesWithValues: 0,
    documentsWithChanges: 0,
    proposedFieldUpdates: { gender: 0, birthday: 0, location: 0 },
    updatedDocuments: 0,
    writeNoops: 0,
    documentsByIndex: Object.fromEntries(targetIndexes.map((index) => [index, 0])),
  };
}

async function scanAndSync(es7, es8Request, options, report, save) {
  const cache = new Map();
  let scrollId;
  let response = unwrap(await es7.search({
    index: options.indexes,
    scroll: '5m',
    size: options.pageSize,
    body: {
      sort: ['_doc'],
      _source: ['profile.id', 'profile.gender', 'profile.birthday', 'profile.location'],
      query: targetQuery(options.from, options.to),
    },
  }));
  try {
    while (true) {
      scrollId = response._scroll_id ?? scrollId;
      let hits = response.hits?.hits ?? [];
      if (options.limit !== null) hits = hits.slice(0, Math.max(0, options.limit - report.stats.scannedDocuments));
      if (hits.length === 0) break;
      const ids = [...new Set(hits.map((hit) => String(hit._source?.profile?.id ?? '').trim()).filter(Boolean))];
      await fetchProfiles(es7, es8Request, ids, cache, report.stats, options.profileBatchSize);
      const updates = [];
      for (const hit of hits) {
        report.stats.scannedDocuments += 1;
        report.stats.documentsByIndex[hit._index] += 1;
        const sourcePatch = cache.get(String(hit._source?.profile?.id ?? '').trim());
        if (!sourcePatch) continue;
        const patch = changedPatch(hit._source.profile, sourcePatch);
        if (Object.keys(patch).length === 0) continue;
        report.stats.documentsWithChanges += 1;
        for (const field of Object.keys(patch)) report.stats.proposedFieldUpdates[field] += 1;
        updates.push({ _index: hit._index, _id: hit._id, patch });
      }
      if (options.execute && updates.length > 0) {
        const written = await writeBulk(es7, updates);
        report.stats.updatedDocuments += written.updated;
        report.stats.writeNoops += written.noops;
      }
      console.log(`[${options.execute ? 'execute' : 'dry-run'}] scanned=${report.stats.scannedDocuments} candidates=${report.stats.documentsWithChanges} updated=${report.stats.updatedDocuments} cached_profiles=${cache.size}`);
      await save(report);
      if (options.limit !== null && report.stats.scannedDocuments >= options.limit) break;
      response = unwrap(await es7.scroll({ scroll_id: scrollId, scroll: '5m' }));
    }
  } finally {
    if (scrollId) await es7.clearScroll({ body: { scroll_id: [scrollId] } }).catch(() => {});
  }
}

async function acquireLock(lockPath) {
  await fs.mkdir(path.dirname(lockPath), { recursive: true });
  const payload = { pid: process.pid, host: os.hostname(), startedAt: new Date().toISOString() };
  try {
    const handle = await fs.open(lockPath, 'wx', 0o600);
    await handle.writeFile(`${JSON.stringify(payload)}\n`);
    await handle.close();
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
    let existing;
    try { existing = JSON.parse(await fs.readFile(lockPath, 'utf8')); } catch { existing = {}; }
    let alive = false;
    if (existing.host === os.hostname() && Number.isInteger(existing.pid)) {
      try { process.kill(existing.pid, 0); alive = true; } catch {}
    }
    if (alive) throw new Error(`Another profile sync is running (pid ${existing.pid}, since ${existing.startedAt ?? 'unknown'})`);
    await fs.unlink(lockPath);
    return acquireLock(lockPath);
  }
  return async () => { await fs.unlink(lockPath).catch((error) => { if (error.code !== 'ENOENT') throw error; }); };
}

function help() {
console.log(`Sync gender, birthday and location from ES8/ES7 ${SOURCE_PROFILE_INDEX} into Facebook documents in ES7 topic indexes.

Default is a read-only dry-run over insertedDate now-2d..now.

Initial backfill dry-run:
  npm run es7:profile-sync -- --from=2026-08-15T00:00:00+07:00

Write mode:
  npm run es7:profile-sync -- --from=2026-08-15T00:00:00+07:00 --execute --confirm=${EXECUTION_CONFIRMATION}

Options: --to=DATE --indexes=INDEX1,INDEX2 --page-size=N --profile-batch-size=N --limit=N --report=PATH
Birthday uses February 2 00:00:00 UTC of birthyear. ES8 values take precedence per field, with ES7 fallback. Empty source fields never clear target data.`);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) return help();
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const outputDir = path.join(root, 'outputs/profile-demographics-sync');
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const reportPath = path.resolve(root, options.report ?? path.join(outputDir, `run-${stamp}.json`));
  const latestPath = path.join(outputDir, 'latest.json');
  const releaseLock = await acquireLock(path.join(outputDir, 'sync.lock'));
  await fs.mkdir(path.dirname(reportPath), { recursive: true });
  await fs.writeFile(reportPath, '{}\n', { flag: 'wx', mode: 0o600 });
  const report = {
    startedAt: new Date().toISOString(),
    status: 'preflight',
    mode: options.execute ? 'execute' : 'dry-run',
    window: { field: 'insertedDate', from: options.from, to: options.to },
    typeFilter: 'type prefix fb',
    targetIndexes: options.indexes,
    profileSources: { precedence: ['ES8/profile2021', 'ES7/profile2021'], match: 'topic profile.id -> source _id' },
    fieldRules: {
      gender: 'sex nam/nữ/male/female -> male/female',
      birthday: 'birthyear, then year parsed from birthdayDate/birthday -> February 2 00:00:00 UTC epoch milliseconds',
      location: 'positive integer province code',
      nulls: 'ignored; existing target value is never cleared',
    },
    stats: newStats(options.indexes),
  };
  const save = async () => {
    const text = `${JSON.stringify(report, null, 2)}\n`;
    await fs.writeFile(reportPath, text);
    await fs.writeFile(latestPath, text);
  };
  let es7;
  try {
    await save();
    const context = await loadMigrationContext();
    es7 = context.es7;
    await es7.ping();
    await verifyMappings(es7, context.es8Request, options.indexes);
    report.status = 'running';
    await save();
    console.log(`Mappings verified. Mode=${report.mode}; insertedDate=${options.from}..${options.to}`);
    await scanAndSync(es7, context.es8Request, options, report, save);
    report.status = 'complete';
    report.finishedAt = new Date().toISOString();
    await save();
    console.log(`Complete. report=${reportPath}`);
  } catch (error) {
    report.status = 'failed';
    report.finishedAt = new Date().toISOString();
    report.error = error.message;
    await save().catch(() => {});
    throw error;
  } finally {
    if (es7) await es7.close().catch(() => {});
    await releaseLock();
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => { console.error(error.stack || error.message); process.exitCode = 1; });
}
