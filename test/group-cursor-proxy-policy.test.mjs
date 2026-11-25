import test from 'node:test';
import assert from 'node:assert/strict';
import {boundedProxyRead,packState,unpackState} from '../src/services/crawlerQueueFlow.js';
import {boundedGroupCursorRead,groupSourceReadPolicy,isGroupCursorRead,groupCursorProxyWaitUsed,groupCursorProxyWaitExpired,GROUP_CURSOR_PROXY_WAIT_MS} from '../src/services/groupSourceProxyPolicy.js';
import {sourceRoundOutcome,summarizeSourceRound} from '../src/services/crawlerSourceRounds.js';
const queue='crawler-flow-facebook-group-source',endpoint=n=>n.toString(16).padStart(64,'0');
const options=(data,state)=>({initialRetries:data.proxyRetries||0,verifyAuthGates:true,...groupSourceReadPolicy(queue,data,state)});
const bad=(n,reason='NETWORK_ERROR')=>({good:false,result:{reason,transport:{proxyUsed:true,proxyEndpoint:endpoint(n)}}});
const good=n=>({good:true,result:{status:'partial',transport:{proxyUsed:true,proxyEndpoint:endpoint(n)}}});
const nope=()=>assert.fail('unexpected callback');
test('initial group read keeps exactly ten distinct failed endpoints',async()=>{
 let reads=0,saved=[];const out=await boundedProxyRead({...options({},{}),read:async()=>bad(++reads),rotate:async()=>{},onProxyAttempt:async list=>{saved=list;}});assert.equal(reads,10);assert.equal(saved.length,10);assert.equal(out.failed,true);
});
test('initial empty pool waits without spending an endpoint',async()=>{let waits=0;const out=await boundedProxyRead({...options({},{}),read:async()=>({good:false,result:{reason:'PROXY_ENDPOINTS_UNAVAILABLE'}}),rotate:async()=>{},onWait:async()=>waits++,onProxyAttempt:nope});assert.equal(out.deferred,true);assert.equal(waits,1);});
for(const reason of ['NETWORK_ERROR','PROXY_TLS_HANDSHAKE_TIMEOUT','FACEBOOK_RATE_LIMITED','ANONYMOUS_BOOTSTRAP_UNAVAILABLE','FACEBOOK_PAGINATION_INCOMPLETE']){
 test(`cursor ${reason} tries two replacement endpoints then returns partial`,async()=>{const data={page:1};let reads=0,retries=0,failures=0;const out=await boundedGroupCursorRead({data,read:async()=>bad(++reads,reason),rotate:async()=>{},onRetry:async()=>retries++,onFailure:async()=>failures++});assert.equal(reads,3);assert.equal(retries,2);assert.equal(out.proxyPartial,true);assert.equal(out.proxyBudgetReason,'PROXY_LIMIT');assert.equal(out.cursorProxyCount,2);assert.equal(out.failed,undefined);assert.equal(failures,1);assert.deepEqual(data.groupCursorProxyEndpoints,[endpoint(2),endpoint(3)]);});
}
test('selected successful replacement spends a job-wide retry, across pages and restarts',async()=>{
 let data={page:2},reads=0;const run=sequence=>boundedGroupCursorRead({data,read:async()=>sequence[reads++],rotate:async()=>{},onRetry:async()=>{}});
 let out=await run([bad(1),good(2)]);assert.equal(out.good,true);assert.deepEqual(data.groupCursorProxyEndpoints,[endpoint(2)]);data=JSON.parse(JSON.stringify(data));reads=0;out=await run([bad(2),good(3)]);assert.equal(out.good,true);assert.deepEqual(data.groupCursorProxyEndpoints,[endpoint(2),endpoint(3)]);reads=0;out=await run([bad(3)]);assert.equal(out.proxyPartial,true);assert.equal(reads,1);
});
test('empty pools do not consume replacements and the 120s wait budget survives restarts',async()=>{
 let now=100000,data={page:2},reads=0;const run=()=>boundedGroupCursorRead({data,now:()=>now,read:async()=>{reads++;return{good:false,result:{reason:'PROXY_ENDPOINTS_UNAVAILABLE',retryAfterMs:30000,transport:{proxyUsed:false}}};},rotate:async()=>{},onWait:async()=>{}});
 assert.equal((await run()).deferred,true);assert.equal(data.groupCursorProxyEndpoints?.length||0,0);data=JSON.parse(JSON.stringify(data));now+=70000;assert.equal((await run()).deferred,true);now+=50000;const out=await run();assert.equal(out.proxyPartial,true);assert.equal(out.proxyBudgetReason,'WAIT_LIMIT');assert.equal(reads,2);assert.equal(out.proxyWaitMs,120000);assert.equal(out.cursorProxyCount,0);
});
test('next proxy wait is clamped to the remaining job budget',async()=>{
 const now=200000,data={groupCursorProxyWaitStartedAt:81000};let wait;const out=await boundedGroupCursorRead({data,now:()=>now,read:async()=>({good:false,result:{reason:'PROXY_POOL_BUSY',retryAfterMs:30000}}),rotate:async()=>{},onWait:async r=>{wait=r.retryAfterMs;}});assert.equal(wait,1000);assert.equal(out.retryAfterMs,1000);assert.equal(out.deferred,true);
});
test('healthy processing does not spend accumulated proxy wait budget',async()=>{
 let now=100000,data={};let reads=0;await boundedGroupCursorRead({data,now:()=>now,read:async()=>++reads===1?bad(1):(now+=20000,good(2)),rotate:async()=>{},onRetry:async()=>{}});assert.equal(data.groupCursorProxyWaitMs,20000);assert.equal(data.groupCursorProxyWaitStartedAt,null);now+=3600000;assert.equal(groupCursorProxyWaitUsed(data,now),20000);assert.equal(groupCursorProxyWaitExpired(data,now),false);
});
test('recovery read receives remaining deadline and clears it for healthy pages',async()=>{
 let now=200000;const data={groupCursorProxyWaitStartedAt:81000},deadlines=[];await boundedGroupCursorRead({data,now:()=>now,read:async()=>good(2),onRecoveryDeadline:d=>deadlines.push(d)});assert.equal(deadlines[0],201000);await boundedGroupCursorRead({data,now:()=>now,read:async()=>good(2),onRecoveryDeadline:d=>deadlines.push(d)});assert.equal(deadlines[1],null);
});
test('a source yield after retry scheduling keeps pending replacement and cursor',async()=>{
 const data={checkpoint:packState({nativeCursor:'NEXT',seen:new Set(['saved'])})};await assert.rejects(boundedGroupCursorRead({data,read:async()=>bad(1),rotate:async()=>{},onRetry:async()=>{throw Error('SOURCE_TIME_SLICE');}}),/SOURCE_TIME_SLICE/);assert.equal(data.groupCursorProxyRetryPending,true);assert.equal(unpackState(data.checkpoint).nativeCursor,'NEXT');const out=await boundedGroupCursorRead({data,read:async()=>good(2)});assert.equal(out.good,true);assert.deepEqual(data.groupCursorProxyEndpoints,[endpoint(2)]);
});
for(const reason of ['PAGINATION_ERROR','INVALID_RESPONSE','SOURCE_POST_PUBLICATION_UNVERIFIED','ORIGIN_SECURITY_CHALLENGE'])test(`functional ${reason} remains failed`,async()=>{const out=await boundedGroupCursorRead({data:{page:2},read:async()=>({good:false,result:{status:'error',reason}}),rotate:nope});assert.equal(out.failed,true);assert.equal(out.proxyPartial,undefined);});
test('partial is explicitly counted separately from success, skip and failure',()=>{assert.equal(sourceRoundOutcome(null,{done:true,partial:true}),'partial');const s=summarizeSourceRound({sourceIds:['a'],startedAt:new Date()},[{sourceId:'a',outcome:'partial'}]);assert.equal(s.partial,1);assert.equal(s.success,0);assert.equal(s.failed,0);assert.equal(s.skipped,0);assert.equal(s.unaccountedSources,0);});
test('only group cursor reads use this policy; initial group remains capped at ten',()=>{assert.equal(isGroupCursorRead(queue,{page:0},{nativeCursor:'NEXT'}),true);assert.equal(isGroupCursorRead(queue,{page:1},{}),true);assert.equal(isGroupCursorRead(queue,{},{}),false);for(const q of ['crawler-flow-facebook-page-source','crawler-flow-facebook-user-source','crawler-flow-facebook-comment']){assert.equal(isGroupCursorRead(q,{page:3},{nativeCursor:'NEXT'}),false);assert.deepEqual(groupSourceReadPolicy(q,{page:3},{nativeCursor:'NEXT'}),{});}assert.equal(groupSourceReadPolicy(queue,{},{}).proxyAttemptLimit,10);});
test('group recovery caps the actual transport deadline without changing page/user budgets',async()=>{
 const {createHttpExecutor}=await import('../src/services/socialHttpTransport.js'),{runCrawlerQueue}=await import('../src/services/crawlerQueueContext.js');
 for(const q of [queue,'crawler-flow-facebook-page-source','crawler-flow-facebook-user-source']){
  const provider=async()=>({host:'fixture',port:8080,managed:true,queue:q,release:async()=>{},report:async()=>{}});provider.managed=true;
  const execute=createHttpExecutor({getProxy:provider,failFastProxy:true,attemptTimeoutMs:180000,makeSession:()=>({requests:0,close(){},setDeadline(){}})});let captured;
  const recoveryDeadline=Date.now()+777;await runCrawlerQueue(q,()=>execute({platform:'facebook',operation:'source',sourceType:q===queue?'group':'page',proxyRecoveryDeadlineAt:recoveryDeadline},async(_s,deadline)=>{captured=deadline;return{status:'partial'};}));
  if(q===queue)assert.equal(captured,recoveryDeadline);else assert.ok(captured>Date.now()+170000);
 }
});

