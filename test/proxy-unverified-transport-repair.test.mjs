import test from'node:test';import assert from'node:assert/strict';import fs from'node:fs';import os from'node:os';import path from'node:path';import{createHash}from'node:crypto';import{createProxyManager}from'../src/services/proxyManager.js';import{proxyEndpoint}from'../src/services/proxyEndpoint.js';
const group='crawler-flow-facebook-group-source',page='crawler-flow-facebook-page-source',hash=x=>createHash('sha256').update(x).digest('hex').slice(0,24),networkError=()=>Object.assign(Error('reset'),{code:'ECONNRESET',responseObserved:false});
function fixture(t,{primaryError=networkError,secondary=async()=>{throw networkError();},peer=false,enabled=true,drain=false}={}){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'unverified-repair-')),keys=['new-main-key','new-spare-key','new-api-key'];let clock=100000;const keysFile=path.join(dir,'keys.json'),settingsFile=path.join(dir,'settings.json'),stateFile=path.join(dir,'state.json'),settings={unrestrictedSharing:true,backgroundActiveKeyCount:1,apiReservedKeyCount:1,backgroundQueueVerifyEgress:{[group]:true},backgroundQueueVerifyMainEgress:{[group]:true},backgroundQueueRequireVerifiedEgress:{[group]:true},backgroundQueueRepairMainTransport:{[group]:enabled},...(drain?{backgroundQueueDrainUnverifiedTransport:{[group]:true}}:{})},slots=keys.map((key,i)=>({id:hash(key),proxy:{host:'gateway-'+i,port:8080,bad:true},generation:1,expiresAt:clock+900000,nextRotateAt:0,scopes:peer&&i===0?{[page]:{lastStatus:'partial',updatedAt:clock+180000}}:{}}));
 const origin={scope:group,endpoint:proxyEndpoint(slots[0].proxy),kind:'origin',reason:'FACEBOOK_RATE_LIMITED',until:clock+800000,failedAt:clock-1000,attribution:'native',sourceVerified:true,sourceEndpoint:'a'.repeat(64)};fs.writeFileSync(keysFile,JSON.stringify(keys));fs.writeFileSync(settingsFile,JSON.stringify(settings));fs.writeFileSync(stateFile,JSON.stringify({slots,apiReservedKeyIds:[slots[2].id],backgroundRing:{activeKeyIds:[slots[0].id],waitingKeyIds:[slots[1].id]},endpointScopeBlocks:{[group+'|'+origin.endpoint]:origin}}));
 const rotations=[],confirmations=[],options={keysFile,settingsFile,stateFile,leaseIdleMs:1800000,now:()=>clock,verifyEgress:async p=>{if(p.bad)throw primaryError();return'203.0.113.20';},verifyTransportRecovery:async p=>{confirmations.push(p);return secondary(p);},makeRotator:key=>async opts=>{rotations.push({key,opts});return{host:'repaired',port:8080,expiresAt:clock+900000};}};let m=createProxyManager(options);t.after(async()=>{await m.settleTransportRepair();await m.settleEgressVerification();m.close();fs.rmSync(dir,{recursive:true,force:true});});return{get m(){return m;},slots,settings,rotations,confirmations,advance(ms){clock+=ms;},async check(){await m.tick();await m.settleEgressVerification();},async repair(){await m.tick();await m.settleTransportRepair();},restart(){m.close();m=createProxyManager(options);},acquire:q=>m.acquire({queue:q,scope:q===page?'facebook.source_page':'facebook.source_group',clientClass:'background'})};
}
async function quorum(f){for(let i=0;i<3;i++){if(i)f.advance(60001);await f.check();}}
test('the verification admission gate can repair an idle broken key without native group failures',async t=>{const f=fixture(t);await f.check();await f.repair();assert.equal(f.rotations.length,0);f.advance(60001);await f.check();await f.repair();assert.equal(f.rotations.length,0);f.advance(60001);await f.check();await f.repair();assert.equal(f.rotations.length,1);assert.deepEqual(f.rotations[0],{key:'new-main-key',opts:{rotateNetwork:true,previousNetwork:undefined}});assert.equal(f.confirmations.length,1);assert.ok(f.m.status().endpointScopeBlocks.some(x=>x.reason==='FACEBOOK_RATE_LIMITED'));assert.equal(f.m.status().keys.find(x=>x.keyId===f.slots[2].id).generation,1);await f.check();const lease=await f.acquire(group);assert.equal(f.m.permit(lease.leaseId).permitted,true);});
test('healthy independent TLS or an HTTP/certificate rejection vetoes repair',async t=>{for(const secondary of [async()=> '203.0.113.8',async()=>{throw Object.assign(Error('http'),{code:'PROXY_EGRESS_INVALID',responseObserved:true});},async()=>{throw Object.assign(Error('cert'),{code:'CERT_HAS_EXPIRED',responseObserved:false});}]){const f=fixture(t,{secondary});await quorum(f);await f.repair();assert.equal(f.rotations.length,0);assert.equal(f.confirmations.length,1);await f.repair();assert.equal(f.confirmations.length,1,'a veto is backoff-limited');}});
test('primary HTTP or inconsistent observation failures cannot manufacture a transport quorum',async t=>{for(const primaryError of [()=>Object.assign(Error('http'),{code:'ECONNRESET',responseObserved:true}),()=>Object.assign(Error('unknown'),{code:'ECONNRESET'}),()=>Object.assign(Error('bad'),{code:'PROXY_EGRESS_INVALID',responseObserved:false})]){const f=fixture(t,{primaryError});await quorum(f);await f.repair();assert.equal(f.rotations.length,0);assert.equal(f.confirmations.length,0);}});
test('a peer lease and recent peer success protect the assignment',async t=>{for(const peer of [false,true]){const f=fixture(t),lease=peer?null:await f.acquire(page);await quorum(f);if(peer){const p=await f.acquire(page);f.m.report(p.leaseId,{status:'partial'});f.m.release(p.leaseId);}await f.repair();assert.equal(f.rotations.length,0);assert.equal(f.confirmations.length,0);if(lease)assert.equal(f.m.permit(lease.leaseId).permitted,true);}});
test('a lease acquired while secondary verification runs cancels the pending repair',async t=>{let release;const wait=new Promise(r=>release=r),f=fixture(t,{secondary:async()=>{await wait;throw networkError();}});await quorum(f);await f.m.tick();await new Promise(r=>setImmediate(r));const lease=await f.acquire(page);release();await f.m.settleTransportRepair();assert.equal(f.rotations.length,0);assert.equal(f.m.permit(lease.leaseId).permitted,true);assert.equal(f.m.status().totals.mainUnverifiedTransportStale,1);});
test('disabling repair during confirmation prevents rotation',async t=>{let release;const wait=new Promise(r=>release=r),f=fixture(t,{secondary:async()=>{await wait;throw networkError();}});await quorum(f);await f.m.tick();await new Promise(r=>setImmediate(r));f.m.setSettings({...f.settings,backgroundQueueRepairMainTransport:{[group]:false}});release();await f.m.settleTransportRepair();assert.equal(f.rotations.length,0);});
test('the primary quorum survives restart and repair opt-out remains authoritative',async t=>{const f=fixture(t);await f.check();f.advance(60001);await f.check();f.restart();f.advance(60001);await f.check();await f.repair();assert.equal(f.rotations.length,1);const off=fixture(t,{enabled:false});await quorum(off);await off.repair();assert.equal(off.rotations.length,0);});
test('shutdown discards a pending secondary failure without rotation or late state writes',async t=>{let release;const wait=new Promise(r=>release=r),f=fixture(t,{secondary:async()=>{await wait;throw networkError();}});await quorum(f);await f.m.tick();await new Promise(r=>setImmediate(r));f.m.close();const slot=f.m.status().keys.find(x=>x.keyId===f.slots[0].id);release();await f.m.settleTransportRepair();assert.equal(f.rotations.length,0);assert.equal(f.m.status().keys.find(x=>x.keyId===slot.keyId).generation,slot.generation);});

