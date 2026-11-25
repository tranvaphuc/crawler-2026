import {normalizeCamauPoliceArticle} from '../src/web/camauPoliceNews.mjs';
import {normalizeDienbienNextArticle} from '../src/web/dienbienNextNews.mjs';
import {newsSiteProfiles} from '../src/web/newsSiteProfiles.mjs';
import {normalizeGovernmentNuxtArticle} from '../src/web/governmentNuxtNews.mjs';
import fs from 'node:fs/promises';
import path from 'node:path';
import {gzipSync,gunzipSync} from 'node:zlib';
import * as cheerio from 'cheerio';
import {loadNewsRegistry} from '../src/newsFlow/registry.mjs';
import {NewsHttpDriver,NewsProxyPool} from '../src/newsFlow/transport.mjs';
import {NewsNetworkPool} from '../src/newsFlow/networkPool.mjs';
import {NewsRepairPool} from '../src/web/newsRepairPool.mjs';
import {createNewsResearchTransport} from '../src/web/newsResearchTransport.mjs';
import {learnNewsConfig,discoverNewsLinks} from '../src/web/configurableNewsParser.mjs';
import {newsParserRepairFields} from '../src/web/newsParserRepairFields.mjs';
import {qualifyNewsSourceSamples} from '../src/newsFlow/sourceQualification.mjs';
import {parsePublicPublicationFeed} from '../src/web/newsDateContext.mjs';
import {currentAuditGate} from './news_current_audit_gate.mjs';

