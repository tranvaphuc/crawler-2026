import test from 'node:test';
import assert from 'node:assert/strict';
import {createMetaSourceHttpReader,sourceQuery} from '../src/services/metaSourceHttp.js';
import {normalizeContentInput} from '../src/services/socialContent.js';
import {READ_STATE} from '../src/services/socialReadState.js';
import {packState,unpackState} from '../src/services/crawlerQueueFlow.js';
const post=id=>({pk:id,code:'CODE'+id,caption:{text:'hello'},taken_at:1792900000,user:{pk:'9',username:'public'},text_post_app_info:{direct_reply_count:1}});
const conn=(ids,next,cursor)=>({edges:ids.map(id=>({node:{thread_items:[{post:post(id)}]}})),page_info:{has_next_page:next,end_cursor:cursor}});
const initial={httpStatus:200,finalUrl:'https://www.threads.com/@public',html:'<script type="application/json">'+JSON.stringify({lsd:['LSD',[],{token:'secret-lsd'}],query:{queryID:'123',queryName:'BarcelonaProfileTimelineQuery',variables:{userID:'9',after:null,first:10}},mediaData:conn(['1'],true,'PAGE2')})+'</script>'};
function fixture(responses){const calls=[];return{calls,read:createMetaSourceHttpReader({respectPlatformCooldown:false,getProxy:async()=>({server:'http://proxy.test:8888'}),makeSession:()=>({requests:0,close(){},async request(url,opts){this.requests++;if(!opts)return initial;const body=new URLSearchParams(opts.body);calls.push(JSON.parse(body.get('variables')));const response=responses.shift();return{httpStatus:response.httpStatus||200,retryAfterMs:response.retryAfterMs,finalUrl:url,html:JSON.stringify(response.body||response)};}})})};}
const target=()=>normalizeContentInput('source',{url:'https://www.threads.com/@public',reference:{id:'9'},limit:100});
test('native source cursor survives a new anonymous worker without persisting proxy or LSD',async()=>{
 const f=fixture([{data:{mediaData:conn(['2'],true,'PAGE3')}},{data:{mediaData:conn([],false,null)}}]);
 const first=await f.read(target());assert.equal(first.items[0].id,'1');assert.equal(first.pagination.hasMore,true);
 const checkpoint=packState(first[READ_STATE]);const saved=unpackState(checkpoint);assert.ok(!JSON.stringify(saved).includes('secret-lsd'));
 const second=await f.read({...target(),[READ_STATE]:saved});assert.equal(second.items[0].id,'2');assert.equal(f.calls[0].after,'PAGE2');assert.equal(f.calls[0].userID,'9');
 const last=await f.read({...target(),[READ_STATE]:second[READ_STATE]});assert.equal(last.nativePageCount,0);assert.equal(last.pagination.hasMore,false);
});
test('repeated native cursor is an error and preserves cursor for retry',async()=>{
 const f=fixture([{data:{mediaData:conn(['2'],true,'PAGE2')}}]);const first=await f.read(target());const second=await f.read({...target(),[READ_STATE]:first[READ_STATE]});assert.equal(second.reason,'NATIVE_PAGINATION_STALLED');assert.equal(second[READ_STATE].nativeCursor,'PAGE2');
});
test('source query must come from the matching native manifest',()=>{
 assert.throws(()=>sourceQuery({queries:[]},'threads'),/MANIFEST_MISSING/);
 assert.equal(sourceQuery({queries:[{name:'PolarisProfilePostsQuery',variables:{},docId:'1'}]},'instagram').docId,'1');
});

test('Threads bootstrap direct query switches to its verified refetch operation for pagination',()=>{
 const q=sourceQuery({queries:[{name:'BarcelonaProfileThreadsTabDirectQuery',docId:'bootstrap-id',variables:{userID:'9',first:4,allow_page_info_for_lox_user:true}}]},'threads');
 assert.equal(q.name,'BarcelonaProfileThreadsTabRefetchableDirectQuery');assert.equal(q.docId,'40155197760760366');assert.equal(q.variables.userID,'9');assert.equal(q.variables.before,null);
});

