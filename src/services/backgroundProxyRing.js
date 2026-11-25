const BATCH_NETWORKS=['viettel','vnpt','fpt'];
const batchNetwork=round=>BATCH_NETWORKS[(round-1)%BATCH_NETWORKS.length];

// Crawler admission is a rolling subset of keys. Retired leases finish on their
// original generation; a waiting key is rotated only after its last lease ends.
export function createBackgroundProxyRing({slots,apiReserveIds,activeLeases,now,rotate,getSettings,saved={},probeReplacement,canUseReplacement=()=>true,canReserveReplacement=()=>true,onReplacementEvent=()=>{},onBatchUpdate=()=>{}}){
 let active=[...(saved.activeKeyIds||[])],waiting=[...(saved.waitingKeyIds||[])],initialized=Array.isArray(saved.activeKeyIds),running=null;
 const pending=new Map(Object.entries(saved.pending||{})),cold=new Set(saved.coldKeyIds||[]),probeBackoff=new Map(),reserved=new Set();
 let batch=saved.batch||null;
 const enabled=()=>Number.isInteger(getSettings().backgroundActiveKeyCount)&&getSettings().backgroundActiveKeyCount>0;
 const batchEnabled=()=>enabled()&&getSettings().backgroundBatchRotationMs>0;
 const configured=s=>!s.removed&&!apiReserveIds.has(s.id);
 const usable=s=>!!s&&configured(s)&&!s.disabled;
 const member=s=>batchEnabled()?configured(s):usable(s);
 const target=()=>Math.min(getSettings().backgroundActiveKeyCount||0,[...slots.values()].filter(member).length);
 const fresh=s=>s.proxy&&s.expiresAt-now()>60000;
 const canRotate=s=>usable(s)&&!reserved.has(s.id)&&!s.rotating&&!activeLeases(s)&&s.nextRotateAt<=now();
 const batchPrepared=(s,round)=>usable(s)&&s.proxy?.providerNetwork===batchNetwork(round)&&batch.prepared[s.id]?.round===round&&batch.prepared[s.id]?.generation===s.generation;
 const isCold=id=>batch?.round>0?!batchPrepared(slots.get(id),batch.round):cold.has(id);

 function sync(){
  if(!enabled())return;
  const ids=[...slots.values()].filter(member).map(s=>s.id),valid=new Set(ids);
  active=[...new Set(active)].filter(id=>valid.has(id));
  waiting=[...new Set(waiting)].filter(id=>valid.has(id)&&!active.includes(id));
  for(const id of ids)if(!active.includes(id)&&!waiting.includes(id))waiting.push(id);
  while(active.length>target())waiting.push(active.pop());
  while(active.length<target()&&waiting.length){const id=waiting.shift();active.push(id);if(initialized)cold.add(id);}
  initialized=true;
  for(const id of pending.keys())if(!active.includes(id))pending.delete(id);
  for(const id of cold)if(!active.includes(id))cold.delete(id);
  if(!batchEnabled()){batch=null;return;}
  if(!batch){
   batch={round:0,nextSwapAt:now()+getSettings().backgroundBatchRotationMs,prepared:{}};
   pending.clear();
   onBatchUpdate();
  }
  if(now()<batch.nextSwapAt)return;
  [active,waiting]=[waiting,active];
  batch.round++;
  const interval=getSettings().backgroundBatchRotationMs;
  const following=batch.nextSwapAt+interval;
  batch.nextSwapAt=following>now()?following:now()+interval;
  batch.prepared=Object.fromEntries(Object.entries(batch.prepared).filter(([id,entry])=>valid.has(id)&&entry.round>=batch.round));
  cold.clear();
  onBatchUpdate();
 }
 function request(s,{generation=s.generation,reason='RATE_LIMITED',queue=null}={}){
  if(!enabled()||batchEnabled()||generation!==s.generation||!active.includes(s.id)||pending.has(s.id))return false;
  pending.set(s.id,{generation,reason,requestedAt:now(),...(queue?{queue}:{})});return true;
 }
 function prepareBatch(){
  const rounds=batch.round?[{ids:active,round:batch.round},{ids:waiting,round:batch.round+1}]:[{ids:waiting,round:1}];
  for(const {ids,round} of rounds)for(const id of ids){
   if(reserved.size>=(getSettings().refreshConcurrency||2))return;
   const slot=slots.get(id);
   if(!slot||!canRotate(slot)||batchPrepared(slot,round))continue;
   reserved.add(id);
   const requestBatch=batch;
   void rotate(slot,{requestedNetwork:batchNetwork(round)}).then(()=>{
    if(batch!==requestBatch||round<batch.round||slot.proxy?.providerNetwork!==batchNetwork(round))return;
    batch.prepared[id]={round,generation:slot.generation};
   }).catch(()=>{}).finally(()=>{
    reserved.delete(id);
    onBatchUpdate();
   }).catch(()=>{});
  }
 }
 async function maintain(){
  sync();if(batchEnabled()){prepareBatch();return;}
  const budget=getSettings().refreshConcurrency||2;let attempts=0;
  // Warm only admission keys. Waiting keys remain available for on-demand rotation.
  for(const id of [...active]){
   const s=slots.get(id);if(!s||attempts>=budget)break;
   if((!s.proxy||cold.has(id))&&canRotate(s)){
    attempts++;try{await rotate(s);if(fresh(s))cold.delete(id);}catch{}
   }
  }
  for(const id of [...active]){
   const old=slots.get(id);if(!old||!usable(old))continue;
   if(old.proxy&&!fresh(old))request(old,{reason:'PROXY_TTL_MARGIN'});
   const replacement=pending.get(id);
   const proxyRateLimited=replacement?.reason==='PROXY_CONNECT_RATE_LIMITED';
   if(proxyRateLimited&&getSettings().backgroundProxyRateLimitReplacement!==true){pending.delete(id);continue;}
   if(['QUEUE_TRANSPORT_UNAVAILABLE','QUEUE_ORIGIN_UNAVAILABLE'].includes(replacement?.reason)&&getSettings().backgroundTransportRecovery!==true){pending.delete(id);continue;}
   if(replacement?.reason==='QUEUE_ORIGIN_UNAVAILABLE'&&getSettings().backgroundGroupOriginRecovery!==true){pending.delete(id);continue;}
   if(replacement&&replacement.generation!==old.generation){pending.delete(id);continue;}
   if(!replacement||replacement.generation!==old.generation||attempts>=budget)continue;
   // Walk in key order, skipping cooldowns and keys still draining old jobs.
   for(const nextId of [...waiting]){
    const next=slots.get(nextId),origin=replacement.reason==='QUEUE_ORIGIN_UNAVAILABLE',recovery=origin||replacement.reason==='QUEUE_TRANSPORT_UNAVAILABLE',event=name=>onReplacementEvent(origin?'origin_'+name:name);let reuse=false;
    if(!next||!canReserveReplacement(next,replacement))continue;
    try{const failed=probeBackoff.get(nextId);reuse=!!(recovery&&next&&usable(next)&&!next.rotating&&!activeLeases(next)&&fresh(next)&&!(failed?.generation===next.generation&&failed.until>now())&&canUseReplacement(next,replacement));}catch{continue;}
    if(!next||!reuse&&!canRotate(next))continue;
    reserved.add(nextId);try{
    attempts++;let ok=false;
    try{
     if(!reuse)await rotate(next,recovery?{freshNetwork:true,...(origin?{egressQueue:replacement.queue}:{})}:undefined);ok=fresh(next);
     if(recovery&&ok){
      ok=canUseReplacement(next,replacement)&&typeof probeReplacement==='function';
      if(ok){const generation=next.generation,proxy=next.proxy;event('probe');try{await probeReplacement(next);ok=next.generation===generation&&next.proxy===proxy&&!activeLeases(next)&&!next.rotating&&fresh(next)&&canUseReplacement(next,replacement)&&getSettings().backgroundTransportRecovery===true;}catch{ok=false;probeBackoff.set(nextId,{generation:next.generation,until:now()+30000});event('probe_failed');}}
     }
    }catch{ok=false;}
    if(ok&&enabled()&&(!proxyRateLimited||getSettings().backgroundProxyRateLimitReplacement===true)&&active.includes(id)&&waiting.includes(nextId)&&usable(next)){
     active[active.indexOf(id)]=nextId;waiting=waiting.filter(x=>x!==nextId);waiting.push(id);
     cold.delete(id);cold.delete(nextId);pending.delete(id);probeBackoff.delete(nextId);if(recovery){event('replaced');if(reuse)event('reused');}if(proxyRateLimited)onReplacementEvent('proxy_rate_limit_replaced');break;
    }
    if(attempts>=budget)break;
    }finally{reserved.delete(nextId)}
   }
  }
 }
 return{
  enabled,batchEnabled,sync,replacementReserved:key=>reserved.has(key),
  contains(s){sync();return active.includes(s.id)&&!isCold(s.id);},
  proxyRateLimited(s){const row=pending.get(s.id);return enabled()&&getSettings().backgroundProxyRateLimitReplacement===true&&row?.reason==='PROXY_CONNECT_RATE_LIMITED'&&row.generation===s.generation;},
  request,
  tick(){if(!enabled())return Promise.resolve();if(!running)running=maintain().finally(()=>{running=null;});return running;},
  snapshot(){return{activeKeyIds:active,waitingKeyIds:waiting,coldKeyIds:active.filter(isCold),pending:Object.fromEntries(pending),...(batch?{batch}:{})};},
  status(){sync();return{enabled:enabled(),targetKeys:target(),activeKeys:active.length,readyKeys:active.filter(id=>{const s=slots.get(id);return s&&usable(s)&&fresh(s)&&!isCold(id)&&!s.rotating;}).length,waitingKeys:waiting.length,waitingAvailableKeys:waiting.filter(id=>{const s=slots.get(id);return s&&canRotate(s);}).length,drainingKeys:waiting.filter(id=>{const s=slots.get(id);return s&&activeLeases(s)>0;}).length,pendingReplacements:pending.size,ttlMarginMs:60000,...(batch?{batchRotation:{round:batch.round,intervalMs:getSettings().backgroundBatchRotationMs,network:batch.round?batchNetwork(batch.round):null,nextNetwork:batchNetwork(batch.round+1),nextSwapAt:batch.nextSwapAt,readyStandbyKeys:waiting.filter(id=>{const s=slots.get(id);return batchPrepared(s,batch.round+1)&&fresh(s)&&!s.rotating;}).length}}:{})};}
 };
}
