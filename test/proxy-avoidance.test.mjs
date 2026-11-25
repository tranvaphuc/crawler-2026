import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {once} from 'node:events';
import {createProxyManager} from '../src/services/proxyManager.js';
import {createProxyManagerApp} from '../src/routes/proxyManagerApp.js';
import {createProxyManagerClient} from '../src/services/proxyManagerClient.js';
import {proxyEndpoint} from '../src/services/proxyEndpoint.js';
import {PROXY_TLS_AVOID_MS,PROXY_CONNECT_AVOID_MS,PROXY_RETRY_AVOID_MS,proxyRetryContext,proxyExclusions,rememberProxyFailure} from '../src/services/proxyAvoidance.js';
import {createHttpExecutor} from '../src/services/socialHttpTransport.js';
import {boundedProxyRead,packState,unpackState} from '../src/services/crawlerQueueFlow.js';
import {FlowProxyWaitError,ProxyWaitDelayedError,CheckpointWorker,delayProxyJob} from '../src/services/crawlerProxyWait.js';
import {createFacebookSessionPool} from '../src/services/facebookSessionPool.js';
import {HTTP_BINDING,bindHttpState} from '../src/services/socialLeaseState.js';
import {spawn} from 'node:child_process';
import Redis from 'ioredis';import {Queue} from 'bullmq';
import {createFacebookContentHttpReader} from '../src/services/facebookContentHttp.js';
import {READ_STATE} from '../src/services/socialReadState.js';
import {disposeReadState} from '../src/services/socialLeaseState.js';

