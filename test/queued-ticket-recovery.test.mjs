import test from 'node:test';
import assert from 'node:assert/strict';
import {recoverQueuedTickets} from '../src/services/queuedTicketRecovery.js';
const queues=new Map([['source',{toKey:id=>'bull:source:'+id}]]);
function redisWith(replies,keys=[]){return {pipeline(){return {exists(key){keys.push(key);return this;},async exec(){return replies;}};}};}
test('existing tickets never reload or serialize Mongo checkpoints',async()=>{
 const keys=[];const r=await recoverQueuedTickets({rows:[{_id:'a',queue:'source'}],queues,redis:redisWith([[null,1]],keys),loadMissing:()=>assert.fail('reload'),offer:()=>assert.fail('replay')});
 assert.deepEqual(keys,['bull:source:a']);assert.deepEqual(r,{checked:1,missing:0,recovered:0});
});
test('only missing tickets still eligible in Mongo are recovered with their exact checkpoint',async()=>{
 const recovered=[],row={_id:'b',queue:'source',data:{checkpoint:{cursor:'opaque'},attempts:2}};
 const r=await recoverQueuedTickets({rows:[{_id:'a',queue:'source'},{_id:'b',queue:'source'},{_id:'now-running',queue:'source'}],queues,redis:redisWith([[null,1],[null,0],[null,0]]),loadMissing:async ids=>{assert.deepEqual(ids,['b','now-running']);return [row];},offer:async x=>recovered.push(x)});
 assert.deepEqual(recovered,[row]);assert.deepEqual(r,{checked:3,missing:2,recovered:1});
});
test('Redis check errors never cause speculative ticket replay',async()=>{
 await assert.rejects(recoverQueuedTickets({rows:[{_id:'a',queue:'source'}],queues,redis:redisWith([[Error('offline'),null]]),loadMissing:()=>assert.fail('reload'),offer:()=>assert.fail('replay')}),/offline/);
});
test('shutdown retains durable missing tickets for next process',async()=>{
 const r=await recoverQueuedTickets({rows:[{_id:'a',queue:'source'}],queues,redis:redisWith([[null,0]]),loadMissing:async()=>[{_id:'a'}],offer:()=>assert.fail('shutdown replay'),shouldStop:()=>true});
 assert.equal(r.recovered,0);
});
