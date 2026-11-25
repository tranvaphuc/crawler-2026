import {test} from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {PassThrough} from 'node:stream';
import {createProxiedSession} from '../src/services/socialHttpTransport.js';
import {readNetworkDiagnostic} from '../src/services/readNetworkDiagnostics.js';
test('CONNECT stage timeout aborts a stalled tunnel with its own retryable code',async()=>{
 const session=createProxiedSession({proxy:{server:'http://proxy.test:8888'},platform:'facebook',connectTimeoutMs:5,requestTimeoutMs:200,requestImpl:()=>{
  const req=new EventEmitter();req.destroy=()=>req.emit('error',Object.assign(Error(),{code:'ECONNRESET'}));req.end=()=>{};return req;
 }});
 try{await assert.rejects(session.request('https://www.facebook.com/'),{code:'PROXY_CONNECT_TIMEOUT'});const d=readNetworkDiagnostic({reason:'PROXY_CONNECT_TIMEOUT',transport:{networkTimings:session.requestTimings}});assert.equal(d.phase,'proxy_connect');assert.equal(d.networkTimings[0].connectLimitMs,5);assert.equal(d.networkTimings[0].wireBytes,0);}finally{session.close();}
});
test('CONNECT deadline does not shorten a healthy TLS, header or response body budget',async()=>{
 const session=createProxiedSession({proxy:{server:'http://proxy.test:8888'},platform:'facebook',connectTimeoutMs:5,tlsHandshakeTimeoutMs:100,requestTimeoutMs:200,requestImpl:(_url,_opts,callback)=>{
  const req=new EventEmitter();req.destroy=()=>{};req.end=()=>queueMicrotask(()=>{req.emit('proxyConnect',{statusCode:200});const socket=new EventEmitter();socket.encrypted=true;socket.secureConnecting=true;req.emit('socket',socket);setTimeout(()=>{socket.emit('secureConnect');const r=new PassThrough();r.statusCode=200;r.headers={};callback(r);r.end('complete');},20);});return req;
 }});
 try{assert.equal((await session.request('https://www.facebook.com/')).html,'complete');}finally{session.close();}
});
for(const phase of ['proxy_connect','proxy_tls','response_headers','response_body'])test('network diagnostic distinguishes '+phase+' and keeps native reset',async()=>{
 const session=createProxiedSession({proxy:{server:'http://private-proxy.test:8888',username:'SECRET_USER',password:'SECRET_PASS'},platform:'facebook',requestImpl:(url,opts,callback)=>{
  const req=new EventEmitter();req.destroy=()=>{};req.end=()=>queueMicrotask(()=>{
   if(phase!=='proxy_connect')req.emit('proxyConnect',{statusCode:200});
   if(phase!=='proxy_connect'){
    const socket=new EventEmitter();socket.encrypted=true;socket.secureConnecting=phase==='proxy_tls';req.emit('socket',socket);
   }
   if(phase==='response_body'){
    const res=new PassThrough();res.statusCode=200;res.headers={};callback(res);res.write('partial');res.emit('error',Object.assign(new Error('PRIVATE MESSAGE'),{code:'ECONNRESET',syscall:'read'}));
   }else req.emit('error',Object.assign(new Error('PRIVATE MESSAGE'),{code:'ECONNRESET',syscall:'read'}));
  });return req;
 }});
 try{await assert.rejects(session.request('https://www.facebook.com/public?token=SECRET_TOKEN'),{code:'ECONNRESET'});
  const r={reason:'NETWORK_ERROR',upstreamCode:'ECONNRESET',transport:{networkTimings:session.requestTimings}};
  const d=readNetworkDiagnostic(r,{jobId:'job',retry:2});assert.equal(d.phase,phase);assert.equal(d.nativeCode,'ECONNRESET');assert.equal(d.networkTimings[0].route,'https://www.facebook.com/public');assert.equal(d.networkTimings[0].syscall,'read');
  assert.doesNotMatch(JSON.stringify(d),/SECRET|PRIVATE|private-proxy/);
 }finally{session.close();}
});
test('TLS establishment and reused socket are distinguished from TLS wait',async()=>{
 for(const reused of [false,true]){
  const session=createProxiedSession({proxy:{server:'http://proxy.test:8888'},platform:'facebook',requestImpl:()=>{
   const req=new EventEmitter();req.destroy=()=>{};req.end=()=>queueMicrotask(()=>{req.reusedSocket=reused;const s=new EventEmitter();s.encrypted=true;s.secureConnecting=!reused;req.emit('socket',s);if(!reused)s.emit('secureConnect');req.emit('error',Object.assign(new Error(),{code:'ETIMEDOUT'}));});return req;
  }});
  try{await assert.rejects(session.request('https://www.facebook.com/'));const t=session.requestTimings[0];assert.equal(t.phase,'response_headers');assert.equal(t.reusedSocket,reused);assert.ok(Number.isFinite(t.tlsMs));}finally{session.close();}
 }
});
test('unobserved and proxy assignment errors do not invent network evidence',()=>{
 assert.equal(readNetworkDiagnostic({reason:'NETWORK_ERROR'}).phase,'unobserved');
 assert.equal(readNetworkDiagnostic({reason:'PROXY_MANAGER_UNAVAILABLE'}).phase,'proxy_assignment');
 assert.equal(readNetworkDiagnostic({reason:'AUTH_REQUIRED'}),null);
 const d=readNetworkDiagnostic({reason:'NETWORK_ERROR',upstreamCode:'secret password',transport:{proxyEndpoint:'secret',networkTimings:[{route:'https://u:p@www.facebook.com/path?secret=1',nativeCode:'SECRET PASSWORD',headers:{authorization:'secret'}}]}});
 assert.doesNotMatch(JSON.stringify(d),/secret|password|authorization|u:p/i);
});

