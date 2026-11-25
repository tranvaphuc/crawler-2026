import {commentUrlMatches,numericUid,recordText,sameDate,sameNativeScalar,verifyStoredComment} from './crawlerV8RecordIdentity.js';
import {facebookAuthorProfileKey,facebookPublicAuthorProfileUrl,numericFacebookProfileUrl} from './facebookAuthorIdentity.js';
import {normalizeFacebookPostInput} from './facebookShare.js';
import {canonicalFacebookCommentUrl} from './crawlerV8Es5.js';

export const COMMENT_REPAIR_POLICY='shared_native_comment_repair_v1';
const fail=reason=>({ready:false,reason});
const stable=x=>JSON.stringify(x,(_,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.entries(v).sort(([a],[b])=>a.localeCompare(b))):v);
export function nativeCommentAuthorProof(proof,{raw,sourceId,rootNativeId},now=Date.now()){
 const item=proof?.item,at=Date.parse(proof?.observedAt);
 return proof?.sourceId===sourceId&&proof?.rootNativeId===rootNativeId&&proof?.positiveCommentCount>0&&Number.isFinite(at)&&at<=now+5000&&now-at<=900000&&item?.id===String(raw?.id)&&numericUid(item?.author?.id)&&!/identity_conflict/.test(item?.author?.idEvidence||'')&&sameDate(item?.createdAt,raw?.createdAt)&&recordText(item?.text)===recordText(raw?.text);
}
export function validRepairUrl(e,parent){
 try{const u=new URL(e._source.url);if(u.protocol!=='https:'||u.username||u.password||u.port)return false;
  if(/^fb/.test(e._type))return normalizeFacebookPostInput(u.href).postId===parent.nativeId&&(u.searchParams.get('reply_comment_id')||u.searchParams.get('comment_id'))===e.nativeId;
  if(e._type==='snsComment'){const p=new URL(parent._source.url);return /^(?:www\.)?instagram\.com$/.test(u.hostname)&&u.pathname.replace(/\/$/,'')===p.pathname.replace(/\/$/,'')&&u.hash==='#'+e.nativeId;}
  return e._type==='youtubeComment'&&/^(?:www\.)?youtube\.com$/.test(u.hostname)&&u.searchParams.get('v')===parent.nativeId&&u.searchParams.get('lc')===e.nativeId;
 }catch{return false;}
}
export function planCommentRepair(original,hits,{parent,source,authorFact,commentAuthorFact,nativeProof}={}){
 let d=original;
 if(/^fb(?:Page|Group|User)Comment$/.test(d.document?._type))try{d={...d,document:{...d.document,_source:{...d.document._source,url:canonicalFacebookCommentUrl({systemId:d.document._source.parentId,nativeId:d.document._id.split('_')[0]},d.raw)}}};}catch{return fail('COMMENT_REPAIR_NATIVE_ID_CONFLICT');}
 const native=nativeProof?.item,observed=Date.parse(nativeProof?.observedAt);
 const fresh=nativeProof?.sourceId===d.sourceId&&nativeProof?.documentKey===d._id&&nativeProof?.positiveCommentCount>0&&Number.isFinite(observed)&&observed<=Date.now()+5000&&Date.now()-observed<=900000&&native?.id===d.document.nativeId&&native?.author?.id===d.document._source.authorId&&(native?.type!=='reply'||native.parentId===d.raw?.parentId)&&sameDate(native.createdAt,d.document._source.publishedDate)&&[parent?.document?.nativeId,parent?.document?._id].includes(String(native.postId));
 if(fresh)d={...d,raw:{...d.raw,text:native.text,author:{...d.raw.author,...native.author,idEvidence:native.author.idEvidence||'response.refetched_native_comment.author.id'},nativeObservedAt:nativeProof.observedAt},document:{...d.document,_source:{...d.document._source,content:native.text||''}}};
 const e=d.document,s=e?._source,found=hits.filter(h=>h._type===e?._type&&h._id===e?._id);
 if(found.length!==1)return fail(found.length?'COMMENT_ES5_ID_NOT_UNIQUE':'COMMENT_ES5_NOT_VISIBLE');
 const h=found[0],a=h._source,p=parent?.document;
 if(!a||!s||!d.raw||d.kind!=='comment')return fail('COMMENT_REPAIR_NATIVE_RECORD_REQUIRED');
 if(!source||source.canonicalSourceId||source._id!==d.sourceId)return fail('COMMENT_SOURCE_IDENTITY_UNVERIFIED');
 if(source.platform==='facebook'&&source.type!=='group'&&(source.identityStatus!=='verified'||source.identityProof?.nativeId!==source.nativeId||source.identityProof?.type!==source.type))return fail('COMMENT_SOURCE_IDENTITY_UNVERIFIED');
 if(!parent||!['indexed','existing'].includes(parent.state)||parent.sourceId!==d.sourceId||p?._id!==s.parentId||!sameDate(p._source.publishedDate,s.parentDate))return fail('COMMENT_REPAIR_PARENT_UNVERIFIED');
 if(String(d.raw.id)!==e.nativeId||!sameDate(d.raw.createdAt,s.publishedDate)||!sameDate(a.publishedDate,s.publishedDate)||recordText(d.raw.text)!==recordText(s.content)||!fresh&&recordText(a.content)!==recordText(s.content))return fail('COMMENT_REPAIR_NATIVE_CONTENT_DATE_CONFLICT');
 if(/^fb/.test(e._type)&&e._id!==`${p.nativeId}_${e.nativeId}`||e._type==='snsComment'&&e._id!==`${p.nativeId}_${e.nativeId}`||e._type==='threadsComment'&&e._id!==`${s.authorId}_${e.nativeId}`||e._type==='youtubeComment'&&e._id!==e.nativeId)return fail('COMMENT_REPAIR_NATIVE_ID_CONFLICT');
 const patch={};
 if(fresh&&recordText(a.content)!==recordText(s.content))patch.content=s.content;
 if(a.parentId!==s.parentId){if(!sameNativeScalar(a.parentId,s.parentId)&&!sameNativeScalar(a.parentId,p.nativeId))return fail('COMMENT_REPAIR_PARENT_ID_CONFLICT');patch.parentId=s.parentId;}
 if(s.commentParentId!=null&&a.commentParentId!==s.commentParentId){
  const bound=d.raw.type==='reply'&&d.raw.parentId&&(e._type==='youtubeComment'?d.raw.parentId:`${p.nativeId}_${d.raw.parentId}`)===s.commentParentId;
  if(!bound||a.commentParentId!=null&&!fresh)return fail('COMMENT_REPAIR_REPLY_PARENT_CONFLICT');
  patch.commentParentId=s.commentParentId;
 }
 if(a.siteId!==s.siteId){if(!sameNativeScalar(a.siteId,s.siteId)&&(e._type!=='threadsComment'||!sameNativeScalar(a.siteId,source.nativeId)||s.siteId!==s.authorId))return fail('COMMENT_REPAIR_SITE_ID_CONFLICT');patch.siteId=s.siteId;}
 if(!sameDate(a.parentDate,s.parentDate))patch.parentDate=s.parentDate;
 if(a.authorId!==s.authorId){
  if(sameNativeScalar(a.authorId,s.authorId))patch.authorId=s.authorId;
  else{
  const profileKey=facebookAuthorProfileKey(facebookPublicAuthorProfileUrl(d.raw.author));
  const responseAuthor=d.raw.author?.id===s.authorId&&/^(?:response\.(?!author_identity_conflict)|numeric_author_id|numeric_author_profile_url|verified_numeric_comment_response)/.test(d.raw.author?.idEvidence||'');
  const numericProfile=numericFacebookProfileUrl(facebookPublicAuthorProfileUrl(d.raw.author))===s.authorId;
  const publicAuthor=authorFact?.state==='verified'&&authorFact._id===profileKey&&authorFact.nativeId===s.authorId&&String(authorFact.evidence||'').startsWith('public_profile.');
  const exactCommentAuthor=commentAuthorFact?._id===e._id&&commentAuthorFact.nativeId===s.authorId&&sameDate(commentAuthorFact.publishedDate,s.publishedDate)&&commentAuthorFact.evidence==='verified_es5_same_native_comment';
  if(!/^fb/.test(e._type)||numericUid(String(a.authorId??''))||!numericUid(s.authorId)||!responseAuthor&&!numericProfile&&!publicAuthor&&!exactCommentAuthor||d.raw.author?.id!==s.authorId)return fail('COMMENT_REPAIR_AUTHOR_PROOF_REQUIRED');
  patch.authorId=s.authorId;
  }
 }
 if(/^fb/.test(e._type)&&!numericUid(s.authorId))return fail('COMMENT_REPAIR_AUTHOR_PROOF_REQUIRED');
 if(!commentUrlMatches(e,a.url)){
  // The destination comes from the verified native comment + committed parent,
  // never from a guessed redirect or a display name.
  if(!/^fb/.test(e._type)&&e._type!=='snsComment'&&e._type!=='youtubeComment')return fail('COMMENT_REPAIR_URL_PROOF_REQUIRED');
  if(!validRepairUrl(e,p))return fail('COMMENT_REPAIR_URL_PROOF_REQUIRED');
  patch.url=s.url;
 }
 const canonical={...e,_index:h._index,_source:{...a,...patch}},candidate={...d,document:canonical,state:d.state==='indexed'||d.repairPreviousState==='indexed'&&a.ds?.source===`crawler-v8-${d.platform}-comment`&&a.ds?.ip==='25.10.20.26'?'indexed':'existing'};
 const check=verifyStoredComment(candidate,[{...h,_source:canonical._source}]);if(!check.pass)return fail(check.reason);
 return{ready:true,hit:h,patch,candidate,nativeProof:fresh?nativeProof:null,policy:COMMENT_REPAIR_POLICY};
}

