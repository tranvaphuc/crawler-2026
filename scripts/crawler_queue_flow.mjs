import {createFlowRetention} from '../src/services/flowRetention.js';
import {persistFlowCheckpoint} from '../src/services/flowCheckpointPersistence.js';
import {createSourceLatestPostObserver} from '../src/services/sourceLatestPostObserver.js';
import {createProxyIntakeBackoff} from '../src/services/proxyIntakeBackoff.js';
import {runCrawlerQueue} from '../src/services/crawlerQueueContext.js';
import {startCheckpointResumeScheduler} from '../src/services/checkpointResumeScheduling.js';
import {proxyRetryContext,proxyExclusions,rememberProxyFailure} from '../src/services/proxyAvoidance.js';
import {FlowProxyWaitError,ProxyWaitDelayedError,CheckpointWorker,delayProxyJob} from '../src/services/crawlerProxyWait.js';
import {readNetworkDiagnostic} from '../src/services/readNetworkDiagnostics.js';
import {createFacebookSessionPool} from '../src/services/facebookSessionPool.js';
import {facebookGroupRuntimePolicy,retainGroupSession} from '../src/services/facebookGroupRuntimePolicy.js';
import {facebookContextKey} from '../src/services/facebookSessionContexts.js';
import {crawlerErrorDetails,publicErrorCase,isolatedClassifiedError} from '../src/services/crawlerErrorDetails.js';
import {createEs5BulkWriter} from '../src/services/crawlerEs5Bulk.js';
import {commitCrawlDocument,completedNativeCounter,POST_FIRST_COUNTER_PLATFORMS,postTargetUpdate,commentCandidateFilter,successfulCommentJobUpdate,COMMENT_RESCAN_MIN_MS,readPostCommentPage} from '../src/services/crawlerPostHandoff.js';
import {verifiedBufferedItems} from '../src/services/crawlerPartialDelivery.js';
import {createFlowShutdown} from '../src/services/crawlerFlowShutdown.js';
import {createSourceRoundCoordinator,sourceRoundOutcome} from '../src/services/crawlerSourceRounds.js';
import {startContinuousQueueFeeders,enqueueAllEligibleSources,createCommentCandidateScanner} from '../src/services/continuousQueueFeeders.js';
import {findFacebookUid,needsUidLookup,operatorSuppliedUid} from '../src/services/facebookFindUid.js';
import {handoffUidImport,migrateFailedUidImport,enqueueUidResolvedImport} from '../src/services/uidQueueHandoff.js';
import {createHttpExecutor} from '../src/services/socialHttpTransport.js';
import {createConfiguredProxyProvider} from '../src/services/socialProxyConfig.js';
import {bindFacebookUserPost} from '../src/services/facebookUserPostBinding.js';
import {createFacebookAuthorResolver,createMongoAuthorStore} from '../src/services/facebookAuthorResolution.js';
import 'dotenv/config';
import {setTimeout as sleep} from 'node:timers/promises';
import {randomUUID} from 'node:crypto';
import {gzipSync} from 'node:zlib';
import {MongoClient} from 'mongodb';
import Redis from 'ioredis';
import {Queue,Worker,UnrecoverableError} from 'bullmq';
import ES from 'elasticsearch';
import {FLOW_QUEUES,FLOW_POLICY,FLOW_READ_TIMEOUT_MS,FLOW_READ_ATTEMPT_TIMEOUT_MS,FLOW_JOB_RETRY_LIMIT,FLOW_JOB_RETRY_DELAY_MS,flowWorkerConcurrency,queueName,flowId,JOB_OPTIONS,detectedSource,sourcePageDecision,unpackState,facebookContinuationJobs,errorCode,boundedProxyRead,readWithJobRetries,applyFlowCounterDefaults,flowCommentPaginationDone} from '../src/services/crawlerQueueFlow.js';
import {gateSummary} from '../src/services/socialAuthGate.js';
import {createSocialApiRuntime} from '../src/services/socialApiRuntime.js';
import {createSourcePublicationCache} from '../src/services/sourcePublicationCache.js';
import {createSourceConcurrencySettings,sourceSliceExpired,SourceSliceYield,yieldSourceSlice} from '../src/services/sourceRuntimePolicy.js';
import {recoverQueuedTickets} from '../src/services/queuedTicketRecovery.js';
import {normalizeContentInput} from '../src/services/socialContent.js';
import {READ_STATE} from '../src/services/socialReadState.js';
import {HTTP_BINDING,disposeReadState} from '../src/services/socialLeaseState.js';
import {serializeCrawlItem,verifyDocumentMapping,createCrawlMappingLoader} from '../src/services/crawlerV8Es5.js';
import {nativeDocumentKey} from '../src/services/crawlerV8IndependentIngest.js';
import {flowRuntimePlan,loadFlowRuntimeTopology} from '../src/services/flowRuntimeTopology.js';
import {startFlowRuntimePulse} from '../src/services/flowRuntimePulse.js';
import {createOriginCooldowns,FlowOriginWaitError,delayOriginJob} from '../src/services/crawlerOriginCooldown.js';
import {originCooldownScope} from '../src/services/originRateLimit.js';
import {createOriginWorkerGate} from '../src/services/originWorkerGate.js';
const runtimePlan=flowRuntimePlan({role:process.env.CRAWL_FLOW_ROLE||'all',topology:loadFlowRuntimeTopology(process.env.CRAWL_TOPOLOGY_FILE||'/var/lib/crawler-v8/runtime-topology.json'),specs:FLOW_QUEUES,externalUid:process.env.CRAWL_EXTERNAL_UID_WORKER==='1'});
const workerSpecs=runtimePlan.workerSpecs;
const mongo=new MongoClient(process.env.CRAWL_MONGO_URI,{maxPoolSize:100,serverSelectionTimeoutMS:10000,socketTimeoutMS:10000,waitQueueTimeoutMS:10000});
await mongo.connect();const db=mongo.db(),jobs=db.collection('flow_jobs'),posts=db.collection('flow_posts'),sources=db.collection('sources');
const observeSourceLatestPost=createSourceLatestPostObserver({sources});
const redis=new Redis(process.env.CRAWL_REDIS_URL||'redis://127.0.0.1:6379',{maxRetriesPerRequest:null});
const originCooldowns=createOriginCooldowns({redis,collection:db.collection('flow_origin_cooldowns')});await originCooldowns.restore();
const es=new ES.Client({apiVersion:'5.6',host:process.env.ES5_HOST,log:[],maxRetries:0,requestTimeout:FLOW_READ_TIMEOUT_MS});
const queues=new Map(FLOW_QUEUES.map(q=>[q.name,new Queue(queueName(q.name),{connection:redis,defaultJobOptions:JOB_OPTIONS})]));
const resolveFacebookAuthors=createFacebookAuthorResolver({store:createMongoAuthorStore(db.collection('flow_author_identities'))});
const executeUid=createHttpExecutor({getProxy:createConfiguredProxyProvider(),timeoutMs:FLOW_READ_TIMEOUT_MS,attemptTimeoutMs:FLOW_READ_ATTEMPT_TIMEOUT_MS,maxProxyPacingWaitMs:1500,failFastProxy:true});
async function captureUnresolvedAuthorResponse(sample){
 try{
  const collection=db.collection('flow_author_response_samples'),id=flowId('native-author-response',sample.idPost,sample.idGetComment,sample.request.operation,sample.unresolved.map(x=>x.id).sort());
  const exists=await collection.findOne({_id:id},{projection:{_id:1}});
  await collection.updateOne({_id:id},{$setOnInsert:{postId:sample.idPost,parentCommentId:sample.idGetComment,sourceType:sample.sourceType,request:sample.request,comments:sample.unresolved,createdAt:new Date(),...(!exists?{responseStatus:sample.response.status,responseGzip:gzipSync(sample.response.text)}:{})},$set:{lastSeenAt:new Date()},$inc:{seenCount:1}},{upsert:true});
 }catch(e){logRuntimeError('author_response_capture_error',e);}
}
const restoreSourcePublicationDates=createSourcePublicationCache({collection:posts,metadataCollection:db.collection('flow_source_publication_metadata'),onEvent:(action,data)=>console.log(JSON.stringify({at:new Date(),event:'source_publication_cache',action,...data}))});
const groupRuntimePolicy=facebookGroupRuntimePolicy();
const runtimeOptions={reuseFacebookGroupAnonymousContext:true,facebookGroupPacingWaitMs:5000,facebookGroupSourcePageSize:groupRuntimePolicy.pageSize,restoreSourcePublicationDates,rememberSourcePublicationDates:restoreSourcePublicationDates.remember,resolveFacebookAuthors,onFacebookAuthorResponse:captureUnresolvedAuthorResponse,onFacebookSessionEvent:action=>log('facebook_session_pool',{action}),requireSourcePublicationTime:true,reuseFacebookCommentSessions:true,reuseFacebookGroupSessions:true,maxPages:1,maxItems:Number.MAX_SAFE_INTEGER,streamComments:true,streamSourceItems:true,splitFacebookPages:true,nativeSourcePages:true,timeoutMs:FLOW_READ_TIMEOUT_MS,connectTimeoutMs:6000,tlsHandshakeTimeoutMs:6000,attemptTimeoutMs:FLOW_READ_ATTEMPT_TIMEOUT_MS,maxProxyPacingWaitMs:1500,failFastProxy:true};
const runtime=createSocialApiRuntime(runtimeOptions),sourceRuntime=createSocialApiRuntime({...runtimeOptions,preferYoutubePlayerMetadata:true,preferYoutubeJsonSourceBootstrap:true,onNativeJsonRequest:data=>console.log(JSON.stringify({at:new Date(),event:'native_json_request',...data})),timeoutMs:20000,attemptTimeoutMs:45000});
const sourceConcurrency=createSourceConcurrencySettings({file:process.env.CRAWL_SOURCE_CONCURRENCY_FILE||'/var/lib/crawler-v8/source-concurrency.json',onError:code=>console.log(JSON.stringify({at:new Date(),event:'source_concurrency_invalid',code}))});sourceConcurrency.reload();
const log=(event,data={})=>console.log(JSON.stringify({at:new Date(),event,...data}));
const facebookSessions=createFacebookSessionPool({onEvent:action=>log('facebook_session_pool',{action})});
const bulkWriter=createEs5BulkWriter({es,flushMs:50,checkExisting:true,onBatch:data=>log('es5_bulk_batch',data)});
let stop=false,originWorkerGate=null;const proxyIntakeGates=new Map(),shutdown=createFlowShutdown({onError:e=>logRuntimeError('shutdown_worker_error',e),onState:(state,queue)=>log('shutdown_worker_'+state,{queue})});
const requestStop=()=>{if(!stop)log('flow_stop_requested');stop=true;for(const gate of proxyIntakeGates.values())gate.close();void originWorkerGate?.close();shutdown.requestStop();};process.on('SIGTERM',requestStop);process.on('SIGINT',requestStop);
await jobs.createIndex({queue:1,state:1});await jobs.createIndex({entityKey:1});
await jobs.createIndex({state:1,_id:1});
await db.collection('flow_error_events').createIndex({at:1,groupKey:1});
await jobs.createIndex({queue:1,sourceRoundId:1,state:1});
await db.collection('flow_source_rounds').createIndex({queue:1,state:1});
await db.collection('flow_source_round_results').createIndex({roundId:1});
await db.collection('flow_source_round_items').createIndex({roundId:1,kind:1});
await posts.createIndex({platform:1,lastInteractionAt:1,lastScheduledAt:1});
await posts.createIndex({lastInteractionAt:1},{name:'flow_posts_cleanup_lastInteractionAt'});
await sources.createIndex({platform:1,type:1,eligible:1,flowLastScheduledAt:1});
await db.collection('flow_author_response_samples').createIndex({createdAt:1},{expireAfterSeconds:7*86400});
await db.collection('flow_uid_response_samples').createIndex({updatedAt:1},{expireAfterSeconds:7*86400});
const owner=randomUUID(),lockKey=runtimePlan.lockKey;
if(!await redis.set(lockKey,owner,'EX',90,'NX'))throw Error('FLOW_RUNTIME_ALREADY_RUNNING');
const heartbeat=setInterval(async()=>{try{const ok=await redis.eval("if redis.call('get',KEYS[1])==ARGV[1] then return redis.call('expire',KEYS[1],90) else return 0 end",1,lockKey,owner);if(!ok)requestStop();}catch{requestStop();}},20000);
const payload=row=>({...row.data,mongoJobId:row._id,entityKey:row.entityKey});
async function offer(row){await queues.get(row.queue).add(row.queue,payload(row),{...JOB_OPTIONS,jobId:row._id});}
async function enqueue(queue,data,entityKey,id=flowId(queue,entityKey,randomUUID())){
 const row={_id:id,queue,entityKey,data,state:'queued',createdAt:new Date()};
 if(queue==='es5-import'){
  const existing=await jobs.findOne({_id:id});
  // A producer re-observing data must not automatically retry or overwrite a
  // retained failed import. The operator keeps the original failure to inspect.
  if(existing?.state==='failed')return id;
 }
 await jobs.updateOne({_id:id},{$setOnInsert:row},{upsert:true});await offer(row);return id;
}
async function saveState(job,state,extra={},options={}){
 await persistFlowCheckpoint({job,state,extra,jobs,...options});
}
async function importItem(item,source,parent,entityKey,sourceRoundId=parent?.sourceRoundId){
 const inventorySource=source;
 const inventorySourceId=source.discoveredFromSourceId||source._id;
 if(!parent)item=applyFlowCounterDefaults(item);
 if(!parent){const bound=bindFacebookUserPost(item,source);item=bound.item;source=bound.source;}
 const identity=nativeDocumentKey(item,source,parent),id=flowId('import',identity?.key||[source._id,parent?.systemId,item.id,item]);
 await enqueue('es5-import',{item,source,parent,sourceRoundId},'import:'+id,id);
 if(sourceRoundId)await db.collection('flow_source_round_items').updateOne({_id:flowId(sourceRoundId,parent?'comment':'post',id)},{$setOnInsert:{roundId:sourceRoundId,kind:parent?'comment':'post',sourceId:inventorySourceId,observedAt:new Date()}},{upsert:true});
 if(!parent){
  await observeSourceLatestPost({source:inventorySource,sourceId:inventorySourceId,item,nativeId:identity?.id});

 }else if(Number.isFinite(Date.parse(item.createdAt))){
  await posts.updateOne({_id:parent.documentKey},{$max:{lastInteractionAt:new Date(item.createdAt)}});
 }
}
function logReadNetwork(job,result,retry=job.data.proxyRetries||0){
 const diagnostic=readNetworkDiagnostic(result,{jobId:job.id,queue:job.queueName,platform:job.data.source?.platform||'facebook',retry});
 if(diagnostic)log('network_read_failure',diagnostic);
 return diagnostic;
}
async function recordFlowError(job,result,{kind='read_failure',phase,error,terminalReason,retry=job.data.proxyRetries||0}={}){
 const queue=job.queueName.replace(/^crawler-flow-/,''),platform=job.data.source?.platform||null;
 const detail=crawlerErrorDetails(result,{jobId:job.id,queue,platform,operation:job.data.kind||queue,phase,error,terminalReason,retry});
 const event={_id:randomUUID(),at:new Date(),kind,jobId:job.id,queue,platform,retry,...publicErrorCase(job),...detail};
 log('flow_error',event);
 try{await db.collection('flow_error_events').insertOne(event);}catch(e){log('error_event_store_failed',{eventId:event._id,jobId:job.id,errorType:e.name,code:e.codeName||e.code||null});}
 return detail;
}
function logRuntimeError(event,error,data={}){
 const detail=crawlerErrorDetails({}, {error,phase:event,queue:data.queue||'runtime',operation:event});
 log(event,{...data,error:detail.code,errorDetails:detail});
 void recordFlowError({id:data.jobId||'runtime',queueName:data.queue||'runtime',data:{kind:event}}, {},{kind:'runtime_error',phase:event,error});
}
function savedReadError(result,detail){
 return{status:result?.status||'error',reason:detail.code,originalReason:result?.reason||'READ_FAILED',diagnostic:detail,upstreamCode:result?.upstreamCode||null,upstreamOperation:result?.upstreamOperation||null,upstreamQuery:result?.upstreamQuery||null,upstreamHttpStatus:result?.upstreamHttpStatus||null,upstreamContext:result?.upstreamContext||null,retryAfterMs:Number.isFinite(result?.retryAfterMs)&&result.retryAfterMs>0?result.retryAfterMs:null};
}
async function recordRequestErrors(job,result){
 for(const timing of result?.transport?.networkTimings||[]){
  if(timing.outcome!=='error'&&!(timing.httpStatus>=400))continue;
  const reason=timing.outcome==='error'?timing.reason||result.reason:'UPSTREAM_HTTP_'+timing.httpStatus;
  await recordFlowError(job,{...result,reason,upstreamCode:timing.nativeCode||result.upstreamCode,upstreamHttpStatus:timing.httpStatus,transport:{...result.transport,networkTimings:[timing]}},{kind:'request_error'});
 }
}
async function saveReadFailure(job,result,state){
 const detail=await recordFlowError(job,result,{kind:'read_failure'});
 const extra={lastReadNetwork:logReadNetwork(job,result),lastReadError:savedReadError(result,detail),lastReadTransport:result?.transport||null,retryPolicy:FLOW_POLICY};
 if(state)await saveState(job,state,extra);
 else{Object.assign(job.data,extra);await jobs.updateOne({_id:job.id},{$set:Object.fromEntries(Object.entries(extra).map(([k,v])=>['data.'+k,v]))});await job.updateData(job.data);}
 const buffered=verifiedBufferedItems(result,job.data.source,job.data.parent||null);let offered=0;
 for(const item of buffered.items){try{await importItem(item,job.data.source,job.data.parent||null,job.data.entityKey,job.data.sourceRoundId);offered++;}catch(e){await recordFlowError(job,{}, {kind:'partial_delivery_error',phase:'import_enqueue',error:e});break;}}
 if(offered||buffered.rejected){await jobs.updateOne({_id:job.id},{$inc:{'data.bufferedItemsOffered':offered},$set:{'data.bufferedItemsRejected':buffered.rejected}});log('failed_read_buffer_preserved',{jobId:job.id,offered,rejected:buffered.rejected,readError:result.reason});}
}
function throwReadFailure(read){
 if(read.retryAt)throw new FlowProxyWaitError(FLOW_JOB_RETRY_DELAY_MS,{readyAt:read.retryAt,reason:'READ_RETRY_WAIT'});
 if(read.originDeferred)throw new FlowOriginWaitError(read.retryAfterMs,read.originScope||read.lastResult?.originScope||read.result?.originScope);
 if(read.deferred)throw new FlowProxyWaitError(read.retryAfterMs);
 if(read.failed)throw new UnrecoverableError(errorCode({code:read.lastResult?.reason||'READ_FAILED'}));
}
async function readPage(job,target,state){
 const group=job.queueName===queueName('facebook-group-source');
 target.proxyRetryContext=proxyRetryContext(job.data);
 const originScope=originCooldownScope(target);
 return readWithJobRetries({originScope,retries:job.data.proxyRetries||0,shouldStop:()=>stop,
  onGate:async result=>{
   const restricted=result.authGate?.classification==='source_restriction'&&result.authGate.confirmed===true;
   const publicBefore=[state?.seen,state?.seenIds,state?.sourceEmittedIds,state?.rootCommentIds].some(ids=>ids?.size>0);
   result.authGate=gateSummary({result,endpoints:[result.transport?.proxyEndpoint],publicBefore,classification:restricted?'source_restriction':publicBefore?'login_after_public_data':'unverified',confirmed:restricted});
   const evidence={at:new Date().toISOString(),...result.authGate};
   await saveState(job,state,{lastAuthGate:evidence});
   log('auth_gate_classified',{jobId:job.id,queue:job.queueName,reason:result.reason||null,...evidence});
  },
  onFailure:result=>saveReadFailure(job,result,state),
  read:()=>readPostCommentPage(job.data,async()=>{
   const originWait=await originCooldowns.remaining(originScope);if(originWait>0)throw new FlowOriginWaitError(originWait,originScope,'API_COOLDOWN');
   // A rotated active reply can reuse a healthy idle lease too. Otherwise each
   // retry bypasses the pool and repeats CONNECT/TLS on a random new endpoint.
   if(group&&!state?.[HTTP_BINDING]?.session){
    state ||= {kind:'facebook',items:[],seen:new Set(),nativeCursor:null,pending:true,collecting:false};
    // The pool resets context on a different source. A resumed cursor on the
    // same live session can keep its context instead of another bootstrap GET.
    const pooled=await facebookSessions.take('group:'+job.data.source._id,state,{excludeProxyEndpoints:proxyExclusions(target.proxyRetryContext),transportScope:'facebook.source_group',minRemainingMs:60000,sameSourceOnly:!groupRuntimePolicy.reuseAcrossSources});
    const binding=state[HTTP_BINDING];
    if(pooled&&binding?.facebookRequest)log('facebook_session_pool',{action:'group_context_retained'});
   }
   if(job.data.kind==='reply'&&target.platform==='facebook'&&state&&!state[HTTP_BINDING]?.session){
    const key=JSON.stringify([job.data.source._id,job.data.source.type,target.url,target.id]);
    const pooled=await facebookSessions.take(key,state,{excludeProxyEndpoints:proxyExclusions(target.proxyRetryContext),transportScope:'facebook.comments',contextKey:facebookContextKey(target)});
    if(job.data.proxyRetries>0)log('facebook_session_pool',{action:pooled?'reply_retry_hit':'reply_retry_miss'});
   }
   if(state)Object.defineProperty(target,READ_STATE,{value:state,configurable:true});
   let result;
   if(sourceSliceExpired(job.data,job.flowSliceStarted))throw new SourceSliceYield();
   try{result=await (job.data.kind==='source'?sourceRuntime:runtime).readContent(target);}catch(e){await recordFlowError(job,{}, {kind:'reader_exception',phase:'reader_runtime',error:e});result={status:'error',reason:errorCode(e)};}
   await recordRequestErrors(job,result);
   if(job.data.kind==='source'&&result.transport?.requests>0&&Date.now()-(job.data.sourceVisitWrittenAt||0)>30000){
    const at=new Date(),response=result.transport.networkTimings?.some(t=>t.httpStatus>=100),max={...(response?{responseAt:at}:{}),...(response&&result.identityVerified?{verifiedAt:at}:{})};
    try{await db.collection('flow_source_visits').updateOne({_id:String(job.data.source._id)},{$set:{queue:job.queueName.replace(/^crawler-flow-/,''),attemptedAt:at,status:result.status,reason:result.reason||null},...(Object.keys(max).length?{$max:max}:{})},{upsert:true,maxTimeMS:1500});job.data.sourceVisitWrittenAt=Date.now();}catch(e){log('source_visit_receipt_failed',{queue:job.queueName,code:e.code||e.name});}
   }
   state=result[READ_STATE]||state;
   const good=!result.emptySourceProof&&(['ok','partial'].includes(result.status)||result.status==='unavailable'&&result.identityVerified===true&&result.pagination?.hasMore===false&&!/UNVERIFIED|UNAVAILABLE|ERROR|FAILED|MISMATCH/.test(result.reason||''));
   if(!good)rememberProxyFailure(target.proxyRetryContext,result);
   return {good,result,state:result[READ_STATE]||null};
  }),
  onRetry:async(retries,result,{retryAt,rotate})=>{
   job.flowEmptyProxyAssignment=['PROXY_ENDPOINTS_UNAVAILABLE','PROXY_POOL_BUSY'].includes(result.reason)&&result.transport?.proxyUsed===false;
   if(rotate){await disposeReadState(state);if(state)delete state[HTTP_BINDING];}
   const detail=await recordFlowError(job,result,{kind:'read_retry',retry:retries});
   await saveState(job,state,{lastReadNetwork:logReadNetwork(job,result,retries),proxyRetries:retries,proxyWaitUntil:retryAt,proxyWaitReason:'READ_RETRY_WAIT',excludeProxyEndpoint:target.proxyRetryContext.excludeProxyEndpoint,excludedProxyEndpoints:target.proxyRetryContext.excludedProxyEndpoints,lastReadError:savedReadError(result,detail),lastReadTransport:result.transport||null,retryPolicy:FLOW_POLICY},{deferBull:true});
   if(group&&result.reason==='PROXY_PACING_WAIT'){const stored=!stop&&await facebookSessions.put('group:'+job.data.source._id,state);if(!stored)await disposeReadState(state);}
  }
 });
}


