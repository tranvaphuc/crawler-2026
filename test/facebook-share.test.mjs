import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import express from 'express';
import { once } from 'node:events';
import https from 'node:https';
import { EventEmitter } from 'node:events';
import { normalizeFacebookPostInput, analyzeFacebookPostPayload, analyzeFacebookPostHtml,
  checkFacebookPostShare, fetchAnonymousFacebookPost, getFacebookPostDetails,
  extractFacebookPostDetails } from '../src/services/facebookShare.js';
import { createFacebookShareRouter } from '../src/routes/facebookShare.js';

const fixture = JSON.parse(await readFile(new URL('fixtures/facebook-share/public-share.json', import.meta.url)));
const shopeeMapping = JSON.parse(await readFile(new URL('fixtures/facebook-share/shopee-page-mapping.json', import.meta.url)));
const mappingHtml = `<script type="application/json">${JSON.stringify(shopeeMapping)}</script>`;
const originalDetails = JSON.parse(await readFile(new URL('fixtures/facebook-share/public-original-details.json', import.meta.url)));
const sample = 'https://www.facebook.com/permalink.php?story_fbid=pfbid02s74gb4fpAZtZqDvFj77zdhdrRbSrCHLcbudYgUdhpHmff9XLoS7cgJLdaUp5gbmhl&id=61588342686925';
const request = normalizeFacebookPostInput(sample);
const compound = '61588342686925_122131613781278089';
const html = data => `<script type="application/json">${JSON.stringify({ require: [['RelayPrefetchedStreamCache', 'next', [], [data.query, { __bbox: { result: data.result } }]]] })}</script>`;
const clone = () => structuredClone(fixture);

test('anonymous observed share fixture resolves both IDs and the original post', () => {
  const result = analyzeFacebookPostHtml(html(fixture) + mappingHtml, request);
  assert.equal(result.isShare, true);
  assert.equal(result.post.id, compound);
  assert.equal(result.originalPost.id, '1000419343151470_122138942931244237');
  assert.equal(result.originalPost.pageId, '1000419343151470');
  assert.equal(result.originalPost.profileId, '61587327123544');
  assert.equal(result.originalPost.author, 'Shopee');
  assert.equal(result.originalPost.url, 'https://www.facebook.com/1000419343151470_122138942931244237');
  assert.match(result.originalPost.originalUrl,/ShopeeKH\.Official\/posts\/pfbid/);
});

test('share without a verified Page/personal mapping never advertises the Profile ID as canonical', () => {
  const r = analyzeFacebookPostHtml(html(fixture), request);
  assert.equal(r.isShare, true); assert.equal(r.originalPost.id, null);
  assert.equal(r.originalPost.profilePostId, '61587327123544_122138942931244237');
});

