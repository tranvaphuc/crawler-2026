import test from 'node:test';
import assert from 'node:assert/strict';
import {extractSocialMetrics,normalizeMetricsInput} from '../src/services/socialMetrics.js';
import {createSocialApiRuntime} from '../src/services/socialApiRuntime.js';
import fs from 'node:fs';
const target=normalizeMetricsInput({url:'https://www.facebook.com/61582620998077/posts/122154296925087366'});
const loginHtml='<script type="application/json">'+JSON.stringify({require:[['RelayPrefetchedStreamCache','next',[],['adp_useCometLogInFormQueryRelayPreloader_regression',{__bbox:{result:{data:{login_data:{}}}}}]]]})+'</script>';
test('HTTP 200 login-only bootstrap is unavailable with evidence, without declaring the post deleted or blocking the proxy',()=>{
 const r=extractSocialMetrics(target,{html:loginHtml});assert.equal(r.status,'unavailable');assert.equal(r.reason,'ANONYMOUS_POST_DATA_NOT_RETURNED');assert.equal(r.identityVerified,false);assert.equal(r.accessEvidence.kind,'anonymous_login_bootstrap');assert.ok(Object.values(r.metrics).every(x=>x===null));
});
test('an empty response distinguishes missing identity from a verified post with missing counters',()=>{
 const r=extractSocialMetrics(target,{html:'<title>Facebook</title>'});assert.equal(r.reason,'POST_ID_UNVERIFIED');assert.equal(r.identityVerified,false);
});
test('unverified anonymous response makes only one bounded canonical fallback, then retains the access evidence',async()=>{
 let calls=0;const api=createSocialApiRuntime({respectPlatformCooldown:false,getProxy:async()=>({server:'http://fixture:8888'}),makeSession:()=>({requests:0,setDeadline(){},close(){},async request(url){calls++;this.requests++;return{html:loginHtml,httpStatus:200,finalUrl:url};}})});
 const r=await api.readMetrics(target);assert.equal(calls,2);assert.equal(r.transport.requests,2);assert.equal(r.reason,'ANONYMOUS_POST_DATA_NOT_RETURNED');assert.equal(r.status,'unavailable');assert.equal(r.identityVerified,false);
});
test('explicit auth, security, rate and HTTP failures take precedence over login bootstrap',()=>{
 for(const [httpStatus,status]of [[403,'auth_required'],[429,'rate_limited'],[500,'error'],[404,'unavailable']])assert.equal(extractSocialMetrics(target,{html:loginHtml,httpStatus}).status,status);
 assert.equal(extractSocialMetrics(target,{html:loginHtml,finalUrl:'https://www.facebook.com/checkpoint/'}).status,'security_checkpoint');
});
test('Threads native invalid-post redirect is unavailable rather than a missing counter',()=>{
 const t=normalizeMetricsInput({url:'https://www.threads.com/@example/post/DclCwXSkb-y'}),r=extractSocialMetrics(t,{finalUrl:'https://www.threads.com/?error=invalid_post'});
 assert.equal(r.reason,'POST_UNAVAILABLE');assert.equal(r.identityVerified,false);assert.equal(r.accessEvidence.kind,'native_invalid_post_redirect');
});
test('YouTube native private-video gate returns no stale counters and does not blame the proxy',()=>{
 const t=normalizeMetricsInput({url:'https://www.youtube.com/watch?v=fwXPGkvi334'}),html='var ytInitialPlayerResponse = '+JSON.stringify({playabilityStatus:{status:'LOGIN_REQUIRED',reason:'Private video'},videoDetails:{videoId:t.id,viewCount:'100'}})+';';
 const r=extractSocialMetrics(t,{html});assert.equal(r.reason,'POST_NOT_PUBLIC');assert.equal(r.status,'unavailable');assert.equal(r.identityVerified,false);assert.ok(Object.values(r.metrics).every(x=>x===null));
 assert.notEqual(extractSocialMetrics(t,{html,finalUrl:'https://www.youtube.com/watch?v=VhEgGC-LMAw'}).reason,'POST_NOT_PUBLIC');
});
test('a photo permalink resolving to a different album post cannot donate album counters',()=>{
 const f=JSON.parse(fs.readFileSync(new URL('fixtures/facebook-metrics/photo-album-id-mismatch.json',import.meta.url))),t=normalizeMetricsInput({url:'https://www.facebook.com/'+f.input});
 const html=f.payloads.map(p=>'<script type="application/json">'+JSON.stringify({require:[['RelayPrefetchedStreamCache','next',[],[p.query,{__bbox:{result:p.result}}]]]})+'</script>').join('');
 const r=extractSocialMetrics(t,{html,finalUrl:f.finalUrl});assert.equal(r.reason,'POST_IDENTITY_MISMATCH');assert.equal(r.identityVerified,false);assert.ok(Object.values(r.metrics).every(x=>x===null));
});
