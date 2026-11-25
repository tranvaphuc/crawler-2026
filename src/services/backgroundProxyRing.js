// Crawler admission is a rolling subset of keys. Retired leases finish on their
// original generation; a waiting key is rotated only after its last lease ends.
export function createBackgroundProxyRing({slots,apiReserveIds,activeLeases,now,rotate,getSettings,saved={}}){
 let active=[...(saved.activeKeyIds||[])],waiting=[...(saved.waitingKeyIds||[])],initialized=Array.isArray(saved.activeKeyIds),running=null;
 const pending=new Map(Object.entries(saved.pending||{})),cold=new Set(saved.coldKeyIds||[]);
 const enabled=()=>Number.isInteger(getSettings().backgroundActiveKeyCount)&&getSettings().backgroundActiveKeyCount>0;
 const target=()=>Math.min(getSettings().backgroundActiveKeyCount||0,[...slots.values()].filter(usable).length);
 const usable=s=>!s.removed&&!s.disabled&&!apiReserveIds.has(s.id);
 const fresh=s=>s.proxy&&s.expiresAt-now()>60000;
 const canRotate=s=>usable(s)&&!s.rotating&&!activeLeases(s)&&s.nextRotateAt<=now();
 function sync(){
  if(!enabled())return;
  const ids=[...slots.values()].filter(usable).map(s=>s.id),valid=new Set(ids);
  active=[...new Set(active)].filter(id=>valid.has(id));
  waiting=[...new Set(waiting)].filter(id=>valid.has(id)&&!active.includes(id));
  for(const id of ids)if(!active.includes(id)&&!waiting.includes(id))waiting.push(id);
  while(active.length>target())waiting.push(active.pop());
  while(active.length<target()&&waiting.length){const id=waiting.shift();active.push(id);if(initialized)cold.add(id);}
  initialized=true;
  for(const id of pending.keys())if(!active.includes(id))pending.delete(id);
  for(const id of cold)if(!active.includes(id))cold.delete(id);
 }
 function request(s,{generation=s.generation,reason='RATE_LIMITED'}={}){
  if(!enabled()||generation!==s.generation||!active.includes(s.id))return;
  if(!pending.has(s.id))pending.set(s.id,{generation,reason,requestedAt:now()});
 }
 async function maintain(){
  sync();const budget=getSettings().refreshConcurrency||2;let attempts=0;
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
   if(!replacement||replacement.generation!==old.generation||attempts>=budget)continue;
   // Walk in key order, skipping cooldowns and keys still draining old jobs.
   for(const nextId of [...waiting]){
    const next=slots.get(nextId);if(!next||!canRotate(next))continue;
    attempts++;let ok=false;try{await rotate(next);ok=fresh(next);}catch{}
    if(ok&&enabled()&&active.includes(id)&&waiting.includes(nextId)&&usable(next)){
     active[active.indexOf(id)]=nextId;waiting=waiting.filter(x=>x!==nextId);waiting.push(id);
     cold.delete(id);cold.delete(nextId);pending.delete(id);break;
    }
    if(attempts>=budget)break;
   }
  }
 }
 return{
  enabled,sync,
  contains(s){sync();return active.includes(s.id)&&!cold.has(s.id);},
  request,
  tick(){if(!enabled())return Promise.resolve();if(!running)running=maintain().finally(()=>{running=null;});return running;},
  snapshot(){return{activeKeyIds:active,waitingKeyIds:waiting,coldKeyIds:[...cold],pending:Object.fromEntries(pending)};},
  status(){sync();return{enabled:enabled(),targetKeys:target(),activeKeys:active.length,readyKeys:active.filter(id=>{const s=slots.get(id);return s&&fresh(s)&&!cold.has(id)&&!s.rotating;}).length,waitingKeys:waiting.length,waitingAvailableKeys:waiting.filter(id=>{const s=slots.get(id);return s&&canRotate(s);}).length,drainingKeys:waiting.filter(id=>{const s=slots.get(id);return s&&activeLeases(s)>0;}).length,pendingReplacements:pending.size,ttlMarginMs:60000};}
 };
}
