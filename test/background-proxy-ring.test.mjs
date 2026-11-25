import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {createProxyManager} from '../src/services/proxyManager.js';
function fixture(t,{n=6,reserved=2,admitted=2}={}){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'proxy-ring-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const keys=Array.from({length:n},(_,i)=>`ring-key-${String(i).padStart(8,'0')}`),keysFile=path.join(dir,'keys.json'),settingsFile=path.join(dir,'settings.json'),stateFile=path.join(dir,'state.json');
 fs.writeFileSync(keysFile,JSON.stringify({keys}));fs.writeFileSync(settingsFile,JSON.stringify({maxLeasesPerKey:10,apiReservedKeyCount:reserved,backgroundActiveKeyCount:admitted,backgroundMaxLeases:400,refreshConcurrency:8,blockRejectedScopes:true,apiPolicies:{'facebook.comments':{minIntervalMs:1000}}}));
 let clock=100000;const calls=[],networkCalls=[],failures=new Set(),counts=new Map(),waiters=new Map();
 const options={keysFile,settingsFile,stateFile,now:()=>clock,makeRotator:key=>async({requestedNetwork}={})=>{calls.push(key);if(requestedNetwork)networkCalls.push({key,network:requestedNetwork});if(waiters.has(key))await waiters.get(key);if(failures.has(key))throw Object.assign(Error(),{code:'PROXY_API_COOLDOWN',retryAfterMs:70000});const count=(counts.get(key)||0)+1;counts.set(key,count);return{host:`${key}-${count}`,port:8080,expiresAt:clock+900000,providerNetwork:requestedNetwork};}};
 return{manager:createProxyManager(options),options,keys,calls,networkCalls,failures,waiters,clock:()=>clock,setClock:x=>clock=x,state:()=>JSON.parse(fs.readFileSync(stateFile))};
}
const bg=(m,scope='facebook.comments',extra={})=>m.acquire({scope,clientClass:'background',minRemainingMs:1000,...extra});
const releaseAll=(m,ls)=>ls.forEach(l=>m.release(l.leaseId));
test('timed crawler sharing can drop local origin cooldowns while retaining provider and API cooldowns',async t=>{
 const f=fixture(t,{n:3,reserved:1,admitted:1}),m=f.manager;
 const cfg=JSON.parse(fs.readFileSync(f.options.settingsFile));
 await m.tick();
 const groupRequest={queue:'crawler-flow-facebook-group-source'};
 const old=await bg(m,'facebook.source_group',groupRequest);
 const nativeLimit={status:'rate_limited',reason:'FACEBOOK_RATE_LIMITED',phase:'http_response'};
 m.report(old.leaseId,nativeLimit);
 assert.throws(()=>m.permit(old.leaseId),{code:'PROXY_ENDPOINTS_UNAVAILABLE'});

 m.setSettings({...cfg,backgroundBatchRotationMs:120000,backgroundOriginRateLimitCooldown:false});
 const fresh=await bg(m,'facebook.source_group',groupRequest);
 assert.ok(m.permit(old.leaseId).permitted);
 m.report(fresh.leaseId,nativeLimit);
 assert.ok(m.permit(fresh.leaseId,{reuseTransport:true}).permitted);

 const api=await m.acquire({scope:'facebook.source_group'});
 m.report(api.leaseId,nativeLimit);
 assert.throws(()=>m.permit(api.leaseId),{code:'PROXY_SCOPE_COOLDOWN'});
 m.report(fresh.leaseId,{status:'rate_limited',reason:'PROXY_CONNECT_RATE_LIMITED',phase:'proxy_connect',connectStatus:429});
 assert.throws(()=>m.permit(fresh.leaseId),{code:'PROXY_ENDPOINTS_UNAVAILABLE'});
 releaseAll(m,[old,fresh,api]);
});
test('the scheduled pool swaps complete lists every two minutes and never rotates a key with an existing lease',async t=>{
 const f=fixture(t,{n:8,reserved:2,admitted:3});let m=f.manager;
 t.after(()=>m.close());
 await m.tick();
 const old=await bg(m,'youtube.comments');
 const lists=f.state().backgroundRing;
 m.setSettings({...JSON.parse(fs.readFileSync(f.options.settingsFile)),backgroundBatchRotationMs:120000,backgroundProxyRateLimitReplacement:true});
 const tick=async()=>{await m.tick();await new Promise(resolve=>setImmediate(resolve));};
 await tick();
 assert.deepEqual(f.networkCalls.map(call=>call.network),['viettel','viettel','viettel']);
 assert.equal(m.status().backgroundRing.batchRotation.readyStandbyKeys,3);
 f.setClock(219999);
 assert.ok(m.heartbeat(old.leaseId));
 assert.deepEqual(f.state().backgroundRing.activeKeyIds,lists.activeKeyIds);
 f.setClock(220000);
 await tick();
 assert.equal(m.status().backgroundRing.batchRotation.network,'viettel');
 assert.deepEqual(f.state().backgroundRing.activeKeyIds,lists.waitingKeyIds);
 assert.deepEqual(f.state().backgroundRing.waitingKeyIds,lists.activeKeyIds);
 assert.equal(f.networkCalls.filter(call=>call.network==='vnpt').length,2);
 assert.ok(m.permit(old.leaseId).permitted);
 assert.ok(!f.networkCalls.some(call=>call.network==='vnpt'&&old.proxy.host.startsWith(call.key)));
 const current=await bg(m);
 assert.equal(current.proxy.providerNetwork,'viettel');
 m.report(current.leaseId,{status:'rate_limited',reason:'PROXY_CONNECT_RATE_LIMITED',phase:'proxy_connect',connectStatus:429});
 assert.equal(m.status().backgroundRing.pendingReplacements,0);
 releaseAll(m,[old,current]);
 await tick();
 assert.equal(f.networkCalls.filter(call=>call.network==='vnpt').length,3);
 const before=m.status().backgroundRing.batchRotation;
 m.close();m=createProxyManager(f.options);
 assert.deepEqual(m.status().backgroundRing.batchRotation,before);
 for(const [clock,network,actives] of [[340000,'vnpt',lists.activeKeyIds],[460000,'fpt',lists.waitingKeyIds],[580000,'viettel',lists.activeKeyIds]]){
  f.setClock(clock);await tick();
  assert.deepEqual(f.state().backgroundRing.activeKeyIds,actives);
  assert.equal(m.status().backgroundRing.batchRotation.network,network);
  const lease=await bg(m,'instagram.source');assert.equal(lease.proxy.providerNetwork,network);m.release(lease.leaseId);
 }
 assert.equal(m.status().apiReservedKeyCount,2);
});
test('50-key pool warms exactly 23 crawler keys, reserves 4 strictly for API and leaves 23 untouched',async t=>{
 const f=fixture(t,{n:50,reserved:4,admitted:23}),m=f.manager;for(let i=0;i<3;i++)await m.tick();
 const s=m.status();assert.equal(s.apiReservedKeyCount,4);assert.equal(s.backgroundKeyCount,46);assert.equal(s.backgroundRing.activeKeys,23);assert.equal(s.backgroundRing.readyKeys,23);assert.equal(s.backgroundRing.waitingKeys,23);assert.equal(s.backgroundLeaseCapacity,230);
 assert.equal(f.calls.length,27);const ls=[];for(let i=0;i<230;i++)ls.push(await bg(m));assert.equal(new Set(ls.map(x=>x.proxy.host)).size,23);assert.ok(ls.every(x=>!x.apiReserved));await assert.rejects(bg(m),e=>e.code==='PROXY_POOL_BUSY');
 for(let i=0;i<40;i++)assert.equal((await m.acquire({scope:'youtube.metrics'})).apiReserved,true);
 await assert.rejects(m.acquire({scope:'youtube.metrics'}),e=>e.code==='PROXY_POOL_BUSY');releaseAll(m,ls);
});
test('group limits block the endpoint only for group and never retire the shared key',async t=>{
 const f=fixture(t,{n:2,reserved:0,admitted:1}),m=f.manager;await m.tick();
 const group=await bg(m,'facebook.source_group');
 const others=[];for(const scope of ['facebook.source_page','facebook.source_user','facebook.comments','facebook.comment_info','youtube.source'])others.push(await bg(m,scope));
 m.report(group.leaseId,{status:'rate_limited',reason:'FACEBOOK_RATE_LIMITED',global:true});
 assert.throws(()=>m.permit(group.leaseId),{code:'PROXY_ENDPOINTS_UNAVAILABLE'});
 await assert.rejects(bg(m,'facebook.source_group'),{code:'PROXY_ENDPOINTS_UNAVAILABLE'});
 for(const l of others){assert.equal(l.proxy.host,group.proxy.host);assert.ok(m.permit(l.leaseId).permitted);}
 const before=f.calls.length;await m.tick();assert.equal(f.calls.length,before);assert.equal(m.status().backgroundRing.pendingReplacements,0);
 releaseAll(m,[group,...others]);m.close();const restored=createProxyManager(f.options);
 await assert.rejects(bg(restored,'facebook.source_group'),{code:'PROXY_ENDPOINTS_UNAVAILABLE'});
 const page=await bg(restored,'facebook.source_page');assert.equal(page.proxy.host,group.proxy.host);restored.release(page.leaseId);
});
test('ambiguous HTTP429 blocks only the reporting operation without replacing shared keys',async t=>{
 const f=fixture(t,{n:2,reserved:0,admitted:1}),m=f.manager;await m.tick();const a=await bg(m);m.report(a.leaseId,{status:'error',reason:'UPSTREAM_HTTP_429'});
 await assert.rejects(bg(m),{code:'PROXY_ENDPOINTS_UNAVAILABLE'});const other=await bg(m,'facebook.source_page');assert.equal(other.proxy.host,a.proxy.host);assert.ok(m.permit(other.leaseId).permitted);await m.tick();assert.equal(m.status().backgroundRing.pendingReplacements,0);releaseAll(m,[a,other]);
});
test('blocked group endpoint cannot be cleared by successful page traffic',async t=>{
 const f=fixture(t,{n:2,reserved:0,admitted:1}),m=f.manager;await m.tick();const a=await bg(m,'facebook.source_group');m.report(a.leaseId,{status:'rate_limited'});
 const b=await bg(m,'facebook.source_page');m.report(b.leaseId,{status:'ok',responseObserved:true});await assert.rejects(bg(m,'facebook.source_group'),{code:'PROXY_ENDPOINTS_UNAVAILABLE'});assert.equal(m.status().endpointScopeBlocks[0].scope,'facebook.source_group');releaseAll(m,[a,b]);
});
test('each blocked group endpoint is skipped while another group endpoint remains available',async t=>{
 const f=fixture(t),m=f.manager;await m.tick();const a=await bg(m,'facebook.source_group');m.report(a.leaseId,{status:'rate_limited'});const b=await bg(m,'facebook.source_group');assert.notEqual(b.proxy.host,a.proxy.host);m.report(b.leaseId,{status:'rate_limited'});await assert.rejects(bg(m,'facebook.source_group'),{code:'PROXY_ENDPOINTS_UNAVAILABLE'});assert.ok(await bg(m,'facebook.source_page'));assert.equal(m.status().backgroundRing.pendingReplacements,0);releaseAll(m,[a,b]);
});
test('at exactly 60 seconds TTL no new crawler lease is admitted, but running leases can finish',async t=>{
 const f=fixture(t,{n:2,reserved:0,admitted:1}),m=f.manager;await m.tick();const a=await bg(m);f.failures.add(f.keys[1]);for(let clock=200000;clock<940000;clock+=100000){f.setClock(clock);m.heartbeat(a.leaseId);}f.setClock(940000);m.heartbeat(a.leaseId);await m.tick();await assert.rejects(bg(m),e=>e.code==='PROXY_POOL_BUSY');assert.ok(m.permit(a.leaseId).permitted);assert.equal(m.status().backgroundRing.pendingReplacements,1);f.failures.clear();f.setClock(1010001);await m.tick();const next=await bg(m);assert.notEqual(next.proxy.host,a.proxy.host);
});
test('group block expires with its old assignment and a new provider assignment is usable',async t=>{
 const f=fixture(t,{n:2,reserved:0,admitted:1}),m=f.manager;await m.tick();const a=await bg(m,'facebook.source_group');m.report(a.leaseId,{status:'rate_limited'});m.release(a.leaseId);f.setClock(940000);await m.tick();const b=await bg(m,'facebook.source_group');assert.notEqual(b.proxy.host,a.proxy.host);m.release(b.leaseId);
});
test('legacy shared retirement requests and unscoped quarantines are discarded on migration',async t=>{
 const f=fixture(t),m=f.manager;await m.tick();const a=await bg(m,'facebook.source_group');m.close();const state=f.state();state.version=3;state.endpointAvoidance={['a'.repeat(64)]:{until:f.clock()+120000}};state.backgroundRing.pending={[state.backgroundRing.activeKeyIds[0]]:{generation:1,reason:'FACEBOOK_RATE_LIMITED'}};fs.writeFileSync(f.options.stateFile,JSON.stringify(state));const restored=createProxyManager(f.options);assert.equal(restored.status().endpointAvoidance.length,0);assert.equal(restored.status().backgroundRing.pendingReplacements,0);assert.ok(restored.permit(a.leaseId).permitted);
});
test('concurrent maintenance does not rotate a key because one feature is blocked',async t=>{
 const f=fixture(t),m=f.manager;await m.tick();const a=await bg(m);m.report(a.leaseId,{status:'rate_limited'});const before=f.calls.length;await Promise.all(Array.from({length:10},()=>m.tick()));assert.equal(f.calls.length,before);assert.equal(m.status().backgroundRing.pendingReplacements,0);
});
test('non-limit access errors do not replace keys and API limits retain existing scope policy',async t=>{
 const f=fixture(t),m=f.manager;await m.tick();const a=await bg(m);m.report(a.leaseId,{status:'auth_required',reason:'AUTH_REQUIRED'});assert.equal(m.status().backgroundRing.pendingReplacements,0);const api=await m.acquire({scope:'facebook.comments'});m.report(api.leaseId,{status:'rate_limited',reason:'FACEBOOK_RATE_LIMITED'});assert.throws(()=>m.heartbeat(api.leaseId),e=>e.code==='PROXY_SCOPE_COOLDOWN');assert.ok(m.heartbeat(a.leaseId));
});
test('invalid admission size is rejected',t=>{const m=fixture(t).manager;for(const value of [0,-1,1.5,10001])assert.throws(()=>m.setSettings({backgroundActiveKeyCount:value}),e=>e.code==='PROXY_SETTINGS_INVALID');});

