// Read-only access to crawler data. Only this monitor's manifest/state files are written.
import fs from 'node:fs/promises';import {createRequire} from 'node:module';import {pathToFileURL} from 'node:url';import path from 'node:path';import {randomUUID} from 'node:crypto';
export function classifyCohort(jobs,current,outcomes,mongoStates=new Map()){
 const counts={total:jobs.length,completed:0,failed:0,removedUnconfirmed:0,unknown:0,pending:0,states:{}};
 for(const job of jobs){
  const known=outcomes[job.id]?.state;
  if(known==='completed'||job.initialState==='completed'){counts.completed++;continue;}
  if(known==='failed'||['failed','outbox_failed'].includes(job.initialState)){counts.failed++;continue;}
  if(known==='removed'){counts.removedUnconfirmed++;continue;}
  const state=current.get(job.id);
  if(state==='completed'){counts.completed++;continue;}
  if(state==='failed'){counts.failed++;continue;}
  if(state){counts.pending++;counts.states[state]=(counts.states[state]||0)+1;continue;}
  const mongo=mongoStates.get(job.id);
  if(mongo==='failed'){counts.failed++;continue;}
  if(mongo){counts.pending++;counts.states.outbox_only=(counts.states.outbox_only||0)+1;continue;}
  counts.unknown++;
 }
 counts.finished=counts.pending===0&&counts.unknown===0&&counts.removedUnconfirmed===0;
 return counts;
}
const snapshotLua=`
local out={}
for i=1,3 do out[i]=redis.call('LRANGE',KEYS[i],0,-1) end
for i=4,8 do out[i]=redis.call('ZRANGE',KEYS[i],0,-1) end
local last=redis.call('XREVRANGE',KEYS[9],'+','-','COUNT',1)
out[9]=#last>0 and last[1][1] or '0-0'
local t=redis.call('TIME');out[10]=tostring(t[1]*1000+math.floor(t[2]/1000))
return out`;
const names=['waiting','active','paused','delayed','prioritized','waiting-children','failed','completed'];
async function main(){
 const [mode,manifestPath]=process.argv.slice(2);if(!['capture','poll'].includes(mode)||!manifestPath)throw Error('Use capture|poll <monitor-manifest-path>');
 const root=process.env.CRAWL_RUNTIME_DIR||'/opt/crawler-v8/current',require=createRequire(path.join(root,'package.json'));
 const Redis=require('ioredis'),{MongoClient}=require('mongodb');const {FLOW_QUEUES,queueName,FLOW_POLICY}=await import(pathToFileURL(path.join(root,'src/services/crawlerQueueFlow.js')));
 const redis=new Redis(process.env.CRAWL_REDIS_URL||'redis://127.0.0.1:6379',{maxRetriesPerRequest:2,connectTimeout:10000});
 const mongo=new MongoClient(process.env.CRAWL_MONGO_URI,{serverSelectionTimeoutMS:10000});await mongo.connect();const db=mongo.db();
 async function snapshot(spec){
  // Production Queue instances use BullMQ's default `bull` Redis prefix.
  const key=suffix=>'bull:'+queueName(spec.name)+':'+suffix;
  const raw=await redis.eval(snapshotLua,9,...['wait','active','paused','delayed','prioritized','waiting-children','failed','completed','events'].map(key));
  const states=new Map();for(let i=0;i<8;i++)for(const id of raw[i])states.set(id,names[i]);
  return {states,lastEventId:raw[8],capturedAt:new Date(Number(raw[9])).toISOString(),eventKey:key('events')};
 }
 try{
  if(mode==='capture'){
   try{await fs.access(manifestPath);throw Error('MANIFEST_ALREADY_EXISTS');}catch(e){if(e.code!=='ENOENT')throw e;}
   const manifest={schema:1,cohortId:randomUUID(),startedAt:new Date().toISOString(),flowPolicy:FLOW_POLICY,scope:'initial-jobs-all-13-queues',cadenceMinutes:10,queues:[],baselineCounters:await db.collection('flow_counters').find({}).toArray()};
   const state={schema:1,cohortId:manifest.cohortId,queues:{}};
   for(const spec of FLOW_QUEUES){
    const snap=await snapshot(spec),rows=await db.collection('flow_jobs').find({queue:spec.name,createdAt:{$lte:new Date(snap.capturedAt)}},{projection:{_id:1,state:1}}).toArray();
    const initial=new Map(snap.states),mismatches=[];
    for(const row of rows){if(!initial.has(row._id))initial.set(row._id,row.state==='failed'?'outbox_failed':'outbox_only');else if(snap.states.get(row._id)==='failed'&&row.state!=='failed')mismatches.push(row._id);}
    const jobs=[...initial].map(([id,initialState])=>({id,initialState}));
    manifest.queues.push({...spec,capturedAt:snap.capturedAt,jobs,initialMongoMismatchIds:mismatches});
    state.queues[spec.name]={lastEventId:snap.lastEventId,outcomes:{},eventStreamGap:false};
   }
   if(!manifest.queues.some(q=>q.jobs.some(j=>!j.initialState.startsWith('outbox_'))))throw Error('NO_REDIS_MEMBERSHIP_VERIFY_PREFIX_OR_CONNECTION');
   manifest.finishedCaptureAt=new Date().toISOString();await fs.writeFile(manifestPath,JSON.stringify(manifest),{flag:'wx',mode:0o644});await fs.writeFile(manifestPath+'.state.json',JSON.stringify(state),{mode:0o644});
   console.log(JSON.stringify({manifest,monitorState:state}));return;
  }
  const manifest=JSON.parse(await fs.readFile(manifestPath,'utf8')),state=JSON.parse(await fs.readFile(manifestPath+'.state.json','utf8'));
  if(state.cohortId!==manifest.cohortId)throw Error('COHORT_STATE_MISMATCH');
  const report={at:new Date().toISOString(),cohortId:manifest.cohortId,startedAt:manifest.startedAt,scope:manifest.scope,queues:[],counters:await db.collection('flow_counters').find({}).toArray()};
  for(const spec of manifest.queues){
   const snap=await snapshot(spec),saved=state.queues[spec.name],ids=new Set(spec.jobs.map(j=>j.id));
   const first=await redis.xrange(snap.eventKey,'-','+','COUNT',1);
   const compare=(a,b)=>{const [am,as]=a.split('-').map(BigInt),[bm,bs]=b.split('-').map(BigInt);return am===bm?(as>bs?1:as<bs?-1:0):am>bm?1:-1;};
   if(saved.lastEventId!=='0-0'&&first.length&&compare(first[0][0],saved.lastEventId)>0)saved.eventStreamGap=true;
   const events=await redis.xrange(snap.eventKey,'('+saved.lastEventId,snap.lastEventId);
   for(const [eventId,fields]of events){const item={};for(let i=0;i<fields.length;i+=2)item[fields[i]]=fields[i+1];
    if(ids.has(item.jobId)&&!saved.outcomes[item.jobId]&&['completed','failed','removed'].includes(item.event))saved.outcomes[item.jobId]={state:item.event,at:new Date(Number(eventId.split('-')[0])).toISOString(),...(item.failedReason?{reason:item.failedReason}:{})};
   }
   saved.lastEventId=snap.lastEventId;
   const rows=await db.collection('flow_jobs').find({_id:{$in:[...ids]}},{projection:{_id:1,state:1,error:1}}).toArray(),mongoStates=new Map(rows.map(j=>[j._id,j.state]));
   for(const j of spec.jobs)if(!saved.outcomes[j.id]&&['completed','failed'].includes(snap.states.get(j.id)))saved.outcomes[j.id]={state:snap.states.get(j.id),observedAt:report.at};
   const summary=classifyCohort(spec.jobs,snap.states,saved.outcomes,mongoStates);
   if(summary.finished&&!saved.finishedObservedAt)saved.finishedObservedAt=report.at;
   const errors={};for(const row of rows)if(row.state==='failed')errors[row.error||'UNKNOWN']=(errors[row.error||'UNKNOWN']||0)+1;
   const liveCounts={};for(const status of snap.states.values())liveCounts[status]=(liveCounts[status]||0)+1;
   report.queues.push({name:spec.name,kind:spec.kind,capturedAt:spec.capturedAt,...summary,finishedObservedAt:saved.finishedObservedAt||null,eventStreamGap:saved.eventStreamGap,errors,liveCounts,newJobsExcluded:[...snap.states.keys()].filter(id=>!ids.has(id)).length,knownInitialMongoMismatches:spec.initialMongoMismatchIds.length});
  }
  report.allFinished=report.queues.every(q=>q.finished);report.monitorState=state;
  await fs.writeFile(manifestPath+'.state.json.tmp',JSON.stringify(state),{mode:0o644});await fs.rename(manifestPath+'.state.json.tmp',manifestPath+'.state.json');console.log(JSON.stringify(report));
 }finally{await redis.quit();await mongo.close();}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href)await main();
