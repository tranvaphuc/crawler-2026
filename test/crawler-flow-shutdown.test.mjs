import test from'node:test';import assert from'node:assert/strict';import{createFlowShutdown}from'../src/services/crawlerFlowShutdown.js';
test('a stop signal closes worker intake before a blocked coordinator can reach finally',async()=>{
 let closeCalls=0,finishActive;const active=new Promise(r=>finishActive=r),shutdown=createFlowShutdown();shutdown.setWorkers([{close:async()=>{closeCalls++;await active;}}]);shutdown.requestStop();await new Promise(r=>setImmediate(r));assert.equal(shutdown.stopped,true);assert.equal(closeCalls,1);let drained=false;const draining=shutdown.drain().then(()=>drained=true);await new Promise(r=>setImmediate(r));assert.equal(drained,false);shutdown.requestStop();assert.equal(closeCalls,1);finishActive();await draining;assert.equal(drained,true);
});
test('a stop arriving during startup drains workers as soon as they are registered',async()=>{
 let closed=0;const shutdown=createFlowShutdown();shutdown.requestStop();shutdown.setWorkers([{close:async()=>closed++}]);await shutdown.drain();assert.equal(closed,1);assert.throws(()=>shutdown.setWorkers([]),/ALREADY_SET/);
});
test('one worker close failure cannot prevent the other queues from draining',async()=>{
 let closed=0;const errors=[],shutdown=createFlowShutdown({onError:e=>errors.push(e.message)});shutdown.setWorkers([{close:async()=>{throw Error('REDIS_CLOSED');}},{close:async()=>closed++}]);shutdown.requestStop();await shutdown.drain();assert.equal(closed,1);assert.deepEqual(errors,['REDIS_CLOSED']);
});
test('signal handling explicitly pauses local intake without waiting active jobs before graceful close',async()=>{
 const events=[],shutdown=createFlowShutdown({onState:s=>events.push(s)});shutdown.setWorkers([{name:'source',pause:async noWait=>{assert.equal(noWait,true);events.push('pause');},close:async()=>events.push('close')}]);shutdown.requestStop();await shutdown.drain();assert.deepEqual(events,['pause','intake_paused','close','closed']);
});
test('the installed BullMQ shutdown requeue path never fetches another job or consumes a failure',async()=>{
 const{Worker}=await import('bullmq');let returnedToWait=0,nextFetches=0,failed=0;
 const worker={connection:{closing:false},closing:Promise.resolve(),paused:true,moveLimitedBackToWait:async()=>{returnedToWait++;return 0;},moveToActive:async()=>nextFetches++};
 const job={moveToFailed:async()=>failed++};await Worker.prototype.handleFailed.call(worker,Worker.RateLimitError(),job,'owned-lock-token');assert.equal(returnedToWait,1);assert.equal(nextFetches,0);assert.equal(failed,0);assert.equal(worker.limitUntil,0);
});
