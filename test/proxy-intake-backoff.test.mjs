import test from 'node:test';import assert from 'node:assert/strict';
import {createProxyIntakeBackoff} from '../src/services/proxyIntakeBackoff.js';
function fixture(){let at=10000,stopping=false;const timers=[],events=[],worker={active:3,closing:false,isPaused:()=>false,pause(){assert.fail('worker must never be paused')},resume(){assert.fail('worker must never be resumed')}};
 const gate=createProxyIntakeBackoff({worker,now:()=>at,shouldStop:()=>stopping,setTimer:(fn,ms)=>{const t={fn,ms};timers.push(t);return t},clearTimer:t=>t.cancelled=true,onEvent:(...args)=>events.push(args)});
 return{gate,worker,timers,events,advance:ms=>at+=ms,stop:()=>stopping=true,miss:id=>gate.observe({jobId:id,assignmentUnavailable:true}),release(){at+=3000;for(const timer of timers)timer.fn()}};
}
test('distinct empty assignments park only failing slots for a bounded wait without pausing worker intake',async()=>{
 const f=fixture();for(let i=0;i<7;i++)assert.equal(await f.miss(String(i)),false);const waiting=f.miss('7');assert.equal(f.gate.status().held,true);assert.equal(f.worker.active,3);assert.equal(f.timers[0].ms,3000);
 assert.equal(await f.gate.observe({jobId:'healthy',assignmentUnavailable:false}),false);f.release();assert.equal(await waiting,true);assert.deepEqual(f.gate.status(),{held:false,pauses:1});
});
test('one job exclusions, actual reads, native limits and old misses cannot trigger backpressure',async()=>{
 const f=fixture();for(let i=0;i<100;i++)await f.miss('same');for(let i=0;i<20;i++)await f.gate.observe({jobId:'read'+i,assignmentUnavailable:false});f.advance(1001);for(let i=0;i<7;i++)await f.miss('fresh'+i);assert.equal(f.timers.length,0);
});
test('concurrent misses share one deadline rather than extending it indefinitely',async()=>{
 const f=fixture();for(let i=0;i<7;i++)await f.miss(String(i));const waits=[f.miss('7')];f.advance(1000);for(let i=0;i<20;i++)waits.push(f.miss('later'+i));assert.equal(f.events.length,1);assert.equal(f.timers[1].ms,2000);f.release();assert((await Promise.all(waits)).every(Boolean));
});
test('shutdown cancels parked slots promptly without touching retry data or any worker pause state',async()=>{
 const f=fixture();for(let i=0;i<7;i++)await f.miss(String(i));const waiting=f.miss('7');f.stop();f.gate.close();assert.equal(await waiting,false);assert.equal(f.timers[0].cancelled,true);assert.equal(await f.miss('next'),false);assert.equal(f.gate.status().held,false);
});
test('closed or closing workers never acquire a new parked slot',async()=>{
 for(const mode of ['close','stop','closing']){const f=fixture();if(mode==='close')f.gate.close();if(mode==='stop')f.stop();if(mode==='closing')f.worker.closing=true;for(let i=0;i<20;i++)assert.equal(await f.miss(String(i)),false);assert.equal(f.timers.length,0);}
});
