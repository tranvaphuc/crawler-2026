import test from 'node:test';
import assert from 'node:assert/strict';
import {boundedProxyRead,packState,unpackState} from '../src/services/crawlerQueueFlow.js';
import {runCrawlerQueue} from '../src/services/crawlerQueueContext.js';
const queues=['facebook-group-source','facebook-page-source','facebook-user-source'];
for(const queue of queues){
 test(`${queue} resumes the native cursor after pool exhaustion and more than two transport replacements`,async()=>runCrawlerQueue('crawler-flow-'+queue,async()=>{
  const data={page:12,proxyRetries:7,checkpoint:packState({nativeCursor:'NEXT',seen:new Set(['saved'])}),groupProxyEndpoints:Array(10).fill('a'.repeat(64)),groupCursorProxyWaitMs:120000,groupCursorProxyWaitStartedAt:1};
  let attempts=0,rotations=0;
  const options={initialRetries:data.proxyRetries,verifyAuthGates:true,rotate:async()=>rotations++,onRetry:async n=>{data.proxyRetries=n;},onFailure:async()=>assert.fail('must recover')};
  const deferred=await boundedProxyRead({...options,read:async()=>({good:false,state:unpackState(data.checkpoint),result:{reason:'PROXY_ENDPOINTS_UNAVAILABLE'}})});
  assert.equal(deferred.deferred,true);assert.equal(data.proxyRetries,7);assert.equal(deferred.state.nativeCursor,'NEXT');
  const restored=JSON.parse(JSON.stringify(data));
  const recovered=await boundedProxyRead({...options,initialRetries:restored.proxyRetries,read:async()=>++attempts<=4?{good:false,result:{reason:'NETWORK_ERROR'}}:{good:true,state:unpackState(restored.checkpoint),result:{status:'partial'}}});
  assert.equal(recovered.good,true);assert.equal(recovered.proxyPartial,undefined);assert.equal(data.proxyRetries,11);assert.equal(rotations,5);assert.equal(recovered.state.nativeCursor,'NEXT');assert.deepEqual([...recovered.state.seen],['saved']);
 }));
 test(`${queue} keeps native security challenges terminal`,async()=>runCrawlerQueue('crawler-flow-'+queue,async()=>{
  const out=await boundedProxyRead({read:async()=>({good:false,result:{reason:'ORIGIN_SECURITY_CHALLENGE'}}),rotate:async()=>assert.fail('must not rotate a native challenge')});
  assert.equal(out.failed,true);assert.equal(out.lastResult.reason,'ORIGIN_SECURITY_CHALLENGE');
 }));
}
