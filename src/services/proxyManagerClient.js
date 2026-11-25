import {crawlerQueue} from './crawlerQueueContext.js';
import {sanitizeManagerRpcDiagnostic} from './readNetworkDiagnostics.js';
import {proxyScope} from './proxyScope.js';
import {apiRequestContext,throwIfApiAborted} from './apiRequestContext.js';
const fail=(code,retryAfterMs)=>Object.assign(Error(code),{code,retryAfterMs});
export function createProxyManagerClient({url=process.env.PROXY_MANAGER_URL,key=process.env.PROXY_MANAGER_AUTH_KEY,fetchImpl=fetch}={}){
 let base;try{base=new URL(url);if(base.username||base.password||base.search||base.hash||base.pathname!=='/'||base.protocol!=='https:'&&!(base.protocol==='http:'&&['127.0.0.1','[::1]','localhost'].includes(base.hostname)))throw Error();}catch{throw fail('PROXY_MANAGER_CONFIG_INVALID');}
 if(typeof key!=='string'||key.length<32)throw fail('PROXY_MANAGER_AUTH_INVALID');
 async function call(endpoint,body,options={}){const cleanup=endpoint==='release',context=cleanup?null:apiRequestContext();if(!cleanup)throwIfApiAborted();const defaultTimeout=endpoint==='acquire'?40000:7000,timeoutMs=Math.max(1,Math.min(defaultTimeout,Number.isFinite(options.timeoutMs)?Math.floor(options.timeoutMs):defaultTimeout,context?context.deadline-Date.now():Infinity));const timeoutSignal=AbortSignal.timeout(timeoutMs),signal=context?AbortSignal.any([timeoutSignal,context.signal]):timeoutSignal,started=performance.now();let r;try{r=await fetchImpl(new URL('v1/'+endpoint,base),{method:body===undefined?'GET':'POST',headers:{authorization:'Bearer '+key,'content-type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)}),redirect:'error',signal});}catch(error){const failure=fail('PROXY_MANAGER_UNAVAILABLE',3000);failure.managerRpc=sanitizeManagerRpcDiagnostic({operation:endpoint,timeoutMs,elapsedMs:performance.now()-started,aborted:signal.aborted,errorType:error?.name,causeCode:error?.cause?.code});throw failure;}
  let data;try{data=await r.json();}catch{throw fail('PROXY_MANAGER_INVALID_RESPONSE');}if(!r.ok)throw fail(/^PROXY_[A-Z_]+$/.test(data.reason||'')?data.reason:'PROXY_MANAGER_REJECTED',data.retryAfterMs);return data;
 }
 const provider=async target=>{const scope=proxyScope(target),queue=crawlerQueue(),data=await call('acquire',{scope,...(queue?{queue}:{}),minRemainingMs:target.minProxyRemainingMs||30000,...(target.excludeProxyEndpoint?{excludeProxyEndpoint:target.excludeProxyEndpoint}:{}),...(target.excludeProxyEndpoints?{excludeProxyEndpoints:target.excludeProxyEndpoints}:{})},{timeoutMs:target.proxyManagerTimeoutMs});let released=false;
  return{...data.proxy,leaseId:data.leaseId,scope,queue,managed:true,expiresAt:data.proxyExpiresAt,generation:data.generation,maxLeasesPerKey:data.maxLeasesPerKey,apiReserved:data.apiReserved,rateCooldownMs:data.rateCooldownMs,
   heartbeat:options=>call('heartbeat',{leaseId:data.leaseId},options),permit:options=>call('permit',{leaseId:data.leaseId,...(options?.reuseTransport===true?{reuseTransport:true}:{})},options),report:(result,options)=>call('report',{leaseId:data.leaseId,result},options),
   release:async options=>{if(!released){released=true;await call('release',{leaseId:data.leaseId},options);}}
  };
 };
 provider.managed=true;
 provider.status=()=>call('status');return provider;
}
