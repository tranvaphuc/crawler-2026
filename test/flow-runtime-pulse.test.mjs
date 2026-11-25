import test from 'node:test';import assert from 'node:assert/strict';import fs from'node:fs/promises';import os from'node:os';import path from'node:path';import{setTimeout as sleep}from'node:timers/promises';
import{startFlowRuntimePulse}from'../src/services/flowRuntimePulse.js';
test('runtime pulse stays fresh while a coordinator awaits unrelated I/O and stops cleanly',async t=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'flow-pulse-')),file=path.join(dir,'pulse.json');let samples=0,phase='cleanup';const pulse=startFlowRuntimePulse({file,intervalMs:5,extra:()=>({coordinator:{phase}}),onSample:()=>samples++});t.after(async()=>{await pulse.close();await fs.rm(dir,{recursive:true,force:true});});
 let release;const blocked=new Promise(r=>release=r);let finished=false;void blocked.then(()=>finished=true);
 for(let i=0;i<100&&samples<2;i++)await sleep(10);
 assert.ok(samples>=2);assert.equal(finished,false);const stored=JSON.parse(await fs.readFile(file));assert.equal(stored.coordinator.phase,'cleanup');assert.equal(stored.pid,process.pid);assert.ok(Date.now()-Date.parse(stored.at)<1000);
 phase='idle';release();await pulse.sampleNow();await pulse.close();const count=samples;await sleep(20);assert.equal(samples,count);
});
test('pulse write failure is isolated and a later sample recovers without stopping work',async t=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'flow-pulse-recover-')),parent=path.join(dir,'later'),file=path.join(parent,'pulse.json'),errors=[];const pulse=startFlowRuntimePulse({file,intervalMs:60000,onError:e=>errors.push(e.code)});t.after(async()=>{await pulse.close();await fs.rm(dir,{recursive:true,force:true});});
 await pulse.sampleNow();assert.deepEqual(errors,['ENOENT']);await fs.mkdir(parent);await pulse.sampleNow();assert.equal(JSON.parse(await fs.readFile(file)).pid,process.pid);
});
