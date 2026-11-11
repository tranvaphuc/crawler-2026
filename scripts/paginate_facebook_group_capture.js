#!/usr/bin/env node
// Node.js 20+, no external packages. Replays an anonymous captured group feed.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import https from 'node:https';
import { setTimeout as sleep } from 'node:timers/promises';

const QUERY = 'GroupsCometFeedRegularStoriesPaginationQuery';
const ENDPOINT = 'https://www.facebook.com/api/graphql/';
const writeJson = (path, data) => writeFile(path, JSON.stringify(data, null, 2) + '\n');

export function parseChunks(raw) {
  const text = raw.trimStart().replace(/^for\s*\(;;\);\s*/, '');
  const chunks = [];
  let start = -1, depth = 0, quoted = false, escaped = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (start < 0) {
      if (/\s/.test(char)) continue;
      if (char !== '{') throw new Error('Expected GraphQL JSON object');
      start = i;
    }
    if (quoted) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') quoted = false;
    } else if (char === '"') quoted = true;
    else if (char === '{' || char === '[') depth++;
    else if (char === '}' || char === ']') depth--;
    if (depth === 0 && !quoted) {
      chunks.push(JSON.parse(text.slice(start, i + 1)));
      start = -1;
    }
  }
  if (start >= 0 || !chunks.length) throw new Error('Empty or truncated GraphQL response');
  return chunks;
}

export function mergeChunks(chunks) {
  const root = {};
  for (const chunk of chunks) {
    if (!chunk.data || typeof chunk.data !== 'object' || Array.isArray(chunk.data)) continue;
    let target = root;
    const path = chunk.path ?? [];
    for (let i = 0; i < path.length; i++) {
      const key = path[i];
      if (['__proto__', 'prototype', 'constructor'].includes(key)) {
        throw new Error('Unsafe response path');
      }
      target = target[key] ??= typeof path[i + 1] === 'number' ? [] : {};
    }
    for (const [key, value] of Object.entries(chunk.data)) {
      Object.defineProperty(target, key, {
        value: structuredClone(value), writable: true, enumerable: true, configurable: true,
      });
    }
  }
  return root;
}

export function extractPosts(root) {
  return (root.node?.group_feed?.edges ?? []).flatMap(edge => {
    const story = edge.node;
    if (!story?.post_id) return [];
    const content = story.comet_sections?.content?.story;
    return [{
      post_id: story.post_id,
      url: story.permalink_url ?? null,
      created_time: story.creation_time ?? null,
      created_at: story.creation_time == null ? null :
        new Date(story.creation_time * 1000).toISOString().replace('.000Z', '+00:00'),
      authors: (story.actors ?? []).map(a => ({
        id: a.id ?? null, name: a.name ?? null, url: a.url ?? null,
      })),
      text: content?.message?.text ?? null,
      attachments: story.attachments ?? [],
      feedback: story.comet_sections?.feedback?.story?.story_ufi_container?.story
        ?.feedback_context?.feedback_target_with_context
        ?.comet_ufi_summary_and_actions_renderer?.feedback ?? {},
    }];
  });
}

export function linkRows(posts, limit) {
  return posts.slice(0, limit).map(post => ({
    link: post.url,
    time: post.created_time == null ? null :
      new Date((post.created_time + 7 * 3600) * 1000).toISOString()
        .replace('.000Z', '+07:00'),
    author: post.authors.map(a => a.name || a.id || '').join(', '),
  }));
}

// Cookie scope is deliberately limited to the single fixed Facebook endpoint.
function updateCookies(jar, setCookies) {
  for (const line of setCookies ?? []) {
    const [pair, ...attributes] = line.split(';');
    const separator = pair.indexOf('=');
    if (separator < 1) continue;
    const name = pair.slice(0, separator).trim();
    const attrs = Object.fromEntries(attributes.map(attribute => {
      const index = attribute.indexOf('=');
      return index < 0 ? [attribute.trim().toLowerCase(), true] :
        [attribute.slice(0, index).trim().toLowerCase(), attribute.slice(index + 1).trim()];
    }));
    const domain = String(attrs.domain ?? 'www.facebook.com').replace(/^\./, '').toLowerCase();
    const path = String(attrs.path ?? '/api');
    if (!['facebook.com', 'www.facebook.com'].includes(domain)) continue;
    const key = `${domain}|${path}|${name}`;
    let expires = attrs.expires ? Date.parse(attrs.expires) : Infinity;
    if ('max-age' in attrs && /^-?\d+$/.test(attrs['max-age'])) {
      expires = Date.now() + Number(attrs['max-age']) * 1000;
    }
    if (expires <= Date.now()) jar.delete(key);
    else jar.set(key, { name, value: pair.slice(separator + 1).trim(), path, expires });
  }
}

