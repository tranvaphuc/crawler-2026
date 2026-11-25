import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import assert from 'node:assert/strict';import {pathToFileURL} from 'node:url';import {Worker} from 'node:worker_threads';import {once} from 'node:events';
import {ThreeFlowState} from '../src/newsFlow/threeFlowState.mjs';
const OldState=process.argv[2]?(await import(pathToFileURL(path.resolve(process.argv[2])))).ThreeFlowState:ThreeFlowState;
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'news-maintenance-benchmark-')),file=path.join(dir,'state.sqlite');let state,worker;
const now=Date.now(),registry={sources:new Map([['publisher.test',{domain:'publisher.test',seeds:Array.from({length:13239},(_,i)=>'https://publisher.test/category-'+i)}]])};
try{
 state=await OldState.open(file);state.syncSeeds(registry);state.db.prepare("INSERT INTO cycles(id,started) VALUES('fixture',?)").run(now);
 const payload=JSON.stringify({padding:'x'.repeat(1024)});
 state.db.prepare("WITH RECURSIVE n(i) AS(SELECT 1 UNION ALL SELECT i+1 FROM n WHERE i<100000) INSERT INTO requests(cycle,url_key,state,metadata) SELECT 'fixture','url-'||i,'done',? FROM n").run(payload);
 state.db.prepare("WITH RECURSIVE n(i) AS(SELECT 1 UNION ALL SELECT i+1 FROM n WHERE i<300000) INSERT INTO events(at,kind,details) SELECT ?,'fixture',? FROM n").run(now,payload);
 state.close();state=null;const results={};
 for(const [label,State] of [['before',OldState],['after',ThreeFlowState]]){
  state=await State.open(file);let maxHoldMs=0,transactions=0;const tx=state.tx.bind(state);state.tx=(fn,op)=>{let acquired;try{return tx(()=>{acquired=performance.now();return fn();},op);}finally{if(acquired!==undefined){transactions++;maxHoldMs=Math.max(maxHoldMs,performance.now()-acquired);}}};
  worker=new Worker(`const {parentPort,workerData}=require('node:worker_threads');const {DatabaseSync}=require('node:sqlite');const db=new DatabaseSync(workerData);db.exec('PRAGMA busy_timeout=1000');let writes=0,failures=0,maxMs=0;const q=db.prepare("INSERT INTO flow_meta(key,value) VALUES('heartbeat',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value");function beat(){const at=performance.now();try{q.run(String(++writes));}catch{failures++;}maxMs=Math.max(maxMs,performance.now()-at);}beat();const timer=setInterval(beat,5);parentPort.postMessage('ready');parentPort.on('message',()=>{clearInterval(timer);parentPort.postMessage({writes,failures,maxMs});db.close();parentPort.close();});`,{eval:true,workerData:file});
  await once(worker,'message');const started=performance.now(),operations={};
  for(const [name,fn] of [['syncSeeds',()=>state.syncSeeds(registry)],['recoverRole',()=>state.recoverRole('article')],['cleanup',()=>label==='after'?state.cleanupFull(now):state.cleanup(now)]]){const at=performance.now();const value=await fn();operations[name]={durationMs:Math.round(performance.now()-at),value};}
  const durationMs=Math.round(performance.now()-started),reply=once(worker,'message'),exit=once(worker,'exit');worker.postMessage('stop');const [heartbeat]=await reply;await exit;worker=null;
  results[label]={durationMs,maxHoldMs:Math.round(maxHoldMs),transactions,operations,independentWriter:heartbeat};state.close();state=null;
 }
 assert.equal(results.after.independentWriter.failures,0);assert(results.after.maxHoldMs<1000);console.log(JSON.stringify({fixture:{requests:100000,events:300000,seeds:13239},...results}));
}finally{await worker?.terminate();state?.close();const resolved=path.resolve(dir);assert(resolved.startsWith(path.resolve(os.tmpdir())+path.sep)&&path.basename(resolved).startsWith('news-maintenance-benchmark-'));fs.rmSync(resolved,{recursive:true,force:true});}
