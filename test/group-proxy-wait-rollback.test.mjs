import test from 'node:test';
import assert from 'node:assert/strict';
import {boundedProxyRead,packState,unpackState} from '../src/services/crawlerQueueFlow.js';
for(const transport of [{proxyUsed:true},{proxyUsed:false},undefined]){
 test(`Group pool exhaustion defers without consuming any proxy (${JSON.stringify(transport)})`,async()=>{
  let waits=0,attempts=0;const state={nativeCursor:'exact-next-page',pendingItems:[{id:'saved'}]};
  const out=await boundedProxyRead({proxyAttemptLimit:10,initialRetries:100,read:async()=>({good:false,result:{reason:'PROXY_ENDPOINTS_UNAVAILABLE',transport},state}),rotate:async()=>{},onProxyAttempt:async()=>attempts++,onWait:async()=>waits++,onRetry:async()=>assert.fail('must not consume retry'),onFailure:async()=>assert.fail('must not fail')});
  assert.equal(out.deferred,true);assert.equal(waits,1);assert.equal(attempts,0);assert.equal(out.state.nativeCursor,'exact-next-page');
 });
}
const endpoint=n=>n.toString(16).padStart(64,'0');
const failed=n=>({good:false,result:{status:'rate_limited',reason:'FACEBOOK_RATE_LIMITED',transport:{proxyUsed:true,proxyEndpoint:endpoint(n)}}});
test('Group waits between new proxies, keeps its durable cursor, and fails only at the tenth failed endpoint',async()=>{
 let ledger=[],data={checkpoint:packState({nativeCursor:'NEXT',items:[{id:'buffered'}]}),proxyRetries:0},terminal=0;
 for(let n=1;n<=10;n++){
  let read=0;
  const out=await boundedProxyRead({proxyAttemptLimit:10,initialProxyEndpoints:ledger,initialRetries:data.proxyRetries,
   read:async()=>++read===1?failed(n):{good:false,result:{reason:'PROXY_ENDPOINTS_UNAVAILABLE',transport:{proxyUsed:true}}},rotate:async()=>{},
   onProxyAttempt:async endpoints=>{ledger=endpoints;data.groupProxyEndpoints=endpoints;},onRetry:async retries=>{data.proxyRetries=retries;},onFailure:async()=>terminal++});
  if(n<10){assert.equal(out.deferred,true);assert.equal(terminal,0);}else{assert.equal(out.failed,true);assert.equal(out.proxyAttempts,10);assert.equal(terminal,1);assert.equal(read,1);}
  data=JSON.parse(JSON.stringify(data));ledger=data.groupProxyEndpoints;assert.equal(unpackState(data.checkpoint).nativeCursor,'NEXT');assert.deepEqual(unpackState(data.checkpoint).items,[{id:'buffered'}]);
 }
});
test('success on the tenth proxy completes instead of failing',async()=>{
 const out=await boundedProxyRead({proxyAttemptLimit:10,initialProxyEndpoints:Array.from({length:9},(_,i)=>endpoint(i+1)),read:async()=>({good:true,result:{status:'partial',transport:{proxyUsed:true,proxyEndpoint:endpoint(10)}}}),rotate:async()=>{},onFailure:async()=>assert.fail('tenth proxy succeeded')});assert.equal(out.good,true);
});
test('repeat failures on the same endpoint do not consume distinct proxy attempts',async()=>{
 let reads=0,saved;const out=await boundedProxyRead({proxyAttemptLimit:10,initialProxyEndpoints:[endpoint(1)],read:async()=>++reads<4?failed(1):{good:false,result:{reason:'PROXY_ENDPOINTS_UNAVAILABLE'}},rotate:async()=>{},onProxyAttempt:async list=>{saved=list;}});assert.equal(out.deferred,true);assert.equal(saved,undefined);
});
test('a restart after persisting the tenth failure never calls an eleventh proxy',async()=>{
 const out=await boundedProxyRead({proxyAttemptLimit:10,initialProxyEndpoints:Array.from({length:10},(_,i)=>endpoint(i+1)),read:async()=>assert.fail('must not try an eleventh proxy'),rotate:async()=>{}});assert.equal(out.failed,true);assert.equal(out.proxyAttempts,10);
});
for(const reason of ['PROXY_POOL_BUSY','PROXY_PROVIDER_COOLDOWN','PROXY_MANAGER_UNAVAILABLE']){
 test(`Group waits through temporary ${reason} without spending a real proxy`,async()=>{
  const out=await boundedProxyRead({proxyAttemptLimit:10,initialProxyEndpoints:[endpoint(1)],read:async()=>({good:false,result:{reason,transport:{proxyUsed:false}}}),rotate:async()=>{},onProxyAttempt:async()=>assert.fail('no actual proxy attempted'),onRetry:async()=>assert.fail('wait must not spend retry'),onFailure:async()=>assert.fail('temporary availability is not terminal')});assert.equal(out.deferred,true);
 });
}
test('Group anonymous bootstrap failures use the full ten-proxy budget',async()=>{
 let reads=0,terminal=0;const out=await boundedProxyRead({proxyAttemptLimit:10,read:async()=>({...failed(++reads),result:{...failed(reads).result,status:'error',reason:'ANONYMOUS_BOOTSTRAP_UNAVAILABLE'}}),rotate:async()=>{},onFailure:async()=>terminal++});assert.equal(out.failed,true);assert.equal(reads,10);assert.equal(out.proxyAttempts,10);assert.equal(terminal,1);
});
test('other queues keep their existing anonymous bootstrap terminal policy',async()=>{
 let reads=0;const out=await boundedProxyRead({read:async()=>{reads++;return {good:false,result:{status:'error',reason:'ANONYMOUS_BOOTSTRAP_UNAVAILABLE'}};},rotate:async()=>assert.fail('other queue must keep its policy')});assert.equal(out.failed,true);assert.equal(reads,1);
});
