// Read-only runtime/queue/data audit. Writes only a dedicated monitor checkpoint.
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
const root='/opt/crawler-v8/current',require=createRequire(root+'/package.json'),{MongoClient}=require('mongodb'),Redis=require('ioredis'),{Queue}=require('bullmq'),ES=require('elasticsearch');
const {FLOW_QUEUES,queueName,FLOW_POLICY,flowWorkerConcurrency}=await import(root+'/src/services/crawlerQueueFlow.js');
const at=new Date(),since=new Date(at-15*60000),mongo=new MongoClient(process.env.CRAWL_MONGO_URI,{serverSelectionTimeoutMS:10000,socketTimeoutMS:10000});await mongo.connect();const db=mongo.db(),redis=new Redis(process.env.CRAWL_REDIS_URL||'redis://127.0.0.1:6379',{maxRetriesPerRequest:2,commandTimeout:10000});
const es=new ES.Client({apiVersion:'5.6',host:process.env.ES5_HOST,log:[],requestTimeout:15000,maxRetries:0});
const out={qcWatch:true,at,policy:FLOW_POLICY,since,queues:[],services:[],counters:await db.collection('flow_counters').find({}).toArray()};
try{
 for(const service of ['crawler-queue-flow.service','crawler-proxy-manager.service']){const raw=execFileSync('systemctl',['show',service,'-p','ActiveState','-p','SubState','-p','MainPID','-p','NRestarts','-p','ExecMainStartTimestamp'],{encoding:'utf8'});out.services.push({service,...Object.fromEntries(raw.trim().split('\n').map(line=>{const i=line.indexOf('=');return[line.slice(0,i),line.slice(i+1)];}))});}
 const reasons=await db.collection('flow_jobs').aggregate([{$match:{state:'failed',failedAt:{$gte:since}}},{$group:{_id:{queue:'$queue',reason:'$error'},count:{$sum:1},sampleId:{$first:'$_id'}}},{$sort:{count:-1}}]).toArray();
 for(const spec of FLOW_QUEUES){const q=new Queue(queueName(spec.name),{connection:redis});try{const active=await q.getActive(0,spec.workers);out.queues.push({name:spec.name,workers:spec.workers,concurrency:flowWorkerConcurrency(spec),...await q.getJobCounts('waiting','active','delayed','paused','failed'),oldestActiveMs:active.length?Math.max(...active.map(j=>at-j.processedOn)):0,activeProgress:active.map(j=>({id:j.id,processedOn:j.processedOn,page:j.data.page||0,pendingRows:j.data.pendingPage?.items?.length||0,checkpointHash:j.data.checkpoint?createHash('sha256').update(j.data.checkpoint).digest('hex'):null})),recentFailures:reasons.filter(x=>x._id.queue===spec.name).map(x=>({reason:x._id.reason,count:x.count,sampleId:x.sampleId}))});}finally{await q.close();}}
 out.rounds=await db.collection('flow_source_rounds').find({state:{$in:['loading','running']}},{projection:{queue:1,state:1,expectedSources:1,startedAt:1}}).toArray();
 out.mongoStates=await db.collection('flow_jobs').aggregate([{$group:{_id:{queue:'$queue',state:'$state'},count:{$sum:1}}}]).toArray();
 try{
  const response=await es.search({index:'master20*',body:{
   size:0,
   query:{bool:{filter:[{prefix:{'ds.source':'crawler-v8-'}},{range:{insertedDate:{gte:since.toISOString()}}}]}},
   aggs:{types:{terms:{field:'_type',size:30},aggs:{replies:{filter:{exists:{field:'commentParentId'}}}}}}
  }});
  out.dataWindow={since:since.toISOString(),meaning:'Distinct ES5 records currently touched in this time window; includes updates and concurrent crawler flows.',partial:response.timed_out||response._shards.failed>0,total:response.hits.total,types:response.aggregations.types.buckets.map(x=>({type:x.key,records:x.doc_count,replies:x.replies.doc_count}))};
 }catch(e){out.dataError=e.code||e.name;}
 await fs.writeFile('/var/lib/crawler-v8/qc-v6-watch-latest.json',JSON.stringify(out),{mode:0o600});console.log(JSON.stringify(out));
}finally{es.close();await redis.quit();await mongo.close();}
