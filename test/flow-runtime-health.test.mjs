import test from'node:test';import assert from'node:assert/strict';
import{FLOW_QUEUES}from'../src/services/crawlerQueueFlow.js';
import{flowServiceSpecs,sourceRuntimeTelemetry}from'../src/services/flowRuntimeHealth.js';
import{serviceRecoveryDecision}from'../src/services/flowPerformancePolicy.js';
const now=10000000,topology={version:2,mode:'split'};
test('isolated health owns every queue once and uses all three Facebook source pulses',()=>{
 const topology={version:3,mode:'split'},rows=flowServiceSpecs({topology,specs:FLOW_QUEUES});assert.equal(rows.length,9);assert.equal(new Set(rows.flatMap(r=>r.queueNames)).size,12);
 const roles=['facebook-page-sources','facebook-group-sources','facebook-user-sources','social'],services=roles.map((role,i)=>({Id:'crawler-queue-worker@'+role+'.service',ActiveState:'active',MainPID:String(20+i)})),pulses=Object.fromEntries(roles.map((role,i)=>[role,{pid:20+i,role,at:new Date(now),eventLoopP99Ms:10+i,eventLoopUtilization:.2}]));
 assert.equal(sourceRuntimeTelemetry({topology,services,pulses,now}).fresh,true);pulses['facebook-group-sources'].pid=999;assert.deepEqual(sourceRuntimeTelemetry({topology,services,pulses,now}).missing,['facebook-group-sources']);
 assert.equal(serviceRecoveryDecision({service:'crawler-queue-worker@facebook-replies.service',state:'failed',now}).action,'start');
});
test('split health covers twelve executable queues once and excludes dormant split services in single mode',()=>{
 const rows=flowServiceSpecs({topology,specs:FLOW_QUEUES});assert.equal(rows.length,6);const queues=rows.flatMap(r=>r.queueNames);assert.equal(queues.length,12);assert.equal(new Set(queues).size,12);assert.equal(rows[0].queueNames.length,0);
 const legacy=flowServiceSpecs({specs:FLOW_QUEUES});assert.equal(legacy.length,1);assert.equal(legacy[0].role,'all');
});
test('source tuning uses source-owning roles, not idle coordinator or overloaded Facebook comment process',()=>{
 const services=['facebook-sources','social'].map((role,i)=>({Id:'crawler-queue-worker@'+role+'.service',ActiveState:'active',MainPID:String(10+i)}));
 const pulses={'facebook-sources':{pid:10,role:'facebook-sources',at:new Date(now-1000),eventLoopP99Ms:70,eventLoopUtilization:.4},social:{pid:11,role:'social',at:new Date(now-1000),eventLoopP99Ms:30,eventLoopUtilization:.3},coordinator:{eventLoopP99Ms:1,eventLoopUtilization:0},'facebook-comments':{eventLoopP99Ms:1500,eventLoopUtilization:1},'social-comments':{eventLoopP99Ms:2000,eventLoopUtilization:1}};
 const selected=sourceRuntimeTelemetry({topology,services,pulses,now});assert.equal(selected.fresh,true);assert.equal(selected.eventLoopP99Ms,70);assert.equal(selected.eventLoopUtilization,.4);
 pulses.social.pid=999;const stale=sourceRuntimeTelemetry({topology,services,pulses,now});assert.equal(stale.fresh,false);assert.deepEqual(stale.missing,['social']);
});
test('stale or wrong-role pulse cannot authorize source scaling; legacy pulses remain compatible',()=>{
 const services=[{Id:'crawler-queue-flow.service',ActiveState:'active',MainPID:'1'}];
 assert.equal(sourceRuntimeTelemetry({services,pulses:{all:{pid:1,at:new Date(now-1000),eventLoopP99Ms:10}},now}).fresh,true);
 assert.equal(sourceRuntimeTelemetry({services,pulses:{all:{pid:1,at:new Date(now-70000)}},now}).fresh,false);
 assert.equal(sourceRuntimeTelemetry({services,pulses:{all:{pid:1,role:'coordinator',at:new Date(now)}},now}).fresh,false);
});
test('only known split worker services recover, with the same cooldown and no false restart during network work',()=>{
 const base={service:'crawler-queue-worker@social.service',state:'failed',now};assert.equal(serviceRecoveryDecision(base).action,'start');
 assert.equal(serviceRecoveryDecision({...base,service:'crawler-queue-worker@unknown.service'}),null);
 assert.equal(serviceRecoveryDecision({...base,history:[now-1]}),null);
 assert.equal(serviceRecoveryDecision({...base,state:'active',backlog:10,stagnantMs:600000,heartbeatAgeMs:600000,recentNetworkEvents:1}),null);
});
