import test from 'node:test';import assert from 'node:assert/strict';
import {FLOW_QUEUES} from '../src/services/crawlerQueueFlow.js';
import {flowRuntimePlan,assertFlowRolePartition,FLOW_SPLIT_ROLES} from '../src/services/flowRuntimeTopology.js';
test('opt-in split assigns each executable queue once and keeps Facebook comments/replies together',()=>{
 const owners=assertFlowRolePartition(FLOW_QUEUES,{externalUid:true});assert.equal(owners.size,12);assert.equal(owners.get('facebook-comment'),owners.get('facebook-reply'));assert.equal(owners.get('facebook-group-source'),'facebook-sources');assert.equal(owners.get('youtube-source'),'social');assert.equal(owners.get('youtube-comment'),'social-comments');assert.notEqual(owners.get('youtube-source'),owners.get('youtube-comment'));assert.equal(owners.get('es5-import'),'imports');assert.equal(owners.has('find-uid'),false);
 assert.equal(assertFlowRolePartition(FLOW_QUEUES).get('find-uid'),'imports');
});
test('single mode remains compatible and coordinator owns no workers in split mode',()=>{
 const legacy=flowRuntimePlan({specs:FLOW_QUEUES,externalUid:true});assert.equal(legacy.workerSpecs.length,12);assert.equal(legacy.coordinator,true);assert.equal(legacy.lockKey,'crawler-flow-runtime-lock');
 const plan=flowRuntimePlan({role:'coordinator',topology:{version:2,mode:'split'},specs:FLOW_QUEUES});assert.equal(plan.workerSpecs.length,0);assert.equal(plan.coordinator,true);assert.equal(plan.lockKey,legacy.lockKey);
});
test('role topology refuses accidental all-worker overlap or a partial split without deployment marker',()=>{
 for(const role of FLOW_SPLIT_ROLES)assert.throws(()=>flowRuntimePlan({role,specs:FLOW_QUEUES}),/ROLE_MISMATCH/);
 assert.throws(()=>flowRuntimePlan({role:'all',topology:{version:2,mode:'split'},specs:FLOW_QUEUES}),/ROLE_MISMATCH/);
 assert.throws(()=>flowRuntimePlan({role:'unknown',topology:{version:2,mode:'split'},specs:FLOW_QUEUES}),/ROLE_MISMATCH/);
 const plans=FLOW_SPLIT_ROLES.map(role=>flowRuntimePlan({role,topology:{version:2,mode:'split'},specs:FLOW_QUEUES}));assert.equal(new Set(plans.map(p=>p.lockKey)).size,plans.length);
});
test('prepared four-role markers cannot start the new five-role runtime',()=>{
 assert.throws(()=>flowRuntimePlan({role:'social',topology:{version:1,mode:'split'},specs:FLOW_QUEUES}),/TOPOLOGY_INVALID/);
 assert.equal(flowRuntimePlan({topology:{version:1,mode:'single'},specs:FLOW_QUEUES}).role,'all');
});
test('version 3 isolates every Facebook queue exactly once without multiplying concurrency',()=>{
 const topology={version:3,mode:'split'},owners=assertFlowRolePartition(FLOW_QUEUES,{topology,externalUid:true});
 assert.equal(owners.get('facebook-page-source'),'facebook-page-sources');assert.equal(owners.get('facebook-group-source'),'facebook-group-sources');assert.equal(owners.get('facebook-user-source'),'facebook-user-sources');
 assert.equal(owners.get('facebook-comment'),'facebook-comments');assert.equal(owners.get('facebook-reply'),'facebook-replies');assert.equal(owners.size,12);
 const plans=[...new Set(owners.values())].map(role=>flowRuntimePlan({role,topology,specs:FLOW_QUEUES,externalUid:true}));
 assert.equal(new Set(plans.map(p=>p.lockKey)).size,8);
 assert.deepEqual(plans.flatMap(p=>p.workerSpecs).map(s=>[s.name,s.workers]).sort(),FLOW_QUEUES.filter(s=>s.kind!=='uid').map(s=>[s.name,s.workers]).sort());
 assert.throws(()=>flowRuntimePlan({role:'facebook-sources',topology,specs:FLOW_QUEUES}),/ROLE_MISMATCH/);
 assert.throws(()=>flowRuntimePlan({role:'facebook-page-sources',topology:{version:2,mode:'split'},specs:FLOW_QUEUES}),/ROLE_MISMATCH/);
});
