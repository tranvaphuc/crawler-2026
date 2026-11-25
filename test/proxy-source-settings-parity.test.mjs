import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
const {createProxyManager}=await import(process.env.PROXY_MANAGER_RUNTIME_MODULE||'../src/services/proxyManager.js');
test('removing Group overrides applies Page/User sharing and pacing immediately without revoking live leases',async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'source-parity-')),keysFile=path.join(dir,'keys.json'),settingsFile=path.join(dir,'settings.json'),q='crawler-flow-facebook-group-source';
 fs.writeFileSync(keysFile,JSON.stringify(['fixture-source-parity-key']));
 const before={unrestrictedSharing:true,backgroundActiveKeyCount:1,backgroundQueueMaxLeasesPerEndpoint:{[q]:2},backgroundQueueMinIntervalMs:{[q]:500}};
 fs.writeFileSync(settingsFile,JSON.stringify(before));const m=createProxyManager({keysFile,settingsFile,makeRotator:()=>async()=>({host:'fixture-proxy',port:8080,expiresAt:Date.now()+1800000})});
 t.after(()=>{m.close();fs.rmSync(dir,{recursive:true,force:true});});await m.tick();
 const acquire=()=>m.acquire({scope:'facebook.source_group',queue:q,clientClass:'background'}),a=await acquire(),b=await acquire();await assert.rejects(acquire(),{code:'PROXY_POOL_BUSY'});
 m.setSettings({...before,backgroundQueueMaxLeasesPerEndpoint:{},backgroundQueueMinIntervalMs:{}});
 const c=await acquire();for(const l of [a,b,c])assert.equal(m.permit(l.leaseId).permitted,true);
 for(const name of ['page','user']){const l=await m.acquire({scope:'facebook.source_'+name,queue:'crawler-flow-facebook-'+name+'-source',clientClass:'background'});assert.equal(m.permit(l.leaseId).permitted,true);}
 assert.equal(m.status().activeLeases,5);assert.deepEqual(JSON.parse(fs.readFileSync(settingsFile)).backgroundQueueMaxLeasesPerEndpoint,{});
});
