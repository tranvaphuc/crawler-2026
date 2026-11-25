import test from'node:test';import assert from'node:assert/strict';import fs from'node:fs';import os from'node:os';import path from'node:path';import{createHash}from'node:crypto';
import{createProxyManager}from'../src/services/proxyManager.js';import{proxyEndpoint}from'../src/services/proxyEndpoint.js';
const group='crawler-flow-facebook-group-source',page='crawler-flow-facebook-page-source',hash=x=>createHash('sha256').update(x).digest('hex').slice(0,24);
function fixture(t,{enabled=true,nativeFailures=3,originOnly=false,verificationFails=true,peerSuccess=false,providerFails=false}={}){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'main-transport-repair-')),keys=['repair-main-key','repair-waiting-key','repair-api-key'];let clock=100000;
 const keysFile=path.join(dir,'keys.json'),settingsFile=path.join(dir,'settings.json'),stateFile=path.join(dir,'state.json'),settings={unrestrictedSharing:true,backgroundActiveKeyCount:1,apiReservedKeyCount:1,backgroundQueueVerifyEgress:{[group]:true},backgroundQueueVerifyMainEgress:{[group]:true},backgroundQueueRepairMainTransport:{[group]:enabled}};
 const slots=keys.map((key,i)=>({id:hash(key),proxy:{host:'gateway-'+i,port:8080,bad:true,expiresAt:clock+900000},generation:1,expiresAt:clock+900000,nextRotateAt:0,scopes:peerSuccess&&i===0?{[page]:{lastStatus:'partial',updatedAt:clock,success:1}}:{}}));
 const rows=Object.fromEntries(slots.map(s=>{const endpoint=proxyEndpoint(s.proxy);return[group+'|'+endpoint,{scope:group,endpoint,failedAt:clock-1000,until:clock+300000,reason:originOnly?'FACEBOOK_RATE_LIMITED':'NETWORK_ERROR',...(originOnly?{kind:'origin'}:{phase:'proxy_connect',count:nativeFailures,recoveryRounds:nativeFailures})}];}));
 fs.writeFileSync(keysFile,JSON.stringify(keys));fs.writeFileSync(settingsFile,JSON.stringify(settings));fs.writeFileSync(stateFile,JSON.stringify({slots,leases:[],apiReservedKeyIds:[slots[2].id],backgroundRing:{activeKeyIds:[slots[0].id],waitingKeyIds:[slots[1].id]},[originOnly?'endpointScopeBlocks':'endpointAvoidance']:rows}));
 const rotations=[],options={keysFile,settingsFile,stateFile,now:()=>clock,verifyEgress:async p=>{if(verificationFails&&p.bad)throw Object.assign(Error('reset'),{code:'ECONNRESET'});return '203.0.113.12';},makeRotator:key=>async options=>{rotations.push({key,options});if(providerFails)throw Object.assign(Error('cooldown'),{code:'PROXY_API_COOLDOWN',retryAfterMs:60000});return{host:'replacement',port:8080,expiresAt:clock+900000};}};let m=createProxyManager(options);
 t.after(async()=>{await m.settleTransportRepair();await m.settleEgressVerification();m.close();fs.rmSync(dir,{recursive:true,force:true});});
 return{get m(){return m;},restart(){m.close();m=createProxyManager(options);},settings,slots,rotations,advance(ms){clock+=ms;},async check(){await m.tick();await m.settleEgressVerification();},async repair(){await m.tick();await m.settleTransportRepair();},acquire:q=>m.acquire({scope:q===page?'facebook.source_page':'facebook.source_group',queue:q||group,clientClass:'background'})};
}
test('repeated native transport failure plus independent reset refreshes only an idle main assignment',async t=>{
 const f=fixture(t);await f.check();assert.equal(f.rotations.length,0);await f.repair();assert.deepEqual(f.rotations.map(x=>x.key),['repair-main-key']);assert.equal(f.rotations[0].options.rotateNetwork,true);assert.equal(f.m.status().totals.mainTransportRotations,1);assert.ok(f.m.status().endpointAvoidance.some(x=>x.scope===group));assert.ok(f.m.status().keys.filter(x=>x.keyId!==f.slots[0].id).every(x=>x.generation===1));
});
test('an active page lease is never rotated and may finish before repair',async t=>{
 const f=fixture(t),p=await f.acquire(page);await f.check();await f.repair();assert.equal(f.rotations.length,0);assert.equal(f.m.permit(p.leaseId).permitted,true);f.m.release(p.leaseId);await f.repair();assert.equal(f.rotations.length,1);
});
test('recent successful peer traffic vetoes repair even with a failed IP check',async t=>{
 const f=fixture(t,{peerSuccess:true});await f.check();await f.repair();assert.equal(f.rotations.length,0);f.advance(60001);await f.repair();assert.equal(f.rotations.length,1);
});
test('origin rejection alone cannot request a transport repair or clear its block',async t=>{
 const f=fixture(t,{originOnly:true});await f.check();await f.repair();assert.equal(f.rotations.length,0);await assert.rejects(f.acquire(),{code:'PROXY_ENDPOINTS_UNAVAILABLE'});
});
test('a successful independent check or a single native error does not rotate the key',async t=>{
 for(const options of [{verificationFails:false},{nativeFailures:1}]){const f=fixture(t,options);await f.check();await f.repair();assert.equal(f.rotations.length,0);}
});
test('provider cooldown prevents repair retries while leaving keys and queue blocks intact',async t=>{
 const f=fixture(t,{providerFails:true});await f.check();await f.repair();await f.repair();assert.equal(f.rotations.length,1);assert.equal(f.m.status().totals.mainTransportRepairFailures,1);assert.equal(f.m.status().keys.find(x=>x.keyId===f.slots[0].id).disabled,false);assert.ok(f.m.status().endpointAvoidance.length);
});
test('repair is opt-in and rejects malformed queue policies',async t=>{
 const f=fixture(t,{enabled:false});await f.check();await f.repair();assert.equal(f.rotations.length,0);for(const value of [null,[],{unknown:true},{[group]:3}])assert.throws(()=>f.m.setSettings({...f.settings,backgroundQueueRepairMainTransport:value}),{code:'PROXY_SETTINGS_INVALID'});
});
test('repeated unsuccessful assignments back off across generations and manager restarts',async t=>{
 const f=fixture(t,{providerFails:true});await f.check();await f.repair();f.advance(60001);await f.check();await f.repair();assert.equal(f.rotations.length,2);f.restart();f.advance(60001);await f.check();await f.repair();assert.equal(f.rotations.length,2,'second repair must wait two minutes even though provider cooldown ended');f.advance(60001);await f.check();await f.repair();assert.equal(f.rotations.length,3);assert.equal(f.m.status().totals.mainTransportRepairAttempts,3);
});
