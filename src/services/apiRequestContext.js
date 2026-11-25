import {AsyncLocalStorage} from 'node:async_hooks';

const requests=new AsyncLocalStorage();
export const apiRequestContext=()=>requests.getStore();
export const runApiRequest=(context,work)=>requests.run(context,work);
export function throwIfApiAborted(){apiRequestContext()?.signal.throwIfAborted();}

// Also bound injected readers and ES lookups that do not accept AbortSignal.
// The transport separately closes its sockets when this signal is aborted.
export function apiAwait(value){
 const signal=apiRequestContext()?.signal;
 if(!signal)return Promise.resolve(value);
 return new Promise((resolve,reject)=>{
  const abort=()=>reject(signal.reason);
  const done=(fn,value)=>{signal.removeEventListener('abort',abort);fn(value);};
  Promise.resolve(value).then(v=>done(resolve,v),e=>done(reject,e));
  if(signal.aborted)abort();else signal.addEventListener('abort',abort,{once:true});
 });
}

// Cleanup must not inherit an already-aborted read, or keep admission forever.
export async function boundedApiCleanup(work,timeoutMs=1000){
 let timer;
 try{return await Promise.race([Promise.resolve().then(work),new Promise(resolve=>{timer=setTimeout(resolve,timeoutMs);})]);}
 finally{clearTimeout(timer);}
}
