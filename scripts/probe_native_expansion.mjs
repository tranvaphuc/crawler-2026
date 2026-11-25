import fs from'node:fs/promises';
import {createHttpExecutor}from'../src/services/socialHttpTransport.js';
import {metaBootstrap,requestMetaQuery}from'../src/services/socialMetaRequests.js';
import {normalizeContentInput,extractContentSnapshot,walkContent}from'../src/services/socialContent.js';
import {snapshotPayloads}from'../src/services/socialMetrics.js';
const run=createHttpExecutor(),reports=[];
for(const[platform,url]of[['threads','https://www.threads.com/@hapas.vn'],['instagram','https://www.instagram.com/hapas.vn/']]){
 const t=normalizeContentInput('source',{url,limit:100});
 const r=await run(t,async session=>{
  const snapshot=await session.request(t.url),bootstrap=metaBootstrap(snapshot.html),query=bootstrap.queries.find(x=>/ProfileThreadsTabDirectQuery|ProfilePostsTabContentQuery/.test(x.name));
  if(!query)return{status:'unavailable',reason:'QUERY_MANIFEST_UNAVAILABLE'};
  const response=await requestMetaQuery(session,t,bootstrap,query,{...query.variables,first:100});
  const data=extractContentSnapshot(t,{...snapshot,jsonResponses:[response.html],httpStatus:response.httpStatus});
  const conns=[];for(const root of snapshotPayloads('',[response.html]))walkContent(root,(v,p)=>{if(v.page_info)conns.push({path:p,count:v.edges?.length,next:v.page_info.has_next_page,keys:Object.keys(v.page_info)});});
  return {status:data.status,reason:data.reason,httpStatus:response.httpStatus,items:data.count,conns};
 });reports.push({platform,...r});console.log(JSON.stringify({platform,...r}));}
await fs.writeFile('outputs/social-ordering-audit-2026-10-23/expansion.json',JSON.stringify(reports,null,2));
