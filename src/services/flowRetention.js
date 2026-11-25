const DAY=86400000;
export const FLOW_RETENTION=Object.freeze({errorDays:7,roundDetailDays:2,roundSummaryDays:30,redisHistoryDays:7});
export function referencedSourceRounds(rows){
 const ids=new Set();for(const row of rows)for(const id of [row.sourceRoundId,row.data?.sourceRoundId,row.data?.parent?.sourceRoundId])if(typeof id==='string')ids.add(id);return ids;
}
export const orphanLogCleanupScript="if redis.call('EXISTS',KEYS[2])==0 then return redis.call('UNLINK',KEYS[1]) end return 0";
// Only operational history is eligible. This module never deletes source
// inventory, Mongo jobs (including failed UID), documents, or author caches.
export function createFlowRetention({db,redis,queues,now=Date.now,intervalMs=300000,errorLimit=25000,roundLimit=150000,batchSize=1000,errorBudgetMs=10000,roundBudgetMs=30000,onResult=()=>{},onError=()=>{}}={}){
 let pending=null,timer=null,closed=false,last=null,redisCursor='0',indexesReady=false;
 const rounds=db.collection('flow_source_rounds'),items=db.collection('flow_source_round_items'),results=db.collection('flow_source_round_results'),jobs=db.collection('flow_jobs'),errors=db.collection('flow_error_events');
 const readIds=async(collection,filter,extra={})=>{let cursor=collection.find(filter,{projection:{_id:1},maxTimeMS:3000});if(extra.sort)cursor=cursor.sort(extra.sort);if(extra.hint)cursor=cursor.hint(extra.hint);return(await cursor.limit(extra.limit||batchSize).toArray()).map(row=>row._id);};
 async function collect(){
  const at=now(),out={at:new Date(at),policy:FLOW_RETENTION,errorsDeleted:0,roundItemsDeleted:0,roundResultsDeleted:0,roundsDetailedPurged:0,roundSummariesDeleted:0,referencedRoundsHeld:0,redisCompletedDeleted:0,redisEventsTrimmed:0,redisOrphanLogsDeleted:0,errors:[],phaseMs:{}};
  async function phase(name,work){if(closed)return;const started=now();try{await work();}catch(error){out.errors.push({phase:name,code:error.code||error.name});}finally{out.phaseMs[name]=now()-started;}}
  await phase('indexes',async()=>{if(!indexesReady){await rounds.createIndex({state:1,finishedAt:1},{name:'flow_retention_completed_rounds'});await jobs.createIndexes([{key:{sourceRoundId:1},name:'flow_retention_job_round',sparse:true},{key:{'data.sourceRoundId':1},name:'flow_retention_job_round_data',sparse:true},{key:{'data.parent.sourceRoundId':1},name:'flow_retention_job_round_parent',sparse:true}]);indexesReady=true;}});
  await phase('error_history',async()=>{
   const filter={at:{$lt:new Date(at-FLOW_RETENTION.errorDays*DAY)},queue:{$ne:'find-uid'}},until=now()+errorBudgetMs;
   while(!closed&&now()<until&&out.errorsDeleted<errorLimit){const ids=await readIds(errors,filter,{sort:{at:1},hint:{at:1,groupKey:1},limit:Math.min(batchSize,errorLimit-out.errorsDeleted)});if(!ids.length)break;const r=await errors.deleteMany({...filter,_id:{$in:ids}},{maxTimeMS:10000,hint:{_id:1}});out.errorsDeleted+=r.deletedCount;if(!r.deletedCount)break;}
  });
  await phase('completed_round_details',async()=>{
   const references=referencedSourceRounds(await jobs.find({},{projection:{sourceRoundId:1,'data.sourceRoundId':1,'data.parent.sourceRoundId':1},maxTimeMS:5000}).toArray()),cutoff=new Date(at-FLOW_RETENTION.roundDetailDays*DAY),until=now()+roundBudgetMs;
   out.referencedRoundsHeld=references.size;
   const filter={state:'completed',finishedAt:{$lt:cutoff},detailsPurgedAt:{$exists:false},_id:{$nin:[...references]}};
   const candidates=await rounds.find(filter,{projection:{_id:1,finishedAt:1},maxTimeMS:5000}).sort({finishedAt:1}).limit(100).toArray();
   for(const round of candidates){
    if(closed||now()>=until||out.roundItemsDeleted+out.roundResultsDeleted>=roundLimit)break;
    // Check again immediately before deleting details; even failed jobs may be
    // retried later and retain the round they reference.
    if(await jobs.findOne({$or:[{sourceRoundId:round._id},{'data.sourceRoundId':round._id},{'data.parent.sourceRoundId':round._id}]},{projection:{_id:1},maxTimeMS:3000}))continue;
    let deletedItems=0,deletedResults=0;
    for(const [collection,field]of [[items,'items'],[results,'results']]){
     while(!closed&&now()<until&&out.roundItemsDeleted+out.roundResultsDeleted<roundLimit){const ids=await readIds(collection,{roundId:round._id},{limit:Math.min(batchSize,roundLimit-out.roundItemsDeleted-out.roundResultsDeleted)});if(!ids.length)break;const r=await collection.deleteMany({roundId:round._id,_id:{$in:ids}},{maxTimeMS:10000,hint:{_id:1}});if(field==='items'){deletedItems+=r.deletedCount;out.roundItemsDeleted+=r.deletedCount;}else{deletedResults+=r.deletedCount;out.roundResultsDeleted+=r.deletedCount;}if(!r.deletedCount)break;}
    }
    const remains=await items.findOne({roundId:round._id},{projection:{_id:1},maxTimeMS:3000})||await results.findOne({roundId:round._id},{projection:{_id:1},maxTimeMS:3000});
    const update={$inc:{retentionItemsDeleted:deletedItems,retentionResultsDeleted:deletedResults},$set:{retentionCheckedAt:new Date(at)}};
    if(!remains){update.$set.detailsPurgedAt=new Date(at);out.roundsDetailedPurged++;}
    await rounds.updateOne({_id:round._id,state:'completed',finishedAt:{$lt:cutoff}},update);
   }
   const old=await readIds(rounds,{state:'completed',finishedAt:{$lt:new Date(at-FLOW_RETENTION.roundSummaryDays*DAY)},detailsPurgedAt:{$exists:true},_id:{$nin:[...references]}},{limit:100});
   if(old.length)out.roundSummariesDeleted=(await rounds.deleteMany({_id:{$in:old},state:'completed',detailsPurgedAt:{$exists:true},finishedAt:{$lt:new Date(at-FLOW_RETENTION.roundSummaryDays*DAY)}},{maxTimeMS:10000,hint:{_id:1}})).deletedCount;
  });
  await phase('redis_history',async()=>{
   const until=String(at-FLOW_RETENTION.redisHistoryDays*DAY)+'-0',known=new Set();
   for(const[name,q]of queues){if(name==='find-uid')continue;known.add(q.toKey(''));out.redisCompletedDeleted+=(await q.clean(FLOW_RETENTION.redisHistoryDays*DAY,500,'completed')).length;out.redisEventsTrimmed+=Number(await redis.xtrim(q.toKey('events'),'MINID','~',until));}
   // Logs without a job hash are garbage only after a full history window.
   // Runtime locks, source/job payloads and failed tickets are never scanned for deletion.
   for(let scan=0;scan<20&&!closed;scan++){
    const [cursor,keys]=await redis.scan(redisCursor,'MATCH','bull:crawler-flow-*:logs','COUNT',200);redisCursor=cursor;
    for(const key of keys){if(![...known].some(prefix=>key.startsWith(prefix)))continue;const idle=await redis.object('IDLETIME',key);if(Number(idle)<FLOW_RETENTION.redisHistoryDays*86400)continue;out.redisOrphanLogsDeleted+=Number(await redis.eval(orphanLogCleanupScript,2,key,key.slice(0,-5)));}
    if(redisCursor==='0')break;
   }
  });
  out.finishedAt=new Date(now());out.elapsedMs=now()-at;last=out;onResult(out);return out;
 }
 function run(){if(closed)return Promise.resolve(last);if(!pending)pending=collect().catch(error=>{onError(error);throw error;}).finally(()=>{pending=null;});return pending;}
 return{run,start(){if(!timer&&!closed){timer=setInterval(()=>void run().catch(()=>{}),intervalMs);timer.unref();void run().catch(()=>{});}},status:()=>last,async close(){closed=true;clearInterval(timer);timer=null;if(pending)await pending.catch(()=>{});}};
}
