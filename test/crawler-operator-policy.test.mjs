import test from 'node:test';import assert from 'node:assert/strict';
import {FLOW_DONE_REASONS,FLOW_ROTATE_REASONS,FLOW_RETRY_LIMIT,boundedProxyRead,applyFlowCounterDefaults,flowCommentPaginationDone} from '../src/services/crawlerQueueFlow.js';
import {sourceRoundOutcome} from '../src/services/crawlerSourceRounds.js';
import {publicationTextTime,youtubePublicationTime} from '../src/services/socialPublicationTime.js';
import {extractPostInfo} from '../src/services/socialPostInfo.js';import {normalizeMetricsInput} from '../src/services/socialMetrics.js';
import {bindFacebookUserPost} from '../src/services/facebookUserPostBinding.js';import {serializeCrawlItem} from '../src/services/crawlerV8Es5.js';
import {postCommentTarget} from '../src/services/crawlerPostHandoff.js';
import {createProxiedSession} from '../src/services/socialHttpTransport.js';import {EventEmitter} from 'node:events';
test('blocked redirects retain public routes without query strings or credentials',async()=>{
 const requestImpl=(_url,_opts,callback)=>{const req=new EventEmitter();req.destroy=()=>{};req.end=()=>queueMicrotask(()=>{const res=new EventEmitter();res.statusCode=302;res.headers={location:'https://user:secret@accounts.google.com/signin?token=private'};res.resume=()=>{};callback(res);});return req;};
 const session=createProxiedSession({platform:'youtube',proxy:{server:'http://proxy.test:8080'},deadline:Date.now()+1000,requestImpl});try{await assert.rejects(()=>session.request('https://www.youtube.com/watch?v=abcdefghijk'),e=>e.code==='UNSAFE_REDIRECT');const record=session.requestTimings.at(-1).blockedRedirect;assert.equal(record.from,'https://www.youtube.com/watch');assert.equal(record.to,'https://accounts.google.com/signin');assert.ok(!JSON.stringify(record).includes('secret'));assert.ok(!JSON.stringify(record).includes('private'));}finally{session.close();}
});
test('operator terminal reasons complete once, retain the reason, and never rotate',async()=>{
 for(const reason of FLOW_DONE_REASONS){let reads=0,saved=0;const r=await boundedProxyRead({read:async()=>{reads++;return{good:false,result:{status:'error',reason}};},rotate:async()=>assert.fail('terminal must not rotate'),onFailure:async()=>saved++});assert.equal(r.done,true,reason);assert.equal(r.failed,undefined);assert.equal(r.lastResult.reason,reason);assert.equal(reads,1);assert.equal(saved,1);assert.equal(sourceRoundOutcome(null,{done:true,reason}),'skipped');}
});
test('selected transient errors release/rotate and can succeed on the next attempt',async()=>{
 for(const reason of FLOW_ROTATE_REASONS){let reads=0,rotations=0;const result={status:'error',reason};const r=await boundedProxyRead({read:async()=>++reads===1?{good:false,result}:{good:true,result:{status:'ok'}},rotate:async()=>rotations++});assert.equal(r.good,true,reason);assert.equal(reads,2);assert.equal(rotations,1);}
});
test('transient failures allow 100 retries and retain failure after exhaustion',async()=>{let reads=0,rotations=0,saved=0;const r=await boundedProxyRead({read:async()=>{reads++;return{good:false,result:{reason:'UPSTREAM_TIMEOUT'}};},rotate:async()=>rotations++,onFailure:async()=>saved++});assert.equal(r.exhausted,true);assert.equal(reads,101);assert.equal(rotations,FLOW_RETRY_LIMIT);assert.equal(saved,1);});
test('unknown counters default to one comment and zero other unknown metrics; native zero stays zero',()=>{
 const i=applyFlowCounterDefaults({id:'1',metrics:{likes:9,comment:null}});assert.equal(i.metrics.comment,1);assert.equal(i.metrics.likes,9);assert.equal(i.metrics.shares,0);assert.equal(i.metrics.views,0);assert.equal(i.counterDefaults.commentDefaulted,true);
 const zero={metrics:{comment:0,likes:0}};assert.equal(applyFlowCounterDefaults(zero),zero);
 const explicit=applyFlowCounterDefaults({metrics:{comment:0,likes:null}},'PUBLIC_COUNTERS_NOT_RETURNED');assert.equal(explicit.metrics.comment,0);assert.equal(explicit.metrics.likes,0);
});
test('display count mismatch cannot fail exhausted comments, but pagination gaps and orphan replies remain failures',()=>{
 for(const reason of ['PUBLIC_COMMENT_COUNT_MISMATCH','COMMENT_COUNT_UNVERIFIED','PUBLIC_REPLY_COUNT_MISMATCH']){const r={pagination:{hasMore:false},coverage:{complete:false,exhausted:true,reason,orphanReplies:0}};assert.equal(flowCommentPaginationDone(r),true);assert.equal(flowCommentPaginationDone({...r,pagination:{hasMore:true}}),false);assert.equal(flowCommentPaginationDone({...r,coverage:{...r.coverage,exhausted:false}}),false);assert.equal(flowCommentPaginationDone({...r,coverage:{...r.coverage,orphanReplies:1}}),false);}
 assert.equal(flowCommentPaginationDone({pagination:{hasMore:false},coverage:{complete:false,exhausted:false,reason:'NATIVE_REPLY_PAGINATION_UNAVAILABLE'}}),false);
});
test('YouTube publication prioritizes full native time, then day-only and supported visible text',()=>{
 assert.equal(youtubePublicationTime({microformat:{playerMicroformatRenderer:{publishDate:'2026-10-27',uploadDate:'2026-10-26T22:18:11-07:00'}}}).createdAt,'2026-10-27T05:18:11.000Z');
 assert.equal(youtubePublicationTime({microformat:{playerMicroformatRenderer:{publishDate:'2026-10-27'}}}).datePrecision,'day');
 assert.equal(publicationTextTime('Premiered Oct 27, 2026').createdAt,'2026-10-27T00:00:00.000Z');
 assert.equal(publicationTextTime('27 tháng 10, 2026').createdAt,'2026-10-27T00:00:00.000Z');
 const r=publicationTextTime('Streamed live 2 hours ago','2026-10-28T08:00:00Z');assert.equal(r.createdAt,'2026-10-28T06:00:00.000Z');assert.equal(r.dateIsEstimated,true);
 assert.equal(publicationTextTime('2026-02-31'),null);assert.equal(publicationTextTime('1,234 views'),null);
});
test('bound YouTube watch metadata provides a date when player microformat has none',()=>{
 const id='XnB4QnMv6m4',target=normalizeMetricsInput({url:'https://www.youtube.com/watch?v='+id});
 const html='<meta itemprop="datePublished" content="2026-10-27"><script>var ytInitialPlayerResponse = '+JSON.stringify({videoDetails:{videoId:id,channelId:'UCsample',title:'Video'}})+';</script>';
 const r=extractPostInfo(target,{httpStatus:200,finalUrl:target.url,html});assert.equal(r.post.createdAt,'2026-10-27T00:00:00.000Z');assert.equal(r.post.datePrecision,'day');
 const wrong=extractPostInfo({...target,id:'abcdefghijk'},{httpStatus:200,finalUrl:target.url,html});assert.equal(wrong.post,null);
});
test('foreign Facebook page author owns canonical ES identity and comment target, with source discovery preserved',()=>{
 const source={_id:'facebook:page:102662378228953',platform:'facebook',type:'page',nativeId:'102662378228953',name:'Tagged page'},item={type:'post',id:source.nativeId+'_1574578298050185',postId:'1574578298050185',sourceId:source.nativeId,createdAt:'2026-10-28T04:00:00Z',author:{id:'100064940883948',name:'GO Việt Nam'},metrics:{comment:1}};
 const b=bindFacebookUserPost(item,source),doc=serializeCrawlItem(b.item,b.source),target=postCommentTarget({doc,item:b.item,source:b.source});
 assert.equal(doc._source.authorId,'100064940883948');assert.equal(doc._source.siteId,doc._source.authorId);assert.equal(doc._source.author,'GO Việt Nam');assert.equal(doc._source.siteName,'GO Việt Nam');assert.equal(target.fields.parent.systemId,'100064940883948_1574578298050185');assert.equal(b.source.discoveredFromSourceId,source._id);
});
test('modern YouTube source dates use bound visible metadata when watch time is missing',async()=>{
 const {createSocialHttpContentReader}=await import('../src/services/socialHttpReaders.js'),{normalizeContentInput}=await import('../src/services/socialContent.js'),{READ_STATE}=await import('../src/services/socialReadState.js');const id='abcdefghijk',url='https://www.youtube.com/@sample',observedAt='2026-10-28T08:00:00Z';
 const state={kind:'youtube',items:[{id,url:'https://www.youtube.com/watch?v='+id,type:'post',publishedText:'Streamed live 2 hours ago',createdAt:null}],offset:0,collecting:false,streamMore:false,dateAttempts:new Set(),dateObservedAt:observedAt,base:{status:'partial',identityVerified:true,pagination:{hasMore:false}},queue:[],seenIds:new Set([id])};
 const read=createSocialHttpContentReader({requireSourcePublicationTime:true,maxPages:1,respectPlatformCooldown:false,getProxy:async()=>({server:'http://proxy.test:8888'}),makeSession:()=>({requests:0,close(){},async request(u){return{httpStatus:200,finalUrl:u,html:'<script>var ytInitialPlayerResponse = '+JSON.stringify({videoDetails:{videoId:id}})+';</script>'};}})});
 const r=await read({...normalizeContentInput('source',{url,count:'all',limit:100}),[READ_STATE]:state});assert.equal(r.items[0].createdAt,'2026-10-28T06:00:00.000Z');assert.equal(r.items[0].dateIsEstimated,true);assert.equal(r.items[0].dateObservedAt,observedAt.replace('Z','.000Z'));assert.equal(r.pagination.hasMore,false);
});

