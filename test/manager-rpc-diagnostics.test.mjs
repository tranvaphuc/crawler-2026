import test from'node:test';import assert from'node:assert/strict';
import{createProxyManagerClient}from'../src/services/proxyManagerClient.js';
import{createHttpExecutor}from'../src/services/socialHttpTransport.js';
import{readNetworkDiagnostic,sanitizeManagerRpcDiagnostic}from'../src/services/readNetworkDiagnostics.js';
import{crawlerErrorDetails}from'../src/services/crawlerErrorDetails.js';
const key='fake-background-authentication-test-only-001',target={platform:'youtube',operation:'source'},secret='PRIVATE_BODY_COOKIE_HEADER_VALUE',error=()=>new TypeError(secret,{cause:{code:'ECONNREFUSED',headers:{authorization:secret}}});
test('manager fetch failure retains public retry reason and only bounded operation/budget/cause metadata',async()=>{
 const provider=createProxyManagerClient({url:'http://127.0.0.1:3810',key,fetchImpl:async()=>{throw error();}});
 await assert.rejects(provider({...target,proxyManagerTimeoutMs:17}),e=>{assert.equal(e.code,'PROXY_MANAGER_UNAVAILABLE');assert.equal(e.retryAfterMs,3000);assert.equal(e.managerRpc.operation,'acquire');assert.equal(e.managerRpc.timeoutMs,17);assert.equal(e.managerRpc.aborted,false);assert.equal(e.managerRpc.causeCode,'ECONNREFUSED');assert.ok(e.managerRpc.elapsedMs>=0);assert.ok(!JSON.stringify(e).includes(secret));assert.ok(!JSON.stringify(e).includes(key));return true;});
});
test('an actual client deadline is distinguishable from connection refusal without extending the timeout',async()=>{
 const provider=createProxyManagerClient({url:'http://127.0.0.1:3810',key,fetchImpl:(_u,o)=>new Promise((resolve,reject)=>{const timer=setTimeout(()=>resolve({ok:true,json:async()=>({})}),100);o.signal.addEventListener('abort',()=>{clearTimeout(timer);reject(o.signal.reason);},{once:true});})});
 await assert.rejects(provider({...target,proxyManagerTimeoutMs:5}),e=>{assert.equal(e.code,'PROXY_MANAGER_UNAVAILABLE');assert.equal(e.managerRpc.timeoutMs,5);assert.equal(e.managerRpc.aborted,true);assert.equal(e.managerRpc.errorType,'TimeoutError');assert.equal(e.managerRpc.causeCode,null);return true;});
});
test('acquisition diagnostics survive executor and existing job error evidence without changing read behavior',async()=>{
 let work=0;const provider=createProxyManagerClient({url:'http://127.0.0.1:3810',key,fetchImpl:async()=>{throw error();}}),execute=createHttpExecutor({getProxy:provider,failFastProxy:true,timeoutMs:19,attemptTimeoutMs:100});
 const result=await execute(target,()=>{work++;return{};});assert.equal(work,0);assert.equal(result.reason,'PROXY_MANAGER_UNAVAILABLE');assert.equal(result.retryAfterMs,3000);assert.equal(result.transport.managerRpc.operation,'acquire');assert.equal(result.transport.managerRpc.timeoutMs,19);const diagnostic=readNetworkDiagnostic(result),detail=crawlerErrorDetails(result,{queue:'youtube-source'});assert.deepEqual(detail.network.managerRpc,diagnostic.managerRpc);assert.equal(detail.originalReason,'PROXY_MANAGER_UNAVAILABLE');assert.ok(!JSON.stringify(detail).includes(secret));assert.ok(!JSON.stringify(detail).includes(key));
});
test('permit diagnostics remain attached when a reader catches request failure into a result',async()=>{
 let called=0;const provider=createProxyManagerClient({url:'http://127.0.0.1:3810',key,fetchImpl:async u=>{const operation=new URL(u).pathname.split('/').at(-1);called++;if(operation==='permit')throw error();return{ok:true,json:async()=>operation==='acquire'?{proxy:{host:'proxy.test',port:8080},leaseId:'fake-lease',proxyExpiresAt:Date.now()+60000,generation:1}:{} };}});
 const execute=createHttpExecutor({getProxy:provider,failFastProxy:true,timeoutMs:1000,attemptTimeoutMs:2000,makeSession:({proxy})=>({requests:0,request:async()=>{await proxy.beforeRequest();return{};},close(){}})});
 const r=await execute(target,async session=>{try{await session.request('https://www.youtube.com');}catch(e){return{status:'proxy_error',reason:e.code};}});assert.equal(r.reason,'PROXY_MANAGER_UNAVAILABLE');assert.equal(r.transport.managerRpc.operation,'permit');assert.equal(r.transport.managerRpc.causeCode,'ECONNREFUSED');assert.ok(called>=3);
});
test('diagnostic allowlist rejects secret-shaped names and non-finite metrics, with no metadata on ordinary success',()=>{
 const d=sanitizeManagerRpcDiagnostic({operation:'permit',timeoutMs:1e10,elapsedMs:1e10,aborted:true,errorType:secret,causeCode:secret,url:secret,headers:secret,cookie:secret,body:secret});assert.deepEqual(d,{operation:'permit',timeoutMs:40000,elapsedMs:3600000,aborted:true,errorType:'Error',causeCode:null});assert.equal(sanitizeManagerRpcDiagnostic({operation:secret,timeoutMs:1,elapsedMs:1}),null);assert.equal(sanitizeManagerRpcDiagnostic({operation:'permit',timeoutMs:NaN,elapsedMs:1}),null);assert.equal(readNetworkDiagnostic({reason:'AUTH_REQUIRED'}),null);assert.equal('managerRpc'in readNetworkDiagnostic({reason:'PROXY_MANAGER_UNAVAILABLE'}),false);assert.ok(!JSON.stringify(d).includes(secret));
});
