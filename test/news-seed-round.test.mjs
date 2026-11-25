import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {ThreeFlowState} from '../src/newsFlow/threeFlowState.mjs';
import {ThreeFlowRuntime} from '../src/newsFlow/threeFlowRuntime.mjs';
import {admitLiveWork} from '../src/newsFlow/liveAdmission.mjs';
import {NewsHttpDriver,NewsProxyPool} from '../src/newsFlow/transport.mjs';

function fixture(n=3){
 const state=new ThreeFlowState(new DatabaseSync(':memory:'));
 const source={domain:'publisher.test',config:{siteName:'publisher.test'},seeds:Array.from({length:n},(_,i)=>'https://publisher.test/section-'+i),quality:{}};
 state.configureSites([source]);return {state,source};
}
function finishAll(state){let task;while((task=state.claim('seed')))state.finish(task,'held','http_500');}

test('all 31168 configured seeds enter one frozen round, including earlier failures; historical rows stay outside',()=>{
 const {state,source}=fixture(31168);try{
  state.db.prepare('INSERT INTO seed_sources(url_key,url,site,status) VALUES(?,?,?,?)').run(source.seeds[0],source.seeds[0],source.domain,'die');
  state.db.prepare('INSERT INTO seed_sources(url_key,url,site) VALUES(?,?,?)').run('https://old.test/','https://old.test/','old.test');
  const round=state.master('seed');assert.equal(round.added,31168);
  assert.equal(state.db.prepare('SELECT count(DISTINCT cycle) n FROM tasks').get().n,1);
  assert.equal(state.db.prepare('SELECT count(DISTINCT url_key) n FROM tasks').get().n,31168);
  assert.equal(state.db.prepare("SELECT count(*) n FROM tasks WHERE site='old.test'").get().n,0);
  assert.equal(JSON.parse(state.db.prepare("SELECT value FROM flow_meta WHERE key='news_seed_round_manifest'").get().value).length,31168);
 }finally{state.close();}
});

test('no homepage polling or newly configured seed can add work until the last running job finishes',async()=>{
 const {state,source}=fixture();try{
  const first=state.master('seed'),last=state.claim('seed');finishAll(state);
  source.seeds.push('https://publisher.test/new-section');
  assert.equal((await admitLiveWork(state,'seed',Date.now()+86400000)).added,0);
  assert.equal(state.master('seed').reason,'queue_not_empty');
  assert.equal(state.db.prepare('SELECT count(*) n FROM tasks').get().n,3);
  state.finish(last,'held','request_deadline_exceeded');
  const second=state.master('seed');assert.equal(second.added,4);assert.notEqual(second.cycle,first.cycle);
  assert.equal(state.db.prepare('SELECT count(DISTINCT url_key) n FROM tasks WHERE cycle=?').get(second.cycle).n,4);
 }finally{state.close();}
});

test('a failed seed is tried once per round and failure/AI ledgers are preserved across rounds',()=>{
 const {state}=fixture(1);try{
  state.db.exec("INSERT INTO ai_usage VALUES('2026-11-25',80,1.5)");
  const first=state.master('seed'),task=state.claim('seed');state.failUrl(task,'access_blocked');state.finish(task,'held','access_blocked');
  assert.equal(state.claim('seed'),null);assert.equal(state.failedUrl(task.url_key,{role:'seed',cycle:first.cycle}),true);
  const second=state.master('seed'),next=state.claim('seed');assert.notEqual(second.cycle,first.cycle);
  assert.equal(state.failedUrl(next.url_key,{role:'seed',cycle:second.cycle}),false);
  assert.equal(state.failedUrl(next.url_key,{role:'article',cycle:second.cycle}),true);
  assert.equal(state.db.prepare('SELECT count(*) n FROM url_failures').get().n,1);
  assert.equal(state.db.prepare('SELECT calls,usd FROM ai_usage').get().usd,1.5);
 }finally{state.close();}
});

test('restart closes an interrupted job and drains remaining jobs before opening another round',()=>{
 const {state}=fixture();try{
  const first=state.master('seed'),interrupted=state.claim('seed');state.recoverRole('seed');
  assert.equal(state.db.prepare('SELECT state FROM tasks WHERE id=?').get(interrupted.id).state,'held');
  assert.equal(state.master('seed').reason,'queue_not_empty');finishAll(state);
  assert.notEqual(state.master('seed').cycle,first.cycle);
 }finally{state.close();}
});

test('a failed atomic admission cannot publish a partial round',()=>{
 const {state}=fixture();try{
  state.db.exec("CREATE TRIGGER fail_round BEFORE INSERT ON tasks WHEN NEW.url LIKE '%section-1' BEGIN SELECT RAISE(ABORT,'fixture'); END");
  assert.throws(()=>state.master('seed'));
  assert.equal(state.db.prepare('SELECT count(*) n FROM tasks').get().n,0);
  assert.equal(state.db.prepare("SELECT count(*) n FROM flow_meta WHERE key='news_seed_round'").get().n,0);
 }finally{state.close();}
});

test('excluded Fireant domains cannot enter a round from either configured or historical seeds',()=>{
 const {state,source}=fixture(1);try{
  source.seeds.push('https://fireant.vn/','https://news.fireant.vn/');
  assert.equal(state.master('seed').added,1);
 }finally{state.close();}
});

test('one seed runtime round processes every URL once and reports no live polling',async()=>{
 const {state,source}=fixture(5),seen=[];try{
  const runtime=new ThreeFlowRuntime({role:'seed',workers:2,state,registry:{sources:new Map([[source.domain,source]])},driver:{timeoutMs:5000,pool:{bindings:new Map()}},once:true,processor:{process:async task=>{seen.push(task.url);state.finish(task,'held','fixture_error');},hold:()=>assert.fail('unexpected exception')}});
  await runtime.run();assert.equal(seen.length,5);assert.equal(new Set(seen).size,5);
  assert.equal(runtime.report().masterAdmission,'complete_seed_rounds');assert.equal(runtime.report().liveSeedPollMs,null);
 }finally{state.close();}
});

test('seed timeout is two seconds when configured by the seed runner and a failure never triggers an alternate-proxy retry',async()=>{
 const {state}=fixture(1),calls=[];try{
  state.master('seed');const task=state.claim('seed');
  const pool=new NewsProxyPool([{host:'127.0.0.1',port:1234,username:'fixture',password:'fixture'}]);
  const network={request:async input=>{calls.push(input);return {error:'request_deadline_exceeded',networkElapsedMs:2000,completedAt:Date.now()};}};
  const driver=new NewsHttpDriver({state,pool,network,allowedDomains:['publisher.test'],siteCooldown:false,timeoutMs:2000,retryArticleTimeout:true});
  const result=await driver.get(task.cycle,task.url,{siteName:'publisher.test'},[],{taskRole:'seed'});
  assert.equal(result.error,'request_deadline_exceeded');assert.equal(calls.length,1);assert.equal(calls[0].timeoutMs,2000);
  await driver.get(task.cycle,task.url,{siteName:'publisher.test'},[],{taskRole:'seed'});assert.equal(calls.length,1);
  state.finish(task,'held',result.error);assert.equal(state.claim('seed'),null);
 }finally{state.close();}
});
