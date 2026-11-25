import fs from 'node:fs/promises';
import {MongoClient} from 'mongodb';
import ES from 'elasticsearch';
import {serializeCrawlItem,verifyDocumentMapping} from '../src/services/crawlerV8Es5.js';
import {ownParentReady} from '../src/services/crawlerV8IndependentIngest.js';
import {hasVerifiedSourceReceipt} from '../src/services/crawlerV8Policy.js';

const runId=process.env.CRAWL_RUN_ID||'october-2026-v8';
const limitFlag=process.argv.indexOf('--limit'),maxCandidates=limitFlag>=0?Number(process.argv[limitFlag+1]):Infinity;
if(!(maxCandidates>0))throw Error('INVALID_LIMIT');
const client=new MongoClient(process.env.CRAWL_MONGO_URI,{serverSelectionTimeoutMS:10000});
const es=new ES.Client({apiVersion:'5.6',host:process.env.ES5_HOST,log:[],requestTimeout:30000,maxRetries:0});
await client.connect();
try{
 const db=client.db(),run=await db.collection('runs').findOne({_id:runId}),mappings=JSON.parse(await fs.readFile((process.env.CRAWL_DATA_DIR||'/var/lib/crawler-v8')+'/es5-live.json')).mappings;
 const report={at:new Date().toISOString(),policy:'reuse_native_response_actor_id_v1',candidates:0,staged:0,existingOwn:0,held:{}};
 const hold=reason=>report.held[reason]=(report.held[reason]||0)+1;
 const cursor=db.collection('quarantine').aggregate([
  {$match:{runId,reason:'FACEBOOK_COMMENT_AUTHOR_ID_UNVERIFIED',resolvedAt:{$exists:false},'raw.author.opaqueId':{$type:'string'}}},
  {$lookup:{from:'facebook_author_identities',localField:'raw.author.opaqueId',foreignField:'_id',as:'matchedAuthors'}},
  {$match:{'matchedAuthors.0':{$exists:true}}},
 ],{allowDiskUse:true,batchSize:100,maxTimeMS:120000});
 const liveMappings=new Map();
 for await(const q of cursor){
  if(report.candidates>=maxCandidates)break;
  report.candidates++;
  const fact=q.matchedAuthors[0],opaque=q.raw?.author?.opaqueId;
  if(fact?._id!==opaque||!/^pfbid[A-Za-z0-9]+$/.test(opaque)||!/^[1-9]\d*$/.test(fact.nativeId||'')||!/^(?:response\.|numeric_author_|public_profile\.)/.test(fact.evidence||'')){hold('AUTHOR_FACT_UNTRUSTED');continue;}
  const j=await db.collection('jobs').findOne({_id:q.jobId}),s=await db.collection('sources').findOne({_id:q.sourceId});
  if(!j||!s||j.sourceId!==s._id||s.canonicalSourceId||!(j.lastVerifiedCommentCount>0)||s.platform!=='facebook'||s.type!=='group'&&!hasVerifiedSourceReceipt(s)){hold('JOB_OR_SOURCE_UNVERIFIED');continue;}
  const parent=await db.collection('documents').findOne({_id:j.parent?.documentKey});
  if(!ownParentReady(j,parent,s,run)){hold('OWN_PARENT_INVALID');continue;}
  if(q.raw?.author?.id&&/^\d+$/.test(q.raw.author.id)&&q.raw.author.id!==fact.nativeId){hold('EXISTING_NUMERIC_AUTHOR_CONFLICT');continue;}
  const raw={...q.raw,author:{...q.raw.author,id:fact.nativeId,idEvidence:fact.evidence}},window={since:j.windowSince||run.since,until:j.windowUntil||run.until};
  let d;try{
   d=serializeCrawlItem(raw,s,{parent:j.parent,...window});
   verifyDocumentMapping(d,mappings[d._type]);
   if(!liveMappings.has(d._index))liveMappings.set(d._index,(await es.indices.getMapping({index:d._index}))[d._index].mappings);
   verifyDocumentMapping(d,liveMappings.get(d._index)[d._type]);
  }catch(e){hold(e.code||'OWN_MAPPING_INVALID');continue;}
  const key=d._type+':'+d._id,old=await db.collection('documents').findOne({_id:key}),at=new Date();
  if(old){
   if(old.sourceId!==s._id||old.kind!=='comment'||old.document._type!==d._type||old.document._index!==d._index||old.document._id!==d._id||old.document._source.publishedDate!==d._source.publishedDate||old.document._source.parentId!==d._source.parentId||old.document._source.content!==d._source.content){hold('OWN_DOCUMENT_IDENTITY_CONFLICT');continue;}
   if(old.document._source.authorId===fact.nativeId)report.existingOwn++;
   else if(old.state==='held_author_identity'&&!/^\d+$/.test(old.document._source.authorId||'')){
    const r=await db.collection('documents').updateOne({_id:key,state:'held_author_identity','document._source.authorId':old.document._source.authorId},{$set:{document:d,raw,state:'pending',nextAt:at,...(j.recentParent?{windowSince:window.since,windowUntil:window.until}:{})},$unset:{error:''}});
    if(!r.modifiedCount){hold('OWN_DOCUMENT_CHANGED');continue}report.staged++;
   }else{hold('OWN_AUTHOR_CONFLICT');continue;}
  }else{
   const r=await db.collection('documents').updateOne({_id:key},{$setOnInsert:{runId,kind:'comment',platform:'facebook',sourceId:s._id,document:d,raw,state:'pending',createdAt:at,nextAt:at,...(j.recentParent?{windowSince:window.since,windowUntil:window.until}:{})}},{upsert:true});
   if(r.upsertedCount)report.staged++;else report.existingOwn++;
  }
  await db.collection('quarantine').updateOne({_id:q._id,resolvedAt:{$exists:false}},{$set:{authorRecoveryDocumentKey:key,authorRecoveryEvidence:fact.evidence,authorRecoveryStagedAt:at}});
 }
 console.log(JSON.stringify(report));
}finally{await client.close();es.close()}
