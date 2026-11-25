import { test } from 'node:test';
import assert from 'node:assert/strict';
import { facebookPostToEs5, facebookCommentToEs5, facebookPostsToEs5, es5BulkNdjson, es5FacebookIndex } from '../src/services/facebookEs5.js';
const source = type => ({ type, id: '123', name: 'Source' });
const now = '2026-10-23T00:00:00Z';
const post = { _id: '456', author: 'Author', authorId: '789', content: 'Line one\nLine two',
  created_time: 1790842163, like: 3, reactions: 9, comment: 5, shares: 2 };

test('matches six actual ES5 types; group source ID never becomes post author ID', () => {
  for (const [type, expected] of [['page', 'fbPageTopic'], ['user', 'fbUserTopic'], ['group', 'fbGroupTopic']]) {
    const r = facebookPostToEs5(post, { source: source(type), now });
    assert.equal(r.document._type, expected); assert.equal(r.document._id, '123_456');
    assert.equal(r.document._source.authorId, '789'); assert.equal(r.document._source.siteId, '123');
    assert.equal(r.document._source.interactions, 16); assert.equal(r.document._source.likes, 3);
    assert.equal(r.document._source.reactions, 9); assert.equal(r.document._source.content, post.content);
    assert.equal(r.document._source.insertedDate, '2026-10-23T00:00:00.000Z');
  }
});
test('ISO week uses Vietnamese calendar date and ISO week-year', () => {
  assert.equal(es5FacebookIndex('2026-10-18T17:30:00Z'), 'master202643');
  assert.equal(es5FacebookIndex('2021-01-01T00:00:00Z'), 'master202053');
});
test('rejects missing publication date, rather than manufacturing a date/index', () => {
  const r = facebookPostsToEs5([{ ...post, created_time: null }], { source: source('page'), now });
  assert.equal(r.documents.length, 0); assert.equal(r.rejected.length, 1);
});
test('null counters do not become zeros or sum Like and total reactions twice', () => {
  const r = facebookPostToEs5({ ...post, reactions: null }, { source: source('page'), now });
  assert.equal(r.document._source.reactions, null); assert.equal(r.document._source.interactions, null);
  assert.ok(!Object.hasOwn(r.document._source, 'care'));
});
test('comments/replies always link parentId to root post; reply parent stays separate', () => {
  for (const type of ['page', 'user', 'group']) {
    const options = { source: source(type), now, parentPost: { id: '123_456', publishedDate: '2026-09-30T00:00:00Z', content: 'Parent' } };
    const comment = { _id: '777', authorId:'42', idPost: '456', parentId: '456', time: '2026-10-19T01:00:00Z', content: 'Comment', like: 2, repliesCount: 1 };
    const root = facebookCommentToEs5(comment, options).document;
    assert.equal(root._id, '456_777'); assert.equal(root._type, { page: 'fbPageComment', user: 'fbUserComment', group: 'fbGroupComment' }[type]);
    assert.equal(root._source.parentId, '123_456'); assert.equal(root._source.commentParentId, null);
    const reply = facebookCommentToEs5({ ...comment, _id: '888', parentId: '777' }, options).document;
    assert.equal(reply._source.parentId, '123_456'); assert.equal(reply._source.commentParentId, '456_777');
    assert.match(reply._source.url, /comment_id=777&reply_comment_id=888/);
    assert.equal(reply._index, 'master202643');
  }
});
test('ES5 bulk metadata stays outside _source; create is default and final newline exists', () => {
  const d = facebookPostToEs5(post, { source: source('page'), now }).document;
  const text = es5BulkNdjson([d]), lines = text.trim().split('\n').map(JSON.parse);
  assert.deepEqual(lines[0], { create: { _index: d._index, _type: d._type, _id: d._id } });
  assert.ok(!Object.hasOwn(lines[1], '_index')); assert.ok(text.endsWith('\n'));
});
test('wrong verified Page ID and comment parent are rejected', () => {
  assert.throws(() => facebookPostToEs5({ ...post, pageId: '999' }, { source: source('page') }));
  assert.throws(() => facebookCommentToEs5({ _id: '1', idPost: '999', time: now }, {
    source: source('group'), parentPost: { id: '123_456', publishedDate: now } }));
});
