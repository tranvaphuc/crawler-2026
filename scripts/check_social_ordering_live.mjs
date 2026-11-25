// Explicit bounded HTTP checks; no browser, no crawler loop, no automatic retry.
import express from'express';import fs from'node:fs/promises';import{once}from'node:events';
import{createSocialContentRouter}from'../src/routes/socialContent.js';
const app=express();app.use(createSocialContentRouter());const server=app.listen(0,'127.0.0.1');await once(server,'listening');
const out='outputs/social-ordering-audit-2026-10-23';await fs.mkdir(out,{recursive:true});
const cases=[['threads','source',{url:'https://www.threads.com/@hapas.vn',limit:20,order:'latest'}],['instagram','source',{url:'https://www.instagram.com/hapas.vn/',limit:5,order:'latest'}],['youtube','source',{url:'https://www.youtube.com/@vtv24',limit:20,order:'latest'}],['threads','comments',{url:'https://www.threads.com/@dthh___n/post/DSl1YphAcpY',limit:2,order:'oldest',includeReplies:true}],['instagram','comments',{url:'https://www.instagram.com/p/CciJju6P5In/',limit:4,order:'oldest',includeReplies:true}],['youtube','comments',{url:'https://www.youtube.com/watch?v=wlQndvtII1M',limit:50,order:'oldest',includeReplies:true}]];
const reports=[],blocked=new Set();
try{for(const[platform,operation,input]of cases){
 if(blocked.has(platform))continue;let cursor,previousNative=0;const pages=[],items=new Map(),tokens=new Set();
 for(let n=0;n<(operation==='comments'?30:2);n++){
  const start=Date.now();const response=await fetch(`http://127.0.0.1:${server.address().port}/api/social/${operation==='source'?'source/posts':'post/comments'}`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({...input,...(cursor?{cursor}:{})}),signal:AbortSignal.timeout(70000)});
  const value=await response.json();for(const item of value.items||[])items.set(item.id,item);previousNative+=value.transport?.requests||0;
  const progress={page:n+1,httpStatus:response.status,status:value.status,reason:value.reason,phase:value.phase,count:value.count,stagedCount:value.stagedCount,ordering:value.ordering,coverage:value.coverage,pagination:{...value.pagination,nextCursor:!!value.pagination?.nextCursor},transport:value.transport,elapsedMs:Date.now()-start};pages.push(progress);
  console.log(JSON.stringify({platform,operation,...progress}));
  if(['rate_limited','auth_required','security_checkpoint','proxy_error','error'].includes(value.status)){blocked.add(platform);break;}
  cursor=value.pagination?.nextCursor;if(!cursor||tokens.has(cursor))break;tokens.add(cursor);
 }
 const report={platform,operation,input,pages,unique:items.size,nativeRequests:previousNative};reports.push(report);await fs.writeFile(`${out}/${platform}-${operation}-items.json`,JSON.stringify([...items.values()],null,2));await fs.writeFile(`${out}/live-ordering.json`,JSON.stringify({checkedAt:new Date().toISOString(),reports},null,2));
}}finally{server.closeAllConnections();await new Promise(r=>server.close(r));}
