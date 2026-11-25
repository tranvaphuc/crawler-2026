/** Bounded public API regression for a supplied Facebook group post. */
import 'dotenv/config';import fs from 'node:fs/promises';
const dir=process.env.FB_TEST_DIR||'outputs/facebook-group-comment-retest-2026-10-25';await fs.mkdir(dir,{recursive:true});
const base=process.env.DOMAIN_FOR_API.startsWith('http')?process.env.DOMAIN_FOR_API:'https://'+process.env.DOMAIN_FOR_API;
const body={platform:'facebook',url:process.env.FB_TEST_URL||'https://www.facebook.com/groups/congdongisocialcom/permalink/3615941351894944/',limit:'all',includeReplies:true},report={startedAt:new Date().toISOString(),body,pages:[],items:[]};let cursor=null;
for(let n=0;n<12;n++){
 const r=await fetch(base+'/api/social/post/comments',{method:'POST',headers:{authorization:'Bearer '+process.env.AUTHEN_KEY_FOR_DOMAIN,'content-type':'application/json'},body:JSON.stringify({...body,...(cursor?{cursor}:{})}),signal:AbortSignal.timeout(85000)});const d=await r.json();
 report.pages.push({http:r.status,status:d.status,reason:d.reason,count:d.count,stagedCount:d.stagedCount,upstreamCode:d.upstreamCode,upstreamQuery:d.upstreamQuery,upstreamOperation:d.upstreamOperation,pagination:d.pagination,coverage:d.coverage,ordering:d.ordering,transport:d.transport});report.items.push(...(d.items||[]));
 await fs.writeFile(dir+'/production-api-report.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report.pages.at(-1)));
 if(!['ok','partial'].includes(d.status))break;cursor=d.pagination?.nextCursor;if(!cursor)break;
}
report.finishedAt=new Date().toISOString();report.rootComments=report.items.filter(x=>x.type==='comment').length;report.replies=report.items.filter(x=>x.type==='reply').length;report.unique=new Set(report.items.map(x=>x.id)).size;await fs.writeFile(dir+'/production-api-report.json',JSON.stringify(report,null,2));
