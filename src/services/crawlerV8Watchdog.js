// Only reclaim work whose owner or lease is gone. Never reset a live pinned job,
// its native cursor, its retry budget, or a legitimate future cooldown.
export function orphanedMainJob(job,owners,now){
 const owner=owners.get(job.workerShard),live=owner&&owner.lockUntil>now&&owner.lockToken===job.workerOwnerToken;
 return !live||!(job.leasedUntil instanceof Date)||job.leasedUntil<now;
}
export function classifyJobWait(job,now){
 if(job.workerWaiting&&job.waitingUntil>now)return{kind:'scheduled_wait',remainingMs:job.waitingUntil-now,reason:job.lastReason};
 const times=[job.lastProgressAt,job.lastRequestStartedAt,job.startedAt].map(x=>x==null?NaN:+x).filter(Number.isFinite);
 if(!times.length)return{kind:'missing_activity'};
 const idleMs=now-Math.max(...times);return{kind:idleMs>300000?'stalled_candidate':'active',idleMs};
}
