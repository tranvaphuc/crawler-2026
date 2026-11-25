import {facebookSourceBootstrapUrl} from './facebookEmptySource.js';

export const facebookContextKey=target=>JSON.stringify([target.operation,target.sourceType,facebookSourceBootstrapUrl(target),target.id]);

// CSRF/author facts remain private to one live anonymous HTTP session and the
// exact post. Another session or an expired entry must bootstrap again.
export function facebookSessionRequest(binding,session,target,create,{now=Date.now,ttlMs=60000,maxEntries=8,onEvent=()=>{}}={}){
 if(binding.facebookContexts?.session!==session)binding.facebookContexts={session,entries:new Map()};
 const entries=binding.facebookContexts.entries,key=facebookContextKey(target);
 const version=()=>Number.isSafeInteger(session.cookieVersion)?session.cookieVersion:0;
 for(const [k,e]of entries){if(e.until<=now())entries.delete(k);else if(e.cookieVersion!==version()){entries.delete(k);onEvent('context_cookie_changed');}}
 const cached=entries.get(key);
 if(cached){entries.delete(key);entries.set(key,cached);onEvent('context_hit');return cached.request;}
 const entry={request:null,until:now()+ttlMs,cookieVersion:version()};
 // Bootstrap itself may set cookies. Capture their version after the GET,
 // rather than accepting the version from before it was sent.
 const request=create(()=>{entry.cookieVersion=version();});entry.request=request;entries.set(key,entry);
 while(entries.size>maxEntries)entries.delete(entries.keys().next().value);
 onEvent('context_miss');return request;
}
