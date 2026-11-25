import {MongoClient} from 'mongodb';
import ES from 'elasticsearch';
import {serializeCrawlItem,verifyDocumentMapping} from '../src/services/crawlerV8Es5.js';
const client=new MongoClient(process.env.CRAWL_MONGO_URI),es=new ES.Client({apiVersion:'5.6',host:process.env.ES5_HOST,log:[],maxRetries:0});await client.connect();
try{
 const db=client.db(),runId=process.env.CRAWL_RUN_ID||'october-2026-v8',run=await db.collection('runs').findOne({_id:runId}),maps={};let recovered=0,skipped=0;
 for await(const q of db.collection('quarantine').find({runId,reason:'COMMENT_PARENT_MISMATCH',resolvedAt:{$exists:false}})){
  const job=await db.collection('jobs').findOne({_id:q.jobId}),source=await db.collection('sources').findOne({_id:q.sourceId});
  if(!job?.parent||!source||!['indexed','existing'].includes((await db.collection('documents').findOne({_id:job.parent.documentKey}))?.state)){skipped++;continue;}
  let d;try{d=serializeCrawlItem(q.raw,source,{parent:job.parent,since:run.since,until:run.until});if(!maps[d._index])maps[d._index]=(await es.indices.getMapping({index:d._index}))[d._index]?.mappings;verifyDocumentMapping(d,maps[d._index]?.[d._type]);}catch{skipped++;continue;}
  const key=d._type+':'+d._id;
  await db.collection('documents').updateOne({_id:key},{$setOnInsert:{runId,kind:'comment',platform:source.platform,sourceId:source._id,document:d,raw:q.raw,state:'pending',createdAt:new Date(),nextAt:new Date()}},{upsert:true});
  await db.collection('quarantine').updateOne({_id:q._id},{$set:{resolvedAt:new Date(),resolution:'NATIVE_POST_ID_BOUND_TO_VERIFIED_SYSTEM_PARENT',documentKey:key}});recovered++;
 }
 console.log(JSON.stringify({recovered,skipped,at:new Date().toISOString()}));
}finally{await client.close();es.close();}
