import fs from 'node:fs/promises';
const endpoint=new URL('/v1/status',process.env.PROXY_MANAGER_URL||'http://127.0.0.1:3810');
if(endpoint.protocol!=='https:'&&!(endpoint.protocol==='http:'&&['127.0.0.1','localhost','[::1]'].includes(endpoint.hostname)))throw Error('PROXY_MANAGER_URL_NOT_LOCAL');
const response=await fetch(endpoint,{headers:{authorization:`Bearer ${process.env.PROXY_MANAGER_AUTH_KEY}`},signal:AbortSignal.timeout(15000)});
if(!response.ok)throw Error('PROXY_MANAGER_STATUS_FAILED');
const status=await response.json(),scopes=new Map();
for(const key of status.keys||[])for(const [scope,entry] of Object.entries(key.scopes||{})){
 const value=scopes.get(scope)||{success:0,failed:0};value.success+=Number(entry.success)||0;value.failed+=Number(entry.failed)||0;scopes.set(scope,value);
}
const summary={at:new Date().toISOString(),definition:'proxy_manager_report_calls_not_raw_http_requests',keyCount:status.keyCount,readyKeys:status.readyKeys,backgroundActiveLeases:status.backgroundActiveLeases,apiReservedKeyCount:status.apiReservedKeyCount,scopes:Object.fromEntries([...scopes].sort(([a],[b])=>a.localeCompare(b)))};
const path='/var/lib/crawler-v8/proxy-request-summary.json';await fs.writeFile(path+'.tmp',JSON.stringify(summary,null,2),{mode:0o600});await fs.rename(path+'.tmp',path);console.log(JSON.stringify(summary));
