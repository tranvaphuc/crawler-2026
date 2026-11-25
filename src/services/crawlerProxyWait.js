import {Worker,DelayedError} from 'bullmq';
import {registerCheckpointResume} from './checkpointResumeScheduling.js';
import {hasDurableWaitCheckpoint} from './flowCheckpointPersistence.js';

export class FlowProxyWaitError extends Error{
 constructor(retryAfterMs,{readyAt,reason='PROXY_ENDPOINTS_UNAVAILABLE'}={}){super(reason);this.retryAfterMs=Math.max(1000,Math.min(30000,Number(retryAfterMs)||5000));this.readyAt=readyAt;}
}
export class ProxyWaitDelayedError extends DelayedError{}
// BullMQ 5's generic DelayedError path fetches another active job even during
// graceful shutdown. Our ticket is already delayed: let the normal loop refill.
export class CheckpointWorker extends Worker{
 async handleFailed(error,...args){if(error instanceof ProxyWaitDelayedError)return;return super.handleFailed(error,...args);}
}
export async function delayProxyJob({job,token,jobs,error,now=Date.now()}){
 const until=error.readyAt??Math.max(now+error.retryAfterMs,Number(job.data.proxyWaitUntil)||0);
 Object.assign(job.data,{proxyWaitUntil:until,proxyWaitReason:error.message});
 const data=hasDurableWaitCheckpoint(job)?{'data.proxyWaitUntil':until,'data.proxyWaitReason':error.message}:{data:job.data};
 await jobs.updateOne({_id:job.id},{$set:{state:'queued',proxyDeferred:true,...data}});
 await job.updateData(job.data);
 await registerCheckpointResume({job,readyAt:until});
 await job.moveToDelayed(until,token);
 throw new ProxyWaitDelayedError();
}
