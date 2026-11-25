import {validEndpoint} from './proxyAvoidance.js';
import {isAuthGate,gateSummary} from './socialAuthGate.js';
import {isOriginRateLimit,isReadProxyLimit,originWaitMs} from './originRateLimit.js';
import {createHash} from 'node:crypto';
import {encodeBackfillState,decodeBackfillState} from './crawlerV8Backfill.js';
import {setTimeout as sleep} from 'node:timers/promises';
export const FLOW_POLICY='independent-rounds-operator-error-policy-v12-facebook-proxy-rotation';
export const FLOW_RETRY_LIMIT=100;
export const FLOW_JOB_RETRY_LIMIT=5;
export const FLOW_JOB_RETRY_DELAY_MS=15000;
export const FLOW_READ_TIMEOUT_MS=60000;
export const FLOW_READ_ATTEMPT_TIMEOUT_MS=3*FLOW_READ_TIMEOUT_MS;
export const FLOW_QUEUES=[
 {name:'facebook-page-source',kind:'source',platform:'facebook',type:'page',workers:30},
 {name:'facebook-group-source',kind:'source',platform:'facebook',type:'group',workers:60},
 {name:'facebook-user-source',kind:'source',platform:'facebook',type:'user',workers:10},
 {name:'instagram-source',kind:'source',platform:'instagram',type:'profile',workers:5},
 {name:'youtube-source',kind:'source',platform:'youtube',type:'channel',workers:5},
 {name:'threads-source',kind:'source',platform:'threads',type:'profile',workers:5},
 {name:'facebook-comment',kind:'comments',platform:'facebook',workers:150},
 {name:'facebook-reply',kind:'reply',platform:'facebook',workers:70},
 {name:'instagram-comment',kind:'comments',platform:'instagram',workers:5},
 {name:'youtube-comment',kind:'comments',platform:'youtube',workers:30},
 {name:'threads-comment',kind:'comments',platform:'threads',workers:8},
 {name:'es5-import',kind:'import',workers:80},
 {name:'find-uid',kind:'uid',platform:'facebook',workers:3}
];
// Run the operator-declared worker budget without a second admission cap.
export const flowWorkerConcurrency=spec=>spec.workers;
export const queueName=name=>'crawler-flow-'+name;
export const flowId=(...parts)=>createHash('sha256').update(JSON.stringify(parts)).digest('hex');
export const JOB_OPTIONS={removeOnComplete:true,removeOnFail:false,attempts:1};
export function detectedSource(s){
 const types={facebook:['page','group','user'],instagram:['profile'],threads:['profile'],youtube:['channel']};
 if(!s?.eligible||s.canonicalSourceId||!types[s.platform]?.includes(s.type)||typeof s.nativeId!=='string'||!s.url)return false;
 if(!(s.platform==='youtube'?/^UC[\w-]{22}$/:/^\d+$/).test(s.nativeId))return false;
 if(s.platform==='facebook'&&['page','user'].includes(s.type))return s.identityStatus==='verified'&&s.identityProof?.nativeId===s.nativeId&&s.identityProof?.type===s.type;
 return s.audit?.status==='live'||s.identityStatus==='verified';
}
export function sourcePageDecision({items=[],page,cutoff,hasMore,phase,nativePageCount}){
 // Import the returned batch before deciding whether to fetch another page.
 // Always allow the first page through; old pins never close the age window.
 const outsideWindow=page>=2&&items.some(x=>x.pinned!==true&&Number.isFinite(Date.parse(x.createdAt))&&Date.parse(x.createdAt)<cutoff);
 if(phase==='collecting')return outsideWindow;
 // An empty native page can still carry a valid continuation (filters/deletions).
 // Only the explicit native end signal proves exhaustion.
 if(hasMore===false)return true;
 return outsideWindow;
}
export function packState(state){return state?encodeBackfillState(state).toString('base64'):null;}
export function unpackState(payload){return payload?decodeBackfillState(Buffer.from(payload,'base64')):null;}
export function facebookContinuationJobs(state,postId){
 if(!state)return [];
 if(state.items?.length)throw Error('FACEBOOK_PAGE_BUFFER_NOT_DRAINED');
 return (state.queue||[]).map(native=>({kind:native.idGetComment===postId?'comments':'reply',native,
  checkpoint:packState({kind:'facebook',items:[],seen:new Set(),queue:[native],queued:new Set(state.queued||[]),pending:true,collecting:true,unfiltered:false})}));
}
export function interactionDate(current,candidate){
 const a=new Date(current),b=new Date(candidate);return Number.isFinite(+b)&&(!Number.isFinite(+a)||+b>+a)?b:a;
}
export function errorCode(error){return /^[A-Z][A-Z0-9_.:-]{0,160}$/.test(error?.code||error?.message||'')?error.code||error.message:'INTERNAL_'+String(error?.name||'ERROR').replace(/[^A-Za-z0-9_]/g,'');}

