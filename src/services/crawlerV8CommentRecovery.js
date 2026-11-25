import {ownParentReady} from './crawlerV8IndependentIngest.js';
import {serializeCrawlItem,verifyDocumentMapping} from './crawlerV8Es5.js';
import {facebookAuthorProfileKey,facebookPublicAuthorProfileUrl} from './facebookAuthorIdentity.js';
import {recordText,sameDate,verifyStoredComment} from './crawlerV8RecordIdentity.js';
import {normalizeFacebookPostInput} from './facebookShare.js';
import {planCommentRepair,applyCommentRepair,nativeCommentAuthorProof} from './crawlerV8CommentRepair.js';
import {isEstimatedYoutubeComment,inspectYoutubeExisting,adoptYoutubeExisting,canonicalYoutubeDateFields} from './youtubeExistingComment.js';

export function verifyRecoveryParent(parent,hits){
 const e=parent?.document;if(!e||!['indexed','existing'].includes(parent.state))return false;
 const hs=hits.filter(h=>h._type===e._type&&h._id===e._id);if(hs.length!==1)return false;
 const a=hs[0]._source,s=e._source;if(!a||a.siteId!==s.siteId||!sameDate(a.publishedDate,s.publishedDate))return false;
 // Parent linkage uses its native post ID, owning source and publication date.
 // An edited caption/display name/legacy permalink does not change that post.
 // This does not approve or overwrite those independent post fields.
 return e._type==='youtubeTopic'?e._id===e.nativeId:e._id===`${s.siteId}_${e.nativeId}`;
}

