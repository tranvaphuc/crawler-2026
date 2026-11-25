import fs from 'node:fs';import path from 'node:path';import {createRequire} from 'node:module';import {createHash} from 'node:crypto';import {gzipSync} from 'node:zlib';
const require=createRequire('/opt/crawler-v8/current/package.json'),{MongoClient}=require('mongodb'),ES=require('elasticsearch'),base='/opt/crawler-v8/current';
const {serializeCrawlItem,verifyDocumentMapping,createCrawlMappingLoader}=await import('file://'+base+'/src/services/crawlerV8Es5.js');
const {commitCrawlDocument,postTargetUpdate}=await import('file://'+base+'/src/services/crawlerPostHandoff.js');
const {createEs5BulkWriter}=await import('file://'+base+'/src/services/crawlerEs5Bulk.js');
const {applyFlowCounterDefaults}=await import('file://'+base+'/src/services/crawlerQueueFlow.js');
const {bindFacebookUserPost}=await import('file://'+base+'/src/services/facebookUserPostBinding.js');
const {uidLookupUrl}=await import('file://'+base+'/src/services/facebookFindUid.js');
const {facebookAuthorProfileKey}=await import('file://'+base+'/src/services/facebookAuthorIdentity.js');
const [mode,root,limitArg]=process.argv.slice(2);if(!['preview','run','audit'].includes(mode)||!root?.startsWith('/var/lib/crawler-v8/uid-direct-import-'))throw Error('INVALID_DIRECT_IMPORT_OPERATION');
const manifest=JSON.parse(fs.readFileSync(root+'/proofs.json')),operationId=manifest.operationId;if(path.basename(root)!==operationId||manifest.count!==manifest.entries.length||new Set(manifest.entries.map(e=>e.jobId)).size!==manifest.count)throw Error('INVALID_PROOF_MANIFEST');
const mongo=new MongoClient(process.env.CRAWL_MONGO_URI,{maxPoolSize:4,serverSelectionTimeoutMS:15000,socketTimeoutMS:45000}),es=new ES.Client({apiVersion:'5.6',host:process.env.ES5_HOST,log:[],requestTimeout:45000,maxRetries:0});await mongo.connect();const db=mongo.db(),jobs=db.collection('flow_jobs'),ledger=db.collection('flow_uid_direct_imports'),backups=db.collection('flow_uid_import_retry_backups'),posts=db.collection('flow_posts'),loadMapping=createCrawlMappingLoader({es}),bulk=createEs5BulkWriter({es,maxItems:80,maxConcurrent:2,flushMs:20,checkExisting:false});
const save=(name,data)=>{fs.writeFileSync(root+'/'+name+'.tmp',JSON.stringify(data,null,2),{mode:0o600});fs.renameSync(root+'/'+name+'.tmp',root+'/'+name);};
const fail=code=>{throw Object.assign(Error(code),{code});};const safe=e=>/^[A-Z0-9_]+$/.test(e.code||e.message||'')?e.code||e.message:e.name||'IMPORT_FAILED';
function prepare(row,entry){
 if(!row||row.state!=='failed'||row.queue!=='find-uid')fail('SOURCE_JOB_NOT_FAILED');const data=row.data,url=uidLookupUrl(data.item);
 if(data.source?.platform!=='facebook'||data.item.id!==entry.nativeItemId||!url||facebookAuthorProfileKey(url)!==facebookAuthorProfileKey(entry.url))fail('UID_SOURCE_BINDING_MISMATCH');
 if(!/^[1-9]\d*$/.test(entry.uid||'')||!entry.evidence||/^user_confirmed/.test(entry.evidence)||! /^[a-f0-9]{64}$/.test(entry.responseSha256||''))fail('VERIFIED_RESPONSE_PROOF_REQUIRED');
 let item={...data.item,author:{...data.item.author,id:entry.uid,idEvidence:entry.evidence}},source=data.source;
 if(!data.parent){item=applyFlowCounterDefaults(item);({item,source}=bindFacebookUserPost(item,source));if(source.platform==='facebook'&&source.type!=='group'&&item.author.id!==source.nativeId){const aliases=new Set([source.nativeId,source.identityProof?.profileId].filter(Boolean));if(aliases.has(item.author.profileId||item.author.id))item={...item,author:{...item.author,id:source.nativeId,idEvidence:'verified_source_profile_alias'}};}}
 const doc=serializeCrawlItem(item,source,{parent:data.parent});return {row,entry,data,item,source,doc};
}
async function check(rows){if(!rows.length)return [];const r=await es.mget({realtime:true,body:{docs:rows.map(x=>({_index:x.doc._index,_type:x.doc._type,_id:x.doc._id,_source:['authorId']}))}});if(r.docs.length!==rows.length)fail('ES5_VERIFICATION_INCOMPLETE');return r.docs.map((h,i)=>({jobId:rows[i].entry?.jobId||rows[i].jobId,status:h.found?(String(h._source?.authorId)===String(rows[i].doc._source?.authorId||rows[i].doc.expectedUid)?'verified':'author_mismatch'):'not_found',actualUid:h._source?.authorId||null}));}
try{
 if(mode==='audit'){
  const records=await ledger.find({operationId},{projection:{jobId:1,doc:1,state:1,errorCode:1}}).toArray(),valid=records.filter(r=>r.doc),checks=[];for(let n=0;n<valid.length;n+=200)checks.push(...await check(valid.slice(n,n+200)));const counts={};for(const r of checks)counts[r.status]=(counts[r.status]||0)+1;for(const r of records.filter(r=>!r.doc))counts[r.state]=(counts[r.state]||0)+1;const report={at:new Date(),operationId,expected:manifest.count,ledgerRecords:records.length,counts,records:checks};save('audit.json',report);console.log(JSON.stringify({...report,records:undefined}));
 }else{
  const priorIds=mode==='run'&&limitArg==='new'?new Set((await ledger.find({operationId,state:'verified'},{projection:{jobId:1}}).toArray()).map(r=>r.jobId)):null;const entries=priorIds?manifest.entries.filter(e=>!priorIds.has(e.jobId)):limitArg?manifest.entries.slice(0,Number(limitArg)):manifest.entries,stats={at:new Date(),operationId,mode,requested:entries.length,processed:0,prepared:0,created:0,existing:0,verified:0,held:0,reasons:{},samples:[]},mappings=new Map();
  const hold=(entry,error)=>{const reason=typeof error==='string'?error:safe(error);stats.held++;stats.reasons[reason]=(stats.reasons[reason]||0)+1;if(stats.samples.length<20)stats.samples.push({jobId:entry.jobId,reason});};
  for(let offset=0;offset<entries.length;offset+=100){const batch=entries.slice(offset,offset+100),rows=await jobs.find({_id:{$in:batch.map(e=>e.jobId)}}).toArray(),byJob=new Map(rows.map(r=>[r._id,r])),ready=[];
   for(const entry of batch){try{const x=prepare(byJob.get(entry.jobId),entry),key=x.doc._index+':'+x.doc._type;let mapping;
    if(mode==='preview'){if(!mappings.has(x.doc._index))mappings.set(x.doc._index,await es.indices.getMapping({index:x.doc._index}));mapping=mappings.get(x.doc._index)[x.doc._index]?.mappings?.[x.doc._type];}else mapping=await loadMapping(x.doc);
    verifyDocumentMapping(x.doc,mapping);for(const [field,value] of Object.entries(x.doc._source)){const type=mapping.properties[field]?.type;if(value!=null&&['text','string','keyword'].includes(type)&&typeof value!=='string')fail('ES5_TEXT_INVALID');}ready.push(x);stats.prepared++;
   }catch(e){hold(entry,e);}}
   if(mode==='preview'){const checks=await check(ready);for(const r of checks)if(r.status==='verified')stats.existing++;else if(r.status==='not_found')stats.created++;else hold({jobId:r.jobId},'EXISTING_AUTHOR_MISMATCH');}
   else if(ready.length){
    await backups.bulkWrite(ready.map(x=>{const originalGzip=gzipSync(JSON.stringify({mongo:x.row,queueNotModified:true}));return {updateOne:{filter:{_id:operationId+':'+x.entry.jobId},update:{$setOnInsert:{operationId,jobId:x.entry.jobId,originalGzip,sha256:createHash('sha256').update(originalGzip).digest('hex'),createdAt:new Date(),purpose:'verified_uid_direct_es5_import'}},upsert:true}};}),{ordered:false});
    await ledger.bulkWrite(ready.map(x=>({updateOne:{filter:{_id:operationId+':'+x.entry.jobId},update:{$setOnInsert:{operationId,jobId:x.entry.jobId,uid:x.entry.uid,evidence:x.entry.evidence,responseSha256:x.entry.responseSha256,profileUrl:x.entry.url,doc:{_index:x.doc._index,_type:x.doc._type,_id:x.doc._id,expectedUid:x.doc._source.authorId},state:'prepared',preparedAt:new Date()}},upsert:true}})),{ordered:false});
    const committed=[];await Promise.all(ready.map(async x=>{try{const receipt=await commitCrawlDocument({doc:x.doc,item:x.item,source:x.source,parent:x.data.parent,sourceRoundId:x.data.sourceRoundId,write:d=>bulk.write(d),upsertTarget:target=>posts.updateOne({_id:target.key},postTargetUpdate(target),{upsert:target.allowCreate})});if(receipt.skipped)stats.existing++;else stats.created++;committed.push(x);}catch(e){hold(x.entry,e);await ledger.updateOne({_id:operationId+':'+x.entry.jobId},{$set:{state:'import_failed',errorCode:safe(e),lastAttemptAt:new Date()}});}}));
    const verified=await check(committed);for(const r of verified){if(r.status==='verified')stats.verified++;else hold({jobId:r.jobId},'ES5_'+r.status.toUpperCase());}if(verified.length)await ledger.bulkWrite(verified.map(r=>({updateOne:{filter:{_id:operationId+':'+r.jobId},update:{$set:{state:r.status,verifiedAt:new Date(),actualUid:r.actualUid}}}})),{ordered:false});
   }
   stats.processed+=batch.length;stats.at=new Date();save(mode+'-progress.json',stats);if(stats.processed%1000===0||offset+100>=entries.length)console.log(JSON.stringify(stats));
  }
  save(mode+'-result.json',stats);console.log(JSON.stringify({finished:true,...stats}));
 }
}finally{bulk.flush();es.close();await mongo.close();}
