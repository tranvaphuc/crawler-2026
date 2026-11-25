import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {Worker} from 'node:worker_threads';
import {once} from 'node:events';
import {DatabaseSync} from 'node:sqlite';
import {ThreeFlowState} from '../src/newsFlow/threeFlowState.mjs';
import {ThreeFlowRuntime} from '../src/newsFlow/threeFlowRuntime.mjs';
import {NewsWriterRuntime} from '../src/newsFlow/writerRuntime.mjs';
import {NewsCreateOnlySink} from '../src/newsFlow/createOnlySink.mjs';
import {NewsHttpDriver,NewsProxyPool} from '../src/newsFlow/transport.mjs';
import {isNewsSqliteContention,newsSqliteTransaction,waitForNewsSqlite} from '../src/newsFlow/sqliteContention.mjs';
import {sha,toEs5News} from '../src/newsFlow/identity.mjs';

const busy=()=>Object.assign(Error('fixture lock'),{code:'ERR_SQLITE_ERROR',errcode:5});
const site={siteName:'publisher.test',siteId:'publisher.test',registrableDomain:'publisher.test'};
const url='https://publisher.test/native-123456.html';
const memory=()=>new ThreeFlowState(new DatabaseSync(':memory:'));
function failBegins(state,count){
 const exec=state.db.exec.bind(state.db);let remaining=count;
 state.db.exec=sql=>{if(sql==='BEGIN IMMEDIATE'&&remaining-->0)throw busy();return exec(sql);};
 return ()=>{state.db.exec=exec;};
}
function document(){return toEs5News({_source:{url,title:'A verified native publisher headline',content:'Complete native publisher text. '.repeat(40),description:'Native publisher provided description.',publishedDate:new Date(Date.now()-60000).toISOString(),siteId:site.siteId,siteName:site.siteName},extracted:{datePrecision:'second',dateEvidence:'native-original',dateTimezone:'explicit_offset',authorWasFallback:true}},site);}
function esFixture(){
 const properties={};for(const key of ['title','content','description'])properties[key]={type:'text'};for(const key of ['author','authorId','siteId','siteName','url','picture'])properties[key]={type:'keyword'};for(const key of ['likes','comments','shares','interactions'])properties[key]={type:'integer'};for(const key of ['publishedDate','insertedDate'])properties[key]={type:'date'};properties.ds={properties:{source:{type:'keyword'}}};
 const calls={bulk:0},docs=[];
 return {calls,docs,info:async()=>({version:{number:'5.6.4'},cluster_uuid:'contention-fixture'}),indices:{getMapping:async({index})=>({[index]:{mappings:{newsTopic:{properties}}}})},bulk:async({body})=>{calls.bulk++;const ref=body[0].create;docs.push({...ref,_source:body[1],_version:1});return {items:[{create:{...ref,status:201,result:'created',_version:1}}]};}};
}
function sink(state,es){return new NewsCreateOnlySink({state,es,write:true,proof:{summary:{verified:true,clusterFingerprint:sha('contention-fixture')}}});}
async function diskFixture(){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'news-sqlite-contention-')),file=path.join(dir,'state.sqlite'),state=await ThreeFlowState.open(file),workers=[];
 return {state,file,async hold(ms=6300){
  const worker=new Worker(`const {parentPort,workerData}=require('node:worker_threads');const {DatabaseSync}=require('node:sqlite');const db=new DatabaseSync(workerData.file);db.exec('PRAGMA busy_timeout=5000; BEGIN IMMEDIATE');parentPort.postMessage('locked');setTimeout(()=>{db.exec('COMMIT');db.close();parentPort.close();},workerData.ms);`,{eval:true,workerData:{file,ms},execArgv:[]});
  workers.push(worker);await once(worker,'message');
 },async close(){for(const worker of workers)await worker.terminate();await state.writeBatch?.close();state.close();const absolute=path.resolve(dir);assert(absolute.startsWith(path.resolve(os.tmpdir())+path.sep)&&path.basename(absolute).startsWith('news-sqlite-contention-'));fs.rmSync(absolute,{recursive:true,force:true});}};
}

