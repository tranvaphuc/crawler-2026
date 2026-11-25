import fs from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';
import path from 'node:path';
import { facebookPostToEs5, facebookCommentToEs5, es5BulkNdjson } from '../src/services/facebookEs5.js';

const root = path.resolve(process.argv[2] || 'outputs/facebook-es5-contract-2026-10-23');
const samples = JSON.parse(await fs.readFile(path.join(root, 'es5-samples.json'), 'utf8'));
const mappings = JSON.parse(await fs.readFile(path.join(root, 'mappings.json'), 'utf8'));
const now = new Date().toISOString(), feed = [], comments = [], detail = [], inputs = [], warnings = [];
const sourceOf = (s, type) => ({ type, id: String(s.siteId), name: s.siteName });
const add = (list, result) => { list.push(result.document); warnings.push(...result.warnings.map(message => ({ id: result.document._id, message }))); };
for (const [kind, prefix] of [['page', 'fbPage'], ['user', 'fbUser'], ['group', 'fbGroup']]) {
  for (const h of samples[prefix + 'Topic'] || []) {
    const s = h._source, source = sourceOf(s, kind);
    const input = { _id: h._id.split('_').at(-1), content: s.content, title: s.title || '', description: s.description || '',
      author: s.author, authorId: s.authorId, publishedDate: s.publishedDate, like: s.likes,
      reactions: s.reactions, comment: s.comments, shares: s.shares, url: s.url };
    inputs.push({ flow: 'source', provenance: 'Normalized reconstruction from an actual ES5 document; not a new Facebook fetch',
      reference: { index: h._index, type: h._type, id: h._id }, source, input });
    add(feed, facebookPostToEs5(input, { source, now, flow: 'source' }));
  }
  for (const h of samples[prefix + 'Comment'] || []) {
    const s = h._source, source = sourceOf(s, kind), pid = s.parentId?.split('_').at(-1);
    if (!pid) continue;
    const input = { _id: h._id.split('_').at(-1), idPost: pid,
      parentId: s.commentParentId?.split('_').at(-1) || pid, author: s.author, authorId: s.authorId,
      content: s.content, time: s.publishedDate, like: s.likes, reactions: s.reactions, repliesCount: s.comments };
    const parentPost = { id: s.parentId, content: s.title, description: s.description,
      publishedDate: s.parentDate, url: kind === 'group' ? `https://www.facebook.com/groups/${source.id}/posts/${pid}/` :
        `https://www.facebook.com/${source.id}/posts/${pid}/` };
    inputs.push({ flow: 'comment', provenance: 'Normalized reconstruction from an actual ES5 comment', reference: { index: h._index, type: h._type, id: h._id }, source, parentPost, input });
    add(comments, facebookCommentToEs5(input, { source, parentPost, now }));
  }
}
const actualDetailPath = 'outputs/facebook-share-api-2026-10-22/post-details-1000419343151470_122138942931244237.json';
const actual = JSON.parse(await fs.readFile(actualDetailPath, 'utf8'));
const source = { type: 'page', id: actual.post.pageId, name: actual.post.author };
inputs.push({ flow: 'detail', provenance: 'Actual anonymous Facebook detail API response saved in previous live verification', file: actualDetailPath, source, input: actual });
add(detail, facebookPostToEs5(actual, { source, now, flow: 'detail' }));

// One actual saved reply, if present, demonstrates commentParentId without inventing IDs/content.
const replyFile = 'outputs/facebook-comments-september-2026-10-21/workers/00/comments.jsonl';
const reader = createInterface({ input: createReadStream(replyFile), crlfDelay: Infinity });
let reply, lines = 0;
for await (const line of reader) {
  const c = JSON.parse(line); if (c.kind === 'reply' && c.parentId !== c.idPost) { reply = c; break; }
  if (++lines > 10000) break;
}
reader.close(); reader.input.destroy();
if (reply) {
  const postsReader = createInterface({ input: createReadStream('outputs/facebook-groups-september-2026-10-21/posts.jsonl'), crlfDelay: Infinity });
  let parent;
  for await (const line of postsReader) { const p = JSON.parse(line); if (p.id === reply.idPost) { parent = p; break; } }
  postsReader.close(); postsReader.input.destroy();
  if (parent) {
    const source = { type: 'group', id: reply.siteId, name: reply.siteName };
    const parentPost = { id: `${source.id}_${reply.idPost}`, time: parent.time, url: parent.link, content: '' };
    const input = Object.fromEntries(['_id','idPost','parentId','authorId','author','content','time','like','repliesCount'].map(k => [k, reply[k]]));
    inputs.push({ flow: 'reply', provenance: 'Actual saved crawler reply and parent timestamp; parent text was not saved in this checkpoint', source, parentPost, input });
    add(comments, facebookCommentToEs5(input, { source, parentPost, now }));
  }
}
const groups = { 'source-feed': feed, 'post-detail': detail, 'comments': comments };
for (const [name, docs] of Object.entries(groups)) {
  await fs.writeFile(path.join(root, name + '.es5.json'), JSON.stringify(docs, null, 2));
  await fs.writeFile(path.join(root, name + '.bulk.ndjson'), es5BulkNdjson(docs));
}
const docs = [...feed, ...detail, ...comments];
await fs.writeFile(path.join(root, 'all-demo.bulk.ndjson'), es5BulkNdjson(docs));
await fs.writeFile(path.join(root, 'demo-inputs-and-provenance.json'), JSON.stringify(inputs, null, 2));
const fieldsByType = new Map();
for (const m of Object.values(mappings)) for (const [type, schema] of Object.entries(m.mappings)) fieldsByType.set(type, schema.properties);
const errors = [];
function validate(value, schema, prefix, docId) {
  for (const [key, v] of Object.entries(value)) {
    const field = prefix ? `${prefix}.${key}` : key, rule = schema?.[key];
    if (!rule) { errors.push({ docId, field, error: 'not in actual ES5 mapping' }); continue; }
    if (v === null) continue;
    const t = rule.type;
    if (['integer', 'long'].includes(t) && !Number.isSafeInteger(v)) errors.push({ docId, field, error: 'not an integer' });
    if (['keyword', 'text'].includes(t) && typeof v !== 'string') errors.push({ docId, field, error: 'not a string' });
    if (t === 'date' && (typeof v !== 'string' || !Number.isFinite(Date.parse(v)))) errors.push({ docId, field, error: 'invalid ISO date' });
    if (rule.properties) validate(v, rule.properties, field, docId);
  }
}
for (const d of docs) validate(d._source, fieldsByType.get(d._type), '', d._id);
const report = { createdAt: now, mode: 'LOCAL_OUTPUT_ONLY; no Elasticsearch writes', documentCount: docs.length,
  flowCounts: Object.fromEntries(Object.entries(groups).map(([k, v]) => [k, v.length])),
  types: [...new Set(docs.map(d => d._type))], errors, warnings,
  provenance: '12 actual ES5 reference hits; feed/comment examples are adapter replays of those hits; Shopee detail and optional group reply are actual saved crawler results.' };
await fs.writeFile(path.join(root, 'validation.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify({ documents: docs.length, flows: report.flowCounts, types: report.types, mappingErrors: errors.length }));
if (errors.length) process.exitCode = 1;
