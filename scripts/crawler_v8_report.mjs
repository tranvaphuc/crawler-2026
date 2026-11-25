import fs from 'node:fs/promises';
import {MongoClient} from 'mongodb';
const client=new MongoClient(process.env.CRAWL_MONGO_URI);await client.connect();
try {
 const db=client.db(),runId=process.env.CRAWL_RUN_ID||'october-2026-v8';
 const group=async(name,match,id)=>db.collection(name).aggregate([{$match:match},{$group:{_id:id,count:{$sum:1}}},{$sort:{count:-1}}]).toArray();
 const run=await db.collection('runs').findOne({_id:runId});if(run){delete run.lockToken;delete run.lockUntil;}
 const report={at:new Date().toISOString(),run,
  sources:await group('sources',{}, {platform:'$platform',type:'$type',eligible:'$eligible'}),
  jobs:await group('jobs',{runId},{platform:'$platform',kind:'$kind',state:'$state'}),
  documents:await group('documents',{runId},{platform:'$platform',kind:'$kind',state:'$state'}),
  errors:await group('jobs',{runId,lastReason:{$ne:null}},'$lastReason'),
  quarantine:await group('quarantine',{runId},{platform:'$raw.platform',reason:'$reason'}),
  identities:await group('sources',{platform:'facebook',type:{$in:['page','user']}},{type:'$type',status:{$ifNull:['$identityStatus','unverified']}}),
  commentPolicy:{
   skippedZero:await db.collection('jobs').countDocuments({runId,kind:'comments',state:'skipped',lastReason:'POST_COMMENTS_ZERO'}),
   positiveReads:await db.collection('jobs').countDocuments({runId,kind:'comments',commentPolicy:'positive_count_only_v2',commentReadStartedAt:{$exists:true},lastVerifiedCommentCount:{$gt:0}}),
   invalidReads:await db.collection('jobs').countDocuments({runId,kind:'comments',commentPolicy:'positive_count_only_v2',commentReadStartedAt:{$exists:true},$or:[{lastVerifiedCommentCount:{$lte:0}},{lastVerifiedCommentCount:null}]}),
  },
  latestPostUpdated:await db.collection('sources').countDocuments({latestPostAt:{$type:'string'}}),
  completedSourcePasses:await db.collection('sources').countDocuments({lastSourcePassAt:{$type:'date'}}),
  workerProgress:await db.collection('jobs').aggregate([{$match:{runId}},{$group:{_id:'$kind',pages:{$sum:'$pages'},staged:{$sum:'$total'},unknownDates:{$sum:'$unknownDates'},excluded:{$sum:'$excluded'}}}]).toArray()
 };
 const file=(process.env.CRAWL_DATA_DIR||'/var/lib/crawler-v8')+'/monitor-latest.json';await fs.writeFile(file,JSON.stringify(report,null,2),{mode:0o600});console.log(JSON.stringify(report));
} finally {await client.close();}