test('only primary SQLITE_BUSY/LOCKED codes qualify; constraints and I/O failures never retry',()=>{
 for(const errcode of [5,6,261,517])assert(isNewsSqliteContention({code:'ERR_SQLITE_ERROR',errcode}));
 for(const errcode of [1,10,19])assert(!isNewsSqliteContention({code:'ERR_SQLITE_ERROR',errcode}));
 assert(!isNewsSqliteContention({code:'ECONNRESET',errcode:5}));
});

test('transaction waits before BEGIN, commits once, and never repeats an entered callback',async()=>{
 const state=memory();let restore;try{
  restore=failBegins(state,2);let calls=0,waits=0;
  await newsSqliteTransaction(state,()=>{calls++;state.db.prepare("INSERT INTO flow_meta VALUES('fixture','committed')").run();},{sleep:async()=>{},onWait:()=>waits++});
  assert.equal(calls,1);assert.equal(waits,2);assert.equal(state.db.prepare("SELECT value FROM flow_meta WHERE key='fixture'").get().value,'committed');restore();
  calls=0;await assert.rejects(newsSqliteTransaction(state,()=>{calls++;state.db.prepare("INSERT INTO flow_meta VALUES('rolled-back','value')").run();throw busy();}),/NOT_REPLAYABLE/);
  assert.equal(calls,1);assert.equal(state.db.prepare("SELECT 1 FROM flow_meta WHERE key='rolled-back'").get(),undefined);
 }finally{restore?.();state.close();}
});

test('expired ownership fences a waiting transaction before any database mutation',async()=>{
 const state=memory();let restore;try{restore=failBegins(state,1);let live=true,calls=0;await assert.rejects(newsSqliteTransaction(state,()=>calls++,{guard:()=>{if(!live)throw Error('LEASE_LOST');},sleep:async()=>{live=false;}}),/LEASE_LOST/);assert.equal(calls,0);}finally{restore?.();state.close();}
});

test('SQLite transactions reject async callbacks before they can start external work',async()=>{
 const state=memory();let calls=0;try{await assert.rejects(newsSqliteTransaction(state,async()=>{calls++;}),/ASYNC_TRANSACTION/);assert.equal(calls,0);}finally{state.close();}
});

test('transaction rechecks ownership after BEGIN returns, including time spent inside the busy handler',async()=>{
 const state=memory();let live=true,calls=0;const original=state.tx.bind(state);try{
  state.tx=(fn,operation)=>original(()=>{live=false;return fn();},operation);
  await assert.rejects(newsSqliteTransaction(state,()=>calls++,{guard:()=>{if(!live)throw Error('LEASE_LOST_AFTER_BEGIN');}}),/LEASE_LOST_AFTER_BEGIN/);
  assert.equal(calls,0);assert.doesNotThrow(()=>state.db.exec('BEGIN IMMEDIATE; ROLLBACK'));
 }finally{state.close();}
});

test('local retry deadline is bounded and non-contention errors propagate immediately',async()=>{
 let at=0,calls=0;await assert.rejects(waitForNewsSqlite(()=>{calls++;throw busy();},{now:()=>at,maxWaitMs:100,sleep:async()=>{at+=50;}}),e=>e.errcode===5);assert.equal(calls,3);
 calls=0;await assert.rejects(waitForNewsSqlite(()=>{calls++;throw Object.assign(Error('constraint'),{code:'ERR_SQLITE_ERROR',errcode:19});}),e=>e.errcode===19);assert.equal(calls,1);
});

test('parse batching retains FIFO jobs during acquisition contention and invokes each callback once',async()=>{
 const state=memory();let restore;try{
  const batch=state.enableWriteBatching();batch.contention={guard:()=>{},delayMs:1};restore=failBegins(state,2);const seen=[];
  const rows=await Promise.all([1,2,3].map(i=>state.writeAsync(()=>{seen.push(i);state.db.prepare('INSERT INTO flow_meta VALUES(?,?)').run('job-'+i,String(i));return i;})));
  assert.deepEqual(rows,[1,2,3]);assert.deepEqual(seen,[1,2,3]);assert.equal(batch.stats().sqliteBusyRetries,2);assert.equal(state.db.prepare('SELECT count(*) n FROM flow_meta').get().n,3);
 }finally{restore?.();await state.writeBatch?.close();state.close();}
});