test('TLS stage deadline settles its own identity before abort-induced reset',async()=>{
 const session=createProxiedSession({proxy:{server:'http://proxy.test:8888'},platform:'facebook',requestTimeoutMs:100,tlsHandshakeTimeoutMs:5,requestImpl:()=>{
  const req=new EventEmitter();req.destroy=()=>req.emit('error',Object.assign(Error(),{code:'ECONNRESET'}));req.end=()=>queueMicrotask(()=>{req.emit('proxyConnect',{statusCode:200});const s=new EventEmitter();s.encrypted=true;s.secureConnecting=true;req.emit('socket',s);});return req;
 }});
 try{await assert.rejects(session.request('https://www.facebook.com/'),{code:'PROXY_TLS_HANDSHAKE_TIMEOUT'});const d=readNetworkDiagnostic({reason:'PROXY_TLS_HANDSHAKE_TIMEOUT',transport:{networkTimings:session.requestTimings}});assert.equal(d.phase,'proxy_tls');assert.equal(d.nativeCode,'PROXY_TLS_HANDSHAKE_TIMEOUT');assert.equal(d.networkTimings[0].tlsHandshakeLimitMs,5);assert.equal(d.networkTimings[0].connectStatus,200);}finally{session.close();}
});
test('TLS stage deadline is cleared after secureConnect and does not shorten header/body budget',async()=>{
 const session=createProxiedSession({proxy:{server:'http://proxy.test:8888'},platform:'facebook',requestTimeoutMs:200,tlsHandshakeTimeoutMs:5,requestImpl:(_url,_opts,callback)=>{
  const req=new EventEmitter();req.destroy=()=>{};req.end=()=>queueMicrotask(()=>{req.emit('proxyConnect',{statusCode:200});const s=new EventEmitter();s.encrypted=true;s.secureConnecting=true;req.emit('socket',s);s.emit('secureConnect');setTimeout(()=>{const r=new PassThrough();r.statusCode=200;r.headers={};callback(r);r.end('verified');},20);});return req;
 }});
 try{assert.equal((await session.request('https://www.facebook.com/')).html,'verified');}finally{session.close();}
});
test('cookie version changes only on actual cookie value changes and never exposes cookies in telemetry',async()=>{let count=0;const session=createProxiedSession({proxy:{server:'http://proxy.test:8888'},platform:'facebook',requestImpl:(_u,_o,callback)=>{const req=new EventEmitter();req.destroy=()=>{};req.end=()=>queueMicrotask(()=>{const res=new PassThrough();res.statusCode=200;res.headers={'set-cookie':['session='+(++count<3?'PRIVATE_A':'PRIVATE_B')+'; Path=/']};callback(res);res.end('ok');});return req;}});try{assert.equal(session.cookieVersion,0);await session.request('https://www.facebook.com/');assert.equal(session.cookieVersion,1);await session.request('https://www.facebook.com/');assert.equal(session.cookieVersion,1);await session.request('https://www.facebook.com/');assert.equal(session.cookieVersion,2);assert.doesNotMatch(JSON.stringify(session.requestTimings),/PRIVATE_A|PRIVATE_B/);}finally{session.close();}});
