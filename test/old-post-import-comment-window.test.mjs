import test from 'node:test';
import assert from 'node:assert/strict';
import {commitCrawlDocument,postTargetUpdate,isPostOutsideCommentWindow,readPostCommentPage,POST_COMMENT_WINDOW_MS,commentCandidateFilter} from '../src/services/crawlerPostHandoff.js';
import {serializeCrawlItem} from '../src/services/crawlerV8Es5.js';
import {boundedProxyRead,sourcePageDecision} from '../src/services/crawlerQueueFlow.js';
const now=Date.parse('2026-11-02T08:00:00Z'),source={platform:'facebook',type:'group',_id:'facebook:group:9',nativeId:'9',name:'Owned group'};
const item=age=>({type:'post',id:'9_12',postId:'12',sourceId:'9',url:'https://www.facebook.com/9_12',createdAt:new Date(now-age).toISOString(),author:{id:'77'},text:'Owned post',metrics:{comment:8,likes:2,shares:1}});
async function commit(age,options={}){const post=item(age),events=[];let target;const result=await commitCrawlDocument({item:post,source,doc:serializeCrawlItem(post,source),now:()=>now,write:async doc=>{events.push({kind:'ES',comments:doc._source.comments});return{result:'created',_id:doc._id,_version:1};},upsertTarget:async t=>{events.push({kind:'target'});target=t;},...options});return{result,events,target};}
test('old posts write to ES with native counters but cannot create a comment target',async()=>{
 const {events,target}=await commit(POST_COMMENT_WINDOW_MS+1);
 assert.deepEqual(events,[{kind:'ES',comments:8},{kind:'target'}]);assert.equal(target.allowCreate,false);assert.equal(target.fields.commentEligible,false);assert.equal(target.fields.commentWindowExpired,true);assert.equal(target.fields.parent.commentCount,8);assert.equal(target.fields.esPostProof.writeResult,'created');
 const update=postTargetUpdate(target,new Date(now));assert.equal(update.$set.commentEligible,false);assert.equal(update.$set['parent.commentCount'],8);
});
test('72h boundary is inclusive, newer posts retain normal comment eligibility',async()=>{
 for(const age of [POST_COMMENT_WINDOW_MS-1,POST_COMMENT_WINDOW_MS]){const {target}=await commit(age);assert.equal(target.allowCreate,true);assert.equal(target.fields.commentEligible,true);assert.equal(target.fields.commentWindowExpired,false);}
 assert.equal(isPostOutsideCommentWindow({createdAt:new Date(now-POST_COMMENT_WINDOW_MS-1)},now),true);
});
test('comment age is checked after ES acknowledgement rather than before a slow write',async()=>{
 let clock=now,target;const post=item(POST_COMMENT_WINDOW_MS);
 await commitCrawlDocument({item:post,source,doc:serializeCrawlItem(post,source),now:()=>clock,write:async()=>{clock++;return{result:'updated'};},upsertTarget:async t=>target=t});assert.equal(target.allowCreate,false);assert.equal(target.fields.commentEligible,false);
});
test('existing old parents with unknown counts are disabled without erasing verified counter data',async()=>{
 const s={platform:'youtube',type:'channel',_id:'youtube:owned',nativeId:'UCowned'},post={type:'post',id:'abcdefghijk',author:{id:'UCowned'},createdAt:item(POST_COMMENT_WINDOW_MS+1).createdAt,metrics:{}};let update;
 await commitCrawlDocument({item:post,source:s,doc:serializeCrawlItem(post,s),now:()=>now,write:async()=>({result:'created'}),upsertTarget:async target=>{assert.equal(target.allowCreate,false);update=postTargetUpdate(target,new Date(now));}});
 assert.equal(update.$set.commentEligible,false);assert.equal(update.$set['parent.commentCount'],undefined);assert.equal(update.$setOnInsert.commentEligible,undefined);
});
test('queued comments and replies on old posts complete without any native read or proxy rotation',async()=>{
 for(const kind of ['comments','reply']){let reads=0,rotations=0;const result=await boundedProxyRead({read:()=>readPostCommentPage({kind,parent:{createdAt:item(POST_COMMENT_WINDOW_MS+1).createdAt}},async()=>{reads++;return{good:true,result:{status:'ok'}};},now),rotate:async()=>rotations++});assert.equal(result.done,true);assert.equal(result.lastResult.reason,'POST_OUTSIDE_COMMENT_WINDOW');assert.equal(reads,0);assert.equal(rotations,0);}
});
test('native retries recheck an aging parent and source reads remain allowed',async()=>{
 let clock=now,reads=0;const data={kind:'comments',parent:{createdAt:item(POST_COMMENT_WINDOW_MS).createdAt}};
 const read=()=>readPostCommentPage(data,async()=>{reads++;return{good:false,result:{status:'error',reason:'NETWORK_ERROR'}};},clock);
 const result=await boundedProxyRead({read,rotate:async()=>{clock++;}});assert.equal(result.done,true);assert.equal(result.lastResult.reason,'POST_OUTSIDE_COMMENT_WINDOW');assert.equal(reads,1);
 await readPostCommentPage({kind:'source',parent:{createdAt:item(POST_COMMENT_WINDOW_MS+1).createdAt}},async()=>reads++,now);assert.equal(reads,2);
});
test('source boundary allows the first page and stops at later old unpinned pages and comment candidates require recent publication, not only recent activity',()=>{
 const items=[item(POST_COMMENT_WINDOW_MS+1)],cutoff=now-POST_COMMENT_WINDOW_MS;
 assert.equal(sourcePageDecision({items,page:1,cutoff,hasMore:true}),false);assert.equal(sourcePageDecision({items,page:2,cutoff,hasMore:true}),true);
 const gate=commentCandidateFilter('facebook',now).$and.at(-1);assert.equal(gate.$or[0]['parent.createdAt'].$gte,new Date(cutoff).toISOString());assert.equal(+gate.$or[1]['parent.createdAt'].$gte,cutoff);
});
test('old post import retains the existing native validation and ES acknowledgement requirements',async()=>{
 let published=false;await assert.rejects(()=>commit(POST_COMMENT_WINDOW_MS+1,{write:async()=>({}),upsertTarget:async()=>published=true}),e=>e.code==='ES5_IMPORT_UNCONFIRMED');assert.equal(published,false);
 const bad={...item(POST_COMMENT_WINDOW_MS+1),createdAt:null};assert.throws(()=>serializeCrawlItem(bad,source),e=>e.code==='EXACT_PUBLICATION_DATE_REQUIRED');
});