function fixture(t,count=3){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'proxy-avoid-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const keysFile=path.join(dir,'keys.json'),settingsFile=path.join(dir,'settings.json'),stateFile=path.join(dir,'state.json');
 fs.writeFileSync(keysFile,JSON.stringify(Array.from({length:count},(_,i)=>'test-avoid-key-'+i)));
 fs.writeFileSync(settingsFile,JSON.stringify({unrestrictedSharing:true}));
 let clock=100000;const options={keysFile,settingsFile,stateFile,now:()=>clock,makeRotator:key=>async()=>({host:key,port:8080,expiresAt:clock+900000})};
 const manager=createProxyManager(options);return{manager,options,get now(){return clock;},advance:ms=>clock+=ms};
}
const tlsReport={status:'proxy_error',reason:'UPSTREAM_NETWORK_ERROR',phase:'proxy_tls',nativeCode:'ECONNRESET',connectStatus:200};
test('TLS avoidance is scoped to endpoint and operation, survives restart and expires',async t=>{
 const f=fixture(t,1),a=await f.manager.acquire({scope:'facebook.source_group',minRemainingMs:1000});
 f.manager.report(a.leaseId,tlsReport);
 assert.equal(f.manager.status().endpointAvoidance[0].endpoint,proxyEndpoint(a.proxy));
 // Other operations keep the same endpoint and their existing permits.
 assert.ok(f.manager.heartbeat(a.leaseId));
 await assert.rejects(f.manager.acquire({scope:'facebook.source_group',minRemainingMs:1000}),e=>e.code==='PROXY_ENDPOINTS_UNAVAILABLE');
 for(const scope of ['facebook.source_page','facebook.source_user','facebook.comments','facebook.comment_info','youtube.source']){const other=await f.manager.acquire({scope,minRemainingMs:1000});assert.equal(proxyEndpoint(other.proxy),proxyEndpoint(a.proxy));assert.ok(f.manager.permit(other.leaseId).permitted);f.manager.report(other.leaseId,{status:'ok',responseObserved:true});f.manager.release(other.leaseId);}
 f.manager.close();const restored=createProxyManager(f.options);
 await assert.rejects(restored.acquire({scope:'facebook.source_group',minRemainingMs:1000}),e=>e.code==='PROXY_ENDPOINTS_UNAVAILABLE');
 f.advance(PROXY_TLS_AVOID_MS+1);
 const b=await restored.acquire({scope:'facebook.source_group',minRemainingMs:1000});assert.equal(proxyEndpoint(b.proxy),proxyEndpoint(a.proxy));
 restored.release(a.leaseId);restored.release(b.leaseId);restored.close();
});
test('auth, HTTP, body errors and unobserved resets do not quarantine an endpoint as TLS',async t=>{
 for(const delta of [{reason:'AUTH_REQUIRED'},{reason:'UPSTREAM_HTTP_429'},{...tlsReport,phase:'response_body'},{reason:'UPSTREAM_NETWORK_ERROR',nativeCode:'ECONNRESET'}]){
  const f=fixture(t,1),a=await f.manager.acquire({scope:'facebook.source_group',minRemainingMs:1000});
  f.manager.report(a.leaseId,{status:'proxy_error',...delta});assert.equal(f.manager.status().endpointAvoidance.length,0);
  f.manager.release(a.leaseId);f.manager.close();
 }
});
test('observed CONNECT failures avoid only the affected scope',async t=>{
 const f=fixture(t,1),a=await f.manager.acquire({scope:'facebook.source_group',minRemainingMs:1000});
 f.manager.report(a.leaseId,{status:'proxy_error',reason:'PROXY_CONNECT_TIMEOUT',phase:'proxy_connect',nativeCode:'PROXY_CONNECT_TIMEOUT'});
 assert.equal(f.manager.status().endpointAvoidance[0].until,f.manager.status().endpointAvoidance[0].failedAt+PROXY_CONNECT_AVOID_MS);
 assert.ok(f.manager.heartbeat(a.leaseId));
 await assert.rejects(f.manager.acquire({scope:'facebook.source_group',minRemainingMs:1000}),{code:'PROXY_ENDPOINTS_UNAVAILABLE'});
 assert.ok(f.manager.status().totals.avoidedConnectAssignments>0);
 f.advance(PROXY_CONNECT_AVOID_MS+1);const b=await f.manager.acquire({scope:'youtube.source',minRemainingMs:1000});f.manager.release(a.leaseId);f.manager.release(b.leaseId);f.manager.close();
});
test('origin/body failures and explicit CONNECT HTTP errors never trigger transport health avoidance',async t=>{
 for(const report of [{phase:'response_body',nativeCode:'ETIMEDOUT'},{phase:'proxy_connect',nativeCode:'ECONNRESET',connectStatus:429},{phase:'proxy_connect',nativeCode:'ECONNRESET',connectStatus:407}]){
  const f=fixture(t,1),a=await f.manager.acquire({scope:'facebook.comments',minRemainingMs:1000});f.manager.report(a.leaseId,{status:'proxy_error',reason:'UPSTREAM_NETWORK_ERROR',...report});assert.equal(f.manager.status().endpointAvoidance.length,0);f.manager.release(a.leaseId);f.manager.close();
 }
});
test('CONNECT timeout rotates while preserving the native cursor and retry budget',async()=>{
 let reads=0,retries=0,rotations=0;const state={nativeCursor:'exact-next-page'};
 const result=await boundedProxyRead({initialRetries:3,read:async()=>++reads===1?{good:false,result:{reason:'PROXY_CONNECT_TIMEOUT'},state}:{good:true,result:{status:'ok'},state},rotate:async()=>rotations++,onRetry:async n=>{retries=n;}});
 assert.equal(result.good,true);assert.equal(state.nativeCursor,'exact-next-page');assert.equal(rotations,1);assert.equal(retries,4);
});
test('all excluded endpoints are honored across authenticated client and manager, without fallback',async t=>{
 const f=fixture(t),key='proxy-avoidance-test-authentication-key',server=createProxyManagerApp({manager:f.manager,key}).listen(0,'127.0.0.1');
 await once(server,'listening');t.after(()=>{server.closeAllConnections();server.close();f.manager.close();});
 const client=createProxyManagerClient({url:`http://127.0.0.1:${server.address().port}`,key}),excluded=[];
 for(let i=0;i<3;i++){const lease=await client({platform:'facebook',operation:'source',sourceType:'group',minProxyRemainingMs:1000,excludeProxyEndpoints:excluded});const endpoint=proxyEndpoint(lease);assert.ok(!excluded.includes(endpoint));excluded.push(endpoint);await lease.release();}
 await assert.rejects(client({platform:'facebook',operation:'source',sourceType:'group',minProxyRemainingMs:1000,excludeProxyEndpoints:excluded}),e=>e.code==='PROXY_ENDPOINTS_UNAVAILABLE');
 await assert.rejects(f.manager.acquire({scope:'facebook.comments',excludeProxyEndpoints:['invalid']}),e=>e.code==='PROXY_EXCLUSION_INVALID');
});
test('job failure history survives checkpoint/restart, expires and never stores proxy credentials',()=>{
 const context=proxyRetryContext(),a='a'.repeat(64),b='b'.repeat(64),now=100000;
 for(const endpoint of [a,b])rememberProxyFailure(context,{transport:{proxyUsed:true,proxyEndpoint:endpoint}},now);
 const data={checkpoint:packState({nativeCursor:'native-next',seen:new Set(['123']),items:[{id:'buffered'}]}),...context};
 const restored=proxyRetryContext(JSON.parse(JSON.stringify(data)),now+1);assert.deepEqual(proxyExclusions(restored,now+1),[a,b]);
 assert.deepEqual([...unpackState(data.checkpoint).seen],['123']);assert.equal(unpackState(data.checkpoint).nativeCursor,'native-next');
 assert.deepEqual(proxyExclusions(restored,now+PROXY_RETRY_AVOID_MS+1),[]);
 rememberProxyFailure(restored,{transport:{proxyUsed:false,proxyEndpoint:'c'.repeat(64)}},now+2);assert.equal(proxyExclusions(restored,now+2).includes('c'.repeat(64)),false);
});
test('executor forwards precise TLS evidence; re-acquisition never revisits either prior endpoint',async t=>{
 const f=fixture(t),context=proxyRetryContext(),selected=[],base=async target=>f.manager.acquire({scope:'facebook.source_group',minRemainingMs:1000,excludeProxyEndpoints:target.excludeProxyEndpoints});
 const getProxy=async target=>{const a=await base(target),endpoint=proxyEndpoint(a.proxy);selected.push(endpoint);return{...a.proxy,managed:true,expiresAt:a.proxyExpiresAt,report:async r=>f.manager.report(a.leaseId,r),release:async()=>f.manager.release(a.leaseId)};};getProxy.managed=true;
 const execute=createHttpExecutor({getProxy,failFastProxy:true,makeSession:()=>({requests:0,requestTimings:[],close(){}})});
 const result=await boundedProxyRead({read:async()=>{const result=await execute({platform:'facebook',operation:'source',sourceType:'group',proxyRetryContext:context},async session=>{
  session.requests++;if(selected.length<3){session.requestTimings=[{request:session.requests,outcome:'error',phase:'proxy_tls',nativeCode:'ECONNRESET',connectStatus:200}];return{status:'error',reason:'UPSTREAM_NETWORK_ERROR'};}
  return{status:'ok',items:[{id:'next-page'}]};
 });if(result.status!=='ok')rememberProxyFailure(context,result);return{good:result.status==='ok',result};},rotate:async()=>{}});
 assert.equal(result.good,true);assert.equal(new Set(selected).size,3);assert.equal(f.manager.status().endpointAvoidance.length,2);f.manager.close();
});
test('empty healthy pool defers without a failed outcome or another consumed read retry',async()=>{
 let reads=0,retries=0,failures=0,waits=0;
 const result=await boundedProxyRead({initialRetries:17,read:async()=>{reads++;return{good:false,result:{reason:'PROXY_ENDPOINTS_UNAVAILABLE',retryAfterMs:5000,transport:{proxyUsed:false}}};},rotate:async()=>{},onWait:async()=>waits++,onRetry:async()=>retries++,onFailure:async()=>failures++});
 assert.equal(result.deferred,true);assert.equal(reads,1);assert.equal(retries,0);assert.equal(failures,0);assert.equal(waits,1);
});
for(const [label,transport]of [
 ['after bootstrap',{proxyUsed:true,requests:3,networkTimings:[{httpStatus:302,outcome:'complete'},{httpStatus:200,outcome:'complete'}]}],
 ['on a reused session before any request',{proxyUsed:true,requests:0,networkTimings:[]}],
 ['without transport metadata',undefined]
])test(`endpoint exhaustion ${label} defers at the retry limit and preserves reader state`,async()=>{
 const state={nativeCursor:'NEXT',seen:new Set(['seen']),items:[{id:'buffered'}],pending:true};
 let reads=0,rotations=0,waits=0;const result={status:'proxy_error',reason:'PROXY_ENDPOINTS_UNAVAILABLE',retryAfterMs:7000,transport};
 const outcome=await boundedProxyRead({initialRetries:100,read:async()=>{reads++;return{good:false,result,state};},
  rotate:async()=>{rotations++;},onWait:async r=>{waits++;assert.equal(r,result);},
  onRetry:async()=>assert.fail('scheduling wait consumed a retry'),onFailure:async()=>assert.fail('scheduling wait failed the job')});
 assert.equal(outcome.deferred,true);assert.equal(outcome.retryAfterMs,7000);assert.equal(outcome.state,state);
 assert.deepEqual(unpackState(packState(state)),state);assert.equal(outcome.failed,undefined);assert.equal(outcome.exhausted,undefined);
 assert.deepEqual([reads,rotations,waits],[1,1,1]);
});
test('endpoint wait only matches the exact scheduling reason; native/security failures retain their policy',async()=>{
 for(const reason of ['ORIGIN_SECURITY_CHALLENGE','PROXY_AUTH_REQUIRED','PROXY_EXCLUSION_INVALID']){
  let failures=0;const outcome=await boundedProxyRead({read:async()=>({good:false,result:{reason,upstreamCode:'PROXY_ENDPOINTS_UNAVAILABLE',transport:{proxyUsed:false}}}),
   rotate:async()=>assert.fail('unexpected rotation'),onWait:async()=>assert.fail('native error became a scheduling wait'),onFailure:async()=>failures++});
  assert.equal(outcome.failed,true);assert.equal(outcome.deferred,undefined);assert.equal(failures,1);
 }
});
test('delaying a source retains its exact checkpoint, pending rows, round ID and retry budget',async()=>{
 const data={checkpoint:packState({nativeCursor:'exact-native',seen:new Set(['seen'])}),pendingPage:{items:[{id:'pending'}]},page:8,cutoff:123,sourceRoundId:'same-round',proxyRetries:17,excludedProxyEndpoints:{['a'.repeat(64)]:999999}};
 const calls=[],job={id:'same-ticket',data:structuredClone(data),updateData:async d=>calls.push(['bull',structuredClone(d)]),moveToDelayed:async(until,token)=>calls.push(['delayed',until,token])};
 const jobs={updateOne:async(filter,update)=>calls.push(['mongo',filter,structuredClone(update)])};
 await assert.rejects(delayProxyJob({job,token:'lock',jobs,error:new FlowProxyWaitError(5000),now:100000}),ProxyWaitDelayedError);
 for(const [key,value]of Object.entries(data))assert.deepEqual(job.data[key],value);
 assert.equal(calls[0][2].$set.state,'queued');assert.deepEqual(calls.at(-1),['delayed',105000,'lock']);
 let fetched=0,failed=0;
 await CheckpointWorker.prototype.handleFailed.call({moveToActive:async()=>fetched++},new ProxyWaitDelayedError(),{moveToFailed:async()=>failed++},'lock');
 assert.equal(fetched,0);assert.equal(failed,0);
});
test('reply session borrowing cannot bypass the job history of failed endpoints',async()=>{
 const pool=createFacebookSessionPool(),endpoints=['a'.repeat(64),'b'.repeat(64),'c'.repeat(64)];
 for(const endpoint of endpoints){const state={};bindHttpState(state,{endpoint,session:{},lease:{managed:true,scope:'facebook.comments',expiresAt:Date.now()+300000},dispose:async()=>{}});await pool.put('post',state);}
 const target={};assert.equal(await pool.take('post',target,{excludeProxyEndpoints:[endpoints[1],endpoints[2]],transportScope:'facebook.comments'}),true);assert.equal(target[HTTP_BINDING].endpoint,endpoints[0]);await pool.close();
});
test('source resumes the exact native page after two TLS rotations and checkpoint reloads',async()=>{
 let acquisitions=0,current,context=proxyRetryContext();const cursors=[],exclusions=[];
 const reader=createFacebookContentHttpReader({bootstrapFacebook:false,failFastProxy:true,respectPlatformCooldown:false,
  getProxy:async target=>{exclusions.push(target.excludeProxyEndpoints);return{host:'proxy-'+(++acquisitions),port:8080,managed:true,expiresAt:Date.now()+300000,report:async()=>({}),release:async()=>{}};},
  makeSession:()=>({requests:0,close(){}}),createPostFetcher:()=>async({cursor})=>{
   cursors.push(cursor);if(cursor&&acquisitions<3)throw Object.assign(Error(),{code:'PROXY_TLS_HANDSHAKE_TIMEOUT'});
   return{posts:[{_id:cursor?'2':'1',authorId:'9',created_time:1700000000}],cursor:cursor?null:'NEXT',hasNextPage:!cursor};
  }});
 const target={platform:'facebook',operation:'source',sourceType:'group',id:'9',url:'https://www.facebook.com/groups/9',limit:100};
 const first=await reader(target);current=first[READ_STATE];assert.deepEqual(first.items.map(x=>x.id),['9_1']);
 const result=await boundedProxyRead({read:async()=>{const r=await reader({...target,proxyRetryContext:context,[READ_STATE]:current});current=r[READ_STATE]||current;if(!['ok','partial'].includes(r.status))rememberProxyFailure(context,r);return{good:['ok','partial'].includes(r.status),result:r};},
  rotate:async()=>{await disposeReadState(current);delete current[HTTP_BINDING];},onRetry:async()=>{
   const data=JSON.parse(JSON.stringify({checkpoint:packState(current),...context}));current=unpackState(data.checkpoint);context=proxyRetryContext(data);
  }});
 assert.deepEqual(cursors,[null,'NEXT','NEXT','NEXT']);assert.deepEqual(result.result.items.map(x=>x.id),['9_2']);
 assert.equal(acquisitions,3);assert.equal(exclusions.at(-1).length,2);assert.ok(!exclusions.at(-1).includes(proxyEndpoint({host:'proxy-3',port:8080})));await disposeReadState(current);
});
test('real Bull ticket resumes from delayed with checkpoint intact and zero failed attempts',{timeout:15000},async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'proxy-delay-')),socket=path.join(dir,'redis.sock');
 const redisProcess=spawn(process.env.REDIS_SERVER_BIN||'redis-server',['--port','0','--unixsocket',socket,'--save','','--appendonly','no'],{stdio:['ignore','pipe','pipe']});
 let output='';await new Promise((resolve,reject)=>{redisProcess.on('error',reject);redisProcess.stdout.on('data',chunk=>{output+=chunk;if(/ready to accept connections/i.test(output))resolve();});redisProcess.on('exit',code=>reject(Error('TEST_REDIS_EXIT_'+code)));});
 const connection=new Redis(socket,{maxRetriesPerRequest:null}),queue=new Queue('proxy-delay-test',{connection});let worker;
 try{
  const original={checkpoint:packState({nativeCursor:'NEXT',seen:new Set(['old']),items:[{id:'buffered'}]}),pendingPage:{items:[{id:'pending'}]},page:4,sourceRoundId:'round',proxyRetries:9};
  let persisted,started=0;const failures=[];
  const completed=new Promise((resolve,reject)=>{
   worker=new CheckpointWorker(queue.name,async(job,token)=>{
    started++;assert.equal(job.attemptsMade,0);for(const [k,v]of Object.entries(original))assert.deepEqual(job.data[k],v);
    if(started===1)return delayProxyJob({job,token,jobs:{updateOne:async(_f,u)=>persisted=structuredClone(u.$set)},error:new FlowProxyWaitError(1000)});
    assert.equal(persisted.state,'queued');assert.deepEqual([...unpackState(job.data.checkpoint).seen],['old']);return 'resumed';
   },{connection,concurrency:1});worker.on('completed',(job,result)=>resolve({job,result}));worker.on('failed',(_job,error)=>{failures.push(error);reject(error);});worker.on('error',reject);
  });
  await queue.add('source',original,{jobId:'same-source-ticket',attempts:1,removeOnComplete:false});
  const result=await completed;assert.equal(result.result,'resumed');assert.equal(result.job.id,'same-source-ticket');assert.equal(started,2);assert.equal(failures.length,0);assert.equal(await queue.getFailedCount(),0);
 }finally{await worker?.close();await queue.close();await connection.quit();redisProcess.kill('SIGTERM');await once(redisProcess,'exit');fs.rmSync(dir,{recursive:true,force:true});}
});

