import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createFacebookCommentFetcher, normalizeComment, encodeCommentCursor, DEFAULT_COMMENT_INTENT } from '../scripts/facebook_comments.js';

const feedbackId = text => Buffer.from(`feedback:${text}`).toString('base64');
test('returned feedback aliases do not override the requested post or comment pagination context',async t=>{
 const harPath=await source(t);
 for(const replies of [false,true])for(const returnedId of ['pfbid02uwYAaARD1LZoP7G3okBSS6W6N8ueDriVSqFxPi21WjrFkmDw9VMM7e7Cc6WC1oyEl','999']){
  const idPost='40119662160958215',idGetComment=replies?'200':idPost;
  const fetch=createFacebookCommentFetcher({harPath,request:async form=>{
   assert.equal(JSON.parse(form.variables).id,feedbackId(replies?idPost+'_'+idGetComment:idPost));
   const r=response(['300'],{replies}),body=JSON.parse(r.text);body.data.node.id=feedbackId(returnedId);return{...r,text:JSON.stringify(body)};
  }});
  const result=await fetch({idPost,idGetComment,sourceType:'group'});
  assert.equal(result.comments[0]._id,'300');assert.equal(result.comments[0].parentId,idGetComment);assert.ok(result.comments[0].url.startsWith('https://www.facebook.com/'+idPost));assert.equal(result.hasNextPage,true);
  const cursor=JSON.parse(Buffer.from(result.cursor.slice('fbcomments.v1.'.length),'base64url'));assert.equal(cursor.idPost,idPost);assert.equal(cursor.idGetComment,idGetComment);
 }
});
const comment = id => ({ legacy_fbid: id, id: Buffer.from(`comment:100_${id}`).toString('base64'),
  body: { text: 'Comment text' }, author: { id: '77', name: 'Author' }, created_time: 1792489572,
  feedback: { top_reactions: { edges: [{ node: { id: '1635855486666999' }, reaction_count: 5 }] },
    replies_fields: { total_count: 8 }, expansion_info: { expansion_token: 'reply-expansion-token' } } });

