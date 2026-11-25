import {test} from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter,once} from 'node:events';
import express from 'express';
import {normalizeMetricsInput,extractSocialMetrics} from '../src/services/socialMetrics.js';
import {normalizeContentInput,contentBase,extractContentSnapshot} from '../src/services/socialContent.js';
import {normalizeBrowserProxy,createSocialMetricsReader,retryAfterMs} from '../src/services/socialMetricsBrowser.js';
import {createSocialMetricsRouter} from '../src/routes/socialMetrics.js';
import {createSocialContentRouter} from '../src/routes/socialContent.js';
import {createFacebookShareRouter} from '../src/routes/facebookShare.js';
const url='https://www.threads.com/@sample/post/XYZ123';
const target=normalizeMetricsInput({url});
const html='<script type="application/json">'+JSON.stringify({id:'99',code:'XYZ123',like_count:10})+'</script>';
const source=normalizeContentInput('source',{url:'https://www.threads.com/@sample'});
for(const [code,status] of [[401,'auth_required'],[403,'auth_required'],[404,'unavailable'],[410,'unavailable'],[429,'rate_limited'],[500,'error'],[502,'error'],[503,'error'],[504,'error']]) {
 test(`HTTP ${code} overrides cached counters and cannot produce a completed content page`,()=>{
  const m=extractSocialMetrics(target,{html,httpStatus:code});assert.equal(m.status,status);assert.ok(Object.values(m.metrics).every(v=>v===null));
  const c=extractContentSnapshot(source,{html,httpStatus:code});assert.equal(c.status,status);assert.equal(c.count,0);assert.equal(c.pagination.complete,false);
 });
}
for(const [payload,status] of [[{status:'fail',message:'login_required'},'auth_required'],[{errors:[{extensions:{code:'RATE_LIMITED'}}]},'rate_limited']]) {
 test(`HTTP 200 native error envelope is ${status} even with cached data`,()=>{
  const jsonResponses=[JSON.stringify(payload)];
  const m=extractSocialMetrics(target,{html,jsonResponses});assert.equal(m.status,status);assert.equal(m.metrics.likes,null);assert.ok(!JSON.stringify(m).includes('oops secret'));
  const c=extractContentSnapshot(source,{html,httpStatus:200,jsonResponses});assert.equal(c.status,status);assert.equal(c.pagination.complete,false);
 });
}
test('checkpoint/login redirects override counters without echoing private diagnostics',()=>{
 for(const [finalUrl,status] of [['https://www.threads.com/login','auth_required'],['https://www.threads.com/challenge/','security_checkpoint']]){
  const r=extractSocialMetrics(target,{html,finalUrl});assert.equal(r.status,status);assert.equal(r.metrics.likes,null);
 }
});
test('invalid proxy variants never expose native URL/credential errors',()=>{
 for(const v of [{host:'localhost',port:0},{host:'localhost',port:70000},{host:'localhost',port:-1},{server:'file:///tmp/a'},{server:'http://user:secret@localhost:1234'},'http://%ZZ:secret@localhost:8888'])
  assert.throws(()=>normalizeBrowserProxy(v),e=>e.code==='INVALID_PROXY'&&!e.message.includes('secret'));
});
test('Retry-After handles seconds, dates and malformed/nonfinite values',()=>{
 assert.equal(retryAfterMs('2'),2000);assert.equal(retryAfterMs('Thu, 01 Jan 1970 00:00:03 GMT',900,1000),2000);
 for(const v of ['garbage','Infinity','-2','9'.repeat(500)])assert.equal(retryAfterMs(v,900),900);
});
function mock({code=200,apiCodes=[],close=async()=>{},release=()=>{},body=html}={}){
 const page=new EventEmitter(),client=new EventEmitter();client.send=async()=>{};
 Object.assign(page,{target:()=>({createCDPSession:async()=>client}),setViewport:async()=>{},setExtraHTTPHeaders:async()=>{},
  goto:async()=>{for(const n of apiCodes)page.emit('response',{url:()=> 'https://www.threads.com/api/v1/test',status:()=>n,headers:()=>({'content-type':'application/json','retry-after':'invalid'}),text:async()=>JSON.stringify({data:{}})});return {status:()=>code,headers:()=>({'retry-after':'invalid'})};},
  content:async()=>body,url:()=>url});
 const browser={createIncognitoBrowserContext:async()=>({isIncognito:()=>true,newPage:async()=>page}),close,process:()=>({kill:()=>{throw Error('already dead secret')}})};
 return {page,browser,opts:{executablePath:'/test/chrome',settleMs:0,getProxy:async()=>({server:'http://proxy.test:8888',release}),launch:async()=>browser}};
}
test('background API 429 dominates later 403/503 and invalid Retry-After gets safe fallback',async()=>{
 const {opts}=mock({apiCodes:[429,403,503]});const r=await createSocialMetricsReader(opts)(target);
 assert.equal(r.status,'rate_limited');assert.equal(r.retryAfterMs,900000);assert.equal(r.metrics.likes,null);
});
test('sync close/kill and rejected release do not replace results or leak admission slots',async()=>{
 for(let i=0;i<4;i++){
  const {opts}=mock({close:()=>{throw Error('close secret')},release:async()=>{throw Error('release secret')}});
  const r=await createSocialMetricsReader(opts)(target);assert.equal(r.status,'partial');assert.equal(r.metrics.likes,10);assert.ok(!JSON.stringify(r).includes('secret'));
 }
});
test('late proxy acquisition times out and still releases its lease',async()=>{
 let released=false;
 const read=createSocialMetricsReader({executablePath:'/test/chrome',timeoutMs:5,getProxy:()=>new Promise(resolve=>setTimeout(()=>resolve({release:()=>{released=true}}),25)),launch:()=>{throw Error('must not launch')}});
 const r=await read(target);assert.equal(r.reason,'BROWSER_TIMEOUT');await new Promise(r=>setTimeout(r,40));assert.equal(released,true);
});
test('hung content stage times out and closes dedicated browser',async()=>{
 let closed=false;const {opts}=mock({close:async()=>{closed=true}});
 const r=await createSocialMetricsReader({...opts,timeoutMs:20,readPage:()=>new Promise(()=>{})})(target);
 assert.equal(r.reason,'BROWSER_TIMEOUT');assert.equal(closed,true);
});
async function serve(t,routers){const app=express();for(const router of routers)app.use(router);const server=app.listen(0,'127.0.0.1');await once(server,'listening');t.after(()=>new Promise(r=>server.close(r)));return `http://127.0.0.1:${server.address().port}`;}
const post=(base,path,body,headers={'content-type':'application/json'})=>fetch(base+path,{method:'POST',headers,body:typeof body==='string'?body:JSON.stringify(body)});
test('all six endpoints return JSON 400 malformed input / 413 size and sanitized 500 runtime failures',async t=>{
 const fail=async()=>{throw Error('private credential secret')};
 const base=await serve(t,[createFacebookShareRouter({check:fail,details:fail}),createSocialMetricsRouter({read:fail}),createSocialContentRouter({read:fail})]);
 for(const path of ['/api/facebook/post/share','/api/facebook/post/details','/api/social/post/metrics','/api/social/source/posts','/api/social/post/comments','/api/social/search']){
  for(const [body,code] of [['{',400],[{blob:'x'.repeat(40000)},413],[{},400]]){const r=await post(base,path,body);assert.equal(r.status,code,path);assert.match(r.headers.get('content-type'),/json/);assert.ok(!JSON.stringify(await r.json()).includes('secret'));}
 }
 const inputs=[['/api/facebook/post/share',{id:'1000419343151470_122138942931244237'}],['/api/facebook/post/details',{id:'1000419343151470_122138942931244237'}],['/api/social/post/metrics',{url}]];
 for(const [path,input] of inputs){const r=await post(base,path,input);assert.equal(r.status,500);assert.ok(!JSON.stringify(await r.json()).includes('secret'));}
 for(const [path,input] of [['/api/social/source/posts',{url:source.url}],['/api/social/post/comments',{url}],['/api/social/search',{platform:'threads',keyword:'test'}]]){
  const r=await post(base,path,input);const v=await r.json();assert.equal(v.status,'error');assert.equal(v.reason,'INTERNAL_ERROR');assert.equal(v.count,0);
 }
});
test('batch preserves first successful keyword, stops on unexpected failure and exposes unstarted keywords',async t=>{
 let calls=0;const base=await serve(t,[createSocialContentRouter({read:async target=>{if(++calls===2)throw Error('secret');return {...contentBase(target),status:'partial',items:[{id:'post1'}],count:1};}})]);
 const r=await post(base,'/api/social/search',{platform:'threads',keywords:['a','b','c']});const v=await r.json();
 assert.equal(v.status,'partial');assert.equal(v.results[0].items[0].id,'post1');assert.equal(v.results[1].status,'error');assert.deepEqual(v.unstartedKeywords,['c']);assert.equal(v.successfulKeywords,1);assert.equal(v.failedKeywords,1);
});
test('metrics forwards Retry-After and rejects broken reader envelopes',async t=>{
 let bad=false;const base=await serve(t,[createSocialMetricsRouter({read:async()=>bad?undefined:{status:'rate_limited',retryAfterMs:1500}})]);
 const r=await post(base,'/api/social/post/metrics',{url});assert.equal(r.headers.get('retry-after'),'2');bad=true;
 assert.equal((await post(base,'/api/social/post/metrics',{url})).status,500);
});
test('ES5 format validation runs before upstream and preserves access failure status',async t=>{
 let calls=0;const base=await serve(t,[createFacebookShareRouter({check:async()=>{calls++},details:async()=>({ok:false,status:'unknown',reason:'RATE_LIMITED',retryAfter:'12'})})]);
 for(const format of ['',false,'bad','es5'])assert.equal((await post(base,'/api/facebook/post/share',{id:'1000419343151470_122138942931244237',format})).status,400);
 assert.equal(calls,0);const r=await post(base,'/api/facebook/post/details',{id:'1000419343151470_122138942931244237',format:'es5'});const v=await r.json();assert.equal(v.reason,'RATE_LIMITED');assert.equal(v.status,'unknown');assert.equal(r.headers.get('retry-after'),'12');
});

