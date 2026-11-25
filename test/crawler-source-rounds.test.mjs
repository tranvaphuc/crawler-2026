import test from 'node:test';import assert from 'node:assert/strict';
import {createSourceRoundCoordinator,sourceQueueNeedsRefill,sourceRoundDrained,sourceRoundOutcome,summarizeSourceRound,SOURCE_PENDING_STATES} from '../src/services/crawlerSourceRounds.js';
import {enqueueAllEligibleSources} from '../src/services/continuousQueueFeeders.js';
const source=(id,platform='instagram')=>({_id:id,platform,type:'profile',nativeId:String(id),url:'https://example.test/'+id,eligible:true,audit:{status:'live'}});
function memoryDb(seed={}){
 const collections=new Map();
 const get=(row,key)=>key.split('.').reduce((v,k)=>v?.[k],row);
 const match=(row,filter)=>Object.entries(filter).every(([key,value])=>{if(key==='$and')return value.every(f=>match(row,f));if(key==='$or')return value.some(f=>match(row,f));const actual=get(row,key);if(value===null)return actual==null;if(value&&typeof value==='object'&&!Array.isArray(value)){if('$in'in value)return value.$in.includes(actual);if('$nin'in value)return !value.$nin.includes(actual);if('$lte'in value)return actual!=null&&+actual<=+value.$lte;if('$exists'in value)return (actual!==undefined)===value.$exists;if('$ne'in value)return actual!==value.$ne;}return actual===value;});
 function apply(row,update,inserted){for(const [key,value]of Object.entries({...inserted?update.$setOnInsert:{},...update.$set})){const keys=key.split('.');let at=row;for(const k of keys.slice(0,-1))at=at[k]??={};at[keys.at(-1)]=value;}}
 const db={collection(name){if(collections.has(name))return collections.get(name);const data=structuredClone(seed[name]||[]),collection={data,countFilters:[],distinctCalls:0,
  find(filter={}){let sort=null,limit=Infinity;const cursor={sort(value){sort=value;return cursor;},limit(value){limit=value;return cursor;},async toArray(){let rows=data.filter(row=>match(row,filter));if(sort)rows.sort((a,b)=>{const k=Object.keys(sort)[0];return((+get(a,k)||0)-(+get(b,k)||0))*sort[k];});return rows.slice(0,limit);}};return cursor;},
  async findOne(filter){return data.find(row=>match(row,filter))||null;},
  async insertOne(row){data.push(structuredClone(row));},
  async updateOne(filter,update,options={}){let row=data.find(r=>match(r,filter)),inserted=false;if(!row&&options.upsert){row={...filter};data.push(row);inserted=true;}if(row)apply(row,update,inserted);},
  async updateMany(filter,update){for(const row of data.filter(r=>match(r,filter)))apply(row,update,false);},
  async distinct(field,filter){collection.distinctCalls++;return [...new Set(data.filter(row=>match(row,filter)).map(row=>get(row,field)).filter(value=>value!==undefined))];},
  async countDocuments(filter){collection.countFilters.push(structuredClone(filter));return data.filter(row=>match(row,filter)).length;},
  async bulkWrite(ops){for(const {updateOne:op}of ops)await collection.updateOne(op.filter,op.update,{upsert:op.upsert});},
  aggregate(){return{toArray:async()=>[]};}
 };collections.set(name,collection);return collection;}};return db;
}
function fixture(seed,options={}){
 const db=memoryDb(seed),counts=new Map(),queues=new Map(),loads=[];
 for(const name of ['a','b','facebook-group-source']){counts.set(name,{waiting:0,active:0,failed:0});queues.set(name,{getJobCounts:async()=>counts.get(name)});}
 const coordinator=createSourceRoundCoordinator({db,queues,...options,enqueueSources:async(spec,round,rows,existingEntityKeys)=>{
  loads.push({queue:spec.name,roundId:round._id});
  await enqueueAllEligibleSources({rows,existingEntityKeys,enqueueBatch:async batch=>{for(const {source,entityKey}of batch)await db.collection('flow_jobs').insertOne({_id:round._id+':'+source._id,queue:spec.name,entityKey,sourceRoundId:round._id,state:'queued',data:{source,sourceRoundId:round._id}});},markScheduledBatch:async()=>{}});
  counts.get(spec.name).waiting=await db.collection('flow_jobs').countDocuments({queue:spec.name,state:'queued'});
 }});
 return {db,counts,loads,coordinator};
}
test('failed/completed tickets do not block refill, but every executable state and the durable outbox do',()=>{
 assert.equal(sourceRoundDrained({failed:50,completed:0}),true);
 for(const state of SOURCE_PENDING_STATES)assert.equal(sourceRoundDrained({[state]:1}),false,state);
 assert.equal(sourceRoundDrained({},1),false);
});
test('retry exhaustion is a retained failure, and round summary separates it from successful reads',()=>{
 assert.equal(sourceRoundOutcome(null,{reason:'RETRY_LIMIT_EXHAUSTED'}),'retry_exhausted');
 assert.equal(sourceRoundOutcome('FACEBOOK_UID_RETRY_LIMIT_EXHAUSTED'),'retry_exhausted');
 const result=summarizeSourceRound({sourceIds:['1','2','3'],startedAt:new Date(1000)},[{sourceId:'1',outcome:'success'},{sourceId:'1',outcome:'success'},{sourceId:'2',outcome:'retry_exhausted'},{sourceId:'3',outcome:'failed'}],new Date(2000));
 assert.equal(result.success,1);assert.equal(result.retryExhausted,1);assert.equal(result.failed,1);assert.equal(result.unaccountedSources,0);assert.equal(result.durationMs,1000);
});
test('refill depends on waiting jobs and unpublished outbox tickets, independently of active jobs',()=>{
 assert.equal(sourceQueueNeedsRefill({waiting:0,active:70,delayed:2,'waiting-children':1}),true);
 for(const state of ['waiting','paused','prioritized'])assert.equal(sourceQueueNeedsRefill({[state]:1}),false);
 assert.equal(sourceQueueNeedsRefill({},1),false);
});
test('empty waiting refills finished sources while a slow source stays active, and closes older rounds independently',async()=>{
 const f=fixture({sources:[source('1'),source('2')]});const spec={name:'a',kind:'source'};
 await f.coordinator(spec,{});
 const first=f.db.collection('flow_source_rounds').data[0],jobs=f.db.collection('flow_jobs').data,results=f.db.collection('flow_source_round_results');
 const early=jobs.find(j=>j.data.source._id==='1'),slow=jobs.find(j=>j.data.source._id==='2');
 jobs.splice(jobs.indexOf(early),1);await results.insertOne({_id:early._id,roundId:first._id,sourceId:'1',outcome:'success'});
 slow.state='running';f.counts.set('a',{waiting:0,active:1});
 await f.coordinator(spec,{});
 assert.equal(first.state,'running');assert.equal(f.loads.length,2);
 const second=f.db.collection('flow_source_rounds').data[1];
 assert.deepEqual(second.sourceIds,['1']);assert.equal(jobs.filter(j=>j.entityKey==='source:2').length,1);
 // A repeat poll must not generate another round while the new ticket waits.
 await f.coordinator(spec,{});assert.equal(f.loads.length,2);
 slow.state='failed';slow.error='READ_FAILED';
 await f.coordinator(spec,{});
 assert.equal(first.state,'completed');assert.equal(first.summary.success,1);assert.equal(first.summary.failed,1);
 assert.equal(second.state,'running');assert.equal(f.loads.length,2);
});
test('all sources still active creates no empty rounds; loading recovery wins over newer running rounds',async()=>{
 const f=fixture({sources:[source('1')],flow_source_rounds:[{_id:'old',queue:'a',state:'running',sourceIds:['1'],startedAt:new Date()}],flow_jobs:[{_id:'busy',queue:'a',sourceRoundId:'old',entityKey:'source:1',state:'running',data:{source:source('1')}}]});
 await f.coordinator({name:'a',kind:'source'},{});assert.equal(f.loads.length,0);assert.equal(f.db.collection('flow_source_rounds').data.length,1);
 await f.db.collection('sources').insertOne(source('2'));
 await f.db.collection('flow_source_rounds').insertOne({_id:'resume',queue:'a',state:'loading',sourceIds:['2'],startedAt:new Date()});
 await f.coordinator({name:'a',kind:'source'},{});
 assert.equal(f.loads[0].roundId,'resume');assert.equal(f.db.collection('flow_source_rounds').data.length,2);
});
test('checkpointed proxy waits do not block a new round or admit the waiting source twice',async()=>{
 const f=fixture({sources:[source('1'),source('2')],flow_source_rounds:[{_id:'old',queue:'a',state:'running',sourceIds:['1','2'],startedAt:new Date()}],
  flow_jobs:[{_id:'waiting-proxy',queue:'a',sourceRoundId:'old',entityKey:'source:2',state:'queued',proxyDeferred:true,data:{source:source('2'),checkpoint:'exact-cursor',proxyRetries:7,proxyWaitUntil:Date.now()+5000}}],
  flow_source_round_results:[{_id:'done',roundId:'old',sourceId:'1',outcome:'success'}]});
 f.counts.set('a',{waiting:0,active:0,delayed:1});await f.coordinator({name:'a',kind:'source'},{});
 assert.equal(f.loads.length,1);const next=f.db.collection('flow_source_rounds').data.find(r=>r._id!=='old');assert.deepEqual(next.sourceIds,['1']);
 const jobs=f.db.collection('flow_jobs').data;assert.equal(jobs.filter(j=>j.entityKey==='source:2').length,1);assert.equal(jobs.find(j=>j._id==='waiting-proxy').data.checkpoint,'exact-cursor');assert.equal(jobs.find(j=>j._id==='waiting-proxy').data.proxyRetries,7);
});
test('waiting work blocks refill; a fully settled queue refills independently while keeping failed jobs',async()=>{
 const f=fixture({sources:[source('1'),source('2'),source('3','threads')],flow_jobs:[{_id:'old-failure',queue:'a',entityKey:'source:1',state:'failed',error:'READ_FAILED',data:{source:source('1')}}]});
 const a={name:'a',kind:'source'},b={name:'b',kind:'source'};
 await f.coordinator(a,{platform:'instagram'});await f.coordinator(b,{platform:'threads'});
 assert.equal(f.loads.length,2);const first=f.db.collection('flow_source_rounds').data.find(r=>r.queue==='a');
 // A source that finishes early must not be admitted again within the same round.
 const jobs=f.db.collection('flow_jobs').data,early=jobs.find(j=>j.sourceRoundId===first._id);
 jobs.splice(jobs.indexOf(early),1);await f.db.collection('flow_source_round_results').insertOne({_id:early._id,roundId:first._id,sourceId:early.data.source._id,outcome:'success'});
 f.counts.get('a').waiting=1;await f.coordinator(a,{platform:'instagram'});assert.equal(f.loads.length,2);
 // Only A drains; B stays in its own first round.
 const last=jobs.find(j=>j.sourceRoundId===first._id);last.state='failed';last.error='RETRY_LIMIT_EXHAUSTED';last.failedAt=new Date();
 f.counts.set('a',{waiting:0,active:0,failed:2});await f.coordinator(a,{platform:'instagram'});
 assert.equal(first.state,'completed');assert.equal(first.summary.success,1);assert.equal(first.summary.retryExhausted,1);
 assert.equal(f.loads.filter(x=>x.queue==='a').length,2);assert.equal(f.loads.filter(x=>x.queue==='b').length,1);
 const next=f.db.collection('flow_source_rounds').data.find(r=>r.queue==='a'&&r.state==='running');
 assert.notEqual(next._id,first._id);assert.equal(jobs.filter(j=>j.sourceRoundId===next._id).length,2);
 assert.ok(jobs.some(j=>j._id==='old-failure'));assert.equal(last.state,'failed');
});
test('restart during admission resumes the same round and skips already completed members',async()=>{
 const f=fixture({sources:[source('1'),source('2')],flow_source_rounds:[{_id:'resume',queue:'a',state:'loading',startedAt:new Date(),sourceIds:['1','2']}],flow_source_round_results:[{_id:'done',roundId:'resume',sourceId:'1',outcome:'success'}]});
 await f.coordinator({name:'a',kind:'source'},{platform:'instagram'});
 assert.equal(f.db.collection('flow_source_rounds').data.length,1);assert.equal(f.loads[0].roundId,'resume');
 assert.deepEqual(f.db.collection('flow_jobs').data.map(j=>j.data.source._id),['2']);
});
test('pre-upgrade pending work keeps its checkpoint; old failures remain and get a fresh ticket in the new round',async()=>{
 const f=fixture({sources:[source('1'),source('2')],flow_jobs:[{_id:'pending',queue:'a',entityKey:'source:1',state:'queued',data:{source:source('1'),checkpoint:'native-cursor',proxyRetries:7}},{_id:'failed',queue:'a',entityKey:'source:2',state:'failed',data:{source:source('2')}}]});
 await f.coordinator({name:'a',kind:'source'},{platform:'instagram'});const jobs=f.db.collection('flow_jobs').data,pending=jobs.find(j=>j._id==='pending');
 assert.ok(pending.sourceRoundId);assert.equal(pending.data.checkpoint,'native-cursor');assert.equal(pending.data.proxyRetries,7);assert.equal(jobs.filter(j=>j.entityKey==='source:1').length,1);assert.equal(jobs.filter(j=>j.entityKey==='source:2').length,2);
});

