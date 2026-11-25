import test from 'node:test';import assert from 'node:assert/strict';
import {continuousWorkerBudget,recentCommentWatch} from '../src/services/crawlerV8ContinuousFlow.js';

test('source and comment queues share 400 slots and lend idle capacity in either direction',()=>{
 assert.deepEqual(continuousWorkerBudget({total:400,sourceDemand:500,commentDemand:500}),{source:200,comments:200,total:400});
 assert.deepEqual(continuousWorkerBudget({total:400,sourceDemand:30,commentDemand:500}),{source:30,comments:370,total:400});
 assert.deepEqual(continuousWorkerBudget({total:400,sourceDemand:500,commentDemand:20}),{source:380,comments:20,total:400});
 assert.deepEqual(continuousWorkerBudget({total:400,sourceDemand:20,commentDemand:10}),{source:20,comments:10,total:30});
});
test('recent comment watch fetches only when count rises or the last verified count is behind',()=>{
 const at=new Date('2026-10-27T00:00:00Z'),job={createdAt:new Date('2026-10-26T23:00:00Z'),lastCountIncreaseAt:new Date('2026-10-26T23:00:00Z'),maxObservedCommentCount:4,lastVerifiedCommentCount:4};
 assert.deepEqual(recentCommentWatch(job,4,at),{action:'idle'});
 assert.deepEqual(recentCommentWatch(job,5,at),{action:'fetch',increased:true});
 assert.deepEqual(recentCommentWatch({...job,maxObservedCommentCount:5},5,at),{action:'fetch',increased:false});
});
test('recent comment watch retires after 12 hours quiet or 24 hours from last comment',()=>{
 const at=new Date('2026-10-27T00:00:00Z'),job={createdAt:new Date('2026-10-26T00:00:00Z'),lastCountIncreaseAt:new Date('2026-10-26T11:59:59Z'),maxObservedCommentCount:4,lastVerifiedCommentCount:4};
 assert.equal(recentCommentWatch(job,4,at).reason,'NO_COMMENT_COUNT_INCREASE_12H');
 assert.equal(recentCommentWatch({...job,lastCountIncreaseAt:new Date('2026-10-26T23:00:00Z'),lastCommentPublishedAt:'2026-10-25T23:59:59Z'},4,at).reason,'LAST_COMMENT_OLDER_THAN_24H');
 assert.equal(recentCommentWatch({...job,watchRetiredAt:new Date()},5,at).action,'retired');
});
