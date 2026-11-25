import test from 'node:test';import assert from 'node:assert/strict';import {DatabaseSync} from 'node:sqlite';import {gzipSync,gunzipSync} from 'node:zlib';import {createHash} from 'node:crypto';
import {ThreeFlowState} from '../src/newsFlow/threeFlowState.mjs';import {NewsSeedDiscoveryPool} from '../src/newsFlow/seedDiscoveryPool.mjs';import {NewsHttpDriver,NewsProxyPool} from '../src/newsFlow/transport.mjs';
const url='https://publisher.test/story-123456.html',site={siteName:'publisher.test',siteId:'publisher.test',registrableDomain:'publisher.test'},html='<html><title>Original native news headline</title><h1>Original native news headline</h1><article>'+('Original paragraph with facts. '.repeat(100))+'</article></html>',registry={sources:new Map([['publisher.test',{domain:'publisher.test',seeds:[url]}]])};
const memory=()=>new ThreeFlowState(new DatabaseSync(':memory:'));
function article(s){s.discover(url,site.siteName);s.master('article');const t=s.claim('article');s.capture.set(t.cycle+'|'+t.url_key,html);return t;}
function begins(s){let count=0;const exec=s.db.exec.bind(s.db);s.db.exec=q=>{if(q==='BEGIN IMMEDIATE')count++;return exec(q);};return ()=>count;}

test('HTML CPU preparation supplies the exact full sample and does not store compressed bytes in request metadata',async()=>{
 const s=memory(),pool=new NewsSeedDiscoveryPool({workers:1});try{s.syncSeeds(registry);s.master('seed');const t=s.claim('seed'),network={request:async()=>({statusCode:200,headers:{'content-type':'text/html'},data:Buffer.from(html),networkElapsedMs:10,completedAt:Date.now()})},proxies=new NewsProxyPool([{host:'127.0.0.1',port:12345,username:'test',password:'test'}]),driver=new NewsHttpDriver({state:s,pool:proxies,network,pageValidator:pool,allowedDomains:[site.siteName],siteCooldown:false});
 const page=await driver.get(t.cycle,t.url,site,[],{taskRole:'seed',pagePreparation:{domain:site.siteName,seeds:[],config:site,article:false}});assert.equal(page.error,null);assert.equal(gunzipSync(page.prepared.result.reviewSample.compressed).toString(),html);assert(s.preparedReviewSamples.has(t.cycle+'|'+t.url_key));
 const metadata=s.db.prepare('SELECT metadata FROM requests').get().metadata;assert(!metadata.includes('compressed'));assert(!metadata.includes('reviewSample'));s.samplePayload=()=>assert.fail('main thread must not recompress a worker-prepared sample');s.finish(t,'done','links_found');assert.equal(gunzipSync(s.db.prepare('SELECT html FROM review_samples').get().html).toString(),html);assert.equal(s.preparedReviewSamples.size,0);
 }finally{await pool.close();s.close();}
});

test('precompressed evidence is accepted only for matching original captured HTML',()=>{
 const s=memory();try{const t=article(s);assert.equal(s.prepareReviewSample(t,{htmlHash:'wrong',compressed:gzipSync('other')}),false);assert.equal(s.preparedReviewSamples.size,0);assert.equal(s.prepareReviewSample(t,{htmlHash:createHash('sha256').update(html).digest('hex'),compressed:gzipSync(html)}),true);s.samplePayload=()=>assert.fail('cached sample should be used');s.finish(t,'held','missing_body');assert.equal(gunzipSync(s.db.prepare('SELECT html FROM review_samples').get().html).toString(),html);}finally{s.close();}
});

