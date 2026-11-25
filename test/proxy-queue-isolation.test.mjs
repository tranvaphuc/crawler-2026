import test from 'node:test';import assert from 'node:assert/strict';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {once} from 'node:events';
import {createProxyManager} from '../src/services/proxyManager.js';
import {createProxyManagerApp} from '../src/routes/proxyManagerApp.js';
import {createProxyManagerClient} from '../src/services/proxyManagerClient.js';
import {crawlerQueue,runCrawlerQueue} from '../src/services/crawlerQueueContext.js';
import {createFacebookSessionPool} from '../src/services/facebookSessionPool.js';
import {bindHttpState} from '../src/services/socialLeaseState.js';
import {originCooldownScope} from '../src/services/originRateLimit.js';
import {createOriginWorkerGate} from '../src/services/originWorkerGate.js';
const comment='crawler-flow-facebook-comment',reply='crawler-flow-facebook-reply';
async function fixture(t){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'proxy-queue-')),keysFile=path.join(dir,'keys.json'),stateFile=path.join(dir,'state.json'),settingsFile=path.join(dir,'settings.json');
 fs.writeFileSync(keysFile,JSON.stringify(['queue-test-key']));fs.writeFileSync(settingsFile,JSON.stringify({unrestrictedSharing:true}));
 const options={keysFile,stateFile,settingsFile,makeRotator:()=>async()=>({host:'shared-endpoint',port:8080,expiresAt:Date.now()+900000})},manager=createProxyManager(options),key='queue-isolation-test-auth-000000000000';
 const server=createProxyManagerApp({manager,key}).listen(0,'127.0.0.1');await once(server,'listening');t.after(()=>{server.closeAllConnections();server.close();manager.close();fs.rmSync(dir,{recursive:true,force:true});});
 return {manager,options,client:createProxyManagerClient({url:'http://127.0.0.1:'+server.address().port,key})};
}
test('concurrent comment and reply requests retain different queue identities despite sharing the same API and proxy',async t=>{
 const f=await fixture(t),leases=await Promise.all([comment,reply].map(queue=>runCrawlerQueue(queue,async()=>{await new Promise(r=>setTimeout(r,1));assert.equal(crawlerQueue(),queue);return f.client({platform:'facebook',operation:'comments',minProxyRemainingMs:1000});})));
 const [a,b]=leases;assert.equal(a.host,b.host);assert.equal(a.scope,b.scope);assert.notEqual(a.queue,b.queue);
 await a.report({status:'rate_limited',reason:'FACEBOOK_RATE_LIMITED'});await assert.rejects(a.permit());assert.ok(await b.permit());
 await assert.rejects(runCrawlerQueue(comment,()=>f.client({platform:'facebook',operation:'comments',minProxyRemainingMs:1000})),{code:'PROXY_ENDPOINTS_UNAVAILABLE'});
 const next=await runCrawlerQueue(reply,()=>f.client({platform:'facebook',operation:'comments',minProxyRemainingMs:1000}));assert.equal(next.host,a.host);await next.report({status:'ok',responseObserved:true});
 await assert.rejects(a.permit());await Promise.all([...leases,next].map(l=>l.release()));assert.equal(crawlerQueue(),undefined);
 const restored=createProxyManager(f.options);await assert.rejects(restored.acquire({scope:'facebook.comments',queue:comment,minRemainingMs:1000}));assert.ok(await restored.acquire({scope:'facebook.comments',queue:reply,minRemainingMs:1000}));restored.close();
});
test('TLS failure in comment never revokes a reply permit or its next assignment',async t=>{
 const {client}=await fixture(t),a=await runCrawlerQueue(comment,()=>client({platform:'facebook',operation:'comments'})),b=await runCrawlerQueue(reply,()=>client({platform:'facebook',operation:'comments'}));
 await a.report({status:'proxy_error',reason:'PROXY_TLS_HANDSHAKE_TIMEOUT',phase:'proxy_tls',connectStatus:200});await assert.rejects(a.permit(),{code:'PROXY_ENDPOINTS_UNAVAILABLE'});assert.ok(await b.permit());const c=await runCrawlerQueue(reply,()=>client({platform:'facebook',operation:'comments'}));assert.equal(c.host,a.host);await Promise.all([a,b,c].map(l=>l.release()));
});
test('session borrowing cannot move a comment lease into the reply queue',async()=>{
 const pool=createFacebookSessionPool(),state={};bindHttpState(state,{session:{},lease:{managed:true,scope:'facebook.comments',queue:comment,expiresAt:Date.now()+300000},dispose:async()=>{}});await pool.put('same-post',state);
 assert.equal(await runCrawlerQueue(reply,()=>pool.take('same-post',{}, {transportScope:'facebook.comments'})),false);assert.equal(await runCrawlerQueue(comment,()=>pool.take('same-post',{}, {transportScope:'facebook.comments'})),true);await pool.close();
});
test('queue cooldown gate cannot pause another queue on the same platform',async()=>{
 const fake=name=>({name,paused:false,isPaused(){return this.paused;},async pause(){this.paused=true;},resume(){this.paused=false;}}),source=fake('threads-source'),comments=fake('threads-comment');
 const sourceScope=runCrawlerQueue('crawler-flow-threads-source',()=>originCooldownScope({platform:'threads'})),commentScope=runCrawlerQueue('crawler-flow-threads-comment',()=>originCooldownScope({platform:'threads'}));assert.notEqual(sourceScope,commentScope);
 const gate=createOriginWorkerGate({remaining:async()=>0});gate.register({name:'threads-source',platform:'threads',kind:'source'},source);gate.register({name:'threads-comment',platform:'threads',kind:'comments'},comments);await gate.hold(sourceScope,10000);assert.equal(source.paused,true);assert.equal(comments.paused,false);await gate.close();
});
test('manager rejects unknown or cross-platform queue identities',async t=>{
 const {manager}=await fixture(t);for(const queue of ['crawler-flow-unknown','crawler-flow-youtube-source'])await assert.rejects(manager.acquire({scope:'facebook.comments',queue}),{code:'PROXY_QUEUE_INVALID'});
});

