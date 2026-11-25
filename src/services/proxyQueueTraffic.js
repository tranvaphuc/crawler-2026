// Successful permits are admissions to HTTP, not proof that bytes reached origin.
// Keep only bounded, short-lived counters; no URLs, cookies, bodies or raw IPs.
export function createProxyQueueTraffic({now=Date.now,maxEndpoints=512,windowMs=120000,idleMs=300000}={}){
 const rows=new Map(),startedAt=now();
 function prune(){const at=now();for(const [key,row]of rows)if(at-row.lastUsedAt>=idleMs)rows.delete(key);while(rows.size>maxEndpoints)rows.delete(rows.keys().next().value);}
 function observe({queue,endpoint,reuseTransport=false,paced=false}){
  if(!queue||!endpoint)return;
  prune();const at=now(),key=queue+'|'+endpoint;let row=rows.get(key);
  if(!row){row={queue,endpoint,firstPermitAt:null,lastPermitAt:null,lastUsedAt:at,permits:0,warmPermits:0,pacingWaits:0,minGapMs:null,buckets:[]};rows.set(key,row);}
  // Refresh insertion order so the size bound evicts the least recently used row.
  rows.delete(key);rows.set(key,row);row.lastUsedAt=at;
  if(paced)row.pacingWaits++;
  else{if(row.lastPermitAt!==null){const gap=Math.max(0,at-row.lastPermitAt);row.minGapMs=row.minGapMs===null?gap:Math.min(row.minGapMs,gap);}row.firstPermitAt??=at;row.lastPermitAt=at;row.permits++;if(reuseTransport)row.warmPermits++;const second=Math.floor(at/1000)*1000;let b=row.buckets.at(-1);if(b?.at!==second){b={at:second,permits:0};row.buckets.push(b);}b.permits++;}
  row.buckets=row.buckets.filter(b=>b.at>at-windowMs-1000);prune();
 }
 return{observe,snapshot(){prune();const at=now();return{startedAt,at,definition:'successful_http_permits_not_wire_requests',windowMs,rows:[...rows.values()].map(row=>({...row,buckets:row.buckets.filter(b=>b.at>at-windowMs-1000).map(b=>({...b}))}))};}};
}