test('parse never retries COMMIT or a callback after it has acquired the writer lock',async()=>{
 const state=memory();const exec=state.db.exec.bind(state.db);let calls=0;try{
  const batch=state.enableWriteBatching();batch.contention={guard:()=>{}};state.db.exec=sql=>{if(sql==='COMMIT')throw busy();return exec(sql);};
  await assert.rejects(state.writeAsync(()=>{calls++;state.db.prepare("INSERT INTO flow_meta VALUES('uncommitted','value')").run();}),e=>e.errcode===5);
  assert.equal(calls,1);assert.equal(batch.stats().sqliteBusyRetries,0);assert.equal(state.db.prepare('SELECT count(*) n FROM flow_meta').get().n,0);
 }finally{state.db.exec=exec;await state.writeBatch?.close();state.close();}
});

test('parse rechecks ownership after waiting and fences callbacks when the lease expired',async()=>{
 const state=memory();let restore;try{
  const batch=state.enableWriteBatching();let live=true,calls=0;batch.contention={guard:()=>{if(!live)throw Error('LEASE_LOST');},delayMs:1,onWait:()=>{live=false;}};restore=failBegins(state,1);
  await assert.rejects(state.writeAsync(()=>{calls++;state.db.prepare("INSERT INTO flow_meta VALUES('fenced','value')").run();}),/LEASE_LOST/);
  assert.equal(calls,0);assert.equal(state.db.prepare('SELECT count(*) n FROM flow_meta').get().n,0);
 }finally{restore?.();await state.writeBatch?.close();state.close();}
});

test('parse fences ownership that expired while BEGIN was acquiring the lock',async()=>{
 const state=memory();const original=state.tx.bind(state);let live=true,calls=0;try{
  state.enableWriteBatching().contention={guard:()=>{if(!live)throw Error('LEASE_LOST_AFTER_BEGIN');}};
  state.tx=(fn,operation)=>original(()=>{live=false;return fn();},operation);
  await assert.rejects(state.writeAsync(()=>calls++),/LEASE_LOST_AFTER_BEGIN/);assert.equal(calls,0);assert.doesNotThrow(()=>state.db.exec('BEGIN IMMEDIATE; ROLLBACK'));
 }finally{await state.writeBatch.close();state.close();}
});

test('a real lock lasting over five seconds preserves the downloaded response without another HTTP request',{timeout:15000},async()=>{
 const f=await diskFixture(),state=f.state;let requests=0;try{
  state.enableWriteBatching().contention={guard:()=>{}};
  const pool=new NewsProxyPool([{host:'127.0.0.1',port:1234,username:'fixture',password:'fixture'}]);
  const network={request:async()=>{requests++;await f.hold();return {statusCode:200,headers:{'content-type':'text/html'},data:Buffer.from('<html><h1>A native publisher page</h1><article>'+'Complete native text. '.repeat(50)+'</article></html>'),networkElapsedMs:1,completedAt:Date.now()};}};
  const driver=new NewsHttpDriver({state,pool,network,allowedDomains:[site.siteName],siteCooldown:false});
  const result=await driver.get('fixture',url,site,[],{taskRole:'article'});
  assert.equal(requests,1);assert.equal(result.error,null);assert(result.html.includes('Complete native text.'));assert.equal(state.db.prepare('SELECT state FROM requests').get().state,'done');assert(state.writeBatch.stats().sqliteBusyRetries>=1);
 }finally{await f.close();}
});

test('direct writer retries only the local claim before ES and increments attempts once',async()=>{
 const state=memory(),es=esFixture(),d=document();let restore;try{
  state.offer(d,site,[url]);restore=failBegins(state,2);const direct=sink(state,es);let waits=0;direct.onSqliteWait=()=>waits++;
  await direct.flush();assert.equal(waits,2);assert.equal(es.calls.bulk,1);assert.equal(es.docs[0]._version,1);assert.equal(state.db.prepare('SELECT status FROM import_receipts').get().status,'created');
 }finally{restore?.();state.close();}
});

