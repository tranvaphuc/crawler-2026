// Observe unique recovery IDs. Absence is unknown unless a terminal event was observed.
import fs from'node:fs/promises';import{createRequire}from'node:module';
const root='/opt/crawler-v8/current',require=createRequire(root+'/package.json'),{MongoClient}=require('mongodb'),Redis=require('ioredis'),{Queue}=require('bullmq');const{queueName}=await import(root+'/src/services/crawlerQueueFlow.js');
const operationId=process.argv[2]||'qc-v6-recovery-batch1-20261028';if(!/^qc-v6-[a-z0-9-]+$/.test(operationId))throw Error('INVALID_OPERATION');const mongo=new MongoClient(process.env.CRAWL_MONGO_URI,{serverSelectionTimeoutMS:10000});await mongo.connect();const db=mongo.db(),redis=new Redis(process.env.CRAWL_REDIS_URL||'redis://127.0.0.1:6379',{maxRetriesPerRequest:2}),out={at:new Date(),operationId,queues:[]};
try{
 const rows=await db.collection('flow_qc_recovery').find({operationId}).toArray();
 for(const name of [...new Set(rows.map(x=>x.queue))]){const group=rows.filter(x=>x.queue===name),q=new Queue(queueName(name),{connection:redis}),ids=new Set(group.map(x=>x._id)),first=Math.min(...group.map(x=>+new Date(x.createdAt))),events=new Map();try{
 for(const[,fields]of await redis.xrange(q.toKey('events'),first+'-0','+')){const e=Object.fromEntries(Array.from({length:fields.length/2},(_,i)=>[fields[i*2],fields[i*2+1]]));if(ids.has(e.jobId)&&['completed','failed'].includes(e.event))events.set(e.jobId,{state:e.event,reason:e.failedReason});}
 const report={name,total:group.length,completed:0,failed:0,pending:0,unknown:0,errors:{}},updates=[];
 for(const row of group){let state,reason;const event=events.get(row._id);if(['completed','failed'].includes(row.observedOutcome)){state=row.observedOutcome;reason=row.observedReason;}else if(event){({state,reason}=event);}else{const job=await q.getJob(row._id);if(job){const current=await job.getState();if(current==='failed'){state='failed';reason=job.failedReason;}else if(current==='completed')state='completed';else state='pending';}else state='unknown';}
 report[state]++;if(state==='failed')report.errors[reason||'UNKNOWN']=(report.errors[reason||'UNKNOWN']||0)+1;
 if(['completed','failed'].includes(state)&&!row.observedOutcome)updates.push({updateOne:{filter:{_id:row._id},update:{$set:{observedOutcome:state,observedReason:reason||null,observedAt:new Date()}}}});
 }
 if(updates.length)await db.collection('flow_qc_recovery').bulkWrite(updates);out.queues.push(report);
 }finally{await q.close();}}
 out.total=rows.length;out.totals=Object.fromEntries(['completed','failed','pending','unknown'].map(k=>[k,out.queues.reduce((n,q)=>n+q[k],0)]));out.finished=rows.length>0&&out.totals.pending===0&&out.totals.unknown===0;await fs.writeFile('/var/lib/crawler-v8/'+operationId+'-status.json',JSON.stringify(out),{mode:0o600});console.log(JSON.stringify(out));
}finally{await redis.quit();await mongo.close();}
