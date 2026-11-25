import fs from'node:fs/promises';import path from'node:path';import{wireRequest,inspectResponse,wireIdentity,proxyAgent,hash}from'./proxy_local_audit_transport.mjs';
const dir=path.resolve(process.env.AUDIT_DIR||'outputs/proxy-local-audit-2026-10-29'),tapes=JSON.parse(await fs.readFile(dir+'/'+(process.env.AUDIT_TAPES_FILE||'wire-tapes.credentials.json'))),leaseText=await fs.readFile(dir+'/'+(process.env.AUDIT_LEASE_FILE||'api-leases.credentials.json'),'utf8'),leases=JSON.parse(leaseText.trim().split('\n').at(-1)).leases;
const routes=[{label:'local',proxy:null},...leases.map((proxy,i)=>({label:(process.env.AUDIT_PROXY_PREFIX||'P')+(i+1),proxy}))],results=[];let tasks=[];
for(const tape of tapes){
 if(process.env.AUDIT_CASE_FILTER&&!new RegExp(process.env.AUDIT_CASE_FILTER).test(tape.case.name))continue;
 const wires=process.env.AUDIT_ALL_WIRES==='1'?tape.requests:tape.requests.filter((w,i,a)=>i===0||w.method==='POST'&&!a.slice(0,i).some(x=>x.method==='POST'));
 for(const wire of wires)for(const route of routes)tasks.push({tape,wire,route});
}
async function run({tape,wire,route}){
 const start=Date.now(),p=route.proxy;const r=await wireRequest(wire,{proxy:p,timeoutMs:60000});const result={at:new Date(start).toISOString(),case:tape.case.name,platform:tape.case.platform,operation:tape.case.operation,routeLabel:route.label,proxyFingerprint:p?hash([p.host,p.port,p.server,p.generation]):null,generation:p?.generation||null,ttlRemainingAtStartMs:p?.expiresAt?p.expiresAt-start:null,request:wireIdentity(wire),response:inspectResponse(r)};
 results.push(result);await fs.appendFile(dir+'/comparison.jsonl',JSON.stringify(result)+'\n');console.log(JSON.stringify({case:result.case,route:route.label,status:r.httpStatus||null,error:r.nativeCode||null,phase:r.phase,ms:r.elapsedMs,ttl:result.ttlRemainingAtStartMs}));
}
let next=0;await Promise.all(Array.from({length:Number(process.env.AUDIT_CONCURRENCY||8)},async()=>{while(next<tasks.length)await run(tasks[next++]);}));await fs.writeFile(dir+'/comparison-summary.json',JSON.stringify({at:new Date(),planned:tasks.length,executed:results.length,results},null,2));
