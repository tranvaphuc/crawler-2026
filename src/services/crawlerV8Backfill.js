import {serialize,deserialize} from 'node:v8';
import {deflateSync,inflateSync} from 'node:zlib';
// Persist public reader progress only. HTTP_BINDING, leases, cookies and transport never enter Mongo.
const stateKeys=['sourceEmittedIds','kind','items','seen','nativeCursor','pending','collecting','queue','queued','expectedReplies','observedReplies','unfiltered','recoveries','budgetStopped','estimatedBytes','offset','base','visited','context','bootstrap','ui','nativeNewest','nativeNewestConfirmed','nativeLatest','expected','totalRequests','seenIds','knownRootIds','policyReturned','streamMore','dateObservedAt','dateAttempts','dateHydrationPending','repeatedSearchPages','paginationStalled','commentCoverageVersion','rootCommentIds','replyParents','rootPagesVerified','rootPagesObserved','commentFieldErrors','expectedCommentCount','commentHeaderAttempted','crawlManifest'];
const encodedStates=new WeakMap();
export function encodeBackfillState(state){
 if(!state)return null;
 const clean=Object.fromEntries(stateKeys.filter(k=>Object.hasOwn(state,k)).map(k=>[k,state[k]]));
 if(clean.base){clean.base={...clean.base};delete clean.base.transport;}
 const raw=serialize(clean);if(raw.length>128*1024*1024)throw Object.assign(Error('CHECKPOINT_TOO_LARGE'),{code:'CHECKPOINT_TOO_LARGE'});
 // Compare the exact public serialization, not cursor/size heuristics: buffered
 // rows and Set/Map mutations must always produce a new durable checkpoint.
 const previous=encodedStates.get(state);if(previous?.raw.equals(raw))return Buffer.from(previous.payload);
 const payload=deflateSync(raw);if(payload.length>12*1024*1024)throw Object.assign(Error('CHECKPOINT_TOO_LARGE'),{code:'CHECKPOINT_TOO_LARGE'});if(raw.length<=256*1024)encodedStates.set(state,{raw,payload:Buffer.from(payload)});else encodedStates.delete(state);return payload;
}
export function decodeBackfillState(payload){return deserialize(inflateSync(payload,{maxOutputLength:128*1024*1024}));}
export const CRAWL_RETRY_POLICY='short_retry_preserve_cooldown_v1';
export const managerWait=reason=>/^(?:API_COOLDOWN|PROXY_SCOPE_COOLDOWN|PROXY_ASSIGNMENT_COOLDOWN|PROXY_ASSIGNMENT_BACKOFF|PROXY_PACING_WAIT|PROXY_RETRY_LATER|PROXY_POOL_BUSY|PROXY_POOL_EMPTY|PROXY_KEYS_UNAVAILABLE)$/.test(reason||'');
const rateLimited=result=>result.status==='rate_limited'||/RATE_LIMIT|HTTP_429/.test(result.reason||'');
export function crawlRetryDelay(result,retries,{rotated=false}={}){
 if(/^PROXY_ASSIGNMENT_(?:COOLDOWN|BACKOFF)$/.test(result.reason||''))return 0;
 const requested=Number.isFinite(result.retryAfterMs)&&result.retryAfterMs>0?result.retryAfterMs:0;
 // A rate-limited lease retains its cooldown in the manager; another permitted
 // lease may proceed. Global/API cooldowns never take this branch.
 if(rotated&&!managerWait(result.reason))return rateLimited(result)?1000:Math.max(1000,requested);
 // Pacing/pool availability is scheduling, not an exponential upstream failure.
 if(managerWait(result.reason))return Math.max(1000,requested);
 return Math.max(requested,Math.min(30000,1000*2**Math.min(Math.max(0,retries-1),5)));
}
export function backfillOutcome({kind,result,state,verifiedSince=false,rejected=0,unknown=0,now=Date.now()}){
 const pagination=result?.pagination||{},coverage=result?.coverage||{};
 const continuation=!!state&&pagination.hasMore!==false;
 const unsupported=pagination.reason==='NATIVE_PAGINATION_UNAVAILABLE';
 const windowCovered=kind==='source'&&(verifiedSince||!continuation&&!unsupported&&coverage.exhausted===true&&pagination.hasMore===false);
 const complete=kind==='source'?windowCovered:coverage.complete===true&&coverage.exhausted===true&&pagination.hasMore===false&&!continuation;
 const done=complete&&rejected===0&&unknown===0;
 const reason=done?null:unsupported?'NATIVE_PAGINATION_UNAVAILABLE':continuation?'CONTINUATION_PENDING':rejected?'RECORDS_QUARANTINED':unknown?'EXACT_DATES_MISSING':result?.reason||'PUBLIC_COVERAGE_UNVERIFIED';
 // Unsupported/public-window reads are retried slowly; real native continuation resumes immediately.
 return {state:done?'done':continuation?'retry':'partial',nextAt:new Date(now+(done?0:continuation?1000:1800000)),lastReason:reason,windowCovered,coverageComplete:complete,backfillComplete:done};
}

