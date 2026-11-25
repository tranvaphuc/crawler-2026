// Read-only route diagnosis: compare direct and configured proxies; no deployment.
import fs from 'node:fs';import {DatabaseSync} from 'node:sqlite';import {createHash} from 'node:crypto';import {gzipSync} from 'node:zlib';
const base='/opt/news-flow/current',root='/var/lib/news-flow/qc-remaining36-20261122';
const {loadNewsRegistry}=await import('file://'+base+'/src/newsFlow/registry.mjs');
const {createResearchTransport}=await import('file://'+base+'/src/web/researchTransport.mjs');
const {NewsProxyPool,NewsHttpDriver}=await import('file://'+base+'/src/newsFlow/transport.mjs');
const {NewsNetworkPool}=await import('file://'+base+'/src/newsFlow/networkPool.mjs');
const {discoverNewsLinks}=await import('file://'+base+'/src/web/configurableNewsParser.mjs');
const {parsePublicPublicationFeed}=await import('file://'+base+'/src/web/newsDateContext.mjs');
fs.mkdirSync(root+'/evidence',{recursive:true});const registry=await loadNewsRegistry(),cohort=JSON.parse(fs.readFileSync(root+'/cohort.json')),db=new DatabaseSync('/var/lib/news-flow/news-flow-runtime/write.sqlite',{readOnly:true});
const prior=JSON.parse(fs.readFileSync('/var/lib/news-flow/qc-20261122/news-audit.json')),pool=await NewsProxyPool.load('/etc/news-flow/proxies.json',{rotation:'request'}),network=new NewsNetworkPool({workers:2,maxPerWorker:8});
const driver=new NewsHttpDriver({state:{cacheResponses:false,failedUrl:()=>false,request:()=>null,reserve:()=>true,cache:()=>null,completeHttpResponse:()=>{}},pool,network,allowedDomains:registry.allowedDomains,profiles:JSON.parse(fs.readFileSync(base+'/config/web-sources/news-http-profiles.json')),siteCooldown:false,maxWireRequests:120});
const direct=createResearchTransport({timeoutMs:5000,requestDeadlineMs:5000,maxSockets:3,maxTotalSockets:6,persistEvidence:false});
const report={at:new Date().toISOString(),aiUsage:db.prepare('SELECT * FROM ai_usage ORDER BY day').all(),sites:[]};let cursor=0;
const save=()=>fs.writeFileSync(root+'/route-diagnosis.json',JSON.stringify(report,null,2));
function proof(p,url,source){const out={url,finalUrl:p.finalUrl,statusCode:p.statusCode,error:p.error||null,elapsedMs:p.elapsedMs,networkElapsedMs:p.networkElapsedMs};if(p.html){const sha=createHash('sha256').update(p.html).digest('hex');out.file=root+'/evidence/'+sha+'.gz';fs.writeFileSync(out.file,gzipSync(p.html));if(!p.error){out.links=discoverNewsLinks(p.html,p.finalUrl||url,{domain:source.domain,allowedHosts:source.config.allowedHosts,knownCategoryUrls:source.seeds,legacy:{}}).articles.length;const feed=parsePublicPublicationFeed(p.html,p.finalUrl||url);if(feed.items?.length)out.feed={url:feed.feedUrl,items:feed.items.slice(0,5),count:feed.items.length};}}return out;}
const official={
 'coindesk.com':['https://www.coindesk.com/arc/outboundfeeds/rss/'],
 'edition.cnn.com':['https://rss.cnn.com/rss/edition.rss'],
 'hanoitimes.vn':['https://hanoitimes.vn/rss.html'],
};
async function lane(){while(cursor<cohort.length){const domain=cohort[cursor++],source=registry.sources.get(domain);if(!source)continue;
 const entry={site:domain,config:source.config,seeds:source.seeds,probes:[]};
 if(source.config.publisherCrawlPolicy?.crawlDelaySeconds){entry.deferred='crawl_delay_independent_window';report.sites.push(entry);save();continue;}
 const targets=[source.seeds[0],...(official[domain]||[])];
 for(const url of targets){
  let page;try{page=await direct.get(url,null,'direct');}catch(e){page={error:e.code||'DIRECT_FAILED'};}entry.probes.push({route:'direct_diagnostic',...proof(page,url,source)});
  // One configured-proxy control per explicit official feed. Homepage evidence
  // from the earlier audit remains the proxy baseline, avoiding repeat load.
  if(url!==source.seeds[0]){try{const domains=[...registry.allowedDomains,new URL(url).hostname.replace(/^www\./,'')];driver.allowed=new Set(domains);page=await driver.get('official-feed-'+domain,url,source.config,[],{reviewFailed:true,taskRole:'review'});}catch(e){page={error:e.code||'PROXY_FAILED'};}entry.probes.push({route:'configured_proxy',...proof(page,url,source)});}
  if([403,429].includes(page.statusCode)&&targets.length===1)break;
  if(targets.length>1)await new Promise(r=>setTimeout(r,3000));
 }
 const old=prior.sites.find(s=>s.site===domain);entry.priorProxy=old?.seeds.map(s=>({url:s.url,error:s.error,statusCode:s.statusCode}));
 report.sites.push(entry);save();console.log(JSON.stringify({checked:report.sites.length,total:cohort.length,site:domain,probes:entry.probes.map(p=>({route:p.route,error:p.error,links:p.links,feed:p.feed?.count}))}));
}}
try{await Promise.all(Array.from({length:3},lane));report.finishedAt=new Date().toISOString();save();}finally{db.close();await direct.close();await network.close();}
