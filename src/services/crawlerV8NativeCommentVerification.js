import {normalizeContentInput} from './socialContent.js';
import {READ_STATE} from './socialReadState.js';
import {disposeReadState} from './socialLeaseState.js';
import {encodeBackfillState,decodeBackfillState} from './crawlerV8Backfill.js';
import {serializeCrawlItem} from './crawlerV8Es5.js';
import {jobWindow} from './crawlerV8Recent3d.js';
import {applyYoutubeCommentDate,stabilizeYoutubeCommentDate} from './youtubeCommentDates.js';

// Runs inside an ordinary comment worker, not a second writer/service. Its
// checkpoint is separate from the completed crawl, which must never be reset.
export async function verifyNativeCommentJob({db,rt,job,source,context,onFailure,canContinue,shouldStop=()=>false,maxPages=50}){
 if(!(job.lastVerifiedCommentCount>0))throw Object.assign(Error(),{code:'NATIVE_VERIFICATION_POSITIVE_COUNT_REQUIRED'});
 const collection=db.collection('comment_native_verification_checkpoints'),saved=await collection.findOne({_id:job._id}),keys=job.nativeVerificationDocumentKeys||[],targets=new Map(keys.map(key=>[key,{_id:key}])),found=new Set(saved?.verifiedKeys||[]);
 for(const d of await db.collection('documents').find({_id:{$in:keys},sourceId:job.sourceId}).toArray())targets.set(d._id,d);
 let state=saved?.payload?decodeBackfillState(Buffer.isBuffer(saved.payload)?saved.payload:saved.payload.buffer):null,pages=saved?.pages||0;
 const persist=async()=>{if(!await canContinue())return false;await collection.updateOne({_id:job._id},{$set:{runId:job.runId,sourceId:job.sourceId,verifiedKeys:[...found],pages,...(state?{payload:encodeBackfillState(state)}:{payload:null}),updatedAt:new Date()}},{upsert:true});return true;};
 try{
  const prepared=await rt.prepareInput({url:job.parent.url,platform:source.platform,sourceType:source.type,limit:100,count:'all',order:'oldest',includeReplies:true},'comments'),target=normalizeContentInput('comments',prepared);
  if(source.platform==='facebook'){
   target.sourceType=source.type;
   if(keys.length===1&&typeof keys[0]==='string'){
    const cid=keys[0].split('_').at(-1);
    if(/^\d+$/.test(cid))target.commentId=cid;
   }
  }
  while(!shouldStop()&&pages<maxPages&&found.size<targets.size){
   if(!await canContinue())return{interrupted:true};
   if(state)target[READ_STATE]=state;else delete target[READ_STATE];
   const result=await rt.readContent(target);state=result[READ_STATE]||null;
   if(!['ok','partial'].includes(result.status)){await persist();await onFailure(result);return{failure:true};}
   pages++;
   if(result.identityVerified===true)for(let item of result.items||[]){
    if(source.platform==='youtube'){applyYoutubeCommentDate(item,state?.dateObservedAt??Date.now());if(item.dateIsEstimated)item=await stabilizeYoutubeCommentDate(db.collection('youtube_comment_date_estimates'),item,job.parent.nativeId);}
    let d;try{d=serializeCrawlItem(item,source,{parent:job.parent,...jobWindow(job,context)});}catch{continue;}
    const key=d._type+':'+d._id,expected=targets.get(key),observedAt=new Date(item.nativeObservedAt||'');
    if(!expected||!Number.isFinite(+observedAt)||Date.now()-observedAt>900000||observedAt-Date.now()>5000)continue;
    if(!await canContinue())return{interrupted:true};
    await db.collection('comment_native_proofs').updateOne({_id:key},{$set:{runId:job.runId,documentKey:key,sourceId:source._id,rootNativeId:job.parent.nativeId,positiveCommentCount:job.lastVerifiedCommentCount,item:{...item,postId:job.parent.nativeId},observedAt}});found.add(key);
   }
   if(!await persist())return{interrupted:true};
   if(result.pagination?.hasMore!==true)break;
  }
  if(shouldStop())return{interrupted:true};
  return{verified:found.size,requested:targets.size,pages,complete:found.size===targets.size};
 }finally{if(state)await disposeReadState(state).catch(()=>{});}
}
