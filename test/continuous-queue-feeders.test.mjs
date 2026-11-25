import test from 'node:test';import assert from 'node:assert/strict';import {startContinuousQueueFeeders} from '../src/services/continuousQueueFeeders.js';
test('a blocked source refill never blocks a comment queue, and reply has no autonomous Mongo feeder',async()=>{let stop=false,release,fast=0,reply=0;const blocked=new Promise(r=>release=r);const loops=startContinuousQueueFeeders({queues:[{name:'slow',kind:'source'},{name:'fast',kind:'comments'},{name:'reply',kind:'reply'}],shouldStop:()=>stop,wait:()=>new Promise(setImmediate),refill:async q=>{if(q.name==='slow')await blocked;if(q.name==='reply')reply++;if(q.name==='fast'&&++fast===3){stop=true;release();}}});await Promise.all(loops);assert.equal(fast,3);assert.equal(reply,0);});
test('one refill error is recorded and retried without stopping the other queues',async()=>{let stop=false,n=0;const errors=[];await Promise.all(startContinuousQueueFeeders({queues:[{name:'q',kind:'source'}],shouldStop:()=>stop,wait:()=>new Promise(setImmediate),onError:(q,e)=>errors.push(e.message),refill:async()=>{if(++n===1)throw Error('TEMPORARY_MONGO_ERROR');stop=true;}}));assert.equal(n,2);assert.deepEqual(errors,['TEMPORARY_MONGO_ERROR']);});

test('source admission queues every eligible source regardless of worker count or existing backlog',async()=>{
 const {enqueueAllEligibleSources}=await import('../src/services/continuousQueueFeeders.js');
 const source=i=>({_id:'source:'+i,platform:'instagram',type:'profile',nativeId:String(i),url:'https://www.instagram.com/u'+i,eligible:true,audit:{status:'live'}});
 const rows=Array.from({length:1000},(_,i)=>source(i+1));
 rows.push({...source(1001),eligible:false},source(1));
 const existingEntityKeys=new Set(['source:source:1','source:source:2']);
 const offered=[],marked=[];
 const count=await enqueueAllEligibleSources({rows,existingEntityKeys,enqueueBatch:async batch=>offered.push(...batch.map(x=>x.source._id)),markScheduledBatch:async batch=>marked.push(...batch.map(x=>x.source._id))});
 assert.equal(count,998);assert.equal(new Set(offered).size,998);assert.deepEqual(marked,offered);
 assert.equal(await enqueueAllEligibleSources({rows,existingEntityKeys,enqueueBatch:async()=>{throw Error('DUPLICATE_JOB');},markScheduledBatch:async()=>{}}),0);
});
test('source admission marks a source only after its durable enqueue succeeds',async()=>{
 const {enqueueAllEligibleSources}=await import('../src/services/continuousQueueFeeders.js');
 const source={_id:'s',platform:'instagram',type:'profile',nativeId:'1',url:'https://www.instagram.com/u',eligible:true,audit:{status:'live'}};
 let marked=false;
 await assert.rejects(()=>enqueueAllEligibleSources({rows:[source],existingEntityKeys:new Set(),enqueueBatch:async()=>{throw Error('REDIS_DOWN');},markScheduledBatch:async()=>{marked=true;}}),/REDIS_DOWN/);
 assert.equal(marked,false);
});

test('full source admission publishes bounded batches and flushes the last partial batch',async()=>{
 const {enqueueAllEligibleSources}=await import('../src/services/continuousQueueFeeders.js');
 const rows=Array.from({length:601},(_,i)=>({_id:String(i+1),platform:'instagram',type:'profile',nativeId:String(i+1),url:'https://www.instagram.com/u'+i,eligible:true,audit:{status:'live'}}));
 const sizes=[],events=[];
 const offered=await enqueueAllEligibleSources({rows,existingEntityKeys:new Set(),enqueueBatch:async batch=>{sizes.push(batch.length);events.push('enqueue');},markScheduledBatch:async()=>events.push('mark')});
 assert.equal(offered,601);assert.deepEqual(sizes,[250,250,101]);assert.deepEqual(events,['enqueue','mark','enqueue','mark','enqueue','mark']);
});

function scannerFixture(rows,blockedIds=[],options={}){
 const blocked=new Set(blockedIds.map(id=>'comments:'+id)),offered=[],marked=[],pages=[];
 const source={_id:'instagram:profile:9',platform:'instagram',type:'profile',nativeId:'9',url:'https://www.instagram.com/public',eligible:true,audit:{status:'live'}};
 let data=rows.map(id=>({_id:id,source}));
 const setup={minimumPageSize:1,findPage:async({queue,after,limit})=>{pages.push({queue:queue.name,after});return data.filter(r=>after===null||r._id>after).sort((a,b)=>a._id.localeCompare(b._id)).slice(0,limit);},findBlocked:async keys=>keys.filter(k=>blocked.has(k)),hasExisting:async key=>blocked.has(key),enqueue:async(_q,row,key)=>{offered.push(row._id);blocked.add(key);},markScheduled:async row=>marked.push(row._id),...options};
 return {setup,blocked,offered,marked,pages,insert:id=>data.push({_id:id,source})};
}
test('retained failed prefix cannot starve never-scheduled posts beyond the candidate page',async()=>{
 const{createCommentCandidateScanner}=await import('../src/services/continuousQueueFeeders.js');const f=scannerFixture(['01','02','03','04','05','06','07'],['01','02','03','04','05']),scan=createCommentCandidateScanner(f.setup),q={name:'instagram-comment'};
 assert.equal((await scan(q,{},1)).offered,0);assert.equal((await scan(q,{},1)).offered,1);assert.equal((await scan(q,{},1)).offered,1);assert.deepEqual(f.offered,['06','07']);assert.ok(f.blocked.has('comments:01'));assert.deepEqual(f.marked,f.offered);
});
test('capacity exhaustion preserves unvisited candidates for the next refill and queues have separate cursors',async()=>{
 const{createCommentCandidateScanner}=await import('../src/services/continuousQueueFeeders.js');const f=scannerFixture(['01','02','03']),scan=createCommentCandidateScanner(f.setup);await scan({name:'a'},{},1);await scan({name:'a'},{},1);assert.deepEqual(f.offered,['01','02']);await scan({name:'b'},{},1);assert.equal(f.pages[2].after,null);assert.deepEqual(f.offered,['01','02','03']);
});
test('an enqueue error does not mark scheduled or advance past the failed durable offer',async()=>{
 const{createCommentCandidateScanner}=await import('../src/services/continuousQueueFeeders.js');let attempts=0;const f=scannerFixture(['01'],[],{enqueue:async()=>{if(++attempts===1)throw Error('MONGO_DOWN');}}),scan=createCommentCandidateScanner(f.setup),q={name:'q'};
 await assert.rejects(()=>scan(q,{},1),/MONGO_DOWN/);assert.deepEqual(f.marked,[]);await scan(q,{},1);assert.equal(f.pages[1].after,null);assert.deepEqual(f.marked,['01']);
});
test('end-of-scan wrap discovers a new lower ID without retrying the retained failed ticket',async()=>{
 const{createCommentCandidateScanner}=await import('../src/services/continuousQueueFeeders.js');const f=scannerFixture(['02'],['02']),scan=createCommentCandidateScanner(f.setup),q={name:'q'};await scan(q,{},1);assert.equal((await scan(q,{},1)).wrapped,true);f.insert('01');await scan(q,{},1);assert.deepEqual(f.offered,['01']);assert.ok(f.blocked.has('comments:02'));
});
