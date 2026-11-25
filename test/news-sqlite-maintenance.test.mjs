import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {ThreeFlowState} from '../src/newsFlow/threeFlowState.mjs';
import {ThreeFlowRuntime} from '../src/newsFlow/threeFlowRuntime.mjs';
import {articleKey} from '../src/newsFlow/identity.mjs';
import {newsSqliteDiagnostics} from '../src/newsFlow/sqliteDiagnostics.mjs';
const memory=()=>new ThreeFlowState(new DatabaseSync(':memory:'));
const domain='publisher.test',url='https://publisher.test/story-123456.html';
const registry=seeds=>({sources:new Map([[domain,{domain,seeds,config:{},quality:{}}]])});

test('seed startup does no writes when sources already exist and bounds new-source transactions',()=>{
 const s=memory();try{const r=registry(Array.from({length:350},(_,i)=>'https://publisher.test/category-'+i));let sizes=[];const original=s.tx.bind(s);s.tx=(fn,op)=>original(()=>{const before=s.db.prepare('SELECT count(*) n FROM seed_sources').get().n;const result=fn();sizes.push(s.db.prepare('SELECT count(*) n FROM seed_sources').get().n-before);return result;},op);
 assert.equal(s.syncSeeds(r).added,350);assert(sizes.every(n=>n<=100));sizes=[];s.db.prepare("UPDATE seed_sources SET status='fail'").run();assert.equal(s.syncSeeds(r).added,0);assert.equal(sizes.length,0);assert.equal(s.db.prepare("SELECT count(*) n FROM seed_sources WHERE status='fail'").get().n,350);
 }finally{s.close();}
});

test('startup recovery and retention queries use selective indexes instead of scanning large tables under a write lock',()=>{
 const s=memory();try{
 const queries=[["SELECT cycle,url_key FROM requests WHERE state='fetching'",'news_requests_fetching'],['SELECT id FROM events WHERE at<? LIMIT 100','news_events_age'],["SELECT id FROM tasks INDEXED BY news_tasks_terminal_age WHERE created<? AND state IN ('done','held','skipped') LIMIT 100",'news_tasks_terminal_age']];
 for(const [sql,index]of queries){const plan=s.db.prepare('EXPLAIN QUERY PLAN '+sql).all(...(sql.includes('?')?[Date.now()]:[])).map(v=>v.detail).join(' ');assert(plan.includes(index),plan);}
 }finally{s.close();}
});

test('bounded cleanup preserves active work, refreshed findtime and retention boundaries',async()=>{
 const s=memory(),now=Date.now(),old=now-31*86400000;try{
 for(const [u,status,time]of [[url,'done',old],[url+'/recent','done',now],[url+'/failed','fail',old],[url+'/pending','pending',old]]){s.discover(u,domain,time);s.db.prepare('UPDATE article_links SET parse_status=? WHERE parse_key=?').run(status,articleKey(u));}
 const tasks=s.db.prepare('INSERT INTO tasks(cycle,url,url_key,site,role,priority,state,created) VALUES(?,?,?,?,?,?,?,?)');
 for(const state of ['pending','running','done','held','skipped'])tasks.run('old-cycle',url+'/'+state,url+'/'+state,domain,'article',50,state,old);
 s.db.prepare('INSERT INTO cycles(id,started) VALUES(?,?)').run('old-cycle',old);s.db.prepare('INSERT INTO cycles(id,started) VALUES(?,?)').run('empty-cycle',old);
 for(const state of ['fetching','done'])s.db.prepare('INSERT INTO requests(cycle,url_key,state,metadata) VALUES(?,?,?,?)').run('old-cycle',state,state,'{}');
 s.db.prepare("INSERT INTO events(at,kind,details) VALUES(?,'test','{}')").run(old);s.db.prepare("INSERT INTO events(at,kind,details) VALUES(?,'test','{}')").run(now);
 const result=await s.cleanupFull(now,{onProgress:p=>{assert(!s.txDepth);if(p.phase==='selected'&&p.table==='links')s.discover(url,domain,now);}});
 assert.equal(result.linksRemoved,0);assert.equal(s.db.prepare('SELECT findtime FROM article_links WHERE parse_key=?').get(articleKey(url)).findtime,now);
 assert.deepEqual(s.db.prepare('SELECT state FROM tasks ORDER BY state').all().map(r=>r.state),['pending','running']);
 assert.deepEqual(s.db.prepare('SELECT state FROM requests').all().map(r=>r.state),['fetching']);assert.equal(s.db.prepare('SELECT id FROM cycles').get().id,'old-cycle');assert.equal(s.db.prepare('SELECT count(*) n FROM events').get().n,1);
 }finally{s.close();}
});

