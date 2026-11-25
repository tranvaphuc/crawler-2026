import {MongoClient} from 'mongodb';
import {CONTINUOUS_FLOW_POLICY} from '../src/services/crawlerV8ContinuousFlow.js';

const apply=process.argv.includes('--apply'),runId=process.env.CRAWL_RUN_ID||'october-2026-v8';
const c=new MongoClient(process.env.CRAWL_MONGO_URI,{serverSelectionTimeoutMS:10000});await c.connect();
try{
 const db=c.db(),jobs=db.collection('jobs'),priorityFilter={runId,state:{$in:['pending','retry','partial','running']},priority:{$ne:1}},recent=await jobs.find({runId,kind:'comments',recentParent:true,watchState:{$exists:false}},{projection:{_id:1,state:1,createdAt:1,parent:1,lastVerifiedCommentCount:1}}).toArray(),ids=[...new Set(recent.map(j=>j.parent?.systemId).filter(Boolean))];
 const dates=new Map();
 if(ids.length)for(const row of await db.collection('documents').aggregate([{$match:{runId,kind:'comment',windowSince:{$exists:true},state:{$in:['indexed','existing']},'document._source.parentId':{$in:ids}}},{$group:{_id:'$document._source.parentId',latest:{$max:'$document._source.publishedDate'}}}]).toArray())dates.set(row._id,row.latest);
 const summary={at:new Date().toISOString(),policy:CONTINUOUS_FLOW_POLICY,mode:apply?'apply':'dry_run',priorityJobs:await jobs.countDocuments(priorityFilter),recentWatchJobs:recent.length,latestCommentDates:dates.size};
 if(apply){
  const p=await jobs.updateMany(priorityFilter,{$set:{priority:1}});summary.prioritiesNormalized=p.modifiedCount;
  const zero=await jobs.updateMany({runId,kind:'comments',recentParent:true,state:'skipped',lastReason:'POST_COMMENTS_ZERO','parent.commentCount':0,watchState:'active'},{$set:{watchState:'zero'}});summary.zeroCountWatchesRemoved=zero.modifiedCount;
  let watches=0;for(let n=0;n<recent.length;n+=500){const at=new Date(),part=recent.slice(n,n+500),ops=part.map(j=>({updateOne:{filter:{_id:j._id,watchState:{$exists:false}},update:{$set:{watchState:j.state==='skipped'&&j.parent?.commentCount===0?'zero':'active',maxObservedCommentCount:Math.max(Number.isSafeInteger(j.lastVerifiedCommentCount)?j.lastVerifiedCommentCount:0,Number.isSafeInteger(j.parent?.commentCount)?j.parent.commentCount:0),lastCountIncreaseAt:j.createdAt||at,...(dates.get(j.parent?.systemId)?{lastCommentPublishedAt:dates.get(j.parent.systemId)}:{})}}}}));if(ops.length){const r=await jobs.bulkWrite(ops,{ordered:false});watches+=r.modifiedCount;}}
  summary.watchesInitialized=watches;
  await db.collection('runs').updateOne({_id:runId},{$set:{flowMigrationPolicy:CONTINUOUS_FLOW_POLICY,flowMigrationAt:new Date()}});
 }
 console.log(JSON.stringify(summary));
}finally{await c.close()}
