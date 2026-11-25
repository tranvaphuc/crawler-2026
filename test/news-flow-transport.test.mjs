import test from 'node:test';import assert from 'node:assert/strict';import http from 'node:http';import {once} from 'node:events';import {DatabaseSync} from 'node:sqlite';
import {NewsState} from '../src/newsFlow/state.mjs';import {NewsProxyPool,NewsHttpDriver} from '../src/newsFlow/transport.mjs';
async function fixture(handler,options={}){const hits=[],server=http.createServer((req,res)=>{hits.push({url:req.url,auth:req.headers['proxy-authorization'],headers:req.headers});handler(req,res);});server.listen(0,'127.0.0.1');await once(server,'listening');const state=new NewsState(new DatabaseSync(':memory:'));const pool=new NewsProxyPool([{id:'test-proxy',host:'127.0.0.1',port:server.address().port,username:'test-user',password:'test-password'}]);const driver=new NewsHttpDriver({state,pool,allowedDomains:['publisher.test'],spacingMs:0,timeoutMs:1000,...options});const site={siteName:'publisher.test',registrableDomain:'publisher.test'};return {state,pool,driver,site,hits,server,close:async()=>{server.closeAllConnections();await new Promise(r=>server.close(r));state.close();}};}
const html='<html><head><title>Public article page</title></head><body><h1>A public page</h1><p>'+('A complete public article body. '.repeat(20))+'</p></body></html>';

test('article deadlines get one alternate-proxy attempt under the same reservation',async()=>{
 const state=new NewsState(new DatabaseSync(':memory:'));
 const pool=new NewsProxyPool(['first','second'].map(id=>({id,host:'127.0.0.1',port:1234,username:'test',password:'test'})),{rotation:'request'});
 const hits=[],url='https://publisher.test/article',site={siteName:'publisher.test'};
 const network={request:async({proxy})=>{
  hits.push(proxy.id);
  if(hits.length!==2)return {error:'request_deadline_exceeded',networkElapsedMs:5000};
  return {statusCode:200,headers:{'content-type':'text/html'},data:Buffer.from(html),networkElapsedMs:20,completedAt:Date.now()};
 }};
 const driver=new NewsHttpDriver({state,pool,network,allowedDomains:[site.siteName],siteCooldown:false,retryArticleTimeout:true});
 try{
  const opts={taskRole:'article'};
  const [first,shared]=await Promise.all([driver.get('round',url,site,[],opts),driver.get('round',url,site,[],opts)]);
  assert.equal(first.error,null);
  assert.equal(shared,first);
  assert.equal(first.articleTimeoutRetried,true);
  assert.deepEqual(hits,['first','second']);
  assert.equal(state.failedUrl(url),false);
  const failed=await driver.get('round','https://publisher.test/another',site,[],{taskRole:'article'});
  assert.equal(failed.error,'request_deadline_exceeded');
  assert.equal(hits.length,4);
  await driver.get('round','https://publisher.test/category',site,[],{taskRole:'seed'});
  assert.equal(hits.length,5);
 }finally{state.close();}
});