test('Instagram hydrates publication dates before advancing native cursor, including across a new worker',async()=>{
 const url='https://www.instagram.com/sample/',target=()=>normalizeContentInput('source',{url,reference:{id:'9'},limit:100});const calls=[];
 const feed={httpStatus:200,finalUrl:url,html:'<script type="application/json">'+JSON.stringify({query:{queryID:'123',queryName:'PolarisProfilePostsQuery',variables:{username:'sample'}},data:{xdt_api__v1__feed__user_timeline_graphql_connection:{edges:[1,2].map(n=>({node:{pk:String(n),code:'POST'+n,user:{pk:'9',username:'sample'},caption:{text:'post'}}})),page_info:{has_next_page:true,end_cursor:'PAGE2'}}}})+'</script>'};
 const read=createMetaSourceHttpReader({maxPages:1,respectPlatformCooldown:false,getProxy:async()=>({server:'http://proxy.test:8888'}),makeSession:()=>({requests:0,close(){},async request(u,opts){this.requests++;calls.push(u);assert.equal(opts,undefined,'must not fetch next page before all dates are hydrated');if(u===url)return feed;const n=Number(/POST(\d)/.exec(u)[1]);return{httpStatus:200,finalUrl:u,html:'<script type="application/json">'+JSON.stringify({pk:String(n),code:'POST'+n,user:{pk:'9',username:'sample'},taken_at:1700000000+n,comment_count:n})+'</script>'};}})});
 const first=await read(target());assert.equal(first.phase,'collecting');assert.equal(first.items.length,0);assert.equal(first[READ_STATE].nativeCursor,null);
 const second=await read({...target(),[READ_STATE]:unpackState(packState(first[READ_STATE]))});assert.equal(second.items.length,2);assert.deepEqual(second.items.map(x=>x.createdAt),['2023-11-14T22:13:21.000Z','2023-11-14T22:13:22.000Z']);assert.deepEqual(second.items.map(x=>x.metrics.comment),[1,2]);assert.equal(second[READ_STATE].nativeCursor,'PAGE2');assert.equal(calls.filter(u=>u.includes('POST1')).length,1);
});

test('a successful empty profile completes with native identity proof and does not request another page',async()=>{
 const url='https://www.instagram.com/sample/';let requests=0;
 const read=createMetaSourceHttpReader({respectPlatformCooldown:false,getProxy:async()=>({server:'http://proxy.test:8888'}),makeSession:()=>({requests:0,close(){},async request(u){this.requests++;requests++;return{httpStatus:200,finalUrl:u,html:'<script type="application/json">'+JSON.stringify({data:{user:{pk:'9',username:'sample'},xdt_api__v1__feed__user_timeline_graphql_connection:{edges:[],page_info:{has_next_page:false}}}})+'</script>'};}})});
 const result=await read(normalizeContentInput('source',{url,reference:{id:'9'}}));assert.equal(result.status,'ok');assert.equal(result.nativePageCount,0);assert.equal(result.pagination.hasMore,false);assert.equal(result[READ_STATE],undefined);assert.equal(requests,1);
});

test('YouTube native source mode emits the initial page before requesting its next cursor',async()=>{
 const {createSocialHttpContentReader}=await import('../src/services/socialHttpReaders.js');const url='https://www.youtube.com/@sample',id='abcdefghijk',calls=[];
 const data={metadata:{channelMetadataRenderer:{externalId:'UCsample',ownerUrls:[url]}},contents:{twoColumnBrowseResultsRenderer:{tabs:[{tabRenderer:{selected:true,title:'Videos',content:{items:[{videoRenderer:{videoId:id,title:{simpleText:'Video'}}},{continuationItemRenderer:{continuationEndpoint:{continuationCommand:{token:'NEXT_PAGE'}}}}]}}}]}}};
 const read=createSocialHttpContentReader({nativeSourcePages:true,maxPages:1,respectPlatformCooldown:false,getProxy:async()=>({server:'http://proxy.test:8888'}),makeSession:()=>({requests:0,close(){},async request(u,opts){this.requests++;calls.push(u);assert.equal(opts,undefined,'native next page must wait until initial page is delivered');return{httpStatus:200,finalUrl:u,html:u===url+'/videos?hl=en'?'<script>ytcfg.set('+JSON.stringify({INNERTUBE_CONTEXT:{client:{clientName:'WEB',clientVersion:'1'}}})+');var ytInitialData = '+JSON.stringify(data)+';</script>':'<script>var ytInitialPlayerResponse = '+JSON.stringify({videoDetails:{videoId:id},microformat:{playerMicroformatRenderer:{publishDate:'2026-10-27T01:00:00Z'}}})+';</script>'};}})});
 const result=await read(normalizeContentInput('source',{url,limit:100,count:'all'}));assert.equal(result.items[0].id,id);assert.equal(result.items[0].createdAt,'2026-10-27T01:00:00.000Z');assert.equal(result[READ_STATE].queue[0].token,'NEXT_PAGE');assert.equal(calls.length,2);
});

