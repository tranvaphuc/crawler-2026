import test from 'node:test';import assert from 'node:assert/strict';
import {hasNativePublicationTimezone} from '../src/web/newsTimezoneEvidence.mjs';
const doc=(raw,iso)=>({_source:{publishedDate:iso},extracted:{dateEvidence:raw}});
test('epoch, RFC and explicit numeric/named offsets prove the same publication instant',()=>{
 const iso='2026-11-16T01:30:00.000Z';
 for(const raw of ['2026-11-16T08:30:00+07:00','Mon, 16 Nov 2026 01:30:00 GMT',String(Date.parse(iso)/1000),'Thứ hai, 16/11/2026 08:30 GMT+7'])assert(hasNativePublicationTimezone(doc(raw,iso)),raw);
});
test('bare local clocks and mismatched evidence cannot pass the strict timezone gate',()=>{
 for(const raw of ['2026-11-16 08:30:00','16/11/2026 08:30','2026-11-16','2026-11-16T08:30:00Z'])assert.equal(hasNativePublicationTimezone(doc(raw,'2026-11-16T01:30:00.000Z'),{timezone:'Asia/Ho_Chi_Minh'}),false);
});
