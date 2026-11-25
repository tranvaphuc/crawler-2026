import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {spawn} from 'node:child_process';import {once} from 'node:events';import {setTimeout as sleep} from 'node:timers/promises';
import Redis from 'ioredis';import {Queue} from 'bullmq';
import {createCheckpointResumeScheduler,startCheckpointResumeScheduler,registerCheckpointResume} from '../src/services/checkpointResumeScheduling.js';
import {CheckpointWorker,delayProxyJob,FlowProxyWaitError,ProxyWaitDelayedError} from '../src/services/crawlerProxyWait.js';
import {packState,unpackState} from '../src/services/crawlerQueueFlow.js';
import {yieldSourceSlice} from '../src/services/sourceRuntimePolicy.js';
let dir,redisProcess,connection,sequence=0;
before(async()=>{
 dir=fs.mkdtempSync(path.join(os.tmpdir(),'resume-scheduling-'));const socket=path.join(dir,'redis.sock');
 redisProcess=spawn(process.env.REDIS_SERVER_BIN||'redis-server',['--port','0','--unixsocket',socket,'--save','','--appendonly','no'],{stdio:['ignore','pipe','pipe']});
 await new Promise((resolve,reject)=>{let text='';redisProcess.on('error',reject);redisProcess.stdout.on('data',b=>{text+=b;if(/ready to accept connections/i.test(text))resolve();});redisProcess.on('exit',code=>reject(Error('TEST_REDIS_EXIT_'+code)));});
 connection=new Redis(socket,{maxRetriesPerRequest:null});
});
after(async()=>{await connection?.quit();if(redisProcess?.exitCode===null){redisProcess.kill('SIGTERM');await once(redisProcess,'exit');}fs.rmSync(dir,{recursive:true,force:true});});
async function fixture(t,queueOverride){
 const queueName=queueOverride||'test-resume-'+(++sequence),queue=new Queue('crawler-flow-'+queueName,{connection}),prefix='bull:'+queue.name+':',rows=[];let clock=Date.now();
 const jobs={find(filter,options){assert.equal(filter.queue,queueName);assert.equal(filter.state,'queued');assert.equal(filter['data.checkpoint'].$type,'string');assert.equal(options.projection._id,1);return{maxTimeMS:()=>({toArray:async()=>rows.map(x=>structuredClone(x))})};}};
 const makeScheduler=()=>createCheckpointResumeScheduler({redis:connection,jobs,queue:queueName,now:()=>clock,pollMs:0,refreshMs:0});
 const scheduler=makeScheduler();
 async function addFresh(n,tag='fresh'){for(let i=0;i<n;i++)await queue.add('source',{kind:'source',source:{platform:'facebook',type:'group'},sourceRoundId:'new-round'},{jobId:tag+i,removeOnComplete:false});}
 async function addResume(n,tag='resume',extra={}){for(let i=0;i<n;i++){
  const data={kind:'source',source:{platform:'facebook',type:'group'},checkpoint:packState({nativeCursor:'NEXT-'+i,seen:new Set(['seen']),items:[{id:'buffered'}]}),pendingPage:{items:[{id:'pending'}]},sourceRoundId:'original-round',page:4,proxyRetries:17,proxyWaitReason:'PROXY_ENDPOINTS_UNAVAILABLE',proxyWaitUntil:clock-1000+i,...extra};
  await queue.add('source',data,{jobId:tag+i,removeOnComplete:false});rows.push({_id:tag+i,createdAt:new Date(clock-10000),data:{page:data.page,checkpoint:data.checkpoint,groupCursorProxyBudgetStartedAt:data.groupCursorProxyBudgetStartedAt,proxyWaitUntil:data.proxyWaitUntil,sourceYieldUntil:data.sourceYieldUntil,originWaitUntil:data.originWaitUntil,groupCursorProxyWaitStartedAt:data.groupCursorProxyWaitStartedAt,groupCursorProxyWaitMs:data.groupCursorProxyWaitMs}});
 }}
 const workers=[];const worker=(processor=null,opts={})=>{const w=new CheckpointWorker(queue.name,processor,{connection,autorun:false,concurrency:1,...opts});workers.push(w);w.on('error',()=>{});return w;};
 t.after(async()=>{for(const w of workers)await w.close();await queue.obliterate({force:true});await connection.del(prefix+'checkpoint-resume-batch',prefix+'checkpoint-resume-ready',prefix+'checkpoint-resume-expiring');await queue.close();});
 const order=async()=> (await connection.lrange(prefix+'wait',0,-1)).reverse();
 return{queue,prefix,rows,jobs,scheduler,makeScheduler,addFresh,addResume,worker,order,advance:ms=>clock+=ms};
}

