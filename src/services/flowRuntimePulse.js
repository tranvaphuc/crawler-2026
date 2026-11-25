import fs from 'node:fs/promises';
import {monitorEventLoopDelay,performance} from 'node:perf_hooks';

// Timers remain independent of admission/outbox/cleanup I/O. A delayed
// coordinator step is not evidence that the process or its workers stopped.
export function startFlowRuntimePulse({file,role='all',extra=()=>({}),onError=()=>{},onSample=()=>{},intervalMs=15000}={}){
 const delay=monitorEventLoopDelay({resolution:20});delay.enable();
 let utilization=performance.eventLoopUtilization(),cpu=process.cpuUsage(),sampleAt=performance.now(),latest=null,pending=null,closed=false;
 const sampleNow=()=>{
  if(closed)return Promise.resolve(latest);
  if(pending)return pending;
  pending=(async()=>{
   const current=performance.eventLoopUtilization(),elapsed=performance.eventLoopUtilization(current,utilization);utilization=current;
   const sampledAt=performance.now(),used=process.cpuUsage(cpu),memory=process.memoryUsage();cpu=process.cpuUsage();
   latest={at:new Date(),pid:process.pid,role,eventLoopP99Ms:delay.percentile(99)/1e6,eventLoopUtilization:elapsed.utilization,cpuMs:(used.user+used.system)/1000,cpuPercentOfCore:(used.user+used.system)/1000/Math.max(1,sampledAt-sampleAt)*100,rss:memory.rss,heapUsed:memory.heapUsed,heapTotal:memory.heapTotal,...extra()};sampleAt=sampledAt;delay.reset();
   try{const temp=file+'.'+process.pid+'.tmp';await fs.writeFile(temp,JSON.stringify(latest),{mode:0o600});await fs.rename(temp,file);}catch(e){onError(e);}
   onSample(latest);return latest;
  })().finally(()=>{pending=null;});return pending;
 };
 const timer=setInterval(()=>{void sampleNow().catch(onError);},intervalMs);timer.unref();
 return{sampleNow,get latest(){return latest;},async close(){closed=true;clearInterval(timer);delay.disable();if(pending)await pending;}};
}
