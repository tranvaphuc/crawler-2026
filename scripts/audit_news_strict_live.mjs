import fs from 'node:fs/promises';import path from 'node:path';import {gzipSync} from 'node:zlib';
import {DatabaseSync} from 'node:sqlite';
import {loadNewsRegistry} from '../src/newsFlow/registry.mjs';
import {NewsHttpDriver,NewsProxyPool} from '../src/newsFlow/transport.mjs';
import {NewsNetworkPool} from '../src/newsFlow/networkPool.mjs';
import {NewsRepairPool} from '../src/web/newsRepairPool.mjs';
import {createNewsResearchTransport} from '../src/web/newsResearchTransport.mjs';
import {parsePublicPublicationFeed} from '../src/web/newsDateContext.mjs';
import {currentAuditGate} from './news_current_audit_gate.mjs';
const out=path.resolve(process.argv[2]||'outputs/news-time-strict-live-20261116');await fs.mkdir(out,{recursive:true});
const registry=await loadNewsRegistry(),db=new DatabaseSync('/var/lib/news-flow/news-flow-runtime/write.sqlite',{readOnly:true});db.exec('PRAGMA busy_timeout=30000');
const samples=db.prepare("SELECT site,url,kind,at FROM review_samples ORDER BY CASE kind WHEN 'good' THEN 0 ELSE 1 END,at DESC").all();db.close();
const network=new NewsNetworkPool({workers:4}),parsers=new NewsRepairPool(4,new URL('../src/web/newsDeepAuditWorker.mjs',import.meta.url)),proxies=await NewsProxyPool.load('/etc/news-flow/proxies.json',{rotation:'request'});
const driver=new NewsHttpDriver({network,state:{cacheResponses:false,failedUrl:()=>false,request:()=>null,reserve:()=>true,cache:()=>null,completeHttpResponse:()=>{}},pool:proxies,allowedDomains:registry.allowedDomains,siteCooldown:false});
const all=[...registry.sources.values()],rows=[];let cursor=0;
async function run(){while(cursor<all.length){const site=all[cursor++],config=site.config,dir=path.join(out,site.domain);await fs.mkdir(dir,{recursive:true});
 const cached=await fs.readFile(path.join(dir,'result.json'),'utf8').then(JSON.parse).catch(()=>null);if(cached?.complete){rows.push(cached);continue;}
 const urls=[...new Set([...samples.filter(s=>s.site===site.domain).map(s=>s.url),...(config.validation?.sampleUrls||[])])].slice(0,2),row={domain:site.domain,checks:[],complete:false};
 const transport=createNewsResearchTransport({baseTransport:driver.forCycle('strict-time-live-'+site.domain,config,{reviewFailed:true,taskRole:'review'}),persistEvidence:false});
 try{let context={};if(config.publishedDate?.strategy==='public_feed'){const f=await transport.get(config.publishedDate.feedUrl,null,'feed');if(!f.error&&f.html)context=parsePublicPublicationFeed(f.html,config.publishedDate.feedUrl);}
  for(const [i,url] of urls.entries()){
   const page=await transport.get(url,null,'strict-time');const check={url,finalUrl:page.finalUrl,status:page.statusCode,transportError:page.error||null,checkedAt:page.checkedAt};
   if(!page.error&&page.html){check.htmlPath=path.join(dir,i+'.html.gz');await fs.writeFile(check.htmlPath,gzipSync(page.html));const audit=await parsers.run({sample:{domain:site.domain,url,html:page.html,kind:'article'},config,context,learn:false});const gate=currentAuditGate(audit,config,registry,site.domain);Object.assign(check,{error:gate.error||null,issues:gate.quality||[],date:gate.parsed?._source.publishedDate,proof:gate.parsed?.extracted.publicationProof,raw:gate.parsed?.extracted.dateEvidence});}
   row.checks.push(check);if(page.error==='rate_limited')break;
  }
 }catch(e){row.error=e.code||'AUDIT_FAILED';}finally{await transport.close();}
 row.complete=true;row.pass=row.checks.some(c=>!c.transportError&&!c.error&&!c.issues?.length&&c.proof?.ok);rows.push(row);await fs.writeFile(path.join(dir,'result.json'),JSON.stringify(row,null,2));
 if(rows.length%25===0){await fs.writeFile(path.join(out,'progress.json'),JSON.stringify({done:rows.length,total:all.length}));console.log(JSON.stringify({done:rows.length,total:all.length}));}
}}
try{await Promise.all(Array.from({length:8},run));}finally{await parsers.close();await network.close();}
const summary={sites:all.length,checked:rows.length,sitesWithPassingSamples:rows.filter(r=>r.pass).length,sitesWithoutPassingSamples:rows.filter(r=>!r.pass).length,samples:rows.reduce((n,r)=>n+r.checks.length,0),paidAiCalls:0,readOnlyDatabase:true,scope:'Fresh HTTP through production proxy transport; at most two sample URLs/site; strict per-article gate remains mandatory for every future article'};
await fs.writeFile(path.join(out,'sites.json'),JSON.stringify(rows,null,2));await fs.writeFile(path.join(out,'summary.json'),JSON.stringify(summary,null,2));console.log(JSON.stringify(summary));
