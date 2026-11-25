import test from 'node:test';import assert from 'node:assert/strict';
import {createOriginWorkerGate} from '../src/services/originWorkerGate.js';
const spec=(platform='threads',kind='source')=>({platform,kind,name:platform+'-'+(kind==='comments'?'comment':'source')});
const fake=name=>({name,paused:false,pauseCalls:0,resumeCalls:0,isPaused(){return this.paused;},async pause(){this.pauseCalls++;this.paused=true;},resume(){this.resumeCalls++;if(!this.ignoreResume)this.paused=false;}});

test('origin hold is local, scoped, never shortened, and never owns UID/import/manual pauses',async()=>{
 let now=0,ttl=10000;const gate=createOriginWorkerGate({remaining:async s=>s==='queue:crawler-flow-threads-source'?ttl:0,now:()=>now}),fb=fake('fb'),ig=fake('ig'),manual=fake('manual'),uid=fake('uid');manual.paused=true;uid.paused=true;
 gate.register(spec(),fb);gate.register(spec(),manual);gate.register(spec('instagram'),ig);assert.equal(gate.register(spec('facebook','uid'),uid),false);assert.equal(gate.register({kind:'import'},fake('import')),false);
 await gate.sync();assert.equal(fb.paused,true);assert.equal(ig.paused,false);
 ttl=0;now=9999;await gate.sync();assert.equal(fb.paused,true);
 ttl=5000;now=10000;await gate.sync();assert.equal(gate.status()[0].until,15000);
 ttl=0;now=15000;await gate.sync();assert.equal(fb.paused,false);assert.equal(manual.paused,true);assert.equal(uid.paused,true);assert.equal(manual.resumeCalls,0);assert.equal(uid.resumeCalls,0);await gate.close();
});
test('a hold arriving during a Redis check cannot be lost; shutdown cannot resume it',async()=>{
 let resolve,now=0,stopping=false;const gate=createOriginWorkerGate({remaining:()=>new Promise(r=>{resolve=r;}),now:()=>now,shouldStop:()=>stopping}),w=fake('fb');gate.register(spec(),w);
 const sync=gate.sync();await Promise.resolve();await gate.hold('queue:crawler-flow-threads-source',2000);resolve(0);await sync;assert.equal(w.paused,true);assert.equal(w.resumeCalls,0);
 now=3000;stopping=true;await gate.sync();assert.equal(w.resumeCalls,0);await gate.close();
});
test('resume retries while BullMQ is still draining, and Redis errors fail closed',async()=>{
 let now=0,fail=true;const errors=[],gate=createOriginWorkerGate({remaining:async()=>{if(fail)throw Error('REDIS_DOWN');return 0;},now:()=>now,onError:e=>errors.push(e.message)}),w=fake('fb');gate.register(spec(),w);await gate.sync();assert.equal(w.paused,true);assert.deepEqual(errors,['REDIS_DOWN']);
 fail=false;now=1000;w.ignoreResume=true;await gate.sync();assert.equal(gate.status()[0].heldWorkers,1);w.ignoreResume=false;await gate.sync();assert.equal(w.paused,false);assert.equal(gate.status()[0].heldWorkers,0);await gate.close();
});

