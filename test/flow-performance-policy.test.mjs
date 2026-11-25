import test from 'node:test';import assert from 'node:assert/strict';
import {serviceRecoveryDecision,sourceCapacity,sourceSlaIncident,sourcePressureAdjustment,sourceRolePressurePlan} from '../src/services/flowPerformancePolicy.js';
test('only whitelisted stopped services recover and maintenance/cooldown/loop guards win',()=>{
 const base={service:'crawler-queue-flow.service',state:'failed',now:10000000};assert.equal(serviceRecoveryDecision(base).action,'start');
 for(const extra of [{service:'mongodb.service'},{maintenance:true},{state:'deactivating'},{history:[9999999]},{history:[7000001,7100000,7200000]}])assert.equal(serviceRecoveryDecision({...base,...extra}),null);
});
test('live work, network retries and legitimate waits never cause a stalled-server restart',()=>{
 const base={service:'crawler-queue-flow.service',state:'active',backlog:10,stagnantMs:600000,heartbeatAgeMs:600000};assert.equal(serviceRecoveryDecision(base).action,'restart');
 for(const extra of [{recentNetworkEvents:1},{stagnantMs:1000},{heartbeatAgeMs:1000},{backlog:0}])assert.equal(serviceRecoveryDecision({...base,...extra}),null);
 assert.equal(serviceRecoveryDecision({service:'crawler-proxy-manager.service',state:'active',unhealthySamples:3}).action,'restart');
});
test('capacity reports missing throughput explicitly and does not count failures as verified scans',()=>{
 const zero=sourceCapacity({eligible:100,uniqueFinished:0,uniqueVerified:0});assert.equal(zero.projectedSweepMinutes,null);
 const c=sourceCapacity({eligible:14400,uniqueFinished:1800,uniqueVerified:900});assert.equal(c.projectedSweepMinutes,120);assert.equal(c.projectedVerifiedSweepMinutes,240);assert.equal(c.recommendedMaximumSources,5760);assert.equal(c.recommendedAdditionalSources,0);
});
test('all sources responding still raises SLA shortfall until full success receipts exist',()=>{
 const c={queue:'instagram-source',eligible:246,attempted2h:246,response2h:246,verified2h:4};const incident=sourceSlaIncident(c);
 assert.equal(incident.missingAttempted,0);assert.equal(incident.missingResponses,0);assert.equal(incident.missingVerified,242);
 assert.equal(sourceSlaIncident({...c,verified2h:246}),null);
 assert.equal(sourceSlaIncident({...c,attempted2h:200,response2h:210}).missingAttempted,46);
 assert.equal(sourceSlaIncident({...c,verified2h:undefined}).missingVerified,246);
 assert.equal(sourceSlaIncident({...c,eligible:0,attempted2h:0,response2h:0,verified2h:0}),null);
});
test('failed attempts cannot create capacity headroom and incomplete coverage cannot admit extras',()=>{
 const failed=sourceCapacity({eligible:100,uniqueFinished:10000,uniqueVerified:0,verified2h:0});assert.equal(failed.recommendedMaximumSources,0);assert.equal(failed.recommendedAdditionalSources,0);
 const fast={eligible:100,uniqueFinished:10000,uniqueVerified:100};assert.equal(sourceCapacity(fast).recommendedAdditionalSources,0);
 const complete=sourceCapacity({...fast,verified2h:100});assert.equal(complete.recommendedMaximumSources,640);assert.equal(complete.recommendedAdditionalSources,540);assert.equal(complete.capacityEstimateOnly,true);
});
test('resource pressure reduces only source budgets, headroom restores at most the declared target',()=>{
 const base={queues:{source:10},desired:{source:12},load:20,cpus:8,freeRatio:.5,diskFreeBytes:100*1024**3,pressureSamples:2};assert.equal(sourcePressureAdjustment(base).queues.source,8);
 const up=sourcePressureAdjustment({...base,load:2,pressureSamples:0,healthySamples:5});assert.equal(up.queues.source,11);
 assert.equal(sourcePressureAdjustment({...base,load:2,pressureSamples:0,healthySamples:1}),null);
});
test('event-loop saturation throttles a single Node process even when the server has free cores',()=>{
 const base={queues:{source:100},desired:{source:150},load:3,cpus:8,freeRatio:.7,diskFreeBytes:100*1024**3,pressureSamples:2,healthySamples:10};
 assert.equal(sourcePressureAdjustment({...base,eventLoopP99Ms:1200,eventLoopUtilization:.99}).queues.source,80);
 assert.equal(sourcePressureAdjustment({...base,eventLoopP99Ms:200,eventLoopUtilization:.9}),null);
});
test('shared event-loop pressure cannot progressively starve sources; origin and host safety still win',()=>{
 const base={queues:{group:120,youtube:1},desired:{group:160,youtube:15},minimum:{group:60,youtube:5},load:3,cpus:8,freeRatio:.7,diskFreeBytes:100*1024**3,pressureSamples:2,eventLoopP99Ms:700,eventLoopUtilization:1};
 let queues=base.queues;for(let i=0;i<20;i++)queues=sourcePressureAdjustment({...base,queues})?.queues||queues;
 assert.deepEqual(queues,{group:60,youtube:1},'origin-limited queue must not be raised by a floor');
 assert.equal(sourcePressureAdjustment({...base,queues}),null);
 assert.deepEqual(sourcePressureAdjustment({...base,queues,freeRatio:.05}).queues,{group:48,youtube:1},'actual host emergency may reduce below baseline');
});
test('busy Facebook source role cannot throttle an independent healthy social source role',()=>{
 const options={queues:{fb:60,yt:5},desired:{fb:160,yt:15},minimum:{fb:60,yt:5},resources:{load:3,cpus:8,freeRatio:.7,diskFreeBytes:100*1024**3},groups:[{role:'facebook-sources',queueNames:['fb'],fresh:true,eventLoopUtilization:1,eventLoopP99Ms:700},{role:'social',queueNames:['yt'],fresh:true,eventLoopUtilization:.3,eventLoopP99Ms:30}],previous:{'facebook-sources':{pressureSamples:2},social:{healthySamples:5}}};
 const plan=sourceRolePressurePlan(options);assert.equal(plan.queues.fb,60);assert.equal(plan.queues.yt,6);
 const stale=sourceRolePressurePlan({...options,groups:options.groups.map(g=>g.role==='social'?{...g,fresh:false}:g)});assert.equal(stale.queues.yt,5);
 const capped=sourceRolePressurePlan({...options,queues:{fb:395,yt:5},desired:{fb:395,yt:15},groups:[options.groups[1]]});assert.equal(capped.queues.yt,5);
});
