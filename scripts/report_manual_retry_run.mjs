// Operator report only: no queue, job, policy or service mutations.
import fs from 'node:fs/promises';import path from 'node:path';import {createRequire}from'node:module';import{pathToFileURL}from'node:url';
const require=createRequire('/opt/crawler-v8/current/package.json'),{MongoClient}=require('mongodb'),Redis=require('ioredis'),ES=require('elasticsearch');
const {FLOW_QUEUES,queueName,FLOW_POLICY}=await import('file:///opt/crawler-v8/current/src/services/crawlerQueueFlow.js');
const dir=process.argv[2]||'/var/lib/crawler-v8/manual-retry-20261027-2202',manifest=JSON.parse(await fs.readFile(path.join(dir,'manifest.json'),'utf8')),progress=JSON.parse(await fs.readFile(path.join(dir,'progress.json'),'utf8'));
const mongo=new MongoClient(process.env.CRAWL_MONGO_URI,{serverSelectionTimeoutMS:10000});await mongo.connect();const db=mongo.db(),redis=new Redis(process.env.CRAWL_REDIS_URL||'redis://127.0.0.1:6379',{maxRetriesPerRequest:2});
const es=new ES.Client({apiVersion:'5.6',host:process.env.ES5_HOST,log:[],requestTimeout:45000,maxRetries:0});
const names=['waiting','active','paused','delayed','prioritized','waiting-children','failed','completed'];
const lua=`local r={} for i=1,3 do r[i]=redis.call('LRANGE',KEYS[i],0,-1) end for i=4,8 do r[i]=redis.call('ZRANGE',KEYS[i],0,-1) end return r`;
const out={at:new Date(),operationId:manifest.operationId,startedAt:progress.startedAt,requeueFinishedAt:progress.finishedAt,snapshotCount:manifest.snapshotCount,flowPolicy:FLOW_POLICY,queues:[]};
try{
 for(const spec of manifest.queues){
  const ids=new Set(spec.ids),key=s=>'bull:'+queueName(spec.name)+':'+s;
  const raw=await redis.eval(lua,8,...['wait','active','paused','delayed','prioritized','waiting-children','failed','completed'].map(key));
  const states=new Map();for(let i=0;i<8;i++)for(const id of raw[i])if(ids.has(id))states.set(id,names[i]);
  const audit=await db.collection('flow_manual_retry_tickets').find({operationId:manifest.operationId,queue:spec.name}).toArray(),byAudit=new Map(audit.map(a=>[a.jobId,a]));
  const mongoRows=await db.collection('flow_jobs').find({_id:{$in:spec.ids}},{projection:{_id:1,state:1,error:1,startedAt:1,failedAt:1,manualRetryOperationId:1,'data.manualRetry':1,'data.proxyRetries':1,'data.lastReadError':1,'data.lastReadTransport':1}}).toArray(),byMongo=new Map(mongoRows.map(r=>[r._id,r]));
  const oldest=await redis.xrange(key('events'),'-','+','COUNT',1),events=await redis.xrange(key('events'),String(+new Date(progress.startedAt))+'-0','+');
  const outcomes=new Map(),newGeneration=new Set();
  for(const [eventId,fields]of events){const e={};for(let i=0;i<fields.length;i+=2)e[fields[i]]=fields[i+1];if(!ids.has(e.jobId))continue;const a=byAudit.get(e.jobId);if(!a||Number(eventId.split('-')[0])<+new Date(a.preparedAt))continue;
   if(e.event==='added')newGeneration.add(e.jobId);
   if(!newGeneration.has(e.jobId)&&!outcomes.has(e.jobId)&&['completed','failed','removed'].includes(e.event))outcomes.set(e.jobId,{state:e.event,reason:e.failedReason,at:eventId});
  }
  const result={name:spec.name,total:spec.ids.length,completedConfirmed:0,failed:0,waiting:0,active:0,delayed:0,otherPending:0,unknown:0,changedGeneration:0,eventHistoryGap:!!oldest.length&&Number(oldest[0][0].split('-')[0])>+new Date(progress.startedAt),errors:{},failureSamples:[]};
  const currentIds=spec.ids.filter(id=>states.has(id)),hash=new Map();
  for(let i=0;i<currentIds.length;i+=500){const batch=currentIds.slice(i,i+500),p=redis.pipeline();for(const id of batch)p.hmget(key(id),'manualRetryOperationId','failedReason','processedOn','finishedOn','timestamp');const values=await p.exec();for(let n=0;n<batch.length;n++){if(values[n][0])throw values[n][0];hash.set(batch[n],values[n][1]);}}
  for(const id of spec.ids){
   const a=byAudit.get(id),row=byMongo.get(id),h=hash.get(id),current=states.get(id),event=outcomes.get(id);
   const ours=h?.[0]===manifest.operationId;
   // Preserve exact first observed terminal outcome; do not substitute a later
   // automatically created generation for this manual attempt.
   if(event?.state==='completed'){result.completedConfirmed++;continue;}
   if(event?.state==='failed'){result.failed++;const reason=event.reason||row?.error||h?.[1]||'UNKNOWN';result.errors[reason]=(result.errors[reason]||0)+1;continue;}
   if(ours&&current==='failed'&&Number(h?.[3]||0)>=+new Date(a?.preparedAt||progress.startedAt)){
    result.failed++;const reason=h?.[1]||row?.error||'UNKNOWN';result.errors[reason]=(result.errors[reason]||0)+1;
    if(result.failureSamples.length<3)result.failureSamples.push({id,reason,proxyRetries:row?.data?.proxyRetries,lastReadError:row?.data?.lastReadError,finishedOn:h?.[3]});continue;
   }
   if(ours&&current==='completed'){result.completedConfirmed++;continue;}
   if(ours&&['waiting','active','delayed'].includes(current)){result[current]++;continue;}
   if(ours&&current){result.otherPending++;continue;}
   if(!current&&row?.manualRetryOperationId===manifest.operationId&&row.state==='failed'&&+new Date(row.failedAt)>=+new Date(a?.preparedAt||progress.startedAt)){result.failed++;const reason=row.error||'UNKNOWN';result.errors[reason]=(result.errors[reason]||0)+1;continue;}
   if(!current&&row?.manualRetryOperationId===manifest.operationId&&['queued','running'].includes(row.state)){if(row.state==='running')result.active++;else result.waiting++;continue;}
   result.unknown++;if(current&&!ours)result.changedGeneration++;
  }
  out.queues.push(result);
 }
 // Exact deduplicated records currently in ES5 touched during the time window,
 // across the entire concurrently running crawler, not attributed to this run.
 try{out.esWindow=await es.search({index:'master20*',body:{size:0,query:{bool:{filter:[{prefix:{'ds.source':'crawler-v8-'}},{range:{insertedDate:{gte:progress.startedAt}}}]}},aggs:{byType:{terms:{field:'_type',size:30},aggs:{replies:{filter:{exists:{field:'commentParentId'}}},latest:{max:{field:'insertedDate'}}}}}}});}catch(e){out.esError=e.message;}
 out.sourceRetryObserved=[];
 try{
  const sourceNames=FLOW_QUEUES.filter(q=>q.kind==='source').map(q=>q.name),sourceAudit=await db.collection('flow_manual_retry_tickets').find({operationId:manifest.operationId,queue:{$in:sourceNames}},{projection:{jobId:1,queue:1}}).toArray(),auditById=new Map(sourceAudit.map(r=>[r.jobId,r]));
  const settled=await db.collection('flow_source_round_results').find({_id:{$in:sourceAudit.map(r=>r.jobId)}},{projection:{roundId:1,sourceId:1}}).toArray(),pairs=new Map();
  for(const r of settled){const a=auditById.get(r._id);if(a)pairs.set(r.roundId+'|'+r.sourceId,a.queue);}
  const roundIds=[...new Set(settled.map(r=>r.roundId))],items=await db.collection('flow_source_round_items').find({roundId:{$in:roundIds},kind:'post',observedAt:{$gte:new Date(progress.startedAt)}},{projection:{roundId:1,sourceId:1}}).toArray(),counts={};
  for(const item of items){const queue=pairs.get(item.roundId+'|'+item.sourceId);if(queue)counts[queue]=(counts[queue]||0)+1;}
  out.sourceRetryObserved=sourceNames.map(queue=>({queue,newUniquePostObservations:counts[queue]||0}));
 }catch(e){out.sourceObservationError=e.message;}
 console.log(JSON.stringify(out));
}finally{es.close();await redis.quit();await mongo.close();}