test('background ring keeps the same key for reply when comment is limited',async t=>{
 const {manager}=await fixture(t);manager.setSettings({unrestrictedSharing:true,backgroundActiveKeyCount:1});await manager.tick();
 const a=await manager.acquire({scope:'facebook.comments',queue:comment,clientClass:'background'}),b=await manager.acquire({scope:'facebook.comments',queue:reply,clientClass:'background'});
 manager.report(a.leaseId,{status:'rate_limited',reason:'FACEBOOK_RATE_LIMITED',global:true});await assert.rejects(manager.acquire({scope:'facebook.comments',queue:comment,clientClass:'background'}),{code:'PROXY_ENDPOINTS_UNAVAILABLE'});assert.ok(manager.permit(b.leaseId).permitted);assert.equal(a.proxy.host,b.proxy.host);await manager.tick();assert.equal(manager.status().backgroundRing.pendingReplacements,0);manager.release(a.leaseId);manager.release(b.leaseId);
});
test('all API calls inside one queue share only that queue endpoint block',async t=>{
 const {manager}=await fixture(t),queue='crawler-flow-facebook-group-source',a=await manager.acquire({scope:'facebook.resolve_source',queue});manager.report(a.leaseId,{status:'rate_limited',reason:'FACEBOOK_RATE_LIMITED'});await assert.rejects(manager.acquire({scope:'facebook.source_group',queue}));const other=await manager.acquire({scope:'facebook.resolve_source',queue:'crawler-flow-find-uid'});assert.equal(other.proxy.host,a.proxy.host);manager.release(a.leaseId);manager.release(other.leaseId);
});
