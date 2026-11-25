import {randomUUID} from 'node:crypto';
import {detectedSource,flowId} from './crawlerQueueFlow.js';
export const SOURCE_ROUND_POLICY='waiting-empty-source-rounds-v2';
export const SOURCE_PENDING_STATES=['waiting','active','delayed','paused','prioritized','waiting-children'];
export const SOURCE_WAITING_STATES=['waiting','paused','prioritized'];
export function sourceQueueNeedsRefill(counts,pendingOutbox=0){
 return pendingOutbox===0&&SOURCE_WAITING_STATES.every(state=>(counts[state]||0)===0);
}
export function sourceRoundDrained(counts,pendingOutbox=0){
 return pendingOutbox===0&&SOURCE_PENDING_STATES.every(state=>(counts[state]||0)===0);
}
export function sourceRoundOutcome(error,result){
 if(result?.partial)return 'partial';
 if(result?.done)return 'skipped';
 if(/RETRY_LIMIT_EXHAUSTED$/.test(error||result?.reason||''))return 'retry_exhausted';
 return error?'failed':'success';
}
export function summarizeSourceRound(round,results,finishedAt=new Date()){
 const summary={expectedSources:round.sourceIds.length,success:0,partial:0,failed:0,retryExhausted:0,skipped:0,finishedAt,durationMs:+finishedAt-+new Date(round.startedAt)};
 const bySource=new Map();for(const result of results)bySource.set(result.sourceId,result);
 for(const result of bySource.values()){
  if(result.outcome==='success')summary.success++;
  else if(result.outcome==='partial')summary.partial++;
  else if(result.outcome==='retry_exhausted')summary.retryExhausted++;
  else if(result.outcome==='skipped')summary.skipped++;
  else summary.failed++;
 }
 summary.settledSources=bySource.size;summary.unaccountedSources=Math.max(0,summary.expectedSources-summary.settledSources);
 return summary;
}
export function createSourceRoundCoordinator({db,queues,enqueueSources,shouldStop=()=>false,log=()=>{},minimumRefillIntervalMs=0,sourceRescanMs=0,rescanWhileWaiting=()=>true,idleRefillIntervalMs=0,reconcileIntervalMs=0,onMetric=()=>{},now=Date.now}){
 const lastRefill=new Map(),lastDeadlineScan=new Map(),lastReconcile=new Map(),idleUntil=new Map();
 const rounds=db.collection('flow_source_rounds'),jobs=db.collection('flow_jobs'),results=db.collection('flow_source_round_results'),sources=db.collection('sources');
 return async function refillSourceRound(spec,filter){
  if(lastRefill.has(spec.name)&&now()-lastRefill.get(spec.name)<minimumRefillIntervalMs)return;lastRefill.set(spec.name,now());
  const queue=queues.get(spec.name);
  // Older rounds can finish while the next round is already being processed.
  if(!lastReconcile.has(spec.name)||now()-lastReconcile.get(spec.name)>=reconcileIntervalMs){
  onMetric('roundReconciles',spec.name);
  // Thousands of long-running rounds can remain open behind saved cursors.
  // One indexed pending-set read replaces a count query per active round.
  // Recheck each completion candidate below, so a newly queued retry cannot
  // be mistaken for a drained round between the two reads.
  const pendingRounds=await jobs.distinct('sourceRoundId',{queue:spec.name,state:{$in:['queued','running']}});
  for(const round of await rounds.find({queue:spec.name,state:'running',_id:{$nin:pendingRounds}},{projection:{_id:1,queue:1,sourceIds:1,startedAt:1}}).toArray()){
   const pending=await jobs.countDocuments({queue:spec.name,sourceRoundId:round._id,state:{$in:['queued','running']}});
   if(pending)continue;
   // Failed tickets stay visible but do not prevent the next independent round.
   const failed=await jobs.find({queue:spec.name,sourceRoundId:round._id,state:'failed'}).toArray();
   if(failed.length)await results.bulkWrite(failed.map(row=>({updateOne:{filter:{_id:row._id},update:{$setOnInsert:{roundId:round._id,queue:spec.name,sourceId:row.data.source._id,outcome:sourceRoundOutcome(row.error),error:row.error,finishedAt:row.failedAt||new Date()}},upsert:true}})));
   const settled=await results.find({roundId:round._id}).toArray(),summary=summarizeSourceRound(round,settled);
   if(summary.unaccountedSources){log('source_round_unaccounted',{queue:spec.name,roundId:round._id,...summary});continue;}
   const items=await db.collection('flow_source_round_items').aggregate([{$match:{roundId:round._id}},{$group:{_id:'$kind',count:{$sum:1}}}]).toArray();
   const counters=await db.collection('flow_counters').find({}).toArray();
   await rounds.updateOne({_id:round._id,state:'running'},{$set:{state:'completed',summary,itemsAtCompletion:items,countersAtCompletion:counters,finishedAt:summary.finishedAt}});
   log('source_round_completed',{queue:spec.name,roundId:round._id,...summary,itemsAtCompletion:items});
  }
  lastReconcile.set(spec.name,now());
  }
  let round=await rounds.findOne({queue:spec.name,state:'loading'},{sort:{startedAt:1}});
  if(!round){
   if(shouldStop())return;
   // Only an empty scan with no runnable sources earns this short backoff.
   // Loading recovery above always wins; native cooldown expiry bounds the wait.
   if(now()<(idleUntil.get(spec.name)||0)){onMetric('idleRefillSkips',spec.name);return;}
   const counts=await queue.getJobCounts(...SOURCE_WAITING_STATES);
   // An unpublished durable ticket must be recovered before admitting more work.
   // A checkpointed delayed ticket is already admitted, not unpublished outbox work.
   const pending=await jobs.countDocuments({queue:spec.name,state:'queued',sourceRoundId:{$exists:true},proxyDeferred:{$ne:true},sourceDeferred:{$ne:true},originDeferred:{$ne:true}});
   const normal=sourceQueueNeedsRefill(counts,pending);
   if(!normal&&(!sourceRescanMs||!counts.waiting||now()-(lastDeadlineScan.get(spec.name)||0)<60000))return;
   if(!normal)lastDeadlineScan.set(spec.name,now());
   const inFlight=await jobs.find({queue:spec.name,sourceRoundId:{$exists:true},state:{$in:['queued','running']}},{projection:{entityKey:1,state:1,originDeferred:1,'data.originWaitUntil':1}}).toArray();
   const busy=new Set(inFlight.map(job=>job.entityKey));
   let dueFilter=filter;
   if(!normal){
    // Keep newly added sources eligible while a congested queue drains.
    const unscheduled={flowLastScheduledAt:null};
    const due=rescanWhileWaiting(spec)?{$or:[unscheduled,{flowLastScheduledAt:{$lte:new Date(now()-sourceRescanMs)}}]}:unscheduled;
    const busyIds=[...busy].filter(k=>typeof k==='string'&&k.startsWith('source:')).map(k=>k.slice(7));
    dueFilter={$and:[filter,{_id:{$nin:busyIds}},due]};
   }
   const cursor=sources.find(dueFilter);
   onMetric('inventoryQueries',spec.name);
   let eligible=(await(normal?cursor:cursor.sort({flowLastScheduledAt:1}).limit(1000)).toArray()).filter(s=>detectedSource(s)&&!busy.has('source:'+s._id)).slice(0,normal?Infinity:500);
   if(spec.name==='facebook-group-source'&&eligible.length){
    // The broad scan can miss a ticket moving between queued and running
    // while traversing the state index. Recheck candidates by their stable key.
    const keys=eligible.map(source=>'source:'+source._id);
    const pending=await jobs.find({queue:spec.name,sourceRoundId:{$exists:true},state:{$in:['queued','running']},entityKey:{$in:keys}},{projection:{entityKey:1},hint:{entityKey:1}}).toArray();
    const pendingKeys=new Set(pending.map(job=>job.entityKey));
    eligible=eligible.filter(source=>!pendingKeys.has('source:'+source._id));
   }
   const startedAt=new Date(now());
   if(!eligible.length){
    const blocked=inFlight.every(job=>job.state==='queued'&&job.originDeferred===true&&+new Date(job.data?.originWaitUntil)>now());
    if(normal&&idleRefillIntervalMs>0&&blocked)idleUntil.set(spec.name,inFlight.reduce((until,job)=>Math.min(until,+new Date(job.data.originWaitUntil)),now()+idleRefillIntervalMs));
    return;
   }
   idleUntil.delete(spec.name);
   round={_id:flowId('source-round',spec.name,randomUUID()),queue:spec.name,policy:SOURCE_ROUND_POLICY,state:'loading',startedAt,expectedSources:eligible.length,sourceIds:eligible.map(s=>s._id),baselineCounters:await db.collection('flow_counters').find({}).toArray()};
   await rounds.insertOne(round);
   log('source_round_started',{queue:spec.name,roundId:round._id,sources:round.sourceIds.length});
  }
  if(round.state!=='loading'||shouldStop())return;
  // Also run on loading recovery if the previous process stopped after insert.
  // Adoption preserves native cursors and retry budgets of pre-upgrade jobs.
  await jobs.updateMany({queue:spec.name,sourceRoundId:{$exists:false},state:{$in:['queued','running']}},{$set:{sourceRoundId:round._id,'data.sourceRoundId':round._id}});
  const current=(await sources.find({_id:{$in:round.sourceIds}}).toArray()).filter(detectedSource),liveIds=new Set(current.map(s=>s._id));
  const skipped=round.sourceIds.filter(id=>!liveIds.has(id));
  if(skipped.length)await results.bulkWrite(skipped.map(sourceId=>({updateOne:{filter:{_id:flowId(round._id,'skipped',sourceId)},update:{$setOnInsert:{roundId:round._id,queue:spec.name,sourceId,outcome:'skipped',reason:'SOURCE_NO_LONGER_ELIGIBLE',finishedAt:new Date()}},upsert:true}})));
  const existing=await jobs.find({queue:spec.name,sourceRoundId:round._id},{projection:{entityKey:1}}).toArray();
  const done=await results.find({roundId:round._id},{projection:{sourceId:1}}).toArray();
  const existingEntityKeys=new Set([...existing.map(j=>j.entityKey),...done.map(r=>'source:'+r.sourceId)]);
  await enqueueSources(spec,round,current,existingEntityKeys);
  if(shouldStop())return;
  await rounds.updateOne({_id:round._id,state:'loading'},{$set:{state:'running',loadedAt:new Date()}});
  log('source_round_loaded',{queue:spec.name,roundId:round._id,sources:round.sourceIds.length,skipped:skipped.length});
 };
}
