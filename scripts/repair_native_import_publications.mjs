import 'dotenv/config';import {MongoClient} from 'mongodb';import Redis from 'ioredis';import {Queue} from 'bullmq';
import {createHttpExecutor} from '../src/services/socialHttpTransport.js';import {createConfiguredProxyProvider} from '../src/services/socialProxyConfig.js';import {normalizeMetricsInput} from '../src/services/socialMetrics.js';import {extractPostInfo} from '../src/services/socialPostInfo.js';
const mongo=new MongoClient(process.env.CRAWL_MONGO_URI);await mongo.connect();const db=mongo.db(),redis=new Redis(process.env.CRAWL_REDIS_URL||'redis://127.0.0.1:6379',{maxRetriesPerRequest:null}),q=new Queue('crawler-flow-es5-import',{connection:redis}),runId='native-publication-'+new Date().toISOString(),getProxy=createConfiguredProxyProvider(),apply=process.argv.includes('--apply');let offset=0,processed=0,repaired=0,unresolved=0,skipped=0;
const log=(event,extra={})=>console.log(JSON.stringify({at:new Date(),runId,event,processed,repaired,unresolved,skipped,...extra}));
try{
 const rows=await db.collection('flow_jobs').find({queue:'es5-import',state:'failed',error:'EXACT_PUBLICATION_DATE_REQUIRED','data.source.platform':{$in:['instagram','youtube']}}).toArray();log('candidates',{total:rows.length,apply});
 if(apply)await Promise.all(Array.from({length:10},async()=>{for(;;){const row=rows[offset++];if(!row)return;const ticket=await q.getJob(row._id);if(!ticket||await ticket.getState()!=='failed'){skipped++;processed++;continue;}let proof=null,last=null;
  for(let attempt=0;attempt<=50;attempt++){
   const target=normalizeMetricsInput({url:row.data.item.url,platform:row.data.source.platform});
   const result=await createHttpExecutor({getProxy,timeoutMs:20000})({platform:target.platform,operation:'source',url:target.url},async session=>{const snapshot=await session.request(target.url),info=extractPostInfo(target,snapshot),valid=info.identityVerified===true&&info.post?.id===row.data.item.id&&info.post.author?.id===row.data.source.nativeId&&Number.isFinite(Date.parse(info.post.createdAt));if(valid)proof={createdAt:info.post.createdAt,metrics:info.metrics,evidence:'matched_native_post_response'};return{status:proof?'ok':info.status,reason:proof?null:info.reason||'NATIVE_PUBLICATION_NOT_RETURNED'};});
   last={status:result.status,reason:result.reason||null,attempt,checkedAt:new Date()};await db.collection('flow_import_repair_attempts').updateOne({_id:row._id},{$set:{runId,...last},$inc:{attempts:1}},{upsert:true});if(proof)break;
  }
  if(proof&&await ticket.getState()==='failed'){
   await db.collection('flow_import_repair_backups').updateOne({_id:runId+':'+row._id},{$setOnInsert:{runId,jobId:row._id,original:row,createdAt:new Date()}},{upsert:true});const metrics={...row.data.item.metrics};for(const[k,v]of Object.entries(proof.metrics||{}))if(v!=null)metrics[k]=v;
   const item={...row.data.item,createdAt:proof.createdAt,dateEvidence:proof.evidence,metrics};await ticket.updateData({...ticket.data,item});await db.collection('flow_jobs').updateOne({_id:row._id,state:'failed'},{$set:{'data.item':item,repairedAt:new Date()}});await db.collection('flow_import_repairs').updateOne({_id:row._id},{$set:{platform:targetPlatform(row),itemId:item.id,publishedDate:item.createdAt,evidence:proof.evidence,repairedAt:new Date()}},{upsert:true});await ticket.retry('failed');await db.collection('flow_jobs').updateOne({_id:row._id,state:'failed'},{$set:{state:'queued',lastImportError:row.error,retriedAt:new Date()},$unset:{error:'',failedAt:''}});repaired++;
  }else if(!proof)unresolved++;else skipped++;processed++;if(processed%10===0)log('progress',{total:rows.length});
 }}));
 const result={_id:runId,candidates:rows.length,processed,repaired,unresolved,skipped,finishedAt:new Date()};if(apply)await db.collection('flow_import_repair_runs').insertOne(result);log('done',result);
}finally{await q.close();await redis.quit();await mongo.close();}
function targetPlatform(row){return row.data.source.platform;}