test('legacy leases survive live migration; exactly half the crawler keys accept new leases',async t=>{
 const f=fixture(t,{n:6,reserved:2,admitted:2});fs.writeFileSync(f.options.settingsFile,JSON.stringify({maxLeasesPerKey:10,apiReservedKeyCount:1,backgroundMaxLeases:400,refreshConcurrency:8}));const m=f.manager,old=[];
 for(let i=0;i<5;i++)old.push(await bg(m));assert.equal(new Set(old.map(x=>x.proxy.host)).size,5);
 m.setSettings({maxLeasesPerKey:10,apiReservedKeyCount:2,backgroundActiveKeyCount:2,refreshConcurrency:8});
 // Reservation cannot take a key away from an existing crawler lease.
 assert.equal(m.status().apiReservedKeyCount,1);for(const l of old)assert.ok(m.heartbeat(l.leaseId));releaseAll(m,old);await m.tick();assert.equal(m.status().apiReservedKeyCount,2);assert.equal(m.status().backgroundKeyCount,4);assert.equal(m.status().backgroundRing.activeKeys,2);assert.equal(m.status().backgroundRing.waitingKeys,2);
 const current=[];for(let i=0;i<20;i++)current.push(await bg(m));assert.equal(new Set(current.map(x=>x.proxy.host)).size,2);assert.ok(current.every(x=>!x.apiReserved));
});
test('healthy admitted proxies are kept until the provider TTL margin; standing keys are not warmed',async t=>{
 const f=fixture(t),m=f.manager;await m.tick();const backgroundCalls=()=>f.calls.filter(k=>f.keys.indexOf(k)>=2).length,before=backgroundCalls();f.setClock(939999);await m.tick();assert.equal(backgroundCalls(),before);const a=await bg(m);m.release(a.leaseId);f.setClock(940000);await m.tick();assert.equal(m.status().backgroundRing.pendingReplacements,0);assert.equal(m.status().backgroundRing.readyKeys,2);assert.ok(f.calls.includes(f.keys[4]));assert.ok(f.calls.includes(f.keys[5]));
});
test('provider failures during TTL replacement preserve unrelated active assignments',async t=>{
 const f=fixture(t),m=f.manager;await m.tick();const a=await bg(m);m.report(a.leaseId,{status:'rate_limited'});f.failures.add(f.keys[4]);f.failures.add(f.keys[5]);const b=await bg(m,'facebook.source_page');assert.equal(m.status().backgroundRing.pendingReplacements,0);assert.ok(m.permit(b.leaseId).permitted);releaseAll(m,[a,b]);
});
test('a confirmed proxy CONNECT limit swaps a crawler key with a shared spare',async t=>{
 const f=fixture(t,{n:3,reserved:1,admitted:1}),m=f.manager;
 const initial=JSON.parse(fs.readFileSync(f.options.settingsFile));
 assert.throws(()=>m.setSettings({...initial,backgroundProxyRateLimitReplacement:'yes'}),{code:'PROXY_SETTINGS_INVALID'});
 m.setSettings({...initial,backgroundProxyRateLimitReplacement:true});
 await m.tick();
 const limited=await bg(m,'facebook.source_page');
 const peer=await bg(m,'youtube.comments');
 const api=await m.acquire({scope:'facebook.comments'});
 assert.equal(peer.proxy.host,limited.proxy.host);
 m.report(limited.leaseId,{status:'error',reason:'UPSTREAM_HTTP_429',responseObserved:true});
 assert.equal(m.status().backgroundRing.pendingReplacements,0);
 const limit={status:'rate_limited',reason:'PROXY_CONNECT_RATE_LIMITED',phase:'proxy_connect',connectStatus:429};
 m.report(limited.leaseId,limit);
 m.report(limited.leaseId,limit);
 assert.equal(m.status().totals.proxyRateLimitReplacementRequests,1);
 await assert.rejects(bg(m,'threads.comments'),{code:'PROXY_ENDPOINTS_UNAVAILABLE'});
 m.close();
 const restored=createProxyManager(f.options);
 t.after(()=>restored.close());
 assert.equal(restored.status().backgroundRing.pendingReplacements,1);
 await restored.tick();
 const replacement=await bg(restored,'facebook.source_page');
 assert.notEqual(replacement.proxy.host,limited.proxy.host);
 assert.equal(replacement.apiReserved,false);
 assert.ok(restored.permit(peer.leaseId).permitted);
 assert.ok(restored.permit(api.leaseId).permitted);
 assert.equal(restored.status().backgroundRing.waitingKeys,1);
 assert.equal(restored.status().totals.proxyRateLimitReplacements,1);
 releaseAll(restored,[limited,peer,api,replacement]);
});
test('HTTP background credentials use the ring; API credentials stay on four reserved keys',async t=>{
 const {once}=await import('node:events'),{createProxyManagerApp}=await import('../src/routes/proxyManagerApp.js'),{createProxyManagerClient}=await import('../src/services/proxyManagerClient.js');
 const f=fixture(t,{n:50,reserved:4,admitted:23}),m=f.manager;for(let i=0;i<3;i++)await m.tick();
 const key='api-ring-token-00000000000000000000',backgroundKey='bg-ring-token-000000000000000000000',adminKey='admin-ring-token-000000000000000000';
 const server=createProxyManagerApp({manager:m,key,backgroundKey,adminKey}).listen(0,'127.0.0.1');await once(server,'listening');t.after(()=>{server.closeAllConnections();server.close();});const url=`http://127.0.0.1:${server.address().port}`,client=createProxyManagerClient({url,key:backgroundKey}),api=createProxyManagerClient({url,key});
 const a=await client({platform:'facebook',operation:'comments'});assert.equal(a.apiReserved,false);await a.report({status:'error',reason:'UPSTREAM_HTTP_429'});await a.heartbeat();await assert.rejects(a.permit(),{code:'PROXY_ENDPOINTS_UNAVAILABLE'});await m.tick();assert.equal(m.status().backgroundRing.pendingReplacements,0);await a.heartbeat();await a.release();const b=await api({platform:'youtube',operation:'metrics'});assert.equal(b.apiReserved,true);await b.release();
});

