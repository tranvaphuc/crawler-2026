import test from 'node:test';import assert from 'node:assert/strict';import {DatabaseSync} from 'node:sqlite';
import fs from 'node:fs/promises';import os from 'node:os';import path from 'node:path';
import {ThreeFlowState} from '../src/newsFlow/threeFlowState.mjs';
import {ThreeFlowReview} from '../src/newsFlow/threeFlowReview.mjs';
import {NewsProcessor} from '../src/newsFlow/processor.mjs';
import {loadNewsRegistry} from '../src/newsFlow/registry.mjs';
import {initializeOriginalBranch,originalHost,recordOriginalLink,admitOriginalArticles,refreshOriginalSources,registerOriginalSources,reconcileOriginalArticles} from '../src/newsFlow/baomoiOriginalBranch.mjs';
import {qualifyOriginalSource} from '../src/newsFlow/originalSourceQualification.mjs';
import {NewsRepairPool} from '../src/web/newsRepairPool.mjs';
const memory=()=>{const s=new ThreeFlowState(new DatabaseSync(':memory:'));initializeOriginalBranch(s.db);return s;};
const config=host=>({siteName:host,siteId:host,registrableDomain:host,allowedHosts:[host,'www.'+host],homepage:'https://'+host+'/',discovery:{homepage:'https://'+host+'/'}});
const result=(id,url)=>({ok:true,articleId:String(id),baomoiUrl:`https://baomoi.com/story-c${id}.epi`,originalUrl:url});

test('health registry includes qualified dynamic publishers without writing to the database',async()=>{
 const {dir,registry:r}=await emptyRegistry(),s=memory();try{
  const c=config('newpublisher.vn');s.db.prepare('INSERT INTO baomoi_original_sources VALUES(?,?,?,?,?)').run(c.siteName,'active',JSON.stringify(c),'{}',1);
  s.db.exec('PRAGMA query_only=ON');
  assert.equal(registerOriginalSources(s.db,r),1);assert.equal(r.sources.size,1);
  assert.equal(registerOriginalSources(s.db,r),0);
  assert.equal(s.db.prepare('SELECT count(*) n FROM seed_sources').get().n,0);
 }finally{s.close();await fs.rm(dir,{recursive:true,force:true});}
});
async function emptyRegistry(){const dir=await fs.mkdtemp(path.join(os.tmpdir(),'original-registry-'));return {dir,registry:await loadNewsRegistry({directory:dir,qualityFile:path.join(dir,'missing.json')})};}

