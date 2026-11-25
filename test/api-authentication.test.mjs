import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {once} from 'node:events';
import {createPublicApiApp} from '../src/routes/publicApiApp.js';
import {createApiAuthentication} from '../src/services/apiAuthentication.js';
const key='test-only-not-a-real-secret-0123456789abcdef';
const paths=['/api/social/post/metrics','/api/social/source/posts','/api/social/post/comments','/api/social/search','/api/social/post/info','/api/social/comment/info','/api/social/resource/resolve','/api/facebook/post/share','/api/facebook/post/details'];
async function fixture(run){
 let calls=0;const read=async()=>{calls++;throw new Error('READER_MUST_NOT_BE_CALLED');};
 const app=createPublicApiApp({key,runtime:{getProxy:read,readMetrics:read,readContent:read,prepareInput:async x=>x,lookup:read,info:{postInfo:read,commentInfo:read,sourceInfo:read}},facebookReaders:{check:read,details:read}});
 const server=app.listen(0,'127.0.0.1');await once(server,'listening');
 try{await run({url:`http://127.0.0.1:${server.address().port}`,calls:()=>calls});}finally{server.closeAllConnections();await new Promise(r=>server.close(r));}
}
test('startup rejects missing, empty, weak and malformed secrets',()=>{
 for(const value of ['',null,'weak','x'.repeat(513),'x'.repeat(40)+'\n','x'.repeat(32)+' space'])assert.throws(()=>createApiAuthentication({key:value}),/AUTHEN_KEY/);
 assert.equal(typeof createApiAuthentication({key}),'function');
});
for(const path of paths)test(`auth gates ${path} before parsing/downstream calls`,()=>fixture(async({url,calls})=>{
 for(const authorization of [undefined,'Bearer '+key+'bad','Basic '+Buffer.from(key).toString('base64'),'Bearer wrong','Bearer '+key+', Bearer '+key]){
  const r=await fetch(url+path,{method:'POST',headers:authorization?{authorization,'content-type':'application/json'}:{'content-type':'application/json'},body:'{broken-json'});
  assert.equal(r.status,401);assert.equal(r.headers.get('cache-control'),'no-store');assert.match(r.headers.get('www-authenticate'),/^Bearer/);
  const body=await r.json();assert.deepEqual(body,{status:'unauthorized',reason:'AUTHENTICATION_REQUIRED'});assert.equal(JSON.stringify(body).includes(key),false);
 }
 assert.equal(calls(),0);
}));
test('valid Bearer accesses health, invalid key is indistinguishable from missing key',()=>fixture(async({url})=>{
 const r=await fetch(url+'/api/health',{headers:{authorization:'Bearer '+key}});assert.equal(r.status,200);assert.deepEqual(await r.json(),{status:'ok'});assert.equal(r.headers.get('x-powered-by'),null);
 for(const suffix of ['/api/health','/','/api/unknown'])assert.equal((await fetch(url+suffix)).status,401);
 assert.equal((await fetch(url+'/api/unknown',{headers:{authorization:'Bearer '+key}})).status,404);
}));
test('query/body/X-API-Key/forwarded headers cannot authenticate',()=>fixture(async({url,calls})=>{
 for(const headers of [{},{'x-api-key':key},{'x-forwarded-for':'127.0.0.1','x-forwarded-user':'admin'}]){
  const r=await fetch(url+'/api/social/post/info?AUTHEN_KEY_FOR_DOMAIN='+encodeURIComponent(key),{method:'POST',headers:{...headers,'content-type':'application/json'},body:JSON.stringify({AUTHEN_KEY_FOR_DOMAIN:key})});assert.equal(r.status,401);
 }
 assert.equal(calls(),0);
}));
test('duplicate Authorization rejected even when first value is correct',()=>fixture(async({url})=>{
 const status=await new Promise((resolve,reject)=>{const req=http.request(url+'/api/health',{headers:['Host',new URL(url).host,'Authorization','Bearer '+key,'Authorization','Bearer '+key]},res=>{res.resume();res.on('end',()=>resolve(res.statusCode));});req.on('error',reject);req.end();});assert.equal(status,401);
}));
test('valid key reaches each API input validator instead of auth gate',()=>fixture(async({url})=>{
 for(const path of paths){const r=await fetch(url+path,{method:'POST',headers:{authorization:'Bearer '+key,'content-type':'application/json'},body:'{}'});assert.equal(r.status,400,path);}
}));
