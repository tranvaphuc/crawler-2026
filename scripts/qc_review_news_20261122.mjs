// Bounded evidence audit. This script never changes queues or calls paid AI.
import fs from 'node:fs';import {createRequire} from 'node:module';import {createHash} from 'node:crypto';import {gzipSync} from 'node:zlib';import {DatabaseSync} from 'node:sqlite';
const base='/opt/news-flow/current',root='/var/lib/news-flow/qc-20261122',require=createRequire(base+'/package.json'),$load=require('cheerio').load;
const {loadNewsRegistry}=await import('file://'+base+'/src/newsFlow/registry.mjs');
const {registerOriginalSources}=await import('file://'+base+'/src/newsFlow/baomoiOriginalBranch.mjs');
const {NewsHttpDriver,NewsProxyPool}=await import('file://'+base+'/src/newsFlow/transport.mjs');
const {NewsRepairPool}=await import('file://'+base+'/src/web/newsRepairPool.mjs');
const {createNewsResearchTransport}=await import('file://'+base+'/src/web/newsResearchTransport.mjs');
const {discoverNewsLinks,learnNewsConfig}=await import('file://'+base+'/src/web/configurableNewsParser.mjs');
const {toEs5News,requestKey}=await import('file://'+base+'/src/newsFlow/identity.mjs');
const {newsArticleRejection}=await import('file://'+base+'/src/web/newsArticleAdmission.mjs');
const registry=await loadNewsRegistry(),db=new DatabaseSync('/var/lib/news-flow/news-flow-runtime/write.sqlite',{readOnly:true});registerOriginalSources(db,registry);
const baseline=JSON.parse(fs.readFileSync(root+'/baseline.json')),cohort=JSON.parse(fs.readFileSync(root+'/cohort.json'));
const domains=[...new Set([...cohort,...baseline.health.sites.map(r=>r.site),...baseline.seedFollowup.filter(r=>r.status==='fail').map(r=>r.site)])];
fs.mkdirSync(root+'/evidence',{recursive:true});
const httpRecords=[];
const state={cacheResponses:false,failedUrl:()=>false,request:()=>null,reserve:()=>true,cache:()=>null,completeHttpResponse:(cycle,url,page)=>httpRecords.push({cycle,url,error:page.error||null,statusCode:page.statusCode,finalUrl:page.finalUrl,role:page.role,at:Date.now()})};
const pool=await NewsProxyPool.load('/etc/news-flow/proxies.json',{rotation:'request'}),driver=new NewsHttpDriver({state,pool,allowedDomains:registry.allowedDomains,profiles:JSON.parse(fs.readFileSync(base+'/config/web-sources/news-http-profiles.json')),siteCooldown:false,maxWireRequests:280});
const parsers=new NewsRepairPool(2,new URL('file://'+base+'/src/web/newsDeepAuditWorker.mjs'));
const result={at:new Date().toISOString(),news:[],sites:[],httpRecords};const save=()=>fs.writeFileSync(root+'/news-audit.json',JSON.stringify(result,null,2));
function evidence(page,label){if(!page.html)return null;const sha=createHash('sha256').update(page.html).digest('hex'),file=root+'/evidence/'+sha+'.html.gz';fs.writeFileSync(file,gzipSync(page.html));return {file,sha,label};}
async function get(source,url,role,cycle){const t=createNewsResearchTransport({...source.config,taskRole:role,persistEvidence:false,baseTransport:driver.forCycle(cycle,source.config,{reviewFailed:true,taskRole:role})});try{return await t.get(url,null,'qc');}catch(e){return {error:e.code||'QC_REQUEST_FAILED'};}}
async function audit(source,url,page,config=source.config){
 if(page.error||!page.html)return {url,httpError:page.error||'EMPTY_PAGE',statusCode:page.statusCode};
 const a=await parsers.run({sample:{domain:source.domain,url:page.finalUrl||url,html:page.html,kind:'article'},config,context:{},learn:false});
 const issues=[...a.quality||[],...a.fields?.issues||[]];let writeError=null,doc=null;try{if(a.error||!a.parsed)throw Error(a.error||'QC_NO_PARSED_ARTICLE');if(a.policyConflict||issues.length)throw Error('QC_FIELD_OR_CONTENT_ISSUES');doc=toEs5News(a.parsed,config);}catch(e){writeError=e.code||e.message;}
 const $=$load(page.html),schemas=[];
 for(const s of $('script[type="application/ld+json"]').toArray()){try{const visit=v=>{if(!v||typeof v!=='object')return;if(v.datePublished)schemas.push({type:v['@type'],url:v.url||v.mainEntityOfPage,published:v.datePublished,modified:v.dateModified});if(Array.isArray(v))v.forEach(visit);else if(v['@graph'])visit(v['@graph']);};visit(JSON.parse($(s).text()));}catch{}}
 return {url,finalUrl:page.finalUrl,statusCode:page.statusCode,evidence:evidence(page,'article'),error:a.error,writeError,issues,kind:a.kind,parsed:a.parsed?{source:a.parsed._source,extracted:a.parsed.extracted}:null,doc,schemas,visibleClocks:$('time,.date,.post-date,.article-date,[itemprop="datePublished"]').toArray().slice(0,12).map(e=>({selector:e.tagName,attrs:{datetime:$(e).attr('datetime'),content:$(e).attr('content')},text:$(e).text().replace(/\s+/g,' ').trim().slice(0,220)})),canonical:$('link[rel=canonical]').attr('href')};
}
try{
 for(const row of baseline.held){const doc=JSON.parse(row.doc),source=registry.byUrl(doc._source.url);if(!source)continue;const page=await get(source,doc._source.url,'article','qc-import-'+row.id);result.news.push({rowId:row.id,oldDoc:doc,oldConfig:JSON.parse(row.config),...await audit(source,doc._source.url,page)});save();console.log(JSON.stringify({importChecked:result.news.length,url:doc._source.url,error:result.news.at(-1).writeError,clock:result.news.at(-1).doc?._source.publishedDate}));await new Promise(r=>setTimeout(r,3000));}
 let next=0;
 async function lane(){while(next<domains.length){const domain=domains[next++],source=registry.sources.get(domain);if(!source)continue;
  const entry={site:domain,originalCohort:cohort.includes(domain),config:source.config,seeds:[],articles:[]};
  try{
   if(source.config.publisherCrawlPolicy?.crawlDelaySeconds){entry.deferred='publisher_crawl_delay_requires_separate_window';result.sites.push(entry);save();continue;}
   const failed=db.prepare("SELECT * FROM seed_sources WHERE site=? AND status='fail' ORDER BY last_at DESC LIMIT 2").all(domain),homepage=source.seeds[0];
   const targets=[...new Map([{url:homepage},...failed].filter(r=>r.url).map(r=>[r.url,r])).values()].slice(0,2);const candidates=new Set();
   for(const target of targets){const cycle='qc-seed-'+domain+'-'+entry.seeds.length,page=await get(source,target.url,'seed',cycle);let found=[];
    if(!page.error&&page.html&&registry.byUrl(page.finalUrl||target.url)?.domain===domain){found=discoverNewsLinks(page.html,page.finalUrl||target.url,{domain,allowedHosts:source.config.allowedHosts,knownCategoryUrls:source.seeds,knownArticleUrls:source.config.validation?.sampleUrls,legacy:{legacyArticlePattern:source.config.discovery?.legacyArticlePattern}}).articles;if(source.config.discovery?.requiredArticlePattern)found=found.filter(a=>new RegExp(source.config.discovery.requiredArticlePattern,'i').test(a.url));}
    found.filter(a=>!newsArticleRejection(a.url,source)).slice(0,5).forEach(a=>candidates.add(a.url));
    entry.seeds.push({url:target.url,prior:db.prepare('SELECT * FROM seed_sources WHERE url_key=?').get(requestKey(target.url)),cycle,statusCode:page.statusCode,error:page.error||null,finalUrl:page.finalUrl,links:found.length,sampleLinks:found.slice(0,4).map(a=>a.url),evidence:evidence(page,'seed'),checkedAt:Date.now()});
    if([403,429].includes(page.statusCode))break;await new Promise(r=>setTimeout(r,3000));
   }
   const historical=db.prepare("SELECT url,error FROM article_links WHERE site=? AND parse_status='fail' ORDER BY first_at DESC LIMIT 3").all(domain);historical.filter(r=>!newsArticleRejection(r.url,source)).forEach(r=>candidates.add(r.url));
   if(!entry.seeds.some(s=>[403,429].includes(s.statusCode))){for(const url of [...candidates].slice(0,2)){const page=await get(source,url,'article','qc-article-'+domain+'-'+entry.articles.length),a=await audit(source,url,page);if(!a.doc&&page.html&&!page.error){const learned=learnNewsConfig(page.html,page.finalUrl||url,{domain,url:source.config.homepage,registrableDomain:source.config.registrableDomain,timezone:source.config.timezone,legacy:{}},{});if(learned.config){a.learnedConfig={...source.config,...learned.config};a.learnedAudit=await audit(source,url,page,a.learnedConfig);}}entry.articles.push(a);if([403,429].includes(page.statusCode))break;await new Promise(r=>setTimeout(r,3000));}}
  }catch(e){entry.error=e.code||'QC_SITE_AUDIT_FAILED';}
  result.sites.push(entry);save();console.log(JSON.stringify({sitesChecked:result.sites.length,total:domains.length,site:domain,seeds:entry.seeds.map(s=>({error:s.error,links:s.links})),articles:entry.articles.map(a=>a.writeError||a.httpError||'ok')}));
 }}
 await Promise.all(Array.from({length:4},lane));result.finishedAt=new Date().toISOString();result.wireRequests=driver.wireRequests;save();
}finally{await parsers.close();db.close();}