test('generic GraphQL errors preserve verified partial counters but never report success with no data',()=>{
 const jsonResponses=[JSON.stringify({errors:[{message:'private upstream diagnostic'}]})];
 const r=extractSocialMetrics(target,{html,jsonResponses});assert.equal(r.status,'partial');assert.equal(r.reason,'UPSTREAM_API_PARTIAL_ERROR');assert.equal(r.metrics.likes,10);assert.deepEqual(r.warnings,['UPSTREAM_API_ERROR']);
 const missing=extractSocialMetrics(target,{jsonResponses});assert.equal(missing.status,'error');assert.equal(missing.reason,'UPSTREAM_API_ERROR');
 const c=extractContentSnapshot(source,{httpStatus:200,jsonResponses});assert.equal(c.status,'error');assert.equal(c.pagination.complete,false);
 assert.ok(!JSON.stringify([r,missing,c]).includes('private upstream diagnostic'));
});

test('shared browser admission returns busy and recovers after concurrent reads finish',async()=>{
 let unblock;const gate=new Promise(r=>{unblock=r});
 const read=createSocialMetricsReader({executablePath:'/test/chrome',getProxy:async()=>{await gate;return null;}});
 const a=read(target),b=read(target);await new Promise(r=>setImmediate(r));
 const third=await read(target);assert.equal(third.status,'busy');assert.equal(third.retryAfterMs,3000);
 unblock();await Promise.all([a,b]);assert.equal((await read(target)).reason,'PROXY_REQUIRED');
});
test('wrong keywords types fail before upstream, expired/foreign cursors are not replayed',async t=>{
 let calls=0;const base=await serve(t,[createSocialContentRouter({read:async x=>{calls++;return contentBase(x);}})]);
 for(const body of [{platform:'threads',keyword:'a',keywords:'a'},{platform:'threads',keyword:'a',cursor:'nonexistent'}]){
  const response=await post(base,'/api/social/search',body);assert.equal(response.status,400);
 }
 assert.equal(calls,0);
});