export function post(form, headers, jar, agent) {
  const body = new URLSearchParams(form).toString();
  const cookies = [...jar.values()].filter(c => c.expires > Date.now() &&
    ('/api/graphql/' === c.path || '/api/graphql/'.startsWith(
      c.path.endsWith('/') ? c.path : c.path + '/')));
  const requestHeaders = { ...headers, 'content-length': Buffer.byteLength(body) };
  if (cookies.length) requestHeaders.cookie = cookies.map(c => `${c.name}=${c.value}`).join('; ');
  return new Promise((done, reject) => {
    let stage = agent ? 'proxy_connect' : 'target_connect';
    let proxyConnectStatus;
    const fail = error => {
      error.stage = stage;
      error.proxyConnectStatus = proxyConnectStatus;
      reject(error);
    };
    const request = https.request(ENDPOINT, { method: 'POST', headers: requestHeaders, agent }, response => {
      stage = 'target_response';
      const buffers = [];
      response.on('data', chunk => buffers.push(chunk));
      response.on('error', fail);
      response.on('end', () => {
        updateCookies(jar, response.headers['set-cookie']);
        done({ status: response.statusCode, location: response.headers.location,
          proxyConnectStatus, retryAfter: response.headers['retry-after'],
          text: Buffer.concat(buffers).toString('utf8') });
      });
    });
    request.on('proxyConnect', connect => {
      proxyConnectStatus = connect.statusCode;
      stage = connect.statusCode === 200 ? 'target_tls' : 'proxy_connect';
    });
    const timer = setTimeout(() => {
      const error = new Error('Request timed out after 45s');
      error.code = 'ETIMEDOUT';
      request.destroy(error);
    }, 45000);
    request.on('close', () => clearTimeout(timer));
    request.on('error', fail);
    request.end(body);
  });
}