test('checkpoint resumes bypass a long FIFO in bounded 4:1 batches without changing payloads or queue counts',async t=>{
 const f=await fixture(t);await f.addFresh(100);await f.addResume(16);
 assert.equal((await f.order())[0],'fresh0');
 const hashes=await Promise.all(Array.from({length:16},(_,i)=>connection.hgetall(f.prefix+'resume'+i)));
 const before=await f.queue.getJobCounts('waiting','active','delayed','failed','paused','prioritized');
 const result=await f.scheduler();assert.equal(result.state,'scheduled');assert.equal(result.resumeIds.length,16);assert.equal(result.fifoIds.length,4);
 const expected=[];for(let i=0;i<4;i++)expected.push(...Array.from({length:4},(_,j)=>'resume'+(i*4+j)),'fresh'+i);
 assert.deepEqual((await f.order()).slice(0,20),expected);
 assert.deepEqual(await f.queue.getJobCounts('waiting','active','delayed','failed','paused','prioritized'),before);
 assert.equal(new Set(await f.order()).size,116);
 assert.deepEqual(await Promise.all(Array.from({length:16},(_,i)=>connection.hgetall(f.prefix+'resume'+i))),hashes);
});
test('expired cursor proxy budgets precede a large ready retry backlog without changing tickets',async t=>{
 const f=await fixture(t);await f.addFresh(30);await f.addResume(600,'cold');await f.addResume(1,'expired',{groupCursorProxyWaitStartedAt:Date.now()-130000,groupCursorProxyWaitMs:0});
 const before=await connection.hgetall(f.prefix+'expired0'),counts=await f.queue.getJobCounts('waiting','active','delayed','failed');
 const result=await f.scheduler();assert.equal(result.resumeIds[0],'expired0');assert.equal((await f.order())[0],'expired0');assert.equal((await f.order())[4],'fresh0');assert.deepEqual(await connection.hgetall(f.prefix+'expired0'),before);assert.deepEqual(await f.queue.getJobCounts('waiting','active','delayed','failed'),counts);
});
test('runtime timer actually dispatches expired cursors and closes without further scheduling',async t=>{
 const f=await fixture(t);await f.addFresh(100);await f.addResume(1,'expired',{groupCursorProxyWaitStartedAt:Date.now()-130000});
 const runtime=startCheckpointResumeScheduler({redis:connection,jobs:f.jobs,queue:f.queue.name.replace('crawler-flow-',''),pollMs:10,refreshMs:0,onError:error=>assert.fail(error)});
 try{for(let i=0;i<100&&(await f.order())[0]!=='expired0';i++)await sleep(10);assert.equal((await f.order())[0],'expired0');assert.ok(runtime.status()?.at);}finally{await runtime.close();}
 const before=await f.order();await sleep(30);assert.deepEqual(await f.order(),before);
});
test('expired cursor lane cannot promote a native delayed ticket or steal active work',async t=>{
 const f=await fixture(t,'facebook-group-source');await f.addFresh(20);const data={kind:'source',checkpoint:packState({nativeCursor:'NEXT'}),groupCursorProxyWaitStartedAt:Date.now()-130000};
 const delayed=await f.queue.add('source',data,{jobId:'expired-delayed',delay:60000});await registerCheckpointResume({job:delayed,readyAt:Date.now()+60000});const score=await connection.zscore(f.prefix+'delayed',delayed.id);
 await f.addResume(1,'ready');await f.scheduler();assert.equal(await delayed.getState(),'delayed');assert.equal(await connection.zscore(f.prefix+'delayed',delayed.id),score);assert.notEqual(await connection.zscore(f.prefix+'checkpoint-resume-expiring',delayed.id),null);
});

test('new resume arrivals cannot push back an already reserved FIFO slot, including after coordinator restart',async t=>{
 const f=await fixture(t);await f.addFresh(20);await f.addResume(16);await f.scheduler();const w=f.worker();
 for(let i=0;i<4;i++){const job=await w.getNextJob('t');assert.equal(job.id,'resume'+i);await job.moveToCompleted('ok','t',false);}
 await f.addResume(4,'new-resume');assert.equal((await f.scheduler()).state,'pending_batch');
 assert.equal((await f.makeScheduler()()).state,'pending_batch');
 const next=await w.getNextJob('t');assert.equal(next.id,'fresh0');await next.moveToCompleted('ok','t',false);
});

