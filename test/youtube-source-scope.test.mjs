import test from'node:test';import assert from'node:assert/strict';
import{normalizeContentInput,extractContentSnapshot}from'../src/services/socialContent.js';
import{youtubeHttpUi,createSocialHttpContentReader}from'../src/services/socialHttpReaders.js';
import{READ_STATE}from'../src/services/socialReadState.js';
import{packState,unpackState}from'../src/services/crawlerQueueFlow.js';
const native='UCsample',grid='owned-native-grid-uuid',url='https://www.youtube.com/@sample',video=id=>({videoRenderer:{videoId:id,title:{simpleText:id},publishDate:'2026-10-24T10:00:00Z'}}),token={continuationItemRenderer:{continuationEndpoint:{continuationCommand:{token:'PAGE2'}}}};
const initial={metadata:{channelMetadataRenderer:{externalId:native,title:'Sample',ownerUrls:[url]}},contents:{twoColumnBrowseResultsRenderer:{tabs:[{tabRenderer:{selected:true,title:'Videos',content:{richGridRenderer:{targetId:grid,header:{chipCloudChipRenderer:{text:{simpleText:'Latest'},isSelected:true}},contents:[video('abcdefghijk'),token]}}}}]}}};
const html='<script>ytcfg.set('+JSON.stringify({INNERTUBE_CONTEXT:{client:{clientName:'WEB'}}})+');var ytInitialData = '+JSON.stringify(initial)+';</script>',target=normalizeContentInput('source',{url,reference:{id:native},limit:1}),snap={html,httpStatus:200,finalUrl:target.url};
const action=id=>({onResponseReceivedActions:[{appendContinuationItemsAction:{targetId:id,continuationItems:[video('lmnopqrstuv')]}}]});
test('continuation binding comes only from the selected native Videos grid and survives checkpointing',()=>{
 const ui=youtubeHttpUi(target,snap);assert.deepEqual(ui.sourceContinuationTarget,{sourceId:native,targetId:grid});assert.deepEqual(unpackState(packState({ui})).ui.sourceContinuationTarget,ui.sourceContinuationTarget);
 assert.equal(youtubeHttpUi({...target,expectedNativeId:'UCforeign'},snap).sourceContinuationTarget,undefined);
 const foreign={...initial,contents:{twoColumnBrowseResultsRenderer:{tabs:[{tabRenderer:{selected:false,title:'Videos',content:{richGridRenderer:{targetId:'foreign'}}}},{tabRenderer:{selected:true,title:'About',content:{richGridRenderer:{targetId:'not-video-feed'}}}}]}}};
 assert.equal(youtubeHttpUi(target,{...snap,html:'var ytInitialData = '+JSON.stringify(foreign)}).sourceContinuationTarget,undefined);
});
test('opaque native target accepts its own video page and rejects another grid including generic prefixes',()=>{
 const ui=youtubeHttpUi(target,snap);for(const id of [grid,'foreign-grid','rich-grid-foreign']){const result=extractContentSnapshot(target,{...snap,jsonResponses:[JSON.stringify(action(id))]},ui);if(id===grid)assert.deepEqual(result.items.map(x=>x.id),['abcdefghijk','lmnopqrstuv']);else{assert.equal(result.reason,'YOUTUBE_SOURCE_CONTINUATION_TARGET_UNVERIFIED');assert.equal(result.status,'error');assert.equal(result.pagination.hasMore,true);assert.equal(result.pagination.complete,false);assert.deepEqual(result.items,[]);}}
});
test('unknown continuation never becomes empty/end; exact pending cursor resumes after a matching response',async()=>{
 let wrong=true,calls=0;const proxy={protocol:'http',host:'127.0.0.1',port:8080},read=createSocialHttpContentReader({getProxy:async()=>proxy,makeSession:()=>({requests:0,async request(_url,opts){calls++;this.requests++;return{httpStatus:200,finalUrl:target.url,html:opts?JSON.stringify(action(wrong?'foreign-grid':grid)):html};},close(){}})});
 const first=await read(target);assert.equal(first.items[0].id,'abcdefghijk');const state=first[READ_STATE];assert.equal(state.ui.sourceContinuationTarget.targetId,grid);
 const failed=await read(Object.defineProperty({...target},READ_STATE,{value:state}));assert.equal(failed.reason,'YOUTUBE_SOURCE_CONTINUATION_TARGET_UNVERIFIED');assert.equal(failed[READ_STATE].queue[0].token,'PAGE2');assert.equal(failed[READ_STATE].visited.has('PAGE2'),false);
 wrong=false;const recovered=await read(Object.defineProperty({...target},READ_STATE,{value:failed[READ_STATE]}));assert.equal(recovered.items[0].id,'lmnopqrstuv');assert.equal(recovered.coverage.exhausted,true);assert.equal(calls,3);
});
