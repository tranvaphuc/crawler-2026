import test from 'node:test';
import assert from 'node:assert/strict';
import {FLOW_QUEUES,FLOW_RETRY_LIMIT,JOB_OPTIONS,detectedSource,sourcePageDecision,facebookContinuationJobs,unpackState,interactionDate} from '../src/services/crawlerQueueFlow.js';
const limited=()=>({status:'proxy_error',reason:'PROXY_CONNECT_RATE_LIMITED',transport:{manager:true,proxyEndpoint:'a'.repeat(64),proxyLimitEvidence:{source:'proxy_connect',httpStatus:429,scope:'proxy',confirmed:true,endpoint:'a'.repeat(64)}}});
const source={_id:'facebook:page:1',platform:'facebook',type:'page',nativeId:'1',url:'https://www.facebook.com/1',eligible:true,identityStatus:'verified',identityProof:{nativeId:'1',type:'page'}};
test('crawl queues retain fixed budgets with separate import and three-worker UID queues',()=>{
 assert.deepEqual(FLOW_QUEUES.map(q=>q.workers),[30,60,10,5,5,5,150,70,5,30,5,80,3]);
 assert.equal(FLOW_QUEUES.filter(q=>['source','comments','reply'].includes(q.kind)).reduce((n,q)=>n+q.workers,0),375);
 assert.deepEqual(JOB_OPTIONS,{removeOnComplete:true,removeOnFail:false,attempts:1});
});
test('admission excludes unverified, redirected and incorrectly detected sources',()=>{
 assert.equal(detectedSource(source),true);
 for(const delta of [{identityStatus:'unverified'},{identityProof:{nativeId:'2',type:'page'}},{type:'unknown'},{eligible:false},{canonicalSourceId:'other'}])assert.equal(detectedSource({...source,...delta}),false);
 assert.equal(detectedSource({platform:'instagram',type:'profile',nativeId:'2',url:'https://www.instagram.com/a',eligible:true,audit:{status:'live'}}),true);
});
test('first page and old pinned posts allow continuation; native exhaustion still stops',()=>{
 const cutoff=Date.parse('2026-10-24T00:00:00Z'),items=[{createdAt:'2020-01-01T00:00:00Z',pinned:true}];
 assert.equal(sourcePageDecision({items,page:1,cutoff,hasMore:true}),false);
 assert.equal(sourcePageDecision({items,page:2,cutoff,hasMore:true}),false);
 assert.equal(sourcePageDecision({items:[],page:2,cutoff,hasMore:true}),false);
 assert.equal(sourcePageDecision({items:[],page:1,cutoff,hasMore:true,phase:'collecting'}),false);
 assert.equal(sourcePageDecision({items:[{createdAt:'2026-10-27T00:00:00Z'}],page:1,cutoff,hasMore:false}),true);
});
test('72h boundary ignores pins and stops mixed or streamed batches only from page two',()=>{
 const cutoff=Date.parse('2026-10-24T00:00:00Z');
 const recent={createdAt:new Date(cutoff+1).toISOString()},boundary={createdAt:new Date(cutoff).toISOString()},old={createdAt:new Date(cutoff-1).toISOString(),pinned:false};
 for(const phase of [undefined,'collecting'])for(const page of [0,1,2,10]){
  assert.equal(sourcePageDecision({items:[recent,boundary,{createdAt:null}],page,phase,cutoff,hasMore:true}),false);
  assert.equal(sourcePageDecision({items:[recent,old,boundary],page,phase,cutoff,hasMore:true}),page>=2);
  assert.equal(sourcePageDecision({items:[recent,{...old,pinned:true},boundary],page,phase,cutoff,hasMore:true}),false);
  assert.equal(sourcePageDecision({items:[{...old,pinned:true},old],page,phase,cutoff,hasMore:true}),page>=2);
 }
});
test('Facebook continuations preserve exact native cursors and route roots and replies into separate jobs',()=>{
 const queue=[{idGetComment:'100',cursor:'ROOT_2'},{idGetComment:'201',cursor:'REPLY_1'}];
 const children=facebookContinuationJobs({queue,items:[]},'100');assert.deepEqual(children.map(j=>j.kind),['comments','reply']);
 for(const [i,child]of children.entries()){const state=unpackState(child.checkpoint);assert.deepEqual(state.queue,[queue[i]]);assert.equal(state.seen.size,0);assert.equal(state.pending,true);assert.ok(!child.checkpoint.includes('password'));}
 assert.throws(()=>facebookContinuationJobs({queue,items:[{id:'not-delivered'}]},'100'),/BUFFER_NOT_DRAINED/);
});
test('interaction advances using comment publication and never regresses',()=>{
 assert.equal(interactionDate('2026-10-27T00:00:00Z','2026-10-24T00:00:00Z').toISOString(),'2026-10-27T00:00:00.000Z');
 assert.equal(interactionDate('2026-10-24T00:00:00Z','2026-10-27T00:00:00Z').toISOString(),'2026-10-27T00:00:00.000Z');
});

