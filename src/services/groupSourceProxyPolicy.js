import {boundedProxyRead,flowReadAction} from './crawlerQueueFlow.js';
import {validEndpoint} from './proxyAvoidance.js';
export const GROUP_CURSOR_PROXY_DONE='GROUP_CURSOR_PROXY_ERROR';
export const GROUP_CURSOR_PROXY_PARTIAL='GROUP_CURSOR_PROXY_PARTIAL';
export const GROUP_CURSOR_PROXY_WAIT_MS=120000;
export const GROUP_CURSOR_PROXY_REPLACEMENTS=2;
export function isGroupCursorRead(queue,data={},state){
 return queue==='crawler-flow-facebook-group-source'&&((Number.isInteger(data.page)&&data.page>0)||(typeof state?.nativeCursor==='string'&&state.nativeCursor.length>0));
}
export function groupSourceReadPolicy(queue,data={},state){
 if(queue!=='crawler-flow-facebook-group-source')return {};
 return isGroupCursorRead(queue,data,state)
  ?{initialRetries:0,verifyAuthGates:false}
  :{proxyAttemptLimit:10,initialProxyEndpoints:data.groupProxyEndpoints||[]};
}
const waitReasons=new Set(['PROXY_ENDPOINTS_UNAVAILABLE','PROXY_POOL_BUSY','PROXY_PROVIDER_COOLDOWN','PROXY_MANAGER_UNAVAILABLE']);
export function groupCursorProxyWaitUsed(data,now=Date.now()){
 return Math.max(0,Number(data.groupCursorProxyWaitMs)||0)+(data.groupCursorProxyWaitStartedAt>0?Math.max(0,now-data.groupCursorProxyWaitStartedAt):0);
}
export function groupCursorProxyWaitExpired(data,now=Date.now()){
 return data.groupCursorProxyWaitStartedAt>0&&groupCursorProxyWaitUsed(data,now)>=GROUP_CURSOR_PROXY_WAIT_MS;
}
export function groupCursorProxyWaitDeadline(data){
 return data.groupCursorProxyWaitStartedAt>0?data.groupCursorProxyWaitStartedAt+Math.max(0,GROUP_CURSOR_PROXY_WAIT_MS-(Number(data.groupCursorProxyWaitMs)||0)):null;
}
// Budget belongs to the whole source job, not a page or worker activation.
// Only a selected replacement endpoint spends a retry; empty pools only wait.
export async function boundedGroupCursorRead({data,saveBudget=async()=>{},now=Date.now,...options}){
 if(!data.groupCursorProxyBudgetStartedAt&&data.groupCursorProxyWaitStartedAt)data.groupCursorProxyBudgetStartedAt=data.groupCursorProxyWaitStartedAt;
 const endpoints=[...new Set((data.groupCursorProxyEndpoints||[]).filter(validEndpoint))];
 const persist=async()=>saveBudget({groupCursorProxyEndpoints:[...endpoints],groupCursorProxyRetryPending:!!data.groupCursorProxyRetryPending,groupCursorProxyFailedEndpoint:data.groupCursorProxyFailedEndpoint||null,groupCursorProxyLastError:data.groupCursorProxyLastError||null,groupCursorProxyBudgetStartedAt:data.groupCursorProxyBudgetStartedAt||null,groupCursorProxyWaitMs:Math.max(0,Number(data.groupCursorProxyWaitMs)||0),groupCursorProxyWaitStartedAt:data.groupCursorProxyWaitStartedAt||null});
 const partial=async(outcome,budgetReason)=>{
  data.groupCursorProxyWaitMs=groupCursorProxyWaitUsed(data,now());data.groupCursorProxyWaitStartedAt=null;await persist();
  const result=outcome?.result||{status:'proxy_error',reason:data.groupCursorProxyLastError||'PROXY_ENDPOINTS_UNAVAILABLE'};
  await options.onFailure?.(result);
  return {...outcome,done:true,proxyPartial:true,proxyBudgetReason:budgetReason,proxyBudgetStartedAt:data.groupCursorProxyBudgetStartedAt,proxyWaitMs:data.groupCursorProxyWaitMs,cursorProxyCount:endpoints.length,lastResult:result};
 };
 return boundedProxyRead({...options,initialRetries:0,verifyAuthGates:false,retryAnonymousBootstrap:true,
  read:async()=>{
   if(groupCursorProxyWaitExpired(data,now()))return partial(null,'WAIT_LIMIT');
   await options.onRecoveryDeadline?.(data.groupCursorProxyWaitStartedAt?now()+Math.max(0,GROUP_CURSOR_PROXY_WAIT_MS-groupCursorProxyWaitUsed(data,now())):null);
   const pending=data.groupCursorProxyRetryPending,outcome=await options.read(),result=outcome.result,endpoint=result?.transport?.proxyEndpoint;
   if(result?.reason==='PROXY_PACING_WAIT'){
    data.groupCursorProxyLastError=result.reason;data.groupCursorProxyBudgetStartedAt ||=now();data.groupCursorProxyWaitStartedAt ||=now();
    if(groupCursorProxyWaitUsed(data,now())>=GROUP_CURSOR_PROXY_WAIT_MS)return partial(outcome,'WAIT_LIMIT');
    result.retryAfterMs=Math.max(1,Math.min(30000,result.retryAfterMs||500,GROUP_CURSOR_PROXY_WAIT_MS-groupCursorProxyWaitUsed(data,now())));
    await markWait(result);return {...outcome,deferred:true,retryAfterMs:result.retryAfterMs};
   }
   if(pending&&result?.transport?.proxyUsed!==false&&validEndpoint(endpoint)&&endpoint!==data.groupCursorProxyFailedEndpoint){
    if(!endpoints.includes(endpoint))endpoints.push(endpoint);
    data.groupCursorProxyEndpoints=[...endpoints];data.groupCursorProxyRetryPending=false;await persist();
   }
   if(outcome.good){
    if(data.groupCursorProxyWaitStartedAt){data.groupCursorProxyWaitMs=groupCursorProxyWaitUsed(data,now());data.groupCursorProxyWaitStartedAt=null;data.groupCursorProxyRetryPending=false;await persist();}
    return outcome;
   }
   const proxyIssue=waitReasons.has(result?.reason)||result?.reason==='ANONYMOUS_BOOTSTRAP_UNAVAILABLE'||flowReadAction(result,{originScope:options.originScope})==='rotate';
   if(!proxyIssue)return outcome;
   data.groupCursorProxyLastError=result.reason;
   data.groupCursorProxyBudgetStartedAt ||=now();
   data.groupCursorProxyWaitStartedAt ||=now();
   if(groupCursorProxyWaitUsed(data,now())>=GROUP_CURSOR_PROXY_WAIT_MS)return partial(outcome,'WAIT_LIMIT');
   if(endpoints.length>=GROUP_CURSOR_PROXY_REPLACEMENTS)return partial(outcome,'PROXY_LIMIT');
   if(validEndpoint(endpoint)&&result.transport.proxyUsed!==false)data.groupCursorProxyFailedEndpoint=endpoint;
   // Acquire timeouts and unavailable context without an endpoint should also
   // yield to the queue, rather than spin in a worker without spending a proxy.
   if(waitReasons.has(result.reason)||!validEndpoint(endpoint)){
    result.retryAfterMs=Math.max(1,Math.min(30000,result.retryAfterMs||5000,GROUP_CURSOR_PROXY_WAIT_MS-groupCursorProxyWaitUsed(data,now())));
    await options.rotate?.();await markWait(result);
    return {...outcome,deferred:true,retryAfterMs:result.retryAfterMs};
   }
   await persist();return outcome;
  },
  onWait:result=>markWait(result),
  onRetry:async(...args)=>{data.groupCursorProxyRetryPending=true;await persist();await options.onRetry?.(...args);}
 });
 async function markWait(result){if(result.reason!=='PROXY_PACING_WAIT')data.groupCursorProxyRetryPending=true;await persist();await options.onWait?.(result);}
}
