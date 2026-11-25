import 'dotenv/config';
import fs from 'node:fs/promises';
import {MongoClient} from 'mongodb';import Redis from 'ioredis';import {Queue} from 'bullmq';import {setTimeout as sleep} from 'node:timers/promises';
import {createHttpExecutor} from '../src/services/socialHttpTransport.js';import {createAnonymousFacebookGraphqlRequest} from '../src/services/facebookAnonymousGraphql.js';import {createFacebookAuthorResolver,createMongoAuthorStore,importCommentActor} from '../src/services/facebookAuthorResolution.js';import {queueName,errorCode} from '../src/services/crawlerQueueFlow.js';
const mongo=new MongoClient(process.env.CRAWL_MONGO_URI);await mongo.connect();const db=mongo.db(),jobs=db.collection('flow_jobs'),redis=new Redis(process.env.CRAWL_REDIS_URL||'redis://127.0.0.1:6379',{maxRetriesPerRequest:null}),queue=new Queue(queueName('es5-import'),{connection:redis}),apply=process.argv.includes('--apply'),runId='native-parser-'+new Date().toISOString();
const log=(event,data={})=>console.log(JSON.stringify({at:new Date(),event,runId,...data}));
const option=name=>process.argv.find(x=>x.startsWith('--'+name+'='))?.split('=').slice(1).join('=');
const concurrency=Number(option('concurrency')||10);if(!Number.isInteger(concurrency)||concurrency<1||concurrency>20)throw Error('concurrency must be 1..20');
const filter={queue:'es5-import',state:'failed',error:option('error')||{$in:['EXACT_PUBLICATION_DATE_REQUIRED','FACEBOOK_COMMENT_AUTHOR_ID_UNVERIFIED','POST_AUTHOR_SOURCE_MISMATCH']},...(option('platform')?{'data.source.platform':option('platform')}:{})};
const rows=await jobs.find(filter).toArray();rows.sort((a,b)=>({FACEBOOK_COMMENT_AUTHOR_ID_UNVERIFIED:0,POST_AUTHOR_SOURCE_MISMATCH:1,EXACT_PUBLICATION_DATE_REQUIRED:2}[a.error]-{FACEBOOK_COMMENT_AUTHOR_ID_UNVERIFIED:0,POST_AUTHOR_SOURCE_MISMATCH:1,EXACT_PUBLICATION_DATE_REQUIRED:2}[b.error]));log('repair_candidates',{apply,count:rows.length,byError:Object.fromEntries([...new Set(rows.map(j=>j.error))].map(e=>[e,rows.filter(j=>j.error===e).length]))});
try{
 if(!apply)process.exitCode=0;
 else{
  for(let i=0;i<rows.length;i+=100)await db.collection('flow_import_repair_backups').bulkWrite(rows.slice(i,i+100).map(row=>({updateOne:{filter:{_id:runId+':'+row._id},update:{$setOnInsert:{runId,jobId:row._id,original:row,createdAt:new Date()}},upsert:true}})),{ordered:false});
  const resolve=createFacebookAuthorResolver({store:createMongoAuthorStore(db.collection('flow_author_identities'))});
  const actors=rows.filter(j=>j.error==='FACEBOOK_COMMENT_AUTHOR_ID_UNVERIFIED');const groups=[];for(let i=0;i<actors.length;i+=10)groups.push(actors.slice(i,i+10));let offset=0,profileBatches=0;
  if(!process.argv.includes('--skip-prefill'))await Promise.all(Array.from({length:4},async()=>{for(;;){const group=groups[offset++];if(!group)break;const comments=group.map(j=>importCommentActor(j.data.item,j.data.parent));await resolve(comments,null);if(comments.some(c=>!c.authorId))for(let attempt=0;attempt<3;attempt++){
   const result=await createHttpExecutor({timeoutMs:90000})({platform:'facebook',operation:'comments',pool:'facebook_api_comments',url:group[0].data.parent.url},async session=>{const request=createAnonymousFacebookGraphqlRequest(session,{bootstrapUrl:group[0].data.parent.url});await resolve(comments,request,Date.now()+80000);return{status:'ok'};});if(result.status==='ok')break;
  }
  profileBatches++;if(profileBatches%5===0)log('author_prefill_progress',{batches:profileBatches,totalBatches:groups.length});}}));
  log('author_prefill_done',{profileBatches,facts:await db.collection('flow_author_identities').countDocuments({conflict:{$ne:true}})});
  let retried=0,missing=0,cursor=0,lastProgress=0;const active=new Set();
  while(cursor<rows.length||active.size){
   for(const id of [...active]){const state=await queue.getJobState(id);if(['completed','failed','unknown'].includes(state))active.delete(id);}
   while(active.size<concurrency&&cursor<rows.length){const row=rows[cursor++],ticket=await queue.getJob(row._id);if(!ticket){missing++;continue;}if(await ticket.getState()!=='failed')continue;try{await ticket.retry('failed');await jobs.updateOne({_id:row._id,state:'failed'},{$set:{state:'queued',lastImportError:row.error,retriedAt:new Date()},$unset:{error:'',failedAt:''}});retried++;active.add(row._id);}catch(e){log('retry_not_ready',{jobId:row._id,error:errorCode(e)});}}
   if(Date.now()-lastProgress>10000){log('import_retry_progress',{processed:cursor,total:rows.length,retried,inflight:active.size});lastProgress=Date.now();}
   if(active.size||cursor<rows.length)await sleep(500);
  }
  const remaining=await jobs.countDocuments({_id:{$in:rows.map(j=>j._id)},state:'failed'});await db.collection('flow_import_repair_runs').insertOne({_id:runId,candidates:rows.length,retried,missing,remaining,finishedAt:new Date()});log('repair_done',{candidates:rows.length,retried,missing,remaining});
 }
}finally{await queue.close();await redis.quit();await mongo.close();}
