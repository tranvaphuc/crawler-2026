import fs from 'node:fs/promises';import path from 'node:path';
import {NewsState} from '../src/newsFlow/state.mjs';import {NewsProxyPool,NewsHttpDriver} from '../src/newsFlow/transport.mjs';
const file=process.env.NEWS_PROXY_FILE||'outputs/news-flow-runtime/proxies.credentials.json';
const all=await NewsProxyPool.load(file),out=path.resolve('outputs/news-flow-build-2026-11-12');await fs.mkdir(out,{recursive:true});
const state=await NewsState.open(path.join(out,'proxy-probe.sqlite'));let cursor=0;const rows=[];
async function lane(){while(cursor<all.proxies.length){const proxy=all.proxies[cursor++],pool=new NewsProxyPool([proxy]),driver=new NewsHttpDriver({state,pool,allowedDomains:['api.ipify.org','httpbin.org'],spacingMs:1000,timeoutMs:12000});
 const cycle='probe-'+Date.now()+'-'+proxy.id;state.cycle(cycle);
 const https=await driver.get(cycle,'https://api.ipify.org?format=json',{siteName:'api.ipify.org',registrableDomain:'api.ipify.org'}).catch(e=>({error:e.code||'PROBE_ERROR'}));
 const http=await driver.get(cycle,'http://httpbin.org/ip',{siteName:'httpbin.org',registrableDomain:'httpbin.org'}).catch(e=>({error:e.code||'PROBE_ERROR'}));
 let exitIp=null;try{exitIp=JSON.parse(https.html).ip;}catch{}
 rows.push({id:proxy.id,httpsStatus:https.statusCode||null,httpsError:https.error||null,httpStatus:http.statusCode||null,httpError:http.error||null,exitIp,healthy:!!exitIp&&https.statusCode===200&&!https.error});
 console.log(JSON.stringify({id:proxy.id,healthy:!!exitIp,httpsStatus:https.statusCode||null,httpStatus:http.statusCode||null}));
}}
try{await Promise.all(Array.from({length:4},lane));}finally{state.close();}
await fs.writeFile(path.join(out,'proxy-health.json'),JSON.stringify({checkedAt:new Date().toISOString(),proxies:rows.length,healthy:rows.filter(r=>r.healthy).length,rows},null,2));
