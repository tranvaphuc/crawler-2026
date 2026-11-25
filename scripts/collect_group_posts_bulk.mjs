import { readFile, writeFile, appendFile, mkdir, rename } from 'node:fs/promises';
import { openSync, readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { parseArgs } from 'node:util';
import { setTimeout as sleep } from 'node:timers/promises';
import { post, parseChunks, mergeChunks } from './paginate_facebook_group_capture.js';
import { responseError, graphqlError, classifyTransportError } from './facebook_post_errors.js';
import { monthBounds, selectMonthStories, owningProfileType } from './facebook_group_month.js';
import { createProxyAgent } from './facebook_posts.js';
import { createProxyVnRotator } from './proxyvn_rotator.js';

const { values: args } = parseArgs({ options: {
  input: { type: 'string' }, har: { type: 'string' }, out: { type: 'string' },
  target: { type: 'string', default: '1000' }, delay: { type: 'string', default: '750' },
  month: { type: 'string', default: '2026-09' },
  'proxy-key-file': { type: 'string' },
} });
if (!args.input || !args.har || !args.out) throw new Error('--input --har --out required');
const target = Number(args.target), delay = Number(args.delay);
const bounds = monthBounds(args.month);
if (!Number.isSafeInteger(target) || target < 1 || !Number.isFinite(delay) || delay < 0) throw new Error('Invalid target/delay');
const out = resolve(args.out); await mkdir(out, { recursive: true });
const lockPath = join(out, 'collector.lock');
try {
  const fd = openSync(lockPath, 'wx', 0o600); writeFileSync(fd, String(process.pid));
} catch (error) {
  if (error.code !== 'EEXIST') throw error;
  let alive = true;
  try { process.kill(Number(readFileSync(lockPath, 'utf8')), 0); }
  catch (e) { if (e.code === 'ESRCH') alive=false; else throw e; }
  if (alive) throw new Error('Collector already running for this output directory');
  unlinkSync(lockPath); const fd = openSync(lockPath,'wx',0o600); writeFileSync(fd,String(process.pid));
}
process.on('exit', () => { try { unlinkSync(lockPath); } catch {} });
const ids = JSON.parse(await readFile(args.input, 'utf8'));
const har = JSON.parse(await readFile(args.har, 'utf8'));
const entry = har.log.entries.find(e => e.request.postData?.text.includes('GroupsCometFeedRegularStoriesPaginationQuery'));
if (!entry) throw new Error('No group query in HAR');
const baseForm = Object.fromEntries(new URLSearchParams(entry.request.postData.text));
baseForm.__user = '0'; baseForm.av = '0';
for (const key of ['fb_dtsg', 'access_token']) delete baseForm[key];
const baseVariables = JSON.parse(baseForm.variables);
const excluded = new Set(['host', 'content-length', 'accept-encoding', 'connection', 'cookie',
  'authorization', 'x-fb-navigation-chain']);
const baseHeaders = Object.fromEntries(entry.request.headers.filter(h =>
  !h.name.startsWith(':') && !excluded.has(h.name.toLowerCase()))
  .map(h => [h.name.toLowerCase(), h.value]));
const rowsPath = join(out, 'posts.jsonl'), statePath = join(out, 'state.json');
const seen = new Map(ids.map(id => [id, new Set()]));
try {
  for (const line of (await readFile(rowsPath, 'utf8')).split('\n').filter(Boolean)) {
    const row = JSON.parse(line); seen.get(row.siteId)?.add(row.id);
  }
} catch (e) { if (e.code !== 'ENOENT') throw e; }
let saved;
try { saved = JSON.parse(await readFile(statePath, 'utf8')); }
catch (e) { if (e.code !== 'ENOENT') throw e; }
if (saved && (saved.month !== args.month || saved.typenameSource !== 'feedback.owning_profile.__typename')) {
  throw new Error('Checkpoint has a different month/schema; use a new --out directory');
}
const previous = new Map((saved?.groups ?? []).map(g => [g.siteId, g]));
const groups = ids.map(id => ({ siteId: id, siteName: '', posts: seen.get(id).size,
  pages: 0, cursor: null, status: 'PENDING', error: null, missingTime: 0, ...previous.get(id) }));
let requests = saved?.requests ?? 0, stopReason = null, stopping = false;
const metrics = {successfulRequests:0, failedRequests:0, proxyRotations:0,
  proxyApiCalls:0, blockedRequests:0, consecutiveFailures:0,
  trackedSinceRequest:saved?.requests ?? 0, ...saved?.metrics};
const acquireProxy = args['proxy-key-file'] ? createProxyVnRotator((await readFile(args['proxy-key-file'],'utf8')).trim()) : null;
let agent, proxyIdentity = null, activeGroup = null, retryAt = null, lastError = null;
// Retry the interrupted group at its saved cursor when enabling proxy mode.
if (acquireProxy) for (const group of groups) if (['FACEBOOK_RATE_LIMITED', 'FACEBOOK_ACCESS_DENIED',
  'PROXY_CONNECT_FAILED', 'PROXY_TIMEOUT', 'NETWORK_ERROR', 'NETWORK_TIMEOUT'].includes(group.status)) {
  group.status = group.pages ? 'RUNNING' : 'PENDING'; group.error = null;
}
const startedAt = new Date().toISOString();
process.on('SIGTERM', () => { stopping = true; stopReason = 'INTERRUPTED'; });
process.on('SIGINT', () => { stopping = true; stopReason = 'INTERRUPTED'; });

async function checkpoint() {
  const data = { month: args.month, timezone: 'Asia/Ho_Chi_Minh',
    typenameSource: 'feedback.owning_profile.__typename', targetPerGroup: target, totalGroups: ids.length, requests,
    totalPosts: groups.reduce((n, g) => n + g.posts, 0), startedAt,
    updatedAt: new Date().toISOString(), stopReason, metrics, activeGroup,
    proxyIdentity, retryAt, lastError, pid: process.pid, groups };
  await writeFile(statePath + '.tmp', JSON.stringify(data, null, 2));
  await rename(statePath + '.tmp', statePath);
}

function siteName(story, id) {
  if (story.to?.id === id && story.to?.name) return story.to.name;
  const group = story.comet_sections?.context_layout?.story?.comet_sections?.title?.story?.to;
  return group?.id === id ? group.name ?? '' : '';
}

// Retain the two verified preflight pages if starting this run for the first time.
if (!saved) {
  for (const filename of ['preflight.merged.json', 'preflight-next.merged.json']) {
    try {
      const root = JSON.parse(await readFile(join(out, filename), 'utf8'));
      const group = groups.find(g => g.siteId === root.node?.id);
      if (!group) continue;
      await consume(group, root);
    } catch (e) { if (e.code !== 'ENOENT') throw e; }
  }
}

async function consume(group, root) {
  const feed = root.node.group_feed, known = seen.get(group.siteId), added = [];
  const selection = selectMonthStories(feed.edges.map(e => e.node), bounds);
  group.missingTime += selection.missingTime;
  for (const { node: story } of feed.edges) {
    if (!story) continue;
    const name = siteName(story, group.siteId);
    if (name) group.siteName = name;
  }
  for (const story of selection.selected) {
    if (!story?.post_id || known.has(String(story.post_id)) || known.size >= target) continue;
    const name = siteName(story, group.siteId);
    if (name) group.siteName = name;
    const row = { id: String(story.post_id), siteId: group.siteId,
      siteName: name || group.siteName, __typename: owningProfileType(story),
      link: `https://www.facebook.com/groups/${group.siteId}/posts/${story.post_id}/`,
      time: story.creation_time ?? null };
    known.add(row.id); added.push(row);
  }
  if (added.length) await appendFile(rowsPath, added.map(row => JSON.stringify(row)).join('\n') + '\n');
  group.posts = known.size; group.pages++;
  const info = feed.page_info;
  if (typeof info?.has_next_page !== 'boolean') throw new Error('Missing page_info');
  if (selection.cutoff) group.status = 'BEFORE_MONTH';
  else if (group.posts >= target) group.status = 'TARGET_REACHED';
  else if (!info.has_next_page) group.status = group.posts ? 'END_OF_FEED' : 'EMPTY';
  else if (!info.end_cursor || info.end_cursor === group.cursor) group.status = 'PAGINATION_ERROR';
  else group.status = 'RUNNING';
  group.cursor = info.has_next_page ? info.end_cursor : null;
  return added.length;
}

await checkpoint();
while (!stopping) {
  const pending = groups.filter(g => ['PENDING', 'RUNNING'].includes(g.status));
  if (!pending.length) { stopReason = 'ALL_GROUPS_FINISHED'; break; }
  // Finish this group (target, cutoff or error) before moving to the next one.
  for (const group of pending.slice(0, 1)) {
    if (stopping) break;
    activeGroup = group.siteId;
    if (acquireProxy && !agent) {
      try {
        metrics.proxyApiCalls++;
        const proxy = await acquireProxy();
        const identity = `${proxy.host}:${proxy.port}`;
        agent = createProxyAgent(proxy); proxyIdentity = identity;
        metrics.proxyRotations++;
        console.log(JSON.stringify({event:'PROXY_READY', rotation:metrics.proxyRotations}));
      } catch (error) {
        lastError = {code:error.code ?? 'PROXY_API_ERROR', message:error.message};
        console.log(JSON.stringify({event:'PROXY_API_ERROR', code:lastError.code}));
        if (['PROXY_API_NO_ACTIVE_KEY','PROXY_API_INVALID_KEY','PROXY_API_BAD_RESPONSE'].includes(error.code)) {
          stopReason=error.code; stopping=true; await checkpoint(); break;
        }
        const wait = Math.max(1000, error.retryAfterMs ?? 60000);
        retryAt = new Date(Date.now() + wait).toISOString();
        await checkpoint();
        for (let remaining=wait; remaining>0 && !stopping; remaining-=1000) await sleep(Math.min(1000,remaining));
        continue;
      }
    }
    retryAt = null;
    await sleep(delay);
    const form = { ...baseForm }, headers = { ...baseHeaders,
      referer: `https://www.facebook.com/groups/${group.siteId}/` };
    form.variables = JSON.stringify({ ...baseVariables, id: group.siteId,
      youthIntegrityHostID: group.siteId, cursor: group.cursor, count: 100,
      stream_initial_count: 100, sortingSetting: 'CHRONOLOGICAL' });
    requests++;
    try {
      let response;
      try { response = await post(form, headers, new Map(), agent); }
      catch (error) { throw classifyTransportError(error, !!agent); }
      const httpError = responseError(response);
      if (httpError) throw httpError;
      const chunks = parseChunks(response.text), root = mergeChunks(chunks);
      const errors = chunks.flatMap(c => c.errors ?? []);
      const feed = root.node?.group_feed;
      const hasPosts = feed?.edges?.some(e => e.node?.post_id);
      const knownError = graphqlError(errors, { unknownIsFatal: false });
      if (knownError && (knownError.code !== 'TARGET_UNAVAILABLE' || !hasPosts)) throw knownError;
      if (!feed || !Array.isArray(feed.edges)) {
        throw graphqlError(errors) ?? Object.assign(new Error('No readable public group feed'), { code: 'FEED_UNAVAILABLE' });
      }
      if (root.node.id !== group.siteId) throw new Error('Group ID mismatch');
      if (!hasPosts && errors.length) throw graphqlError(errors);
      const added = await consume(group, root);
      metrics.successfulRequests++; metrics.consecutiveFailures=0; lastError=null;
      group.error = null;
      console.log(JSON.stringify({ request: requests, siteId: group.siteId,
        siteName: group.siteName, newPosts: added, total: group.posts, status: group.status }));
    } catch (error) {
      const code = error.code ?? 'REQUEST_ERROR';
      metrics.failedRequests++; metrics.consecutiveFailures++;
      lastError = {code, message:error.message};
      group.error = { code, message: error.message };
      group.status = code;
      console.log(JSON.stringify({ request: requests, siteId: group.siteId, error: code }));
      if (acquireProxy && (['FACEBOOK_RATE_LIMITED','FACEBOOK_ACCESS_DENIED',
        'PROXY_CONNECT_FAILED','PROXY_TIMEOUT','PROXY_TUNNEL_REJECTED','PROXY_AUTH_REQUIRED',
        'NETWORK_TIMEOUT','NETWORK_ERROR','FACEBOOK_SERVER_ERROR'].includes(code))) {
        if (['FACEBOOK_RATE_LIMITED','FACEBOOK_ACCESS_DENIED'].includes(code)) metrics.blockedRequests++;
        group.status = group.pages ? 'RUNNING' : 'PENDING';
        agent?.destroy(); agent = null;
        // Honour Retry-After; repeated failures get a five-minute cooldown.
        const wait = Math.max(error.retryAfterMs ?? 0, metrics.consecutiveFailures >= 3 ? 300000 : 5000);
        retryAt = new Date(Date.now() + wait).toISOString();
        await checkpoint();
        for (let remaining=wait; remaining>0 && !stopping; remaining-=1000) await sleep(Math.min(1000,remaining));
        continue;
      }
      if (['FACEBOOK_RATE_LIMITED', 'AUTH_REQUIRED', 'SECURITY_CHECKPOINT',
        'REQUEST_TOKEN_INVALID', 'REQUEST_TEMPLATE_INVALID', 'ENOTFOUND', 'EAI_AGAIN'].includes(code)) {
        stopReason = code; stopping = true;
        await writeFile(join(out, 'stop-error.json'), JSON.stringify({ siteId: group.siteId,
          code, message: error.message, retryAfterMs: error.retryAfterMs ?? null }, null, 2));
      }
    }
    await checkpoint();
  }
}
agent?.destroy();
await checkpoint();
console.log(JSON.stringify({ stopReason, requests, totalPosts: groups.reduce((n, g) => n + g.posts, 0) }));