test('unrestricted sharing immediately removes pacing, queued permits and shared lease caps for both services',async t=>{
 const f=fixture(t,{n:3,reserved:1,admitted:1}),m=f.manager;await m.tick();const a=await bg(m),b=await bg(m);m.permit(a.leaseId);assert.throws(()=>m.permit(b.leaseId),e=>e.code==='PROXY_PACING_WAIT');
 const cfg=JSON.parse(fs.readFileSync(f.options.settingsFile));m.setSettings({...cfg,maxLeasesPerKey:1,backgroundMaxLeases:1,unrestrictedSharing:true});
 for(let i=0;i<20;i++){assert.ok(m.permit(a.leaseId).permitted);assert.ok(m.permit(b.leaseId).permitted);}
 const bgLeases=[],apiLeases=[];for(let i=0;i<35;i++){bgLeases.push(await bg(m));apiLeases.push(await m.acquire({scope:'facebook.comments'}));}
 assert.equal(new Set(bgLeases.map(x=>x.proxy.host)).size,1);assert.equal(new Set(apiLeases.map(x=>x.proxy.host)).size,1);assert.notEqual(bgLeases[0].proxy.host,apiLeases[0].proxy.host);for(const l of [...bgLeases,...apiLeases])for(let i=0;i<3;i++)assert.ok(m.permit(l.leaseId).permitted);
 const status=m.status();assert.equal(status.maxLeasesPerKey,null);assert.equal(status.backgroundLeaseCapacity,null);assert.equal(status.unrestrictedSharing,true);assert.equal(status.backgroundRing.activeKeys,1);assert.equal(status.backgroundRing.waitingKeys,1);
});
test('unrestricted sharing survives restart and retains TTL cutoff and lease draining rules',async t=>{
 const f=fixture(t,{n:2,reserved:0,admitted:1}),m=f.manager;await m.tick();m.setSettings({...JSON.parse(fs.readFileSync(f.options.settingsFile)),unrestrictedSharing:true});const a=await bg(m);m.report(a.leaseId,{status:'rate_limited'});m.close();const restored=createProxyManager(f.options);assert.ok(restored.heartbeat(a.leaseId));await restored.tick();assert.ok(restored.heartbeat(a.leaseId));assert.equal(restored.status().unrestrictedSharing,true);assert.equal(restored.status().backgroundRing.pendingReplacements,0);
});
test('unrestricted sharing setting rejects non-boolean values',t=>{const m=fixture(t).manager;for(const value of [0,1,'true',null])assert.throws(()=>m.setSettings({unrestrictedSharing:value}),e=>e.code==='PROXY_SETTINGS_INVALID');});
test('repeated group transport errors do not evict a key used by other operations',async t=>{
 const f=fixture(t,{n:3,reserved:0,admitted:1}),m=f.manager;await m.tick();const a=await bg(m,'facebook.source_group'),b=await bg(m,'facebook.source_page');for(let i=0;i<3;i++)m.report(a.leaseId,{status:'proxy_error',reason:'PROXY_TLS_HANDSHAKE_TIMEOUT',phase:'proxy_tls',nativeCode:'PROXY_TLS_HANDSHAKE_TIMEOUT',connectStatus:200});await m.tick();assert.equal(m.status().backgroundRing.pendingReplacements,0);assert.ok(m.permit(b.leaseId).permitted);assert.throws(()=>m.permit(a.leaseId),{code:'PROXY_ENDPOINTS_UNAVAILABLE'});releaseAll(m,[a,b]);
});
test('failure history is isolated between operations even on the same shared endpoint',async t=>{
 const f=fixture(t,{n:3,reserved:0,admitted:1}),m=f.manager;await m.tick();const a=await bg(m,'facebook.source_group'),b=await bg(m,'facebook.source_page'),failure={status:'proxy_error',reason:'PROXY_TLS_HANDSHAKE_TIMEOUT',phase:'proxy_tls',nativeCode:'PROXY_TLS_HANDSHAKE_TIMEOUT',connectStatus:200};m.report(a.leaseId,failure);m.report(b.leaseId,{status:'ok',responseObserved:true});assert.equal(m.status().transportFailureHistory[0].failuresInWindow,1);m.report(b.leaseId,failure);assert.equal(m.status().transportFailureHistory.length,2);releaseAll(m,[a,b]);
});
test('expired quarantine retains failure history across restart but history expires after ten minutes',async t=>{
 const f=fixture(t,{n:3,reserved:0,admitted:1});let m=f.manager;await m.tick();const failure={status:'proxy_error',reason:'PROXY_TLS_HANDSHAKE_TIMEOUT',phase:'proxy_tls',nativeCode:'PROXY_TLS_HANDSHAKE_TIMEOUT',connectStatus:200},a=await bg(m,'youtube.comments');m.report(a.leaseId,failure);m.release(a.leaseId);f.setClock(f.clock()+120001);m.close();m=createProxyManager(f.options);assert.equal(m.status().endpointAvoidance.length,0);assert.equal(m.status().transportFailureHistory[0].failuresInWindow,1);const b=await bg(m,'youtube.comments');m.report(b.leaseId,failure);m.release(b.leaseId);assert.equal(m.status().transportFailureHistory[0].failuresInWindow,2);assert.equal(m.status().backgroundRing.pendingReplacements,0);f.setClock(f.clock()+480000);assert.equal(m.status().transportFailureHistory.length,0);const c=await bg(m,'youtube.comments');m.report(c.leaseId,failure);assert.equal(m.status().transportFailureHistory[0].failuresInWindow,1);assert.equal(m.status().backgroundRing.pendingReplacements,0);m.release(c.leaseId);
});
test('native response proof resets transport score while preserving an active quarantine and origin scope block',async t=>{
 const f=fixture(t,{n:3,reserved:0,admitted:1}),m=f.manager;await m.tick();const a=await bg(m,'youtube.comments'),failure={status:'proxy_error',reason:'PROXY_TLS_HANDSHAKE_TIMEOUT',phase:'proxy_tls',nativeCode:'PROXY_TLS_HANDSHAKE_TIMEOUT',connectStatus:200};m.report(a.leaseId,failure);m.report(a.leaseId,{status:'partial'});assert.equal(m.status().transportFailureHistory[0].failuresInWindow,1);m.report(a.leaseId,{status:'partial',responseObserved:true});assert.equal(m.status().transportFailureHistory[0].failuresInWindow,0);assert.throws(()=>m.permit(a.leaseId),e=>e.code==='PROXY_ENDPOINTS_UNAVAILABLE');m.release(a.leaseId);f.setClock(f.clock()+120001);const b=await bg(m,'youtube.comments');m.report(b.leaseId,{status:'partial',responseObserved:true});assert.equal(m.status().transportFailureHistory.length,0);assert.equal(m.status().backgroundRing.pendingReplacements,0);const blockedUntil=f.clock()+600000;m.importCooldowns({'youtube.*':blockedUntil});m.report(b.leaseId,{status:'partial',responseObserved:true});assert.equal(m.status().scopeBlocks['youtube.*'],blockedUntil);m.release(b.leaseId);
});