test('FIFO progresses every fifth claim while resume work is continuously replenished',async t=>{
 const f=await fixture(t);await f.addFresh(16);await f.addResume(16);const w=f.worker();let fresh=0,resumeRun=0,maxResumeRun=0;
 for(let step=0;step<80;step++){
  await f.scheduler();const job=await w.getNextJob('t');assert.ok(job);
  if(job.id.startsWith('fresh')){assert.equal(job.id,'fresh'+fresh++);resumeRun=0;}else{maxResumeRun=Math.max(maxResumeRun,++resumeRun);await f.addResume(1,'next-'+step+'-');}
  await job.moveToCompleted('ok','t',false);
 }
 assert.equal(fresh,16);assert.ok(maxResumeRun<=4);
});

test('paused, future-delayed, active, failed, prioritized and missing tickets are not promoted or stolen',async t=>{
 const f=await fixture(t);await f.addResume(1,'active');const w=f.worker(),active=await w.getNextJob('t');
 const failedJob=await f.queue.add('source',{},{jobId:'failed-job'}),failing=await w.getNextJob('failed-token');
 assert.equal(failing.id,failedJob.id);await failing.moveToFailed(Error('fixture_failure'),'failed-token',false);
 await f.addFresh(1);await f.addResume(1,'ready');
 await f.queue.add('source',{checkpoint:'checkpoint'},{jobId:'future',delay:60000});
 await f.queue.add('source',{checkpoint:'checkpoint'},{jobId:'prioritized-job',priority:1});
 f.rows.push(...['future','prioritized-job','missing','failed-job'].map(_id=>({_id,createdAt:new Date(0),data:{}})));
 const activeHash=await connection.hgetall(f.prefix+active.id),delayedScore=await connection.zscore(f.prefix+'delayed','future');
 await f.queue.pause();const pausedBefore=await connection.lrange(f.prefix+'paused',0,-1);assert.equal((await f.scheduler()).state,'paused');assert.deepEqual(await connection.lrange(f.prefix+'paused',0,-1),pausedBefore);
 await f.queue.resume();const result=await f.scheduler();assert.deepEqual(result.resumeIds,['ready0']);
 assert.deepEqual(await connection.hgetall(f.prefix+active.id),activeHash);assert.equal(await connection.zscore(f.prefix+'delayed','future'),delayedScore);assert.notEqual(await connection.zscore(f.prefix+'prioritized','prioritized-job'),null);assert.equal(await failedJob.getState(),'failed');
 await active.moveToCompleted('ok','t',false);
});

test('future native deadlines in a ready outbox candidate are respected',async t=>{
 const f=await fixture(t);await f.addFresh(2);await f.addResume(1,'future',{originWaitUntil:Date.now()+60000});const before=await f.order();
 assert.equal((await f.scheduler()).state,'no_ready_checkpoint');assert.deepEqual(await f.order(),before);
});

test('same real Bull ticket resumes its checkpoint ahead of 100 FIFO jobs after an endpoint delay, with no extra failed attempt',async t=>{
 const f=await fixture(t);await f.addResume(1);const w=f.worker(),job=await w.getNextJob('t'),original=structuredClone(job.data),persisted=[];
 assert.equal(job.attemptsMade,0);await f.addFresh(100);
 await assert.rejects(delayProxyJob({job,token:'t',jobs:{updateOne:async(_f,u)=>persisted.push(structuredClone(u.$set))},error:new FlowProxyWaitError(1000)}),ProxyWaitDelayedError);
 assert.equal(await job.getState(),'delayed');assert.equal((await f.scheduler()).state,'no_ready_checkpoint');
 await sleep(1100);await job.promote();f.advance(1200);assert.equal((await f.scheduler()).state,'scheduled');
 const resumed=await w.getNextJob('t');assert.equal(resumed.id,job.id);assert.equal(resumed.attemptsMade,0);
 for(const key of ['checkpoint','pendingPage','sourceRoundId','page','proxyRetries'])assert.deepEqual(resumed.data[key],original[key]);
 assert.equal(unpackState(resumed.data.checkpoint).nativeCursor,'NEXT-0');assert.equal(persisted[0].proxyDeferred,true);
 await resumed.moveToCompleted({pages:5},'t',false);assert.equal(await f.queue.getFailedCount(),0);assert.equal(await f.queue.getWaitingCount(),100);
});

