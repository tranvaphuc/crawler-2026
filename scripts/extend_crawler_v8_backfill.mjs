import fs from 'node:fs/promises';import {MongoClient} from 'mongodb';
import {classifySocialUrl} from '../src/services/socialSystemReference.js';
const c=new MongoClient(process.env.CRAWL_MONGO_URI);await c.connect();
try{
 const db=c.db(),runId=process.env.CRAWL_RUN_ID||'october-2026-v8',run=await db.collection('runs').findOne({_id:runId});
 if(!run)throw Error('RUN_NOT_FOUND');if(run.lockUntil&&new Date(run.lockUntil)>new Date())throw Error('STOP_WORKER_BEFORE_EXTENDING_WINDOW');
 const now=new Date(),until=now.toISOString(),since='2026-09-30T17:00:00.000Z';
 let queued=0,unsupported=0,aliases=0;const byChannel={};let ops=[];
 async function flush(){if(ops.length){const r=await db.collection('jobs').bulkWrite(ops,{ordered:false});queued+=r.upsertedCount;ops=[];}}
 for await(const s of db.collection('sources').find({platform:{$in:['facebook','threads','instagram','youtube']}})){
  if(s.canonicalSourceId){aliases++;continue;}
  let ref;try{ref=classifySocialUrl(s.url);if(ref.kind!=='source'||ref.platform!==s.platform)throw Error('NOT_SOURCE');}catch{unsupported++;continue;}
  const key=s.platform+(s.platform==='facebook'?'.'+s.type:'');byChannel[key]=(byChannel[key]||0)+1;
  ops.push({updateOne:{filter:{_id:`${runId}:source:${s._id}`},update:{$setOnInsert:{runId,kind:'source',platform:s.platform,sourceId:s._id,state:'pending',priority:1,attempts:0,nextAt:now,createdAt:now,requiresLiveVerification:s.eligible!==true}},upsert:true}});if(ops.length>=500)await flush();
 }await flush();
 // Authentication and checkpoints stay held. Extending a window never bypasses upstream access gates.
 const sources=await db.collection('jobs').updateMany({runId,kind:'source',state:{$in:['done','partial']}},{$set:{state:'pending',nextAt:now,backfillComplete:false,windowCovered:false,windowExtendedAt:now},$unset:{finishedAt:''}});
 const comments=await db.collection('jobs').updateMany({runId,kind:'comments',state:{$in:['done','partial']}},{$set:{state:'pending',nextAt:now,backfillComplete:false,windowExtendedAt:now},$unset:{finishedAt:''}});
 const stale=await db.collection('jobs').updateMany({runId,state:'running'},{$set:{state:'retry',nextAt:now},$unset:{leaseToken:'',leasedUntil:''}});
 await db.collection('runs').updateOne({_id:runId},{$set:{since,until,previousUntil:run.until,backfillPolicy:'resumable_full_window_v1',backfillExtendedAt:now,status:'prepared',activeWorkers:0},$unset:{lockToken:'',lockUntil:'',finishedAt:''}});
 const report={at:now.toISOString(),since,until,previousUntil:run.until,newSourceJobs:queued,sourceJobsRescheduled:sources.modifiedCount,commentJobsRescheduled:comments.modifiedCount,staleRecovered:stale.modifiedCount,aliasesSkipped:aliases,unsupportedSourceUrls:unsupported,byChannel};
 await fs.writeFile((process.env.CRAWL_DATA_DIR||'/var/lib/crawler-v8')+'/full-backfill-migration.json',JSON.stringify(report,null,2),{mode:0o600});console.log(JSON.stringify(report));
}finally{await c.close();}
