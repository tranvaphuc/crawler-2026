import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {createHash} from 'node:crypto';
import {createProxyManager} from '../src/services/proxyManager.js';
import {proxyEndpoint,proxyEgressEndpoint} from '../src/services/proxyEndpoint.js';
const group='crawler-flow-facebook-group-source',page='crawler-flow-facebook-page-source';
const hash=k=>createHash('sha256').update(k).digest('hex').slice(0,24);
function fixture(t,{verify,blocked=true,sameExit=false,count=4,api=1,blockForMs=890000}={}){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'main-egress-')),keys=Array.from({length:count},(_,i)=>'main-egress-key-'+i),keysFile=path.join(dir,'keys.json'),stateFile=path.join(dir,'state.json'),settingsFile=path.join(dir,'settings.json');let clock=100000;
 const slots=keys.map((k,i)=>({id:hash(k),proxy:{host:'gateway-'+i,port:8080,exitForTest:'203.0.113.'+(i+1),expiresAt:clock+900000},expiresAt:clock+900000,generation:1,nextRotateAt:0,scopes:{},queueEgress:{}}));
 const block=endpoint=>({scope:group,endpoint,kind:'origin',status:'rate_limited',reason:'FACEBOOK_RATE_LIMITED',failedAt:clock-1000,until:clock+blockForMs});
 const settings={unrestrictedSharing:true,backgroundActiveKeyCount:1,apiReservedKeyCount:api,backgroundQueueVerifyEgress:{[group]:true},backgroundQueueVerifyMainEgress:{[group]:true}};
 fs.writeFileSync(keysFile,JSON.stringify(keys));fs.writeFileSync(settingsFile,JSON.stringify(settings));fs.writeFileSync(stateFile,JSON.stringify({slots,leases:[],apiReservedKeyIds:api?slots.slice(-api).map(x=>x.id):[],backgroundRing:{activeKeyIds:[slots[0].id],waitingKeyIds:slots.slice(1,count-api).map(x=>x.id)},endpointScopeBlocks:blocked?Object.fromEntries(slots.slice(0,count-api).map(s=>[group+'|'+proxyEndpoint(s.proxy),block(proxyEndpoint(s.proxy))])):{}}));
 const calls=[],rotations=[],rotationOptions=[],options={keysFile,stateFile,settingsFile,leaseIdleMs:1800000,now:()=>clock,verifyEgress:async proxy=>{calls.push(proxy);return verify?verify(proxy):proxy.exitForTest;},makeRotator:key=>async requestOptions=>{rotationOptions.push({key,options:requestOptions});const i=keys.indexOf(key);rotations.push(i);return{host:'gateway-'+i,port:8080,exitForTest:'203.0.113.'+(sameExit?i+1:100+i),expiresAt:clock+900000};}};
 const m=createProxyManager(options);t.after(()=>{m.close();fs.rmSync(dir,{recursive:true,force:true});});
 return{m,options,slots,settings,calls,rotations,rotationOptions,clock:()=>clock,advance(ms){clock+=ms;},acquire:(queue=group)=>m.acquire({scope:queue===page?'facebook.source_page':'facebook.source_group',queue,clientClass:'background'})};
}
test('main verification seeds unknown baselines without clearing old group blocks or touching page/API leases',async t=>{
 const f=fixture(t),p=await f.acquire(page),api=await f.m.acquire({scope:'facebook.comments'});await f.m.tick();await f.m.settleEgressVerification();
 assert.equal(f.calls.length,6);assert.equal(f.rotations.length,0);assert.equal(f.calls.some(x=>x.host==='gateway-3'),false);assert.equal(f.m.permit(p.leaseId).permitted,true);assert.equal(f.m.permit(api.leaseId).permitted,true);
 await assert.rejects(f.acquire(),{code:'PROXY_ENDPOINTS_UNAVAILABLE'});assert.equal(f.m.status().endpointScopeBlocks.filter(x=>x.scope===page).length,0);assert.equal(f.m.status().queueEgress.filter(x=>x.ready).length,3);f.m.release(p.leaseId);f.m.release(api.leaseId);
});
test('a normal main replacement with two verified new-exit observations recovers group only and retains old blocks',async t=>{
 const f=fixture(t);await f.m.tick();await f.m.settleEgressVerification();const old=proxyEgressEndpoint({},'203.0.113.2'),raw=proxyEndpoint(f.slots[1].proxy);f.advance(840001);await f.m.tick();await f.m.tick();await f.m.settleEgressVerification();
 const l=await f.acquire();assert.equal(proxyEndpoint(l.proxy),proxyEgressEndpoint({},'203.0.113.101'));assert.equal(f.m.permit(l.leaseId).permitted,true);assert.ok(f.m.status().endpointScopeBlocks.some(x=>x.endpoint===old));assert.ok(f.m.status().endpointScopeBlocks.some(x=>x.endpoint===raw));assert.ok(f.m.status().totals.mainEgressRecovered>=1);f.m.release(l.leaseId);
});
test('same exit after a normal rotation remains blocked despite a new generation',async t=>{
 const f=fixture(t,{sameExit:true});await f.m.tick();await f.m.settleEgressVerification();f.advance(840001);await f.m.tick();await f.m.tick();await f.m.settleEgressVerification();await assert.rejects(f.acquire(),{code:'PROXY_ENDPOINTS_UNAVAILABLE'});assert.equal(f.m.status().totals.mainEgressRecovered||0,0);
});
test('normal idle main replacement requests a network change only for group-blocked background keys',async t=>{
 const f=fixture(t);const p=await f.acquire(page);await f.m.tick();await f.m.settleEgressVerification();f.advance(840001);await f.m.tick();
 assert.equal(f.rotationOptions.find(x=>x.key==='main-egress-key-1')?.options?.rotateNetwork,true);
 assert.equal(f.rotationOptions.some(x=>x.key==='main-egress-key-0'),false,'the old page lease must keep its key');
 assert.equal(f.rotationOptions.find(x=>x.key==='main-egress-key-3')?.options,undefined,'API key uses its original rotation policy');
 assert.equal(f.m.permit(p.leaseId).permitted,true);f.m.release(p.leaseId);
});
test('background checks are bounded to two and never stall tick or page acquisition',async t=>{
 let release,active=0,max=0;const gate=new Promise(r=>release=r);const f=fixture(t,{verify:async proxy=>{active++;max=Math.max(max,active);await gate;active--;return proxy.exitForTest;}});
 await f.m.tick();assert.equal(f.m.status().mainEgressVerification.inFlight.length,2);const p=await f.acquire(page);assert.equal(f.m.permit(p.leaseId).permitted,true);release();await f.m.settleEgressVerification();assert.equal(max,2);assert.equal(f.rotations.length,0);f.m.release(p.leaseId);
});
test('failed or inconsistent main observations cannot open a blocked endpoint',async t=>{
 for(const unstable of [false,true]){const counts=new Map();const f=fixture(t,{verify:async proxy=>{if(!unstable)throw Error('echo reset');const n=(counts.get(proxy.host)||0)+1;counts.set(proxy.host,n);return n%2?'203.0.113.9':'203.0.113.10';}});await f.m.tick();await f.m.settleEgressVerification();assert.equal(f.m.status().queueEgress.some(x=>x.ready),false);await assert.rejects(f.acquire(),{code:'PROXY_ENDPOINTS_UNAVAILABLE'});assert.ok(f.m.status().totals.egressVerificationFailures>0);}
});
test('a group lease acquired during verification keeps its original identity and makes the pending result stale',async t=>{
 let release;const gate=new Promise(r=>release=r),f=fixture(t,{blocked:false,verify:async proxy=>{await gate;return proxy.exitForTest;}});await f.m.tick();const l=await f.acquire();const raw=proxyEndpoint(l.proxy);release();await f.m.settleEgressVerification();assert.equal(l.proxy.queueEndpoint,undefined);assert.notEqual(f.m.status().queueEgress.find(x=>x.keyId===f.slots[0].id)?.ready,true);assert.equal(f.m.permit(l.leaseId).permitted,true);assert.equal(proxyEndpoint(l.proxy),raw);f.m.release(l.leaseId);
});
test('a native rejection arriving during post-rotation verification is inherited by the observed exit',async t=>{
 let pause=false,release;const gate=new Promise(r=>release=r),f=fixture(t,{blocked:false,verify:async proxy=>{if(pause)await gate;return proxy.exitForTest;}});await f.m.tick();await f.m.settleEgressVerification();f.advance(840001);pause=true;await f.m.tick();await f.m.tick();const l=await f.acquire();assert.equal(l.generation,2);f.m.report(l.leaseId,{status:'rate_limited',reason:'FACEBOOK_RATE_LIMITED'});f.m.release(l.leaseId);release();await f.m.settleEgressVerification();await assert.rejects(f.acquire(),{code:'PROXY_ENDPOINTS_UNAVAILABLE'});assert.ok(f.m.status().endpointScopeBlocks.some(x=>x.endpoint===proxyEgressEndpoint({},'203.0.113.101')));
});
test('old probe results across intervening rotations never verify the latest generation',async t=>{
 let release;const gate=new Promise(r=>release=r),f=fixture(t,{count:2,api:0,verify:async proxy=>{await gate;return proxy.exitForTest;}});await f.m.tick();f.advance(840001);await f.m.tick();f.advance(840001);await f.m.tick();release();await f.m.settleEgressVerification();assert.ok(f.m.status().totals.mainEgressStale>=2);for(const row of f.m.status().queueEgress){const slot=f.m.status().keys.find(x=>x.keyId===row.keyId);if(row.ready)assert.equal(row.generation,slot.generation);}
});
test('an intervening unverified rotation destroys the old before-IP proof',async t=>{
 let deny=false;const f=fixture(t,{count:2,api:0,blockForMs:3600000,verify:async proxy=>{if(deny&&proxy.exitForTest.endsWith('100')||deny&&proxy.exitForTest.endsWith('101'))throw Error('echo timeout');return proxy.exitForTest;}});
 await f.m.tick();await f.m.settleEgressVerification();deny=true;
 for(let i=0;i<3;i++){f.advance(840001);await f.m.tick();await f.m.tick();await f.m.settleEgressVerification();}
 deny=false;f.advance(60001);await f.m.tick();await f.m.settleEgressVerification();await assert.rejects(f.acquire(),{code:'PROXY_ENDPOINTS_UNAVAILABLE'});assert.equal(f.m.status().totals.mainEgressRecovered||0,0);
});
test('a valid pending rotation proof survives manager restart',async t=>{
 const f=fixture(t);await f.m.tick();await f.m.settleEgressVerification();f.advance(840001);await f.m.tick();f.m.close();const restored=createProxyManager(f.options);
 try{await restored.tick();await restored.settleEgressVerification();const l=await restored.acquire({scope:'facebook.source_group',queue:group,clientClass:'background'});assert.equal(proxyEndpoint(l.proxy),proxyEgressEndpoint({},'203.0.113.101'));restored.release(l.leaseId);}finally{restored.close();}
});
test('feature opt-out makes no new checks and malformed queue settings are rejected',async t=>{
 const f=fixture(t);f.m.setSettings({...f.settings,backgroundQueueVerifyMainEgress:{[group]:false}});await f.m.tick();assert.equal(f.calls.length,0);for(const value of [null,[],{unknown:true},{[group]:1}])assert.throws(()=>f.m.setSettings({...f.settings,backgroundQueueVerifyMainEgress:value}),{code:'PROXY_SETTINGS_INVALID'});
});
test('shutdown discards late checker results rather than writing stale state',async t=>{
 let release;const gate=new Promise(r=>release=r),f=fixture(t,{verify:async proxy=>{await gate;return proxy.exitForTest;}});await f.m.tick();f.m.close();const before=fs.readFileSync(f.options.stateFile,'utf8');release();await f.m.settleEgressVerification();assert.equal(fs.readFileSync(f.options.stateFile,'utf8'),before);
});
