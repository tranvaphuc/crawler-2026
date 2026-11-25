import {verifyThreadContextProof} from './threadCommentContext.js';
import {verifyStoredComment} from './crawlerV8RecordIdentity.js';
const normalized=x=>String(x||'').normalize('NFC').replace(/\r\n/g,'\n').trim();
export function commentReadComplete(result,state){return result?.coverage?.complete===true&&result.coverage.exhausted===true&&result.pagination?.hasMore===false&&!(state?.queue?.length||state?.items?.length);}
export function canRebuildCommentManifest(job,reason){return reason==='COMMENT_MANIFEST_INCOMPLETE'&&job.readComplete===true&&job.coverage?.exhausted===true&&job.commentReadPagination?.hasMore===false&&job.lastVerifiedCommentCount>0&&!(job.manifestRepairAttempts>0);}
export function resolveCommentManifest(job,run,documents,quarantine){
 const manifest=job.commentReadManifest;
 if(job.readComplete!==true||job.coverage?.complete!==true||job.coverage?.exhausted!==true||job.commentReadPagination?.hasMore!==false)return{ready:false,reason:'COMMENT_READ_NOT_COMPLETE'};
 if(!Array.isArray(manifest)||manifest.length!==job.coverage.observedUnique||new Set(manifest.map(([id])=>id)).size!==manifest.length)return{ready:false,reason:'COMMENT_MANIFEST_INCOMPLETE'};
 if(job.lastVerifiedCommentCount>0&&manifest.length===0)return{ready:false,reason:'POSITIVE_COMMENT_COUNT_RETURNED_EMPTY'};
 const required=new Map(),ancestorPosts=new Map(),recoverableQuarantine=[];
 for(const [id,original]of manifest){
  let row=original;const q=row.quarantineKey?quarantine.get(row.quarantineKey):null,recovery=q?.dateRecovery;
  if(job.platform==='youtube'&&q?.reason==='EXACT_PUBLICATION_DATE_REQUIRED'&&q.resolvedAt&&recovery?.policy==='youtube_relative_text_v1'&&['verified','existing','excluded'].includes(recovery.status))row={...row,createdAt:recovery.publishedDate,unknownDate:false,...(recovery.status==='excluded'||recovery.outsideWindow?{excluded:true}:{documentKey:recovery.documentKey})};
  if(row.excluded){const t=Date.parse(row.createdAt);if(!Number.isFinite(t)||!(t<Date.parse(run.since)||t>Date.parse(run.until)))return{ready:false,reason:'COMMENT_EXCLUSION_UNVERIFIED'};continue;}
  const key=row.documentKey||q?.authorRecoveryDocumentKey,d=documents.get(key);
  const proof=d?.existingProof;
  if(job.platform==='youtube'&&d?.state==='existing'&&proof?.policy==='youtube_date_only_existing_v1'&&d.document._id===String(id)&&d.sourceId===job.sourceId&&d.document._source.parentId===job.parent.systemId&&Date.parse(row.createdAt)===Date.parse(proof.estimatedDate)){
   row={...row,createdAt:d.document._source.publishedDate,unknownDate:false};
   if(Date.parse(row.createdAt)<Date.parse(run.since)||Date.parse(row.createdAt)>Date.parse(run.until))continue;
  }
  if(row.unknownDate||!Number.isFinite(Date.parse(row.createdAt)))return{ready:false,reason:'COMMENT_DATE_UNVERIFIED'};
  if(!d||!['indexed','existing'].includes(d.state))return{ready:false,reason:'COMMENT_DOCUMENTS_NOT_COMMITTED'};
  if(d.sourceId!==job.sourceId||Date.parse(d.document._source.publishedDate)!==Date.parse(row.createdAt))return{ready:false,reason:'COMMENT_MANIFEST_IDENTITY_CONFLICT'};
  if(d.document._source.parentId!==job.parent.systemId){const parent=documents.get(row.contextProof?.canonicalParentDocumentKey);if(!verifyThreadContextProof(row.contextProof,job,d,parent))return{ready:false,reason:'COMMENT_MANIFEST_IDENTITY_CONFLICT'};ancestorPosts.set(parent._id,parent);}
  if(q&&!q.resolvedAt){
   const authorRecovered=q.reason==='FACEBOOK_COMMENT_AUTHOR_ID_UNVERIFIED'&&d.platform==='facebook'&&/^[1-9]\d*$/.test(d.document._source.authorId||'')&&Date.parse(q.raw?.createdAt)===Date.parse(row.createdAt)&&String(q.raw?.id)===String(d.document.nativeId)&&normalized(q.raw?.text)===normalized(d.document._source.content)&&(normalized(q.raw?.author?.name)===normalized(d.raw?.author?.name)||q.authorRecoveryNativeProofKey===d._id);
   const contextRecovered=q.reason==='STAGED_COMMENT_CONTEXT_CONFLICT'&&verifyThreadContextProof(row.contextProof,job,d,documents.get(row.contextProof?.canonicalParentDocumentKey));
   if(!authorRecovered&&!contextRecovered)return{ready:false,reason:'COMMENT_QUARANTINE_UNRESOLVED'};
   recoverableQuarantine.push(q._id);
  }
  required.set(key,d);
 }
 for(const q of quarantine.values()){if(q.resolvedAt||recoverableQuarantine.includes(q._id))continue;const receipt=manifest.find(([id])=>id===String(q.raw?.id)),row=receipt?.[1],d=documents.get(row?.documentKey||q.authorRecoveryDocumentKey);
  if(q.reason==='FACEBOOK_COMMENT_AUTHOR_ID_UNVERIFIED'&&d&&Date.parse(q.raw.createdAt)===Date.parse(row.createdAt)&&normalized(q.raw.author?.name)===normalized(d.raw.author?.name))recoverableQuarantine.push(q._id);
  else if(q.reason==='STAGED_COMMENT_CONTEXT_CONFLICT'&&d&&Date.parse(q.raw.createdAt)===Date.parse(row.createdAt)&&q.raw.author?.id===d.document._source.authorId&&verifyThreadContextProof(row.contextProof,job,d,documents.get(row.contextProof?.canonicalParentDocumentKey)))recoverableQuarantine.push(q._id);
  else return{ready:false,reason:'COMMENT_QUARANTINE_UNRESOLVED'};
 }
 return{ready:true,documents:[...required.values()],ancestorPosts:[...ancestorPosts.values()],recoverableQuarantine};
}
export function verifyCommentEsDocuments(documents,hits){
 for(const d of documents){const v=verifyStoredComment(d,hits);if(!v.pass)return v;}
 return{pass:true};
}
