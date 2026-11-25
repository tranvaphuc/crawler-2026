import fs from 'node:fs/promises';
import * as cheerio from 'cheerio';
import {loadNewsRegistry} from '../src/newsFlow/registry.mjs';
import {NewsHttpDriver,NewsProxyPool} from '../src/newsFlow/transport.mjs';
import {NewsNetworkPool} from '../src/newsFlow/networkPool.mjs';
import {parsePublicPublicationFeed} from '../src/web/newsDateContext.mjs';
import {newsArticleRejection} from '../src/web/newsArticleAdmission.mjs';
import {articleKey,requestUrl} from '../src/newsFlow/identity.mjs';
import {isExcludedSource} from '../src/web/sourceExclusions.mjs';

const root=process.argv[2];
const resumeFrom=process.argv.find(arg=>arg.startsWith('--resume-from='))?.slice(14);
const exhaustSitemaps=process.argv.includes('--exhaust-sitemaps');
const retryTransient=process.argv.includes('--retry-transient');
const transientErrors=new Set(['request_deadline_exceeded','ECONNRESET','http_500','http_502','http_503','http_504','ERR_BAD_RESPONSE']);
const concurrency=Number(process.argv.find(arg=>arg.startsWith('--concurrency='))?.slice(14)||16);
if(!root) throw Error('Output directory required');
if(!Number.isInteger(concurrency)||concurrency<1||concurrency>40)throw Error('Invalid endpoint audit concurrency');
await fs.mkdir(root,{recursive:true});
const registry=await loadNewsRegistry();
const profiles=JSON.parse(await fs.readFile('config/web-sources/news-http-profiles.json','utf8'));
const network=new NewsNetworkPool({workers:3});
const pool=await NewsProxyPool.load('/etc/news-flow/proxies.json',{rotation:'request'});
const state={cacheResponses:false,failedUrl:()=>false,request:()=>null,reserve:()=>true,cache:()=>null,completeHttpResponse:()=>{}};
const driver=new NewsHttpDriver({state,network,pool,profiles,allowedDomains:registry.allowedDomains,siteCooldown:false,timeoutMs:retryTransient?12000:5000,maxBytes:12000000});
const sites=[...registry.sources.values()];
const cutoff=Date.now()-7*86400000;
const sitemapPath=dateUrl=>new URL(dateUrl).pathname;
const isNewsSitemap=url=>/(?:^|[\/_-])news(?:[\/_\-.]|$)/i.test(sitemapPath(url));
function sitemapDay(url){
 const day=sitemapPath(url).match(/(?:^|[^\d])(20\d\d)[-/](\d{2})[-/](\d{2})(?=[^\d]|$)/);
 if(!day)return NaN;
 return Date.parse(day.slice(1).join('-')+'T00:00:00+07:00');
}
let cursor=0, done=0;