test('production timeout defaults to five seconds and a caller cannot raise the cap',()=>{const state=new NewsState(new DatabaseSync(':memory:'));try{const options={state,pool:{},allowedDomains:['publisher.test']};assert.equal(new NewsHttpDriver(options).timeoutMs,5000);assert.equal(new NewsHttpDriver({...options,timeoutMs:15000}).timeoutMs,5000);assert.equal(new NewsHttpDriver({...options,timeoutMs:100}).timeoutMs,100);assert.throws(()=>new NewsHttpDriver({...options,timeoutMs:NaN}),/INVALID_HTTP_TIMEOUT/);}finally{state.close();}});
test('a stalled response is aborted at the five-second deadline and is not requested again in its round',async()=>{const f=await fixture(()=>{},{timeoutMs:15000});try{const start=Date.now(),r=await f.driver.get('timeout','http://publisher.test/stall',f.site),elapsed=Date.now()-start;assert.equal(r.error,'request_deadline_exceeded');assert.equal(r.timeoutMs,5000);assert(elapsed>=4700&&elapsed<7000,'deadline elapsed '+elapsed);assert(!r.html);assert.equal(f.state.request('timeout','http://publisher.test/stall').state,'failed');assert.equal(f.pool.bad.size,0);await f.driver.get('timeout','http://publisher.test/stall',f.site);assert.equal(f.hits.length,1);}finally{await f.close();}});
test('the deadline aborts a body that keeps sending bytes before the idle timeout',async()=>{const f=await fixture((req,res)=>{res.writeHead(200,{'Content-Type':'text/html'});res.write('<html><body>');const timer=setInterval(()=>res.write('still downloading '),20);res.on('close',()=>clearInterval(timer));},{timeoutMs:150});try{const start=Date.now(),r=await f.driver.get('drip','http://publisher.test/drip',f.site);assert.equal(r.error,'request_deadline_exceeded');assert(Date.now()-start<1200);assert(!r.html);assert.equal(f.pool.bad.size,0);}finally{await f.close();}});
test('the total deadline also aborts a proxy CONNECT that never completes',async()=>{const f=await fixture(()=>{},{timeoutMs:150}),sockets=[];f.server.on('connect',(req,socket)=>sockets.push(socket));try{const start=Date.now(),r=await f.driver.get('connect','https://publisher.test/stall',f.site);assert.equal(r.error,'request_deadline_exceeded');assert(Date.now()-start<1200);assert.equal(sockets.length,1);assert.equal(f.pool.bad.size,0);}finally{for(const s of sockets)s.destroy();await f.close();}});
test('proxy accepts bounded 32KiB response headers and rejects headers exceeding 64KiB',async()=>{const f=await fixture((req,res)=>{res.writeHead(200,{'Content-Type':'text/html','X-Large':new URL(req.url).pathname==='/oversized'?'x'.repeat(80000):'x'.repeat(32000)});res.end(html);});try{const normal=await f.driver.get('a','http://publisher.test/article',f.site);assert.equal(normal.error,null);assert.equal(normal.html,html);const huge=await f.driver.get('a','http://publisher.test/oversized',f.site);assert.equal(huge.error,'HPE_HEADER_OVERFLOW');assert.equal(f.hits.length,2);}finally{await f.close();}});
test('HTTP proxy auth and concurrent calls issue one wire request per URL per round',async()=>{const f=await fixture((req,res)=>{res.setHeader('Content-Type','text/html');res.end(html);});try{const responses=await Promise.all(Array.from({length:8},()=>f.driver.get('a','http://publisher.test/article',f.site)));assert(responses.every(r=>r.html===html));assert.equal(f.hits.length,1);assert.equal(f.hits[0].auth,'Basic '+Buffer.from('test-user:test-password').toString('base64'));await f.driver.get('a','http://publisher.test/article',f.site);assert.equal(f.hits.length,1);await f.driver.get('b','http://publisher.test/article',f.site);assert.equal(f.hits.length,2);}finally{await f.close();}});
test('same-host redirect does not deadlock and each target is fetched once',async()=>{const f=await fixture((req,res)=>{if(new URL(req.url).pathname==='/old'){res.writeHead(302,{Location:'/article'});res.end();}else{res.setHeader('Content-Type','text/html');res.end(html);}});try{const r=await f.driver.get('a','http://publisher.test/old',f.site);assert.equal(r.finalUrl,'http://publisher.test/article');assert.equal(r.html,html);await f.driver.get('a','http://publisher.test/article',f.site);assert.equal(f.hits.length,2);}finally{await f.close();}});
test('simultaneous reciprocal redirects terminate without waiting on each other',async()=>{const f=await fixture((req,res)=>{res.writeHead(302,{Location:new URL(req.url).pathname==='/a'?'/b':'/a'});res.end();});try{const rows=await Promise.all(['/a','/b'].map(p=>f.driver.get('a','http://publisher.test'+p,f.site)));assert(rows.every(r=>r.error));assert.equal(f.hits.length,2);}finally{await f.close();}});
test('304 reuses persisted body and sends ETag on subsequent round',async()=>{const f=await fixture((req,res)=>{if(req.headers['if-none-match']){res.writeHead(304);res.end();}else{res.writeHead(200,{'Content-Type':'text/html',ETag:'"v1"'});res.end(html);}});try{await f.driver.get('a','http://publisher.test/article',f.site);const r=await f.driver.get('b','http://publisher.test/article',f.site);assert.equal(r.statusCode,304);assert.equal(r.html,html);assert.equal(f.hits[1].headers['if-none-match'],'"v1"');}finally{await f.close();}});
test('publisher 429 pauses host without proxy rotation or repeat request in the round',async()=>{const f=await fixture((req,res)=>{res.writeHead(429,{'Retry-After':'120'});res.end('rate limited');});try{const r=await f.driver.get('a','http://publisher.test/article',f.site);assert.equal(r.error,'rate_limited');assert(f.state.hostWait('publisher.test')>Date.now()+100000);await f.driver.get('a','http://publisher.test/article',f.site);assert.equal(f.hits.length,1);await assert.rejects(f.driver.get('b','http://publisher.test/other',f.site),/COOLDOWN/);assert.equal(f.pool.bad.size,0);}finally{await f.close();}});

