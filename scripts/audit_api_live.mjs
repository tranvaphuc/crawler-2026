// Bounded, sequential smoke checks. No crawler loops, no automatic retries.
import express from 'express';
import fs from 'node:fs/promises';
import {once} from 'node:events';
import {createFacebookShareRouter} from '../src/routes/facebookShare.js';
import {createSocialMetricsRouter} from '../src/routes/socialMetrics.js';
import {createSocialContentRouter} from '../src/routes/socialContent.js';
import {createSocialHttpMetricsReader} from '../src/services/socialHttpReaders.js';
import {createSocialHttpContentReader} from '../src/services/socialHttpReaders.js';
import {createNamedProxyPoolProvider} from '../src/services/socialProxyPools.js';
const out='outputs/api-audit-2026-10-23';await fs.mkdir(out,{recursive:true});
const getProxy=createNamedProxyPoolProvider('outputs/social-proxy-pools-2026-10-23/runtime.credentials.json');
const app=express();app.use(createFacebookShareRouter());app.use(createSocialMetricsRouter({read:createSocialHttpMetricsReader({getProxy})}));app.use(createSocialContentRouter({read:createSocialHttpContentReader({getProxy})}));
const server=app.listen(0,'127.0.0.1');await once(server,'listening');
const cases=[
 ['share','/api/facebook/post/share',{id:'61588342686925_122131613781278089'}],
 ['details','/api/facebook/post/details',{id:'1000419343151470_122138942931244237'}],
 ['metrics','/api/social/post/metrics',{url:'https://www.instagram.com/p/CciJju6P5In/'}],
 ['source','/api/social/source/posts',{url:'https://www.youtube.com/@vtv24',limit:5}],
 ['comments','/api/social/post/comments',{url:'https://www.threads.com/@dthh___n/post/DSl1YphAcpY',limit:5,includeReplies:true}],
 ['search','/api/social/search',{platform:'youtube',keyword:'HAPAS',order:'latest',limit:20}]
];
const reports=[],blocked=new Set();
try{
 for(const [name,path,body] of cases){
  const platform=body.platform || (body.url?.includes('youtube')?'youtube':body.url?.includes('threads')?'threads':body.url?.includes('instagram')?'instagram':'facebook');
  if(blocked.has(platform)){reports.push({name,skipped:true,reason:'EARLIER_ACCESS_OR_RATE_FAILURE',platform});continue;}
  const started=Date.now();let report;
  try{
   const response=await fetch(`http://127.0.0.1:${server.address().port}${path}`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(85000)});
   const value=await response.json();await fs.writeFile(`${out}/${name}.json`,JSON.stringify(value,null,2));
   report={name,platform,httpStatus:response.status,status:value.status,reason:value.reason??null,ok:value.ok,count:value.count,isShare:value.isShare,identityVerified:value.identityVerified,transport:value.transport,elapsedMs:Date.now()-started};
   if(['auth_required','security_checkpoint','rate_limited','proxy_error'].includes(value.status)||['AUTH_OR_SECURITY_REQUIRED','RATE_LIMITED'].includes(value.reason))blocked.add(platform);
  }catch{report={name,platform,status:'error',reason:'SMOKE_REQUEST_FAILED',elapsedMs:Date.now()-started};blocked.add(platform);}
  reports.push(report);console.log(JSON.stringify(report));await fs.writeFile(`${out}/live-report.json`,JSON.stringify({checkedAt:new Date().toISOString(),reports},null,2));
 }
}finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
