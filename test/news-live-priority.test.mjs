import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {ThreeFlowState} from '../src/newsFlow/threeFlowState.mjs';
import {admitLiveWork} from '../src/newsFlow/liveAdmission.mjs';
import {admitCategoryBackfill} from '../src/newsFlow/categoryBackfillAdmission.mjs';
import {articleKey} from '../src/newsFlow/identity.mjs';

function fixture(){const state=new ThreeFlowState(new DatabaseSync(':memory:')),sources=['a.test','b.test'].map(domain=>({domain,seeds:['https://'+domain+'/','https://'+domain+'/archive'],config:{siteName:domain,siteId:domain,homepage:'https://'+domain+'/',http:{maxConcurrentArticles:1}}}));state.configureSites(sources);return {state,registry:{sources:new Map(sources.map(s=>[s.domain,s]))}};}
function cohort(state,url){state.discover(url,new URL(url).host,1);state.db.prepare('INSERT INTO news_category_backfill(parse_key,site,url,found_on,discovered_at) VALUES(?,?,?,?,?)').run(articleKey(url),new URL(url).host,url,new URL(url).origin+'/archive',1);}

test('live articles enter a busy historical cycle without duplicate tasks, terminal resets or AI usage',async()=>{
 const {state,registry}=fixture();try{
  cohort(state,'https://a.test/history');await admitCategoryBackfill(state,registry,{now:2});
  state.discover('https://a.test/latest','a.test',3);state.discover('https://b.test/failed','b.test',3);state.db.exec("UPDATE article_links SET parse_status='fail' WHERE site='b.test';INSERT INTO ai_usage VALUES('2026-11-23',141,1.96)");
  assert.equal(state.master('article',4).reason,'queue_not_empty');assert.equal((await admitLiveWork(state,'article',4)).added,1);
  assert.equal((await admitLiveWork(state,'article',5)).added,0);assert.equal(state.claim('article').url,'https://a.test/latest');
  assert.equal(state.claim('article'),null,'publisher concurrency remains enforced');assert.equal(state.db.prepare("SELECT parse_status FROM article_links WHERE site='b.test'").get().parse_status,'fail');
  assert.equal(state.db.prepare('SELECT calls FROM ai_usage').get().calls,141);assert.equal(state.db.prepare('SELECT usd FROM ai_usage').get().usd,1.96);
 }finally{state.close();}
});

test('continuous live arrivals cannot starve historical work and rotation covers live publishers',async()=>{
 const {state,registry}=fixture();try{
  cohort(state,'https://a.test/history');await admitCategoryBackfill(state,registry,{now:2});for(let i=0;i<10;i++)state.discover('https://'+(i%2?'a.test':'b.test')+'/latest-'+i,i%2?'a.test':'b.test',3+i);
  await admitLiveWork(state,'article',20);const tasks=[];for(let i=0;i<5;i++){const task=state.claim('article');tasks.push(task);state.finish(task,'done','test');}
  assert.deepEqual(tasks.map(t=>t.priority),[100,100,100,100,50]);assert.equal(new Set(tasks.slice(0,4).map(t=>t.site)).size,2);
 }finally{state.close();}
});

test('live admission spans multiple atomic batches and resumes without duplicate cycles or URLs',async()=>{
 const {state}=fixture();try{
  for(let i=0;i<1005;i++)state.discover('https://a.test/item-'+i,'a.test',1);
  assert.equal((await admitLiveWork(state,'article',2)).added,1005);
  assert.equal(state.db.prepare('SELECT count(DISTINCT cycle) n FROM tasks').get().n,1);
  assert.equal((await admitLiveWork(state,'article',3)).added,0);
 }finally{state.close();}
});

test('homepage and RSS cannot poll or be promoted during an unfinished seed round',async()=>{
 const {state,registry}=fixture();try{
  registry.sources.get('a.test').seeds.push('https://a.test/rss/latest.rss');state.syncSeeds(registry);const round=state.master('seed',1);
  state.db.exec("UPDATE tasks SET state='done' WHERE url='https://a.test/'");
  const before=state.db.prepare('SELECT count(*) n FROM tasks').get().n;
  const result=await admitLiveWork(state,'seed',Date.now()+86400000);
  assert.equal(result.added,0);assert.equal(result.promoted,0);assert.equal(state.master('seed').reason,'queue_not_empty');
  assert.equal(state.db.prepare('SELECT count(*) n FROM tasks').get().n,before);
  assert.equal(state.db.prepare('SELECT count(*) n FROM tasks WHERE cycle=? AND priority=100').get(round.cycle).n,before);
 }finally{state.close();}
});

test('a slow archive publisher cannot reset live publisher rotation while live arrivals continue',async()=>{
 const state=new ThreeFlowState(new DatabaseSync(':memory:')),sources=[...Array.from({length:10},(_,i)=>'a'+i+'.test'),'zzz.test'].map(domain=>({domain,seeds:[],config:{siteName:domain}})),registry={sources:new Map(sources.map(s=>[s.domain,s]))};try{
  state.configureSites(sources);for(let i=0;i<5;i++)cohort(state,'https://zzz.test/old-'+i);await admitCategoryBackfill(state,registry,{now:2});
  for(const s of sources.slice(0,10))state.discover('https://'+s.domain+'/first',s.domain,3);await admitLiveWork(state,'article',4);
  const liveSites=[];for(let i=0;i<12;i++){const task=state.claim('article');if(task.priority===100){liveSites.push(task.site);state.discover('https://'+task.site+'/next-'+i,task.site,5+i);await admitLiveWork(state,'article',20+i);}state.finish(task,'done','test');}
  assert.equal(new Set(liveSites).size,10);
 }finally{state.close();}
});
