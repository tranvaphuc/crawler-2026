import {crawlerQueue} from './crawlerQueueContext.js';
import {sanitizeManagerRpcDiagnostic} from './readNetworkDiagnostics.js';
import {isAuthGate,sourceRestrictionEvidence} from './socialAuthGate.js';
import {platformWait,deferPlatform}from './socialCooldown.js';
import https from 'node:https';
import {proxyScope} from './proxyScope.js';
import {proxyEndpoint} from './proxyEndpoint.js';
import {proxyExclusions,proxyTlsEvidence} from './proxyAvoidance.js';
import {createGunzip,createInflate,createBrotliDecompress} from 'node:zlib';
import * as compression from 'node:zlib';
import {TransportAwareProxyAgent,hasReusableProxyTunnel} from './proxyWarmTransport.js';
import {normalizeBrowserProxy,createConfiguredProxyProvider} from './socialProxyConfig.js';
import {apiRequestContext,apiAwait,boundedApiCleanup,throwIfApiAborted} from './apiRequestContext.js';
export const fail = code => Object.assign(new Error(code),{code});
export function retryAfterMs(value,fallback=null,now=Date.now()){
 const raw=String(value??'').trim();if(!raw)return fallback;
 const ms=/^\d+(?:\.\d+)?$/.test(raw)?Number(raw)*1000:Date.parse(raw)-now;
 return Number.isFinite(ms)&&ms>=0?Math.max(1,ms):fallback;
}
const hosts={facebook:['facebook.com'],threads:['threads.com','threads.net'],instagram:['instagram.com'],youtube:['youtube.com','youtu.be']};
export function assertPlatformUrl(value,platform){
 let u;try{u=new URL(value);}catch{throw fail('UNSAFE_REDIRECT');}
 if(u.protocol!=='https:'||u.username||u.password||u.port||!hosts[platform]?.some(h=>u.hostname===h||u.hostname.endsWith('.'+h)))throw fail('UNSAFE_REDIRECT');
 return u;
}
export function httpFailure(error){
 const code=String(error?.code||'');
 if(/^(?:PROXY_[A-Z_]+|INVALID_PROXY|UPSTREAM_TIMEOUT|UPSTREAM_TOO_LARGE|UPSTREAM_UNSUPPORTED_ENCODING|UNSAFE_REDIRECT|ORIGIN_SECURITY_CHALLENGE|TOO_MANY_REDIRECTS|NATIVE_PAGINATION_UNAVAILABLE|COOLDOWN_STATE_UNAVAILABLE)$/.test(code))return code;
 if(/CERT|TLS|SSL|SELF_SIGNED|UNABLE_TO_VERIFY/.test(code))return 'TLS_VALIDATION_FAILED';
 if(/407|proxy authentication/i.test(String(error?.message||'')))return 'PROXY_AUTH_REQUIRED';
 return 'UPSTREAM_NETWORK_ERROR';
}
export function createProxiedSession({proxy,platform,deadline=Date.now()+60000,maxBytes=12000000,requestImpl=https.request,onProxyLimit=()=>{},requestTimeoutMs=Infinity,connectTimeoutMs=Infinity,tlsHandshakeTimeoutMs=Infinity}){
 const p=normalizeBrowserProxy(proxy),proxyUrl=new URL(p.server);proxyUrl.username=p.username;proxyUrl.password=p.password;
 // AbortSignal also owns CONNECT sockets before Node assigns them to a request.
 const sessionAbort=new AbortController();
 const agent=new TransportAwareProxyAgent(proxyUrl,{timeout:Math.max(1,Math.min(requestTimeoutMs,deadline-Date.now())),signal:sessionAbort.signal,keepAlive:true,maxSockets:1,maxFreeSockets:1});
 const cookies=new Map();let requests=0,networkRetries=0,closed=false,cookieVersion=0;const activeRequests=new Set(),requestTimings=[];
 async function request(value,{method='GET',body,headers={},redirects=0,networkRetry=0}={}){
  const url=assertPlatformUrl(value,platform);if(Number.isFinite(proxy.expiresAt)&&Date.now()>=proxy.expiresAt-1000)throw fail('PROXY_EXPIRED');
  const permit=await proxy.beforeRequest?.({reuseTransport:hasReusableProxyTunnel(agent,url)});if(Number.isFinite(proxy.expiresAt)&&Date.now()>=proxy.expiresAt-1000)throw fail('PROXY_EXPIRED');if(closed||Date.now()>=deadline)throw fail('UPSTREAM_TIMEOUT');requests++;
  const requestStarted=Date.now(),requestDeadline=Math.min(deadline,requestStarted+requestTimeoutMs);
  const timing={request:requests,method,tlsMs:null,reusedSocket:false,proxyConnectMs:null,socketMs:null,headersMs:null,firstBodyMs:null,wireBytes:0,firstWireMs:null,wireEndedMs:null,decodedEndedMs:null};requestTimings.push(timing);if(requestTimings.length>8)requestTimings.shift();
  return new Promise((resolve,reject)=>{
   let done=false,timer,connectTimer,tlsTimer,responseSeen=false,response=null;const finish=(err,v)=>{if(done)return;done=true;clearTimeout(timer);clearTimeout(connectTimer);clearTimeout(tlsTimer);activeRequests.delete(req);
    timing.elapsedMs=Date.now()-requestStarted;timing.outcome=err?'error':'complete';
    if(response){timing.wireComplete=response.complete===true;timing.wireBufferedBytes=Number.isSafeInteger(response.readableLength)?response.readableLength:0;}
    if(err){timing.route=url.origin+url.pathname;timing.reason=httpFailure(err);if(/^[A-Z][A-Z0-9_]{0,79}$/.test(err.code||''))timing.nativeCode=err.code;if(/^[a-zA-Z0-9_]{1,40}$/.test(err.syscall||''))timing.syscall=err.syscall;timing.phase=timing.decodeError?'response_decode':timing.headersMs!==null?'response_body':timing.connectStatus&&timing.connectStatus!==200?'proxy_connect':timing.tlsPending?'proxy_tls':timing.socketMs!==null?'response_headers':timing.proxyConnectMs!==null?'proxy_tls':'proxy_connect';}else timing.phase='complete';
    // Failed requests return to the job retry loop, which excludes this endpoint.
    err?reject(err):resolve(v);};
   const jar=cookies.get(url.hostname),data=body==null?null:Buffer.from(typeof body==='string'?body:JSON.stringify(body));
   const safeHeaders=Object.fromEntries(Object.entries(headers).filter(([k])=>k.toLowerCase()!=='accept-encoding'));
   const req=requestImpl(url,{method,agent,...(permit?.requiresWarmTunnel===true?{crawlerWarmTunnelOnly:Math.max(1,permit.retryAfterMs||1000)}:{}),headers:{'user-agent':'Mozilla/5.0',accept:'text/html','accept-language':'en-US,en;q=0.9','accept-encoding':'gzip, deflate, br',...(jar?.size?{cookie:[...jar].map(([k,v])=>`${k}=${v}`).join('; ')}:{}),...safeHeaders,...(data?{'content-length':data.length}:{})}},res=>{
    responseSeen=true;response=res;timing.headersMs=Date.now()-requestStarted;timing.httpStatus=res.statusCode;
    for(const line of res.headers['set-cookie']||[]){const [pair]=line.split(';'),at=pair.indexOf('=');if(at>0){if(!cookies.has(url.hostname))cookies.set(url.hostname,new Map());const jar=cookies.get(url.hostname),key=pair.slice(0,at),value=pair.slice(at+1);if(jar.get(key)!==value)cookieVersion++;jar.set(key,value);}}
    if([301,302,303,307,308].includes(res.statusCode)&&res.headers.location){
     timing.redirected=true;timing.redirectResponseMs=Date.now()-requestStarted;res.resume();if(redirects>=3)return finish(fail('TOO_MANY_REDIRECTS'));
     let next;try{next=assertPlatformUrl(new URL(res.headers.location,url).href,platform);}catch(e){
      // Public route only: never retain redirect query strings, credentials or tokens.
      const route=value=>{try{const u=new URL(value,url);return u.protocol+'//'+u.host+u.pathname;}catch{return '[invalid-url]';}};
      timing.blockedRedirect={from:route(url.href),to:route(res.headers.location),httpStatus:res.statusCode};
      // The redirect remains blocked. A native Google challenge is not a
      // broken proxy or proof of empty/deleted content; never rotate to evade it.
      let blocked;try{blocked=new URL(res.headers.location,url);}catch{}
      const challenge=platform==='youtube'&&blocked?.protocol==='https:'&&!blocked.username&&!blocked.password&&!blocked.port&&['www.google.com','google.com'].includes(blocked.hostname)&&/^\/sorry(?:\/|$)/.test(blocked.pathname);
      return finish(challenge?fail('ORIGIN_SECURITY_CHALLENGE'):e);
     }
     clearTimeout(timer);const switchGet=res.statusCode===303||([301,302].includes(res.statusCode)&&method==='POST');
     request(next.href,{method:switchGet?'GET':method,body:switchGet?undefined:body,headers,redirects:redirects+1,networkRetry}).then(v=>finish(null,v),finish);return;
    }
    if(res.statusCode===407){res.resume();return finish(fail('PROXY_AUTH_REQUIRED'));}
    // Origin 429 already proves a failed request, not an IP/proxy limit.
    // Do not let a slow/unending error body occupy the worker or mask it as timeout.
    if(res.statusCode===429){timing.bodySkipped=true;finish(null,{httpStatus:429,finalUrl:url.href,html:'',retryAfterMs:retryAfterMs(res.headers['retry-after'],900000),retryAfter:res.headers['retry-after']||null,headers:res.headers});res.destroy();req.destroy();return;}
    const encoding=res.headers['content-encoding'];let stream=res;
    timing.bodyEncoding=['gzip','deflate','br','zstd'].includes(encoding)?encoding:!encoding||encoding==='identity'?'identity':'other';
    const declared=String(res.headers['content-length']??'');if(/^\d+$/.test(declared)&&Number.isSafeInteger(Number(declared)))timing.declaredWireBytes=Number(declared);
    // Observe without retaining raw chunks or logging any request/response contents.
    res.on('data',chunk=>{if(done)return;if(timing.firstWireMs===null)timing.firstWireMs=Date.now()-requestStarted;timing.wireBytes+=chunk.length;});
    res.on('end',()=>{if(!done)timing.wireEndedMs=Date.now()-requestStarted;});
    res.on('aborted',()=>{timing.responseAborted=true;});
    if(encoding==='gzip')stream=res.pipe(createGunzip());else if(encoding==='deflate')stream=res.pipe(createInflate());else if(encoding==='br')stream=res.pipe(createBrotliDecompress({chunkSize:262144}));else if(encoding==='zstd'&&typeof compression.createZstdDecompress==='function')stream=res.pipe(compression.createZstdDecompress());else if(encoding&&encoding!=='identity'){res.resume();return finish(fail('UPSTREAM_UNSUPPORTED_ENCODING'));}
    const chunks=[];let size=0;
    res.on('error',e=>{stream.destroy();finish(e);});
    stream.on('data',chunk=>{if(timing.firstBodyMs===null)timing.firstBodyMs=Date.now()-requestStarted;size+=chunk.length;timing.decodedBytes=size;if(size>maxBytes){const e=fail('UPSTREAM_TOO_LARGE');stream.destroy(e);req.destroy(e);}else chunks.push(chunk);});
    stream.on('error',e=>{if(stream!==res&&/^Z_|^ERR_.*(?:DECOMPRESS|BROTLI|ZSTD)/.test(e.code||''))timing.decodeError=true;finish(e);});stream.on('end',()=>{if(done)return;timing.decodedEndedMs=Date.now()-requestStarted;finish(null,{httpStatus:res.statusCode,finalUrl:url.href,html:Buffer.concat(chunks).toString('utf8'),retryAfterMs:retryAfterMs(res.headers['retry-after'],res.statusCode===429?900000:null),retryAfter:res.headers['retry-after']||null,headers:res.headers});});
   });
   // Settle our own timeout before aborting: abort can emit ECONNRESET synchronously.
   activeRequests.add(req);timer=setTimeout(()=>{const e=fail(proxy.expiresAt&&Date.now()>=proxy.expiresAt-1000?'PROXY_EXPIRED':'UPSTREAM_TIMEOUT');timing.timeoutOvershootMs=Math.max(0,Date.now()-requestDeadline);finish(e);closed=true;sessionAbort.abort(e);req.destroy(e);},Math.max(1,Math.min(requestDeadline,proxy.expiresAt||Infinity)-Date.now()));
   if(Number.isFinite(connectTimeoutMs)&&connectTimeoutMs>0)connectTimer=setTimeout(()=>{
    const e=fail('PROXY_CONNECT_TIMEOUT');timing.connectLimitMs=connectTimeoutMs;
    finish(e);closed=true;sessionAbort.abort(e);req.destroy(e);
   },connectTimeoutMs);
   req.on('socket',socket=>{
    clearTimeout(connectTimer);
    timing.socketMs=Date.now()-requestStarted;timing.reusedSocket=req.reusedSocket===true;
    timing.tlsPending=socket?.encrypted===true&&socket.secureConnecting===true;
    if(socket?.encrypted&&!timing.tlsPending)timing.tlsMs=timing.socketMs;
    // The proxy agent assigns the origin socket after CONNECT. Its DNS/TCP
    // handshake is included in proxyConnectMs, not observable as origin DNS.
    if(timing.tlsPending){
     if(Number.isFinite(tlsHandshakeTimeoutMs)&&tlsHandshakeTimeoutMs>0)tlsTimer=setTimeout(()=>{
      const e=fail('PROXY_TLS_HANDSHAKE_TIMEOUT');timing.tlsHandshakeLimitMs=tlsHandshakeTimeoutMs;
      finish(e);closed=true;sessionAbort.abort(e);req.destroy(e);
     },tlsHandshakeTimeoutMs);
     socket.once('secureConnect',()=>{clearTimeout(tlsTimer);if(done)return;timing.tlsMs=Date.now()-requestStarted;timing.tlsPending=false;});
    }
   });
   req.on('proxyConnect',connect=>{clearTimeout(connectTimer);timing.proxyConnectMs=Date.now()-requestStarted;timing.connectStatus=connect.statusCode;if(connect.statusCode===429){onProxyLimit({source:'proxy_connect',scope:'proxy',confirmed:true,httpStatus:429});const e=fail('PROXY_CONNECT_RATE_LIMITED');req.destroy(e);finish(e);}});
   req.on('error',e=>finish(e));if(data)req.write(data);req.end();
  });
 }
 return {request,seedFacebookCookies(header){
  if(platform!=='facebook'||typeof header!=='string'||/[\r\n\0]/.test(header))throw fail('FACEBOOK_SESSION_COOKIE_INVALID');
  const jar=cookies.get('www.facebook.com')||new Map(),next=new Map(header.split(';').map(pair=>{const at=pair.indexOf('=');if(at<1)throw fail('FACEBOOK_SESSION_COOKIE_INVALID');return[pair.slice(0,at).trim(),pair.slice(at+1).trim()];}));
  if(!/^\d+$/.test(next.get('c_user')||'')||!next.get('xs')||jar.has('c_user')&&jar.get('c_user')!==next.get('c_user'))throw fail('FACEBOOK_SESSION_COOKIE_INVALID');
  for(const [key,value]of next){if(jar.get(key)!==value)cookieVersion++;jar.set(key,value);}cookies.set('www.facebook.com',jar);
 },setDeadline(value){deadline=value;},get cookieVersion(){return cookieVersion;},get requests(){return requests;},get networkRetries(){return networkRetries;},get requestTimings(){return requestTimings.map(x=>({...x}));},close(){closed=true;sessionAbort.abort(fail('UPSTREAM_TIMEOUT'));cookies.clear();for(const req of activeRequests)req.destroy(fail('UPSTREAM_TIMEOUT'));activeRequests.clear();agent.destroy();}};
}
export function createHttpExecutor({getProxy=createConfiguredProxyProvider(),timeoutMs=60000,connectTimeoutMs=Infinity,tlsHandshakeTimeoutMs=Infinity,makeSession=createProxiedSession,respectPlatformCooldown=makeSession===createProxiedSession,idleMs=120000,failFastProxy=false,attemptTimeoutMs=timeoutMs,maxProxyPacingWaitMs=0,anonymous=true}={}){
 const observations=new WeakMap();
 return async(target,work,sticky)=>{
  const context=apiRequestContext(),requestQueue=crawlerQueue(),pacingWaitLimit=typeof maxProxyPacingWaitMs==='function'?maxProxyPacingWaitMs(target):maxProxyPacingWaitMs;throwIfApiAborted();
  const binding=sticky||{},retryContext=target.proxyRetryContext||binding,deadline=Math.min(Date.now()+attemptTimeoutMs,context?.deadline||Infinity,failFastProxy&&crawlerQueue()==='crawler-flow-facebook-group-source'&&Number.isFinite(target.proxyRecoveryDeadlineAt)?target.proxyRecoveryDeadlineAt:Infinity);let startRequests=binding.session?.requests||0,startRetries=binding.session?.networkRetries||0,used=false,locked=false,apiScope=null,proxyLimitEvidence=null,executionPhase='proxy_acquire',failurePhase=null,failureNative=null,managerRpc=null;
  const abort=()=>{binding.disposeAfterUse=true;binding.session?.close();};
  const managerOptions=()=>failFastProxy?{timeoutMs:Math.max(1,Math.min(timeoutMs,deadline-Date.now()))}:undefined;
  // Background group finalization must outlive an expired read or a pooled
  // session's creator; permits/native reads still use the current read budget.
  const finalizationOptions=()=>!context&&failFastProxy&&requestQueue==='crawler-flow-facebook-group-source'?{timeoutMs:2000}:managerOptions();
  const transport=()=>({mode:'http',browserUsed:false,anonymous:typeof anonymous==='function'?anonymous(target):anonymous,proxyUsed:used,...(failurePhase?{failurePhase,nativeCode:failureNative}:{}),...(managerRpc?{managerRpc}:{}),...(target.proxyRetryContext&&binding.endpoint?{proxyEndpoint:binding.endpoint}:{}),requests:Math.max(0,(binding.session?.requests||0)-startRequests),...(binding.session?.requestTimings?.length?{networkTimings:binding.session.requestTimings.filter(x=>x.request>startRequests)}:{}),...((binding.session?.networkRetries||0)>startRetries?{networkRetries:binding.session.networkRetries-startRetries}:{}),...(getProxy.managed||binding.lease?.managed?{manager:true,scope:binding.lease?.scope||apiScope,...(crawlerQueue()?{queue:crawlerQueue()}:{}),sessionEpoch:binding.epoch||0}:{}),...(binding.reportError?{managerReportFailed:true}:{}),...(proxyLimitEvidence?{proxyLimitEvidence}:{}),...(binding.changedThisCall?{proxySessionChanged:true,resumeStrategy:'refresh_session_keep_cursor'}:{})});
  function groupPacingWait(result){
   if(!failFastProxy||requestQueue!=='crawler-flow-facebook-group-source'||!binding.lease?.managed||result?.reason!=='PROXY_PACING_WAIT')return null;
   // A denied permit is a scheduling wait, not evidence against this proxy.
   // Keep the tunnel; a rejected bootstrap promise must be recreated on resume.
   failurePhase='proxy_permit';failureNative='PROXY_PACING_WAIT';binding.disposeAfterUse=false;
   if((binding.session?.requests||0)===startRequests)used=false;
   if(binding.facebookRequest?.bootstrapReady!==true){delete binding.facebookRequest;delete binding.facebookRequestSession;}
   return{...result,status:'proxy_error',reason:'PROXY_PACING_WAIT',retryAfterMs:Math.max(1,Math.min(30000,Number(result.retryAfterMs)||500)),transport:transport()};
  }
  async function close(){clearTimeout(binding.idleTimer);binding.session?.close();binding.session=null;const lease=binding.lease;binding.lease=null;try{if(context)await boundedApiCleanup(()=>lease?.release?.({timeoutMs:1000}));else await lease?.release?.(finalizationOptions());}catch{}}
  binding.dispose=async()=>{if(binding.busy){binding.disposeAfterUse=true;return;}await close();};
  try{
   if(binding.busy)return{status:'busy',reason:'CURSOR_IN_USE',retryAfterMs:1000,transport:transport()};binding.busy=true;locked=true;clearTimeout(binding.idleTimer);binding.changedThisCall=false;binding.disposeAfterUse=false;context?.signal.addEventListener('abort',abort,{once:true});
   // A pooled session outlives one read. Its permit hook must use the current
   // read budget and diagnostic context, never its creator's deadline.
   binding.requestControl={deadline,managerOptions,setPhase:phase=>{executionPhase=phase;},recordRpc:error=>{managerRpc ||=sanitizeManagerRpcDiagnostic(error?.managerRpc);}};
   if(binding.lease?.managed&&binding.lease.queue!==crawlerQueue()){await close();binding.terminal=null;binding.blockedUntil=0;}
   if(binding.terminal)return{status:binding.terminal.status,reason:binding.terminal.reason,transport:transport()};
   if(binding.blockedUntil>Date.now())return{status:'rate_limited',reason:'API_COOLDOWN',retryAfterMs:binding.blockedUntil-Date.now(),transport:transport()};
   const scope=proxyScope(target);apiScope=scope;const wait=respectPlatformCooldown&&!getProxy.managed?platformWait(scope):0;
   if(wait>0)return{status:'rate_limited',reason:'API_COOLDOWN',retryAfterMs:wait,transport:transport()};
   for(let attempt=0;attempt<(failFastProxy?1:2);attempt++){
    let createdThisAttempt=false;
    if(binding.lease){executionPhase='proxy_heartbeat';try{if(binding.lease.expiresAt&&binding.lease.expiresAt<=Date.now()+1000)throw fail('PROXY_EXPIRED');await apiAwait(binding.lease.heartbeat?.(managerOptions()));}catch(e){if(failFastProxy||!['PROXY_EXPIRED','PROXY_LEASE_EXPIRED'].includes(e.code))throw e;retryContext.excludeProxyEndpoint=binding.endpoint;await close();}}
    if(!binding.lease){executionPhase='proxy_acquire';let expired=false,timer;const acquisition=Promise.resolve().then(()=>{throwIfApiAborted();return getProxy({...target,excludeProxyEndpoint:proxyExclusions(retryContext).includes(retryContext.excludeProxyEndpoint)?retryContext.excludeProxyEndpoint:undefined,excludeProxyEndpoints:proxyExclusions(retryContext),...(failFastProxy?{proxyManagerTimeoutMs:Math.max(1,Math.min(timeoutMs,deadline-Date.now()))}:{})});}).then(async value=>{if(expired||context?.signal.aborted){try{if(context)await boundedApiCleanup(()=>value?.release?.({timeoutMs:1000}));else await value?.release?.();}catch{}}return value;});
     try{binding.lease=await apiAwait(Promise.race([acquisition,new Promise((_,reject)=>{timer=setTimeout(()=>{expired=true;reject(fail('UPSTREAM_TIMEOUT'));},Math.max(1,Math.min(timeoutMs,deadline-Date.now())));})]));}catch(e){expired=true;throw e;}finally{clearTimeout(timer);}
     if(!binding.lease)throw fail('PROXY_REQUIRED');
     if(proxyExclusions(retryContext).includes(proxyEndpoint(binding.lease)))throw fail('PROXY_RETRY_ENDPOINT_UNAVAILABLE');
     binding.endpoint=proxyEndpoint(binding.lease);binding.changedThisCall=binding.started===true&&binding.lease.managed===true;binding.started=binding.lease.managed===true;createdThisAttempt=true;binding.epoch=(binding.epoch||0)+1;
     const lease=binding.lease;
     const beforeRequest=async({reuseTransport=false}={})=>{if(!lease.managed)return;const control=binding.requestControl,{deadline}=control;let waited=0;while(Date.now()<deadline){try{control.setPhase('proxy_permit');const permit=await lease.permit({...control.managerOptions(),reuseTransport});control.setPhase('read_work');return permit;}catch(e){control.recordRpc(e);if(failFastProxy){if(e.code==='PROXY_PACING_WAIT'&&e.retryAfterMs>0&&e.retryAfterMs+waited<=pacingWaitLimit&&Date.now()+e.retryAfterMs<deadline-1000){waited+=e.retryAfterMs;await new Promise(r=>setTimeout(r,e.retryAfterMs));continue;}throw e;}if(e.code==='PROXY_PACING_WAIT'&&e.retryAfterMs>0&&Date.now()+e.retryAfterMs<deadline-1000){waited+=e.retryAfterMs;await new Promise(r=>setTimeout(r,e.retryAfterMs));continue;}throw e;}}throw fail('UPSTREAM_TIMEOUT');};
     binding.session=makeSession({proxy:{...lease,beforeRequest},platform:target.platform,deadline,requestTimeoutMs:timeoutMs,connectTimeoutMs,tlsHandshakeTimeoutMs,onProxyLimit:e=>{proxyLimitEvidence={...e,endpoint:binding.endpoint};}});
    }
    binding.session.setDeadline?.(deadline);used=true;startRequests=createdThisAttempt?0:binding.session.requests||0;startRetries=createdThisAttempt?0:binding.session.networkRetries||0;
    let workTimer,heartbeat;const lease=binding.lease;
    if(lease.managed){heartbeat=setInterval(()=>lease.heartbeat().catch(()=>{}),15000);heartbeat.unref();}
    let result,restrictionEvidence=null;
    let observation=observations.get(binding.session);
    if(!observation){
     observation={onSnapshot:null};
     observation.session=new Proxy(binding.session,{get(session,key){
      if(key==='request')return async(...args)=>{const snapshot=await session.request(...args);observation.onSnapshot?.(snapshot);return snapshot;};
      return Reflect.get(session,key,session);
     }});
     observations.set(binding.session,observation);
    }
    observation.onSnapshot=snapshot=>{restrictionEvidence=sourceRestrictionEvidence(snapshot)||restrictionEvidence;};
    const observedSession=observation.session;
    try{executionPhase='read_work';result=await apiAwait(Promise.race([Promise.resolve().then(()=>work(observedSession,deadline,{sessionChanged:binding.changedThisCall,epoch:binding.epoch})),new Promise((_,reject)=>{workTimer=setTimeout(()=>{executionPhase='read_attempt_deadline';reject(fail('UPSTREAM_TIMEOUT'));},Math.max(1,deadline-Date.now()));})]));}
    catch(e){if(!failFastProxy&&['PROXY_EXPIRED','PROXY_LEASE_EXPIRED'].includes(e.code)&&attempt===0&&Date.now()<deadline-2000){retryContext.excludeProxyEndpoint=binding.endpoint;await close();continue;}throw e;}
    finally{observation.onSnapshot=null;clearTimeout(workTimer);clearInterval(heartbeat);}
    const pacing=groupPacingWait(result);if(pacing)return pacing;
    if(!failFastProxy&&['PROXY_EXPIRED','PROXY_LEASE_EXPIRED'].includes(result.reason)&&attempt===0&&Date.now()<deadline-2000){retryContext.excludeProxyEndpoint=binding.endpoint;await close();continue;}
    if(['PROXY_SCOPE_COOLDOWN','PROXY_RETRY_LATER'].includes(result.reason)&&lease.managed){result={...result,status:'proxy_error',reason:result.reason==='PROXY_SCOPE_COOLDOWN'?'PROXY_ASSIGNMENT_COOLDOWN':'PROXY_ASSIGNMENT_BACKOFF',retryAfterMs:0};binding.disposeAfterUse=true;binding.blockedUntil=0;}
    const upstreamRetry=result.retryAfterMs>0?result.retryAfterMs:retryAfterMs(result.retryAfter);
    if(result.status==='rate_limited'||/RATE_LIMITED$/.test(result.reason||'')){result.retryAfterMs=upstreamRetry||lease.rateCooldownMs||900000;binding.blockedUntil=Date.now()+result.retryAfterMs;binding.disposeAfterUse=true;if(!failFastProxy||proxyLimitEvidence?.source==='proxy_connect'){lease.defer?.(result.retryAfterMs);if(respectPlatformCooldown&&!lease.managed)deferPlatform(scope,result.retryAfterMs);}}
    if(isAuthGate(result)||restrictionEvidence&&!['ok','partial','resolved'].includes(result.status))result={...result,authGate:restrictionEvidence||{classification:'unverified',confirmed:false,evidence:'anonymous_login_or_checkpoint'}};
    if(['auth_required','security_checkpoint'].includes(result.status)){binding.terminal={status:result.status,reason:result.reason};binding.disposeAfterUse=true;}
    if(lease.managed){const rate=result.status==='rate_limited'||/RATE_LIMITED$/.test(result.reason||'');const reportRate=rate&&(!failFastProxy||proxyLimitEvidence?.source==='proxy_connect');const unconfirmed=failFastProxy&&!proxyLimitEvidence&&(rate||['auth_required','security_checkpoint'].includes(result.status));const allowed=new Set(['ok','partial','resolved','error','proxy_error','rate_limited','auth_required','security_checkpoint','unavailable','sort_unavailable','unknown']);try{const recorded=await apiAwait(lease.report({status:reportRate?'rate_limited':unconfirmed?'error':allowed.has(result.status)?result.status:result.ok?'ok':'unknown',...proxyTlsEvidence(result.reason,binding.session?.requestTimings?.filter(t=>t.request>startRequests)),retryAfterMs:reportRate?upstreamRetry:result.retryAfterMs},finalizationOptions()));if(reportRate&&recorded?.retryAfterMs>0){result.retryAfterMs=recorded.retryAfterMs;binding.blockedUntil=Date.now()+recorded.retryAfterMs;}binding.reportError=null;}catch(e){binding.reportError=e.code||'PROXY_MANAGER_UNAVAILABLE';binding.disposeAfterUse=true;}}
    if(!['ok','partial','resolved'].includes(result.status))binding.disposeAfterUse=true;
    if(proxyLimitEvidence)retryContext.excludeProxyEndpoint=binding.endpoint;
    return{...result,transport:transport()};
   }
   throw fail('PROXY_EXPIRED');
  }catch(error){const pacing=groupPacingWait({reason:error?.code,retryAfterMs:error?.retryAfterMs});if(pacing)return pacing;managerRpc ||=sanitizeManagerRpcDiagnostic(error?.managerRpc);failurePhase=executionPhase;failureNative=/^[A-Z][A-Z0-9_]{0,79}$/.test(error?.code||'')?error.code:null;let reason=httpFailure(error);if(reason==='PROXY_ENDPOINTS_UNAVAILABLE'&&(binding.session?.requests||0)===startRequests)used=false;const assignmentWait=binding.lease?.managed&&['PROXY_SCOPE_COOLDOWN','PROXY_RETRY_LATER'].includes(reason);if(assignmentWait)reason=reason==='PROXY_SCOPE_COOLDOWN'?'PROXY_ASSIGNMENT_COOLDOWN':'PROXY_ASSIGNMENT_BACKOFF';binding.disposeAfterUse=true;binding.session?.close();if(assignmentWait)binding.blockedUntil=0;else if(reason==='PROXY_SCOPE_COOLDOWN')binding.blockedUntil=Date.now()+(error.retryAfterMs||900000);if(binding.lease?.managed&&!context?.signal.aborted){try{await apiAwait(binding.lease.report({status:reason==='ORIGIN_SECURITY_CHALLENGE'?'security_checkpoint':proxyLimitEvidence?.source==='proxy_connect'&&reason==='PROXY_CONNECT_RATE_LIMITED'?'rate_limited':'proxy_error',...proxyTlsEvidence(reason,binding.session?.requestTimings?.filter(t=>t.request>startRequests))},finalizationOptions()));binding.reportError=null;}catch(e){binding.reportError=e.code||'PROXY_MANAGER_UNAVAILABLE';}}return{status:reason==='ORIGIN_SECURITY_CHALLENGE'?'security_checkpoint':reason==='PROXY_SCOPE_COOLDOWN'?'rate_limited':/PROXY|INVALID_PROXY/.test(reason)?'proxy_error':'error',reason,...(/^[A-Z][A-Z0-9_]{0,79}$/.test(error?.code||'')?{upstreamCode:error.code}:{}),retryAfterMs:assignmentWait?0:error?.retryAfterMs>0?error.retryAfterMs:null,transport:transport()};}
  finally{if(locked){context?.signal.removeEventListener('abort',abort);if(proxyLimitEvidence&&binding.endpoint)retryContext.excludeProxyEndpoint=binding.endpoint;binding.busy=false;if(!sticky||!binding.lease?.managed||binding.disposeAfterUse)await close();else{binding.idleTimer=setTimeout(()=>void binding.dispose().catch(()=>{}),idleMs);binding.idleTimer.unref();}}}
 };
}
