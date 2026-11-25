// Sequential development smoke test; no browser imports, no retries, no saved sessions.
import fs from 'node:fs/promises';
import {createSocialHttpMetricsReader,createSocialHttpContentReader} from '../src/services/socialHttpReaders.js';
import {createFacebookHttpReaders} from '../src/services/facebookHttpReader.js';
import {createConfiguredProxyProvider} from '../src/services/socialProxyConfig.js';
const out='outputs/http-api-transport-2026-10-23';await fs.mkdir(out,{recursive:true});
const getProxy=createConfiguredProxyProvider(),metrics=createSocialHttpMetricsReader({getProxy}),content=createSocialHttpContentReader({getProxy});
const {normalizeMetricsInput}=await import('../src/services/socialMetrics.js');const {normalizeContentInput}=await import('../src/services/socialContent.js');
const fb=createFacebookHttpReaders({getProxy}),reports=[],blocked=new Set();
const posts={facebook:'https://www.facebook.com/1000419343151470_122138942931244237',threads:'https://www.threads.com/@dthh___n/post/DSl1YphAcpY',instagram:'https://www.instagram.com/p/CciJju6P5In/',youtube:'https://www.youtube.com/watch?v=wlQndvtII1M'};
const sources={threads:'https://www.threads.com/@hapas.vn',instagram:'https://www.instagram.com/hapas.vn/',youtube:'https://www.youtube.com/@vtv24'};
const cases=[['facebook','share',()=>fb.check('61588342686925_122131613781278089')],['facebook','details',()=>fb.details('1000419343151470_122138942931244237')],...Object.entries(posts).map(([p,url])=>[p,'metrics',()=>metrics(normalizeMetricsInput({url}))]),...Object.entries(sources).map(([p,url])=>[p,'source',()=>content(normalizeContentInput('source',{url,limit:5}))]),...Object.entries(posts).filter(([p])=>p!=='facebook').map(([p,url])=>[p,'comments',()=>content(normalizeContentInput('comments',{url,limit:10,includeReplies:true}))]),...['threads','youtube'].map(p=>[p,'search',()=>content(normalizeContentInput('search',{platform:p,keyword:'HAPAS',order:'latest'}))])];
for(const [platform,operation,run] of cases){
 if(blocked.has(platform)){reports.push({platform,operation,skipped:true,reason:'EARLIER_ACCESS_OR_RATE_FAILURE'});continue;}
 const start=Date.now();const value=await run();await fs.writeFile(`${out}/${platform}-${operation}.json`,JSON.stringify(value,null,2));
 const r={platform,operation,status:value.status,reason:value.reason??null,count:value.count,transport:value.transport,elapsedMs:Date.now()-start};reports.push(r);console.log(JSON.stringify(r));
 if(['auth_required','security_checkpoint','rate_limited','proxy_error'].includes(value.status)||['AUTH_OR_SECURITY_REQUIRED','RATE_LIMITED'].includes(value.reason))blocked.add(platform);
 await fs.writeFile(`${out}/http-live-report.json`,JSON.stringify({checkedAt:new Date().toISOString(),reports},null,2));
}
