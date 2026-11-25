import fs from 'node:fs/promises';
import {DatabaseSync} from 'node:sqlite';
import * as cheerio from 'cheerio';
import {loadNewsRegistry} from '../src/newsFlow/registry.mjs';
import {NewsHttpDriver,NewsProxyPool} from '../src/newsFlow/transport.mjs';
import {NewsNetworkPool} from '../src/newsFlow/networkPool.mjs';
import {createNewsResearchTransport} from '../src/web/newsResearchTransport.mjs';
import {discoverNewsLinks} from '../src/web/configurableNewsParser.mjs';
import {articleKey} from '../src/newsFlow/identity.mjs';

const root=process.argv[2];
if(!root)throw Error('Audit workspace required');
const registry=await loadNewsRegistry(),db=new DatabaseSync('/var/lib/news-flow/news-flow-runtime/write.sqlite',{readOnly:true});
const read=db.prepare('select url,status,links_found,last_at from seed_sources where site=? order by links_found desc');
const accepted=new Set(['rss','feed','rdf:rdf','urlset','sitemapindex']);
const jobs=[];
for(const source of registry.sources.values()){
 const previous=JSON.parse(await fs.readFile(root+'/sites-expanded/'+source.domain+'.json','utf8'));
 if(!previous.attempts.some(attempt=>accepted.has(attempt.format)))jobs.push({source,previous,existing:read.all(source.domain)});
}
db.close();
const profiles=JSON.parse(await fs.readFile('config/web-sources/news-http-profiles.json','utf8'));
const network=new NewsNetworkPool({workers:3});
const pool=await NewsProxyPool.load('/etc/news-flow/proxies.json',{rotation:'request'});
const state={cacheResponses:false,failedUrl:()=>false,request:()=>null,reserve:()=>true,cache:()=>null,completeHttpResponse:()=>{}};
const driver=new NewsHttpDriver({state,network,pool,profiles,allowedDomains:registry.allowedDomains,siteCooldown:false});
const output=root+'/no-feed-routes';
await fs.mkdir(output,{recursive:true});
let cursor=0,completed=0;
async function inspect({source,existing,previous}){
 const homepage=source.seeds[0], output={site:source.domain,attempts:[],candidates:[]};
 const owns=url=>registry.byUrl(url)?.domain===source.domain;
 if(!owns(homepage))return {...output,canonicalOwner:registry.byUrl(homepage)?.domain};
 const transport=createNewsResearchTransport({baseTransport:driver.forCycle('no-feed-'+source.domain,source.config,{reviewFailed:true,taskRole:'seed'}),taskRole:'seed',persistEvidence:false});
 const queue=[...new Set([homepage,...existing.filter(r=>r.status==='ok').slice(0,5).map(r=>r.url),...source.seeds.slice(1,5)])];
 const seen=new Set(),articles=new Map();
 try{
  for(let i=0;i<queue.length&&i<18;i++){
   const url=queue[i];if(seen.has(url)||!owns(url))continue;
   seen.add(url);
   const page=await transport.get(url,null,'discovery');
   if(page.error||!page.html||!owns(page.finalUrl||url)){
    output.attempts.push({url,error:page.error||'publisher_mismatch',status:page.statusCode});continue;
   }
   const found=discoverNewsLinks(page.html,page.finalUrl||url,{domain:source.domain,allowedHosts:source.config.allowedHosts,knownCategoryUrls:source.seeds,legacy:{legacyArticlePattern:source.config.discovery?.legacyArticlePattern}});
   for(const link of found.articles)if(owns(link.url))articles.set(articleKey(link.url),link.url);
   output.attempts.push({url,status:page.statusCode,links:found.articles.length,normalization:page.normalization});
   if(i>2)continue;
   for(const category of found.categories.slice(0,5))if(!queue.includes(category.url)&&owns(category.url))queue.push(category.url);
   const $=cheerio.load(page.html);
   $('link[href][type*=rss],link[href][type*=atom],a[href]').each((_,element)=>{
    const href=$(element).attr('href')||'';
    if(!/rss|atom|\/feed\//i.test(href)||/comment/i.test(href))return;
    try{const endpoint=new URL(href,page.finalUrl||url).href;if(owns(endpoint)&&!queue.includes(endpoint))queue.push(endpoint);}catch{}
   });
  }
 }finally{await transport.close();}
 return {...output,previousEndpointAttempts:previous.attempts.length,candidates:[...articles.values()]};
}
try{
 await Promise.all(Array.from({length:16},async()=>{
  while(cursor<jobs.length){
   const job=jobs[cursor++], result=await inspect(job);
   await fs.writeFile(output+'/'+job.source.domain+'.json',JSON.stringify(result),{mode:0o600});
   if(++completed%20===0)console.log(JSON.stringify({completed,total:jobs.length}));
  }
 }));
 console.log(JSON.stringify({completed,total:jobs.length,paidAiCalls:0}));
}finally{await network.close();}
