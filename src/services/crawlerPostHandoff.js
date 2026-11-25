import {serializeCrawlItem} from './crawlerV8Es5.js';
import {nativeDocumentKey} from './crawlerV8IndependentIngest.js';
export const POST_FIRST_COUNTER_PLATFORMS=Object.freeze(['youtube']);
export const POST_COMMENT_WINDOW_MS=72*3600000;
export function isPostOutsideCommentWindow(parent,now=Date.now()){
 const published=Date.parse(parent?.createdAt);
 return Number.isFinite(published)&&published<now-POST_COMMENT_WINDOW_MS;
}
// Recheck before every native read, including retries and reply continuations.
export async function readPostCommentPage(data,read,now=Date.now()){
 if(['comments','reply'].includes(data.kind)&&isPostOutsideCommentWindow(data.parent,now))return{good:false,result:{status:'unavailable',reason:'POST_OUTSIDE_COMMENT_WINDOW'}};
 return read();
}
const fail=code=>{throw Object.assign(Error(code),{code});};
// Build only from the same canonical native input validated by normal ES ingest.
export function postCommentTarget({doc,item,source,sourceRoundId}){
 const native=serializeCrawlItem(item,source),identity=nativeDocumentKey(item,source);
 if(!identity||identity.key!==doc._type+':'+doc._id||['_index','_type','_id'].some(k=>native[k]!==doc[k]))fail('POST_TARGET_DOCUMENT_MISMATCH');
 for(const k of ['siteId','authorId','publishedDate','url','comments'])if(native._source[k]!==doc._source[k])fail('POST_TARGET_DOCUMENT_MISMATCH');
 // A flow fallback is an import/scheduling hint, not a native source counter.
 const sourceCounterDefaulted=source.platform==='youtube'&&item.counterDefaults?.commentDefaulted===true&&native._source.comments===1;
 const count=sourceCounterDefaulted?null:native._source.comments;
 if(count===null&&!POST_FIRST_COUNTER_PLATFORMS.includes(source.platform))return null;
 return {key:identity.key,allowCreate:count!==0,fields:{platform:source.platform,...(source.platform==='youtube'?{sourceCounterDefaulted}:{}),sourceId:source._id,source,parent:{nativeId:source.platform==='facebook'?item.postId:item.id,systemId:identity.id,url:native._source.url,createdAt:native._source.publishedDate,publication:{evidence:item.dateEvidence||null,precision:item.datePrecision||null,isEstimated:item.dateIsEstimated===true},text:native._source.content||'',sourceId:source._id,documentKey:identity.key,commentCount:count,...(sourceRoundId?{sourceRoundId}:{})},commentEligible:count!==0}};
}
export async function commitCrawlDocument({doc,item,source,parent=null,sourceRoundId,write,upsertTarget,now=Date.now}){
 const target=parent?null:postCommentTarget({doc,item,source,sourceRoundId});
 const result=await write(doc);
 // A create conflict proves existence, not that this payload was written.
 // Finish without publishing new parent metadata or an ES acknowledgement.
 if(result?.skipped===true){
  if(result.reason!=='ES5_DOCUMENT_EXISTS'||result.status!==409||result.error?.type!=='version_conflict_engine_exception'||result._index!==doc._index||result._type!==doc._type||result._id!==doc._id)fail('ES5_IMPORT_UNCONFIRMED');
  return{index:doc._index,type:doc._type,id:doc._id,skipped:true,reason:'ES5_DOCUMENT_EXISTS'};
 }
 const acknowledged=['created','updated'].includes(result?.result)||result?.created===true||Number.isSafeInteger(result?._version)&&result._version>0;
 if(!acknowledged||result?._id!==undefined&&result._id!==doc._id)fail('ES5_IMPORT_UNCONFIRMED');
 // A source row/UID handoff is insufficient: parent publication waits for ES ack.
 if(target){
  const expired=isPostOutsideCommentWindow(target.fields.parent,now());
  target.fields.commentWindowExpired=expired;
  if(expired){target.allowCreate=false;target.fields.commentEligible=false;}
  target.fields.esPostProof={index:doc._index,type:doc._type,id:doc._id,version:Number.isSafeInteger(result._version)?result._version:null,writeResult:result.result||'acknowledged',confirmedAt:new Date()};await upsertTarget(target);
 }
 return {index:doc._index,type:doc._type,id:doc._id};
}
export function completedNativeCounter(result,parent,platform){
 if(!['youtube','instagram','threads'].includes(platform)||result?.identityVerified!==true||result.nativePostId!==parent?.nativeId||result.coverage?.complete!==true)return null;
 const count=result.coverage.expectedPublicCount;
 return Number.isSafeInteger(count)&&count>=0&&count<=2147483647?count:null;
}

