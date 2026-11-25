import fs from 'node:fs/promises';
import path from 'node:path';
import {gzipSync} from 'node:zlib';
import {createNewsResearchTransport} from '../src/web/newsResearchTransport.mjs';
import {discoverNewsLinks,parseConfiguredArticle} from '../src/web/configurableNewsParser.mjs';
import {parsePublicPublicationFeed} from '../src/web/newsDateContext.mjs';
import {isNewsCategoryUrl} from '../src/web/newsCategoryPolicy.mjs';
import {parseSkydoorWithPublisher} from '../src/web/newsPublisherDispatch.mjs';
const root=path.resolve('outputs/news-flow-preparation-2026-11-12');
const inv=JSON.parse(await fs.readFile(path.join(root,'inventory.json'),'utf8'));
const out=path.join(root,'complete-live');await fs.mkdir(out,{recursive:true});
let next=0,done=0,requests=0;const rows=[];
const progress=()=>({at:new Date().toISOString(),done,total:544,wireRequests:requests});
const timer=setInterval(()=>{console.log(JSON.stringify(progress()));fs.writeFile(path.join(out,'progress.json'),JSON.stringify(progress())).catch(()=>{});},30000);
async function run(site){
 const dir=path.join(out,site.domain);await fs.mkdir(dir,{recursive:true});
 const target=path.join(dir,'result.json');
 try{const prior=JSON.parse(await fs.readFile(target,'utf8'));if(prior.complete)return prior;}catch{}
 const config=JSON.parse(await fs.readFile(site.configFile,'utf8'));
 const result={domain:site.domain,startedAt:new Date().toISOString(),home:null,categories:[],articles:[],context:null,network:[],complete:false};
 const raw=createNewsResearchTransport({...config.http,timeoutMs:10000,requestDeadlineMs:12000,maxSockets:1,maxTotalSockets:2,persistEvidence:false,
  onNetworkRequest:e=>{requests++;result.network.push({...e,at:new Date().toISOString()});}});
 let last=0,seq=0,halt=null;const memo=new Map();
 async function get(url,directory=dir,label='request'){
  if(memo.has(url))return memo.get(url);
  const task=(async()=>{
   if(halt)return {requestedUrl:url,error:halt,attempted:false};
   const delay=Math.max(3000,(config.publisherCrawlPolicy?.crawlDelaySeconds||0)*1000)-(Date.now()-last);
   if(delay>30000){halt='publisher_crawl_delay';return {requestedUrl:url,error:halt,attempted:false,nextEligibleAt:new Date(last+config.publisherCrawlPolicy.crawlDelaySeconds*1000).toISOString()};}
   if(delay>0)await new Promise(r=>setTimeout(r,delay));last=Date.now();
   const page=await raw.get(url,directory,label);
   if(page.html){const htmlPath=path.join(dir,`${++seq}.html.gz`);await fs.writeFile(htmlPath,gzipSync(page.html));page.htmlPath=htmlPath;}
   if(page.statusCode===429||page.statusCode===403||page.error==='access_blocked')halt='publisher_blocked_or_rate_limited';
   return page;
  })();memo.set(url,task);return task;
 }
 const compact=p=>({...p,html:undefined});
 let context={};const candidates=new Map(),linkSite={domain:site.domain,url:site.homepage,knownCategoryUrls:site.categoryCandidates,legacy:{legacyArticlePattern:config.discovery?.legacyArticlePattern}};
 const discover=(page,url)=>{if(page.error||!page.html)return [];try{const found=discoverNewsLinks(page.html,page.finalUrl||url,linkSite,{maxCategories:100});for(const a of found.articles)if(!candidates.has(a.url))candidates.set(a.url,a);return found.articles;}catch{return [];}};
 try{
  const home=await get(site.homepage);result.home={...compact(home),articleLinks:discover(home,site.homepage).length};
  const categories=site.categoryCandidates.filter(url=>isNewsCategoryUrl(url,{domain:site.domain}));
  // Two category controls per site. Full configured-category coverage is reported separately, never inferred.
  for(const url of categories.slice(0,2)){const page=await get(url);result.categories.push({url,...compact(page),articleLinks:discover(page,url).length});if(halt)break;}
  const feed=[config.publishedDate,...(config.variants||[]).map(v=>v.publishedDate)].find(d=>d?.strategy==='public_feed')?.feedUrl;
  if(feed&&!halt){const p=await get(feed);if(!p.error&&p.html)context=parsePublicPublicationFeed(p.html,p.finalUrl||feed);result.context={...compact(p),items:context.items?.length||0};}
  if(!candidates.size)for(const url of site.sampleUrls.slice(0,3))candidates.set(url,{url,from:'historical_control'});
  for(const item of [...candidates.values()].slice(0,3)){
   const p=await get(item.url);let parsed;
   if(p.error||!p.html)parsed={error:p.error||'missing_html'};
   else if(config.parserType==='publisher_dispatch'){const dispatched=await parseSkydoorWithPublisher({page:p,url:item.url,transport:{get},directory:dir,label:'publisher'});parsed=dispatched.parsed||{error:dispatched.error};}
   else parsed=parseConfiguredArticle(p.html,item.url,config,context);
   const article={url:item.url,...compact(p),error:parsed.error||p.error||null,from:item.from||'current_listing',
    parsed:parsed.error?null:parsed,additionalArticleLinks:discover(p,item.url).length};
   if(article.parsed){const d=article.parsed._source;article.fourFieldsPresent=!!(d.title&&d.content&&d.description&&d.publishedDate&&d.content!=='Images/Video'&&!article.parsed.extracted.publisherRestricted);}
   result.articles.push(article);if(halt)break;
  }
 }catch(e){result.exception=e.message;}finally{await raw.close();}
 const good=result.articles.filter(a=>a.fourFieldsPresent),hashes=new Set(good.map(a=>a.parsed.extracted.contentSha256));
 result.status=halt?'access_unconfirmed':result.exception?'verification_exception':!result.articles.length?'discovery_unconfirmed':
  hashes.size>=3&&result.home?.articleLinks>0&&result.categories.some(c=>c.articleLinks>0)&&result.articles.every(a=>!a.error)?'live_samples_passed':good.length?'live_partial':'live_parser_unconfirmed';
 result.haltReason=halt;result.discoveredUrls=candidates.size;result.configuredCategoryCount=site.categoryCandidates.length;
 result.categoryControlsChecked=result.categories.filter(c=>c.attempted!==false).length;
 result.allConfiguredCategoriesVerified=false;result.complete=true;result.finishedAt=new Date().toISOString();
 result.scope='All 544 sources: homepage, up to two configured category controls, up to three article samples; no pagination, browser, production queue, DB/ES writes. Sample verification is not full-category or all-layout certification.';
 await fs.writeFile(target,JSON.stringify(result,null,2));return result;
}
async function lane(){while(next<inv.sites.length){const s=inv.sites[next++];try{const r=await run(s);rows.push({domain:s.domain,status:r.status,samples:r.articles.length,good:r.articles.filter(a=>a.fourFieldsPresent).length,exception:r.exception});}catch(e){rows.push({domain:s.domain,status:'verification_exception',exception:e.message});}done++;}}
try{await Promise.all(Array.from({length:18},lane));}finally{clearInterval(timer);}
await fs.writeFile(path.join(out,'summary.json'),JSON.stringify({...progress(),rows,statuses:rows.reduce((o,r)=>(o[r.status]=(o[r.status]||0)+1,o),{})},null,2));
console.log(JSON.stringify({...progress(),statuses:rows.reduce((o,r)=>(o[r.status]=(o[r.status]||0)+1,o),{})}));
