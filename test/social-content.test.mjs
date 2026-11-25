import { test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import express from 'express';
import { normalizeContentInput as input, extractContentSnapshot as extract } from '../src/services/socialContent.js';
import { createContentCursorStore, createSocialContentRouter } from '../src/routes/socialContent.js';
const snap = data => ({ html:`<script type="application/json">${JSON.stringify(data)}</script>`,jsonResponses:[],httpStatus:200 });
const p = (code,user='example',extra={}) => ({pk:'id-'+code,code,user:{pk:'author',username:user,full_name:'Example'},caption:{text:'post '+code},taken_at:1700000000,...extra});
const thSource=()=>input('source',{url:'https://www.threads.com/@example'});
const igPost='https://www.instagram.com/p/ABC123/';

test('source normalization accepts only profiles/channels and rejects SSRF/post URLs',()=>{
 assert.equal(thSource().platform,'threads');assert.equal(input('source',{url:'https://www.instagram.com/example/'}).username,'example');
 assert.match(input('source',{url:'https://www.youtube.com/@example'}).url,/\/videos\?hl=en$/);
 for(const url of ['http://localhost','https://youtube.com.evil.test/@x','https://www.youtube.com/watch?v=abcdefghijk','https://www.instagram.com/p/ABC/','https://u:p@www.threads.com/@x'])assert.throws(()=>input('source',{url}));
 assert.throws(()=>input('source',{link:'https://www.threads.com/@a',url:'https://www.threads.com/@b'}));
});
test('comment limits and search inputs are bounded',()=>{
 assert.equal(input('comments',{url:igPost}).includeReplies,true);
 for(const b of [{platform:'instagram',keyword:'x'},{platform:'threads',keyword:''},{platform:'youtube',keyword:'x',limit:20001}])assert.throws(()=>input('search',b));
 assert.throws(()=>input('comments',{url:igPost,limit:20001}));assert.throws(()=>input('comments',{url:igPost,includeReplies:'false'}));
});
test('search count and native YouTube upload dates are independently normalized',()=>{
 const th=input('search',{platform:'threads',keyword:'sample',count:75,limit:25});assert.equal(th.limit,25);assert.equal(th.requestedCount,75);
 assert.equal(input('search',{platform:'threads',keyword:'sample',count:75}).limit,75);assert.equal(input('search',{platform:'youtube',keyword:'sample',count:500}).limit,100);
 for(const [uploadDate,value]of [['today',2],['week',3],['month',4],['year',5]]){const y=input('search',{platform:'youtube',keyword:'thaco',count:60,limit:30,uploadDate});const sp=decodeURIComponent(new URL(y.url).searchParams.get('sp'));assert.deepEqual([...Buffer.from(sp,'base64')],[18,2,8,value]);assert.equal(y.order,'relevance');assert.equal(y.requestedCount,60);}
 assert.equal(input('search',{platform:'youtube',keyword:'x',limit:150}).requestedCount,150);
 assert.throws(()=>input('search',{platform:'youtube',keyword:'x',uploadDate:'tomorrow'}));assert.throws(()=>input('search',{platform:'threads',keyword:'x',uploadDate:'today'}));
});
test('a search cursor cannot be reused with another upload date or requested count',()=>{
 const store=createContentCursorStore(),a=input('search',{platform:'youtube',keyword:'thaco',uploadDate:'today',count:60,limit:20}),token=store.issue(a,[],{items:[]});
 assert.throws(()=>store.restore({...a,cursor:token,uploadDate:'week'}));assert.throws(()=>store.restore({...a,cursor:token,requestedCount:61}));
});
test('YouTube upload filter must be confirmed in the native response',()=>{
 const t=input('search',{platform:'youtube',keyword:'thaco',uploadDate:'today',count:60}),data={contents:{twoColumnSearchResultsRenderer:{primaryContents:{videoRenderer:{videoId:'abcdefghijk',title:{simpleText:'thaco'}}}}}};
 const a=extract(t,{...snap(data),finalUrl:t.url},{searchKeyword:'thaco',uploadDateVerified:false});assert.equal(a.reason,'UPLOAD_DATE_FILTER_UNVERIFIED');assert.equal(a.count,0);
 const b=extract(t,{...snap(data),finalUrl:t.url},{searchKeyword:'thaco',uploadDateVerified:true,uploadDateEvidence:'native_Today_selected'});assert.equal(b.count,1);assert.equal(b.searchFilters.verified,true);
});
test('search count stops on the requested total without claiming the upstream is exhausted',async()=>{
 const {createResultBounder}=await import('../src/services/socialResultBounds.js'),{READ_STATE,attachReadState}=await import('../src/services/socialReadState.js');let seq=0;const state={};const read=createResultBounder(async()=>attachReadState({status:'partial',items:Array.from({length:3},()=>({id:String(++seq),type:'post'})),count:3,pagination:{hasMore:true,complete:false}},state));const t=input('search',{platform:'threads',keyword:'x',count:5,limit:3});const first=await read(t);assert.equal(first.count,3);const second=await read(Object.defineProperty({...t},READ_STATE,{value:state}));assert.equal(second.count,2);assert.equal(second.limits.totalReturned,5);assert.equal(second.pagination.reason,'REQUESTED_COUNT_REACHED');assert.equal(second.pagination.complete,false);
});
test('Threads source binds exact author and excludes related posts and carousel children',()=>{
 const a=p('A'),b=p('B','someone'),r=extract(thSource(),snap({data:{mediaData:{edges:[{node:{thread_items:[{post:a}]}},{node:{thread_items:[{post:b}]}}],page_info:{has_next_page:true}},relatedPosts:{thread_items:[{post:p('C')}]}}}));
 assert.deepEqual(r.items.map(x=>x.shortcode),['A']);assert.equal(r.source.id,'author');assert.equal(r.identityVerified,true);assert.equal(r.pagination.hasMore,true);
 assert.equal(r.items[0].createdAt,'2023-11-14T22:13:20.000Z');
});
test('Instagram source only reads timeline connection and deduplicates stable IDs',()=>{
 const t=input('source',{url:'https://www.instagram.com/example/'}),item=p('ABC');
 const r=extract(t,snap({data:{xig_user_by_username:{polaris_ordered_timeline_connection:{edges:[{node:item},{node:item}],page_info:{has_next_page:false}}},recommended:[p('BAD')]}}));
 assert.equal(r.count,1);assert.equal(r.items[0].shortcode,'ABC');assert.equal(r.pagination.complete,false);
});
test('Instagram comments bind media identity, preserve replies, and do not count missing as zero',()=>{
 const t=input('comments',{url:igPost}),comment={pk:'c1',text:'root',user:{username:'a'},created_at:1700000000,child_comment_count:1,edge_threaded_comments:{edges:[{node:{pk:'c2',text:'child'}}]}};
 const r=extract(t,snap({data:{xig_polaris_media:{code:'ABC123',comments_connection:{edges:[{node:comment}],page_info:{has_next_page:false}}},other:{code:'OTHER',comments_connection:{edges:[{node:{pk:'bad',text:'bad'}}]}}}}));
 assert.equal(r.rootComments,1);assert.equal(r.replies,1);assert.equal(r.items[1].parentId,'c1');assert.equal(r.items[0].likes,null);
 const roots=extract({...t,includeReplies:false},snap({data:{xig_polaris_media:{code:'ABC123',comments_connection:{edges:[{node:comment}]}}}}));assert.equal(roots.count,1);
});
test('Threads comments read bound direct-reply fragments, preserve chains and exclude ancestors/recommendations',()=>{
 const t=input('comments',{url:'https://www.threads.com/@example/post/ROOT'}),root=p('ROOT');
 const fragment={id:root.id || root.pk,text_post_app_info:{direct_replies:{edges:[{node:{posts:{edges:[{node:p('CHILD')},{node:p('REPLY')}]}}}],page_info:{has_next_page:false}},containing_thread:{posts:{edges:[{node:p('ANCESTOR')}]}}}};
 const r=extract(t,snap([{data:{media:root}},{data:{media:fragment,relatedPosts:{thread_items:[{post:p('BAD')}]}}}]));
 assert.deepEqual(r.items.map(x=>x.shortcode),['CHILD','REPLY']);assert.equal(r.rootComments,1);assert.equal(r.replies,1);assert.equal(r.items[1].parentId,'id-CHILD');
});
test('search refuses relevance fallback and emits twenty-bound results only with server recent evidence',()=>{
 const t=input('search',{platform:'threads',keyword:'test'}),data={query:'test',recent:true,data:{searchResults:{edges:[{node:{thread:{thread_items:[{post:p('A')},{post:p('QUOTED')}]}}}],page_info:{has_next_page:false}}}};
 const r=extract(t,snap(data));assert.equal(r.ordering.verified,true);assert.deepEqual(r.items.map(x=>x.shortcode),['A']);
 const bad=extract(t,snap({...data,recent:false}));assert.equal(bad.status,'sort_unavailable');assert.equal(bad.count,0);
});
test('YouTube source ignores suggested/shelf videos and requires matched channel evidence',()=>{
 const t=input('source',{url:'https://www.youtube.com/@sample'}),data={contents:{twoColumnBrowseResultsRenderer:{tabs:[{tabRenderer:{selected:true,title:'Videos',content:{richGridRenderer:{contents:[{videoRenderer:{videoId:'abcdefghijk',title:{simpleText:'Good'}}},{richShelfRenderer:{videoRenderer:{videoId:'xxxxxxxxxxx'}}}]}}}}]}}};
 const r=extract(t,{...snap({}),html:`<script>var ytInitialData = ${JSON.stringify(data)};</script>`},{sourceVerified:true,source:{id:'UCtest',name:'Sample'}});
 assert.deepEqual(r.items.map(x=>x.id),['abcdefghijk']);assert.equal(extract(t,snap(data)).count,0);
});
test('YouTube comments require exact player identity even when DOM comments exist',()=>{
 const t=input('comments',{url:'https://www.youtube.com/watch?v=abcdefghijk'}),ui={commentItems:[{id:'c',type:'comment',text:'test'}]};
 assert.equal(extract(t,snap({videoDetails:{videoId:'other'}}),ui).count,0);
 assert.equal(extract(t,snap({videoDetails:{videoId:'abcdefghijk'}}),ui).count,1);
});
test('access errors are explicit, not empty completed lists',()=>{
 const r=extract(thSource(),{...snap({}),httpStatus:429});assert.equal(r.status,'rate_limited');assert.equal(r.pagination.complete,false);
 assert.equal(extract(thSource(),{...snap({}),finalUrl:'https://www.threads.com/login'}).status,'auth_required');
});
test('cursor state is isolated, expiring, bounded and filters previous IDs on replay',()=>{
 let now=0;const store=createContentCursorStore({now:()=>now,ttlMs:10}),t=thSource();
 const token=store.issue(t,[{id:'id-A'}]),restored=store.restore({...t,cursor:token});
 assert.deepEqual(restored.seenIds,['id-A']);assert.throws(()=>store.restore({...t,id:'different',cursor:token}));
 const r=extract(restored,snap({data:{mediaData:{edges:[{node:{thread_items:[{post:p('A')},{post:p('B')}]}}]}}}));assert.deepEqual(r.items.map(x=>x.id),['id-B']);
 now=11;assert.throws(()=>store.restore({...t,cursor:token}));
});
test('HTTP batch deduplicates keywords and stops on rate limit; does not start remaining keywords',async t=>{
 const calls=[];const app=express();app.use(createSocialContentRouter({read:async x=>{calls.push(x.keyword);return{status:'rate_limited',retryAfterMs:30000,items:[],count:0,pagination:{complete:false}};}}));
 const server=app.listen(0,'127.0.0.1');await once(server,'listening');t.after(()=>new Promise(r=>server.close(r)));
 const response=await fetch(`http://127.0.0.1:${server.address().port}/api/social/search`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({platform:'threads',keywords:['a','a','b']})});
 const r=await response.json();assert.deepEqual(calls,['a']);assert.deepEqual(r.unstartedKeywords,['b']);assert.equal(response.headers.get('retry-after'),'30');
});

