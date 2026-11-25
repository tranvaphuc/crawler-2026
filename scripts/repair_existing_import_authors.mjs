import 'dotenv/config';import {MongoClient} from 'mongodb';import Redis from 'ioredis';import {Queue} from 'bullmq';import ES from 'elasticsearch';
import {serializeCrawlItem} from '../src/services/crawlerV8Es5.js';
import {verifiedExistingFacebookAuthor,createMongoAuthorStore,authorLookupKeys,importCommentActor} from '../src/services/facebookAuthorResolution.js';
const apply=process.argv.includes('--apply'),mongo=new MongoClient(process.env.CRAWL_MONGO_URI);await mongo.connect();const db=mongo.db(),redis=new Redis(process.env.CRAWL_REDIS_URL||'redis://127.0.0.1:6379',{maxRetriesPerRequest:null}),queue=new Queue('crawler-flow-es5-import',{connection:redis}),es=new ES.Client({apiVersion:'5.6',host:process.env.ES5_HOST,log:[]}),runId='existing-author-'+new Date().toISOString(),store=createMongoAuthorStore(db.collection('flow_author_identities'));
try{
 const rows=await db.collection('flow_jobs').find({queue:'es5-import',state:'failed',error:'FACEBOOK_COMMENT_AUTHOR_ID_UNVERIFIED'}).toArray();let verified=0,retried=0,absent=0,mismatch=0;
 for(let i=0;i<rows.length;i+=100){const batch=rows.slice(i,i+100),keys=batch.map(row=>serializeCrawlItem({...row.data.item,author:{...row.data.item.author,id:'1'}},row.data.source,{parent:row.data.parent})),response=await es.mget({body:{docs:keys.map(d=>({_index:d._index,_type:d._type,_id:d._id}))}});
  for(let n=0;n<batch.length;n++){const row=batch[n],hit=response.docs[n];if(hit.error)throw Error('ES5_LOOKUP_FAILED');const proof=verifiedExistingFacebookAuthor(row.data.item,row.data.source,row.data.parent,hit);if(!proof){if(!hit.found)absent++;else mismatch++;continue;}verified++;if(!apply)continue;const ticket=await queue.getJob(row._id);if(!ticket||await ticket.getState()!=='failed')continue;
   await db.collection('flow_import_repair_backups').updateOne({_id:runId+':'+row._id},{$setOnInsert:{runId,jobId:row._id,original:row,createdAt:new Date()}},{upsert:true});
   const item={...row.data.item,author:{...row.data.item.author,id:proof.id,idEvidence:proof.evidence}},data={...ticket.data,item};
   await store.putMany([{id:proof.id,evidence:proof.evidence,keys:authorLookupKeys(importCommentActor(item,row.data.parent))}]);
   await ticket.updateData(data);await db.collection('flow_jobs').updateOne({_id:row._id,state:'failed'},{$set:{'data.item':item,repairedAt:new Date()}});
   await db.collection('flow_import_repairs').updateOne({_id:row._id},{$set:{platform:'facebook',itemId:item.id,authorId:proof.id,publishedDate:item.createdAt,evidence:proof.evidence,repairedAt:new Date()}},{upsert:true});
   await ticket.retry('failed');await db.collection('flow_jobs').updateOne({_id:row._id,state:'failed'},{$set:{state:'queued',lastImportError:row.error,retriedAt:new Date()},$unset:{error:'',failedAt:''}});retried++;
  }
 }
 const result={runId,apply,candidates:rows.length,verified,retried,absent,mismatch,finishedAt:new Date()};console.log(JSON.stringify(result));if(apply)await db.collection('flow_import_repair_runs').insertOne({_id:runId,...result});
}finally{es.close();await queue.close();await redis.quit();await mongo.close();}
