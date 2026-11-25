import test from 'node:test';import assert from 'node:assert/strict';import{EventEmitter}from'node:events';
import{createHttpExecutor,createProxiedSession}from'../src/services/socialHttpTransport.js';
import{boundedProxyRead,flowReadAction}from'../src/services/crawlerQueueFlow.js';
import{readNetworkDiagnostic}from'../src/services/readNetworkDiagnostics.js';
for(const verifyAuthGates of[false,true])test('native Google challenge fails once without redirect/IP rotation; verifyAuthGates='+verifyAuthGates,async()=>{
 let acquisitions=0,requests=0,releases=0,failures=0;const context={};
 const requestImpl=(url,opts,callback)=>{assert.equal(url.hostname,'www.youtube.com');requests++;const req=new EventEmitter();req.destroy=()=>{};req.end=()=>queueMicrotask(()=>{const res=new EventEmitter();res.statusCode=302;res.headers={location:'https://www.google.com/sorry/index?continue=private&token=secret'};res.resume=()=>{};callback(res);});return req;};
 const execute=createHttpExecutor({failFastProxy:true,timeoutMs:1000,getProxy:async()=>{acquisitions++;return{server:'http://proxy.test:8888',managed:true,heartbeat:async()=>{},permit:async()=>{},report:async()=>({}),release:async()=>releases++};},makeSession:o=>createProxiedSession({...o,requestImpl})});
 const result=await boundedProxyRead({verifyAuthGates,publicBefore:true,read:async()=>{const result=await execute({platform:'youtube',operation:'comments',proxyRetryContext:context},async session=>{await session.request('https://www.youtube.com/watch?v=abcdefghijk');return{status:'ok'};});return{good:result.status==='ok',result};},onFailure:async()=>failures++,rotate:async()=>assert.fail('native challenge must not rotate'),onRetry:async()=>assert.fail('native challenge must not retry')});
 assert.equal(flowReadAction(result.lastResult),'fail');assert.equal(result.failed,true);assert.equal(result.done,undefined);assert.equal(result.lastResult.reason,'ORIGIN_SECURITY_CHALLENGE');assert.equal(result.lastResult.status,'security_checkpoint');assert.equal(requests,1);assert.equal(acquisitions,1);assert.equal(releases,1);assert.equal(failures,1);
 const diagnostic=readNetworkDiagnostic(result.lastResult,{includeNonNetwork:true});assert.equal(diagnostic.networkTimings.at(-1).blockedRedirect.to,'https://www.google.com/sorry/index');assert(!JSON.stringify(diagnostic).includes('private'));assert(!JSON.stringify(diagnostic).includes('secret'));
});
test('challenge classification requires the exact native HTTPS host/path without URL credentials',async()=>{
 for(const location of['https://www.google.com.evil.invalid/sorry/index','http://www.google.com/sorry/index','https://www.google.com/not-sorry','https://user:password@www.google.com/sorry/index']){
  const requestImpl=(url,opts,callback)=>{const req=new EventEmitter();req.destroy=()=>{};req.end=()=>queueMicrotask(()=>{const res=new EventEmitter();res.statusCode=302;res.headers={location};res.resume=()=>{};callback(res);});return req;};
  const session=createProxiedSession({platform:'youtube',proxy:{server:'http://proxy.test:8888'},deadline:Date.now()+1000,requestImpl});try{await assert.rejects(session.request('https://www.youtube.com/watch?v=abcdefghijk'),e=>e.code==='UNSAFE_REDIRECT');}finally{session.close();}
 }
});