// A limit must be explicitly attributed to this leased proxy, not inferred from
// a timeout, network error, auth response, or an unscoped upstream 429.
export function confirmedProxyLimit(result){
 const t=result?.transport,e=t?.proxyLimitEvidence;
 return result?.reason==='PROXY_CONNECT_RATE_LIMITED'&&e?.source==='proxy_connect'&&e.httpStatus===429&&e.scope==='proxy'&&e.confirmed===true&&/^[a-f0-9]{64}$/.test(e.endpoint||'')&&e.endpoint===t.proxyEndpoint;
}
export const FLOW_DONE_REASONS=new Set(['AUTH_REQUIRED','LOGIN_OR_CHECKPOINT','PUBLIC_ITEMS_NOT_RETURNED','PUBLIC_DATA_NOT_RETURNED','FEED_UNAVAILABLE','NATIVE_PAGINATION_STALLED','COMMENTS_UNAVAILABLE','POST_OUTSIDE_COMMENT_WINDOW']);
export const FLOW_ROTATE_REASONS=new Set(['PROXY_EXPIRED','PROXY_TLS_HANDSHAKE_TIMEOUT','PROXY_CONNECT_TIMEOUT','PROXY_CONNECT_EOF','UPSTREAM_TIMEOUT','UPSTREAM_HTTP_ERROR','NETWORK_ERROR','UPSTREAM_NETWORK_ERROR','ECONNRESET','FACEBOOK_SERVER_ERROR','FACEBOOK_PAGINATION_INCOMPLETE','PROXY_MANAGER_UNAVAILABLE','PROXY_RETRY_ENDPOINT_UNAVAILABLE','UNSAFE_REDIRECT']);
export function flowReadAction(result,{originScope}={}){
 if(result?.reason==='ORIGIN_SECURITY_CHALLENGE')return 'fail';
 if(isReadProxyLimit(result,originScope))return 'rotate';
 if(isOriginRateLimit(result)&&!confirmedProxyLimit(result))return 'origin_wait';
 if(FLOW_DONE_REASONS.has(result?.reason)||['auth_required','security_checkpoint'].includes(result?.status))return 'done';
 if(result?.upstreamCode==='ECONNRESET'||confirmedProxyLimit(result)||FLOW_ROTATE_REASONS.has(result?.reason)||/^UPSTREAM_HTTP_\d+$/.test(result?.reason||''))return 'rotate';
 return 'fail';
}
export function applyFlowCounterDefaults(item,reason){
 const m=item.metrics||{},known=Number.isSafeInteger(m.comment)&&m.comment>=0;
 if(known&&!['PUBLIC_COUNTERS_NOT_RETURNED','COMMENT_COUNT_UNVERIFIED'].includes(reason))return item;
 const metrics={...m,comment:known?m.comment:1};
 for(const k of ['likes','shares','views','reactions'])if(!Number.isSafeInteger(metrics[k])||metrics[k]<0)metrics[k]=0;
 return {...item,metrics,counterDefaults:{policy:FLOW_POLICY,reason:reason||'COMMENT_COUNT_UNVERIFIED',commentDefaulted:!known}};
}
export function flowCommentPaginationDone(result){
 const c=result?.coverage;
 return result?.pagination?.hasMore===false&&!(c?.orphanReplies>0)&&(c?.complete===true||c?.exhausted===true&&['PUBLIC_COMMENT_COUNT_MISMATCH','COMMENT_COUNT_UNVERIFIED','PUBLIC_REPLY_COUNT_UNVERIFIED','PUBLIC_REPLY_COUNT_MISMATCH','PUBLIC_CONTINUATIONS_EXHAUSTED'].includes(c.reason));
}

