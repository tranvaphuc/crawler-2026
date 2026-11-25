import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {EventEmitter} from 'node:events';
import {PassThrough} from 'node:stream';
import {gzipSync} from 'node:zlib';
import {HttpsProxyAgent} from 'https-proxy-agent';
import * as zlib from 'node:zlib';
import {createProxiedSession,createHttpExecutor,assertPlatformUrl} from '../src/services/socialHttpTransport.js';
import {createSocialHttpMetricsReader,createSocialHttpContentReader,youtubeContinuations} from '../src/services/socialHttpReaders.js';
import {normalizeMetricsInput,snapshotPayloads} from '../src/services/socialMetrics.js';
import {normalizeContentInput} from '../src/services/socialContent.js';
import {publicApiIssue} from '../src/services/socialApiErrors.js';
import {READ_STATE} from '../src/services/socialReadState.js';
import {HTTP_BINDING} from '../src/services/socialLeaseState.js';
const target=normalizeMetricsInput({url:'https://www.threads.com/@sample/post/XYZ123'});
const metaHtml='<script type="application/json">'+JSON.stringify({id:'99',code:'XYZ123',like_count:10})+'</script>';
const proxy={server:'http://proxy.test:8888',username:'proxy-user',password:'proxy-secret'};
function mockRequest(responses,calls=[]){return (url,options,callback)=>{
 const req=new EventEmitter();req.write=()=>{};req.destroy=error=>queueMicrotask(()=>req.emit('error',error||Error('closed')));
 req.end=()=>queueMicrotask(()=>{calls.push({url:String(url),options});const r=responses.shift();if(r?.hang)return;if(r?.error){req.emit('error',r.error);return;}const res=new PassThrough();res.statusCode=r?.status||200;res.headers=r?.headers||{};callback(res);res.end(r?.body||'');});return req;
};}
test('runtime module graph for all API routers and runners has no browser/Puppeteer dependency',async()=>{
 const visited=new Set();
 async function inspect(file){if(visited.has(file))return;visited.add(file);const s=await fs.readFile(file,'utf8');
  assert.ok(!/from\s+['"]puppeteer|import\(['"]puppeteer|\.launch\(|createIncognitoBrowserContext/.test(s),file);
  for(const m of s.matchAll(/(?:from\s*|import\s*)['"](\.[^'"]+)['"]/g))await inspect(path.resolve(path.dirname(file),m[1]));
 }
 for(const file of ['src/routes/socialMetrics.js','src/routes/socialContent.js','src/routes/facebookShare.js','scripts/social_metrics_api.mjs','scripts/facebook_share_api.mjs'])await inspect(path.resolve(file));
});
test('HTTP session uses mandatory proxy agent and never sends proxy credentials to origin headers',async()=>{
 const calls=[],session=createProxiedSession({proxy,platform:'threads',requestImpl:mockRequest([{body:'ok'}],calls)});
 try{const r=await session.request(target.url);assert.equal(r.html,'ok');assert.ok(calls[0].options.agent instanceof HttpsProxyAgent);assert.ok(!JSON.stringify(calls[0].options.headers).includes('proxy-secret'));assert.equal(calls[0].options.headers.authorization,undefined);}finally{session.close();}
});
test('anonymous cookies are private to one session and exact origin',async()=>{
 const calls=[],session=createProxiedSession({proxy,platform:'threads',requestImpl:mockRequest([{headers:{'set-cookie':['anonymous=opaque; Path=/; Secure']}},{},{},{}],calls)});
 try{await session.request(target.url);await session.request(target.url);await session.request('https://threads.net/@sample');assert.equal(calls[1].options.headers.cookie,'anonymous=opaque');assert.equal(calls[2].options.headers.cookie,undefined);}finally{session.close();}
 const nextCalls=[],next=createProxiedSession({proxy,platform:'threads',requestImpl:mockRequest([{}],nextCalls)});await next.request(target.url);next.close();assert.equal(nextCalls[0].options.headers.cookie,undefined);
});
test('unsafe redirects are rejected before another request; redirect count is bounded',async()=>{
 for(const location of ['https://evil.test/a','https://www.instagram.com/p/x','http://www.threads.com/a','https://user:password@www.threads.com/a']){
  const calls=[],s=createProxiedSession({proxy,platform:'threads',requestImpl:mockRequest([{status:302,headers:{location}}],calls)});
  await assert.rejects(s.request(target.url),e=>e.code==='UNSAFE_REDIRECT');assert.equal(calls.length,1);s.close();
 }
 const s=createProxiedSession({proxy,platform:'threads',requestImpl:mockRequest(Array.from({length:4},()=>({status:302,headers:{location:'/next'}})))});await assert.rejects(s.request(target.url),e=>e.code==='TOO_MANY_REDIRECTS');s.close();
});
test('decompressed response size and absolute request deadline are bounded',async()=>{
 const compressed=gzipSync('x'.repeat(5000));const s=createProxiedSession({proxy,platform:'threads',maxBytes:100,requestImpl:mockRequest([{headers:{'content-encoding':'gzip'},body:compressed}])});await assert.rejects(s.request(target.url),e=>e.code==='UPSTREAM_TOO_LARGE');s.close();
 const timeout=createProxiedSession({proxy,platform:'threads',deadline:Date.now()+15,requestImpl:mockRequest([{hang:true}])});await assert.rejects(timeout.request(target.url),e=>e.code==='UPSTREAM_TIMEOUT');timeout.close();
});
test('native Chrome zstd responses decode on supported runtimes instead of becoming empty successful data',async t=>{
 if(typeof zlib.zstdCompressSync!=='function')return t.skip('zstd requires Node 22.15+; production and parity tests run Node 24');
 const expected='{"data":{"node":{"id":"public"}}}',body=zlib.zstdCompressSync(Buffer.from(expected));const s=createProxiedSession({proxy,platform:'threads',requestImpl:mockRequest([{headers:{'content-encoding':'zstd'},body}])});try{assert.equal((await s.request(target.url)).html,expected);}finally{s.close();}
});
test('an unsupported response encoding is an explicit failure, never an empty successful parse',async()=>{
 const s=createProxiedSession({proxy,platform:'threads',requestImpl:mockRequest([{headers:{'content-encoding':'unsupported'},body:'opaque'}])});try{await assert.rejects(s.request(target.url),e=>e.code==='UPSTREAM_UNSUPPORTED_ENCODING');}finally{s.close();}
});
test('proxy acquisition timeout releases a late lease and never attempts direct Internet',async()=>{
 let released=false,created=false;const run=createHttpExecutor({timeoutMs:5,getProxy:()=>new Promise(r=>setTimeout(()=>r({release:()=>{released=true}}),25)),makeSession:()=>{created=true}});
 const r=await run(target,()=>{});assert.equal(r.reason,'UPSTREAM_TIMEOUT');assert.equal(r.transport.browserUsed,false);assert.equal(created,false);await new Promise(r=>setTimeout(r,35));assert.equal(released,true);
});
test('no-proxy, invalid proxy and origin timeout return explicit sanitized failure',async()=>{
 for(const getProxy of [async()=>null,async()=>({server:'file:///tmp/x'})]){const r=await createSocialHttpMetricsReader({getProxy})(target);assert.equal(r.status,'proxy_error');assert.equal(r.transport.browserUsed,false);assert.equal(r.metrics.likes,null);}
 let closed=false,released=false;const run=createHttpExecutor({timeoutMs:10,getProxy:async()=>({...proxy,release:()=>{released=true}}),makeSession:()=>({close(){closed=true}})});
 const r=await run(target,()=>new Promise(()=>{}));assert.equal(r.reason,'UPSTREAM_TIMEOUT');assert.equal(closed,true);assert.equal(released,true);
});
test('metrics extracts direct HTTP HTML and release errors cannot overwrite it',async()=>{
 const read=createSocialHttpMetricsReader({getProxy:async()=>({...proxy,release:()=>{throw Error('private secret')}}),makeSession:()=>({requests:1,request:async()=>({html:metaHtml,httpStatus:200,finalUrl:target.url}),close(){}})});
 const r=await read(target);assert.equal(r.status,'partial');assert.equal(r.metrics.likes,10);assert.deepEqual(r.transport,{mode:'http',browserUsed:false,anonymous:true,proxyUsed:true,requests:1});assert.ok(!JSON.stringify(r).includes('secret'));
});
test('JSON response parser supports pretty JSON and anti-XSSI NDJSON without duplicate roots',()=>{
 const v={errors:[{message:'private diagnostic',extensions:{code:'RATE_LIMITED'}}]};
 for(const raw of [JSON.stringify(v,null,2),'for (;;);'+JSON.stringify(v,null,2)]){assert.equal(snapshotPayloads('',[raw]).length,1);assert.equal(publicApiIssue([raw]).status,'rate_limited');}
 assert.equal(snapshotPayloads('',['{"a":1}\n{"b":2}']).length,2);
});
const yt=normalizeContentInput('comments',{url:'https://www.youtube.com/watch?v=abcdefghijk',limit:10,includeReplies:true});
function videoBootstrap(){
 const initial={contents:{twoColumnWatchNextResults:{results:{results:{contents:[{itemSectionRenderer:{targetId:'comments-section',contents:[{continuationItemRenderer:{continuationEndpoint:{continuationCommand:{token:'FIRST'},commandMetadata:{webCommandMetadata:{apiUrl:'/youtubei/v1/next'}}}}}]}}]}}}}};
 return `<script>ytcfg.set(${JSON.stringify({INNERTUBE_CONTEXT:{client:{clientName:'WEB',clientVersion:'test'}}})});var ytInitialData = ${JSON.stringify(initial)};var ytInitialPlayerResponse = ${JSON.stringify({videoDetails:{videoId:yt.id}})};</script>`;
}
const entity=(id,level=0)=>({commentEntityPayload:{properties:{commentId:id,replyLevel:level,content:{content:'public comment'}},author:{displayName:'Author'},toolbar:{likeCountNotliked:'1'}}});
test('YouTube HTTP pagination gets comments and replies using current bootstrap, without DOM or saved cookie/token',async()=>{
 const calls=[];const payload={onResponseReceivedEndpoints:[{reloadContinuationItemsCommand:{targetId:'comments-section',continuationItems:[]}}],frameworkUpdates:{entityBatchUpdate:{mutations:[{payload:entity('ROOT')},{payload:entity('ROOT.child',1)}]}}};
 const makeSession=()=>({requests:0,async request(url,opts){this.requests++;calls.push({url,opts});return {httpStatus:200,finalUrl:yt.url,html:opts?JSON.stringify(payload,null,2):videoBootstrap()};},close(){}});
 const r=await createSocialHttpContentReader({getProxy:async()=>proxy,makeSession})(yt);
 assert.equal(r.status,'partial');assert.equal(r.count,2);assert.equal(r.rootComments,1);assert.equal(r.replies,1);assert.equal(r.items[1].parentId,'ROOT');assert.equal(calls.length,2);assert.equal(calls[1].opts.body.context.client.clientName,'WEB');assert.equal(calls[1].opts.body.continuation,'FIRST');assert.equal(r.transport.browserUsed,false);
});
test('YouTube pagination 429 retains collected records with failure status and defers the proxy lease',async()=>{
 let n=0,deferred=0;const payload={onResponseReceivedEndpoints:[{appendContinuationItemsAction:{targetId:'comments-section',continuationItems:[{continuationItemRenderer:{continuationEndpoint:{continuationCommand:{token:'NEXT'}}}}]}}],entities:[entity('ROOT')]};
 const r=await createSocialHttpContentReader({getProxy:async()=>({...proxy,defer:ms=>{deferred=ms}}),makeSession:()=>({request:async()=>++n===1?{httpStatus:200,finalUrl:yt.url,html:videoBootstrap()}:n===2?{httpStatus:200,finalUrl:yt.url,html:JSON.stringify(payload)}:{httpStatus:429,finalUrl:yt.url,html:'',retryAfterMs:32000},close(){}})})(yt);
 assert.equal(r.status,'rate_limited');assert.equal(r.count,1);assert.equal(r.pagination.complete,false);assert.equal(deferred,32000);
});
test('continuations never consume unrelated suggested-video feeds',()=>{
 const initial={contents:{twoColumnWatchNextResults:{secondaryResults:{continuationItemRenderer:{continuationEndpoint:{continuationCommand:{token:'UNRELATED'}}}}}}};
 assert.deepEqual(youtubeContinuations({html:'<script>var ytInitialData = '+JSON.stringify(initial)+'</script>'},yt),[]);
 assert.throws(()=>assertPlatformUrl('https://youtube.com.evil.test/','youtube'));
});

test('reply continuations include nested Show more buttons but ignore recommended sections',()=>{
 const button=token=>({continuationItemRenderer:{button:{buttonRenderer:{command:{commandMetadata:{webCommandMetadata:{apiUrl:'/youtubei/v1/next'}},continuationCommand:{token}}}}}});
 const json={onResponseReceivedEndpoints:[{appendContinuationItemsAction:{targetId:'comment-replies-item-ROOT',continuationItems:[{commentThreadRenderer:{replies:{commentRepliesRenderer:{subThreads:[button('REPLY_PAGE_2')]}}}},button('REPLY_PAGE_2'),{secondaryResults:button('UNRELATED')}]}}]};
 const q=youtubeContinuations({html:'',jsonResponses:[]},yt,{response:json,reply:true});assert.deepEqual(q.map(x=>[x.token,x.reply]),[['REPLY_PAGE_2',true]]);
 assert.equal(youtubeContinuations({html:'',jsonResponses:[]},{...yt,includeReplies:false},{response:json,reply:true}).length,0);
});
test('YouTube follows Show more reply pages and reconciles per-root reply counts',async()=>{
 const button=token=>({continuationItemRenderer:{button:{buttonRenderer:{command:{continuationCommand:{token}}}}}});
 const root=entity('ROOT');root.commentEntityPayload.toolbar.replyCount='2';const tokens=[];
 const read=createSocialHttpContentReader({getProxy:async()=>proxy,makeSession:()=>({async request(url,opts){if(!opts)return{httpStatus:200,finalUrl:yt.url,html:videoBootstrap()};const token=opts.body.continuation;tokens.push(token);const j=token==='FIRST'?{entities:[root],onResponseReceivedEndpoints:[{appendContinuationItemsAction:{targetId:'comments-section',continuationItems:[{commentThreadRenderer:{replies:{commentRepliesRenderer:{subThreads:[button('REPLY1')]}}}}]}}]}:token==='REPLY1'?{entities:[entity('ROOT.a',1)],onResponseReceivedEndpoints:[{appendContinuationItemsAction:{targetId:'comment-replies-item-ROOT',continuationItems:[button('REPLY2')]}}]}:{entities:[entity('ROOT.b',1)]};return{httpStatus:200,finalUrl:yt.url,html:JSON.stringify(j)};},close(){}})});
 const r=await read(yt);assert.deepEqual(tokens,['FIRST','REPLY1','REPLY2']);assert.equal(r.rootComments,1);assert.equal(r.replies,2);assert.equal(r.coverage.missingAtLeast,0);assert.equal(r.coverage.publicPaginationComplete,true);
});

const igSourceFixture=()=>'<script type="application/json">'+JSON.stringify({data:{xdt_api__v1__feed__user_timeline_graphql_connection:{edges:[1,2].map(n=>({node:{pk:String(n),code:'POST'+n,user:{pk:'9',username:'sample'},caption:{text:'post'},like_count:1}})),page_info:{has_next_page:false}}}})+'</script>';
const igDateFixture=(n,extra={})=>'<script type="application/json">'+JSON.stringify({pk:String(n),code:'POST'+n,user:{pk:'9',username:'sample'},like_count:1,taken_at:1700000000+n,...extra})+'</script>';
test('Instagram feed hydrates only the page requested, validates identity and retains exact dates across cursors',async()=>{
 const target=normalizeContentInput('source',{url:'https://www.instagram.com/sample/',limit:1,count:2}),calls=[];
 const read=createSocialHttpContentReader({getProxy:async()=>proxy,makeSession:()=>({requests:0,async request(url){this.requests++;calls.push(url);return{httpStatus:200,finalUrl:url,html:url===target.url?igSourceFixture():igDateFixture(Number(/POST(\d)/.exec(url)[1]))};},close(){}})});
 const first=await read(target);assert.equal(first.items[0].createdAt,'2023-11-14T22:13:21.000Z');assert.equal(first.items[0].dateEvidence,'native_media.taken_at');assert.equal(calls.length,2);
 const second=await read(Object.defineProperty({...target},READ_STATE,{value:first[READ_STATE]}));assert.equal(second.items[0].createdAt,'2023-11-14T22:13:22.000Z');assert.equal(calls.length,3);assert.equal(calls.filter(x=>x===target.url).length,1);
});
test('date hydration respects a request budget and resumes before emitting an incomplete page',async()=>{
 const target=normalizeContentInput('source',{url:'https://www.instagram.com/sample/',limit:2,count:2});let calls=0;
 const read=createSocialHttpContentReader({maxPages:1,getProxy:async()=>proxy,makeSession:()=>({async request(url){calls++;return{httpStatus:200,finalUrl:url,html:url===target.url?igSourceFixture():igDateFixture(Number(/POST(\d)/.exec(url)[1]))};},close(){}})});
 const first=await read(target);assert.equal(first.phase,'collecting');assert.equal(first.count,0);assert.ok(first[READ_STATE]);
 const second=await read(Object.defineProperty({...target},READ_STATE,{value:first[READ_STATE]}));assert.equal(second.count,2);assert.ok(second.items.every(x=>x.createdAt));assert.equal(calls,3);
});
test('feed never assigns a different post timestamp and respects a date lookup gate',async()=>{
 for(const gated of [false,true]){
  const target=normalizeContentInput('source',{url:'https://www.instagram.com/sample/',limit:1});
  const read=createSocialHttpContentReader({getProxy:async()=>proxy,makeSession:()=>({async request(url){return{httpStatus:url===target.url?200:gated?429:200,finalUrl:url,html:url===target.url?igSourceFixture():igDateFixture(99,{code:'POST1'})};},close(){}})});
  const r=await read(target);if(gated){assert.equal(r.status,'rate_limited');assert.equal(r.count,0);}else assert.equal(r.items[0].createdAt,null);
 }
});

test('YouTube source uses its existing publication label without a watch request',async()=>{
 let calls=0;const target=normalizeContentInput('source',{url:'https://www.youtube.com/@sample',limit:1,count:1});
 const initial={metadata:{channelMetadataRenderer:{externalId:'UCsample',ownerUrls:['https://www.youtube.com/@sample']}},contents:{twoColumnBrowseResultsRenderer:{tabs:[{tabRenderer:{selected:true,title:'Videos',content:{videoRenderer:{videoId:'abcdefghijk',title:{simpleText:'Video'},publishedTimeText:{simpleText:'2 days ago'}}}}}]}}};
 const read=createSocialHttpContentReader({getProxy:async()=>proxy,makeSession:()=>({async request(url){calls++;return{httpStatus:200,finalUrl:url,html:url===target.url?'<script>var ytInitialData = '+JSON.stringify(initial)+';</script>':'<script>var ytInitialPlayerResponse = '+JSON.stringify({videoDetails:{videoId:'abcdefghijk',title:'Video',viewCount:'2'},microformat:{playerMicroformatRenderer:{publishDate:'2026-10-24T21:00:20-07:00'}}})+';</script>'};},close(){}})});
 const r=await read(target);assert.equal(calls,1);assert.equal(r.items[0].dateIsEstimated,true);assert.equal(r.items[0].publishedText,'2 days ago');assert.ok(Math.abs(Date.parse(r.items[0].createdAt)-(Date.now()-2*86400000))<5000);assert.equal(r.ordering.missingTimestamps,0);
});
test('source date hydration after proxy expiry does not replay already delivered videos',async()=>{
 const target=normalizeContentInput('source',{url:'https://www.youtube.com/@sample',limit:1,count:3});const ids=['abcdefghijk','lmnopqrstuv','zyxwvutsrqp'];
 const initial={metadata:{channelMetadataRenderer:{externalId:'UCsample',ownerUrls:['https://www.youtube.com/@sample']}},contents:{twoColumnBrowseResultsRenderer:{tabs:[{tabRenderer:{selected:true,title:'Videos',content:{richGridRenderer:{contents:[...ids.map(id=>({videoRenderer:{videoId:id,title:{simpleText:id}}})),{continuationItemRenderer:{continuationEndpoint:{continuationCommand:{token:'PAGE2'}}}}]}}}}]}}};
 let leases=0;const provider=async()=>({...proxy,managed:true,expiresAt:Date.now()+60000,heartbeat:async()=>({}),permit:async()=>({}),report:async()=>({}),release:async()=>{}});provider.managed=true;
 const read=createSocialHttpContentReader({getProxy:async()=>{leases++;return {...await provider(),server:'http://proxy-'+leases+'.test:8888'};},makeSession:()=>({async request(url){const id=new URL(url).searchParams.get('v');return{httpStatus:200,finalUrl:url,html:id?'<script>var ytInitialPlayerResponse = '+JSON.stringify({videoDetails:{videoId:id,viewCount:'1'},microformat:{playerMicroformatRenderer:{publishDate:'2026-10-24T10:00:00Z'}}})+';</script>':'<script>ytcfg.set({"INNERTUBE_CONTEXT":{"client":{"clientName":"WEB"}}});var ytInitialData = '+JSON.stringify(initial)+';</script>'};},close(){}})});
 const first=await read(target);assert.equal(first.items[0].id,ids[0]);first[READ_STATE][HTTP_BINDING].lease.expiresAt=Date.now()-1;
 const second=await read(Object.defineProperty({...target},READ_STATE,{value:first[READ_STATE]}));assert.equal(second.items[0].id,ids[1]);assert.ok(second.items[0].createdAt);assert.equal(leases,2);await second[READ_STATE]?.[HTTP_BINDING]?.dispose?.();
});
function searchBootstrap(){return '<script>ytcfg.set({"INNERTUBE_CONTEXT":{"client":{"clientName":"WEB"}}});var ytInitialData = '+JSON.stringify({contents:{twoColumnSearchResultsRenderer:{primaryContents:{itemSectionRenderer:{contents:[{videoRenderer:{videoId:'abcdefghijk',title:{simpleText:'first'}}},{continuationItemRenderer:{continuationEndpoint:{continuationCommand:{token:'SEARCH1'}}}}]}}}}})+';</script>';}
test('a search HTTP page budget with no new records remains collecting and resumes',async()=>{
 const t=normalizeContentInput('search',{platform:'youtube',keyword:'sample',order:'relevance',limit:1,count:3});let n=0;
 const read=createSocialHttpContentReader({maxPages:1,getProxy:async()=>proxy,makeSession:()=>({async request(url,opts){if(!opts)return{httpStatus:200,finalUrl:t.url,html:searchBootstrap()};n++;const items=n===1?[{continuationItemRenderer:{continuationEndpoint:{continuationCommand:{token:'SEARCH2'}}}}]:[{videoRenderer:{videoId:'lmnopqrstuv',title:{simpleText:'next'}}}];return{httpStatus:200,finalUrl:t.url,html:JSON.stringify({onResponseReceivedCommands:[{appendContinuationItemsAction:{targetId:'search-feed',continuationItems:items}}]})};},close(){}})});
 const a=await read(t);const b=await read(Object.defineProperty({...t},READ_STATE,{value:a[READ_STATE]}));assert.equal(b.status,'partial');assert.equal(b.phase,'collecting');assert.equal(b.count,0);assert.ok(b[READ_STATE]);const c=await read(Object.defineProperty({...t},READ_STATE,{value:b[READ_STATE]}));assert.equal(c.items[0].id,'lmnopqrstuv');
});
test('repeated upstream search pages stop without duplicate records or claiming complete coverage',async()=>{
 const t=normalizeContentInput('search',{platform:'youtube',keyword:'sample',order:'relevance',limit:1,count:3});let n=0;
 const read=createSocialHttpContentReader({getProxy:async()=>proxy,makeSession:()=>({async request(url,opts){if(!opts)return{httpStatus:200,finalUrl:t.url,html:searchBootstrap()};return{httpStatus:200,finalUrl:t.url,html:JSON.stringify({onResponseReceivedCommands:[{appendContinuationItemsAction:{targetId:'search-feed',continuationItems:[{videoRenderer:{videoId:'abcdefghijk',title:{simpleText:'duplicate'}}},{continuationItemRenderer:{continuationEndpoint:{continuationCommand:{token:'LOOP'+(++n)}}}}]}}]})};},close(){}})});
 const a=await read(t),b=await read(Object.defineProperty({...t},READ_STATE,{value:a[READ_STATE]}));assert.equal(b.count,0);assert.equal(n,2);assert.equal(b.status,'partial');assert.equal(b.pagination.hasMore,false);assert.equal(b.reason,'UPSTREAM_REPEATED_PAGE');assert.equal(b.coverage.complete,false);assert.equal(b.coverage.exhausted,false);
});
test('an empty last search page after delivered results is a normal end, not unavailable',async()=>{
 const t=normalizeContentInput('search',{platform:'youtube',keyword:'sample',order:'relevance',limit:1,count:3});
 const read=createSocialHttpContentReader({getProxy:async()=>proxy,makeSession:()=>({async request(url,opts){return{httpStatus:200,finalUrl:t.url,html:opts?JSON.stringify({onResponseReceivedCommands:[{appendContinuationItemsAction:{targetId:'search-feed',continuationItems:[]}}]}):searchBootstrap()};},close(){}})});
 const a=await read(t),b=await read(Object.defineProperty({...t},READ_STATE,{value:a[READ_STATE]}));assert.equal(a.count,1);assert.equal(b.status,'ok');assert.equal(b.reason,'NO_MORE_PUBLIC_ITEMS');assert.equal(b.count,0);assert.equal(b.pagination.hasMore,false);assert.equal(b.coverage.exhausted,true);assert.equal(b.coverage.complete,false);
});

test('Threads/Instagram HTTP replay preserves remaining bootstrap records before declaring pagination unavailable',async()=>{
 const target=normalizeContentInput('source',{url:'https://www.instagram.com/sample/',limit:1});
 const html='<script type="application/json">'+JSON.stringify({data:{xdt_api__v1__feed__user_timeline_graphql_connection:{edges:[1,2,3].map(n=>({node:{id:String(n),code:'CODE'+n,user:{username:'sample'},caption:{text:'post'}}})),page_info:{has_next_page:true}}}})+'</script>';
 const read=createSocialHttpContentReader({getProxy:async()=>proxy,makeSession:()=>({request:async()=>({html,httpStatus:200,finalUrl:target.url}),close(){}})});
 const first=await read(target);assert.equal(first.items[0].id,'1');assert.equal(first.pagination.reason,'BUFFERED_ITEMS');
 const next=await read({...target,seenIds:['1']});assert.equal(next.items[0].id,'2');assert.equal(next.pagination.reason,'BUFFERED_ITEMS');
 const last=await read({...target,seenIds:['1','2']});assert.equal(last.items[0].id,'3');assert.equal(last.pagination.reason,'NATIVE_PAGINATION_UNAVAILABLE');assert.equal(last.pagination.complete,false);
});

test('YouTube metrics resolves a placeholder comment header once, with exact zero retained and no crawl started',async()=>{
 for(const count of [0,5,7]){const calls=[];const read=createSocialHttpMetricsReader({getProxy:async()=>proxy,makeSession:()=>({async request(url,opts){calls.push({url,opts});return{httpStatus:200,finalUrl:yt.url,html:opts?JSON.stringify({onResponseReceivedEndpoints:[{reloadContinuationItemsCommand:{targetId:'comments-section',continuationItems:[{commentsHeaderRenderer:{countText:{runs:[{text:String(count)},{text:' Comments'}]}}}]}}]}):videoBootstrap()};},close(){}})});
 const r=await read(normalizeMetricsInput({url:yt.url}));assert.equal(r.metrics.comment,count);assert.equal(r.identityVerified,true);assert.equal(calls.length,2);assert.equal(calls[1].opts.body.continuation,'FIRST');assert.equal(r.items,undefined);}
});
test('YouTube exact bootstrap zero and unknown identity never request comment headers',async()=>{
 for(const verified of [true,false]){let requests=0;const initial={commentsHeaderRenderer:{countText:{simpleText:'0 Comments'}}};const html='<script>var ytInitialData = '+JSON.stringify(initial)+';var ytInitialPlayerResponse = '+JSON.stringify({videoDetails:{videoId:verified?yt.id:'other'}})+';</script>';
 const r=await createSocialHttpMetricsReader({getProxy:async()=>proxy,makeSession:()=>({async request(){requests++;return{httpStatus:200,finalUrl:yt.url,html};},close(){}})})(normalizeMetricsInput({url:yt.url}));assert.equal(requests,1);assert.equal(r.metrics.comment,verified?0:null);}
});
test('YouTube header verification preserves rate limits and cannot turn an approximate count into an exact count',async()=>{
 for(const code of [200,429]){let calls=0;const r=await createSocialHttpMetricsReader({getProxy:async()=>proxy,makeSession:()=>({async request(){calls++;return calls===1?{httpStatus:200,finalUrl:yt.url,html:videoBootstrap()}:{httpStatus:code,finalUrl:yt.url,html:JSON.stringify({commentsHeaderRenderer:{countText:{simpleText:'1.2K Comments'}}}),retryAfterMs:32000};},close(){}})})(normalizeMetricsInput({url:yt.url}));assert.equal(calls,2);assert.equal(r.metrics.comment,null);if(code===429){assert.equal(r.status,'rate_limited');assert.equal(r.retryAfterMs,32000);}}
});
test('YouTube HTTP 200 API error is a failed request, never an exhausted empty page',async()=>{
 const read=createSocialHttpContentReader({respectPlatformCooldown:false,getProxy:async()=>proxy,makeSession:()=>({requests:0,close(){},async request(url,opts){this.requests++;return{httpStatus:200,finalUrl:yt.url,html:opts?JSON.stringify({error:{code:400,message:'Invalid continuation request'}}):videoBootstrap()};}})});
 const r=await read(yt);assert.equal(r.status,'error');assert.equal(r.reason,'UPSTREAM_API_ERROR');assert.equal(r.pagination.complete,false);assert.ok(r[READ_STATE]);assert.equal(r[READ_STATE].queue[0].token,'FIRST');assert.equal(r[READ_STATE].visited.size,0);
});
test('YouTube metrics header API errors, malformed JSON and non200 remain explicit failures with unknown counters',async()=>{
 const cases=[{body:{error:{code:400,message:'Invalid continuation request'}},reason:'UPSTREAM_API_ERROR',status:'error'},{body:{error:{code:403,message:'Login required'}},reason:'UPSTREAM_API_AUTH_REQUIRED',status:'auth_required'},{body:{error:{code:429,message:'Too many requests'}},reason:'UPSTREAM_API_RATE_LIMITED',status:'rate_limited'},{raw:'{broken',reason:'UPSTREAM_INVALID_JSON',status:'error'},{body:null,reason:'UPSTREAM_API_RESPONSE_UNVERIFIED',status:'error'},{http:404,raw:'not found',reason:'UPSTREAM_HTTP_404',status:'error'}];
 for(const c of cases){let calls=0;const read=createSocialHttpMetricsReader({respectPlatformCooldown:false,failFastProxy:true,getProxy:async()=>proxy,makeSession:()=>({requests:0,close(){},async request(){this.requests++;return ++calls===1?{httpStatus:200,finalUrl:yt.url,html:videoBootstrap()}:{httpStatus:c.http||200,finalUrl:yt.url,html:c.raw??JSON.stringify(c.body),retryAfterMs:32000};}})}),r=await read(normalizeMetricsInput({url:yt.url}));assert.equal(calls,2);assert.equal(r.status,c.status,c.reason);assert.equal(r.reason,c.reason);assert.equal(r.metrics.comment,null);if(c.status==='rate_limited')assert.equal(r.retryAfterMs,32000);}
});

test('origin 429 immediately releases a managed worker lease but never proves proxy limit or quarantine',async()=>{
 let released=0,acquired=0;const reports=[];
 const getProxy=async()=>{acquired++;return {...proxy,managed:true,permit:async()=>{},release:async()=>released++,report:async r=>{reports.push(r);return{};}};};
 const execute=createHttpExecutor({getProxy,timeoutMs:500,failFastProxy:true,makeSession:o=>createProxiedSession({...o,requestImpl:mockRequest([{status:429,headers:{'retry-after':'7','content-encoding':'invalid-error-encoding'},body:'not decoded'}])})});
 const result=await execute(target,async session=>{const response=await session.request(target.url);assert.equal(response.html,'');assert.equal(response.httpStatus,429);return {status:'rate_limited',reason:'HTTP_429',retryAfterMs:response.retryAfterMs};},{});
 assert.equal(result.status,'rate_limited');assert.equal(result.retryAfterMs,7000);assert.equal(result.transport.proxyLimitEvidence,undefined);assert.equal(result.transport.networkTimings[0].bodySkipped,true);
 assert.equal(acquired,1);assert.equal(released,1);assert.equal(reports.length,1);assert.equal(reports[0].status,'error');
});

test('wire/decode telemetry counts compressed bytes separately and keeps content out of evidence',async()=>{
 const raw='private response content '.repeat(200),body=gzipSync(raw),session=createProxiedSession({proxy,platform:'threads',requestImpl:mockRequest([{headers:{'content-encoding':'gzip','content-length':String(body.length)},body}])});
 try{assert.equal((await session.request(target.url)).html,raw);const t=session.requestTimings[0];assert.equal(t.wireBytes,body.length);assert.equal(t.declaredWireBytes,body.length);assert.equal(t.decodedBytes,Buffer.byteLength(raw));assert.equal(t.bodyEncoding,'gzip');assert.equal(typeof t.wireEndedMs,'number');assert.ok(t.decodedEndedMs>=t.wireEndedMs);assert.ok(!JSON.stringify(t).includes('private'));assert.ok(!JSON.stringify(t).includes('threads.com'));}finally{session.close();}
});

test('Brotli chunks preserve complete UTF8 payload and reject oversized or truncated bodies',async()=>{
 const raw=JSON.stringify({nativeId:'owned-public-id',text:'dữ liệu gốc 日本語'.repeat(10000)}),body=zlib.brotliCompressSync(Buffer.from(raw));
 for(const variant of ['complete','oversize','truncated']){const session=createProxiedSession({proxy,platform:'threads',maxBytes:variant==='oversize'?100:12000000,requestImpl:mockRequest([{headers:{'content-encoding':'br'},body:variant==='truncated'?body.subarray(0,body.length-4):body}])});try{if(variant==='complete')assert.equal((await session.request(target.url)).html,raw);else await assert.rejects(session.request(target.url),variant==='oversize'?e=>e.code==='UPSTREAM_TOO_LARGE':undefined);}finally{session.close();}}
});

test('configured Facebook cookies stay inside one session and exact host and cannot seed other platforms',async()=>{
 const calls=[],session=createProxiedSession({proxy,platform:'facebook',requestImpl:mockRequest([{},{},{}],calls)});
 try{session.seedFacebookCookies('c_user=123; xs=owned-facebook-session');await session.request('https://www.facebook.com/');await session.request('https://m.facebook.com/');assert.equal(calls[0].options.headers.cookie,'c_user=123; xs=owned-facebook-session');assert.equal(calls[1].options.headers.cookie,undefined);assert.throws(()=>session.seedFacebookCookies('c_user=456; xs=another-session'),e=>e.code==='FACEBOOK_SESSION_COOKIE_INVALID');assert.ok(!JSON.stringify(session.requestTimings).includes('owned-facebook-session'));}finally{session.close();}
 const other=createProxiedSession({proxy,platform:'threads'});try{assert.throws(()=>other.seedFacebookCookies('c_user=123; xs=owned-facebook-session'));}finally{other.close();}
});