// One invocation owns one source/post until native pagination ends or access is blocked.
// Request/page budgets belong inside the reader; they never release this worker's job.
export async function drainPinnedBackfill({initialState=null,read,onData,onRetry,wait,shouldStop=()=>false,classify,maxRetries=20,initialRetries=0,rotateProxy,stopPublic=()=>null,onReadError=error=>({status:error.resultStatus||'error',reason:error.code||'UPSTREAM_READ_FAILED',retryAfterMs:error.retryAfterMs})}){
 let state=initialState,result=null,retries=Math.min(maxRetries,Math.max(0,initialRetries)),stalled=0,consecutive=0;
 const progress=s=>s?.kind?JSON.stringify([s.nativeCursor,s.queue?.length,s.queue?.[0],s.queue?.at(-1),s.seen?.size,s.seenIds?.size,s.items?.length,s.offset,s.dateAttempts?.size,s.visited?.size,s.pending,s.collecting]):null;
 while(!shouldStop()){
  const previous=state,before=progress(state);try{result=await read(state);}catch(error){result={value:onReadError(error),state:previous};}const next=result.state;
  const publicStop=stopPublic(result.value);if(publicStop)return{state:next||previous,result:result.value,publicStopped:publicStop};
  const classification=classify(result.value);
  if(classification!=='data'){
   state=next||previous;
   if(classification==='blocked')return{state,result:result.value,blocked:true};
   if(managerWait(result.value.reason)){const assignment=/^PROXY_ASSIGNMENT_/.test(result.value.reason||''),rotated=assignment&&rotateProxy?await rotateProxy(state,result.value):false;const delay=crawlRetryDelay(result.value,1);await onRetry(result.value,state,delay,retries,{proxyRotationRequested:rotated,schedulingWait:true});await wait(delay);continue;}
   if(retries>=maxRetries)return{state,result:result.value,retryExhausted:true,retries:maxRetries,failedAttempts:maxRetries+1};
   retries++;
   consecutive++;
   const limited=rateLimited(result.value),transportFailure=/^(?:(?:UPSTREAM_)?NETWORK_ERROR|UPSTREAM_TIMEOUT|CONNECT_ERROR|TUNNEL_ERROR|PROXY_EXPIRED|PROXY_LEASE_EXPIRED)$/.test(result.value.reason||'');
   const rotated=(limited||transportFailure)&&!managerWait(result.value.reason)&&rotateProxy?await rotateProxy(state,result.value):false;
   const delay=crawlRetryDelay(result.value,consecutive,{rotated});
   await onRetry(result.value,state,delay,retries,{proxyRotationRequested:rotated});
   await wait(delay);
   continue;
  }
  consecutive=0;state=next||null;
  stalled=state&&before!==null&&before===progress(state)&&!(result.value.items?.length)?stalled+1:0;
  if(stalled>=3)return{state,result:{...result.value,status:'error',reason:'NATIVE_PAGINATION_STALLED'},blocked:true};
  const boundaryReached=await onData(result.value,state);
  if(boundaryReached||!state||result.value.pagination?.hasMore===false)return{state,result:result.value,boundaryReached:!!boundaryReached};
 }
 return{state,result:result?.value||null,stopped:true};
}
