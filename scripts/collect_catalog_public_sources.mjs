import fs from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import { decode, parseMetadata } from './source_audit_metadata.mjs';

const root = 'outputs/source-keyword-catalog-2026-11-19/cross-platform-audit';
const output = `${root}/source-probes.jsonl`;
const input = JSON.parse(await fs.readFile(`${root}/source-probe-targets.json`, 'utf8'));
const hostFor = { youtube: 'youtube.com', tiktok: 'tiktok.com', instagram: 'instagram.com', threads: 'threads.com', linkedin: 'linkedin.com' };
const nameFor = { youtube: 'YouTube', tiktok: 'TikTok', instagram: 'Instagram', threads: 'Threads', linkedin: 'LinkedIn' };
const previous = new Set();
try {
  for (const line of (await fs.readFile(output, 'utf8')).split('\n').filter(Boolean)) {
    const row = JSON.parse(line);
    if (row.status === 'live') previous.add(row.sourceKey);
  }
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}

function allowed(url, channel) {
  if (url.protocol !== 'https:' || url.username || url.password || url.port) return false;
  const domains = channel === 'threads' ? ['threads.com', 'threads.net'] : [hostFor[channel]];
  return domains.some(domain => url.hostname === domain || url.hostname.endsWith(`.${domain}`));
}

function sourceRoute(url, channel) {
  const p = url.pathname.replace(/\/+$/, '');
  if (channel === 'youtube') return p.match(/^\/(?:@[\w.%-]+|channel\/UC[\w-]{22}|(?:c|user)\/[\w.%-]+)(?:\/(?:about|featured|videos|shorts))?$/i)?.[0].replace(/\/(?:about|featured|videos|shorts)$/i, '').toLowerCase();
  if (channel === 'linkedin') return p.match(/^\/(?:company|school|showcase|in)\/[\w.%-]+$/i)?.[0].toLowerCase();
  if (channel === 'instagram' && /^\/(?:explore|accounts|direct|stories|reels?|p|share)$/i.test(p)) return null;
  return p.match(channel === 'instagram' ? /^\/[\w.]+$/ : /^\/@[\w.]+$/)?.[0].toLowerCase();
}

async function loadPage(url, channel) {
  for (let i = 0; i < 4 && allowed(url, channel); i++) {
    const response = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(14000),
      headers: { 'user-agent': 'Mozilla/5.0', 'accept-language': 'en-US,en;q=0.8' } });
    if (response.status >= 300 && response.status < 400 && response.headers.get('location')) {
      await response.body?.cancel();
      url = new URL(response.headers.get('location'), url);
      continue;
    }
    if (!response.ok) { await response.body?.cancel(); return {status: response.status, url: url.href, body: ''}; }
    const reader = response.body.getReader();
    const chunks = [];
    let bytes = 0;
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      chunks.push(value);
      bytes += value.length;
      if (bytes > 5_000_000) { await reader.cancel(); break; }
    }
    return {status: response.status, url: url.href, body: Buffer.concat(chunks).toString('utf8')};
  }
  return {status: 0, url: url.href, body: ''};
}

function count(value) {
  const match = String(value ?? '').replaceAll(',', '').trim().match(/^(\d+(?:\.\d+)?)([KMB])?$/i);
  if (!match || (!match[2] && match[1].includes('.'))) return {};
  const multiplier = { K: 1e3, M: 1e6, B: 1e9 }[match[2]?.toUpperCase()] ?? 1;
  const followers = Math.round(Number(match[1]) * multiplier);
  return Number.isSafeInteger(followers) ? {followers, followerPrecision: match[2] ? 'rounded' : 'reported_integer'} : {};
}

