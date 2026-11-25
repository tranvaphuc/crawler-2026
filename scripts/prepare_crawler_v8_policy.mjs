import fs from 'node:fs/promises';import {MongoClient} from 'mongodb';
import {exactPostCommentCount,commentCountDecision} from '../src/services/crawlerV8Policy.js';
const c=new MongoClient(process.env.CRAWL_MONGO_URI);await c.connect();
try{
 const db=c.db(),runId=process.env.CRAWL_RUN_ID||'october-2026-v8',migrationId=runId+':identity-comment-v2';
 const prior=await db.collection('policy_migrations').findOne({_id:migrationId});if(prior?.applied){console.log(JSON.stringify({alreadyPrepared:true,report:prior.report}));process.exitCode=0;}else{
  const at=prior?.startedAt||new Date();await db.collection('policy_migrations').updateOne({_id:migrationId},{$setOnInsert:{startedAt:at}},{upsert:true});
  const profiles={platform:'facebook',type:{$in:['page','user']},eligible:true};await db.collection('sources').updateMany(profiles,{$set:{identityStatus:'pending',identityPolicy:'live_profile_identity_v2'}});
  const held=await db.collection('documents').updateMany({runId,'document._type':{$regex:'^fb(Page|User)'},state:'pending'},{$set:{state:'held_identity',error:'SOURCE_IDENTITY_VERIFICATION_REQUIRED'}});
  await db.collection('jobs').updateMany({runId,state:'running'},{$set:{state:'retry',nextAt:new Date(),lastReason:'STOPPED_FOR_POLICY_V2'},$unset:{leaseToken:'',leasedUntil:''}});
  const profilesReset=await db.collection('jobs').updateMany({runId,kind:'source',sourceId:{$regex:'^facebook:(page|user):'},state:{$ne:'redirected'}},[{$set:{prePolicyState:'$state',prePolicyReason:'$lastReason',state:'pending',priority:0,nextAt:new Date(),lastReason:'IDENTITY_POLICY_RECHECK',policyMigration:migrationId}}]);
  // A new user-authorized cutoff requires another pass of sources already read.
  await db.collection('jobs').updateMany({runId,kind:'source',platform:{$ne:'facebook'},state:{$in:['partial','done']}},{$set:{state:'pending',nextAt:new Date(),lastReason:'NEW_AUTHORIZED_CUTOFF'}});
  await db.collection('jobs').updateMany({runId,kind:'source',sourceId:{$regex:'^facebook:group:'},state:{$in:['partial','done']}},{$set:{state:'pending',nextAt:new Date(),lastReason:'NEW_AUTHORIZED_CUTOFF'}});
  let skippedZero=0,positive=0,unknown=0,parentHeld=0;
  for await(const j of db.collection('jobs').find({runId,kind:'comments'})){
   const p=await db.collection('documents').findOne({_id:j.parent.documentKey},{projection:{raw:1,state:1}}),count=exactPostCommentCount(p?.raw),decision=commentCountDecision(count);
   const unavailable=!p||['conflict','rejected','held_identity_review'].includes(p.state),state=decision==='skip'?'skipped':unavailable?'blocked':'pending';
   if(decision==='skip')skippedZero++;else if(unavailable)parentHeld++;else if(decision==='fetch')positive++;else unknown++;
   await db.collection('jobs').updateOne({_id:j._id},{$set:{prePolicyState:j.state,prePolicyReason:j.lastReason,'parent.commentCount':count,state,priority:decision==='fetch'?-1:2,nextAt:new Date(),lastReason:decision==='skip'?'POST_COMMENTS_ZERO':unavailable?'PARENT_POST_NOT_COMMITTED':null,commentPolicy:'positive_count_only_v2',policyMigration:migrationId},$unset:{leaseToken:'',leasedUntil:''}});
  }
  const report={at:new Date().toISOString(),profileSourceJobsReset:profilesReset.modifiedCount,pendingDocumentsHeld:held.modifiedCount,skippedZero,positive,unknown,parentHeld};
  await db.collection('runs').updateOne({_id:runId},{$set:{status:'paused_for_policy_validation',policyVersion:'identity-comment-v2',policyMigrationAt:at},$unset:{lockToken:'',lockUntil:''}});
  await db.collection('policy_migrations').updateOne({_id:migrationId},{$set:{applied:true,finishedAt:new Date(),report}});
  await fs.writeFile((process.env.CRAWL_DATA_DIR||'/var/lib/crawler-v8')+'/policy-v2-preparation.json',JSON.stringify(report,null,2),{mode:0o600});console.log(JSON.stringify(report));
 }
}finally{await c.close();}