const root=path.resolve(process.env.NEWS_PRIORITY_ROOT||'outputs/news-priority-sites-2026-11-16');
const read=async p=>JSON.parse(await fs.readFile(p,'utf8'));
const registry=await loadNewsRegistry(),sites=await read(path.join(root,'candidates.json'));
const network=new NewsNetworkPool({workers:4}),parsers=new NewsRepairPool(6,new URL('../src/web/newsDeepAuditWorker.mjs',import.meta.url));
const profiles=JSON.parse(await fs.readFile('config/web-sources/news-http-profiles.json'));
const driver=new NewsHttpDriver({network,state:{cacheResponses:false,failedUrl:()=>false,request:()=>null,reserve:()=>true,cache:()=>null,completeHttpResponse:()=>{}},pool:await NewsProxyPool.load('/etc/news-flow/proxies.json',{rotation:'request'}),profiles,allowedDomains:[...registry.allowedDomains,...sites.map(s=>s.domain),'public.vietnamtourism.gov.vn'],siteCooldown:false});
const cleanTitle=(setting,$)=>{let n;try{n=$(setting?.selector||'h1').first();}catch{n=$('h1').first();}return (n.text()||setting?.value||'').replace(/\s+/g,' ').trim();};
const summaries=[];let cursor=0;
async function run(site){
 const layouts={
 'congan.camau.gov.vn':{title:'h1',body:'.article-content'},
 'baoquangtri.vn':{title:'h2.title',date:'.list-inline-item:contains("/"):not(:has(script))',dateSelectorOnly:true,body:'.td-post-content'},
 'vov.gov.vn':{title:'.muc-5-2 .text-1',body:'.muc06.chiTietTinBai',date:'.muc-5-2 .text-2 span',dateSelectorOnly:true},
 'nguoilamnghe.com.vn':{title:'h1',date:'#ContentPlaceHolder1_DataList2_Labelngaygui1_0',dateSelectorOnly:true,body:'.catItemIntroText'},
 'thitruongvietnam.vn':{title:'h1',date:'#ContentPlaceHolder1_DataList2_Labelngaygui1_0',dateSelectorOnly:true,body:'.catItemIntroText'},
 'phutungmitsubishi.vn':{title:'h1',date:'.post-date:last',dateSelectorOnly:true,body:'.article-content:last'},
 'vts.com.vn':{title:'h1',date:'.article-container .meta-info .text-danger',dateSelectorOnly:true,body:'.article-content'},
 'doanhnhanvietuc.net':{title:'h2.mb-10.mt-20',date:'.entry-meta .post-on',dateSelectorOnly:true},
 'hatinhmoi.vn':{title:'h1.title',date:'.h5',dateSelectorOnly:true,body:'#news-bodyhtml'},
 'bovagau.vn':{title:'h2.chakra-heading',body:'.css-itvw0n'},
 'investglobal.vn':{title:'h1.uk-panel-title',date:'.uk-panel-body > .meta > span',dateSelectorOnly:true,body:'.uk-panel-body > .content'},
 'funan.com.vn':{title:'article.post h1.post-title',body:'article.post:has(h1.post-title) .post-content',date:'article.post:has(h1.post-title) .post-meta',dateSelectorOnly:true}
 };
 if(layouts[site.domain])newsSiteProfiles[site.domain]={...newsSiteProfiles[site.domain],...layouts[site.domain]};
 const before=await read(path.join(root,'audit',site.domain,'result.json'));
 const dir=path.join(root,'repair',site.domain);await fs.mkdir(dir,{recursive:true});
 const prior=await read(path.join(dir,'result.json')).catch(()=>null);if(prior?.complete&&prior.approved&&prior.strictPublicationValidated===true&&prior.publicationDatePolicy==='native_updated_when_original_missing'&&prior.publicationTimePolicy==='native_date_midnight_if_missing'){summaries.push(prior);return;}
 if(false&&before.approved){const result={domain:site.domain,complete:true,approved:true,existing:registry.sources.has(site.domain),accepted:{configFile:path.join(root,'audit',site.domain,'approved-config.json')},unchangedAudit:true};await fs.writeFile(path.join(dir,'result.json'),JSON.stringify(result));summaries.push(result);return;}
 const existing=registry.sources.get(site.domain)?.config;
 const base={...(existing||{schemaVersion:1,siteName:site.domain,siteId:site.domain,registrableDomain:site.domain,homepage:before.homepage,allowedHosts:[site.domain,'www.'+site.domain],timezone:'Asia/Ho_Chi_Minh',requiresTimezoneReviewBeforeWrite:true,identityEncoding:'latin1',discovery:{homepage:before.homepage,categories:before.workingSeeds.filter(s=>s.role==='category').map(s=>s.url)}}),...(['kinhdoanhplus.vn','kinhdoanhvaphattrien.vn'].includes(site.domain)?{httpTransportScheme:'http'}:{}),publicationValidationPolicy:'strict_native_publication_v1',publicationDatePolicy:'native_updated_when_original_missing',publicationTimePolicy:'native_date_midnight_if_missing',timezoneProvenance:'user_approved_vietnam_local_clock_2026-11-16',...(site.domain==='vietnamtourism.gov.vn'?{httpDependencyHosts:['public.vietnamtourism.gov.vn']}:{} )};
 const transport=createNewsResearchTransport({baseTransport:driver.forCycle('priority-repair-'+site.domain,base,{reviewFailed:true,taskRole:'review'}),persistEvidence:false});
 let context={},sequence=0;const feedEvidence=[];
 const samples=[];for(const a of before.articles||[]){if(a.htmlPath){let html=gunzipSync(await fs.readFile(a.htmlPath)).toString();const normalized=normalizeGovernmentNuxtArticle(html,a.url)||normalizeDienbienNextArticle(html,a.url)||normalizeCamauPoliceArticle(html,a.url);if(normalized?.html)html=normalized.html;samples.push({...a,html});}}
 if(!before.workingSeeds.length&&samples.length){
  const categories=new Map();
  for(const raw of site.sampleUrls||[]){try{const u=new URL(raw);if(u.pathname.endsWith('.aspx')&&u.search){u.search='';categories.set(u.href,{url:u.href});}}catch{}}
  const preferred={'momo.vn':['https://www.momo.vn/tai-chinh/blog','https://www.momo.vn/tin-tuc'],'vpbank.com.vn':['https://www.vpbank.com.vn/tin-tuc'],'dstock.vn':['https://dstock.vn/tin-tuc'],'vtvgo.vn':['https://vtvgo.vn/kho-video']};
  for(const url of preferred[site.domain]||[])categories.set(url,{url});
  for(const a of samples.slice(0,2)){const d=discoverNewsLinks(a.html,a.url,{domain:site.domain,knownCategoryUrls:base.discovery?.categories||[],legacy:{}});for(const cat of d.categories)categories.set(cat.url,cat);}
  for(const cat of [...categories.values()].slice(0,5)){const p=await transport.get(cat.url,null,'discovery');if(p.error||!p.html)continue;const d=discoverNewsLinks(p.html,p.finalUrl||cat.url,{domain:site.domain,knownCategoryUrls:[],legacy:{}});if(!d.articles.length)continue;before.workingSeeds.push({url:cat.url,role:'verified_category',articleLinks:d.articles.length});base.discovery={...base.discovery,homepage:cat.url};for(const a of d.articles.slice(0,6)){if(samples.some(s=>s.url===a.url))continue;const p=await transport.get(a.url,null,'discovered-article');if(p.error||!p.html)continue;const htmlPath=path.join(dir,'discovered-article-'+(++sequence)+'.html.gz');await fs.writeFile(htmlPath,gzipSync(p.html));samples.push({url:a.url,html:p.html,htmlPath,state:'fresh_discovered_article'});}break;}
 }
 const feedUrls=new Set([base.publishedDate?.feedUrl,...(base.variants||[]).map(v=>v.publishedDate?.feedUrl)].filter(Boolean));
 for(const p of (before.pages||[]).filter(p=>p.htmlPath&&p.role==='homepage').slice(0,1)){
  const $=cheerio.load(gunzipSync(await fs.readFile(p.htmlPath)).toString());$('link[type="application/rss+xml"],link[type="application/atom+xml"],a[href*="rss"],a[href$="/feed/"]').each((i,e)=>{try{const u=new URL($(e).attr('href'),p.finalUrl||p.url);if(u.hostname.replace(/^www\./,'')===site.domain&&feedUrls.size<4)feedUrls.add(u.href);}catch{}});
 }
 if(!feedUrls.size)for(const endpoint of ['/rss','/rss/','/rss.xml','/feed/'])feedUrls.add(new URL(endpoint,base.homepage).href);
 for(const url of feedUrls){const p=await transport.get(url,null,'feed');if(p.error||!p.html)continue;const f=parsePublicPublicationFeed(p.html,p.finalUrl||url);if(!f.items.length)continue;context=f;feedEvidence.push({url,items:f.items.length});if(!before.workingSeeds.length){base.discovery={...base.discovery,homepage:url};before.workingSeeds.push({url,role:'publication_feed',articleLinks:f.items.length});}break;}
 for(const entry of (context.items||[]).slice(0,6)){if(samples.some(a=>a.url===entry.url))continue;const p=await transport.get(entry.url,null,'feed-article');if(!p.error&&p.html){const htmlPath=path.join(dir,'feed-article-'+(++sequence)+'.html.gz');await fs.writeFile(htmlPath,gzipSync(p.html));samples.unshift({url:entry.url,html:p.html,htmlPath,state:'fresh_feed_article'});}}
 const proposals=[];const seen=new Set();
 function propose(config,url){const key=JSON.stringify(newsParserRepairFields(config));if(!seen.has(key)){seen.add(key);proposals.push({config,url});}}
 if(existing)propose(base,null);
 const layout=layouts[site.domain];if(layout?.title&&layout?.date&&layout?.body)propose({...base,title:{strategy:'selector',selector:layout.title},publishedDate:{strategy:'selector',selector:layout.date},body:{strategy:'selector',selector:layout.body}},samples[0]?.url);
 for(const a of samples.slice(0,12)){
  const learned=learnNewsConfig(a.html,a.url,{domain:site.domain,url:base.homepage,registrableDomain:base.registrableDomain,timezone:base.timezone,legacy:{}},context);
  const cfg=learned.config?{...base,...newsParserRepairFields(learned.config),dateOrder:base.dateOrder||learned.config.dateOrder,clockFormat:base.clockFormat||learned.config.clockFormat,variants:[],enabled:true}:null;
  if(cfg){
   propose(cfg,a.url);
   if(context.publicationDates?.[a.url])propose({...cfg,publishedDate:{strategy:'public_feed',feedUrl:context.feedUrl,sourceKind:'public_feed'}},a.url);
   const $=cheerio.load(a.html);
   for(const selector of ['meta[property="article:published_time"]','meta[name="pubdate"]','time[itemprop="datePublished"]','[itemprop="datePublished"]','time[datetime]']){const n=$(selector).first();if(!n.length)continue;const attribute=n.attr('content')?'content':n.attr('datetime')?'datetime':null;if(!attribute)continue;propose({...cfg,publishedDate:{strategy:'selector',selector,attribute,index:0}},a.url);}
   if(['voz.vn','carpassion.vn','xetv.vn','forum.autodaily.vn'].includes(site.domain)){
    const candidate={...cfg,title:{strategy:'selector',selector:'h1'},publishedDate:{strategy:'selector',selector:'.message--post:first-of-type .message-attribution-main time[datetime]',attribute:'datetime',index:0},body:{strategy:'selector',selector:'.message--post:first-of-type .message-body .bbWrapper',removeExtra:'script,style,.bbCodeBlock--quote,.message-signature,.js-expandLink'}};
    propose(candidate,a.url);
    for(const selector of ['.message--post:first-of-type .bbWrapper > b:first-of-type','.message--post:first-of-type .bbWrapper > div:first-of-type','.message--post:first-of-type .bbWrapper > p:first-of-type'])propose({...candidate,description:{strategy:'selector',scope:'.p-body',selector}},a.url);
   }
  }
  for(const original of [cfg,existing?base:null].filter(Boolean)){
   const $=cheerio.load(a.html);
   const scopes=['article.article','article','.article-detail','.detail-content','.main-detail','.post','.item-page','.news-detail','.entry','.NoidungLeft','.muc-5-2','#content'];
   if(original.body?.selector){let body;try{body=$(original.body.selector).first();}catch{}if(body?.length){const headline=cleanTitle(original.title,$);for(const ancestor of body.parents().toArray()){const n=$(ancestor);if(!n.find('h1,h2,h3,'+(original.title?.selector||'h1')).toArray().some(e=>$(e).text().replace(/\s+/g,' ').trim()===headline))continue;const escape=s=>s.replace(/[^a-zA-Z0-9_-]/g,c=>'\\'+c),id=n.attr('id'),classes=(n.attr('class')||'').split(/\s+/).filter(Boolean);const guesses=[id?'#'+escape(id):null,...classes.map(c=>ancestor.tagName+'.'+escape(c)),ancestor.tagName==='body'?'body':null].filter(Boolean);const chosen=guesses.find(s=>{try{return $(s).length===1;}catch{return false;}});if(chosen&&!scopes.includes(chosen))scopes.push(chosen);if(chosen)break;}}}
   for(const scope of scopes){
    const owner=$(scope);if(owner.length!==1||!owner.find('h1,h2,h3,'+(original.title?.selector||'h1')).length)continue;
    if(original.body?.strategy==='selector')propose({...original,description:{strategy:'native_lead',scope,selector:original.body.selector+' p'}},a.url);
    const selectors=[...(site.domain==='vov.gov.vn'?['.muc03']:[]),'.sapo','.article__sapo','.article-sapo','.detail-sapo','.entry-summary','.post-excerpt','.description','.intro','.lead','.summary','[itemprop=description]'];
    if(original.body?.strategy==='selector')selectors.push(original.body.selector+' > p:first-of-type',original.body.selector+' p:not(:has(img)):not(:empty):first');
    for(const selector of selectors){let node;try{node=owner.find(selector);}catch{continue;}const text=node.text().replace(/\s+/g,' ').trim();if(node.length!==1||text.length<30||text.length>2000||node.parents('nav,aside,footer,.related,.comments').length)continue;propose({...original,description:{strategy:'selector',scope,selector}},a.url);}
   }
  }
 }
 const auditRegistry=config=>({sources:new Map([...registry.sources,[site.domain,{config,quality:registry.sources.get(site.domain)?.quality||{}}]]),byHost:h=>config.allowedHosts.some(a=>a.replace(/^www\./,'')===h.replace(/^www\./,''))?{config}:registry.byHost(h)});
 async function check(config,a){const v=currentAuditGate(await parsers.run({sample:{domain:site.domain,url:a.url,html:a.html,kind:'article'},config,context,learn:false}),config,auditRegistry(config),site.domain);return {url:a.url,htmlPath:a.htmlPath,state:!v.error&&!v.quality?.length?'parsed':'failed',error:v.error,issues:v.quality,contentHash:v.parsed?.extracted?.contentSha256,description:v.parsed?._source?.description,title:v.parsed?._source?.title,publishedDate:v.parsed?._source?.publishedDate,id:v.parsed?._id};}
 let accepted=null;const trials=[];
 try{
  for(const proposal of proposals.slice(0,45)){
   const checked=[];let regressions=0;
   for(const a of samples){const v=await check(proposal.config,a);checked.push(v);if(a.state==='parsed'&&(v.state!=='parsed'||v.contentHash!==a.contentHash||v.title!==a.title||v.publishedDate!==a.publishedDate))regressions++;if(regressions||checked.length===3&&!checked.some(a=>a.state==='parsed'))break;}
   const passed=checked.filter(a=>a.state==='parsed');trials.push({trainingUrl:proposal.url,passed:passed.length,regressions,errors:checked.filter(a=>a.state!=='parsed').slice(0,3).map(a=>({error:a.error,issues:a.issues}))});
   if(regressions||new Set(passed.map(a=>a.contentHash)).size<3||new Set(passed.map(a=>a.description)).size<3||!before.workingSeeds.length)continue;
   const frozenAt=new Date().toISOString(),holdouts=[];
   for(const a of passed.filter(a=>a.url!==proposal.url).slice(0,6)){
    if(holdouts.length>=2)break;const p=await transport.get(a.url,null,'holdout');if(p.error||!p.html)continue;
    const htmlPath=path.join(dir,'holdout-'+(++sequence)+'.html.gz');await fs.writeFile(htmlPath,gzipSync(p.html));const v=await check(proposal.config,{url:a.url,html:p.html,htmlPath});if(v.state==='parsed'&&v.contentHash!==passed.find(a=>a.url===proposal.url)?.contentHash&&!holdouts.some(h=>h.contentHash===v.contentHash))holdouts.push({...v,independent:true});
   }
   const qualified=qualifyNewsSourceSamples([...passed.filter(a=>!holdouts.some(h=>h.url===a.url)).map(a=>({...a,independent:false})),...holdouts],{listingLinks:before.workingSeeds.reduce((n,s)=>n+s.articleLinks,0)});
   if(!qualified.approved)continue;
   const config={...proposal.config,enabled:true,parserCurrentAudit:{checkedAt:new Date().toISOString(),frozenAt,trainingUrl:proposal.url,independentHoldouts:holdouts.map(h=>h.url),paidAiCalls:0},validation:{sampleUrls:passed.map(a=>a.url),fullSiteCycleVerified:false}};
   await fs.writeFile(path.join(dir,'approved-config.json'),JSON.stringify(config,null,2)+'\n');accepted={qualified,passed:passed.length,holdouts,configFile:path.join(dir,'approved-config.json')};break;
  }
 }finally{await transport.close();}
 const result={strictPublicationValidated:true,publicationDatePolicy:'native_updated_when_original_missing',publicationTimePolicy:'native_date_midnight_if_missing',domain:site.domain,complete:true,approved:!!accepted,existing:!!existing,accepted,trials,workingSeeds:before.workingSeeds,feedEvidence,checkedAt:new Date().toISOString(),paidAiCalls:0};await fs.writeFile(path.join(dir,'result.json'),JSON.stringify(result,null,2));summaries.push(result);
}
const timer=setInterval(()=>console.log(JSON.stringify({phase:'priority_parser_repairs',done:summaries.length,total:sites.length,approved:summaries.filter(r=>r.approved).length})),30000);
async function lane(){while(cursor<sites.length){const site=sites[cursor++];try{await run(site);}catch(e){summaries.push({domain:site.domain,complete:false,error:e.code||e.message});}}}
try{await Promise.all(Array.from({length:8},lane));}finally{clearInterval(timer);await network.close();await parsers.close();}
await fs.writeFile(path.join(root,'repair-summary.json'),JSON.stringify(summaries,null,2));console.log(JSON.stringify({complete:true,done:summaries.length,approved:summaries.filter(r=>r.approved).length}));
