import test from 'node:test';import assert from 'node:assert/strict';
import {provenLegacyMinuteMatch,selectOriginalTopicCandidate} from '../src/forumFlow/legacyOriginalClock.mjs';
import {ForumState} from '../src/forumFlow/state.mjs';import {ForumBulkEs5Sink} from '../src/forumFlow/bulkEs5.mjs';
const site={domain:'f.test',adapter:'xenforo',allowedHosts:['f.test'],legacy:{commentProcessor:{created_time:{attribute:'datetime',format:'DD/MM/YYYY HH:mm'}}}};
const doc={_type:'forumTopic',_index:'master202647',_id:'a'.repeat(32),_source:{siteName:'f.test',url:'https://f.test/threads/new.100',publishedDate:'2026-11-17T03:00:05.000Z'}};
const proof={time:{raw:'2026-11-17T10:00:05+07:00',kind:'iso',precision:'second',publishedDate:doc._source.publishedDate}};
const hit={...doc,_id:'b'.repeat(32),_source:{...doc._source,url:'https://f.test/threads/old.100',publishedDate:'2026-11-17T03:00:00.000Z'}};

test('explicit legacy minute format accepts only proven second truncation',()=>{
 assert.equal(provenLegacyMinuteMatch(hit,doc,proof,site),true);
 for(const invalid of [
  {...site,adapter:'wordpress'},
  {...site,legacy:{}},
  {...site,legacy:{commentProcessor:{created_time:{attribute:'datetime',format:'DD/MM/YYYY HH:mm:ss'}}}},
  {...site,legacy:{commentProcessor:{created_time:{attribute:'data-time',format:'DD/MM/YYYY HH:mm'}}}}
 ])assert.equal(provenLegacyMinuteMatch(hit,doc,proof,invalid),false);
 for(const date of ['2026-11-17T10:00:00Z','2026-11-17T03:01:00Z','2026-11-17T03:00:01Z'])assert.equal(provenLegacyMinuteMatch({...hit,_source:{...hit._source,publishedDate:date}},doc,proof,site),false);
 assert.equal(provenLegacyMinuteMatch(hit,doc,{time:{...proof.time,raw:'Today 10:00'}},site),false);
 assert.equal(provenLegacyMinuteMatch(hit,doc,{time:{...proof.time,publishedDate:'2026-11-17T03:01:00Z'}},site),false);
});

test('page-head pseudo-topics cannot displace the unique original root',()=>{
 const page={...hit,_id:'c'.repeat(32),_source:{...hit._source,url:hit._source.url+'/page-2'}};
 for(const hits of [[page,hit],[hit,page]])assert.equal(selectOriginalTopicCandidate(hits,doc,proof,site),hit);
 assert.equal(selectOriginalTopicCandidate([page],doc,proof,site),null);
 const other={...hit,_id:'d'.repeat(32),_source:{...hit._source,url:'https://f.test/threads/another.100'}};
 assert.equal(selectOriginalTopicCandidate([hit,other],doc,proof,site),null);
});

test('bulk reconciliation reuses a verified legacy original and keeps strict race detection',async()=>{
 const state=await ForumState.open(':memory:');try{
  const page={...hit,_id:'c'.repeat(32),_source:{...hit._source,url:hit._source.url+'/page-2'}};
  const es={search:async()=>({hits:{total:2,hits:[page,hit]},_shards:{failed:0}})};
  const sink=new ForumBulkEs5Sink({es,state,sites:[site]}),items=[{row:{site:site.domain,native_id:'1'},doc,proof}];
  assert.equal((await sink.lookupBatch(items)).get('f.test|1').hit,hit);
  sink.verifyExisting(hit,doc,proof);
  assert.equal((await sink.lookupBatch(items,{allowOriginalSelection:false})).get('f.test|1').reason,'FORUM_EXISTING_DUPLICATE_IDENTITIES');
  assert.equal(state.db.prepare('SELECT count(*) n FROM forum_es_bindings').get().n,0);
 }finally{state.close();}
});

test('legacy precision never bypasses a comment parent mismatch',async()=>{
 const state=await ForumState.open(':memory:');try{
  const sink=new ForumBulkEs5Sink({es:{},state,sites:[site]});
  const child={...doc,_type:'forumComment',_source:{...doc._source,parentId:'correct',parentDate:doc._source.publishedDate}};
  const old={...hit,_type:'forumComment',_source:{...hit._source,parentId:'wrong',parentDate:doc._source.publishedDate}};
  assert.throws(()=>sink.verifyExisting(old,child,proof),/FORUM_EXISTING_PARENT_DIFFERS/);
 }finally{state.close();}
});
