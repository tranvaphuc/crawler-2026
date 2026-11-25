import fs from 'node:fs/promises';
import path from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {gzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {loadNewsRegistry} from '../src/newsFlow/registry.mjs';
import {NewsHttpDriver,NewsProxyPool} from '../src/newsFlow/transport.mjs';
import {NewsNetworkPool} from '../src/newsFlow/networkPool.mjs';
import {NewsRepairPool} from '../src/web/newsRepairPool.mjs';
import {newsArticleRejection} from '../src/web/newsArticleAdmission.mjs';
import {classifyNewsDocument} from '../src/web/newsDocumentKind.mjs';
import {createNewsResearchTransport} from '../src/web/newsResearchTransport.mjs';
import {parsePublicPublicationFeed} from '../src/web/newsDateContext.mjs';
import {originalSkydoorUrl} from '../src/web/newsPublisherDispatch.mjs';
import {currentAuditGate} from './news_current_audit_gate.mjs';
const root=path.resolve('outputs/news-failed-recovery-2026-11-16'),registry=await loadNewsRegistry(),failures=JSON.parse(await fs.readFile(path.join(root,'failures.json')));
const live=new DatabaseSync('/var/lib/news-flow/news-flow-runtime/write.sqlite',{readOnly:true});
for(const overlay of live.prepare('SELECT site,config FROM parser_overlays').all()){const source=registry.sources.get(overlay.site);if(source)source.config=JSON.parse(overlay.config);}
const db=new DatabaseSync(path.join(root,'review.sqlite'));db.exec("PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL; CREATE TABLE IF NOT EXISTS verdicts(parse_key TEXT PRIMARY KEY,url TEXT,site TEXT,old_reason TEXT,outcome TEXT,reason TEXT,html_path TEXT,parsed TEXT,checked_at INTEGER)");
const insert=db.prepare('INSERT OR REPLACE INTO verdicts VALUES(?,?,?,?,?,?,?,?,?)'),existing=new Set(db.prepare('SELECT parse_key FROM verdicts').all().map(r=>r.parse_key));
const network=new NewsNetworkPool({workers:16}),pool=new NewsRepairPool(16,new URL('../src/web/newsDeepAuditWorker.mjs',import.meta.url));
const proxies=await NewsProxyPool.load('/etc/news-flow/proxies.json',{rotation:'request'}),profiles=JSON.parse(await fs.readFile('config/web-sources/news-http-profiles.json'));
const driver=new NewsHttpDriver({network,state:{cacheResponses:false,failedUrl:()=>false,request:()=>null,reserve:()=>true,cache:()=>null,completeHttpResponse:()=>{}},pool:proxies,profiles,allowedDomains:registry.allowedDomains,siteCooldown:false});
let checked=existing.size,cursor=0;const contexts=new Map(),perSite=new Map(),siteKeys=[...new Set(failures.map(r=>r.site))],groups=new Map(siteKeys.map(s=>[s,failures.filter(r=>r.site===s&&!existing.has(r.parse_key))]));
function next(){for(let i=0;i<siteKeys.length;i++){const site=siteKeys[cursor++%siteKeys.length],queue=groups.get(site);if(queue.length&&(perSite.get(site)||0)<16){perSite.set(site,(perSite.get(site)||0)+1);return queue.pop();}}return null;}
function done(r,outcome,reason,htmlPath=null,parsed=null){insert.run(r.parse_key,r.url,r.site,r.error,outcome,reason||null,htmlPath,parsed?JSON.stringify(parsed):null,Date.now());checked++;}
async function context(source,transport){const feed=[source.config.publishedDate,...source.config.variants||[]].find(d=>d?.strategy==='public_feed')?.feedUrl;if(!feed)return {};if(!contexts.has(feed))contexts.set(feed,(async()=>{const p=await transport.get(feed,null,'feed');return !p.error&&p.html?parsePublicPublicationFeed(p.html,p.finalUrl||feed):{unavailable:true};})());return contexts.get(feed);}
async function run(r){
 const source=registry.sources.get(r.site);if(!source){done(r,'failed','SOURCE_CONFIG_MISSING');return;}
 const rejection=newsArticleRejection(r.url,source);if(rejection){done(r,'excluded','non_article:'+rejection);return;}
 const transport=createNewsResearchTransport({baseTransport:driver.forCycle('recovery-'+r.parse_key,source.config,{reviewFailed:true,taskRole:'review'}),persistEvidence:false});
 let owner=source,url=r.url,page=await transport.get(url,null,'page').catch(e=>({error:e.code||'transport_error'}));
 if(page.error||!page.html){done(r,'failed',page.error||'EMPTY_NEWS_HTML');return;}
 const final=registry.byHost(new URL(page.finalUrl||url).hostname);
 if(!final){done(r,'failed','FINAL_PUBLISHER_NOT_CONFIGURED');return;}
 if(final.domain!==source.domain){if(!source.config.sourceAlias||source.config.siteName!==final.config.siteName&&source.config.registrableDomain!==final.config.registrableDomain){done(r,'failed','UNAPPROVED_CROSS_PUBLISHER_REDIRECT');return;}owner=final;url=page.finalUrl;}
 if(source.config.parserType==='publisher_dispatch'){
  const original=originalSkydoorUrl(page.html,url,page.finalUrl),publisher=original&&registry.byHost(new URL(original).hostname);
  if(!publisher){done(r,'failed','ORIGINAL_PUBLISHER_NOT_CONFIGURED');return;}
  const reject=newsArticleRejection(original,publisher);if(reject){done(r,'excluded','non_article:'+reject);return;}
  owner=publisher;url=original;page=await transport.get(original,null,'publisher').catch(e=>({error:e.code||'transport_error'}));if(page.error||!page.html){done(r,'failed',page.error||'ORIGINAL_PUBLISHER_UNAVAILABLE');return;}
 }
 const reject=newsArticleRejection(page.finalUrl||url,owner);if(reject){done(r,'excluded','non_article:'+reject);return;}
 const {kind}=await pool.run({classificationOnly:true,sample:{domain:owner.domain,url:page.finalUrl||url,html:page.html,kind:'article'},config:owner.config});
 if(kind.skip){done(r,'excluded','non_article:'+kind.kind);return;}
 const dir=path.join(root,'html',r.site);await fs.mkdir(dir,{recursive:true});const htmlPath=path.join(dir,createHash('sha256').update(r.parse_key).digest('hex').slice(0,24)+'.html.gz');await fs.writeFile(htmlPath,gzipSync(page.html,{level:1}));
 const publication=await context(owner,transport);if(publication.unavailable){done(r,'failed','NEWS_PUBLICATION_FEED_UNAVAILABLE',htmlPath);return;}
 const audit=currentAuditGate(await pool.run({sample:{domain:owner.domain,url,html:page.html,kind:'article'},config:owner.config,context:publication,learn:false}),owner.config,registry,owner.domain);
 const parsed=audit.parsed?{_id:audit.parsed._id,_source:{title:audit.parsed._source.title,publishedDate:audit.parsed._source.publishedDate},extracted:{contentSha256:audit.parsed.extracted.contentSha256}}:null;
 done(r,!audit.error&&!audit.quality?.length?'verified':'failed',audit.error||(audit.quality||[]).map(q=>q.code).join(','),htmlPath,parsed);
}
const timer=setInterval(()=>console.log(JSON.stringify({phase:'review_failed_urls',checked,total:failures.length,network:network.stats(),statuses:db.prepare('SELECT outcome,count(*) n FROM verdicts GROUP BY outcome').all()})),30000);
async function lane(){while(true){const r=next();if(!r){if([...groups.values()].every(q=>!q.length))return;await new Promise(resolve=>setTimeout(resolve,20));continue;}try{await run(r);}catch(e){done(r,'failed',e.code||'recovery_exception');}finally{perSite.set(r.site,perSite.get(r.site)-1);}}}
try{await Promise.all(Array.from({length:256},lane));}finally{clearInterval(timer);await network.close();}
await fs.mkdir(path.join(root,'live/sites'),{recursive:true});const sites=[];
for(const domain of siteKeys){
 const source=registry.sources.get(domain);if(!source)continue;const dir=path.join(root,'live/sites',domain);await fs.mkdir(dir,{recursive:true});const all=db.prepare('SELECT * FROM verdicts WHERE site=?').all(domain),counts=new Map(),articles=[];
 for(const row of all){if(!row.html_path||source.config.parserType==='publisher_dispatch')continue;const label=row.outcome==='verified'?'good':row.reason;if((counts.get(label)||0)>=3)continue;counts.set(label,(counts.get(label)||0)+1);articles.push({url:row.url,htmlPath:row.html_path,parsed:row.parsed?JSON.parse(row.parsed):null,state:row.outcome==='verified'?'parsed':'extraction_unconfirmed',error:row.reason,family:'failure_recovery',foundOn:[]});}
 for(const sample of live.prepare("SELECT url,html FROM review_samples WHERE site=? AND kind='good' LIMIT 3").all(domain)){
  if(articles.some(a=>a.url===sample.url))continue;const file=path.join(dir,'control-'+articles.length+'.html.gz');await fs.writeFile(file,sample.html);const audit=currentAuditGate(await pool.run({sample:{domain,url:sample.url,htmlPath:file,kind:'article'},config:source.config,learn:false}),source.config,registry,domain);if(!audit.error&&!audit.quality?.length)articles.push({url:sample.url,htmlPath:file,state:'parsed',parsed:audit.parsed,error:null,family:'control',foundOn:[]});
 }
 await fs.writeFile(path.join(dir,'result.json'),JSON.stringify({domain,complete:true,articles,feeds:[]}));
 await fs.writeFile(path.join(dir,'discovered-articles.json'),JSON.stringify(all.map(a=>({url:a.url,family:'failure_recovery',foundOn:[],reviewScore:a.outcome==='verified'?3:a.html_path?2:0}))));
 if(sites.length%25===0)console.log(JSON.stringify({phase:'prepare_parser_repairs',sites:sites.length,total:siteKeys.length}));sites.push({domain,configurationFile:path.relative(process.cwd(),path.join(source.directory,domain==='antt.vn'?'antt.vn.validated.json':domain+'.json')),historicalFailures:[],seedUrls:source.config.validation?.sampleUrls||[]});
}
await fs.writeFile(path.join(root,'sites.json'),JSON.stringify(sites,null,2));
const summary={complete:true,total:failures.length,checked,statuses:db.prepare('SELECT outcome,count(*) n FROM verdicts GROUP BY outcome').all(),paidAiCalls:0};await fs.writeFile(path.join(root,'review-summary.json'),JSON.stringify(summary,null,2));console.log(JSON.stringify(summary));await pool.close();live.close();db.close();
