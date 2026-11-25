import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { EventEmitter, once } from 'node:events';
import express from 'express';
import { normalizeMetricsInput, extractSocialMetrics, exactPublicCount, metricsFailure } from '../src/services/socialMetrics.js';
import { normalizeBrowserProxy, createSocialMetricsReader } from '../src/services/socialMetricsBrowser.js';
import { createSocialMetricsRouter } from '../src/routes/socialMetrics.js';

const jsonHtml = v => `<script type="application/json">${JSON.stringify(v)}</script>`;
const target = url => normalizeMetricsInput({ link: url, url });
const igUrl = 'https://www.instagram.com/p/ABC123/';
const thUrl = 'https://www.threads.com/@sample/post/XYZ123';
const ytUrl = 'https://www.youtube.com/watch?v=abcdefghijk';
const fbUrl = 'https://www.facebook.com/1000419343151470_122138942931244237';

test('routes snsTopic by URL to Instagram; echoes both original fields without replacing them', () => {
  const t = normalizeMetricsInput({ type: 'snsTopic', link: igUrl + '?x=1', url: igUrl });
  assert.equal(t.platform, 'instagram'); assert.equal(t.link, igUrl + '?x=1'); assert.equal(t.originalUrl, igUrl);
  assert.equal(extractSocialMetrics(t).url, igUrl);
});
test('normalizes all four supported platforms and video variants', () => {
  for (const [url, platform] of [[igUrl, 'instagram'], [thUrl, 'threads'], [fbUrl, 'facebook'], [ytUrl, 'youtube']]) assert.equal(target(url).platform, platform);
  assert.equal(target('https://youtu.be/abcdefghijk').id, 'abcdefghijk');
  assert.equal(target('https://www.youtube.com/shorts/abcdefghijk').id, 'abcdefghijk');
});
test('rejects SSRF, credentials, ports, non-post URLs and mismatched link/url/platform', () => {
  for (const url of ['file:///etc/passwd', 'https://127.0.0.1/', 'https://instagram.com.evil.test/p/ABC123',
    'https://user:password@www.instagram.com/p/ABC123/', 'https://www.instagram.com:8443/p/ABC123/',
    'https://www.instagram.com/someprofile/', 'https://www.youtube.com/@somechannel']) assert.throws(() => target(url));
  assert.throws(() => normalizeMetricsInput({ link: igUrl, url: thUrl }));
  assert.throws(() => normalizeMetricsInput({ url: igUrl, platform: 'facebook' }));
});
test('counts must be exact and nonnegative; do not guess abbreviated or hidden counts', () => {
  assert.equal(exactPublicCount('1234'), 1234); assert.equal(exactPublicCount(0), 0);
  for (const value of [-1, '1.2K', '4M', true, null, '', '9007199254740993']) assert.equal(exactPublicCount(value), null);
});
test('Instagram binds counters to exact shortcode and never reads another suggested post', () => {
  const data = { data: { xdt_shortcode_media: { id: '99', shortcode: 'ABC123', media_type: 2,
    like_count: 0, comment_count: 12, video_view_count: 345, save_count: 7 },
  recommendations: [{ id: '88', shortcode: 'OTHER', media_type: 2, like_count: 9999 }] } };
  const r = extractSocialMetrics(target(igUrl), { html: jsonHtml(data) });
  assert.equal(r.metrics.likes, 0); assert.equal(r.metrics.reactions, 0); assert.equal(r.metrics.comment, 12);
  assert.equal(r.metrics.views, 345); assert.equal(r.metrics.saved, 7); assert.equal(r.metrics.shares, null);
  assert.equal(r.identityVerified, true); assert.equal(r.status, 'partial');
});
test('Threads keeps quotes, reshares and repost separate and returns additional native counters', () => {
  const post = { id: '99', code: 'XYZ123', like_count: 10,
    text_post_app_info: { direct_reply_count: 4, repost_count: 5, quote_count: 6, reshare_count: 7, forward_count: 8 } };
  const r = extractSocialMetrics(target(thUrl), { jsonResponses: [JSON.stringify({ data: { threads: [{ thread_items: [{ post }] }] } })] });
  assert.equal(r.metrics.comment, 4); assert.equal(r.metrics.repost, 5); assert.equal(r.metrics.quotes, 6);
  assert.equal(r.metrics.reshares, 7); assert.equal(r.extraMetrics['text_post_app_info.forward_count'], 8);
  assert.equal(r.metrics.saved, null);
});
test('public meta counters require the exact canonical post and never expand rounded values', () => {
  const html = `<link rel="canonical" href="${igUrl}"><meta property="og:description" content="1,234 likes, 56 comments - caption">`;
  const r = extractSocialMetrics(target(igUrl), { html });
  assert.equal(r.metrics.likes, 1234); assert.equal(r.metrics.comment, 56);
  assert.equal(extractSocialMetrics(target(igUrl), { html: html.replace('ABC123', 'OTHER') }).metrics.likes, null);
  assert.equal(extractSocialMetrics(target(igUrl), { html: html.replace('1,234 likes', '1.2K likes') }).metrics.likes, null);
});
test('conflicting response snapshots return null rather than silently picking an arbitrary count', () => {
  const a = { id: '99', code: 'XYZ123', like_count: 4 }, b = { ...a, like_count: 5 };
  const r = extractSocialMetrics(target(thUrl), { html: jsonHtml([a, b]) });
  assert.equal(r.metrics.likes, null); assert.equal(r.metricStatus.likes.status, 'conflicting');
});
test('YouTube parses exact video counts and comment/like labels; skips approximate labels', () => {
  const player = { videoDetails: { videoId: 'abcdefghijk', viewCount: '12345' } };
  const initial = { contents: [{ videoPrimaryInfoRenderer: { videoActions: { likeButton: { accessibilityText: '1,234 likes' } } } },
    { commentsEntryPointHeaderRenderer: { commentCount: { simpleText: '456' } } }] };
  const html = `<script>var ytInitialPlayerResponse = ${JSON.stringify(player)};</script><script>var ytInitialData = ${JSON.stringify(initial)};</script>`;
  const r = extractSocialMetrics(target(ytUrl), { html });
  assert.equal(r.metrics.views, 12345); assert.equal(r.metrics.likes, 1234); assert.equal(r.metrics.comment, 456);
  assert.equal(r.metrics.saved, null); assert.equal(r.metricStatus.saved.status, 'not_public');
  const rounded = extractSocialMetrics(target(ytUrl), { html: html.replace('1,234 likes', '1.2K likes') });
  assert.equal(rounded.metrics.likes, null);
  const mismatch = extractSocialMetrics(target(ytUrl), { html: html.replace('abcdefghijk', 'WRONGVIDEO1') });
  assert.equal(mismatch.metrics.views, null);
});
test('Facebook uses the real primary-post fixture and canonical Page ID association', async () => {
  const primary = JSON.parse(await fs.readFile(new URL('fixtures/facebook-share/public-original-details.json', import.meta.url)));
  const map = JSON.parse(await fs.readFile(new URL('fixtures/facebook-share/shopee-page-mapping.json', import.meta.url)));
  const html = jsonHtml({ require: [['RelayPrefetchedStreamCache', 'next', [], [primary.query, { __bbox: { result: primary.result } }]]] }) + jsonHtml(map);
  const r = extractSocialMetrics(target(fbUrl), { html });
  assert.equal(r.metrics.reactions, 544); assert.equal(r.metrics.likes, 305); assert.equal(r.metrics.shares, 494);
  assert.equal(r.metrics.comment, 506); assert.equal(r.extraMetrics['reaction.Love'], 215);
});
test('access and rate errors do not masquerade as zeros or live/dead conclusions', () => {
  assert.equal(extractSocialMetrics(target(igUrl), { httpStatus: 429 }).status, 'rate_limited');
  assert.equal(extractSocialMetrics(target(igUrl), { finalUrl: 'https://www.instagram.com/accounts/login/' }).status, 'auth_required');
  const r = metricsFailure(target(fbUrl), 'proxy_error', 'PROXY_REQUIRED');
  assert.ok(Object.values(r.metrics).every(x => x === null));
});
test('proxy URL/object credentials are split from the proxy-server argument, invalid proxies rejected', () => {
  const p = normalizeBrowserProxy('http://user:secret@127.0.0.1:8888');
  assert.equal(p.server, 'http://127.0.0.1:8888'); assert.equal(p.password, 'secret');
  assert.equal(normalizeBrowserProxy({ host: 'localhost', port: 8888, username: 'u', password: 'p' }).server, 'http://localhost:8888');
  for (const x of [null, 'http://localhost', 'file:///tmp/test', 'socks5://localhost:1234', 'http://localhost:1/path']) assert.throws(() => normalizeBrowserProxy(x));
});
test('reader fails closed before browser launch if no proxy is available', async () => {
  let launched = false;
  const read = createSocialMetricsReader({ executablePath: '/test/chrome', getProxy: async () => null,
    launch: async () => { launched = true; } });
  const r = await read(target(fbUrl)); assert.equal(launched, false); assert.equal(r.reason, 'PROXY_REQUIRED');
  assert.equal(r.transport.proxyUsed, false);
});
test('reader always launches dedicated incognito with proxy, protects origin auth, and closes browser', async () => {
  const client = new EventEmitter(), commands = []; client.send = async (name, value) => commands.push({ name, value });
  const page = new EventEmitter();
  Object.assign(page, { target: () => ({ createCDPSession: async () => client }), setViewport: async () => {}, setExtraHTTPHeaders: async () => {},
    goto: async () => {
      client.emit('Fetch.authRequired', { requestId: 'proxy', authChallenge: { source: 'Proxy' } });
      client.emit('Fetch.authRequired', { requestId: 'origin', authChallenge: { source: 'Server' } });
      return { status: () => 200 };
    }, content: async () => jsonHtml({ id: '99', code: 'XYZ123', like_count: 8 }), url: () => thUrl });
  let closed = false, args;
  const read = createSocialMetricsReader({ executablePath: '/test/chrome', settleMs: 0,
    getProxy: async () => ({ server: 'http://proxy.test:8888', username: 'user', password: 'secret' }),
    launch: async value => { args = value; return { createIncognitoBrowserContext: async () => ({ isIncognito: () => true, newPage: async () => page }), close: async () => { closed = true; } }; } });
  const r = await read(target(thUrl));
  assert.ok(args.args.includes('--proxy-server=http://proxy.test:8888')); assert.ok(!JSON.stringify(args).includes('secret'));
  assert.equal(args.headless, false); assert.equal(r.transport.incognito, true); assert.equal(r.metrics.likes, 8); assert.equal(closed, true);
  const origin = commands.find(x => x.name === 'Fetch.continueWithAuth' && x.value.requestId === 'origin');
  assert.deepEqual(origin.value.authChallengeResponse, { response: 'CancelAuth' });
  assert.ok(!JSON.stringify(r).includes('secret'));
});
test('browser cleanup also runs on upstream timeout; no direct retry occurs', async () => {
  let closeCount = 0, launches = 0;
  const read = createSocialMetricsReader({ executablePath: '/test/chrome', getProxy: async () => ({ server: 'http://proxy.test:8888' }),
    launch: async () => { launches++; return { createIncognitoBrowserContext: async () => { throw Object.assign(new Error('timeout secret'), { name: 'TimeoutError' }); }, close: async () => { closeCount++; } }; } });
  const r = await read(target(igUrl)); assert.equal(r.reason, 'BROWSER_TIMEOUT'); assert.equal(launches, 1); assert.equal(closeCount, 1);
  assert.ok(!JSON.stringify(r).includes('secret'));
});
test('HTTP contract echoes URLs and enforces input/content limits without launching a real browser', async t => {
  const app = express(); app.use(createSocialMetricsRouter({ read: async x => extractSocialMetrics(x) }));
  const server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(() => new Promise(resolve => server.close(resolve)));
  const endpoint = `http://127.0.0.1:${server.address().port}/api/social/post/metrics`;
  const r = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ link: igUrl, url: igUrl, type: 'snsTopic' }) });
  assert.equal(r.status, 200); const b = await r.json(); assert.equal(b.link, igUrl); assert.equal(b.url, igUrl); assert.equal(b.platform, 'instagram');
  const bad = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url: 'http://localhost/' }) });
  assert.equal(bad.status, 400);
});

