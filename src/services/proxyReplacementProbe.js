import {isIP} from 'node:net';
import {setTimeout as sleep} from 'node:timers/promises';

// A provider can return before a new gateway accepts connections. Retry only
// fast failures before any response, on the same generation and proxy.
export async function probeReplacementTransport(proxy,{verify,stillCurrent=()=>true,wait=sleep,now=Date.now,onRetry=()=>{},onRecovered=()=>{}}={}){
 const started=now();
 const check=async()=>{const ip=await verify(proxy);if(typeof ip!=='string'||!isIP(ip))throw Object.assign(Error('Replacement transport unverified'),{code:'PROXY_TRANSPORT_UNVERIFIED'});return ip;};
 try{return await check();}catch(error){
  if(error?.responseObserved!==false||!['ECONNRESET','ECONNREFUSED','EPIPE','PROXY_CONNECT_EOF'].includes(error.code)||now()-started>2000||!stillCurrent())throw error;
  onRetry();await wait(750);
  if(!stillCurrent())throw Object.assign(Error('Replacement generation changed'),{code:'PROXY_REPLACEMENT_STALE'});
  const ip=await check();onRecovered();return ip;
 }
}