async function source(t) {
  const dir = await mkdtemp(join(tmpdir(), 'fb-comments-test-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const file = join(dir, 'source.har');
  await writeFile(file, JSON.stringify({ log: { entries: [{ request: {
    url: 'https://www.facebook.com/api/graphql/',
    headers: [{ name: 'cookie', value: 'must-not-replay' }],
    postData: { text: new URLSearchParams({ lsd: 'fixture', variables: '{}', __user:'123', av:'123', fb_dtsg:'must-remove', access_token:'must-remove' }).toString() },
  } }] } }));
  return file;
}

function response(ids, { replies = false, next = 'next', previous = false, errors = [], intent = DEFAULT_COMMENT_INTENT } = {}) {
  const connection = { edges: ids.map(id => ({ node: comment(id), cursor: `edge-${id}` })),
    page_info: { end_cursor: next, start_cursor: 'previous', has_next_page: next !== null, has_previous_page: previous } };
  const node = replies ? { id: feedbackId('100_200'), replies_connection: connection } :
    { id: feedbackId('100'), comment_rendering_instance_for_feed_location: {
      selected_intent: { intent_token: intent }, comments: connection,
    } };
  return { status: 200, text: JSON.stringify({ data: { node }, errors }) };
}

test('normalizes comment fields and distinguishes missing exact Like from zero', () => {
  const item = normalizeComment(comment('200'), { idPost: '100', idGetComment: '100' });
  assert.equal(item._id, '200'); assert.equal(item.parentId, '100');
  assert.equal(item.authorId, '77'); assert.equal(item.like, 5); assert.equal(item.repliesCount, 8);
  assert.equal(item.url, 'https://www.facebook.com/100?comment_id=200');
  assert.equal(normalizeComment({ legacy_fbid: '1' }, { idPost: '100', idGetComment: '100' }).like, null);
});

test('unfiltered intent is requested, checked, and both pagination directions are retained', async t => {
  const token='CHRONOLOGICAL_UNFILTERED_INTENT_V1';
  const fetch=createFacebookCommentFetcher({harPath:await source(t),commentsIntentToken:token,requireIntentMatch:true,
    request:async form=>{assert.equal(JSON.parse(form.variables).commentsIntentToken,token);return response(['200'],{previous:true,intent:token});}});
  const r=await fetch({idPost:'100'});
  assert.equal(r.commentsIntentToken,token); assert.ok(r.cursor); assert.ok(r.alternateCursor);
});

test('strict mode rejects a server fallback to most relevant', async t => {
  const fetch=createFacebookCommentFetcher({harPath:await source(t),commentsIntentToken:'CHRONOLOGICAL_UNFILTERED_INTENT_V1',requireIntentMatch:true,request:async()=>response(['200'],{intent:'TOP'})});
  await assert.rejects(fetch({idPost:'100'}),e=>e.code==='COMMENT_SORT_UNAVAILABLE');
});

test('continuation retains the verified intent when pagination query does not return selected_intent', async t => {
 const token='CHRONOLOGICAL_UNFILTERED_INTENT_V1';let calls=0;
 const fetch=createFacebookCommentFetcher({harPath:await source(t),commentsIntentToken:token,requireIntentMatch:true,request:async form=>{
   assert.equal(JSON.parse(form.variables).commentsIntentToken,token);
   if(++calls===1)return response(['200'],{intent:token});
   const r=response(['201'],{next:null});const root=JSON.parse(r.text);
   delete root.data.node.comment_rendering_instance_for_feed_location.selected_intent;
   return {...r,text:JSON.stringify(root)};
 }});
 const first=await fetch({idPost:'100'});const second=await fetch({idPost:'100',cursor:first.cursor});
 assert.equal(second.commentsIntentToken,token);assert.equal(second.comments[0]._id,'201');
});

test('initial comments use root query; next page carries cursor and selected intent', async t => {
  const harPath = await source(t), calls = [];
  const fetch = createFacebookCommentFetcher({ harPath, request: async (form, headers) => {
    assert.equal(headers.cookie, undefined);
    assert.equal(form.__user, '0'); assert.equal(form.av, '0');
    assert.equal(form.fb_dtsg, undefined); assert.equal(form.access_token, undefined);
    const variables = JSON.parse(form.variables); calls.push({ name: form.fb_api_req_friendly_name, variables });
    return calls.length === 1 ? response(['200', '201']) : response(['202'], { next: null });
  } });
  const first = await fetch({ idPost: '100', idGetComment: '100', cursor: null });
  const next = await fetch({ idPost: '100', idGetComment: '100', cursor: first.cursor });
  assert.equal(calls[0].name, 'CommentListComponentsRootQuery');
  assert.equal(calls[1].name, 'CommentsListComponentsPaginationQuery');
  assert.equal(calls[1].variables.commentsAfterCursor, 'next');
  assert.equal(calls[1].variables.commentsIntentToken, DEFAULT_COMMENT_INTENT);
  assert.equal(next.comments[0]._id, '202'); assert.equal(next.hasNextPage, false); assert.equal(next.cursor, null);
});

test('unrelated group field error does not invalidate a confirmed empty comment connection', async t => {
  const fetch=createFacebookCommentFetcher({harPath:await source(t),request:async()=>response([],{
    next:null, errors:[{message:'A server error field_exception occured.',path:['node','associated_group','feature_intervention']}],
  })});
  const result=await fetch({idPost:'100'});
  assert.equal(result.status,'EMPTY'); assert.equal(result.warnings.length,1);
});

test('replies use post+parent feedback ID, never the post feedback ID', async t => {
  const harPath = await source(t);
  const fetch = createFacebookCommentFetcher({ harPath, request: async form => {
    const variables = JSON.parse(form.variables);
    assert.equal(form.fb_api_req_friendly_name, 'Depth1CommentsListPaginationQuery');
    assert.equal(variables.id, feedbackId('100_200'));
    assert.equal(variables.repliesAfterCursor, null);
    return response(['300'], { replies: true, next: null });
  } });
  const result = await fetch({ idPost: '100', idGetComment: '200' });
  assert.equal(result.mode, 'replies'); assert.equal(result.comments[0].parentId, '200');
});

test('replyCursor carries expansion context without relying on shared memory', async t => {
  const harPath = await source(t);
  let calls = 0;
  const fetch = createFacebookCommentFetcher({ harPath, request: async form => {
    if (++calls === 1) return response(['200']);
    const variables = JSON.parse(form.variables);
    assert.equal(variables.expansionToken, 'reply-expansion-token');
    return response(['300'], { replies: true, next: null });
  } });
  const first = await fetch({ idPost: '100', idGetComment: '100' });
  const replies = await fetch({ idPost: '100', idGetComment: '200', cursor: first.comments[0].replyCursor });
  assert.equal(replies.comments[0]._id, '300');
});

test('does not reuse cursor across a different post or comment', async t => {
  const fetch = createFacebookCommentFetcher({ harPath: await source(t), request: async () => { throw new Error('must not call'); } });
  const cursor = encodeCommentCursor({ idPost: '100', idGetComment: '100', direction: 'after', after: 'next', feedLocation: 'POST_PERMALINK_DIALOG' });
  await assert.rejects(fetch({ idPost: '101', idGetComment: '101', cursor }), e => e.code === 'INVALID_CURSOR');
  await assert.rejects(fetch({ idPost: '100', idGetComment: '200', cursor }), e => e.code === 'INVALID_CURSOR');
});

test('preserves backward paging direction when connection requires it', async t => {
  let calls = 0;
  const fetch = createFacebookCommentFetcher({ harPath: await source(t), request: async form => {
    if (++calls === 1) return response(['200'], { next: null, previous: true });
    const v = JSON.parse(form.variables); assert.equal(v.commentsBeforeCursor, 'previous');
    assert.equal(v.commentsAfterCount, null);
    return response(['201'], { next: 'ignored-forward-cursor', previous: false });
  } });
  const first = await fetch({ idPost: '100', idGetComment: '100' });
  const last = await fetch({ idPost: '100', idGetComment: '100', cursor: first.cursor });
  assert.equal(last.cursor, null);
});

test('empty success is only returned for a valid empty connection', async t => {
  const harPath = await source(t);
  const fetch = createFacebookCommentFetcher({ harPath, request: async () => response([], { next: null }) });
  assert.equal((await fetch({ idPost: '100', idGetComment: '100' })).status, 'EMPTY');
  const denied = createFacebookCommentFetcher({ harPath, request: async () => ({ status: 200, text: '{"data":{"node":null}}' }) });
  await assert.rejects(denied({ idPost: '100', idGetComment: '100' }), e => e.code === 'COMMENTS_UNAVAILABLE');
});

test('rate limit, login and proxy errors keep retry policy and original cursor', async t => {
  const harPath = await source(t);
  for (const [message, code] of [['Rate limit exceeded', 'FACEBOOK_RATE_LIMITED'], ['Login required', 'AUTH_REQUIRED']]) {
    const fetch = createFacebookCommentFetcher({ harPath, request: async () => ({ status: 200,
      text: JSON.stringify({ errors: [{ message }] }) }) });
    await assert.rejects(fetch({ idPost: '100', idGetComment: '100' }), e => {
      assert.equal(e.code, code); assert.equal(e.retryWithDifferentProxy, false);
      assert.deepEqual(e.partialResult, { comments: [], cursor: null }); return true;
    });
  }
  const fetch = createFacebookCommentFetcher({ harPath, request: async () => {
    throw Object.assign(new Error('refused'), { stage: 'proxy_connect', code: 'ECONNREFUSED' });
  } });
  await assert.rejects(fetch({ idPost: '100', idGetComment: '100', proxy: 'http://localhost:8080' }),
    e => e.code === 'PROXY_CONNECT_FAILED' && e.retryWithDifferentProxy);
});

test('malformed nodes or pagination are errors rather than a fake empty result', async t => {
  const harPath = await source(t);
  const fetch = createFacebookCommentFetcher({ harPath, request: async () => {
    const r = response(['200']); const parsed = JSON.parse(r.text);
    delete parsed.data.node.comment_rendering_instance_for_feed_location.comments.page_info;
    return { ...r, text: JSON.stringify(parsed) };
  } });
  await assert.rejects(fetch({ idPost: '100', idGetComment: '100' }), e => e.code === 'PAGINATION_ERROR');
});

test('empty replies without expansion context cannot be called confirmed empty', async t => {
  const fetch = createFacebookCommentFetcher({ harPath: await source(t),
    request: async () => response([], { replies: true, next: null }) });
  await assert.rejects(fetch({ idPost: '100', idGetComment: '200' }),
    e => e.code === 'REPLY_CONTEXT_REQUIRED');
  const cursor = encodeCommentCursor({ idPost: '100', idGetComment: '200',
    after: null, bootstrap: true, direction: 'after', feedLocation: 'POST_PERMALINK_DIALOG',
    commentsIntentToken: null, clientKey: null, expansionToken: 'parent-token' });
  const confirmed = await fetch({ idPost: '100', idGetComment: '200', cursor });
  assert.equal(confirmed.hasNextPage, false);
  assert.deepEqual(confirmed.comments, []);
});


test('native All comments intent and observed Relay flags are used without copying unrelated variables', async t => {
 const harPath=await source(t);const fs=await import('node:fs/promises');const har=JSON.parse(await fs.readFile(harPath));
 const f=Object.fromEntries(new URLSearchParams(har.log.entries[0].request.postData.text));
 f.variables=JSON.stringify({__relay_internal__pv__CometUFICommentAutoTranslationTyperelayprovider:'AUTO_TRANSLATE',id:'wrong-target',arbitraryActor:'123'});
 har.log.entries[0].request.postData.text=new URLSearchParams(f).toString();await fs.writeFile(harPath,JSON.stringify(har));
 const fetch=createFacebookCommentFetcher({harPath,request:async form=>{const v=JSON.parse(form.variables);assert.equal(v.commentsIntentToken,'RANKED_UNFILTERED_CHRONOLOGICAL_REPLIES_INTENT_V1');assert.equal(v.__relay_internal__pv__CometUFICommentAutoTranslationTyperelayprovider,'AUTO_TRANSLATE');assert.equal(v.id,feedbackId('100'));assert.equal(v.arbitraryActor,undefined);return response(['200'],{next:null});}});
 const r=await fetch({idPost:'100'});assert.equal(r.ordering.unfilteredVerified,true);assert.equal(r.comments.length,1);
});


test('native pagination uses observed -1 count and first reply expansion has null count', async t=>{
 const harPath=await source(t),seen=[];const fetch=createFacebookCommentFetcher({harPath,pageSize:100,request:async form=>{const v=JSON.parse(form.variables);seen.push(v);return form.fb_api_req_friendly_name==='Depth1CommentsListPaginationQuery'?response(['300'],{replies:true,next:null}):response(['200'],{next:seen.length===1?'next':null});}});
 const first=await fetch({idPost:'100'});await fetch({idPost:'100',cursor:first.cursor});assert.equal(seen[1].commentsAfterCount,-1);
 await fetch({idPost:'100',idGetComment:'200',cursor:first.comments[0].replyCursor});assert.equal(seen[2].repliesAfterCount,null);assert.equal(seen[2].repliesAfterCursor,null);
});
test('upstream rate errors retain HTTP status, GraphQL code and query for diagnosis',async t=>{
 const fetch=createFacebookCommentFetcher({harPath:await source(t),request:async()=>({status:200,text:JSON.stringify({errors:[{code:1675004,message:'Rate limit exceeded'}]})})});
 await assert.rejects(()=>fetch({idPost:'100'}),e=>e.code==='FACEBOOK_RATE_LIMITED'&&e.httpStatus===200&&e.sourceCode===1675004&&e.stage==='CommentListComponentsRootQuery');
});
test('first reply expansion retains both pagination directions',async t=>{
 const fetch=createFacebookCommentFetcher({harPath:await source(t),request:async()=>response(['300'],{replies:true,previous:true})});
 const r=await fetch({idPost:'100',idGetComment:'200',cursor:encodeCommentCursor({idPost:'100',idGetComment:'200',after:null,bootstrap:true,direction:'after',commentsIntentToken:DEFAULT_COMMENT_INTENT,clientKey:null,expansionToken:'fixture',feedLocation:'GROUP_PERMALINK'})});
 assert.ok(r.cursor);assert.ok(r.alternateCursor);
});
test('bootstrap reply cursor follows older-only pages rather than declaring the thread exhausted',async t=>{
 let calls=0;const variables=[];const fetch=createFacebookCommentFetcher({harPath:await source(t),request:async form=>{variables.push(JSON.parse(form.variables));return ++calls===1?response(['300'],{replies:true,next:null,previous:true}):response(['299'],{replies:true,next:null});}});
 const initial=encodeCommentCursor({idPost:'100',idGetComment:'200',after:null,bootstrap:true,direction:'after',commentsIntentToken:DEFAULT_COMMENT_INTENT,clientKey:null,expansionToken:'fixture',feedLocation:'GROUP_PERMALINK'});
 const a=await fetch({idPost:'100',idGetComment:'200',cursor:initial});assert.equal(a.hasNextPage,true);assert.ok(a.cursor);const b=await fetch({idPost:'100',idGetComment:'200',cursor:a.cursor});assert.equal(variables[1].repliesBeforeCursor,'previous');assert.equal(variables[1].repliesAfterCursor,null);assert.equal(b.hasNextPage,false);
});
test('non-comment field errors stay visible but cannot permanently prevent a complete comment traversal',async t=>{
 const fetch=createFacebookCommentFetcher({harPath:await source(t),request:async()=>response(['200'],{next:null,errors:[{message:'field error',path:['node','associated_group','feature_intervention']}]})});const r=await fetch({idPost:'100'});assert.equal(r.warnings[0].coverageAffected,false);
});
test('nested associated-group renderer errors do not invalidate otherwise complete comment data, while comment body errors remain relevant',async t=>{
 for(const [path,affected]of [[['node','comment_rendering_instance_for_feed_location','comments','edges',0,'node','feedback','associated_group','feature_intervention'],false],[['node','comment_rendering_instance_for_feed_location','comments','edges',0,'node','body'],true]]){
  const fetch=createFacebookCommentFetcher({harPath:await source(t),request:async()=>response(['200'],{next:null,errors:[{message:'field error',path}]})});const r=await fetch({idPost:'100'});assert.equal(r.warnings[0].coverageAffected,affected);
 }
});

test('group reply cursors retain native opaque feedback IDs and work without expansion tokens',async t=>{
 const calls=[],native=feedbackId('pfbidNativeParent');
 const fetch=createFacebookCommentFetcher({harPath:await source(t),request:async form=>{
  const variables=JSON.parse(form.variables);calls.push(variables);
  if(calls.length===1){const r=response(['200'],{next:null}),body=JSON.parse(r.text);body.data.node.comment_rendering_instance_for_feed_location.comments.edges[0].node.feedback={id:native,replies_fields:{total_count:1}};return{...r,text:JSON.stringify(body)};}
  assert.equal(variables.id,native);assert.equal(variables.feedLocation,'GROUP_PERMALINK');return response(['300'],{replies:true,next:null});
 }});
 const root=await fetch({idPost:'100',sourceType:'group'});
 assert.ok(root.comments[0].replyCursor);
 const r=await fetch({idPost:'100',idGetComment:'200',sourceType:'group',cursor:root.comments[0].replyCursor});assert.equal(r.comments[0].parentId,'200');
 await assert.rejects(fetch({idPost:'101',idGetComment:'200',cursor:root.comments[0].replyCursor}),e=>e.code==='INVALID_CURSOR');
});
