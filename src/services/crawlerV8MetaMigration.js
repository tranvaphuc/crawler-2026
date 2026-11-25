import {decodeBackfillState} from './crawlerV8Backfill.js';
import {META_COMMENT_POLICY} from './metaCommentPagination.js';
export function metaMigrationEligibility(j){
 if(!['threads','instagram'].includes(j.platform)||j.kind!=='comments')return false;
 if(j.metaPaginationMigrationPolicy===META_COMMENT_POLICY||j.commentReaderPolicy===META_COMMENT_POLICY)return false;
 if(['auth_required','security_checkpoint'].includes(j.lastStatus)||/AUTH_REQUIRED|LOGIN_OR_CHECKPOINT|RETRY_LIMIT_EXHAUSTED/.test(j.lastReason||'')||(j.preflightRetryCount||0)>20||(j.failedReadAttempts||0)>=21)return false;
 return j.state==='partial'&&j.readComplete!==true||j.platform==='threads'&&j.state==='waiting_data'&&j.lastReason==='COMMENT_MANIFEST_IDENTITY_CONFLICT';
}
export async function migrateMetaCommentJobs({db,runId,context,completedSourceIds=[],dryRun=true}){
 const jobs=await db.collection('jobs').find({runId,kind:'comments',platform:{$in:['threads','instagram']},state:{$in:['partial','waiting_data']},metaPaginationMigrationPolicy:{$ne:META_COMMENT_POLICY},commentReaderPolicy:{$ne:META_COMMENT_POLICY}}).toArray(),completed=new Set(completedSourceIds),out={at:new Date().toISOString(),policy:META_COMMENT_POLICY,dryRun,assessed:jobs.length,eligible:0,requeued:0,archived:0,legacyBuffersReset:0,genuineCursorsPreserved:0,preferredSources:0,held:{}};
 const held=k=>out.held[k]=(out.held[k]||0)+1;
 for(const j of jobs){if(!metaMigrationEligibility(j))continue;const parent=await db.collection('documents').findOne({_id:j.parent.documentKey});if(!parent||!['indexed','existing'].includes(parent.state)){held('PARENT_NOT_COMMITTED');continue;}
  const cp=await db.collection('read_checkpoints').findOne({_id:j._id});let state;try{state=cp?decodeBackfillState(Buffer.isBuffer(cp.payload)?cp.payload:cp.payload.buffer):null;}catch{held('CHECKPOINT_DECODE_FAILED');continue;}
  if(state&&!['buffer','meta_comments'].includes(state.kind)){held('UNEXPECTED_CHECKPOINT_KIND');continue;}
  if(state?.kind==='buffer'&&(state.nativeCursor||state.queue?.length)){held('LEGACY_BUFFER_HAS_NATIVE_CURSOR');continue;}
  const reset=!state||state.kind==='buffer'||cp.since!==context.since||cp.until!==context.until;out.eligible++;if(completed.has(j.sourceId))out.preferredSources++;if(reset&&state)out.legacyBuffersReset++;if(!reset)out.genuineCursorsPreserved++;if(dryRun)continue;
  const at=new Date(),archiveId=runId+':'+j._id+':'+META_COMMENT_POLICY,before=Object.fromEntries(Object.entries(j).filter(([k])=>!/token|owner/i.test(k)));await db.collection('meta_comment_migration_archives').updateOne({_id:archiveId},{$setOnInsert:{runId,jobId:j._id,sourceId:j.sourceId,policy:META_COMMENT_POLICY,archivedAt:at,before,...(cp?{checkpoint:{sourceId:cp.sourceId,since:cp.since,until:cp.until,payload:cp.payload,updatedAt:cp.updatedAt}}:{})}},{upsert:true});out.archived++;
  const set={state:'retry',readComplete:false,coverageComplete:false,backfillComplete:false,resumePending:1,nextAt:at,priority:completed.has(j.sourceId)?-2:j.priority??-1,lastReason:'NATIVE_META_COMMENT_PAGINATION_RECHECK',metaPaginationMigrationPolicy:META_COMMENT_POLICY,metaMigrationArchiveId:archiveId,...(reset?{pages:0,total:0,rejected:0,unknownDates:0,excluded:0,coverage:null,metaLegacyCheckpointReset:true}:{})},r=await db.collection('jobs').updateOne({_id:j._id,state:j.state,attempts:j.attempts??0,metaPaginationMigrationPolicy:{$ne:META_COMMENT_POLICY}},{$set:set,$max:{historicalRejectedRecords:j.rejected||0,historicalUnknownDates:j.unknownDates||0},...(reset?{$unset:{commentReadManifest:'',commentReadPagination:'',completionNextAt:''}}:{})});if(!r.modifiedCount){held('JOB_CHANGED_DURING_MIGRATION');continue;}out.requeued++;if(reset&&cp)await db.collection('read_checkpoints').deleteOne({_id:cp._id,updatedAt:cp.updatedAt});
 }
 return out;
}