test('durable provenance deduplicates references, normalized originals and existing sources without reopening failures',async()=>{
 const {dir,registry:r}=await emptyRegistry(),s=memory();try{
  r.register(config('publisher.vn'));s.configureSites(r.sources.values());
  const url='https://publisher.vn/original-123456.html';
  recordOriginalLink(s,result(1,url));recordOriginalLink(s,result(2,'http://www.publisher.vn/original-123456.html?utm_source=baomoi'));recordOriginalLink(s,result(1,url));
  assert.equal(s.db.prepare('SELECT count(*) n FROM baomoi_original_refs').get().n,2);
  assert.equal(s.db.prepare('SELECT count(*) n FROM baomoi_original_articles').get().n,1);
  assert.equal(recordOriginalLink(s,result(1,'https://publisher.vn/other-123457.html')),false);
  assert.equal(admitOriginalArticles(s,r),1);assert.equal(admitOriginalArticles(s,r),0);
  s.db.prepare("UPDATE article_links SET parse_status='fail',error='publisher_removed'").run();
  s.db.prepare("UPDATE baomoi_original_articles SET status='pending'").run();
  assert.equal(admitOriginalArticles(s,r),0);assert.equal(s.db.prepare('SELECT parse_status FROM article_links').get().parse_status,'fail');
  assert.equal(r.register({...config('publisher.vn'),title:{strategy:'changed'}}).config.title,undefined);
  assert.equal(r.sources.size,1);
 }finally{s.close();await fs.rm(dir,{recursive:true,force:true});}
});
test('native identity ledger prevents a differently slugged original from becoming another article',async()=>{
 const {dir,registry:r}=await emptyRegistry(),s=memory();try{const c=config('publisher.vn');r.register(c);s.configureSites(r.sources.values());s.bind({_index:'master202647',_type:'newsTopic',_id:'existing-id'},['https://publisher.vn/old-slug-123456.html'],c);recordOriginalLink(s,result(3,'https://publisher.vn/new-slug-123456.html'));assert.equal(admitOriginalArticles(s,r),0);assert.equal(s.db.prepare('SELECT status FROM baomoi_original_articles').get().status,'existing');assert.equal(s.db.prepare('SELECT count(*) n FROM article_links').get().n,0);}finally{s.close();await fs.rm(dir,{recursive:true,force:true});}
});
test('historical ES originals are reconciled across weekly indexes before queue admission and failed lookups never admit unchecked articles',async()=>{
 const {dir,registry:r}=await emptyRegistry(),s=memory();try{r.register(config('publisher.vn'));s.configureSites(r.sources.values());const u='https://publisher.vn/history-123456.html';recordOriginalLink(s,result(5,u));assert.equal(admitOriginalArticles(s,r,100,{requireEsCheck:true}),0);await assert.rejects(reconcileOriginalArticles(s,r,{search:async()=>{throw Error('unavailable');}}));assert.equal(admitOriginalArticles(s,r,100,{requireEsCheck:true}),0);let query;const es={search:async q=>{query=q;return {hits:{total:2,hits:[{_index:'master202647',_type:'newsTopic',_id:'old-id',_source:{url:'http://www.publisher.vn/history-123456.html'}},{_index:'master202646',_type:'newsTopic',_id:'older-id',_source:{url:u}}]}};}};assert.equal(await reconcileOriginalArticles(s,r,es),1);assert.equal(query.index,'master*');assert(query.body.query.terms.url.includes('http://www.publisher.vn/history-123456.html'));assert.equal(admitOriginalArticles(s,r,100,{requireEsCheck:true}),0);assert.equal(s.db.prepare('SELECT status FROM baomoi_original_articles').get().status,'existing');}finally{s.close();await fs.rm(dir,{recursive:true,force:true});}
});
test('FireAnt variants are rejected at evidence recording and dynamic registration; unsafe URLs are rejected',async()=>{
 const {dir,registry:r}=await emptyRegistry(),s=memory();try{for(const host of ['fireant.vn','www.fireant.vn','news.fireant.vn','FireAnt.VN.']){assert.equal(originalHost('https://'+host+'/article'),null);assert.equal(recordOriginalLink(s,result(4,'https://'+host+'/article')),false);assert.throws(()=>r.register(config(host)));}for(const url of ['http://127.0.0.1/a','https://[::1]/a','https://news.local/a','https://publisher.vn:444/a','https://user:pass@publisher.vn/a'])assert.equal(originalHost(url),null);assert.equal(s.db.prepare('SELECT count(*) n FROM baomoi_original_sources').get().n,0);}finally{s.close();await fs.rm(dir,{recursive:true,force:true});}
});
test('qualified sources survive restart and refresh both seeds and the HTTP allowlist once',async()=>{
 const {dir,registry:r}=await emptyRegistry(),s=memory();try{const c=config('newpublisher.vn');s.db.prepare('INSERT INTO baomoi_original_sources VALUES(?,?,?,?,?)').run(c.siteName,'active',JSON.stringify(c),'{}',1);const driver={allowed:new Set()};assert.equal(refreshOriginalSources(s,r,driver),1);assert.equal(refreshOriginalSources(s,r,driver),0);assert(driver.allowed.has(c.siteName));assert.equal(s.db.prepare('SELECT count(*) n FROM seed_sources').get().n,1);assert.equal(r.byUrl(c.homepage).config.publicationValidationPolicy,'strict_native_publication_v1');const reload=await loadNewsRegistry({directory:dir,qualityFile:path.join(dir,'missing.json')});assert.equal(refreshOriginalSources(s,reload,driver),1);}finally{s.close();await fs.rm(dir,{recursive:true,force:true});}
});
test('Baomoi evidence is captured before a page error terminates the normal parse',async()=>{
 let captured=0,held=0;const s={configureSites(){}};const p=new NewsProcessor({state:s,registry:{sources:new Map([['baomoi.com',{domain:'baomoi.com',config:{}}]])},onBaomoiOriginal:()=>captured++});p.transport=()=>({get:async()=>({error:'publisher_removed'})});p.hold=()=>held++;await p.process({site:'baomoi.com',role:'article',url:'https://baomoi.com/story-c123456.epi'});assert.equal(captured,1);assert.equal(held,1);
});
test('existing overspent AI ledger blocks requests without changing accumulated usage',async()=>{
 const s=memory();try{const day=new Date().toISOString().slice(0,10);s.db.prepare('INSERT INTO ai_usage VALUES(?,?,?)').run(day,204,2.8093045);let calls=0;const review=new ThreeFlowReview({state:s,registry:{},apiKey:'mock',pool:{proxies:[]},budgetUSD:2,maxCalls:200,httpPost:()=>calls++});assert.deepEqual(await review.ask([]),{budget:true});assert.equal(calls,0);assert.equal(s.db.prepare('SELECT usd FROM ai_usage').get().usd,2.8093045);assert.equal(new ThreeFlowReview({state:s,registry:{},apiKey:'mock',pool:{proxies:[]},budgetUSD:10,maxCalls:200}).reserve(),null);}finally{s.close();}
});

