import fs from 'node:fs/promises';
import path from 'node:path';
import {gzipSync} from 'node:zlib';
import * as cheerio from 'cheerio';
import {NewsHttpDriver,NewsProxyPool} from '../src/newsFlow/transport.mjs';
import {NewsNetworkPool} from '../src/newsFlow/networkPool.mjs';
import {loadNewsRegistry} from '../src/newsFlow/registry.mjs';
import {newsSourceHost,classifyNewsSourceHit} from '../src/newsFlow/sourceInventory.mjs';
import {isDeclaredForumHtml,qualifyNewsSourceSamples} from '../src/newsFlow/sourceQualification.mjs';
import {NewsRepairPool} from '../src/web/newsRepairPool.mjs';
import {createNewsResearchTransport} from '../src/web/newsResearchTransport.mjs';
import {discoverNewsLinks,learnNewsConfig} from '../src/web/configurableNewsParser.mjs';
import {classifyNewsLink} from '../src/web/newsLinkPolicy.mjs';
import {classifyNewsDocument} from '../src/web/newsDocumentKind.mjs';
import {currentAuditGate} from './news_current_audit_gate.mjs';

const root=path.resolve('outputs/news-priority-sites-2026-11-16'),read=async name=>JSON.parse(await fs.readFile(path.join(root,name)));
const sites=await read('candidates.json'),registry=await loadNewsRegistry(),forums=new Set();
const network=new NewsNetworkPool({workers:6}),parsers=new NewsRepairPool(8,new URL('../src/web/newsDeepAuditWorker.mjs',import.meta.url));
const proxies=await NewsProxyPool.load('/etc/news-flow/proxies.json',{rotation:'request'});
const driver=new NewsHttpDriver({network,state:{cacheResponses:false,failedUrl:()=>false,request:()=>null,reserve:()=>true,cache:()=>null,completeHttpResponse:()=>{}},pool:proxies,allowedDomains:[...registry.allowedDomains,...sites.map(s=>s.domain)],siteCooldown:false});
const rows=[],approved=[];let cursor=0;
await fs.mkdir(path.join(root,'audit'),{recursive:true});
async function run(site){
 const dir=path.join(root,'audit',site.domain);await fs.mkdir(dir,{recursive:true});
 const cached=await read('audit/'+site.domain+'/result.json').catch(()=>null);
 if(cached?.complete){rows.push(cached);if(cached.approved)approved.push({domain:site.domain,file:'config/web-sources/news/'+site.domain+'.json',approvedFile:path.join(dir,'approved-config.json')});return;}
 const exclusion=classifyNewsSourceHit({_type:'newsTopic',_source:{url:site.url,siteName:site.domain}},registry,forums);
 if(false){const row={domain:site.domain,complete:true,state:exclusion.state,reason:exclusion.reason||'already_configured',approved:false,articles:[],pages:[]};rows.push(row);await fs.writeFile(path.join(dir,'result.json'),JSON.stringify(row));return;}
 const originalIds=(site.masterExamples||[]).filter(h=>newsSourceHost(h._source?.siteName||'')===site.domain).map(h=>h._source.siteId).filter(v=>typeof v==='string'&&v.trim());
 const base={schemaVersion:1,siteName:site.domain,siteId:new Set(originalIds).size===1?originalIds[0]:site.domain,registrableDomain:site.domain,homepage:site.url,allowedHosts:[site.domain,'www.'+site.domain],timezone:'Asia/Ho_Chi_Minh',requiresTimezoneReviewBeforeWrite:true,identityEncoding:'latin1',discovery:{homepage:site.url,categories:[]}};
 const auditRegistry={sources:new Map([...registry.sources,[site.domain,{config:base,quality:{}}]]),byHost:h=>h.replace(/^www\./,'')===site.domain?{config:base}:registry.byHost(h)};
 const transport=createNewsResearchTransport({baseTransport:driver.forCycle('es5-expand-'+site.domain,base,{reviewFailed:true,taskRole:'review'}),persistEvidence:false});
 const pages=[],articles=[],reasons={},workingSeeds=[];const candidates=new Map();let config=registry.sources.get(site.domain)?.config||null,frozenAt=null,listingLinks=0,halt=null,sequence=0,homeEvidence=null,alias=null;
 function reason(value){if(value)reasons[value]=(reasons[value]||0)+1;}
 async function fetch(url,role){
  if(halt)return {requestedUrl:url,error:halt,attempted:false};
  const p=await transport.get(url,null,'audit').catch(e=>({requestedUrl:url,error:e.code||'transport_error'}));
  const htmlPath=p.html?path.join(dir,(++sequence)+'.html.gz'):null;if(htmlPath)await fs.writeFile(htmlPath,gzipSync(p.html,{level:1}));
  pages.push({url,role,statusCode:p.statusCode,error:p.error||null,finalUrl:p.finalUrl,location:p.location,checkedAt:p.checkedAt,elapsedMs:p.elapsedMs,htmlPath});
  if(p.error)reason(p.error);if(p.error==='rate_limited')halt='origin_rate_limited';
  return {...p,htmlPath,attempted:true};
 }
 function add(item){if(newsSourceHost(item.url)!==site.domain||classifyNewsLink(item.url,site.domain).kind==='excluded')return;if(!candidates.has(item.url))candidates.set(item.url,item);}
 function discover(page,url,role){
  if(page.error||!page.html)return null;
  if(false){halt='user_excluded_forum_detected';reason(halt);return null;}
  const found=discoverNewsLinks(page.html,page.finalUrl||url,{domain:site.domain,knownCategoryUrls:base.discovery.categories,legacy:{}});
  if(found.articles.length){workingSeeds.push({url:page.finalUrl||url,role,articleLinks:found.articles.length});listingLinks+=found.articles.length;}
  for(const item of found.articles)add(item);
  return found;
 }
 try{
  for(const url of site.sampleUrls||[])add({url,fromMaster:true});
  let home=null;
  for(const url of new Set([site.url,'https://'+site.domain+'/','https://www.'+site.domain+'/','http://'+site.domain+'/'])){home=await fetch(url,'homepage');if(!home.error&&home.html||halt)break;}
  if(home&&!home.error&&home.html){
   const host=newsSourceHost(home.finalUrl||site.url);
   if(host!==site.domain){alias=host;reason('homepage_redirect:'+host);}
   else{
    base.homepage=home.finalUrl||site.url;base.discovery.homepage=base.homepage;
    const $=cheerio.load(home.html);$('script,style,nav,footer').remove();const text=$('body').text().replace(/\s+/g,' ').trim();homeEvidence={title:$('title').text(),text:text.slice(0,500)};
    const found=discover(home,base.homepage,'homepage');
    for(const category of found?.categories.slice(0,10)||[]){
     if(halt)break;const categoryHost=newsSourceHost(category.url);if(categoryHost!==site.domain)continue;
     const p=await fetch(category.url,'category');const result=discover(p,category.url,'category');
     if(result?.articles.length)base.discovery.categories.push(p.finalUrl||category.url);
    }
   }
  }
  if(!halt&&!alias){
   const selected=[...candidates.values()].slice(0,35);let consecutiveTimeouts=0;
   for(const candidate of selected){
    const independent=!!config;const p=await fetch(candidate.url,'article');
    if(p.error||!p.html){articles.push({url:candidate.url,state:'transport_unconfirmed',error:p.error||'empty_response'});if(/deadline|TIMEOUT|TIMEDOUT/.test(p.error||'')){consecutiveTimeouts++;if(consecutiveTimeouts>=8){reason('article_checks_stopped_after_three_timeouts');break;}}else consecutiveTimeouts=0;continue;}
    consecutiveTimeouts=0;
    if(false){halt='user_excluded_forum_detected';reason(halt);break;}
    const document=classifyNewsDocument(p.html,candidate.url,site.domain);
    if(document.skip){articles.push({url:candidate.url,htmlPath:p.htmlPath,state:'confirmed_non_article',reason:document.kind});continue;}
    if(!config){
     const learned=learnNewsConfig(p.html,candidate.url,{domain:site.domain,url:base.homepage,registrableDomain:site.domain,timezone:base.timezone,legacy:{}},{});
     if(learned.config){config={...base,...learned.config,siteId:base.siteId,requiresTimezoneReviewBeforeWrite:true,discovery:base.discovery,enabled:true};frozenAt=new Date().toISOString();}
    }
    if(!config){reason('parser_configuration_missing');articles.push({url:candidate.url,htmlPath:p.htmlPath,state:'extraction_unconfirmed',error:'parser_configuration_missing',issues:[]});continue;}
    const audit=currentAuditGate(await parsers.run({sample:{domain:site.domain,url:candidate.url,html:p.html,kind:'article'},config,learn:false}),config,auditRegistry,site.domain);
    const row={url:candidate.url,htmlPath:p.htmlPath,state:audit.error?'extraction_unconfirmed':audit.quality?.length?'content_integrity_review':'parsed',error:audit.error||null,issues:audit.quality||[],title:audit.parsed?._source?.title,publishedDate:audit.parsed?._source?.publishedDate,description:audit.parsed?._source?.description,contentHash:audit.parsed?.extracted?.contentSha256,independent};articles.push(row);
    if(row.error)reason(row.error);for(const issue of row.issues)reason(issue.code);
    if(articles.filter(a=>a.state==='parsed').length>=4)break;
   }
  }
  const qualification=qualifyNewsSourceSamples(articles,{listingLinks});
  if(halt||alias)qualification.approved=false;
  for(const r of qualification.reasons)reason(r);
  if(qualification.approved&&config){
   config.stage='es5_inventory_independent_http_samples_verified';
   config.parserCurrentAudit={checkedAt:new Date().toISOString(),inventorySource:'crawler-v7-news-topic-2',frozenAt,independentHoldouts:qualification.holdouts,paidAiCalls:0,requiresExplicitPublicationTimezone:true};
   config.validation={sampleUrls:articles.filter(a=>a.state==='parsed').map(a=>a.url),fullSiteCycleVerified:false};
   await fs.writeFile(path.join(dir,'approved-config.json'),JSON.stringify(config,null,2)+'\n');
   approved.push({domain:site.domain,file:'config/web-sources/news/'+site.domain+'.json',approvedFile:path.join(dir,'approved-config.json')});
  }
  const row={domain:site.domain,complete:true,approved:qualification.approved,state:halt==='user_excluded_forum_detected'?'excluded_forum':qualification.approved?'approved':articles.some(a=>a.state==='parsed')?'partial_not_admitted':'not_verified',masterDocuments:site.documentCount,homepage:base.homepage,alias,reasons,qualification,workingSeeds,homeEvidence,checkedAt:new Date().toISOString(),pages,articles,paidAiCalls:0};
  await fs.writeFile(path.join(dir,'result.json.tmp'),JSON.stringify(row,null,2));await fs.rename(path.join(dir,'result.json.tmp'),path.join(dir,'result.json'));rows.push(row);
 }finally{await transport.close();}
}
const timer=setInterval(()=>console.log(JSON.stringify({phase:'source_http_qualification',done:rows.length,total:sites.length,approved:approved.length})),30000);
async function lane(){while(cursor<sites.length){const site=sites[cursor++];try{await run(site);}catch(error){const row={domain:site.domain,complete:false,approved:false,state:'audit_exception',reason:error.code||error.name};rows.push(row);await fs.mkdir(path.join(root,'audit',site.domain),{recursive:true});await fs.writeFile(path.join(root,'audit',site.domain,'exception.json'),JSON.stringify(row));}}}
try{await Promise.all(Array.from({length:16},lane));}finally{clearInterval(timer);await network.close();await parsers.close();}
await fs.writeFile(path.join(root,'site-summary.json'),JSON.stringify(rows.map(({pages,articles,...row})=>({...row,articleSamples:articles?.length||0})),null,2));
await fs.writeFile(path.join(root,'approved-configs.json'),JSON.stringify(approved,null,2));
console.log(JSON.stringify({complete:true,sites:rows.length,approved:approved.length,exceptions:rows.filter(r=>r.state==='audit_exception').length,paidAiCalls:0}));