test('three-flow HTTP failures finish without site waiting, retries or new cooldown records',async()=>{
 for(const status of [403,429]){
  const f=await fixture((req,res)=>{res.writeHead(status,{'Retry-After':'3600'});res.end('blocked');},{siteCooldown:false});
  try{
   f.state.hostPause('publisher.test',Date.now()+3600000,'old_cooldown');const before=f.state.hostWait('publisher.test');
   f.site.publisherCrawlPolicy={crawlDelaySeconds:7200};
   const a=await f.driver.get('a','http://publisher.test/blocked',f.site);assert.equal(a.statusCode,status);
   const b=await f.driver.get('a','http://publisher.test/next',f.site);assert.equal(b.statusCode,status);
   await f.driver.get('b','http://publisher.test/blocked',f.site);
   assert.equal(f.hits.length,2,'failed URL must not be requested again');
   assert.equal(f.state.hostWait('publisher.test'),before,'old cooldown ignored and not extended');
   assert.equal(f.driver.hosts.size,0,'no per-site pacing queue');
  }finally{await f.close();}
 }
});

test('three-flow HTTP requests for distinct URLs of one site run concurrently',async()=>{
 let entered=0,release;const both=new Promise(r=>release=r);
 const f=await fixture(async(req,res)=>{if(++entered===2)release();await both;res.setHeader('Content-Type','text/html');res.end(html);},{siteCooldown:false});
 try{
  const result=await Promise.all(['/first','/second'].map(p=>f.driver.get('parallel','http://publisher.test'+p,f.site)));
  assert(result.every(p=>p.html===html),'both requests must reach server before either response completes');
  assert.equal(f.state.db.prepare('SELECT count(*) n FROM host_limits').get().n,0);
 }finally{release();await f.close();}
});
test('missing proxy, unconfigured redirects and budget exhaustion never fall back to direct HTTP',async()=>{const f=await fixture((req,res)=>{res.writeHead(302,{Location:'http://127.0.0.1/private'});res.end();},{maxWireRequests:1});try{const r=await f.driver.get('a','http://publisher.test/article',f.site);assert.equal(r.error,'NEWS_UNSAFE_TARGET_URL');await assert.rejects(f.driver.get('a','http://publisher.test/other',f.site),/BUDGET/);assert.equal(f.hits.length,1);f.pool.bindings.clear();f.pool.quarantine('test-proxy');await assert.rejects(f.driver.get('b','http://publisher.test/unseen',f.site),/POOL_UNAVAILABLE/);assert.equal(f.hits.length,1);assert.equal(f.state.request('a','http://publisher.test/other'),undefined);}finally{await f.close();}});
test('approved literal cookie handshake completes once and the round remains deduplicated',async()=>{const bootstrap='<html><body><script>document.cookie="D1N='+('a'.repeat(32))+'"+"; expires=Fri, 13 Nov 2026 20:00:00 GMT; path=/";window.location.reload(true);</script></body></html>';const f=await fixture((req,res)=>{res.setHeader('Content-Type','text/html');res.end(req.headers.cookie?html:bootstrap);},{allowedDomains:['laodong.vn']});try{const site={siteName:'laodong.vn',registrableDomain:'laodong.vn'},r=await f.driver.get('a','http://laodong.vn/article',site);assert.equal(r.error,null);assert.equal(r.html,html);assert.equal(f.hits.length,2);await f.driver.get('a','http://laodong.vn/article',site);assert.equal(f.hits.length,2);const second=await f.driver.get('b','http://laodong.vn/article',site);assert.equal(second.html,html);assert.equal(f.hits.length,3);assert.equal(f.hits[1].headers.cookie,'D1N='+('a'.repeat(32)));}finally{await f.close();}});
