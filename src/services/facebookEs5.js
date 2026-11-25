// Offline serializers only. This module never connects to or writes Elasticsearch.
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc.js';
import timezone from 'dayjs/plugin/timezone.js';
import isoWeek from 'dayjs/plugin/isoWeek.js';
dayjs.extend(utc); dayjs.extend(timezone); dayjs.extend(isoWeek);

const TYPES = { page: ['fbPageTopic', 'fbPageComment'], user: ['fbUserTopic', 'fbUserComment'], group: ['fbGroupTopic', 'fbGroupComment'] };
const REACTIONS = { '1635855486666999': 'likes', '1678524932434102': 'love', '115940658764963': 'haha',
  '478547315650144': 'wow', '908563459236466': 'sad', '444813342392137': 'angry' };
export class FacebookEs5Error extends Error {}
const fail = message => { throw new FacebookEs5Error(message); };
const id = value => typeof value === 'string' && /^\d+$/.test(value) ? value : fail('Numeric IDs must be strings');
const counter = value => {
  if (typeof value === 'string' && /^\d+$/.test(value)) value = Number(value);
  return Number.isSafeInteger(value) && value >= 0 && value <= 2147483647 ? value : null;
};
function date(value) {
  if (value == null || value === '') return null;
  const d = typeof value === 'number' ? new Date(value < 1e12 ? value * 1000 : value) :
    typeof value === 'string' && /^\d{4}-\d\d-\d\dT/.test(value) ? new Date(value) : null;
  return d && Number.isFinite(d.getTime()) ? d.toISOString() : null;
}
export function es5FacebookIndex(publishedDate, zone = 'Asia/Ho_Chi_Minh') {
  const iso = date(publishedDate); if (!iso) fail('publishedDate is required; never use crawl time as publication time');
  const d = dayjs(iso).tz(zone);
  return `master${d.isoWeekYear()}${String(d.isoWeek()).padStart(2, '0')}`;
}
function sourceContext(source) {
  if (!source || !TYPES[source.type]) fail('source.type must be page, user or group');
  return { ...source, id: id(source.id), name: typeof source.name === 'string' ? source.name : '' };
}
function common(record, context, flow) {
  const publishedDate = date(record.createdAt ?? record.publishedDate ?? record.created_time ?? record.time);
  if (!publishedDate) fail('publishedDate is missing or invalid');
  const insertedDate = date(context.now || new Date().toISOString());
  if (!insertedDate) fail('Invalid insertedDate');
  return { siteId: context.source.id, siteName: context.source.name, insertedDate, publishedDate,
    author: typeof record.author === 'string' ? record.author : '',
    authorId: record.authorId == null ? null : String(record.authorId),
    title: record.title || '', description: record.description || '', content: record.content ?? '',
    delayCrawler: null, delayMongo: null, delayEs: null,
    ds: { source: context.collector || `crawler-2026-facebook-${flow}` } };
}
function postId(record) {
  const value = record.postId ?? record._id ?? record.id;
  if (typeof value !== 'string') fail('Post ID must be a string');
  return id(value.includes('_') ? value.split('_').at(-1) : value);
}
function statistics(record) {
  const m = record.interactions && typeof record.interactions === 'object' ? record.interactions : {};
  const likes = counter(m.likes ?? record.like ?? record.likes), reactions = counter(m.reactions ?? record.reactions);
  const comments = counter(m.comments ?? record.comment ?? record.comments), shares = counter(m.shares ?? record.shares);
  const result = { likes, reactions, comments, shares,
    interactions: [reactions, comments, shares].every(n => n !== null) ? counter(reactions + comments + shares) : null };
  for (const r of m.reactionBreakdown || record.reactionBreakdown || []) {
    if (REACTIONS[r.id]) result[REACTIONS[r.id]] = counter(r.count);
  }
  // Care is not in the inspected ES5 template. Do not silently introduce a dynamic field.
  return result;
}
export function facebookPostToEs5(record, options) {
  const source = sourceContext(options?.source), context = { ...options, source };
  const post = record?.post || record; if (!post || record.ok === false) fail('No successfully fetched post to serialize');
  const pid = postId(post);
  if (source.type === 'page' && post.pageId && post.pageId !== source.id) fail('source Page ID does not match verified pageId');
  const doc = common(post, context, options.flow || 'source');
  const authorId = post.ownerIdType === 'page' ? post.pageId : post.ownerIdType === 'user' ? post.ownerId : post.authorId;
  if (authorId && source.type !== 'group') doc.authorId = String(authorId);
  Object.assign(doc, statistics(post));
  doc.url = post.url || (source.type === 'group' ? `https://www.facebook.com/groups/${source.id}/posts/${pid}/` : `https://www.facebook.com/${source.id}/posts/${pid}/`);
  doc.link = post.attachments?.find(a => a.url)?.url || post.link || null;
  doc.picture = post.media?.find(m => m.imageUrl)?.imageUrl || post.picture || null;
  const meta = { _index: es5FacebookIndex(doc.publishedDate, options.timeZone), _type: TYPES[source.type][0], _id: `${source.id}_${pid}`, _source: doc };
  const warnings = [];
  if (doc.reactions === null) warnings.push('TOTAL_REACTIONS_UNAVAILABLE; interactions stays null');
  if (post.ownerIdType === 'unverified_profile' && source.type === 'page') warnings.push('PAGE_ID_SUPPLIED_BY_SOURCE_CONTEXT; profile ID was not substituted');
  if ((post.interactions?.reactionBreakdown || post.reactionBreakdown || []).some(r => !REACTIONS[r.id])) warnings.push('REACTION_BREAKDOWN_HAS_UNMAPPED_TYPES; retained in raw output only');
  return { document: meta, warnings };
}
export function facebookCommentToEs5(comment, options) {
  const source = sourceContext(options?.source), context = { ...options, source };
  const parent = options.parentPost;
  if (!parent || !/^\d+_\d+$/.test(parent.id || '')) fail('parentPost.id must be the canonical sourceId_postId');
  const [owner, pid] = parent.id.split('_'); if (owner !== source.id) fail('Parent post does not belong to source');
  if (comment.idPost != null && String(comment.idPost) !== pid) fail('Comment idPost does not match parent post');
  const rawId = comment._id ?? comment.id;
  const cid = typeof rawId === 'string' && rawId.includes('_') ? rawId.split('_').at(-1) : rawId;
  id(cid);
  const parentDate = date(parent.publishedDate ?? parent.createdAt ?? parent.created_time ?? parent.time);
  if (!parentDate) fail('parentPost.publishedDate is required');
  if(!/^\d+$/.test(String(comment.authorId??'')))fail('Facebook comment authorId requires a verified numeric Facebook ID');
  const doc = common(comment, context, 'comment');
  const replyTo = comment.parentId == null ? pid : String(comment.parentId).split('_').at(-1);
  id(replyTo);
  Object.assign(doc, { title: parent.content || '', description: parent.description || '', parentId: parent.id, parentDate,
    commentParentId: replyTo === pid ? null : `${pid}_${replyTo}`,
    likes: counter(comment.like ?? comment.likes), reactions: counter(comment.reactions), comments: counter(comment.repliesCount ?? comment.comments),
    shares: null, interactions: null });
  const url = new URL(parent.url || `https://www.facebook.com/${parent.id}`);
  url.searchParams.set('comment_id', replyTo === pid ? cid : replyTo);
  if (replyTo !== pid) url.searchParams.set('reply_comment_id', cid);
  doc.url = url.href;
  return { document: { _index: es5FacebookIndex(doc.publishedDate, options.timeZone), _type: TYPES[source.type][1], _id: `${pid}_${cid}`, _source: doc }, warnings: [] };
}
function batch(rows, mapper, options) {
  const documents = [], rejected = [], warnings = [];
  for (const [i, row] of rows.entries()) {
    try { const r = mapper(row, options); documents.push(r.document); for (const message of r.warnings) warnings.push({ item: i, message }); }
    catch (error) { if (!(error instanceof FacebookEs5Error)) throw error; rejected.push({ item: i, reason: error.message }); }
  }
  const dedup = new Map(); for (const d of documents) dedup.set(`${d._index}/${d._type}/${d._id}`, d);
  return { ok: rejected.length === 0, format: 'es5', documents: [...dedup.values()], rejected, warnings };
}
export const facebookPostsToEs5 = (rows, options) => batch(rows, facebookPostToEs5, options);
export const facebookCommentsToEs5 = (rows, options) => batch(rows, facebookCommentToEs5, options);
export function es5BulkNdjson(documents, operation = 'create') {
  if (!['create', 'index'].includes(operation)) fail('Bulk operation must be create or index');
  return documents.map(({ _index, _type, _id, _source }) => JSON.stringify({ [operation]: { _index, _type, _id } }) + '\n' + JSON.stringify(_source) + '\n').join('');
}