test('opt-in transport drain stops replacement leases while the existing owner finishes, then repairs',async t=>{
 const f=fixture(t,{drain:true}),lease=await f.acquire(page);await quorum(f);await f.repair();
 assert.equal(f.confirmations.length,1);assert.equal(f.rotations.length,0);
 assert.equal(f.m.status().keys.find(x=>x.keyId===f.slots[0].id).transportRepairDraining,true);
 assert.equal(f.m.permit(lease.leaseId).permitted,true);
 await assert.rejects(f.acquire(page),{code:'PROXY_POOL_BUSY'});
 f.m.release(lease.leaseId);await f.repair();assert.equal(f.rotations.length,1);
 assert.equal(f.m.status().totals.mainUnverifiedDrainsStarted,1);
 assert.equal(f.m.status().keys.find(x=>x.keyId===f.slots[0].id).transportRepairDraining,false);
 assert.ok(f.m.status().endpointScopeBlocks.some(x=>x.reason==='FACEBOOK_RATE_LIMITED'));
 await f.check();assert.ok((await f.acquire(group)).leaseId);
});
test('a healthy peer cancels an opt-in drain without revoking or rotating its assignment',async t=>{
 const f=fixture(t,{drain:true}),lease=await f.acquire(page);await quorum(f);await f.repair();
 f.m.report(lease.leaseId,{status:'partial',responseObserved:true});
 assert.equal(f.m.status().keys.find(x=>x.keyId===f.slots[0].id).transportRepairDraining,false);
 assert.ok((await f.acquire(page)).leaseId);await f.repair();assert.equal(f.rotations.length,0);
});
test('a persisted drain expires after 180 seconds without revoking a long lived lease',async t=>{
 const f=fixture(t,{drain:true}),lease=await f.acquire(page);await quorum(f);await f.repair();f.restart();
 await assert.rejects(f.acquire(page),{code:'PROXY_POOL_BUSY'});
 f.advance(180001);assert.equal(f.m.permit(lease.leaseId).permitted,true);await f.repair();
 assert.equal(f.rotations.length,0);assert.ok((await f.acquire(page)).leaseId);
});
test('disabling opt-in drain releases admission and prevents repair of an active key',async t=>{
 const f=fixture(t,{drain:true}),lease=await f.acquire(page);await quorum(f);await f.repair();
 f.m.setSettings({...f.settings,backgroundQueueDrainUnverifiedTransport:{[group]:false}});
 assert.ok((await f.acquire(page)).leaseId);await f.repair();assert.equal(f.rotations.length,0);assert.equal(f.m.permit(lease.leaseId).permitted,true);
});
test('drain policy requires verified egress and repair; malformed policies are rejected',async t=>{
 const f=fixture(t);for(const value of [null,[],{unknown:true},{[group]:3}])assert.throws(()=>f.m.setSettings({...f.settings,backgroundQueueDrainUnverifiedTransport:value}),{code:'PROXY_SETTINGS_INVALID'});
 for(const field of ['backgroundQueueRequireVerifiedEgress','backgroundQueueVerifyMainEgress','backgroundQueueRepairMainTransport'])assert.throws(()=>f.m.setSettings({...f.settings,[field]:{[group]:false},backgroundQueueDrainUnverifiedTransport:{[group]:true}}),{code:'PROXY_SETTINGS_INVALID'});
});
test('a drained key promoted into API reservation never withholds API leases',async t=>{
 const f=fixture(t,{drain:true}),lease=await f.acquire(page);await quorum(f);await f.repair();f.m.release(lease.leaseId);
 f.m.setSettings({...f.settings,apiReservedKeyCount:3});
 for(let i=0;i<3;i++)assert.ok((await f.m.acquire({scope:'facebook.source_page'})).leaseId);
 assert.equal(f.m.status().keys.find(x=>x.keyId===f.slots[0].id).transportRepairDraining,false);assert.equal(f.rotations.length,0);
});
test('disabling the background ring releases a persisted admission hold immediately',async t=>{
 const f=fixture(t,{drain:true}),lease=await f.acquire(page);await quorum(f);await f.repair();
 f.m.setSettings({...f.settings,backgroundActiveKeyCount:undefined});
 assert.ok((await f.acquire(page)).leaseId);assert.equal(f.m.permit(lease.leaseId).permitted,true);assert.equal(f.rotations.length,0);
});
