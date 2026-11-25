import test from 'node:test';import assert from 'node:assert/strict';
import {RECENT_SOURCE_POLICY,RECENT_SOURCE_REQUEUE_STATES,RECENT_SOURCE_ACCESS_REQUEUE_LIMIT,recentSourceAdmissionFilter,recentSourceWindow,jobWindow,recentPassOutcome} from '../src/services/crawlerV8Recent3d.js';
import {sourceWindowBoundary} from '../src/services/sourceWindowBoundary.js';
import {ownParentReady,ownCandidate} from '../src/services/crawlerV8IndependentIngest.js';

test('rolling source window is fixed at claim for exactly 72 hours',()=>{
 const at=new Date('2026-10-27T00:00:00.000Z'),window=recentSourceWindow(at);
 assert.deepEqual(window,{since:'2026-10-24T00:00:00.000Z',until:'2026-10-27T00:00:00.000Z'});
 assert.deepEqual(jobWindow({crawlMode:RECENT_SOURCE_POLICY,windowSince:window.since,windowUntil:window.until},{since:'2026-10-01',until:'2026-10-25'}),window);
});
test('rolling source gets a later pass after public access failure, bounded at 50 consecutive stops',()=>{
 assert.deepEqual(RECENT_SOURCE_REQUEUE_STATES,['done','partial_public','skipped_access_required']);
 assert.equal(RECENT_SOURCE_ACCESS_REQUEUE_LIMIT,50);
 assert.equal(RECENT_SOURCE_REQUEUE_STATES.includes('skipped_retry_exhausted'),false);
});

test('historical retry-50 source frees the old job and enters the separate rolling queue',()=>{
 const filter=recentSourceAdmissionFilter('run','since','until');
 assert.deepEqual(filter.$or[1],{state:'skipped_retry_exhausted',proxyRetryCount:{$gte:50},retryLimit:50});
 assert.equal(filter.$or[0].windowCovered,true);
 assert.equal(filter.crawlMode.$exists,false);
});

test('a pinned old post never supplies the three-day stop boundary',()=>{
 const since='2026-10-24T00:00:00.000Z';
 const first={identityVerified:true,items:[{id:'pinned',pinned:true,createdAt:'2026-10-01T00:00:00.000Z'},{id:'new',pinned:false,pinEvidence:'native_pin_false',createdAt:'2026-10-26T00:00:00.000Z'}]};
 assert.equal(sourceWindowBoundary(first,{since}),null);
 const next={...first,items:[...first.items,{id:'old',pinned:false,pinEvidence:'native_pin_false',createdAt:'2026-10-23T23:59:59.000Z'}]};
 assert.equal(sourceWindowBoundary(next,{since}).postId,'old');
 const pass=recentPassOutcome({boundary:sourceWindowBoundary(next,{since}),result:{pagination:{hasMore:true}},startedAt:'2026-10-27T00:00:00.000Z',now:'2026-10-27T00:00:05.000Z'});
 assert.equal(pass.collectionComplete,true);assert.equal(pass.durationMs,5000);
});

test('recent comment parent validates against its own window instead of the old backfill cutoff',()=>{
 const source={_id:'facebook:page:61566087015185',platform:'facebook',type:'page',nativeId:'61566087015185'};
 const raw={id:'61566087015185_122104480808536233',postId:'122104480808536233',sourceId:source.nativeId,createdAt:'2026-10-26T12:00:00.000Z',author:{id:source.nativeId}};
 const parent={kind:'post',sourceId:source._id,raw,document:{_type:'fbPageTopic'}};
 const job={sourceId:source._id,parent:{systemId:raw.id,nativeId:raw.postId},windowSince:'2026-10-26T00:00:00.000Z',windowUntil:'2026-10-27T00:00:00.000Z'};
 assert.equal(ownParentReady(job,parent,source,{since:'2026-10-01T00:00:00.000Z',until:'2026-10-25T00:00:00.000Z'}),true);
});

test('writer accepts a recent post beyond the historical backfill cutoff using its stored window',()=>{
 const source={_id:'youtube:channel:UC123',platform:'youtube',type:'channel',nativeId:'UC123'};
 const raw={id:'abcdefghijk',createdAt:'2026-10-26T12:00:00.000Z',author:{id:'UC123'}};
 const record={kind:'post',sourceId:source._id,raw,platform:'youtube',windowSince:'2026-10-24T00:00:00.000Z',windowUntil:'2026-10-27T00:00:00.000Z',document:{_id:raw.id,_type:'youtubeTopic'}};
 const context={since:'2026-10-01T00:00:00.000Z',until:'2026-10-25T00:00:00.000Z'};
 assert.equal(ownCandidate(record,source,null,context)._id,raw.id);
 assert.throws(()=>ownCandidate({...record,windowSince:null,windowUntil:null},source,null,context),{code:'OUTSIDE_CRAWL_WINDOW'});
});
