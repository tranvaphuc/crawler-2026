import {snapshotPayloads}from './socialMetrics.js';
import {walkContent}from './socialContent.js';
/** Read native anonymous query manifests/tokens in RAM only, never client output. */
export function metaBootstrap(html){
 const roots=snapshotPayloads(html),queries=[];let lsd=null;
 for(const root of roots)walkContent(root,v=>{
  if(v.queryID&&typeof v.queryName==='string'&&v.variables&&typeof v.variables==='object')queries.push({name:v.queryName,docId:String(v.queryID),variables:v.variables});
  if(Array.isArray(v)&&v[0]==='LSD'&&typeof v[2]?.token==='string')lsd=v[2].token;
 });
 return {queries,lsd};
}
export async function requestMetaQuery(session,target,bootstrap,query,variables){
 if(!bootstrap.lsd)throw Object.assign(new Error('ANONYMOUS_QUERY_CONTEXT_UNAVAILABLE'),{code:'ANONYMOUS_QUERY_CONTEXT_UNAVAILABLE'});
 const endpoint=target.platform==='instagram'?'https://www.instagram.com/api/graphql':'https://www.threads.com/api/graphql';
 const body=new URLSearchParams({__user:'0',__a:'1',__req:'1',dpr:'1',lsd:bootstrap.lsd,fb_api_caller_class:'RelayModern',fb_api_req_friendly_name:query.name,variables:JSON.stringify(variables),server_timestamps:'true',doc_id:query.docId}).toString();
 return session.request(endpoint,{method:'POST',body,headers:{'content-type':'application/x-www-form-urlencoded','x-fb-lsd':bootstrap.lsd,'x-fb-friendly-name':query.name,referer:target.url,origin:new URL(endpoint).origin,accept:'application/json'}});
}
