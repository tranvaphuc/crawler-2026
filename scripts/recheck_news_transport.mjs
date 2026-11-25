import fs from 'node:fs/promises';
import path from 'node:path';
import {gzipSync} from 'node:zlib';
import {createNewsResearchTransport} from '../src/web/newsResearchTransport.mjs';
import {parseConfiguredArticle} from '../src/web/configurableNewsParser.mjs';
import {verifyNewsFields} from '../src/web/newsFieldVerification.mjs';
const root=path.resolve('outputs/news-flow-preparation-2026-11-12/deep-verification');
const inv=JSON.parse(await fs.readFile(path.join(root,'../inventory.json'),'utf8'));
const profiles=JSON.parse(await fs.readFile('config/web-sources/news-http-profiles.json','utf8'));
const filter=process.argv.includes('--site')?process.argv[process.argv.indexOf('--site')+1]:null;
const rows=[];let cursor=0,done=0;
const timer=setInterval(()=>console.log(JSON.stringify({phase:'connection_close_recheck',done,total:filter?1:544})),30000);
async function run(site){
 const dir=path.join(root,site.domain),r=await fs.readFile(path.join(dir,'result.json'),'utf8').then(JSON.parse).catch(()=>null);
 if(!r?.complete)return;
 const file=path.join(dir,'transport-recheck.json'),prior=await fs.readFile(file,'utf8').then(JSON.parse).catch(()=>null);if(prior?.complete)return prior;
 const config=JSON.parse(await fs.readFile(site.configFile,'utf8'));
 if(config.publisherCrawlPolicy?.crawlDelaySeconds)return {domain:site.domain,skipped:'publisher_crawl_delay'};
 const targets=[...r.categories,...r.articles].filter(a=>/ECONNRESET|ETIMEDOUT|ECONNABORTED|request_deadline|HPE_/.test(a.transportError||a.error||'')&&a.attempted!==false);
 const memo=new Set(),checks=[];let halt=false,last=0;
 const t=createNewsResearchTransport({...config.http,requestProfiles:{...profiles,[site.domain]:{...profiles[site.domain],connectionClose:true}},persistEvidence:false,timeoutMs:15000,requestDeadlineMs:18000,maxSockets:1});
 try{for(const item of targets){
  const url=item.url||item.requestedUrl;if(!url||memo.has(url))continue;memo.add(url);
  if(halt){checks.push({url,state:'deferred',reason:'publisher_access_limit'});continue;}
  const delay=3000-(Date.now()-last);if(delay>0)await new Promise(resolve=>setTimeout(resolve,delay));last=Date.now();
  const p=await t.get(url,dir,'close-recheck'),article=r.articles.some(a=>a.url===url);
  let parsed,verification;
  if(!p.error&&p.html&&article&&config.parserType!=='publisher_dispatch'&&!site.requiresPublicationContext){parsed=parseConfiguredArticle(p.html,url,config);if(!parsed.error)verification=verifyNewsFields(p.html,parsed);}
  const row={url,role:article?'article':'category',originalError:item.transportError||item.error,transportError:p.error||null,statusCode:p.statusCode,
   method:'HTTP/axios; Connection: close; independent later verification round',checkedAt:p.checkedAt,
   parseError:parsed?.error||null,parsed:parsed&&!parsed.error?parsed:null,verification};
  if(p.html){row.htmlPath=path.join(dir,'close-'+memo.size+'.html.gz');await fs.writeFile(row.htmlPath,gzipSync(p.html,{level:1}));}
  checks.push(row);if(p.statusCode===403||p.statusCode===429)halt=true;
 }}finally{await t.close();}
 const result={domain:site.domain,complete:true,checks,recovered:checks.filter(c=>!c.transportError&&c.statusCode===200).length};
 await fs.writeFile(file,JSON.stringify(result,null,2));return result;
}
const sites=inv.sites.filter(s=>!filter||s.domain===filter);
async function lane(){while(cursor<sites.length){const site=sites[cursor++];try{const r=await run(site);if(r)rows.push({domain:site.domain,checked:r.checks?.length||0,recovered:r.recovered||0,skipped:r.skipped});}catch(e){rows.push({domain:site.domain,error:e.message});}done++;}}
try{await Promise.all(Array.from({length:filter?1:16},lane));}finally{clearInterval(timer);}
const summary={sitesConsidered:done,sitesWithCompletedDeepAudit:rows.length,rows,scope:'Only completed deep audits are eligible; reruns resume per-site completed rechecks. No claim that skipped unfinished audits were rechecked.'};
await fs.writeFile(path.join(root,filter?'transport-recheck-'+filter+'.json':'transport-recheck-summary.json'),JSON.stringify(summary,null,2));console.log(JSON.stringify(summary));