test('Facebook reader pool exhaustion after bootstrap delays the same real Bull ticket and resumes its native cursor',{timeout:15000},async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'proxy-reader-delay-')),socket=path.join(dir,'redis.sock');
 const redisProcess=spawn(process.env.REDIS_SERVER_BIN||'redis-server',['--port','0','--unixsocket',socket,'--save','','--appendonly','no'],{stdio:['ignore','pipe','pipe']});
 let output='';await new Promise((resolve,reject)=>{redisProcess.on('error',reject);redisProcess.stdout.on('data',chunk=>{output+=chunk;if(/ready to accept connections/i.test(output))resolve();});redisProcess.on('exit',code=>reject(Error('TEST_REDIS_EXIT_'+code)));});
 const connection=new Redis(socket,{maxRetriesPerRequest:null}),queue=new Queue('proxy-reader-delay-test',{connection});let worker,session,current;
 const cursors=[],events=[],persisted=[],failures=[];
 const original={checkpoint:packState({kind:'facebook',items:[],seen:new Set(['1']),nativeCursor:'NEXT',pending:true,collecting:false}),page:4,cutoff:123,sourceRoundId:'same-round',proxyRetries:17,excludedProxyEndpoints:{['a'.repeat(64)]:Date.now()+300000}};
 const reader=createFacebookContentHttpReader({bootstrapFacebook:false,failFastProxy:true,respectPlatformCooldown:false,
  getProxy:async()=>({host:'fixture-proxy',port:8080,managed:true,expiresAt:Date.now()+300000,report:async()=>({}),release:async()=>{}}),
  makeSession:()=>session={requests:0,requestTimings:[],close(){}},createPostFetcher:()=>async({cursor})=>{
   cursors.push(cursor);session.requests++;session.requestTimings.push({request:session.requests,httpStatus:200,outcome:'complete'});
   if(cursors.length===1)throw Object.assign(Error('pool exhausted after bootstrap'),{code:'PROXY_ENDPOINTS_UNAVAILABLE',retryAfterMs:1000});
   return{posts:[{_id:'2',authorId:'9',created_time:1700000000}],cursor:null,hasNextPage:false};
  }});
 try{
  const completed=new Promise((resolve,reject)=>{
   worker=new CheckpointWorker(queue.name,async(job,token)=>{
    assert.equal(job.attemptsMade,0);current=unpackState(job.data.checkpoint);
    for(const key of ['page','cutoff','sourceRoundId','proxyRetries','excludedProxyEndpoints'])assert.deepEqual(job.data[key],original[key]);
    const outcome=await boundedProxyRead({initialRetries:job.data.proxyRetries,read:async()=>{
     const result=await reader({platform:'facebook',operation:'source',sourceType:'group',id:'9',url:'https://www.facebook.com/groups/9',limit:100,[READ_STATE]:current});
     current=result[READ_STATE]||current;
     if(result.reason==='PROXY_ENDPOINTS_UNAVAILABLE'){assert.equal(result.transport.proxyUsed,true);assert.equal(result.transport.requests,1);}
     return{good:['ok','partial'].includes(result.status),result,state:current};
    },rotate:async()=>{await disposeReadState(current);delete current[HTTP_BINDING];},
     onWait:async()=>{job.data.checkpoint=packState(current);await job.updateData(job.data);},
     onRetry:async()=>assert.fail('pool wait consumed retry'),onFailure:async()=>assert.fail('pool wait failed')});
    if(outcome.deferred)return delayProxyJob({job,token,jobs:{updateOne:async(_f,u)=>persisted.push(structuredClone(u.$set))},error:new FlowProxyWaitError(outcome.retryAfterMs)});
    assert.equal(persisted[0].state,'queued');assert.equal(persisted[0].proxyDeferred,true);
    assert.deepEqual(unpackState(persisted[0].data.checkpoint),unpackState(original.checkpoint));assert.deepEqual([...unpackState(persisted[0].data.checkpoint).seen],['1']);
    return outcome.result.items.map(x=>x.id);
   },{connection,concurrency:1});
   worker.on('completed',(job,result)=>resolve({job,result}));worker.on('failed',(_job,error)=>{failures.push(error);reject(error);});worker.on('error',reject);
  });
  // Observe actual Redis transitions, not only the processor's return values.
  const timer=setInterval(()=>{void queue.getJobState('same-source-ticket').then(s=>events.push(s));},20);
  try{
   await queue.add('source',original,{jobId:'same-source-ticket',attempts:1,removeOnComplete:false});
   const result=await completed;assert.equal(result.job.id,'same-source-ticket');assert.deepEqual(result.result,['9_2']);
   assert.deepEqual(cursors,['NEXT','NEXT']);assert.ok(events.includes('delayed'));assert.equal(failures.length,0);assert.equal(await queue.getFailedCount(),0);assert.equal(result.job.attemptsMade,1);
  }finally{clearInterval(timer);}
 }finally{await disposeReadState(current);await worker?.close();await queue.close();await connection.quit();redisProcess.kill('SIGTERM');await once(redisProcess,'exit');fs.rmSync(dir,{recursive:true,force:true});}
});

