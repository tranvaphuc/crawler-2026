import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {EventEmitter} from 'node:events';
import {createProxiedSession,createHttpExecutor} from '../src/services/socialHttpTransport.js';
import {confirmedProxyLimit,sourcePageDecision} from '../src/services/crawlerQueueFlow.js';
const hash='a'.repeat(64);
test('controlled single-proxy burst identifies CONNECT 429, never 502 or target HTTP 429',async t=>{
 let connects=0;const server=http.createServer();server.on('connect',(_req,socket)=>{const status=++connects<=2?502:429;socket.end(`HTTP/1.1 ${status} Test\r\nContent-Length: 0\r\nConnection: close\r\n\r\n`);});await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>server.close());
 const statuses=[];
 for(let i=0;i<6;i++){
  let evidence;const session=createProxiedSession({platform:'facebook',proxy:{server:`http://127.0.0.1:${server.address().port}`},deadline:Date.now()+500,requestTimeoutMs:200,onProxyLimit:e=>evidence=e});
  try{const r=await session.request('https://www.facebook.com/');statuses.push(r.httpStatus);assert.equal(r.httpStatus,502);assert.equal(evidence,undefined);}catch(e){assert.equal(e.code,'PROXY_CONNECT_RATE_LIMITED');assert.equal(confirmedProxyLimit({reason:e.code,transport:{proxyEndpoint:hash,proxyLimitEvidence:{...evidence,endpoint:hash}}}),true);statuses.push(429);}finally{session.close();}
 }
 assert.deepEqual(statuses,[502,502,429,429,429,429]);assert.equal(connects,6);
 assert.equal(confirmedProxyLimit({reason:'UPSTREAM_HTTP_429',transport:{proxyEndpoint:hash,proxyLimitEvidence:{source:'upstream_http',httpStatus:429,scope:'proxy',confirmed:true,endpoint:hash}}}),false);
});
test('per-request timeout is independent of the bounded multi-request read budget',async()=>{
 const execute=createHttpExecutor({getProxy:async()=>({server:'http://proxy.test:8080'}),timeoutMs:30,attemptTimeoutMs:150,makeSession:options=>{assert.equal(options.requestTimeoutMs,30);return{requests:0,close(){},request:async()=>{await new Promise(r=>setTimeout(r,20));return{httpStatus:200};}};}});
 const result=await execute({platform:'youtube',operation:'source'},async session=>{await session.request();await session.request();return{status:'ok'};});assert.equal(result.status,'ok');
});
test('closing a timed-out work session aborts active sockets rather than leaving work alive',async()=>{
 let destroyed=false;const requestImpl=()=>{const req=new EventEmitter();req.end=()=>{};req.destroy=e=>{destroyed=true;queueMicrotask(()=>req.emit('error',e));};return req;};
 const session=createProxiedSession({proxy:{server:'http://proxy.test:8080'},platform:'facebook',deadline:Date.now()+1000,requestImpl});const pending=session.request('https://www.facebook.com/');await new Promise(r=>setImmediate(r));session.close();await assert.rejects(pending,e=>e.code==='UPSTREAM_TIMEOUT');assert.equal(destroyed,true);
});
test('empty native source pages only end with an explicit exhausted continuation',()=>{
 for(const nativePageCount of [0,undefined]){assert.equal(sourcePageDecision({items:[],page:2,hasMore:true,nativePageCount}),false);assert.equal(sourcePageDecision({items:[],page:2,hasMore:false,nativePageCount}),true);}
});
test('a successful lease is not poisoned by another job generic-error endpoint exclusion',async()=>{
 const execute=createHttpExecutor({getProxy:async()=>({server:'http://proxy.test:8080'}),makeSession:()=>({requests:0,close(){}}),timeoutMs:100}),context={};
 const failed=await execute({platform:'threads',operation:'source',proxyRetryContext:context},async()=>({status:'error',reason:'UPSTREAM_API_ERROR'}));assert.equal(failed.reason,'UPSTREAM_API_ERROR');assert.equal(context.excludeProxyEndpoint,undefined);
});
test('bounded pacing grants one short scheduling wait and does not spend a proxy retry',async()=>{
 let permits=0;const execute=createHttpExecutor({getProxy:async()=>({server:'http://proxy.test:8080',managed:true,permit:async()=>{if(++permits===1)throw Object.assign(Error(),{code:'PROXY_PACING_WAIT',retryAfterMs:5});},release:async()=>{},report:async()=>{}}),failFastProxy:true,timeoutMs:2000,maxProxyPacingWaitMs:5,makeSession:({proxy})=>({requests:0,close(){},async request(){await proxy.beforeRequest();}})});
 const result=await execute({platform:'facebook',operation:'comments'},async session=>{await session.request();return{status:'ok'};});assert.equal(result.status,'ok');assert.equal(permits,2);assert.equal(confirmedProxyLimit(result),false);
});
test('an endless stream of pacing waits is bounded by the total pacing budget',async()=>{
 let permits=0;const execute=createHttpExecutor({getProxy:async()=>({server:'http://proxy.test:8080',managed:true,permit:async()=>{permits++;throw Object.assign(Error(),{code:'PROXY_PACING_WAIT',retryAfterMs:5});},release:async()=>{},report:async()=>{}}),failFastProxy:true,timeoutMs:2000,maxProxyPacingWaitMs:5,makeSession:({proxy})=>({requests:0,close(){},async request(){await proxy.beforeRequest();}})});
 const start=Date.now(),result=await execute({platform:'facebook',operation:'comments'},async session=>{await session.request();return{status:'ok'};});assert.equal(result.reason,'PROXY_PACING_WAIT');assert.equal(permits,2);assert.ok(Date.now()-start<100);
});
test('a returned error releases a sticky managed lease immediately and preserves non-proxy retry semantics',async()=>{
 for(const reason of ['NETWORK_ERROR','UPSTREAM_TIMEOUT','UPSTREAM_API_ERROR','META_SOURCE_CONNECTION_UNVERIFIED','PROXY_PACING_WAIT']){
  let acquired=0,released=0,closed=0;const binding={},context={};const execute=createHttpExecutor({getProxy:async()=>{acquired++;return{server:'http://proxy.test:8080',managed:true,report:async()=>({}),release:async()=>released++};},makeSession:()=>({requests:0,close(){closed++;}}),failFastProxy:true,timeoutMs:100});
  const result=await execute({platform:'facebook',operation:'source',proxyRetryContext:context},async()=>({status:'error',reason}),binding);assert.equal(result.reason,reason);assert.equal(acquired,1);assert.equal(released,1,reason);assert.equal(closed,1,reason);assert.equal(binding.lease,null);assert.equal(binding.session,null);assert.equal(context.excludeProxyEndpoint,undefined);
 }
});
test('a proxy hanging before CONNECT response has its raw socket aborted on timeout',async t=>{
 const sockets=new Set();let connectSeen;const connected=new Promise(r=>connectSeen=r);const server=http.createServer();server.on('connect',(_req,socket)=>{sockets.add(socket);socket.on('end',()=>socket.destroy());socket.resume();socket.on('close',()=>sockets.delete(socket));connectSeen();});await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>{for(const s of sockets)s.destroy();server.close();});
 const session=createProxiedSession({platform:'facebook',proxy:{server:`http://127.0.0.1:${server.address().port}`},deadline:Date.now()+1000,requestTimeoutMs:50});
 const pending=session.request('https://www.facebook.com/');await connected;await assert.rejects(pending,e=>e.code==='UPSTREAM_TIMEOUT');assert.equal(session.requestTimings.at(-1).phase,'proxy_connect');assert.equal(session.requestTimings.at(-1).outcome,'error');assert.equal(session.requestTimings.at(-1).headersMs,null);session.close();
 for(let i=0;i<20&&sockets.size;i++)await new Promise(r=>setTimeout(r,5));assert.equal(sockets.size,0,'no hidden CONNECT socket may remain after job timeout');
});
test('sequential requests reuse one validated TLS tunnel within the same leased session',async t=>{
 const https=await import('node:https'),net=await import('node:net'),fs=await import('node:fs/promises'),os=await import('node:os'),path=await import('node:path'),{execFileSync}=await import('node:child_process');
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'crawler-qc-tls-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));
 const key=path.join(dir,'key.pem'),cert=path.join(dir,'cert.pem');execFileSync('openssl',['req','-x509','-newkey','rsa:2048','-nodes','-keyout',key,'-out',cert,'-days','1','-subj','/CN=www.facebook.com','-addext','subjectAltName=DNS:www.facebook.com'],{stdio:'ignore'});
 const pem=await fs.readFile(cert),origin=https.createServer({key:await fs.readFile(key),cert:pem},(req,res)=>{if(new URL(req.url,'https://owned.test').pathname==='/hang')return;if(req.url==='/rate'){res.writeHead(429,{'retry-after':'7','content-type':'text/html','content-encoding':'gzip'});res.flushHeaders();return;}if(req.url==='/slow-body'){res.writeHead(200,{'content-type':'text/html'});res.flushHeaders();res.write('partial');return;}res.end('owned test origin');});await new Promise(r=>origin.listen(0,'127.0.0.1',r));t.after(()=>origin.close());
 let connects=0;const sockets=new Set(),proxyServer=http.createServer();proxyServer.on('connect',(_req,socket,head)=>{connects++;sockets.add(socket);socket.on('close',()=>sockets.delete(socket));const upstream=net.connect(origin.address().port,'127.0.0.1',()=>{socket.write('HTTP/1.1 200 Connection Established\r\n\r\n');if(head.length)upstream.write(head);socket.pipe(upstream);upstream.pipe(socket);});socket.on('error',()=>upstream.destroy());upstream.on('error',()=>socket.destroy());socket.on('close',()=>upstream.destroy());});await new Promise(r=>proxyServer.listen(0,'127.0.0.1',r));t.after(()=>{for(const s of sockets)s.destroy();proxyServer.close();});
 const session=createProxiedSession({platform:'facebook',proxy:{server:`http://127.0.0.1:${proxyServer.address().port}`},deadline:Date.now()+1000,requestTimeoutMs:300,requestImpl:(url,options,callback)=>https.request(url,{...options,ca:pem},callback)});t.after(()=>session.close());
 assert.equal((await session.request('https://www.facebook.com/one')).httpStatus,200);assert.equal((await session.request('https://www.facebook.com/two')).httpStatus,200);assert.equal(connects,1);const start=Date.now(),rate=await session.request('https://www.facebook.com/rate');assert.equal(rate.httpStatus,429);assert.equal(rate.html,'');assert.equal(rate.retryAfterMs,7000);t.diagnostic(JSON.stringify({ownedOrigin429Ms:Date.now()-start,requestTimeoutMs:300,bodyFinished:false}));assert.ok(Date.now()-start<250,'origin 429 must not wait for an endless response body');assert.equal(session.requestTimings.at(-1).bodySkipped,true);await assert.rejects(()=>session.request('https://www.facebook.com/hang?secret=PRIVATE_QUERY'),e=>e.code==='UPSTREAM_TIMEOUT');assert.equal(session.requestTimings.at(-1).phase,'response_headers');assert.equal(session.requestTimings.at(-1).reason,'UPSTREAM_TIMEOUT');assert.ok(session.requestTimings.at(-1).timeoutOvershootMs>=0);assert.equal(session.requestTimings[0].phase,'complete');assert.equal(session.requestTimings[1].proxyConnectMs,null);const slow=createProxiedSession({platform:'facebook',proxy:{server:`http://127.0.0.1:${proxyServer.address().port}`},deadline:Date.now()+1000,requestTimeoutMs:300,requestImpl:(url,options,callback)=>https.request(url,{...options,ca:pem},callback)});try{await assert.rejects(()=>slow.request('https://www.facebook.com/slow-body'),e=>e.code==='UPSTREAM_TIMEOUT');assert.equal(slow.requestTimings.at(-1).phase,'response_body');assert.equal(slow.requestTimings.at(-1).wireBytes,7);assert.equal(slow.requestTimings.at(-1).wireEndedMs,null);assert.equal(slow.requestTimings.at(-1).decodedEndedMs,null);assert.equal(slow.requestTimings.at(-1).wireComplete,false);}finally{slow.close();}assert.equal(session.requestTimings.at(-1).route,'https://www.facebook.com/hang');assert.ok(!JSON.stringify(session.requestTimings.slice(0,2)).includes('facebook.com'));assert.ok(!JSON.stringify(session.requestTimings).includes('PRIVATE_QUERY'));assert.ok(!JSON.stringify(session.requestTimings).includes('owned test origin'));
});
test('network timing history is bounded and caller mutation cannot alter session evidence',async()=>{
 const requestImpl=(_url,_options,callback)=>{const req=new EventEmitter();req.destroy=()=>{};req.end=()=>queueMicrotask(()=>{const res=new EventEmitter();res.statusCode=200;res.headers={};callback(res);res.emit('data',Buffer.from('private response body'));res.emit('end');});return req;};
 const session=createProxiedSession({platform:'facebook',proxy:{server:'http://proxy.test:8080'},deadline:Date.now()+1000,requestImpl});try{for(let i=0;i<16;i++)await session.request('https://www.facebook.com/private-path');const a=session.requestTimings;assert.equal(a.length,8);assert.equal(a[0].request,9);a[0].phase='changed';assert.equal(session.requestTimings[0].phase,'complete');assert.ok(!JSON.stringify(a).includes('private'));}finally{session.close();}
});
