import 'dotenv/config';
import {MongoClient} from 'mongodb';
import Redis from 'ioredis';
import {Queue} from 'bullmq';
import {FLOW_QUEUES,queueName,detectedSource} from '../src/services/crawlerQueueFlow.js';
const mongo=new MongoClient(process.env.CRAWL_MONGO_URI);await mongo.connect();const db=mongo.db();
const redis=new Redis(process.env.CRAWL_REDIS_URL||'redis://127.0.0.1:6379',{maxRetriesPerRequest:null});
const report={at:new Date(),queues:[],sources:await db.collection('sources').countDocuments({}),posts:await db.collection('flow_posts').countDocuments({}),oldJobs:await db.collection('jobs').countDocuments({}),counters:await db.collection('flow_counters').find({}).toArray()};
try{
 for(const spec of FLOW_QUEUES){
  const queue=new Queue(queueName(spec.name),{connection:redis});
  try{
   const counts=await queue.getJobCounts('waiting','active','delayed','completed','failed','paused');
   const sample=await queue.getJobs(['waiting','active'],0,99),failed=await queue.getJobs(['failed'],0,99);
   report.queues.push({...spec,...counts,invalidSourceSample:spec.kind==='import'?0:sample.filter(j=>!detectedSource(j.data.source)).length,errors:Object.fromEntries([...new Set(failed.map(j=>j.failedReason))].map(reason=>[reason,failed.filter(j=>j.failedReason===reason).length]))});
  }finally{await queue.close();}
 }
 report.mongoStates=await db.collection('flow_jobs').aggregate([{$group:{_id:{queue:'$queue',state:'$state'},count:{$sum:1}}}]).toArray();
 report.crawlWorkers=FLOW_QUEUES.filter(q=>q.kind!=='import').reduce((n,q)=>n+q.workers,0);
 console.log(JSON.stringify(report));
 if(report.oldJobs||report.queues.some(q=>q.invalidSourceSample||q.active>q.workers||q.completed))process.exitCode=1;
}finally{await redis.quit();await mongo.close();}