// Run one read per turn so the ticket can release its worker while waiting.
export async function readWithJobRetries({read,retries:recordedRetries,originScope,shouldStop,onGate,onFailure,onRetry,now=Date.now}){
 if(shouldStop())throw Error('WORKER_STOPPED');
 const retries=Number.isSafeInteger(recordedRetries)&&recordedRetries>0?recordedRetries:0;
 if(retries>FLOW_JOB_RETRY_LIMIT)return {exhausted:true};
 const outcome=await read();
 if(outcome.good||outcome.done||outcome.deferred)return outcome;

 const {result}=outcome;
 const action=flowReadAction(result,{originScope});
 const authGate=result.reason!=='ORIGIN_SECURITY_CHALLENGE'&&isAuthGate(result);
 const restricted=authGate&&result.authGate?.classification==='source_restriction'&&result.authGate.confirmed===true;
 if(authGate)await onGate(result);
 if(action==='done'&&!authGate&&result.status!=='error'){
  await onFailure(result);
  return {...outcome,done:true,lastResult:result};
 }
 if(retries>=FLOW_JOB_RETRY_LIMIT){
  await onFailure(result);
  return {...outcome,exhausted:true,lastResult:result};
 }
 if(restricted){
  await onFailure(result);
  return {...outcome,done:true,lastResult:result};
 }
 if(result.reason==='ORIGIN_SECURITY_CHALLENGE'){
  await onFailure(result);
  return {...outcome,failed:true,lastResult:result};
 }

 const retryAt=now()+FLOW_JOB_RETRY_DELAY_MS;
 const rotate=authGate||action==='rotate'||['PROXY_ENDPOINTS_UNAVAILABLE','PROXY_POOL_BUSY','PROXY_PROVIDER_COOLDOWN'].includes(result.reason);
 await onRetry(retries+1,result,{retryAt,rotate});
 return {...outcome,retryAt};
}

