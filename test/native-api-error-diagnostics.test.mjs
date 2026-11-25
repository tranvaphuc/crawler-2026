import test from 'node:test';import assert from 'node:assert/strict';
import {publicApiIssue}from'../src/services/socialApiErrors.js';
import {boundedProxyRead}from'../src/services/crawlerQueueFlow.js';
import {sourceRoundOutcome}from'../src/services/crawlerSourceRounds.js';
test('Threads missing-variable errors retain safe native codes and fail instead of completing',async()=>{
 const issue=publicApiIssue([{errors:[{code:1675012,message:'A server error missing_required_variable_value occured. Check server logs for details.',description:'private secret',debug_link:'private',is_transient:false}]}]);
 assert.deepEqual(issue,{status:'error',reason:'UPSTREAM_API_ERROR',upstreamCode:'1675012',upstreamTransient:false});
 const result=await boundedProxyRead({read:async()=>({good:false,result:issue}),rotate:async()=>assert.fail('nontransient query errors must not rotate')});
 assert.equal(result.failed,true);assert.notEqual(result.done,true);assert.equal(sourceRoundOutcome(Error('UPSTREAM_API_ERROR')),'failed');
 assert.ok(!JSON.stringify(result).includes('private'));
});