test('a real lock after successful bulk waits for the receipt commit and never sends bulk again',{timeout:15000},async()=>{
 const f=await diskFixture(),state=f.state,es=esFixture(),d=document();try{
  state.offer(d,site,[url]);const bulk=es.bulk;es.bulk=async args=>{const reply=await bulk(args);await f.hold();return reply;};const direct=sink(state,es);let waits=0;direct.onSqliteWait=()=>waits++;
  await direct.flush();assert(waits>=1);assert.equal(es.calls.bulk,1);assert.equal(es.docs.length,1);assert.equal(es.docs[0]._version,1);assert.equal(state.db.prepare('SELECT count(*) n FROM outbox').get().n,0);assert.equal(state.db.prepare('SELECT status FROM import_receipts').get().status,'created');
 }finally{await f.close();}
});

test('lost ES acknowledgement is held locally through contention without resending the bulk',async()=>{
 const state=memory(),es=esFixture(),d=document();let restore;try{
  state.offer(d,site,[url]);const bulk=es.bulk;es.bulk=async args=>{await bulk(args);restore=failBegins(state,1);throw Error('ACK_LOST');};
  const direct=sink(state,es);await direct.flush();await direct.flush();assert.equal(es.calls.bulk,1);assert.equal(es.docs[0]._version,1);const row=state.db.prepare('SELECT state,doc,attempts FROM outbox').get();assert.equal(row.state,'held');assert.equal(row.attempts,2,'one claim and one held transition; no extra transition for the lock wait');assert(row.doc.includes('Complete native publisher text.'));assert.equal(state.db.prepare('SELECT count(*) n FROM import_receipts').get().n,0);
 }finally{restore?.();state.close();}
});

test('ownership lost while confirming bulk leaves payload sending and never repeats ES',async()=>{
 const state=memory(),es=esFixture(),d=document();let restore;try{
  state.offer(d,site,[url]);let live=true;const bulk=es.bulk;es.bulk=async args=>{const reply=await bulk(args);restore=failBegins(state,1);return reply;};const direct=sink(state,es);direct.beforeWrite=()=>{if(!live)throw Error('WRITER_LEASE_LOST');};direct.onSqliteWait=()=>{live=false;};
  await assert.rejects(direct.flush(),/WRITER_LEASE_LOST/);assert.equal(es.calls.bulk,1);assert.equal(es.docs[0]._version,1);assert.equal(state.db.prepare('SELECT state FROM outbox').get().state,'sending');assert.equal(state.db.prepare('SELECT count(*) n FROM import_receipts').get().n,0);
 }finally{restore?.();state.close();}
});

test('no-retry writer defers a contended heartbeat while ownership is still valid',async t=>{
 t.mock.timers.enable({apis:['setInterval']});const state=memory();let release,entered;const gate=new Promise(r=>release=r),ready=new Promise(r=>entered=r);let flushes=0;
 try{
  const renew=state.heartbeat.bind(state);let first=true;state.heartbeat=(...args)=>{if(first){first=false;throw busy();}return renew(...args);};
  const runtime=new NewsWriterRuntime({state,noRetry:true,once:true,sink:{write:true,initialize:async()=>{},flush:async()=>{flushes++;entered();await gate;return 0;}}});
  const running=runtime.run();await ready;t.mock.timers.tick(20000);release();const report=await running;assert.equal(flushes,1);assert.equal(report.sqliteBusyRetries,1);assert.equal(runtime.stopped,false);
 }finally{release?.();t.mock.timers.reset();state.close();}
});

test('article master resumes a local acquisition failure without reopening URL work or changing seed queue',async()=>{
 const state=memory();try{
  const source={domain:site.siteName,seeds:['https://publisher.test/'],config:site,quality:{}},registry={sources:new Map([[source.domain,source]])};state.configureSites([source]);state.master('seed');const seedRows=state.db.prepare("SELECT * FROM tasks WHERE role='seed'").all();state.discover(url,source.domain);let fail=true,requests=0;const master=state.masterFull.bind(state);state.masterFull=async(...args)=>{if(args[0]==='article'&&fail){fail=false;throw busy();}return master(...args);};
  const runtime=new ThreeFlowRuntime({role:'article',workers:1,state,registry,once:true,driver:{pool:{bindings:new Map()}},processor:{process:async task=>{requests++;state.finish(task,'done','non_article:fixture');}}});await runtime.run();assert.equal(requests,1);assert.equal(runtime.sqliteBusyRetries,1);assert.deepEqual(state.db.prepare("SELECT * FROM tasks WHERE role='seed'").all(),seedRows);
 }finally{state.close();}
});