export async function applyCommentRepair({db,es,d,plan,canWrite}){
 if(!plan.ready||!await canWrite())return{applied:false};
 let hit=plan.hit;
 if(Object.keys(plan.patch).length){
  if(!Number.isSafeInteger(hit._version))throw Object.assign(Error(),{code:'COMMENT_REPAIR_VERSION_REQUIRED'});
  await db.collection('comment_record_repairs').updateOne({_id:`${d._id}:${hit._index}:${hit._version}`},{$setOnInsert:{runId:d.runId,documentKey:d._id,policy:COMMENT_REPAIR_POLICY,before:hit,patch:plan.patch,nativeProof:plan.nativeProof,preparedAt:new Date()}},{upsert:true});
  if(!await canWrite())return{applied:false};
  await es.update({index:hit._index,type:hit._type,id:hit._id,version:hit._version,body:{doc:plan.patch}});
  const after=await es.get({index:hit._index,type:hit._type,id:hit._id});
  const expected={...hit._source,...plan.patch};
  if(!after.found||stable(after._source)!==stable(expected))throw Object.assign(Error(),{code:'COMMENT_REPAIR_READBACK_FAILED'});
  const unique=await es.search({index:'master2026*',type:hit._type,ignoreUnavailable:true,size:8,body:{query:{ids:{values:[hit._id]}}}});
  if(unique.timed_out||unique._shards?.failed||unique.hits.total!==1||unique.hits.hits.length!==1||unique.hits.hits[0]._index!==hit._index)throw Object.assign(Error(),{code:'COMMENT_REPAIR_POST_WRITE_NOT_UNIQUE'});
  await db.collection('comment_record_repairs').updateOne({_id:`${d._id}:${hit._index}:${hit._version}`},{$set:{verifiedAt:new Date(),afterVersion:after._version}});
  hit={...hit,_source:after._source,_version:after._version};
 }
 const candidate={...plan.candidate,document:{...plan.candidate.document,_source:hit._source}};
 if(!verifyStoredComment(candidate,[hit]).pass)throw Object.assign(Error(),{code:'COMMENT_REPAIR_VERIFICATION_FAILED'});
 if(!await canWrite())return{applied:false};
 await db.collection('comment_record_adoptions').updateOne({_id:`${d._id}:${hit._index}:${hit._version}`},{$setOnInsert:{runId:d.runId,documentKey:d._id,before:d,policy:COMMENT_REPAIR_POLICY,verifiedAt:new Date(),esIndex:hit._index,esVersion:hit._version}},{upsert:true});
 const result=await db.collection('documents').updateOne({_id:d._id,state:d.state,document:d.document},{$set:{document:candidate.document,raw:candidate.raw,state:candidate.state,recordRepairProof:{policy:COMMENT_REPAIR_POLICY,esIndex:hit._index,esVersion:hit._version,fields:Object.keys(plan.patch),verifiedAt:new Date()},checkedAt:new Date()},$unset:{error:'',repairPreviousState:''}});
 return{applied:result.modifiedCount===1,esWritten:Object.keys(plan.patch).length>0,candidate:{...candidate,recordRepairProof:{policy:COMMENT_REPAIR_POLICY,esVersion:hit._version}}};
}