test('unavailable comments are terminal without spending a retry',async()=>{
 for(const reason of ['COMMENTS_UNAVAILABLE']){
  assert.ok(FLOW_DONE_REASONS.has(reason));let reads=0,retries=0;
  const outcome=await boundedProxyRead({read:async()=>{reads++;return{good:false,result:{status:'error',reason}};},rotate:async()=>retries++});
  assert.equal(outcome.done,true);assert.equal(outcome.lastResult.reason,reason);assert.equal(reads,1);assert.equal(retries,0);
 }
});
test('raw and wrapped connection resets rotate at most 100 times instead of completing',async()=>{
 const cases=[{reason:'ECONNRESET'},{reason:'NETWORK_ERROR',upstreamCode:'ECONNRESET'},{reason:'UPSTREAM_NETWORK_ERROR',upstreamCode:'ECONNRESET'}];
 assert.ok(!FLOW_DONE_REASONS.has('ECONNRESET'));assert.ok(FLOW_ROTATE_REASONS.has('ECONNRESET'));
 for(const value of cases){let reads=0,rotations=0;const result=await boundedProxyRead({read:async()=>{reads++;return{good:false,result:{status:'error',...value}};},rotate:async()=>rotations++});assert.equal(result.exhausted,true);assert.equal(result.done,undefined);assert.equal(reads,101);assert.equal(rotations,100);assert.equal(result.lastResult.reason,value.reason);}
});

