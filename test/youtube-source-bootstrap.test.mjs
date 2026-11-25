import test from'node:test';import assert from'node:assert/strict';
import{canonicalYoutubeSourceId,createYoutubeSourceBootstrap,youtubeChannelRestriction}from'../src/services/youtubeSourceBootstrap.js';
import{assignedJson}from'../src/services/socialMetrics.js';
import{normalizeContentInput}from'../src/services/socialContent.js';
import{createSocialHttpContentReader,youtubeHttpUi,youtubeContinuations}from'../src/services/socialHttpReaders.js';
import{youtubeSourceSort}from'../src/services/socialOrdering.js';
import{READ_STATE}from'../src/services/socialReadState.js';
import{flowReadAction}from'../src/services/crawlerQueueFlow.js';
const idA='UC'+'A'.repeat(22),idB='UC'+'B'.repeat(22),target=id=>normalizeContentInput('source',{url:'https://www.youtube.com/channel/'+id,reference:{id},limit:1});
const payload=(id,ids=['abcdefghijk'])=>({metadata:{channelMetadataRenderer:{externalId:id,title:'Native </script><script>owned',ownerUrls:['https://www.youtube.com/channel/'+id]}},contents:{twoColumnBrowseResultsRenderer:{tabs:[{tabRenderer:{selected:true,title:'Videos',content:{richGridRenderer:{targetId:'native-grid-'+id,header:{chipCloudChipRenderer:{text:{simpleText:'Latest'},isSelected:true}},contents:ids.map(videoId=>({richItemRenderer:{content:{videoRenderer:{videoId,title:{simpleText:videoId},publishDate:'2026-10-24T10:00:00Z'}}}}))}}}}]}}});
const html=(id,body=payload(id))=>'<script>ytcfg.set('+JSON.stringify({INNERTUBE_CONTEXT:{client:{clientName:'WEB',clientVersion:'2.20261031',visitorData:'OWNED_PRIVATE_FIELD'},user:{onBehalfOfUser:'OWNED_PRIVATE_FIELD'}}})+');var ytInitialData = '+JSON.stringify(body)+';</script>';
const snapshot=(id,body)=>({httpStatus:200,finalUrl:target(id).url,html:html(id,body)});
test('only exact canonical channel URL/native UID/latest sources qualify',()=>{
 assert.equal(canonicalYoutubeSourceId(target(idA)),idA);
 for(const patch of [{url:'https://www.youtube.com/@alias/videos'},{url:'https://evil.test/channel/'+idA},{url:'http://www.youtube.com/channel/'+idA},{expectedNativeId:idB},{expectedNativeId:null},{operation:'comments'},{order:'oldest'}])assert.equal(canonicalYoutubeSourceId({...target(idA),...patch}),null);
});
test('ordinary HTML seeds only public client fields; JSON preserves native identity/order/cursors and escapes script text',async()=>{
 const provider=createYoutubeSourceBootstrap(),calls=[],body=payload(idB),session={request:async(url,options)=>{calls.push({url,options});return{httpStatus:200,html:JSON.stringify(body)};}};
 assert.equal(await provider.read(session,target(idA)),null);assert.equal(calls.length,0);assert.equal(provider.observe(target(idA),snapshot(idA)),true);
 const result=await provider.read(session,target(idB));assert.deepEqual(calls[0].options.body.context,{client:{clientName:'WEB',clientVersion:'2.20261031',hl:'en',gl:'US'}});assert.equal(calls[0].options.body.browseId,idB);assert.equal(calls[0].options.headers.cookie,undefined);
 assert.deepEqual(assignedJson(result.snapshot.html,'ytInitialData'),body);assert.equal(result.snapshot.html.includes('</script><script>owned'),false);assert.equal(youtubeHttpUi(target(idB),result.snapshot).sourceContinuationTarget.sourceId,idB);assert.equal(youtubeSourceSort(result.snapshot),true);assert.deepEqual(youtubeContinuations(result.snapshot,target(idB)),[]);
 const continued=payload(idB);continued.contents.twoColumnBrowseResultsRenderer.tabs[0].tabRenderer.content.richGridRenderer.contents.push({continuationItemRenderer:{continuationEndpoint:{continuationCommand:{token:'exact-native-next'}}}});session.request=async()=>({httpStatus:200,html:JSON.stringify(continued)});const next=await provider.read(session,target(idB));assert.equal(youtubeContinuations(next.snapshot,target(idB))[0].token,'exact-native-next');
});
test('client TTL is fixed from real HTML and cannot be kept alive by JSON reads',async()=>{
 let clock=0;const provider=createYoutubeSourceBootstrap({now:()=>clock,ttlMs:1000}),session={request:async()=>({httpStatus:200,html:JSON.stringify(payload(idA))})};provider.observe(target(idA),snapshot(idA));clock=500;assert.ok((await provider.read(session,target(idA))).snapshot);clock=1000;assert.equal(await provider.read(session,target(idA)),null);
 assert.equal(provider.observe(target(idB),snapshot(idA)),false);assert.equal(await provider.read(session,target(idB)),null);
});
test('429/auth/invalid JSON/identity errors never become HTML fallbacks or empty success',async()=>{
 const cases=[{response:{httpStatus:429,retryAfterMs:900000,html:'{"error":{"code":403}}'},status:'rate_limited',reason:'UPSTREAM_HTTP_429'},{response:{httpStatus:200,html:'{"error":{"code":403,"message":"login required"}}'},status:'auth_required',reason:'UPSTREAM_API_AUTH_REQUIRED'},{response:{httpStatus:200,html:'<html>not JSON</html>'},reason:'YOUTUBE_SOURCE_JSON_INVALID'},{response:{httpStatus:200,html:JSON.stringify(payload(idB))},reason:'YOUTUBE_SOURCE_JSON_IDENTITY_MISMATCH'}];
 cases.push({response:{httpStatus:200,html:'{"contents":{}}'},reason:'YOUTUBE_SOURCE_JSON_IDENTITY_UNVERIFIED'});
 for(const c of cases){const provider=createYoutubeSourceBootstrap();provider.observe(target(idA),snapshot(idA));let calls=0;const value=await provider.read({request:async()=>{calls++;return c.response;}},target(idA));assert.equal(calls,1);assert.equal(value.failure.reason,c.reason);if(c.status)assert.equal(value.failure.status,c.status);assert.equal(value.snapshot,undefined);assert.equal(value.unsupported,undefined);if(c.response.retryAfterMs)assert.equal(value.failure.retryAfterMs,c.response.retryAfterMs);}
 const body=payload(idA);body.contents.twoColumnBrowseResultsRenderer.tabs[0].tabRenderer.content.richGridRenderer.header.chipCloudChipRenderer.isSelected=false;const provider=createYoutubeSourceBootstrap();provider.observe(target(idA),snapshot(idA));const missingSort=await provider.read({request:async()=>({httpStatus:200,html:JSON.stringify(body)})},target(idA));assert.equal(missingSort.unsupported,true);assert.equal(missingSort.reason,'YOUTUBE_SOURCE_JSON_LATEST_UNVERIFIED');assert.equal(missingSort.snapshot,undefined);
});
test('missing Latest chip uses ordinary HTML guards without fabricating server-order proof',async()=>{
 const body=payload(idB);delete body.contents.twoColumnBrowseResultsRenderer.tabs[0].tabRenderer.content.richGridRenderer.header;
 const calls=[],read=createSocialHttpContentReader({preferYoutubeJsonSourceBootstrap:true,getProxy:async()=>({protocol:'http',host:'127.0.0.1',port:8080}),makeSession:()=>({requests:0,async request(url,options){calls.push({url,options});this.requests++;return options?{httpStatus:200,html:JSON.stringify(body)}:snapshot(url.includes(idB)?idB:idA,url.includes(idB)?body:undefined);},close(){}})});
 await read(target(idA));const result=await read(target(idB));assert.equal(calls.length,3);assert.equal(result.source.id,idB);assert.equal(result.identityVerified,true);assert.equal(result.ordering.verified,true);assert.notEqual(result.ordering.serverFilterVerified,true);assert.equal(result.items[0].createdAt,'2026-10-24T10:00:00.000Z');assert.equal(calls[2].options,undefined);
});
test('unsupported native layouts fall back once per source and 5xx retains operator retry semantics',async()=>{
 const provider=createYoutubeSourceBootstrap();provider.observe(target(idA),snapshot(idA));const body=payload(idA);body.contents.twoColumnBrowseResultsRenderer.tabs[0].tabRenderer.content.richGridRenderer.contents=[];let calls=0;const session={request:async()=>{calls++;return{httpStatus:200,html:JSON.stringify(body)};}};assert.equal((await provider.read(session,target(idA))).unsupported,true);assert.equal(await provider.read(session,target(idA)),null);assert.equal(calls,1);
 session.request=async()=>({httpStatus:503,html:'{"error":{"message":"unavailable"}}'});const failure=(await provider.read(session,target(idB))).failure;assert.equal(flowReadAction(failure),'rotate');
});
test('full reader uses one cold HTML then JSON on a fresh source and preserves native checkpoint delivery',async()=>{
 const calls=[],events=[],read=createSocialHttpContentReader({preferYoutubeJsonSourceBootstrap:true,onNativeJsonRequest:e=>events.push(e),getProxy:async()=>({protocol:'http',host:'127.0.0.1',port:8080}),makeSession:()=>({requests:0,async request(url,options){this.requests++;calls.push({url,options});return options?{httpStatus:200,html:JSON.stringify(payload(idB,['abcdefghijk','lmnopqrstuv']))}:{...snapshot(idA)};},close(){}})});
 const first=await read(target(idA));assert.equal(first.items[0].id,'abcdefghijk');assert.equal(calls.length,1);const second=await read(target(idB));assert.equal(second.identityVerified,true);assert.equal(second.source.id,idB);assert.equal(second.items[0].id,'abcdefghijk');assert.equal(calls.length,2);assert.ok(calls[1].options);assert.equal(second[READ_STATE].ui.sourceContinuationTarget.sourceId,idB);assert.deepEqual(second[READ_STATE].context.client,{clientName:'WEB',clientVersion:'2.20261031',hl:'en',gl:'US'});
 const rest=await read(Object.defineProperty({...target(idB)},READ_STATE,{value:second[READ_STATE]}));assert.equal(rest.items[0].id,'lmnopqrstuv');assert.equal(calls.length,2);assert.deepEqual(events.filter(x=>x.operation==='source_bootstrap').map(x=>x.mode),['html_bootstrap','json']);
});
test('native channel age gate without metadata is classified as restriction and never fabricates channel identity',async()=>{
 const provider=createYoutubeSourceBootstrap();provider.observe(target(idA),snapshot(idA));const body={contents:{twoColumnBrowseResultsRenderer:{tabs:[{tabRenderer:{selected:true,content:{channelAgeGateRenderer:{title:{simpleText:'Confirm you are old enough'},signInButton:{buttonRenderer:{text:{simpleText:'Sign in'}}}}}}}]}}};
 const result=await provider.read({request:async()=>({httpStatus:200,html:JSON.stringify(body)})},target(idB));assert.equal(result.failure.status,'auth_required');assert.equal(result.failure.reason,'YOUTUBE_CHANNEL_AGE_RESTRICTED');assert.equal(result.failure.authGate.classification,'source_restriction');assert.equal(result.failure.authGate.confirmed,true);assert.equal(result.failure.identityVerified,undefined);assert.equal(result.snapshot,undefined);assert.equal(flowReadAction(result.failure),'done');
});
test('age-related incidental JSON strings and contradictory channel IDs retain identity guards',async()=>{
 const provider=createYoutubeSourceBootstrap();provider.observe(target(idA),snapshot(idA));
 for(const body of [{text:'This channel is age-restricted. Sign in to confirm you are old enough.'},{contents:{channelAgeGateRenderer:{title:{simpleText:'Sign in'}}}}]){const result=await provider.read({request:async()=>({httpStatus:200,html:JSON.stringify(body)})},target(idB));assert.equal(result.failure.reason,'YOUTUBE_SOURCE_JSON_IDENTITY_UNVERIFIED');}
 const body=payload(idA);body.contents.twoColumnBrowseResultsRenderer.tabs[0].tabRenderer.content.channelAgeGateRenderer={signInButton:{}};const result=await provider.read({request:async()=>({httpStatus:200,html:JSON.stringify(body)})},target(idB));assert.equal(result.failure.reason,'YOUTUBE_SOURCE_JSON_IDENTITY_MISMATCH');
});
test('cold HTML age gate and warmed JSON age gate have the same terminal classification',async()=>{
 const gate={contents:{twoColumnBrowseResultsRenderer:{tabs:[{tabRenderer:{selected:true,content:{sectionListRenderer:{contents:[{channelAgeGateRenderer:{mainText:{simpleText:'Confirm you are old enough'},signInButton:{buttonRenderer:{}}}}]}}}}]}}},read=createSocialHttpContentReader({preferYoutubeJsonSourceBootstrap:true,getProxy:async()=>({host:'fixture',port:8080}),makeSession:()=>({requests:0,async request(){this.requests++;return{httpStatus:200,html:'<script>var ytInitialData = '+JSON.stringify(gate)+';</script>'};},close(){}})});
 const result=await read(target(idB));assert.equal(result.status,'auth_required');assert.equal(result.reason,'YOUTUBE_CHANNEL_AGE_RESTRICTED');assert.equal(result.authGate.evidence,'native_channel_age_gate');assert.notEqual(result.identityVerified,true);assert.equal(result.items.length,0);
});
test('missing/non-object native data is not an age gate, and HTTP rate limits keep priority',async()=>{
 for(const body of [undefined,null,true,'age-restricted sign in'])assert.equal(youtubeChannelRestriction(body,idA),null);
 const gate={contents:{channelAgeGateRenderer:{signInButton:{}}}},read=createSocialHttpContentReader({preferYoutubeJsonSourceBootstrap:true,getProxy:async()=>({host:'fixture',port:8080}),makeSession:()=>({requests:0,async request(){this.requests++;return{httpStatus:429,html:'<script>var ytInitialData = '+JSON.stringify(gate)+';</script>'};},close(){}})});const result=await read(target(idA));assert.equal(result.status,'rate_limited');assert.equal(result.reason,'HTTP_429');
});
