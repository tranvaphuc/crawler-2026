import test from 'node:test';import assert from 'node:assert/strict';import {createFacebookContentHttpReader} from '../src/services/facebookContentHttp.js';import {facebookCommentCoverage} from '../src/services/facebookCommentCoverage.js';import {normalizeContentInput} from '../src/services/socialContent.js';import {READ_STATE} from '../src/services/socialReadState.js';import {encodeBackfillState,decodeBackfillState,backfillOutcome} from '../src/services/crawlerV8Backfill.js';
const target=()=>normalizeContentInput('comments',{url:'https://www.facebook.com/123_100',includeReplies:true,count:'all',limit:1});
const comment=(id,repliesCount=0)=>({_id:id,authorId:'123',author:'Actor',content:'fixture',time:'2026-10-25T10:00:00Z',repliesCount});
function reader(fetch,extra={}){return createFacebookContentHttpReader({getProxy:async()=>({server:'http://proxy.test:80'}),makeSession:()=>({requests:0,close(){},setDeadline(){}}),createCommentFetcher:()=>fetch,maxPages:1,streamComments:true,...extra});}
const page=(comments,totalCount,extra={})=>({comments,totalCount,hasNextPage:false,cursor:null,ordering:{unfilteredVerified:true},...extra});
test('traverses nested replies and verifies root totals using all descendants across persisted pages',async()=>{
 const calls=[],read=reader(async j=>{calls.push(j.idGetComment);if(j.idGetComment==='100')return page([comment('1',3)],4);if(j.idGetComment==='1')return page([comment('2',2)],null);if(j.idGetComment==='2')return page([comment('3'),comment('4')],null);assert.fail(JSON.stringify(j));}),t={...target(),limit:100};
 let state,last,items=[];for(let n=0;n<8;n++){last=await read(state?Object.defineProperty({...t},READ_STATE,{value:state}):t);items.push(...(last.items||[]));state=last[READ_STATE];if(!state)break;state=decodeBackfillState(encodeBackfillState(state));}
 assert.deepEqual(calls,['100','1','2']);assert.deepEqual(items.map(x=>[x.id,x.parentId]),[['1',null],['2','1'],['3','2'],['4','2']]);assert.equal(last.coverage.observedReplies,3);assert.equal(last.coverage.missingRepliesAtLeast,0);assert.equal(last.coverage.replyCountMismatch,false);assert.equal(last.coverage.complete,true);
});

test('infers group comment context from the verified group URL when callers omit sourceType',async()=>{
 let observed;const read=reader(async job=>{observed=job.sourceType;return page([],0);}),t=normalizeContentInput('comments',{url:'https://www.facebook.com/groups/123/posts/100/',includeReplies:true});await read(t);assert.equal(observed,'group');
});