test('missing native end flag is a failure, never a successful empty source',async()=>{
 const f=fixture([{data:{mediaData:{edges:[],page_info:{end_cursor:null}}}}]);const first=await f.read(target());const result=await f.read({...target(),[READ_STATE]:first[READ_STATE]});assert.equal(result.status,'error');assert.equal(result.reason,'META_SOURCE_CONNECTION_UNVERIFIED');assert.equal(result[READ_STATE].nativeCursor,'PAGE2');
});
test('a verified empty intermediate native page retains its continuation',async()=>{
 const f=fixture([{data:{mediaData:conn([],true,'PAGE3')}},{data:{mediaData:conn(['2'],false,null)}}]);const first=await f.read(target()),empty=await f.read({...target(),[READ_STATE]:first[READ_STATE]});assert.equal(empty.status,'ok');assert.equal(empty.items.length,0);assert.equal(empty.pagination.hasMore,true);const last=await f.read({...target(),[READ_STATE]:empty[READ_STATE]});assert.equal(last.items[0].id,'2');assert.equal(last.pagination.hasMore,false);
});
test('a source pagination rate limit preserves its explicit Retry-After and pending cursor',async()=>{
 const f=fixture([{httpStatus:429,retryAfterMs:3600000,body:{}}]),first=await f.read(target()),r=await f.read({...target(),[READ_STATE]:first[READ_STATE]});assert.equal(r.status,'rate_limited');assert.equal(r.reason,'UPSTREAM_HTTP_429');assert.equal(r.retryAfterMs,3600000);assert.equal(r[READ_STATE].nativeCursor,'PAGE2');assert.notEqual(r.pagination.complete,true);
});