async function scan(source){
 const checkpoint=root+'/'+source.domain+'.partial';
 const saved=await fs.readFile(checkpoint,'utf8').then(JSON.parse,error=>error.code==='ENOENT'?null:Promise.reject(error));
 const previous=saved||(resumeFrom?JSON.parse(await fs.readFile(resumeFrom+'/'+source.domain+'.json','utf8')):null);
 const formats=['rss','feed','rdf:rdf','urlset','sitemapindex'];
 const rssIndex=row=>row.kind==='rss'&&row.status===200&&row.format==='html';
 const latest=new Map((previous?.attempts||[]).map(attempt=>[attempt.url,attempt]));
 const retry=retryTransient?[...latest.values()].filter(a=>a.kind==='sitemap'&&transientErrors.has(a.error)):[];
 if(retryTransient&&!retry.length&&!saved)return previous;
 if(!retryTransient&&previous&&!previous.unfetched&&previous.attempts.some(a=>formats.includes(a.format))&&!previous.attempts.some(rssIndex))return previous;
 const homepage=source.seeds[0], attempts=[...(previous?.attempts||[])], queue=[];
 const visited=new Set(attempts.filter(a=>saved||a.format!=='sitemapindex'&&!rssIndex(a)&&!a.error).map(a=>a.url)), queued=new Set();
 const candidates=new Map((previous?.candidates||[]).map(row=>[articleKey(row.url),row]));
 const owns=url=>!isExcludedSource(url)&&registry.byUrl(url)?.domain===source.domain;
 const resolve=(url,base=homepage)=>{if(!url)return null;try{const normalized=requestUrl(new URL(url,base).href);return owns(normalized)?normalized:null;}catch{return null;}};
 const add=(url,base,kind)=>{const target=resolve(url,base);if(target&&!visited.has(target)&&!queued.has(target)){queued.add(target);queue.push({url:target,kind});}};
 const report=()=>({site:source.domain,homepage,attempts,unfetched:queue.length,remainingEndpoints:queue,candidates:[...candidates.values()]});
 const transport=driver.forCycle('coverage-'+source.domain,source.config,{reviewFailed:true,taskRole:'review'});
 const get=async(url,kind)=>{
  try{
   const page=await transport.get(url,null,kind);
   const success=!page.error||page.error==='empty_page'&&page.statusCode===200;
   const owned=owns(page.finalUrl||url);
   const report={url,kind,status:page.statusCode??null,error:owned?(success?null:page.error||'missing_html'):'publisher_mismatch'};
   attempts.push(report);
   return success&&owned&&page.html?{html:page.html,url:page.finalUrl||url,report}:null;
  }catch(e){attempts.push({url,kind,error:e.code||e.name});return null;}
 };
 const accept=(raw,base,kind,signal)=>{const url=resolve(raw,base);if(!url||newsArticleRejection(url,source))return;const key=articleKey(url),prior=candidates.get(key);if(!prior||prior.kind==='sitemap_lastmod'&&kind!=='sitemap_lastmod')candidates.set(key,{url,kind,signal});};
 try{
  if(!owns(homepage))return {site:source.domain,homepage,aliasOf:registry.byUrl(homepage)?.domain,error:'canonical_homepage_owned_by_other_source',attempts,candidates:[]};
  if(retryTransient){
   for(const entry of saved?.remainingEndpoints||retry){visited.delete(entry.url);add(entry.url,homepage,entry.kind);}
  }else{
  const robots=await get(new URL('/robots.txt',homepage).href,'robots');
  if(robots) for(const match of robots.html.matchAll(/^\s*Sitemap:\s*(\S+)/gmi))add(match[1],robots.url,'sitemap');
  const front=await get(homepage,'homepage');
  if(front){
   const $=cheerio.load(front.html);
   $('link[rel~="alternate"][type*="rss"],link[rel~="alternate"][type*="atom"]').each((_,e)=>add($(e).attr('href'),front.url,'rss'));
   $('a[href]').each((_,e)=>{const href=$(e).attr('href');if((/\/(?:rss(?:\.xml|\.html?)?|feed|atom\.xml)(?:[/?#]|$)/i.test(href||'')||/^rss$/i.test($(e).text().trim()))&&!/comments|support/i.test(href))add(href,front.url,'rss');});
  }
  for(const url of source.seeds)if(/(?:rss|sitemap|\/feed(?:\/|$)|atom\.xml)/i.test(new URL(url).pathname))add(url,homepage,/sitemap/i.test(url)?'sitemap':'rss');
  const publisherFeed=source.config.publishedDate?.feedUrl;
  if(publisherFeed)add(publisherFeed,homepage,'rss');
  add('/sitemap.xml',homepage,'sitemap');add('/feed/',homepage,'rss');add('/rss',homepage,'rss');
  if(previous){
   add('/rss.xml',homepage,'rss');add('/rss.htm',homepage,'rss');add('/sitemap_index.xml',homepage,'sitemap');
   for(const entry of previous.remainingEndpoints||[])add(entry.url,homepage,entry.kind);
   for(const entry of previous.attempts.filter(a=>a.format==='sitemapindex'))add(entry.url,homepage,'sitemap');
   for(const entry of previous.attempts.filter(rssIndex))add(entry.url,homepage,'rss');
  }
  }
  for(let count=0;queue.length&&(exhaustSitemaps||count<(previous?64:14));count++){
   if(exhaustSitemaps&&count%50===0){
    await fs.writeFile(checkpoint+'.tmp',JSON.stringify(report()),{mode:0o600});
    await fs.rename(checkpoint+'.tmp',checkpoint);
   }
   const job=queue.shift();visited.add(job.url);
   const page=await get(job.url,job.kind);
   if(!page)continue;
   const $=cheerio.load(page.html,{xmlMode:true});
   const tag=$.root().children().first().prop('tagName')?.toLowerCase();
   page.report.format=tag||null;
   if(!formats.includes(tag)){
    if(job.kind==='rss'&&tag==='html'){
     const links=cheerio.load(page.html);
     links('a[href],link[href]').each((_,e)=>{
      const href=links(e).attr('href');
      if(!href||/\/comments?(?:\/|$)/i.test(href))return;
      if(/\.rss(?:[?#]|$)|\/rss\/[^/?#]+\.xml(?:[?#]|$)/i.test(href))add(href,page.url,'rss');
     });
    }
    continue;
   }
   const dated=parsePublicPublicationFeed(page.html,page.url).items;
   for(const item of dated)if(Date.parse(item.iso)>=cutoff)accept(item.url,page.url,job.kind,item.iso);
   if(['rss','feed','rdf:rdf'].includes(tag)){
    $('item,entry').each((_,e)=>{
     const row=$(e), link=row.children('link').filter((_,l)=>!$(l).attr('rel')||$(l).attr('rel')==='alternate').first();
     const time=Date.parse(row.children('pubDate,published,updated,dc\\:date').first().text());
     if(!Number.isFinite(time)||time>=cutoff)accept(link.attr('href')||link.text().trim(),page.url,job.kind,Number.isFinite(time)?new Date(time).toISOString():null);
    });
   }
   if(tag==='urlset')$('url').each((_,e)=>{
    const row=$(e), time=Date.parse(row.children('lastmod').first().text());
    if(Number.isFinite(time)&&time>=cutoff)accept(row.children('loc').first().text().trim(),page.url,'sitemap_lastmod',new Date(time).toISOString());
   });
   if(tag==='sitemapindex'){
    const nested=$('sitemap').toArray().map(e=>{
     const url=resolve($(e).children('loc').text().trim(),page.url);
     if(!url)return null;
     const time=Date.parse($(e).children('lastmod').text());
     return {url,time:Number.isFinite(time)?time:sitemapDay(url),news:isNewsSitemap(url)};
    }).filter(Boolean);
    nested.sort((a,b)=>Number(b.news)-Number(a.news)||(b.time||0)-(a.time||0));
    for(const row of nested)if(exhaustSitemaps||!Number.isFinite(row.time)||row.time>=cutoff-86400000||row.news)add(row.url,page.url,'sitemap');
   }
  }
  return report();
 }finally{await transport.close();}
}

try{
 await Promise.all(Array.from({length:concurrency},async()=>{
  while(cursor<sites.length){
   const site=sites[cursor++];
   const file=root+'/'+site.domain+'.json';
   try{await fs.access(file);done++;continue;}catch(e){if(e.code!=='ENOENT')throw e;}
   const report=await scan(site);
   await fs.writeFile(file+'.tmp',JSON.stringify(report),{mode:0o600});
   await fs.rename(file+'.tmp',file);
   await fs.unlink(root+'/'+site.domain+'.partial').catch(error=>{if(error.code!=='ENOENT')throw error;});
   if(++done%25===0)console.log(JSON.stringify({done,total:sites.length}));
  }
 }));
 console.log(JSON.stringify({done,total:sites.length,paidAiCalls:0}));
}finally{await network.close();}
