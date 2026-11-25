import {createHash} from 'node:crypto';
import {snapshotPayloads} from './socialMetrics.js';
import {facebookAuthorRoute,parseFacebookAuthorRoutes} from './facebookAuthorIdentity.js';
import {facebookProfileDiagnostics} from './facebookProfileDiagnostics.js';
import {responseError,graphqlError} from '../../scripts/facebook_post_errors.js';
const fail=code=>Object.assign(Error(code),{code});

// Authentication remains in the caller's pinned local curl config. CSRF is
// derived from the current session and never returned or logged with UID proofs.
export function createFacebookLocalUidRoutes({request,expectedActorId,now=Date.now}={}){
 let contextPromise,contextAt=0;
 async function context(){
  if(contextPromise&&now()-contextAt<600000)return contextPromise;
  contextAt=now();
  contextPromise=(async()=>{
   const snapshot=await request('https://www.facebook.com/zuck');
   const error=responseError({status:snapshot.httpStatus,location:snapshot.finalUrl});if(error)throw error;
   const ctx={};
   const walk=value=>{if(!value||typeof value!=='object')return;
    if(Array.isArray(value)){
     const [name,,data]=value;
     if(name==='LSD')ctx.lsd=data?.token;
     if(name==='DTSGInitialData')ctx.fb_dtsg=data?.token;
     if(name==='CurrentUserInitialData')ctx.__user=String(data?.USER_ID||'');
     if(name==='SiteData'){
      for(const key of ['__spin_r','__spin_b','__spin_t'])if(data?.[key]!=null)ctx[key]=String(data[key]);
      if(data?.client_revision)ctx.__rev=String(data.client_revision);
     }
    }
    for(const child of Object.values(value))if(child&&typeof child==='object')walk(child);
   };
   snapshotPayloads(snapshot.html).forEach(walk);
   if(!expectedActorId||ctx.__user!==expectedActorId)throw fail('LOCAL_UID_AUTH_ACCOUNT_MISMATCH');
   if(!ctx.lsd||!ctx.fb_dtsg)throw fail('LOCAL_UID_AUTH_CONTEXT_MISSING');
   ctx.av=ctx.__user;ctx.jazoest='2'+[...ctx.fb_dtsg].reduce((sum,c)=>sum+c.charCodeAt(0),0);
   return ctx;
  })();
  try{return await contextPromise;}catch(error){contextPromise=null;throw error;}
 }
 return async function lookup(urls){
  const routes=[...new Set(urls.map(facebookAuthorRoute).filter(Boolean))];
  if(!routes.length)return{proofs:new Map(),missing:new Map()};
  if(routes.length>10)throw fail('LOCAL_UID_ROUTE_BATCH_TOO_LARGE');
  for(let attempt=0;attempt<2;attempt++){
   const form={...await context(),__a:'1',__comet_req:'15',routing_namespace:'fb_comet'};
   routes.forEach((route,i)=>{form[`route_urls[${i}]`]=route;});
   const snapshot=await request('https://www.facebook.com/ajax/bulk-route-definitions/',{routeForm:form});
   const error=responseError({status:snapshot.httpStatus,location:snapshot.finalUrl});if(error)throw error;
   let data;try{data=JSON.parse(snapshot.html.replace(/^for\s*\(;;\);\s*/,''));}catch{throw fail('LOCAL_UID_ROUTE_RESPONSE_INVALID');}
   if(data.error){
    const known=graphqlError([{message:[data.errorSummary,data.errorDescription].filter(x=>typeof x==='string').join(' ')}]);
    if(known?.code==='REQUEST_TOKEN_INVALID'&&attempt===0){contextPromise=null;continue;}
    throw known||fail('LOCAL_UID_ROUTE_REQUEST_REJECTED');
   }
   if(!data.payload?.payloads)throw fail('LOCAL_UID_ROUTE_PAYLOAD_MISSING');
   const digest=createHash('sha256').update(snapshot.html).digest('hex'),parsed=parseFacebookAuthorRoutes(data,routes),proofs=new Map(),missing=new Map();
   for(const route of routes){
    const proof=parsed.get(route);
    if(proof){proofs.set(route,{...proof,evidence:'public_profile.bulk_route.'+proof.evidence,responseSha256:digest});continue;}
    let result=data.payload.payloads[route]?.result;
    for(let i=0;i<5&&result?.type==='route_redirect';i++)result=result.redirect_result;
    const projection={initialRouteInfo:{route:result?.exports||{}}};
    const diagnostic=facebookProfileDiagnostics({httpStatus:snapshot.httpStatus,finalUrl:'https://www.facebook.com'+route,html:'<script type="application/json">'+JSON.stringify(projection).replaceAll('<','\\u003c')+'</script>'},'https://www.facebook.com'+route);
    if(diagnostic.limitEvidence)throw fail('FACEBOOK_RATE_LIMITED');
    if(/LOGIN_OR_CHECKPOINT/.test(diagnostic.reason))throw fail('AUTH_REQUIRED');
    missing.set(route,{reason:diagnostic.reason,responseSha256:digest});
   }
   return{proofs,missing};
  }
  throw fail('REQUEST_TOKEN_INVALID');
 };
}
