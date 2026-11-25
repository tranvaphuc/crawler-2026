const cacheKey=Symbol('private-group-anonymous-context');
const dynamicKeys=['lsd','__user','av','__spin_r','__spin_b','__spin_t','__rev','__hsi','__hs','jazoest'];
// Session CSRF material only: no source rows, identity aliases, feedback IDs or
// access decisions may cross Group jobs. Native access is checked on each read.
export function createGroupAnonymousContextCache(binding,session,{now=Date.now,ttlMs=30000}={}){
 const version=()=>Number.isSafeInteger(session?.cookieVersion)?session.cookieVersion:null;
 const scoped=()=>binding?.lease?.managed===true&&binding.lease.scope==='facebook.source_group'&&binding.lease.queue==='crawler-flow-facebook-group-source';
 const same=c=>scoped()&&c?.session===session&&version()!==null&&c.cookieVersion===version();
 const valid=c=>same(c)&&c.until>now();
 const clear=()=>{delete binding[cacheKey]};
 return{
  read(){const c=binding[cacheKey];if(!valid(c)||!c.verified)return null;return{anonymousActorVerified:true,dynamic:{...c.dynamic}}},
  observe(context){
   if(!scoped()||version()===null||context?.anonymousActorVerified!==true||context.dynamic?.__user!=='0'||context.dynamic?.av!=='0'||typeof context.dynamic.lsd!=='string'||!context.dynamic.lsd)return;
   const dynamic=Object.fromEntries(dynamicKeys.filter(k=>typeof context.dynamic[k]==='string').map(k=>[k,context.dynamic[k]]));
   binding[cacheKey]={session,cookieVersion:version(),until:now()+ttlMs,dynamic,verified:false};
  },
  confirm(){const c=binding[cacheKey];if(!same(c)){clear();return false}c.verified=true;c.until=now()+ttlMs;return true},
  clear
 };
}
