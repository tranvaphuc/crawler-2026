import 'dotenv/config';
import Redis from 'ioredis';
import {Queue} from 'bullmq';
import {MongoClient} from 'mongodb';
import {CRAWLER_V8_QUEUE_NAME} from '../src/services/crawlerV8BullQueue.js';
const runId=process.env.CRAWL_RUN_ID||'october-2026-v8';
const mongo=new MongoClient(process.env.CRAWL_MONGO_URI,{serverSelectionTimeoutMS:10000});await mongo.connect();
const db=mongo.db(),redis=new Redis(process.env.CRAWL_REDIS_URL||'redis://127.0.0.1:6379',{maxRetriesPerRequest:null});
const queue=new Queue(CRAWLER_V8_QUEUE_NAME,{connection:redis});
try{
 const [counts,active,running,shards]=await Promise.all([
  queue.getJobCounts('waiting','active','delayed','completed','failed'),
  queue.getJobs(['active'],0,499),
  db.collection('jobs').countDocuments({runId,state:'running'}),
  db.collection('worker_shards').find({runId,status:'running',lockUntil:{$gt:new Date()}},{projection:{shardIndex:1,activeWorkers:1,desiredWorkers:1}}).toArray()
 ]);
 const ids=active.map(x=>x.data?.mongoJobId).filter(Boolean);
 const duplicateBullActive=ids.length-new Set(ids).size;
 const activeMongo=await db.collection('jobs').find({_id:{$in:ids}},{projection:{_id:1,state:1,queueBackend:1,workerShard:1}}).toArray();
 const invalidRows=activeMongo.filter(x=>x.state!=='running'||x.queueBackend!=='bullmq_mongo_fenced_v1');
 const invalidBullActive=invalidRows.length;
 const invalidByState=Object.fromEntries([...new Set(invalidRows.map(x=>x.state))].map(state=>[state,invalidRows.filter(x=>x.state===state).length]));
 const totalShardWorkers=shards.reduce((sum,x)=>sum+(x.activeWorkers||0),0);
 const out={at:new Date().toISOString(),counts,activeBull:active.length,runningMongo:running,totalShardWorkers,shards:shards.map(x=>({shardIndex:x.shardIndex,activeWorkers:x.activeWorkers,desiredWorkers:x.desiredWorkers})),duplicateBullActive,invalidBullActive,invalidByState};
 console.log(JSON.stringify(out));
 if(shards.length!==2||totalShardWorkers>400||duplicateBullActive)process.exitCode=1;
}finally{await queue.close();await redis.quit();await mongo.close();}