const title=i=>`Original publisher headline number ${i} for independent validation`;
const html=i=>`<html><head><title>${title(i)}</title><link rel="canonical" href="https://freshpublisher.vn/story-${123450+i}.html"><meta property="og:title" content="${title(i)}"><meta property="article:published_time" content="2026-11-19T08:00:00+07:00"><meta name="description" content="Original independent introduction for story ${i} from the publisher."><script type="application/ld+json">${JSON.stringify({'@type':'NewsArticle',headline:title(i),url:`https://freshpublisher.vn/story-${123450+i}.html`,datePublished:'2026-11-19T08:00:00+07:00',description:`Original independent introduction for story ${i} from the publisher.`})}</script></head><body><h1>${title(i)}</h1><article class="article-body"><p>Original independent introduction for story ${i} from the publisher.</p>${Array.from({length:6},(_,j)=>`<p>Story ${i} paragraph ${j} reports the original public events and observations. Several local representatives discussed the specific developments and described their plans for the coming period. The publication provides further background and verified facts for its readers, with a separate account of the relevant details for this particular report.</p>`).join('')}</article></body></html>`;
test('source activation needs working discovery and three distinct full pages with a frozen parser',async()=>{
 const {dir,registry:r}=await emptyRegistry(),parsers=new NewsRepairPool(1,new URL('../src/web/newsDeepAuditWorker.mjs',import.meta.url));try{const urls=[1,2,3].map(i=>`https://freshpublisher.vn/story-${123450+i}.html`);const get=async url=>({html:url.endsWith('/')?urls.map((u,i)=>`<h2><a href="${u}">${title(i+1)}</a></h2>`).join(''):html(Number(url.match(/(\d+)\.html/)[1])-123450),finalUrl:url,statusCode:200});const out=await qualifyOriginalSource({host:'freshpublisher.vn',urls,get,parsers,registry:r});assert.equal(out.approved,true,JSON.stringify(out.report));assert.equal(out.report.qualification.holdouts.length,2);assert.equal(out.report.paidAiCalls,0);const failed=await qualifyOriginalSource({host:'freshpublisher.vn',urls,get:async url=>url.endsWith('/')?{html:'<html>Empty listing</html>',finalUrl:url}:get(url),parsers,registry:r});assert.equal(failed.approved,false);assert(failed.report.qualification.reasons.includes('no_working_article_discovery_seed'));}finally{await parsers.close();await fs.rm(dir,{recursive:true,force:true});}
});
