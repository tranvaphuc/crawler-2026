// Bounded manual QC of unhealthy seed URLs; no queue changes or paid AI.
import fs from 'node:fs';import {DatabaseSync} from 'node:sqlite';import {gzipSync} from 'node:zlib';import {createHash} from 'node:crypto';
const base='/opt/news-flow/current';
const {loadNewsRegistry}=await import('file://'+base+'/src/newsFlow/registry.mjs');
const {registerOriginalSources}=await import('file://'+base+'/src/newsFlow/baomoiOriginalBranch.mjs');
const {NewsHttpDriver,NewsProxyPool}=await import('file://'+base+'/src/newsFlow/transport.mjs');
const {discoverNewsLinks}=await import('file://'+base+'/src/web/configurableNewsParser.mjs');
const {createNewsResearchTransport}=await import('file://'+base+'/src/web/newsResearchTransport.mjs');
const registry=await loadNewsRegistry(),db=new DatabaseSync('/var/lib/news-flow/news-flow-runtime/write.sqlite',{readOnly:true});
registerOriginalSources(db,registry);
const health=JSON.parse(fs.readFileSync('/var/lib/news-flow/discovery-health/latest.json'));
const previous=process.argv.includes('--verified-only')?JSON.parse(fs.readFileSync('/var/lib/news-flow/qc-20261121/seed-probe.json')).rows.filter(r=>r.verified):null;
const sites=previous?[...new Set(previous.map(r=>r.site))].map(site=>({site})):health.sites.filter(s=>s.alerts.some(a=>['all_seeds_blocked','successful_http_zero_article_links'].includes(a)));
fs.mkdirSync('/var/lib/news-flow/qc-20261121/evidence',{recursive:true});
const state={cacheResponses:false,failedUrl:()=>false,request:()=>null,reserve:()=>true,cache:()=>null,completeHttpResponse:()=>{}};
const pool=await NewsProxyPool.load('/etc/news-flow/proxies.json',{rotation:'request'});
const driver=new NewsHttpDriver({state,pool,allowedDomains:registry.allowedDomains,profiles:JSON.parse(fs.readFileSync(base+'/config/web-sources/news-http-profiles.json')),siteCooldown:false,maxWireRequests:120});
const rows=[];let cursor=0;
async function lane(){while(cursor<sites.length){const incident=sites[cursor++],source=registry.sources.get(incident.site);if(!source)continue;
 const failed=db.prepare("SELECT url,status,reason,last_at FROM seed_sources WHERE site=? AND status='fail' ORDER BY last_at DESC LIMIT 2").all(source.domain);
 const targets=previous?previous.filter(r=>r.site===source.domain):[...new Map([...failed,...(failed.length?[]:[{url:source.seeds[0]}])].map(r=>[r.url,r])).values()];
 for(const target of targets){let page;try{const t=createNewsResearchTransport({...source.config,taskRole:'seed',persistEvidence:false,baseTransport:driver.forCycle('qc-20261121-'+Date.now(),source.config,{reviewFailed:true,taskRole:'seed'})});page=await t.get(target.url,null,'qc');}catch(e){page={error:e.code||'QC_REQUEST_FAILED'};}
 let found=[];if(!page.error&&page.html&&registry.byUrl(page.finalUrl||target.url)?.domain===source.domain){found=discoverNewsLinks(page.html,page.finalUrl||target.url,{domain:source.domain,allowedHosts:source.config.allowedHosts,knownArticleUrls:source.config.validation?.sampleUrls,knownCategoryUrls:source.seeds,legacy:{legacyArticlePattern:source.config.discovery?.legacyArticlePattern}}).articles;if(source.config.discovery?.requiredArticlePattern)found=found.filter(a=>new RegExp(source.config.discovery.requiredArticlePattern,'i').test(a.url));}
 const row={site:source.domain,...target,statusCode:page.statusCode,error:page.error||null,finalUrl:page.finalUrl,articleLinks:found.length,checkedAt:Date.now(),verified:!page.error&&found.length>0};
 if(row.verified){row.htmlSha256=createHash('sha256').update(page.html).digest('hex');row.evidenceFile='/var/lib/news-flow/qc-20261121/evidence/'+row.htmlSha256+'.html.gz';fs.writeFileSync(row.evidenceFile,gzipSync(page.html));row.sampleLinks=found.slice(0,3).map(a=>a.url);}
 rows.push(row);console.log(JSON.stringify(row));
 if(page.statusCode===403||page.statusCode===429)break;
 if(targets.length>1)await new Promise(r=>setTimeout(r,3000));
 }
}}
try{await Promise.all(Array.from({length:4},lane));const result={at:new Date().toISOString(),sites:sites.length,wireRequests:driver.wireRequests,verified:rows.filter(r=>r.verified).length,rows};fs.writeFileSync('/var/lib/news-flow/qc-20261121/seed-probe.json',JSON.stringify(result,null,2));console.log(JSON.stringify({summary:{sites:result.sites,wireRequests:result.wireRequests,verified:result.verified}}));}finally{db.close();}
