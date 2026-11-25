import fs from 'node:fs/promises';
import path from 'node:path';
import {gzipSync} from 'node:zlib';
import {NewsProxyPool,NewsHttpDriver} from '../src/newsFlow/transport.mjs';
import {NewsNetworkPool} from '../src/newsFlow/networkPool.mjs';
import {NewsRepairPool} from '../src/web/newsRepairPool.mjs';
import {loadNewsRegistry} from '../src/newsFlow/registry.mjs';
import {discoverNewsLinks,learnNewsConfig} from '../src/web/configurableNewsParser.mjs';
import {classifyNewsLink} from '../src/web/newsLinkPolicy.mjs';
import {createNewsResearchTransport} from '../src/web/newsResearchTransport.mjs';
import {currentAuditGate} from './news_current_audit_gate.mjs';
const root=path.resolve('outputs/news-all-sites-2026-11-15'),sites=JSON.parse(await fs.readFile(path.join(root,'extra-sites.json'))),registry=await loadNewsRegistry();
const network=new NewsNetworkPool({workers:2}),pool=new NewsRepairPool(4,new URL('../src/web/newsDeepAuditWorker.mjs',import.meta.url));
const proxies=await NewsProxyPool.load('/etc/news-flow/proxies.json',{rotation:'request'});
const driver=new NewsHttpDriver({network,state:{cacheResponses:false,failedUrl:()=>false,request:()=>null,reserve:()=>true,cache:()=>null,completeHttpResponse:()=>{}},pool:proxies,allowedDomains:[...registry.allowedDomains,...sites.map(s=>s.domain)],siteCooldown:false});
const rows=[],newConfigs=[];let cursor=0;
async function run(site){
 const dir=path.join(root,'previously-excluded',site.domain);await fs.mkdir(dir,{recursive:true});
 const base={schemaVersion:1,siteName:site.domain,siteId:site.domain,registrableDomain:site.domain,homepage:site.url,allowedHosts:[site.domain,'www.'+site.domain],timezone:'Asia/Ho_Chi_Minh',identityEncoding:'latin1',discovery:{homepage:site.url,categories:[]}};
 const auditRegistry={sources:new Map([...registry.sources,[site.domain,{domain:site.domain,config:base,quality:{}}]]),byHost:h=>h.replace(/^www\./,'')===site.domain?{config:base}:registry.byHost(h)};
 const transport=createNewsResearchTransport({baseTransport:driver.forCycle('excluded-'+site.domain,base,{taskRole:'review',reviewFailed:true}),persistEvidence:false});
 const reasons={},pages=[],articles=[];let config=null,home=null,alias=null,proposedAt=null;
 const fetch=async url=>{const p=await transport.get(url,null,'audit').catch(e=>({requestedUrl:url,error:e.code||'transport_error'}));pages.push({url,error:p.error,statusCode:p.statusCode,finalUrl:p.finalUrl});if(p.error)reasons[p.error]=(reasons[p.error]||0)+1;return p;};
 try{
  const homeUrls=[site.url,'https://'+site.domain+'/','https://www.'+site.domain+'/','http://'+site.domain+'/'];
  for(const url of new Set(homeUrls)){home=await fetch(url);if(!home.error&&home.html)break;}
  if(home&&!home.error&&home.html){
   const final=new URL(home.finalUrl||site.url),owner=registry.byHost(final.hostname);
   if(final.hostname.replace(/^www\./,'')!==site.domain&&owner){alias=owner.domain;reasons['redirect_to_existing_source:'+owner.domain]=1;}
   else if(final.hostname.replace(/^www\./,'')===site.domain){
    const found=discoverNewsLinks(home.html,final.href,{domain:site.domain,knownCategoryUrls:[],legacy:{}});
    base.discovery.homepage=final.href;
    const candidates=new Map(found.articles.map(a=>[a.url,a]));
    for(const category of found.categories.slice(0,4)){
      base.discovery.categories.push(category.url);const p=await fetch(category.url);if(p.error||!p.html)continue;
      for(const a of discoverNewsLinks(p.html,p.finalUrl||category.url,{domain:site.domain,knownCategoryUrls:base.discovery.categories,legacy:{}}).articles)candidates.set(a.url,a);
    }
    for(const a of [...candidates.values()].slice(0,12)){
     if(classifyNewsLink(a.url,site.domain).kind==='excluded')continue;
     const frozenBeforeRequest=!!config;const p=await fetch(a.url);if(p.error||!p.html){articles.push({url:a.url,state:'transport_unconfirmed',error:p.error});continue;}
     const htmlPath=path.join(dir,articles.length+'.html.gz');await fs.writeFile(htmlPath,gzipSync(p.html));
     if(!config){const learned=learnNewsConfig(p.html,a.url,{domain:site.domain,url:final.href,registrableDomain:site.domain,timezone:'Asia/Ho_Chi_Minh',legacy:{}},{});if(learned.config){config={...base,...learned.config,discovery:base.discovery,enabled:false};proposedAt=new Date().toISOString();}}
     if(!config){articles.push({url:a.url,htmlPath,state:'extraction_unconfirmed',error:'parser_configuration_missing'});continue;}
     const audit=currentAuditGate(await pool.run({sample:{domain:site.domain,url:a.url,html:p.html,kind:'article'},config,learn:false}),config,auditRegistry,site.domain);
     articles.push({url:a.url,htmlPath,state:audit.error?'extraction_unconfirmed':audit.quality?.length?'content_integrity_review':'parsed',error:audit.error,issues:audit.quality||[],title:audit.parsed?._source?.title,publishedDate:audit.parsed?._source?.publishedDate,description:audit.parsed?._source?.description,contentHash:audit.parsed?.extracted?.contentSha256,independent:frozenBeforeRequest});
     if(articles.filter(a=>a.state==='parsed').length>=4)break;
    }
   }
  }
  const passed=articles.filter(a=>a.state==='parsed'),failed=articles.filter(a=>['extraction_unconfirmed','content_integrity_review'].includes(a.state));
  const independent=passed.filter(a=>a.independent),distinct=new Set(passed.map(a=>a.contentHash));
  const repeatedDescriptions=new Set(passed.map(a=>a.description)).size<Math.min(3,passed.length);
  if(passed.length&&repeatedDescriptions){reasons.generic_description_across_distinct_articles=1;for(const a of passed){a.state='content_integrity_review';a.issues.push({code:'generic_description_across_distinct_articles'});}failed.push(...passed);passed.splice(0);}
  let admitted=false;
  if(config&&passed.length>=3&&independent.length>=2&&distinct.size>=3&&!failed.length&&!repeatedDescriptions){
   config.parserCurrentAudit={checkedAt:new Date().toISOString(),previousStatus:site.latestBrowserStatus,frozenAt:proposedAt,independentHoldouts:independent.map(a=>a.url),paidAiCalls:0};
   config.validation={sampleUrls:passed.map(a=>a.url),fullSiteCycleVerified:false};
   const file='config/web-sources/news/'+site.domain+'.json';await fs.writeFile(path.join(dir,'approved-config.json'),JSON.stringify(config,null,2)+'\n');newConfigs.push({domain:site.domain,file,approvedFile:path.join(dir,'approved-config.json')});admitted=true;
  }
  for(const a of failed)for(const e of [a.error,...a.issues.map(i=>i.code)].filter(Boolean))reasons[e]=(reasons[e]||0)+1;
  if(!passed.length&&!Object.keys(reasons).length)reasons.no_article_links_or_news_content=1;
  const row={domain:site.domain,previousStatus:site.latestBrowserStatus,state:passed.length?'partial':'not_verified',passed:passed.length,failed:failed.length,transportUnconfirmed:pages.filter(p=>p.error).length,samples:articles.length,distinctPassedUrls:new Set(passed.map(a=>a.url)).size,categories:base.discovery.categories.length,categoriesAttempted:base.discovery.categories.length,categoriesWithoutPassedSample:0,reasons,fixApplied:admitted,fixDescription:admitted?'Created parser validated on independent HTTP samples':alias?'Alias chuyển tới nguồn đang có: '+alias:'Chưa đủ bằng chứng để đưa vào crawler',regressions:[],homepage:site.url,samplePass:passed.slice(0,3),sampleFail:failed.slice(0,5),checkedAt:new Date().toISOString(),fullSiteVerified:false,previousReason:site.latestBrowserReason,alias};
  rows.push(row);await fs.writeFile(path.join(dir,'result.json'),JSON.stringify({...row,pages,articles},null,2));console.log(JSON.stringify({site:site.domain,passed:passed.length,admitted,alias}));
 }finally{await transport.close();}
}
async function lane(){while(cursor<sites.length)await run(sites[cursor++]);}
try{await Promise.all(Array.from({length:5},lane));}finally{await network.close();await pool.close();}
if(rows.length!==15)throw Error('EXCLUDED_SITE_COVERAGE_INCOMPLETE');
await fs.writeFile(path.join(root,'extra-site-summary.json'),JSON.stringify(rows,null,2));
await fs.writeFile(path.join(root,'new-configs.json'),JSON.stringify(newConfigs,null,2));
console.log(JSON.stringify({complete:true,sites:rows.length,approved:newConfigs.length,paidAiCalls:0}));