async function crawl(job){
 const d=job.data,source=d.source;
 if(!detectedSource(source))throw new UnrecoverableError('SOURCE_CHANNEL_TYPE_NOT_DETECTED');
 let state=unpackState(d.checkpoint),page=d.page||0,sourceSliceYielded=false;
 const cutoff=d.cutoff||Date.now()-72*3600000;
 const body=d.kind==='source'?{url:source.url,platform:source.platform,sourceType:source.type,reference:{id:source.nativeId,type:source.type,profileId:source.identityProof?.profileId||null},limit:100,count:'all',order:'latest'}:{url:d.parent.url,platform:source.platform,sourceType:source.type,limit:100,count:'all',order:'platform_default',includeReplies:true};
 const target=normalizeContentInput(d.kind==='source'?'source':'comments',body);
 const sessionKey=source.platform==='facebook'&&d.kind!=='source'?JSON.stringify([source._id,source.type,target.url,target.id]):null;
 if(sessionKey&&state&&d.kind!=='reply')await facebookSessions.take(sessionKey,state,{excludeProxyEndpoints:proxyExclusions(proxyRetryContext(d)),transportScope:'facebook.comments',contextKey:facebookContextKey(target)});
 try{
  for(;;){
   if(sourceSliceExpired(d,job.flowSliceStarted))throw new SourceSliceYield();
   let r;
   if(d.pendingPage)r=d.pendingPage;
   else{
    const read=await readPage(job,target,state);state=read.state||state;throwReadFailure(read);if(read.done)return {done:true,reason:read.lastResult.reason,pages:page};if(read.exhausted){await disposeReadState(read.lastResult?.[READ_STATE]);return {reason:'RETRY_LIMIT_EXHAUSTED'};}
    state=read.state;r=read.result;
    if(r.phase!=='collecting')page++;
    // Write ahead: the reader may already have advanced its native cursor.
    // Retain emitted rows until every deterministic import has been offered.
    const pendingPage=Object.fromEntries(['items','phase','pagination','nativePageCount','coverage','status','reason','identityVerified','nativePostId'].filter(k=>r[k]!==undefined).map(k=>[k,r[k]]));
    // Terminal readers may intentionally omit continuation state. Keep the
    // count/parent/end proof separately before pendingPage is cleared.
    await saveState(job,state,{pendingPage,page,cutoff,lastReadError:null,lastReadCoverage:r.coverage||null,lastReadPagination:r.pagination?{hasMore:r.pagination.hasMore,complete:r.pagination.complete,reason:r.pagination.reason||null}:null});
   }
   if(d.kind==='source'&&!d.sourceRoundId){
    const current=await jobs.findOne({_id:job.id},{projection:{sourceRoundId:1}});
    if(current?.sourceRoundId)d.sourceRoundId=current.sourceRoundId;
   }
   for(const item of r.items||[]){
    // importItem defaults missing comment counts to 1 without a metrics request.
    await importItem(item,source,d.parent||null,d.entityKey,d.sourceRoundId||d.parent?.sourceRoundId);
   }
   if(d.parent?.documentKey){
    const count=completedNativeCounter(r,d.parent,source.platform);
    if(count!==null)await posts.updateOne({_id:d.parent.documentKey,platform:source.platform,'parent.nativeId':d.parent.nativeId,'parent.systemId':d.parent.systemId},{$set:{'parent.commentCount':count,commentEligible:count!==0,commentCountObservedAt:new Date(),lastCommentJobId:job.id,lastNativeCommentRead:{nativeRootId:r.nativePostId,expectedPublicCount:count,observedUnique:r.coverage.observedUnique??null,complete:true,observedAt:new Date()}}});
   }
   await saveState(job,state,{pendingPage:null,page,cutoff});
   if(source.platform==='facebook'&&d.kind!=='source'){
    const next=facebookContinuationJobs(state,d.parent.nativeId);
    for(const child of next){
     const name=child.kind==='reply'?'facebook-reply':'facebook-comment';
     await enqueue(name,{kind:child.kind,source,parent:d.parent,checkpoint:child.checkpoint,native:child.native,proxyContext:{provider:'configured-manager',pool:'facebook_api_comments',refreshSession:true},page:page+1},d.entityKey,flowId(d.entityKey,child.kind,child.native));
    }
    if(sessionKey&&!stop)await facebookSessions.put(sessionKey,state);
    return {page,nextJobs:next.length};
   }
   if(d.kind==='source'&&sourcePageDecision({items:r.items,page:page+(r.phase==='collecting'?1:0),cutoff,hasMore:r.pagination?.hasMore,phase:r.phase,nativePageCount:r.nativePageCount}))return {pages:page};
   if(!state||r.pagination?.hasMore===false){
    if(d.kind!=='source'&&r.coverage?.complete===false&&!flowCommentPaginationDone(r))throw new UnrecoverableError(errorCode({code:r.coverage.reason||'COMMENT_COVERAGE_UNVERIFIED'}));
    if(r.pagination?.hasMore!==false)throw new UnrecoverableError('NATIVE_CONTINUATION_STATE_MISSING');
    return {pages:page};
   }
   await saveState(job,state,{page,cutoff});
  }
 }catch(error){if(error instanceof SourceSliceYield)sourceSliceYielded=true;throw error;
 }finally{if(!stop&&d.kind==='source'&&source.platform==='facebook'&&source.type==='group'&&state&&retainGroupSession(groupRuntimePolicy,{yielded:sourceSliceYielded}))await facebookSessions.put('group:'+source._id,state,{sameSourceForMs:sourceSliceYielded?2000:0});await disposeReadState(state);}
}
// Author IDs must already be resolved by source/comment/reply producers.
// ES5 import performs no author lookup or author repair.
async function enrichImportItem(job){
 const {parent}=job.data;let {item,source}=job.data;let changed=false;
 if(!parent){const defaults=applyFlowCounterDefaults(item);if(defaults!==item){item=defaults;job.data.item=item;changed=true;}}
 if(!parent){const bound=bindFacebookUserPost(item,source);if(bound.item!==item){item=bound.item;source=bound.source;job.data.item=item;job.data.source=source;changed=true;}}
 if(!parent&&source.platform==='facebook'&&source.type!=='group'&&item.author?.id!==source.nativeId){
  const aliases=new Set([source.nativeId,source.identityProof?.profileId].filter(Boolean));
  if(aliases.has(item.author?.profileId||item.author?.id)){item.author={...item.author,id:source.nativeId,idEvidence:'verified_source_profile_alias'};changed=true;}
 }
 if(changed){await jobs.updateOne({_id:job.id},{$set:{'data.item':item,'data.source':source,repairedAt:new Date()}});await job.updateData(job.data);await db.collection('flow_import_repairs').updateOne({_id:job.id},{$set:{platform:source.platform,itemId:item.id,sourceId:source._id,authorId:item.author?.id||null,publishedDate:item.createdAt||null,repairedAt:new Date()}},{upsert:true});}
 return changed;
}
const loadMapping=createCrawlMappingLoader({es});
async function handoffUid(data,importJobId){
 return handoffUidImport(enqueue,data,importJobId);
}
async function lookupUid(job){
 const context=proxyRetryContext(job.data);
 const originScope=originCooldownScope({platform:'facebook',operation:'resolve_source'});
 const supplied=operatorSuppliedUid(job.data.item);
 const read=supplied?{good:true,result:supplied}:await boundedProxyRead({originScope,initialRetries:job.data.proxyRetries||0,shouldStop:()=>stop,onWait:async result=>{await saveState(job,null,{excludedProxyEndpoints:context.excludedProxyEndpoints,proxyWaitUntil:Date.now()+Math.max(1000,Math.min(30000,result.retryAfterMs||5000))});},onFailure:result=>saveReadFailure(job,result),
  onOriginWait:async result=>{const until=await originCooldowns.defer(originScope,result);await saveReadFailure(job,result);await saveState(job,null,{originWaitUntil:until,originScope});},
  read:async()=>{
   const originWait=await originCooldowns.remaining(originScope);if(originWait>0)throw new FlowOriginWaitError(originWait,originScope,'API_COOLDOWN');
   const result=await executeUid({platform:'facebook',operation:'resolve_source',proxyRetryContext:context},async session=>{
    try{return await findFacebookUid(session,job.data.item,{onSnapshot:async(snapshot,url)=>{
     await db.collection('flow_uid_response_samples').updateOne({_id:job.id},{$set:{url,httpStatus:snapshot.httpStatus,responseGzip:gzipSync(snapshot.html),updatedAt:new Date()}},{upsert:true});
    }});}catch(e){return{status:'error',reason:errorCode(e)};}
   });
   await recordRequestErrors(job,result);
   if(result.status!=='resolved')rememberProxyFailure(context,result);
   return{good:result.status==='resolved'&&/^[1-9]\d*$/.test(result.id||''),result};
  },rotate:async()=>{},
  onRetry:async(retries,result)=>{
   const detail=await recordFlowError(job,result,{kind:'read_retry',retry:retries});
   Object.assign(job.data,{lastReadNetwork:logReadNetwork(job,result,retries),proxyRetries:retries,excludeProxyEndpoint:context.excludeProxyEndpoint,excludedProxyEndpoints:context.excludedProxyEndpoints,lastReadError:savedReadError(result,detail),lastReadTransport:result.transport||null,retryPolicy:FLOW_POLICY});
   await jobs.updateOne({_id:job.id},{$set:{data:job.data}});await job.updateData(job.data);
   await job.log(JSON.stringify({retry:retries,reason:job.data.lastReadError.reason,proxy:'different-endpoint-required',excludedEndpoint:context.excludeProxyEndpoint,excludedEndpoints:proxyExclusions(context)}));
  }
 });
 throwReadFailure(read);if(read.done)return {done:true,reason:read.lastResult.reason};if(read.exhausted)throw new UnrecoverableError('FACEBOOK_UID_RETRY_LIMIT_EXHAUSTED');
 const {id,evidence,url}=read.result,{item,source,parent,originalImportJobId}=job.data;
 // Share only response-backed identity facts with future producer reads.
 await resolveFacebookAuthors([{authorId:id,authorIdEvidence:evidence,authorOpaqueId:item.author?.opaqueId,authorUrl:url}],null);
 const next=await enqueueUidResolvedImport({enqueue,data:job.data,proof:read.result,lookupJobId:job.id});
 await db.collection('flow_import_repairs').updateOne({_id:originalImportJobId},{$set:{platform:'facebook',itemId:item.id,authorId:id,evidence,lookupJobId:job.id,importJobId:next,repairedAt:new Date()}},{upsert:true});
 return{reason:'UID_FOUND',authorId:id,importJobId:next};
}
async function writeEs(job){
 job.flowPhase='import_validate';
 job.flowPhase='import_enrich';await enrichImportItem(job);job.flowPhase='import_validate';
 const {item,source,parent}=job.data;let doc;
 try{
  doc=serializeCrawlItem(item,source,{parent});
  job.flowPhase='es5_mapping_lookup';const mapping=await loadMapping(doc);
  job.flowPhase='import_mapping_validate';verifyDocumentMapping(doc,mapping);
  for(const [field,value]of Object.entries(doc._source)){const type=mapping.properties[field]?.type;if(value!=null&&['text','string','keyword'].includes(type)&&typeof value!=='string')throw Object.assign(Error('ES5_TEXT_INVALID_'+field),{code:'ES5_TEXT_INVALID_'+field});}
 }catch(e){
  if(needsUidLookup(job.data,errorCode(e))){const lookupJobId=await handoffUid(job.data,job.id);return{skipped:true,reason:'UID_LOOKUP_QUEUED',lookupJobId};}
  const failure=new UnrecoverableError(errorCode(e));failure.cause=e;throw failure;
 }
 job.flowPhase='import_parent_validate';return commitCrawlDocument({doc,item,source,parent,sourceRoundId:job.data.sourceRoundId,
  write:d=>{job.flowPhase='es5_bulk_write';return bulkWriter.write(d);},
  upsertTarget:target=>{job.flowPhase='mongo_post_target';return posts.updateOne({_id:target.key},postTargetUpdate(target),{upsert:target.allowCreate});}
 });
}
async function recordSourceOutcome(spec,job,row,error,result){
 if(spec.kind!=='source')return;
 const roundId=row?.sourceRoundId||job?.data?.sourceRoundId||(await jobs.findOne({_id:job.id},{projection:{sourceRoundId:1}}))?.sourceRoundId;
 if(!roundId)return;
 await db.collection('flow_source_round_results').updateOne({_id:job.id},{$setOnInsert:{roundId,queue:spec.name,sourceId:job.data.source._id,outcome:sourceRoundOutcome(error,result),error:error||null,terminalReason:result?.done?result.reason:null,pages:result?.pages||0,finishedAt:new Date()}},{upsert:true});
}
originWorkerGate=createOriginWorkerGate({remaining:scope=>originCooldowns.remaining(scope),shouldStop:()=>stop,onEvent:(event,data)=>log(event,{role:runtimePlan.role,...data}),onError:(error,data)=>logRuntimeError('origin_worker_gate_error',error,data)});
const workers=workerSpecs.map(q=>{
 const w=new CheckpointWorker(queueName(q.name),async (job,token)=>runCrawlerQueue(job.queueName,async()=>{
  job.flowSliceStarted=Date.now();
  let row;try{
  job.flowPhase='mongo_job_load';row=await jobs.findOne({_id:job.id});
  if(!row){
   const data={...job.data,kind:job.data.kind||q.kind};
   const entityKey=data.entityKey||(q.kind==='source'?'source:'+data.source?._id:q.kind==='import'?'import:'+job.id:'comments:'+data.parent?.documentKey);
   row={_id:job.id,queue:q.name,entityKey,data,...(data.sourceRoundId?{sourceRoundId:data.sourceRoundId}:{}),state:'queued',createdAt:new Date()};
   await jobs.updateOne({_id:job.id},{$setOnInsert:row},{upsert:true});Object.assign(job.data,{entityKey});
  }
  // Recover cursor saved immediately before a restart or interrupted Bull update.
  if(row.state!=='failed')Object.assign(job.data,row.data);
  else await jobs.updateOne({_id:job.id},{$set:{data:job.data}});
  if(job.data.originWaitUntil>Date.now())throw new FlowOriginWaitError(job.data.originWaitUntil-Date.now(),job.data.originScope,'API_COOLDOWN');
  if(job.data.sourceYieldUntil>Date.now())throw new SourceSliceYield();
  if(job.data.proxyWaitUntil>Date.now()){
   const readyAt=job.data.proxyWaitUntil,reason=job.data.proxyWaitReason;
   throw new FlowProxyWaitError(readyAt-Date.now(),{readyAt,reason});
  }
  job.flowPhase='mongo_job_start';await jobs.updateOne({_id:job.id},{$set:{state:'running',startedAt:new Date()},$unset:{proxyDeferred:'',sourceDeferred:'',originDeferred:''}});
   job.flowPhase=q.kind==='import'?'import_validate':q.kind==='uid'?'uid_read':'source_read';
   const result=q.kind==='import'?await writeEs(job):q.kind==='uid'?await lookupUid(job):await crawl(job);
   if(result?.reason==='RETRY_LIMIT_EXHAUSTED')throw new UnrecoverableError('RETRY_LIMIT_EXHAUSTED');
   if(result?.done){await db.collection('flow_terminal_outcomes').updateOne({_id:job.id},{$setOnInsert:{queue:q.name,sourceId:job.data.source?._id,parentId:job.data.parent?.systemId||null,reason:result.reason,...(result.proxyError?{proxyError:result.proxyError,pages:result.pages}:{}),...(result.partial?{partial:true,proxyBudgetReason:result.proxyBudgetReason,proxyBudgetStartedAt:result.proxyBudgetStartedAt,proxyWaitMs:result.proxyWaitMs,cursorProxyCount:result.cursorProxyCount}:{}),authGate:job.data.lastAuthGate||null,policy:FLOW_POLICY,finishedAt:new Date()}},{upsert:true});log('job_done_by_policy',{queue:q.name,jobId:job.id,reason:result.reason,...(result.proxyError?{proxyError:result.proxyError}:{}),authGate:job.data.lastAuthGate||null});}
   const success=!result?.done&&successfulCommentJobUpdate(job,q.kind);if(success)await posts.updateOne(success.filter,success.update);
   await recordSourceOutcome(q,job,row,null,result);
   job.flowPhase='mongo_job_cleanup';await jobs.deleteOne({_id:job.id});return result;
  }catch(e){
   if(e instanceof FlowOriginWaitError){
    if(stop){await jobs.updateOne({_id:job.id},{$set:{state:'queued'}});throw Worker.RateLimitError();}
    await originWorkerGate.hold(e.scope,e.retryAfterMs).catch(error=>logRuntimeError('origin_worker_gate_error',error,{scope:e.scope}));
    log('origin_rate_wait',{queue:q.name,jobId:job.id,scope:e.scope,retryAfterMs:e.retryAfterMs,reason:e.originReason});return delayOriginJob({job,token,jobs,error:e});
   }
   if(e instanceof SourceSliceYield){
    if(stop){await jobs.updateOne({_id:job.id},{$set:{state:'queued'}});throw Worker.RateLimitError();}
    log('source_slice_yield',{queue:q.name,jobId:job.id,page:job.data.page||0,retries:job.data.proxyRetries||0});return yieldSourceSlice({job,token,jobs});
   }
   if(e instanceof FlowProxyWaitError){
    if(stop){await jobs.updateOne({_id:job.id},{$set:{state:'queued'}});throw Worker.RateLimitError();}
    await proxyIntakeGates.get(q.name)?.observe({jobId:job.id,assignmentUnavailable:job.flowEmptyProxyAssignment===true}).catch(error=>logRuntimeError('proxy_intake_backoff_error',error,{queue:q.name}));
    log('proxy_assignment_wait',{queue:q.name,jobId:job.id,retryAfterMs:e.retryAfterMs,checkpointSaved:!!job.data.checkpoint,proxyRetries:job.data.proxyRetries||0,excludedEndpoints:proxyExclusions(proxyRetryContext(job.data))});
    return delayProxyJob({job,token,jobs,error:e});
   }
   if(e instanceof ProxyWaitDelayedError)throw e;
   if(e.message==='WORKER_STOPPED'){await jobs.updateOne({_id:job.id},{$set:{state:'queued'}});// BullMQ DelayedError unconditionally fetches another job, even while closing.
    // Its rate-limit sentinel requeues this active ticket without a new fetch or failure.
    throw Worker.RateLimitError();}
   const originalFlowReason=errorCode(e);
   const last=job.data.lastReadError,fromRead=last&&(originalFlowReason===(last.originalReason||last.reason)||/RETRY_LIMIT_EXHAUSTED/.test(originalFlowReason));
   const result=fromRead?{...last,reason:last.originalReason||last.reason,transport:job.data.lastReadTransport}:{};
   const detail=await recordFlowError(job,result,{kind:'job_failed',phase:fromRead?undefined:job.flowPhase,error:e,terminalReason:originalFlowReason});
   const failure=isolatedClassifiedError(e,detail,originalFlowReason);
   await jobs.updateOne({_id:job.id},{$set:{state:'failed',error:detail.code,errorDetails:detail,failedAt:new Date(),...(e.esError?{esImportError:{status:e.statusCode,error:e.esError}}:{})}});await recordSourceOutcome(q,job,row,originalFlowReason);throw failure;
  }
 }),{connection:redis,concurrency:sourceConcurrency.get(q),lockDuration:180000,autorun:false});
 originWorkerGate.register(q,w);
 if(q.name==='facebook-group-source')proxyIntakeGates.set(q.name,createProxyIntakeBackoff({worker:w,shouldStop:()=>stop,onEvent:(event,data)=>log(event,{queue:q.name,...data})}));
 w.on('completed',(job,result)=>{db.collection('flow_counters').updateOne({_id:q.name},{$inc:{completed:1,...(result?.partial?{partial:1}:{}),...(q.kind==='import'&&!result?.skipped?{indexed:1}:{}),...(q.kind==='import'&&result?.reason==='ES5_DOCUMENT_EXISTS'?{duplicatesSkipped:1}:{}),...(result?.reason==='RETRY_LIMIT_EXHAUSTED'?{retryExhausted:1}:{})},$set:{updatedAt:new Date(),...(q.kind==='import'&&!result?.skipped?{lastIndexed:result}:{})}},{upsert:true}).catch(e=>logRuntimeError('counter_error',e));});
 w.on('error',e=>logRuntimeError('worker_error',e,{queue:q.name}));w.on('failed',(job,e)=>{
   log('job_failed',{queue:q.name,jobId:job?.id,error:errorCode(e),originalReason:e.originalFlowReason||null,errorDetails:e.flowDiagnostic||null});
  if(!job)return;
  (async()=>{const detail=e.flowDiagnostic||await recordFlowError(job,{}, {kind:'job_failed',phase:'bull_worker',error:e});const row=await jobs.findOne({_id:job.id});await jobs.updateOne({_id:job.id},{$set:{state:'failed',error:detail.code,errorDetails:detail,failedAt:new Date()}});await recordSourceOutcome(q,job,row,e.originalFlowReason||errorCode(e));await db.collection('flow_counters').updateOne({_id:q.name},{$inc:{failed:1,...(/RETRY_LIMIT_EXHAUSTED$/.test(e.originalFlowReason||errorCode(e))?{retryExhausted:1}:{})},$set:{updatedAt:new Date()}},{upsert:true});})().catch(e=>logRuntimeError('counter_error',e));
 });return w;
});
shutdown.setWorkers(workers);
const concurrencyTimer=setInterval(()=>{sourceConcurrency.reload();for(const [i,q]of workerSpecs.entries()){const desired=sourceConcurrency.get(q);if(workers[i].concurrency!==desired){workers[i].concurrency=desired;log('source_concurrency_changed',{queue:q.name,concurrency:desired});}}},5000);concurrencyTimer.unref();
let sourceCoordinatorMetrics={};
const refillSourceRound=createSourceRoundCoordinator({db,queues,minimumRefillIntervalMs:1000,sourceRescanMs:2*3600000,rescanWhileWaiting:spec=>spec.name!=='facebook-group-source',idleRefillIntervalMs:10000,reconcileIntervalMs:15000,onMetric:(name,queue)=>{const key=queue+':'+name;sourceCoordinatorMetrics[key]=(sourceCoordinatorMetrics[key]||0)+1;},shouldStop:()=>stop,log,enqueueSources:async(q,round,rows,existingEntityKeys)=>{
   await enqueueAllEligibleSources({rows,existingEntityKeys,shouldStop:()=>stop,
    enqueueBatch:async batch=>{
     const createdAt=new Date(),outbox=batch.map(({source,entityKey})=>({_id:flowId(q.name,round._id,entityKey),queue:q.name,entityKey,sourceRoundId:round._id,data:{kind:q.kind,source,sourceRoundId:round._id,proxyContext:{provider:'configured-manager',refreshSession:true}},state:'queued',createdAt}));
     // Persist the entire batch before publishing its Bull tickets.
     await jobs.bulkWrite(outbox.map(row=>({updateOne:{filter:{_id:row._id},update:{$setOnInsert:row},upsert:true}})));
     await queues.get(q.name).addBulk(outbox.map(row=>({name:q.name,data:payload(row),opts:{...JOB_OPTIONS,jobId:row._id}})));
    },
    markScheduledBatch:batch=>sources.bulkWrite(batch.map(({source})=>({updateOne:{filter:{_id:source._id},update:{$set:{flowLastScheduledAt:new Date()}}}})))});
}});
const scanCommentCandidates=createCommentCandidateScanner({
 shouldStop:()=>stop,
 findPage:({filter,after,limit})=>posts.find(after===null?filter:{$and:[filter,{_id:{$gt:after}}]}).sort({_id:1}).limit(limit).toArray(),
 findBlocked:keys=>jobs.distinct('entityKey',{entityKey:{$in:keys}}),
 hasExisting:entityKey=>jobs.findOne({entityKey},{projection:{_id:1}}),
 enqueue:(q,row,entityKey)=>enqueue(q.name,{kind:q.kind,source:row.source,parent:row.parent,proxyContext:{provider:'configured-manager',refreshSession:true}},entityKey),
 markScheduled:row=>posts.updateOne({_id:row._id},{$set:{lastScheduledAt:new Date()}})
});
async function refill(q){
 if(q.kind==='uid'){
  const rows=await jobs.find({queue:'es5-import',state:'failed',uidLookupJobId:{$exists:false},error:{$in:['FACEBOOK_COMMENT_AUTHOR_ID_UNVERIFIED','POST_AUTHOR_SOURCE_MISMATCH']},'data.source.platform':'facebook'}).limit(100).toArray();
  for(const row of rows){
   if(!needsUidLookup(row.data,row.error))continue;
   await migrateFailedUidImport({row,ticket:await queues.get('es5-import').getJob(row._id),jobs,backups:db.collection('flow_import_repair_backups'),enqueue});
  }
  return;
 }
 const isSource=q.kind==='source',collection=isSource?sources:posts;
 const filter=isSource?{eligible:true,canonicalSourceId:null,platform:q.platform,type:q.type,nativeId:{$regex:q.platform==='youtube'?'^UC[\\w-]{22}$':'^\\d+$'},...(q.platform==='facebook'&&q.type!=='group'?{identityStatus:'verified',$expr:{$and:[{$eq:['$identityProof.nativeId','$nativeId']},{$eq:['$identityProof.type','$type']}]}}:{$or:[{'audit.status':'live'},{identityStatus:'verified'}]})}:commentCandidateFilter(q.platform);
 if(isSource)return refillSourceRound(q,filter);
 const counts=await queues.get(q.name).getJobCounts('waiting','active','delayed','paused');
 const capacity=q.workers*2-Object.values(counts).reduce((a,b)=>a+b,0);if(capacity<=0)return;
 const result=await scanCommentCandidates(q,filter,capacity);
 if(result.offered)log('comment_candidates_admitted',{queue:q.name,...result});
}
const feeders=runtimePlan.coordinator?startContinuousQueueFeeders({queues:FLOW_QUEUES,refill,shouldStop:()=>stop,onError:(q,e)=>logRuntimeError('feeder_error',e,{queue:q.name})}):[];
let lastClean=0,lastReport=0,lastOutboxRepair=0,outboxAfter=null;
let outboxMetrics={checked:0,missing:0,recovered:0};
const recoverableQueuedFilter=()=>({state:'queued',$and:[{$or:[{proxyDeferred:{$ne:true}},{'data.proxyWaitUntil':{$lte:Date.now()}}]},{$or:[{sourceDeferred:{$ne:true}},{'data.sourceYieldUntil':{$lte:Date.now()}}]},{$or:[{originDeferred:{$ne:true}},{'data.originWaitUntil':{$lte:Date.now()}}]}]});
let coordinatorPhase='startup',coordinatorPhaseSince=Date.now(),coordinatorProgressAt=Date.now();
const coordinatorStage=value=>{coordinatorPhase=value;coordinatorPhaseSince=Date.now();coordinatorProgressAt=Date.now();};
const retention=runtimePlan.coordinator?createFlowRetention({db,redis,queues,onResult:result=>log('flow_retention',result),onError:error=>logRuntimeError('flow_retention_error',error)}):null;
const checkpointResumes=runtimePlan.coordinator?startCheckpointResumeScheduler({redis,jobs,resumeBurst:1,fifoBurst:3,shouldStop:()=>stop,log,onError:error=>logRuntimeError('checkpoint_resume_error',error)}):null;
const runtimePulse=startFlowRuntimePulse({file:runtimePlan.pulseFile,role:runtimePlan.role,extra:()=>{const outbox=outboxMetrics,sourceCoordinator=sourceCoordinatorMetrics;outboxMetrics={checked:0,missing:0,recovered:0};sourceCoordinatorMetrics={};return{outbox,sourceCoordinator,retention:retention?.status()||null,checkpointResume:checkpointResumes?.status()||null,originWorkerGate:originWorkerGate.status(),workerQueues:workerSpecs.map(q=>q.name),workerConcurrency:Object.fromEntries(workerSpecs.map(q=>[q.name,sourceConcurrency.get(q)])),coordinator:runtimePlan.coordinator?{phase:coordinatorPhase,phaseSince:coordinatorPhaseSince,progressAt:coordinatorProgressAt}:null};},onError:e=>log('runtime_pulse_write_failed',{role:runtimePlan.role,code:e.code||e.name}),onSample:p=>log('runtime_pulse',p)});
try{
 await Promise.all(workers.map(worker=>worker.waitUntilReady()));
 await originWorkerGate.sync();originWorkerGate.start();
 for(const worker of workers)void worker.run().catch(error=>{logRuntimeError('worker_run_error',error,{queue:worker.name});requestStop();});
 await runtimePulse.sampleNow();
 log('flow_started',{role:runtimePlan.role,topologyMode:runtimePlan.mode,workerQueues:workerSpecs.map(q=>q.name),policy:FLOW_POLICY,postFirstCounterPlatforms:POST_FIRST_COUNTER_PLATFORMS,commentRescanMinMs:COMMENT_RESCAN_MIN_MS,readTimeoutMs:FLOW_READ_TIMEOUT_MS,readAttemptTimeoutMs:FLOW_READ_ATTEMPT_TIMEOUT_MS,retryLimit:FLOW_JOB_RETRY_LIMIT,retryDelayMs:FLOW_JOB_RETRY_DELAY_MS,queues:FLOW_QUEUES});
 retention?.start();
 while(!stop){
  // Durable outbox: recover queued tickets after a Redis outage or partial enqueue.
  if(runtimePlan.coordinator&&Date.now()-lastOutboxRepair>=1000){
   coordinatorStage('outbox_scan');
   const outbox=await jobs.find({...recoverableQueuedFilter(),...(outboxAfter?{_id:{$gt:outboxAfter}}:{})},{projection:{_id:1,queue:1}}).sort({_id:1}).limit(1000).toArray();
   outboxAfter=outbox.length?outbox.at(-1)._id:null;
   coordinatorStage('outbox_recover');
   const result=await recoverQueuedTickets({rows:outbox,queues,redis,loadMissing:ids=>jobs.find({...recoverableQueuedFilter(),_id:{$in:ids}}).toArray(),offer,shouldStop:()=>stop});
   for(const key of Object.keys(outboxMetrics))outboxMetrics[key]+=result[key];
   lastOutboxRepair=Date.now();
  }
  if(runtimePlan.coordinator&&Date.now()-lastClean>60000){
   coordinatorStage('running_ticket_reconcile');
   for(const row of await jobs.find({state:'running'},{projection:{_id:1,queue:1}}).toArray())if(!await (await queues.get(row.queue).client).exists(queues.get(row.queue).toKey(row._id)))await jobs.updateOne({_id:row._id,state:'running'},{$set:{state:'queued'}});
   // Retain failed Mongo evidence even if a Redis ticket was removed externally.
   coordinatorStage('post_cache_cleanup');await posts.deleteMany({lastInteractionAt:{$lt:new Date(Date.now()-72*3600000)}});lastClean=Date.now();}
  if(Date.now()-lastReport>15000){
   coordinatorStage('status_report');const pulse=runtimePulse.latest||await runtimePulse.sampleNow();
   log('flow_status',{...pulse,queues:await Promise.all((runtimePlan.coordinator?FLOW_QUEUES:workerSpecs).map(async q=>({name:q.name,workers:q.workers,concurrency:sourceConcurrency.get(q),...await queues.get(q.name).getJobCounts('waiting','active','failed')})))});lastReport=Date.now();}
  coordinatorStage('idle');
  await sleep(100);
 }
}finally{
 requestStop();
 const draining=shutdown.drain();
 await checkpointResumes?.close();await Promise.allSettled(feeders);await draining;await retention?.close();await facebookSessions.close();await originWorkerGate.close();clearInterval(heartbeat);clearInterval(concurrencyTimer);await runtimePulse.close();
 await redis.eval("if redis.call('get',KEYS[1])==ARGV[1] then return redis.call('del',KEYS[1]) else return 0 end",1,lockKey,owner);
 await Promise.all([...queues.values()].map(q=>q.close()));await redis.quit();await mongo.close();es.close();
}
