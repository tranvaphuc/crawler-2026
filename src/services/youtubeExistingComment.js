import {createHash} from 'node:crypto';
export const YOUTUBE_EXISTING_POLICY='youtube_date_only_existing_v1';
export const YOUTUBE_PRESERVED_DATE_EVIDENCE='youtube_preserved_es5_date_v1';
export const youtubeContentKey=value=>String(value??'').normalize('NFC').replace(/\s+/gu,' ').trim();
const normalized=value=>String(value??'').normalize('NFC').replace(/\r\n/g,'\n').trim();
const hash=value=>createHash('sha256').update(value).digest('hex');
export function isEstimatedYoutubeComment(d){return d.platform==='youtube'&&d.document?._type==='youtubeComment'&&d.raw?.dateIsEstimated===true&&['youtube_relative_text_v1',YOUTUBE_PRESERVED_DATE_EVIDENCE].includes(d.raw.dateEvidence);}
export function inspectYoutubeExisting(d,hits){
 if(!isEstimatedYoutubeComment(d))return{ready:false,reason:'YOUTUBE_DATE_RELAXATION_NOT_AUTHORIZED'};
 if(hits.length!==1)return{ready:false,reason:hits.length?'YOUTUBE_COMMENT_ID_NOT_UNIQUE':'YOUTUBE_COMMENT_NOT_VISIBLE'};
 const h=hits[0],s=h._source,e=d.document._source,id=d.document._id,video=String(d.raw.postId||e.parentId||'');
 if(h._id!==id||h._type!=='youtubeComment'||!/^master2026\d\d$/.test(h._index)||!s)return{ready:false,reason:'YOUTUBE_NATIVE_ID_TYPE_CONFLICT'};
 if(String(s.siteId)!==String(e.siteId)||s.parentId!==e.parentId||video!==String(e.parentId))return{ready:false,reason:'YOUTUBE_POST_IDENTITY_CONFLICT'};
 if(!e.authorId||s.authorId!==e.authorId)return{ready:false,reason:'YOUTUBE_AUTHOR_IDENTITY_CONFLICT'};
 if(s.commentParentId&&e.commentParentId&&s.commentParentId!==e.commentParentId)return{ready:false,reason:'YOUTUBE_REPLY_PARENT_CONFLICT'};
 try{const u=new URL(s.url);if(u.protocol!=='https:'||!/^(?:www\.|m\.)?youtube\.com$/.test(u.hostname)||u.pathname!=='/watch'||u.searchParams.get('v')!==video||u.searchParams.get('lc')!==id)throw Error();}catch{return{ready:false,reason:'YOUTUBE_COMMENT_URL_CONFLICT'};}
 if(!Number.isFinite(Date.parse(s.publishedDate))||!Number.isFinite(Date.parse(s.parentDate)))return{ready:false,reason:'YOUTUBE_LEGACY_DATE_INVALID'};
 const identity={identityVerified:true,hit:h};
 if(youtubeContentKey(s.content)!==youtubeContentKey(e.content))return{...identity,ready:false,reason:'YOUTUBE_COMMENT_CONTENT_CONFLICT'};
 return{...identity,ready:true,contentComparison:normalized(s.content)===normalized(e.content)?'exact':'whitespace_only',authorDisplayNameDiffers:normalized(s.author)!==normalized(e.author)};
}
export function adoptYoutubeExisting(d,hit){
 const assessment=inspectYoutubeExisting(d,[hit]);if(!assessment.ready)throw Object.assign(Error(assessment.reason),{code:assessment.reason});
 const canonical=structuredClone(hit._source),estimatedDate=d.existingProof?.estimatedDate||d.raw.dateOriginalEstimate||d.document._source.publishedDate;
 return{state:'existing',document:{...d.document,_index:hit._index,_source:canonical},raw:{...d.raw,createdAt:canonical.publishedDate,dateOriginalEstimate:estimatedDate,dateEvidence:YOUTUBE_PRESERVED_DATE_EVIDENCE,dateCanonicalizedFromExisting:true,dateCanonicalProof:YOUTUBE_EXISTING_POLICY},existingIndices:[hit._index],checkedAt:new Date(),existingProof:{policy:YOUTUBE_EXISTING_POLICY,estimatedDate,publishedDate:canonical.publishedDate,index:hit._index,esVersion:hit._version||null,videoId:String(d.raw.postId||canonical.parentId),authorId:canonical.authorId,contentKeyHash:hash(youtubeContentKey(canonical.content)),contentComparison:assessment.contentComparison,authorDisplayNameDiffers:assessment.authorDisplayNameDiffers,verifiedAt:new Date()}};
}
export function canonicalYoutubeDateFields(d){return{canonicalPublishedDate:d.document._source.publishedDate,canonicalIndex:d.document._index,canonicalPolicy:YOUTUBE_EXISTING_POLICY,canonicalVerifiedAt:new Date()};}
const stable=value=>JSON.stringify(value,(_,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.entries(v).sort(([a],[b])=>a.localeCompare(b))):v);
const fail=code=>{throw Object.assign(Error(code),{code});};
export function verifyYoutubeNativeProof(d,proof,now=Date.now()){
 const p=proof?.item,observed=Date.parse(proof?.observedAt),video=String(d.raw.postId||d.document._source.parentId);
 if(proof?.status!=='verified'||!Number.isFinite(observed)||observed>now+5000||now-observed>900000||!Number.isSafeInteger(proof.positiveCommentCount)||proof.positiveCommentCount<=0)fail('FRESH_YOUTUBE_NATIVE_PROOF_REQUIRED');
 if(p?.id!==d.document._id||p.postId!==video||proof.videoId!==video||p.author?.id!==d.document._source.authorId||(p.type==='reply'&&p.parentId!==d.raw.parentId))fail('YOUTUBE_NATIVE_PROOF_IDENTITY_CONFLICT');
 return{...d,raw:{...d.raw,text:p.text,nativeObservedAt:proof.observedAt},document:{...d.document,_source:{...d.document._source,content:p.text}}};
}
export async function repairYoutubeExistingContent(es,d,hit,proof,{backup,now=Date.now()}={}){
 const candidate=verifyYoutubeNativeProof(d,proof,now),assessment=inspectYoutubeExisting(candidate,[hit]);
 if(!assessment.identityVerified)fail(assessment.reason);
 if(assessment.ready)return{hit,esWritten:false,candidate};
 if(assessment.reason!=='YOUTUBE_COMMENT_CONTENT_CONFLICT')fail(assessment.reason);
 if(!Number.isSafeInteger(hit._version)||typeof backup!=='function')fail('YOUTUBE_REPAIR_BACKUP_VERSION_REQUIRED');
 await backup({kind:'content_only',before:structuredClone(hit),nativeProof:proof});
 await es.update({index:hit._index,type:hit._type,id:hit._id,version:hit._version,body:{doc:{content:proof.item.text}}});
 const current=await es.get({index:hit._index,type:hit._type,id:hit._id}),beforeRest={...hit._source},afterRest={...current._source};delete beforeRest.content;delete afterRest.content;
 if(!current.found||current._source.content!==proof.item.text||stable(beforeRest)!==stable(afterRest))fail('YOUTUBE_CONTENT_REPAIR_READBACK_FAILED');
 return{hit:current,esWritten:true,candidate};
}
export async function repairYoutubeDuplicateCopies(es,d,hits,proof,{backup,allowDuplicateRemoval=false,now=Date.now()}={}){
 if(!allowDuplicateRemoval)fail('YOUTUBE_DUPLICATE_REMOVAL_NOT_ENABLED');
 const candidate=verifyYoutubeNativeProof(d,proof,now);
 if(hits.length<2||typeof backup!=='function')fail('YOUTUBE_DUPLICATE_GROUP_NOT_PROVEN');
 for(const h of hits){const result=inspectYoutubeExisting(candidate,[h]);if(!result.identityVerified||!Number.isSafeInteger(h._version))fail(result.reason||'YOUTUBE_DUPLICATE_VERSION_REQUIRED');}
 const sorted=[...hits].sort((a,b)=>Number(youtubeContentKey(b._source.content)===youtubeContentKey(proof.item.text))-Number(youtubeContentKey(a._source.content)===youtubeContentKey(proof.item.text))||(Date.parse(a._source.insertedDate)||Number.MAX_SAFE_INTEGER)-(Date.parse(b._source.insertedDate)||Number.MAX_SAFE_INTEGER)||a._index.localeCompare(b._index));
 let canonical=sorted[0];await backup({kind:'duplicate_group',copies:structuredClone(hits),keptIndex:canonical._index,nativeProof:proof});
 const changed=await repairYoutubeExistingContent(es,candidate,canonical,proof,{backup,now});canonical=changed.hit;
 let removed=0;for(const h of sorted.slice(1)){
  const keep=await es.get({index:canonical._index,type:canonical._type,id:canonical._id});
  if(!keep.found||!inspectYoutubeExisting(candidate,[keep]).ready)fail('YOUTUBE_CANONICAL_COPY_NOT_VERIFIED');
  const other=await es.get({index:h._index,type:h._type,id:h._id});if(!other.found||other._version!==h._version||stable(other._source)!==stable(h._source))fail('YOUTUBE_DUPLICATE_COPY_CHANGED');
  await es.delete({index:h._index,type:h._type,id:h._id,version:h._version});removed++;
 }
 await es.indices.refresh({index:sorted.map(h=>h._index).join(',')});
 const read=await es.search({index:'master2026*',ignoreUnavailable:true,type:canonical._type,size:20,version:true,body:{query:{ids:{values:[canonical._id]}}}});
 if(read.timed_out||read._shards?.failed||read.hits.total!==1||read.hits.hits.length!==1||read.hits.hits[0]._index!==canonical._index||!inspectYoutubeExisting(candidate,read.hits.hits).ready)fail('YOUTUBE_DUPLICATE_REPAIR_READBACK_FAILED');
 return{hit:read.hits.hits[0],candidate,removed,esWritten:changed.esWritten};
}
