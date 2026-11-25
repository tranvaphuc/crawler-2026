import fs from'node:fs/promises';import path from'node:path';import https from'node:https';import{createProxiedSession,createHttpExecutor}from'../src/services/socialHttpTransport.js';import{normalizeContentInput}from'../src/services/socialContent.js';import{normalizeMetricsInput}from'../src/services/socialMetrics.js';import{READ_STATE}from'../src/services/socialReadState.js';import{disposeReadState}from'../src/services/socialLeaseState.js';import{hash,wireIdentity,wireRequest,inspectResponse}from'./proxy_local_audit_transport.mjs';
import'dotenv/config';const dir=path.resolve(process.env.AUDIT_DIR||'outputs/proxy-local-audit-2026-10-29');
const templates=path.resolve('outputs/proxy-manager-deploy-2026-10-25/release.credentials/deploy-private/templates');for(const t of ['GROUP','PAGE','USER'])process.env['FACEBOOK_FEED_HAR_'+t]=templates+'/'+t.toLowerCase()+'.json';process.env.FACEBOOK_COMMENTS_HAR=templates+'/comments.json';
const {createSocialApiRuntime}=await import('../src/services/socialApiRuntime.js');
const cases=JSON.parse(await fs.readFile(dir+'/'+(process.env.AUDIT_CASES_FILE||'cases.json')));const tapes=[],results=[],prefix=process.env.AUDIT_OUTPUT_PREFIX||'';
for(const c of cases){if(process.env.AUDIT_CASE_FILTER&&!new RegExp(process.env.AUDIT_CASE_FILTER).test(c.name))continue;
 const tape={case:c,requests:[]},agent=new https.Agent({keepAlive:true,maxSockets:1});let requestCount=0;
 const makeSession=options=>createProxiedSession({...options,requestImpl:(url,options,callback)=>{
  if(++requestCount>Number(process.env.AUDIT_MAX_REQUESTS||30))throw Object.assign(Error(),{code:'AUDIT_REQUEST_BUDGET'});
  const record={url:String(url),headers:{...options.headers},method:options.method,body:''};tape.requests.push(record);
  const req=https.request(url,{...options,agent},callback),write=req.write.bind(req);req.write=(chunk,...args)=>{record.body+=Buffer.isBuffer(chunk)?chunk.toString():String(chunk);return write(chunk,...args);};return req;
 }});
 const runtime=createSocialApiRuntime({getProxy:async()=>({server:'http://diagnostic-unused.invalid:1'}),makeSession,respectPlatformCooldown:false,timeoutMs:60000,attemptTimeoutMs:150000,failFastProxy:true,maxPages:1,maxItems:10000,streamComments:true,streamSourceItems:true,splitFacebookPages:true,nativeSourcePages:true,requireSourcePublicationTime:true});
 let state=c.native?{kind:'facebook',items:[],seen:new Set(),queue:[c.native],queued:new Set(),pending:true,collecting:true,unfiltered:true}:null;const pages=[],started=Date.now();
 try{
  for(let page=0;page<(c.pages||1);page++){
   let r;if(c.operation==='find_uid'){const {findFacebookUid}=await import('../src/services/facebookFindUid.js');const execute=createHttpExecutor({getProxy:async()=>({server:'http://diagnostic-unused.invalid:1'}),makeSession,respectPlatformCooldown:false,timeoutMs:60000,attemptTimeoutMs:90000,failFastProxy:true});r=await execute({platform:'facebook',operation:'resolve_source'},session=>findFacebookUid(session,c.body.item));}else if(c.operation==='raw'){const wire={url:c.body.url,method:'GET',headers:c.body.headers||{'user-agent':'Mozilla/5.0',accept:'text/html','accept-language':'en-US,en;q=0.9','accept-encoding':'gzip, deflate, br'},body:''};tape.requests.push(wire);const response=await wireRequest(wire);r={status:response.httpStatus===200?'ok':'error',reason:response.nativeCode||null,transport:{diagnostic:inspectResponse(response)}};}else if(c.operation==='source'||c.operation==='comments'||c.operation==='search'){
    const target=normalizeContentInput(c.operation,{...c.body,count:'all',limit:c.body.limit||10});if(state)Object.defineProperty(target,READ_STATE,{value:state});r=await runtime.readContent(target);state=r[READ_STATE]||state;
   }else if(c.operation==='metrics')r=await runtime.readMetrics(normalizeMetricsInput(c.body));
   else if(c.operation==='post_info')r=await runtime.info.postInfo(normalizeMetricsInput(c.body));
   else if(c.operation==='resolve_source')r=await runtime.info.sourceInfo({...c.body,platform:c.platform});
   pages.push({page,status:r.status,reason:r.reason||null,count:r.count??null,identityVerified:r.identityVerified||r.idVerified||false,metrics:r.metrics||null,itemTypes:(r.items||[]).reduce((a,x)=>(a[x.type]=(a[x.type]||0)+1,a),{}),pagination:r.pagination||null,coverage:r.coverage||null,emptySourceProof:r.emptySourceProof||null,transport:r.transport||null,upstreamCode:r.upstreamCode||null,upstreamOperation:r.upstreamOperation||null,upstreamQuery:r.upstreamQuery||null});
   if(!['ok','partial'].includes(r.status)||r.pagination?.hasMore===false||!state)break;
  }
 }catch(e){pages.push({status:'audit_error',reason:/^[A-Z_]+$/.test(e.code||'')?e.code:e.name});}finally{await disposeReadState(state);agent.destroy();}
 const row={name:c.name,platform:c.platform,operation:c.operation,url:c.body.url||null,elapsedMs:Date.now()-started,pages,wire:tape.requests.map(wireIdentity)};tapes.push(tape);results.push(row);
 await fs.writeFile(dir+'/'+prefix+'wire-tapes.credentials.json',JSON.stringify(tapes),{mode:0o600});await fs.writeFile(dir+'/'+prefix+'baseline.json',JSON.stringify(results,null,2));console.log(JSON.stringify({name:c.name,requests:tape.requests.length,pages:pages.map(x=>({status:x.status,reason:x.reason,count:x.count})),elapsedMs:row.elapsedMs}));
}