test('real Bull intake avoids a thousand cooldown rewrites while preserving all tickets and other queues',async t=>{
 const [{spawn},{default:net},{default:fs},{default:os},{default:path},{setTimeout:sleep},{default:Redis},{Queue},{CheckpointWorker},{delayOriginJob,FlowOriginWaitError}]=await Promise.all([import('node:child_process'),import('node:net'),import('node:fs/promises'),import('node:os'),import('node:path'),import('node:timers/promises'),import('ioredis'),import('bullmq'),import('../src/services/crawlerProxyWait.js'),import('../src/services/crawlerOriginCooldown.js')]);
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'origin-intake-qc-')),probe=net.createServer();await new Promise(r=>probe.listen(0,'127.0.0.1',r));const port=probe.address().port;await new Promise(r=>probe.close(r));
 const server=spawn('redis-server',['--bind','127.0.0.1','--port',String(port),'--save','','--appendonly','no','--dir',dir],{stdio:['ignore','pipe','pipe']}),redis=new Redis(`redis://127.0.0.1:${port}`,{lazyConnect:true,maxRetriesPerRequest:null,retryStrategy:()=>null}),queues=[],workers=[];let gate;
 t.after(async()=>{await gate?.close();for(const w of workers)await w.close();for(const q of queues)await q.close();await redis.quit().catch(()=>{});server.kill('SIGTERM');if(server.exitCode===null)await new Promise(r=>server.once('exit',r));await fs.rm(dir,{recursive:true,force:true});});
 await new Promise((resolve,reject)=>{let text='';server.stdout.on('data',b=>{text+=b;if(text.includes('Ready to accept connections'))resolve();});server.once('error',reject);});await redis.connect();
 const fb=new Queue('qc-origin-fb',{connection:redis}),ig=new Queue('qc-origin-ig',{connection:redis}),imports=new Queue('qc-origin-import',{connection:redis}),uid=new Queue('qc-origin-uid',{connection:redis});queues.push(fb,ig,imports,uid);await uid.pause();
 const checkpoint={cursor:'opaque+native/cursor==',pending:[{id:'exact-parent',page:3}],nativeRetry:7},data={checkpoint,proxyRetries:7,sourceSlices:2};await fb.addBulk(Array.from({length:1000},(_,i)=>({name:'source',data,opts:{jobId:'source-'+i}})));await ig.add('ig',{});await imports.add('import',{});await uid.add('uid',data);
 let ttl=60000,clock=0,nativeCalls=0,processed=0;const saved=new Map(),errors=[];gate=createOriginWorkerGate({remaining:async s=>s==='queue:crawler-flow-threads-source'?ttl:0,now:()=>clock});
 const w=new CheckpointWorker(fb.name,async(job,token)=>{processed++;if(!ttl){nativeCalls++;ttl=60000;}const error=new FlowOriginWaitError(ttl,'queue:crawler-flow-threads-source');await gate.hold(error.scope,error.retryAfterMs);return delayOriginJob({job,token,error,jobs:{async updateOne(filter,update){saved.set(filter._id,structuredClone(update.$set));}}});},{connection:redis,concurrency:5,autorun:false});workers.push(w);gate.register(spec(),w);
 for(const q of[ig,imports]){const other=new CheckpointWorker(q.name,async()=>true,{connection:redis,autorun:false});workers.push(other);gate.register(q===ig?spec('instagram'):{kind:'import'},other);}
 for(const worker of workers)worker.on('error',e=>errors.push(e.code||e.message));await Promise.all(workers.map(w=>w.waitUntilReady()));await gate.sync();for(const worker of workers)void worker.run();await sleep(30);assert.equal(nativeCalls,0);assert.equal((await fb.getJobCounts('waiting')).waiting,1000);assert.equal((await fb.getWorkers()).length,1);ttl=0;clock=60000;await gate.sync();
 for(let i=0;i<300;i++){const c=await fb.getJobCounts('active','delayed'),other=await imports.getJobCounts('completed');if(c.delayed>0&&c.active===0&&other.completed===1)break;await sleep(10);}
 const counts=await fb.getJobCounts('waiting','delayed','active','failed','completed');assert.equal(nativeCalls,1);assert.ok(processed<=10,'local pause must bound rewrites by active concurrency, not inventory size');assert.equal(counts.active,0);assert.equal(counts.failed,0);assert.equal(counts.completed,0);assert.equal(counts.waiting+counts.delayed,1000);assert.equal(await fb.isPaused(),false);assert.equal(w.isPaused(),true);assert.equal((await ig.getJobCounts('completed')).completed,1);assert.equal((await imports.getJobCounts('completed')).completed,1);assert.equal(await uid.isPaused(),true);
 for(const [id,row]of saved){const job=await fb.getJob(id);assert.deepEqual(job.data.checkpoint,checkpoint);assert.equal(job.data.proxyRetries,7);assert.equal(job.attemptsMade,0);assert.deepEqual(row.data,job.data);}
 await fb.add('new-source',data,{jobId:'new-source'});await sleep(50);assert.equal((await fb.getJob('new-source')).attemptsMade,0);assert.equal(await uid.isPaused(),true);assert.deepEqual(errors,[]);
});