test('cleanup releases its write lock between batches so an independent connection can commit heartbeats',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'news-cleanup-test-')),file=path.join(dir,'state.sqlite');let s,other;try{
 s=await ThreeFlowState.open(file);const now=Date.now();s.db.prepare("WITH RECURSIVE n(i) AS(SELECT 1 UNION ALL SELECT i+1 FROM n WHERE i<350) INSERT INTO events(at,kind,details) SELECT ?,'old','{}' FROM n").run(now-8*86400000);
 other=new DatabaseSync(file);other.exec('PRAGMA busy_timeout=1');let heartbeats=0,ticked=false;setImmediate(()=>ticked=true);
 const r=await s.cleanupFull(now,{onProgress:p=>{assert(!s.txDepth);other.prepare("INSERT INTO flow_meta(key,value) VALUES('heartbeat',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(String(++heartbeats));if(p.phase==='write')assert(p.deleted.events<=p.writeBatches*100);}});
 assert(ticked);assert.equal(r.deleted.events,350);assert.equal(r.writeBatches,4);assert(heartbeats>=8);assert.equal(s.db.prepare('SELECT count(*) n FROM events').get().n,0);
 }finally{other?.close();s?.close();fs.rmSync(dir,{recursive:true,force:true});}
});

test('parse workers continue during maintenance and the master still waits for its queue to empty',async()=>{
 const s=memory();let release,processed=false;try{s.discover(url,domain);s.cleanupFull=async()=>{await new Promise(resolve=>release=resolve);return {deleted:{},writeBatches:0};};
 const runtime=new ThreeFlowRuntime({role:'article',workers:1,state:s,registry:registry([]),driver:{pool:{bindings:new Map()}},processor:{process:async t=>{processed=true;s.finish(t,'held','missing_body');release();}},once:true});
 await runtime.run();assert(processed);assert.equal(s.db.prepare('SELECT parse_status FROM article_links').get().parse_status,'fail');assert.equal(s.master('article').added,0);
 }finally{s.close();}
});

test('stopping maintenance leaves remaining expired rows for cleanup without retrying URL work',async()=>{
 const s=memory(),now=Date.now();try{s.db.prepare("WITH RECURSIVE n(i) AS(SELECT 1 UNION ALL SELECT i+1 FROM n WHERE i<250) INSERT INTO events(at,kind) SELECT ?,'old' FROM n").run(now-8*86400000);let stop=false;
 const r=await s.cleanupFull(now,{onProgress:p=>{if(p.phase==='write')stop=true;},shouldStop:()=>stop});assert.equal(r.cancelled,true);assert.equal(s.db.prepare('SELECT count(*) n FROM events').get().n,150);assert.equal(s.db.prepare('SELECT count(*) n FROM tasks').get().n,0);
 }finally{s.close();}
});

test('maintenance lock errors report their operation without exposing SQL or credentials',()=>{
 const s=memory();try{const original=s.db.exec.bind(s.db);s.db.exec=sql=>{if(sql==='BEGIN IMMEDIATE')throw Object.assign(Error('secret SQL'),{code:'ERR_SQLITE_ERROR',errcode:5});return original(sql);};assert.throws(()=>s.tx(()=>{},'cleanup_events'),e=>{const r=newsSqliteDiagnostics(e);assert.equal(r.sqlite.operation,'cleanup_events');assert(!JSON.stringify(r).includes('secret'));return true;});}finally{s.close();}
});
