import {originCooldownEnabled,originCooldownScope} from './originRateLimit.js';

// Hold intake locally, not the Redis queue. Existing active jobs keep their
// locks and save their own checkpoints; imports and the external UID pause
// are deliberately outside this controller.
export function createOriginWorkerGate({remaining,shouldStop=()=>false,now=Date.now,onEvent=()=>{},onError=()=>{},intervalMs=1000,checkTimeoutMs=2000}={}){
 const scopes=new Map();let closed=false,timer=null,pending=null;
 const stopped=()=>closed||shouldStop();
 const pause=entry=>{
  if(entry.pausing)return entry.pausing;
  entry.pausing=(async()=>{
   for(const worker of entry.workers){
    if(stopped())return;
    if(worker.closing||worker.isPaused())continue;
    entry.owned.add(worker);await worker.pause(true);
   }
   if(entry.owned.size&&!entry.announced){entry.announced=true;onEvent('origin_worker_gate_paused',{scope:entry.scope,until:entry.until,queues:[...entry.owned].map(w=>w.name)});}
  })().finally(()=>{entry.pausing=null;});return entry.pausing;
 };
 const check=async scope=>{
  let timeout;try{return await Promise.race([Promise.resolve().then(()=>remaining(scope)),new Promise((_,reject)=>{timeout=setTimeout(()=>reject(Object.assign(Error('ORIGIN_GATE_CHECK_TIMEOUT'),{code:'ORIGIN_GATE_CHECK_TIMEOUT'})),checkTimeoutMs);})]);}finally{clearTimeout(timeout);}
 };
 const sync=()=>{
  if(pending)return pending;
  pending=(async()=>{
   for(const entry of scopes.values()){
    if(stopped())return;
    if(entry.until>now()){await pause(entry);continue;}
    let ttl;try{ttl=await check(entry.scope);if(!Number.isFinite(ttl)||ttl<0)throw Error('ORIGIN_GATE_TTL_INVALID');}catch(error){
     if(stopped())return;entry.until=Math.max(entry.until,now()+intervalMs);onError(error,{scope:entry.scope});await pause(entry);continue;
    }
    if(stopped())return;
    // hold() may extend the known deadline while the Redis check is pending.
    entry.until=Math.max(entry.until,ttl>0?now()+ttl:0);
    if(entry.until>now()){await pause(entry);continue;}
    for(const worker of entry.owned){
     if(stopped())return;
     if(worker.closing)continue;
     if(worker.isPaused())worker.resume();
     // BullMQ can ignore resume until its active loop has finished. Retry on
     // the next tick rather than forgetting ownership of a still-paused worker.
     if(!worker.isPaused())entry.owned.delete(worker);
    }
    if(!entry.owned.size&&entry.announced){entry.announced=false;entry.until=0;onEvent('origin_worker_gate_resumed',{scope:entry.scope});}
   }
  })().finally(()=>{pending=null;});return pending;
 };
 return{
  register(spec,worker){
   if(['uid','import'].includes(spec.kind))return false;const scope=originCooldownScope(spec,'crawler-flow-'+spec.name);if(!originCooldownEnabled(scope))return false;
   if(!scopes.has(scope))scopes.set(scope,{scope,workers:new Set(),owned:new Set(),until:0,announced:false,pausing:null});scopes.get(scope).workers.add(worker);return true;
  },
  async hold(scope,retryAfterMs){
   if(stopped())return;const entry=scopes.get(scope);if(!entry)return;
   if(!Number.isFinite(retryAfterMs)||retryAfterMs<0)throw Error('ORIGIN_GATE_WAIT_INVALID');
   entry.until=Math.max(entry.until,now()+Math.max(1000,retryAfterMs));await pause(entry);
  },
  sync,
  start(){if(!timer&&!closed){timer=setInterval(()=>{void sync().catch(error=>onError(error));},intervalMs);timer.unref();}},
  status(){return [...scopes.values()].map(e=>({scope:e.scope,until:e.until,heldWorkers:e.owned.size}));},
  async close(){closed=true;clearInterval(timer);timer=null;await Promise.allSettled([pending,...[...scopes.values()].map(e=>e.pausing)].filter(Boolean));}
 };
}
