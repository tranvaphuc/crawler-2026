// Demand recovery is shared by background queues. Job-local exclusions and
// temporary lease capacity do not establish a broken pool.
export function createProxyQueueRecovery({now=Date.now,getSettings,ring,endpointFor,endpointHealth,transportHealth,canProbe,onRequest=()=>{},intervalMs=30000}={}){
 const requestedAt=new Map();
 return{request(queue,candidates){
  const at=now();if(getSettings().backgroundTransportRecovery!==true||!canProbe()||!queue||!ring.enabled())return false;
  if(at-(requestedAt.get(queue)??-Infinity)<intervalMs)return false;
  const pool=candidates.filter(s=>!s.removed&&!s.disabled&&ring.contains(s));if(!pool.length)return false;
  // Ignore one job's exclusions: a healthy global candidate means wait/retry,
  // not a provider rotation. Existing origin/transport blocks remain intact.
  if(pool.some(s=>s.proxy&&!s.rotating&&s.expiresAt>at+60000&&!(endpointHealth(queue,endpointFor(s,queue))?.until>at)))return false;
  const pending=ring.snapshot().pending||{},entries=Object.values(pending);
  if(entries.length>=2||entries.some(x=>x.reason==='QUEUE_TRANSPORT_UNAVAILABLE'&&x.queue===queue))return false;
  // One native CONNECT/TLS failure already quarantines the endpoint. Waiting
  // for three reports can deadlock a paced queue after all other exits block.
  // The spare must still pass the independent probe before admission.
  const broken=pool.map(slot=>({slot,health:transportHealth(queue,endpointFor(slot,queue))})).filter(({slot,health})=>!slot.rotating&&!pending[slot.id]&&health?.until>at&&['proxy_connect','proxy_tls'].includes(health.phase)&&health.windowStartedAt>=at-600000&&health.failuresInWindow>=1);
  broken.sort((a,b)=>(a.slot.leaseIds?.size||0)-(b.slot.leaseIds?.size||0)||(a.health.failedAt||0)-(b.health.failedAt||0));
  const slot=broken[0]?.slot;if(!slot)return false;
  if(!ring.request(slot,{generation:slot.generation,reason:'QUEUE_TRANSPORT_UNAVAILABLE',queue}))return false;
  requestedAt.set(queue,at);onRequest({queue,keyId:slot.id});return true;
 }};
}