// Unknown source observations must not erase a counter already verified by a native comment read.
export function postTargetUpdate(target,at=new Date()){
 const {parent,commentEligible,...fields}=target.fields;
 const set={...fields,updatedAt:at,sourceCounterKnown:parent.commentCount!==null,sourceCounterObservedAt:at},insert={lastInteractionAt:new Date(parent.createdAt),createdAt:at,lastScheduledAt:new Date(0),initialCommentCount:parent.commentCount};
 for(const [key,value] of Object.entries(parent))if(key!=='commentCount')set['parent.'+key]=value;
 if(parent.commentCount===null){insert['parent.commentCount']=null;if(fields.commentWindowExpired)set.commentEligible=false;else insert.commentEligible=true;}
 else{set['parent.commentCount']=parent.commentCount;set.commentEligible=commentEligible;}
 return {$set:set,$setOnInsert:insert};
}

export const COMMENT_RESCAN_MIN_MS=60000;
// Scheduling eligibility only: workers never sleep while a parent is between checks.
export function commentCandidateFilter(platform,now=Date.now()){
 return {platform,lastInteractionAt:{$gte:new Date(now-48*3600000)},$and:[
  {$or:[{'parent.commentCount':{$ne:0}},...(platform==='youtube'?[{sourceCounterKnown:false,$nor:[{
   sourceCounterDefaulted:true,'parent.commentCount':0,'lastNativeCommentRead.complete':true,'lastNativeCommentRead.expectedPublicCount':0,
   'lastNativeCommentRead.observedAt':{$type:'date'},sourceCounterObservedAt:{$type:'date'},
   $expr:{$and:[{$eq:['$lastNativeCommentRead.nativeRootId','$parent.nativeId']},{$lte:['$sourceCounterObservedAt','$lastNativeCommentRead.observedAt']},{$lte:['$lastNativeCommentRead.observedAt',new Date(now)]}]}
  }]}]:[])]},
  {$or:[{$expr:{$lte:[{$ifNull:['$lastSuccessfulCommentJobAt',{$ifNull:['$lastNativeCommentRead.observedAt',new Date(0)]}]},new Date(now-COMMENT_RESCAN_MIN_MS)]}},
   {sourceCounterKnown:true,'parent.commentCount':{$gt:0},$expr:{$ne:['$parent.commentCount',{$ifNull:['$lastNativeCommentRead.expectedPublicCount',{$ifNull:['$lastSuccessfulCommentCount',null]}]}]}}]},
  {$or:[{'parent.createdAt':{$type:'string',$gte:new Date(now-POST_COMMENT_WINDOW_MS).toISOString()}},{'parent.createdAt':{$type:'date',$gte:new Date(now-POST_COMMENT_WINDOW_MS)}}]}
 ]};
}
// One successful ticket may be a continuation page, not full thread completion.
export function successfulCommentJobUpdate(job,kind,at=new Date()){
 const p=job.data?.parent;if(!['comments','reply'].includes(kind)||!p?.documentKey||!p.systemId||!p.nativeId)return null;
 return {filter:{_id:p.documentKey,platform:job.data.source.platform,'parent.systemId':p.systemId,'parent.nativeId':p.nativeId},update:{$set:{lastSuccessfulCommentJobAt:at,lastSuccessfulCommentJobId:job.id,lastSuccessfulCommentCount:Number.isSafeInteger(p.commentCount)?p.commentCount:null}}};
}
