import test from 'node:test';
import assert from 'node:assert/strict';
import {fetchTextWithDeadline} from '../scripts/nguoinoitieng_http.mjs';

test('deadline rejects a fetch that ignores abort, and signals cancellation',async()=>{
  let signal;
  await assert.rejects(fetchTextWithDeadline('https://example.test',{timeoutMs:15,fetchImpl:async(_,options)=>{signal=options.signal;return new Promise(()=>{});}}),{code:'REQUEST_DEADLINE'});
  assert.equal(signal.aborted,true);
});
test('deadline also bounds a response whose body never resolves',async()=>{
  await assert.rejects(fetchTextWithDeadline('https://example.test',{timeoutMs:15,fetchImpl:async()=>({text:async()=>new Promise(()=>{})})}),{code:'REQUEST_DEADLINE'});
});
test('preserves a successful response and body',async()=>{
  const response={ok:true,status:200,text:async()=>'body'};
  const result=await fetchTextWithDeadline('https://example.test',{timeoutMs:100,fetchImpl:async()=>response});
  assert.equal(result.response,response);assert.equal(result.body,'body');
});
