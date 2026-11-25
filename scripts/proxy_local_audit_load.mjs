import fs from'node:fs/promises';import path from'node:path';import{setTimeout as sleep}from'node:timers/promises';import{wireRequest,inspectResponse,wireIdentity,hash,proxyAgent}from'./proxy_local_audit_transport.mjs';
const dir=path.resolve('outputs/proxy-local-audit-2026-10-29'),tapes=JSON.parse(await fs.readFile(dir+'/wire-tapes.credentials.json')),leases=JSON.parse(await fs.readFile(dir+'/local-fresh-leases.credentials.json')).leases,health=tapes.find(x=>x.case.name==='control-owned-api-health').requests[0],trace={url:'https://www.cloudflare.com/cdn-cgi/trace',method:'GET',headers:{'user-agent':'Mozilla/5.0',accept:'text/plain'},body:''};
const plans=[{name:'facebook-source-group',index:0,post:true},{name:'facebook-comments-user',index:0,post:true},{name:'instagram-source',index:1},{name:'instagram-comments-replies',index:1,post:true},{name:'youtube-comments-replies',index:2,post:true},{name:'youtube-source',index:2},{name:'threads-source',index:3,post:true},{name:'threads-search',index:3}];
const emit=async x=>{await fs.appendFile(dir+'/load-results.jsonl',JSON.stringify(x)+'\n');console.log(JSON.stringify({name:x.name,phase:x.testPhase,stage:x.stage,status:x.response?.httpStatus,error:x.response?.nativeCode,outcome:x.response?.outcome,seq:x.sequence}));};
async function runPlan(plan){
 const tape=tapes.find(x=>x.case.name===plan.name),wire=plan.post?tape.requests.find(x=>x.method==='POST'):tape.requests.find(x=>x.method==='GET'),proxy=leases[plan.index];if(!wire){await emit({name:plan.name,testPhase:'unsupported',reason:'NO_MATCHING_WIRE'});return;}
 if(process.env.AUDIT_CASE_FILTER&&!new RegExp(process.env.AUDIT_CASE_FILTER).test(plan.name))return;
 const agent=proxyAgent(proxy);agent.maxSockets=32;const common={name:plan.name,platform:tape.case.platform,proxyLabel:'G'+(plan.index+1),generation:proxy.generation,proxyFingerprint:hash([proxy.host,proxy.port,proxy.generation]),request:wireIdentity(wire)};let sequence=0,trigger=null;
 const call=async(testPhase,stage)=>{const seq=++sequence,started=Date.now(),r=await wireRequest(wire,{proxy:testPhase==='local_before'||testPhase==='local_after'?null:proxy,agent:testPhase.startsWith('local_')?undefined:agent});const row={...common,at:new Date(started),testPhase,stage,sequence:seq,ttlAtStartMs:proxy.expiresAt-started,response:inspectResponse(r)};await emit(row);return row;};
 try{
  await call('local_before',null);const before=await call('proxy_before',null);
  if(['rate_limited','login_redirect','access_denied'].includes(before.response.outcome)||before.response.nativeCode){trigger=before;}
  for(const stage of (process.env.AUDIT_HIGH_LOAD==='1'?[{concurrency:16,count:128,rps:32},{concurrency:32,count:256,rps:64}]:[{concurrency:1,count:8,rps:2},{concurrency:2,count:16,rps:4},{concurrency:4,count:32,rps:8},{concurrency:8,count:64,rps:16}])){
   if(trigger||proxy.expiresAt-Date.now()<120000)break;let cursor=0,nextAt=Date.now();
   await Promise.all(Array.from({length:stage.concurrency},async()=>{while(cursor<stage.count&&!trigger){cursor++;const scheduled=nextAt;nextAt+=1000/stage.rps;await sleep(Math.max(0,scheduled-Date.now()));const row=await call('load',stage);if(['rate_limited','login_redirect','access_denied'].includes(row.response.outcome)||row.response.nativeCode)trigger ||= row;}}));
  }
  if(trigger){
   for(const [label,w]of[['owned_health',health],['independent_health',trace]]){const r=await wireRequest(w,{proxy});await emit({...common,name:plan.name,testPhase:label,at:new Date(),response:inspectResponse(r)});}
   const alternate=leases[(plan.index+1)%4],r=await wireRequest(wire,{proxy:alternate});await emit({...common,testPhase:'alternate_proxy',at:new Date(),alternateProxy:'G'+((plan.index+1)%4+1),alternateGeneration:alternate.generation,response:inspectResponse(r)});
  }
  await call('local_after',null);
  await fs.appendFile(dir+'/load-summary.jsonl',JSON.stringify({...common,finishedAt:new Date(),requests:sequence,firstTrigger:trigger?{sequence:trigger.sequence,stage:trigger.stage,response:trigger.response}:null,stopReason:trigger?'FIRST_LIMIT_OR_NETWORK_ERROR':proxy.expiresAt-Date.now()<120000?'TTL_GUARD':'BUDGET_COMPLETED_NO_LIMIT'})+'\n');
 }finally{agent.destroy();}
}
await Promise.all([0,1,2,3].map(async index=>{for(const plan of plans.filter(x=>x.index===index))await runPlan(plan);}));