test('YouTube reply entities must bind to a rendered root on the matched video',()=>{
 const t=input('comments',{url:'https://www.youtube.com/watch?v=abcdefghijk'});
 const entity=(id)=>({commentEntityPayload:{properties:{commentId:id,replyLevel:1,content:{content:'reply'},publishedTime:'1 day ago'},author:{channelId:'UCauthor',displayName:'Author'},toolbar:{likeCountNotliked:'2'}}});
 const r=extract(t,snap({videoDetails:{videoId:'abcdefghijk'},entities:[entity('ROOT.child'),entity('OTHER.child')]}),{commentItems:[{id:'ROOT',type:'comment',text:'root',author:{}}]});
 assert.deepEqual(r.items.map(x=>x.id),['ROOT','ROOT.child']);assert.equal(r.items[1].parentId,'ROOT');assert.equal(r.items[1].likes,2);
});
test('relevance search is only used when caller explicitly requests it',()=>{
 const t=input('search',{platform:'threads',keyword:'test',order:'relevance'});
 const r=extract(t,snap({query:'test',recent:0,data:{searchResults:{edges:[{node:{thread:{thread_items:[{post:p('A')}]}}}]}}}));
 assert.equal(r.ordering.requested,'relevance');assert.equal(r.ordering.verified,true);assert.equal(r.count,1);
 assert.throws(()=>input('search',{platform:'threads',keyword:'test',order:'fake'}));
});
