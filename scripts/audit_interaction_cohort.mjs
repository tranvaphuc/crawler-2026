import 'dotenv/config';
import fs from 'node:fs/promises';
const input=process.argv[2]||'outputs/interaction-cohort-2026-11-06/input.json',out=process.argv[3]||'outputs/interaction-cohort-2026-11-06/baseline.json';
const rows=JSON.parse(await fs.readFile(input)),base=process.env.DOMAIN_FOR_API.startsWith('http')?process.env.DOMAIN_FOR_API:'https://'+process.env.DOMAIN_FOR_API,headers={authorization:'Bearer '+process.env.AUTHEN_KEY_FOR_DOMAIN,'content-type':'application/json'},results=[],startedAt=new Date();let index=0;
const gates=new Map();
let saving=Promise.resolve();
function save(){const snapshot=JSON.stringify({startedAt,updatedAt:new Date(),results:[...results].sort((a,b)=>a.number-b.number)},null,2)+'\n';saving=saving.then(async()=>{await fs.writeFile(out+'.tmp',snapshot,{mode:0o600});await fs.rename(out+'.tmp',out);});return saving;}
async function worker(){while(index<rows.length){const row=rows[index++],at=new Date(),start=Date.now();let result;
 if(gates.has(row.platform)){result={...row,at,attempted:false,status:'unstarted',reason:'UPSTREAM_PLATFORM_GATE',gate:gates.get(row.platform)};}
 else try{const r=await fetch(base+'/api/social/post/metrics',{method:'POST',headers,body:JSON.stringify({url:row.url}),signal:AbortSignal.timeout(100000)}),v=await r.json();result={...row,at,attempted:true,http:r.status,elapsedMs:Date.now()-start,status:v.status,reason:v.reason||null,identityVerified:v.identityVerified,nativeId:v.nativeId||null,metrics:v.metrics||null,available:Object.entries(v.metrics||{}).filter(([,v])=>v!==null).map(([k])=>k),accessEvidence:v.accessEvidence||null,fallback:v.transport?.identityFallback||null,retryAfter:r.headers.get('retry-after'),transport:v.transport?{requests:v.transport.requests,failurePhase:v.transport.failurePhase,nativeCode:v.transport.nativeCode,networkTimings:v.transport.networkTimings}:null};
 if(['rate_limited','auth_required','security_checkpoint'].includes(v.status))gates.set(row.platform,{status:v.status,reason:v.reason,retryAfter:result.retryAfter,at:new Date()});
 }catch(e){result={...row,at,attempted:true,status:'client_error',reason:e.name,elapsedMs:Date.now()-start};}
 results.push(result);await save();console.log(JSON.stringify({number:row.number,platform:row.platform,id:row.id,status:result.status,reason:result.reason,http:result.http,available:result.available,elapsedMs:result.elapsedMs}));await new Promise(resolve=>setTimeout(resolve,350));
}}
await Promise.all([worker(),worker()]);await save();console.log(JSON.stringify({event:'cohort_finished',total:rows.length,attempted:results.filter(x=>x.attempted).length,successful:results.filter(x=>['ok','partial'].includes(x.status)&&x.identityVerified&&x.available.length).length,statuses:results.reduce((a,r)=>(a[r.status]=(a[r.status]||0)+1,a),{}),report:out}));
