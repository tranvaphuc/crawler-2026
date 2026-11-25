import {verifyNativeCommentJob} from '../src/services/crawlerV8NativeCommentVerification.js';
import {PUBLIC_STOP_POLICY,publicReadStop,bufferedPublicRows,publicBufferHeldReason} from '../src/services/crawlerV8PublicStop.js';
import {applyYoutubeCommentDate} from '../src/services/youtubeCommentDates.js';
import {makeThreadContextProof} from '../src/services/threadCommentContext.js';
import {sourceWindowBoundary,SOURCE_WINDOW_POLICY} from '../src/services/sourceWindowBoundary.js';
import {RECENT_SOURCE_POLICY,RECENT_SOURCE_INTERVAL_MS,RECENT_SOURCE_REQUEUE_STATES,RECENT_SOURCE_ACCESS_REQUEUE_LIMIT,recentSourceAdmissionFilter,recentSourceWindow,jobWindow,recentPassOutcome} from '../src/services/crawlerV8Recent3d.js';
import {CONTINUOUS_FLOW_POLICY,continuousWorkerBudget,recentCommentWatch} from '../src/services/crawlerV8ContinuousFlow.js';
import {reconcileSourceWindowJobs} from '../src/services/crawlerV8SourceWindowCompletion.js';
import {PROXY_JOB_POLICY,PROXY_JOB_RETRY_LIMIT,publicAccessFailure,proxyRetryCount,runPinnedProxyJob} from '../src/services/crawlerV8ProxyRetry.js';
import fs from 'node:fs/promises';import path from 'node:path';import {randomUUID} from 'node:crypto';import {setTimeout as sleep} from 'node:timers/promises';
import {MongoClient} from 'mongodb';import ES from 'elasticsearch';
import {inspectYoutubeExisting} from '../src/services/youtubeExistingComment.js';
import {flushIndependentCrawlDocuments as flushCrawlDocuments,ownParentReady,publicReadFinished} from '../src/services/crawlerV8IndependentIngest.js';
import {stabilizeYoutubeCommentDate} from '../src/services/youtubeCommentDates.js';
import {createSocialApiRuntime} from '../src/services/socialApiRuntime.js';
import {normalizeContentInput} from '../src/services/socialContent.js';import {READ_STATE} from '../src/services/socialReadState.js';import {disposeReadState,rotateReadStateProxy} from '../src/services/socialLeaseState.js';
import {encodeBackfillState,decodeBackfillState,backfillOutcome,drainPinnedBackfill,crawlRetryDelay} from '../src/services/crawlerV8Backfill.js';
import {normalizeMetricsInput} from '../src/services/socialMetrics.js';
import {createProxyManagerClient} from '../src/services/proxyManagerClient.js';
import {prepareCrawlSourceInput,sourceIdentityChanged,hasVerifiedSourceReceipt,canRestoreSourceReceipt,shouldInvalidateSourceIdentity,exactPostCommentCount,commentCountDecision,unverifiedCommentCountResult} from '../src/services/crawlerV8Policy.js';
import {CRAWL_READY_INDEXES,workerPlan,plannedClaimSlots,mainCapacity,adaptiveWorkerBudget,jobClassFilter,claimCrawlJob,renewCrawlJobLease,commentPlatformPlan,adaptiveCommentPlatformPlan,commentSourceFocus,shardAllocation} from '../src/services/crawlerV8Scheduling.js';
import {commentReadComplete} from '../src/services/crawlerV8CommentCompletion.js';
import {reconcileIndependentComments as reconcileCrawlComments,acceptExistingQuarantineIds} from '../src/services/crawlerV8IndependentCompletion.js';
import {serializeCrawlItem,verifyDocumentMapping,classifyCrawlResult} from '../src/services/crawlerV8Es5.js';
const dir=process.env.CRAWL_DATA_DIR||'outputs/crawler-v8-2026-10-25',runId=process.env.CRAWL_RUN_ID||'october-2026-v8';
const mongo=new MongoClient(process.env.CRAWL_MONGO_URI,{maxPoolSize:80,serverSelectionTimeoutMS:10000,waitQueueTimeoutMS:10000,socketTimeoutMS:45000});await mongo.connect();const db=mongo.db();
const es=new ES.Client({apiVersion:'5.6',host:process.env.ES5_HOST,log:[],requestTimeout:45000,maxRetries:0});
const safe=e=>/^[A-Z][A-Z0-9_.:-]{0,140}$/.test(e?.code||e?.message||'')?(e.code||e.message):'INTERNAL_'+(e?.name||'ERROR').replace(/[^A-Za-z0-9_]/g,'');
const log=(event,data={})=>console.log(JSON.stringify({at:new Date().toISOString(),event,...data}));const atomic=async(name,data)=>{await fs.mkdir(dir,{recursive:true});const file=path.join(dir,name);await fs.writeFile(file+'.tmp',JSON.stringify(data,null,2),{mode:0o600});await fs.rename(file+'.tmp',file);};
const cmd=process.argv[2]||'status';let stop=false;process.on('SIGTERM',()=>stop=true);process.on('SIGINT',()=>stop=true);
async function indexes(){for(const name of ['sources','jobs','documents','quarantine','runs','recent_source_passes'])await db.createCollection(name).catch(e=>{if(e.codeName!=='NamespaceExists')throw e;});await db.collection('sources').createIndex({platform:1,type:1,nativeId:1});await db.collection('jobs').createIndex({runId:1,state:1,nextAt:1,priority:1,leasedUntil:1});await db.collection('jobs').createIndex({runId:1,kind:1,sourceId:1,state:1,nextAt:1});await db.collection('jobs').createIndex({runId:1,resumePending:-1,state:1,nextAt:1});await db.collection('jobs').createIndex({runId:1,kind:1,readComplete:1,state:1,completionCheckedAt:1,completionNextAt:1});await db.collection('documents').createIndex({state:1,nextAt:1});await db.collection('documents').createIndex({runId:1,kind:1});await db.collection('quarantine').createIndex({runId:1,resolvedAt:1,independentPresenceCheckedAt:1});await db.collection('jobs').createIndex({runId:1,kind:1,readComplete:1,state:1,independentCheckedAt:1});await db.collection('jobs').createIndexes([{key:{runId:1,kind:1,platform:1,state:1,nextAt:1,priority:1},name:'independent_platform_due'},{key:{runId:1,kind:1,platform:1,state:1,leasedUntil:1},name:'independent_platform_expired'},{key:{runId:1,kind:1,platform:1,sourceId:1,state:1,resumePending:1,nextAt:1,priority:1},name:'independent_platform_source_resume'}]);await db.collection('jobs').createIndexes(CRAWL_READY_INDEXES);await db.collection('documents').createIndex({runId:1,kind:1,sourceId:1,state:1});await db.collection('quarantine').createIndex({runId:1,sourceId:1,resolvedAt:1,jobId:1});await db.collection('recent_source_passes').createIndex({runId:1,sourceId:1,pass:1},{unique:true});await db.collection('recent_source_passes').createIndex({runId:1,endedAt:1});}
await indexes();
await db.collection('jobs').createIndex({runId:1,kind:1,state:1,backfillComplete:1,postQueueClearedAt:1});
if(cmd==='import'){
 const input=JSON.parse(await fs.readFile(process.argv[3]||path.join(dir,'sources.json')));const until=process.env.CRAWL_UNTIL||new Date().toISOString();
 await db.collection('runs').updateOne({_id:runId},{$setOnInsert:{since:'2026-09-30T17:00:00.000Z',until,createdAt:new Date(),status:'prepared',schemaEvidence:'es5-live.json',sourcesImported:input.length}},{upsert:true});
 for(let n=0;n<input.length;n+=500){const part=input.slice(n,n+500);await db.collection('sources').bulkWrite(part.map(s=>({updateOne:{filter:{_id:s._id},update:{$set:{...s,importedAt:new Date()},$setOnInsert:{latestPostAt:null,latestPostUrl:null,lastAttemptAt:null,lastSuccessAt:null}},upsert:true}})));
 const ops=part.filter(s=>s.eligible).map(s=>({updateOne:{filter:{_id:`${runId}:source:${s._id}`},update:{$setOnInsert:{runId,kind:'source',platform:s.platform,sourceId:s._id,state:'pending',priority:1,attempts:0,nextAt:new Date(),createdAt:new Date()}},upsert:true}}));if(ops.length)await db.collection('jobs').bulkWrite(ops);}
 log('imported',{sources:input.length,eligible:input.filter(s=>s.eligible).length});
}else if(cmd==='status')await status();else if(cmd==='smoke')await smoke();else if(cmd==='run')await run();else throw Error('Use import|status|smoke|run');
await mongo.close();es.close();
async function status(){
 const run=await db.collection('runs').findOne({_id:runId}),jobs=await db.collection('jobs').aggregate([{$match:{runId}},{$group:{_id:{kind:'$kind',platform:'$platform',state:'$state'},count:{$sum:1}}}]).toArray();
 const docs=await db.collection('documents').aggregate([{$match:{runId}},{$group:{_id:{kind:'$kind',platform:'$platform',state:'$state'},count:{$sum:1}}}]).toArray();
 const errors=await db.collection('jobs').aggregate([{$match:{runId,lastReason:{$ne:null}}},{$group:{_id:'$lastReason',count:{$sum:1}}},{$sort:{count:-1}},{$limit:12}]).toArray();
 const states=Object.fromEntries((await db.collection('sources').aggregate([{$group:{_id:'$eligible',count:{$sum:1}}}]).toArray()).map(x=>[x._id?'eligible':'blocked',x.count]));
 const report={at:new Date().toISOString(),run,jobs,documents:docs,sources:states,quarantine:await db.collection('quarantine').countDocuments({runId}),errors};
 await atomic('status.json',report);if(cmd==='status')log('status',report);return report;
}
async function smoke(){
 const rt=createSocialApiRuntime(),run=await db.collection('runs').findOne({_id:runId}),report=[];
 for(const [platform,type]of [['facebook','page'],['facebook','group'],['facebook','user'],['threads','profile'],['instagram','profile'],['youtube','channel']]){
  const s=await db.collection('sources').findOne({platform,type,eligible:true});if(!s)continue;
  let target,result;try{const b=await rt.prepareInput({url:s.url,platform,sourceType:type,limit:2,count:2},'source');target=normalizeContentInput('source',b);result=await rt.readContent(target);const valid=[],rejected=[];
   for(const item of result.items||[])try{const d=serializeCrawlItem(item,s,{since:run.since,until:run.until});valid.push({_id:d._id,_type:d._type,_index:d._index,publishedDate:d._source.publishedDate,ds:d._source.ds});}catch(e){rejected.push(e.code||'SERIALIZE_ERROR');}
   report.push({platform,type,source:s._id,status:result.status,reason:result.reason,identityVerified:result.identityVerified,count:result.items?.length,valid,rejected,transport:result.transport,coverage:result.coverage});
  }catch(e){report.push({platform,type,error:safe(e)})}finally{if(result?.[READ_STATE])await disposeReadState(result[READ_STATE]);}await atomic('smoke.json',report);log('smoke',report.at(-1));
 }
}
async function run(){
 const token=randomUUID(),now=new Date(),runs=db.collection('runs'),shards=db.collection('worker_shards');
 const shardCount=Number(process.env.CRAWL_SHARD_COUNT||1),shardIndex=Number(process.env.CRAWL_SHARD_ID||0),leader=shardIndex===0,configured=Math.min(1000,Math.max(1,Number(process.env.CRAWL_MAX_CONCURRENCY)||245));
 const facebookSource=Math.floor(configured/2),commentWorkers=configured-facebookSource,otherSource=0;
 const fullPlan=workerPlan({mainTotal:configured,facebookSource,comments:commentWorkers,otherSource,shardIndex,shardCount}),lockId=`${runId}:worker:${shardIndex}`;
 let desired=0,active=0,cycles=0,commentCycle=0,lastRecentQueueAt=0;const activeByClass={facebook_source:0,comments:0,other_source:0},activeCommentPlatforms={facebook:0,youtube:0,threads:0,instagram:0},threads=new Set();let plan={facebook_source:0,comments:0,other_source:0},commentPlan=commentPlatformPlan(0),completedSourceIds=[],recentSourceIds=[],commentFocus={},lastReport=0;
 const context=await runs.findOne({_id:runId});if(!context)throw Error('CRAWL_RUN_MISSING');if(context.lockToken&&context.lockUntil>now)throw Object.assign(Error(),{code:'RUN_ALREADY_ACTIVE'});
 const live=await shards.countDocuments({runId,status:'running',lockUntil:{$gt:now}});if(live&&(context.workerShardCount!==shardCount||context.mainWorkerCeiling!==configured))throw Object.assign(Error(),{code:'WORKER_SHARD_CONFIG_MISMATCH'});
 await shards.updateOne({_id:lockId},{$setOnInsert:{runId,shardIndex,createdAt:now}},{upsert:true});
 const lock=await shards.findOneAndUpdate({_id:lockId,$or:[{lockUntil:{$lt:now}},{lockUntil:{$exists:false}}]},{$set:{lockToken:token,lockUntil:new Date(Date.now()+120000),status:'running',activeWorkers:0,activeByClass:{...activeByClass},lastStartedAt:now}},{returnDocument:'after'});if(!lock)throw Object.assign(Error(),{code:'RUN_ALREADY_ACTIVE'});
 await runs.updateOne({_id:runId},{$set:{status:'running',workerShardCount:shardCount,mainWorkerCeiling:configured,workerBudget:{source:facebookSource,comments:commentWorkers},flowPolicy:CONTINUOUS_FLOW_POLICY,lastStartedAt:now}});
 async function ownLease(){const r=await shards.updateOne({_id:lockId,lockToken:token},{$set:{lockUntil:new Date(Date.now()+120000),heartbeatAt:new Date(),activeWorkers:active,activeByClass:{...activeByClass},activeCommentPlatforms:{...activeCommentPlatforms},commentTargetByPlatform:commentPlan,commentFocusByPlatform:Object.fromEntries(Object.entries(commentFocus).map(([k,ids])=>[k,ids.length])),desiredWorkers:desired,targetByClass:plan}});if(!r.matchedCount)stop=true;return r.matchedCount===1;}
 const heartbeat=setInterval(()=>ownLease().catch(()=>stop=true),20000);
 const rt=createSocialApiRuntime({getProxy:createProxyManagerClient(),maxPages:2,maxItems:Number.MAX_SAFE_INTEGER,streamComments:true,timeoutMs:90000}),mappings=JSON.parse(await fs.readFile(path.join(dir,'es5-live.json'))).mappings;
 const rows=await es.cat.indices({index:'master20*',format:'json',h:'index,status'});const available=rows.filter(x=>x.status==='open'&&/^master\d{6}$/.test(x.index)).map(x=>x.index);const selected=available.filter(x=>x>='master202639');if(!selected.length)throw Error('ES5_WINDOW_INDICES_MISSING');
 // Validate each emitted document against both the evidence and its destination mapping.
 // Optional legacy fields vary between weeks and are never written by this worker.
 const liveMappings={};
 for(const index of selected){const live=await es.indices.getMapping({index});liveMappings[index]=live[index]?.mappings||{};}
 async function ensureIndex(index){if(selected.includes(index))return;const live=await es.indices.getMapping({index});if(!live[index]?.mappings)throw Object.assign(Error('ES5_INDEX_OUTSIDE_VERIFIED_WINDOW'),{code:'ES5_INDEX_OUTSIDE_VERIFIED_WINDOW'});liveMappings[index]=live[index].mappings;selected.push(index);if(!available.includes(index))available.push(index);}

 const quarantine=async(raw,source,reason,job)=>{const k=`${runId}:${source._id}:${job.crawlMode===RECENT_SOURCE_POLICY?'recent3d':job.kind}:${raw.id||raw._id||'unknown'}`;await db.collection('quarantine').updateOne({_id:k},{$setOnInsert:{runId,sourceId:source._id,jobId:job._id,reason,raw,createdAt:new Date()}},{upsert:true});};
 async function stage(item,s,j,parent){
  const window=jobWindow(j,context);let d;try{d=serializeCrawlItem(item,s,{parent,now:new Date().toISOString(),since:window.since,until:window.until});await ensureIndex(d._index);verifyDocumentMapping(d,mappings[d._type]);verifyDocumentMapping(d,liveMappings[d._index]?.[d._type]);}catch(e){if(e.code!=='OUTSIDE_CRAWL_WINDOW')await quarantine(item,s,e.code||'ES5_VALIDATION_FAILED',j);return null;}
  if(parent&&s.platform==='facebook'&&item.author?.opaqueId&&/^\d+$/.test(item.author.id)&&!String(item.author.idEvidence||'').startsWith('verified_es5_same_native_comment')){
   const prior=await db.collection('facebook_author_identities').findOne({_id:item.author.opaqueId});if(prior&&prior.nativeId!==item.author.id){await quarantine(item,s,'FACEBOOK_AUTHOR_IDENTITY_CONFLICT',j);return null;}
   await db.collection('facebook_author_identities').updateOne({_id:item.author.opaqueId},{$setOnInsert:{nativeId:item.author.id,evidence:item.author.idEvidence||'numeric_author_metadata',profileUrl:item.author.profileUrl||null,createdAt:new Date()}},{upsert:true});
  }
  const key=d._type+':'+d._id;
  await db.collection('documents').updateOne({_id:key},{$setOnInsert:{runId,kind:j.kind==='source'?'post':'comment',platform:s.platform,sourceId:s._id,document:d,raw:item,state:'pending',windowSince:j.crawlMode===RECENT_SOURCE_POLICY||j.recentParent?window.since:undefined,windowUntil:j.crawlMode===RECENT_SOURCE_POLICY||j.recentParent?window.until:undefined,createdAt:new Date(),nextAt:new Date()}},{upsert:true});
  if(!parent){const post={nativeId:d.nativeId,systemId:d._id,url:d._source.url,createdAt:d._source.publishedDate,text:item.text||'',sourceId:s._id,documentKey:key,commentCount:exactPostCommentCount(item)};
   await db.collection('sources').updateOne({_id:s._id,$or:[{latestPostAt:null},{latestPostAt:{$lt:d._source.publishedDate}}]},{$set:{latestPostAt:d._source.publishedDate,latestPostUrl:d._source.url,latestPostId:d._id}});
   const decision=commentCountDecision(post.commentCount);
   const recent=j.crawlMode===RECENT_SOURCE_POLICY,commentJobId=recent?`${runId}:recent3d:comments:${d._type}:${d._id}`:`${runId}:comments:${d._type}:${d._id}`;
   await db.collection('jobs').updateOne({_id:commentJobId},{$setOnInsert:{runId,kind:'comments',platform:s.platform,sourceId:s._id,parent:post,state:decision==='skip'?'skipped':'pending',priority:1,lastReason:decision==='skip'?'POST_COMMENTS_ZERO':null,attempts:0,nextAt:new Date(),createdAt:new Date(),...(recent?{recentParent:true,windowSince:post.createdAt,windowUntil:new Date().toISOString(),maxObservedCommentCount:post.commentCount,lastCountIncreaseAt:new Date(),watchState:decision==='skip'?'zero':'active'}:{})}},{upsert:true});
   if(decision==='fetch')await db.collection('jobs').updateOne({_id:commentJobId,state:'skipped',lastReason:'POST_COMMENTS_ZERO'},{$set:{state:'pending',priority:1,parent:post,lastReason:null,nextAt:new Date(),...(recent?{recentParent:true,windowSince:post.createdAt,windowUntil:new Date().toISOString(),maxObservedCommentCount:post.commentCount,lastCountIncreaseAt:new Date(),watchState:'active'}:{})},$unset:{finishedAt:'',commentWindowLockedAt:''}});
   if(decision==='fetch')await db.collection('jobs').updateOne({_id:commentJobId,state:{$in:['pending','retry']}},{$set:{priority:1,parent:post}});
   if(decision==='fetch'&&recent){
    const current=await db.collection('jobs').findOne({_id:commentJobId},{projection:{state:1,backfillComplete:1,createdAt:1,lastVerifiedCommentCount:1,maxObservedCommentCount:1,lastCountIncreaseAt:1,lastCommentPublishedAt:1,watchRetiredAt:1}}),at=new Date(),watch=recentCommentWatch(current,post.commentCount,at);
    const increased=post.commentCount>(current.maxObservedCommentCount??current.lastVerifiedCommentCount??0);
    if(watch.action==='retire')await db.collection('jobs').updateOne({_id:commentJobId,state:'done',backfillComplete:true,watchRetiredAt:{$exists:false}},{$set:{state:'skipped',lastReason:watch.reason,watchRetiredAt:at,watchState:'retired',postQueueClearedAt:at},$unset:{'parent.text':'',commentReadManifest:'',commentReadPagination:''}});
    else if(watch.action==='fetch')await db.collection('jobs').updateOne({_id:commentJobId,state:'done',backfillComplete:true,watchRetiredAt:{$exists:false}},{$set:{state:'pending',priority:1,parent:post,windowSince:post.createdAt,windowUntil:at.toISOString(),readComplete:false,backfillComplete:false,nextAt:at,lastReason:'NATIVE_COMMENT_COUNT_INCREASED',watchState:'active',maxObservedCommentCount:post.commentCount,...(increased?{lastCountIncreaseAt:at}:{})},$unset:{commentReadManifest:'',commentReadPagination:'',coverage:'',coverageComplete:'',commentWindowLockedAt:'',finishedAt:''}});
    if(increased)await db.collection('jobs').updateOne({_id:commentJobId,state:{$in:['pending','retry','running']}},{$max:{maxObservedCommentCount:post.commentCount},$set:{lastCountIncreaseAt:at,watchState:'active'}});
   }
   if(decision==='skip')await db.collection('jobs').updateOne({_id:commentJobId,state:{$in:['pending','retry']}},{$set:{state:'skipped',parent:post,lastReason:'POST_COMMENTS_ZERO',finishedAt:new Date(),...(recent?{watchState:'zero'}:{})}});
  }return d;
 }
 async function recordLatestPost(item,s){
  let d;try{d=serializeCrawlItem(item,s);if(Date.parse(d._source.publishedDate)>Date.now())return;}catch{return;}
  await db.collection('sources').updateOne({_id:s._id,$or:[{latestPostAt:null},{latestPostAt:{$lt:d._source.publishedDate}}]},{$set:{latestPostAt:d._source.publishedDate,latestPostUrl:d._source.url,latestPostId:d._id,latestPostObservedAt:new Date()}});
 }
 async function processJobAttempt(j){
  const s=await db.collection('sources').findOne({_id:j.sourceId});let identityAttempted=false,identityVerified=false,state=null,last=null,verifiedCommentCount=null,checkpointLoaded=false,keepCheckpoint=true,jobLeaseLost=false,persistCheckpoint=null;const lease=j.leaseToken;
  if(j.crawlMode===RECENT_SOURCE_POLICY&&!j.windowSince){const at=new Date(),w=recentSourceWindow(at);await db.collection('jobs').updateOne({_id:j._id,leaseToken:lease,windowSince:{$exists:false}},{$set:{windowSince:w.since,windowUntil:w.until,passStartedAt:at}});Object.assign(j,{windowSince:w.since,windowUntil:w.until,passStartedAt:at});}
  if(j.recentParent&&!j.commentWindowLockedAt){const at=new Date();await db.collection('jobs').updateOne({_id:j._id,leaseToken:lease,commentWindowLockedAt:{$exists:false}},{$set:{windowUntil:at.toISOString(),commentWindowLockedAt:at}});j.windowUntil=at.toISOString();j.commentWindowLockedAt=at;}
  const window=jobWindow(j,context);await db.collection('jobs').updateOne({_id:j._id,leaseToken:lease},{$set:{leaseToken:lease,executionPolicy:'pinned_proxy50_shared_scope_v1',pinnedAt:new Date(),workerWaiting:false}});
  const pulse=setInterval(()=>db.collection('jobs').updateOne({_id:j._id,leaseToken:lease},{$set:{leasedUntil:new Date(Date.now()+180000),workerHeartbeatAt:new Date()}}).then(r=>{if(!r.matchedCount)jobLeaseLost=true;}).catch(()=>{}),30000);
  async function preflightFailure(result,classification){
   const publicStop=publicReadStop(result);if(publicStop){await stopPublicJob(j,publicStop,result);return;}
   if(classification!=='blocked'){
    await db.collection('jobs').updateOne({_id:j._id,leaseToken:lease},{$set:{state:'running',retryProxyPending:true,retryProxyResult:{status:result.status,reason:result.reason||'UPSTREAM_UNKNOWN',retryAfterMs:result.retryAfterMs||null},proxyRetryCount:proxyRetryCount(j),lastStatus:result.status,lastReason:result.reason||'UPSTREAM_UNKNOWN',backfillComplete:false,updatedAt:new Date()}});return;
   }
   await db.collection('jobs').updateOne({_id:j._id,leaseToken:lease},{$set:{state:'blocked',backfillComplete:false,resumePending:j.resumePending||0,lastStatus:result.status,lastReason:result.reason||'UPSTREAM_BLOCKED',updatedAt:new Date()},$unset:{leaseToken:'',leasedUntil:'',waitingUntil:''}});if(j.crawlMode===RECENT_SOURCE_POLICY)await recordRecentTerminal(j,result.reason||'UPSTREAM_BLOCKED');
  }
  try{
   if(j.publicStopPending){
    const cp=await db.collection('read_checkpoints').findOne({_id:j._id,sourceId:s._id,since:window.since,until:window.until}),saved=cp?decodeBackfillState(Buffer.isBuffer(cp.payload)?cp.payload:cp.payload.buffer):null,rows=bufferedPublicRows({},saved,{platform:s.platform,kind:j.kind}),parent=j.kind==='comments'?await db.collection('documents').findOne({_id:j.parent.documentKey}):null,held=publicBufferHeldReason(j,s,saved,parent);let staged=0;
    if(!held)for(let item of rows){if(j.kind==='comments'&&s.platform==='youtube'){applyYoutubeCommentDate(item,saved?.dateObservedAt??Date.now());if(item.dateIsEstimated)item=await stabilizeYoutubeCommentDate(db.collection('youtube_comment_date_estimates'),item,j.parent.nativeId);}const time=Date.parse(item.createdAt);if(time<Date.parse(window.since)||time>Date.parse(window.until))continue;if(j.kind==='source')await recordLatestPost(item,s);if(await stage(item,s,j,j.parent||null))staged++;}
    await db.collection('jobs').updateOne({_id:j._id,leaseToken:lease},{$set:{publicBufferedRows:rows.length,publicBufferedStaged:staged,publicBufferHeldReason:held}});await stopPublicJob(j,j.publicStopPending,{status:j.lastStatus,reason:j.publicStopPending.reason});return;
   }
   if(j.kind==='comments'&&commentCountDecision(j.parent.commentCount)==='skip'){
    await db.collection('jobs').updateOne({_id:j._id,leaseToken:lease},{$set:{state:'skipped',lastReason:'POST_COMMENTS_ZERO',finishedAt:new Date()},$unset:{leaseToken:'',leasedUntil:''}});return;
   }
   if(j.kind==='comments'&&j.recoveryAction==='verify_source_identity'&&j.readComplete===true&&hasVerifiedSourceReceipt(s)){
    if(canRestoreSourceReceipt(s))await db.collection('sources').updateOne({_id:s._id,identityStatus:'unverified',identityProof:s.identityProof},{$set:{identityStatus:'verified',identityRestoredFromProofAt:new Date()}});
    await db.collection('jobs').updateOne({_id:j._id,leaseToken:lease},{$set:{state:'waiting_data',completionNextAt:new Date(),lastReason:'SOURCE_STORED_NATIVE_PROOF_RESTORED',identityRecoveryCheckedAt:new Date()},$unset:{recoveryAction:'',leaseToken:'',leasedUntil:''}});return;
   }
   let preparedSource=null;
   if(s.platform==='facebook'&&s.type!=='group'){
    identityAttempted=true;preparedSource=await prepareCrawlSourceInput(rt,s);identityVerified=true;
    const r=preparedSource.reference,proof={type:r.type,nativeId:r.id,profileId:r.profileId||null,evidence:r.evidence,checkedAt:new Date()};
    if(sourceIdentityChanged(s,preparedSource)){
     const canonicalId=`facebook:${r.type}:${r.id}`,canonical={platform:'facebook',type:r.type,nativeId:r.id,name:r.name||s.name,url:preparedSource.url,eligible:true,identityStatus:'verified',identityProof:proof};
     await db.collection('sources').updateOne({_id:canonicalId},{$set:canonical,$setOnInsert:{latestPostAt:null,latestPostUrl:null,importedAt:new Date()},$addToSet:{aliases:s._id,projects:{$each:s.projects||[]},originalLinks:{$each:s.originalLinks||[]}}},{upsert:true});
     await db.collection('sources').updateOne({_id:s._id},{$set:{eligible:false,identityStatus:'redirected',canonicalSourceId:canonicalId,identityProof:proof,blockedReason:'SOURCE_IDENTITY_RECLASSIFIED'}});
     await db.collection('jobs').updateOne({_id:`${runId}:source:${canonicalId}`},{$setOnInsert:{runId,kind:'source',platform:'facebook',sourceId:canonicalId,state:'pending',priority:1,attempts:0,nextAt:new Date(),createdAt:new Date()}},{upsert:true});
     await db.collection('documents').updateMany({sourceId:s._id,state:{$in:['pending','held_identity']}},{$set:{state:'held_identity_review',error:'SOURCE_IDENTITY_RECLASSIFIED'}});
     await db.collection('jobs').updateOne({_id:j._id,leaseToken:lease},{$set:{state:'redirected',lastReason:'SOURCE_IDENTITY_RECLASSIFIED',canonicalSourceId:canonicalId,finishedAt:new Date()},$unset:{leaseToken:'',leasedUntil:''}});return;
    }
    await db.collection('sources').updateOne({_id:s._id},{$set:{identityStatus:'verified',identityProof:proof,name:r.name||s.name}});
    await db.collection('documents').updateMany({sourceId:s._id,state:'held_identity'},{$set:{state:'pending',nextAt:new Date()},$unset:{error:''}});
   }
   if(j.kind==='comments'&&j.recoveryAction==='verify_source_identity'){
    await db.collection('jobs').updateOne({_id:j._id,leaseToken:lease},{$set:{state:'waiting_data',completionNextAt:new Date(),lastReason:'SOURCE_IDENTITY_REVERIFIED',identityRecoveryCheckedAt:new Date()},$unset:{recoveryAction:'',leaseToken:'',leasedUntil:''}});return;
   }
   if(j.kind==='comments'){
    const parentDoc=await db.collection('documents').findOne({_id:j.parent.documentKey},{projection:{state:1,raw:1,document:1,sourceId:1,kind:1}});
    if(!ownParentReady(j,parentDoc,s,context)){
      await db.collection('jobs').updateOne({_id:j._id,leaseToken:lease},{$set:{state:parentDoc&&['conflict','rejected'].includes(parentDoc.state)?'blocked':'retry',lastReason:'OWN_PARENT_FIELDS_INVALID',nextAt:new Date(Date.now()+2000)},$unset:{leaseToken:'',leasedUntil:''}});return;
    }
    let commentCount=j.parent.commentCount??exactPostCommentCount(parentDoc.raw);
    if(commentCountDecision(commentCount)==='verify'){
     const metrics=await rt.readMetrics(normalizeMetricsInput({url:j.parent.url,platform:s.platform}));
     if(metrics.identityVerified===true)commentCount=exactPostCommentCount(metrics);
     if(commentCountDecision(commentCount)==='verify'){
      const failure=unverifiedCommentCountResult(metrics);await preflightFailure(failure,classifyCrawlResult(failure));return;
     }
     await db.collection('jobs').updateOne({_id:j._id,leaseToken:lease},{$set:{'parent.commentCount':commentCount,commentCountVerifiedAt:new Date()}});
    }
    verifiedCommentCount=commentCount;
    if(commentCountDecision(commentCount)==='skip'){
     await db.collection('jobs').updateOne({_id:j._id,leaseToken:lease},{$set:{state:'skipped',lastVerifiedCommentCount:0,lastReason:'POST_COMMENTS_ZERO',finishedAt:new Date()},$unset:{leaseToken:'',leasedUntil:''}});return;
    }
   }
   if(j.kind==='comments'&&j.recoveryAction==='verify_native_comment'){
    await db.collection('jobs').updateOne({_id:j._id,leaseToken:lease},{$set:{nativeVerificationReadStartedAt:new Date(),nativeVerificationCommentCount:verifiedCommentCount}});
    const result=await verifyNativeCommentJob({db,rt,job:{...j,lastVerifiedCommentCount:verifiedCommentCount},source:s,context,shouldStop:()=>stop,onFailure:r=>preflightFailure(r,classifyCrawlResult(r)),canContinue:()=>renewCrawlJobLease(db.collection('jobs'),j._id,lease)});
    if(result.failure||result.interrupted)return;
    await db.collection('jobs').updateOne({_id:j._id,leaseToken:lease},{$set:{state:'waiting_data',backfillComplete:false,completionNextAt:new Date(Date.now()+2000),lastReason:result.complete?'NATIVE_COMMENT_PROOF_READY':'NATIVE_COMMENT_PROOF_NOT_FOUND',nativeVerificationResult:result,nativeVerificationFinishedAt:new Date()},$unset:{recoveryAction:'',leaseToken:'',leasedUntil:''}});return;
   }
   await db.collection('sources').updateOne({_id:s._id},{$set:{lastAttemptAt:new Date()}});
   const body=j.kind==='source'?(preparedSource||await prepareCrawlSourceInput(rt,s)):{url:j.parent.url,platform:s.platform,sourceType:s.type,limit:100,count:'all',order:'oldest',includeReplies:true};
   if(j.kind==='source'){body.since=window.since;body.reference={...(body.reference||{}),id:s.nativeId};}
   await db.collection('jobs').updateOne({_id:j._id,leaseToken:lease},{$set:{preflightRetryCount:0}});
   if(j.kind==='comments'&&j.recoveryAction==='rebuild_manifest_once'&&!j.manifestRepairStartedAt){
    const oldCheckpoint=await db.collection('read_checkpoints').findOne({_id:j._id});
    await db.collection('comment_manifest_repair_archives').updateOne({_id:j._id},{$setOnInsert:{runId,job:j,checkpoint:oldCheckpoint,archivedAt:new Date()}},{upsert:true});
    await db.collection('jobs').updateOne({_id:j._id,leaseToken:lease},{$set:{manifestRepairStartedAt:new Date()}});j.manifestRepairStartedAt=new Date();
    await db.collection('read_checkpoints').deleteOne({_id:j._id});
   }
   const saved=await db.collection('read_checkpoints').findOne({_id:j._id,sourceId:s._id,since:window.since,until:window.until});
   if(saved){state=decodeBackfillState(Buffer.isBuffer(saved.payload)?saved.payload:saved.payload.buffer);checkpointLoaded=true;}
   const legacyCommentCheckpoint=checkpointLoaded&&j.kind==='comments'&&!(state?.crawlManifest instanceof Map);
   if(j.kind==='comments')await db.collection('jobs').updateOne({_id:j._id,leaseToken:lease},{$set:{commentPolicy:'positive_count_only_v2',lastVerifiedCommentCount:verifiedCommentCount,commentReadStartedAt:new Date()}});
   let pages=checkpointLoaded?j.pages||0:0,total=checkpointLoaded?j.total||0:0,excluded=checkpointLoaded?j.excluded||0:0,unknown=checkpointLoaded?j.unknownDates||0:0,verifiedSince=false,boundary=null,rejected=checkpointLoaded?j.rejected||0:0;
   const assertJobLease=async()=>{if(!await renewCrawlJobLease(db.collection('jobs'),j._id,lease)){jobLeaseLost=true;throw Object.assign(Error(),{code:'JOB_LEASE_LOST'});}};
   const saveCheckpoint=async()=>{if(state){if(j.kind==='comments')state.crawlManifest=manifest;const payload=encodeBackfillState(state);await assertJobLease();await db.collection('read_checkpoints').updateOne({_id:j._id},{$set:{runId,sourceId:s._id,since:window.since,until:window.until,payload,jobLeaseToken:lease,updatedAt:new Date()}},{upsert:true});}else{await assertJobLease();await db.collection('read_checkpoints').deleteOne({_id:j._id});}};persistCheckpoint=saveCheckpoint;
   let manifest=new Map(checkpointLoaded&&state?.crawlManifest instanceof Map?state.crawlManifest:[]);
   let claimPages=0;
   const handleData=async(value,nextState)=>{
     await assertJobLease();last=value;state=nextState;pages++;claimPages++;
     let latestCommentPublishedAt=null;
     for(let item of last.items||[]){if(j.kind==='comments')item.commentCountVerifiedForRead=verifiedCommentCount;if(j.kind==='comments'&&s.platform==='youtube'&&item.dateIsEstimated)item=await stabilizeYoutubeCommentDate(db.collection('youtube_comment_date_estimates'),item,j.parent.nativeId);if(j.kind==='source')await recordLatestPost(item,s);const t=Date.parse(item.createdAt);if(j.kind==='comments'&&Number.isFinite(t)&&(!latestCommentPublishedAt||t>Date.parse(latestCommentPublishedAt)))latestCommentPublishedAt=new Date(t).toISOString();if(!Number.isFinite(t))unknown++;if(t<Date.parse(window.since)||t>Date.parse(window.until)){excluded++;if(j.kind==='comments')manifest.set(item.id,{excluded:true,createdAt:item.createdAt});continue;}const staged=await stage(item,s,j,j.parent||null);if(staged)total++;else rejected++;if(j.kind==='comments')manifest.set(item.id,{createdAt:item.createdAt,unknownDate:!Number.isFinite(t),...(staged?{documentKey:staged._type+':'+staged._id,...(staged.commentContextProof?{contextProof:staged.commentContextProof}:{})}:{quarantineKey:`${runId}:${s._id}:${j.kind}:${item.id||item._id||'unknown'}`})});}
     await saveCheckpoint();
     // User-approved October-only cutoff. Process the entire batch above before
     // stopping; an old pinned post never supplies the lower-bound evidence.
     boundary=sourceWindowBoundary(last,{since:window.since,kind:j.kind});verifiedSince=boundary?.reached===true;
     await db.collection('jobs').updateOne({_id:j._id,leaseToken:lease},{$set:{pages,total,excluded,unknownDates:unknown,rejected,claimPages,consecutiveReadRetries:0,workerWaiting:false,resumePending:state?1:0,lastStatus:last.status,lastReason:last.reason||null,lastProgressAt:new Date(),coverage:last.coverage||null,...(last.coverage?.policy?{commentReaderPolicy:last.coverage.policy}:{}),leasedUntil:new Date(Date.now()+180000)},$max:{maxPagesInClaim:claimPages,...(latestCommentPublishedAt?{lastCommentPublishedAt:latestCommentPublishedAt}:{})},$unset:{waitingUntil:''}});
     return verifiedSince;
    };
   const drained=await drainPinnedBackfill({initialState:state,maxRetries:PROXY_JOB_RETRY_LIMIT,initialRetries:proxyRetryCount(j),rotateProxy:rotateReadStateProxy,stopPublic:publicReadStop,shouldStop:()=>stop||jobLeaseLost,classify:classifyCrawlResult,onReadError:e=>({status:e.resultStatus||'error',reason:safe(e),retryAfterMs:e.retryAfterMs}),
    read:async continuation=>{await db.collection('jobs').updateOne({_id:j._id,leaseToken:lease},{$set:{lastRequestStartedAt:new Date(),workerWaiting:false},$unset:{waitingUntil:''}});const target=normalizeContentInput(j.kind==='source'?'source':'comments',body);if(j.kind==='comments'&&s.platform==='facebook')target.sourceType=s.type;if(continuation)Object.defineProperty(target,READ_STATE,{value:continuation});const value=await rt.readContent(target);return{value,state:value[READ_STATE]||null};},
    onData:handleData,
    onRetry:async(value,retryState,delay,retryNumber,meta)=>{
     last=value;state=retryState;await saveCheckpoint();
     j.proxyRetryCount=retryNumber;
     await db.collection('jobs').updateOne({_id:j._id,leaseToken:lease},{$set:{state:'running',resumePending:1,proxyRetryCount:retryNumber,proxyRetryPolicy:PROXY_JOB_POLICY,consecutiveReadRetries:retryNumber,proxyRotationRequested:meta.proxyRotationRequested,workerWaiting:true,waitingUntil:new Date(Date.now()+delay),lastStatus:value.status,lastReason:value.reason||'UPSTREAM_UNKNOWN',upstreamOperation:value.upstreamOperation||null,updatedAt:new Date()},$inc:{inClaimRetries:meta.schedulingWait?0:1,proxyRotationRequests:meta.proxyRotationRequested?1:0}});
    },
    wait:async delay=>{const until=Date.now()+delay;while(!stop&&Date.now()<until)await sleep(Math.min(1000,until-Date.now()));}
   });
   state=drained.state;last=drained.result;
   if(drained.publicStopped){const result=last,rows=bufferedPublicRows(result,state,{platform:s.platform,kind:j.kind});if(j.kind==='comments'&&s.platform==='youtube')for(const item of rows)applyYoutubeCommentDate(item,state?.dateObservedAt??Date.now());if(rows.length)await handleData({...result,status:'partial',items:rows,count:rows.length,coverage:{...result.coverage,complete:false},pagination:{hasMore:false,complete:false}},state);await saveCheckpoint();await stopPublicJob(j,drained.publicStopped,result);return;}
   if(drained.retryExhausted){await saveCheckpoint();await skipProxyJob(j,last);return;}
   if(drained.blocked){await saveCheckpoint();if(publicAccessFailure(last)){await preflightFailure(last,'blocked');return;}await db.collection('jobs').updateOne({_id:j._id,leaseToken:lease},{$set:{state:'blocked',workerWaiting:false,resumePending:state?1:0,lastStatus:last.status,lastReason:last.reason||'UPSTREAM_BLOCKED',updatedAt:new Date()},$unset:{leaseToken:'',leasedUntil:'',waitingUntil:''}});if(j.crawlMode===RECENT_SOURCE_POLICY)await recordRecentTerminal(j,last.reason||'UPSTREAM_BLOCKED');return;}
   if(j.crawlMode===RECENT_SOURCE_POLICY){
    const at=new Date(),pass=recentPassOutcome({boundary,result:last,now:at,startedAt:j.passStartedAt||j.startedAt,pages,posts:total,excluded,unknown,rejected,sourceId:s._id,platform:s.platform,pass:j.recentPass||1});
    await db.collection('recent_source_passes').updateOne({_id:`${j._id}:${pass.pass}`},{$setOnInsert:{runId,jobId:j._id,windowSince:window.since,windowUntil:window.until,...pass}},{upsert:true});
    await db.collection('jobs').updateOne({_id:j._id,leaseToken:lease},{$set:{state:pass.collectionComplete?'done':'partial_public',collectionComplete:pass.collectionComplete,recentPassFinishedAt:at,recentPassDurationMs:pass.durationMs,recentBoundaryReached:pass.boundaryReached,nextAt:new Date(+at+RECENT_SOURCE_INTERVAL_MS),pages,total,excluded,unknownDates:unknown,rejected,scannedSince:window.since,scannedUntil:window.until,lastReason:pass.reason,workerWaiting:false,resumePending:0,backfillComplete:false,accessStopStreak:0},$unset:{leaseToken:'',leasedUntil:'',waitingUntil:''}});
    await db.collection('sources').updateOne({_id:s._id},{$set:{recentLastPassAt:at,recentLastPassDurationMs:pass.durationMs,recentLastPassState:pass.collectionComplete?'done':'partial_public',recentLastWindowSince:window.since,recentLastWindowUntil:window.until}});
    keepCheckpoint=false;await db.collection('read_checkpoints').deleteOne({_id:j._id});log('recent_source_pass',{platform:s.platform,pass:pass.pass,collectionComplete:pass.collectionComplete,pages,posts:total,durationMs:pass.durationMs,boundaryReached:pass.boundaryReached});return;
   }
   const outcome=backfillOutcome({kind:j.kind,result:last,state,verifiedSince,rejected,unknown});
   const readComplete=j.kind==='comments'&&publicReadFinished(last,state),commentManifest=readComplete?[...manifest]:null;
   const legacyReplay=legacyCommentCheckpoint&&!readComplete&&last?.pagination?.hasMore===false&&last.coverage?.exhausted===true&&(j.legacyCoverageReplays||0)<1;
   const manifestTooLarge=commentManifest&&Buffer.byteLength(JSON.stringify(commentManifest))>8*1024*1024;
   const sourceWaiting=j.kind==='source'&&verifiedSince&&!outcome.backfillComplete,publicPartial=!stop&&!sourceWaiting&&!legacyReplay&&!readComplete&&outcome.state==='partial';
   await db.collection('jobs').updateOne({_id:j._id,leaseToken:lease},{$set:{...outcome,...(publicPartial?{publicStopPolicy:PUBLIC_STOP_POLICY,processingComplete:true,publicCoverageComplete:false,publicStoppedAt:new Date(),lastPublicReason:outcome.lastReason}:{}),...(boundary?{sourceWindowBoundary:boundary,sourceWindowPolicy:SOURCE_WINDOW_POLICY}:{}),...(j.kind==='comments'?{readComplete,legacyCommentCheckpoint,...(legacyReplay?{legacyCoverageReplays:(j.legacyCoverageReplays||0)+1}:{}),completionPolicy:'native_counts_es5_manifest_v2',...(readComplete&&!manifestTooLarge?{commentReadManifest:commentManifest,commentReadPagination:last.pagination}:{}),backfillComplete:false}:{}),resumePending:legacyReplay?1:readComplete?0:outcome.coverageComplete?0:state?1:0,workerWaiting:false,state:stop?'retry':sourceWaiting?'waiting_data':publicPartial?'partial_public':legacyReplay?'retry':readComplete?(manifestTooLarge?'blocked':'waiting_commit'):outcome.state,nextAt:stop||legacyReplay?new Date():outcome.nextAt,lastReason:stop?'WORKER_STOPPED':sourceWaiting?'SOURCE_POSTS_COMMIT_OR_QUARANTINE_PENDING':legacyReplay?'LEGACY_COMMENT_COVERAGE_RECHECK':readComplete?(manifestTooLarge?'COMMENT_MANIFEST_TOO_LARGE':'COMMENT_ES5_COMMIT_PENDING'):outcome.lastReason,finishedAt:new Date(),coverage:last?.coverage||null,total,pages,excluded,unknownDates:unknown,rejected,scannedSince:window.since,scannedUntil:window.until},$unset:{leaseToken:'',leasedUntil:''}});
   if(outcome.coverageComplete){keepCheckpoint=false;await db.collection('read_checkpoints').deleteOne({_id:j._id});}
   await db.collection('sources').updateOne({_id:s._id},{$set:{lastSuccessAt:new Date(),...(j.kind==='source'?{lastSourcePassAt:new Date(),lastSourcePassState:sourceWaiting?'waiting_data':publicPartial?'partial_public':outcome.state,backfillWindowCovered:outcome.windowCovered,backfillComplete:outcome.backfillComplete,backfillSince:context.since,backfillUntil:context.until}:{lastCommentsPassAt:new Date()})}});
  }catch(e){if(e.code==='JOB_LEASE_LOST'){log('job_lease_lost',{kind:j.kind,shardIndex});return;}if(s?.platform==='facebook'&&s.type!=='group'&&shouldInvalidateSourceIdentity(e,{attempted:identityAttempted,verified:identityVerified}))await db.collection('sources').updateOne({_id:s._id},{$set:{identityStatus:'unverified',identityFailure:safe(e),identityFailureDetails:e.identityReview||null,identityLastAttemptAt:new Date()}});await preflightFailure({status:e.resultStatus||'error',reason:safe(e),retryAfterMs:e.retryAfterMs},classifyCrawlResult({status:e.resultStatus||'error',reason:safe(e)}));log('job_failed',{kind:j.kind,platform:s?.platform,reason:safe(e)});}finally{clearInterval(pulse);if(state&&keepCheckpoint&&persistCheckpoint&&!jobLeaseLost){try{await persistCheckpoint();}catch(e){if(e.code!=='JOB_LEASE_LOST')log('checkpoint_failed',{reason:safe(e)});}}await disposeReadState(state).catch(()=>{});}
 }
 async function recordRecentTerminal(j,reason){if(j.crawlMode!==RECENT_SOURCE_POLICY)return;const at=new Date(),startedAt=j.passStartedAt||j.startedAt||at;await db.collection('recent_source_passes').updateOne({_id:`${j._id}:${j.recentPass||1}`},{$setOnInsert:{runId,jobId:j._id,sourceId:j.sourceId,platform:j.platform,pass:j.recentPass||1,policy:RECENT_SOURCE_POLICY,windowSince:j.windowSince,windowUntil:j.windowUntil,startedAt,endedAt:at,durationMs:Math.max(0,+at- +new Date(startedAt)),collectionComplete:false,pages:j.pages||0,posts:j.total||0,reason}},{upsert:true});await db.collection('sources').updateOne({_id:j.sourceId},{$set:{recentLastPassAt:at,recentLastPassState:reason,recentLastPassDurationMs:Math.max(0,+at- +new Date(startedAt))}});}
 async function stopPublicJob(j,decision,result={}){
  const at=new Date(),rollingSource=j.kind==='source'&&j.crawlMode===RECENT_SOURCE_POLICY;
  const r=await db.collection('jobs').updateOne({_id:j._id,leaseToken:j.leaseToken},{$set:{state:decision.state,publicStopPolicy:PUBLIC_STOP_POLICY,processingComplete:true,publicCoverageComplete:false,backfillComplete:false,coverageComplete:false,workerWaiting:false,resumePending:0,lastStatus:result.status||j.lastStatus,lastReason:decision.reason,lastPublicReason:decision.reason,publicStoppedAt:at,...(rollingSource?{nextAt:new Date(+at+RECENT_SOURCE_INTERVAL_MS),accessStopStreak:Math.min(RECENT_SOURCE_ACCESS_REQUEUE_LIMIT,(j.accessStopStreak||0)+1)}:{})},$unset:{leaseToken:'',leasedUntil:'',waitingUntil:'',retryProxyPending:'',retryProxyResult:'',publicStopPending:''}});if(r.modifiedCount&&j.kind==='source'){if(rollingSource)await recordRecentTerminal(j,decision.reason);else await db.collection('sources').updateOne({_id:j.sourceId},{$set:{lastSourcePassState:decision.state,backfillComplete:false}});}log('public_read_stopped',{kind:j.kind,platform:j.platform,reason:decision.reason});
 }
 async function skipProxyJob(j,result=j.retryProxyResult||{}){
  await db.collection('jobs').updateOne({_id:j._id,leaseToken:j.leaseToken},{$set:{state:'skipped_retry_exhausted',proxyRetryPolicy:PROXY_JOB_POLICY,proxyRetryCount:PROXY_JOB_RETRY_LIMIT,retryLimit:PROXY_JOB_RETRY_LIMIT,backfillComplete:false,coverageComplete:false,workerWaiting:false,resumePending:0,lastReason:'RETRY_LIMIT_EXHAUSTED',lastFailureReason:result.reason||'UPSTREAM_UNKNOWN',skippedAt:new Date()},$unset:{leaseToken:'',leasedUntil:'',waitingUntil:'',retryProxyPending:'',retryProxyResult:''}});
  if(j.kind==='source'){if(j.crawlMode===RECENT_SOURCE_POLICY)await recordRecentTerminal(j,'RETRY_LIMIT_EXHAUSTED');else await db.collection('sources').updateOne({_id:j.sourceId},{$set:{backfillComplete:false,lastSourcePassState:'skipped_retry_exhausted'}});}log('proxy_retry_exhausted',{kind:j.kind,platform:j.platform,retries:50,reason:result.reason});
 }
 async function processJob(job){return runPinnedProxyJob({job,attempt:processJobAttempt,
  load:j=>db.collection('jobs').findOne({_id:j._id,leaseToken:j.leaseToken,state:'running'}),shouldStop:()=>stop,
  skip:j=>skipProxyJob(j),onStop:async j=>{await db.collection('jobs').updateOne({_id:j._id,leaseToken:j.leaseToken,state:'running'},{$set:{state:'retry',nextAt:new Date(),workerWaiting:false,lastReason:'WORKER_STOPPED'},$unset:{leaseToken:'',leasedUntil:'',waitingUntil:'',retryProxyPending:'',retryProxyResult:''}});},
  retry:async(j,n,meta)=>{const result=j.retryProxyResult||{},delay=crawlRetryDelay(result,n,{rotated:publicAccessFailure(result)||result.status==='rate_limited'||/NETWORK|TIMEOUT/.test(result.reason||'')});const r=await db.collection('jobs').updateOne({_id:j._id,leaseToken:j.leaseToken,state:'running',retryProxyPending:true},{$set:{proxyRetryCount:n,proxyRetryPolicy:PROXY_JOB_POLICY,retryProxyPending:false,workerWaiting:true,proxyRotationRequested:!meta.schedulingWait,waitingUntil:new Date(Date.now()+delay),leasedUntil:new Date(Date.now()+180000)},$inc:{proxyRotationRequests:meta.schedulingWait?0:1},$unset:{retryProxyResult:''}});return r.modifiedCount?{...j,proxyRetryCount:n,retryProxyPending:false,retryProxyDelay:delay}:null;},
  wait:async j=>{const until=Date.now()+j.retryProxyDelay;let renewed=Date.now();while(!stop&&Date.now()<until){if(Date.now()-renewed>30000){if(!await renewCrawlJobLease(db.collection('jobs'),j._id,j.leaseToken))return false;renewed=Date.now();}await sleep(Math.min(1000,until-Date.now()));}}
 });}
 const flush=()=>leader?flushCrawlDocuments({db,es,selected,canWrite:ownLease,runId,context,mappings:liveMappings,dedupIndices:available}):Promise.resolve();
 async function clearCompletedHistoricalPostQueue(){
  const jobs=await db.collection('jobs').find({runId,kind:'comments',recentParent:{$ne:true},state:'done',backfillComplete:true,postQueueClearedAt:{$exists:false}},{projection:{_id:1}}).limit(200).toArray();
  if(!jobs.length||!await ownLease())return 0;
  const ids=jobs.map(j=>j._id),at=new Date(),r=await db.collection('jobs').updateMany({_id:{$in:ids},state:'done',backfillComplete:true,postQueueClearedAt:{$exists:false}},{$set:{postQueueClearedAt:at},$unset:{'parent.text':'',commentReadManifest:'',commentReadPagination:''}});
  await db.collection('read_checkpoints').deleteMany({_id:{$in:ids}});return r.modifiedCount;
 }
 async function retireQuietRecentCommentWatches(){
  const at=new Date(),quietCutoff=new Date(+at-12*60*60*1000),freshCutoff=new Date(+at-24*60*60*1000).toISOString(),jobs=await db.collection('jobs').find({runId,kind:'comments',recentParent:true,state:'done',backfillComplete:true,watchState:'active',watchRetiredAt:{$exists:false},$or:[{lastCountIncreaseAt:{$lte:quietCutoff}},{lastCommentPublishedAt:{$lte:freshCutoff}}]},{projection:{_id:1,createdAt:1,lastVerifiedCommentCount:1,maxObservedCommentCount:1,lastCountIncreaseAt:1,lastCommentPublishedAt:1}}).limit(200).toArray();
  if(!jobs.length||!await ownLease())return 0;let retired=0;
  for(const j of jobs){const decision=recentCommentWatch(j,j.maxObservedCommentCount??j.lastVerifiedCommentCount,at);if(decision.action!=='retire')continue;const r=await db.collection('jobs').updateOne({_id:j._id,state:'done',backfillComplete:true,watchState:'active',lastCountIncreaseAt:j.lastCountIncreaseAt,maxObservedCommentCount:j.maxObservedCommentCount,watchRetiredAt:{$exists:false}},{$set:{state:'skipped',lastReason:decision.reason,watchRetiredAt:at,watchState:'retired',postQueueClearedAt:at},$unset:{'parent.text':'',commentReadManifest:'',commentReadPagination:''}});retired+=r.modifiedCount;}
  return retired;
 }
 async function reconcileComments(){const existing=await acceptExistingQuarantineIds({db,es,runId,indices:available,canWrite:ownLease});const comments=await reconcileCrawlComments({db,es,runId,context,indices:available,canWrite:ownLease,shouldStop:()=>stop,completedSourceIds});await reconcileSourceWindowJobs({db,runId,context,canWrite:ownLease});
  const cleared=await clearCompletedHistoricalPostQueue(),retired=await retireQuietRecentCommentWatches();if(cleared)log('historical_post_comment_queue_cleared',{count:cleared});if(retired)log('recent_comment_watch_retired',{count:retired});
  if(comments.checked&&await ownLease()){
   const recovery=comments.recovery||{};await db.collection('runs').updateOne({_id:runId},{$inc:{'commentCoreCounters.jobsCompleted':comments.done||0,'commentCoreCounters.newlyStaged':recovery.staged||0,'commentCoreCounters.fieldRepairs':recovery.repairs||0,'commentCoreCounters.canonicalAdoptions':recovery.adopted||0}});
   await atomic('comment-core-status.json',{at:new Date().toISOString(),policy:'own_fields_create_or_existing_v1',existingQuarantine:existing,...comments});
  }return comments;}

 const flushLoop=(async()=>{while(!stop&&leader){try{await flush()}catch(e){log('es5_flush_failed',{reason:safe(e)});}await sleep(250);}})();
 const completionLoop=(async()=>{while(!stop&&leader){try{await reconcileComments()}catch(e){log('comment_completion_failed',{reason:safe(e)});}await sleep(1500);}})();
 async function queueRecentSources(){
  if(!leader||Date.now()-lastRecentQueueAt<60_000||!recentSourceIds.length)return;lastRecentQueueAt=Date.now();
  const at=new Date(),sources=await db.collection('sources').find({_id:{$in:recentSourceIds},eligible:true,canonicalSourceId:null},{projection:{_id:1,platform:1}}).toArray(),ids=sources.map(s=>s._id),existing=new Set((await db.collection('jobs').find({runId,crawlMode:RECENT_SOURCE_POLICY,sourceId:{$in:ids}},{projection:{sourceId:1}}).toArray()).map(j=>j.sourceId));
  const missing=sources.filter(s=>!existing.has(s._id));for(let n=0;n<missing.length;n+=500){await db.collection('jobs').bulkWrite(missing.slice(n,n+500).map(s=>({updateOne:{filter:{_id:`${runId}:recent3d:${s._id}`},update:{$setOnInsert:{runId,kind:'source',crawlMode:RECENT_SOURCE_POLICY,platform:s.platform,sourceId:s._id,state:'pending',priority:1,recentPass:1,attempts:0,nextAt:at,createdAt:at}},upsert:true}})),{ordered:false});}
  const recycled=await db.collection('jobs').updateMany({runId,crawlMode:RECENT_SOURCE_POLICY,sourceId:{$in:ids},state:{$in:RECENT_SOURCE_REQUEUE_STATES},nextAt:{$lte:at},$or:[{state:{$ne:'skipped_access_required'}},{accessStopStreak:{$lt:RECENT_SOURCE_ACCESS_REQUEUE_LIMIT}},{accessStopStreak:{$exists:false}}]},{$set:{state:'pending',priority:1,resumePending:0,proxyRetryCount:0,pages:0,total:0,excluded:0,unknownDates:0,rejected:0,collectionComplete:false,nextAt:at},$inc:{recentPass:1},$unset:{windowSince:'',windowUntil:'',passStartedAt:'',recentPassFinishedAt:'',sourceWindowBoundary:'',waitingUntil:''}});
  if(missing.length||recycled.modifiedCount)log('recent_source_queued',{newSources:missing.length,nextPasses:recycled.modifiedCount,eligibleCompletedSources:ids.length});
 }
 async function refreshWorkerState(){
  let pool;try{pool=await rt.getProxy.status();}catch{}
  const total=mainCapacity({configured,pool,recovery:Number(process.env.AUTHOR_UID_CONCURRENCY??10)});
  const due=kind=>({runId,...jobClassFilter(kind,{continuous:true}),$or:[{state:{$in:['pending','retry','partial']},nextAt:{$lte:new Date()}},{state:'running'}]});
  const [sourceDemand,commentDemand]=await Promise.all([db.collection('jobs').countDocuments(due('facebook_source'),{limit:configured}),db.collection('jobs').countDocuments(due('comments'),{limit:configured})]);
  const budget=continuousWorkerBudget({total,sourceDemand,commentDemand});plan=workerPlan({mainTotal:budget.total,facebookSource:budget.source,comments:budget.comments,otherSource:0,shardIndex,shardCount});desired=Math.min(shardAllocation(total,shardIndex,shardCount),Object.values(plan).reduce((n,x)=>n+x,0));
  const demandEntries=await Promise.all(['facebook','youtube','threads','instagram'].map(async platform=>[platform,await db.collection('jobs').countDocuments({runId,kind:'comments',platform,$or:[{state:{$in:['pending','retry','partial']},nextAt:{$lte:new Date()}},{state:'running'}]},{limit:configured})]));
  commentPlan=adaptiveCommentPlatformPlan(plan.comments,Object.fromEntries(demandEntries));
  recentSourceIds=(await db.collection('jobs').find(recentSourceAdmissionFilter(runId,context.since,context.until),{projection:{sourceId:1}}).toArray()).map(x=>x.sourceId);
  completedSourceIds=[];commentFocus={};
  if(!await ownLease())return;
  await queueRecentSources();
  if(leader){const workers=await shards.find({runId,status:'running',lockUntil:{$gt:new Date()}},{projection:{shardIndex:1,activeWorkers:1,activeByClass:1,desiredWorkers:1,targetByClass:1,heartbeatAt:1}}).toArray();await runs.updateOne({_id:runId},{$set:{activeWorkers:workers.reduce((n,x)=>n+(x.activeWorkers||0),0),desiredWorkers:total,workerAllocationPolicy:CONTINUOUS_FLOW_POLICY,dynamicWorkerBudget:budget,sourceJobDemand:sourceDemand,commentJobDemand:commentDemand,workerShards:workers,workerShardCount:shardCount,heartbeatAt:new Date(),updatedAt:new Date()}});if(pool)await atomic('proxy-health.json',pool);await status();}
 }
 const claim=(kind,platform,offset=0)=>claimCrawlJob(db.collection('jobs'),{runId,kind,platform,continuous:true,shardIndex,ownerToken:token,cycle:cycles+offset});

 async function runBullQueue(){
  const [{Queue,Worker},{default:Redis},bull]=await Promise.all([
   import('bullmq'),import('ioredis'),import('../src/services/crawlerV8BullQueue.js')
  ]);
  const url=process.env.CRAWL_REDIS_URL||'redis://127.0.0.1:6379';
  const connection=new Redis(url,{maxRetriesPerRequest:null,enableReadyCheck:true});
  const queue=new Queue(bull.CRAWLER_V8_QUEUE_NAME,{connection});
  await queue.waitUntilReady();
  const worker=new Worker(bull.CRAWLER_V8_QUEUE_NAME,async ticket=>{
   const j=await bull.claimCrawlerV8BullJob(db.collection('jobs'),ticket.data,{runId,shardIndex,ownerToken:token});
   if(!j)return{claimed:false,reason:'MONGO_JOB_NOT_RUNNABLE'};
   const kind=j.kind==='comments'?'comments':'facebook_source',commentPlatform=j.kind==='comments'?j.platform:null;
   active++;activeByClass[kind]++;if(commentPlatform)activeCommentPlatforms[commentPlatform]++;
   try{
    await processJob(j);
    const after=await db.collection('jobs').findOne({_id:j._id},{projection:{state:1,lastReason:1,finishedAt:1}});
    return{claimed:true,mongoState:after?.state||'unknown',reason:after?.lastReason||null};
   }catch(e){
    log('worker_unhandled_error',{kind,reason:safe(e)});
    await db.collection('jobs').updateOne({_id:j._id,leaseToken:j.leaseToken,state:'running'},{$set:{state:'retry',nextAt:new Date(),workerWaiting:false,lastReason:'WORKER_EXCEPTION_RECOVERED',workerError:safe(e)},$unset:{leaseToken:'',leasedUntil:'',waitingUntil:''}}).catch(()=>{});
    throw e;
   }finally{active--;activeByClass[kind]--;if(commentPlatform)activeCommentPlatforms[commentPlatform]--;}
  },{connection,concurrency:Math.max(1,desired),autorun:true,lockDuration:180000,maxStalledCount:1});
  worker.on('error',e=>log('bull_worker_error',{reason:safe(e)}));
  try{
   while(!stop){
    if(Date.now()-lastReport>15000){await refreshWorkerState();worker.concurrency=Math.max(1,desired);lastReport=Date.now();}
    if(leader){
     try{await bull.seedCrawlerV8BullQueue({collection:db.collection('jobs'),queue,runId});}
     catch(e){log('bull_seed_failed',{reason:safe(e)});}
    }
    await sleep(2000);
   }
  }finally{await worker.close();await queue.close();await connection.quit();}
 }

 try{if(process.env.CRAWL_QUEUE_BACKEND==='bullmq')await runBullQueue();else while(!stop){
  if(Date.now()-lastReport>15000){await refreshWorkerState();lastReport=Date.now();}
  if(active>=desired){await sleep(250);continue;}
  const slots=plannedClaimSlots({plan,activeByClass,commentPlan,activeCommentPlatforms,cycle:cycles,max:Math.min(8,desired-active)});
  if(!slots.length){cycles++;await sleep(250);continue;}
  const claimed=await Promise.all(slots.map(async (slot,index)=>{try{return{...slot,job:await claim(slot.kind,slot.platform,index)}}catch(e){log('job_claim_failed',{kind:slot.kind,reason:safe(e)});return{...slot,job:null}}}));
  let launched=0;
  for(const {kind,job:j} of claimed){if(!j)continue;launched++;active++;activeByClass[kind]++;const claimedKind=kind,commentPlatform=kind==='comments'?j.platform:null;if(commentPlatform)activeCommentPlatforms[commentPlatform]++;
   const task=processJob(j).catch(async e=>{log('worker_unhandled_error',{kind:claimedKind,reason:safe(e)});await db.collection('jobs').updateOne({_id:j._id,leaseToken:j.leaseToken,state:'running'},{$set:{state:'retry',nextAt:new Date(),workerWaiting:false,lastReason:'WORKER_EXCEPTION_RECOVERED',workerError:safe(e)},$unset:{leaseToken:'',leasedUntil:'',waitingUntil:''}}).catch(()=>{});}).finally(()=>{active--;activeByClass[claimedKind]--;if(commentPlatform)activeCommentPlatforms[commentPlatform]--;threads.delete(task)});threads.add(task);
  }
  cycles+=slots.length;if(!launched)await sleep(250);else if(cycles%20===0)await sleep(10);
 }}finally{stop=true;await Promise.allSettled([...threads]);await flushLoop;await completionLoop;if(leader)await flush().catch(()=>{});clearInterval(heartbeat);await shards.updateOne({_id:lockId,lockToken:token},{$unset:{lockToken:'',lockUntil:''},$set:{activeWorkers:0,activeByClass:{facebook_source:0,comments:0,other_source:0},status:'stopped',lastStoppedAt:new Date()}});if(leader){const workers=await shards.find({runId,status:'running',lockUntil:{$gt:new Date()}},{projection:{activeWorkers:1}}).toArray();await runs.updateOne({_id:runId},{$set:{activeWorkers:workers.reduce((n,x)=>n+(x.activeWorkers||0),0),lastStoppedAt:new Date()}});await status();}}
}
