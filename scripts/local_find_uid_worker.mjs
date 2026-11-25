import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {createHash} from 'node:crypto';
import {MongoClient} from 'mongodb';
import Redis from 'ioredis';
import {Queue,Worker,UnrecoverableError} from 'bullmq';
import {uidLookupUrl} from '../src/services/facebookFindUid.js';
import {readFacebookProfileWithProof} from '../src/services/facebookProfileDiagnostics.js';
import {facebookAuthorProfileKey} from '../src/services/facebookAuthorIdentity.js';
import {createFacebookAuthorResolver,createMongoAuthorStore} from '../src/services/facebookAuthorResolution.js';
import {enqueueUidResolvedImport} from '../src/services/uidQueueHandoff.js';
import {JOB_OPTIONS,queueName} from '../src/services/crawlerQueueFlow.js';
import {crawlerErrorDetails,publicErrorCase,isolatedClassifiedError} from '../src/services/crawlerErrorDetails.js';
import {createLocalUidAccountUsage} from '../src/services/localUidAccountUsage.js';
import {trackedUidRequest} from '../src/services/localUidTrackedRequest.js';

const dir=path.resolve(process.env.LOCAL_UID_DIR||'outputs/local-uid-worker-2026-10-29');
const credentials=JSON.parse(fs.readFileSync(path.join(dir,'local-connection.credentials.json'),'utf8'));
const curlConfig=path.join(dir,'curl.credentials.conf');
const usage=createLocalUidAccountUsage({dir});
const mongo=new MongoClient(credentials.mongo,{serverSelectionTimeoutMS:15000,maxPoolSize:40,socketTimeoutMS:45000});
await mongo.connect();
const db=mongo.db(),jobs=db.collection('flow_jobs');
const redis=new Redis(credentials.redis,{maxRetriesPerRequest:null,connectTimeout:15000});
const queue=new Queue(queueName('find-uid'),{connection:redis,defaultJobOptions:JOB_OPTIONS});
const imports=new Queue(queueName('es5-import'),{connection:redis,defaultJobOptions:JOB_OPTIONS});
const resolveAuthors=createFacebookAuthorResolver({store:createMongoAuthorStore(db.collection('flow_author_identities'))});
let previous={};try{previous=JSON.parse(fs.readFileSync(path.join(dir,'status.json'),'utf8'));}catch{}
const stats={startedAt:previous.startedAt||new Date().toISOString(),sessionStartedAt:new Date().toISOString(),host:os.hostname(),processed:previous.processed||0,resolved:previous.resolved||0,cacheHits:previous.cacheHits||0,failed:previous.failed||0,httpRequests:previous.httpRequests||0};
const log=(event,data={})=>console.log(JSON.stringify({at:new Date().toISOString(),event,...data}));
function recordLocalRuntimeError(kind,error){
 const detail=crawlerErrorDetails({}, {queue:'find-uid',platform:'facebook',operation:'local_uid_worker',phase:kind,error});
 const row={_id:createHash('sha256').update(kind+':'+Date.now()+':'+Math.random()).digest('hex'),at:new Date(),kind:'runtime_error',jobId:'runtime',queue:'find-uid',platform:'facebook',...detail};
 log('flow_error',row);log(kind,{error:detail.code,errorDetails:detail});void db.collection('flow_error_events').insertOne(row).catch(e=>log('error_event_store_failed',{eventId:row._id,errorType:e.name,code:e.codeName||e.code||null}));
}
function recordUsage(action){try{return action();}catch(error){recordLocalRuntimeError('uid_usage_log_error',error);}}
const save=()=>fs.writeFileSync(path.join(dir,'status.json'),JSON.stringify({...stats,pid:process.pid,concurrency:worker?.concurrency,updatedAt:new Date().toISOString()},null,2)+'\n',{mode:0o600});
const inFlight=new Map(),resolvedCache=new Map();
let worker,stopping=false;
let initialConcurrency=Number(process.env.LOCAL_UID_CONCURRENCY||3);
try{const {concurrency}=JSON.parse(fs.readFileSync(path.join(dir,'settings.json'),'utf8'));if(Number.isInteger(concurrency)&&concurrency>=1&&concurrency<=100)initialConcurrency=concurrency;}catch{}
async function enqueue(name,data,entityKey,id){
 await jobs.updateOne({_id:id},{$setOnInsert:{_id:id,queue:name,entityKey,data,state:'queued',createdAt:new Date()}},{upsert:true});
 await imports.add(name,{...data,mongoJobId:id,entityKey},{...JOB_OPTIONS,jobId:id});return id;
}
async function requestProfileSnapshot(url){
 stats.httpRequests++;
 const snapshot=await trackedUidRequest({dir,configFile:curlConfig,url,usage,concurrency:worker?.concurrency,onTelemetryError:error=>recordLocalRuntimeError('uid_usage_log_error',error)});
 if(snapshot.httpStatus===429){recordUsage(()=>usage.observe(snapshot));await worker.rateLimit(60000);const error=Worker.RateLimitError();error.httpStatus=429;throw error;}
 return snapshot;
}
async function requestProfile(url,job){
 let usageRef;
 const proof=await readFacebookProfileWithProof({url,request:requestProfileSnapshot,onResult:async result=>{usageRef=result.snapshot.uidUsageRef;recordUsage(()=>usage.observe(result.snapshot,result));},onFailure:async diagnostic=>{
  const detail=crawlerErrorDetails({reason:diagnostic.reason,httpStatus:diagnostic.httpStatus},{queue:'find-uid',platform:'facebook',operation:'local_curl_profile',phase:diagnostic.httpStatus===200?'uid_profile_route':'http_response'});
  const event={_id:createHash('sha256').update(job.id+':profile:'+Date.now()+':'+diagnostic.attempt).digest('hex'),at:new Date(),kind:'request_error',jobId:job.id,queue:'find-uid',platform:'facebook',...publicErrorCase(job),...detail,profileDiagnostics:diagnostic};
  log('flow_error',event);try{await db.collection('flow_error_events').insertOne(event);}catch(e){log('error_event_store_failed',{eventId:event._id,jobId:job.id,errorType:e.name,code:e.codeName||e.code||null});}
  await db.collection('flow_uid_response_samples').updateOne({_id:diagnostic.responseSha256},{$set:{diagnostics:diagnostic,lastJobId:job.id,updatedAt:new Date()},$setOnInsert:{createdAt:new Date()},$inc:{seenCount:1}},{upsert:true});
  if(diagnostic.retry)log('uid_profile_retry',{jobId:job.id,reason:diagnostic.reason,attempt:diagnostic.attempt,maxAttempts:2});
 }});
 const copy=value=>Buffer.from(value,'utf8').toString('utf8');return{...proof,id:copy(proof.id),evidence:copy(proof.evidence),url:copy(proof.url),usageRef,usageSource:'network'};
}
async function lookup(item,job){
 const url=uidLookupUrl(item);if(!url)throw new UnrecoverableError('FACEBOOK_AUTHOR_PROFILE_URL_REQUIRED');
 const key=facebookAuthorProfileKey(url)||url;
 const currentContext=usage.context(fs.readFileSync(curlConfig,'utf8'));
 if(resolvedCache.has(key)){stats.cacheHits++;return {...resolvedCache.get(key),cached:true,usageRef:currentContext,usageSource:'memory_cache'};}
 if(inFlight.has(key)){stats.cacheHits++;return {...await inFlight.get(key),usageSource:'shared_request'};}
 const promise=(async()=>{
  const keys=[item.author?.opaqueId,facebookAuthorProfileKey(item.author?.profileUrl),key].filter(Boolean);
  const facts=await db.collection('flow_author_identities').find({_id:{$in:keys},conflict:{$ne:true},checkedAt:{$gte:new Date(Date.now()-86400000)},evidence:{$not:/^user_confirmed(?:\.|$)/}}).toArray();
  const ids=new Set(facts.filter(f=>/^[1-9]\d*$/.test(f.id||'')).map(f=>f.id));
  if(ids.size>1)throw new UnrecoverableError('FACEBOOK_PROFILE_UID_CONFLICT');
  if(ids.size===1){stats.cacheHits++;const fact=facts.find(f=>ids.has(f.id));return{id:fact.id,evidence:fact.evidence,url,cached:true,usageRef:currentContext,usageSource:'mongo_cache'};}
  return requestProfile(url,job);
 })();inFlight.set(key,promise);
 try{const proof=await promise;resolvedCache.set(key,proof);while(resolvedCache.size>5000)resolvedCache.delete(resolvedCache.keys().next().value);return proof;}finally{inFlight.delete(key);}
}
worker=new Worker(queueName('find-uid'),async job=>{
 const started=Date.now(),row=await jobs.findOne({_id:job.id});
 if(row?.state!=='failed'&&row?.data)Object.assign(job.data,row.data);
 await jobs.updateOne({_id:job.id},{$set:{state:'running',startedAt:new Date(),localUidWorker:os.hostname()}});
 try{
  const proof=await lookup(job.data.item,job),{item,originalImportJobId}=job.data;
  await resolveAuthors([{authorId:proof.id,authorIdEvidence:proof.evidence,authorOpaqueId:item.author?.opaqueId,authorUrl:proof.url}],null);
  const next=await enqueueUidResolvedImport({enqueue,data:job.data,proof,lookupJobId:job.id});
  await db.collection('flow_import_repairs').updateOne({_id:originalImportJobId},{$set:{platform:'facebook',itemId:item.id,authorId:proof.id,evidence:proof.evidence,lookupJobId:job.id,importJobId:next,repairedAt:new Date(),localUidWorker:os.hostname()}},{upsert:true});
  fs.appendFileSync(path.join(dir,'resolved.jsonl'),JSON.stringify({at:new Date().toISOString(),jobId:job.id,url:proof.url,uid:proof.id,evidence:proof.evidence,responseSha256:proof.responseSha256,importJobId:next})+'\n',{mode:0o600});
  await jobs.deleteOne({_id:job.id});stats.resolved++;stats.processed++;save();
  recordUsage(()=>usage.jobResolved(proof.usageRef,{jobId:job.id,source:proof.usageSource}));
  log('uid_resolved',{jobId:job.id,url:proof.url,uid:proof.id,cached:!!proof.cached,importJobId:next,ms:Date.now()-started,accountKey:proof.usageRef.accountKey,sessionKey:proof.usageRef.sessionKey,uidSource:proof.usageSource});
  return {reason:'UID_FOUND',authorId:proof.id,importJobId:next,workerHost:os.hostname()};
 }catch(e){
  if(e.message===Worker.RateLimitError().message){
   const detail=crawlerErrorDetails({reason:'FACEBOOK_PROFILE_HTTP_429',httpStatus:e.httpStatus},{queue:'find-uid',platform:'facebook',operation:'local_curl_profile',phase:'http_response'});
   const event={_id:createHash('sha256').update(job.id+':'+Date.now()).digest('hex'),at:new Date(),kind:'request_error',jobId:job.id,queue:'find-uid',platform:'facebook',...publicErrorCase(job),...detail};log('flow_error',event);try{await db.collection('flow_error_events').insertOne(event);}catch{}
   await jobs.updateOne({_id:job.id},{$set:{state:'queued'}});throw e;
  }
  stats.failed++;stats.processed++;const original=e.code||e.message,curlCode=Number(original?.match(/^LOCAL_CURL_EXIT_(\d+)$/)?.[1]);
  const phase=({5:'curl_proxy_dns',6:'curl_origin_dns',7:'curl_connect',18:'curl_partial_body',28:'curl_deadline',35:'curl_tls_handshake',47:'curl_redirect_limit',51:'curl_certificate',52:'curl_empty_response',55:'curl_send',56:'curl_receive',60:'curl_certificate',61:'curl_decode',63:'curl_size_limit'})[curlCode]||(e.profileDiagnostics?.httpStatus===200?'uid_profile_route':'uid_lookup');
  const httpStatus=e.profileDiagnostics?.httpStatus||Number(original?.match(/^FACEBOOK_PROFILE_HTTP_(\d+)$/)?.[1]);
  const detail=crawlerErrorDetails({reason:original,httpStatus:Number.isInteger(httpStatus)?httpStatus:null,transport:curlCode?{nativeCode:'CURL_EXIT_'+curlCode}:{}},{queue:'find-uid',platform:'facebook',operation:'local_curl_profile',phase,error:e});
  const failure=isolatedClassifiedError(e,detail,original);
  const event={_id:createHash('sha256').update(job.id+':'+Date.now()).digest('hex'),at:new Date(),kind:'job_failed',jobId:job.id,queue:'find-uid',platform:'facebook',...publicErrorCase(job),...detail,...(e.profileDiagnostics?{profileDiagnostics:e.profileDiagnostics}:{})};
  log('flow_error',event);try{await db.collection('flow_error_events').insertOne(event);}catch(storeError){log('error_event_store_failed',{eventId:event._id,jobId:job.id,errorType:storeError.name,code:storeError.codeName||storeError.code||null});}
  await jobs.updateOne({_id:job.id},{$set:{state:'failed',error:detail.code,errorDetails:detail,failedAt:new Date(),...(e.profileDiagnostics?{profileDiagnostics:e.profileDiagnostics}:{})}});save();log('uid_failed',{jobId:job.id,error:detail.code,ms:Date.now()-started});throw failure;
 }
},{connection:redis,concurrency:initialConcurrency,lockDuration:180000,name:'local-uid-'+os.hostname(),autorun:false,limiter:{max:6,duration:1000}});
worker.on('error',e=>recordLocalRuntimeError('worker_error',e));
worker.on('failed',()=>db.collection('flow_counters').updateOne({_id:'find-uid'},{$inc:{failed:1},$set:{updatedAt:new Date()}},{upsert:true}).catch(e=>recordLocalRuntimeError('counter_error',e)));
worker.on('completed',()=>db.collection('flow_counters').updateOne({_id:'find-uid'},{$inc:{completed:1},$set:{updatedAt:new Date()}},{upsert:true}).catch(e=>recordLocalRuntimeError('counter_error',e)));
if(process.argv.includes('--retry-failed')){
 const failed=await queue.getFailed(0,-1);const ids=failed.map(j=>j.id);fs.writeFileSync(path.join(dir,'retry-failed-snapshot.json'),JSON.stringify({at:new Date(),ids}),{mode:0o600});let retried=0;
 for(const job of failed){await jobs.updateOne({_id:job.id},{$set:{state:'queued'},$unset:{error:'',failedAt:''}});await job.retry('failed',{resetAttemptsMade:true,resetAttemptsStarted:true});retried++;}
 log('failed_snapshot_requeued',{retried});
}
const timer=setInterval(()=>{void (async()=>{save();recordUsage(()=>usage.saveSummary());log('local_uid_status',{...stats,concurrency:worker.concurrency,memoryMB:Math.round(process.memoryUsage().rss/1048576),heapMB:Math.round(process.memoryUsage().heapUsed/1048576),counts:await queue.getJobCounts('waiting','active','failed','delayed')});})().catch(error=>recordLocalRuntimeError('health_poll_error',error));},15000);
const settingsTimer=setInterval(()=>{try{const {concurrency}=JSON.parse(fs.readFileSync(path.join(dir,'settings.json'),'utf8'));if(Number.isInteger(concurrency)&&concurrency>=1&&concurrency<=100&&worker.concurrency!==concurrency){worker.concurrency=concurrency;save();log('local_uid_scaled',{concurrency});}}catch(e){if(e.code!=='ENOENT')log('settings_error',{error:e.code||e.message});}},1000);
async function stop(signal){if(stopping)return;stopping=true;clearInterval(timer);clearInterval(settingsTimer);log('local_uid_stopping',{signal,pid:process.pid,parentPid:process.ppid});await worker.close();recordUsage(()=>usage.saveSummary());await Promise.all([queue.close(),imports.close()]);await redis.quit();await mongo.close();stats.stoppedAt=new Date().toISOString();save();}
for(const sig of['SIGTERM','SIGINT'])process.on(sig,()=>stop(sig).then(()=>process.exit(0)));
fs.writeFileSync(path.join(dir,'worker.pid'),String(process.pid));save();log('local_uid_started',{pid:process.pid,concurrency:worker.concurrency,queue:queueName('find-uid')});await worker.run();