test('real concurrent Bull workers take the reserved 4:1 prefix before a 1000-ticket backlog',async t=>{
 const f=await fixture(t);await f.addFresh(1000);await f.addResume(16);await f.scheduler();let release;const held=new Promise(resolve=>release=resolve);let reached;
 const full=new Promise(resolve=>reached=resolve),started=[];
 const w=f.worker(async job=>{started.push(job.id);if(started.length===160)reached();await held;return 'ok';},{concurrency:160});
 const run=w.run();try{await Promise.race([full,sleep(10000).then(()=>{throw Error('CONCURRENT_WORKERS_DID_NOT_FILL');})]);assert.equal(started.length,160);
  for(let i=0;i<4;i++){assert.ok(started.includes('fresh'+i));for(let j=0;j<4;j++)assert.ok(started.includes('resume'+(i*4+j)));}
  const events=await connection.xrange(f.prefix+'events','-','+'),claims=events.map(([,fields])=>Object.fromEntries(Array.from({length:fields.length/2},(_,i)=>[fields[i*2],fields[i*2+1]]))).filter(x=>x.event==='active').map(x=>x.jobId);
  const expected=[];for(let i=0;i<4;i++)expected.push(...Array.from({length:4},(_,j)=>'resume'+(i*4+j)),'fresh'+i);assert.deepEqual(claims.slice(0,20),expected);
 }finally{await w.pause(true);release();await w.close();await run;}
});

test('a checkpoint yielded by the source time slice resumes ahead of fresh sources without spending its read retries',async t=>{
 const f=await fixture(t,'facebook-group-source');await f.addResume(1);const w=f.worker(),job=await w.getNextJob('t');
 delete job.data.proxyWaitReason;delete job.data.proxyWaitUntil;await job.updateData(job.data);await f.addFresh(50);
 const before=structuredClone(job.data);
 await assert.rejects(yieldSourceSlice({job,token:'t',jobs:{updateOne:async(_f,u)=>{f.rows[0].data={sourceYieldUntil:u.$set.data.sourceYieldUntil};}}}),ProxyWaitDelayedError);
 assert.equal(await job.getState(),'delayed');await sleep(1100);await job.promote();f.advance(1200);await f.scheduler();
 const resumed=await w.getNextJob('t');assert.equal(resumed.id,job.id);assert.equal(resumed.attemptsMade,0);assert.equal(resumed.data.sourceSlices,1);
 for(const key of ['checkpoint','pendingPage','sourceRoundId','page','proxyRetries'])assert.deepEqual(resumed.data[key],before[key]);
 await resumed.moveToCompleted('resumed','t',false);assert.equal(await f.queue.getFailedCount(),0);
});

test('a newly delayed checkpoint bypasses the cold checkpoint backlog as well as fresh FIFO jobs',async t=>{
 const f=await fixture(t,'facebook-group-source');await f.addResume(1,'new');const w=f.worker(),job=await w.getNextJob('t'),original=structuredClone(job.data);
 await f.addResume(100,'cold');await f.addFresh(100);f.rows[0].data.proxyWaitUntil=Date.now()+500;
 await assert.rejects(delayProxyJob({job,token:'t',jobs:{updateOne:async()=>{}},error:new FlowProxyWaitError(1000)}),ProxyWaitDelayedError);
 assert.notEqual(await connection.zscore(f.prefix+'checkpoint-resume-ready',job.id),null);assert.equal(await job.getState(),'delayed');
 await sleep(1100);f.advance(1300);await job.promote();const result=await f.scheduler();assert.equal(result.resumeIds[0],job.id);
 const resumed=await w.getNextJob('t');assert.equal(resumed.id,job.id);assert.equal(resumed.attemptsMade,0);
 for(const key of ['checkpoint','pendingPage','sourceRoundId','page','proxyRetries'])assert.deepEqual(resumed.data[key],original[key]);
 assert.equal(await connection.zscore(f.prefix+'checkpoint-resume-ready',job.id),null);await resumed.moveToCompleted('ok','t',false);
});

test('the due-time resume lane is FIFO, retains active registrations, and cleans terminal entries',async t=>{
 const f=await fixture(t);await f.addFresh(1);await f.addResume(20,'cold');await f.addResume(2,'hot');
 const at=Date.now()-100;await connection.zadd(f.prefix+'checkpoint-resume-ready',at+1,'hot0',at,'hot1',at,'missing');
 const result=await f.scheduler();assert.deepEqual(result.resumeIds.slice(0,2),['hot1','hot0']);assert.equal(await connection.zscore(f.prefix+'checkpoint-resume-ready','missing'),null);
});