test('confirmed proxy limits acquire a fresh proxy 100 times and exhaust after 101 attempts',async()=>{
 const {boundedProxyRead}=await import('../src/services/crawlerQueueFlow.js');let calls=0,rotations=0;const retries=[];
 const outcome=await boundedProxyRead({read:async()=>{calls++;return{good:false,result:limited()};},rotate:async()=>rotations++,onRetry:async n=>retries.push(n)});
 assert.equal(outcome.exhausted,true);assert.equal(calls,101);assert.equal(rotations,100);assert.deepEqual(retries,Array.from({length:100},(_,i)=>i+1));
});
test('persisted retry budget is respected across restart and success ends immediately',async()=>{
 const {boundedProxyRead}=await import('../src/services/crawlerQueueFlow.js');let calls=0,rotations=0;
 const result=await boundedProxyRead({initialRetries:FLOW_RETRY_LIMIT-1,read:async()=>({good:++calls===2,result:calls===2?{status:'ok'}:limited()}),rotate:async()=>rotations++});
 assert.equal(result.good,true);assert.equal(rotations,1);
 let read=false;await assert.rejects(()=>boundedProxyRead({read:async()=>{read=true;},rotate:async()=>{},shouldStop:()=>true}),/WORKER_STOPPED/);assert.equal(read,false);
});

test('Facebook root worker performs one request; fresh reply worker receives post ID, parent ID and native cursor',async()=>{
 const {createFacebookContentHttpReader}=await import('../src/services/facebookContentHttp.js');
 const {normalizeContentInput}=await import('../src/services/socialContent.js');
 const {READ_STATE}=await import('../src/services/socialReadState.js');
 const calls=[];
 const read=createFacebookContentHttpReader({splitFacebookPages:true,maxPages:1,streamComments:true,getProxy:async()=>({server:'http://proxy.test:8888'}),makeSession:()=>({requests:0,close(){}}),createCommentFetcher:()=>async input=>{
  calls.push(input);const root=input.idGetComment==='100';
  return{comments:root?[{_id:'201',repliesCount:1,replyCursor:'REPLY_CURSOR'},{_id:'202',repliesCount:null},{_id:'203',repliesCount:0}]:[{_id:'301',repliesCount:0}],hasNextPage:root,cursor:root?'ROOT_CURSOR':null,ordering:{unfilteredVerified:true}};
 }});
 const target=normalizeContentInput('comments',{url:'https://www.facebook.com/9_100',sourceType:'group',includeReplies:true,limit:100});
 const first=await read(target);assert.equal(calls.length,1);
 const children=facebookContinuationJobs(first[READ_STATE],'100');assert.equal(children.length,2);
 const reply=children.find(j=>j.kind==='reply');await read({...target,[READ_STATE]:unpackState(reply.checkpoint)});
 assert.equal(calls.length,2);assert.equal(calls[1].idPost,'100');assert.equal(calls[1].idGetComment,'201');assert.equal(calls[1].cursor,'REPLY_CURSOR');assert.equal(calls[1].sourceType,'group');
});

test('jobs checkpointed above the retry limit finish without another upstream request',async()=>{
 const {boundedProxyRead}=await import('../src/services/crawlerQueueFlow.js');
 let calls=0;
 const outcome=await boundedProxyRead({initialRetries:FLOW_RETRY_LIMIT+1,read:async()=>{calls++;},rotate:async()=>{throw Error('UNEXPECTED_ROTATION');}});
 assert.equal(outcome.exhausted,true);assert.equal(calls,0);
});

test('unlisted assignment failures retain their failures without rotation',async()=>{
 const {boundedProxyRead,confirmedProxyLimit}=await import('../src/services/crawlerQueueFlow.js');
 for(const reason of ['PROXY_POOL_BUSY','PROXY_ASSIGNMENT_BACKOFF','PROXY_ASSIGNMENT_COOLDOWN']){
  let reads=0,failures=0;const result={status:'error',reason,transport:{manager:true,proxyUsed:true,proxyEndpoint:'a'.repeat(64)}};
  assert.equal(confirmedProxyLimit(result),false);
  const out=await boundedProxyRead({read:async()=>{reads++;return{good:false,result};},rotate:async()=>{throw Error('MUST_NOT_ROTATE');},onRetry:async()=>{throw Error('MUST_NOT_RETRY');},onFailure:async r=>{failures++;assert.equal(r.reason,reason);}});
  assert.equal(out.failed,true,reason);assert.equal(out.lastResult.reason,reason);assert.equal(reads,1);assert.equal(failures,1);
 }
});
test('proxy-limit attribution must match the actual managed endpoint',async()=>{
 const {confirmedProxyLimit}=await import('../src/services/crawlerQueueFlow.js');const value=limited();assert.equal(confirmedProxyLimit(value),true);
 value.transport.proxyLimitEvidence.endpoint='b'.repeat(64);assert.equal(confirmedProxyLimit(value),false);
});
test('execution uses every declared worker without a second cap',async()=>{
 const{flowWorkerConcurrency}=await import('../src/services/crawlerQueueFlow.js');
 for(const q of FLOW_QUEUES)assert.equal(flowWorkerConcurrency(q),q.workers,q.name);
 assert.equal(FLOW_QUEUES.reduce((n,q)=>n+flowWorkerConcurrency(q),0),458);
});

