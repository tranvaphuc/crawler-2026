import 'dotenv/config';
import {MongoClient} from 'mongodb';
import Redis from 'ioredis';
import {Queue} from 'bullmq';
import {FLOW_QUEUES,queueName} from '../src/services/crawlerQueueFlow.js';
const args=Object.fromEntries(process.argv.slice(2).map(a=>a.replace(/^--/,'').split(/=(.*)/s).slice(0,2)));
const since=new Date(args.since||Date.now()-4*3600000),until=new Date(args.until||Date.now());
if(!Number.isFinite(+since)||!Number.isFinite(+until)||since>until)throw Error('INVALID_REPORT_TIME_WINDOW');
const mongo=new MongoClient(process.env.CRAWL_MONGO_URI,{serverSelectionTimeoutMS:10000,maxPoolSize:10});await mongo.connect();const db=mongo.db();
const redis=new Redis(process.env.CRAWL_REDIS_URL||'redis://127.0.0.1:6379',{maxRetriesPerRequest:2,commandTimeout:15000});const queues=FLOW_QUEUES.map(spec=>({spec,q:new Queue(queueName(spec.name),{connection:redis})}));
try{
 const filter={at:{$gte:since,$lte:until}},events=db.collection('flow_error_events');
 const groups=await events.aggregate([{$match:filter},{$group:{_id:'$groupKey',count:{$sum:1},firstAt:{$min:'$at'},lastAt:{$max:'$at'},code:{$first:'$code'},queue:{$first:'$queue'},platform:{$first:'$platform'},phase:{$first:'$phase'},originalReason:{$first:'$originalReason'},nativeCode:{$first:'$nativeCode'},httpStatus:{$first:'$httpStatus'},apiCode:{$first:'$apiCode'},operation:{$first:'$operation'},query:{$first:'$query'},stage:{$first:'$stage'},errorType:{$first:'$errorType'},terminalReason:{$first:'$terminalReason'},bodyEncoding:{$first:'$bodyEncoding'},esErrorType:{$first:'$esErrorType'},esCauseType:{$first:'$esCauseType'},esField:{$first:'$esField'},wireComplete:{$first:'$wireComplete'}}},{$sort:{count:-1}}]).toArray();
 let next=0;await Promise.all(Array.from({length:8},async()=>{while(next<groups.length){const group=groups[next++],match={...filter,groupKey:group._id};group.kinds=await events.aggregate([{$match:match},{$group:{_id:'$kind',count:{$sum:1}}}]).toArray();group.cases=await events.aggregate([{$match:match},{$sort:{at:1}},{$group:{_id:'$jobId',example:{$first:'$$ROOT'}}},{$limit:2},{$replaceRoot:{newRoot:'$example'}}]).toArray();}}));
 const report={at:new Date(),since,until,timezone:'Asia/Ho_Chi_Minh',counting:'request_error counts observed failed HTTP requests (including recovered reads); read_retry/read_failure count failed read attempts; job_failed is a terminal job event. These are separate levels, never sum them as HTTP failure counts. runtime_error and partial_delivery_error are separate.',groups,queues:await Promise.all(queues.map(async({spec,q})=>({name:spec.name,budget:spec.workers,...await q.getJobCounts('waiting','active','delayed','failed','paused')}))),counters:await db.collection('flow_counters').find({}).toArray(),retainedFailures:await db.collection('flow_jobs').aggregate([{$match:{state:'failed'}},{$group:{_id:{queue:'$queue',error:'$error'},count:{$sum:1}}},{$sort:{count:-1}}]).toArray()};
 console.log(JSON.stringify(report));
}finally{await Promise.all(queues.map(({q})=>q.close()));await redis.quit();await mongo.close();}
