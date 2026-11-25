import fs from 'node:fs/promises';import {gzipSync} from 'node:zlib';
import {ThreeFlowState} from '../src/newsFlow/threeFlowState.mjs';
import {loadNewsRegistry} from '../src/newsFlow/registry.mjs';
import {NewsNetworkPool} from '../src/newsFlow/networkPool.mjs';
import {NewsHttpDriver,NewsProxyPool} from '../src/newsFlow/transport.mjs';
import {NewsRepairPool} from '../src/web/newsRepairPool.mjs';
import {createNewsResearchTransport} from '../src/web/newsResearchTransport.mjs';
import {qualifyOriginalSource} from '../src/newsFlow/originalSourceQualification.mjs';
import {originalHost} from '../src/newsFlow/baomoiOriginalBranch.mjs';
const root='/var/lib/news-flow/baomoi-original-branch-20261120';await fs.mkdir(root,{recursive:true});
const input=JSON.parse(await fs.readFile('/var/lib/news-flow/baomoi-original-links-20261119/report.json'));
const registry=await loadNewsRegistry(),state=await ThreeFlowState.open(':memory:'),network=new NewsNetworkPool({workers:3}),parsers=new NewsRepairPool(2,new URL('../src/web/newsDeepAuditWorker.mjs',import.meta.url));
const pool=await NewsProxyPool.load('/etc/news-flow/proxies.json',{rotation:'request'}),driver=new NewsHttpDriver({state,network,pool,allowedDomains:registry.allowedDomains,siteCooldown:false});
const sites=new Map();for(const r of input.rows)if(r.ok&&!registry.byUrl(r.originalUrl)){const host=originalHost(r.originalUrl);if(host){if(!sites.has(host))sites.set(host,[]);sites.get(host).push(r.originalUrl);}}
const results=[];
try{await Promise.all([...sites].map(async([host,urls])=>{driver.allowed.add(host);let i=0;const dir=root+'/'+host;await fs.mkdir(dir,{recursive:true});const cycle='original-preflight-'+host+'-'+Date.now();state.cycle(cycle);const transport=createNewsResearchTransport({baseTransport:driver.forCycle(cycle,{siteName:host,registrableDomain:host,allowedHosts:[host,'www.'+host]},{reviewFailed:true,taskRole:'review'}),persistEvidence:false});try{const result=await qualifyOriginalSource({host,urls,registry,parsers,get:async url=>{const p=await transport.get(url,null,'original-qualification');if(p.html)await fs.writeFile(dir+'/'+(++i)+'.html.gz',gzipSync(p.html));return p;}});await fs.writeFile(dir+'/result.json',JSON.stringify(result,null,2));results.push({host,...result});console.log(JSON.stringify({host,approved:result.approved,reason:result.reason,qualification:result.report?.qualification}));}finally{await transport.close();}}));}finally{await network.close();await parsers.close();state.close();}
await fs.writeFile(root+'/preflight.json',JSON.stringify({checkedAt:new Date().toISOString(),paidAiCalls:0,esWrites:0,results},null,2));
