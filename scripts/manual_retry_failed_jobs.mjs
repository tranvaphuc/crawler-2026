import fs from 'node:fs/promises';import path from 'node:path';import {createRequire} from 'node:module';import {pathToFileURL} from 'node:url';import {createHash} from 'node:crypto';
export function manualRetryPayload(bullData,mongoRow,operationId,at,reason){
 const data=mongoRow?.state==='failed'?{...bullData}:{...bullData,...mongoRow?.data};
 const retry={...data,proxyRetries:0,lastReadError:null,lastReadNetwork:null,lastReadTransport:null,...(Array.isArray(data.groupProxyEndpoints)||data.groupProxyAttemptLimit===10?{groupProxyEndpoints:[],groupProxyAttemptLimit:10}:{}),manualRetry:{operationId,requestedAt:at,previousFailure:reason||mongoRow?.error||null}};
 delete retry.proxyWaitUntil;delete retry.sourceYieldUntil;return retry;
}
async function eachLimit(items,limit,fn){let offset=0;await Promise.all(Array.from({length:Math.min(limit,items.length)},async()=>{while(offset<items.length){const i=offset++;await fn(items[i],i);}}));}
const prepareLua=`if not redis.call('ZSCORE',KEYS[2],ARGV[1]) then return 0 end
if redis.call('EXISTS',KEYS[1]..':lock')==1 then return -1 end
if redis.call('HGET',KEYS[1],'manualRetryOperationId')==ARGV[2] and redis.call('HGET',KEYS[1],'manualRetryPhase')=='dispatched' then return 2 end
redis.call('HSET',KEYS[1],'data',ARGV[3],'stc','0','manualRetryOperationId',ARGV[2],'manualRetryPhase','prepared')
redis.call('HDEL',KEYS[1],'defa')
return 1`;
const markLua=`if redis.call('EXISTS',KEYS[1])==1 and redis.call('HGET',KEYS[1],'manualRetryOperationId')==ARGV[1] then redis.call('HSET',KEYS[1],'manualRetryPhase','dispatched') return 1 end return 0`;
async function main(){
 const [mode,dir]=process.argv.slice(2);if(!['capture','run','status'].includes(mode)||!dir)throw Error('Use capture|run|status <operation-directory>');await fs.mkdir(dir,{recursive:true,mode:0o700});
 const require=createRequire('/opt/crawler-v8/current/package.json'),{MongoClient}=require('mongodb'),Redis=require('ioredis'),{Queue}=require('bullmq');
 const {FLOW_QUEUES,queueName,FLOW_POLICY,FLOW_RETRY_LIMIT,FLOW_READ_TIMEOUT_MS}=await import('file:///opt/crawler-v8/current/src/services/crawlerQueueFlow.js');
 const operationId=path.basename(dir),manifestFile=path.join(dir,'manifest.json'),progressFile=path.join(dir,'progress.json');
 const mongo=new MongoClient(process.env.CRAWL_MONGO_URI,{serverSelectionTimeoutMS:10000,maxPoolSize:20});await mongo.connect();const db=mongo.db(),jobs=db.collection('flow_jobs'),audit=db.collection('flow_manual_retry_tickets');
 const redis=new Redis(process.env.CRAWL_REDIS_URL||'redis://127.0.0.1:6379',{maxRetriesPerRequest:2,commandTimeout:15000});
 const queues=new Map(FLOW_QUEUES.map(spec=>[spec.name,new Queue(queueName(spec.name),{connection:redis})]));
 const ledgerId=(queue,id)=>createHash('sha256').update(operationId+'|'+queue+'|'+id).digest('hex');
 async function save(progress){progress.updatedAt=new Date().toISOString();await fs.writeFile(progressFile+'.tmp',JSON.stringify(progress,null,2),{mode:0o600});await fs.rename(progressFile+'.tmp',progressFile);}
 try{
  let manifest;try{manifest=JSON.parse(await fs.readFile(manifestFile,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}
  if(mode==='capture'){
   if(!manifest){manifest={operationId,capturedAt:new Date().toISOString(),policy:FLOW_POLICY,timeoutMs:FLOW_READ_TIMEOUT_MS,retryLimit:FLOW_RETRY_LIMIT,queues:[]};
    for(const spec of FLOW_QUEUES){const q=queues.get(spec.name),ids=await redis.zrange(q.toKey('failed'),0,-1);manifest.queues.push({name:spec.name,ids});}
    manifest.snapshotCount=manifest.queues.reduce((sum,q)=>sum+q.ids.length,0);await fs.writeFile(manifestFile,JSON.stringify(manifest),{mode:0o600,flag:'wx'});
   }
   console.log(JSON.stringify({operationId,capturedAt:manifest.capturedAt,policy:manifest.policy,timeoutMs:manifest.timeoutMs,retryLimit:manifest.retryLimit,snapshotCount:manifest.snapshotCount,queues:manifest.queues.map(q=>({name:q.name,failedSnapshot:q.ids.length}))}));return;
  }
  if(!manifest)throw Error('SNAPSHOT_REQUIRED');
  if(mode==='status'){console.log(await fs.readFile(progressFile,'utf8'));return;}
  const progress={operationId,capturedAt:manifest.capturedAt,startedAt:new Date().toISOString(),state:'running',snapshotCount:manifest.snapshotCount,processed:0,retried:0,alreadyDispatched:0,skipped:0,errors:0,queues:[],errorSamples:[]};await save(progress);
  for(const spec of manifest.queues){
   const q=queues.get(spec.name),stats={name:spec.name,snapshot:spec.ids.length,processed:0,retried:0,alreadyDispatched:0,skipped:0,errors:0};progress.queues.push(stats);
   for(let offset=0;offset<spec.ids.length;offset+=250){
    const ids=spec.ids.slice(offset,offset+250),rows=await jobs.find({_id:{$in:ids}}).toArray(),byId=new Map(rows.map(row=>[row._id,row]));
    const ledgers=await audit.find({_id:{$in:ids.map(id=>ledgerId(spec.name,id))}}).toArray(),byLedger=new Map(ledgers.map(row=>[row._id,row]));
    const loaded=await Promise.all(ids.map(async id=>({id,job:await q.getJob(id),row:byId.get(id),ledger:byLedger.get(ledgerId(spec.name,id))})));
    const candidates=[];
    for(const item of loaded){
     if(item.ledger?.state==='retried'||item.ledger?.state==='already_dispatched'){stats.alreadyDispatched++;continue;}
     if(!item.job){stats.skipped++;continue;}
     const state=await item.job.getState();
     if(item.ledger&&item.job.data.manualRetry?.operationId===operationId&&(state!=='failed'||(item.job.processedOn||0)>=+new Date(item.ledger.preparedAt))){stats.alreadyDispatched++;await audit.updateOne({_id:item.ledger._id},{$set:{state:'already_dispatched',confirmedAt:new Date()}});continue;}
     if(state!=='failed'){stats.skipped++;continue;}
     item.at=new Date();item.data=manualRetryPayload(item.job.data,item.row,operationId,item.at.toISOString(),item.job.failedReason);candidates.push(item);
    }
    if(candidates.length){
     await audit.bulkWrite(candidates.map(item=>({updateOne:{filter:{_id:ledgerId(spec.name,item.id)},update:{$setOnInsert:{operationId,queue:spec.name,jobId:item.id,state:'prepared',preparedAt:item.at,original:{bullFailedReason:item.job.failedReason,bullFinishedOn:item.job.finishedOn,stalledCounter:item.job.stalledCounter,deferredFailure:item.job.deferredFailure,attemptsMade:item.job.attemptsMade,attemptsStarted:item.job.attemptsStarted,proxyRetries:item.job.data.proxyRetries||0,mongoState:item.row?.state,mongoError:item.row?.error,mongoFailedAt:item.row?.failedAt,sourceRoundId:item.row?.sourceRoundId||item.job.data.sourceRoundId}}},upsert:true}})));
     const pipe=redis.pipeline();for(const item of candidates)pipe.eval(prepareLua,2,q.toKey(item.id),q.toKey('failed'),item.id,operationId,JSON.stringify(item.data));const prepared=await pipe.exec(),ready=[];
     for(let i=0;i<candidates.length;i++){const [error,result]=prepared[i];if(error)throw error;if(result===1)ready.push(candidates[i]);else if(result===2)stats.alreadyDispatched++;else stats.skipped++;}
     if(ready.length)await jobs.bulkWrite(ready.map(item=>({updateOne:{filter:{_id:item.id},update:{$set:{queue:spec.name,entityKey:item.data.entityKey||item.row?.entityKey||'manual:'+item.id,data:item.data,state:'queued',manualRetryOperationId:operationId,manualRetriedAt:item.at,...(item.data.sourceRoundId?{sourceRoundId:item.data.sourceRoundId}:{})},$unset:{error:'',failedAt:''},$setOnInsert:{createdAt:new Date(item.job.timestamp||Date.now())}},upsert:true}})));
     const updates=[];
     await eachLimit(ready,32,async item=>{try{
      await item.job.retry('failed',{resetAttemptsMade:true,resetAttemptsStarted:true});
      await redis.eval(markLua,1,q.toKey(item.id),operationId);stats.retried++;
      updates.push({updateOne:{filter:{_id:ledgerId(spec.name,item.id)},update:{$set:{state:'retried',retriedAt:new Date()}}}});
     }catch(error){stats.errors++;const reason=String(error.message||error).slice(0,240);if(progress.errorSamples.length<20)progress.errorSamples.push({queue:spec.name,id:item.id,reason});updates.push({updateOne:{filter:{_id:ledgerId(spec.name,item.id)},update:{$set:{state:'dispatch_error',error:reason,lastAttemptAt:new Date()}}}});}});
     if(updates.length)await audit.bulkWrite(updates);
    }
    stats.processed+=ids.length;progress.processed=progress.queues.reduce((sum,x)=>sum+x.processed,0);for(const field of ['retried','alreadyDispatched','skipped','errors'])progress[field]=progress.queues.reduce((sum,x)=>sum+x[field],0);await save(progress);
   }
  }
  progress.state=progress.errors?'completed_with_errors':'completed';progress.finishedAt=new Date().toISOString();await save(progress);console.log(JSON.stringify(progress));
 }finally{await Promise.all([...queues.values()].map(q=>q.close()));await redis.quit();await mongo.close();}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href)await main();