test('real group reader advances one page then recovers a reset cursor using one replacement without losing progress',async()=>{
 const {createFacebookContentHttpReader}=await import('../src/services/facebookContentHttp.js'),{READ_STATE}=await import('../src/services/socialReadState.js'),{disposeReadState}=await import('../src/services/socialLeaseState.js'),{runCrawlerQueue}=await import('../src/services/crawlerQueueContext.js');
 await runCrawlerQueue(queue,async()=>{
  let acquired=0,released=0,posts=0,state;
  const getProxy=async()=>{acquired++;return{host:'fixture',port:8080+acquired,managed:true,queue,scope:'facebook.source_group',expiresAt:Date.now()+300000,permit:async()=>{},heartbeat:async()=>{},report:async()=>{},release:async()=>released++};};getProxy.managed=true;
  const reader=createFacebookContentHttpReader({getProxy,reuseFacebookGroupSessions:true,respectPlatformCooldown:false,failFastProxy:true,makeSession:({proxy})=>({requests:0,close(){},async request(url,opts){await proxy.beforeRequest();this.requests++;if(opts?.method==='POST'&&++posts===2)throw Object.assign(Error('reset'),{code:'ECONNRESET'});return{httpStatus:200,finalUrl:url,html:opts?.method==='POST'?'{}':'<input name="lsd" value="fixture">'};}}),createPostFetcher:({request})=>async()=>{await request({fb_api_req_friendly_name:'Fixture',variables:'{}'},{});return{posts:[{_id:'123',created_time:1700000000}],cursor:'NEXT',hasNextPage:true};}});
  const target={platform:'facebook',operation:'source',sourceType:'group',id:'99',url:'https://www.facebook.com/groups/99',limit:100,proxyRetryContext:{excludedProxyEndpoints:{}}};
  const read=async()=>{const result=await reader({...target,...(state?{[READ_STATE]:state}:{})});state=result[READ_STATE]||state;return{good:['ok','partial'].includes(result.status),result,state};};
  try{const first=await boundedProxyRead({...options({},state),read,rotate:nope});assert.equal(first.good,true);assert.equal(state.nativeCursor,'NEXT');const second=await boundedGroupCursorRead({data:{page:1},read,rotate:async()=>{await disposeReadState(state);},onRetry:async()=>{},onWait:nope});assert.equal(second.good,true);assert.equal(second.done,undefined);assert.equal(state.nativeCursor,'NEXT');assert.equal(state.seen.size,1);assert.equal(acquired,2);assert.equal(posts,3);}finally{await disposeReadState(state);}assert.equal(released,2);
 });
});

test('initial incomplete pagination still permits exactly ten distinct recovery endpoints',async()=>{
 let reads=0;const out=await boundedProxyRead({...options({},{}),read:async()=>bad(++reads,'FACEBOOK_PAGINATION_INCOMPLETE'),rotate:async()=>{}});assert.equal(reads,10);assert.equal(out.failed,true);
});
test('incomplete cursor metadata cannot make a request after its 120s recovery deadline',async()=>{
 let now=100000,reads=0;const data={page:2},out=await boundedGroupCursorRead({data,now:()=>now,read:async()=>bad(++reads,'FACEBOOK_PAGINATION_INCOMPLETE'),rotate:async()=>{},onRetry:async()=>{now+=120000;}});assert.equal(reads,1);assert.equal(out.proxyPartial,true);assert.equal(out.proxyBudgetReason,'WAIT_LIMIT');assert.equal(out.proxyWaitMs,120000);
});