test('transport recovery requires native response headers, not a cache, CONNECT alone or a proxy 407',async()=>{
 const {proxyTlsEvidence}=await import('../src/services/proxyAvoidance.js');
 for(const timing of [{connectStatus:200},{httpStatus:200,headersMs:1},{httpStatus:407,headersMs:1,connectStatus:200}])assert.notEqual(proxyTlsEvidence(null,[timing]).responseObserved,true);
 assert.equal(proxyTlsEvidence(null,[{httpStatus:200,headersMs:1,connectStatus:200}]).responseObserved,true);
 assert.equal(proxyTlsEvidence('UPSTREAM_HTTP_429',[{httpStatus:429,headersMs:1,connectStatus:200}]).responseObserved,true);
 assert.equal(proxyTlsEvidence(null,[{httpStatus:200,headersMs:1,reusedSocket:true}]).responseObserved,true);
});

test('a scoped origin block covers duplicate endpoints under different provider credentials',async t=>{
 const f=fixture(t,2);f.manager.close();
 const manager=createProxyManager({...f.options,makeRotator:key=>async()=>({host:'shared-egress',port:8080,username:key,expiresAt:f.now+900000})});
 const a=await manager.acquire({scope:'facebook.source_group',minRemainingMs:1000});manager.report(a.leaseId,{status:'rate_limited',reason:'FACEBOOK_RATE_LIMITED',retryAfterMs:60000});
 await assert.rejects(manager.acquire({scope:'facebook.source_group',minRemainingMs:1000}),{code:'PROXY_ENDPOINTS_UNAVAILABLE'});
 const page=await manager.acquire({scope:'facebook.source_page',minRemainingMs:1000});assert.equal(proxyEndpoint(page.proxy),proxyEndpoint(a.proxy));assert.ok(manager.permit(page.leaseId).permitted);
 manager.release(a.leaseId);manager.release(page.leaseId);manager.close();
});
