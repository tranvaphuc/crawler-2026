import test from 'node:test';import assert from 'node:assert/strict';
import {createHttpExecutor} from '../src/services/socialHttpTransport.js';
import {createProxyManagerClient} from '../src/services/proxyManagerClient.js';
import {boundedProxyRead,confirmedProxyLimit,FLOW_READ_TIMEOUT_MS,FLOW_READ_ATTEMPT_TIMEOUT_MS} from '../src/services/crawlerQueueFlow.js';
import {proxyEndpoint} from '../src/services/proxyEndpoint.js';
const makeSession=({proxy})=>({requests:0,close(){},async request(){await proxy.beforeRequest?.();this.requests++;return{httpStatus:200};}});
function lease(server,permit){return{server,managed:true,heartbeat:async()=>{},permit,report:async()=>({recorded:true}),release:async()=>{}};}
test('crawler HTTP timeout is sixty seconds and a multi-request read has three minutes',()=>{assert.equal(FLOW_READ_TIMEOUT_MS,60000);assert.equal(FLOW_READ_ATTEMPT_TIMEOUT_MS,180000);});
test('internal pacing fails immediately without falsely claiming IP limiting or rotating',async()=>{
 let acquired=0,releaseCount=0;const context={};
 const getProxy=async()=>{acquired++;return{...lease('http://proxy-a:8080',async()=>{throw Object.assign(Error('pacing'),{code:'PROXY_PACING_WAIT',retryAfterMs:90000});}),release:async()=>releaseCount++};};
 const execute=createHttpExecutor({getProxy,makeSession,failFastProxy:true,timeoutMs:500});
 const start=Date.now(),out=await boundedProxyRead({read:async()=>{const result=await execute({platform:'facebook',operation:'comments',proxyRetryContext:context},async session=>{await session.request();return{status:'ok'};});return{good:false,result};},rotate:async()=>assert.fail('must not rotate')});
 assert.equal(out.failed,true);assert.equal(out.lastResult.reason,'PROXY_PACING_WAIT');assert.equal(confirmedProxyLimit(out.lastResult),false);assert.equal(acquired,1);assert.equal(releaseCount,1);assert.ok(Date.now()-start<500);
});
test('a generic upstream429 carries no proxy-specific limit evidence',async()=>{
 const execute=createHttpExecutor({getProxy:async()=>lease('http://proxy-a:8080',async()=>{}),makeSession,failFastProxy:true,timeoutMs:500});
 const result=await execute({platform:'facebook',operation:'comments',proxyRetryContext:{}},async()=>({status:'rate_limited',reason:'UPSTREAM_HTTP_429'}));
 assert.equal(confirmedProxyLimit(result),false);assert.equal(result.reason,'UPSTREAM_HTTP_429');
});
test('lease expiry and network errors get no hidden transport retry in fail-fast mode',async()=>{
 for(const code of ['PROXY_EXPIRED','UPSTREAM_NETWORK_ERROR']){let acquired=0;
 const execute=createHttpExecutor({getProxy:async()=>{acquired++;return lease('http://proxy-a:8080',async()=>{});},makeSession,failFastProxy:true,timeoutMs:500});
 const result=await execute({platform:'facebook',operation:'comments',proxyRetryContext:{}},async()=>{throw Object.assign(Error(code),{code});});
 assert.equal(acquired,1);assert.equal(confirmedProxyLimit(result),false);
 }
});
test('a hanging acquisition is bounded by the attempt deadline',async()=>{
 const execute=createHttpExecutor({getProxy:async()=>new Promise(()=>{}),makeSession,failFastProxy:true,timeoutMs:30});const start=Date.now();
 const result=await execute({platform:'facebook',operation:'comments',proxyRetryContext:{}},async()=>{throw Error('MUST_NOT_READ');});
 assert.equal(result.reason,'UPSTREAM_TIMEOUT');assert.equal(confirmedProxyLimit(result),false);assert.ok(Date.now()-start<500);
});
test('proxy manager acquisition respects the caller timeout instead of forty seconds',async()=>{
 let elapsed=0;const provider=createProxyManagerClient({url:'http://127.0.0.1:3810',key:'x'.repeat(32),fetchImpl:async(_url,options)=>new Promise((resolve,reject)=>{const start=Date.now(),timer=setTimeout(()=>resolve({ok:true,json:async()=>({})}),5000);options.signal.addEventListener('abort',()=>{clearTimeout(timer);elapsed=Date.now()-start;reject(Error('aborted'));},{once:true});})});
 await assert.rejects(()=>provider({platform:'facebook',operation:'comments',proxyManagerTimeoutMs:30}),e=>e.code==='PROXY_MANAGER_UNAVAILABLE');assert.ok(elapsed<500);
});
test('a cached expired lease fails without silently acquiring another proxy',async()=>{
 let acquisitions=0,releases=0;const old=lease('http://proxy-a:8080',async()=>{});old.expiresAt=Date.now()-1000;old.release=async()=>releases++;
 const execute=createHttpExecutor({getProxy:async()=>{acquisitions++;return lease('http://proxy-b:8080',async()=>{});},makeSession,failFastProxy:true,timeoutMs:500});
 const result=await execute({platform:'facebook',operation:'comments',proxyRetryContext:{}},async()=>({status:'ok'}),{lease:old,endpoint:proxyEndpoint(old)});
 assert.equal(result.reason,'PROXY_EXPIRED');assert.equal(acquisitions,0);assert.equal(releases,1);assert.equal(result.transport.proxyEndpoint,proxyEndpoint(old),'the retry loop must exclude the expired endpoint even before an upstream request starts');
});
test('lease calls receive the remaining deadline and unscoped cooldowns are not retryable',async()=>{
 const timeouts=[];const p=lease('http://proxy-a:8080',async options=>{timeouts.push(options.timeoutMs);throw Object.assign(Error('cooldown'),{code:'PROXY_SCOPE_COOLDOWN',retryAfterMs:900000});});p.report=async(_result,options)=>{timeouts.push(options.timeoutMs);return{};};p.release=async options=>timeouts.push(options.timeoutMs);
 const execute=createHttpExecutor({getProxy:async t=>{timeouts.push(t.proxyManagerTimeoutMs);return p;},makeSession,failFastProxy:true,timeoutMs:500});
 const result=await execute({platform:'facebook',operation:'comments',proxyRetryContext:{}},async session=>{await session.request();return{status:'ok'};});
 assert.equal(result.reason,'PROXY_ASSIGNMENT_COOLDOWN');assert.equal(confirmedProxyLimit(result),false);assert.ok(timeouts.length>=3);assert.ok(timeouts.every(ms=>ms>=1&&ms<=500));
});
test('ambiguous upstream rate errors fail the request without quarantining a healthy proxy for other jobs',async()=>{
 const reports=[];const p=lease('http://proxy-a:8080',async()=>{});p.report=async r=>{reports.push(r);return{};};
 const execute=createHttpExecutor({getProxy:async()=>p,makeSession,failFastProxy:true,timeoutMs:500});
 const r=await execute({platform:'facebook',operation:'comments',proxyRetryContext:{}},async()=>({status:'rate_limited',reason:'FACEBOOK_RATE_LIMITED',retryAfterMs:900000}));assert.equal(r.status,'rate_limited');assert.equal(r.reason,'FACEBOOK_RATE_LIMITED');assert.equal(confirmedProxyLimit(r),false);assert.equal(reports[0].status,'error');assert.equal(reports[0].reason,'FACEBOOK_RATE_LIMITED');
});
test('actual CONNECT429 is reported as a proxy limit with endpoint proof',async()=>{
 const reports=[];const p=lease('http://proxy-a:8080',async()=>{});p.report=async r=>{reports.push(r);return{};};
 const execute=createHttpExecutor({getProxy:async()=>p,failFastProxy:true,timeoutMs:500,makeSession:({onProxyLimit})=>({requests:1,close(){},limit(){onProxyLimit({source:'proxy_connect',scope:'proxy',confirmed:true,httpStatus:429});}})});
 const r=await execute({platform:'facebook',operation:'comments',proxyRetryContext:{}},async session=>{session.limit();throw Object.assign(Error(),{code:'PROXY_CONNECT_RATE_LIMITED'});});assert.equal(confirmedProxyLimit(r),true);assert.equal(reports[0].status,'rate_limited');
});
test('target login/checkpoint is not reported as a confirmed proxy rejection in fail-fast crawler mode',async()=>{
 for(const status of ['auth_required','security_checkpoint']){const reports=[];const p=lease('http://proxy-a:8080',async()=>{});p.report=async r=>{reports.push(r);return{};};const execute=createHttpExecutor({getProxy:async()=>p,makeSession,failFastProxy:true,timeoutMs:500});const r=await execute({platform:'facebook',operation:'source'},async()=>({status,reason:'AUTH_REQUIRED'}));assert.equal(r.status,status);assert.equal(reports[0].status,'error');assert.equal(confirmedProxyLimit(r),false);}
});
test('Facebook bootstrap transport failures preserve both stage and precise timeout code',async()=>{
 const{createAnonymousFacebookGraphqlRequest}=await import('../src/services/facebookAnonymousGraphql.js'),{classifyTransportError}=await import('../scripts/facebook_post_errors.js');const request=createAnonymousFacebookGraphqlRequest({request:async()=>{throw Object.assign(Error('request failed'),{code:'UPSTREAM_TIMEOUT'});}},{bootstrapUrl:'https://www.facebook.com/123'});await assert.rejects(()=>request({fb_api_req_friendly_name:'NativeQuery'},{}),e=>{const mapped=classifyTransportError(e,false);assert.equal(mapped.code,'UPSTREAM_TIMEOUT');assert.equal(mapped.stage,'bootstrap');return true;});
});
test('hung acquisition uses the request timeout even when a multi-request read has a larger budget',async()=>{
 const execute=createHttpExecutor({getProxy:async()=>new Promise(()=>{}),makeSession,failFastProxy:true,timeoutMs:25,attemptTimeoutMs:500});const start=Date.now(),r=await execute({platform:'facebook',operation:'comments'},async()=>assert.fail('must not start upstream work'));assert.equal(r.reason,'UPSTREAM_TIMEOUT');assert.equal(r.transport.proxyUsed,false);assert.ok(Date.now()-start<200);
});

