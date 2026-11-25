import test from 'node:test';import assert from 'node:assert/strict';
import{metaPost}from'../src/services/socialContent.js';
import{youtubeSourcePublication,applySourcePublicationText}from'../src/services/socialPublicationTime.js';
import{createSocialHttpContentReader}from'../src/services/socialHttpReaders.js';
import{normalizeContentInput}from'../src/services/socialContent.js';
import{READ_STATE}from'../src/services/socialReadState.js';
import{packState,unpackState}from'../src/services/crawlerQueueFlow.js';
test('Meta gated projection cannot erase an exact timestamp already present on the bound media',()=>{
 const post={pk:'9',code:'abc',taken_at:1790571554,user:{pk:'1',username:'sample'},if_not_gated_logged_out:{taken_at:null}};
 const item=metaPost(post,'instagram');assert.equal(item.createdAt,'2026-09-28T04:59:14.000Z');assert.equal(item.dateEvidence,'native_media.taken_at');
 assert.equal(metaPost({...post,taken_at:null,caption:{created_at:1790571554}},'instagram').createdAt,null);
});
test('YouTube source native dates preserve timestamp precision and accept day-only fields',()=>{
 assert.equal(youtubeSourcePublication({publishDate:'2026-10-28'}).datePrecision,'day');
 assert.equal(youtubeSourcePublication({publishDate:'2026-10-28',uploadDate:'2026-10-28T09:00:00Z'}).createdAt,'2026-10-28T09:00:00.000Z');
});
test('a source label estimate is anchored once and never replaces an existing date',()=>{
 const item={publishedText:'2 hours ago'};applySourcePublicationText(item,'2026-10-29T08:00:00Z');assert.equal(item.createdAt,'2026-10-29T06:00:00.000Z');assert.equal(item.dateIsEstimated,true);
 applySourcePublicationText(item,'2026-10-29T10:00:00Z');assert.equal(item.createdAt,'2026-10-29T06:00:00.000Z');assert.equal(item.dateObservedAt,'2026-10-29T08:00:00.000Z');
});
test('YouTube consumes source publication text with zero detail requests, including checkpoint resume',async()=>{
 for(const label of ['Streamed live 2 hours ago','Oct 28, 2026','2026-10-28']){
 let requests=0,acquired=0;const item={id:'abcdefghijk',platform:'youtube',url:'https://www.youtube.com/watch?v=abcdefghijk',createdAt:null,publishedText:label,type:'post'};
 const state={kind:'youtube',items:[item],offset:0,collecting:false,streamMore:false,dateAttempts:new Set(),dateObservedAt:'2026-10-29T08:00:00Z',base:{status:'partial',identityVerified:true,pagination:{hasMore:false}},queue:[],seenIds:new Set([item.id])};
 const read=createSocialHttpContentReader({requireSourcePublicationTime:true,nativeSourcePages:true,respectPlatformCooldown:false,getProxy:async()=>{acquired++;return{server:'http://unused:8080'};},makeSession:()=>({close(){},async request(){requests++;assert.fail('source date is already available');}})});
 const r=await read({...normalizeContentInput('source',{url:'https://www.youtube.com/@sample',limit:100}),[READ_STATE]:unpackState(packState(state))});assert.equal(r.items.length,1);assert.ok(r.items[0].createdAt);assert.equal(requests,0);assert.equal(acquired,0);
 }
});
test('Instagram native feed emits its timestamp without requesting per-post details',async()=>{
 const {createMetaSourceHttpReader}=await import('../src/services/metaSourceHttp.js');const url='https://www.instagram.com/sample/';let requests=0;
 const html='<script type="application/json">'+JSON.stringify({query:{queryID:'123',queryName:'PolarisProfilePostsQuery',variables:{username:'sample'}},data:{xdt_api__v1__feed__user_timeline_graphql_connection:{edges:[{node:{pk:'1',code:'POST1',user:{pk:'9',username:'sample'},taken_at:1790571554,if_not_gated_logged_out:{taken_at:null}}}],page_info:{has_next_page:false,end_cursor:null}}}})+'</script>';
 const read=createMetaSourceHttpReader({nativeSourcePages:true,streamSourceItems:true,respectPlatformCooldown:false,getProxy:async()=>({server:'http://unused:8080'}),makeSession:()=>({requests:0,close(){},async request(u){requests++;assert.equal(u,url,'no post request when feed already has date');return {httpStatus:200,finalUrl:u,html};}})});
 const r=await read(normalizeContentInput('source',{url,reference:{id:'9'},limit:100}));assert.equal(r.status,'ok');assert.equal(r.items[0].createdAt,'2026-09-28T04:59:14.000Z');assert.equal(requests,1);
});
