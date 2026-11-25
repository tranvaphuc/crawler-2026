import fs from 'node:fs/promises';import path from 'node:path';import {gzipSync} from 'node:zlib';
import {loadNewsRegistry} from '../src/newsFlow/registry.mjs';import {NewsState} from '../src/newsFlow/state.mjs';import {NewsProxyPool,NewsHttpDriver} from '../src/newsFlow/transport.mjs';import {createNewsResearchTransport} from '../src/web/newsResearchTransport.mjs';import {NewsRepairPool} from '../src/web/newsRepairPool.mjs';import {discoverNewsLinks} from '../src/web/configurableNewsParser.mjs';import {parsePublicPublicationFeed} from '../src/web/newsDateContext.mjs';import {verifyNewsFields} from '../src/web/newsFieldVerification.mjs';import {classifyNewsLink} from '../src/web/newsLinkPolicy.mjs';import {sha} from '../src/newsFlow/identity.mjs';
const root=path.resolve('outputs/news-site-errors-2026-11-13'),input=JSON.parse(await fs.readFile(path.join(root,'current-errors.json'),'utf8'));
await fs.mkdir(path.join(root,'pages'),{recursive:true});const registry=await loadNewsRegistry(),pool=await NewsProxyPool.load('outputs/news-flow-runtime/proxies.credentials.json'),state=await NewsState.open(path.join(root,'recheck.sqlite')),parsers=new NewsRepairPool(3,new URL('../src/web/newsDeepAuditWorker.mjs',import.meta.url));
const driver=new NewsHttpDriver({state,pool,allowedDomains:registry.allowedDomains,profiles:JSON.parse(await fs.readFile('config/web-sources/news-http-profiles.json','utf8')),timeoutMs:15000,maxWireRequests:350}),rows=[];
const extra=['baochinhphu.vn','baoquocte.vn','qdnd.vn','laodong.vn','bienphong.com.vn'];
const domains=input.sites.filter(s=>!s.verifiedNew&&!s.verifiedOld||extra.includes(s.site)).map(s=>s.site);let cursor=0;
async function inspect(domain){const source=registry.sources.get(domain),cycle='failure-recheck-'+Date.now()+'-'+domain;state.cycle(cycle);const transport=createNewsResearchTransport({baseTransport:driver.forCycle(cycle,source.config),persistEvidence:false}),record={domain,checkedAt:new Date().toISOString(),homepage:null,articles:[]};
 try{
  const urls=input.errors.filter(e=>e.site===domain&&classifyNewsLink(e.url_key,domain).kind==='unknown').map(e=>e.url_key);let page;
  if(!input.sites.find(s=>s.site===domain).seedSuccess||urls.length<2){page=await transport.get(source.seeds[0],null,'homepage');const links=!page.error&&page.html?discoverNewsLinks(page.html,page.finalUrl||source.seeds[0],{domain,knownCategoryUrls:source.seeds,legacy:{legacyArticlePattern:source.config.discovery?.legacyArticlePattern}}).articles:[];record.homepage={url:source.seeds[0],status:page.statusCode,error:page.error,finalUrl:page.finalUrl,links:links.length,examples:links.slice(0,4)};if(page.html){const file=path.join(root,'pages',sha(source.seeds[0])+'.html.gz');await fs.writeFile(file,gzipSync(page.html));record.homepage.htmlPath=file;}urls.push(...links.slice(0,3).map(a=>a.url));}
  let context={};const feed=[source.config.publishedDate,...source.config.variants||[] .map(v=>v.publishedDate)].find(x=>x?.strategy==='public_feed')?.feedUrl;
  if(feed){const f=await transport.get(feed,null,'feed');if(!f.error&&f.html)context=parsePublicPublicationFeed(f.html,f.finalUrl||feed);}
  for(const url of [...new Set(urls)].slice(0,2)){
   const p=await transport.get(url,null,'article'),item={url,status:p.statusCode,error:p.error,finalUrl:p.finalUrl};
   if(p.html){item.htmlPath=path.join(root,'pages',sha(url)+'.html.gz');await fs.writeFile(item.htmlPath,gzipSync(p.html));}
   if(!p.error&&p.html){const a=await parsers.run({sample:{domain,url,html:p.html,kind:'article'},config:source.config,context,learn:true});item.parseError=a.error;item.diagnosis=a.diagnosis;item.quality=a.quality;item.evidence=a.evidence;item.proposal=a.proposal;
    if(a.parsed){item.fields=verifyNewsFields(p.html,a.parsed);const d=a.parsed;item.parsed={title:d._source.title,description:d._source.description,publishedDate:d._source.publishedDate,id:d._id,index:d._index,bodyChars:d._source.content.length,extracted:d.extracted};}
   }record.articles.push(item);
   if(p.error==='access_blocked'||p.error==='rate_limited')break;
  }
 }catch(e){record.error=e.code||(/^[A-Z0-9_]+$/.test(e.message)?e.message:e.name);}
 rows.push(record);await fs.writeFile(path.join(root,'recheck-'+domain+'.json'),JSON.stringify(record,null,2));console.log(JSON.stringify({site:domain,home:record.homepage&&{status:record.homepage.status,error:record.homepage.error,links:record.homepage.links},articles:record.articles.map(a=>({error:a.error||a.parseError,quality:a.quality?.map(q=>q.code),fieldIssues:a.fields?.issues.map(q=>q.code),proposal:!!a.proposal})),error:record.error}));
}
async function lane(){while(cursor<domains.length)await inspect(domains[cursor++]);}
try{await Promise.all(Array.from({length:7},lane));await fs.writeFile(path.join(root,'recheck-summary.json'),JSON.stringify({checkedAt:new Date().toISOString(),sites:domains.length,wireRequests:driver.wireRequests,rows},null,2));}finally{await parsers.close();state.close();}