test('named pools route by platform, reserve keys, reuse lease and release without leaking keys', async t => {
  const { createNamedProxyPoolProvider } = await import('../src/services/socialProxyPools.js');
  const dir = await fs.mkdtemp('/tmp/metrics-pool-test-'); t.after(() => fs.rm(dir, { recursive: true, force: true }));
  await fs.writeFile(`${dir}/keys`, 'fake-key-a\nfake-key-b\n');
  await fs.writeFile(`${dir}/config`, JSON.stringify({ pools: { detail: { keyFile: `${dir}/keys`, count: 2 } }, routing: { facebook: 'detail' } }));
  let calls = 0;
  const get = createNamedProxyPoolProvider(`${dir}/config`, { makeRotator: () => async () => { calls++; return { host: 'proxy.test', port: 8888 }; } });
  const a = await get({ platform: 'facebook' }), b = await get({ platform: 'facebook' });
  await assert.rejects(get({ platform: 'facebook' }), { code: 'PROXY_POOL_BUSY' });
  assert.equal(calls, 2); assert.ok(!JSON.stringify(a).includes('fake-key'));
  a.release(); a.release(); const c = await get({ platform: 'facebook' }); assert.equal(calls, 2);
  b.release(); c.release(); await assert.rejects(get({ platform: 'instagram' }), { code: 'PROXY_POOL_NOT_CONFIGURED' });
});
