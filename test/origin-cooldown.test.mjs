import test from'node:test';import assert from'node:assert/strict';import{spawn}from'node:child_process';import net from'node:net';import fs from'node:fs/promises';import os from'node:os';import path from'node:path';import{setTimeout as sleep}from'node:timers/promises';
import Redis from'ioredis';import{Queue}from'bullmq';
import{boundedProxyRead,FLOW_RETRY_LIMIT}from'../src/services/crawlerQueueFlow.js';
import{CheckpointWorker,ProxyWaitDelayedError}from'../src/services/crawlerProxyWait.js';
import{createOriginCooldowns,FlowOriginWaitError,delayOriginJob}from'../src/services/crawlerOriginCooldown.js';
import{originCooldownScope}from'../src/services/originRateLimit.js';

test('origin429 and API cooldown preserve checkpoint without immediate retry, proxy rotation or failure',async()=>{
 for(const reason of ['UPSTREAM_HTTP_429','HTTP_429','API_COOLDOWN']){
  let calls=0,waits=0;const state={cursor:'opaque+native==',pending:[{parent:'exact'}]},scope='threads:origin';
  const r=await boundedProxyRead({initialRetries:FLOW_RETRY_LIMIT-1,originScope:scope,read:async()=>{calls++;return{good:false,state,result:{status:'rate_limited',reason,retryAfterMs:900000}};},rotate:()=>assert.fail('origin limit must not rotate'),onRetry:()=>assert.fail('must not consume retry'),onFailure:()=>assert.fail('not a terminal failure'),onOriginWait:async()=>waits++});
  assert.equal(calls,1);assert.equal(waits,1);assert.equal(r.originDeferred,true);assert.equal(r.retryAfterMs,900000);assert.equal(r.originScope,scope);assert.equal(r.state,state);
 }
});
test('origin waits preserve full cooldown and exact checkpoint while a long Bull delay may wake only to recheck',async()=>{
 const checkpoint={cursor:'native==',retry:7},job={id:'owned',data:{checkpoint,proxyRetries:7},updateData:async()=>{},moveToDelayed:async until=>{assert.equal(until,1000+86400000);}};let stored;
 await assert.rejects(delayOriginJob({job,token:'lock',jobs:{updateOne:async(_,update)=>stored=update.$set},error:new FlowOriginWaitError(2*86400000,'youtube:origin'),now:1000}),ProxyWaitDelayedError);
 assert.equal(stored.originDeferred,true);assert.equal(stored.state,'queued');assert.equal(job.data.originWaitUntil,1000+2*86400000);assert.equal(job.data.checkpoint,checkpoint);assert.equal(job.data.proxyRetries,7);
 assert.throws(()=>originCooldownScope({platform:'unknown',operation:'source'}),/SCOPE_INVALID/);
});
test('shared cooldown survives worker restart, never shortens, scopes origins and safely resumes a delayed Bull job',async t=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'origin-qc-')),probe=net.createServer();await new Promise(r=>probe.listen(0,'127.0.0.1',r));const port=probe.address().port;await new Promise(r=>probe.close(r));const server=spawn('redis-server',['--bind','127.0.0.1','--port',String(port),'--save','','--appendonly','no','--dir',dir],{stdio:['ignore','pipe','pipe']});
 const redis=new Redis(`redis://127.0.0.1:${port}`,{lazyConnect:true,maxRetriesPerRequest:null,retryStrategy:()=>null});redis.on('error',()=>{});let worker,queue;
 t.after(async()=>{await worker?.close();await queue?.close();await redis.quit().catch(()=>{});server.kill('SIGTERM');if(server.exitCode===null)await new Promise(r=>server.once('exit',r));await fs.rm(dir,{recursive:true,force:true});});
 let connected=false;for(let i=0;i<100&&!connected;i++)try{await redis.connect();connected=true;}catch{await sleep(10);}assert.equal(connected,true);
 const rows=new Map(),collection={updateOne:async(filter,u)=>{const old=rows.get(filter._id);rows.set(filter._id,{_id:filter._id,until:new Date(Math.max(+old?.until||0,+u.$max.until)),...u.$set});},findOne:async f=>rows.get(f._id),find:filter=>({toArray:async()=>[...rows.values()].filter(r=>+r.until>+filter.until.$gt)})};
 const control=createOriginCooldowns({redis,collection});await control.defer('threads:origin',{reason:'UPSTREAM_HTTP_429',retryAfterMs:30000});await control.defer('threads:origin',{reason:'UPSTREAM_HTTP_429',retryAfterMs:1000});assert.ok(await control.remaining('threads:origin')>25000);assert.equal(await control.remaining('youtube:origin'),0);assert.equal(originCooldownScope({platform:'threads',operation:'comments'}),originCooldownScope({platform:'threads',operation:'source'}));
 await redis.del('crawler-flow-origin-cooldown:threads:origin');assert.equal(await control.remaining('youtube:origin'),0);assert.equal(originCooldownScope({platform:'threads',operation:'comments'}),originCooldownScope({platform:'threads',operation:'source'}));await createOriginCooldowns({redis,collection}).restore();assert.ok(await control.remaining('threads:origin')>25000);
 const broken=createOriginCooldowns({redis,collection:{updateOne:async()=>{throw Error('DURABLE_STORE_DOWN');}}});await assert.rejects(broken.defer('youtube:origin',{reason:'HTTP_429',retryAfterMs:30000}),/STORE_DOWN/);assert.ok(await control.remaining('youtube:origin')>25000,'known origin cooldown must remain published even when durable write fails');
 let saved,done;const finished=new Promise(r=>done=r),checkpoint={cursor:'unchanged/native==',pending:[{id:'parent'}]};
 worker=new CheckpointWorker('owned-origin-qc',async(job,token)=>{if(!job.data.originWaits)return delayOriginJob({job,token,jobs:{updateOne:async(_,u)=>saved=u.$set},error:new FlowOriginWaitError(1000,'facebook:origin')});assert.deepEqual(job.data.checkpoint,checkpoint);assert.equal(job.attemptsMade,0);return 'ok';},{connection:redis,concurrency:1});worker.on('error',e=>{throw e;});worker.on('completed',job=>done(job));queue=new Queue('owned-origin-qc',{connection:redis});await queue.add('fixture',{checkpoint},{jobId:'owned',removeOnComplete:false});
 const abort=new AbortController(),timeout=sleep(5000,undefined,{signal:abort.signal}).then(()=>{throw Error('ORIGIN_RESUME_TIMEOUT');});let job;try{job=await Promise.race([finished,timeout]);}finally{abort.abort();}assert.equal(job.attemptsMade,1,'only normal successful completion increments Bull attemptsMade');assert.equal((await queue.getJobCounts('failed')).failed,0);assert.equal(saved.originDeferred,true);assert.equal(saved.data.originWaits,1);
});
