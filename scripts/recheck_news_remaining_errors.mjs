import fs from 'node:fs/promises';
import path from 'node:path';
import {gzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import iconv from 'iconv-lite';
import {createNewsResearchTransport} from '../src/web/newsResearchTransport.mjs';
import {parseConfiguredArticle,pageIssue,discoverNewsLinks} from '../src/web/configurableNewsParser.mjs';
import {parsePublicPublicationFeed} from '../src/web/newsDateContext.mjs';
import {parseSkydoorWithPublisher} from '../src/web/newsPublisherDispatch.mjs';
import {NewsRepairPool} from '../src/web/newsRepairPool.mjs';
import {verifyNewsFields,sharedDescriptionWarnings} from '../src/web/newsFieldVerification.mjs';

const base=path.resolve('outputs/news-flow-preparation-2026-11-12');
const baseline=path.join(base,'deep-verification/final');
const inventory=JSON.parse(await fs.readFile(path.join(base,'inventory.json'),'utf8'));
const oldRows=JSON.parse(await fs.readFile(path.join(baseline,'sites.json'),'utf8'));
const transport=process.argv.includes('--curl')?'curl':'axios';
const root=path.join(base,'remaining-errors-recheck',transport);await fs.mkdir(root,{recursive:true});
const profiles=JSON.parse(await fs.readFile('config/web-sources/news-http-profiles.json','utf8'));
const pool=new NewsRepairPool(4,new URL('../src/web/newsDeepAuditWorker.mjs',import.meta.url));
const execFileAsync=promisify(execFile),hostStates=new Map();let cursor=0,done=0,loads=0;const results=[];
const selected=oldRows.filter(r=>r.parserFailures||r.qualityFailures||r.transportFailures||r.deferred||r.dependencyReviews||r.parserCapability!=='can_parse_confirmed_samples'||Object.entries(r.categoryStates||{}).some(([k,v])=>v&&/transport_unconfirmed|not_attempted/.test(k)));
const progress=()=>({phase:transport,at:new Date().toISOString(),sites:done,total:selected.length,loads});
const timer=setInterval(()=>{console.log(JSON.stringify(progress()));fs.writeFile(path.join(root,'progress.json'),JSON.stringify(progress())).catch(()=>{});},30000);
async function limited(url,spacing,fn){
 const host=new URL(url).hostname.replace(/^www\./,''),state=hostStates.get(host)||{tail:Promise.resolve(),last:0};hostStates.set(host,state);
 const prior=state.tail;let release;state.tail=new Promise(resolve=>release=resolve);await prior;
 try{const wait=spacing-(Date.now()-state.last);if(wait>0)await new Promise(r=>setTimeout(r,wait));state.last=Date.now();return await fn();}finally{release();}
}
async function curlPage(url,file){
 const host=new URL(url).hostname.replace(/^www\./,''),ua=profiles[host]?.userAgent||'Mozilla/5.0 (compatible; NewsParserResearch/1.0)';
 try{
  const {stdout}=await execFileAsync('curl.exe',['--http1.1','--compressed','--location','--max-redirs','6','--max-time','18','--connect-timeout','8','--max-filesize','4000000','--user-agent',ua,'--header','Connection: close','--silent','--show-error','--output',file,'--write-out','%{http_code}\n%{url_effective}\n%{content_type}',url],{windowsHide:true,maxBuffer:200000});
  const [code,finalUrl,contentType='']=stdout.trim().split(/\r?\n/),statusCode=Number(code),bytes=await fs.readFile(file);
  const encoding=contentType.match(/charset\s*=\s*["']?([\w-]+)/i)?.[1]||bytes.subarray(0,4000).toString('ascii').match(/charset\s*=\s*["']?([\w-]+)/i)?.[1]||'utf8';
  const html=iconv.decode(bytes,iconv.encodingExists(encoding)?encoding:'utf8');
  return {requestedUrl:url,finalUrl,statusCode,html,encoding,contentType,checkedAt:new Date().toISOString(),method:'curl HTTP/1.1; Connection: close',error:statusCode===403||statusCode===401?'access_blocked':statusCode===429?'rate_limited':statusCode===404||statusCode===410?'not_found':statusCode>=400?'http_'+statusCode:pageIssue(html)};
 }catch(e){return {requestedUrl:url,error:'curl_exit_'+e.code,checkedAt:new Date().toISOString(),method:'curl HTTP/1.1; strict system TLS'};}
}
async function run(row){
 const site=inventory.sites.find(s=>s.domain===row.domain),dir=path.join(root,row.domain);await fs.mkdir(dir,{recursive:true});
 const output=path.join(dir,'result.json');try{const prior=JSON.parse(await fs.readFile(output,'utf8'));if(prior.complete)return prior;}catch{}
 const original=JSON.parse(await fs.readFile(path.join(baseline,'sites',row.domain+'.json'),'utf8'));
 const previous=JSON.parse(await fs.readFile(path.join(base,'deep-verification',row.domain,'result.json'),'utf8'));
 const config=JSON.parse(await fs.readFile(site.configFile,'utf8'));
 const targets=new Map();
 const add=(url,role,before,reason)=>{if(url&&!targets.has(url))targets.set(url,{url,role,before,reason});};
 if(transport==='axios'){
  for(const c of original.checks||[])if(c.kind!=='parsed')add(c.url,'article',c,'prior_'+c.kind);
  for(const c of previous.categories||[])if(c.state==='transport_unconfirmed'||c.state==='not_attempted')add(c.url,'category',{error:c.error},'category_transport');
  for(const c of (original.checks||[]).filter(c=>c.kind==='parsed').slice(0,2))add(c.url,'article',c,'positive_control');
  if(!targets.size)add(site.homepage,'homepage',null,'discovery_control');
 }else{
  const a=await fs.readFile(path.join(root,'../axios',row.domain,'result.json'),'utf8').then(JSON.parse).catch(()=>null);
  for(const c of a?.checks||[])if(c.attempted!==false&&/ECONN|ENOTFOUND|EAI_AGAIN|ETIMEDOUT|deadline|HPE_|CERT|TLS|SSL/.test(c.transportError||''))add(c.url,c.role,c,'axios_network_failure');
 }
 const record={domain:row.domain,transport,startedAt:new Date().toISOString(),checks:[],network:[],complete:false};
 const overrides={...profiles};for(const h of [site.domain,...config.allowedHosts||[],config.sourceAlias].filter(Boolean))overrides[h.replace(/^www\./,'')]={...overrides[h.replace(/^www\./,'')],connectionClose:true};
 const client=createNewsResearchTransport({...config.http,requestProfiles:overrides,persistEvidence:false,timeoutMs:15000,requestDeadlineMs:18000,maxSockets:1,onNetworkRequest:e=>record.network.push({...e,at:new Date().toISOString()})});
 const memo=new Map(),haltHosts=new Set(),failCounts=new Map();let context={};
 async function get(url,directory=dir,label='article'){
  if(memo.has(url))return memo.get(url);
  const host=new URL(url).hostname.replace(/^www\./,'');
  const task=(async()=>{
   if(haltHosts.has(host)||config.publisherCrawlPolicy?.crawlDelaySeconds)return {requestedUrl:url,error:config.publisherCrawlPolicy?.crawlDelaySeconds?'publisher_crawl_delay':'host_cooldown',attempted:false};
   return limited(url,3000,async()=>{
    loads++;const key=createHash('sha256').update(url).digest('hex').slice(0,24);
    const page=transport==='axios'?await client.get(url,dir,label):await curlPage(url,path.join(dir,key+'.curl.html'));
    if(page.html){page.htmlPath=path.join(dir,key+'.html.gz');await fs.writeFile(page.htmlPath,gzipSync(page.html));}
    page.attempted=true;
    if(page.statusCode===403||page.statusCode===429||page.error==='access_blocked'||page.error==='rate_limited')haltHosts.add(host);
    if(/ECONN|ENOTFOUND|EAI_AGAIN|TIMEDOUT|deadline/.test(page.error||'')){const n=(failCounts.get(host)||0)+1;failCounts.set(host,n);if(n>=2)haltHosts.add(host);}else failCounts.set(host,0);
    await fs.writeFile(path.join(dir,key+'.http.json'),JSON.stringify({...page,html:undefined},null,2));return page;
   });
  })();memo.set(url,task);return task;
 }
 try{
  const feed=[config.publishedDate,...config.variants?.map(v=>v.publishedDate)||[]].find(d=>d?.strategy==='public_feed')?.feedUrl;
  if(feed&&targets.size){const p=await get(feed);if(!p.error&&p.html)context=parsePublicPublicationFeed(p.html,p.finalUrl||feed);record.context={url:feed,error:p.error,items:context.items?.length||0};}
  for(const t of targets.values()){
   const p=await get(t.url),check={...t,attempted:p.attempted,transportError:p.error||null,statusCode:p.statusCode,htmlPath:p.htmlPath,method:p.method,parseError:null,quality:[]};
   if(!p.error&&p.html&&t.role==='article'){
    let parsed;
    if(config.parserType==='publisher_dispatch'){const d=await parseSkydoorWithPublisher({page:p,url:t.url,transport:{get},directory:dir,label:'publisher'});parsed=d.parsed||{error:d.error};check.originalPublisherUrl=d.originalUrl;}
    else parsed=parseConfiguredArticle(p.html,t.url,config,context);
    check.parseError=parsed.error||null;
    const inspection=await pool.run({sample:{domain:site.domain,url:t.url,htmlPath:p.htmlPath,kind:'article'},config,context,learn:!!parsed.error});
    check.quality=inspection.quality||[];check.policyConflict=inspection.policyConflict;check.diagnosis=inspection.diagnosis;check.nativeEvidence=inspection.evidence;
    if(!parsed.error){
     check.parsed=parsed;check.fieldReview=verifyNewsFields(p.html,parsed);check.quality.push(...check.fieldReview.issues);
     if(parsed.extracted.publisherRestricted)check.quality.push({code:'publisher_restricted'});
     if(site.timezoneReviewRequired&&parsed.extracted.dateTimezone!=='explicit_offset')check.quality.push({code:'configured_timezone_requires_confirmation'});
     try{const canonical=new URL(parsed.extracted.canonicalUrl||t.url,t.url),allowed=new Set([site.domain,...site.allowedHosts||[],site.sourceAlias].filter(Boolean).map(s=>s.replace(/^www\./,'')));if(!allowed.has(canonical.hostname.replace(/^www\./,'')))check.quality.push({code:'publisher_identity_requires_review',canonical:canonical.href});}catch{check.quality.push({code:'invalid_canonical_identity'});}
    }else if(inspection.proposal){check.localProposal=inspection.proposal;}
   }else if(!p.error&&p.html){const d=discoverNewsLinks(p.html,p.finalUrl||t.url,{domain:site.domain,url:site.homepage,knownCategoryUrls:site.categoryCandidates},{maxCategories:0});check.discoveredArticleLinks=d.articles.length;}
   check.state=check.attempted===false?'deferred':check.transportError?'transport_unconfirmed':check.parseError?.startsWith('non_news_document:')?'non_article':check.parseError?'parser_unconfirmed':check.parsed?(check.quality.length?'quality_review':'passed'):'listing_checked';
   record.checks.push(check);
   await fs.writeFile(path.join(dir,'checkpoint.json'),JSON.stringify({...record,planned:targets.size},null,2));
  }
  const descriptions=sharedDescriptionWarnings(record.checks.filter(c=>c.parsed).map(c=>({title:c.parsed._source.title,description:c.parsed._source.description})));
  for(const c of record.checks){const warning=descriptions.find(w=>w.description===c.parsed?._source.description);if(warning){c.quality.push(warning);if(c.state==='passed')c.state='quality_review';}}
 }catch(e){record.exception=e.message;}finally{await client.close();}
 record.complete=true;record.finishedAt=new Date().toISOString();record.planned=targets.size;
 await fs.writeFile(output,JSON.stringify(record,null,2));return record;
}
async function lane(){while(cursor<selected.length){const row=selected[cursor++];try{const r=await run(row);results.push({domain:row.domain,checks:r.checks.length,states:r.checks.reduce((o,c)=>(o[c.state]=(o[c.state]||0)+1,o),{}),exception:r.exception});}catch(e){results.push({domain:row.domain,exception:e.message});}done++;}}
try{await Promise.all(Array.from({length:20},lane));}finally{clearInterval(timer);await pool.close();}
await fs.writeFile(path.join(root,'summary.json'),JSON.stringify({...progress(),complete:true,results},null,2));console.log(JSON.stringify({...progress(),exceptions:results.filter(r=>r.exception)}));
await fs.writeFile(path.join(root,'progress.json'),JSON.stringify({...progress(),complete:true,status:'completed'},null,2));