test('a valid foreign-only repost page continues without importing foreign authors',async()=>{
 const foreign=conn(['77'],true,'PAGE3');foreign.edges[0].node.thread_items[0].post.user={pk:'88',username:'other'};
 const f=fixture([{data:{mediaData:foreign}},{data:{mediaData:conn(['2'],false,null)}}]),first=await f.read(target()),middle=await f.read({...target(),[READ_STATE]:first[READ_STATE]});
 assert.equal(middle.status,'ok');assert.deepEqual(middle.items,[]);assert.equal(middle.pagination.hasMore,true);assert.equal(middle[READ_STATE].nativeCursor,'PAGE3');const last=await f.read({...target(),[READ_STATE]:middle[READ_STATE]});assert.deepEqual(last.items.map(x=>x.id),['2']);assert.equal(last.pagination.complete,true);
});
test('Threads overlapping pages advance without emitting duplicates and resume after checkpoint',async()=>{
 const f=fixture([{data:{mediaData:conn(['1'],true,'PAGE3')}},{data:{mediaData:conn(['2'],false,null)}}]),first=await f.read(target()),middle=await f.read({...target(),[READ_STATE]:first[READ_STATE]});
 assert.equal(middle.status,'ok');assert.equal(middle.items.length,0);assert.equal(middle.paginationProgress.duplicatePage,true);assert.equal(middle[READ_STATE].nativeCursor,'PAGE3');
 const last=await f.read({...target(),[READ_STATE]:unpackState(packState(middle[READ_STATE]))});assert.deepEqual(last.items.map(x=>x.id),['2']);assert.equal(last.pagination.complete,true);assert.deepEqual(f.calls.map(x=>x.after),['PAGE2','PAGE3']);
});
test('Threads bounds advancing duplicate pages across checkpoints and keeps the failing cursor',async()=>{
 const f=fixture([3,4,5,6].map(n=>({data:{mediaData:conn(['1'],true,'PAGE'+n)}})));let r=await f.read(target());
 for(let n=0;n<3;n++){r=await f.read({...target(),[READ_STATE]:unpackState(packState(r[READ_STATE]))});assert.equal(r.status,'ok');}
 const last=await f.read({...target(),[READ_STATE]:unpackState(packState(r[READ_STATE]))});assert.equal(last.reason,'NATIVE_PAGINATION_STALLED');assert.equal(last[READ_STATE].nativeCursor,'PAGE5');
});
test('Threads accepts native EOF with only duplicates and catches multi-page cursor cycles',async()=>{
 const end=fixture([{data:{mediaData:conn(['1'],false,null)}}]),a=await end.read(target()),b=await end.read({...target(),[READ_STATE]:a[READ_STATE]});assert.equal(b.pagination.complete,true);assert.deepEqual(b.items,[]);
 const f=fixture([{data:{mediaData:conn(['2'],true,'PAGE3')}},{data:{mediaData:conn(['3'],true,'PAGE2')}}]),first=await f.read(target()),second=await f.read({...target(),[READ_STATE]:first[READ_STATE]}),last=await f.read({...target(),[READ_STATE]:unpackState(packState(second[READ_STATE]))});assert.equal(last.reason,'NATIVE_PAGINATION_STALLED');assert.equal(last[READ_STATE].nativeCursor,'PAGE3');
});
test('unparseable or missing-owner pages cannot be accepted as intentional filtered EOF',async()=>{
 for(const mode of ['bad_post','missing_owner','same_id_other_username','empty_edge']){const c=conn(['77'],false,null),p=c.edges[0].node.thread_items[0].post;if(mode==='bad_post')delete p.pk;if(mode==='missing_owner')delete p.user;if(mode==='same_id_other_username')p.user.username='other';if(mode==='empty_edge')c.edges[0].node.thread_items=[];const f=fixture([{data:{mediaData:c}}]),first=await f.read(target()),r=await f.read({...target(),[READ_STATE]:first[READ_STATE]});assert.equal(r.status,'error',mode);assert.notEqual(r.pagination?.complete,true,mode);}
});
test('a repeated verified Threads repost page can advance without importing the foreign author',async()=>{
 const foreign=conn(['77'],true,'PAGE3');foreign.edges[0].node.thread_items[0].post.user={pk:'88',username:'other'};const repeated=structuredClone(foreign);repeated.page_info.end_cursor='CHANGED_TOKEN';
 const f=fixture([{data:{mediaData:foreign}},{data:{mediaData:repeated}}]),first=await f.read(target()),middle=await f.read({...target(),[READ_STATE]:first[READ_STATE]}),saved=unpackState(packState(middle[READ_STATE])),r=await f.read({...target(),[READ_STATE]:saved});assert.equal(r.status,'ok');assert.deepEqual(r.items,[]);assert.equal(r[READ_STATE].nativeCursor,'CHANGED_TOKEN');
});

test('operator timeout rotation refreshes the proxy session and preserves the native after cursor',async()=>{
 const {boundedProxyRead}=await import('../src/services/crawlerQueueFlow.js'),{HTTP_BINDING,disposeReadState}=await import('../src/services/socialLeaseState.js');
 let acquired=0,graphRequests=0;const exclusions=[],cursors=[],context={};
 const read=createMetaSourceHttpReader({respectPlatformCooldown:false,failFastProxy:true,timeoutMs:500,getProxy:async t=>{exclusions.push(t.excludeProxyEndpoint);return{server:'http://proxy-'+(++acquired)+'.test:8888',managed:true,heartbeat:async()=>{},permit:async()=>{},report:async()=>({}),release:async()=>{}};},makeSession:()=>({requests:0,close(){},async request(url,opts){this.requests++;if(!opts)return initial;const body=new URLSearchParams(opts.body);cursors.push(JSON.parse(body.get('variables')).after);if(++graphRequests===1)throw Object.assign(Error('deadline'),{code:'UPSTREAM_TIMEOUT'});return{httpStatus:200,finalUrl:url,html:JSON.stringify({data:{mediaData:conn(['2'],false,null)}})};}})});
 const first=await read({...target(),proxyRetryContext:context});let state=first[READ_STATE];
 const result=await boundedProxyRead({read:async()=>{const r=await read({...target(),proxyRetryContext:context,[READ_STATE]:state});state=r[READ_STATE]||state;if(r.transport?.proxyEndpoint)context.excludeProxyEndpoint=r.transport.proxyEndpoint;return{good:['ok','partial'].includes(r.status),result:r};},rotate:async()=>{await disposeReadState(state);delete state[HTTP_BINDING];}});
 try{assert.equal(result.good,true);assert.deepEqual(result.result.items.map(x=>x.id),['2']);assert.deepEqual(cursors,['PAGE2','PAGE2']);assert.equal(acquired,2);assert.ok(exclusions[1]);assert.equal(result.result.pagination.hasMore,false);}finally{await disposeReadState(state);}
});

