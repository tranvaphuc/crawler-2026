import {managerWait} from './crawlerV8Backfill.js';
export const PROXY_JOB_POLICY='shared_scope_proxy_retry50_v1';
export const PROXY_JOB_RETRY_LIMIT=50;
export function publicAccessFailure(r={}){
 if(/^PROXY_/.test(r.reason||''))return false;
 return ['auth_required','security_checkpoint'].includes(r.status)||/^(?:AUTH_REQUIRED|LOGIN_OR_CHECKPOINT|LOGIN_REQUIRED|UPSTREAM_API_AUTH_REQUIRED|SECURITY_CHECKPOINT|FACEBOOK_AUTH_REQUIRED|FACEBOOK_SECURITY_CHECKPOINT)$/.test(r.reason||'');
}
export const proxyRetryCount=j=>Number.isSafeInteger(j.proxyRetryCount)?j.proxyRetryCount:Math.min(PROXY_JOB_RETRY_LIMIT,Math.max(j.preflightRetryCount||0,j.consecutiveReadRetries||0,j.retryLimit||0));
export async function runPinnedProxyJob({job,attempt,load,retry,skip,wait,shouldStop=()=>false,onStop=async()=>{}}){
 let current=job;
 while(!shouldStop()){
  await attempt(current);const pending=await load(current);if(!pending?.retryProxyPending)return;
  if(shouldStop()){await onStop(pending);return;}
  const used=proxyRetryCount(pending),schedulingWait=managerWait(pending.retryProxyResult?.reason);if(!schedulingWait&&used>=PROXY_JOB_RETRY_LIMIT){await skip(pending);return;}
  current=await retry(pending,used+(schedulingWait?0:1),{schedulingWait});if(!current)return;if(await wait(current)===false)return;
 }
 await onStop(current);
}
