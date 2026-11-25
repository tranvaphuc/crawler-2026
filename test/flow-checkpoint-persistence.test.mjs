import test from 'node:test';
import assert from 'node:assert/strict';
import {persistFlowCheckpoint,hasDurableWaitCheckpoint} from '../src/services/flowCheckpointPersistence.js';
import {delayProxyJob,FlowProxyWaitError,ProxyWaitDelayedError} from '../src/services/crawlerProxyWait.js';
import {readWithJobRetries,unpackState} from '../src/services/crawlerQueueFlow.js';

function fixture(){
 const calls=[],row={data:{kind:'source',page:8,proxyRetries:17,sourceRoundId:'round',pendingPage:{items:[{id:'pending'}]}}};
 const job={id:'same',data:structuredClone(row.data),async updateData(data){calls.push('bull');this.saved=structuredClone(data);},async moveToDelayed(until){calls.push('delayed');this.until=until;}};
 const updates=[],jobs={async updateOne(_filter,update){calls.push('mongo');updates.push(structuredClone(update));for(const [key,value]of Object.entries(update.$set)){const parts=key.split('.');let cursor=row;for(const part of parts.slice(0,-1))cursor=cursor[part]??={};cursor[parts.at(-1)]=structuredClone(value);}}};
 return{job,jobs,row,calls,updates};
}
test('proxy waits write the cursor durably before synchronizing Bull once and delaying the same ticket',async()=>{
 const f=fixture(),state={nativeCursor:'exact',seen:new Set(['post']),items:[{id:'buffered'}]};
 await persistFlowCheckpoint({...f,state,extra:{proxyWaitUntil:105000,excludedProxyEndpoints:{endpoint:123}},deferBull:true});
 assert.deepEqual(f.calls,['mongo']);assert.equal(unpackState(f.row.data.checkpoint).nativeCursor,'exact');assert.equal(hasDurableWaitCheckpoint(f.job),true);
 await assert.rejects(delayProxyJob({...f,token:'lock',error:new FlowProxyWaitError(1000),now:100000}),ProxyWaitDelayedError);
 assert.deepEqual(f.calls,['mongo','mongo','bull','delayed']);assert.deepEqual(f.row.data,f.job.saved);assert.equal(f.job.until,105000);
 assert.equal(Object.hasOwn(f.updates[1].$set,'data'),false,'avoid resending the full durable checkpoint');
 assert.equal(f.job.saved.proxyRetries,17);assert.equal(f.job.saved.page,8);assert.equal(f.job.saved.sourceRoundId,'round');assert.deepEqual(f.job.saved.pendingPage,{items:[{id:'pending'}]});
});
test('failed durable writes never enable the reduced update path or publish a checkpoint to Bull',async()=>{
 const f=fixture();f.jobs.updateOne=async()=>{throw Error('write failed')};
 await assert.rejects(persistFlowCheckpoint({...f,state:{nativeCursor:'next'},deferBull:true}),/write failed/);
 assert.equal(hasDurableWaitCheckpoint(f.job),false);assert.equal(f.job.saved,undefined);
});
test('ordinary checkpoints still synchronize both stores and changed checkpoints use the full delay write',async()=>{
 const f=fixture();await persistFlowCheckpoint({...f,state:{nativeCursor:'one'}});assert.deepEqual(f.calls,['mongo','bull']);
 await persistFlowCheckpoint({...f,state:{nativeCursor:'two'},deferBull:true});f.job.data.checkpoint='changed';
 assert.equal(hasDurableWaitCheckpoint(f.job),false);
 await assert.rejects(delayProxyJob({...f,error:new FlowProxyWaitError(1000),now:100000}),ProxyWaitDelayedError);
 assert.equal(f.updates.at(-1).$set.data.checkpoint,'changed');
});

test('one job schedules five 15-second retries across pages, then fails without another check',async()=>{
 const f=fixture();f.job.data.proxyRetries=0;
 let clock=100000,reads=0,gates=0,failures=0;
 const results=[
  {status:'proxy_error',reason:'PROXY_POOL_BUSY'},
  {status:'auth_required',reason:'LOGIN_OR_CHECKPOINT'},
  {status:'ok'},
  {status:'error',reason:'NATIVE_PAGINATION_STALLED'},
  {status:'error',reason:'UPSTREAM_TIMEOUT'},
  {status:'proxy_error',reason:'PROXY_PACING_WAIT'},
  {status:'auth_required',reason:'LOGIN_OR_CHECKPOINT'}
 ];
 for(const result of results){
  const state={nativeCursor:'page-'+f.job.data.page};
  const turn=await readWithJobRetries({retries:f.job.data.proxyRetries,now:()=>clock,shouldStop:()=>false,
   read:async()=>{reads++;return {good:result.status==='ok',result,state};},
   onGate:async()=>{gates++;},onFailure:async()=>{failures++;},
   onRetry:async(proxyRetries,_result,{retryAt})=>persistFlowCheckpoint({...f,state,extra:{proxyRetries,proxyWaitUntil:retryAt},deferBull:true})
  });
  if(turn.good){f.job.data.page++;continue;}
  if(turn.exhausted){assert.equal(f.job.data.proxyRetries,5);assert.equal(turn.lastResult,result);assert.equal(turn.retryAt,undefined);break;}
  const deadline=clock+15000;
  assert.equal(turn.retryAt,deadline);
  await assert.rejects(delayProxyJob({...f,now:clock+1000,error:new FlowProxyWaitError(15000,{readyAt:turn.retryAt,reason:'READ_RETRY_WAIT'})}),ProxyWaitDelayedError);
  assert.equal(f.job.until,deadline);
  assert.equal(unpackState(f.job.saved.checkpoint).nativeCursor,state.nativeCursor);
  f.job.data=structuredClone(f.job.saved);
  clock=f.job.until;
 }
 assert.equal(reads,7);
 assert.equal(gates,2);
 assert.equal(failures,1);
 assert.equal(clock,175000);
 assert.equal(f.calls.filter(call=>call==='delayed').length,5);
 const oldJob=await readWithJobRetries({retries:6,shouldStop:()=>false,read:()=>assert.fail('legacy job has already exhausted the budget')});
 assert.equal(oldJob.exhausted,true);
});
