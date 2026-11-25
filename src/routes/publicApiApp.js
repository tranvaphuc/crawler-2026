import express from 'express';
import {createApiAuthentication} from '../services/apiAuthentication.js';
import {createSocialApiRuntime} from '../services/socialApiRuntime.js';
import {createSocialMetricsRouter} from './socialMetrics.js';
import {createSocialContentRouter} from './socialContent.js';
import {createSocialInfoRouter} from './socialInfo.js';
import {createFacebookShareRouter} from './facebookShare.js';
import {createFacebookHttpReaders} from '../services/facebookHttpReader.js';
import {createApiRequestGate} from '../services/apiRequestGate.js';
import {apiAwait,throwIfApiAborted} from '../services/apiRequestContext.js';

export function createPublicApiApp({key=process.env.AUTHEN_KEY_FOR_DOMAIN,runtime,facebookReaders,requestTimeoutMs=90000,maxQueued=8,queueTimeoutMs=10000,onRequestComplete=()=>{}}={}) {
  const authenticate=createApiAuthentication({key});
  runtime ||= createSocialApiRuntime();
  facebookReaders ||= createFacebookHttpReaders({getProxy:runtime.getProxy});
  const app=express();
  app.disable('x-powered-by');
  app.use(authenticate); // Before body parsing, health, routers, 404 and downstream calls.
  const gates=new Map(),gate=(name,maxConcurrent=2,timeout=requestTimeoutMs)=>{const value=createApiRequestGate({name,maxConcurrent,maxQueued,queueTimeoutMs,requestTimeoutMs:timeout,onComplete:onRequestComplete});gates.set(name,value);return value;};
  app.get('/api/health',(_req,res)=>res.json({status:'ok'}));
  app.get('/api/runtime/status',(_req,res)=>res.set('Cache-Control','no-store').json({status:'ok',uptimeSeconds:Math.floor(process.uptime()),routes:[...gates.values()].map(value=>value.snapshot())}));
  app.get('/api/ready',gate('readiness',2,5000).wrap(async(_req,res)=>{
   const proxy=await apiAwait(runtime.getProxy.status());
   const readyApiKeys=Array.isArray(proxy.keys)?proxy.keys.filter(value=>value.apiReserved&&!value.disabled&&!value.rotating&&value.proxyExpiresAt>Date.now()+30000).length:null;
   const ready=proxy.status==='ok'&&(!runtime.getProxy.managed||proxy.apiReservedKeyCount>0&&(readyApiKeys===null||readyApiKeys>0));
   res.status(ready?200:503).set('Cache-Control','no-store').json({status:ready?'ready':'not_ready',proxyStatus:proxy.status,apiReservedKeyCount:proxy.apiReservedKeyCount??null,readyApiKeys});
  }));
  app.get('/api/proxy/status',gate('proxy_status',2,10000).wrap(async(_req,res)=>{try{res.json(await apiAwait(runtime.getProxy.status()));}catch(e){throwIfApiAborted();res.status(503).json({status:'proxy_error',reason:/^PROXY_[A-Z_]+$/.test(e.code||'')?e.code:'PROXY_MANAGER_UNAVAILABLE'});}}));
  app.use(createSocialMetricsRouter({read:runtime.readMetrics,prepareInput:runtime.prepareInput,requestGate:gate('metrics')}));
  app.use(createSocialContentRouter({read:runtime.readContent,prepareInput:runtime.prepareInput,requestGates:Object.fromEntries(['source','comments','search'].map(name=>[name,gate(name)]))}));
  app.use(createSocialInfoRouter({readers:runtime.info,lookup:runtime.lookup,prepareInput:runtime.prepareInput,requestGates:Object.fromEntries(['post_info','comment_info','resolve'].map(name=>[name,gate(name)]))}));
  app.use(createFacebookShareRouter({...facebookReaders,requestGate:gate('facebook_details_share',4)}));
  app.use((_req,res)=>res.status(404).json({status:'not_found',reason:'ROUTE_NOT_FOUND'}));
  app.use((_error,_req,res,_next)=>res.status(500).json({status:'error',reason:'INTERNAL_ERROR'}));
  return app;
}
