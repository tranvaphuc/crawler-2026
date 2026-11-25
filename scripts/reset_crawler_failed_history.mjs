import fs from 'node:fs';import fsp from 'node:fs/promises';import path from 'node:path';
import {Readable} from 'node:stream';import {pipeline} from 'node:stream/promises';import {createGzip} from 'node:zlib';import {createHash} from 'node:crypto';
import {readFailureBackup as lines} from '../src/services/crawlerFailureBackup.js';
import {MongoClient,BSON} from 'mongodb';import Redis from 'ioredis';import {Queue} from 'bullmq';import {FLOW_QUEUES,queueName} from '../src/services/crawlerQueueFlow.js';
const [mode,dir]=process.argv.slice(2);if(!['backup','clear-history'].includes(mode)||!dir)throw Error('Use backup|clear-history <operation-dir>');
await fsp.mkdir(dir,{recursive:true,mode:0o700});
const mongo=new MongoClient(process.env.CRAWL_MONGO_URI,{serverSelectionTimeoutMS:10000,maxPoolSize:10});await mongo.connect();const db=mongo.db(),jobs=db.collection('flow_jobs');
const redis=new Redis(process.env.CRAWL_REDIS_URL||'redis://127.0.0.1:6379',{maxRetriesPerRequest:2,commandTimeout:15000});const queues=new Map(FLOW_QUEUES.map(s=>[s.name,new Queue(queueName(s.name),{connection:redis})]));
async function backupFile(name,rows){const file=path.join(dir,name);let count=0;async function* serialize(){for await(const row of rows){count++;yield BSON.EJSON.stringify(row,{relaxed:false})+'\n';}}
 await pipeline(Readable.from(serialize()),createGzip(),fs.createWriteStream(file,{mode:0o600,flags:'wx'}));let verified=0;for await(const row of lines(file)){if(!row._id)throw Error('BACKUP_ID_MISSING');verified++;}if(verified!==count)throw Error('BACKUP_COUNT_MISMATCH');const hash=createHash('sha256');for await(const chunk of fs.createReadStream(file))hash.update(chunk);return{file,count,verified,sha256:hash.digest('hex'),bytes:(await fsp.stat(file)).size};}
try{
 for(const [name,q]of queues)if(await q.getActiveCount())throw Error('ACTIVE_JOBS_REMAIN_'+name);
 if(mode==='backup'){
  async function* bullRows(){for(const [queue,q]of queues){const ids=await redis.zrange(q.toKey('failed'),0,-1);for(const id of ids){const job=await q.getJob(id);if(job)yield{_id:id,queue,job:job.toJSON()};}}}
  const manifest={operationId:path.basename(dir),capturedAt:new Date(),mongo:await backupFile('mongo-failed.ejsonl.gz',jobs.find({state:'failed'}).batchSize(200)),bull:await backupFile('bull-failed.ejsonl.gz',bullRows()),counters:await db.collection('flow_counters').find({}).toArray()};
  await fsp.writeFile(path.join(dir,'backup.json'),JSON.stringify(manifest,null,2),{mode:0o600,flag:'wx'});console.log(JSON.stringify(manifest));
 }else{
  const manifest=JSON.parse(await fsp.readFile(path.join(dir,'backup.json'),'utf8')),progress=JSON.parse(await fsp.readFile(path.join(dir,'progress.json'),'utf8'));
  if(progress.state!=='completed'||progress.errors)throw Error('RETRY_MUST_COMPLETE_BEFORE_CLEARING_HISTORY');
  let examined=0,deleted=0,preserved=0,batch=[];
  async function flush(){if(!batch.length)return;const pipe=redis.pipeline();for(const row of batch){const q=queues.get(row.queue);if(!q)throw Error('UNKNOWN_QUEUE_'+row.queue);pipe.exists(q.toKey(row._id));}const exists=await pipe.exec(),ops=[];
   for(let i=0;i<batch.length;i++){const row=batch[i];if(exists[i][0])throw exists[i][0];examined++;if(exists[i][1]){preserved++;continue;}ops.push({deleteOne:{filter:{_id:row._id,state:'failed',error:row.error??null,...(row.failedAt?{failedAt:row.failedAt}:{failedAt:{$exists:false}})}}});}
   if(ops.length)deleted+=(await jobs.bulkWrite(ops,{ordered:false})).deletedCount;batch=[];}
  for await(const row of lines(manifest.mongo.file)){batch.push(row);if(batch.length>=500)await flush();}await flush();
  const summary={operationId:manifest.operationId,finishedAt:new Date(),examined,deletedHistorical:deleted,preservedExistingTickets:preserved,retried:progress.retried,remainingMongoFailed:await jobs.countDocuments({state:'failed'})};
  await fsp.writeFile(path.join(dir,'history-clear.json'),JSON.stringify(summary,null,2),{mode:0o600,flag:'wx'});console.log(JSON.stringify(summary));
 }
}finally{await Promise.all([...queues.values()].map(q=>q.close()));await redis.quit();await mongo.close();}
