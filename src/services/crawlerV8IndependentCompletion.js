import {INDEPENDENT_INGEST_POLICY,existingNativeIds,nativeDocumentKey} from './crawlerV8IndependentIngest.js';
import {recoverCommentData} from './crawlerV8CommentRecovery.js';
import {canRestoreSourceReceipt,hasVerifiedSourceReceipt} from './crawlerV8Policy.js';

export async function acceptExistingQuarantineIds({db,es,runId,indices,canWrite,limit=500}){
 const qs=await db.collection('quarantine').find({runId,resolvedAt:{$exists:false}}).sort({independentPresenceCheckedAt:1}).limit(limit).toArray();if(!qs.length)return{checked:0,existing:0};
 const jobs=new Map((await db.collection('jobs').find({_id:{$in:[...new Set(qs.map(q=>q.jobId))]}},{projection:{_id:1,sourceId:1,kind:1,'parent.nativeId':1,'parent.systemId':1,'parent.url':1}}).toArray()).map(j=>[j._id,j])),sources=new Map((await db.collection('sources').find({_id:{$in:[...new Set(qs.map(q=>q.sourceId))]}},{projection:{_id:1,platform:1,type:1,nativeId:1}}).toArray()).map(s=>[s._id,s])),identities=new Map();
 for(const q of qs){const j=jobs.get(q.jobId),s=sources.get(q.sourceId);if(!j||!s||j.sourceId!==q.sourceId)continue;const id=nativeDocumentKey(q.raw,s,j.kind==='comments'?j.parent:null);if(id)identities.set(q._id,id);}
 const found=identities.size?await existingNativeIds(es,[...identities.values()],indices):new Map(),at=new Date(),ops=[];let accepted=0;
 for(const q of qs){const id=identities.get(q._id),hits=id&&found.get(id.key),set={independentPresenceCheckedAt:at};if(hits){accepted++;Object.assign(set,{resolvedAt:at,resolution:'EXISTING_NATIVE_ID_ACCEPTED_NO_FOREIGN_FIELD_CHECK',existingIdReceipt:{policy:INDEPENDENT_INGEST_POLICY,key:id.key,indices:hits,at}});}ops.push({updateOne:{filter:{_id:q._id,resolvedAt:{$exists:false}},update:{$set:set}}});}
 if(await canWrite())await db.collection('quarantine').bulkWrite(ops,{ordered:false});return{checked:qs.length,existing:accepted};
}

export async function reconcileIndependentComments({db,es,runId,context,indices,canWrite,shouldStop=()=>false,limit=60}){
 const collection=db.collection('jobs'),jobs=await collection.find({runId,kind:'comments',readComplete:true,$or:[{state:{$in:['waiting_commit','waiting_data']}},{state:'done',sinkState:'pending'},{state:{$in:['pending','retry']},recoveryAction:{$exists:true}}]}).sort({independentCheckedAt:1}).limit(limit).toArray();
 if(!jobs.length)return{checked:0,done:0};
 const sources=new Map((await db.collection('sources').find({_id:{$in:[...new Set(jobs.map(j=>j.sourceId))]}}).toArray()).map(s=>[s._id,s])),qs=await db.collection('quarantine').find({runId,jobId:{$in:jobs.map(j=>j._id)}}).toArray(),qm=new Map(qs.map(q=>[q._id,q])),parentKeys=jobs.map(j=>j.parent?.documentKey),keys=[...new Set([...parentKeys,...jobs.flatMap(j=>(j.commentReadManifest||[]).flatMap(([,r])=>[r.documentKey,qm.get(r.quarantineKey)?.authorRecoveryDocumentKey]))].filter(Boolean))],documents=new Map((await db.collection('documents').find({_id:{$in:keys}}).toArray()).map(d=>[d._id,d]));
 for(const s of sources.values())if(canRestoreSourceReceipt(s)&&await canWrite()){const r=await db.collection('sources').updateOne({_id:s._id,identityStatus:'unverified',identityProof:s.identityProof},{$set:{identityStatus:'verified',identityRestoredFromProofAt:new Date()}});if(r.modifiedCount)s.identityStatus='verified';}
 const identities=[];for(const q of qs){if(q.resolvedAt||q.existingIdReceipt)continue;const j=jobs.find(j=>j._id===q.jobId),s=sources.get(q.sourceId),identity=nativeDocumentKey(q.raw,s,j?.parent);if(identity){q.independentKey=identity;identities.push(identity);}}
 const existing=identities.length?await existingNativeIds(es,identities,indices):new Map(),at=new Date(),qOps=[];
 for(const q of qs){const id=q.independentKey,found=id&&existing.get(id.key);if(found){q.existingIdReceipt={policy:INDEPENDENT_INGEST_POLICY,key:id.key,indices:found,at};q.resolvedAt=at;qOps.push({updateOne:{filter:{_id:q._id,resolvedAt:{$exists:false}},update:{$set:{existingIdReceipt:q.existingIdReceipt,resolvedAt:at,resolution:'EXISTING_NATIVE_ID_ACCEPTED_NO_FOREIGN_FIELD_CHECK'}}}});}}
 if(shouldStop()||!await canWrite())return{checked:jobs.length,done:0};if(qOps.length)await db.collection('quarantine').bulkWrite(qOps,{ordered:false});
 const recovery=await recoverCommentData({db,es,runId,context,jobs,sources,quarantine:qs,documents,hits:[],canWrite,independent:true});
 const updates=[],out={checked:jobs.length,done:0,existingReferences:qOps.length,recovery};
 for(const j of jobs){let pending=0,held=0,accepted=0;const manifest=j.commentReadManifest||[];
  for(const [,row]of manifest){if(row.excluded)continue;const q=qm.get(row.quarantineKey);if(q?.existingIdReceipt){accepted++;continue;}const d=documents.get(row.documentKey||q?.authorRecoveryDocumentKey);if(!d){held++;continue;}if(['indexed','existing','excluded'].includes(d.state))accepted++;else if(d.state==='pending')pending++;else held++;}
  const s=sources.get(j.sourceId);if(!s||s.canonicalSourceId||s.platform==='facebook'&&s.type!=='group'&&!hasVerifiedSourceReceipt(s))held++;
  const complete=j.coverage?.exhausted===true&&j.commentReadPagination?.hasMore===false,allAccepted=complete&&pending===0&&held===0&&manifest.length===j.coverage.observedUnique;
  if(allAccepted)out.done++;
  updates.push({updateOne:{filter:{_id:j._id,state:j.state,readComplete:true},update:{$set:{state:'done',collectionComplete:complete,coverageComplete:complete,nativeCoverageComplete:j.coverage?.complete===true,collectionScope:'returned_public_rows',backfillComplete:allAccepted,sinkState:allAccepted?'accepted':'pending',sinkPending:pending,ownFieldsHeld:held,acceptedDocuments:accepted,ingestPolicy:INDEPENDENT_INGEST_POLICY,lastReason:held?'OWN_REQUIRED_FIELDS_MISSING':pending?'OWN_DOCUMENTS_QUEUED':null,independentCheckedAt:at,finishedAt:j.finishedAt||at},$unset:{recoveryAction:'',completionNextAt:'',publicStopPolicy:'',processingComplete:'',publicCoverageComplete:''}}}});
 }
 if(!shouldStop()&&await canWrite())await collection.bulkWrite(updates,{ordered:false});return out;
}
