import test from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {setTimeout as sleep} from 'node:timers/promises';
import {createPublicApiApp} from '../src/routes/publicApiApp.js';
import {createHttpExecutor} from '../src/services/socialHttpTransport.js';
import {contentBase} from '../src/services/socialContent.js';
import {apiRequestContext} from '../src/services/apiRequestContext.js';

const key='fixture-api-stability-key-0123456789abcdef';
const postUrl='https://www.youtube.com/watch?v=abcdefghijk';
const never=()=>new Promise(()=>{});
async function until(check){for(let i=0;i<200;i++){if(check())return;await sleep(5);}assert.fail('condition did not settle');}
async function fixture(t,{runtime={},...options}={}){
 const getProxy=Object.assign(async()=>null,{managed:true,status:async()=>({status:'ok',apiReservedKeyCount:4})});
 const defaults={getProxy,prepareInput:async b=>b,readMetrics:async()=>({status:'partial',metrics:{likes:1}}),readContent:async target=>({...contentBase(target),status:'partial'}),lookup:async()=>{throw Object.assign(Error('missing'),{status:404});},info:{postInfo:async()=>({status:'partial',identityVerified:true,post:{id:'abcdefghijk'}}),sourceInfo:async()=>({status:'resolved'}),commentInfo:async ref=>({status:'partial',identityVerified:true,comment:{id:ref.id}})}};
 const app=createPublicApiApp({key,runtime:{...defaults,...runtime},facebookReaders:{check:async()=>({ok:true,status:'resolved'}),details:async()=>({ok:true,status:'resolved'})},...options});
 const server=app.listen(0,'127.0.0.1');await once(server,'listening');t.after(()=>{server.closeAllConnections();return new Promise(resolve=>server.close(resolve));});
 const base=`http://127.0.0.1:${server.address().port}`;
 const request=(path,body,options={})=>fetch(base+path,{method:body?'POST':'GET',headers:{authorization:'Bearer '+key,'content-type':'application/json'},...(body?{body:JSON.stringify(body)}:{}),...options});
 return{request};
}

test('admission bounds preparation, queues a burst FIFO, and resumes after the first reads',async t=>{
 let release;const held=new Promise(resolve=>{release=resolve;});const prepared=[];
 const f=await fixture(t,{runtime:{prepareInput:async body=>{prepared.push(body.orderTag);if(body.orderTag<2)await held;return body;}},requestTimeoutMs:2000,queueTimeoutMs:1000,maxQueued:2});
 const pending=[0,1].map(orderTag=>f.request('/api/social/post/metrics',{url:postUrl,orderTag}));await until(()=>prepared.length===2);
 pending.push(...[2,3].map(orderTag=>f.request('/api/social/post/metrics',{url:postUrl,orderTag})));
 await sleep(20);assert.deepEqual(prepared,[0,1]);
 const overflow=await f.request('/api/social/post/metrics',{url:postUrl,orderTag:4});assert.equal(overflow.status,503);
 assert.equal((await overflow.json()).reason,'REQUEST_CAPACITY');release();
 for(const response of await Promise.all(pending))assert.equal(response.status,200);
 assert.deepEqual(prepared,[0,1,2,3]);
 const status=await(await f.request('/api/runtime/status')).json(),metrics=status.routes.find(r=>r.name==='metrics');assert.equal(metrics.active,0);assert.equal(metrics.queued,0);assert.equal(metrics.rejected,1);
});

test('a hung prepare times out, releases both slots, and cannot write a late response',async t=>{
 let release;const held=new Promise(resolve=>{release=resolve;});let hold=true;
 const f=await fixture(t,{requestTimeoutMs:80,queueTimeoutMs:200,runtime:{prepareInput:async body=>{if(hold)await held;return body;}}});
 const replies=await Promise.all([f.request('/api/social/post/metrics',{url:postUrl}),f.request('/api/social/post/metrics',{url:postUrl})]);
 for(const response of replies){assert.equal(response.status,504);assert.equal((await response.json()).reason,'REQUEST_TIMEOUT');}
 hold=false;release();await sleep(10);
 assert.equal((await f.request('/api/social/post/metrics',{url:postUrl})).status,200);
 const s=await(await f.request('/api/runtime/status')).json();assert.equal(s.routes.find(r=>r.name==='metrics').timedOut,2);
});

test('queued requests expire without starting ES/upstream preparation',async t=>{
 let prepared=0;const f=await fixture(t,{requestTimeoutMs:180,queueTimeoutMs:25,runtime:{prepareInput:async()=>{prepared++;return never();}}});
 const active=[f.request('/api/social/post/metrics',{url:postUrl}),f.request('/api/social/post/metrics',{url:postUrl})];await until(()=>prepared===2);
 const queued=await f.request('/api/social/post/metrics',{url:postUrl});assert.equal(queued.status,503);assert.equal(prepared,2);await Promise.all(active);
});