test('verified content, parse done and verified event commit together once with original evidence prepared outside the lock',()=>{
 const s=memory();try{const t=article(s),count=begins(s),sync=s.db.prepare('PRAGMA synchronous').get().synchronous,original=s.samplePayload.bind(s);let compressions=0;s.samplePayload=data=>{assert(!s.txDepth);compressions++;return original(data);};
 s.completeVerified(t,{_id:'a'.repeat(32),_index:'master202646',_type:'newsTopic',_source:{url}},site,[url],{cycle:t.cycle,url,site:site.siteName});assert.equal(count(),1);assert.equal(compressions,1);assert.equal(s.db.prepare('SELECT count(*) n FROM outbox').get().n,1);assert.equal(s.db.prepare('SELECT parse_status FROM article_links').get().parse_status,'done');assert.equal(s.db.prepare('SELECT state FROM tasks').get().state,'done');assert.equal(s.db.prepare("SELECT count(*) n FROM events WHERE kind='verified'").get().n,1);assert.equal(s.db.prepare('PRAGMA synchronous').get().synchronous,sync);assert.equal(s.master('article').added,0);
 }finally{s.close();}
});

test('a failure to commit verified completion cannot leave an outbox item or a parse done status',()=>{
 const s=memory();try{const t=article(s);s.db.exec("CREATE TRIGGER fail_verified BEFORE INSERT ON events WHEN NEW.kind='verified' BEGIN SELECT RAISE(ABORT,'verification_log_failed'); END");assert.throws(()=>s.completeVerified(t,{_id:'b'.repeat(32),_index:'master202646',_type:'newsTopic',_source:{url}},site,[url],{cycle:t.cycle,url,site:site.siteName}),e=>e.code==='ERR_SQLITE_ERROR');assert.equal(s.db.prepare('SELECT count(*) n FROM outbox').get().n,0);assert.equal(s.db.prepare('SELECT parse_status FROM article_links').get().parse_status,'running');assert.equal(s.db.prepare('SELECT state FROM tasks').get().state,'running');}finally{s.close();}
});

test('failure and seed completion each use one transaction without reopening the URL job',()=>{
 for(const role of ['article','seed']){const s=memory();try{let t;if(role==='article')t=article(s);else{s.syncSeeds(registry);s.master('seed');t=s.claim('seed');s.capture.set(t.cycle+'|'+t.url_key,html);}const count=begins(s),record={cycle:t.cycle,url:t.url,site:t.site};if(role==='article')s.completeHeld(t,'missing_body',{...record,reason:'missing_body'});else s.completeSeed(t,'links_found',{...record,links:1});assert.equal(count(),1);assert.equal(s.db.prepare('SELECT state FROM tasks').get().state,role==='article'?'held':'done');if(role==='article')assert.equal(s.master('article').added,0);}finally{s.close();}}
});

test('diagnostic rows retain original timestamps and commit with completion while discoveries are persisted immediately',()=>{
 const s=memory();try{const t=article(s),details={cycle:t.cycle,url:t.url,site:t.site};s.enqueueBatch(t.cycle,[url+'/related'],site.siteName,'article',t.url);assert.equal(s.db.prepare("SELECT count(*) n FROM article_links WHERE url LIKE '%related'").get().n,1);
 const at=Date.now();s.recordTaskEvent(t,'article_links',{...details,links:1,beforeParsing:true});s.recordTaskEvent(t,'article_parse',{...details,parserRoundTripMs:123});assert.equal(s.db.prepare("SELECT count(*) n FROM events WHERE kind IN ('article_links','article_parse')").get().n,0);const count=begins(s);s.completeHeld(t,'missing_body',{...details,reason:'missing_body'});assert.equal(count(),1);const events=s.db.prepare('SELECT kind,at,details FROM events ORDER BY id').all();assert.deepEqual(events.map(r=>r.kind),['article_links','article_parse','quarantine']);assert(events[0].at>=at);assert(events[0].at<=events[2].at);assert.equal(JSON.parse(events[1].details).parserRoundTripMs,123);assert.equal(s.pendingTaskEvents.size,0);assert.equal(s.db.prepare('SELECT parse_status FROM article_links WHERE url=?').get(url).parse_status,'fail');
 }finally{s.close();}
});