function identity(source, page) {
  const channel = source.channel;
  const route = sourceRoute(new URL(page.url), channel);
  if (!route) return null;
  const result = parseMetadata({channel: nameFor[channel], type: source.type, url: source.link, id: null}, page);
  if (result.status !== 'live' || !result.id || !result.name) return null;
  let follower = {};
  if (channel === 'youtube') {
    const metadataId = page.body.match(/"channelMetadataRenderer"\s*:\s*\{[^}]*?"externalId"\s*:\s*"(UC[\w-]{22})"/)?.[1];
    const canonical = page.body.match(/(?:itemprop|property)=["'](?:url|og:url)["']\s+(?:content|href)=["']https:\/\/www\.youtube\.com\/channel\/(UC[\w-]{22})/)?.[1];
    if (![metadataId, canonical].includes(result.id) || !/^UC[\w-]{22}$/.test(result.id)) return null;
    if (/^\/channel\//i.test(new URL(page.url).pathname) && !new URL(page.url).pathname.includes(result.id)) return null;
    const label = page.body.match(/"subscriberCountText"\s*:\s*\{\s*"(?:simpleText|content)"\s*:\s*"([\d,.KMB]+)\s+subscribers?/i)?.[1]
      ?? page.body.match(/"content"\s*:\s*"([\d,.KMB]+)\s+subscribers?"/i)?.[1];
    follower = {...count(label), followerKind: 'subscribers'};
  } else if (channel === 'tiktok') {
    const raw = page.body.match(/<script[^>]*\bid="__UNIVERSAL_DATA_FOR_REHYDRATION__"[^>]*>([\s\S]*?)<\/script>/)?.[1];
    const profile = raw && JSON.parse(raw)?.__DEFAULT_SCOPE__?.['webapp.user-detail']?.userInfo;
    if (!profile?.user || `/@${profile.user.uniqueId}`.toLowerCase() !== route || String(profile.user.id) !== result.id) return null;
    result.name = profile.user.nickname || result.name;
    follower = {...count(profile.stats?.followerCount), followerKind: 'followers'};
  } else if (channel === 'instagram' || channel === 'threads') {
    const meta = [...page.body.matchAll(/<meta\b[^>]*>/gi)].map(x => x[0]);
    const value = (property) => decode(meta.find(tag => tag.includes(`property="${property}"`))?.match(/content="([^"]*)"/)?.[1] ?? '');
    let canonicalRoute;
    try { canonicalRoute = sourceRoute(new URL(value('og:url')), channel); } catch { return null; }
    if (canonicalRoute !== route || !/\(@[^)]+\)/.test(value('og:title'))) return null;
    const label = value('og:description').match(/(?:^|\s)([\d,.KMB]+) followers\b/i)?.[1];
    follower = {...count(label), followerKind: 'followers'};
  } else if (channel === 'linkedin') {
    if (!/^\/(?:company|school|showcase)\//.test(route)) return null;
    result.type = 'company';
    const label = page.body.match(/(?:^|\s)([\d,.KMB]+)\s+followers\s*</i)?.[1];
    follower = {...count(label), followerKind: 'followers'};
  }
  return {...result, ...follower};
}

const queues = Object.keys(hostFor).map(channel => input.filter(row => row.channel === channel && !previous.has(row.source_key)));
const handle = await fs.open(output, 'a');
try {
  await Promise.all(queues.map(async queue => {
    let attempted = 0, verified = 0;
    for (const source of queue) {
      let result;
      let page;
      try {
        const target = new URL(source.link);
        if (!allowed(target, source.channel) || !sourceRoute(target, source.channel)) continue;
        page = await loadPage(target, source.channel);
        result = identity(source, page);
      } catch (error) {
        result = {status: 'READ_ERROR', note: error.name};
      }
      const row = {sourceKey: source.source_key, originalLink: source.link,
        channel: nameFor[source.channel], checkedAt: new Date().toISOString(),
        ...result, status: result?.status ?? 'NO_TYPED_PROFILE_SAMPLE', httpStatus: page?.status};
      await handle.appendFile(JSON.stringify(row) + '\n');
      attempted++;
      if (row.status === 'live') verified++;
      if (attempted % 50 === 0) console.log(source.channel, {attempted, verified});
      if ([401, 403, 429, 999].includes(page?.status)) break;
      await delay(1200);
    }
    console.log(queue[0]?.channel ?? 'empty', {attempted, verified, queued: queue.length});
  }));
} finally {
  await handle.close();
}
