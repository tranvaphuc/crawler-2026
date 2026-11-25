import test from 'node:test';import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';import net from 'node:net';import fs from 'node:fs/promises';import os from 'node:os';import path from 'node:path';import {setTimeout as sleep} from 'node:timers/promises';
import Redis from 'ioredis';import {Queue} from 'bullmq';
import {FLOW_QUEUES,queueName} from '../src/services/crawlerQueueFlow.js';
import {flowWorkerRoles,queueRuntimeRole} from '../src/services/flowRuntimeTopology.js';

for(const version of [2,3])test('topology '+version+' role processes preserve queue ownership, checkpoint delays and exclusive locks',async t=>{
 const roles=flowWorkerRoles({version});
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'flow-role-qc-')),probe=net.createServer();await new Promise(r=>probe.listen(0,'127.0.0.1',r));const port=probe.address().port;await new Promise(r=>probe.close(r));
 const server=spawn('redis-server',['--bind','127.0.0.1','--port',String(port),'--save','','--appendonly','no','--dir',dir],{stdio:['ignore','pipe','pipe']});
 const redis=new Redis(`redis://127.0.0.1:${port}`,{lazyConnect:true,maxRetriesPerRequest:1,retryStrategy:()=>null}),children=[],queues=[];
 t.after(async()=>{for(const c of children)if(c.exitCode===null)c.kill('SIGTERM');await Promise.all(children.map(c=>c.exitCode===null?new Promise(r=>c.once('exit',r)):Promise.resolve()));for(const q of queues)await q.close();await redis.quit().catch(()=>{});server.kill('SIGTERM');if(server.exitCode===null)await new Promise(r=>server.once('exit',r));await fs.rm(dir,{recursive:true,force:true});});
 redis.on('error',()=>{});let ready=false;for(let i=0;i<100&&!ready;i++){try{await redis.connect();ready=true;}catch{await sleep(10);}}assert.equal(ready,true,'owned Redis must start');
 const childCode=`
 import Redis from 'ioredis';import{CheckpointWorker,ProxyWaitDelayedError}from'./src/services/crawlerProxyWait.js';
 import{FLOW_QUEUES,queueName}from'./src/services/crawlerQueueFlow.js';import{flowRuntimePlan}from'./src/services/flowRuntimeTopology.js';import{createFlowShutdown}from'./src/services/crawlerFlowShutdown.js';
 const role=process.env.FLOW_QC_ROLE,redis=new Redis(process.env.FLOW_QC_REDIS,{maxRetriesPerRequest:null}),plan=flowRuntimePlan({role,topology:{version:Number(process.env.FLOW_QC_VERSION),mode:'split'},specs:FLOW_QUEUES,externalUid:true});
 if(!await redis.set(plan.lockKey,role+'-'+process.pid,'NX','EX',30)){console.log(JSON.stringify({type:'locked',role}));await redis.quit();process.exit(23);}
 const shutdown=createFlowShutdown(),workers=plan.workerSpecs.map(q=>{const w=new CheckpointWorker(queueName(q.name),async(job,token)=>{
  if(q.kind==='source'&&!job.data.yielded){await job.updateData({...job.data,yielded:true});await job.moveToDelayed(Date.now()+30,token);throw new ProxyWaitDelayedError();}
  console.log(JSON.stringify({type:'done',queue:q.name,role,checkpoint:job.data.checkpoint,attempts:job.attemptsMade}));return 'ok';
 },{connection:redis,concurrency:1});w.on('error',e=>console.log(JSON.stringify({type:'error',role,message:e.message})));return w;});
 shutdown.setWorkers(workers);let closing=false;process.on('SIGTERM',async()=>{if(closing)return;closing=true;shutdown.requestStop();await shutdown.drain();await redis.del(plan.lockKey);await redis.quit();});
 await Promise.all(workers.map(w=>w.waitUntilReady()));console.log(JSON.stringify({type:'ready',role}));
 `;
 const events=[];
 const startRole=role=>{const c=spawn(process.execPath,['--input-type=module','-e',childCode],{cwd:process.cwd(),env:{PATH:process.env.PATH,FLOW_QC_ROLE:role,FLOW_QC_VERSION:String(version),FLOW_QC_REDIS:`redis://127.0.0.1:${port}`},stdio:['ignore','pipe','pipe']});children.push(c);let buffer='';c.stdout.on('data',chunk=>{buffer+=chunk;let at;while((at=buffer.indexOf('\n'))>=0){const line=buffer.slice(0,at);buffer=buffer.slice(at+1);try{events.push(JSON.parse(line));}catch{}}});return c;};
 const waitFor=async predicate=>{for(let i=0;i<500&&!predicate();i++)await sleep(10);assert.ok(predicate(),JSON.stringify(events));};
 for(const role of roles)startRole(role);await waitFor(()=>events.filter(e=>e.type==='ready').length===roles.length);
 const duplicate=startRole(roles[0]);await new Promise(r=>duplicate.once('exit',r));assert.equal(duplicate.exitCode,23,'second same-role process must refuse to acquire a lock');
 const checkpoint={cursor:'opaque/native+cursor==',pending:[{id:'exact-parent',page:3}],retry:2};
 for(const spec of FLOW_QUEUES){const q=new Queue(queueName(spec.name),{connection:redis});queues.push(q);if(spec.kind==='uid')await q.pause();await q.add('qc',{checkpoint},{jobId:'owned-qc',removeOnComplete:false});}
 await waitFor(()=>events.filter(e=>e.type==='done').length===12);
 for(const event of events.filter(e=>e.type==='done')){const spec=FLOW_QUEUES.find(q=>q.name===event.queue);assert.equal(event.role,queueRuntimeRole(spec,{version}));assert.deepEqual(event.checkpoint,checkpoint);assert.equal(event.attempts,0);}
 assert.equal(events.some(e=>e.type==='error'),false,JSON.stringify(events.filter(e=>e.type==='error')));
 const uid=queues.at(-1);assert.equal(await uid.isPaused(),true);assert.equal((await uid.getJobCounts('active')).active,0);assert.ok(await uid.getJob('owned-qc'));
});