// One primary-owned ES5 recovery path. Profile workers may publish facts and
// stage candidates; only the primary deduplicates, repairs and commits ES5.
export async function recoverCommentData({db,es,runId,context,jobs,sources,quarantine,documents,hits,canWrite,limit=20,independent=false}){
 const out={staged:0,repairs:0,adopted:0,held:{},needsNativeProof:[],nativeAuthorTargets:{},unavailableAuthorJobs:[]};const hold=r=>out.held[r]=(out.held[r]||0)+1;
 const byJob=new Map(jobs.map(j=>[j._id,j])),authors=[...quarantine.map(q=>q.raw?.author),...[...documents.values()].map(d=>d.raw?.author)],profileKeys=[...new Set(authors.map(a=>facebookAuthorProfileKey(facebookPublicAuthorProfileUrl(a))).filter(Boolean))],facts=new Map((profileKeys.length?await db.collection('facebook_profile_author_identities').find({_id:{$in:profileKeys},state:'verified'}).toArray():[]).map(f=>[f._id,f])),opaqueKeys=[...new Set(authors.map(a=>a?.opaqueId).filter(x=>typeof x==='string'&&/^pfbid[A-Za-z0-9]+$/.test(x)))],responseFacts=new Map((opaqueKeys.length?await db.collection('facebook_author_identities').find({_id:{$in:opaqueKeys}}).toArray():[]).map(f=>[f._id,f]));
 const mappings=new Map();
 const nativeKeys=[...documents.keys(),...quarantine.map(q=>{const j=byJob.get(q.jobId),s=sources.get(q.sourceId);return j?.platform==='facebook'&&s&&q.raw?.id?({page:'fbPageComment',group:'fbGroupComment',user:'fbUserComment'}[s.type])+':'+j.parent.nativeId+'_'+q.raw.id:null;}).filter(Boolean)],proofs=new Map((await db.collection('comment_native_proofs').find({_id:{$in:nativeKeys},observedAt:{$gte:new Date(Date.now()-900000)}}).toArray()).map(p=>[p._id,p]));
 const commentFactIds=[...new Set([...quarantine.map(q=>{const j=byJob.get(q.jobId);return j?.platform==='facebook'&&q.raw?.id?j.parent.nativeId+'_'+q.raw.id:null;}),...[...documents.values()].filter(d=>d.platform==='facebook'&&d.kind==='comment').map(d=>d.document._id)].filter(Boolean))],commentFacts=new Map((commentFactIds.length?await db.collection('facebook_comment_author_identities').find({_id:{$in:commentFactIds}}).toArray():[]).map(f=>[f._id,f]));
 for(const q of quarantine){
  if(q.resolvedAt||q.existingIdReceipt||q.reason!=='FACEBOOK_COMMENT_AUTHOR_ID_UNVERIFIED')continue;
  const j=byJob.get(q.jobId),s=sources.get(q.sourceId),parent=documents.get(j?.parent?.documentKey),profileFact=facts.get(facebookAuthorProfileKey(facebookPublicAuthorProfileUrl(q.raw?.author))),responseFact=responseFacts.get(q.raw?.author?.opaqueId),trustedResponseFact=responseFact&&/^(?:response\.|numeric_author_|public_profile\.)/.test(responseFact.evidence||'')&&/^[1-9]\d*$/.test(responseFact.nativeId||''),exactFact=commentFacts.get(j?.parent?.nativeId+'_'+q.raw?.id),validExact=exactFact?.evidence==='verified_es5_same_native_comment'&&sameDate(exactFact.publishedDate,q.raw?.createdAt),nativeKey=({page:'fbPageComment',group:'fbGroupComment',user:'fbUserComment'}[s?.type])+':'+j?.parent?.nativeId+'_'+q.raw?.id,proof=proofs.get(nativeKey),nativeAuthor=nativeCommentAuthorProof(proof,{raw:q.raw,sourceId:q.sourceId,rootNativeId:j?.parent.nativeId}),fact=profileFact||(validExact?exactFact:null)||(nativeAuthor?{nativeId:proof.item.author.id,evidence:proof.item.author.idEvidence||'response.refetched_native_comment.author.id'}:null)||(trustedResponseFact?responseFact:null);
  if(!j||!s||s.canonicalSourceId||!(j.lastVerifiedCommentCount>0)||!(independent?ownParentReady(j,parent,s,context):verifyRecoveryParent(parent,hits))){hold('RECOVERY_PARENT_OR_SOURCE_UNVERIFIED');continue;}
  if(s.type!=='group'&&(s.identityStatus!=='verified'||s.identityProof?.nativeId!==s.nativeId||s.identityProof?.type!==s.type)){hold('RECOVERY_SOURCE_IDENTITY_UNVERIFIED');continue;}
  if(profileFact&&validExact&&profileFact.nativeId!==exactFact.nativeId||trustedResponseFact&&profileFact&&responseFact.nativeId!==profileFact.nativeId||trustedResponseFact&&validExact&&responseFact.nativeId!==exactFact.nativeId){hold('RECOVERY_AUTHOR_FACT_CONFLICT');continue;}
  if(nativeAuthor&&fact&&fact.nativeId!==proof.item.author.id){hold('RECOVERY_AUTHOR_FACT_CONFLICT');continue;}
  if(!fact||!/^\d+$/.test(fact.nativeId)||!validExact&&!nativeAuthor&&!trustedResponseFact&&!String(fact.evidence||'').startsWith('public_profile.')){hold(proof?'RECOVERY_NATIVE_AUTHOR_METADATA_CONFLICT':'RECOVERY_AUTHOR_FACT_UNAVAILABLE');if(!j.nativeVerificationAttempts)(out.nativeAuthorTargets[j._id]||=[]).push(nativeKey);else if(!proof&&j.nativeVerificationFinishedAt&&j.nativeVerificationResult?.complete===false)out.unavailableAuthorJobs.push(j._id);continue;}
  try{
   const raw={...q.raw,author:{...q.raw.author,...(nativeAuthor?proof.item.author:{}),id:fact.nativeId,idEvidence:fact.evidence}},d=serializeCrawlItem(raw,s,{parent:j.parent,since:j.windowSince||context.since,until:j.windowUntil||context.until}),key=d._type+':'+d._id,old=documents.get(key);
   if(!mappings.has(d._index))mappings.set(d._index,(await es.indices.getMapping({index:d._index}))[d._index].mappings);
   verifyDocumentMapping(d,mappings.get(d._index)[d._type]);
   if(old&&(old.sourceId!==s._id||old.document._source.parentId!==d._source.parentId||!sameDate(old.document._source.publishedDate,d._source.publishedDate)||recordText(old.document._source.content)!==recordText(d._source.content)))throw Object.assign(Error(),{code:'RECOVERY_EXISTING_IDENTITY_CONFLICT'});
   if(!await canWrite())return out;
   if(!old){const record={_id:key,runId,kind:'comment',platform:'facebook',sourceId:s._id,document:d,raw,state:'pending',createdAt:new Date(),nextAt:new Date(),...(j.recentParent?{windowSince:j.windowSince,windowUntil:j.windowUntil}:{})};await db.collection('documents').updateOne({_id:key},{$setOnInsert:record},{upsert:true});documents.set(key,record);out.staged++;}
   else if(old.state==='held_author_identity'&&!/^\d+$/.test(old.document._source.authorId||'')){await db.collection('documents').updateOne({_id:key,state:old.state,document:old.document},{$set:{'document._source.authorId':fact.nativeId,'raw.author':raw.author,state:'pending',nextAt:new Date(),...(j.recentParent?{windowSince:j.windowSince,windowUntil:j.windowUntil}:{})},$unset:{error:''}});old.document._source.authorId=fact.nativeId;old.raw.author=raw.author;old.state='pending';out.staged++;}
   const recovery={authorRecoveryDocumentKey:key,authorRecoveryEvidence:fact.evidence,authorRecoveryStagedAt:new Date(),...(nativeAuthor?{authorRecoveryNativeProofKey:key}:{})};await db.collection('quarantine').updateOne({_id:q._id,resolvedAt:{$exists:false}},{$set:recovery});Object.assign(q,recovery);
  }catch(e){hold(e.code||'RECOVERY_STAGE_FAILED');}
 }
 if(independent)return out;
 let attempts=0;
 for(const d of documents.values()){
  if(d.kind!=='comment'||!['indexed','existing','conflict'].includes(d.state))continue;
  const j=jobs.find(j=>j.sourceId===d.sourceId&&(j.parent.systemId===d.document._source.parentId||(j.commentReadManifest||[]).some(([,r])=>r.contextProof?.canonicalParentSystemId===d.document._source.parentId))),parent=documents.get(d.platform==='threads'&&j?.parent.systemId!==d.document._source.parentId?'threadsTopic:'+d.document._source.parentId:j?.parent?.documentKey),s=sources.get(d.sourceId);
  if(!verifyRecoveryParent(parent,hits)){hold('RECOVERY_PARENT_UNVERIFIED');continue;}
  const hs=hits.filter(h=>h._type===d.document._type&&h._id===d.document._id),fact=facts.get(facebookAuthorProfileKey(facebookPublicAuthorProfileUrl(d.raw?.author)));
  if(d.state!=='conflict'&&verifyStoredComment(d,hs).pass)continue;
  if(isEstimatedYoutubeComment(d)&&inspectYoutubeExisting(d,hs).ready&&(d.state==='conflict'||!verifyStoredComment(d,hs).pass)&&await canWrite()){
   const adopted=adoptYoutubeExisting(d,hs[0]);await db.collection('documents').updateOne({_id:d._id,state:d.state,document:d.document},{$set:adopted,$unset:{error:''}});await db.collection('youtube_comment_date_estimates').updateOne({_id:d.document.nativeId,videoId:parent.document.nativeId},{$set:canonicalYoutubeDateFields({...d,...adopted})});documents.set(d._id,{...d,...adopted});out.adopted++;continue;
  }
  const plan=planCommentRepair(d,hs,{parent,source:s,authorFact:fact,commentAuthorFact:commentFacts.get(d.document._id),nativeProof:proofs.get(d._id)});
  if(!plan.ready){hold(plan.reason);if(['COMMENT_REPAIR_NATIVE_CONTENT_DATE_CONFLICT','COMMENT_REPAIR_AUTHOR_PROOF_REQUIRED'].includes(plan.reason))out.needsNativeProof.push(d._id);continue;}
  if(!Object.keys(plan.patch).length&&d.state!=='conflict'&&JSON.stringify(d.document)===JSON.stringify(plan.candidate.document))continue;
  if(attempts++>=limit)break;
  try{const r=await applyCommentRepair({db,es,d,plan,canWrite});if(r.applied){documents.set(d._id,r.candidate);out[r.esWritten?'repairs':'adopted']++;const index=hits.findIndex(h=>h._type===d.document._type&&h._id===d.document._id);if(index>=0)hits[index]={...plan.hit,_source:r.candidate.document._source,_index:r.candidate.document._index};}}
  catch(e){hold(e.status===409?'RECOVERY_VERSION_CHANGED':e.code||'RECOVERY_REPAIR_FAILED');}
 }
 return out;
}
