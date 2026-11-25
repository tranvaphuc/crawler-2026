import fs from 'node:fs/promises';
import path from 'node:path';
import {MongoClient} from 'mongodb';
import {RECENT_SOURCE_POLICY} from '../src/services/crawlerV8Recent3d.js';

const runId=process.env.CRAWL_RUN_ID||'october-2026-v8';
const dir=process.env.CRAWL_DATA_DIR||'/var/lib/crawler-v8';
const client=new MongoClient(process.env.CRAWL_MONGO_URI,{serverSelectionTimeoutMS:10000});
await client.connect();
try{
 const db=client.db(),fields={_id:0,sourceId:1,platform:1,pass:1,windowSince:1,windowUntil:1,startedAt:1,endedAt:1,durationMs:1,collectionComplete:1,boundaryReached:1,pages:1,posts:1,excluded:1,unknownDates:1,rejected:1,reason:1};
 const firstRows=await db.collection('recent_source_passes').find({runId,policy:RECENT_SOURCE_POLICY,pass:1},{projection:fields}).sort({endedAt:1}).toArray();
 const current=await db.collection('jobs').find({runId,crawlMode:RECENT_SOURCE_POLICY},{projection:{_id:0,sourceId:1,platform:1,state:1,createdAt:1,recentPass:1,recentPassDurationMs:1,recentLastPassAt:1,lastReason:1}}).toArray();
 const currentIds=new Set(current.map(x=>String(x.sourceId))),first=firstRows.filter(x=>currentIds.has(String(x.sourceId))),firstIds=new Set(first.map(x=>String(x.sourceId)));
 const durations=first.filter(x=>x.collectionComplete&&Number.isFinite(x.durationMs)).map(x=>x.durationMs).sort((a,b)=>a-b),pct=p=>durations.length?durations[Math.min(durations.length-1,Math.floor((durations.length-1)*p))]:null;
 const states=Object.fromEntries([...new Set(current.map(x=>x.state))].sort().map(state=>[state,current.filter(x=>x.state===state).length]));
 const platform=Object.fromEntries([...new Set(current.map(x=>x.platform))].sort().map(name=>[name,{queued:new Set(current.filter(x=>x.platform===name).map(x=>String(x.sourceId))).size,firstPassCompleted:first.filter(x=>x.platform===name&&x.collectionComplete).length,firstPassPartial:first.filter(x=>x.platform===name&&!x.collectionComplete).length}]));
 const summary={at:new Date().toISOString(),runId,policy:RECENT_SOURCE_POLICY,windowHours:72,stopRule:'first_older_non_pinned_post_after_full_page',queuedSources:currentIds.size,queuedJobs:current.length,duplicateSourceJobs:current.length-currentIds.size,firstPassRecorded:firstIds.size,firstPassCompleted:durations.length,firstPassPartial:first.length-durations.length,currentStates:states,platform,firstPassDurationMs:{median:pct(.5),p90:pct(.9),max:durations.at(-1)||null},firstQueuedAt:current.map(x=>x.createdAt).filter(Boolean).sort((a,b)=>a-b)[0]||null,allQueuedSourcesHaveFirstPass:[...currentIds].every(id=>firstIds.has(id))};
 await fs.mkdir(dir,{recursive:true});
 const write=async(name,content)=>{const p=path.join(dir,name);await fs.writeFile(p+'.tmp',content,{mode:0o600});await fs.rename(p+'.tmp',p);};
 await write('recent-3day-first-passes.jsonl',first.map(x=>JSON.stringify(x)).join('\n')+(first.length?'\n':''));
 await write('recent-3day-summary.json',JSON.stringify(summary,null,2));
 console.log(JSON.stringify(summary));
}finally{await client.close()}
