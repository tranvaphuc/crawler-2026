import test from 'node:test';
import assert from 'node:assert/strict';
import {createSourceLatestPostObserver} from '../src/services/sourceLatestPostObserver.js';
const item=time=>({id:'post',url:'https://example.test/post',createdAt:time});
test('replayed posts below the saved watermark avoid writes without modifying import items or source snapshots',async()=>{
 const updates=[],source={_id:'source',latestPostAt:'2026-11-15T10:00:00.000Z'},original=structuredClone(source),post=item('2026-11-14T00:00:00Z');
 const observe=createSourceLatestPostObserver({sources:{updateOne:async(...args)=>updates.push(args)}});
 for(let i=0;i<100;i++)assert.equal(await observe({source,sourceId:'source',item:post}),false);
 assert.equal(updates.length,0);assert.deepEqual(source,original);assert.deepEqual(post,item('2026-11-14T00:00:00Z'));
});
test('a newer native post advances monotonically once, retains its ID and URL and is retried after a failed write',async()=>{
 const updates=[],source={_id:'source'},at=new Date('2026-11-15T12:00:00Z');let fail=true;
 const observe=createSourceLatestPostObserver({sources:{async updateOne(...args){updates.push(args);if(fail){fail=false;throw Error('write failed')}}},now:()=>at});
 const args={source,sourceId:'source',item:item('2026-11-15T11:00:00Z'),nativeId:'native'};
 await assert.rejects(observe(args),/write failed/);assert.equal(await observe(args),true);assert.equal(await observe(args),false);
 assert.deepEqual(updates[1][1].$set,{latestPostAt:'2026-11-15T11:00:00.000Z',latestPostId:'native',latestPostUrl:args.item.url,latestPostObservedAt:at});
 const next={...args,item:item('2026-11-15T11:01:00Z')};assert.equal(await observe(next),true);assert.equal(updates.length,3);
});
test('discovered author snapshots cannot suppress the inventory source watermark and invalid dates do not write',async()=>{
 const updates=[],source={_id:'author',latestPostAt:'2026-11-15T23:00:00Z'},observe=createSourceLatestPostObserver({sources:{async updateOne(...args){updates.push(args)}}});
 assert.equal(await observe({source,sourceId:'group',item:item('2026-11-15T10:00:00Z')}),true);assert.equal(updates[0][0]._id,'group');
 assert.equal(await observe({source,sourceId:'group',item:item('invalid')}),false);
});