test('two-hour admission includes new and overdue sources while existing waiting cursors stay exclusive',async()=>{
 const now=10000000,spec={name:'a',kind:'source'},busy=source('1'),old={...source('2'),flowLastScheduledAt:new Date(1)},fresh={...source('4'),flowLastScheduledAt:new Date(now-1000)};
 const f=fixture({sources:[busy,old,source('3'),fresh],flow_jobs:[{_id:'live',queue:'a',state:'queued',sourceRoundId:'prior',entityKey:'source:1',data:{source:busy,checkpoint:'keep-native',proxyRetries:7}}]},{sourceRescanMs:7200000,now:()=>now});
 f.counts.set('a',{waiting:10,active:1});await f.coordinator(spec,{});
 const round=f.db.collection('flow_source_rounds').data[0];assert.deepEqual(round.sourceIds.sort(),['2','3']);const jobs=f.db.collection('flow_jobs').data;assert.equal(jobs.filter(j=>j.entityKey==='source:1').length,1);assert.equal(jobs.find(j=>j._id==='live').data.checkpoint,'keep-native');assert.equal(jobs.find(j=>j._id==='live').data.proxyRetries,7);
 await f.coordinator(spec,{});assert.equal(f.loads.length,1);
});

test('a congested Group queue admits new sources without repeating overdue sources',async()=>{
 const now=10000000,spec={name:'a',kind:'source'};
 const busy=source('1'),overdue={...source('2'),flowLastScheduledAt:new Date(1)},newSource=source('3');
 const f=fixture({
  sources:[busy,overdue,newSource],
  flow_jobs:[{_id:'waiting',queue:'a',state:'queued',sourceRoundId:'prior',entityKey:'source:1',proxyDeferred:true,data:{source:busy,checkpoint:'keep-native',page:5}}],
 },{sourceRescanMs:7200000,rescanWhileWaiting:queue=>queue.name!=='a',now:()=>now});
 f.counts.set('a',{waiting:10,active:1});
 await f.coordinator(spec,{});
 const rounds=f.db.collection('flow_source_rounds').data;
 assert.deepEqual(rounds.map(round=>round.sourceIds),[['3']]);
 const jobs=f.db.collection('flow_jobs').data;
 assert.equal(jobs.find(job=>job._id==='waiting').data.checkpoint,'keep-native');
 jobs.length=0;
 f.counts.set('a',{waiting:0,active:0});
 await f.coordinator(spec,{});
 assert.deepEqual(rounds.at(-1).sourceIds,['1','2','3']);
});

