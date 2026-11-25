import test from 'node:test';
import assert from 'node:assert/strict';
import {createSourcePublicationCache} from '../src/services/sourcePublicationCache.js';
import {createMetaSourceHttpReader} from '../src/services/metaSourceHttp.js';
import {normalizeContentInput} from '../src/services/socialContent.js';

const date='2026-10-30T01:00:00.000Z';
const row=(extra={})=>({_id:'snsTopic:9_1',platform:'instagram',source:{nativeId:'9'},parent:{nativeId:'1',systemId:'9_1',createdAt:date},esPostProof:{id:'9_1',type:'snsTopic',confirmedAt:new Date()},...extra});
const target={platform:'instagram',expectedNativeId:'9'};
const item=()=>({id:'1',author:{id:'9'},createdAt:null,metrics:{comment:42}});
test('acknowledged same-source publication dates avoid repeated lookups without replacing fresh counters',async()=>{
 let calls=0;const restore=createSourcePublicationCache({collection:{find(){calls++;return{toArray:async()=>[row()]};}}});
 const a=item();assert.equal(await restore(target,[a]),1);assert.equal(a.createdAt,date);assert.equal(a.metrics.comment,42);
 assert.equal(await restore(target,[item()]),1);assert.equal(calls,1);
});
test('missing ES acknowledgment, conflicting identity and wrong source never restore a date',async()=>{
 for(const bad of [row({source:{nativeId:'10'}}),row({parent:{nativeId:'2',systemId:'9_1',createdAt:date}}),row({esPostProof:null}),row({esPostProof:{id:'9_2',type:'snsTopic',confirmedAt:new Date()}}),row({esPostProof:{id:'9_1',type:'fbPageTopic',confirmedAt:new Date()}})]){
  const restore=createSourcePublicationCache({collection:{find:()=>({toArray:async()=>[bad]})}}),a=item();assert.equal(await restore(target,[a]),0);assert.equal(a.createdAt,null);
 }
});
test('YouTube relative or legacy dates stay uncached; exact provenance can be reused',async()=>{
 for(const publication of [undefined,{evidence:'relative',isEstimated:true},{evidence:'native_player.publishDate',isEstimated:false}]){
  const restore=createSourcePublicationCache({collection:{find:()=>({toArray:async()=>[{_id:'youtubeTopic:abcdefghijk',platform:'youtube',source:{nativeId:'UCsource'},parent:{nativeId:'abcdefghijk',systemId:'abcdefghijk',createdAt:date,publication},esPostProof:{id:'abcdefghijk',type:'youtubeTopic',confirmedAt:new Date()}}]})}}),a={id:'abcdefghijk',createdAt:null};
  assert.equal(await restore({platform:'youtube',expectedNativeId:'UCsource'},[a]),publication?.isEstimated===false?1:0);
 }
});
test('lookup failures fall back to native metadata reads',async()=>{
 const restore=createSourcePublicationCache({collection:{find(){throw Error('temporary database failure');}}});const a=item();assert.equal(await restore(target,[a]),0);assert.equal(a.createdAt,null);
});
test('an operator-approved Instagram media-ID estimate is never cached as an exact publication date',async()=>{
 const estimated=row({parent:{nativeId:'1',systemId:'9_1',createdAt:date,publication:{evidence:'native_media_id.creation_time_inferred',isEstimated:true,precision:'second'}}});
 const restore=createSourcePublicationCache({collection:{find:()=>({toArray:async()=>[estimated]})}}),a=item();
 assert.equal(await restore(target,[a]),0);assert.equal(a.createdAt,null);assert.equal(a.dateIsEstimated,undefined);
});
test('a warm global YouTube video key cannot bypass a different source identity',async()=>{
 let queries=0;
 const restore=createSourcePublicationCache({collection:{find:()=>({toArray:async()=>++queries===1?[{_id:'youtubeTopic:abcdefghijk',platform:'youtube',source:{nativeId:'UCsource'},parent:{nativeId:'abcdefghijk',systemId:'abcdefghijk',createdAt:date,publication:{evidence:'native_player.publishDate',isEstimated:false}},esPostProof:{id:'abcdefghijk',type:'youtubeTopic',confirmedAt:new Date()}}]:[]})}});
 assert.equal(await restore({platform:'youtube',expectedNativeId:'UCsource'},[{id:'abcdefghijk',createdAt:null}]),1);
 const other={id:'abcdefghijk',createdAt:null};assert.equal(await restore({platform:'youtube',expectedNativeId:'UCother'},[other]),0);assert.equal(other.createdAt,null);assert.equal(queries,2);
});
test('Instagram source page restores committed dates without opening every post HTML',async()=>{
 const url='https://www.instagram.com/sample/',calls=[];
 const restore=createSourcePublicationCache({collection:{find:()=>({toArray:async()=>[row()]})}});
 const read=createMetaSourceHttpReader({restoreSourcePublicationDates:restore,maxPages:1,streamSourceItems:true,respectPlatformCooldown:false,getProxy:async()=>({server:'http://proxy.test:8888'}),makeSession:()=>({requests:0,close(){},async request(u){this.requests++;calls.push(u);assert.equal(u,url);return{httpStatus:200,finalUrl:url,html:'<script type="application/json">'+JSON.stringify({data:{xdt_api__v1__feed__user_timeline_graphql_connection:{edges:[{node:{pk:'1',code:'POST1',user:{pk:'9',username:'sample'},caption:{text:'fresh'},comment_count:42}}],page_info:{has_next_page:false,end_cursor:null}}}})+'</script>'};}})});
 const r=await read(normalizeContentInput('source',{url,reference:{id:'9'},limit:100}));assert.equal(r.items[0].createdAt,date);assert.equal(r.items[0].text,'fresh');assert.equal(r.items[0].metrics.comment,42);assert.equal(r.pagination.hasMore,false);assert.equal(calls.length,1);
});
test('verified Instagram detail dates survive restart even when the post has no interaction target',async()=>{
 const rows=new Map(),metadataCollection={bulkWrite:async ops=>{for(const op of ops){const r=op.updateOne.update.$setOnInsert;rows.set(r._id,r);}},find:()=>({toArray:async()=>[...rows.values()]})},collection={find:()=>({toArray:async()=>[]})};
 const first=createSourcePublicationCache({collection,metadataCollection});
 assert.equal(await first.remember(target,[{...item(),createdAt:date,dateEvidence:'matched_post_detail',dateIsEstimated:false}]),1);
 const second=createSourcePublicationCache({collection,metadataCollection}),fresh=item();
 assert.equal(await second(target,[fresh]),1);assert.equal(fresh.createdAt,date);assert.equal(fresh.dateIsEstimated,false);assert.equal(fresh.metrics.comment,42);
 const foreign=item();assert.equal(await second({...target,expectedNativeId:'10'},[foreign]),0);assert.equal(foreign.createdAt,null);
});
test('persistent metadata rejects estimated, unknown and conflicting dates and tolerates write outages',async()=>{
 let writes=0;const restore=createSourcePublicationCache({collection:{find:()=>({toArray:async()=>[]})},metadataCollection:{async bulkWrite(){writes++;throw Error('offline')},find:()=>({toArray:async()=>[]})}});
 for(const extra of [{dateEvidence:'relative'},{dateEvidence:'matched_post_detail',dateIsEstimated:true},{dateEvidence:'matched_post_detail',author:{id:'10'}}])assert.equal(await restore.remember(target,[{...item(),createdAt:date,...extra}]),0);
 assert.equal(writes,0);assert.equal(await restore.remember(target,[{...item(),createdAt:date,dateEvidence:'matched_post_detail'}]),1);assert.equal(writes,1);const fresh=item();assert.equal(await restore(target,[fresh]),1);
});
