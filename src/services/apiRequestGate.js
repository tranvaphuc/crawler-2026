import {apiAwait,runApiRequest} from './apiRequestContext.js';

export function createApiRequestGate({name,maxConcurrent=2,maxQueued=8,queueTimeoutMs=10000,requestTimeoutMs=90000,onComplete=()=>{}}={}){
 for(const [key,value,min] of [['maxConcurrent',maxConcurrent,1],['maxQueued',maxQueued,0],['queueTimeoutMs',queueTimeoutMs,1],['requestTimeoutMs',requestTimeoutMs,1]])if(!Number.isSafeInteger(value)||value<min)throw Error('INVALID_API_GATE_'+key);
 const running=new Map(),queue=[];let sequence=0;
 const counters={started:0,completed:0,timedOut:0,aborted:0,rejected:0};
 const snapshot=()=>({name,maxConcurrent,maxQueued,requestTimeoutMs,active:running.size,queued:queue.length,oldestActiveMs:running.size?Math.max(...[...running.values()].map(at=>Date.now()-at)):0,...counters});
 function drain(){while(running.size<maxConcurrent&&queue.length){const ticket=queue.shift();ticket.start();}}
 function acquire(id,signal){
  return new Promise((resolve,reject)=>{
   let timer,settled=false;
   const detach=()=>{clearTimeout(timer);signal.removeEventListener('abort',abort);const index=queue.indexOf(ticket);if(index>=0)queue.splice(index,1);};
   const fail=error=>{if(settled)return;settled=true;detach();reject(error);};
   const abort=()=>fail(signal.reason);
   const ticket={start(){if(settled)return;settled=true;detach();running.set(id,Date.now());resolve();}};
   if(signal.aborted)return fail(signal.reason);
   signal.addEventListener('abort',abort,{once:true});
   if(running.size<maxConcurrent)return ticket.start();
   if(queue.length>=maxQueued)return fail(Object.assign(Error('REQUEST_CAPACITY'),{code:'REQUEST_CAPACITY'}));
   queue.push(ticket);timer=setTimeout(()=>fail(Object.assign(Error('REQUEST_CAPACITY'),{code:'REQUEST_CAPACITY'})),queueTimeoutMs);
  });
 }
 const wrap=handler=>async(req,res,next)=>{
  const id=++sequence,at=Date.now(),controller=new AbortController();let admitted=false,queueMs=0,resultStatus=null,resultReason=null;
  const disconnect=()=>{if(!res.writableEnded)controller.abort(Object.assign(Error('CLIENT_DISCONNECTED'),{code:'CLIENT_DISCONNECTED'}));};
  const timer=setTimeout(()=>controller.abort(Object.assign(Error('REQUEST_TIMEOUT'),{code:'REQUEST_TIMEOUT'})),requestTimeoutMs);
  req.once('aborted',disconnect);res.once('close',disconnect);
  const originalJson=res.json;
  res.json=function(value){resultStatus=/^[a-z_]{1,40}$/.test(value?.status||'')?value.status:null;resultReason=/^[A-Z][A-Z0-9_]{0,100}$/.test(value?.reason||'')?value.reason:null;return originalJson.call(this,value);};
  try{
   await acquire(id,controller.signal);admitted=true;queueMs=Date.now()-at;counters.started++;
   await runApiRequest({signal:controller.signal,deadline:at+requestTimeoutMs},()=>apiAwait(handler(req,res,next)));
   counters.completed++;
  }catch(error){
   if(controller.signal.aborted){
    if(controller.signal.reason?.code==='CLIENT_DISCONNECTED')counters.aborted++;
    else{counters.timedOut++;if(!res.headersSent&&!res.destroyed)res.status(504).json({status:'error',reason:'REQUEST_TIMEOUT'});}
   }else if(error?.code==='REQUEST_CAPACITY'){
    counters.rejected++;if(!res.headersSent&&!res.destroyed)res.status(503).set('Retry-After','3').json({status:'busy',reason:'REQUEST_CAPACITY'});
   }else next(error);
  }finally{
   clearTimeout(timer);req.removeListener('aborted',disconnect);res.removeListener('close',disconnect);
   if(admitted){running.delete(id);drain();}
   try{onComplete({event:'api_request_completed',route:name,elapsedMs:Date.now()-at,queueMs,httpStatus:res.statusCode,status:resultStatus,reason:resultReason,...snapshot()});}catch{}
  }
 };
 return{wrap,snapshot};
}