test('HTTP executor passes the full sixty-second request limit and three-minute read budget to the session',async()=>{
 let limits;
 const execute=createHttpExecutor({getProxy:async()=>lease('http://proxy-a:8080',async()=>{}),timeoutMs:FLOW_READ_TIMEOUT_MS,attemptTimeoutMs:FLOW_READ_ATTEMPT_TIMEOUT_MS,failFastProxy:true,makeSession:options=>{limits={requestTimeoutMs:options.requestTimeoutMs,remaining:options.deadline-Date.now()};return{requests:0,close(){}};}});
 const result=await execute({platform:'facebook',operation:'comments'},async()=>({status:'ok'}));
 assert.equal(result.status,'ok');assert.equal(limits.requestTimeoutMs,60000);assert.ok(limits.remaining>179000&&limits.remaining<=180000);
});

test('native socket reset remains visible through transport mapping and retries on a different proxy',async()=>{
 const execute=createHttpExecutor({getProxy:async()=>lease('http://proxy-a:8080',async()=>{}),makeSession,failFastProxy:true,timeoutMs:500});
 const raw=await execute({platform:'youtube',operation:'source'},async()=>{throw Object.assign(Error('socket reset'),{code:'ECONNRESET'});});
 assert.equal(raw.reason,'UPSTREAM_NETWORK_ERROR');assert.equal(raw.upstreamCode,'ECONNRESET');
 let reads=0,rotations=0;const outcome=await boundedProxyRead({read:async()=>++reads===1?{good:false,result:raw}:{good:true,result:{status:'ok'}},rotate:async()=>rotations++});assert.equal(outcome.good,true);assert.equal(outcome.done,undefined);assert.equal(rotations,1);
});