for(const staleAttempt of [false,true])test(`Instagram strict publication gate retains an undated page and retries metadata (saved attempt=${staleAttempt})`,async()=>{
 const url='https://www.instagram.com/sample/',t=()=>normalizeContentInput('source',{url,reference:{id:'9'},limit:100});let detailed=0;
 const feed={httpStatus:200,finalUrl:url,html:'<script type="application/json">'+JSON.stringify({query:{queryID:'123',queryName:'PolarisProfilePostsQuery',variables:{username:'sample'}},data:{xdt_api__v1__feed__user_timeline_graphql_connection:{edges:[{node:{pk:'1',code:'POST1',user:{pk:'9',username:'sample'},caption:{text:'post'}}}],page_info:{has_next_page:true,end_cursor:'PAGE2'}}}})+'</script>'};
 const read=createMetaSourceHttpReader({requireSourcePublicationTime:true,streamSourceItems:true,maxPages:1,respectPlatformCooldown:false,getProxy:async()=>({server:'http://proxy.test:8888'}),makeSession:()=>({requests:0,close(){},async request(u){this.requests++;if(u===url)return feed;detailed++;return{httpStatus:200,finalUrl:u,html:'<script type="application/json">'+JSON.stringify({pk:'1',code:'POST1',user:{pk:'9',username:'sample'},...(detailed>1?{taken_at:1700000001}:{})})+'</script>'};}})});
 const first=await read(t());assert.equal(first.reason,'SOURCE_POST_PUBLICATION_UNVERIFIED');assert.equal(first.items.length,0);assert.equal(first[READ_STATE].nativeCursor,null);assert.equal(first[READ_STATE].pending.nextCursor,'PAGE2');assert.equal(first[READ_STATE].items.length,1);
 const saved=unpackState(packState(first[READ_STATE]));if(staleAttempt)saved.dateAttempts.add('1');
 const resumed=await read({...t(),[READ_STATE]:saved});assert.equal(resumed.status,'ok');assert.equal(resumed.items.length,1);assert.equal(resumed.items[0].createdAt,'2023-11-14T22:13:21.000Z');assert.equal(resumed[READ_STATE].nativeCursor,'PAGE2');assert.equal(detailed,2);
});

test('an unavailable optional quoted post does not discard its verified source page',async()=>{
 const quotePath=['mediaData','edges',0,'node','thread_items',0,'post','text_post_app_info','share_info','quoted_post','taken_at'];
 for(const mode of ['optional_quote','root_identity','pagination','mixed','different_code']){
  const c=conn(['2'],true,'PAGE3');c.edges[0].node.thread_items[0].post.text_post_app_info.share_info={quoted_post:null};
  const optional={code:4686025,path:quotePath,message:'A server error field_exception occured. Check server logs for details.'};
  const errors=mode==='mixed'?[optional,{code:1675012,message:'missing_required_variable_value'}]:[{...optional,...(mode==='different_code'?{code:1675012}:{}),path:mode==='root_identity'?quotePath.slice(0,7).concat('user'):mode==='pagination'?['mediaData','page_info','end_cursor']:quotePath}];
  const f=fixture([{data:{mediaData:c},errors}]),a=await f.read(target()),r=await f.read({...target(),[READ_STATE]:a[READ_STATE]});
  if(mode==='optional_quote'){assert.equal(r.status,'ok');assert.deepEqual(r.items.map(x=>x.id),['2']);assert.equal(r[READ_STATE].nativeCursor,'PAGE3');}
  else{assert.equal(r.reason,'UPSTREAM_API_ERROR',mode);assert.equal(r[READ_STATE].nativeCursor,'PAGE2');assert.notEqual(r.pagination.complete,true);}
 }
});
