import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createFacebookPostFetcher, normalizePost, createProxyAgent } from '../scripts/facebook_posts.js';
import { FacebookFeedError, responseError, classifyTransportError } from '../scripts/facebook_post_errors.js';
import {createFacebookContentHttpReader} from '../src/services/facebookContentHttp.js';

const story = id => ({
  __typename: 'Story', post_id: id, creation_time: 1790842163, actors: [{ id: '77', name: 'Author' }],
  message: { text: 'Post content' },
  feedback: {
    reaction_count: { count: 19 },
    top_reactions: { count: 2, edges: [
      { node: { id: '1635855486666999' }, reaction_count: 12 },
      { node: { id: '115940658764963' }, reaction_count: 7 },
    ] },
    share_count: { count: 4 },
    comment_rendering_instance: { comments: { total_count: 9 } },
  },
});

async function template(t, query = 'GroupsCometFeedRegularStoriesPaginationQuery') {
  const dir = await mkdtemp(join(tmpdir(), 'fb-posts-test-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const harPath = join(dir, 'capture.har');
  await writeFile(harPath, JSON.stringify({ log: { entries: [{ request: {
    url: 'https://www.facebook.com/api/graphql/', headers: [],
    postData: { text: new URLSearchParams({ fb_api_req_friendly_name: query,
      variables: JSON.stringify({ id: '111', cursor: 'old-group-cursor', count: 3 }) }).toString() },
  } }] } }));
  return harPath;
}

function response(ids, { next = 'next-page', type = 'group' } = {}) {
  const feed = { edges: ids.map(id => ({ node: story(id), cursor: `edge-${id}` })),
    page_info: { has_next_page: next !== null, end_cursor: next } };
  return { status: 200, text: JSON.stringify({ data: { node: {
    [type === 'group' ? 'group_feed' : 'timeline_list_feed_units']: feed,
  } } }) };
}

test('maps Like separately from total reactions; keeps missing counters null', () => {
  const post = normalizePost(story('555'), { groupId: '123', type: 'group' });
  assert.deepEqual(post, { _id: '555', pinned:false,pinEvidence:'native_no_pin_marker',originalUrl:null,mediaId:null,mediaType:null,authorId: '77', author: 'Author', created_time: 1790842163, reactions: 19,
    content: 'Post content', title: '', description: '', like: 12, shares: 4,
    comment: 9, url: 'https://www.facebook.com/groups/123/posts/555/' });
  const missing = normalizePost({ post_id: '1' }, { groupId: '123', type: 'group' });
  assert.equal(missing.like, null);
  assert.equal(missing.shares, null);
  assert.equal(missing.comment, null);
});

test('uses last consumed edge cursor when server returns too many posts', async t => {
  const har = await template(t);
  const calls = [];
  const fetch = createFacebookPostFetcher({ harPaths: { group: har }, delayMs: 0,
    request: async form => {
      const vars = JSON.parse(form.variables); calls.push(vars);
      return vars.cursor === 'edge-2' ? response(['3'], { next: null }) : response(['1', '2', '3']);
    } });
  const first = await fetch({ groupId: '222', groupName: 'Group', numberPosts: 2 });
  assert.deepEqual(first.posts.map(p => p._id), ['1', '2']);
  assert.equal(first.cursor, 'edge-2');
  assert.equal(calls[0].id, '222');
  assert.equal(calls[0].youthIntegrityHostID, '222');
  assert.equal(calls[0].cursor, null);
  const second = await fetch({ groupId: '222', cursor: first.cursor, numberPosts: 2 });
  assert.deepEqual(second.posts.map(p => p._id), ['3']);
  assert.equal(second.cursor, null);
});

test('follows page_info and returns fewer posts only at end or request budget', async t => {
  const har = await template(t);
  let call = 0;
  const fetch = createFacebookPostFetcher({ harPaths: { group: har }, delayMs: 0,
    request: async () => ++call === 1 ? response(['1']) : response(['2'], { next: null }) });
  const result = await fetch({ groupId: '222', numberPosts: 5 });
  assert.equal(call, 2);
  assert.equal(result.posts.length, 2);
  assert.equal(result.cursor, null);
});

test('rejects group HAR for page/user; uses matching timeline HAR for each type', async t => {
  const group = await template(t);
  const timeline = await template(t, 'ProfileCometTimelineFeedRefetchQuery');
  const fetch = createFacebookPostFetcher({ harPaths: { group, page: group, user: timeline },
    request: async form => {
      assert.equal(JSON.parse(form.variables).id, '222');
      return response(['1'], { type: 'user', next: null });
    } });
  await assert.rejects(fetch({ groupId: '222', type: 'page' }), e => e.code === 'REQUEST_TEMPLATE_INVALID');
  assert.equal((await fetch({ groupId: '222', type: 'user', numberPosts: 1 })).posts[0].url,
    'https://www.facebook.com/222/posts/1/');
});

test('does not treat login/GraphQL failures as a valid empty feed', async t => {
  const har = await template(t);
  const fetch = createFacebookPostFetcher({ harPaths: { group: har },
    request: async () => ({ status: 200, text: '{"errors":[{"message":"Login required"}]}' }) });
  await assert.rejects(fetch({ groupId: '222' }), e => e.code === 'AUTH_REQUIRED');
});

test('GraphQL failure diagnostics preserve the native code and field path without retaining response text',async t=>{
 const har=await template(t),packet=JSON.parse(response(['1']).text);packet.errors=[{code:613,message:'Rate limit exceeded; private response content',path:['node','group_feed','edges',0,'https://private.invalid/secret']}];
 const fetch=createFacebookPostFetcher({harPaths:{group:har},request:async()=>({status:200,text:JSON.stringify(packet)})});
 await assert.rejects(fetch({groupId:'222'}),e=>{assert.equal(e.code,'FACEBOOK_RATE_LIMITED');assert.equal(e.sourceCode,'613');assert.equal(e.stage,'GroupsCometFeedRegularStoriesPaginationQuery');assert.equal(e.context.graphql.usablePosts,true);assert.deepEqual(e.context.graphql.errors,[{code:'613',kind:'FACEBOOK_RATE_LIMITED',path:['node','group_feed','edges',0,'field']}]);assert.equal(JSON.stringify(e.context).includes('private'),false);return true;});
});

test('the HTTP reader carries sanitized native GraphQL diagnostics into the saved read error',async t=>{
 const har=await template(t),packet={errors:[{code:613,message:'Rate limit exceeded',path:['node','group_feed']}],data:{node:{group_feed:null}}};
 const read=createFacebookContentHttpReader({bootstrapFacebook:false,respectPlatformCooldown:false,failFastProxy:true,getProxy:async()=>({server:'http://fixture:8080'}),makeSession:()=>({requests:0,close(){},async request(url){this.requests++;return{httpStatus:200,html:JSON.stringify(packet),finalUrl:url};}}),createPostFetcher:options=>createFacebookPostFetcher({...options,harPaths:{group:har}})});
 const result=await read({platform:'facebook',operation:'source',sourceType:'group',id:'222',url:'https://www.facebook.com/groups/222/',limit:100,order:'latest'});
 assert.equal(result.status,'rate_limited');assert.equal(result.reason,'FACEBOOK_RATE_LIMITED');assert.equal(result.upstreamCode,'613');assert.equal(result.upstreamContext.graphql.feedPresent,false);assert.deepEqual(result.upstreamContext.graphql.errors[0].path,['node','group_feed']);
});

test('accepts HTTP proxy URL and credential object; rejects unsupported schemes', () => {
  for (const proxy of ['http://localhost:8080',
    { host: 'localhost', port: 8080, username: 'test', password: 'p@ss' }]) {
    const agent = createProxyAgent(proxy);
    assert.equal(agent.constructor.name, 'HttpsProxyAgent');
    agent.destroy();
  }
  assert.throws(() => createProxyAgent('socks5://localhost:1080'), /http/);
});

test('distinguishes initial empty feed from end of an existing pagination', async t => {
  const har = await template(t);
  const fetch = createFacebookPostFetcher({ harPaths: { group: har },
    request: async () => response([], { next: null }) });
  const empty = await fetch({ groupId: '222' });
  assert.deepEqual({ ok: empty.ok, status: empty.status, posts: empty.posts,
    cursor: empty.cursor, hasNextPage: empty.hasNextPage },
  { ok: true, status: 'EMPTY', posts: [], cursor: null, hasNextPage: false });
  assert.equal((await fetch({ groupId: '222', cursor: 'old' })).status, 'END_OF_FEED');
});

test('an empty window with another page is PARTIAL, not EMPTY, at request budget', async t => {
  const har = await template(t);
  const fetch = createFacebookPostFetcher({ harPaths: { group: har }, maxPages: 1,
    request: async () => response([]) });
  const result = await fetch({ groupId: '222' });
  assert.equal(result.status, 'PARTIAL');
  assert.equal(result.hasNextPage, true);
  assert.equal(result.cursor, 'next-page');
});

test('proxy failure preserves previous pages and the cursor for retry', async t => {
  const har = await template(t);
  let call = 0;
  const fetch = createFacebookPostFetcher({ harPaths: { group: har }, delayMs: 0,
    request: async () => {
      if (++call === 1) return response(['1']);
      throw Object.assign(new Error('secret proxy credentials must not leak'), {
        code: 'ECONNREFUSED', stage: 'proxy_connect',
      });
    } });
  await assert.rejects(fetch({ groupId: '222', numberPosts: 3, proxy: 'http://localhost:8080' }), e => {
    assert(e instanceof FacebookFeedError);
    assert.equal(e.code, 'PROXY_CONNECT_FAILED');
    assert.equal(e.retryable, true);
    assert.equal(e.retryWithDifferentProxy, true);
    assert.equal(e.partialResult.cursor, 'next-page');
    assert.deepEqual(e.partialResult.posts.map(p => p._id), ['1']);
    assert(!JSON.stringify(e).includes('secret proxy'));
    return true;
  });
});

test('post-tunnel errors and unknown network errors are not attributed to proxy', () => {
  for (const stage of ['target_tls', undefined]) {
    const e = classifyTransportError({ code: 'ECONNRESET', stage }, true);
    assert.equal(e.code, 'NETWORK_ERROR');
    assert.equal(e.retryWithDifferentProxy, false);
  }
  assert.equal(classifyTransportError({ code: 'ETIMEDOUT', stage: 'proxy_connect' }, true).code,
    'PROXY_TIMEOUT');
});

test('CONNECT rejection/auth is distinguished from Facebook 403/429/5xx', () => {
  const auth = responseError({ status: 407, proxyConnectStatus: 407 });
  assert.equal(auth.code, 'PROXY_AUTH_REQUIRED');
  assert.equal(auth.retryWithDifferentProxy, true);
  assert.equal(responseError({ status: 502, proxyConnectStatus: 502 }).code, 'PROXY_TUNNEL_REJECTED');
  assert.equal(responseError({ status: 403, proxyConnectStatus: 200 }).code, 'FACEBOOK_ACCESS_DENIED');
  const limited = responseError({ status: 429, retryAfter: '30' });
  assert.equal(limited.code, 'FACEBOOK_RATE_LIMITED');
  assert.equal(limited.retryAfterMs, 30000);
  assert.equal(limited.retryWithDifferentProxy, false);
  assert.equal(responseError({ status: 503 }).code, 'FACEBOOK_SERVER_ERROR');
});

test('unavailable target, expired cursor, and GraphQL error are never empty success', async t => {
  const har = await template(t);
  for (const [message, expected] of [
    ['Object does not exist or you do not have permission', 'TARGET_UNAVAILABLE'],
    ['Invalid cursor', 'INVALID_CURSOR'],
    ['Invalid LSD token', 'REQUEST_TOKEN_INVALID'],
    ['Checkpoint required', 'SECURITY_CHECKPOINT'],
    ['field_exception', 'FACEBOOK_GRAPHQL_ERROR'],
  ]) {
    const fetch = createFacebookPostFetcher({ harPaths: { group: har },
      request: async () => ({ status: 200, text: JSON.stringify({ errors: [{ message }], data: { node: null } }) }) });
    await assert.rejects(fetch({ groupId: '222' }), e => {
      assert.equal(e.code, expected);
      assert.equal(e.retryWithDifferentProxy, false);
      return true;
    });
  }
});

test('usable posts with nonfatal field errors return warnings', async t => {
  const har = await template(t);
  const fetch = createFacebookPostFetcher({ harPaths: { group: har }, request: async () => {
    const res = response(['1'], { next: null });
    const parsed = JSON.parse(res.text); parsed.errors = [{ message: 'field_exception' }];
    return { ...res, text: JSON.stringify(parsed) };
  } });
  const result = await fetch({ groupId: '222', numberPosts: 1 });
  assert.equal(result.posts.length, 1);
  assert.equal(result.warnings[0].code, 'FACEBOOK_FIELD_ERRORS');
});

test('malformed pagination cannot commit posts and skip them on retry', async t => {
  const har = await template(t);
  const fetch = createFacebookPostFetcher({ harPaths: { group: har }, request: async () => {
    const res = response(['1']); const parsed = JSON.parse(res.text);
    delete parsed.data.node.group_feed.page_info;
    return { ...res, text: JSON.stringify(parsed) };
  } });
  await assert.rejects(fetch({ groupId: '222', numberPosts: 2 }), e => {
    assert.equal(e.code, 'FACEBOOK_PAGINATION_INCOMPLETE');
    assert.deepEqual(e.partialResult, { posts: [], cursor: null });
    return true;
  });
});

test('permission error on an optional field does not hide usable posts', async t => {
  const har = await template(t);
  const fetch = createFacebookPostFetcher({ harPaths: { group: har }, request: async () => {
    const res = response(['1'], { next: null }); const parsed = JSON.parse(res.text);
    parsed.errors = [{ message: 'No permission to view optional field', path: ['node', 'optional'] }];
    return { ...res, text: JSON.stringify(parsed) };
  } });
  assert.equal((await fetch({ groupId: '222', numberPosts: 1 })).posts.length, 1);
});

test('a collaborative page post selects the verified source profile actor instead of the first collaborator',()=>{
 const p=normalizePost({post_id:'123',creation_time:1792580475,actors:[{id:'100083798840206',name:'Other collaborator'},{id:'100064847014037',name:'Source page'}]},{groupId:'100064847014037',type:'page'});assert.equal(p.authorId,'100064847014037');assert.equal(p.author,'Source page');
});
test('shared HTTP timeout and TLS errors retain their precise reason through Facebook fetch wrappers',async()=>{
 const{classifyTransportError}=await import('../scripts/facebook_post_errors.js');for(const code of ['UPSTREAM_TIMEOUT','UPSTREAM_NETWORK_ERROR','UPSTREAM_TOO_LARGE','TLS_VALIDATION_FAILED']){const error=classifyTransportError(Object.assign(Error('private detail'),{code}),false);assert.equal(error.code,code);assert.equal(error.sourceCode,code);assert.equal(error.retryWithDifferentProxy,false);assert.ok(!error.message.includes('private detail'));}
});

test('native field_exception with no usable feed is retryable and optional failures preserve posts',async t=>{
 const {graphqlError}=await import('../scripts/facebook_post_errors.js');
 const errors=[{message:'A server error field_exception occured. Check server logs for details.'}];
 assert.equal(graphqlError(errors).code,'FACEBOOK_SERVER_ERROR');assert.equal(graphqlError(errors).retryable,true);
 assert.equal(graphqlError(errors,{unknownIsFatal:false}),null);
 assert.equal(graphqlError([{...errors[0],is_transient:false}]).code,'FACEBOOK_GRAPHQL_ERROR');
 assert.equal(graphqlError([{message:'missing_required_variable_value',is_transient:false}]).code,'FACEBOOK_GRAPHQL_ERROR');
 const har=await template(t);let usable=false;
 const fetch=createFacebookPostFetcher({harPaths:{group:har},request:async()=>{const r=response(usable?['1']:[],{next:null});const body=JSON.parse(r.text);body.errors=errors;return{...r,text:JSON.stringify(body)};}});
 await assert.rejects(()=>fetch({groupId:'222',numberPosts:5}),e=>e.code==='FACEBOOK_SERVER_ERROR');
 usable=true;const result=await fetch({groupId:'222',numberPosts:5});assert.equal(result.posts.length,1);
});

for (const badFlag of [undefined,null,'false',0]) test(`group metadata with invalid has_next_page ${String(badFlag)} is recoverable without advancing cursor`,async t=>{
 const har=await template(t),fetch=createFacebookPostFetcher({harPaths:{group:har},maxPages:1,request:async()=>{
  const r=response(['1']),p=JSON.parse(r.text);p.data.node.group_feed.page_info.has_next_page=badFlag;
  p.errors=[{message:'field_exception',path:['node','group_feed','edges',0,'node','save_info','save_flow']}];return{...r,text:JSON.stringify(p)};
 }});
 await assert.rejects(fetch({groupId:'222',cursor:'FAILED-PAGE',numberPosts:100}),e=>{
  assert.equal(e.code,'FACEBOOK_PAGINATION_INCOMPLETE');assert.equal(e.retryable,true);
  assert.equal(e.context.graphql.hasNextPage,null);assert.equal(e.context.graphql.paginationProblem,'HAS_NEXT_PAGE_INVALID');
  assert.deepEqual(e.partialResult,{posts:[],cursor:'FAILED-PAGE'});return true;
 });
});
for(const badCursor of [undefined,null,'',123])test(`group continuation ${String(badCursor)} cannot fabricate an end or skip the failed page`,async t=>{
 const har=await template(t),fetch=createFacebookPostFetcher({harPaths:{group:har},maxPages:1,request:async()=>{const r=response(['1']),p=JSON.parse(r.text);p.data.node.group_feed.page_info.end_cursor=badCursor;return{...r,text:JSON.stringify(p)};}});
 await assert.rejects(fetch({groupId:'222',cursor:'FAILED-PAGE',numberPosts:100}),e=>{assert.equal(e.code,'FACEBOOK_PAGINATION_INCOMPLETE');assert.equal(e.context.graphql.paginationProblem,'END_CURSOR_MISSING');assert.deepEqual(e.partialResult,{posts:[],cursor:'FAILED-PAGE'});return true;});
});
test('explicit end with usable group posts and optional field failures remains a real end',async t=>{
 const har=await template(t),fetch=createFacebookPostFetcher({harPaths:{group:har},request:async()=>{const r=response(['1'],{next:null}),p=JSON.parse(r.text);p.errors=[{message:'field_exception',path:['node','group_feed','edges',0,'node','save_info','save_flow']}];return{...r,text:JSON.stringify(p)};}});
 const r=await fetch({groupId:'222',numberPosts:100});assert.equal(r.hasNextPage,false);assert.equal(r.cursor,null);assert.equal(r.posts.length,1);
});
test('incomplete page metadata does not change page/user recovery policy',async t=>{
 const har=await template(t,'ProfileCometTimelineFeedRefetchQuery'),fetch=createFacebookPostFetcher({harPaths:{page:har,user:har},request:async()=>{const r=response(['1'],{type:'page'}),p=JSON.parse(r.text);p.data.node.timeline_list_feed_units.page_info={};return{...r,text:JSON.stringify(p)};}});
 for(const type of ['page','user'])await assert.rejects(fetch({groupId:'222',type}),{code:'PAGINATION_ERROR'});
});
test('real group parser recovers the same failed cursor using one replacement without losing seen posts',async t=>{
 const har=await template(t),{boundedGroupCursorRead}=await import('../src/services/groupSourceProxyPolicy.js'),{READ_STATE}=await import('../src/services/socialReadState.js'),{HTTP_BINDING,disposeReadState}=await import('../src/services/socialLeaseState.js'),{runCrawlerQueue}=await import('../src/services/crawlerQueueContext.js');
 await runCrawlerQueue('crawler-flow-facebook-group-source',async()=>{
  let acquired=0,released=0,posts=0,state={kind:'facebook',items:[],seen:new Set(['old']),nativeCursor:'FAILED-PAGE',pending:true,collecting:false};const cursors=[],data={page:2};
  const getProxy=async()=>({host:'fixture',port:8080+(++acquired),managed:true,queue:'crawler-flow-facebook-group-source',scope:'facebook.source_group',expiresAt:Date.now()+300000,heartbeat:async()=>{},permit:async()=>{},report:async()=>{},release:async()=>released++});getProxy.managed=true;
  const reader=createFacebookContentHttpReader({getProxy,failFastProxy:true,reuseFacebookGroupSessions:true,respectPlatformCooldown:false,createPostFetcher:opts=>createFacebookPostFetcher({...opts,harPaths:{group:har}}),makeSession:()=>({requests:0,close(){},async request(url,opts){this.requests++;if(opts?.method!=='POST')return{httpStatus:200,finalUrl:url,html:'<input name="lsd" value="fixture">'};posts++;cursors.push(JSON.parse(new URLSearchParams(opts.body).get('variables')).cursor);const r=response(['1']),p=JSON.parse(r.text);if(posts===1){delete p.data.node.group_feed.page_info;p.errors=[{message:'field_exception',path:['node','group_feed','edges',0,'node','save_info','save_flow']}];}return{httpStatus:200,finalUrl:url,html:JSON.stringify(p)};}})});
  try{const out=await boundedGroupCursorRead({data,read:async()=>{const result=await reader({platform:'facebook',operation:'source',sourceType:'group',id:'222',url:'https://www.facebook.com/groups/222',limit:100,proxyRetryContext:{excludedProxyEndpoints:{}},[READ_STATE]:state});state=result[READ_STATE]||state;return{good:['ok','partial'].includes(result.status),result,state};},rotate:async()=>{assert.equal(state.nativeCursor,'FAILED-PAGE');assert.deepEqual([...state.seen],['old']);await disposeReadState(state);delete state[HTTP_BINDING];}});
   assert.equal(out.good,true,JSON.stringify(out));assert.equal(out.proxyPartial,undefined);assert.deepEqual(cursors,['FAILED-PAGE','FAILED-PAGE']);assert.equal(state.nativeCursor,'next-page');assert.deepEqual([...state.seen],['old','1']);assert.equal(acquired,2);assert.equal(data.groupCursorProxyEndpoints.length,1);
  }finally{await disposeReadState(state);}assert.equal(released,2);
 });
});

test('a valid JSON prefix of a streamed group page is retryable until its pagination trailer arrives',async t=>{
 const har=await template(t),chunks=[{data:{node:{group_feed:{edges:[{node:story('1'),cursor:'edge-1'}]}}},extensions:{is_final:false},errors:[{message:'A server error field_exception occured. Check server logs for details.',path:['node','group_feed','edges',0,'node','save_info','save_flow']}]},{path:['node','group_feed','edges',1],data:{node:story('2'),cursor:'edge-2'},extensions:{is_final:false}},{path:['node','group_feed'],data:{page_info:{has_next_page:true,end_cursor:'REAL-NEXT'}},extensions:{is_final:true}}];
 for(const n of [1,2,3]){const fetch=createFacebookPostFetcher({harPaths:{group:har},maxPages:1,request:async()=>({status:200,text:chunks.slice(0,n).map(x=>JSON.stringify(x)).join('\n')})});
  if(n<3)await assert.rejects(fetch({groupId:'222',cursor:'FAILED-PAGE',numberPosts:100}),e=>{assert.equal(e.code,'FACEBOOK_PAGINATION_INCOMPLETE');assert.equal(e.context.graphql.streamFinal,false);assert.equal(e.context.graphql.pageInfoPresent,false);assert.deepEqual(e.partialResult,{posts:[],cursor:'FAILED-PAGE'});return true;});
  else{const r=await fetch({groupId:'222',cursor:'FAILED-PAGE',numberPosts:100});assert.equal(r.posts.length,2);assert.equal(r.cursor,'REAL-NEXT');assert.equal(r.hasNextPage,true);}
 }
});
