export const RECENT_SOURCE_POLICY='rolling_72h_native_boundary_v1';
export const RECENT_SOURCE_INTERVAL_MS=60_000;
// A public access failure ends that pass. A later rolling pass may use a fresh
// anonymous proxy assignment; bound consecutive failures so private sources
// do not consume the worker pool indefinitely.
export const RECENT_SOURCE_REQUEUE_STATES=['done','partial_public','skipped_access_required'];
export const RECENT_SOURCE_ACCESS_REQUEUE_LIMIT=50;
export const RECENT_SOURCE_WINDOW_MS=72*60*60*1000;

// A failed historical window does not prevent later, independent 72-hour
// passes. Keep the historical job terminal so it is never reported complete.
export function recentSourceAdmissionFilter(runId,since,until){
 return{runId,kind:'source',crawlMode:{$exists:false},$or:[
  {state:{$in:['done','waiting_data']},windowCovered:true,scannedSince:since,scannedUntil:until},
  {state:'skipped_retry_exhausted',proxyRetryCount:{$gte:50},retryLimit:50}
 ]};
}

export function recentSourceWindow(at=new Date()){
 const end=at instanceof Date?at:new Date(at);
 if(!Number.isFinite(+end))throw Error('RECENT_WINDOW_CLOCK_INVALID');
 return{since:new Date(+end-RECENT_SOURCE_WINDOW_MS).toISOString(),until:end.toISOString()};
}

export function jobWindow(job,backfill){
 if(job?.crawlMode!==RECENT_SOURCE_POLICY&&!job?.recentParent)return{since:backfill.since,until:backfill.until};
 if(!Number.isFinite(Date.parse(job.windowSince))||!Number.isFinite(Date.parse(job.windowUntil))||Date.parse(job.windowUntil)<=Date.parse(job.windowSince))throw Object.assign(Error('RECENT_WINDOW_MISSING'),{code:'RECENT_WINDOW_MISSING'});
 return{since:job.windowSince,until:job.windowUntil};
}

export function recentPassOutcome({boundary,result,now=new Date(),startedAt,pages=0,posts=0,excluded=0,unknown=0,rejected=0,sourceId,platform,pass=1}){
 const endedAt=now instanceof Date?now:new Date(now),started=new Date(startedAt);
 const exhausted=result?.pagination?.hasMore===false&&result?.coverage?.exhausted===true;
 const collectionComplete=boundary?.reached===true||exhausted;
 return{sourceId,platform,pass,policy:RECENT_SOURCE_POLICY,startedAt:started,endedAt,durationMs:Math.max(0,+endedAt- +started),collectionComplete,boundaryReached:boundary?.reached===true,pages,posts,excluded,unknownDates:unknown,rejected,reason:collectionComplete?null:result?.reason||'PUBLIC_COVERAGE_UNVERIFIED'};
}
