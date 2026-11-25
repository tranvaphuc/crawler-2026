import fs from 'node:fs/promises';
import path from 'node:path';
import {gzipSync,gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {createNewsResearchTransport} from '../src/web/newsResearchTransport.mjs';
import {primaryNewsListingLinks} from '../src/web/newsListingEvidence.mjs';
import {discoverNewsLinks,parseConfiguredArticle} from '../src/web/configurableNewsParser.mjs';
import {parsePublicPublicationFeed} from '../src/web/newsDateContext.mjs';
import {parseSkydoorWithPublisher} from '../src/web/newsPublisherDispatch.mjs';
import {NewsRepairPool} from '../src/web/newsRepairPool.mjs';
import {isNewsCategoryUrl} from '../src/web/newsCategoryPolicy.mjs';

const base=path.resolve('outputs/news-flow-preparation-2026-11-12');
const out=path.join(base,'deep-verification');await fs.mkdir(out,{recursive:true});
const inv=JSON.parse(await fs.readFile(path.join(base,'inventory.json'),'utf8'));
const sites=inv.sites.sort((a,b)=>Number(b.domain==='kenh14.vn')-Number(a.domain==='kenh14.vn')||b.categoryCandidates.length-a.categoryCandidates.length);
const pool=new NewsRepairPool(6,new URL('../src/web/newsDeepAuditWorker.mjs',import.meta.url));
let cursor=0,done=0,loads=0,categories=0,articles=0;const rows=[];
const progress=()=>({at:new Date().toISOString(),sites:done,total:544,logicalLoads:loads,categories,articles});
const timer=setInterval(()=>{const p=progress();console.log(JSON.stringify(p));fs.writeFile(path.join(out,'progress.json'),JSON.stringify(p)).catch(()=>{});},30000);
const read=async p=>JSON.parse(await fs.readFile(p,'utf8'));
const family=url=>/video|\/tv\/|\/shorts\/|dt360/i.test(url)?'video':/photo|gallery|album|tin-anh/i.test(url)?'photo':/longform|emagazine|megastory|interactive/i.test(url)?'longform':/podcast|audio/i.test(url)?'audio':'ordinary';
async function run(site){
 const dir=path.join(out,site.domain);await fs.mkdir(dir,{recursive:true});
 const target=path.join(dir,'result.json');
 const prior=await read(target).catch(()=>null);if(prior?.complete)return prior;
 const config=await read(site.configFile),previous=await read(path.join(base,'complete-live',site.domain,'result.json'));
 const r={domain:site.domain,startedAt:new Date().toISOString(),categories:[],articles:[],network:[],complete:false};
 const queue=[],seen=new Set(),cache=new Map(),layoutFamilies=new Set();let last=0,halt=null,connectionErrors=0;
 for(const p of [previous.home,...previous.categories||[],previous.context,...previous.articles||[]]){
  if(p?.requestedUrl&&p.htmlPath&&!p.error)cache.set(p.requestedUrl,p);
 }
 const raw=createNewsResearchTransport({...config.http,timeoutMs:12000,requestDeadlineMs:15000,maxSockets:1,maxTotalSockets:2,persistEvidence:false,
  onNetworkRequest:e=>r.network.push({...e,at:new Date().toISOString()})});
 const safe=p=>({...p,html:undefined,parsed:undefined});
 async function get(url,directory=dir,label='request'){
  if(cache.has(url)){
   const p=cache.get(url);if(p.html!==undefined)return p;
   try{return {...p,html:gunzipSync(await fs.readFile(p.htmlPath)).toString(),reusedEvidence:true};}catch{}
  }
  if(halt)return {requestedUrl:url,error:halt,attempted:false};
  const delay=Math.max(3000,(config.publisherCrawlPolicy?.crawlDelaySeconds||0)*1000)-(Date.now()-last);
  if(delay>30000){halt='publisher_crawl_delay';return {requestedUrl:url,error:halt,attempted:false};}
  if(delay>0)await new Promise(resolve=>setTimeout(resolve,delay));last=Date.now();loads++;
  const p=await raw.get(url,directory,label);
  if(p.html){p.htmlPath=path.join(dir,createHash('sha256').update(url).digest('hex').slice(0,24)+'.html.gz');await fs.writeFile(p.htmlPath,gzipSync(p.html,{level:1}));}
  if(p.statusCode===403||p.statusCode===429||p.error==='access_blocked')halt='access_blocked_or_rate_limited';
  if(/ECONN|ENOTFOUND|ETIMEDOUT|deadline/.test(p.error||'')){if(++connectionErrors>=2)halt='origin_connection_unstable';}else connectionErrors=0;
  cache.set(url,safe(p));return p;
 }
 const linkSite={domain:site.domain,url:site.homepage,knownCategoryUrls:site.categoryCandidates,legacy:{legacyArticlePattern:config.discovery?.legacyArticlePattern}};
 function add(url,foundOn,reason){if(!url)return;const key=url.split('#')[0];if(seen.has(key))return;seen.add(key);queue.push({url:key,foundOn,reason});}
 let context={};
 try{
  for(const url of site.seedCandidates){
   const eligible=url===site.homepage||isNewsCategoryUrl(url,{domain:site.domain});
   const row={url,policyEligible:eligible};
   if(!eligible){row.state='policy_review';r.categories.push(row);continue;}
   const p=await get(url);Object.assign(row,safe(p));
   if(!p.error&&p.html){
    const main=primaryNewsListingLinks(p.html,p.finalUrl||url,linkSite);
    row.primaryScope=main.scope;row.primaryCandidates=main.articles.map(a=>a.url);row.state=main.articles.length?'primary_links_found':'no_primary_links';
    // One primary article per configured seed; repeated article URLs are fetched once.
    if(main.articles.length)add(main.articles[0].url,url,'primary_category_control');
    const all=discoverNewsLinks(p.html,p.finalUrl||url,linkSite,{maxCategories:0});
    for(const a of all.articles){const f=family(a.url);if(f!=='ordinary'&&!layoutFamilies.has(f)){layoutFamilies.add(f);add(a.url,url,'layout_control:'+f);}}
   }else row.state=p.attempted===false?'not_attempted':'transport_unconfirmed';
   r.categories.push(row);categories++;
  }
  const feed=[config.publishedDate,...(config.variants||[]).map(v=>v.publishedDate)].find(d=>d?.strategy==='public_feed')?.feedUrl;
  if(feed){const p=await get(feed);if(!p.error&&p.html)context=parsePublicPublicationFeed(p.html,p.finalUrl||feed);r.context={...safe(p),items:context.items?.length||0};}
  // Retry every URL that failed in the most recent live audit, including transient HTTP errors.
  for(const a of previous.articles||[])add(a.url,null,a.error?'recheck_exact_live_failure':'positive_live_regression');
  for(let i=0;i<queue.length;i++){
   const item=queue[i],p=await get(item.url);const a={...item,...safe(p),transportError:p.error||null,parseError:null,quality:[]};
   if(!p.error&&p.html){
    let parsed;
    if(config.parserType==='publisher_dispatch'){const dispatched=await parseSkydoorWithPublisher({page:p,url:item.url,transport:{get},directory:dir,label:'publisher'});parsed=dispatched.parsed||{error:dispatched.error};a.originalUrl=dispatched.originalUrl;}
    else parsed=parseConfiguredArticle(p.html,item.url,config,context);
    a.parseError=parsed.error||null;
    if(!parsed.error){
     const inspection=await pool.run({sample:{domain:site.domain,url:item.url,htmlPath:p.htmlPath,kind:'article'},config,context,learn:false});
     a.quality=[...(inspection.quality||[])];
     const s=parsed._source,e=parsed.extracted;
     if(!s.description?.trim())a.quality.push({code:'missing_description'});
     if(e.publisherRestricted)a.quality.push({code:'publisher_restricted'});
     if(s.content==='Images/Video'||e.mediaOnly)a.quality.push({code:'media_only_requires_separate_scope'});
     a.fields={title:s.title,description:s.description,content:s.content,publishedDate:s.publishedDate};
     a.extracted=e;a.fieldEvidence=inspection.evidence;
     a.state=a.quality.length?'quality_review':'sample_verified';
     // Verify article-to-article discovery, one independent linked article per primary category sample.
     const links=discoverNewsLinks(p.html,p.finalUrl||item.url,linkSite,{maxCategories:0});a.additionalArticleLinks=links.articles.map(x=>x.url);
     if(item.reason==='primary_category_control'){
      const extra=links.articles.find(x=>!seen.has(x.url));if(extra)add(extra.url,item.url,'article_link_control');
     }
    }else a.state=parsed.error.startsWith('non_news_document:')?'non_article_response':'parser_unconfirmed';
   }else a.state=p.attempted===false?'not_attempted':'transport_unconfirmed';
   r.articles.push(a);articles++;
   if(i%10===0)await fs.writeFile(path.join(dir,'checkpoint.json'),JSON.stringify({...r,remainingArticles:queue.length-i-1},null,2));
  }
 }catch(e){r.exception=e.message;}finally{await raw.close();}
 r.counts=r.articles.reduce((o,a)=>(o[a.state]=(o[a.state]||0)+1,o),{});
 r.parserCapability=r.articles.some(a=>a.state==='sample_verified')?'confirmed_on_samples':r.articles.some(a=>a.fields)?'extracts_fields_needs_quality_review':r.articles.some(a=>a.parseError)?'parser_unconfirmed':'transport_or_discovery_unconfirmed';
 r.haltReason=halt;r.complete=true;r.finishedAt=new Date().toISOString();
 r.scope='Every configured seed tracked; one primary article per reachable seed, native media/layout controls, exact prior live URLs and one article-linked control per primary sample. No pagination/browser/production writes. Historical corpus remains in complete-offline. Unattempted/blocked URLs remain explicit.';
 await fs.writeFile(target,JSON.stringify(r,null,2));return r;
}
async function lane(){while(cursor<sites.length){const site=sites[cursor++];try{const r=await run(site);rows.push({domain:site.domain,parserCapability:r.parserCapability,counts:r.counts,categories:r.categories.length,categoryStates:r.categories.reduce((o,c)=>(o[c.state]=(o[c.state]||0)+1,o),{}),haltReason:r.haltReason,exception:r.exception});}catch(e){rows.push({domain:site.domain,exception:e.message});}done++;}}
try{await Promise.all(Array.from({length:32},lane));}finally{clearInterval(timer);await pool.close();}
await fs.writeFile(path.join(out,'summary.json'),JSON.stringify({...progress(),rows},null,2));console.log(JSON.stringify({...progress(),exceptions:rows.filter(r=>r.exception)}));
await fs.writeFile(path.join(out,'progress.json'),JSON.stringify({...progress(),complete:true,status:'completed'},null,2));
