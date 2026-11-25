import {test} from 'node:test';import assert from 'node:assert/strict';import {once}from'node:events';
import {normalizeMetricsInput} from '../src/services/socialMetrics.js';
import {createTiktokInteractionReader,parseTiktokInteraction} from '../src/services/tiktokInteraction.js';
import {createSocialHttpMetricsReader} from '../src/services/socialHttpReaders.js';
import {createPublicApiApp} from '../src/routes/publicApiApp.js';import {createSocialApiRuntime}from'../src/services/socialApiRuntime.js';
const id='7690800799345036551',url=`https://www.tiktok.com/@trn.lm9881/photo/${id}`,target=normalizeMetricsInput({platform:'tiktok',url}),secret='test-provider-key-never-public',ownKey='test-own-api-key-at-least-32-characters';
const live={status:'live',id,url,likes:12,shares:3,comments:4,views:789,saved:5};
const opts=(fetchImpl)=>({url:'http://upstream.test/tiktok/interaction',key:secret,fetchImpl});
test('TikTok photo/video URLs keep string IDs and canonicalize tracking parameters',()=>{
 assert.equal(target.id,id);assert.equal(target.mediaType,'photo');assert.equal(normalizeMetricsInput({url:url+'?is_from_webapp=1&share_uid=42'}).url,url);
 assert.equal(normalizeMetricsInput({url:url.replace('/photo/','/video/')}).mediaType,'video');
 for(const u of ['https://tiktok.com.evil.test/@abc/video/123','http://127.0.0.1/@abc/video/123','https://u:p@www.tiktok.com/@abc/video/123','https://www.tiktok.com:8000/@abc/video/123','https://www.tiktok.com/@abc','https://www.tiktok.com/@abc/photo/abc'])assert.throws(()=>normalizeMetricsInput({url:u}));
});
test('live provider response maps counters and leaves unsupported metrics null',()=>{
 const r=parseTiktokInteraction(target,live);assert.equal(r.nativeId,id);assert.equal(r.identityVerified,true);assert.equal(r.status,'partial');assert.deepEqual([r.metrics.reactions,r.metrics.likes,r.metrics.shares,r.metrics.comment,r.metrics.views,r.metrics.saved],[12,12,3,4,789,5]);assert.equal(r.metrics.repost,null);assert.equal(r.metrics.reshares,null);assert.equal(r.metrics.quotes,null);
});
test('provider owner_video IDs verify the exact video suffix for both video and photo URLs',async()=>{
 const videoId='7698953917035466004',videoUrl='https://www.tiktok.com/@giadinhsocthobi/video/'+videoId,rawId='6552860433287266305_'+videoId,payload={status:'ok',id:rawId,url:videoUrl,likes:3,shares:0,comments:1,views:2332,saved:2};
 for(const media of ['video','photo']){const t=normalizeMetricsInput({url:videoUrl.replace('/video/','/'+media+'/')}),r=await createTiktokInteractionReader(opts(async()=>new Response(JSON.stringify(payload))))(t);assert.equal(r.identityVerified,true);assert.equal(r.nativeId,videoId);assert.equal(r.upstreamPostId,rawId);assert.equal(r.reason,null);assert.deepEqual([r.metrics.likes,r.metrics.comment,r.metrics.shares,r.metrics.views],[3,1,0,2332]);}
 const t=normalizeMetricsInput({url:videoUrl});for(const id of ['6552860433287266305_999','999']){const r=parseTiktokInteraction(t,{...payload,id});assert.equal(r.reason,'TIKTOK_POST_ID_MISMATCH');assert.ok(Object.values(r.metrics).every(x=>x===null));}
 const conflict=parseTiktokInteraction(t,{...payload,aweme_id:'999'});assert.equal(conflict.reason,'TIKTOK_POST_ID_MISMATCH');
 for(const id of ['invalid_'+videoId,Number(videoId)])assert.equal(parseTiktokInteraction(t,{...payload,id}).identityVerified,false);
});
test('provider die response never becomes zero counters or a confirmed deleted post',()=>{
 const r=parseTiktokInteraction(target,{id:null,url,likes:null,shares:null,comments:null,views:null,saved:null,status:'die'});assert.equal(r.status,'unavailable');assert.equal(r.upstreamStatus,'die');assert.equal(r.reason,'TIKTOK_UPSTREAM_REPORTED_UNAVAILABLE');assert.equal(r.identityVerified,false);assert.ok(Object.values(r.metrics).every(x=>x===null));
});
test('real zeros are retained only after exact identity verification',()=>{
 const r=parseTiktokInteraction(target,{...live,likes:0,comments:0,views:0});assert.equal(r.metrics.likes,0);assert.equal(r.metrics.comment,0);assert.equal(r.status,'partial');
 for(const payload of [{...live,id:null},{...live,id:'123'},{...live,id:Number(id)}]){const x=parseTiktokInteraction(target,payload);assert.equal(x.identityVerified,false);assert.ok(Object.values(x.metrics).every(v=>v===null));}
});
test('standard stats aliases, additional counters and exact values are supported',()=>{
 const r=parseTiktokInteraction(target,{data:{id,stats:{diggCount:'1',shareCount:'2',commentCount:'3',playCount:'4',collectCount:'5',repostCount:'6',quoteCount:'7',reshareCount:'8',downloadCount:'9'}}});assert.equal(r.status,'ok');assert.equal(r.metrics.saved,5);assert.equal(r.metrics.quotes,7);assert.equal(r.extraMetrics['upstream.downloadCount'],9);
 const x=parseTiktokInteraction(target,{...live,views:'1.2K',saved:'9007199254740999',shares:-1});assert.equal(x.metrics.views,null);assert.equal(x.metrics.saved,null);assert.equal(x.metrics.shares,null);
 const conflict=parseTiktokInteraction(target,{...live,diggCount:99});assert.equal(conflict.metrics.likes,null);assert.equal(conflict.metricStatus.likes.status,'conflicting');
});
test('known HTTP statuses retain failure provenance and Retry-After',()=>{
 for(const[http,status,reason]of [[401,'error','TIKTOK_UPSTREAM_AUTH_FAILED'],[403,'error','TIKTOK_UPSTREAM_AUTH_FAILED'],[404,'unavailable','TIKTOK_UPSTREAM_NOT_FOUND'],[500,'error','TIKTOK_UPSTREAM_HTTP_ERROR'],[429,'rate_limited','TIKTOK_UPSTREAM_RATE_LIMITED']]){const r=parseTiktokInteraction(target,live,{httpStatus:http,retryAfterMs:120000});assert.equal(r.status,status);assert.equal(r.reason,reason);assert.equal(r.upstreamHttpStatus,http);assert.ok(Object.values(r.metrics).every(v=>v===null));}
});
test('application error flags do not permit stale counters through',()=>{
 for(const payload of [{...live,status:'error'},{...live,success:false},{...live,status:'die'}])assert.ok(Object.values(parseTiktokInteraction(target,payload).metrics).every(v=>v===null));
 assert.equal(parseTiktokInteraction(target,{status:'rate_limited'}).retryAfterMs,60000);
});
test('configured upstream receives one encoded URL, private key header and no redirects',async()=>{
 let calls=0;const read=createTiktokInteractionReader(opts(async(u,init)=>{calls++;assert.equal(u.origin,'http://upstream.test');assert.equal(u.searchParams.get('url'),url);assert.equal([...u.searchParams].length,1);assert.equal(init.headers['x-api-key'],secret);assert.equal(init.redirect,'error');return new Response(JSON.stringify(live),{status:200});}));
 const r=await read(target);assert.equal(calls,1);assert.equal(r.metrics.likes,12);assert.equal(r.transport.mode,'upstream_api');assert.equal(r.transport.proxyUsed,null);assert.equal(JSON.stringify(r).includes(secret),false);
});
test('bad configuration, JSON, oversized bodies and network errors are sanitized',async()=>{
 for(const options of [{url:'file:///etc/passwd',key:secret},{url:'http://upstream.test/path?secret=x',key:secret},{url:'http://upstream.test',key:''}])assert.equal((await createTiktokInteractionReader({...options,fetchImpl:()=>assert.fail('must not call')})(target)).reason,'TIKTOK_UPSTREAM_NOT_CONFIGURED');
 const json=await createTiktokInteractionReader(opts(async()=>new Response(secret)))(target);assert.equal(json.reason,'TIKTOK_UPSTREAM_INVALID_JSON');assert.ok(!JSON.stringify(json).includes(secret));
 const large=await createTiktokInteractionReader({...opts(async()=>new Response('x'.repeat(100))),maxBytes:10})(target);assert.equal(large.reason,'TIKTOK_UPSTREAM_RESPONSE_TOO_LARGE');
 const network=await createTiktokInteractionReader(opts(async()=>{throw Error(secret)}))(target);assert.equal(network.reason,'TIKTOK_UPSTREAM_NETWORK_ERROR');assert.ok(!JSON.stringify(network).includes(secret));
 const timeout=await createTiktokInteractionReader(opts(async()=>{throw Object.assign(Error(secret),{name:'TimeoutError'})}))(target);assert.equal(timeout.reason,'TIKTOK_UPSTREAM_TIMEOUT');
});
test('upstream auth/rate errors do not leak response text or retry automatically',async()=>{
 let calls=0;const r=await createTiktokInteractionReader(opts(async()=>{calls++;return new Response(secret,{status:429,headers:{'Retry-After':'123'}})}))(target);assert.equal(calls,1);assert.equal(r.status,'rate_limited');assert.equal(r.retryAfterMs,123000);assert.ok(!JSON.stringify(r).includes(secret));
});
test('TikTok metrics dispatch uses the provider API without spending origin proxy leases',async()=>{
 const read=createSocialHttpMetricsReader({getProxy:async()=>assert.fail('not an origin scrape'),tiktok:opts(async()=>new Response(JSON.stringify(live)))});assert.equal((await read(target)).nativeId,id);
});
test('public TikTok integration retains existing authentication and URL/link echoes',async t=>{
 let calls=0;const runtime=createSocialApiRuntime({getProxy:async()=>assert.fail('no proxy acquire'),lookup:async()=>assert.fail('no ES lookup'),tiktok:opts(async()=>{calls++;return new Response(JSON.stringify(live));})});
 const server=createPublicApiApp({key:ownKey,runtime}).listen(0,'127.0.0.1');await once(server,'listening');t.after(()=>new Promise(r=>server.close(r)));const base=`http://127.0.0.1:${server.address().port}`;
 for(const headers of [{},{authorization:'Bearer wrong-key'}])assert.equal((await fetch(base+'/api/social/post/metrics',{method:'POST',headers:{...headers,'content-type':'application/json'},body:JSON.stringify({url})})).status,401);
 assert.equal(calls,0);const response=await fetch(base+'/api/social/post/metrics',{method:'POST',headers:{authorization:'Bearer '+ownKey,'content-type':'application/json'},body:JSON.stringify({url:url+'?a=1&b=2',link:url,platform:'tiktok'})});const d=await response.json();assert.equal(response.status,200);assert.equal(d.metrics.likes,12);assert.equal(d.url,url+'?a=1&b=2');assert.equal(d.link,url);assert.equal(calls,1);assert.ok(!JSON.stringify(d).includes(secret));
});
