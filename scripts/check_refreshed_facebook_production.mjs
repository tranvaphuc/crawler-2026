import 'dotenv/config';import fs from 'node:fs/promises';
const base=process.env.DOMAIN_FOR_API.startsWith('http')?process.env.DOMAIN_FOR_API:'https://'+process.env.DOMAIN_FOR_API,rows=[];
const body={url:'https://www.facebook.com/100201629178552/posts/1131594819369667',count:6,limit:3,includeReplies:true,order:'oldest'};let cursor;
for(let n=0;n<6;n++){
 const t=Date.now();const r=await fetch(base+'/api/social/post/comments',{method:'POST',headers:{authorization:'Bearer '+process.env.AUTHEN_KEY_FOR_DOMAIN,'content-type':'application/json'},body:JSON.stringify({...body,...(cursor?{cursor}:{})}),signal:AbortSignal.timeout(130000)}),d=await r.json();
 await fs.writeFile('outputs/facebook-request-refresh-2026-10-24/production-cursor-private.json',JSON.stringify({body,nextCursor:d.pagination?.nextCursor||null,retryCursor:d.retryCursor||null}),{mode:0o600});
 const row={page:n+1,checkedAt:d.checkedAt,http:r.status,status:d.status,reason:d.reason||null,upstreamCode:d.upstreamCode||null,upstreamHttpStatus:d.upstreamHttpStatus||null,upstreamQuery:d.upstreamQuery||null,phase:d.phase||null,count:d.count,stagedCount:d.stagedCount,rootComments:d.rootComments,replies:d.replies,ordering:d.ordering,coverage:d.coverage,transport:d.transport,hasNextCursor:!!d.pagination?.nextCursor,retryAfterMs:d.retryAfterMs||null,elapsedMs:Date.now()-t};rows.push(row);console.log(JSON.stringify(row));await fs.writeFile('outputs/facebook-request-refresh-2026-10-24/production-api-report.json',JSON.stringify({updatedAt:new Date().toISOString(),baseUrl:base,rows},null,2));
 if(!['ok','partial'].includes(d.status)||!d.pagination?.nextCursor)break;cursor=d.pagination.nextCursor;
}