export async function main(argv = process.argv.slice(2)) {
  const { values: args } = parseArgs({ args: argv, options: {
    har: { type: 'string' }, out: { type: 'string' },
    target: { type: 'string', default: '20' },
    'group-id': { type: 'string' },
    'max-pages': { type: 'string', default: '8' },
    delay: { type: 'string', default: '2' },
    offline: { type: 'boolean', default: false }, help: { type: 'boolean' },
  } });
  if (args.help) {
    console.log('node scripts/paginate_facebook_group_capture.js --har FILE --out DIR\n' +
      '  [--group-id ID] [--target 20] [--max-pages 8] [--delay 2] [--offline]\n' +
      'Uses anonymous tokens from the original HAR. --group-id starts at cursor=null.');
    return;
  }
  if (!args.har || !args.out) throw new Error('--har and --out are required');
  const target = Number(args.target), maxPages = Number(args['max-pages']), delay = Number(args.delay);
  if (![target, maxPages].every(n => Number.isSafeInteger(n) && n > 0) ||
      !Number.isFinite(delay) || delay < 0) throw new Error('Invalid target, max-pages or delay');
  const freshGroup = args['group-id'] !== undefined;
  if (freshGroup && !/^\d+$/.test(args['group-id'])) throw new Error('Group ID must contain digits');
  if (freshGroup && args.offline) throw new Error('--group-id cannot be used with --offline');
  const har = JSON.parse(await readFile(args.har, 'utf8'));
  const candidates = har.log.entries.map(entry => ({ entry,
    form: Object.fromEntries(new URLSearchParams(entry.request.postData?.text ?? '')),
  })).filter(item => item.form.fb_api_req_friendly_name === QUERY);
  const captured = candidates.at(-1);
  if (!captured) throw new Error(`No ${QUERY} request found in HAR`);
  const { entry, form } = captured;
  if (entry.request.url !== ENDPOINT) throw new Error('Unexpected HAR endpoint');
  if (Object.values(form).includes('[REDACTED]')) throw new Error('Use original, unredacted HAR');
  const excluded = new Set(['host', 'content-length', 'accept-encoding', 'connection',
    'cookie', 'authorization']);
  const headers = Object.fromEntries(entry.request.headers.filter(h =>
    !h.name.startsWith(':') && !excluded.has(h.name.toLowerCase()))
    .map(h => [h.name.toLowerCase(), h.value]));
  const variables = JSON.parse(form.variables);
  const out = resolve(args.out);
  await mkdir(out, { recursive: true });
  let posts = new Map(), pageInfo, trace = [];
  if (freshGroup) {
    variables.id = args['group-id'];
    variables.youthIntegrityHostID = args['group-id'];
    variables.cursor = null;
    headers.referer = `https://www.facebook.com/groups/${args['group-id']}/`;
    delete headers['x-fb-navigation-chain'];
    pageInfo = { has_next_page: true, end_cursor: null };
  } else {
    const content = entry.response.content;
    const raw = content.encoding === 'base64' ? Buffer.from(content.text, 'base64').toString('utf8') : content.text;
    const root = mergeChunks(parseChunks(raw));
    posts = new Map(extractPosts(root).map(p => [p.post_id, p]));
    pageInfo = root.node?.group_feed?.page_info ?? {};
    await writeFile(join(out, 'page-000.response.jsonl'), raw);
    await writeJson(join(out, 'page-000.merged.json'), root);
    trace.push({ page: 0, source: 'captured_response', posts: posts.size });
  }
  const jar = new Map(), seen = new Set();
  let reason = args.offline ? 'offline_only' : 'max_pages_reached';
  try {
    for (let page = 1; !args.offline && page <= maxPages; page++) {
      if (posts.size >= target) { reason = 'target_reached'; break; }
      if (!pageInfo.has_next_page) { reason = 'no_next_page'; break; }
      const cursor = pageInfo.end_cursor ?? null;
      if (!(freshGroup && page === 1) && (!cursor || seen.has(cursor))) {
        reason = 'missing_or_repeated_cursor'; break;
      }
      seen.add(cursor);
      variables.cursor = cursor;
      form.variables = JSON.stringify(variables);
      await sleep(delay * 1000);
      let response;
      try { response = await post(form, headers, jar); }
      catch (error) {
        trace.push({ page, network_error: error.message });
        reason = 'network_error'; break;
      }
      const prefix = `page-${String(page).padStart(3, '0')}`;
      await writeFile(join(out, `${prefix}.response.txt`), response.text);
      if (response.status >= 300 && response.status < 400) {
        reason = /\/(login|checkpoint)/.test(response.location ?? '') ?
          'login_or_checkpoint_required' : 'unexpected_redirect';
        trace.push({ page, http_status: response.status, reason }); break;
      }
      if (response.status !== 200) {
        reason = `http_error_${response.status}`;
        trace.push({ page, http_status: response.status }); break;
      }
      let chunks;
      try { chunks = parseChunks(response.text); }
      catch {
        reason = 'non_json_response';
        trace.push({ page, http_status: response.status, reason }); break;
      }
      const root = mergeChunks(chunks);
      await writeJson(join(out, `${prefix}.merged.json`), root);
      const batch = extractPosts(root), before = posts.size;
      for (const item of batch) posts.set(item.post_id, item);
      const errors = chunks.flatMap(c => c.errors ?? []);
      trace.push({ page, http_status: response.status, returned_posts: batch.length,
        new_posts: posts.size - before, total_posts: posts.size, errors });
      console.log(`Page ${page}: ${batch.length} returned, ${posts.size - before} new, ${posts.size} total`);
      await writeJson(join(out, 'progress.json'), trace);
      if (posts.size >= target) { reason = 'target_reached'; break; }
      if (!batch.length) { reason = errors.length ? 'graphql_error' : 'no_posts_returned'; break; }
      if (posts.size === before) { reason = 'no_new_posts'; break; }
      pageInfo = root.node?.group_feed?.page_info ?? {};
    }
  } finally {
    const all = [...posts.values()];
    const times = all.map(p => p.created_time);
    await writeJson(join(out, 'posts.json'), {
      group_id: variables.id, query: QUERY, requested_count: target,
      extracted_count: all.length, target_reached: all.length >= target,
      requested_sorting: variables.sortingSetting,
      returned_order_is_chronological: times.every((t, i) => t != null && (i === 0 || times[i - 1] >= t)),
      latest_posts_verified: false, stop_reason: reason, pages: trace, posts: all,
    });
    const rows = linkRows(all, target);
    await writeJson(join(out, 'link-time-author.json'), rows);
    await writeFile(join(out, 'link-time-author.txt'), rows.map(r =>
      `${r.link} | ${r.time} | ${r.author}`).join('\n') + '\n');
    console.log(JSON.stringify({ extracted_count: all.length, stop_reason: reason,
      output: join(out, 'posts.json') }));
    if (['network_error', 'non_json_response', 'graphql_error', 'login_or_checkpoint_required',
      'unexpected_redirect'].includes(reason) || reason.startsWith('http_error_')) process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