export async function boundedProxyRead({read,rotate,onRetry=async()=>{},onWait=async()=>{},onOriginWait=async()=>{},originScope,onFailure=async()=>{},initialRetries=0,shouldStop=()=>false,verifyAuthGates=false,authGateAttemptLimit=3,publicBefore=false,onGate=async()=>{},proxyAttemptLimit=Infinity,initialProxyEndpoints=[],onProxyAttempt=async()=>{},stopOnProxyError=false,retryAnonymousBootstrap=false,waitForProxyCapacity=false}){
 let gateAttempts=0;const gateEndpoints=new Set(),failedProxyEndpoints=new Set(initialProxyEndpoints.filter(validEndpoint));
 const retryLimit=Number.isInteger(proxyAttemptLimit)&&proxyAttemptLimit>0?Infinity:FLOW_RETRY_LIMIT;
 const readAction=result=>(Number.isFinite(proxyAttemptLimit)||retryAnonymousBootstrap)&&result?.reason==='ANONYMOUS_BOOTSTRAP_UNAVAILABLE'?'rotate':flowReadAction(result,{originScope});
 let retries=Math.max(0,Number.isSafeInteger(initialRetries)?initialRetries:0);
 if(retries>retryLimit)return {exhausted:true,lastResult:{status:'error',reason:'RETRY_LIMIT_EXHAUSTED'}};
 if(failedProxyEndpoints.size>=proxyAttemptLimit){const result={status:'proxy_error',reason:'PROXY_ATTEMPTS_EXHAUSTED'};await onFailure(result);return {failed:true,proxyAttemptLimitReached:true,proxyAttempts:failedProxyEndpoints.size,lastResult:result};}
 for(;;){
  if(shouldStop())throw Error('WORKER_STOPPED');
  const outcome=await read();
  if(outcome.done||outcome.deferred)return outcome;
  const endpoint=outcome.result?.transport?.proxyEndpoint;
  if(outcome.good){
   if(gateAttempts){const different=endpoint&&!gateEndpoints.has(endpoint)&&outcome.result.identityVerified===true&&(outcome.result.items?.length>0||Number.isInteger(outcome.result.nativePageCount)||!!outcome.result.nativePostId);outcome.result.authGate=gateSummary({result:outcome.result,endpoints:[...gateEndpoints,endpoint],publicBefore,classification:different?'ip_or_route_dependent':'unverified',confirmed:!!different});await onGate(outcome.result);}
   return outcome;
  }
  // Group continuations may explicitly finish on the first error that would
  // otherwise select/wait for another proxy. Preserve the native error/state.
  if(stopOnProxyError&&(['PROXY_ENDPOINTS_UNAVAILABLE','PROXY_POOL_BUSY','PROXY_PROVIDER_COOLDOWN','PROXY_MANAGER_UNAVAILABLE','ANONYMOUS_BOOTSTRAP_UNAVAILABLE'].includes(outcome.result?.reason)||readAction(outcome.result)==='rotate')){
   await onFailure(outcome.result);return {...outcome,done:true,stoppedOnProxyError:true,lastResult:outcome.result};
  }
  // Pool availability is a scheduling wait, even after an earlier native read.
  // It never spends another proxy attempt or discards the native checkpoint.
  if(outcome.result?.reason==='PROXY_PACING_WAIT'){await onWait(outcome.result);return {...outcome,deferred:true,retryAfterMs:outcome.result.retryAfterMs};}
  if(outcome.result?.reason==='PROXY_ENDPOINTS_UNAVAILABLE'||(Number.isFinite(proxyAttemptLimit)||waitForProxyCapacity)&&['PROXY_POOL_BUSY','PROXY_PROVIDER_COOLDOWN','PROXY_MANAGER_UNAVAILABLE'].includes(outcome.result?.reason)){
   await rotate();await onWait(outcome.result);return {...outcome,deferred:true,retryAfterMs:outcome.result.retryAfterMs};
  }
  if(Number.isFinite(proxyAttemptLimit)&&outcome.result?.transport?.proxyUsed!==false&&validEndpoint(endpoint)){
   if(!failedProxyEndpoints.has(endpoint)){failedProxyEndpoints.add(endpoint);await onProxyAttempt([...failedProxyEndpoints],outcome.result);}
   if(failedProxyEndpoints.size>=proxyAttemptLimit){await onFailure(outcome.result);return {...outcome,failed:true,proxyAttemptLimitReached:true,proxyAttempts:failedProxyEndpoints.size,lastResult:outcome.result};}
  }
  if(readAction(outcome.result)==='origin_wait'){
   await onOriginWait(outcome.result);return {...outcome,deferred:true,originDeferred:true,originScope,retryAfterMs:originWaitMs(outcome.result.retryAfterMs)};
  }
  // This native challenge is an origin barrier, not an auth comparison or
  // transport retry. Preserve the failed job/checkpoint without another IP.
  if(outcome.result?.reason==='ORIGIN_SECURITY_CHALLENGE'){
   await onFailure(outcome.result);return {...outcome,failed:true,lastResult:outcome.result};
  }
  if(verifyAuthGates&&isAuthGate(outcome.result)){
   gateAttempts++;if(endpoint)gateEndpoints.add(endpoint);
   const fixed=outcome.result.authGate?.classification==='source_restriction'&&outcome.result.authGate?.confirmed===true;
   const compare=!fixed&&endpoint&&gateAttempts<Math.max(1,Math.min(3,authGateAttemptLimit))&&gateEndpoints.size===gateAttempts&&retries<retryLimit;
   outcome.result.authGate=gateSummary({result:outcome.result,endpoints:[...gateEndpoints],publicBefore,classification:fixed?'source_restriction':publicBefore?'login_after_public_data':'unverified',confirmed:fixed});
   await onGate(outcome.result);
   if(compare){await rotate();await onRetry(++retries,outcome.result);continue;}
   // Repeated login pages alone do not prove source privacy. Preserve the
   // operator's terminal policy, but leave the cause explicitly unverified.
  }
  const action=readAction(outcome.result);
  if(action==='done'){await onFailure(outcome.result);return {...outcome,done:true,lastResult:outcome.result};}
  if(action!=='rotate'){await onFailure(outcome.result);return {...outcome,failed:true,lastResult:outcome.result};}
  if(retries>=retryLimit){await onFailure(outcome.result);return {exhausted:true,lastResult:outcome.result};}
  await rotate();await onRetry(++retries,outcome.result);
  if(outcome.result?.reason==='PROXY_MANAGER_UNAVAILABLE')await sleep(Math.min(1000,100*retries));
 }
}
