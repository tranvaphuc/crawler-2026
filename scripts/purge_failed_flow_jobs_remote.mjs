// Explicit operator cleanup: archive a fixed snapshot before removing failed
// tickets. Failed jobs created after cutoff stay visible for fresh monitoring.
import fs from 'node:fs';import fsp from 'node:fs/promises';import path from 'node:path';import {createRequire} from 'node:module';import {createGzip} from 'node:zlib';import {pipeline} from 'node:stream/promises';import {once} from 'node:events';
const dir=process.argv[2];if(!dir||!path.isAbsolute(dir)||process.argv[3]!=='--execute')throw Error('Use <absolute-operation-directory> --execute');
await fsp.mkdir(dir,{recursive:true,mode:0o700});
const require=createRequire('/opt/crawler-v8/current/package.json'),{MongoClient,BSON}=require('mongodb'),Redis=require('ioredis'),{Queue}=require('bullmq');
const {FLOW_QUEUES,queueName}=await import('file:///opt/crawler-v8/current/src/services/crawlerQueueFlow.js');
const mongo=new MongoClient(process.env.CRAWL_MONGO_URI,{maxPoolSize:3,serverSelectionTimeoutMS:10000}),redis=new Redis(process.env.CRAWL_REDIS_URL,{maxRetriesPerRequest:2,commandTimeout:20000});await mongo.connect();const jobs=mongo.db().collection('flow_jobs'),queues=new Map(FLOW_QUEUES.map(q=>[q.name,new Queue(queueName(q.name),{connection:redis})]));
const progressFile=path.join(dir,'progress.json'),manifestFile=path.join(dir,'manifest.json');
async function save(value,file=progressFile){await fsp.writeFile(file+'.tmp',JSON.stringify(value)+'\n',{mode:0o600});await fsp.rename(file+'.tmp',file);}
async function archive(name){const file=path.join(dir,name),stream=createGzip({level:1}),done=pipeline(stream,fs.createWriteStream(file+'.tmp',{mode:0o600}));done.catch(()=>{});return{async write(row){if(!stream.write(BSON.EJSON.stringify(row)+'\n'))await once(stream,'drain');},async close(){stream.end();await done;const handle=await fsp.open(file+'.tmp','r');await handle.sync();await handle.close();await fsp.rename(file+'.tmp',file);}};}
let progress;
try{
 if(fs.existsSync(manifestFile))throw Error('OPERATION_ALREADY_CAPTURED_USE_NEW_DIRECTORY');
 const cutoff=new Date(Date.now()-5000),filter={state:'failed',$or:[{failedAt:{$lte:cutoff}},{failedAt:{$exists:false}}]},manifest={operationId:path.basename(dir),cutoff:cutoff.toISOString(),queues:[],mongoIds:[],archiveComplete:false};
 progress={operationId:manifest.operationId,state:'capturing',cutoff:manifest.cutoff,bullCaptured:0,mongoCaptured:0,bullRemoved:0,mongoRemoved:0};await save(progress);
 const bullArchive=await archive('bull-failed.jsonl.gz');
 for(const spec of FLOW_QUEUES){const q=queues.get(spec.name),ids=await redis.zrangebyscore(q.toKey('failed'),'-inf',+cutoff),entry={name:spec.name,ids};manifest.queues.push(entry);
  for(let start=0;start<ids.length;start+=250){const batch=ids.slice(start,start+250),pipe=redis.pipeline();for(const id of batch)pipe.hgetall(q.toKey(id));const rows=await pipe.exec();for(let i=0;i<batch.length;i++){if(rows[i][0])throw rows[i][0];await bullArchive.write({queue:spec.name,id:batch[i],hash:rows[i][1]});}progress.bullCaptured+=batch.length;if(start%5000===0)await save(progress);}
  console.log('CAPTURED_QUEUE',spec.name,ids.length);
 }
 await bullArchive.close();
 const mongoArchive=await archive('mongo-failed.jsonl.gz');for await(const row of jobs.find(filter).batchSize(500)){await mongoArchive.write(row);manifest.mongoIds.push(row._id);progress.mongoCaptured++;if(progress.mongoCaptured%5000===0)await save(progress);}await mongoArchive.close();
 manifest.archiveComplete=true;await save(manifest,manifestFile);progress.state='removing';await save(progress);console.log('BACKUP_COMPLETE',JSON.stringify({cutoff:manifest.cutoff,bull:progress.bullCaptured,mongo:progress.mongoCaptured}));
 for(const entry of manifest.queues){const q=queues.get(entry.name),captured=new Set(entry.ids);let removed=0;
  for(;;){const ids=await q.clean(Math.max(0,Date.now()-+cutoff),500,'failed');for(const id of ids)if(!captured.has(id))throw Error('UNCAPTURED_TICKET_REMOVED '+entry.name);removed+=ids.length;progress.bullRemoved+=ids.length;await save(progress);if(!ids.length)break;}
  entry.removed=removed;console.log('REMOVED_QUEUE',entry.name,removed);
 }
 for(let start=0;start<manifest.mongoIds.length;start+=500){const result=await jobs.deleteMany({...filter,_id:{$in:manifest.mongoIds.slice(start,start+500)}});progress.mongoRemoved+=result.deletedCount;if(start%5000===0)await save(progress);}
 progress.remainingOldBull={};for(const [name,q]of queues)progress.remainingOldBull[name]=await redis.zcount(q.toKey('failed'),'-inf',+cutoff);progress.remainingOldMongo=await jobs.countDocuments(filter);progress.currentFailed={};for(const[name,q]of queues)progress.currentFailed[name]=await q.getFailedCount();
 progress.state=Object.values(progress.remainingOldBull).some(Boolean)||progress.remainingOldMongo?'incomplete':'complete';progress.finishedAt=new Date().toISOString();await save(progress);await save(manifest,manifestFile);console.log('CLEANUP_RESULT',JSON.stringify(progress));if(progress.state!=='complete')process.exitCode=1;
}catch(error){if(progress){progress.state='error';progress.error=error.code||error.message;await save(progress);}throw error;}
finally{await Promise.all([...queues.values()].map(q=>q.close()));await redis.quit();await mongo.close();}
