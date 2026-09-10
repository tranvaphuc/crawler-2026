import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { Client } from '@opensearch-project/opensearch';

export const INDEXES = [
  'topic5d36b566c9b7f067053133d6',
  'topic5d36ace4c9b7f06705313167',
  'topic5d36ba88c9b7f0670531363c',
  'topic5d2f1dc6a57ad3e26640a5a8',
  'topic62dd74b205ded06a47567e47',
];
export const GENDER_MAP = { nam: 'male', 'nữ': 'female' };
export const QUERY = { terms: { 'profile.gender': Object.keys(GENDER_MAP) } };
export const SCRIPT = `
if (ctx._source.profile == null) { ctx.op = 'noop'; return; }
def gender = ctx._source.profile.gender;
if (gender instanceof String && params.genders.containsKey(gender)) {
  ctx._source.profile.gender = params.genders.get(gender);
} else {
  ctx.op = 'noop';
}
`;

const unwrap = (response) => response.body ?? response;

export function parseArgs(args) {
  const options = { execute: false, confirm: '', help: false };
  for (const arg of args) {
    if (arg === '--execute') options.execute = true;
    else if (arg === '--help') options.help = true;
    else if (arg.startsWith('--confirm=')) options.confirm = arg.slice(10);
    else if (arg.startsWith('--report=')) options.report = arg.slice(9);
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (options.execute && options.confirm !== 'NORMALIZE_ES7_GENDER') {
    throw new Error('Live writes require --execute --confirm=NORMALIZE_ES7_GENDER');
  }
  return options;
}

export async function countGenders(client, index) {
  const result = unwrap(await client.search({
    index,
    allow_partial_search_results: false,
    body: {
      size: 0,
      track_total_hits: true,
      query: QUERY,
      aggs: { genders: { terms: { field: 'profile.gender', size: 2, include: ['nam', 'nữ'] } } },
    },
  }));
  if (result.timed_out || result._shards?.failed > 0) {
    throw new Error(`Incomplete search for ${index}; no further writes will be started`);
  }
  const total = typeof result.hits.total === 'number' ? result.hits.total : result.hits.total.value;
  return { total, ...Object.fromEntries(result.aggregations.genders.buckets.map((b) => [b.key, b.doc_count])) };
}

export async function normalizeGenders(client, options, save, log = console.log) {
  const report = {
    startedAt: new Date().toISOString(),
    mode: options.execute ? 'execute' : 'dry-run',
    status: 'preflight',
    conversions: GENDER_MAP,
    indexes: {},
  };
  try {
    // Check every concrete mapping before allowing ANY writes. Never change mappings.
    const mappings = unwrap(await client.indices.getMapping({ index: INDEXES }));
    for (const index of INDEXES) {
      const mapping = mappings[index]?.mappings;
      const profile = mapping?.properties?.profile;
      if (profile?.type === 'nested' || profile?.properties?.gender?.type !== 'keyword') {
        throw new Error(`${index}: expected object profile with keyword profile.gender`);
      }
    }
    for (const index of INDEXES) {
      const before = await countGenders(client, index);
      report.indexes[index] = { before };
      log(`[preflight] ${index}: ${before.total} documents (nam=${before.nam ?? 0}, nữ=${before['nữ'] ?? 0})`);
    }
    report.matchedDocuments = Object.values(report.indexes).reduce((sum, entry) => sum + entry.before.total, 0);
    await save(report);
    if (options.execute) {
      report.status = 'running';
      await save(report);
      // One index at a time; asynchronous tasks prevent HTTP timeouts during large updates.
      for (const index of INDEXES) {
        const entry = report.indexes[index];
        if (entry.before.total === 0) continue;
        entry.status = 'submitting';
        await save(report);
        const submitted = unwrap(await client.updateByQuery({
          index,
          conflicts: 'proceed',
          wait_for_completion: false,
          refresh: true,
          scroll_size: 500,
          requests_per_second: 500,
          body: { query: QUERY, script: { lang: 'painless', source: SCRIPT, params: { genders: GENDER_MAP } } },
        }, { maxRetries: 0 }));
        if (!submitted.task) throw new Error(`No task ID returned for ${index}; check ES tasks before retrying`);
        entry.taskId = submitted.task;
        entry.status = 'running';
        log(`[execute] ${index}: task=${entry.taskId}`);
        await save(report);
        while (true) {
          const task = unwrap(await client.tasks.get({
            task_id: entry.taskId,
            wait_for_completion: true,
            timeout: '10s',
          }));
          if (task.error) throw new Error(`Task ${entry.taskId}: ${JSON.stringify(task.error)}`);
          if (task.completed) {
            entry.result = task.response;
            if (!entry.result || entry.result.timed_out || entry.result.failures?.length) {
              throw new Error(`Task ${entry.taskId} did not finish successfully: ${JSON.stringify(entry.result)}`);
            }
            entry.after = await countGenders(client, index);
            entry.status = entry.after.total > 0 || entry.result.version_conflicts > 0 ? 'needs-review' : 'complete';
            log(`[done] ${index}: updated=${entry.result.updated}, conflicts=${entry.result.version_conflicts}, remaining=${entry.after.total}`);
            await save(report);
            break;
          }
          entry.progress = task.task?.status;
          log(`[progress] ${index}: updated=${entry.progress?.updated ?? 0}/${entry.progress?.total ?? '?'}`);
          await save(report);
        }
      }
    }
    report.status = Object.values(report.indexes).some((entry) => entry.status === 'needs-review') ? 'needs-review' : 'complete';
    report.finishedAt = new Date().toISOString();
    await save(report);
    return report;
  } catch (error) {
    report.status = 'interrupted-or-failed';
    report.error = error.message;
    report.note = 'Submitted ES tasks may still be running. Check saved task IDs before restarting; do not blindly resubmit.';
    await save(report);
    throw error;
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    console.log(`Normalize exact profile.gender values nam -> male and nữ -> female on the five fixed topic indexes.
All matching documents are included; no UserId/input-file restriction. Other fields and values are untouched.

Dry-run: npm run es7:gender
Write:   npm run es7:gender -- --execute --confirm=NORMALIZE_ES7_GENDER
Optional: --report=/absolute/path/report.json

Writes run sequentially with ES task IDs and progress saved to a unique report.
If interrupted, ES tasks can continue: inspect the recorded task IDs before restarting.`);
    return;
  }
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  dotenv.config({ path: path.join(root, '.env'), quiet: true });
  if (!process.env.ES7_HOST) throw new Error('Missing ES7_HOST in .env');
  const reportPath = path.resolve(root, options.report ?? `outputs/es7-gender-${Date.now()}.json`);
  await fs.mkdir(path.dirname(reportPath), { recursive: true });
  // Fail before any writes if the report cannot be created; do not overwrite old reports.
  await fs.writeFile(reportPath, '{}\n', { flag: 'wx', mode: 0o600 });
  const save = (report) => fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  const client = new Client({ node: process.env.ES7_HOST, maxRetries: 0, requestTimeout: 60_000 });
  console.log(`Mode: ${options.execute ? 'EXECUTE' : 'DRY-RUN'}; report: ${reportPath}`);
  try {
    const report = await normalizeGenders(client, options, save);
    console.log(`Finished: ${report.status}; matched=${report.matchedDocuments}; report=${reportPath}`);
    if (report.status !== 'complete') process.exitCode = 1;
  } finally {
    await client.close();
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
