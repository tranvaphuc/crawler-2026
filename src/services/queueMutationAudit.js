import {randomUUID,createHash} from 'node:crypto';
import {isIP} from 'node:net';

const mutationMethods=new Set(['POST','PUT','PATCH','DELETE']);
const states=new Set(['failed','completed','delayed','waiting','active','paused']);
const hash=value=>createHash('sha256').update(String(value||'')).digest('hex');
export function queueMutationDescriptor(req,queueNames){
 if(!mutationMethods.has(req.method))return null;
 let path;try{path=new URL(req.originalUrl||req.url,'http://local').pathname;}catch{return null;}
 if(!path.startsWith('/bull/api/queues/'))return null;
 let parts;try{parts=path.split('/').filter(Boolean).map(decodeURIComponent);}catch{return null;}
 const queue=queueNames.has(parts[3])?parts[3]:null;
 const queueActions=new Set(['add','retry','clean','pause','resume','empty','promote']);
 const action=queue?(queueActions.has(parts[4])?parts[4]:['retry','clean','promote','update-data'].includes(parts[5])?parts[5]:'unknown'):['pause','resume'].includes(parts[3])?parts[3]+'_all':'unknown';
 const jobId=queue&&!queueActions.has(parts[4])&&/^[A-Za-z0-9_.:-]{1,160}$/.test(parts[4]||'')?parts[4]:null;
 const targetState=parts.find((p,i)=>i>3&&states.has(p))||null;
 const ua=String(req.headers?.['user-agent']||''),family=/(curl|python-requests|undici|Firefox|Chrome|Safari|Go-http-client)/i.exec(ua)?.[1]||'other';
 const ip=value=>isIP(String(value))?String(value):null;
 return{method:req.method,queue,action:action||'unknown',jobId,targetState,
  actor:req.queueBoardActor||'authenticated',clientIp:ip(req.ip),peerIp:ip(req.socket?.remoteAddress),
  userAgentFamily:family,userAgentSha256:hash(ua),pathSha256:hash(path)};
}

// Refuse a mutation if its durable start record cannot be written. Never store
// Authorization, cookies, query strings or edited job payloads in the audit.
export function createQueueMutationAudit({collection,queueNames,log=()=>{},now=Date.now,id=randomUUID}={}){
 return async(req,res,next)=>{
  const detail=queueMutationDescriptor(req,queueNames);if(!detail)return next();
  const started=now(),operationId=id(),record={_id:operationId,at:new Date(started),source:'queue_board_http',state:'started',...detail};
  try{await collection.insertOne(record);}catch(error){log('queue_mutation_audit_store_failed',{operationId,errorType:error.name,code:error.code||null});return res.status(503).json({error:'QUEUE_AUDIT_UNAVAILABLE',operationId});}
  res.set('X-Crawler-Operation-Id',operationId);log('queue_mutation_started',{operationId,...detail});
  let finished=false;
  const finish=aborted=>{if(finished)return;finished=true;const result={finishedAt:new Date(now()),durationMs:now()-started,httpStatus:res.statusCode,aborted,state:aborted?'connection_closed':res.statusCode<400?'http_completed':'http_rejected'};
   log('queue_mutation_finished',{operationId,...result});
   void collection.updateOne({_id:operationId},{$set:result}).catch(error=>log('queue_mutation_audit_store_failed',{operationId,errorType:error.name,code:error.code||null}));
  };
  res.once('finish',()=>finish(false));res.once('close',()=>finish(!res.writableFinished));
  next();
 };
}