test('slow source reads do not consume comments/search admission',async t=>{
 let sources=0;const f=await fixture(t,{requestTimeoutMs:120,runtime:{readContent:async target=>{if(target.operation==='source'){sources++;return never();}return{...contentBase(target),status:'partial'};}}});
 const active=[0,1].map(()=>f.request('/api/social/source/posts',{url:'https://www.threads.com/@sample',limit:1}));await until(()=>sources===2);
 const response=await f.request('/api/social/post/comments',{url:'https://www.threads.com/@sample/post/XYZ123',limit:1});assert.equal(response.status,200);assert.equal((await response.json()).status,'partial');await Promise.all(active);
});

test('request timeout aborts upstream and releases its API lease',async t=>{
 let closed=0,released=0,started=0;
 const provider=Object.assign(async()=>({server:'http://fixture:8080',managed:true,heartbeat:async()=>{},report:async()=>({}),release:async()=>{released++;}}),{managed:true});
 const execute=createHttpExecutor({getProxy:provider,makeSession:()=>({requests:0,setDeadline(){},close(){closed++;}})});
 const f=await fixture(t,{requestTimeoutMs:60,runtime:{readMetrics:target=>execute(target,()=>{started++;return never();})}});
 const response=await f.request('/api/social/post/metrics',{url:postUrl}),value=await response.json();
 // The transport may settle its own budget just before the outer HTTP timer.
 assert.ok([200,504].includes(response.status));assert.equal(value.status,'error');assert.ok(['UPSTREAM_TIMEOUT','REQUEST_TIMEOUT'].includes(value.reason));
 await until(()=>released===1);assert.equal(started,1);assert.ok(closed>0);
});

test('disconnect cancels upstream work instead of keeping admission until its deadline',async t=>{
 let started=0,released=0;
 const provider=Object.assign(async()=>({server:'http://fixture:8080',managed:true,heartbeat:async()=>{},report:async()=>({}),release:async()=>{released++;}}),{managed:true});
 const execute=createHttpExecutor({getProxy:provider,makeSession:()=>({requests:0,setDeadline(){},close(){}})});
 const f=await fixture(t,{requestTimeoutMs:2000,runtime:{readMetrics:target=>execute(target,()=>{started++;return never();})}});
 const controller=new AbortController(),pending=f.request('/api/social/post/metrics',{url:postUrl},{signal:controller.signal});await until(()=>started===1);controller.abort();await assert.rejects(pending);await until(()=>released===1);
 const s=await(await f.request('/api/runtime/status')).json(),m=s.routes.find(r=>r.name==='metrics');assert.equal(m.active,0);assert.equal(m.aborted,1);
});

test('late acquisition after cancellation is released and never starts an upstream read',async t=>{
 let released=0,started=0;
 const provider=Object.assign(async()=>{await sleep(100);return{server:'http://fixture:8080',release:async()=>{released++;}};},{managed:true});
 const execute=createHttpExecutor({getProxy:provider,makeSession:()=>{started++;return{close(){}};}});
 const f=await fixture(t,{requestTimeoutMs:30,runtime:{readMetrics:target=>execute(target,never)}});
 const response=await f.request('/api/social/post/metrics',{url:postUrl}),value=await response.json();assert.ok([200,504].includes(response.status));assert.equal(value.status,'error');assert.ok(['UPSTREAM_TIMEOUT','REQUEST_TIMEOUT'].includes(value.reason));await until(()=>released===1);assert.equal(started,0);
});

test('a hung proxy report cannot retain admission or prevent lease cleanup after timeout',async t=>{
 let released=0;
 const provider=Object.assign(async()=>({server:'http://fixture:8080',managed:true,heartbeat:async()=>{},report:never,release:async()=>{released++;}}),{managed:true});
 const execute=createHttpExecutor({getProxy:provider,makeSession:()=>({requests:0,setDeadline(){},close(){}})});
 const f=await fixture(t,{requestTimeoutMs:50,runtime:{readMetrics:target=>execute(target,async()=>({status:'partial',metrics:{likes:1}}))}});
 assert.equal((await f.request('/api/social/post/metrics',{url:postUrl})).status,504);await until(()=>released===1);
 const s=await(await f.request('/api/runtime/status')).json();assert.equal(s.routes.find(r=>r.name==='metrics').active,0);
});

test('focused Facebook comment URL validates the comment ID and its parent separately',async t=>{
 const f=await fixture(t);
 const r=await f.request('/api/social/comment/info',{url:'https://www.facebook.com/100201629178552/posts/1131594819369667?comment_id=2162351674698872'});
 assert.equal(r.status,200);assert.equal((await r.json()).comment.id,'2162351674698872');
});

test('runtime status is protected and readiness checks the API reservation',async t=>{
 let context;const f=await fixture(t,{runtime:{getProxy:Object.assign(async()=>null,{managed:true,status:async()=>{context=apiRequestContext();return{status:'ok',apiReservedKeyCount:4};}})}});
 const ready=await f.request('/api/ready');assert.equal(ready.status,200);assert.equal((await ready.json()).status,'ready');assert.ok(context.signal);assert.ok(context.deadline>Date.now());
 const runtime=await f.request('/api/runtime/status',null,{headers:{}});assert.equal(runtime.status,401);
});
