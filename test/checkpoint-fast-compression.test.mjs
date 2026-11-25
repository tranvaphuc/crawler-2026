import test from 'node:test';import assert from 'node:assert/strict';import {serialize} from 'node:v8';import {deflateSync} from 'node:zlib';import {encodeBackfillState,decodeBackfillState} from '../src/services/crawlerV8Backfill.js';
test('old and fast checkpoint encodings resume identical large cursors, sets and buffered records',()=>{
 const original={kind:'facebook',nativeCursor:'exact-native-cursor',items:Array.from({length:200},(_,i)=>({id:String(i),text:'native content '.repeat(30)})),seen:new Set(Array.from({length:10000},(_,i)=>String(i))),context:{sourceId:'123'},dateAttempts:new Set(['1']),pending:true};
 const legacy=deflateSync(serialize(original)),fast=encodeBackfillState(original);assert.deepEqual(decodeBackfillState(fast),decodeBackfillState(legacy));
});

test('cached encodings detect in-place row, cursor, Set and Map changes and cannot be poisoned by callers',()=>{
 const state={nativeCursor:'one',items:[{id:'1',text:'first'}],seen:new Set(['1']),expectedReplies:new Map([['1',1]])};
 encodeBackfillState(state);const cached=encodeBackfillState(state);cached.fill(0);
 assert.equal(decodeBackfillState(encodeBackfillState(state)).nativeCursor,'one');
 state.items[0].text='changed';state.seen.add('2');state.expectedReplies.set('1',2);state.nativeCursor='two';const after=decodeBackfillState(encodeBackfillState(state));assert.equal(after.items[0].text,'changed');assert.ok(after.seen.has('2'));assert.equal(after.expectedReplies.get('1'),2);assert.equal(after.nativeCursor,'two');
});
