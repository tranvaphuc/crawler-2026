// Bounded read-only smoke check. Never writes raw content, cursors, or secrets.
import 'dotenv/config';
import fs from 'node:fs/promises';
import path from 'node:path';
const configured=new URL(process.env.DOMAIN_FOR_API.includes('://')?process.env.DOMAIN_FOR_API:'https://'+process.env.DOMAIN_FOR_API);
const base=new URL(process.env.API_STABILITY_BASE_URL||configured.origin);
if(base.username||base.password||base.search||base.hash||base.pathname!=='/'||!(base.protocol==='https:'&&base.hostname===configured.hostname||base.protocol==='http:'&&['127.0.0.1','localhost','[::1]'].includes(base.hostname)))throw Error('INVALID_API_STABILITY_BASE');
const headers={authorization:'Bearer '+process.env.AUTHEN_KEY_FOR_DOMAIN,'content-type':'application/json'},results=[];
const out=path.resolve(process.env.API_STABILITY_REPORT||'outputs/api-stability-fix-2026-11-05/live-smoke.json');
const startedAt=new Date();
async function call(name,endpoint,body){
 const at=new Date(),start=Date.now();let v=null,row;
 try{
  const r=await fetch(new URL(endpoint,base),{headers,method:body?'POST':'GET',...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(100000)});
  v=await r.json();const issues=[];
  if(r.status!==200)issues.push('HTTP_'+r.status);
  if(!['ok','partial','resolved','ready'].includes(v.status))issues.push(v.reason||'BUSINESS_'+v.status);
  if(Array.isArray(v.items)){
   if(v.count!==v.items.length)issues.push('COUNT_ITEMS_MISMATCH');
   if(new Set(v.items.map(x=>x.id)).size!==v.items.length)issues.push('DUPLICATE_PAGE_IDS');
  }
  if(v.metrics&&Object.values(v.metrics).some(x=>x!==null&&(!Number.isSafeInteger(x)||x<0)))issues.push('INVALID_COUNTER');
  row={name,endpoint,at,http:r.status,elapsedMs:Date.now()-start,status:v.status,reason:v.reason||null,identityVerified:v.identityVerified??v.idVerified??null,count:v.count??null,phase:v.phase||null,metricFields:Object.entries(v.metrics||{}).filter(([,v])=>v!==null).map(([key])=>key),hasNextCursor:!!v.pagination?.nextCursor,paginationComplete:v.pagination?.complete??null,transport:v.transport?{mode:v.transport.mode,proxyUsed:v.transport.proxyUsed,browserUsed:v.transport.browserUsed,requests:v.transport.requests}:null,routes:v.routes,readyApiKeys:v.readyApiKeys,issues};
 }catch(e){row={name,endpoint,at,elapsedMs:Date.now()-start,error:e.name,issues:['CLIENT_REQUEST_FAILED']};}
 results.push(row);console.log(JSON.stringify(row));return v;
}
const youtube='https://www.youtube.com/watch?v=wlQndvtII1M',facebook='https://www.facebook.com/1000419343151470_122138942931244237';
await call('health','/api/health');await call('ready','/api/ready');await call('runtime-before','/api/runtime/status');
for(const [platform,url] of [['youtube',youtube],['facebook',facebook],['instagram','https://www.instagram.com/p/DeFOCuYv75Y/']])await call(platform+'-metrics','/api/social/post/metrics',{url});
await call('facebook-info','/api/social/post/info',{url:facebook});
await call('facebook-resolve','/api/social/resource/resolve',{url:facebook});
await call('facebook-details','/api/facebook/post/details',{id:'1000419343151470_122138942931244237'});
await call('facebook-share-analysis','/api/facebook/post/share',{id:'61588342686925_122131613781278089'});
const source={url:'https://www.youtube.com/@VTV24',limit:2},first=await call('youtube-source-page1','/api/social/source/posts',source);
if(first?.pagination?.nextCursor){
 const second=await call('youtube-source-page2','/api/social/source/posts',{...source,cursor:first.pagination.nextCursor}),ids=new Set((first.items||[]).map(x=>x.id));
 results.push({name:'cross-page-integrity',count:(first.items?.length||0)+(second?.items?.length||0),duplicates:(second?.items||[]).filter(x=>ids.has(x.id)).length,issues:(second?.items||[]).some(x=>ids.has(x.id))?['DUPLICATE_CROSS_PAGE_IDS']:[]});
}
const comments=await call('youtube-comments','/api/social/post/comments',{url:youtube,limit:2,order:'platform_default'});
if(comments?.items?.[0]?.url)await call('youtube-comment-info','/api/social/comment/info',{url:comments.items[0].url});
await call('youtube-search','/api/social/search',{platform:'youtube',keyword:'VTV24',order:'relevance',limit:2,count:2});
const feed=await call('facebook-source','/api/social/source/posts',{url:'https://www.facebook.com/1794121197534939',sourceType:'page',limit:2});
if(feed?.items?.[0]?.url)await call('facebook-fresh-comments','/api/social/post/comments',{url:feed.items[0].url,limit:2});
// Four requests exercise both running slots and the small FIFO burst queue.
await Promise.all(Array.from({length:4},(_,i)=>call('metrics-burst-'+i,'/api/social/post/metrics',{url:youtube})));
await call('runtime-after','/api/runtime/status');await call('ready-after','/api/ready');
const summary={startedAt,finishedAt:new Date(),requests:results.filter(x=>x.http||x.error).length,issues:results.filter(x=>x.issues?.length).map(x=>({name:x.name,issues:x.issues})),busy:results.filter(x=>x.status==='busy').length,timeouts:results.filter(x=>x.http===504||x.error==='TimeoutError').length};
await fs.mkdir(path.dirname(out),{recursive:true});await fs.writeFile(out,JSON.stringify({summary,results},null,2)+'\n',{mode:0o600});console.log(JSON.stringify({event:'api_stability_smoke_finished',...summary,report:out}));
if(summary.issues.length)process.exitCode=2;
