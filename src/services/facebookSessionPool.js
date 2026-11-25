import {crawlerQueue} from './crawlerQueueContext.js';
import {HTTP_BINDING,bindHttpState} from './socialLeaseState.js';

// Exclusive, in-memory ownership only. Cursors and rows stay in the durable jobs;
// cookies/CSRF/leases never enter their checkpoints. A miss uses a fresh session.
export function createFacebookSessionPool({maxEntries=70,idleMs=30000,now=Date.now,onEvent=()=>{}}={}){
 const entries=new Map();let closed=false,sequence=0;
 const usable=b=>b?.session&&b.lease?.managed&&!b.busy&&!b.terminal&&!b.disposeAfterUse&&(!b.lease.expiresAt||b.lease.expiresAt>now()+30000);
 async function drop(key,event){const e=entries.get(key);if(!e)return;entries.delete(key);clearTimeout(e.timer);await e.binding.dispose?.();onEvent(event);}
 return{
  async take(key,state,{excludeProxyEndpoint,excludeProxyEndpoints=[],transportScope,contextKey,resetRequestContext=false,minRemainingMs=30000,sameSourceOnly=false}={}){
   const disposals=[];
   for(const [id,e]of entries)if(e.until<=now()||!usable(e.binding))disposals.push(drop(id,'expired'));
   const candidates=[...entries].reverse().filter(([,e])=>e.binding.lease.queue===crawlerQueue()&&(!sameSourceOnly||e.key===key)&&(e.key===key||!(e.sameSourceUntil>now()))&&(!e.binding.lease.expiresAt||e.binding.lease.expiresAt>now()+minRemainingMs)&&(e.key===key||transportScope&&e.binding.lease.scope===transportScope)&&(!excludeProxyEndpoint||e.binding.endpoint!==excludeProxyEndpoint)&&!excludeProxyEndpoints.includes(e.binding.endpoint)&&!(e.binding.lease.queueEndpointAliases||[]).some(endpoint=>endpoint===excludeProxyEndpoint||excludeProxyEndpoints.includes(endpoint)));
   const warm=e=>{const cached=contextKey&&e.binding.facebookContexts?.entries?.get(contextKey),version=Number.isSafeInteger(e.binding.session.cookieVersion)?e.binding.session.cookieVersion:0;return cached?.until>now()&&cached.cookieVersion===version;};
   const selected=candidates.find(([,e])=>e.key===key&&(!contextKey||warm(e)))||candidates.find(([,e])=>warm(e))||candidates[0];
   if(closed||!selected){await Promise.all(disposals);onEvent('miss');return false;}
   const [id,e]=selected;entries.delete(id);clearTimeout(e.timer);
   // A healthy same-scope tunnel may serve another post. The reader must select
   // that post's own unexpired context, or bootstrap it; never use the prior post.
   if(resetRequestContext||e.key!==key){delete e.binding.facebookRequest;delete e.binding.facebookRequestSession;}
   bindHttpState(state,e.binding);onEvent(e.key===key?'hit':'transport_hit');await Promise.all(disposals);return true;
  },
  async put(key,state,{sameSourceForMs=0}={}){
   const binding=state?.[HTTP_BINDING];if(closed||!usable(binding))return false;
   const disposals=[];
   // Remove ownership before publishing it to a different job.
   delete state[HTTP_BINDING];
   // A healthy sliced source becomes ready again after one second. Give that
   // cursor a short chance to resume before a different source takes its context.
   // The grace period is bounded and never prevents same-source resumption.
   const id=++sequence,entry={key,binding,until:now()+idleMs,sameSourceUntil:now()+Math.min(2000,Math.max(0,Number(sameSourceForMs)||0))};
   entry.timer=setTimeout(()=>void drop(id,'idle_expired').catch(()=>onEvent('dispose_error')),idleMs);entry.timer.unref?.();
   entries.set(id,entry);onEvent('stored');
   while(entries.size>maxEntries)disposals.push(drop(entries.keys().next().value,'evicted'));
   await Promise.all(disposals);
   return true;
  },
  async close(){closed=true;await Promise.all([...entries.keys()].map(key=>drop(key,'closed')));},
  get size(){return entries.size;}
 };
}
