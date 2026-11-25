import {packState} from './crawlerQueueFlow.js';

// An endpoint wait immediately persists the same data again before delaying its
// ticket. Mongo remains the write-ahead record; sync Bull only at that boundary.
const durableWaitCheckpoint=Symbol('durableWaitCheckpoint');
export async function persistFlowCheckpoint({job,state,extra={},jobs,deferBull=false}){
 const checkpoint=packState(state);Object.assign(job.data,{checkpoint},extra);
 await jobs.updateOne({_id:job.id},{$set:{'data.checkpoint':checkpoint,...Object.fromEntries(Object.entries(extra).map(([k,v])=>['data.'+k,v]))}});
 if(deferBull)job[durableWaitCheckpoint]=checkpoint;
 else{delete job[durableWaitCheckpoint];await job.updateData(job.data);}
}
export function hasDurableWaitCheckpoint(job){
 return Object.hasOwn(job,durableWaitCheckpoint)&&job[durableWaitCheckpoint]===job.data.checkpoint;
}
