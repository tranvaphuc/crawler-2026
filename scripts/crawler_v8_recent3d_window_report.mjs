import fs from 'node:fs/promises';
import {MongoClient} from 'mongodb';
const c=new MongoClient(process.env.CRAWL_MONGO_URI,{serverSelectionTimeoutMS:10000});await c.connect();
try{
 const db=c.db(),runId=process.env.CRAWL_RUN_ID||'october-2026-v8',now=new Date(),twoHours=new Date(+now-7200000),oneHour=new Date(+now-3600000);
 const passes=await db.collection('recent_source_passes').find({runId,policy:'rolling_72h_native_boundary_v1',endedAt:{$gte:twoHours}},{projection:{_id:0,sourceId:1,platform:1,endedAt:1,durationMs:1,collectionComplete:1,pages:1,posts:1}}).toArray();
 const docs=await db.collection('documents').find({runId,windowSince:{$exists:true},$or:[{createdAt:{$gte:twoHours}},{indexedAt:{$gte:twoHours}},{'sinkReceipt.at':{$gte:twoHours}}]},{projection:{_id:0,platform:1,sourceId:1,kind:1,state:1,createdAt:1,indexedAt:1,'sinkReceipt.at':1,'raw.metrics.comment':1}}).toArray();
 const commentJobs=await db.collection('jobs').find({runId,kind:'comments',recentParent:true,createdAt:{$gte:twoHours}},{projection:{_id:0,sourceId:1,platform:1,state:1,createdAt:1}}).toArray();
 const ids=[...new Set([...passes,...docs,...commentJobs].map(x=>x.sourceId))],sources=new Map((await db.collection('sources').find({_id:{$in:ids}},{projection:{_id:1,type:1,platform:1}}).toArray()).map(s=>[String(s._id),s]));
 const pct=(values,p)=>{if(!values.length)return null;values.sort((a,b)=>a-b);return values[Math.floor((values.length-1)*p)]};
 const summarize=(start)=>{
  const grouped=new Map(),channel=(platform,sourceId)=>platform==='facebook'?`facebook_${sources.get(String(sourceId))?.type||'unknown'}`:platform;
  const slot=k=>{if(!grouped.has(k))grouped.set(k,{sourcePasses:0,distinctSources:new Set(),completePasses:0,partialPasses:0,pages:0,observedPosts:0,durations:[],uniquePostsCreated:0,positiveCountPostsCreated:0,newPostsIndexed:0,existingPostsAccepted:0,uniqueCommentsCreated:0,newCommentsIndexed:0,existingCommentsAccepted:0,commentJobsCreated:0});return grouped.get(k)};
  for(const p of passes.filter(x=>x.endedAt>=start)){const s=slot(channel(p.platform,p.sourceId));s.sourcePasses++;s.distinctSources.add(String(p.sourceId));s[p.collectionComplete?'completePasses':'partialPasses']++;s.pages+=p.pages||0;s.observedPosts+=p.posts||0;if(Number.isFinite(p.durationMs))s.durations.push(p.durationMs)}
  for(const d of docs){const s=slot(channel(d.platform,d.sourceId)),created=d.createdAt>=start,accepted=d.state==='existing'&&d.sinkReceipt?.at>=start,indexed=d.state==='indexed'&&d.indexedAt>=start;if(d.kind==='post'){if(created){s.uniquePostsCreated++;if(Number.isSafeInteger(d.raw?.metrics?.comment)&&d.raw.metrics.comment>0)s.positiveCountPostsCreated++}if(accepted)s.existingPostsAccepted++;if(indexed)s.newPostsIndexed++}else if(d.kind==='comment'){if(created)s.uniqueCommentsCreated++;if(accepted)s.existingCommentsAccepted++;if(indexed)s.newCommentsIndexed++}}
  for(const j of commentJobs.filter(x=>x.createdAt>=start))slot(channel(j.platform,j.sourceId)).commentJobsCreated++;
  return Object.fromEntries([...grouped].sort(([a],[b])=>a.localeCompare(b)).map(([key,s])=>[key,{...s,distinctSources:s.distinctSources.size,medianDurationMs:pct(s.durations,.5),p90DurationMs:pct(s.durations,.9),durations:undefined}]));
 };
 const report={at:now.toISOString(),runId,scope:'rolling_72h_native_boundary_v1',definitions:{sourcePasses:'completed source passes within window; repeat passes counted',pages:'native pagination pages, not all HTTP requests',observedPosts:'post observations across passes, may repeat native IDs',uniquePostsCreated:'new Mongo native post records created in window',newPostsIndexed:'new ES5 create201 commits in window',existingPostsAccepted:'ES5 typed native IDs accepted as existing in window'},oneHour:summarize(oneHour),twoHours:summarize(twoHours)};
 const path='/var/lib/crawler-v8/recent-3day-window-report.json';await fs.writeFile(path+'.tmp',JSON.stringify(report,null,2),{mode:0o600});await fs.rename(path+'.tmp',path);console.log(JSON.stringify(report));
}finally{await c.close()}
