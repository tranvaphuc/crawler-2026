// Deliberately retain no error messages, headers, cookies, bodies or query strings.
const managerOperations=new Set(['acquire','heartbeat','permit','report','release','status']);
const managerCauses=new Set(['ECONNRESET','ECONNREFUSED','ECONNABORTED','ETIMEDOUT','ENETUNREACH','EHOSTUNREACH','ENOTFOUND','EAI_AGAIN','UND_ERR_CONNECT_TIMEOUT','UND_ERR_HEADERS_TIMEOUT','UND_ERR_SOCKET','UND_ERR_ABORTED','ERR_SOCKET_CLOSED']);
export function sanitizeManagerRpcDiagnostic(value){
 if(!value||!managerOperations.has(value.operation)||!Number.isFinite(value.timeoutMs)||!Number.isFinite(value.elapsedMs))return null;
 return{operation:value.operation,timeoutMs:Math.max(1,Math.min(40000,Math.floor(value.timeoutMs))),elapsedMs:Math.max(0,Math.min(3600000,Math.round(value.elapsedMs))),aborted:value.aborted===true,errorType:['TimeoutError','AbortError','TypeError','Error'].includes(value.errorType)?value.errorType:'Error',causeCode:managerCauses.has(value.causeCode)?value.causeCode:null};
}
const safeCode=value=>/^[A-Za-z][A-Za-z0-9_.:-]{0,159}$/.test(value||'')?value:null;
const safeRoute=value=>{try{const u=new URL(value);return /^https?:$/.test(u.protocol)?u.origin+u.pathname:null;}catch{return null;}};
const timingFields=['request','proxyConnectMs','socketMs','tlsMs','headersMs','firstBodyMs','firstWireMs','wireEndedMs','decodedEndedMs','elapsedMs','wireBytes','decodedBytes','declaredWireBytes','wireBufferedBytes','timeoutOvershootMs','tlsHandshakeLimitMs','connectLimitMs','httpStatus','connectStatus'];
export function readNetworkDiagnostic(result,{jobId,queue,platform,retry=0,includeNonNetwork=false}={}){
 const t=result?.transport||{},managerRpc=sanitizeManagerRpcDiagnostic(t.managerRpc),timings=(t.networkTimings||[]).slice(-8);
 if(!includeNonNetwork&&!/NETWORK|TIMEOUT|ECONN|TLS|PROXY/.test(result?.reason||'')&&!timings.some(x=>x.outcome==='error'))return null;
 const networkTimings=timings.map(x=>({...Object.fromEntries(timingFields.filter(k=>Number.isFinite(x[k])).map(k=>[k,x[k]])),route:safeRoute(x.route),method:safeCode(x.method),phase:safeCode(x.phase),reason:safeCode(x.reason),nativeCode:safeCode(x.nativeCode),bodyEncoding:safeCode(x.bodyEncoding),syscall:safeCode(x.syscall),outcome:safeCode(x.outcome),reusedSocket:x.reusedSocket===true,wireComplete:typeof x.wireComplete==='boolean'?x.wireComplete:null,responseAborted:x.responseAborted===true,...(x.blockedRedirect?{blockedRedirect:{from:safeRoute(x.blockedRedirect.from),to:safeRoute(x.blockedRedirect.to),httpStatus:Number.isInteger(x.blockedRedirect.httpStatus)?x.blockedRedirect.httpStatus:null}}:{})}));
 const last=networkTimings.findLast(x=>x.outcome==='error')||networkTimings.at(-1);
 return {version:1,jobId,queue,platform,retry,reason:safeCode(result.reason),upstreamCode:safeCode(result.upstreamCode),operation:safeCode(result.upstreamOperation),phase:last?.phase||(/PROXY_MANAGER|PROXY_REQUIRED|PROXY_RETRY_ENDPOINT/.test(result.reason||'')?'proxy_assignment':'unobserved'),nativeCode:last?.nativeCode||safeCode(result.upstreamCode),proxyEndpoint:/^[a-f0-9]{64}$/.test(t.proxyEndpoint||'')?t.proxyEndpoint:null,...(managerRpc?{managerRpc}:{}),networkTimings};
}
