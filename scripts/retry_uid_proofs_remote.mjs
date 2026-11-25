import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {gzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
const require=createRequire('/opt/crawler-v8/current/package.json');
const {MongoClient}=require('mongodb'),Redis=require('ioredis'),{Queue}=require('bullmq'),ES=require('elasticsearch');
const base='/opt/crawler-v8/current';
const {queueName,JOB_OPTIONS,flowId,applyFlowCounterDefaults}=await import('file://'+base+'/src/services/crawlerQueueFlow.js');
const {enqueueUidResolvedImport}=await import('file://'+base+'/src/services/uidQueueHandoff.js');
const {uidLookupUrl}=await import('file://'+base+'/src/services/facebookFindUid.js');
const {facebookAuthorProfileKey}=await import('file://'+base+'/src/services/facebookAuthorIdentity.js');
const {serializeCrawlItem}=await import('file://'+base+'/src/services/crawlerV8Es5.js');
const {bindFacebookUserPost}=await import('file://'+base+'/src/services/facebookUserPostBinding.js');
const [mode,root,limitArg]=process.argv.slice(2);
if(!['run','audit'].includes(mode)||!root?.startsWith('/var/lib/crawler-v8/uid-import-retry-'))throw Error('INVALID_OPERATION');
const manifest=JSON.parse(fs.readFileSync(root+'/proofs.json')),operationId=manifest.operationId;
if(path.basename(root)!==operationId||manifest.count!==manifest.entries.length)throw Error('INVALID_MANIFEST');
const m=new MongoClient(process.env.CRAWL_MONGO_URI,{maxPoolSize:8,serverSelectionTimeoutMS:15000,socketTimeoutMS:60000});
const redis=new Redis(process.env.CRAWL_REDIS_URL,{maxRetriesPerRequest:2,commandTimeout:60000});
const uidQueue=new Queue(queueName('find-uid'),{connection:redis}),imports=new Queue(queueName('es5-import'),{connection:redis,defaultJobOptions:JOB_OPTIONS});
await m.connect();const db=m.db(),jobs=db.collection('flow_jobs'),ledger=db.collection('flow_uid_import_retries'),backups=db.collection('flow_uid_import_retry_backups'),repairs=db.collection('flow_import_repairs');
const save=(name,data)=>{const file=root+'/'+name;fs.writeFileSync(file+'.tmp',JSON.stringify(data,null,2),{mode:0o600});fs.renameSync(file+'.tmp',file);};
const auditId=id=>operationId+':'+id;
const each=async(items,concurrency,fn)=>{let cursor=0;await Promise.all(Array.from({length:Math.min(concurrency,items.length)},async()=>{while(cursor<items.length){const index=cursor++;await fn(items[index]);}}));};
function preview(data,proof){
 let item={...data.item,author:{...data.item.author,id:proof.id,idEvidence:proof.evidence}},source=data.source;
 if(!data.parent){item=applyFlowCounterDefaults(item);({item,source}=bindFacebookUserPost(item,source));
  if(source.platform==='facebook'&&source.type!=='group'&&item.author.id!==source.nativeId){const aliases=new Set([source.nativeId,source.identityProof?.profileId].filter(Boolean));if(aliases.has(item.author.profileId||item.author.id))item={...item,author:{...item.author,id:source.nativeId,idEvidence:'verified_source_profile_alias'}};}
 }
 const doc=serializeCrawlItem(item,source,{parent:data.parent});return{_index:doc._index,_type:doc._type,_id:doc._id,expectedUid:doc._source.authorId};
}
async function enqueue(name,data,entityKey,id){
 const payload={...data,mongoJobId:id,entityKey,manualUidRecoveryOperationId:operationId};
 const existing=await imports.getJob(id);
 if(existing){
  if(existing.data.uidLookupJobId!==data.uidLookupJobId||existing.data.item?.author?.id!==data.item.author.id)throw Error('IMPORT_TICKET_IDENTITY_CONFLICT');
  const state=await existing.getState();if(state==='failed'){
   await jobs.updateOne({_id:id},{$set:{state:'queued',manualUidRecoveryOperationId:operationId,manualRetriedAt:new Date()},$unset:{error:'',failedAt:''}});
   await redis.eval("if redis.call('ZSCORE',KEYS[1],ARGV[1]) then redis.call('HSET',KEYS[2],'stc','0');redis.call('HDEL',KEYS[2],'defa');return 1 end return 0",2,imports.toKey('failed'),imports.toKey(id),id);
   await existing.retry('failed',{resetAttemptsMade:true,resetAttemptsStarted:true});
  }
  return id;
 }
 await jobs.updateOne({_id:id},{$setOnInsert:{queue:name,entityKey,data:payload,state:'queued',createdAt:new Date(),manualUidRecoveryOperationId:operationId}},{upsert:true});
 await imports.add(name,payload,{...JOB_OPTIONS,jobId:id});return id;
}
try{
 if(mode==='run'){
  if(await imports.isPaused()||!(await imports.getWorkers()).length)throw Error('IMPORT_WORKER_NOT_READY');
  const wanted=limitArg?manifest.entries.slice(0,Number(limitArg)):manifest.entries;
  const stats={operationId,snapshot:manifest.count,considered:wanted.length,processed:0,handedOff:0,sourceArchived:0,alreadyHandedOff:0,notFailed:0,absent:0,errors:0,errorSamples:[],startedAt:new Date()};
  for(let offset=0;offset<wanted.length;offset+=100){
   const entries=wanted.slice(offset,offset+100),ids=entries.map(e=>e.jobId),rows=await jobs.find({_id:{$in:ids}}).toArray(),byRow=new Map(rows.map(r=>[r._id,r]));
   const old=await ledger.find({_id:{$in:ids.map(auditId)}}).toArray(),byLedger=new Map(old.map(r=>[r.jobId,r]));
   const loaded=await Promise.all(entries.map(async entry=>({entry,job:await uidQueue.getJob(entry.jobId)}))),ready=[];
   for(const {entry,job} of loaded){
    const previous=byLedger.get(entry.jobId);
    if(previous?.state==='handed_off'){stats.alreadyHandedOff++;continue;}
    if(!job&&previous?.state==='import_enqueued'){await ledger.updateOne({_id:auditId(entry.jobId)},{$set:{state:'handed_off',sourceArchived:true,recoveredAfterInterruptionAt:new Date()}});stats.alreadyHandedOff++;continue;}
    if(!job){stats.absent++;await ledger.updateOne({_id:auditId(entry.jobId)},{$setOnInsert:{operationId,jobId:entry.jobId,state:'source_absent',uid:entry.uid,at:new Date()}},{upsert:true});continue;}
    if(await job.getState()!=='failed'){stats.notFailed++;continue;}
    try{
     const url=uidLookupUrl(job.data.item);
     if(facebookAuthorProfileKey(url)!==facebookAuthorProfileKey(entry.url)||!url)throw Error('UID_PROFILE_BINDING_MISMATCH');
     if(!/^[1-9]\d*$/.test(entry.uid)||!entry.evidence||/^user_confirmed/.test(entry.evidence)||!job.data.originalImportJobId||job.data.source?.platform!=='facebook')throw Error('VERIFIED_UID_HANDOFF_REQUIRED');
     const proof={id:entry.uid,evidence:entry.evidence,url},planned=flowId('import-uid-resolved',job.data.originalImportJobId,entry.uid);
     let doc=null,previewError=null;try{doc=preview(job.data,proof);}catch(error){previewError=error.code||error.message;}
     const originalGzip=gzipSync(JSON.stringify({bull:job.toJSON(),mongo:byRow.get(job.id)||null}));if(originalGzip.length>12*1024*1024)throw Error('BACKUP_TOO_LARGE');
     ready.push({entry,job,proof,planned,doc,previewError,originalGzip});
    }catch(error){stats.errors++;if(stats.errorSamples.length<20)stats.errorSamples.push({jobId:entry.jobId,code:error.code||error.message});}
   }
   if(ready.length){
    await backups.bulkWrite(ready.map(x=>({updateOne:{filter:{_id:auditId(x.job.id)},update:{$setOnInsert:{operationId,jobId:x.job.id,createdAt:new Date(),originalGzip:x.originalGzip,sha256:createHash('sha256').update(x.originalGzip).digest('hex')}},upsert:true}})),{ordered:false});
    await ledger.bulkWrite(ready.map(x=>({updateOne:{filter:{_id:auditId(x.job.id)},update:{$setOnInsert:{operationId,jobId:x.job.id,originalImportJobId:x.job.data.originalImportJobId,uid:x.proof.id,evidence:x.proof.evidence,profileUrl:x.proof.url,responseSha256:x.entry.responseSha256,verifiedAt:x.entry.verifiedAt,importJobId:x.planned,doc:x.doc,previewError:x.previewError,preparedAt:new Date(),state:'prepared'}},upsert:true}})),{ordered:false});
    await each(ready,16,async x=>{try{
     if(await x.job.getState()!=='failed'){stats.notFailed++;return;}
     const importJobId=await enqueueUidResolvedImport({enqueue,data:x.job.data,proof:x.proof,lookupJobId:x.job.id});
     if(importJobId!==x.planned)throw Error('IMPORT_ID_MISMATCH');
     await ledger.updateOne({_id:auditId(x.job.id)},{$set:{state:'import_enqueued',enqueuedAt:new Date()}});
     await repairs.updateOne({_id:x.job.data.originalImportJobId},{$set:{platform:'facebook',itemId:x.job.data.item.id,authorId:x.proof.id,evidence:x.proof.evidence,lookupJobId:x.job.id,importJobId,repairedAt:new Date(),manualUidRecoveryOperationId:operationId}},{upsert:true});
     stats.handedOff++;
     let sourceArchived=false;
     if(await x.job.getState()==='failed'){await x.job.remove();await jobs.deleteOne({_id:x.job.id,state:'failed'});sourceArchived=true;stats.sourceArchived++;}
     await ledger.updateOne({_id:auditId(x.job.id)},{$set:{state:'handed_off',sourceArchived,handedOffAt:new Date()}});
    }catch(error){stats.errors++;const code=error.code||error.name||'DISPATCH_ERROR';if(stats.errorSamples.length<20)stats.errorSamples.push({jobId:x.job.id,code});await ledger.updateOne({_id:auditId(x.job.id)},{$set:{state:'dispatch_error',errorCode:code,lastAttemptAt:new Date()}});}});
   }
   stats.processed+=entries.length;stats.updatedAt=new Date();save('dispatch-progress.json',stats);
   if(offset===0||stats.processed%1000===0)console.log(JSON.stringify({phase:'dispatch',...stats,errorSamples:undefined}));
  }
  stats.finishedAt=new Date();stats.importQueueCounts=await imports.getJobCounts('waiting','active','failed','delayed');save('dispatch-result.json',stats);console.log(JSON.stringify({phase:'dispatched',...stats}));
 }else{
  const es=new ES.Client({apiVersion:'5.6',host:process.env.ES5_HOST,log:[],requestTimeout:60000,maxRetries:0});
  try{
   const records=await ledger.find({operationId},{projection:{jobId:1,importJobId:1,uid:1,state:1,doc:1,previewError:1,errorCode:1,sourceArchived:1}}).toArray(),valid=records.filter(r=>r.doc),others=records.filter(r=>!r.doc),importIds=records.map(r=>r.importJobId).filter(Boolean);
   const jobRows=await jobs.find({_id:{$in:importIds}},{projection:{state:1,error:1,errorDetails:1}}).toArray(),byJob=new Map(jobRows.map(r=>[r._id,r]));let cursor=0;
   await Promise.all(Array.from({length:2},async()=>{while(cursor<valid.length){const start=cursor;cursor+=300;const batch=valid.slice(start,start+300),response=await es.mget({body:{docs:batch.map(r=>({_index:r.doc._index,_type:r.doc._type,_id:r.doc._id,_source:['authorId','url','publishedDate']}))}});if(response.docs.length!==batch.length)throw Error('ES5_MGET_INCOMPLETE');
    for(let i=0;i<batch.length;i++){const row=batch[i],hit=response.docs[i],mongoRow=byJob.get(row.importJobId);if(hit.error)throw Error('ES5_READ_'+hit.error.type);row.actualUid=hit._source?.authorId||null;row.importState=mongoRow?.state||null;row.importError=mongoRow?.error||null;row.status=hit.found?(String(hit._source?.authorId)===String(row.doc.expectedUid)?'verified':'author_mismatch'):(mongoRow?.state==='failed'?'import_failed':mongoRow?'pending':'not_found');}
   }}));
   for(const row of others)row.status=row.state==='source_absent'?'source_absent':row.previewError?'preview_error':row.errorCode?'dispatch_error':'unconfirmed';
   const counts={};for(const row of records)counts[row.status]=(counts[row.status]||0)+1;
   const report={operationId,at:new Date(),snapshot:manifest.count,ledgerRecords:records.length,counts,sourceArchived:records.filter(r=>r.sourceArchived).length,importQueuePaused:await imports.isPaused(),importQueueCounts:await imports.getJobCounts('waiting','active','failed','delayed'),records};save('es5-audit.json',report);console.log(JSON.stringify({...report,records:records.filter(r=>r.status!=='verified').slice(0,20)}));
  }finally{es.close();}
 }
}finally{await uidQueue.close();await imports.close();await redis.quit();await m.close();}