test('API errors stay terminal, origin429 waits, and selected network errors retain 100 proxy changes',async()=>{
 assert.ok(!FLOW_DONE_REASONS.has('UPSTREAM_API_ERROR'));assert.ok(!FLOW_ROTATE_REASONS.has('UPSTREAM_API_ERROR'));
 const api=await boundedProxyRead({read:async()=>({good:false,result:{reason:'UPSTREAM_API_ERROR'}}),rotate:async()=>assert.fail('API error must not rotate')});assert.equal(api.failed,true);assert.notEqual(api.done,true);
 let originReads=0;const origin=await boundedProxyRead({read:async()=>{originReads++;return{good:false,result:{reason:'UPSTREAM_HTTP_429'}};},rotate:()=>assert.fail('origin429 must not rotate')});assert.equal(origin.originDeferred,true);assert.equal(origin.retryAfterMs,900000);assert.equal(originReads,1);
 for(const reason of ['NETWORK_ERROR','UPSTREAM_NETWORK_ERROR']){let reads=0,rotations=0;const result=await boundedProxyRead({read:async()=>{reads++;return{good:false,result:{status:'error',reason}};},rotate:async()=>rotations++});assert.equal(result.exhausted,true,reason);assert.equal(rotations,100,reason);assert.equal(reads,101,reason);}
});