test('registering before native delay cannot steal an active job or bypass a future deadline',async t=>{
 const f=await fixture(t,'facebook-group-source');await f.addResume(1);const w=f.worker(),job=await w.getNextJob('t');
 await registerCheckpointResume({job,readyAt:Date.now()-1});await f.scheduler();assert.notEqual(await connection.zscore(f.prefix+'checkpoint-resume-ready',job.id),null);assert.equal(await job.getState(),'active');
 await job.moveToDelayed(Date.now()+60000,'t');await f.scheduler();assert.equal(await job.getState(),'delayed');assert.notEqual(await connection.zscore(f.prefix+'checkpoint-resume-ready',job.id),null);
});

test('resume registration is Group/checkpoint-only and a metadata write failure retains the native delay fallback',async()=>{
 let writes=0;const logs=[],queue={client:Promise.resolve({zadd:async()=>{writes++;throw Object.assign(Error('fixture'),{code:'ECONNRESET'});}}),toKey:name=>'fixture:'+name};
 for(const data of [{kind:'source'},{kind:'comments',checkpoint:'saved'}])await registerCheckpointResume({job:{queueName:'crawler-flow-facebook-group-source',queue,data},readyAt:1000});
 await registerCheckpointResume({job:{queueName:'crawler-flow-facebook-page-source',queue,data:{kind:'source',checkpoint:'saved'}},readyAt:1000});assert.equal(writes,0);
 const data={kind:'source',checkpoint:'saved',page:1,proxyRetries:17};await registerCheckpointResume({job:{id:'same-ticket',queueName:'crawler-flow-facebook-group-source',queue,data,log:async x=>logs.push(JSON.parse(x))},readyAt:1000});
 assert.equal(writes,1);assert.equal(data.proxyRetries,17);assert.equal(data.checkpoint,'saved');assert.equal(logs[0].event,'checkpoint_resume_register_failed');
});

test('empty initial checkpoints cannot occupy the resume lane, including registrations left by old workers',async t=>{
 const f=await fixture(t,'facebook-group-source');await f.addFresh(30);await f.addResume(200,'initial',{page:0,checkpoint:packState({kind:'facebook',items:[],seen:new Set(),nativeCursor:null,pending:true,collecting:false})});
 for(let i=0;i<200;i++)await connection.zadd(f.prefix+'checkpoint-resume-ready',Date.now()-1000+i,'initial'+i);
 await f.addResume(1,'cursor');await connection.zadd(f.prefix+'checkpoint-resume-ready',Date.now()-1,'cursor0');
 const before=await f.queue.getJobCounts('waiting','active','delayed','failed'),payload=await connection.hgetall(f.prefix+'initial0');
 const result=await f.scheduler();assert.deepEqual(result.resumeIds,['cursor0']);assert.equal((await f.order())[0],'cursor0');assert.equal((await f.order())[1],'fresh0');
 assert.equal(await connection.zcard(f.prefix+'checkpoint-resume-ready'),0);assert.deepEqual(await connection.hgetall(f.prefix+'initial0'),payload);assert.deepEqual(await f.queue.getJobCounts('waiting','active','delayed','failed'),before);assert.ok((await f.order()).includes('initial0'));
});
test('only a real continuation registers; legacy native cursors remain eligible without a page counter',async t=>{
 let writes=0;const queue={client:Promise.resolve({zadd:async()=>writes++,zrem:async()=>{}}),toKey:name=>'fixture:'+name};
 const empty=packState({kind:'facebook',items:[],seen:new Set(),nativeCursor:null,pending:true});
 for(const checkpoint of [empty,'invalid-checkpoint'])await registerCheckpointResume({job:{id:'initial',queueName:'crawler-flow-facebook-group-source',queue,data:{kind:'source',page:0,checkpoint}},readyAt:1000});assert.equal(writes,0);
 await registerCheckpointResume({job:{id:'legacy',queueName:'crawler-flow-facebook-group-source',queue,data:{kind:'source',checkpoint:packState({nativeCursor:'NEXT',seen:new Set()})}},readyAt:1000});assert.equal(writes,1);
 const f=await fixture(t);await f.addFresh(20);await f.addResume(1,'legacy',{page:0,checkpoint:packState({nativeCursor:'NEXT',seen:new Set()})});assert.deepEqual((await f.scheduler()).resumeIds,['legacy0']);
});
