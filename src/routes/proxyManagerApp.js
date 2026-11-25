import express from 'express';import {createHash,timingSafeEqual} from 'node:crypto';import {createApiAuthentication} from '../services/apiAuthentication.js';
export function createProxyManagerApp({manager,key,adminKey=key,backgroundKey}){
 const app=express();app.disable('x-powered-by');const workerAuth=createApiAuthentication({key}),adminAuth=createApiAuthentication({key:adminKey});const adminPaths=new Set(['/v1/keys','/v1/settings','/v1/reload','/v1/recheck']);
 if(backgroundKey&&(backgroundKey===key||backgroundKey===adminKey))throw Error('PROXY_AUTH_ROLES_MUST_BE_DISTINCT');
 const clients=[{kind:'api',auth:workerAuth,digest:createHash('sha256').update(key).digest()},...(backgroundKey?[{kind:'background',auth:createApiAuthentication({key:backgroundKey}),digest:createHash('sha256').update(backgroundKey).digest()}]:[])];
 app.use((req,res,next)=>{if(adminPaths.has(req.path))return adminAuth(req,res,next);const match=/^Bearer ([\x21-\x7e]{32,512})$/i.exec(req.headers.authorization||''),digest=createHash('sha256').update(match?.[1]||'').digest();let selected=clients[0];for(const candidate of clients)if(timingSafeEqual(digest,candidate.digest))selected=candidate;return selected.auth(req,res,()=>{req.proxyClientClass=selected.kind;next();});});app.use(express.json({limit:'2mb'}));
 app.get('/v1/status',async(_req,res)=>{try{await manager.flush?.();return res.json(manager.status());}catch{return res.status(503).json({status:'proxy_error',reason:'PROXY_MANAGER_PERSISTENCE_ERROR'});}});
 const routes={acquire:body=>manager.acquire(body),heartbeat:body=>manager.heartbeat(body.leaseId),permit:body=>manager.permit(body.leaseId,{reuseTransport:body.reuseTransport===true}),report:body=>manager.report(body.leaseId,body.result),release:body=>manager.release(body.leaseId),reload:()=>manager.reload(),keys:body=>manager.setKeys(body),settings:body=>manager.setSettings(body),recheck:body=>manager.recheck(body.keyId)};
 for(const [name,handler]of Object.entries(routes))app.post('/v1/'+name,async(req,res)=>{
  let acquired=null,disconnected=false,releaseStarted=false;
  // Acquisition can outlive the caller's deadline. Reclaim only a response
  // that was not delivered; a normally finished response owns its lease.
  const releaseUndelivered=()=>{if(name!=='acquire'||!acquired?.leaseId||releaseStarted)return;releaseStarted=true;Promise.resolve().then(()=>manager.release(acquired.leaseId)).then(()=>manager.flush?.()).catch(()=>{});};
  res.once('close',()=>{if(!res.writableFinished){disconnected=true;releaseUndelivered();}});
  try{
   const body=req.body||{};if(['heartbeat','permit','report','release'].includes(name))manager.authorizeLease?.(body.leaseId,req.proxyClientClass);
   const result=await handler(name==='acquire'?{...body,clientClass:req.proxyClientClass}:body);if(name==='acquire')acquired=result;await manager.flush?.();
   if(disconnected||res.destroyed){releaseUndelivered();return;}return res.json(result);
  }catch(e){
   if(disconnected||res.destroyed){releaseUndelivered();return;}releaseUndelivered();
   const reason=/^PROXY_[A-Z_]+$/.test(e.code||'')?e.code:'PROXY_MANAGER_ERROR';const status=/FORBIDDEN/.test(reason)?403:/INVALID/.test(reason)?400:/LEASE_EXPIRED/.test(reason)?409:503;if(e.retryAfterMs)res.set('Retry-After',String(Math.ceil(e.retryAfterMs/1000)));return res.status(status).json({status:'proxy_error',reason,retryAfterMs:e.retryAfterMs||null});
  }
 });
 app.use((_req,res)=>res.status(404).json({status:'not_found',reason:'ROUTE_NOT_FOUND'}));app.use((e,_req,res,_next)=>res.status(e.type==='entity.too.large'?413:e.status===400?400:500).json({status:'error',reason:e.type==='entity.too.large'?'REQUEST_TOO_LARGE':e.status===400?'INVALID_JSON':'INTERNAL_ERROR'}));return app;
}