test('resolves the original Page ID from a second anonymous fetch of the matching original post', async () => {
  const original = clone(); const s = fixture.result.data.node_v2;
  original.result.data.node_v2 = { __typename: 'Story', ...structuredClone(s.attached_story),
    post_id: '122138942931244237', attached_story: null };
  const calls = [];
  const r = await checkFacebookPostShare(sample, { fetchPage: async url => {
    calls.push(url); return { status: 200, body: calls.length === 1 ? html(fixture) : html(original) + mappingHtml };
  } });
  assert.equal(calls.length, 2); assert.match(calls[1], /ShopeeKH\.Official\/posts\//);
  assert.equal(r.originalPost.id, '1000419343151470_122138942931244237');
  assert.equal(r.originalPost.profileId, '61587327123544');
});

test('an unrelated profile mapping cannot replace the original owner ID', () => {
  const wrong = `<script type="application/json">${JSON.stringify({ ...shopeeMapping, id: '111' })}</script>`;
  assert.equal(analyzeFacebookPostHtml(html(fixture) + wrong, request).originalPost.id, null);
});

test('both legacy PageID_PostID and ProfileID_PostID match a primary story with a verified mapping', () => {
  const f = clone(); const s = f.result.data.node_v2;
  f.result.data.node_v2 = { __typename: 'Story', ...structuredClone(s.attached_story), post_id: '122138942931244237', attached_story: null };
  for (const id of ['1000419343151470_122138942931244237', '61587327123544_122138942931244237']) {
    const r = analyzeFacebookPostHtml(html(f) + mappingHtml, normalizeFacebookPostInput(id));
    assert.equal(r.isShare, false); assert.equal(r.post.id, '1000419343151470_122138942931244237');
  }
});

test('same response matches owner_post input; keeps large IDs as strings', () => {
  assert.equal(analyzeFacebookPostPayload(fixture, normalizeFacebookPostInput(compound)).isShare, true);
  const n = normalizeFacebookPostInput('999999999999999999_888888888888888888');
  assert.equal(n.ownerId, '999999999999999999'); assert.equal(n.postId, '888888888888888888');
});

test('wrong owner or post cannot use a recommended/shared child story as the target', () => {
  for (const id of ['1_122131613781278089', '61588342686925_1', '61587327123544_122138942931244237']) {
    assert.equal(analyzeFacebookPostPayload(fixture, normalizeFacebookPostInput(id)).isShare, null);
  }
});

test('only primary SinglePost queries are eligible, never feed recommendations', () => {
  const other = clone(); other.query = 'ProfileCometTimelineFeedRefetchQuery';
  assert.equal(analyzeFacebookPostHtml(html(other), request).isShare, null);
});

test('explicit null share relation means false even if share_count is positive', () => {
  const f = clone(), s = f.result.data.node_v2;
  s.attached_story = null; s.comet_sections.content.story.attached_story = null;
  s.feedback = { share_count: { count: 891 } };
  assert.equal(analyzeFacebookPostPayload(f, request).isShare, false);
});

test('absence of share fields is unknown, not false', () => {
  const f = clone(), s = f.result.data.node_v2;
  delete s.attached_story; delete s.comet_sections.content.story.attached_story;
  assert.equal(analyzeFacebookPostPayload(f, request).reason, 'SHARE_FIELDS_NOT_AVAILABLE');
});

test('incomplete or self-referential attached story is not a confirmed share', () => {
  for (const ref of [{}, { post_id: '122131613781278089' }]) {
    const f = clone(), s = f.result.data.node_v2;
    s.attached_story = ref; s.comet_sections.content.story.attached_story = ref;
    assert.equal(analyzeFacebookPostPayload(f, request).isShare, null);
  }
});

test('conflicting primary fragments do not silently produce a boolean', () => {
  const f = clone(); f.result.data.node_v2.attached_story = null;
  f.result.data.node_v2.comet_sections.content.story.attached_story = null;
  assert.equal(analyzeFacebookPostHtml(html(fixture) + html(f), request).reason, 'CONFLICTING_PRIMARY_POST_DATA');
});

test('supported URL formats normalize to the same bounded Facebook endpoint', () => {
  assert.equal(normalizeFacebookPostInput('https://m.facebook.com/123_456?tracking=1').url, 'https://www.facebook.com/123_456');
  assert.equal(normalizeFacebookPostInput(sample + '&comment_id=1').url, sample);
  assert.equal(normalizeFacebookPostInput('https://www.facebook.com/groups/test/posts/123/').postId, '123');
  assert.equal(normalizeFacebookPostInput('https://www.facebook.com/ShopeeKH.Official/posts/pfbid123').token, 'pfbid123');
});

test('rejects SSRF inputs, credentials, non-post routes, unsupported ports and numeric JSON inputs', () => {
  for (const input of [null, 123, '', '123', 'https://example.com/1_2', 'https://facebook.com.evil.test/1_2',
    'https://user@facebook.com/1_2', 'https://facebook.com:8443/1_2', 'file:///etc/passwd',
    'https://www.facebook.com/login.php?next=http://127.0.0.1', 'https://www.facebook.com/some-profile',
    'https://www.facebook.com/permalink.php?story_fbid=123&id=hello']) {
    assert.throws(() => normalizeFacebookPostInput(input));
  }
});

test('upstream gates, unavailable posts and truncated data never become false', async () => {
  for (const [status, reason] of [[403, 'AUTH_OR_SECURITY_REQUIRED'], [401, 'AUTH_OR_SECURITY_REQUIRED'],
    [429, 'RATE_LIMITED'], [404, 'POST_UNAVAILABLE'], [410, 'POST_UNAVAILABLE'], [500, 'UPSTREAM_HTTP_ERROR']]) {
    const r = await checkFacebookPostShare(sample, { fetchPage: async () => ({ status, body: '', retryAfter: '60' }) });
    assert.equal(r.isShare, null); assert.equal(r.reason, reason);
    if (status === 429) assert.equal(r.retryAfter, '60');
  }
  const r = await checkFacebookPostShare(sample, { fetchPage: async () => ({ status: 200, body: '<html>Log in</html>' }) });
  assert.equal(r.isShare, null);
});

test('network errors return sanitized unknown; no raw errors or upstream auth content', async () => {
  const r = await checkFacebookPostShare(sample, { fetchPage: async () => { throw new Error('secret response body'); } });
  assert.equal(r.reason, 'UPSTREAM_NETWORK_ERROR'); assert.ok(!JSON.stringify(r).includes('secret'));
});

test('anonymous transport never sends auth and refuses external redirects before requesting them', async t => {
  let calls = 0;
  t.mock.method(https, 'get', (url, options, callback) => {
    calls++; assert.equal(options.headers.cookie, undefined); assert.equal(options.headers.authorization, undefined);
    const req = new EventEmitter(); req.destroy = () => {};
    queueMicrotask(() => callback({ statusCode: 302, headers: { location: 'https://127.0.0.1/private' }, resume() {} }));
    return req;
  });
  await assert.rejects(fetchAnonymousFacebookPost(request.url), { code: 'UNSAFE_REDIRECT' });
  assert.equal(calls, 1);
});

test('HTTP route accepts URL/id aliases, validates bodies and propagates unknown', async t => {
  const app = express();
  app.use(createFacebookShareRouter({ check: input => checkFacebookPostShare(input, { fetchPage: async () => ({ status: 200, body: html(fixture) }) }) }));
  app.post('/existing-board-route', express.json({ limit: '100kb' }), (req, res) => res.json({ length: req.body.text.length }));
  const server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(() => new Promise(resolve => server.close(resolve)));
  const url = `http://127.0.0.1:${server.address().port}/api/facebook/post/share`;
  for (const body of [{ url: sample }, { id: compound }, { input: compound }]) {
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    assert.equal(res.status, 200); assert.equal((await res.json()).isShare, true);
    assert.equal(res.headers.get('cache-control'), 'no-store');
  }
  for (const body of [{}, { id: 12 }, { url: sample, id: compound }, { input: 'https://example.com/' }]) {
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    assert.equal(res.status, 400);
  }
  const bad = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{oops' });
  assert.equal(bad.status, 400);
  const huge = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ input: 'x'.repeat(10000) }) });
  assert.equal(huge.status, 413);
  const other = await fetch(`http://127.0.0.1:${server.address().port}/existing-board-route`, { method: 'POST',
    headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: 'x'.repeat(10000) }) });
  assert.equal(other.status, 200); assert.equal((await other.json()).length, 10000);
});

