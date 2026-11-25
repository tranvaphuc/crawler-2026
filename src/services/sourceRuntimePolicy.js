import fs from 'node:fs';
import {ProxyWaitDelayedError} from './crawlerProxyWait.js';
import {registerCheckpointResume} from './checkpointResumeScheduling.js';

export const SOURCE_SLICE_MS=60000;
export class SourceSliceYield extends Error{constructor(){super('SOURCE_TIME_SLICE');}}
export const sourceSliceExpired=(data,started,now=Date.now())=>data?.kind==='source'&&now-started>=SOURCE_SLICE_MS;
export function createSourceConcurrencySettings({file,onError=()=>{}}={}){
 let current={},interaction={};
 const interactionCaps={'facebook-comment':150,'facebook-reply':70};
 const allowed=new Set(['facebook-page-source','facebook-group-source','facebook-user-source','instagram-source','youtube-source','threads-source']);
 return{reload(){
  if(!file)return current;
  try{const data=JSON.parse(fs.readFileSync(file)),settings=data.queues||{},entries=Object.entries(settings),interactionSettings=data.interactionQueues||{};if(typeof interactionSettings!=='object'||Array.isArray(interactionSettings)||Object.entries(interactionSettings).some(([k,v])=>!Object.hasOwn(interactionCaps,k)||!Number.isInteger(v)||v<1||v>interactionCaps[k]))throw Error('INTERACTION_CONCURRENCY_INVALID');if(entries.some(([k,v])=>!allowed.has(k)||!Number.isInteger(v)||v<1||v>300)||entries.reduce((n,[,v])=>n+v,0)>400)throw Error('SOURCE_CONCURRENCY_INVALID');current=settings;interaction=interactionSettings;}catch(e){if(e.code!=='ENOENT')onError(e.code||e.message);}
  return current;
 },get(spec){return spec.kind==='source'?current[spec.name]||spec.workers:interaction[spec.name]||spec.workers;}};
}
export async function yieldSourceSlice({job,token,jobs,now=Date.now()}){
 const until=now+1000;
 Object.assign(job.data,{sourceYieldUntil:until,sourceSlices:(job.data.sourceSlices||0)+1});
 await jobs.updateOne({_id:job.id},{$set:{state:'queued',sourceDeferred:true,data:job.data}});
 await job.updateData(job.data);await registerCheckpointResume({job,readyAt:until});await job.moveToDelayed(until,token);
 throw new ProxyWaitDelayedError();
}