test('Group admission rechecks sources missed while their tickets change state',async()=>{
 const queue='facebook-group-source',busy=source('1'),fresh=source('2');
 const f=fixture({sources:[busy,fresh],flow_jobs:[
  {_id:'busy',queue,sourceRoundId:'prior',entityKey:'source:1',state:'running',data:{source:busy,checkpoint:'native-cursor',page:5}},
 ]});
 const jobs=f.db.collection('flow_jobs'),find=jobs.find.bind(jobs);
 jobs.find=(filter,options)=>{
  if(filter.queue===queue&&filter.state?.$in&&!filter.entityKey)return find({_id:'missed-by-state-scan'});
  if(filter.entityKey?.$in)assert.deepEqual(options.hint,{entityKey:1});
  return find(filter);
 };
 await f.coordinator({name:queue,kind:'source'},{});
 assert.deepEqual(f.db.collection('flow_source_rounds').data[0].sourceIds,['2']);
 assert.equal(jobs.data.filter(job=>job.entityKey==='source:1').length,1);
 assert.equal(jobs.data[0].data.checkpoint,'native-cursor');
});

function originIdleSeed(until=100000){return{sources:[source('1')],flow_source_rounds:[{_id:'old',queue:'a',state:'running',sourceIds:['1'],startedAt:new Date(0)}],flow_jobs:[{_id:'held',queue:'a',state:'queued',sourceRoundId:'old',entityKey:'source:1',originDeferred:true,data:{source:source('1'),originWaitUntil:until,checkpoint:'opaque-native',proxyRetries:7}}]};}
test('origin-idle polling reduces inventory reads10x and reconciliation15x without changing checkpoints',async()=>{
 async function run(options){let clock=1000;const metrics={};const f=fixture(originIdleSeed(),{...options,now:()=>clock,onMetric:name=>metrics[name]=(metrics[name]||0)+1});for(clock=1000;clock<=60000;clock+=1000)await f.coordinator({name:'a'},{});assert.equal(f.loads.length,0);assert.equal(f.db.collection('flow_jobs').data[0].data.checkpoint,'opaque-native');assert.equal(f.db.collection('flow_jobs').data[0].data.proxyRetries,7);return metrics;}
 const baseline=await run({}),candidate=await run({idleRefillIntervalMs:10000,reconcileIntervalMs:15000});
 assert.equal(baseline.inventoryQueries,60);assert.equal(candidate.inventoryQueries,6);assert.equal(baseline.roundReconciles,60);assert.equal(candidate.roundReconciles,4);assert.equal(candidate.idleRefillSkips,54);
});
test('new source admits within idle10s and loading recovery always wins over backoff',async()=>{
 let clock=1000;const f=fixture(originIdleSeed(),{idleRefillIntervalMs:10000,reconcileIntervalMs:15000,now:()=>clock}),spec={name:'a'};
 await f.coordinator(spec,{});clock=5000;await f.db.collection('sources').insertOne(source('2'));await f.coordinator(spec,{});assert.equal(f.loads.length,0);
 clock=11000;await f.coordinator(spec,{});assert.equal(f.loads.length,1);assert.deepEqual(f.db.collection('flow_source_rounds').data.at(-1).sourceIds,['2']);
 const g=fixture(originIdleSeed(),{idleRefillIntervalMs:10000,now:()=>clock});await g.coordinator(spec,{});await g.db.collection('sources').insertOne(source('3'));await g.db.collection('flow_source_rounds').insertOne({_id:'recover',queue:'a',state:'loading',sourceIds:['3'],startedAt:new Date(clock)});clock+=1000;await g.coordinator(spec,{});assert.equal(g.loads[0].roundId,'recover');
});
test('native cooldown expiry bounds idle throttle and active sources never receive it',async()=>{
 let clock=1000,queries=0;const f=fixture(originIdleSeed(4000),{idleRefillIntervalMs:10000,now:()=>clock,onMetric:n=>{if(n==='inventoryQueries')queries++;}}),spec={name:'a'};
 await f.coordinator(spec,{});clock=3000;await f.coordinator(spec,{});assert.equal(queries,1);clock=4000;await f.coordinator(spec,{});assert.equal(queries,2);
 const job=f.db.collection('flow_jobs').data[0];job.state='running';delete job.originDeferred;clock=5000;await f.coordinator(spec,{});clock=6000;await f.coordinator(spec,{});assert.equal(queries,4);
 // A fast completion must admit its next round on the next poll.
 job.state='completed';await f.db.collection('flow_source_round_results').insertOne({_id:'ok',roundId:'old',sourceId:'1',outcome:'success'});clock=7000;await f.coordinator(spec,{});assert.equal(f.loads.length,1);
});
test('round reconciliation throttle cannot prevent admission of new sources',async()=>{
 let clock=1000;const f=fixture(originIdleSeed(),{reconcileIntervalMs:15000,now:()=>clock}),spec={name:'a'};await f.coordinator(spec,{});
 const job=f.db.collection('flow_jobs').data[0];job.state='completed';await f.db.collection('flow_source_round_results').insertOne({_id:'ok',roundId:'old',sourceId:'1',outcome:'success'});await f.db.collection('sources').insertOne(source('2'));
 clock=2000;await f.coordinator(spec,{});assert.equal(f.loads.length,1);assert.deepEqual(f.db.collection('flow_source_rounds').data.at(-1).sourceIds,['1','2']);assert.equal(f.db.collection('flow_source_rounds').data[0].state,'running');
 clock=16000;await f.coordinator(spec,{});assert.equal(f.db.collection('flow_source_rounds').data[0].state,'completed');
});