test('ID-only public original response returns content, timestamp, counters and photo with canonical Page ID', async () => {
  const r = await getFacebookPostDetails('1000419343151470_122138942931244237', {
    fetchPage: async () => ({ status: 200, body: html(originalDetails) + mappingHtml }) });
  const s = originalDetails.result.data.node_v2;
  assert.equal(r.ok, true); assert.equal(r.isShare, false);
  assert.equal(r.post.id, '1000419343151470_122138942931244237');
  assert.equal(r.post.author, 'Shopee'); assert.match(r.post.content, /#ShopeeCambodia/);
  assert.equal(r.post.content, s.comet_sections.content.story.message.text);
  assert.equal(r.post.createdTime, 1790842163); assert.equal(r.post.createdAt, '2026-10-01T08:09:23.000Z');
  assert.equal(r.post.interactions.reactions, 544); assert.equal(r.post.interactions.likes, 305);
  assert.equal(r.post.interactions.comments, 506); assert.equal(r.post.interactions.shares, 494);
  assert.equal(r.post.media.length, 1); assert.equal(r.post.media[0].id, '122138942799244237');
  assert.equal(r.post.media[0].type, 'photo'); assert.match(r.post.media[0].imageUrl, /^https:\/\//);
  assert.deepEqual(r.post.unavailableFields, []);
});

test('missing counters stay null; never use attached-post/comment feedback or add reaction counts twice', () => {
  const s = { __typename: 'Story', attached_story: { feedback: { share_count: { count: 888 } } },
    feedback: {}, attachments: [] };
  const d = extractFacebookPostDetails(s);
  assert.equal(d.content, null); assert.equal(d.createdTime, null);
  assert.equal(d.interactions.shares, null); assert.equal(d.interactions.comments, null);
  assert.equal(d.interactions.likes, null); assert.ok(d.unavailableFields.includes('interactions.shares'));
});

test('details route uses ID-only input and does not fabricate a post on auth failure', async t => {
  const app = express();
  app.use(createFacebookShareRouter({ details: input => getFacebookPostDetails(input, {
    fetchPage: async () => ({ status: 200, body: html(originalDetails) + mappingHtml }) }) }));
  const server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(() => new Promise(resolve => server.close(resolve)));
  const res = await fetch(`http://127.0.0.1:${server.address().port}/api/facebook/post/details`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: '1000419343151470_122138942931244237' }) });
  const body = await res.json(); assert.equal(res.status, 200); assert.equal(body.post.interactions.comments, 506);
  const es5 = await fetch(`http://127.0.0.1:${server.address().port}/api/facebook/post/details`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: '1000419343151470_122138942931244237', format: 'es5' }) });
  const converted = await es5.json();
  assert.equal(converted.ok, true); assert.equal(converted.documents[0]._type, 'fbPageTopic');
  assert.equal(converted.documents[0]._id, '1000419343151470_122138942931244237');
  assert.equal(converted.documents[0]._source.likes, 305); assert.equal(converted.documents[0]._source.reactions, 544);
  assert.equal(converted.documents[0]._source.interactions, 1544);
  const blocked = await getFacebookPostDetails(compound, { fetchPage: async () => ({ status: 403 }) });
  assert.equal(blocked.ok, false); assert.equal(blocked.post, null);
});
