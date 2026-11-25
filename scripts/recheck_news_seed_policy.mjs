import fs from 'node:fs/promises';import path from 'node:path';import {gzipSync} from 'node:zlib';
import {createNewsResearchTransport} from '../src/web/newsResearchTransport.mjs';
import {primaryNewsListingLinks} from '../src/web/newsListingEvidence.mjs';
const root=path.resolve('outputs/news-flow-preparation-2026-11-12/deep-verification');
const inv=JSON.parse(await fs.readFile(path.join(root,'../inventory.json'),'utf8'));
let next=0;const rows=[];
async function run(site){
 const dir=path.join(root,site.domain),r=JSON.parse(await fs.readFile(path.join(dir,'result.json'),'utf8'));
 const targets=r.categories.filter(c=>c.state==='policy_review');if(!targets.length)return;
 const file=path.join(dir,'seed-policy-recheck.json');try{const old=JSON.parse(await fs.readFile(file,'utf8'));if(old.complete)return old;}catch{}
 const config=JSON.parse(await fs.readFile(site.configFile,'utf8')),checks=[];let last=0,halt=false;
 const t=createNewsResearchTransport({...config.http,timeoutMs:12000,requestDeadlineMs:15000,maxSockets:1,persistEvidence:false});
 try{for(const item of targets){
  const url=item.url;
  if(/\/page\/\d+|[?&](?:page|paged|offset|updated-max)=/i.test(url)){checks.push({url,classification:'pagination_excluded_by_user_scope',attempted:false});continue;}
  if(halt||config.publisherCrawlPolicy?.crawlDelaySeconds){checks.push({url,classification:'deferred_access_or_crawl_delay',attempted:false});continue;}
  const delay=3000-(Date.now()-last);if(delay>0)await new Promise(resolve=>setTimeout(resolve,delay));last=Date.now();
  const p=await t.get(url,dir,'policy'),check={url,...p,html:undefined,classification:p.error?'transport_unconfirmed':'no_primary_news_links'};
  if(p.html){check.htmlPath=path.join(dir,'policy-'+checks.length+'.html.gz');await fs.writeFile(check.htmlPath,gzipSync(p.html));}
  if(!p.error&&p.html){const found=primaryNewsListingLinks(p.html,p.finalUrl||url,{domain:site.domain,url:site.homepage,knownCategoryUrls:site.categoryCandidates});check.primaryCandidates=found.articles.map(a=>a.url);check.classification=found.articles.length?'listing_with_primary_article_links':'no_primary_news_links';}
  checks.push(check);if(p.statusCode===403||p.statusCode===429)halt=true;
 }}finally{await t.close();}
 const result={domain:site.domain,complete:true,checks};await fs.writeFile(file,JSON.stringify(result,null,2));return result;
}
async function lane(){while(next<inv.sites.length){const site=inv.sites[next++];const r=await run(site);if(r)rows.push(r);}}
await Promise.all(Array.from({length:16},lane));
await fs.writeFile(path.join(root,'seed-policy-recheck-summary.json'),JSON.stringify({sites:rows.length,seeds:rows.reduce((n,r)=>n+r.checks.length,0),rows},null,2));console.log(JSON.stringify({sites:rows.length,seeds:rows.reduce((n,r)=>n+r.checks.length,0)}));
