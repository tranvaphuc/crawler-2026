import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {createSocialApiRuntime} from '../src/services/socialApiRuntime.js';import {normalizeMetricsInput} from '../src/services/socialMetrics.js';import {checkFacebookPostShare} from '../src/services/facebookShare.js';
const f=JSON.parse(fs.readFileSync(new URL('fixtures/facebook-metrics/video-122141941088991375.json',import.meta.url))),url='https://www.facebook.com/61579741268314/posts/122141941088991375';
const html=payloads=>payloads.map(p=>'<script type="application/json">'+JSON.stringify({require:[['RelayPrefetchedStreamCache','next',[],[p.query,{__bbox:{result:p.result}}]]]})+'</script>').join('');
function runtime({code=200,payloads=f.payloads,initialHtml='<title>Facebook</title>'}={}){
 const calls=[];const api=createSocialApiRuntime({getProxy:async()=>({server:'http://fixture:8888'}),respectPlatformCooldown:false,makeSession:()=>({requests:0,setDeadline(){},close(){},async request(value){this.requests++;calls.push(value);return value.includes('/permalink.php?')?{httpStatus:200,finalUrl:f.finalUrl,html:html(payloads)}:{httpStatus:code,finalUrl:value,html:initialHtml};}})});return{api,calls};
}
test('a missing first projection falls back to the numeric permalink and retains verified exact-zero counters',async()=>{
 const {api,calls}=runtime(),r=await api.readMetrics(normalizeMetricsInput({url}));assert.equal(calls.length,2);assert.equal(calls[1],'https://www.facebook.com/permalink.php?story_fbid=122141941088991375&id=61579741268314');assert.equal(r.identityVerified,true);assert.equal(r.nativeId,f.input);assert.equal(r.status,'partial');assert.equal(r.metrics.reactions,0);assert.equal(r.metrics.views,2);assert.equal(r.transport.requests,2);assert.equal(r.transport.identityFallback,'facebook_numeric_permalink');
});
test('auth/rate/security/HTTP failures do not trigger a permalink retry',async()=>{
 for(const code of [401,403,404,429,500]){const {api,calls}=runtime({code});const r=await api.readMetrics(normalizeMetricsInput({url}));assert.equal(calls.length,1,String(code));assert.equal(r.identityVerified,false);assert.ok(Object.values(r.metrics).every(x=>x===null));}
});
test('fallback data for another post cannot supply requested interactions',async()=>{
 const {api,calls}=runtime();const r=await api.readMetrics(normalizeMetricsInput({url:'https://www.facebook.com/61579741268314/posts/999'}));assert.equal(calls.length,2);assert.equal(r.identityVerified,false);assert.ok(Object.values(r.metrics).every(x=>x===null));
});
test('a canonical permalink that is already missing does not fetch itself again',async()=>{
 let calls=0;const canonical='https://www.facebook.com/permalink.php?story_fbid=122141941088991375&id=61579741268314';const result=await checkFacebookPostShare(canonical,{fetchPage:async()=>{calls++;return{status:200,body:'<title>Facebook</title>'};}});assert.equal(calls,1);assert.equal(result.ok,false);assert.equal(result.reason,'PRIMARY_POST_NOT_FOUND');
});
test('a mismatched first projection still permits one exact numeric-permalink fallback',async()=>{
 const wrong=[{query:'CometSinglePostRootQuery',result:{data:{node_v2:{__typename:'Story',id:Buffer.from('S:_I61579741268314:999').toString('base64'),post_id:'999'}}}}];
 const {api,calls}=runtime({initialHtml:html(wrong)}),r=await api.readMetrics(normalizeMetricsInput({url}));assert.equal(calls.length,2);assert.equal(r.identityVerified,true);assert.equal(r.nativeId,f.input);assert.equal(r.metrics.views,2);
});
