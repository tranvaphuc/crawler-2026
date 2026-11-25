// Temporary transport health, not proof of origin rate limiting. Only endpoint
// hashes and expiry times enter durable jobs; never leases or credentials.
export const PROXY_TLS_AVOID_MS=120000;
export const PROXY_CONNECT_AVOID_MS=30000;
export const PROXY_RETRY_AVOID_MS=300000;
export const validEndpoint=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
export function activeProxyFailures(context={},now=Date.now()){
 return Object.fromEntries(Object.entries(context.excludedProxyEndpoints||{}).filter(([key,until])=>validEndpoint(key)&&Number.isFinite(until)&&until>now).slice(-128));
}
export function proxyExclusions(context={},now=Date.now()){
 const endpoints=Object.keys(activeProxyFailures(context,now));
 // Legacy callers still exclude the immediately preceding endpoint.
 if(!context.excludedProxyEndpoints&&validEndpoint(context.excludeProxyEndpoint))endpoints.push(context.excludeProxyEndpoint);
 return [...new Set(endpoints)];
}
export function proxyRetryContext(data={},now=Date.now()){
 const context={excludedProxyEndpoints:activeProxyFailures(data,now),excludeProxyEndpoint:data.excludeProxyEndpoint};
 if(!data.excludedProxyEndpoints&&validEndpoint(data.excludeProxyEndpoint))context.excludedProxyEndpoints[data.excludeProxyEndpoint]=now+PROXY_RETRY_AVOID_MS;
 return context;
}
export function rememberProxyFailure(context,result,now=Date.now()){
 const endpoint=result?.transport?.proxyEndpoint;
 context.excludedProxyEndpoints=activeProxyFailures(context,now);
 if(result?.reason!=='PROXY_PACING_WAIT'&&validEndpoint(endpoint)&&result.transport.proxyUsed!==false){
  context.excludedProxyEndpoints[endpoint]=now+PROXY_RETRY_AVOID_MS;
  context.excludeProxyEndpoint=endpoint;
 }
 return {excludedProxyEndpoints:context.excludedProxyEndpoints,excludeProxyEndpoint:context.excludeProxyEndpoint};
}
export function proxyTlsEvidence(reason,timings=[]){
 const last=timings.findLast(t=>t.outcome==='error');
 return {reason,phase:last?.phase||null,nativeCode:last?.nativeCode||null,connectStatus:last?.connectStatus??null,...(timings.some(t=>Number.isFinite(t.headersMs)&&Number.isInteger(t.httpStatus)&&t.httpStatus>=100&&t.httpStatus!==407&&(t.connectStatus===200||t.reusedSocket===true))?{responseObserved:true}:{})};
}
export function isProxyTlsFailure({reason,phase,nativeCode,connectStatus}={}){
 return reason==='PROXY_TLS_HANDSHAKE_TIMEOUT'||phase==='proxy_tls'&&connectStatus===200&&['ECONNRESET','EPIPE','ETIMEDOUT','PROXY_TLS_HANDSHAKE_TIMEOUT'].includes(nativeCode);
}

export function isProxyConnectFailure({phase,nativeCode,connectStatus}={}){
 return phase==='proxy_connect'&&(connectStatus==null||connectStatus===0)&&['ECONNRESET','EPIPE','ETIMEDOUT','ECONNREFUSED','EHOSTUNREACH','ENETUNREACH','EAI_AGAIN','ENOTFOUND','PROXY_CONNECT_TIMEOUT','PROXY_CONNECT_EOF','UPSTREAM_TIMEOUT'].includes(nativeCode);
}