test('thousands of open rounds with pending cursors use one pending-set read and preserve every checkpoint',async()=>{
 const rounds=Array.from({length:2600},(_,i)=>({_id:'round-'+i,queue:'a',state:'running',sourceIds:['source-'+i],startedAt:new Date(0)})),jobs=rounds.map((r,i)=>({_id:'job-'+i,queue:'a',sourceRoundId:r._id,entityKey:'source:source-'+i,state:'queued',proxyDeferred:true,data:{source:{_id:'source-'+i},checkpoint:'exact-'+i,page:12,proxyRetries:19}}));
 const f=fixture({flow_source_rounds:rounds,flow_jobs:jobs});f.counts.set('a',{waiting:2600,active:0,delayed:0});const before=structuredClone(f.db.collection('flow_jobs').data);await f.coordinator({name:'a',kind:'source'},{});
 const collection=f.db.collection('flow_jobs');assert.equal(collection.distinctCalls,1);assert.equal(collection.countFilters.filter(q=>typeof q.sourceRoundId==='string').length,0);assert.deepEqual(collection.data,before);assert(f.db.collection('flow_source_rounds').data.every(r=>r.state==='running'));
});
test('a retry queued after the pending-set snapshot still prevents closing its source round',async()=>{
 const f=fixture({flow_source_rounds:[{_id:'old',queue:'a',state:'running',sourceIds:['1'],startedAt:new Date(0)}],flow_source_round_results:[{_id:'done',roundId:'old',sourceId:'1',outcome:'success'}]});f.counts.set('a',{waiting:1,active:0});const jobs=f.db.collection('flow_jobs'),distinct=jobs.distinct.bind(jobs);jobs.distinct=async(...args)=>{const ids=await distinct(...args);await jobs.insertOne({_id:'retry',queue:'a',sourceRoundId:'old',state:'queued',entityKey:'source:1',data:{checkpoint:'exact',page:7}});return ids;};
 await f.coordinator({name:'a',kind:'source'},{});assert.equal(f.db.collection('flow_source_rounds').data[0].state,'running');assert.equal(jobs.data[0].data.checkpoint,'exact');assert.equal(jobs.countFilters.filter(q=>q.sourceRoundId==='old').length,1);
});
