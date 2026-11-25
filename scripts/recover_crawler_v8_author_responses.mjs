import {ownParentReady} from '../src/services/crawlerV8IndependentIngest.js';
// Stages only identities proven by stored numeric responses or the authorized public-profile resolver.
// This script makes no Facebook requests and never edits historical indexed authors.
import fs from 'node:fs/promises';import {MongoClient} from 'mongodb';import ES from 'elasticsearch';
import {facebookAuthorProfileKey,facebookPublicAuthorProfileUrl} from '../src/services/facebookAuthorIdentity.js';
import {serializeCrawlItem,verifyDocumentMapping} from '../src/services/crawlerV8Es5.js';
const c=new MongoClient(process.env.CRAWL_MONGO_URI);await c.connect();const es=new ES.Client({apiVersion:'5.6',host:process.env.ES5_HOST,log:[],requestTimeout:45000,maxRetries:0});
try{
 const db=c.db(),runId=process.env.CRAWL_RUN_ID||'october-2026-v8',run=await db.collection('runs').findOne({_id:runId}),dir=process.env.CRAWL_DATA_DIR||'/var/lib/crawler-v8',profiles=new Map(),commentMappings=new Map();
 for await(const x of db.collection('documents').find({runId,platform:'facebook',kind:'comment','raw.author.id':/^\d+$/},{projection:{'raw.author':1,'document._id':1,'document._source.authorId':1,'document._source.publishedDate':1,createdAt:1}})){
  const a=x.raw.author,key=facebookAuthorProfileKey(facebookPublicAuthorProfileUrl(a));if(a.id!==x.document._source.authorId)continue;
  if(/^\d+_\d+$/.test(x.document._id)&&Number.isFinite(Date.parse(x.document._source.publishedDate)))commentMappings.set('facebook-comment:'+x.document._id,{id:a.id,publishedDate:x.document._source.publishedDate,evidence:String(a.idEvidence||'').startsWith('verified_es5_same_native_comment')?'verified_es5_same_native_comment':'verified_numeric_comment_response'});
  if(!key||String(a.idEvidence||'').startsWith('verified_es5_same_native_comment'))continue;
  const row=profiles.get(key)||{ids:new Set(),proofs:new Map(),evidence:new Map()};row.ids.add(a.id);row.proofs.set(a.id,x._id);row.evidence.set(a.id,String(a.idEvidence||'').startsWith('public_profile.')?a.idEvidence:'verified_numeric_comment_response.profile_url');profiles.set(key,row);
 }
 for await(const fact of db.collection('facebook_profile_author_identities').find({state:'verified',nativeId:/^\d+$/})){const row=profiles.get(fact._id)||{ids:new Set(),proofs:new Map(),evidence:new Map()};row.ids.add(fact.nativeId);row.proofs.set(fact.nativeId,fact._id);row.evidence.set(fact.nativeId,fact.evidence);profiles.set(fact._id,row);}
 for await(const fact of db.collection('facebook_comment_author_identities').find({nativeId:/^\d+$/}))if(/^\d+_\d+$/.test(fact._id))commentMappings.set('facebook-comment:'+fact._id,{id:fact.nativeId,publishedDate:fact.publishedDate,evidence:'verified_es5_same_native_comment'});
 const facts=await db.collection('facebook_author_identities').find({nativeId:/^\d+$/}).toArray(),mappings=Object.fromEntries([...commentMappings,...facts.filter(x=>!String(x.evidence||'').startsWith('verified_es5_same_native_comment')).map(x=>[x._id,{id:x.nativeId,evidence:x.evidence}])]);
 for(const [key,row]of profiles)if(row.ids.size===1)mappings[key]={id:[...row.ids][0],evidence:row.evidence.get([...row.ids][0])};
 let matched=0,staged=0,updatedHeld=0;const skipped={},live=new Map();const evidence=JSON.parse(await fs.readFile(dir+'/es5-live.json'));
 for await(const q of db.collection('quarantine').find({runId,reason:'FACEBOOK_COMMENT_AUTHOR_ID_UNVERIFIED',resolvedAt:{$exists:false}})){
  const key=facebookAuthorProfileKey(facebookPublicAuthorProfileUrl(q.raw?.author)),row=profiles.get(key);if(row?.ids.size!==1)continue;matched++;
  try{
   const id=[...row.ids][0],authorEvidence=row.evidence.get(id),source=await db.collection('sources').findOne({_id:q.sourceId}),job=await db.collection('jobs').findOne({_id:q.jobId});
   if(!source||source.canonicalSourceId)throw Error('SOURCE_ALIAS_RECLASSIFIED');
   if(['page','user'].includes(source.type)&&(source.identityStatus!=='verified'||source.identityProof?.nativeId!==source.nativeId||source.identityProof?.type!==source.type))throw Error('SOURCE_IDENTITY_UNVERIFIED');
   if(job?.kind!=='comments'||!Number.isSafeInteger(job.lastVerifiedCommentCount)||job.lastVerifiedCommentCount<=0)throw Error('COMMENT_POLICY_UNVERIFIED');
   const parent=await db.collection('documents').findOne({_id:job.parent.documentKey});if(!ownParentReady(job,parent,source,run))throw Error('OWN_PARENT_FIELDS_INVALID');
   const opaque=q.raw.author.opaqueId;if(opaque){const old=await db.collection('facebook_author_identities').findOne({_id:opaque});if(old&&old.nativeId!==id)throw Error('AUTHOR_IDENTITY_CONFLICT');}
   const raw={...q.raw,author:{...q.raw.author,id,idEvidence:authorEvidence}};const d=serializeCrawlItem(raw,source,{parent:job.parent,since:run.since,until:run.until});
   verifyDocumentMapping(d,evidence.mappings[d._type]);if(!live.has(d._index))live.set(d._index,(await es.indices.getMapping({index:d._index}))[d._index].mappings);verifyDocumentMapping(d,live.get(d._index)[d._type]);
   const documentKey=d._type+':'+d._id,old=await db.collection('documents').findOne({_id:documentKey});
   if(old&&(old.document._source.publishedDate!==d._source.publishedDate||old.document._source.siteId!==d._source.siteId||old.document._source.parentId!==d._source.parentId))throw Error('DOCUMENT_IDENTITY_CONFLICT');
   const authorStageNeeded=false;
   if(['held_author_identity','held_own_fields'].includes(old?.state)||old?.state==='pending'&&!/^\d+$/.test(old.document._source.authorId||'')){
    await db.collection('documents').updateOne({_id:documentKey,state:old.state},{$set:{'document._source.authorId':id,'raw.author.id':id,'raw.author.idEvidence':raw.author.idEvidence,authorIdentityStatus:'verified',authorIdentityRepairedAt:new Date(),authorRecoveryResumedHeldAt:new Date(),state:'pending',nextAt:new Date()},$unset:{error:''}});updatedHeld++;
   }else if(!old){await db.collection('documents').updateOne({_id:documentKey},{$setOnInsert:{runId,kind:'comment',platform:'facebook',sourceId:source._id,document:d,raw,state:'pending',createdAt:new Date(),nextAt:new Date(),recoveredAuthorQuarantineId:q._id}},{upsert:true});staged++;}
   else if(!authorStageNeeded&&!['pending','indexed','existing'].includes(old.state))throw Error('EXISTING_DOCUMENT_HELD_OR_CONFLICT');
   if(opaque){await db.collection('facebook_author_identities').updateOne({_id:opaque},{$setOnInsert:{nativeId:id,evidence:raw.author.idEvidence,profileUrl:raw.author.profileUrl,proofDocumentKey:row.proofs.get(id),createdAt:new Date()}},{upsert:true});mappings[opaque]={id,evidence:raw.author.idEvidence};}
   await db.collection('quarantine').updateOne({_id:q._id},{$set:{authorRecoveryDocumentKey:documentKey,authorRecoveryStagedAt:new Date(),authorRecoveryEvidence:raw.author.idEvidence,authorRecoveryProofDocumentKey:row.proofs.get(id)}});
  }catch(e){const reason=e.code||e.message||e.name;skipped[reason]=(skipped[reason]||0)+1;await db.collection('quarantine').updateOne({_id:q._id},{$set:{authorRecoveryHoldReason:reason,authorRecoveryLastAttemptAt:new Date()}});}
 }
 const bounded=Object.entries(mappings);while(bounded.length>50000){const [oldKey]=bounded.shift();delete mappings[oldKey];}
 const file=process.env.FACEBOOK_AUTHOR_UID_CACHE_FILE||dir+'/facebook-author-uid-cache.json';await fs.writeFile(file+'.tmp',JSON.stringify({updatedAt:new Date().toISOString(),mappings}),{mode:0o640});await fs.chmod(file+'.tmp',0o640);await fs.rename(file+'.tmp',file);
 const report={at:new Date().toISOString(),mode:'stored_response_and_verified_public_profile_identity',unambiguousProfileKeys:[...profiles.values()].filter(x=>x.ids.size===1).length,conflictingProfileKeys:[...profiles.values()].filter(x=>x.ids.size>1).length,cacheEntries:Object.keys(mappings).length,matched,staged,updatedHeld,skipped};await fs.writeFile(dir+'/author-response-recovery.json',JSON.stringify(report,null,2),{mode:0o600});console.log(JSON.stringify(report));
}finally{await c.close();es.close();}
