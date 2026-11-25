import test from 'node:test';
import assert from 'node:assert/strict';
import {crawlerV8BullJobId,crawlerV8BullJobData,crawlerV8ChannelQuery,seedCrawlerV8BullQueue,claimCrawlerV8BullJob,CRAWLER_V8_CHANNELS} from '../src/services/crawlerV8BullQueue.js';

test('Bull ticket is stable for one runnable generation and changes after a retry',()=>{
 const base={_id:'october-2026-v8:source:facebook:page:123',kind:'source',platform:'facebook',sourceId:'facebook:page:123',state:'pending',nextAt:new Date('2026-10-27T01:00:00Z'),attempts:0};
 assert.equal(crawlerV8BullJobId(base),crawlerV8BullJobId({...base}));
 assert.notEqual(crawlerV8BullJobId(base),crawlerV8BullJobId({...base,attempts:1}));
 assert.equal(crawlerV8BullJobData(base).sourceId,'facebook:page:123');
 assert.equal(CRAWLER_V8_CHANNELS.length,12);
 assert.equal(crawlerV8ChannelQuery('r',{kind:'source',platform:'facebook',sourceId:/^facebook:page:/}).sourceId.test('facebook:user:1'),false);
});

test('feeder interleaves channels and never offers more than queue capacity',async()=>{
 const calls=[];
 const collection={find(query){return {sort(){return this},limit(){return this},async toArray(){return [{_id:`${query.platform}:${query.kind}`,sourceId:`${query.platform}:1`,platform:query.platform,kind:query.kind,state:'pending',nextAt:new Date('2026-10-27T01:00:00Z'),attempts:0}];}}}};
 const queue={async getJobCounts(){return{waiting:0,delayed:0,paused:0}},async addBulk(rows){calls.push(...rows)}};
 const result=await seedCrawlerV8BullQueue({collection,queue,runId:'r',maxWaiting:5});
 assert.equal(result.offered,5);
 assert.equal(calls.length,5);
 assert.equal(new Set(calls.map(x=>x.name)).size,5);
 assert.ok(calls.every(x=>!x.data.parent&&!x.data.raw&&!x.data.proxy));
});

test('Bull processor can claim a due Mongo job once with a fenced lease',async()=>{
 let calls=0;
 const collection={async findOneAndUpdate(query,update){calls++;assert.deepEqual(query.state,{$in:['pending','retry','partial']});assert.equal(update.$set.state,'running');assert.equal(update.$inc.attempts,1);return{_id:query._id,leaseToken:update.$set.leaseToken}}};
 const claimed=await claimCrawlerV8BullJob(collection,{mongoJobId:'job-1',kind:'source',platform:'youtube'},{runId:'r',shardIndex:1,ownerToken:'owner'});
 assert.equal(calls,1);assert.equal(claimed._id,'job-1');assert.ok(claimed.leaseToken);
});
