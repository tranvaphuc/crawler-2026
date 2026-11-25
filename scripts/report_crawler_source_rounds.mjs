import 'dotenv/config';
import {MongoClient} from 'mongodb';import Redis from 'ioredis';import {Queue} from 'bullmq';
import {FLOW_QUEUES,FLOW_POLICY,FLOW_RETRY_LIMIT,queueName} from '../src/services/crawlerQueueFlow.js';
import {SOURCE_ROUND_POLICY} from '../src/services/crawlerSourceRounds.js';
const ids=(process.argv.find(a=>a.startsWith('--round-ids='))||'').slice('--round-ids='.length).split(',').filter(Boolean);
const mongo=new MongoClient(process.env.CRAWL_MONGO_URI,{serverSelectionTimeoutMS:10000});await mongo.connect();const db=mongo.db();
const redis=new Redis(process.env.CRAWL_REDIS_URL||'redis://127.0.0.1:6379',{maxRetriesPerRequest:null});
try{
 const report={at:new Date(),flowPolicy:FLOW_POLICY,roundPolicy:SOURCE_ROUND_POLICY,retryLimit:FLOW_RETRY_LIMIT,queues:[],counters:await db.collection('flow_counters').find({}).toArray(),rounds:[]};
 for(const spec of FLOW_QUEUES){const queue=new Queue(queueName(spec.name),{connection:redis});try{report.queues.push({...spec,...await queue.getJobCounts('waiting','active','delayed','paused','prioritized','waiting-children','completed','failed')});}finally{await queue.close();}}
 const query=ids.length?{_id:{$in:ids}}:{state:{$in:['loading','running']}};
 const rounds=await db.collection('flow_source_rounds').find(query,{projection:{sourceIds:0}}).sort({startedAt:1}).toArray();
 for(const round of rounds){
  const progress=await db.collection('flow_source_round_results').aggregate([{$match:{roundId:round._id}},{$group:{_id:'$outcome',count:{$sum:1}}}]).toArray();
  const observations=await db.collection('flow_source_round_items').aggregate([{$match:{roundId:round._id}},{$group:{_id:'$kind',count:{$sum:1}}}]).toArray();
  const jobs=await db.collection('flow_jobs').aggregate([{$match:{sourceRoundId:round._id,queue:round.queue}},{$group:{_id:'$state',count:{$sum:1}}}]).toArray();
  const errors=await db.collection('flow_source_round_results').aggregate([{$match:{roundId:round._id,outcome:{$in:['failed','retry_exhausted']}}},{$group:{_id:'$error',count:{$sum:1}}}]).toArray();
  report.rounds.push({...round,progress,observations,jobs,errors});
 }
 report.retainedFailures=await db.collection('flow_jobs').aggregate([{$match:{state:'failed'}},{$group:{_id:{queue:'$queue',error:'$error'},count:{$sum:1}}}]).toArray();
 console.log(JSON.stringify(report));
}finally{await redis.quit();await mongo.close();}
